/*
 * LibLande on GitHub Pages: changing the .bib, on this device.
 *
 * The same functions as Code.gs (saveEntry, queueEdit, discardPending,
 * applyPending, addToInbox, addToMain, attachPdf, createGroup, readingOps,
 * setDirect), with the same checks, done with Drive's web API: the edit is
 * made with Build.gs (build.js) on the text, checked, a backup copy of the
 * file goes to LibLande/Backups, and only then is the file written.
 *
 * Apps Script held a lock while it did this. Here, the file's modified
 * time is noted when it's read and looked at again just before writing:
 * if the file changed in between (another device, or BibDesk), the change
 * is made again on the new text, or, after a few tries, not made at all.
 * On this device, one change runs at a time.
 *
 * makeLiblandeEdits(io): io.drive (as in server.js), io.builder (its
 * Drive helpers and settings), io.getToken.
 */
(function (root) {
  'use strict';
  const FOLDER = 'application/vnd.google-apps.folder';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';
  const PENDING_FILE = 'pending-edits.json', READING_FILE = 'reading-list.json',
    INBOX_FOLDER = 'Inbox', INBOX_FILE = 'LibLande inbox.bib', BACKUP_FOLDER = 'Backups', KEEP_BACKUPS = 50;
  const READING_GROUP = '★ Reading List';
  const BUSY = 'LibLande is updating your library right now. Try again in a minute.';
  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const pad = n => String(n).padStart(2, '0');
  const fileTime = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); };
  const bytesToB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xff); return btoa(s); };

  function makeEdits(io) {
    const B = io.builder;
    const json = async (path, opts, base) => (await io.drive(path, opts, base)).json();
    const meta = (id, fields) => B.meta(id, fields);
    const patch = (id, body, params) => json('files/' + encodeURIComponent(id) + '?fields=id' + (params || ''),
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

    // One change at a time on this device.
    let chain = Promise.resolve();
    const serial = fn => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

    /* -------------------------------------------- files */
    async function subFolder(parentId, name, create) {
      const f = await B.named(parentId, name, 'id,name', true);
      if (f || !create) return f || null;
      return json('files?fields=id,name', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }) });
    }
    async function settings() { return B.settings(false); }
    const mainBibId = async () => {
      const s = await settings();
      if (!s || !s.bibId) throw new Error('LibLande isn’t set up yet.');
      return s.bibId;
    };
    const direct = async () => !!(await settings()).directEdits;
    async function inboxFile(create) {
      const folder = await subFolder(await B.dataFolder(), INBOX_FOLDER, create);
      if (!folder) return null;
      const f = await B.named(folder.id, INBOX_FILE, 'id');
      if (f || !create) return f ? f.id : null;
      const made = await B.writeFile(folder.id, INBOX_FILE, '%% LibLande inbox: publications added in LibLande.\n' +
        '%% To move them into your library, open this file in BibDesk and drag them in.\n\n', 'text/plain');
      return made.id;
    }

    // The .bib's text as it is now, with what's known about the file then.
    // (The text of the last version read or written here is kept, so it
    // isn't downloaded again.)
    async function read(id) {
      const m = await meta(id, 'id,name,modifiedTime,mimeType,size,parents');
      return { m, text: await B.textAt(id, m.modifiedTime) };
    }
    // A copy in LibLande/Backups named with the time; the newest
    // KEEP_BACKUPS copies of each file are kept. Throws if the copy fails,
    // so nothing is written without a backup.
    async function backup(m, when) {
      const folder = await subFolder(await B.dataFolder(), BACKUP_FOLDER, true);
      const base = m.name.replace(/\.bib$/i, '');
      const copy = await json('files/' + encodeURIComponent(m.id) + '/copy?fields=id,size', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: base + ' ' + (when || fileTime()) + '.bib', parents: [folder.id] }) });
      if (!copy || String(copy.size) !== String(m.size)) throw new Error('LibLande couldn’t make a backup copy, so it didn’t save.');
      const old = (await B.listAll(q(folder.id) + ' in parents and name contains ' + q(base) + ' and trashed = false', 'id,name', 'createdTime desc'))
        .filter(f => f.name.indexOf(base + ' ') === 0).slice(KEEP_BACKUPS);
      for (const f of old) await patch(f.id, { trashed: true });
    }
    async function writeText(m, text) {
      const saved = await json('files/' + encodeURIComponent(m.id) + '?uploadType=media&fields=id,modifiedTime,size', { method: 'PATCH',
        headers: { 'Content-Type': (m.mimeType || 'text/plain') + '; charset=UTF-8' }, body: new Blob([text]) }, UPLOAD);
      B.remember(m.id, saved.modifiedTime, text);
      return saved;
    }
    // Change a file: change(text, m) returns {text, ...} (or null to leave
    // the file be), and optionally undo() for what it did besides. If the
    // file changed while this ran, its side effects are undone and it runs
    // again on the new text; after 3 tries, nothing is saved.
    async function changeFile(id, change, when) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { m, text } = await read(id);
        const out = await change(text, m);
        if (!out || out.text == null || out.text === text) return Object.assign({ m }, out || {});
        const now = await meta(id, 'modifiedTime');
        if (now.modifiedTime !== m.modifiedTime) { if (out.undo) await out.undo(); continue; }
        try {
          await backup(m, when);
          const saved = await writeText(m, out.text);
          return Object.assign(out, { m, saved, stamp: Date.parse(saved.modifiedTime) });
        } catch (e) {
          if (out.undo) await out.undo();
          throw e;
        }
      }
      throw new Error(BUSY);
    }
    // The same for LibLande's own JSON files (pending edits, the reading
    // list): change(value) changes it in place, or returns false to leave it.
    async function changeJson(name, blank, change) {
      const folder = await B.dataFolder();
      for (let attempt = 0; attempt < 3; attempt++) {
        const f = await B.named(folder, name, 'id,modifiedTime');
        let value = blank();
        if (f) { try { value = Object.assign(blank(), JSON.parse(await B.text(f.id))); } catch (e) { /* as blank */ } }
        const result = await change(value);
        if (result === false) return value;
        if (f) {
          const now = await meta(f.id, 'modifiedTime');
          if (now.modifiedTime !== f.modifiedTime) continue;
        }
        await B.writeFile(folder, name, JSON.stringify(value, null, name === PENDING_FILE ? 1 : 0), 'application/json');
        return value;
      }
      throw new Error(BUSY);
    }
    const blankPending = () => ({ edits: [] });
    const blankReading = () => ({ items: [], done: [], seeded: false, syncedKeys: null });
    const readingOut = d => ({ items: d.items || [], done: d.done || [], seeded: !!d.seeded, syncedKeys: d.syncedKeys || null });
    async function loadPending() { return ((await B.readJson(await B.dataFolder(), PENDING_FILE)) || blankPending()).edits || []; }

    /* -------------------------------------------- PDFs */
    // Move an uploaded PDF into the papers folder under the name AutoFile
    // would give it (as Code.gs's filePdf_). Returns {relPath, info, undo}.
    async function filePdf(bibMeta, uploadId, fields, prefix) {
      const segs = String(prefix || 'Papers').split('/').filter(Boolean);
      if (segs.some(s => s === '..' || s === '.')) throw new Error('LibLande can only file PDFs in a folder inside the one that holds your .bib file.');
      let rootId = bibMeta.parents && bibMeta.parents[0];
      if (!rootId) throw new Error('LibLande can’t see the folder that holds your .bib file.');
      for (const s of segs) rootId = (await subFolder(rootId, s, true)).id;
      const name = autoFileName_(fields);
      const folder = await authorFolder(rootId, name.folder);
      const taken = {};
      (await B.listAll(q(folder.id) + ' in parents and trashed = false', 'name')).forEach(f => { taken[f.name.normalize('NFC')] = true; });
      const file = await meta(uploadId, 'id,name,parents');
      const ext = ((/\.[A-Za-z0-9]{1,5}$/.exec(file.name) || ['.pdf'])[0]).toLowerCase();
      let fileName = null;
      for (let k = 0; k < 100 && !fileName; k++) {
        const candidate = name.base + ', ' + (k < 10 ? '0' : '') + k + ext;
        if (!taken[candidate.normalize('NFC')]) fileName = candidate;
      }
      if (!fileName) throw new Error('The folder ' + folder.name + ' already has 100 files named “' + name.base + '”.');
      const oldParent = file.parents && file.parents[0], oldName = file.name;
      await patch(file.id, { name: fileName }, '&addParents=' + encodeURIComponent(folder.id) + (oldParent ? '&removeParents=' + encodeURIComponent(oldParent) : ''));
      const relPath = segs.concat([folder.name, fileName]).join('/');
      return {
        relPath,
        info: { n: fileName, p: relPath, id: file.id },
        undo: async () => {
          try { await patch(file.id, { name: oldName }, oldParent ? '&addParents=' + encodeURIComponent(oldParent) + '&removeParents=' + encodeURIComponent(folder.id) : ''); } catch (e) { /* leave it filed */ }
        },
      };
    }
    // The author folder, reusing one whose name differs only in accents or
    // punctuation (BibDesk sometimes wrote "Ogmen.H" for "Öǧmen.H").
    async function authorFolder(parentId, name) {
      const exact = await B.named(parentId, name, 'id,name', true);
      if (exact) return exact;
      const key = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9.-]/g, '').toLowerCase();
      const want = key(name);
      const hit = (await B.listAll(q(parentId) + " in parents and mimeType = '" + FOLDER + "' and trashed = false", 'id,name')).find(f => key(f.name) === want);
      return hit || subFolder(parentId, name, true);
    }
    const bdskValue = relPath => bytesToB64(bdskFileBytes_(relPath));
    const hashOf = (text, key) => { const loc = locateEntry_(text, key); return fingerprint_(text.slice(loc.start, loc.end)); };

    /* -------------------------------------------- the functions */
    const F = {};

    // Save changes to one entry (as Code.gs's saveEntry).
    F.saveEntry = req => serial(async () => {
      if (req.where !== 'inbox' && !(await direct())) throw new Error('Turn on “Save edits straight to your .bib file” in settings first.');
      const id = req.where === 'inbox' ? await inboxFile(false) : await mainBibId();
      if (!id) throw new Error('LibLande couldn’t find the file to edit.');
      const changedElsewhere = 'Tap Refresh, wait for the library to update, and make your change again.';
      let check = null;
      const out = await changeFile(id, (text, m) => {
        if (req.where !== 'inbox' && !req.expectHash && req.expectStamp && Date.parse(m.modifiedTime) !== req.expectStamp) {
          throw new Error(m.name + ' has changed since LibLande last read it (perhaps it was saved in BibDesk). ' + changedElsewhere);
        }
        const before = parseBib_(text);
        if (req.expectHash && hashOf(text, req.key) !== req.expectHash) {
          throw new Error('This publication has been changed since LibLande last read it (perhaps in BibDesk). ' + changedElsewhere);
        }
        const changingGroups = !!req.groups && ((req.groups.add || []).length + (req.groups.remove || []).length > 0);
        if (changingGroups && req.expectGroupsHash && fingerprint_(groupsComment_(before[1])) !== req.expectGroupsHash) {
          throw new Error('Your static groups have been changed since LibLande last read them (perhaps in BibDesk). ' + changedElsewhere);
        }
        const set = Object.assign({}, req.set || {});
        if (Object.keys(set).length || changingGroups) set['date-modified'] = req.modified;
        let edited = Object.keys(set).length ? editEntry_(text, req.key, set) : text;
        if (req.groups) edited = editGroups_(edited, req.key, req.groups.add || [], req.groups.remove || []);
        if (edited === text) return null;
        // Check before writing: same entries, and exactly the requested changes.
        const after = parseBib_(edited);
        if (after[0].length !== before[0].length) throw new Error('The edit would have changed the number of entries, so LibLande didn’t save it.');
        const entry = after[0].find(e => e[1] === req.key);
        Object.keys(set).forEach(n => {
          const want = set[n] == null ? '' : String(set[n]);
          const got = entry && entry[2][n] !== undefined ? entry[2][n] : '';
          if (got !== want) throw new Error('The ' + n + ' field didn’t come out as expected, so LibLande didn’t save it.');
        });
        if (req.groups) {
          const groups = staticGroups_(after[1]);
          (req.groups.add || []).concat(req.groups.remove || []).forEach(name => {
            const g = groups.find(x => x.name === name);
            const inIt = !!g && g.keys.indexOf(req.key) >= 0;
            if (!g || inIt !== (req.groups.add || []).indexOf(name) >= 0) {
              throw new Error('The group “' + name + '” didn’t come out as expected, so LibLande didn’t save it.');
            }
          });
        }
        check = after;
        return { text: edited };
      }, req.backupName);
      if (!out.text) return { stamp: Date.parse(out.m.modifiedTime), unchanged: true };
      return { stamp: out.stamp, hash: hashOf(out.text, req.key), groupsHash: fingerprint_(groupsComment_(check[1])) };
    });

    // Save an edit as pending (as Code.gs's queueEdit).
    F.queueEdit = req => serial(async () => {
      const set = req.set || {};
      Object.keys(set).forEach(n => { if (set[n]) checkValue_(n, String(set[n])); });
      const d = await changeJson(PENDING_FILE, blankPending, async d => {
        const earlier = d.edits.find(x => x.key === req.key);
        const expect = earlier ? earlier.expectHash : req.expectHash;
        if (expect) {
          const { text } = await read(await mainBibId());
          if (hashOf(text, req.key) !== expect) {
            throw new Error('This publication has been changed since LibLande last read it (perhaps in BibDesk). ' +
              'Tap Refresh, wait for the library to update, and make your change again.' +
              (earlier ? ' Its earlier pending edit can’t be applied either; discard it first.' : ''));
          }
        }
        mergeEdit_(d.edits, {
          key: req.key, set,
          groups: { add: (req.groups && req.groups.add) || [], remove: (req.groups && req.groups.remove) || [] },
          expectHash: req.expectHash || null, expectGroupsHash: req.expectGroupsHash || null, modified: req.modified,
        });
      });
      return { pending: d.edits };
    });

    F.discardPending = key => serial(async () => {
      const d = await changeJson(PENDING_FILE, blankPending, d => { d.edits = d.edits.filter(e => e.key !== key); });
      return { pending: d.edits };
    });

    // Write all pending edits into the main .bib in one save (as Code.gs's
    // applyPending). Edits that can't be applied stay pending, with why.
    F.applyPending = req => serial(async () => {
      const edits = await loadPending();
      const waiting = ((await settings()).pendingGroups || []).slice();
      if (!edits.length && !waiting.length) return { applied: [], skipped: [], pending: [] };
      let result = null;
      const out = await changeFile(await mainBibId(), original => {
        let text = original;
        waiting.forEach(n => { text = ensureStaticGroup_(text, n); });
        if (text !== original && parseBib_(text)[0].length !== parseBib_(original)[0].length) throw new Error('Adding the new groups went wrong, so LibLande didn’t save anything.');
        result = applyEdits_(text, edits, fingerprint_(groupsComment_(parseBib_(original)[1])));
        return result.applied.length || text !== original ? { text: result.edited } : null;
      }, req && req.backupName);
      if (waiting.length) await B.updateSettings(s => { s.pendingGroups = (s.pendingGroups || []).filter(n => waiting.indexOf(n) < 0); });
      const reasons = {};
      result.skipped.forEach(s => { reasons[s.key] = s.reason; });
      const appliedKeys = new Set(result.applied.map(e => e.key));
      const d = await changeJson(PENDING_FILE, blankPending, d => {
        // (Only the edits applied go; any queued meanwhile stay.)
        d.edits = d.edits.filter(e => !(appliedKeys.has(e.key) && result.applied.some(a => a.key === e.key && JSON.stringify(a) === JSON.stringify(e))));
        d.edits.forEach(e => { if (reasons[e.key]) e.conflict = reasons[e.key]; });
      });
      const edited = out.text || result.edited;
      const hashes = {};
      result.applied.forEach(e => { hashes[e.key] = hashOf(edited, e.key); });
      return { applied: result.applied.map(e => e.key), skipped: result.skipped, pending: d.edits, source: out.m.name,
        hashes, gh: fingerprint_(groupsComment_(parseBib_(edited)[1])) };
    });

    // Add a publication to the inbox (as Code.gs's addToInbox).
    F.addToInbox = req => serial(async () => {
      const id = await inboxFile(true);
      await changeFile(id, text => {
        if (parseBib_(text)[0].some(e => e[1] === req.key)) throw new Error('The inbox already has a publication with the cite key ' + req.key + '.');
        const fields = Object.assign({}, req.fields);
        if (req.pdfName) fields.file = ':Papers/' + String(req.pdfName).replace(/[:;]/g, '-') + ':PDF';
        fields['date-added'] = fields['date-modified'] = req.now;
        const next = text.replace(/\s*$/, '\n\n') + bibEntryText_(req.type, req.key, fields);
        const count = parseBib_(next)[0];
        if (count.length !== parseBib_(text)[0].length + 1 || !count.some(e => e[1] === req.key)) {
          throw new Error('The new entry didn’t come out right, so LibLande didn’t save it.');
        }
        return { text: next };
      }, req.backupName);
      return { key: req.key };
    });

    // Add a publication to the main .bib, filing its PDF first (as
    // Code.gs's addToMain).
    F.addToMain = req => serial(async () => {
      if (!(await direct())) throw new Error('Turn on “Save edits straight to your .bib file” in settings first.');
      let filed = null;
      const out = await changeFile(await mainBibId(), async (text, m) => {
        const before = parseBib_(text)[0];
        if (before.some(e => e[1] === req.key)) throw new Error('Your library already has a publication with the cite key ' + req.key + '.');
        const fields = Object.assign({}, req.fields);
        fields['date-added'] = fields['date-modified'] = req.now;
        filed = req.uploadId ? await filePdf(m, req.uploadId, fields, req.prefix) : null;
        try {
          if (filed) fields['bdsk-file-1'] = bdskValue(filed.relPath);
          const next = appendEntry_(text, bibEntryText_(req.type, req.key, fields));
          const after = parseBib_(next)[0];
          if (after.length !== before.length + 1 || !after.some(e => e[1] === req.key)) {
            throw new Error('The new entry didn’t come out right, so LibLande didn’t save it.');
          }
          return { text: next, undo: filed ? filed.undo : null };
        } catch (e) {
          if (filed) await filed.undo();
          throw e;
        }
      }, req.backupName);
      return { key: req.key, hash: hashOf(out.text, req.key), file: filed && filed.info };
    });

    // Link an uploaded PDF to a publication in the main .bib (as Code.gs's
    // attachPdf). With replace, it takes the place of the first linked
    // file, which goes to the Drive trash.
    F.attachPdf = req => serial(async () => {
      if (!(await direct())) throw new Error('Turn on “Save edits straight to your .bib file” in settings to attach PDFs.');
      let filed = null, nums = [];
      const out = await changeFile(await mainBibId(), async (text, m) => {
        const loc = locateEntry_(text, req.key);
        if (req.expectHash && fingerprint_(text.slice(loc.start, loc.end)) !== req.expectHash) {
          throw new Error('This publication has been changed since LibLande last read it (perhaps in BibDesk). ' +
            'Tap Refresh, wait for the library to update, and try again.');
        }
        const fields = parseBib_(text.slice(loc.start, loc.end))[0][0][2];
        nums = Object.keys(fields).map(n => /^bdsk-file-(\d+)$/.exec(n)).filter(Boolean).map(x => Number(x[1])).sort((a, b) => a - b);
        const n = req.replace && nums.length ? nums[0] : (nums.length ? nums[nums.length - 1] + 1 : 1);
        filed = await filePdf(m, req.uploadId, fields, req.prefix);
        try {
          const set = {};
          set['bdsk-file-' + n] = bdskValue(filed.relPath);
          set['date-modified'] = req.modified;
          const edited = editEntry_(text, req.key, set);
          const before = parseBib_(text)[0], after = parseBib_(edited)[0];
          const entry = after.find(e => e[1] === req.key);
          if (after.length !== before.length || !entry || entry[2]['bdsk-file-' + n] !== set['bdsk-file-' + n]) {
            throw new Error('The link didn’t come out right, so LibLande didn’t save it.');
          }
          return { text: edited, undo: filed.undo };
        } catch (e) {
          await filed.undo();
          throw e;
        }
      }, req.backupName);
      if (req.replace && req.replaceId) { try { await patch(req.replaceId, { trashed: true }); } catch (e) { /* already gone */ } }
      return { hash: hashOf(out.text, req.key), file: filed.info, replaced: !!(req.replace && nums.length) };
    });

    // A new static group, made in the sidebar (as Code.gs's createGroup).
    F.createGroup = req => serial(async () => {
      const name = String((req && req.name) || '').trim();
      if (!name || name.length > 120 || /[\r\n]/.test(name)) throw new Error('Give the group a name: one line, up to 120 characters.');
      const keys = (Array.isArray(req.keys) ? req.keys : req.key ? [req.key] : []).map(String).filter((k, i, a) => a.indexOf(k) === i);
      const id = await mainBibId();
      if (!(await direct())) {
        const { m, text } = await read(id);
        const before = parseBib_(text);
        if (staticGroups_(before[1]).some(g => g.name === name)) throw new Error('There’s already a static group called “' + name + '”.');
        const inBib = new Set(before[0].map(e => e[1]));
        const missing = keys.find(k => !inBib.has(k));
        if (missing) throw new Error('“' + missing + '” isn’t in ' + m.name + '.');
        await B.updateSettings(s => { s.pendingGroups = s.pendingGroups || []; if (s.pendingGroups.indexOf(name) < 0) s.pendingGroups.push(name); });
        const d = await changeJson(PENDING_FILE, blankPending, d => {
          if (!keys.length) return false;
          keys.forEach(k => mergeEdit_(d.edits, { key: k, set: {}, groups: { add: [name], remove: [] }, expectHash: null, expectGroupsHash: null, modified: req.modified || null }));
        });
        return { pendingGroup: true, pending: d.edits };
      }
      let group = null, after = null;
      const out = await changeFile(id, (text, m) => {
        const before = parseBib_(text);
        if (staticGroups_(before[1]).some(g => g.name === name)) throw new Error('There’s already a static group called “' + name + '”.');
        const inBib = new Set(before[0].map(e => e[1]));
        const missing = keys.find(k => !inBib.has(k));
        if (missing) throw new Error('“' + missing + '” isn’t in ' + m.name + '.');
        let edited = ensureStaticGroup_(text, name);
        keys.forEach(k => {
          if (req.modified) edited = editEntry_(edited, k, { 'date-modified': req.modified });
          edited = editGroups_(edited, k, [name], []);
        });
        after = parseBib_(edited);
        group = staticGroups_(after[1]).find(g => g.name === name);
        if (after[0].length !== before[0].length || !group || keys.some(k => group.keys.indexOf(k) < 0)) {
          throw new Error('The new group didn’t come out as expected, so LibLande didn’t save it.');
        }
        return { text: edited };
      }, req.backupName);
      const res = { gh: fingerprint_(groupsComment_(after[1])), stamp: out.stamp, hashes: {} };
      keys.forEach(k => { res.hashes[k] = hashOf(out.text, k); });
      return res;
    });

    /* -------------------------------------------- the reading list */
    function applyReadingOp(d, req, now) {
      const find = k => d.items.find(x => x.key === k);
      if (req.op === 'seed') {
        if (!d.seeded) (req.keys || []).forEach(k => { if (!find(k)) d.items.push({ key: k, list: 'later', added: now }); });
        d.seeded = true;
      } else if (req.op === 'add') {
        const x = find(req.key);
        if (x) x.list = req.list || x.list;
        else d.items.push({ key: req.key, list: req.list || 'next', added: now });
      } else if (req.op === 'move') {
        const x = find(req.key);
        if (x) x.list = req.list;
      } else if (req.op === 'remove' || req.op === 'done') {
        d.items = d.items.filter(x => x.key !== req.key);
        if (req.op === 'done') d.done = [{ key: req.key, at: now }].concat(d.done || []).slice(0, 200);
      }
    }
    // Several reading-list changes at once (as Code.gs's readingOps):
    // papers added or taken off also go into, or out of, the BibDesk group
    // "★ Reading List", in the .bib with direct saving on, otherwise
    // as pending edits.
    F.readingOps = req => serial(async () => {
      let add = [], remove = [];
      const now = Date.now();
      let d = await changeJson(READING_FILE, blankReading, d => {
        const before = new Set(d.items.map(x => x.key));
        (req.ops || []).forEach(op => applyReadingOp(d, op, now));
        const after = new Set(d.items.map(x => x.key));
        add = Array.from(after).filter(k => !before.has(k)).concat(req.push || []);
        remove = Array.from(before).filter(k => !after.has(k)).concat(req.pull || []);
      });
      const out = add.length || remove.length ? await syncReadingGroup(add, remove, req) : {};
      if (out.groupKeys) d = await changeJson(READING_FILE, blankReading, x => { x.syncedKeys = out.groupKeys; });
      out.reading = readingOut(d);
      return out;
    });
    async function syncReadingGroup(add, remove, req) {
      const name = (await settings()).readingGroup || READING_GROUP;
      if (!(await direct())) {
        const d = await changeJson(PENDING_FILE, blankPending, d => {
          add.forEach(k => mergeEdit_(d.edits, { key: k, set: {}, groups: { add: [name], remove: [] }, expectHash: null, expectGroupsHash: null, modified: null }));
          remove.forEach(k => mergeEdit_(d.edits, { key: k, set: {}, groups: { add: [], remove: [name] }, expectHash: null, expectGroupsHash: null, modified: null }));
        });
        return { pending: d.edits };
      }
      let group = null, after = null;
      const out = await changeFile(await mainBibId(), text => {
        const parsed = parseBib_(text);
        const inBib = new Set(parsed[0].map(e => e[1]));
        let edited = ensureStaticGroup_(text, name);
        const current = staticGroups_(parseBib_(edited)[1]).find(g => g.name === name);
        const has = new Set(current ? current.keys : []);
        add.filter(k => inBib.has(k) && !has.has(k)).forEach(k => { edited = editGroups_(edited, k, [name], []); });
        remove.filter(k => has.has(k)).forEach(k => { edited = editGroups_(edited, k, [], [name]); });
        if (edited === text) return null;
        after = parseBib_(edited);
        group = staticGroups_(after[1]).find(g => g.name === name);
        if (after[0].length !== parsed[0].length || !group ||
            add.some(k => inBib.has(k) && group.keys.indexOf(k) < 0) || remove.some(k => group.keys.indexOf(k) >= 0)) {
          throw new Error('The reading-list group didn’t come out right, so LibLande didn’t save it.');
        }
        return { text: edited };
      }, req.backupName);
      if (!out.text) return {};
      return { gh: fingerprint_(groupsComment_(after[1])), groupKeys: group.keys, group: name };
    }
    // After each build: changes made to the group in BibDesk come into the
    // list (as Code.gs's reconcileReading_).
    F.reconcileReading = groups => serial(async () => {
      const g = groups.find(x => x.name === READING_GROUP) || groups.find(x => /reading list/i.test(x.name));
      if (!g) return;
      if ((await settings()).readingGroup !== g.name) await B.updateSettings(s => { s.readingGroup = g.name; });
      await changeJson(READING_FILE, blankReading, d => {
        const inGroup = new Set(g.keys), synced = new Set(d.syncedKeys || []), first = !d.syncedKeys;
        let changed = false;
        const now = Date.now();
        const finished = new Set(first ? (d.done || []).map(x => x.key) : []);
        g.keys.forEach(k => {
          if (!synced.has(k) && !finished.has(k) && !d.items.some(x => x.key === k)) { d.items.push({ key: k, list: 'later', added: now }); changed = true; }
        });
        if (!first) {
          const before = d.items.length;
          d.items = d.items.filter(x => inGroup.has(x.key) || !synced.has(x.key));
          changed = changed || d.items.length !== before;
        }
        if (!(changed || first || String(d.syncedKeys) !== String(g.keys))) return false;
        d.syncedKeys = g.keys;
        d.seeded = true;
      });
    });

    // Saving edits straight to the .bib, on or off (as Code.gs's
    // setDirect); Apps Script is told too, for the Apps Script version.
    F.setDirect = on => serial(async () => {
      if (on && (await loadPending()).length) throw new Error('Apply or discard your pending edits first.');
      await B.updateSettings(s => { s.directEdits = !!on; });
      return true;
    });

    return F;
  }

  root.makeLiblandeEdits = makeEdits;
})(typeof self !== 'undefined' ? self : this);
