/*
 * LibLande on GitHub Pages: a stand-in for Apps Script.
 *
 * The page (index.html, the same file Apps Script serves) talks to its
 * server through google.script.run. Here that's answered in the browser:
 * Google sign-in gives a Drive token, and the reading side of Code.gs
 * (status, library download, tokens, PDF backups, thumbnails) is done with
 * the Drive API directly. Apps Script keeps building the library in the
 * background (every 10 minutes), into the same LibLande folder in Drive.
 *
 * Everything else (adding and editing entries, the reading list, groups,
 * exports, settings, refreshing) is passed to the Apps Script project
 * itself, through Google's Apps Script API (scripts.run), with the same
 * sign-in: the same code, and the same lock on the .bib, as the Apps
 * Script version. (build.py fills in DEPLOYMENT, the deployment's ID.)
 */
(() => {
  'use strict';
  window.LIBLANDE_PAGES = true;
  const CLIENT_ID = '789682218462-98mjugngb46ttd01ucp9dcj71ufspjgn.apps.googleusercontent.com';
  // Drive, plus what Apps Script's own code needs to run for you (fetching
  // from the web, and the background-build triggers).
  const SCOPE = ['drive', 'script.external_request', 'script.scriptapp'].map(s => 'https://www.googleapis.com/auth/' + s).join(' ');
  const DEPLOYMENT = 'AKfycbxRSWbVU93pvk7_8uTUVqKc6OyxqzqNo2AUUDpSbKCcymCn23msaQwsljZCBLXC0xE6';
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
  // (One from before Apps Script was asked too lacks its permissions.)
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
  async function drive(path, opts = {}, base = API) {
    const go = async t => {
      try {
        return await fetch(base + path, Object.assign({}, opts, { headers: Object.assign({}, opts.headers, { Authorization: 'Bearer ' + t }) }));
      } catch (e) {
        throw new Error(navigator.onLine ? 'Google Drive can\u2019t be reached just now.' : 'You\u2019re offline.');
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
    // Apps Script's own answer (it knows about builds under way, and keeps
    // your settings); if it can't be had, what Drive says.
    async getStatus() {
      if (navigator.onLine) {
        try { return await apps('getStatus', []); } catch (e) { console.warn('Apps Script\u2019s status:', e.message); }
      }
      return SERVER.driveStatus();
    },
    async driveStatus() {
      const folder = await dataFolder();
      if (!folder) {
        return { configured: false, problem: 'LibLande’s folder (with the library Apps Script builds) isn’t in your Google Drive. Open LibLande on Apps Script first.' };
      }
      const [lib, pending, reading] = await Promise.all([fileIn(folder, LIBRARY_FILE), readJson(folder, PENDING_FILE), readJson(folder, READING_FILE)]);
      const r = reading || {};
      return {
        configured: true,
        stamp: lib ? Date.parse(lib.modifiedTime) : null,
        libraryId: lib ? lib.id : null,
        token: await getToken(),
        building: false,
        error: null,
        pending: pending && Array.isArray(pending.edits) ? pending.edits : [],
        reading: { items: r.items || [], done: r.done || [], seeded: !!r.seeded, syncedKeys: r.syncedKeys || null },
        direct: false,
        prefs: {},
      };
    },
    // Apps Script looks at the .bib now and rebuilds; if it can't be
    // asked, only what it built last is looked for.
    async refreshNow() {
      try { return await apps('refreshNow', []); } catch (e) { return SERVER.driveStatus(); }
    },
    async getLibraryInfo() {
      const folder = await dataFolder();
      const lib = folder && await fileIn(folder, LIBRARY_FILE);
      if (!lib) throw new Error('The library hasn’t been built yet. Open LibLande on Apps Script to build it.');
      return { id: lib.id, stamp: Date.parse(lib.modifiedTime), token: await getToken() };
    },
    getToken() { return getToken(); },
    async getLibrary() {
      const info = await SERVER.getLibraryInfo();
      const bytes = new Uint8Array(await (await drive('files/' + encodeURIComponent(info.id) + '?alt=media')).arrayBuffer());
      return { stamp: info.stamp, library: bytesToB64(bytes) };
    },
    // With your account, as on Apps Script (and on this device meanwhile).
    savePrefs(changes) { return apps('savePrefs', [changes]).catch(() => ({})); },
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
  // The rest: Apps Script's own function, run for you. Until a call has
  // worked, the page leaves the reading list alone at start
  // (LIBLANDE_NO_EDITS), in case Apps Script can't be reached this way.
  window.LIBLANDE_NO_EDITS = true;
  async function apps(name, args) {
    const go = async t => {
      try {
        return await fetch('https://script.googleapis.com/v1/scripts/' + DEPLOYMENT + ':run', { method: 'POST',
          headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
          body: JSON.stringify({ function: name, parameters: args.map(a => (a === undefined ? null : a)), devMode: false }) });
      } catch (e) {
        throw new Error(navigator.onLine ? 'Apps Script can\u2019t be reached just now.' : 'You\u2019re offline.');
      }
    };
    let r = await go(await getToken());
    if (r.status === 401) r = await go(await getToken(true));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.error && j.error.message) || ('error ' + r.status);
      throw new Error('LibLande on GitHub Pages couldn\u2019t ask Apps Script to do this (' + msg + ').');
    }
    // An error in Apps Script's code: its own message, as on Apps Script.
    if (j.error) {
      const d = (j.error.details || [])[0];
      throw new Error((d && d.errorMessage) || j.error.message || 'Apps Script hit an error.');
    }
    window.LIBLANDE_NO_EDITS = false;
    return j.response ? j.response.result : undefined;
  }
  const viaApps = name => (...args) => apps(name, args);

  // google.script.run, as the page uses it.
  const runner = (ok, fail) => new Proxy({}, {
    get(_, k) {
      if (k === 'withSuccessHandler') return f => runner(f, fail);
      if (k === 'withFailureHandler') return f => runner(ok, f);
      if (k === 'withUserObject') return () => runner(ok, fail);
      if (typeof k !== 'string') return undefined;
      const fn = SERVER[k] || viaApps(k);
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
