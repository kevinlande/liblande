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
 * entries, groups and the reading list change the .bib here
 * (edits.js), with the same checks and backups as Code.gs had.
 */
(() => {
  'use strict';
  window.LIBLANDE_PAGES = true;
  // (Which version each part of the app is from: index.html checks they
  // match. build.py fills it in.)
  (window.LIBLANDE_PARTS = window.LIBLANDE_PARTS || {}).server = '2026-11-14.02';
  const CLIENT_ID = '789682218462-98mjugngb46ttd01ucp9dcj71ufspjgn.apps.googleusercontent.com';
  // Google Drive, in one of two ways (docs/drive-file-plan.md):
  // full: all of Drive (your .bib, papers and LibLande folder wherever
  //   they are); Google warns that LibLande isn't verified.
  // limited: only files LibLande made and files picked in Google's picker;
  //   no warning.
  const SCOPES = { full: 'https://www.googleapis.com/auth/drive', limited: 'https://www.googleapis.com/auth/drive.file' };
  // Google's picker: the project's key (build.py fills it in from
  // pages/picker-key.txt) and number.
  const PICKER_KEY = 'AIzaSyCJ4i0w4SpEo6DS9Y9OjMUWgPYzeUIIg7g', APP_ID = CLIENT_ID.split('-')[0];
  const API = 'https://www.googleapis.com/drive/v3/';
  const FOLDER = 'application/vnd.google-apps.folder';
  // As in Code.gs.
  const DATA_FOLDER = 'LibLande', LIBRARY_FILE = 'library.json.gz',
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
  // Which access this device uses. (A device signed in before there was a
  // choice has full access; one never signed in asks, at sign-in.)
  let access = store.get('access', null);
  // (Its token may have gone; a remembered email says it signed in.)
  if (!access && ((token && token.scope === SCOPES.full) || store.get('email', ''))) { access = 'full'; store.set('access', access); }
  const scope = () => SCOPES[access || 'full'];
  // (One asked for with other permissions is asked for again.)
  if (token && token.scope !== scope()) token = null;
  let email = store.get('email', '');
  let client = null, asking = false, waiters = [];
  const age = () => (token ? Date.now() - token.at : Infinity);
  const valid = () => !!token && age() < token.expiresIn * 1000 - 60 * 1000;

  function makeClient() {
    if (client || !window.google || !google.accounts || !google.accounts.oauth2) return;
    client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: scope(),
      // (Limited: not the full access this account may have given LibLande
      // before, only the limited one.)
      include_granted_scopes: access !== 'limited',
      callback: resp => {
        asking = false;
        if (resp.error) { bar('Google didn’t sign you in (' + resp.error + '). Tap to try again.'); return; }
        token = { value: resp.access_token, at: Date.now(), expiresIn: +resp.expires_in || 3600, scope: scope() };
        store.set('token', token);
        bar(null);
        const w = waiters; waiters = [];
        w.forEach(f => f(token.value));
        if (!email) whoAmI();
      },
      error_callback: err => {
        asking = false;
        bar(!navigator.onLine ? OFFLINE_BAR : (err && err.type === 'popup_closed' ? 'Sign-in was closed' : 'Sign-in didn’t finish') + '. Tap to try again.');
      },
    });
  }
  // (Offline, Google's window can't open: it would only show Safari's
  // "not connected" page. Back online, a tap asks again.)
  const OFFLINE_BAR = 'You\u2019re offline. LibLande will reconnect to Google Drive when you\u2019re back online.';
  function ask() {
    if (!navigator.onLine) { bar(OFFLINE_BAR); return; }
    // (Never signed in on this device: full or limited access first.)
    if (!access) { chooser(); return; }
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
      if (!access) chooser();
      else bar(email ? 'Tap anywhere to reconnect to Google Drive' : 'Sign in with Google to open your library');
    });
  }
  // A tap renews a token that's missing, old or run out. (Not taps on a
  // page of a paper, where Google's window would interrupt a stroke; the
  // bar, or a tap anywhere else, does it then.)
  function onTap(ev) {
    if (asking || !navigator.onLine || !access) return;
    const onPage = ev.target && ev.target.closest && ev.target.closest('#vPages, #vPeekPages');
    if (waiters.length || (!onPage && token && age() > RENEW_AFTER)) ask();
  }
  document.addEventListener('click', onTap, true);
  document.addEventListener('keydown', onTap, true);
  // Gone offline while waiting to sign in: what's waiting goes ahead with
  // the old token (and finds itself offline, so what's kept on this device
  // answers), and the bar says why. Back online: asked for again if needed.
  window.addEventListener('offline', () => {
    const old = token || store.get('token', null);
    if (waiters.length && old) { const w = waiters; waiters = []; w.forEach(f => f(old.value)); }
    if (barEl && !barEl.hidden) bar(waiters.length ? OFFLINE_BAR : null);
  });
  window.addEventListener('online', () => {
    if (waiters.length && !valid()) bar(email ? 'Tap anywhere to reconnect to Google Drive' : 'Sign in with Google to open your library');
    else if (barEl && !barEl.hidden && barEl.textContent === OFFLINE_BAR) bar(!valid() ? (email ? 'Tap anywhere to reconnect to Google Drive' : 'Sign in with Google to open your library') : null);
  });

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

  // The first sign-in on a device: full or limited access. A card in the
  // middle of the screen; choosing signs in (the tap opens Google's
  // window).
  let chooserEl = null;
  function chooser() {
    if (chooserEl) { chooserEl.hidden = false; return; }
    bar(null);
    const dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    const ink = dark ? '#e2e8e5' : '#1b2321', muted = dark ? '#a9b5b1' : '#5d6a66', card = dark ? '#262b2a' : '#fff', line = dark ? '#3a4341' : '#d8dfdc';
    chooserEl = document.createElement('div');
    chooserEl.id = 'pagesAccess';
    chooserEl.setAttribute('role', 'dialog');
    chooserEl.setAttribute('aria-label', 'Sign in with Google');
    chooserEl.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.18);font:15px/1.4 -apple-system,BlinkMacSystemFont,sans-serif';
    const opt = (key, title, sub, best, primary) => '<button type="button" data-access="' + key + '" style="display:grid;gap:2px;width:100%;text-align:left;padding:12px 14px;border-radius:12px;cursor:pointer;font:inherit;' +
      (primary ? 'background:#1f6b5c;color:#fff;border:1px solid #1f6b5c' : 'background:' + card + ';color:' + ink + ';border:1px solid ' + line) + '">' +
      '<b style="font-size:15px">' + title + '</b><span style="font-size:13px;opacity:.85">' + sub + '</span><span style="font-size:13px;opacity:.85">' + best + '</span></button>';
    chooserEl.innerHTML = '<div style="width:min(380px,100%);display:grid;gap:10px;padding:20px;border-radius:16px;background:' + card + ';color:' + ink + ';box-shadow:0 12px 40px rgba(0,0,0,.25)">' +
      '<b style="font-size:18px">Sign in with Google</b>' +
      '<span style="color:' + muted + ';font-size:13.5px">How much of your Google Drive LibLande can reach.</span>' +
      opt('limited', 'Limited access', 'Only the files you give LibLande: your .bib and its PDFs, chosen once.', '(Best for a new, Zotero or small library.)', true) +
      opt('full', 'Full access', 'All of your Google Drive: LibLande finds your PDFs itself. Google warns that LibLande isn\u2019t verified.', '(Best for a large library you also edit in other apps.)', false) +
      '<a href="privacy.html#access" target="_blank" rel="noopener" style="justify-self:start;color:' + muted + ';font-size:13px">What each allows</a>' +
      '</div>';
    chooserEl.addEventListener('click', ev => {
      const b = ev.target.closest('[data-access]');
      if (!b) return;
      chooserEl.hidden = true;
      setAccess(b.dataset.access);
      ask();
    });
    (document.body || document.documentElement).appendChild(chooserEl);
  }
  // Full or limited access from now on, on this device: signed in again
  // with that, on the next tap.
  function setAccess(mode) {
    if (!SCOPES[mode]) return;
    const changed = mode !== access;
    access = mode;
    store.set('access', mode);
    if (changed) { token = null; store.set('token', null); client = null; }
  }

  /* ------------------------------------------------------------ Google's picker */
  // Picking files or folders in Google's own picker: with limited access,
  // how LibLande is given them. what: 'bib' (one .bib), 'pdfs' (several
  // PDFs), 'folders' (several folders), 'folder' (one), 'files' (several
  // of any kind), 'all' (files and folders). parent: a folder to start in. query: a search to start
  // with. Answers [{id, name, mimeType}], or [] if cancelled.
  let pickerReady = null;
  function loadPicker() {
    return pickerReady || (pickerReady = new Promise((ok, no) => {
      const done = () => window.gapi.load('picker', { callback: ok, onerror: () => no(new Error('Google\u2019s picker didn\u2019t load.')) });
      if (window.gapi && window.gapi.load) { done(); return; }
      const s = document.createElement('script');
      s.src = 'https://apis.google.com/js/api.js';
      s.onload = done;
      s.onerror = () => no(new Error('Google\u2019s picker didn\u2019t load. Are you online?'));
      document.head.appendChild(s);
    }).catch(e => { pickerReady = null; throw e; }));
  }
  async function pick(opts = {}) {
    if (!PICKER_KEY || PICKER_KEY.indexOf('__') === 0) throw new Error('Google\u2019s picker isn\u2019t set up in this copy of LibLande.');
    const what = opts.what || 'files';
    const [t] = await Promise.all([getToken(), loadPicker()]);
    const P = window.google.picker;
    const folders = what === 'folders' || what === 'folder', all = what === 'all';
    // (One .bib or one folder: My Drive's folders, to go down through, not
    // every file at once; unless it starts with a search.)
    const browse = (what === 'bib' || what === 'folder') && !opts.query;
    const view = new P.DocsView(folders ? P.ViewId.FOLDERS : P.ViewId.DOCS)
      .setMode(P.DocsViewMode.LIST)
      .setIncludeFolders(folders || all || browse || !!opts.parent)
      .setSelectFolderEnabled(folders || all);
    if (folders) view.setMimeTypes(FOLDER);
    else if (what === 'pdfs') view.setMimeTypes('application/pdf');
    if (opts.parent || browse) view.setParent(opts.parent || 'root');
    if (opts.query) view.setQuery(opts.query);
    const pb = new P.PickerBuilder()
      .addView(view)
      .setOAuthToken(t)
      .setDeveloperKey(PICKER_KEY)
      .setAppId(APP_ID)
      .setTitle(opts.title || (what === 'bib' ? 'Choose your .bib file' : folders ? 'Choose folders' : what === 'pdfs' ? 'Choose PDFs' : 'Choose files'));
    if (what !== 'bib' && what !== 'folder') pb.enableFeature(P.Feature.MULTISELECT_ENABLED).setMaxItems(5000);
    return new Promise(ok => {
      pb.setCallback(d => {
        if (d.action === P.Action.PICKED) ok((d.docs || []).map(x => ({ id: x.id, name: x.name, mimeType: x.mimeType, parentId: x.parentId || '' })));
        else if (d.action === P.Action.CANCEL) ok([]);
      });
      pb.build().setVisible(true);
    });
  }
  // Files just picked can take a moment to be LibLande's: each one not
  // found is tried again, for up to half a minute. Answers {ok, missing}
  // (ids).
  async function settle(ids) {
    const ok = [], waits = [0, 2000, 4000, 8000, 16000];
    let left = ids.slice();
    for (const w of waits) {
      if (!left.length) break;
      if (w) await new Promise(r => setTimeout(r, w));
      const still = [];
      const queue = left.slice();
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (queue.length) {
          const id = queue.shift();
          try { await drive('files/' + encodeURIComponent(id) + '?fields=id&supportsAllDrives=true'); ok.push(id); }
          catch (e) { still.push(id); }
        }
      }));
      left = still;
    }
    return { ok, missing: left };
  }

  /* ------------------------------------------------------------ Drive */
  // (A request with no answer is given up after a while: on an iPad, one
  // under way when LibLande goes to the background can be left with none,
  // ever, and changes to the .bib wait their turn behind it.)
  const STALL = 45 * 1000, STALL_SENDING = 5 * 60 * 1000, STALL_READING = 5 * 60 * 1000;
  const DRIVE_WAITS = [500, 2000, 5000];
  async function passing(r) {
    if (r.status === 429 || r.status >= 500) return true;
    if (r.status !== 403) return false;
    try { return /rateLimitExceeded|userRateLimitExceeded/.test(JSON.stringify((await r.clone().json()).error)); } catch (e) { return false; }
  }
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
    // (Drive's passing troubles, 429, a 5xx, or a 403 for asking too fast:
    // a request that changes nothing is asked again, up to three times,
    // after a moment. One that changes something isn't, as whether it was
    // made can't be told.)
    const again = !opts.method || opts.method === 'GET';
    let r;
    for (let tries = 0; ; tries++) {
      r = await go(await getToken());
      if (r.status === 401) r = await go(await getToken(true));
      if (r.ok || !again || tries >= 3 || !(await passing(r))) break;
      await new Promise(done => setTimeout(done, DRIVE_WAITS[tries]));
    }
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).error.message; } catch (e) { /* none */ }
      const err = new Error('Google Drive answered ' + r.status + (msg ? ': ' + msg : ''));
      err.status = r.status;
      throw err;
    }
    return r;
  }
  // The files' storage (Google Drive now): the builder's, made below.
  // Files are reached only through it; drive() is for sign-in, the picker
  // and what's Drive's alone.
  const storage = () => builder.storage;
  const textOf = async id => new TextDecoder().decode(await storage().bytes(id));
  const fileIn = (folderId, name) => storage().named(folderId, name, 'id,name,modifiedTime,createdTime,size,mimeType');
  async function subFolder(parentId, name, create) {
    const f = await storage().named(parentId, name, 'id,name', true);
    if (f || !create) return f || null;
    return storage().mkdir(parentId, name);
  }
  async function readJson(folderId, name) {
    const f = await fileIn(folderId, name);
    if (!f) return null;
    // (As builder.readJson: a file that can't be read throws.)
    const raw = await textOf(f.id);
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  // LibLande's folder in My Drive: as the builder finds it (the same one
  // for preferences and PDF backups here as for .bib backups and the
  // inbox there).
  const dataFolder = () => builder.dataFolder();
  const day = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* ------------------------------------------------------------ the server */
  const SERVER = {
    // What the page needs to know, from Drive (as Code.gs's getStatus):
    // the settings, the library, the reading list and your
    // preferences. Meanwhile, a look at whether the library needs
    // building, which then starts here.
    async getStatus() {
      // (Asked again while a build is under way, as the page does every
      // few seconds: answered as soon as it's done.)
      const running = buildRun;
      // (Changes kept from a time offline go to Drive first.)
      if (freshOutbox().length && navigator.onLine) { try { await flushOutbox(); } catch (e) { /* tried */ } }
      const w = await builder.look({ daily: true });
      if (!w.configured) return { configured: false };
      const started = startBuild(w);
      // (The reading list as last known if it can't be read just now:
      // never an empty list in its place.)
      // (Said in the status, with when they were last read, so the page
      // can say it's showing an older copy.)
      let stale = false;
      const known = value => err => { console.warn(err); stale = true; return value(); };
      const [reading, prefs, papersName, token] = await Promise.all([
        builder.readJson(w.folder, READING_FILE).catch(known(() => offlineLists.known.reading)), loadPrefs(w.s),
        folderName(w.s.papersId || (w.bib.parents && w.bib.parents[0])), getToken()]);
      if (running) await Promise.race([running, new Promise(r => setTimeout(r, 60 * 1000))]);
      const r = reading || {};
      const st = {
        configured: true,
        bibName: w.bib.name,
        papersName,
        bibId: w.s.bibId, papersId: w.s.papersId || '',
        libraries: (w.s.libraries || []).filter(l => l.bibId !== w.s.bibId),
        allLibraries: w.s.libraries || [],
        stamp: w.lib ? Date.parse(w.lib.modifiedTime) : null,
        libraryId: w.lib ? w.lib.id : null,
        token,
        building: (started && !running) || !!buildRun,
        error: null,
        reading: { items: r.items || [], done: r.done || [], seeded: !!r.seeded, syncedKeys: r.syncedKeys || null },
        direct: true,
        prefs,
      };
      if (buildErr) { st.error = buildErr; buildErr = null; }
      // (The reading list says when it's from, if it's an older copy.)
      if (stale) st.reading = Object.assign({}, st.reading, { staleAt: offlineLists.at || 0 });
      else offlineLists.update(st);
      // The library just built here.
      if (lastBuilt && !(st.stamp > lastBuilt.stamp)) { st.stamp = lastBuilt.stamp; st.libraryId = lastBuilt.id; }
      return st;
    },
    // Refresh: a look at the .bib and the inbox, and a build here if
    // either changed (the page waits for it, asking getStatus).
    // (Your preferences read again, as another device may have changed
    // them.)
    refreshNow() { prefsMemo = null; return SERVER.getStatus(); },
    // Full or limited access to Google Drive, on this device (see above).
    getAccess() { return { access: access || 'full', email }; },
    setAccess(mode) { setAccess(mode); return { access }; },
    // Google's picker, then waiting for what was picked to be LibLande's.
    async pickFiles(opts) {
      const docs = await pick(opts);
      if (!docs.length || opts.settle === false) return { docs, missing: [] };
      const s = await settle(docs.map(d => d.id));
      return { docs: docs.filter(d => s.ok.includes(d.id)), missing: docs.filter(d => s.missing.includes(d.id)) };
    },
    // With limited access: PDFs given to LibLande in Google's picker, then
    // the papers folder listed again (a build) so they're linked. The page
    // waits for the build, as for any other.
    // opts.folders: folders the .bib names that LibLande can't see (from
    // the build), asked for first.
    async addPapers(opts) {
      const want = (opts && opts.folders) || [];
      let folders = [];
      if (want.length) {
        const s = await builder.settings();
        const names = want.map(p => String(p).split('/').pop());
        folders = await pick({ what: 'folders', parent: (s && s.papersId) || undefined,
          title: 'Select ' + (names.length === 1 ? 'the folder ' + names[0] : 'the new folders (' + names.slice(0, 3).join(', ') + (names.length > 3 ? ', \u2026' : '') + ')') + ', then Select' });
      }
      const docs = await pick({ what: 'pdfs', title: 'Select your PDFs, then Select' });
      if (!docs.length && !folders.length) return { added: 0, folders: 0 };
      // (A moment for Google to pass them on; one not passed on yet is
      // found at the next listing.)
      await new Promise(r => setTimeout(r, 3000));
      if (buildRun) await buildRun;
      startBuild(await builder.look({ force: true }), { force: true });
      return { added: docs.length, folders: folders.length };
    },
    // Limited access: the LibLande folder used before (settings, reading
    // list, preferences, backups) given to LibLande and used from now on.
    // The folder, then everything in it, then what's in its Inbox. Answers
    // {adopted}; the page then reloads.
    async adoptDataFolder() {
      // (The ones LibLande sees already are those it made itself.)
      const mine = new Set((await storage().children(storage().root, { name: DATA_FOLDER, folders: true, fields: 'id' })).map(f => f.id));
      const [folder] = await pick({ what: 'folder', query: DATA_FOLDER, title: 'Select your earlier LibLande folder (My Drive \u203a LibLande, with Backups, Inbox and Exports in it), then Select' });
      if (!folder) return { adopted: false };
      if (folder.name !== DATA_FOLDER) throw new Error('That folder is \u201c' + folder.name + '\u201d. Choose the one named LibLande, in My Drive.');
      if (mine.has(folder.id)) throw new Error('That\u2019s the LibLande folder made with limited access. Choose the other one named LibLande, the earlier one.');
      const inside = await pick({ what: 'all', parent: folder.id, title: 'Select everything in it (\u2318A), then Select' });
      if (!inside.length) return { adopted: false };
      const inbox = inside.find(f => f.name === 'Inbox' && f.mimeType === FOLDER);
      const more = inbox ? await pick({ what: 'all', parent: inbox.id, title: 'And everything in Inbox (\u2318A), then Select' }) : [];
      await settle([folder.id].concat(inside.map(f => f.id), more.map(f => f.id)));
      const r = await builder.adoptDataFolder(folder.id);
      if (!r.ok) throw new Error('LibLande can\u2019t see the library or settings in that folder. Choose it again, and select everything in it (\u2318A).');
      return { adopted: true, renamed: r.renamed };
    },
    async getPrefs() { prefsMemo = null; return loadPrefs(null); },
    // New settings, from the files picked (or links pasted) in Settings (as Code.gs's
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
      if (!/\.bib$/i.test(bib.name)) throw new Error('\u201c' + bib.name + '\u201d isn\u2019t a .bib file. Choose your BibTeX library.');
      let papersId = '';
      if (papersLink && String(papersLink).trim()) {
        papersId = idFromLink(papersLink);
        let ok = false;
        try { ok = !!papersId && (await builder.meta(papersId, 'mimeType')).mimeType === FOLDER; } catch (e) { ok = false; }
        if (!ok) throw new Error('LibLande couldn\u2019t open that papers folder. Choose a folder, or leave it out.');
      } else if (!(bib.parents && bib.parents[0])) {
        throw new Error('LibLande can\u2019t see the folder that holds this .bib file. Choose your papers folder too.');
      }
      await edits.useLibrary({ bibId, papersId });
      lastBuilt = null; window.LIBLANDE_BUILT = null;
      return SERVER.getStatus();
    },
    // A new, empty library (a folder in My Drive with a .bib in it), used
    // from now on; or one used before, back again (edits.js).
    async createLibrary(name) {
      const made = await edits.createLibrary({ name });
      lastBuilt = null; window.LIBLANDE_BUILT = null;
      return Object.assign(await SERVER.getStatus(), { created: made });
    },
    // A new library from a Zotero export (or another .bib): its PDFs
    // uploaded and filed, its entries linked to them (edits.js).
    async importLibrary(req) {
      const made = await edits.importLibrary(req);
      lastBuilt = null; window.LIBLANDE_BUILT = null;
      return Object.assign(await SERVER.getStatus(), { imported: made });
    },
    copyToLibrary(req) { return edits.copyToLibrary(req); },
    // Sign out of this device: changes kept here for Drive go first (or
    // it stops, saying so); then Google's permission is given back and
    // what this file keeps on the device (sign-in, access, kept lists) is
    // forgotten. The page clears its own part, then reloads.
    async signOut() {
      if (freshOutbox().length) {
        await flushOutbox().catch(() => {});
        if (freshOutbox().length) throw new Error('Changes you made offline haven\u2019t reached Google Drive yet. Connect to the internet, let them save, then sign out.');
      }
      const t = token || store.get('token', null);
      if (t && t.value && window.google && google.accounts && google.accounts.oauth2) {
        try { google.accounts.oauth2.revoke(t.value, () => {}); } catch (e) { /* forgotten here anyway */ }
      }
      try {
        Object.keys(localStorage).filter(k => k.indexOf('liblande.pages.') === 0).forEach(k => localStorage.removeItem(k));
      } catch (e) { /* private mode */ }
      token = null; client = null; access = null; email = '';
      return { ok: true };
    },
    async forgetLibrary(bibId) { await edits.forgetLibrary({ bibId }); return SERVER.getStatus(); },
    async switchLibrary(bibId, papersId) {
      try { await edits.useLibrary({ bibId, papersId }); } catch (e) {
        // (Limited access: a library whose .bib LibLande wasn't given.)
        if (access === 'limited' && (e.status === 404 || e.status === 403)) throw new Error('LibLande hasn\u2019t been given that library\u2019s .bib. Add it with Add an existing library, in Settings \u203a Library.');
        throw e;
      }
      lastBuilt = null; window.LIBLANDE_BUILT = null;
      return SERVER.getStatus();
    },
    // Changing the .bib, the inbox and the reading list:
    // edits.js, here.
    // (These four are kept on this device while offline: see below.)
    saveEntry: later('saveEntry', () => ({ queued: true })),
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
      const folder = await storage().mkdir(exportsFolder.id, name);
      // (Left out when not wanted: null.)
      if (req.bib != null) await builder.writeFile(folder.id, 'references.bib', req.bib, 'text/plain');
      if (req.rtf != null) await builder.writeFile(folder.id, 'references.rtf', req.rtf, 'application/rtf');
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
    // The library, when the page's own download of it failed: through the
    // storage here (drive(), which waits and asks again). (Handed over as
    // it is: Apps Script had to send it as base64 text.)
    async getLibrary() {
      const info = await SERVER.getLibraryInfo();
      const gz = new Uint8Array(await storage().bytes(info.id));
      return { stamp: info.stamp, gz };
    },
    // Your preferences (theme, tools, recently viewed...), in
    // LibLande/prefs.json, so they follow you across devices.
    savePrefs(changes) { return savePrefs(changes); },
    // As in Code.gs: before the first save of the day to a PDF, a copy goes
    // to LibLande/Backups/PDFs; copies older than 60 days are removed.
    async backupPdf(fileId) {
      const backups = await subFolder(await dataFolder(), BACKUP_FOLDER, true);
      const folder = await subFolder(backups.id, 'PDFs', true);
      const file = await storage().meta(fileId, 'name,size');
      const name = day() + ' ' + file.name.replace(/[.]pdf$/i, '') + ' (' + fileId.slice(-6) + ').pdf';
      if (!(await fileIn(folder.id, name))) {
        const copy = await storage().copy(fileId, folder.id, name, 'id,size');
        if (!copy || copy.size !== file.size) throw new Error('LibLande couldn’t make a backup copy of the PDF, so it didn’t save your markup.');
      }
      if (store.get('pdfBackupsPruned', '') !== day()) {
        const cutoff = new Date(Date.now() - PDF_BACKUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const old = await storage().children(folder.id, { createdBefore: cutoff, fields: 'id' });
        for (const f of old) await storage().trash(f.id);
        store.set('pdfBackupsPruned', day());
      }
      return true;
    },
    async getThumbnails(ids) {
      const out = {};
      await Promise.all((ids || []).slice(0, 8).map(async id => {
        out[id] = null;
        try {
          const meta = await storage().meta(id, 'thumbnailLink');
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
  // Changes made with no connection (to entries and the
  // reading list) wait here, on this device, in the order made; when it's
  // back, they're made in Drive in that order (flushOutbox). Meanwhile the
  // page shows them (index.html's overlayOffline reads
  // window.liblandeOutbox), and asks with the answers given here: what the
  // reading list comes to with them.
  // (Kept in this browser's storage, shared by every LibLande tab, and
  // read from it afresh before each use: two tabs open don't each keep a
  // copy of their own and write over the other's.)
  let outbox = store.get('outbox', []);
  const freshOutbox = () => (outbox = store.get('outbox', []));
  window.addEventListener('storage', ev => {
    if (ev.key !== 'liblande.pages.outbox') return;
    freshOutbox();
    window.dispatchEvent(new CustomEvent('liblande-waiting', { detail: { waiting: outbox.length } }));
  });
  window.liblandeOutbox = () => freshOutbox().slice();
  const isOffline = e => !navigator.onLine || !!(e && e.offline);
  function keepForLater(name, args) {
    freshOutbox().push({ name, args, at: Date.now(), id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) });
    store.set('outbox', outbox);
    window.dispatchEvent(new CustomEvent('liblande-waiting', { detail: { waiting: outbox.length } }));
  }
  // (Made in Drive first: anything kept from before, so the order holds.)
  function later(name, offline) {
    return async (...args) => {
      if (navigator.onLine && freshOutbox().length) { try { await flushOutbox(); } catch (e) { /* tried */ } }
      // (The answer first: a change that can't be kept offline says so,
      // and isn't kept.)
      const keep = () => { const res = offline(...args); keepForLater(name, args); return res; };
      if (!navigator.onLine || freshOutbox().length) return keep();
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
  // The reading list as last known (from the status, or an answer), with
  // the changes kept here made to it.
  const offlineLists = {
    known: store.get('lists', { reading: { items: [], done: [], seeded: false, syncedKeys: null } }),
    // (When they were last read from Drive.)
    at: store.get('listsAt', null),
    update(res) {
      if (!res) return;
      if (res.reading) this.known.reading = res.reading;
      store.set('lists', this.known);
      this.at = Date.now();
      store.set('listsAt', this.at);
    },
    renameKey(from, to) {
      const swap = k => (k === from ? to : k), d = this.known.reading;
      (d.items || []).forEach(x => { x.key = swap(x.key); });
      (d.done || []).forEach(x => { x.key = swap(x.key); });
      if (d.syncedKeys) d.syncedKeys = d.syncedKeys.map(swap);
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
  // The lists as last known, for the page to show before Drive answers
  // (or when it can't): an older copy, with when it's from.
  window.liblandeKnownLists = () => JSON.parse(JSON.stringify({ reading: offlineLists.known.reading, at: offlineLists.at }));
  // Back online: the kept changes made in Drive, in order. Two edits to the
  // same publication were both checked against how it was before either;
  // the second is checked against what the first made it. One that can't
  // be made (the publication was changed elsewhere meanwhile, say) is left
  // out, with why. The page hears how it went (the event liblande-outbox).
  // (One tab at a time, with the browser's lock where it has one, so two
  // tabs don't both make the same change.)
  let flushing = null;
  function flushOutbox() {
    if (flushing) return flushing;
    if (!freshOutbox().length || !navigator.onLine) return Promise.resolve();
    const work = async () => {
      let saved = 0;
      const failed = [], hashes = {};
      while (freshOutbox().length) {
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
        // (Taken off as itself: the list as it is now, which another tab
        // may have added to meanwhile.)
        const same = x => (item.id ? x.id === item.id : x.at === item.at && x.name === item.name);
        store.set('outbox', freshOutbox().filter(x => !same(x)));
        outbox = store.get('outbox', []);
      }
      if (saved || failed.length) window.dispatchEvent(new CustomEvent('liblande-outbox', { detail: { saved, failed, waiting: outbox.length } }));
    };
    const locked = navigator.locks && navigator.locks.request ? navigator.locks.request('liblande-outbox', work) : work();
    flushing = Promise.resolve(locked).finally(() => { flushing = null; });
    return flushing;
  }
  window.addEventListener('online', () => setTimeout(() => { flushOutbox().catch(() => {}); }, 1500));
  // (Safari often doesn't say it's back online, as when LibLande comes
  // back to the screen with a connection already: so also then, and every
  // half minute while changes wait, with the page on screen.)
  const flushSoon = () => { if (freshOutbox().length && navigator.onLine && !document.hidden) flushOutbox().catch(() => {}); };
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
    // (Not readable just now: none this time, and asked again next time,
    // rather than the old ones in settings.json taken for them.)
    let saved;
    try { saved = await readPrefs(); } catch (e) { console.warn('Preferences:', e.message); return Object.assign({}, prefsWaiting); }
    prefsMemo = saved || (settings && settings.prefs) || {};
    return Object.assign({}, prefsMemo, prefsWaiting);
  }
  // (Kept paper by paper when saved: see savePrefs. The numbers are how
  // many papers are kept, as the page keeps.)
  const BY_PAPER = { positions: 150, progress: 300 };
  // prefs.json read and written by its ID once known (2 requests, not 5).
  let prefsId = null;
  async function readPrefs() {
    if (prefsId) {
      try { return JSON.parse(await textOf(prefsId)); } catch (e) {
        if (e.offline) throw e;
        prefsId = null;
      }
    }
    const folder = await dataFolder();
    const f = folder && await builder.named(folder, PREFS_FILE, 'id');
    if (!f) return null;
    prefsId = f.id;
    return builder.readJson(folder, PREFS_FILE);
  }
  async function writePrefs(value) {
    if (prefsId) {
      try {
        await storage().replace(prefsId, JSON.stringify(value), 'application/json', 'id');
        return;
      } catch (e) { if (e.offline) throw e; prefsId = null; }
    }
    const made = await builder.writeFile(await dataFolder(), PREFS_FILE, JSON.stringify(value), 'application/json');
    prefsId = made && made.id;
  }
  // Changes gathered for a moment and saved as one: every caller in the
  // batch hears when it's done.
  let prefsBatch = null;
  function savePrefs(changes) {
    Object.assign(prefsWaiting, changes || {});
    clearTimeout(prefsTimer);
    if (!prefsBatch) { let done; prefsBatch = { promise: new Promise(r => { done = r; }) }; prefsBatch.done = done; }
    const batch = prefsBatch;
    const resolve = v => batch.done(v);
    prefsTimer = setTimeout(async () => {
      // (Changes asked for from now on are the next batch's, heard when
      // that one is saved.)
      if (prefsBatch === batch) prefsBatch = null;
      {
        const these = prefsWaiting;
        prefsWaiting = {};
        try {
          const was = (await readPrefs()) || prefsMemo || {};
          const now = Object.assign({}, was, these);
          // (Places in papers and reading progress: paper by paper, the
          // later of this device's and what another device saved, so one
          // device doesn't undo another's.)
          // (The page can say how two of one kind are made one, as the
          // pages read on both devices: window.LIBLANDE_MERGE.)
          Object.entries(BY_PAPER).forEach(([k, most]) => {
            if (!these[k] || !was[k] || typeof was[k] !== 'object') return;
            const all = Object.assign({}, was[k]), both = window.LIBLANDE_MERGE && window.LIBLANDE_MERGE[k];
            Object.entries(these[k]).forEach(([id, v]) => {
              if (both) { try { all[id] = both(v, all[id]); return; } catch (e) { /* as below */ } }
              if (!all[id] || ((v && v.at) || 0) >= ((all[id] && all[id].at) || 0)) all[id] = v;
            });
            now[k] = Object.fromEntries(Object.entries(all).sort((x, y) => ((y[1] && y[1].at) || 0) - ((x[1] && x[1].at) || 0)).slice(0, most));
          });
          await writePrefs(now);
          prefsMemo = now;
        } catch (e) {
          prefsWaiting = Object.assign(these, prefsWaiting);
          console.warn('Preferences:', e.message);
        }
        resolve(Object.assign({}, prefsMemo, prefsWaiting));
      }
    }, 1500);
    return batch.promise;
  }
  const names = {};
  async function folderName(id) {
    if (!id) return '';
    if (!(id in names)) {
      try { names[id] = (await storage().meta(id, 'name')).name; } catch (e) { return ''; }
    }
    return names[id];
  }

  /* ------------------------------------------------------------ DOI lookup */
  // (lookup.js: shared with LibLande for Word.)
  const lookupDoi = input => window.liblandeLookup.lookupDoi(input);

  /* ------------------------------------------------------------ building */
  // builder.js builds the library here when the .bib or inbox changed; one
  // build at a time. A failed build's reason is passed on once, with the
  // next status.
  const builder = window.makeLiblandeBuilder({ drive, reconcile: groups => edits.reconcileReading(groups), limited: () => access === 'limited' });
  const edits = window.makeLiblandeEdits({ drive, builder, getToken });
  let buildRun = null, buildErr = null, lastBuilt = null;
  // w: what builder.look found. True if a build is under way.
  function startBuild(w, o) {
    if (buildRun) return true;
    if (!w.configured || !w.needed || !navigator.onLine) return false;
    buildErr = null;
    buildRun = builder.build(Object.assign({ daily: true }, o), w)
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
  // (Going offline and back: see the listeners near the top.)

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
