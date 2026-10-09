/*
 * LibLande on GitHub Pages: building the library on this device.
 *
 * The same steps as runBuild_ in Code.gs (Apps Script's, until LibLande
 * moved), with Drive's web API: look at the .bib and the inbox; if either
 * changed (or once a day, to catch new and renamed PDFs), list the papers
 * folder, read the .bib, parse it with Build.gs (served here as build.js)
 * and save library.json.gz in the LibLande folder.
 *
 * What the last build was made from goes on library.json.gz itself, as
 * Drive file properties (bibStamp, inboxStamp, signature, buildVersion,
 * lastFull): a device that finds them current leaves the library be.
 *
 * makeBuilder(io): io.drive(path, opts, base) is an authorised Drive
 * request that throws unless it worked; io.reconcile(groups) brings the
 * reading list in line with the "Reading List" group after a build. The
 * parsing runs in a worker (build-worker.js) when there is one, so the
 * page doesn't freeze; otherwise here.
 */
(function (root) {
  'use strict';
  if (root.document) (root.LIBLANDE_PARTS = root.LIBLANDE_PARTS || {}).builder = '2026-10-08.06';
  const FOLDER = 'application/vnd.google-apps.folder';
  const DATA_FOLDER = 'LibLande', LIBRARY_FILE = 'library.json.gz', INDEX_FILE = 'file-index.json',
    SETTINGS_FILE = 'settings.json', INBOX_FOLDER = 'Inbox', INBOX_FILE = 'LibLande inbox.bib';
  // As in Code.gs.
  const FULL_CHECK_MS = 24 * 60 * 60 * 1000, MAX_FILES = 40000, MAX_LOOKUPS = 40,
    PARALLEL_BATCH = 10, PARALLEL_REQUESTS = 30;
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';

  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const indexHash = files => fingerprint_(JSON.stringify(Object.keys(files).sort().map(k => [k, files[k]])));
  const b64ToBytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const gzip = async s => new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());

  // Inbox entries join the library, except ones already in the main .bib
  // (same cite key or DOI).
  function mergeInbox(data, extra) {
    const keys = new Set(data.entries.map(e => e.k));
    const dois = new Set(data.entries.map(e => (e.f.doi || '').toLowerCase()).filter(Boolean));
    const fresh = extra.entries.filter(e => !keys.has(e.k) && !(e.f.doi && dois.has(e.f.doi.toLowerCase())));
    fresh.forEach(e => { e.ib = 1; });
    data.entries = data.entries.concat(fresh);
    data.inbox = { file: INBOX_FILE, folder: DATA_FOLDER + '/' + INBOX_FOLDER, count: fresh.length };
  }
  // The library from the .bib and the inbox, parsed, put together and
  // gzipped: in the worker (build-worker.js), or here without one. When
  // a linked file wasn't found, the parts come back instead, to be looked
  // up in Drive first. job: {main, inbox} as {text, ids, opts}.
  async function assemble(job) {
    const one = j => buildLibrary_(j.text, j.ids, Object.assign({ base64Decode: b64ToBytes }, j.opts)).data;
    const data = one(job.main), extra = job.inbox ? one(job.inbox) : null;
    const out = { entries: data.entries.length, groups: data.groups || [] };
    if (data.entries.some(e => (e.files || []).some(f => f.x))) return Object.assign(out, { data, extra });
    if (extra) mergeInbox(data, extra);
    out.entries = data.entries.length;
    out.gz = await gzip(JSON.stringify(data));
    return out;
  }
  root.liblandeAssemble = assemble;

  function makeBuilder(io) {
    const get = async path => (await io.drive(path)).json();
    // All the files matching a query (every page of the answer).
    async function listAll(query, fields, order) {
      const out = [];
      let page = null;
      do {
        const j = await get('files?q=' + encodeURIComponent(query) + '&pageSize=1000' +
          '&fields=' + encodeURIComponent('nextPageToken,files(' + fields + ')') +
          (order ? '&orderBy=' + encodeURIComponent(order) : '') + (page ? '&pageToken=' + encodeURIComponent(page) : ''));
        (j.files || []).forEach(f => out.push(f));
        page = j.nextPageToken;
      } while (page);
      return out;
    }
    const meta = (id, fields) => get('files/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(fields));
    const named = async (parentId, name, fields, folder) => (await listAll('name = ' + q(name) + ' and ' + q(parentId) +
      ' in parents and trashed = false' + (folder ? " and mimeType = '" + FOLDER + "'" : ''), fields || 'id,name,modifiedTime', 'modifiedTime desc'))[0] || null;
    const text = async id => (await io.drive('files/' + encodeURIComponent(id) + '?alt=media')).text();
    // The last text of each file read or written here, by modified time:
    // a build after an edit made here needn't download the .bib again.
    const kept = {};
    function remember(id, modifiedTime, value) { kept[id] = { modifiedTime, value }; }
    // PDFs filed here since the last build (paths and IDs), added to the
    // papers folder's index then, so it needn't look for them in Drive.
    const filed = { files: {}, folders: {} };
    function noteFile(path, id, folderPath, folderId) {
      filed.files[path] = id;
      if (folderPath && folderId) filed.folders[folderPath] = folderId;
    }
    async function textAt(id, modifiedTime) {
      if (kept[id] && kept[id].modifiedTime === modifiedTime) return kept[id].value;
      const value = await text(id);
      remember(id, modifiedTime, value);
      return value;
    }

    // LibLande's folder in My Drive: the one holding the library (made,
    // with create, when there's none).
    let dataId = null;
    async function dataFolder(create) {
      if (dataId) return dataId;
      const folders = await listAll('name = ' + q(DATA_FOLDER) + " and 'root' in parents and mimeType = '" + FOLDER + "' and trashed = false", 'id');
      for (const f of folders) {
        if (await named(f.id, LIBRARY_FILE, 'id') || await named(f.id, SETTINGS_FILE, 'id')) return (dataId = f.id);
      }
      if (folders.length) return (dataId = folders[0].id);
      if (!create) return null;
      const made = await (await io.drive('files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: DATA_FOLDER, mimeType: FOLDER, parents: ['root'] }) })).json();
      return (dataId = made.id);
    }

    // Write a file in the LibLande folder (in place, keeping its ID), with
    // Drive properties if given.
    async function writeFile(folderId, name, body, type, properties) {
      const old = await named(folderId, name, 'id');
      const metadata = old ? {} : { name, parents: [folderId] };
      if (properties) metadata.properties = properties;
      const boundary = 'liblande' + Math.random().toString(36).slice(2);
      const blob = new Blob(['--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
        '\r\n--' + boundary + '\r\nContent-Type: ' + type + '\r\n\r\n', body, '\r\n--' + boundary + '--'], { type: 'multipart/related; boundary=' + boundary });
      const path = (old ? 'files/' + encodeURIComponent(old.id) : 'files') + '?uploadType=multipart&fields=id,modifiedTime';
      return (await io.drive(path, { method: old ? 'PATCH' : 'POST', headers: { 'Content-Type': blob.type }, body: blob }, UPLOAD)).json();
    }

    /* -------------------------------------------- settings */
    // Which .bib and papers folder: LibLande/settings.json, made from Apps
    // Script's settings the first time (and again when they change there).
    // Which .bib and papers folder, and how edits are saved:
    // LibLande/settings.json (first made from Apps Script's settings).
    // fresh: read the file again.
    let known = null;
    async function readSettings() {
      const folder = await dataFolder();
      const f = folder && await named(folder, SETTINGS_FILE, 'id');
      if (!f) return null;
      try { const s = JSON.parse(await text(f.id)); return s && s.bibId ? s : null; } catch (e) { return null; }
    }
    async function settings(fresh) {
      if (known && !fresh) return known;
      return (known = await readSettings());
    }
    // Change settings.json: fn(settings) changes it in place, on a fresh
    // copy of the file (or a new one).
    async function updateSettings(fn) {
      const s = (await readSettings()) || { bibId: '', papersId: '', directEdits: false, pendingGroups: [], readingGroup: '', prefs: {} };
      fn(s);
      await writeFile(await dataFolder(true), SETTINGS_FILE, JSON.stringify(s, null, 1), 'application/json');
      known = s;
      return s;
    }

    /* -------------------------------------------- the papers folder */
    // The path from folder `from` to folder `to` ("Papers", "../Papers"),
    // '' for the same folder, null when they share no ancestor.
    async function relativePath(fromId, toId) {
      if (!fromId) return null;
      if (fromId === toId) return '';
      const chain = async id => {
        const out = [];
        for (let i = 0; id && i < 64; i++) {
          const f = await meta(id, 'id,name,parents');
          out.push(f);
          id = f.parents && f.parents[0];
        }
        return out;
      };
      const [a, b] = await Promise.all([chain(fromId), chain(toId)]);
      const aIds = a.map(f => f.id);
      for (let j = 0; j < b.length; j++) {
        const i = aIds.indexOf(b[j].id);
        if (i >= 0) return Array(i).fill('..').concat(b.slice(0, j).reverse().map(f => f.name)).join('/');
      }
      return null;
    }

    // Every file and folder under a folder, with paths from `prefix`; many
    // folders asked about at once.
    async function listTree(rootId, prefix) {
      const rootKey = prefix || '';
      const files = {}, folders = {};
      folders[rootKey] = rootId;
      let frontier = [{ id: rootId, path: rootKey }], count = 0;
      while (frontier.length) {
        const next = [], chunks = [];
        for (let i = 0; i < frontier.length; i += PARALLEL_BATCH) chunks.push(frontier.slice(i, i + PARALLEL_BATCH));
        for (let c = 0; c < chunks.length; c += PARALLEL_REQUESTS) {
          const group = chunks.slice(c, c + PARALLEL_REQUESTS);
          const answers = await Promise.all(group.map(chunk =>
            listAll('(' + chunk.map(f => q(f.id) + ' in parents').join(' or ') + ') and trashed = false', 'id,name,parents,mimeType')));
          answers.forEach((items, g) => {
            const pathById = {};
            group[g].forEach(f => { pathById[f.id] = f.path; });
            items.forEach(f => {
              const parent = (f.parents || []).find(p => p in pathById);
              if (parent === undefined) return;
              const path = (pathById[parent] ? pathById[parent] + '/' : '') + f.name;
              if (f.mimeType === FOLDER) { folders[path] = f.id; next.push({ id: f.id, path }); } else files[path] = f.id;
              if (++count > MAX_FILES) throw new Error('The papers folder holds more than ' + MAX_FILES + ' files. Choose the folder that holds just your papers.');
            });
          });
        }
        frontier = next;
      }
      return { files, folders };
    }

    // A child of a folder by name, comparing names in the same Unicode
    // form (macOS and Drive can store accented letters differently).
    async function childNamed(parentId, name, folder) {
      const want = name.normalize('NFC');
      const kids = await listAll(q(parentId) + ' in parents and trashed = false' + (folder ? " and mimeType = '" + FOLDER + "'" : ''), 'id,name');
      const hit = kids.find(f => f.name.normalize('NFC') === want);
      return hit ? hit.id : null;
    }
    async function lookupPath(path, index) {
      const parts = path.split('/'), name = parts.pop();
      let i = parts.length, dirId = null;
      for (; i >= 0; i--) {
        const key = parts.slice(0, i).join('/');
        if (index.folders[key]) { dirId = index.folders[key]; break; }
      }
      if (!dirId) return null;
      for (let j = i; j < parts.length; j++) {
        dirId = await childNamed(dirId, parts[j], true);
        if (!dirId) return null;
        index.folders[parts.slice(0, j + 1).join('/')] = dirId;
      }
      return childNamed(dirId, name, false);
    }
    // Linked files the index doesn't have yet (new PDFs, or ones AutoFile
    // renamed): looked up directly, up to MAX_LOOKUPS a build.
    async function resolveMissing(data, index) {
      let looked = 0, found = 0;
      for (const e of data.entries) {
        for (const f of e.files || []) {
          if (f.id || !f.x || looked >= MAX_LOOKUPS) continue;
          looked++;
          const id = await lookupPath(f.p, index);
          if (id) { f.id = id; delete f.x; index.files[f.p] = id; found++; }
        }
      }
      return { looked, found };
    }

    /* -------------------------------------------- parsing */
    let worker = null;
    function parse(job) {
      if (typeof Worker === 'function' && root.LIBLANDE_BUILD_WORKER !== false) {
        try {
          if (!worker) worker = new Worker('build-worker.js');
          return new Promise((resolve, reject) => {
            const done = ev => { worker.removeEventListener('message', done); worker.removeEventListener('error', fail); ev.data.error ? reject(new Error(ev.data.error)) : resolve(ev.data.result); };
            const fail = ev => { worker.removeEventListener('message', done); worker.removeEventListener('error', fail); worker = null; reject(new Error(ev.message || 'The library couldn\u2019t be read.')); };
            worker.addEventListener('message', done);
            worker.addEventListener('error', fail);
            worker.postMessage({ job });
          });
        } catch (e) { /* no worker: parse here */ }
      }
      return assemble(job);
    }

    /* -------------------------------------------- the build */
    // Whether the library needs building, and what from. o.force: build
    // anyway; o.daily: list the papers folder again when a day has passed.
    async function look(o) {
      const s = await settings(false);
      if (!s) return { configured: false };
      const folder = await dataFolder();
      // (Asked together.)
      const [bib, inboxFolder, lib] = await Promise.all([
        meta(s.bibId, 'id,name,modifiedTime,parents,trashed'),
        folder ? named(folder, INBOX_FOLDER, 'id', true) : null,
        folder ? named(folder, LIBRARY_FILE, 'id,modifiedTime,properties') : null,
      ]);
      if (bib.trashed) throw new Error('Your .bib file is in the Drive trash.');
      const inbox = inboxFolder && await named(inboxFolder.id, INBOX_FILE, 'id,modifiedTime');
      const lp = (lib && lib.properties) || {};
      const bibStamp = String(Date.parse(bib.modifiedTime));
      const inboxStamp = inbox ? String(Date.parse(inbox.modifiedTime)) : '';
      const fullDue = !!o.daily && Date.now() - Number(lp.lastFull || 0) > FULL_CHECK_MS;
      const current = lp.buildVersion === String(BUILD_VERSION);
      const needed = !!o.force || !lib || fullDue || !current || lp.bibStamp !== bibStamp || (lp.inboxStamp || '') !== inboxStamp;
      return { configured: true, needed, s, folder, bib, inboxFolder, inbox, lib, lp, bibStamp, inboxStamp, fullDue, current };
    }

    async function build(o, w) {
      const started = Date.now(), times = [];
      let last = started;
      const mark = label => { times.push(label + ' ' + ((Date.now() - last) / 1000).toFixed(1) + ' s'); last = Date.now(); };
      w = w || await look(o);
      if (!w.configured || !w.needed) return false;
      const { s, folder, bib, inboxFolder, inbox, lib, lp, bibStamp, inboxStamp, fullDue, current } = w;
      // The .bib (11 MB, say) starts downloading now, alongside the rest,
      // when it changed (not for the daily look at the papers folder,
      // which may find nothing new).
      const changed = !!o.force || !lib || !current || lp.bibStamp !== bibStamp || (lp.inboxStamp || '') !== inboxStamp;
      let texts = null;
      const readTexts = () => texts || (texts = Promise.all([textAt(bib.id, bib.modifiedTime), inbox ? textAt(inbox.id, inbox.modifiedTime) : Promise.resolve(null)]));
      if (changed) readTexts().catch(() => {});
      const papersId = s.papersId || (bib.parents && bib.parents[0]);
      if (!papersId) throw new Error('LibLande can’t see the folder that holds your .bib file. Choose your papers folder in Settings.');
      const prefix = await relativePath(bib.parents && bib.parents[0], papersId);

      // The papers folder's index: the saved one, unless it's for another
      // folder, or a day old, or a full build was asked for.
      const indexFile = await named(folder, INDEX_FILE, 'id');
      let index = null;
      if (indexFile && !o.force) {
        try {
          const saved = JSON.parse(await text(indexFile.id));
          if (saved.papersId === papersId && saved.prefix === prefix && saved.files && saved.folders) index = saved;
        } catch (e) { /* list it again */ }
      }
      const fullListing = !index || fullDue;
      let lastFull = lp.lastFull || '';
      if (fullListing) {
        const tree = await listTree(papersId, prefix);
        index = { papersId, prefix, files: tree.files, folders: tree.folders, hash: indexHash(tree.files) };
        await writeFile(folder, INDEX_FILE, JSON.stringify(index), 'application/json');
        lastFull = String(Date.now());
      }
      if (!fullListing && Object.keys(filed.files).length) {
        Object.assign(index.files, filed.files);
        Object.assign(index.folders, filed.folders);
        index.hash = indexHash(index.files);
        await writeFile(folder, INDEX_FILE, JSON.stringify(index), 'application/json');
      }
      filed.files = {}; filed.folders = {};
      mark(fullListing ? 'listed papers folder' : 'read saved index');
      const inboxPaths = inbox ? (await listTree(inboxFolder.id, '')).files : {};
      // (Listed while the .bib downloads: see readTexts.)
      const inboxHash = indexHash(inboxPaths);
      const signature = fingerprint_(bibStamp + ':' + inboxStamp + ':' + papersId + ':' + index.hash + ':' + inboxHash);
      const props = { bibStamp, inboxStamp, signature, buildVersion: String(BUILD_VERSION), lastFull };
      // Nothing that matters changed (the daily listing found no new
      // files): note what was checked, and leave the library as it is.
      if (!o.force && lib && current && lp.signature === signature) {
        await io.drive('files/' + encodeURIComponent(lib.id) + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties: props }) });
        return false;
      }

      const [bibText, inboxText] = await readTexts();
      mark('read .bib');
      const job = { main: { text: bibText, ids: index.files, opts: { built: Date.parse(bib.modifiedTime), source: bib.name, papersPrefix: prefix } } };
      if (inboxText != null) job.inbox = { text: inboxText, ids: inboxPaths, opts: { built: 0, source: INBOX_FILE, papersPrefix: '' } };
      const out = await parse(job);
      mark('parsed');
      if (!out.entries && bibText.indexOf('@') >= 0) throw new Error('LibLande couldn\u2019t read any publications in ' + bib.name + '.');
      // Linked files the index doesn't have yet: looked up, then the
      // library put together here.
      if (out.data) {
        if (!fullListing) {
          const found = await resolveMissing(out.data, index);
          if (found.looked) {
            index.hash = indexHash(index.files);
            await writeFile(folder, INDEX_FILE, JSON.stringify(index), 'application/json');
            props.signature = fingerprint_(bibStamp + ':' + inboxStamp + ':' + papersId + ':' + index.hash + ':' + inboxHash);
            mark('looked up ' + found.looked + ' new file' + (found.looked === 1 ? '' : 's') + ' (' + found.found + ' found)');
          }
        }
        if (out.extra) mergeInbox(out.data, out.extra);
        out.entries = out.data.entries.length;
        out.gz = await gzip(JSON.stringify(out.data));
      }
      const saved = await writeFile(folder, LIBRARY_FILE, out.gz, 'application/gzip', props);
      mark('saved');
      // The reading list follows the "Reading List" group: not waited for.
      if (io.reconcile) io.reconcile(out.groups).catch(e => console.warn('Reading list:', e.message));
      console.log('LibLande build (on this device): ' + times.join(', ') + '; total ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
      // (gz: the library itself, so the page needn't download it again.)
      return { built: true, id: saved.id, stamp: Date.parse(saved.modifiedTime), entries: out.entries, gz: out.gz };
    }

    async function readJson(folderId, name) {
      const f = await named(folderId, name, 'id');
      if (!f) return null;
      try { return JSON.parse(await text(f.id)); } catch (e) { return null; }
    }

    return { look, build, settings, updateSettings, dataFolder, named, meta, text, textAt, remember, noteFile, readJson, writeFile, listAll };
  }

  root.makeLiblandeBuilder = makeBuilder;
})(typeof self !== 'undefined' ? self : this);
