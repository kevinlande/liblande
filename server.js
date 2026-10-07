/*
 * LibLande on GitHub Pages: its server, in the browser.
 *
 * The page (index.html) talks to its server through google.script.run, as
 * it did when Apps Script served it (until 2026-10-04; Code.gs is kept in
 * the repo as a record). Here that's answered in the browser,
 * with Google Drive's web API and a Drive sign-in: the status, settings
 * (LibLande/settings.json) and preferences (prefs.json), the library's
 * download, PDF backups, thumbnails, DOI lookups (from Crossref) and
 * exports; the library is built here (builder.js) when the .bib or the
 * inbox has changed, on opening and on Refresh; and adding and editing
 * entries, pending edits, groups and the reading list change the .bib here
 * (edits.js), with the same checks and backups as Code.gs had.
 */
(() => {
  'use strict';
  window.LIBLANDE_PAGES = true;
  // (Which version each part of the app is from: index.html checks they
  // match. build.py fills it in.)
  (window.LIBLANDE_PARTS = window.LIBLANDE_PARTS || {}).server = '2026-10-07.14';
  const CLIENT_ID = '789682218462-98mjugngb46ttd01ucp9dcj71ufspjgn.apps.googleusercontent.com';
  // Google Drive (your .bib, papers and LibLande folder): all it needs.
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  const API = 'https://www.googleapis.com/drive/v3/';
  const FOLDER = 'application/vnd.google-apps.folder';
  // As in Code.gs.
  const DATA_FOLDER = 'LibLande', LIBRARY_FILE = 'library.json.gz', PENDING_FILE = 'pending-edits.json',
    READING_FILE = 'reading-list.json', BACKUP_FOLDER = 'Backups', PDF_BACKUP_DAYS = 60;
  // A token is renewed on a tap after 50 minutes (it lasts an hour).
  const RENEW_AFTER = 50 * 60 * 1000;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('liblande.pages.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('liblande.pages.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  /* ------------------------------------------------------------ sign-in */
  // Google only opens its sign-in window straight after a tap, so a token
  // that's missing or has run out waits for one: a bar asks for it, and any
  // tap will do. A token kept from last time is used while it lasts.
  let token = store.get('token', null);   // {value, at, expiresIn, scope}
  // (One asked for with other permissions is asked for again.)
  if (token && token.scope !== SCOPE) token = null;
  let email = store.get('email', '');
  let client = null, asking = false, waiters = [];
  const age = () => (token ? Date.now() - token.at : Infinity);
  const valid = () => !!token && age() < token.expiresIn * 1000 - 60 * 1000;

  function makeClient() {
    if (client || !window.google || !google.accounts || !google.accounts.oauth2) return;
    client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: resp => {
        asking = false;
        if (resp.error) { bar('Google didn’t sign you in (' + resp.error + '). Tap to try again.'); return; }
        token = { value: resp.access_token, at: Date.now(), expiresIn: +resp.expires_in || 3600, scope: SCOPE };
        store.set('token', token);
        bar(null);
        const w = waiters; waiters = [];
        w.forEach(f => f(token.value));
        if (!email) whoAmI();
      },
      error_callback: err => {
        asking = false;
        bar((err && err.type === 'popup_closed' ? 'Sign-in was closed' : 'Sign-in didn’t finish') + '. Tap to try again.');
      },
    });
  }
  function ask() {
    makeClient();
    if (!client || asking) return;
    asking = true;
    const opts = { prompt: email ? '' : 'consent' };
    if (email) opts.login_hint = email;
    try { client.requestAccessToken(opts); } catch (e) { asking = false; }
  }
  async function whoAmI() {
    try {
      const r = await fetch(API + 'about?fields=user(emailAddress)', { headers: { Authorization: 'Bearer ' + token.value } });
      const j = await r.json();
      if (j.user && j.user.emailAddress) { email = j.user.emailAddress; store.set('email', email); }
    } catch (e) { /* only a hint for next time */ }
  }
  function getToken(fresh) {
    if (fresh) token = null;
    if (valid()) return Promise.resolve(token.value);
    // Offline, Google can't be asked: the old token goes along (Drive won't
    // be reached, and papers kept on this device answer instead).
    if (!navigator.onLine) {
      if (token || store.get('token', null)) return Promise.resolve((token || store.get('token', null)).value);
      return Promise.reject(new Error('You\u2019re offline, and LibLande hasn\u2019t signed in to Google on this device yet.'));
    }
    return new Promise(resolve => {
      waiters.push(resolve);
      bar(email ? 'Tap anywhere to reconnect to Google Drive' : 'Sign in with Google to open your library');
    });
  }
  // A tap renews a token that's missing, old or run out. (Not taps on a
  // page of a paper, where Google's window would interrupt a stroke; the
  // bar, or a tap anywhere else, does it then.)
  function onTap(ev) {
    if (asking) return;
    const onPage = ev.target && ev.target.closest && ev.target.closest('#vPages, #vPeekPages');
    if (waiters.length || (!onPage && token && age() > RENEW_AFTER)) ask();
  }
  document.addEventListener('click', onTap, true);
  document.addEventListener('keydown', onTap, true);

  // The bar: what's needed, at the top of the screen.
  let barEl = null;
  function bar(text) {
    if (!text) { if (barEl) barEl.hidden = true; return; }
    if (!barEl) {
      barEl = document.createElement('button');
      barEl.type = 'button';
      barEl.id = 'pagesSignIn';
      barEl.style.cssText = 'position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top, 0px));transform:translateX(-50%);z-index:2147483000;' +
        'max-width:calc(100% - 32px);padding:10px 18px;border-radius:999px;border:0;font:600 15px -apple-system,BlinkMacSystemFont,sans-serif;' +
        'background:#1f6b5c;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer';
      barEl.addEventListener('click', ask);
      (document.body || document.documentElement).appendChild(barEl);
    }
    barEl.textContent = text;
    barEl.hidden = false;
  }

  /* ------------------------------------------------------------ Drive */
  // (A request with no answer is given up after a while: on an iPad, one
  // under way when LibLande goes to the background can be left with none,
  // ever, and changes to the .bib wait their turn behind it.)
  const STALL = 45 * 1000, STALL_SENDING = 5 * 60 * 1000, STALL_READING = 5 * 60 * 1000;
  async function drive(path, opts = {}, base = API) {
    const go = async t => {
      const stop = window.AbortController ? new AbortController() : null;
      const big = opts.body && typeof opts.body !== 'string';
      let timer = stop && setTimeout(() => stop.abort(), big ? STALL_SENDING : STALL);
      try {
        const r = await fetch(base + path, Object.assign({}, opts, { headers: Object.assign({}, opts.headers, { Authorization: 'Bearer ' + t }) },
          stop ? { signal: stop.signal } : {}));
        // (Then a while longer for what it sends.)
        if (stop) { clearTimeout(timer); timer = setTimeout(() => stop.abort(), STALL_READING); }
        return r;
      } catch (e) {
        if (timer) clearTimeout(timer);
        const err = new Error(!navigator.onLine ? 'You\u2019re offline.' : stop && stop.signal.aborted
          ? 'Google Drive didn\u2019t answer. Try again.' : 'Google Drive can\u2019t be reached just now.');
        err.offline = true;
        throw err;
      }
    };
    let r = await go(await getToken());
    if (r.status === 401) r = await go(await getToken(true));
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).error.message; } catch (e) { /* none */ }
      throw new Error('Google Drive answered ' + r.status + (msg ? ': ' + msg : ''));
    }
    return r;
  }
  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  async function list(query, fields = 'id,name,modifiedTime,createdTime,size,mimeType', order = '') {
    const r = await drive('files?q=' + encodeURIComponent(query) + '&fields=' + encodeURIComponent('files(' + fields + ')') +
      '&pageSize=1000' + (order ? '&orderBy=' + encodeURIComponent(order) : ''));
    return (await r.json()).files || [];
  }
  async function fileIn(folderId, name) {
    return (await list('name = ' + q(name) + ' and ' + q(folderId) + ' in parents and trashed = false', undefined, 'modifiedTime desc'))[0] || null;
  }
  async function subFolder(parentId, name, create) {
    const f = (await list('name = ' + q(name) + ' and ' + q(parentId) + " in parents and mimeType = '" + FOLDER + "' and trashed = false"))[0];
    if (f || !create) return f || null;
    const r = await drive('files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }) });
    return r.json();
  }
  async function readJson(folderId, name) {
    const f = await fileIn(folderId, name);
    if (!f) return null;
    try { return await (await drive('files/' + encodeURIComponent(f.id) + '?alt=media')).json(); } catch (e) { return null; }
  }
  // LibLande's folder in My Drive (the one with the library in it).
  let dataId = store.get('dataFolder', null);
  async function dataFolder() {
    if (dataId) {
      try {
        const f = await (await drive('files/' + encodeURIComponent(dataId) + '?fields=id,trashed')).json();
        if (!f.trashed) return dataId;
      } catch (e) { /* gone: look again */ }
    }
    const folders = await list('name = ' + q(DATA_FOLDER) + " and 'root' in parents and mimeType = '" + FOLDER + "' and trashed = false");
    for (const f of folders) {
      if (await fileIn(f.id, LIBRARY_FILE)) { dataId = f.id; store.set('dataFolder', dataId); return dataId; }
    }
    return null;
  }
  const bytesToB64 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const day = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* ------------------------------------------------------------ the server */
  const SERVER = {
    // What the page needs to know, from Drive (as Code.gs's getStatus):
    // the settings, the library, pending edits, the reading list and your
    // preferences. Meanwhile, a look at whether the library needs
    // building, which then starts here.
    async getStatus() {
      // (Asked again while a build is under way, as the page does every
      // few seconds: answered as soon as it's done.)
      const running = buildRun;
      // (Changes kept from a time offline go to Drive first.)
      if (outbox.length && navigator.onLine) { try { await flushOutbox(); } catch (e) { /* tried */ } }
      const w = await builder.look({ daily: true });
      if (!w.configured) return { configured: false };
      const started = startBuild(w);
      const [pending, reading, prefs, papersName, token] = await Promise.all([
        builder.readJson(w.folder, PENDING_FILE), builder.readJson(w.folder, READING_FILE), loadPrefs(w.s),
        folderName(w.s.papersId || (w.bib.parents && w.bib.parents[0])), getToken()]);
      if (running) await Promise.race([running, new Promise(r => setTimeout(r, 60 * 1000))]);
      const r = reading || {};
      const st = {
        configured: true,
        bibName: w.bib.name,
        papersName,
        stamp: w.lib ? Date.parse(w.lib.modifiedTime) : null,
        libraryId: w.lib ? w.lib.id : null,
        token,
        building: (started && !running) || !!buildRun,
        error: null,
        pending: pending && Array.isArray(pending.edits) ? pending.edits : [],
        reading: { items: r.items || [], done: r.done || [], seeded: !!r.seeded, syncedKeys: r.syncedKeys || null },
        direct: !!w.s.directEdits,
        prefs,
      };
      if (buildErr) { st.error = buildErr; buildErr = null; }
      offlineLists.update(st);
      // The library just built here.
      if (lastBuilt && !(st.stamp > lastBuilt.stamp)) { st.stamp = lastBuilt.stamp; st.libraryId = lastBuilt.id; }
      return st;
    },
    // Refresh: a look at the .bib and the inbox, and a build here if
    // either changed (the page waits for it, asking getStatus).
    refreshNow() { return SERVER.getStatus(); },
    // New settings, from the links pasted in Settings (as Code.gs's
    // saveSettings): the .bib and, if given, the papers folder, checked and
    // kept in settings.json. A library built from other ones goes to the
    // Drive trash, and is built again.
    async saveSettings(bibLink, papersLink) {
      const bibId = idFromLink(bibLink);
      if (!bibId) throw new Error('Paste the link to your .bib file. In Google Drive, right-click the file and choose Share, then Copy link.');
      let bib;
      try { bib = await builder.meta(bibId, 'id,name,parents,trashed'); } catch (e) {
        throw new Error('LibLande couldn\u2019t open that file. Check that the link is to a file you can open in Google Drive.');
      }
      if (!/\.bib$/i.test(bib.name)) throw new Error('\u201c' + bib.name + '\u201d isn\u2019t a .bib file. Paste the link to your BibTeX library.');
      let papersId = '';
      if (papersLink && String(papersLink).trim()) {
        papersId = idFromLink(papersLink);
        let ok = false;
        try { ok = !!papersId && (await builder.meta(papersId, 'mimeType')).mimeType === FOLDER; } catch (e) { ok = false; }
        if (!ok) throw new Error('LibLande couldn\u2019t open that papers folder. Paste the link to a folder, or leave the box empty.');
      } else if (!(bib.parents && bib.parents[0])) {
        throw new Error('LibLande can\u2019t see the folder that holds this .bib file. Paste the link to your papers folder too.');
      }
      const before = await builder.settings(true);
      await builder.updateSettings(s => { s.bibId = bibId; s.papersId = papersId; });
      if (before && (before.bibId !== bibId || (before.papersId || '') !== papersId)) {
        const old = await builder.named(await builder.dataFolder(true), LIBRARY_FILE, 'id');
        if (old) await drive('files/' + encodeURIComponent(old.id) + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      }
      return SERVER.getStatus();
    },
    async setDirect(on) {
      await edits.setDirect(on);
      return SERVER.getStatus();
    },
    // Changing the .bib, the inbox, pending edits and the reading list:
    // edits.js, here.
    // (These four are kept on this device while offline: see below.)
    saveEntry: later('saveEntry', () => ({ queued: true })),
    queueEdit: later('queueEdit', req => ({ queued: true, pending: offlineLists.pending(req) })),
    discardPending: later('discardPending', key => ({ queued: true, pending: offlineLists.discard(key) })),
    applyPending(req) { return edits.applyPending(req); },
    addToInbox: later('addToInbox', req => ({ queued: true, key: req.key })),
    // (A PDF has to be uploaded first: with one, adding needs a connection.)
    addToMain: later('addToMain', req => {
      if (req.uploadId) { const e = new Error('You\u2019re offline.'); e.offline = true; throw e; }
      return { queued: true, key: req.key, hash: null, file: null };
    }),
    attachPdf(req) { return edits.attachPdf(req); },
    createGroup: later('createGroup', () => ({ queued: true })),
    readingOps: later('readingOps', req => ({ queued: true, reading: offlineLists.reading(req) })),
    renameKey: later('renameKey', req => ({ queued: true, hash: null, gh: null, reading: offlineLists.renameKey(req.key, String(req.newKey).trim()) })),
    saveEntries(req) { return edits.saveEntries(req); },
    // Details for a DOI, from Crossref (as Code.gs's lookupDoi).
    lookupDoi(input) { return lookupDoi(input); },
    // An export's folder, LibLande/Exports/<name>, with references.bib and
    // references.rtf; the page then adds the PDFs (as Code.gs's).
    async createExport(req) {
      const exportsFolder = await subFolder(await dataFolder(), 'Exports', true);
      const base = String(req.name || '').replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'LibLande export ' + day();
      let name = base, n = 2;
      while (await builder.named(exportsFolder.id, name, 'id', true)) name = base + ' (' + n++ + ')';
      const folder = await (await drive('files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER, parents: [exportsFolder.id] }) })).json();
      await builder.writeFile(folder.id, 'references.bib', req.bib || '', 'text/plain');
      await builder.writeFile(folder.id, 'references.rtf', req.rtf || '', 'application/rtf');
      return { folderId: folder.id, url: 'https://drive.google.com/drive/folders/' + folder.id, name, token: await getToken() };
    },
    // Where a new publication's PDF is uploaded: LibLande/Inbox/Papers.
    // (The .bib starts downloading meanwhile, for the change that follows.)
    async getInboxUploadInfo() {
      edits.prefetch().catch(() => {});
      const inbox = await subFolder(await dataFolder(), 'Inbox', true);
      const papers = await subFolder(inbox.id, 'Papers', true);
      return { folderId: papers.id, token: await getToken() };
    },
    async getLibraryInfo() {
      const folder = await dataFolder();
      const lib = folder && await fileIn(folder, LIBRARY_FILE);
      if (!lib) throw new Error('The library hasn\u2019t been built yet. Tap Refresh to build it.');
      return { id: lib.id, stamp: Date.parse(lib.modifiedTime), token: await getToken() };
    },
    getToken() { return getToken(); },
    async getLibrary() {
      const info = await SERVER.getLibraryInfo();
      const bytes = new Uint8Array(await (await drive('files/' + encodeURIComponent(info.id) + '?alt=media')).arrayBuffer());
      return { stamp: info.stamp, library: bytesToB64(bytes) };
    },
    // Your preferences (theme, tools, recently viewed...), in
    // LibLande/prefs.json, so they follow you across devices.
    savePrefs(changes) { return savePrefs(changes); },
    // As in Code.gs: before the first save of the day to a PDF, a copy goes
    // to LibLande/Backups/PDFs; copies older than 60 days are removed.
    async backupPdf(fileId) {
      const backups = await subFolder(await dataFolder(), BACKUP_FOLDER, true);
      const folder = await subFolder(backups.id, 'PDFs', true);
      const file = await (await drive('files/' + encodeURIComponent(fileId) + '?fields=name,size')).json();
      const name = day() + ' ' + file.name.replace(/[.]pdf$/i, '') + ' (' + fileId.slice(-6) + ').pdf';
      if (!(await fileIn(folder.id, name))) {
        const copy = await (await drive('files/' + encodeURIComponent(fileId) + '/copy?fields=id,size', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parents: [folder.id] }) })).json();
        if (!copy || copy.size !== file.size) throw new Error('LibLande couldn’t make a backup copy of the PDF, so it didn’t save your markup.');
      }
      if (store.get('pdfBackupsPruned', '') !== day()) {
        const cutoff = new Date(Date.now() - PDF_BACKUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const old = await list(q(folder.id) + " in parents and createdTime < '" + cutoff + "' and trashed = false", 'id');
        for (const f of old) {
          await drive('files/' + encodeURIComponent(f.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
        }
        store.set('pdfBackupsPruned', day());
      }
      return true;
    },
    async getThumbnails(ids) {
      const out = {};
      await Promise.all((ids || []).slice(0, 8).map(async id => {
        out[id] = null;
        try {
          const meta = await (await drive('files/' + encodeURIComponent(id) + '?fields=thumbnailLink')).json();
          if (!meta.thumbnailLink) return;
          const url = meta.thumbnailLink.replace(/=s\d+$/, '=s400');
          try {
            const r = await fetch(url, { headers: { Authorization: 'Bearer ' + await getToken() } });
            out[id] = r.ok ? URL.createObjectURL(await r.blob()) : url;
          } catch (e) { out[id] = url; }
        } catch (e) { /* no such file, or no access */ }
      }));
      return out;
    },
  };
  // Anything else the page asks for isn't in this version.
  const missing = name => () => Promise.reject(new Error('LibLande on GitHub Pages can\u2019t do this (' + name + ').'));
  // A Drive file or folder ID from a pasted link, or a bare ID (as
  // Code.gs's idFromLink_).
  function idFromLink(s) {
    s = String(s || '').trim();
    const m = /\/d\/([\w-]{20,})/.exec(s) || /[?&]id=([\w-]{20,})/.exec(s) || /\/folders\/([\w-]{20,})/.exec(s) || /^([\w-]{20,})$/.exec(s);
    return m ? m[1] : null;
  }

  /* ------------------------------------------------------------ offline */
  // Changes made with no connection (to entries, pending edits and the
  // reading list) wait here, on this device, in the order made; when it's
  // back, they're made in Drive in that order (flushOutbox). Meanwhile the
  // page shows them (index.html's overlayPending reads
  // window.liblandeOutbox), and asks with the answers given here: what the
  // pending edits and reading list come to with them.
  let outbox = store.get('outbox', []);
  window.liblandeOutbox = () => outbox.slice();
  const isOffline = e => !navigator.onLine || !!(e && e.offline);
  function keepForLater(name, args) {
    outbox.push({ name, args, at: Date.now() });
    store.set('outbox', outbox);
  }
  // (Made in Drive first: anything kept from before, so the order holds.)
  function later(name, offline) {
    return async (...args) => {
      if (navigator.onLine && outbox.length) { try { await flushOutbox(); } catch (e) { /* tried */ } }
      // (The answer first: a change that can't be kept offline says so,
      // and isn't kept.)
      const keep = () => { const res = offline(...args); keepForLater(name, args); return res; };
      if (!navigator.onLine || outbox.length) return keep();
      try {
        const res = await edits[name](...args);
        offlineLists.update(res);
        return res;
      } catch (e) {
        if (!isOffline(e)) throw e;
        return keep();
      }
    };
  }
  // The pending edits and the reading list as last known (from the status,
  // or an answer), with the changes kept here made to them.
  const offlineLists = {
    known: store.get('lists', { pending: [], reading: { items: [], done: [], seeded: false, syncedKeys: null } }),
    update(res) {
      if (!res) return;
      if (Array.isArray(res.pending)) this.known.pending = res.pending;
      if (res.reading) this.known.reading = res.reading;
      store.set('lists', this.known);
    },
    pending(req) {
      const set = req.set || {};
      mergeEdit_(this.known.pending, { key: req.key, set, groups: { add: (req.groups && req.groups.add) || [], remove: (req.groups && req.groups.remove) || [] },
        expectHash: req.expectHash || null, expectGroupsHash: req.expectGroupsHash || null, modified: req.modified });
      store.set('lists', this.known);
      return this.known.pending.slice();
    },
    discard(key) {
      this.known.pending = this.known.pending.filter(e => e.key !== key);
      store.set('lists', this.known);
      return this.known.pending.slice();
    },
    renameKey(from, to) {
      const swap = k => (k === from ? to : k), d = this.known.reading;
      (d.items || []).forEach(x => { x.key = swap(x.key); });
      (d.done || []).forEach(x => { x.key = swap(x.key); });
      if (d.syncedKeys) d.syncedKeys = d.syncedKeys.map(swap);
      this.known.pending.forEach(e => { e.key = swap(e.key); });
      store.set('lists', this.known);
      return JSON.parse(JSON.stringify(d));
    },
    reading(req) {
      const d = this.known.reading, now = Date.now();
      (req.ops || []).forEach(op => window.liblandeReadingOp(d, op, now));
      store.set('lists', this.known);
      return JSON.parse(JSON.stringify(d));
    },
  };
  // Back online: the kept changes made in Drive, in order. Two edits to the
  // same publication were both checked against how it was before either;
  // the second is checked against what the first made it. One that can't
  // be made (the publication was changed elsewhere meanwhile, say) is left
  // out, with why. The page hears how it went (the event liblande-outbox).
  let flushing = null;
  function flushOutbox() {
    if (flushing) return flushing;
    if (!outbox.length || !navigator.onLine) return Promise.resolve();
    flushing = (async () => {
      let saved = 0;
      const failed = [], hashes = {};
      while (outbox.length) {
        const item = outbox[0], req = item.args[0];
        if (req && typeof req === 'object' && req.key && hashes[req.key] && req.expectHash === hashes[req.key].from) req.expectHash = hashes[req.key].to;
        try {
          const res = await edits[item.name](...item.args);
          offlineLists.update(res);
          if (item.name === 'saveEntry' && res && res.hash && req.expectHash) hashes[req.key] = { from: req.expectHash, to: res.hash };
          saved++;
        } catch (e) {
          if (isOffline(e)) break;
          failed.push({ name: item.name, key: req && req.key || (typeof req === 'string' ? req : ''), reason: e.message });
        }
        outbox.shift();
        store.set('outbox', outbox);
      }
      if (saved || failed.length) window.dispatchEvent(new CustomEvent('liblande-outbox', { detail: { saved, failed, waiting: outbox.length } }));
    })().finally(() => { flushing = null; });
    return flushing;
  }
  window.addEventListener('online', () => setTimeout(() => { flushOutbox().catch(() => {}); }, 1500));
  // (Safari often doesn't say it's back online, as when LibLande comes
  // back to the screen with a connection already: so also then, and every
  // half minute while changes wait, with the page on screen.)
  const flushSoon = () => { if (outbox.length && navigator.onLine && !document.hidden) flushOutbox().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(flushSoon, 1500); });
  setInterval(flushSoon, 30 * 1000);

  /* ------------------------------------------------------------ preferences */
  // LibLande/prefs.json; the first time, those in settings.json (copied
  // from Apps Script's when LibLande moved). Changes are gathered for a moment, then written onto a
  // fresh copy of the file, so another device's changes to other
  // preferences aren't lost.
  const PREFS_FILE = 'prefs.json';
  let prefsMemo = null, prefsWaiting = {}, prefsTimer = null;
  async function loadPrefs(settings) {
    if (prefsMemo) return Object.assign({}, prefsMemo, prefsWaiting);
    const saved = await builder.readJson(await dataFolder(), PREFS_FILE);
    prefsMemo = saved || (settings && settings.prefs) || {};
    return Object.assign({}, prefsMemo, prefsWaiting);
  }
  function savePrefs(changes) {
    Object.assign(prefsWaiting, changes || {});
    clearTimeout(prefsTimer);
    return new Promise(resolve => {
      prefsTimer = setTimeout(async () => {
        const these = prefsWaiting;
        prefsWaiting = {};
        try {
          const folder = await dataFolder();
          const now = Object.assign((await builder.readJson(folder, PREFS_FILE)) || prefsMemo || {}, these);
          await builder.writeFile(folder, PREFS_FILE, JSON.stringify(now), 'application/json');
          prefsMemo = now;
        } catch (e) {
          prefsWaiting = Object.assign(these, prefsWaiting);
          console.warn('Preferences:', e.message);
        }
        resolve(Object.assign({}, prefsMemo, prefsWaiting));
      }, 1500);
    });
  }
  const names = {};
  async function folderName(id) {
    if (!id) return '';
    if (!(id in names)) {
      try { names[id] = (await (await drive('files/' + encodeURIComponent(id) + '?fields=name')).json()).name; } catch (e) { return ''; }
    }
    return names[id];
  }

  /* ------------------------------------------------------------ DOI lookup */
  // Details for a DOI from Crossref, as BibTeX fields (as Code.gs's).
  async function lookupDoi(input) {
    const doi = String(input || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    if (!/^10\.\d{4,9}\/\S+$/.test(doi)) {
      throw new Error('That doesn\u2019t look like a DOI. A DOI starts with 10., like 10.1111/phpr.70141.');
    }
    let res;
    try {
      res = await fetch('https://api.crossref.org/works/' + doi.split('/').map(encodeURIComponent).join('/'));
    } catch (e) {
      throw new Error(navigator.onLine ? 'Crossref can\u2019t be reached just now. Try again, or fill in the details yourself.' : 'You\u2019re offline.');
    }
    if (res.status === 404) throw new Error('Crossref has no publication with that DOI.');
    if (!res.ok) throw new Error('The DOI lookup didn\u2019t work (error ' + res.status + '). Try again, or fill in the details yourself.');
    const w = (await res.json()).message;
    const types = { 'journal-article': 'article', 'book-chapter': 'incollection', 'book-section': 'incollection',
      'book-part': 'incollection', 'book': 'book', 'monograph': 'book', 'edited-book': 'book', 'reference-book': 'book',
      'proceedings-article': 'inproceedings', 'dissertation': 'phdthesis', 'report': 'techreport', 'posted-content': 'unpublished' };
    const type = types[w.type] || 'misc';
    const people = list => (list || []).map(p => p.family ? (p.given ? p.family + ', ' + p.given : p.family) : (p.name || ''))
      .filter(Boolean).join(' and ');
    const first = a => (a && a[0]) || '';
    const parts = (w['published-print'] || w['published-online'] || w.issued || w.created || {})['date-parts'];
    const f = {
      title: first(w.title) + (first(w.subtitle) ? ': ' + first(w.subtitle) : ''),
      author: people(w.author),
      year: parts && parts[0] && parts[0][0] ? String(parts[0][0]) : '',
      month: parts && parts[0] && parts[0][1] ? 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[parts[0][1] - 1] || '' : '',
      doi: w.DOI || doi,
      url: w.URL || '',
      publisher: w.publisher || '',
    };
    if (type === 'article') {
      f.journal = first(w['container-title']);
      f.volume = w.volume || '';
      f.number = w.issue || '';
      f.issn = first(w.ISSN);
    } else if (type === 'incollection' || type === 'inproceedings') {
      f.booktitle = first(w['container-title']);
      f.editor = people(w.editor);
    } else if (type === 'book') {
      if (!f.author) f.editor = people(w.editor);
      f.isbn = first(w.ISBN);
    }
    if (w.page) f.pages = String(w.page).replace(/-/g, '--');
    if (w.abstract) f.abstract = w.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/^\s*Abstract\s*/i, '').trim();
    Object.keys(f).forEach(k => { f[k] = String(f[k] || '').replace(/[{}]/g, '').trim(); if (!f[k]) delete f[k]; });
    return { type, fields: f };
  }

  /* ------------------------------------------------------------ building */
  // builder.js builds the library here when the .bib or inbox changed; one
  // build at a time. A failed build's reason is passed on once, with the
  // next status.
  const builder = window.makeLiblandeBuilder({ drive, reconcile: groups => edits.reconcileReading(groups) });
  const edits = window.makeLiblandeEdits({ drive, builder, getToken });
  let buildRun = null, buildErr = null, lastBuilt = null;
  // w: what builder.look found. True if a build is under way.
  function startBuild(w) {
    if (buildRun) return true;
    if (!w.configured || !w.needed || !navigator.onLine) return false;
    buildErr = null;
    buildRun = builder.build({ daily: true }, w)
      .then(r => {
        // Handed to the page (LIBLANDE_BUILT), which then needn't download
        // the library it was just sent to Drive.
        if (r && r.built) { lastBuilt = r; window.LIBLANDE_BUILT = { id: r.id, stamp: r.stamp, gz: r.gz }; }
      })
      .catch(e => { buildErr = (e && e.message) || String(e); console.warn('LibLande build:', buildErr); })
      .finally(() => { buildRun = null; });
    return true;
  }

  // google.script.run, as the page uses it.
  const runner = (ok, fail) => new Proxy({}, {
    get(_, k) {
      if (k === 'withSuccessHandler') return f => runner(f, fail);
      if (k === 'withFailureHandler') return f => runner(ok, f);
      if (k === 'withUserObject') return () => runner(ok, fail);
      if (typeof k !== 'string') return undefined;
      const fn = SERVER[k] || missing(k);
      return (...args) => {
        Promise.resolve().then(() => fn(...args)).then(v => ok && ok(v), e => {
          if (fail) fail(e instanceof Error ? e : new Error(String(e)));
          else console.warn('LibLande (' + k + '):', e);
        });
      };
    },
  });
  const run = runner(null, null);
  const scriptApi = { run };
  // Google's sign-in script adds google.accounts to whatever window.google
  // is; google.script stays put.
  window.google = window.google || {};
  window.google.script = scriptApi;
  window.addEventListener('load', () => {
    if (!window.google.script) window.google.script = scriptApi;
    makeClient();
  });
  // Back online with something waiting for Google: ask for the tap now.
  window.addEventListener('online', () => { if (waiters.length && !valid()) bar('Tap anywhere to reconnect to Google Drive'); });
  window.addEventListener('offline', () => bar(null));

  /* ------------------------------------------------------------ offline */
  // sw.js keeps the app, PDF.js and recently opened papers on this device,
  // so LibLande opens (and opens those papers) with no connection. Storage
  // marked persistent isn't cleared by Safari to make room.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Offline support didn\u2019t start:', e));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  document.addEventListener('DOMContentLoaded', () => {
    const gis = document.getElementById('gis');
    if (gis) gis.addEventListener('load', makeClient);
  });
})();
