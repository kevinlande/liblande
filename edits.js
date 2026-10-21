/*
 * LibLande on GitHub Pages: changing the .bib, on this device.
 *
 * The same functions as Code.gs (saveEntry, addToMain, attachPdf,
 * createGroup, readingOps, renameKey), every change straight into the .bib
 * (pending edits were dropped on 2026-10-12), with the same checks, done
 * with Drive's web API: the edit is
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
  if (root.document) (root.LIBLANDE_PARTS = root.LIBLANDE_PARTS || {}).edits = '2026-10-21.07';
  const FOLDER = 'application/vnd.google-apps.folder';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';
  const READING_FILE = 'reading-list.json',
    INBOX_FOLDER = 'Inbox', INBOX_FILE = 'LibLande inbox.bib', BACKUP_FOLDER = 'Backups', KEEP_BACKUPS = 50;
  const READING_GROUP = '★ Reading List';
  const BUSY = 'LibLande is updating your library right now. Try again in a minute.';
  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const pad = n => String(n).padStart(2, '0');
  const fileTime = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); };
  const bytesToB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xff); return btoa(s); };

  /* ------------------------------------------------ the text work */
  // Pure work on the .bib's text, with Build.gs: run in the worker
  // (build-worker.js loads this file too) or on the page. Each returns
  // {text: the new text, or null to leave the file as it is, ...} or
  // throws, saying why nothing was saved.
  const CHANGED = 'Tap Refresh, wait for the library to update, and make your change again.';
  const hashOf = (text, key) => { const loc = locateEntry_(text, key); return fingerprint_(text.slice(loc.start, loc.end)); };
  const groupsHashOf = parsed => fingerprint_(groupsComment_(parsed[1]));
  // (Also returns the .bib, read.)
  function checkGroup(text, name, keys, fileName) {
    const before = parseBib_(text);
    if (staticGroups_(before[1]).some(g => g.name === name)) throw new Error('There’s already a static group called “' + name + '”.');
    const inBib = new Set(before[0].map(e => e[1]));
    const missing = keys.find(k => !inBib.has(k));
    if (missing) throw new Error('“' + missing + '” isn’t in ' + fileName + '.');
    return before;
  }

  const core = {
    hashOf,
    hasKey: (text, key) => parseBib_(text)[0].some(e => e[1] === key),
    // (As Code.gs's saveEntry, between reading the file and writing it.)
    saveEntry(text, req, fileName, stamp) {
      if (stamp != null && !req.expectHash && req.expectStamp && stamp !== req.expectStamp) {
        throw new Error(fileName + ' has changed since LibLande last read it (perhaps it was saved in BibDesk). ' + CHANGED);
      }
      const before = parseBib_(text);
      if (req.expectHash && hashOf(text, req.key) !== req.expectHash) {
        throw new Error('This publication has been changed since LibLande last read it (perhaps in BibDesk). ' + CHANGED);
      }
      const changingGroups = !!req.groups && ((req.groups.add || []).length + (req.groups.remove || []).length > 0);
      if (changingGroups && req.expectGroupsHash && groupsHashOf(before) !== req.expectGroupsHash) {
        throw new Error('Your static groups have been changed since LibLande last read them (perhaps in BibDesk). ' + CHANGED);
      }
      const set = Object.assign({}, req.set || {});
      if (Object.keys(set).length || changingGroups) set['date-modified'] = req.modified;
      let edited = Object.keys(set).length ? editEntry_(text, req.key, set) : text;
      if (req.groups) edited = editGroups_(edited, req.key, req.groups.add || [], req.groups.remove || []);
      if (edited === text) return { text: null };
      // Checked before writing: same entries, and exactly the requested changes.
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
      return { text: edited, hash: hashOf(edited, req.key), groupsHash: groupsHashOf(after) };
    },
    createGroup(text, name, keys, modified, fileName) {
      const before = checkGroup(text, name, keys, fileName);
      let edited = ensureStaticGroup_(text, name);
      keys.forEach(k => {
        if (modified) edited = editEntry_(edited, k, { 'date-modified': modified });
        edited = editGroups_(edited, k, [name], []);
      });
      const after = parseBib_(edited);
      const group = staticGroups_(after[1]).find(g => g.name === name);
      if (after[0].length !== before[0].length || !group || keys.some(k => group.keys.indexOf(k) < 0)) {
        throw new Error('The new group didn’t come out as expected, so LibLande didn’t save it.');
      }
      const hashes = {};
      keys.forEach(k => { hashes[k] = hashOf(edited, k); });
      return { text: edited, gh: groupsHashOf(after), hashes };
    },
    readingGroup(text, name, add, remove) {
      const parsed = parseBib_(text);
      const inBib = new Set(parsed[0].map(e => e[1]));
      let edited = ensureStaticGroup_(text, name);
      const current = staticGroups_(parseBib_(edited)[1]).find(g => g.name === name);
      const has = new Set(current ? current.keys : []);
      add.filter(k => inBib.has(k) && !has.has(k)).forEach(k => { edited = editGroups_(edited, k, [name], []); });
      remove.filter(k => has.has(k)).forEach(k => { edited = editGroups_(edited, k, [], [name]); });
      if (edited === text) return { text: null };
      const after = parseBib_(edited);
      const group = staticGroups_(after[1]).find(g => g.name === name);
      if (after[0].length !== parsed[0].length || !group ||
          add.some(k => inBib.has(k) && group.keys.indexOf(k) < 0) || remove.some(k => group.keys.indexOf(k) >= 0)) {
        throw new Error('The reading-list group didn’t come out right, so LibLande didn’t save it.');
      }
      return { text: edited, gh: groupsHashOf(after), groupKeys: group.keys };
    },
    addToMain(text, type, key, fields) {
      const before = parseBib_(text)[0];
      const next = appendEntry_(text, bibEntryText_(type, key, fields));
      const after = parseBib_(next)[0];
      if (after.length !== before.length + 1 || !after.some(e => e[1] === key)) {
        throw new Error('The new entry didn’t come out right, so LibLande didn’t save it.');
      }
      return { text: next, hash: hashOf(next, key) };
    },
    // Several entries' fields at once (updates from Crossref, say), in one
    // save: each checked against its fingerprint and edited, then the whole
    // checked once. An entry that can't be edited is left out, with why.
    // An item can also go into static groups, or out of them (groups: {add,
    // remove}), which leaves its fields and date be.
    saveMany(text, items, modified) {
      const before = parseBib_(text)[0];
      let cur = text;
      const applied = [], skipped = [];
      for (const it of items) {
        try {
          if (it.expectHash && hashOf(cur, it.key) !== it.expectHash) throw new Error('It has been changed since LibLande last read it (perhaps in BibDesk).');
          const fields = it.set && Object.keys(it.set).length;
          const set = fields ? Object.assign({}, it.set, { 'date-modified': modified }) : {};
          const g = it.groups || {}, add = g.add || [], remove = g.remove || [];
          let next = fields ? editEntry_(cur, it.key, set) : cur;
          if (add.length) add.forEach(name => { next = ensureStaticGroup_(next, name); });
          if (add.length || remove.length) next = editGroups_(next, it.key, add, remove);
          cur = next;
          applied.push({ key: it.key, set, add, remove });
        } catch (e) {
          skipped.push({ key: it.key, reason: e.message });
        }
      }
      if (!applied.length) return { text: null, hashes: {}, skipped };
      const after = parseBib_(cur)[0];
      if (after.length !== before.length) throw new Error('The updates would have changed the number of entries, so LibLande didn\u2019t save them.');
      const byKey = new Map(after.map(e => [e[1], e]));
      applied.forEach(a => Object.keys(a.set).forEach(n => {
        const want = a.set[n] == null ? '' : String(a.set[n]), e = byKey.get(a.key);
        const got = e && e[2][n] !== undefined ? e[2][n] : '';
        if (got !== want) throw new Error('The ' + n + ' field of ' + a.key + ' didn\u2019t come out as expected, so LibLande didn\u2019t save the updates.');
      }));
      const groups = staticGroups_(parseBib_(cur)[1]);
      applied.forEach(a => {
        const inG = name => { const g = groups.find(x => x.name === name); return !!g && g.keys.indexOf(a.key) >= 0; };
        if (a.add.some(n => !inG(n)) || a.remove.some(n => inG(n))) throw new Error('The groups of ' + a.key + ' didn\u2019t come out as expected, so LibLande didn\u2019t save the changes.');
      });
      const hashes = {};
      applied.forEach(a => { hashes[a.key] = hashOf(cur, a.key); });
      return { text: cur, hashes, skipped, gh: groupsHashOf(parseBib_(cur)) };
    },
    // A new cite key (renameKey_ and checkRename_ in Build.gs).
    renameKey(text, req) {
      const loc = locateEntry_(text, req.key);
      if (req.expectHash && fingerprint_(text.slice(loc.start, loc.end)) !== req.expectHash) {
        throw new Error('This publication has been changed since LibLande last read it (perhaps in BibDesk). Tap Refresh, wait for the library to update, and try again.');
      }
      const newKey = String(req.newKey || '').trim();
      const edited = renameKey_(text, req.key, newKey);
      const after = checkRename_(text, edited, req.key, newKey);
      return { text: edited, hash: hashOf(edited, newKey), gh: groupsHashOf(after) };
    },
    // Copying to another library: an entry's fields (for its PDFs' names)
    // and its linked files; the entry's own text, its links and dates
    // changed; and those texts added to the other .bib, checked.
    entryInfo(text, key) {
      const loc = locateEntry_(text, key);
      const fields = parseBib_(text.slice(loc.start, loc.end))[0][0][2];
      return { fields, files: Object.keys(fields).filter(n => /^bdsk-file-\d+$/.test(n)) };
    },
    copyOut(text, key, set) {
      const loc = locateEntry_(text, key);
      return editEntry_(text.slice(loc.start, loc.end), key, set);
    },
    copyIn(text, raws, keys) {
      const before = parseBib_(text)[0];
      let next = text;
      raws.forEach(r => { next = appendEntry_(next, r); });
      const after = parseBib_(next)[0];
      if (after.length !== before.length + raws.length || keys.some(k => !after.some(e => e[1] === k))) {
        throw new Error('The copied entries didn\u2019t come out right, so LibLande didn\u2019t save them.');
      }
      return { text: next };
    },
    // attachPdf: the entry's fields, and which bdsk-file-N the PDF takes.
    attachPrepare(text, req) {
      const loc = locateEntry_(text, req.key);
      if (req.expectHash && fingerprint_(text.slice(loc.start, loc.end)) !== req.expectHash) {
        throw new Error('This publication has been changed since LibLande last read it (perhaps in BibDesk). ' +
          'Tap Refresh, wait for the library to update, and try again.');
      }
      const fields = parseBib_(text.slice(loc.start, loc.end))[0][0][2];
      const nums = Object.keys(fields).map(n => /^bdsk-file-(\d+)$/.exec(n)).filter(Boolean).map(x => Number(x[1])).sort((a, b) => a - b);
      const n = req.replace && nums.length ? nums[0] : (nums.length ? nums[nums.length - 1] + 1 : 1);
      return { fields, nums, n };
    },
    attachEdit(text, req, n, value) {
      const set = {};
      set['bdsk-file-' + n] = value;
      set['date-modified'] = req.modified;
      const edited = editEntry_(text, req.key, set);
      const before = parseBib_(text)[0], after = parseBib_(edited)[0];
      const entry = after.find(e => e[1] === req.key);
      if (after.length !== before.length || !entry || entry[2]['bdsk-file-' + n] !== set['bdsk-file-' + n]) {
        throw new Error('The link didn’t come out right, so LibLande didn’t save it.');
      }
      return { text: edited, hash: hashOf(edited, req.key) };
    },
  };
  root.liblandeEditCore = core;

  // One change to the reading list (also made on the page while offline).
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
  root.liblandeReadingOp = applyReadingOp;

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
    // step(what), if given, hears each step as it starts.
    async function changeFile(id, change, when, step) {
      step = step || (() => {});
      for (let attempt = 0; attempt < 3; attempt++) {
        step('Reading your .bib file');
        const { m, text } = await read(id);
        step('Making the changes');
        const out = await change(text, m);
        if (!out || out.text == null || out.text === text) return Object.assign({ m }, out || {});
        step('Checking it wasn\u2019t changed meanwhile');
        const now = await meta(id, 'modifiedTime');
        if (now.modifiedTime !== m.modifiedTime) { if (out.undo) await out.undo(); continue; }
        try {
          step('Making a backup copy');
          await backup(m, when);
          step('Saving to Google Drive');
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
        // (A file that can't be read stops the change: written over, it
        // would lose what's in it. Only one that isn't JSON counts as blank.)
        if (f) { const raw = await B.text(f.id); try { value = Object.assign(blank(), JSON.parse(raw)); } catch (e) { /* as blank */ } }
        const result = await change(value);
        if (result === false) return value;
        if (f) {
          const now = await meta(f.id, 'modifiedTime');
          if (now.modifiedTime !== f.modifiedTime) continue;
        }
        await B.writeFile(folder, name, JSON.stringify(value), 'application/json');
        return value;
      }
      throw new Error(BUSY);
    }
    const blankReading = () => ({ items: [], done: [], seeded: false, syncedKeys: null });
    const readingOut = d => ({ items: d.items || [], done: d.done || [], seeded: !!d.seeded, syncedKeys: d.syncedKeys || null });

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
        folderPath: segs.concat([folder.name]).join('/'),
        folderId: folder.id,
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

    // The text work (reading the .bib, editing, checking): in the worker
    // (build-worker.js), so the page doesn't freeze, or here without one.
    let worker = null, seq = 0;
    const WORKER_WAIT = 60 * 1000;
    const calls = {};
    function run(name, ...args) {
      if (typeof Worker === 'function' && root.LIBLANDE_BUILD_WORKER !== false) {
        try {
          if (!worker) {
            worker = new Worker('build-worker.js');
            worker.onmessage = ev => {
              const c = calls[ev.data.id];
              if (!c) return;
              delete calls[ev.data.id];
              if (ev.data.error) c.reject(new Error(ev.data.error)); else c.resolve(ev.data.result);
            };
            worker.onerror = ev => {
              Object.keys(calls).forEach(k => { calls[k].reject(new Error(ev.message || 'LibLande couldn’t read the .bib file.')); delete calls[k]; });
              worker = null;
            };
          }
          const id = ++seq, w = worker;
          return new Promise((resolve, reject) => {
            // (A worker that never answers, as one can when an iPad puts
            // LibLande to sleep: given up, and the work done here instead.)
            const timer = setTimeout(() => {
              if (!calls[id]) return;
              delete calls[id];
              if (worker === w) { try { w.terminate(); } catch (e) { /* gone */ } worker = null; }
              Promise.resolve().then(() => core[name](...args)).then(resolve, reject);
            }, WORKER_WAIT);
            calls[id] = { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } };
            w.postMessage({ id, call: name, args });
          });
        } catch (e) { /* no worker: here */ }
      }
      return Promise.resolve().then(() => core[name](...args));
    }

    /* -------------------------------------------- the functions */
    const F = {};

    // The .bib downloaded ahead (while a PDF uploads, say), so the change
    // that follows needn't wait for it.
    F.prefetch = async () => { await read(await mainBibId()); };

    // Save changes to one entry (as Code.gs's saveEntry).
    // An ampersand in a text field written as BibTeX wants it, \& (a bare
    // & stops LaTeX: "Misplaced alignment tab"), as BibDesk writes it, and
    // shows it, as &. Not in links, DOIs, file paths and such. One already
    // escaped (\& or BibDesk's \{&}) is left as it is.
    const TEX_TEXT = /^(title|subtitle|shorttitle|booktitle|journal|publisher|series|school|institution|organization|address|abstract|annote|note|howpublished|edition|type)$/i;
    const texSafe = fields => {
      Object.keys(fields || {}).forEach(n => {
        if (TEX_TEXT.test(n) && typeof fields[n] === 'string') fields[n] = fields[n].replace(/(?<!\\)(?<!\\\{)&/g, '\\&');
      });
      return fields;
    };

    F.saveEntry = req => serial(async () => {
      req = Object.assign({}, req, { set: texSafe(Object.assign({}, req.set || {})) });
      const id = req.where === 'inbox' ? await inboxFile(false) : await mainBibId();
      if (!id) throw new Error('LibLande couldn’t find the file to edit.');
      const out = await changeFile(id, async (text, m) => run('saveEntry', text, req, m.name, req.where !== 'inbox' ? Date.parse(m.modifiedTime) : null), req.backupName);
      if (!out.text) return { stamp: Date.parse(out.m.modifiedTime), unchanged: true };
      return { stamp: out.stamp, hash: out.hash, groupsHash: out.groupsHash };
    });

    // A filed PDF, told to the build, so it needn't look for it in Drive.
    const noteFiled = filed => { try { B.noteFile(filed.relPath, filed.info.id, filed.folderPath, filed.folderId); } catch (e) { /* found by the build */ } };

    // Add a publication to the main .bib, filing its PDF first (as
    // Code.gs's addToMain).
    F.addToMain = req => serial(async () => {
      let filed = null;
      const out = await changeFile(await mainBibId(), async (text, m) => {
        if (await run('hasKey', text, req.key)) throw new Error('Your library already has a publication with the cite key ' + req.key + '.');
        const fields = texSafe(Object.assign({}, req.fields));
        fields['date-added'] = fields['date-modified'] = req.now;
        filed = req.uploadId ? await filePdf(m, req.uploadId, fields, req.prefix) : null;
        try {
          if (filed) fields['bdsk-file-1'] = bdskValue(filed.relPath);
          return Object.assign(await run('addToMain', text, req.type, req.key, fields), { undo: filed ? filed.undo : null });
        } catch (e) {
          if (filed) await filed.undo();
          throw e;
        }
      }, req.backupName);
      if (filed) noteFiled(filed);
      return { key: req.key, hash: out.hash, file: filed && filed.info };
    });

    // Link an uploaded PDF to a publication in the main .bib (as Code.gs's
    // attachPdf). With replace, it takes the place of the first linked
    // file, which goes to the Drive trash.
    F.attachPdf = req => serial(async () => {
      let filed = null, nums = [];
      const out = await changeFile(await mainBibId(), async (text, m) => {
        const pre = await run('attachPrepare', text, req);
        nums = pre.nums;
        filed = await filePdf(m, req.uploadId, pre.fields, req.prefix);
        try {
          return Object.assign(await run('attachEdit', text, req, pre.n, bdskValue(filed.relPath)), { undo: filed.undo });
        } catch (e) {
          await filed.undo();
          throw e;
        }
      }, req.backupName);
      noteFiled(filed);
      if (req.replace && req.replaceId) { try { await patch(req.replaceId, { trashed: true }); } catch (e) { /* already gone */ } }
      return { hash: out.hash, file: filed.info, replaced: !!(req.replace && nums.length) };
    });

    // A new static group, made in the sidebar (as Code.gs's createGroup).
    F.createGroup = req => serial(async () => {
      const name = String((req && req.name) || '').trim();
      if (!name || name.length > 120 || /[\r\n]/.test(name)) throw new Error('Give the group a name: one line, up to 120 characters.');
      const keys = (Array.isArray(req.keys) ? req.keys : req.key ? [req.key] : []).map(String).filter((k, i, a) => a.indexOf(k) === i);
      const id = await mainBibId();
      const out = await changeFile(id, (text, m) => run('createGroup', text, name, keys, req.modified || null, m.name), req.backupName);
      return { gh: out.gh, stamp: out.stamp, hashes: out.hashes };
    });

    /* -------------------------------------------- the reading list */
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
      const out = await changeFile(await mainBibId(), text => run('readingGroup', text, name, add, remove), req.backupName);
      if (!out.text) return {};
      return { gh: out.gh, groupKeys: out.groupKeys, group: name };
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

    // Several entries changed in one save (core.saveMany): one backup, one
    // upload.
    F.saveEntries = req => {
      const step = typeof req.onStep === 'function' ? req.onStep : () => {};
      step('Waiting for an earlier change to finish');
      return serial(async () => {
      const items = (req.items || []).map(x => Object.assign({}, x, x.set ? { set: texSafe(Object.assign({}, x.set)) } : {}));
      const out = await changeFile(await mainBibId(), text => run('saveMany', text, items, req.modified), req.backupName, step);
      return { stamp: out.stamp || null, hashes: out.hashes || {}, skipped: out.skipped || [], gh: out.gh || null };
      });
    };

    // A new cite key (as Code.gs's renameKey): in the .bib, then the
    // reading list.
    F.renameKey = req => serial(async () => {
      const out = await changeFile(await mainBibId(), text => run('renameKey', text, req), req.backupName);
      const nk = String(req.newKey).trim(), swap = k => (k === req.key ? nk : k);
      const d = await changeJson(READING_FILE, blankReading, d => {
        d.items.forEach(x => { x.key = swap(x.key); });
        (d.done || []).forEach(x => { x.key = swap(x.key); });
        if (d.syncedKeys) d.syncedKeys = d.syncedKeys.map(swap);
      });
      return { hash: out.hash, gh: out.gh, stamp: out.stamp, reading: readingOut(d) };
    });

    /* -------------------------------------------- libraries */
    // Another library: its .bib (and papers folder) go in settings.json,
    // with the ones used before, to switch back to. Each library keeps its
    // own reading list: the one in use is put aside (reading-list <bib
    // id>.json) and the other's comes back. The library built from the old
    // .bib goes to the trash, to be built again from the new one.
    const shelved = id => 'reading-list ' + id + '.json';
    F.useLibrary = req => serial(async () => {
      const bibId = req.bibId, papersId = req.papersId || '';
      const bib = await meta(bibId, 'id,name');
      const s = (await B.settings(true)) || {};
      const folder = await B.dataFolder(true);
      const other = s.bibId && s.bibId !== bibId;
      let oldName = '';
      if (other) {
        const cur = await B.readJson(folder, READING_FILE);
        if (cur) await B.writeFile(folder, shelved(s.bibId), JSON.stringify(cur), 'application/json');
        const back = await B.readJson(folder, shelved(bibId));
        await B.writeFile(folder, READING_FILE, JSON.stringify(back || blankReading()), 'application/json');
        try { oldName = (await meta(s.bibId, 'name')).name; } catch (e) { oldName = ((s.libraries || []).find(l => l.bibId === s.bibId) || {}).name || ''; }
      }
      // (In a steady order: the first time, the one in use, then new ones
      // at the end. Switching doesn't move them.)
      await B.updateSettings(x => {
        const list = (x.libraries || []).slice();
        const put = l => { const i = list.findIndex(y => y.bibId === l.bibId); if (i < 0) list.push(l); else list[i] = Object.assign({}, list[i], l); };
        if (other) put(Object.assign({ bibId: x.bibId, papersId: x.papersId || '' }, oldName ? { name: oldName } : {}));
        put({ bibId, papersId, name: bib.name });
        x.libraries = list.slice(0, 20);
        if (other) x.readingGroup = '';
        x.bibId = bibId;
        x.papersId = papersId;
      });
      if (other || (s.papersId || '') !== papersId) {
        const old = await B.named(folder, 'library.json.gz', 'id');
        if (old) await patch(old.id, { trashed: true });
      }
      return { name: bib.name };
    });
    // A library taken off the list (not the one open). Its folder and
    // files stay in Google Drive, and its reading list, put aside, comes
    // back if it's added again.
    F.forgetLibrary = req => serial(async () => {
      const s = (await B.settings(true)) || {};
      if (!req.bibId || req.bibId === s.bibId) throw new Error('That\u2019s the library you have open. Switch to another first.');
      await B.updateSettings(x => { x.libraries = (x.libraries || []).filter(l => l.bibId !== req.bibId); });
      return {};
    });
    // A new library: a folder in My Drive (named as asked, or with a number
    // if that's taken) with an empty .bib in it, BibDesk's way, then used.
    F.createLibrary = async req => {
      const base = String(req.name || '').replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'New library';
      let name = base, n = 2;
      while (await B.named('root', name, 'id', true)) name = base + ' ' + n++;
      const folder = await json('files?fields=id,name', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER, parents: ['root'] }) });
      const text = '%% This BibTeX bibliography file was created using LibLande.\n%% Created ' + new Date().toISOString().slice(0, 10) + '\n\n%% Saved with string encoding Unicode (UTF-8) \n\n';
      const bib = await B.writeFile(folder.id, name + '.bib', text, 'text/plain');
      // (Its papers in a folder of their own, beside the .bib.)
      const papers = await subFolder(folder.id, 'Papers', true);
      await F.useLibrary({ bibId: bib.id, papersId: papers.id });
      return { name, folderId: folder.id, bibId: bib.id, papersId: papers.id };
    };
    // Publications copied from the library in use to another one: their
    // entries as they are (the same cite keys), with today's dates, and
    // their PDFs copied into the other library's papers folder under the
    // names AutoFile would give them. One already there (by cite key) is
    // left out. The copies made are put in the trash if saving fails.
    F.copyToLibrary = req => serial(async () => {
      const s = await settings();
      if (!req.bibId || req.bibId === s.bibId) throw new Error('That\u2019s the library you have open.');
      const src = (await read(s.bibId)).text;
      const tbib = await meta(req.bibId, 'id,name,parents,trashed');
      if (tbib.trashed || !(tbib.parents && tbib.parents[0])) throw new Error('LibLande can\u2019t open that library\u2019s .bib file.');
      // (Where its PDFs go: its papers folder, if that's beside the .bib;
      // otherwise Papers there, as AutoFile would.)
      let prefix = 'Papers';
      if (req.papersId) {
        try { const pf = await meta(req.papersId, 'id,name,parents'); if (pf.parents && pf.parents[0] === tbib.parents[0]) prefix = pf.name; } catch (e) { /* Papers */ }
      }
      const there = (await read(req.bibId)).text;
      const skipped = [], ready = [], copies = [];
      try {
        for (const it of req.items || []) {
          if (!(await run('hasKey', src, it.key))) { skipped.push({ key: it.key, reason: 'not in this library' }); continue; }
          if (await run('hasKey', there, it.key)) { skipped.push({ key: it.key, reason: 'already there' }); continue; }
          const info = await run('entryInfo', src, it.key);
          const set = { 'date-added': req.now, 'date-modified': req.now };
          info.files.forEach(n => { set[n] = null; });
          let n = 1;
          for (const id of it.fileIds || []) {
            const c = await json('files/' + encodeURIComponent(id) + '/copy?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ parents: [tbib.parents[0]] }) });
            copies.push(c.id);
            const filed = await filePdf(tbib, c.id, info.fields, prefix);
            set['bdsk-file-' + n++] = bdskValue(filed.relPath);
          }
          ready.push({ key: it.key, raw: await run('copyOut', src, it.key, set) });
        }
        if (ready.length) {
          await changeFile(req.bibId, async text => {
            const go = [];
            for (const r of ready) if (!(await run('hasKey', text, r.key))) go.push(r);
            return go.length ? run('copyIn', text, go.map(r => r.raw), go.map(r => r.key)) : null;
          }, req.backupName);
        }
      } catch (e) {
        for (const id of copies) { try { await patch(id, { trashed: true }); } catch (err) { /* gone */ } }
        throw e;
      }
      return { copied: ready.map(r => r.key), skipped, files: copies.length };
    });


    return F;
  }

  root.makeLiblandeEdits = makeEdits;
})(typeof self !== 'undefined' ? self : this);
