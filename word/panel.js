// LibLande for Word: the side panel. Search your library, choose works,
// insert a citation at the cursor, or change one the cursor is in; the
// References list kept up to date; citations typed by hand, or Zotero's,
// made LibLande's; a plain copy. Citations are Word content controls tagged
// "LL:<id>", their works kept in the document's add-in settings
// ("liblande": {cites: {id: citation}, style}); the References list is the
// one tagged "LL:refs". Their text comes from engine.js (APA) or citeproc-js
// (another style), for the whole document at once.
'use strict';
(() => {
  const CLIENT_ID = '789682218462-98mjugngb46ttd01ucp9dcj71ufspjgn.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  const API = 'https://www.googleapis.com/drive/v3/';
  const LIBLANDE = 'https://kevinlande.github.io/liblande/';
  const $ = id => document.getElementById(id);
  // (This panel's version, as its own script was asked for: "panel.js?v=...".)
  const VERSION = (/[?&]v=([^&]+)/.exec(((document.currentScript || {}).src) || '') || [])[1] || '';
  const S = {
    entries: [], byKey: new Map(), index: [],
    cites: {}, present: null, style: 'apa',
    chosen: [], form: 'paren', own: false,
    editing: null, dirty: false, skipEdit: null,
    list: null, sort: { doc: 'author', lib: 'added', grp: 'author' }, groups: [], tabsG: [], shown: 100, size: 2, searching: false,
    results: [], marker: -1, inWord: false,
  };

  /* ---- storage: the token, and the library kept in this panel */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('llw.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem('llw.' + k); else localStorage.setItem('llw.' + k, JSON.stringify(v)); } catch (e) { /* none */ } },
  };
  const idb = {
    // (One connection, given up if another panel's older one holds up the
    // upgrade for long: the library is then fetched from Drive instead.)
    db: null,
    open() {
      if (this.db) return this.db;
      this.db = new Promise((ok, no) => {
        const r = indexedDB.open('llw', 2);
        const late = setTimeout(() => no(new Error('blocked')), 4000);
        r.onupgradeneeded = () => { ['lib', 'marks'].forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); }); };
        r.onsuccess = () => { clearTimeout(late); const db = r.result; db.onversionchange = () => { db.close(); this.db = null; }; ok(db); };
        r.onerror = () => { clearTimeout(late); no(r.error); };
      });
      this.db.catch(() => { this.db = null; });
      return this.db;
    },
    async getIn(store, k) { try { const db = await this.open(); return await new Promise(ok => { const q = db.transaction(store).objectStore(store).get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; } },
    async putIn(store, k, v) { try { const db = await this.open(); db.transaction(store, 'readwrite').objectStore(store).put(v, k); } catch (e) { /* kept in memory only */ } },
    async get() { try { const db = await this.open(); return await new Promise(ok => { const q = db.transaction('lib').objectStore('lib').get('current'); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; } },
    async put(v) { try { const db = await this.open(); db.transaction('lib', 'readwrite').objectStore('lib').put(v, 'current'); } catch (e) { /* kept in memory only */ } },
    async clear() { try { const db = await this.open(); db.transaction('lib', 'readwrite').objectStore('lib').delete('current'); } catch (e) { /* none */ } },
  };

  /* ---- signing in (Google's own sign-in, from the panel) */
  let token = store.get('token', null);
  const tokenOk = () => token && token.exp > Date.now();
  let gisReady = null;
  function loadGis() {
    return gisReady || (gisReady = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = ok; s.onerror = () => { gisReady = null; no(new Error('Google\u2019s sign-in didn\u2019t load. Are you online?')); };
      document.head.appendChild(s);
    }));
  }
  async function signIn(prompt) {
    await loadGis();
    return new Promise((ok, no) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPE,
        callback: t => {
          if (!t || !t.access_token) { no(new Error('Google didn\u2019t sign you in.')); return; }
          token = { value: t.access_token, exp: Date.now() + (Number(t.expires_in) || 3600) * 1000 - 60000 };
          store.set('token', token);
          ok(token);
        },
        error_callback: e => no(new Error(e && e.type === 'popup_closed' ? 'Sign-in was closed.' : 'Sign-in didn\u2019t finish.')),
      });
      client.requestAccessToken({ prompt: prompt == null ? (store.get('email', null) ? '' : 'select_account') : prompt, login_hint: store.get('email', undefined) });
    });
  }
  async function drive(path) {
    if (!tokenOk()) throw Object.assign(new Error('Sign in again to reach Google Drive.'), { signIn: true });
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token.value } });
    if (r.status === 401) { token = null; store.set('token', null); throw Object.assign(new Error('Sign in again to reach Google Drive.'), { signIn: true }); }
    if (!r.ok) throw new Error('Google Drive answered ' + r.status + '.');
    return r;
  }
  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

  /* ---- the library: library.json.gz in My Drive's LibLande folder */
  async function findLibrary() {
    const folders = (await (await drive('files?q=' + encodeURIComponent("name = 'LibLande' and 'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false") + '&fields=files(id)')).json()).files || [];
    for (const f of folders) {
      const lib = ((await (await drive('files?q=' + encodeURIComponent("name = 'library.json.gz' and " + q(f.id) + ' in parents and trashed = false') + '&fields=files(id,modifiedTime)')).json()).files || [])[0];
      if (lib) return lib;
    }
    throw new Error('No LibLande library in your Google Drive (My Drive \u203a LibLande).');
  }
  const gunzip = async buf => JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  async function fetchLibrary(force) {
    const lib = await findLibrary();
    const have = store.get('libStamp', null);
    if (!force && have === lib.modifiedTime && S.entries.length) return false;
    const buf = await (await drive('files/' + encodeURIComponent(lib.id) + '?alt=media')).arrayBuffer();
    const data = await gunzip(buf);
    useLibrary(data);
    store.set('libStamp', lib.modifiedTime);
    idb.put({ gz: buf, stamp: lib.modifiedTime });
    return true;
  }
  async function whoAmI() {
    try {
      const u = (await (await drive('about?fields=user(emailAddress)')).json()).user;
      if (u && u.emailAddress) store.set('email', u.emailAddress);
    } catch (e) { /* only shown in the menu */ }
    paintAccount();
  }
  function useLibrary(data) {
    S.entries = data.entries || [];
    S.groups = (data.groups || []).filter(g => g && g.name);
    ENTRIES = S.entries;
    CASE_SETS = null;
    CSLW.engines.clear();
    authorSet = null;
    S.byKey = new Map(S.entries.map(e => [e.k, e]));
    S.index = S.entries.map(e => ({ e, hay: norm([
      ...(e.a || []).map(n => n[0] + ' ' + (n[1] || '')), ...(e.e || []).map(n => n[0] + ' ' + (n[1] || '')),
      e.f.title, e.f.booktitle, e.f.journal, e.f.year, e.f.keywords, e.k].filter(Boolean).join(' ')) }));
  }


  /* ---- the document's style: APA (engine.js), or a CSL style (citeproc-js) */
  // The style kept with the document; its file and the engine fetched the
  // first time and kept (the style's file on this device), as LibLande does.
  const STYLES = [['apa', 'APA 7th'], ['chicago-author-date', 'Chicago author-date'], ['modern-language-association', 'MLA 9th'], ['harvard-cite-them-right', 'Harvard']];
  const CSL_RAW = 'https://raw.githubusercontent.com/citation-style-language/';
  const CSLW = { lib: null, engines: new Map(), loading: new Map() };
  async function cslText(path, key) {
    const kept = store.get(key, null);
    if (kept) return kept;
    const r = await fetch(CSL_RAW + path);
    if (!r.ok) throw new Error('the style couldn\u2019t be fetched (' + r.status + ').');
    const t = await r.text();
    store.set(key, t);
    return t;
  }
  function styleEngine(id) {
    if (CSLW.engines.has(id)) return Promise.resolve(CSLW.engines.get(id));
    if (!CSLW.loading.has(id)) {
      const p = (async () => {
        if (!CSLW.lib) {
          const r = await fetch('../vendor/citeproc/2.4.63/citeproc_commonjs.js');
          if (!r.ok) throw new Error('the style engine didn\u2019t load (' + r.status + ').');
          CSLW.lib = new Function('module', (await r.text()) + '\n;return CSL;')({});
        }
        const [xml, locale] = await Promise.all([cslText('styles/master/' + id + '.csl', 'csl:' + id), cslText('locales/master/locales-en-US.xml', 'csl-locale:en-US')]);
        const sys = { retrieveLocale: () => locale, retrieveItem: k => cslItem(S.byKey.get(k), k) };
        const engine = new CSLW.lib.Engine(sys, xml, 'en-US');
        engine.setOutputFormat('html');
        CSLW.engines.set(id, engine);
        return engine;
      })();
      p.catch(() => {}).finally(() => CSLW.loading.delete(id));
      CSLW.loading.set(id, p);
    }
    return CSLW.loading.get(id);
  }
  // Ready to write the document in its style (or an error saying why not:
  // nothing is rewritten in another style meanwhile).
  async function styleReady() {
    if (S.style === 'apa') return;
    try { await styleEngine(S.style); } catch (e) { throw new Error((STYLES.find(x => x[0] === S.style) || [, S.style])[1] + ' isn\u2019t available here yet: ' + e.message); }
  }
  // Every citation's text and the References list, in the document's style.
  // (A CSL style not yet fetched: APA, for the preview only.)
  function renderAll(cites) {
    const engine = S.style !== 'apa' && CSLW.engines.get(S.style);
    if (!engine) return LLWord.render(cites, S.byKey);
    const ids = Object.keys(cites);
    const missing = [...new Set(ids.flatMap(id => cites[id].items.map(it => it.k)))].filter(k => !S.byKey.has(k));
    const item = (c, it) => {
      const x = { id: it.k };
      const pre = c.form === 'narr' ? '' : String(it.pre || '').trim();
      if (pre) x.prefix = LLWord.preText(pre);
      const page = String(it.page || '').trim();
      if (/^(pp?\.\s*)?\d/.test(page)) { x.locator = page.replace(/^pp?\.\s*/, '').replace(/\s*-+\s*/g, '\u2013'); x.label = 'page'; } else if (page) x.suffix = ', ' + page;
      if (c.form === 'year') x['suppress-author'] = true;
      return x;
    };
    const list = ids.map(id => {
      const c = cites[id];
      const its = (c.own ? c.items : LLWord.order(c.items, S.byKey)).filter(it => S.byKey.has(it.k))
        .map((it, i) => Object.assign({}, it, { pre: it.pre || (i === 0 ? c.pre || '' : '') }));
      return { id, c, its };
    }).filter(x => x.its.length);
    const done = engine.rebuildProcessorState(list.map(x => ({ citationID: x.id, citationItems: x.its.map(it => item(x.c, it)), properties: Object.assign({ noteIndex: 0 }, x.c.own ? { unsorted: true } : {}) })), 'html', []);
    // (citeproc's mark for a citation with nothing to print: nothing.)
    const plain = h => cslOut(h).text.replace(/\s*\[NO_PRINTED_FORM\]/g, '').trim();
    const texts = {};
    ids.forEach(id => { texts[id] = '(citation not found)'; });
    done.forEach(([id, , html]) => { texts[id] = plain(html); });
    // (In a sentence: the authors, then the rest of the citation.)
    list.filter(x => x.c.form === 'narr').forEach(x => {
      const parts = x.its.map(it => {
        const who = plain(engine.makeCitationCluster([{ id: it.k, 'author-only': true }]));
        const rest = plain(engine.makeCitationCluster([item({ form: 'year' }, Object.assign({}, it, { pre: '' }))]));
        return rest && !/^\(\s*\)$/.test(rest) ? who + ' ' + rest : who;
      });
      texts[x.id] = parts.length === 1 ? parts[0] : parts.length === 2 ? parts.join(' and ') : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
    });
    const bib = list.length ? engine.makeBibliography() : null;
    const refs = bib ? bib[1].map((h, i) => Object.assign({ k: bib[0].entry_ids[i][0] }, cslOut(h))) : [];
    return { texts, refs, missing };
  }
  async function chooseStyle(id) {
    const was = S.style;
    S.style = id;
    hideErr('refsErr');
    try {
      await styleReady();
      await saveSettings();
      await refreshDocument(true);
      paintChosen();
    } catch (e) {
      S.style = was;
      $('style').value = was;
      await saveSettings();
      showErr('refsErr', wordError(e));
    }
  }

  /* ---- the document's citations (Word) */
  const SETTINGS = 'liblande';
  function readSettings() {
    try { const v = Office.context.document.settings.get(SETTINGS); S.cites = (v && v.cites) || {}; S.style = (v && v.style) || 'apa'; S.tabsG = (v && v.groups) || []; } catch (e) { S.cites = {}; S.style = 'apa'; S.tabsG = []; }
    if ($('style')) $('style').value = S.style;
  }
  function saveSettings() {
    return new Promise(ok => {
      try {
        Office.context.document.settings.set(SETTINGS, { v: 1, cites: S.cites, style: S.style, groups: S.tabsG });
        Office.context.document.settings.saveAsync(() => ok());
      } catch (e) { ok(); }
    });
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // The citations in the document now (some may have been deleted, or
  // brought back with Undo): only those count.
  const presentCites = () => {
    if (!S.present) return S.cites;
    const out = {};
    S.present.forEach(id => { if (S.cites[id]) out[id] = S.cites[id]; });
    return out;
  };
  // Every citation's text and the References list, written where they've
  // changed. (After an insert, and when the panel opens.)
  async function refreshDocument(force) {
    if (!S.inWord || !S.entries.length) return;
    await styleReady();
    await Word.run(async ctx => {
      const ccs = ctx.document.contentControls;
      ccs.load('items/tag,items/text');
      await ctx.sync();
      const mine = ccs.items.filter(c => /^LL:/.test(c.tag));
      S.present = mine.map(c => c.tag.slice(3)).filter(id => id !== 'refs');
      const out = renderAll(presentCites(), S.byKey);
      mine.forEach(c => {
        const id = c.tag.slice(3);
        if (id === 'refs') return;
        const want = out.texts[id];
        if (want && c.text !== want) c.insertText(want, 'Replace');
      });
      const list = mine.find(c => c.tag === 'LL:refs');
      // (The list rewritten only when what it says has changed: compared
      // with its text in the document itself.)
      const flat = t => String(t || '').replace(/\s+/g, ' ').trim();
      S.hasRefs = !!list;
      await ctx.sync();
      if (list && (force || flat(list.text) !== flat(out.refs.length ? out.refs.map(r => r.text).join(' ') : NO_REFS))) await writeRefs(ctx, list, out.refs);
    });
    paintRefs();
    paintResults();
  }
  // The References list written into its content control as text, in the
  // document's own font (as typed there), titles in italics, each entry
  // with APA's half-inch hanging indent.
  const NO_REFS = '(No works cited yet.)';
  async function writeRefs(ctx, cc, refs) {
    // (The font of the text before the list, or else the document's first
    // paragraph: set on every run, since an emptied list keeps whatever font
    // it had, as Word's own default from an earlier version of it.)
    const before = cc.paragraphs.getFirst().getPreviousOrNullObject();
    before.load('font/name,font/size,isNullObject');
    const first = ctx.document.body.paragraphs.getFirst();
    first.load('font/name,font/size');
    await ctx.sync();
    const f = !before.isNullObject && before.font.name ? before.font : first.font;
    const style = r => { r.font.italic = false; if (f.name) r.font.name = f.name; if (f.size) r.font.size = f.size; return r; };
    cc.clear();
    await ctx.sync();
    if (!refs.length) style(cc.insertText(NO_REFS, 'End'));
    refs.forEach((r, i) => {
      if (i) style(cc.insertText('\n', 'End'));
      const parts = r.parts.map(p => ({ t: p.t.replace(/\s+/g, ' '), i: p.i }));
      if (parts.length) { parts[0].t = parts[0].t.replace(/^ /, ''); parts[parts.length - 1].t = parts[parts.length - 1].t.replace(/ $/, ''); }
      parts.forEach(p => { if (p.t) style(cc.insertText(p.t, 'End')).font.italic = !!p.i; });
    });
    await ctx.sync();
    const paras = cc.paragraphs;
    paras.load('items');
    await ctx.sync();
    paras.items.forEach(p => { p.leftIndent = 36; p.firstLineIndent = -36; });
    await ctx.sync();
  }

  async function insertCitation(given) {
    const c = given || currentCite();
    if (!c.items.length) return;
    hideErr('citeErr');
    const id = newId();
    try { await styleReady(); } catch (e) { showErr('citeErr', e.message); return; }
    const all = Object.assign({}, presentCites(), { [id]: c });
    const text = renderAll(all, S.byKey).texts[id];
    try {
      await Word.run(async ctx => {
        const sel = ctx.document.getSelection();
        const inside = sel.parentContentControlOrNullObject;
        inside.load('tag');
        await ctx.sync();
        // (Never inside another citation, or inside the list: after it.)
        const at = !inside.isNullObject && /^LL:/.test(inside.tag) ? inside.getRange('After') : sel;
        const r = at.insertText(text, 'Replace');
        const cc = r.insertContentControl();
        cc.tag = 'LL:' + id;
        cc.title = 'LibLande';
        cc.appearance = 'BoundingBox';
        await ctx.sync();
        cc.getRange('After').select();
        await ctx.sync();
      });
    } catch (e) { showErr('citeErr', 'Couldn\u2019t insert it: ' + wordError(e)); return; }
    S.cites[id] = c;
    if (S.present) S.present.push(id);
    S.skipEdit = id;
    await saveSettings();
    clearChosen();
    $('q').value = '';
    search();
    $('q').focus();
    try { await refreshDocument(); } catch (e) { showErr('citeErr', 'The other citations couldn\u2019t be updated: ' + wordError(e)); }
  }
  /* ---- editing a citation: the cursor in one opens it here */
  // Its works, pages, words before, form and order, on Cite's own screen;
  // Update rewrites it, Remove takes it out (Undo brings it back: its
  // works stay in the settings). The cursor leaving it leaves it here too,
  // unless something was changed.
  function enterEdit(id) {
    hideSelCard();
    const c = S.cites[id];
    const its = c.own ? c.items : LLWord.order(c.items, S.byKey);
    S.editing = id;
    S.dirty = false;
    S.chosen = its.map((it, i) => ({ k: it.k, page: it.page || '', pre: it.pre || (i === 0 ? c.pre || '' : '') }));
    S.formBefore = S.form;
    S.form = c.form || 'paren';
    S.own = !!c.own;
    S.searching = false;
    $('pCite').classList.remove('searching', 'browsing');
    hideErr('citeErr');
    paintChosen();
    paintResults();
  }
  function leaveEdit() {
    if (S.editing && S.formBefore) S.form = S.formBefore;
    S.editing = null;
    S.dirty = false;
    clearChosen();
    paintResults();
  }
  let selTimer = 0;
  function onSelection() {
    clearTimeout(selTimer);
    selTimer = setTimeout(async () => {
      let tag = '', where = null;
      try {
        await Word.run(async ctx => {
          const sel = ctx.document.getSelection();
          const cc = sel.parentContentControlOrNullObject;
          cc.load('tag');
          await ctx.sync();
          tag = cc.isNullObject ? '' : cc.tag || '';
          if (tag) return;
          // (Where the selection is in its paragraph, for a citation typed
          // there: the paragraph's text, and how much of it comes before.
          // Not to be had for every selection, as one over a picture.)
          try {
            sel.load('text');
            const para = sel.paragraphs.getFirst();
            para.load('text');
            const before = para.getRange('Start').expandTo(sel.getRange('Start'));
            before.load('text');
            await ctx.sync();
            where = { text: sel.text || '', para: para.text || '', at: (before.text || '').length };
          } catch (e) { where = null; }
        });
      } catch (e) { return; }
      const id = /^LL:/.test(tag) && tag !== 'LL:refs' ? tag.slice(3) : '';
      if (!id || !S.cites[id]) {
        S.skipEdit = null;
        if (S.editing && !S.dirty) leaveEdit();
        if (!tag && where) noticeSelection(where); else hideSelCard();
        return;
      }
      hideSelCard();
      // (Not the one just inserted or updated, with the cursor after it;
      // and not over a new citation being made, or changes not yet saved.)
      if (id === S.editing || id === S.skipEdit) return;
      if (S.editing ? S.dirty : S.chosen.length) return;
      enterEdit(id);
    }, 200);
  }
  /* ---- a citation typed by hand, selected (or the cursor in it): linked */
  // The Cite tab shows it at the top with the works it could be (engine.js
  // findTyped and matchTyped, as Link citations does); Link makes it a
  // LibLande citation. Not in the library: Add to LibLande. Text that isn't
  // a citation: searched for, to cite a work in its place.
  const SEL = { card: null };
  function noticeSelection(w) {
    if (S.editing || S.chosen.length || !S.entries.length) { hideSelCard(); return; }
    const end = w.at + w.text.length;
    // (The cursor inside it, not just before or after it, as it is after
    // one just linked; or a selection within it, or of all of it.)
    const typed = LLWord.findTyped(w.para).find(t => w.text ? t.at <= w.at && end <= t.at + t.text.length : t.at < w.at && w.at < t.at + t.text.length);
    if (typed) {
      // (The same one as shown already: left as it is, choices and all.)
      if (SEL.card && SEL.card.kind === 'typed' && SEL.card.t.text === typed.text && SEL.card.para === w.para) return;
      const items = [];
      typed.parts.forEach(pt => LLWord.matchTyped(pt, S.entries).forEach((m, yi) => items.push({
        label: pt.years.length > 1 ? pt.names.join(' & ') + ', ' + pt.years[yi].y + pt.years[yi].letter : pt.text.replace(/^[^A-Z\u00c0-\u024f]*?(?=\p{Lu})/u, ''),
        pt, yi, cands: m.cands.slice(0, 6), k: m.pick ? m.pick.k : null, finding: false,
      })));
      SEL.card = { kind: 'typed', t: typed, para: w.para, items };
    } else if (w.text.trim().length >= 3 && w.text.trim().length <= 200 && !/\r|\n/.test(w.text.trim())) {
      const text = w.text.trim();
      if (SEL.card && SEL.card.kind === 'text' && SEL.card.text === text) return;
      SEL.card = { kind: 'text', text, hits: matches(text).slice(0, 5) };
    } else { hideSelCard(); return; }
    paintSelCard();
  }
  function hideSelCard() {
    if (!SEL.card) return;
    SEL.card = null;
    $('selCard').hidden = true;
  }
  const workRow = (e, i, j, pressed, btn) => '<div class="cand"><div class="tx"><div class="t">' + esc(e.f.title || e.k) + '</div><div class="m">' + esc(metaOf(e)) + '</div></div>' +
    '<button type="button" class="lk' + (pressed ? ' p' : '') + '" data-i="' + i + '" data-k="' + esc(e.k) + '" aria-pressed="' + !!pressed + '">' + btn + '</button></div>';
  function paintSelCard() {
    const c = SEL.card;
    if (!c) return;
    let label, shown, body = '';
    if (c.kind === 'typed') {
      const n = c.t.parts.length;
      label = n > 1 ? 'Selected \u00b7 ' + n + ' citations' : 'Selected citation';
      shown = c.t.text;
      const many = c.items.length > 1;
      c.items.forEach((it, i) => {
        if (many) body += '<div class="lbl2">' + esc(it.label) + '</div>';
        if (!it.cands.length) body += '<p class="note">Not in your library.</p>';
        else if (!many && it.cands.length > 1) body += '<div class="lbl2">' + it.cands.length + ' works could be this one</div>';
        // (One work: its Link links it; several: the one chosen is marked,
        // and the button at the foot links them all.)
        body += it.cands.map(e => workRow(e, i, 0, it.k === e.k, many ? (it.k === e.k ? 'Chosen' : 'Choose') : 'Link')).join('');
        body += it.finding ? '<label class="search"><input type="search" data-find="' + i + '" placeholder="Another work\u2026" autocomplete="off" spellcheck="false"></label><div data-found="' + i + '"></div>'
          : '<div class="alt"><button type="button" data-search="' + i + '">' + (it.cands.length ? 'Search for another\u2026' : 'Search\u2026') + '</button>' +
            (it.cands.length ? '' : '<button type="button" class="go" data-addlib="' + i + '">Add to LibLande\u2026</button>') + '</div>';
      });
      if (many) {
        const ready = c.items.every(it => it.k);
        body += '<div class="alt"><button type="button" class="primary" data-linkall' + (ready ? '' : ' disabled') + '>' + (c.items.length === 2 ? 'Link both' : 'Link all ' + c.items.length) + '</button></div>';
      }
    } else {
      label = 'Selected text';
      shown = '\u201c' + c.text + '\u201d';
      body = '<p class="note">' + (c.hits.length ? 'Not a citation. Searched for in your library:' : 'Not a citation, and nothing in your library matches it.') + '</p>' +
        c.hits.map(e => workRow(e, -1, 0, false, 'Cite here')).join('') +
        '<div class="alt"><button type="button" class="go" data-addtext>Add to LibLande\u2026</button></div>';
    }
    $('selLabel').textContent = label;
    $('selText').textContent = shown;
    $('selBody').innerHTML = body;
    $('selCard').hidden = false;
  }
  // The typed citation made LibLande's: found again in its paragraph (the
  // cursor's), the one at the same place, and put in a citation of these
  // works.
  async function linkSelected() {
    const c = SEL.card;
    if (!c || c.kind !== 'typed' || !c.items.every(it => it.k)) return;
    const items = c.items.map(it => {
      const x = { k: it.k, page: it.yi === it.pt.years.length - 1 ? it.pt.page : '' };
      if (it.yi === 0 && it.pt.pre) x.pre = it.pt.pre;
      return x;
    });
    const id = newId();
    try {
      await Word.run(async ctx => {
        const para = ctx.document.getSelection().paragraphs.getFirst();
        para.load('text');
        const found = para.search(c.t.text, { matchCase: true });
        found.load('items');
        await ctx.sync();
        if (para.text !== c.para) throw new Error('the paragraph changed; select the citation again.');
        // (Which of the paragraph's copies of it: the one at that place.)
        let nth = 0;
        for (let at = c.para.indexOf(c.t.text); at >= 0 && at < c.t.at; at = c.para.indexOf(c.t.text, at + 1)) nth++;
        const r = found.items[nth];
        if (!r) throw new Error('it isn\u2019t where it was; select it again.');
        const inside = r.parentContentControlOrNullObject;
        inside.load('tag');
        await ctx.sync();
        if (!inside.isNullObject && /^LL:/.test(inside.tag || '')) throw new Error('it\u2019s already a LibLande citation.');
        const cc = r.insertContentControl();
        cc.tag = 'LL:' + id; cc.title = 'LibLande'; cc.appearance = 'BoundingBox';
        await ctx.sync();
        cc.getRange('After').select();
        await ctx.sync();
      });
    } catch (e) { showSelErr('Couldn\u2019t link it: ' + wordError(e)); return; }
    S.cites[id] = { items, form: c.t.form, own: true };
    if (S.present) S.present.push(id);
    S.skipEdit = id;
    hideSelCard();
    await saveSettings();
    try { await refreshDocument(); } catch (e) { /* Refresh will */ }
    search();
  }
  function showSelErr(msg) { const p = document.createElement('div'); p.className = 'err'; p.textContent = msg; $('selBody').prepend(p); }
  function onSelCardClick(ev) {
    const c = SEL.card;
    if (!c) return;
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'selX') { hideSelCard(); return; }
    if (b.hasAttribute('data-linkall')) { linkSelected(); return; }
    if (b.hasAttribute('data-addtext')) { addInLibLande(c.text); return; }
    if (b.dataset.addlib != null) { const it = c.items[+b.dataset.addlib]; addInLibLande(it.pt.names.join(' ') + ' ' + it.pt.years[it.yi].y); return; }
    if (b.dataset.search != null) { c.items[+b.dataset.search].finding = true; paintSelCard(); const f = document.querySelector('[data-find="' + b.dataset.search + '"]'); if (f) f.focus(); return; }
    if (b.classList.contains('lk')) {
      const k = b.dataset.k;
      if (c.kind === 'text') { insertCitation({ items: [{ k, page: '' }], form: 'paren', own: false }).then(hideSelCard); return; }
      const it = c.items[+b.dataset.i];
      if (!it.cands.some(e => e.k === k) && S.byKey.get(k)) it.cands.push(S.byKey.get(k));
      it.k = k;
      it.finding = false;
      if (c.items.length === 1) linkSelected(); else paintSelCard();
    }
  }
  function onSelCardInput(ev) {
    const i = ev.target.dataset.find;
    if (i == null) return;
    const hits = ev.target.value.trim() ? matches(ev.target.value).slice(0, 6) : [];
    const multi = SEL.card.items.length > 1;
    document.querySelector('[data-found="' + i + '"]').innerHTML = hits.map(e => workRow(e, +i, 0, false, multi ? 'Choose' : 'Link')).join('');
  }
  async function updateCitation() {
    const id = S.editing, c = currentCite();
    if (!id || !c.items.length) return;
    hideErr('citeErr');
    S.cites[id] = c;
    await saveSettings();
    try {
      await refreshDocument();
      await Word.run(async ctx => {
        const ccs = ctx.document.contentControls.getByTag('LL:' + id);
        ccs.load('items');
        await ctx.sync();
        if (ccs.items.length) { ccs.items[0].getRange('After').select(); await ctx.sync(); }
      });
    } catch (e) { showErr('citeErr', 'Couldn\u2019t update it: ' + wordError(e)); return; }
    S.skipEdit = id;
    leaveEdit();
    $('q').value = '';
    search();
  }
  async function removeCitation() {
    const id = S.editing;
    if (!id) return;
    hideErr('citeErr');
    try {
      await Word.run(async ctx => {
        const ccs = ctx.document.contentControls.getByTag('LL:' + id);
        ccs.load('items');
        await ctx.sync();
        ccs.items.forEach(cc => cc.delete(false));
        await ctx.sync();
      });
    } catch (e) { showErr('citeErr', 'Couldn\u2019t remove it: ' + wordError(e)); return; }
    if (S.present) S.present = S.present.filter(x => x !== id);
    leaveEdit();
    try { await refreshDocument(); } catch (e) { /* Refresh will */ }
  }

  function wordError(e) {
    const m = (e && (e.message || e.code)) || String(e);
    if (/protect|read.?only|locked/i.test(m)) return 'this document can\u2019t be changed (it\u2019s protected or read-only).';
    if (/compat|InvalidArgument|NotAllowed|GeneralException/i.test(m)) return m + ' (If this is an older .doc file, save it as .docx.)';
    return m;
  }

  async function insertOrGoToRefs() {
    hideErr('refsErr');
    try {
      await Word.run(async ctx => {
        const ccs = ctx.document.contentControls.getByTag('LL:refs');
        ccs.load('items');
        await ctx.sync();
        if (ccs.items.length) { ccs.items[0].select('Start'); await ctx.sync(); return; }
        const out = renderAll(presentCites(), S.byKey);
        // (Its own paragraph: the one the cursor is in, if empty, or a new
        // one after it.)
        const para = ctx.document.getSelection().paragraphs.getFirst();
        para.load('text');
        await ctx.sync();
        const target = para.text.trim() ? para.insertParagraph('', 'After') : para;
        const cc = target.getRange('Whole').insertContentControl();
        cc.tag = 'LL:refs';
        cc.title = 'LibLande References';
        cc.appearance = 'BoundingBox';
        await ctx.sync();
        await writeRefs(ctx, cc, out.refs);
      });
      S.hasRefs = true;
      paintRefs();
    } catch (e) { showErr('refsErr', 'Couldn\u2019t put the list there: ' + wordError(e)); }
  }

  /* ---- Zotero's citations: read, matched to the library, converted */
  // A Zotero citation (its field's code: "ADDIN ZOTERO_ITEM CSL_CITATION
  // {json}") as a LibLande one: its works (by DOI, or title and year), pages
  // (Zotero's locator, with its label), the first work's prefix ("see"), and
  // the year alone where Zotero suppressed the author. null if any of its
  // works isn't in the library.
  const LABELS = { page: '', chapter: 'chap. ', paragraph: 'para. ', section: 'sec. ', note: 'n. ', line: 'line ', figure: 'fig. ', volume: 'vol. ' };
  function zoteroMatcher() {
    const doi = new Map(), title = new Map();
    S.entries.forEach(e => {
      if (e.f.doi) doi.set(String(e.f.doi).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, ''), e);
      title.set(norm(e.f.title || '').replace(/[^a-z0-9]/g, '') + '#' + (e.f.year || ''), e);
    });
    const yearOf = d => d.issued && d.issued['date-parts'] && d.issued['date-parts'][0] ? String(d.issued['date-parts'][0][0]) : '';
    const match = d => (d.DOI && doi.get(String(d.DOI).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, ''))) || title.get(norm(d.title || '').replace(/[^a-z0-9]/g, '') + '#' + yearOf(d)) || null;
    return { match, yearOf };
  }
  function zoteroCite(code, M) {
    let data;
    try { data = JSON.parse(code.slice(code.indexOf('{'))); } catch (e) { return { items: [], cite: null }; }
    const its = data.citationItems || [];
    const items = its.map(it => ({ it, e: M.match(it.itemData || {}) }));
    if (!items.length || items.some(x => !x.e)) return { items, cite: null };
    const page = it => it.locator ? (LABELS[it.label || 'page'] != null ? LABELS[it.label || 'page'] : (it.label || '') + ' ') + it.locator : '';
    return {
      items,
      cite: {
        // (Each work's prefix: "see also" before the second.)
        items: items.map(x => Object.assign({ k: x.e.k, page: page(x.it).trim() }, x.it.prefix && String(x.it.prefix).replace(/[,;\s]+$/, '').trim() ? { pre: String(x.it.prefix).replace(/[,;\s]+$/, '').trim() } : {})),
        form: its.some(it => it['suppress-author']) ? 'year' : 'paren',
        own: its.slice(1).some(it => String(it.prefix || '').trim()),
      },
    };
  }
  async function readZotero() {
    if (!S.inWord) return;
    let codes = [];
    try {
      await Word.run(async ctx => {
        const fields = ctx.document.body.fields;
        fields.load('items/code');
        await ctx.sync();
        codes = fields.items.map(f => f.code || '');
      });
    } catch (e) {
      $('zCard').hidden = false;
      $('zCount').textContent = 'Zotero\u2019s citations couldn\u2019t be read here: ' + wordError(e);
      $('zRows').innerHTML = ''; $('zConvert').hidden = true;
      return;
    }
    const cites = codes.filter(c => /ZOTERO_ITEM/.test(c));
    if (!cites.length) { $('zCard').hidden = true; return; }
    const M = zoteroMatcher();
    const all = cites.map(c => zoteroCite(c, M));
    const works = all.flatMap(z => z.items), missing = works.filter(x => !x.e).map(x => x.it.itemData || {});
    const ready = all.filter(z => z.cite).length;
    $('zCard').hidden = false;
    $('zCount').textContent = cites.length + ' citation' + (cites.length === 1 ? '' : 's') + ' \u00b7 ' + (works.length - missing.length) + ' of ' + works.length + ' works in your library';
    $('zRows').innerHTML = missing.slice(0, 8).map(d => '<div class="link-row"><span class="tag w">not found</span><span class="w">' +
      esc(((d.author && d.author[0] && d.author[0].family) || '') + ' (' + (M.yearOf(d) || 'n.d.') + ') ' + (d.title || '')) + '</span></div>').join('') +
      (missing.length ? '<p class="note" style="margin:6px 0 0">Citations with a work not in your library stay as Zotero\u2019s.</p>' : '');
    $('zConvert').hidden = !ready;
    $('zConvert').textContent = 'Convert ' + ready + ' to LibLande';
  }

  // Zotero's citations made LibLande's, a paragraph at a time: the
  // paragraph's Office Open XML read, each Zotero field in it (begin,
  // instruction, result, end) swapped for a LibLande content control holding
  // the citation in the result's own formatting, and the paragraph put back.
  // (Selecting a field and typing over it, Word on the Mac refused.)
  // Zotero's bibliography, spanning paragraphs, is deleted as a field, with
  // the References list put where it began.
  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  function swapFields(xml, M, made) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const el = (name, attrs) => { const e = doc.createElementNS(W_NS, 'w:' + name); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttributeNS(W_NS, 'w:' + k, v)); return e; };
    let swapped = 0;
    [...doc.getElementsByTagNameNS(W_NS, 'p')].forEach(p => {
      const kids = [...p.childNodes];
      let i = 0;
      while (i < kids.length) {
        const n = kids[i];
        const fc = n.nodeType === 1 && n.localName === 'r' && n.getElementsByTagNameNS(W_NS, 'fldChar')[0];
        if (!fc || fc.getAttributeNS(W_NS, 'fldCharType') !== 'begin') { i++; continue; }
        // (Its runs, to the matching end; nested fields counted.)
        let depth = 0, j = i, code = '', resultRun = null, phase = 'code';
        for (; j < kids.length; j++) {
          const k = kids[j];
          if (k.nodeType !== 1) continue;
          const c = k.getElementsByTagNameNS(W_NS, 'fldChar')[0];
          const t = c && c.getAttributeNS(W_NS, 'fldCharType');
          if (t === 'begin') depth++;
          if (t === 'separate' && depth === 1) phase = 'result';
          if (t === 'end' && --depth === 0) break;
          if (phase === 'code') [...k.getElementsByTagNameNS(W_NS, 'instrText')].forEach(x => { code += x.textContent; });
          else if (!resultRun && k.localName === 'r' && k.getElementsByTagNameNS(W_NS, 't')[0]) resultRun = k;
        }
        if (j >= kids.length || !/ZOTERO_ITEM/.test(code)) { i = j + 1; continue; }
        const z = zoteroCite(code, M);
        if (!z.cite) { i = j + 1; continue; }
        const id = newId();
        made[id] = z.cite;
        const text = renderAll(Object.assign({}, presentCites(), made), S.byKey).texts[id];
        const sdt = el('sdt'), pr = el('sdtPr'), content = el('sdtContent'), run = el('r'), t = el('t');
        pr.appendChild(el('alias', { val: 'LibLande' }));
        pr.appendChild(el('tag', { val: 'LL:' + id }));
        sdt.appendChild(pr);
        const rPr = resultRun && resultRun.getElementsByTagNameNS(W_NS, 'rPr')[0];
        if (rPr) run.appendChild(rPr.cloneNode(true));
        t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        t.textContent = text;
        run.appendChild(t);
        content.appendChild(run);
        sdt.appendChild(content);
        p.insertBefore(sdt, kids[i]);
        for (let x = i; x <= j; x++) if (kids[x].parentNode === p) p.removeChild(kids[x]);
        swapped++;
        i = j + 1;
      }
    });
    return { xml: swapped ? new XMLSerializer().serializeToString(doc) : null, swapped };
  }
  async function convertZotero() {
    hideErr('refsErr');
    const b = $('zConvert');
    b.disabled = true;
    const M = zoteroMatcher();
    let done = 0, step = 'reading Zotero\u2019s citations', bibl = false, keepBib = false;
    const zCount = async ctx => { const f = ctx.document.body.fields; f.load('items/code'); await ctx.sync(); return f.items.filter(x => /ZOTERO_ITEM/.test(x.code || '')); };
    try {
      await Word.run(async ctx => {
        let left = await zCount(ctx);
        keepBib = left.some(f => !zoteroCite(f.code, M).cite);
        // (A field whose paragraph gave nothing to swap, as one spanning
        // paragraphs: passed over.)
        const skip = new Set();
        // (A paragraph at a time, from the end back, until none is left
        // that can be converted.)
        for (let guard = 0; guard < 500; guard++) {
          const f = left.slice().reverse().find(x => zoteroCite(x.code, M).cite && !skip.has(x.code));
          if (!f) break;
          step = 'finding the citation\u2019s paragraph';
          const para = f.result.paragraphs.getFirst();
          const ox = para.getOoxml();
          await ctx.sync();
          const made = {};
          const out = swapFields(ox.value, M, made);
          if (!out.xml) { skip.add(f.code); continue; }
          step = 'putting the paragraph back';
          // (Word can add an empty paragraph after one replaced this way:
          // counted before and after, and taken out.)
          const countParas = async () => { const ps = ctx.document.body.paragraphs; ps.load('items/text'); await ctx.sync(); return ps.items.length; };
          const n0 = await countParas();
          const placed = para.insertOoxml(out.xml, 'Replace');
          await ctx.sync();
          if ((await countParas()) > n0) {
            const extra = placed.paragraphs.getLast().getNextOrNullObject();
            extra.load('text');
            await ctx.sync();
            if (!extra.isNullObject && !extra.text.trim()) { extra.delete(); await ctx.sync(); }
          }
          Object.assign(S.cites, made);
          if (S.present) S.present.push(...Object.keys(made));
          const now = await zCount(ctx);
          if (now.length >= left.length) throw new Error('Word put the paragraph back with Zotero\u2019s field still in it.');
          done += left.length - now.length;
          left = now;
        }
        if (!keepBib) {
          step = 'replacing Zotero\u2019s bibliography';
          const all = ctx.document.body.fields;
          all.load('items/code');
          await ctx.sync();
          const bib = all.items.find(x => /ZOTERO_BIBL/.test(x.code || ''));
          if (bib) {
            const anchor = bib.result.paragraphs.getFirst().insertParagraph('', 'Before');
            bib.delete();
            const cc = anchor.getRange('Whole').insertContentControl();
            cc.tag = 'LL:refs'; cc.title = 'LibLande References'; cc.appearance = 'BoundingBox';
            await ctx.sync();
            bibl = true;
          }
        }
      });
    } catch (e) {
      await saveSettings();
      const m = (e && (e.message || e.code)) || String(e);
      showErr('refsErr', (done ? 'Converted ' + done + ', then stopped' : 'Couldn\u2019t convert them') + ' (while ' + step + '): ' + m + (done ? ' Undo with \u2318Z if you like.' : ''));
      b.disabled = false;
      try { await refreshDocument(true); } catch (x) { /* Refresh will */ }
      readZotero();
      return;
    }
    await saveSettings();
    b.disabled = false;
    try { await refreshDocument(true); } catch (e) { /* Refresh will */ }
    readZotero();
    showErr('refsErr', 'Converted ' + done + ' citation' + (done === 1 ? '' : 's') + (bibl ? ' and the bibliography' : keepBib ? '; the bibliography stays Zotero\u2019s, as some citations do' : '') + '.');
    $('refsErr').classList.add('ok');
  }


  /* ---- Link citations: those typed by hand made LibLande's */
  // Found in each paragraph's text (engine.js findTyped), matched to the
  // library; all linked at once, each then listed with what it was linked
  // to ("check" where it could have been another), to change if wrong.
  // Not inside a citation already, nor in Zotero's.
  const LINK = { found: [], rows: [], undo: [], open: -1 };
  let authorSet = null;
  const authors = () => authorSet || (authorSet = new Set(S.entries.flatMap(e => (e.a || []).concat(e.e || []).map(n => norm(String(n[0] || '').replace(/[{}\\]/g, ''))))));
  async function scanTyped() {
    if (!S.inWord || !S.entries.length) return;
    let found = [];
    await Word.run(async ctx => {
      const paras = ctx.document.body.paragraphs;
      paras.load('items/text');
      const fields = ctx.document.body.fields;
      fields.load('items/code');
      await ctx.sync();
      const zr = fields.items.filter(f => /ZOTERO/.test(f.code || '')).map(f => { const r = f.result; r.load('text'); return r; });
      await ctx.sync();
      const zText = zr.map(r => r.text || '');
      paras.items.forEach((p, pi) => {
        LLWord.findTyped(p.text || '').forEach(t => {
          if (zText.some(z => z.includes(t.text))) return;
          t.para = pi;
          t.parts.forEach(pt => { pt.match = LLWord.matchTyped(pt, S.entries); });
          t.ok = t.parts.every(pt => pt.match.every(m => m.pick));
          // ("the Brexit vote (2016)": in a sentence, with no such author
          // in the library, not taken for a citation.)
          if (t.form === 'narr' && !t.ok && !authors().has(norm(t.parts[0].names[0]))) return;
          found.push(t);
        });
      });
      // (Those already inside a citation of LibLande's: passed over.)
      const ranges = found.map(t => { const rs = paras.items[t.para].search(t.text, { matchCase: true }); rs.load('items'); return rs; });
      await ctx.sync();
      const parents = ranges.map(rs => rs.items.map(r => { const c = r.parentContentControlOrNullObject; c.load('tag'); return c; }));
      await ctx.sync();
      found = found.filter((t, i) => parents[i].some(c => c.isNullObject || !/^LL:/.test(c.tag || '')));
    });
    LINK.found = found;
    paintLink();
  }
  function paintLink() {
    const ok = LINK.found.filter(t => t.ok).length;
    $('lCard').hidden = !LINK.found.length && !LINK.rows.length;
    $('lCount').textContent = LINK.rows.length
      ? 'Linked ' + LINK.undo.length + ' citation' + (LINK.undo.length === 1 ? '' : 's')
      : LINK.found.length + ' typed citation' + (LINK.found.length === 1 ? '' : 's') + ' found';
    $('lGo').hidden = !ok || LINK.rows.length > 0;
    $('lGo').textContent = 'Link ' + ok + ' citation' + (ok === 1 ? '' : 's');
    $('lUndo').hidden = !LINK.undo.length;
    const rows = LINK.rows.length ? LINK.rows : LINK.found.filter(t => !t.ok).map(t => ({ typed: t.text, missing: true }));
    $('lRows').innerHTML = rows.map((r, i) => {
      if (r.missing) return '<div class="link-row" data-r="' + i + '" data-typed="' + esc(r.typed) + '"><span class="tag w">not found</span><span class="w" title="' + esc(r.typed) + '">' + esc(r.typed) + '</span><button class="mini" type="button" data-add>Add\u2026</button></div>';
      const e = S.byKey.get(r.k);
      let h = '<div class="link-row" data-r="' + i + '"><span class="tag' + (r.sure ? '' : ' w') + '">' + (r.sure ? 'linked' : 'check') + '</span>' +
        '<span class="w" title="' + esc(r.typed + ' \u2192 ' + (e ? e.f.title : r.k)) + '">' + esc(r.typed) + ' \u2192 ' + esc(e ? e.f.title || r.k : r.k) + '</span>' +
        '<button class="mini" type="button" data-change="' + i + '">' + (LINK.open === i ? 'Done' : 'Change') + '</button></div>';
      if (LINK.open === i) {
        h += '<div class="pick" data-pick="' + i + '">' + r.cands.map(c => '<button type="button" class="pk" data-k="' + esc(c.k) + '" aria-pressed="' + (c.k === r.k) + '"><span class="radio"></span><span><span class="t">' + esc(c.f.title || c.k) + '</span><span class="m"> ' + esc(metaOf(c)) + '</span></span></button>').join('') +
          '<label class="search"><input type="search" data-find="' + i + '" placeholder="Another work\u2026" autocomplete="off" spellcheck="false"></label><div data-found="' + i + '"></div></div>';
      }
      return h;
    }).join('');
  }
  async function linkTyped() {
    hideErr('refsErr');
    $('lGo').disabled = true;
    const rows = [], undo = [];
    try {
      await Word.run(async ctx => {
        const paras = ctx.document.body.paragraphs;
        paras.load('items');
        await ctx.sync();
        const todo = LINK.found.filter(t => t.ok);
        // (Each text once a paragraph; every place it's typed there, linked.)
        const seen = new Set(), jobs = [];
        todo.forEach(t => {
          const key = t.para + '\u0001' + t.text;
          if (seen.has(key)) return;
          seen.add(key);
          const rs = paras.items[t.para].search(t.text, { matchCase: true });
          rs.load('items');
          jobs.push({ t, rs });
        });
        await ctx.sync();
        const parents = jobs.map(j => j.rs.items.map(r => { const c = r.parentContentControlOrNullObject; c.load('tag'); return c; }));
        await ctx.sync();
        jobs.forEach((j, ji) => j.rs.items.forEach((r, ri) => {
          const c = parents[ji][ri];
          if (!c.isNullObject && /^LL:/.test(c.tag || '')) return;
          const id = newId(), t = j.t;
          const items = [];
          t.parts.forEach(pt => pt.match.forEach((m, yi) => {
            const it = { k: m.pick.k, page: yi === pt.match.length - 1 ? pt.page : '' };
            if (yi === 0 && pt.pre) it.pre = pt.pre;
            rows.push({ id, idx: items.length, typed: pt.years.length > 1 ? pt.text + ' (' + pt.years[yi].y + pt.years[yi].letter + ')' : pt.text, k: m.pick.k, sure: m.sure, cands: m.cands });
            items.push(it);
          }));
          S.cites[id] = { items, form: t.form, own: true };
          const cc = r.insertContentControl();
          cc.tag = 'LL:' + id; cc.title = 'LibLande'; cc.appearance = 'BoundingBox';
          if (S.present) S.present.push(id);
          undo.push({ id, typed: t.text });
        }));
        await ctx.sync();
      });
    } catch (e) {
      $('lGo').disabled = false;
      await saveSettings();
      showErr('refsErr', 'Couldn\u2019t link them: ' + wordError(e));
      return;
    }
    await saveSettings();
    LINK.rows = rows.concat(LINK.found.filter(t => !t.ok).map(t => ({ typed: t.text, missing: true })));
    LINK.undo = undo;
    LINK.open = -1;
    $('lGo').disabled = false;
    try { await refreshDocument(); } catch (e) { /* Refresh will */ }
    paintLink();
  }
  async function changeLink(i, k) {
    const r = LINK.rows[i], c = S.cites[r.id];
    if (!c || !c.items[r.idx]) return;
    c.items[r.idx].k = k;
    r.k = k; r.sure = true;
    if (!r.cands.some(x => x.k === k) && S.byKey.get(k)) r.cands = r.cands.concat([S.byKey.get(k)]);
    await saveSettings();
    paintLink();
    try { await refreshDocument(); } catch (e) { showErr('refsErr', wordError(e)); }
  }
  async function undoLinks() {
    hideErr('refsErr');
    try {
      await Word.run(async ctx => {
        const jobs = LINK.undo.map(u => { const ccs = ctx.document.contentControls.getByTag('LL:' + u.id); ccs.load('items'); return { u, ccs }; });
        await ctx.sync();
        jobs.forEach(j => j.ccs.items.forEach(cc => { cc.insertText(j.u.typed, 'Replace'); cc.delete(true); }));
        await ctx.sync();
      });
    } catch (e) { showErr('refsErr', 'Couldn\u2019t undo it: ' + wordError(e)); return; }
    const gone = new Set(LINK.undo.map(u => u.id));
    if (S.present) S.present = S.present.filter(id => !gone.has(id));
    LINK.rows = []; LINK.undo = []; LINK.open = -1;
    try { await refreshDocument(); } catch (e) { /* Refresh will */ }
    scanTyped().catch(() => {});
  }
  // A row's citation selected in the document (one not found: its text).
  async function showLinkRow(row) {
    try {
      await Word.run(async ctx => {
        if (row.missing) {
          const rs = ctx.document.body.search(row.typed, { matchCase: true });
          rs.load('items');
          await ctx.sync();
          if (rs.items.length) rs.items[0].select();
        } else {
          const ccs = ctx.document.contentControls.getByTag('LL:' + row.id);
          ccs.load('items');
          await ctx.sync();
          if (ccs.items.length) ccs.items[0].select();
        }
        await ctx.sync();
      });
    } catch (e) { /* only a convenience */ }
  }

  /* ---- Make plain: citations and the References list as ordinary text */
  // Here, in this document (Word's Undo takes it back); or a copy, opened
  // in a new window for you to save where you like, this one staying as
  // it is.
  async function convertPlain() {
    hideErr('refsErr');
    $('plainAsk').hidden = true;
    let n = 0, list = false;
    try {
      await Word.run(async ctx => {
        const ccs = ctx.document.contentControls;
        ccs.load('items/tag');
        await ctx.sync();
        ccs.items.filter(c => /^LL:/.test(c.tag || '')).forEach(c => { if (c.tag === 'LL:refs') list = true; else n++; c.delete(true); });
        await ctx.sync();
      });
    } catch (e) { showErr('refsErr', 'Couldn\u2019t convert them: ' + wordError(e)); return; }
    S.present = [];
    S.hasRefs = false;
    paintRefs();
    paintResults();
    showErr('refsErr', 'Converted ' + n + ' citation' + (n === 1 ? '' : 's') + (list ? ' and the References list' : '') + ' to plain text.');
    $('refsErr').classList.add('ok');
  }
  // The document as Word has it now (.docx), in slices.
  function documentBytes() {
    return new Promise((ok, no) => {
      Office.context.document.getFileAsync(Office.FileType.Compressed, { sliceSize: 4194304 }, res => {
        if (res.status !== Office.AsyncResultStatus.Succeeded) { no(new Error(res.error && res.error.message || 'Word didn\u2019t give the document.')); return; }
        const file = res.value, parts = [];
        const next = i => file.getSliceAsync(i, r => {
          if (r.status !== Office.AsyncResultStatus.Succeeded) { file.closeAsync(); no(new Error(r.error && r.error.message || 'Word didn\u2019t give the document.')); return; }
          parts.push(new Uint8Array(r.value.data));
          if (i + 1 < file.sliceCount) next(i + 1);
          else { file.closeAsync(); ok(new Blob(parts)); }
        });
        next(0);
      });
    });
  }
  let jszip = null;
  function loadJSZip() {
    return jszip || (jszip = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = '../vendor/jszip/3.10.2/jszip.min.js';
      s.onload = () => ok(window.JSZip); s.onerror = () => { jszip = null; no(new Error('The zip reader didn\u2019t load. Are you online?')); };
      document.head.appendChild(s);
    }));
  }
  // LibLande's content controls taken out of a .docx's XML, their text kept.
  function unwrapControls(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    let n = 0;
    [...doc.getElementsByTagNameNS(W_NS, 'sdt')].reverse().forEach(sdt => {
      const tag = [...sdt.childNodes].find(c => c.localName === 'sdtPr');
      const t = tag && tag.getElementsByTagNameNS(W_NS, 'tag')[0];
      if (!t || !/^LL:/.test(t.getAttributeNS(W_NS, 'val') || t.getAttribute('w:val') || '')) return;
      const content = [...sdt.childNodes].find(c => c.localName === 'sdtContent');
      if (content) while (content.firstChild) sdt.parentNode.insertBefore(content.firstChild, sdt);
      sdt.parentNode.removeChild(sdt);
      n++;
    });
    return { xml: new XMLSerializer().serializeToString(doc), n };
  }
  async function plainCopy() {
    hideErr('refsErr');
    const b = $('plainCopy');
    b.disabled = true;
    let step = 'bringing the citations up to date';
    try {
      await refreshDocument();
      step = 'reading the document';
      const [blob, JSZip] = await Promise.all([documentBytes(), loadJSZip()]);
      step = 'making the copy';
      const zip = await JSZip.loadAsync(blob);
      for (const name of Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n))) {
        const out = unwrapControls(await zip.file(name).async('string'));
        if (out.n) zip.file(name, out.xml);
      }
      // (Nor LibLande's place in it: its panel and its settings, which
      // would have Word look for the add-in where the copy is opened.)
      Object.keys(zip.files).filter(n => /^word\/webextensions\//.test(n)).forEach(n => zip.remove(n));
      const types = zip.file('[Content_Types].xml'), rels = zip.file('_rels/.rels');
      if (types) zip.file('[Content_Types].xml', (await types.async('string')).replace(/<Override [^>]*PartName="\/word\/webextensions\/[^"]*"[^>]*\/>/g, ''));
      if (rels) zip.file('_rels/.rels', (await rels.async('string')).replace(/<Relationship [^>]*Target="[^"]*webextensions\/[^"]*"[^>]*\/>/g, ''));
      const b64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
      step = 'opening the copy';
      await Word.run(async ctx => { ctx.application.createDocument(b64).open(); await ctx.sync(); });
    } catch (e) {
      b.disabled = false;
      showErr('refsErr', 'Couldn\u2019t make the copy (while ' + step + '): ' + wordError(e));
      return;
    }
    b.disabled = false;
    showErr('refsErr', 'The plain copy opened in a new window: save it where you like (\u2318S). This document stays linked.');
    $('refsErr').classList.add('ok');
  }

  /* ---- Notes: your notes and the PDF's highlights, for a work */
  // The works in the open list with notes (the .bib's Notes field, as
  // LibLande keeps them) or a PDF; one opened shows its notes, formatted
  // (marks.js), and the PDF's highlights and notes page by page, read from
  // Drive the first time and kept (until the PDF changes). Quote puts a
  // highlight in the document with its citation and page.
  const NOTE = { open: null, marks: new Map(), text: new Map(), shown: 100 };
  const notesOf = e => String((e.r && e.r.annote != null ? e.r.annote : e.f.annote) || '').replace(/\\\{&\}|\\&/g, '&');
  const pdfOf = e => (e.files || []).find(f => f.id && /\.pdf$/i.test(f.n || f.p || ''));
  function paintNotesList() {
    if (NOTE.open) return;
    const toks = norm($('nq').value.trim()).split(/\s+/).filter(Boolean);
    const keep = listKeys(S.list);
    const counts = LLWord.counts(presentCites());
    // (Every work in the list; or, ticked, those with notes or highlights
    // found, and in this document's list or a group's, those whose PDF is
    // still to be read.)
    const has = e => { const fl = pdfOf(e), m = fl && NOTE.marks.get(fl.id); return notesOf(e).trim() || (m ? m.marks.length : keep && fl); };
    const only = $('nOnly').checked;
    $('nSort').value = S.sort[sortKey()];
    const list = (keep ? [...keep].map(k => S.byKey.get(k)).filter(Boolean) : S.entries.slice())
      .filter(e => !only || has(e))
      .filter(e => !toks.length || toks.every(t => { const fl = pdfOf(e); const hay = norm([e.f.title, firstName(e), e.f.year, notesOf(e), fl ? NOTE.text.get(fl.id) : ''].join(' ')); return hay.includes(t); }))
      .sort(SORTS[S.sort[sortKey()]] || SORTS.author);
    $('nList').innerHTML = list.slice(0, NOTE.shown).map(e => {
      const fl = pdfOf(e), m = fl && NOTE.marks.get(fl.id), n = counts.get(e.k) || 0;
      const chips = (notesOf(e).trim() ? '<span class="chip">Notes</span>' : '') +
        (m && m.marks.length ? '<span class="chip">' + m.marks.length + ' highlight' + (m.marks.length === 1 ? '' : 's') + '</span>' : '');
      return '<div class="nw" data-k="' + esc(e.k) + '" role="button" tabindex="0"><div class="t">' + esc(e.f.title || e.k) + '</div><div class="m">' + esc(metaOf(e)) + '</div>' +
        '<div class="cnts">' + chips + (n ? '<span class="cited">cited ' + n + '\u00d7</span>' : '') + '</div></div>';
    }).join('') || '<div class="empty">' + (toks.length ? 'Nothing matches.' : only ? 'No notes or highlights here.' : 'Nothing here.') + '</div>';
    scanMarks(keep ? list : []);
  }
  // The PDFs of a short list (this document's works, or a group's) read in
  // the background, two at a time, for their highlights; kept, as when a
  // work is opened. (Not the whole library's: thousands of downloads.)
  const SCAN = { queue: [], running: 0, token: 0 };
  function scanMarks(list) {
    const want = list.map(pdfOf).filter(fl => fl && !NOTE.marks.has(fl.id));
    const key = want.map(f => f.id).join();
    if (key === SCAN.key && SCAN.running) return;
    SCAN.key = key;
    SCAN.queue = want.slice(0, 300);
    SCAN.token++;
    for (let i = SCAN.running; i < 2; i++) scanNext(SCAN.token);
  }
  async function scanNext(token) {
    const fl = SCAN.queue.shift();
    if (!fl || token !== SCAN.token || $('pNotes').hidden) return;
    SCAN.running++;
    try {
      const kept = await idb.getIn('marks', fl.id);
      if (kept) { NOTE.marks.set(fl.id, kept); NOTE.text.set(fl.id, kept.marks.map(m => m.text + ' ' + m.note).join(' ')); } else await marksOf(fl);
    } catch (e) { /* tried again when opened */ }
    SCAN.running--;
    if (token !== SCAN.token) return;
    clearTimeout(SCAN.paint);
    // (The list shown again now and then; that also picks up where this
    // left off.)
    SCAN.paint = setTimeout(() => { if (!NOTE.open && !$('pNotes').hidden) paintNotesList(); }, 400);
    scanNext(token);
  }
  let pdfjs = null;
  function loadPdfJs() {
    return pdfjs || (pdfjs = import(new URL('../vendor/pdf.js/6.4.299/pdf.min.mjs', location.href).href).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.js/6.4.299/pdf.worker.min.mjs', location.href).href;
      return lib;
    }).catch(e => { pdfjs = null; throw new Error('The PDF reader didn\u2019t load. Are you online?'); }));
  }
  // A PDF's highlights and notes, top of each page first (as LibLande's
  // own Notes and Annotations have them).
  async function readMarks(doc) {
    const marks = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const anns = (await page.getAnnotations()).filter(a => MARK_NAMES[a.subtype]);
      if (!anns.length) continue;
      let items = null;
      const onPage = [];
      for (const a of anns) {
        let text = '';
        const note = a.subtype === 'Highlight' && isNoteOpacity(a.opacity);
        if (a.quadPoints && a.quadPoints.length && !note) {
          items = items || (await page.getTextContent()).items;
          text = textInQuads(items, a.quadPoints);
        }
        const c = a.color;
        const m = { page: n, y: a.rect ? a.rect[3] : null, color: c && c.length >= 3 ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')' : null, text, note: (a.contentsObj && a.contentsObj.str) || '' };
        if (m.text || m.note) onPage.push(m);
      }
      onPage.sort((p, q) => (q.y || 0) - (p.y || 0));
      marks.push(...onPage);
    }
    return marks;
  }
  async function marksOf(fl) {
    let stamp = '';
    try { stamp = (await (await drive('files/' + encodeURIComponent(fl.id) + '?fields=modifiedTime')).json()).modifiedTime || ''; } catch (e) { /* offline: what's kept */ }
    let r = NOTE.marks.get(fl.id) || await idb.getIn('marks', fl.id);
    if (r && (!stamp || r.stamp === stamp)) { NOTE.marks.set(fl.id, r); return r; }
    const lib = await loadPdfJs();
    const data = new Uint8Array(await (await drive('files/' + encodeURIComponent(fl.id) + '?alt=media')).arrayBuffer());
    const task = lib.getDocument({ data, cMapUrl: new URL('../vendor/pdf.js/6.4.299/cmaps/', location.href).href, cMapPacked: true });
    const doc = await task.promise;
    try {
      let labels = null;
      try { labels = await doc.getPageLabels(); } catch (e) { labels = null; }
      r = { stamp, marks: await readMarks(doc), labels };
    } finally { try { task.destroy(); } catch (e) { /* gone */ } }
    NOTE.marks.set(fl.id, r);
    NOTE.text.set(fl.id, r.marks.map(m => m.text + ' ' + m.note).join(' '));
    idb.putIn('marks', fl.id, r);
    return r;
  }
  const pageLabel = (r, n) => (r.labels && r.labels[n - 1]) || String(n);
  async function openNotes(k) {
    const e = S.byKey.get(k);
    if (!e) return;
    NOTE.open = k;
    $('nList').hidden = true;
    $('nWork').hidden = false;
    $('nBox').scrollTop = 0;
    const md = notesOf(e).trim(), fl = pdfOf(e);
    $('nWork').innerHTML = '<div class="backbar"><button type="button" class="back" id="nBack"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>All notes</button></div>' +
      '<div class="nhead"><div class="t">' + esc(e.f.title || e.k) + '</div><div class="m">' + esc(metaOf(e)) + '</div></div>' +
      '<div class="nsec">My notes<button type="button" id="nEdit">Edit in LibLande</button></div>' +
      (md ? '<div class="mynote">' + mdToHtml(md) + '</div>' : '<p class="note">No notes yet.</p>') +
      '<div class="nsec" id="nHlHead">Highlights</div><div id="nHl">' + (fl ? '<p class="note">Reading the PDF\u2026</p>' : '<p class="note">No PDF.</p>') + '</div>';
    if (!fl) return;
    let r;
    try { r = await marksOf(fl); } catch (err) {
      if (NOTE.open === k) $('nHl').innerHTML = '<p class="note">Couldn\u2019t read the PDF: ' + esc((err && err.message) || err) + '</p>';
      return;
    }
    if (NOTE.open !== k) return;
    $('nHlHead').firstChild.textContent = 'Highlights \u00b7 ' + r.marks.length;
    let last = 0, h = '';
    r.marks.forEach((m, i) => {
      if (m.page !== last) { last = m.page; h += '<div class="pgh">Page ' + esc(pageLabel(r, m.page)) + '</div>'; }
      h += '<div class="hlt"><span class="bar"' + (m.color ? ' style="background:' + esc(m.color) + '"' : '') + '></span><span class="q">' +
        (m.text ? '\u201c' + esc(m.text) + '\u201d' : '') + (m.note ? '<span class="note2">' + esc(m.note) + '</span>' : '') + '</span>' +
        (m.text ? '<button type="button" class="qb" data-m="' + i + '">Quote</button>' : '') + '</div>';
    });
    $('nHl').innerHTML = h || '<p class="note">No highlights or notes in the PDF yet.</p>';
  }
  function closeNotes() {
    NOTE.open = null;
    $('nWork').hidden = true;
    $('nList').hidden = false;
    paintNotesList();
  }
  // A highlight in the document at the cursor: "the passage" (Author, 2011,
  // p. 4), the citation LibLande's.
  async function quoteMark(k, m, page) {
    const c = { items: [{ k, page: page ? 'p. ' + page : '' }], form: 'paren', own: false };
    const id = newId();
    try {
      await styleReady();
      const cite = renderAll(Object.assign({}, presentCites(), { [id]: c })).texts[id];
      await Word.run(async ctx => {
        const sel = ctx.document.getSelection();
        const inside = sel.parentContentControlOrNullObject;
        inside.load('tag');
        await ctx.sync();
        const at = !inside.isNullObject && /^LL:/.test(inside.tag) ? inside.getRange('After') : sel;
        const q = at.insertText('\u201c' + m.text.trim() + '\u201d ', 'Replace');
        const cc = q.insertText(cite, 'After').insertContentControl();
        cc.tag = 'LL:' + id; cc.title = 'LibLande'; cc.appearance = 'BoundingBox';
        await ctx.sync();
        cc.getRange('After').select();
        await ctx.sync();
      });
    } catch (e) { alertNotes('Couldn\u2019t quote it: ' + wordError(e)); return; }
    S.cites[id] = c;
    if (S.present) S.present.push(id);
    S.skipEdit = id;
    await saveSettings();
    try { await refreshDocument(); } catch (e) { /* Refresh will */ }
  }
  function alertNotes(msg) { const p = document.createElement('div'); p.className = 'err'; p.textContent = msg; $('nWork').prepend(p); }

  /* ---- the two lists, and search */
  // "In this document" (the works it cites) and "Library" (all of it), each
  // in its own order (author, year, or date added, newest first); what's
  // typed searches the list that's open, and says how many more the library
  // has. A document citing nothing opens on Library.
  const firstName = e => { const n = (e.a && e.a[0]) || (e.e && e.e[0]); return n ? n[0] : (e.f.title || ''); };
  const SORTS = {
    author: (a, b) => cmpStr(norm(firstName(a)), norm(firstName(b))) || cmpStr(a.f.year || '', b.f.year || ''),
    year: (a, b) => cmpStr(b.f.year || '', a.f.year || '') || cmpStr(norm(firstName(a)), norm(firstName(b))),
    added: (a, b) => cmpStr(b.f['date-added'] || '', a.f['date-added'] || ''),
  };
  const matches = text => {
    const toks = norm(text).split(/\s+/).filter(Boolean);
    return toks.length ? S.index.filter(x => toks.every(t => x.hay.includes(t))).map(x => x.e) : S.entries.slice();
  };
  function search() {
    const text = $('q').value.trim();
    const counts = LLWord.counts(presentCites());
    if (!S.list) S.list = counts.size ? 'doc' : 'lib';
    if (/^g:/.test(S.list) && !S.tabsG.some(t => 'g:' + t.name === S.list)) S.list = 'lib';
    const all = matches(text);
    const keep = listKeys(S.list);
    const inList = keep ? all.filter(e => keep.has(e.k)) : all;
    S.results = inList.sort(SORTS[S.sort[sortKey()]] || SORTS.author);
    S.more = keep && text ? all.length - inList.length : 0;
    S.shown = 100;
    S.marker = S.results.length && text ? 0 : -1;
    paintLists();
    $('sort').value = S.sort[sortKey()];
    paintResults();
    if (!$('pNotes').hidden) { if (NOTE.open) closeNotes(); else paintNotesList(); }
  }
  function metaOf(e) {
    const ns = (e.a && e.a.length ? e.a : e.e) || [];
    const ini = n => n[0] + (n[1] ? ', ' + n[1].split(/\s+/).map(w => w[0] ? w[0].toUpperCase() + '.' : '').join(' ') : '');
    const who = ns.length === 0 ? '' : ns.length === 1 ? ini(ns[0]) : ns.length === 2 ? ini(ns[0]) + ' & ' + ini(ns[1]) : ini(ns[0]) + ' et al.';
    return [who + (e.a && e.a.length ? '' : ns.length ? ' (Ed' + (ns.length > 1 ? 's' : '') + '.)' : ''), e.f.year || 'n.d.', e.f.journal || e.f.booktitle || e.f.publisher || ''].filter(Boolean).join(' \u00b7 ');
  }
  function paintResults() {
    const counts = LLWord.counts(presentCites());
    const picked = new Set(S.chosen.map(c => c.k));
    const text = $('q').value.trim();
    let html = '';
    if (!S.results.length) {
      html = text && !S.more ? '<div class="empty">No matches.<br><button class="btn" type="button" id="addLib">Add to LibLande\u2026</button></div>'
        : !text && S.list === 'doc' ? '<div class="empty">Nothing cited yet.</div>' : '';
    }
    // (A long list a hundred at a time, more as it's scrolled.)
    html += S.results.slice(0, S.shown).map((e, i) => {
      const n = counts.get(e.k) || 0;
      return '<div class="it' + (i === S.marker ? ' kb' : '') + '" role="option" aria-selected="' + picked.has(e.k) + '" aria-checked="' + picked.has(e.k) + '" data-k="' + esc(e.k) + '" id="r' + i + '">' +
        '<span class="box" aria-hidden="true">' + (picked.has(e.k) ? '\u2713' : '') + '</span>' +
        '<div class="tx"><div class="t">' + esc(e.f.title || e.k) + '</div><div class="m">' + esc(metaOf(e)) + '</div></div>' +
        (n ? '<span class="cited">cited ' + n + '\u00d7</span>' : '') + '</div>';
    }).join('');
    $('res').innerHTML = html;
    $('other').hidden = !S.more;
    if (S.more) $('other').innerHTML = esc(S.more + (S.results.length ? ' more' : '') + ' in the library') + '<button type="button" id="showLib">Show</button>';
    const kb = $('r' + S.marker);
    if (kb) kb.scrollIntoView({ block: 'nearest' });
    const add = $('addLib');
    if (add) add.addEventListener('click', () => addInLibLande($('q').value));
  }
  function chooseList(which) {
    S.list = which;
    search();
    $('resBox').scrollTop = 0;
  }
  // The works in a list (null for the whole library): the document's, or a
  // group's (as the library has it, or as it was when its tab was made).
  function listKeys(list) {
    if (list === 'doc') return new Set(LLWord.counts(presentCites()).keys());
    if (!/^g:/.test(list || '')) return null;
    const name = list.slice(2), g = S.groups.find(x => x.name === name), t = S.tabsG.find(x => x.name === name);
    return new Set((g && g.keys) || (t && t.keys) || []);
  }
  const sortKey = () => (/^g:/.test(S.list) ? 'grp' : S.list);
  // The list tabs, on Cite and Notes: Document, Library, a tab for each of
  // the document's groups (kept with it), and "+" for another.
  function paintLists() {
    const short = S.tabsG.length > 0;
    const n = list => { const k = listKeys(list); return (k ? [...k].filter(x => S.byKey.has(x)).length : S.entries.length).toLocaleString('en-US'); };
    const tab = (list, name, x) => '<button type="button" role="tab" data-list="' + esc(list) + '" aria-selected="' + (S.list === list) + '">' + esc(name) + '<i>' + n(list) + '</i>' +
      (x && S.list === list ? '<span class="gx" data-drop="' + esc(list) + '" role="button" aria-label="Remove this tab" title="Remove this tab (the group stays in LibLande)">\u2715</span>' : '') + '</button>';
    const html = tab('doc', short ? 'Document' : 'In this document') + tab('lib', 'Library') +
      S.tabsG.map(t => tab('g:' + t.name, t.name.replace(/^\u2605\s*/, '\u2605 '), true)).join('') +
      '<button type="button" class="add" data-add aria-label="Add a group" title="Add a group">+</button>';
    ['lists', 'nLists'].forEach(id => { if ($(id)) $(id).innerHTML = html; });
  }
  function onListsClick(ev) {
    const drop = ev.target.closest('[data-drop]');
    if (drop) { dropGroupTab(drop.dataset.drop.slice(2)); return; }
    if (ev.target.closest('[data-add]')) { openGroupMenu(ev.target.closest('[data-add]')); return; }
    const b = ev.target.closest('button[data-list]');
    if (b) chooseList(b.dataset.list);
  }

  /* ---- groups: one as a tab, kept with the document; or a new one */
  function openGroupMenu(anchor) {
    const m = $('gmenu');
    m.hidden = false;
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    $('gq').value = '';
    $('gNew').hidden = true;
    paintGroupMenu();
    $('gq').focus();
  }
  function closeGroupMenu() { $('gmenu').hidden = true; }
  function paintGroupMenu() {
    const toks = norm($('gq').value.trim()).split(/\s+/).filter(Boolean);
    const have = new Set(S.tabsG.map(t => t.name));
    const list = S.groups.filter(g => !have.has(g.name) && toks.every(t => norm(g.name).includes(t)))
      .sort((a, b) => (/^\u2605/.test(a.name) - /^\u2605/.test(b.name)) || cmpStr(norm(a.name), norm(b.name)));
    $('gList').innerHTML = list.map(g => '<button type="button" class="g" data-g="' + esc(g.name) + '"><span class="gico">' + (/^\u2605/.test(g.name) ? '\u2605' : '\u25a4') + '</span><span class="n">' + esc(g.name.replace(/^\u2605\s*/, '')) + '</span><span class="c">' + g.keys.length + '</span></button>').join('') ||
      '<div class="note" style="padding:6px">' + (S.groups.length ? 'No other groups match.' : 'Your library has no groups yet.') + '</div>';
    const n = LLWord.counts(presentCites()).size;
    $('gMake').hidden = !n;
    $('gMake').textContent = 'New group from this document\u2019s ' + n + ' work' + (n === 1 ? '' : 's') + '\u2026';
  }
  function addGroupTab(name, keys) {
    const g = S.groups.find(x => x.name === name);
    S.tabsG.push({ name, keys: (keys || (g && g.keys) || []).slice() });
    saveSettings();
    closeGroupMenu();
    chooseList('g:' + name);
  }
  function dropGroupTab(name) {
    S.tabsG = S.tabsG.filter(t => t.name !== name);
    saveSettings();
    if (S.list === 'g:' + name) S.list = 'lib';
    search();
  }
  // A new LibLande group of the works this document cites, written into the
  // .bib by LibLande's own code (edits.js, with its checks and a backup
  // copy first), loaded here when first wanted.
  let editsReady = null;
  function loadEdits() {
    return editsReady || (editsReady = (async () => {
      window.LIBLANDE_BUILD_WORKER = false;
      for (const f of ['../build.js', '../builder.js', '../edits.js']) {
        await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = f + '?v=' + encodeURIComponent(VERSION); sc.onload = ok; sc.onerror = () => no(new Error('LibLande\u2019s editing code didn\u2019t load. Are you online?')); document.head.appendChild(sc); });
      }
      const io = async (path, opts, base) => {
        if (!tokenOk()) await signIn('');
        const r = await fetch((base || API) + path, Object.assign({}, opts, { headers: Object.assign({}, (opts || {}).headers, { Authorization: 'Bearer ' + token.value }) }));
        if (!r.ok) {
          let why = '';
          try { why = ((await r.clone().json()).error || {}).message || ''; } catch (e) { /* none */ }
          throw Object.assign(new Error('Google Drive answered ' + r.status + (why ? ': ' + why : '.')), { status: r.status });
        }
        return r;
      };
      const builder = window.makeLiblandeBuilder({ drive: io, reconcile: async () => {} });
      return window.makeLiblandeEdits({ drive: io, builder, getToken: async force => { if (force || !tokenOk()) await signIn(''); return token.value; } });
    })().catch(e => { editsReady = null; throw e; }));
  }
  const pad2 = n => String(n).padStart(2, '0');
  function bibdeskTime(d = new Date()) {
    const off = -d.getTimezoneOffset(), a = Math.abs(off);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + ' ' + (off >= 0 ? '+' : '-') + pad2(Math.floor(a / 60)) + pad2(a % 60);
  }
  const fileTime = (d = new Date()) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  function docName() {
    try { const u = Office.context.document.url || ''; const n = decodeURIComponent(u.split(/[\\/]/).pop() || '').replace(/\.docx?$/i, ''); if (n) return n; } catch (e) { /* none */ }
    return 'This paper';
  }
  function askGroupName() {
    $('gNew').hidden = false;
    $('gName').value = docName();
    $('gErr').hidden = true;
    $('gName').focus();
    $('gName').select();
  }
  async function makeGroup() {
    const name = $('gName').value.trim();
    const fail = m => { $('gErr').textContent = m; $('gErr').hidden = false; $('gMakeGo').disabled = false; };
    if (!name) return fail('Give the group a name.');
    if (name.length > 120) return fail('That name is too long (120 characters at most).');
    if (S.groups.some(g => g.name === name)) return fail('There\u2019s already a group called \u201c' + name + '\u201d.');
    const keys = [...LLWord.counts(presentCites()).keys()].filter(k => S.byKey.has(k));
    $('gMakeGo').disabled = true;
    try {
      const edits = await loadEdits();
      await edits.createGroup({ name, keys, modified: bibdeskTime(), backupName: fileTime() });
    } catch (e) { fail('Couldn\u2019t make it: ' + ((e && e.message) || e)); return; }
    $('gMakeGo').disabled = false;
    S.groups.push({ name, keys: keys.slice() });
    addGroupTab(name, keys);
  }

  /* ---- the citation being made */
  // (Each work's own words before it: "see also" before the second. None
  // in a sentence, Author (2011).)
  const currentCite = () => ({
    items: S.chosen.map(c => Object.assign({ k: c.k, page: c.page || '' }, S.form !== 'narr' && String(c.pre || '').trim() ? { pre: String(c.pre).trim() } : {})),
    form: S.form, own: S.own,
  });
  // APA's order; the words before the first work stay first, before
  // whichever work that now is (they were the whole citation's).
  // Or by year, the oldest first (by authors within a year): an order of
  // one's own, as APA sees it.
  const yearOf = c => { const e = S.byKey.get(c.k); return e ? (origYear(e) || ((e.f.year || '').trim()) || '9999') : '9999'; };
  function sortChosen(how) {
    const first = S.chosen.length ? S.chosen[0].pre || '' : '';
    if (S.chosen.length) S.chosen[0].pre = '';
    S.chosen = LLWord.order(S.chosen, S.byKey);
    if (how === 'year') S.chosen = S.chosen.map((c, i) => [c, i]).sort((a, b) => cmpStr(yearOf(a[0]), yearOf(b[0])) || a[1] - b[1]).map(x => x[0]);
    if (S.chosen.length) S.chosen[0].pre = first;
  }
  const isByYear = () => S.chosen.every((c, i) => !i || cmpStr(yearOf(S.chosen[i - 1]), yearOf(c)) <= 0);
  function toggle(k) {
    const i = S.chosen.findIndex(c => c.k === k);
    if (i >= 0) S.chosen.splice(i, 1); else S.chosen.push({ k, page: '', pre: '' });
    if (!S.own) sortChosen();
    S.dirty = true;
    paintChosen();
    paintResults();
  }
  function clearChosen() { S.chosen = []; S.own = false; paintChosen(); }
  const label = c => { const e = S.byKey.get(c.k); if (!e) return c.k; const t = LLWord.render({ x: { items: [{ k: c.k }], form: 'paren' } }, S.byKey).texts.x; return t.slice(1, -1); };
  // The card: its bar says what's being done and holds the citation as it
  // will read (changing as it's edited); under it, each work on two lines
  // (its name; the words before it and its page, labelled), the form, and
  // Insert or Update.
  function paintChosen() {
    const n = S.chosen.length;
    $('foot').hidden = !n && !S.editing;
    $('pCite').classList.toggle('editing', !!S.editing);
    if (!S.editing) $('pCite').classList.remove('browsing');
    $('gLabel').textContent = (S.editing ? 'Editing' : 'New citation') + ' \u00b7 ' + n + ' work' + (n === 1 ? '' : 's');
    $('cardX').title = S.editing ? 'Stop editing (Esc)' : 'Clear (Esc)';
    $('remove').hidden = !S.editing;
    $('insert').firstChild.textContent = S.editing ? 'Update' : 'Insert';
    $('insert').disabled = !n;
    $('q').placeholder = S.editing ? 'Add a work\u2026' : 'Search your library';
    paintSize();
    $('chosen').innerHTML = '';
    $('prev').textContent = n ? '' : '(no works)';
    $('prevNote').hidden = true;
    if (!n) return;
    $('order').hidden = n < 2;
    $('az').setAttribute('aria-pressed', String(!S.own));
    $('byYear').setAttribute('aria-pressed', String(S.own && isByYear()));
    $('chosen').innerHTML = S.chosen.map((c, i) =>
      '<div class="ch" data-i="' + i + '">' + (n > 1 ? '<span class="grip" aria-label="Drag to reorder" title="Drag to reorder">\u22ee\u22ee</span>' : '<span></span>') +
      '<span class="nm">' + esc(label(c)) + '</span>' +
      '<button class="x" type="button" data-i="' + i + '" aria-label="Remove ' + esc(label(c)) + '">\u2715</button>' +
      '<div class="fl">' +
      (S.form !== 'narr' ? '<label>before <input class="bf" data-i="' + i + '" data-f="pre" value="' + esc(c.pre || '') + '" list="preList" aria-label="Words before ' + esc(label(c)) + '"></label>' : '') +
      '<label>page <input class="pg" data-i="' + i + '" data-f="page" value="' + esc(c.page) + '" aria-label="Page for ' + esc(label(c)) + '"></label></div></div>').join('');
    const y = (() => { const e = S.byKey.get(S.chosen[0].k); return e ? (e.f.year || 'n.d.') : '2011'; })();
    const names = { paren: '(Author, ' + y + ')', narr: 'Author (' + y + ')', year: '(' + y + ')' };
    document.querySelectorAll('#forms button').forEach(b => { b.textContent = names[b.dataset.form]; b.setAttribute('aria-checked', String(b.dataset.form === S.form)); });
    paintPreview();
  }
  // The card's size: 1 (its bar and buttons), 2 (a few works) or 3 (up to
  // the search box); the one chosen last kept. While searching, 1, to give
  // the results the room.
  S.size = Math.max(1, Math.min(3, +store.get('cardSize', 2) || 2));
  const sizeNow = () => (S.searching && S.chosen.length ? 1 : S.size);
  function paintSize() {
    const z = sizeNow();
    $('foot').dataset.size = String(z);
    $('pCite').classList.toggle('full', z === 3 && !$('foot').hidden);
  }
  function setSize(z) {
    S.size = Math.max(1, Math.min(3, z));
    store.set('cardSize', S.size);
    S.searching = false;
    $('pCite').classList.remove('searching');
    paintSize();
  }
  function setSearching(on) {
    if (S.searching === on) return;
    S.searching = on;
    $('pCite').classList.toggle('searching', on);
    paintSize();
  }
  // The handle: dragged up, bigger; down, smaller; clicked, the next size.
  function handleDrag(ev) {
    ev.preventDefault();
    const y0 = ev.clientY, z0 = sizeNow();
    let moved = false;
    const move = e => {
      const steps = Math.round((y0 - e.clientY) / 60);
      if (steps) moved = true;
      if (moved) { $('foot').dataset.size = String(Math.max(1, Math.min(3, z0 + steps))); $('pCite').classList.toggle('full', $('foot').dataset.size === '3'); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setSize(moved ? +$('foot').dataset.size : z0 % 3 + 1);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function paintPreview() {
    if (!S.chosen.length) return;
    const id = S.editing || '__new';
    // (The others as they are now: worked out once while they don't change.)
    const key = S.style + '\u0001' + JSON.stringify(presentCites());
    if (!paintPreview.memo || paintPreview.memo.key !== key) paintPreview.memo = { key, texts: renderAll(presentCites(), S.byKey).texts };
    const before = paintPreview.memo.texts;
    const out = renderAll(Object.assign({}, presentCites(), { [id]: currentCite() }), S.byKey);
    $('prev').textContent = out.texts[id];
    const changed = Object.keys(before).filter(x => x !== id && before[x] !== out.texts[x]).length;
    $('prevNote').hidden = !changed;
    $('prevNote').textContent = 'Also changes ' + changed + ' other citation' + (changed === 1 ? '' : 's') + (S.style === 'apa' ? ' (2011a, 2011b, or more names)' : '');
  }

  /* ---- dragging works into an order of one's own */
  // The row follows the pointer; the others slide up or down to make room
  // where it would go, and on letting go it settles into that place.
  function dragStart(ev) {
    const grip = ev.target.closest('.grip');
    if (!grip) return;
    ev.preventDefault();
    const row = grip.closest('.ch'), list = $('chosen');
    const rows = [...list.children], from = rows.indexOf(row);
    const tops = rows.map(r => r.offsetTop), step = rows.length > 1 ? tops[1] - tops[0] : row.offsetHeight;
    const startY = ev.clientY, minDy = tops[0] - tops[from], maxDy = tops[rows.length - 1] - tops[from];
    let to = from;
    row.classList.add('drag');
    rows.forEach(r => { if (r !== row) r.style.transition = 'transform .15s ease'; });
    try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* fine without */ }
    const move = e => {
      const dy = Math.max(minDy - step / 3, Math.min(maxDy + step / 3, e.clientY - startY));
      row.style.transform = 'translateY(' + dy + 'px)';
      to = Math.max(0, Math.min(rows.length - 1, Math.round((tops[from] + dy - tops[0]) / step)));
      rows.forEach((r, i) => {
        if (r === row) return;
        const shift = from < to && i > from && i <= to ? -step : from > to && i >= to && i < from ? step : 0;
        r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      // (Into its place, then the list as it now is.)
      row.style.transition = 'transform .15s ease';
      row.style.transform = 'translateY(' + (tops[to] - tops[from]) + 'px)';
      setTimeout(() => {
        if (to !== from) {
          const [c] = S.chosen.splice(from, 1);
          S.chosen.splice(to, 0, c);
          S.own = true;
          S.dirty = true;
        }
        paintChosen();
      }, 160);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* ---- References tab */
  function paintRefs() {
    const cites = presentCites(), n = Object.keys(cites).length;
    const works = new Set(Object.values(cites).flatMap(c => c.items.map(it => it.k))).size;
    $('refCount').textContent = n + ' citation' + (n === 1 ? '' : 's') + ' \u00b7 ' + works + ' work' + (works === 1 ? '' : 's');
    $('refsBtn').textContent = S.hasRefs ? 'Go to list' : 'Insert References here';
    $('plainCard').hidden = !n && !S.hasRefs;
  }

  /* ---- errors, the header, views */
  function showErr(id, msg) { $(id).textContent = msg; $(id).hidden = false; if (id === 'citeErr') $('foot').hidden = false; }
  function hideErr(id) { $(id).hidden = true; $(id).classList.remove('ok'); }
  function view(name) { ['vSignin', 'vMain', 'vLoading'].forEach(v => { $(v).hidden = v !== name; }); }
  function paintAccount() {
    const email = store.get('email', '');
    $('acct').hidden = !email && !tokenOk();
    $('acct').textContent = (email[0] || '?').toUpperCase();
    $('acct').title = email;
    $('menuWho').textContent = email || 'Signed in';
  }
  function paintOffline() { $('offline').hidden = navigator.onLine; }
  // LibLande, or a link into it: "#add=<what to look for>" opens Add with
  // it looked up; "#open=<cite key>&view=notes" opens a work's Notes.
  const openLibLande = (hash = '') => { try { Office.context.ui.openBrowserWindow(LIBLANDE + hash); } catch (e) { window.open(LIBLANDE + hash, '_blank'); } };
  const addInLibLande = what => openLibLande(what && what.trim() ? '#add=' + encodeURIComponent(what.trim()) : '');

  async function reload(force) {
    try {
      if (!tokenOk()) await signIn();
      $('loadingText').textContent = 'Loading library\u2026';
      if (!S.entries.length) view('vLoading');
      await fetchLibrary(force);
      whoAmI();
      view('vMain');
      search();
      refreshDocument().catch(() => {});
      readZotero();
    } catch (e) {
      if (S.entries.length) { view('vMain'); showErr('citeErr', e.message); }
      else { view('vSignin'); $('signinNote').textContent = e.message; }
    }
  }

  /* ---- wiring */
  function wire() {
    $('q').addEventListener('input', () => { if ($('q').value.trim()) setSearching(true); search(); });
    $('q').addEventListener('focus', () => setSearching(true));
    $('q').addEventListener('blur', () => { if (!$('q').value.trim()) setTimeout(() => { if (document.activeElement !== $('q') && !$('q').value.trim()) setSearching(false); }, 200); });
    // (Editing, the lists are grayed out: a click in them brings them back
    // to full strength, without doing anything else.)
    $('pCite').addEventListener('click', ev => {
      const p = $('pCite');
      if (!p.classList.contains('editing') || p.classList.contains('searching') || p.classList.contains('browsing') || !ev.target.closest('.lists')) return;
      ev.preventDefault();
      ev.stopPropagation();
      p.classList.add('browsing');
    }, true);
    $('foot').addEventListener('pointerdown', () => $('pCite').classList.remove('browsing'));
    $('lists').addEventListener('click', onListsClick);
    $('selCard').addEventListener('click', onSelCardClick);
    $('selCard').addEventListener('input', onSelCardInput);
    $('nLists').addEventListener('click', onListsClick);
    $('gq').addEventListener('input', paintGroupMenu);
    $('gList').addEventListener('click', ev => { const g = ev.target.closest('[data-g]'); if (g) addGroupTab(g.dataset.g); });
    $('gMake').addEventListener('click', askGroupName);
    $('gMakeGo').addEventListener('click', makeGroup);
    $('gName').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); makeGroup(); } });
    $('gmenu').addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); closeGroupMenu(); } });
    document.addEventListener('pointerdown', ev => { if (!$('gmenu').hidden && !$('gmenu').contains(ev.target) && !ev.target.closest('[data-add]')) closeGroupMenu(); });
    $('sort').addEventListener('change', () => { S.sort[sortKey()] = $('sort').value; store.set('sorts', S.sort); search(); });
    $('other').addEventListener('click', ev => { if (ev.target.closest('#showLib')) chooseList('lib'); });
    $('resBox').addEventListener('scroll', () => {
      const b = $('resBox');
      if (S.results.length > S.shown && b.scrollTop + b.clientHeight > b.scrollHeight - 300) { S.shown += 100; paintResults(); }
    });
    $('handle').addEventListener('pointerdown', handleDrag);
    $('gbar').addEventListener('click', ev => { if (!ev.target.closest('#cardX')) setSize(sizeNow() % 3 + 1); });
    $('cardX').addEventListener('click', () => { if (S.editing) leaveEdit(); else { clearChosen(); paintResults(); } });
    $('q').addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (!S.results.length) return;
        S.marker = Math.max(0, Math.min(S.results.length - 1, S.marker + (ev.key === 'ArrowDown' ? 1 : -1)));
        paintResults();
      } else if (ev.key === 'Enter' && !(ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        if (S.results[S.marker]) toggle(S.results[S.marker].k);
      } else if (ev.key === 'Escape') {
        if ($('q').value) { $('q').value = ''; search(); }
        else if (S.searching && S.chosen.length) { setSearching(false); $('q').blur(); }
        else if (S.editing) leaveEdit(); else { clearChosen(); paintResults(); }
      }
    });
    $('res').addEventListener('click', ev => {
      const it = ev.target.closest('.it');
      if (it) { S.marker = [...$('res').querySelectorAll('.it')].indexOf(it); toggle(it.dataset.k); }
    });
    $('chosen').addEventListener('input', ev => {
      const i = ev.target.dataset.i, f = ev.target.dataset.f;
      if (i == null || !f) return;
      S.chosen[+i][f] = ev.target.value;
      S.dirty = true;
      // (Words before a later work: the order stays as it is.)
      if (f === 'pre' && +i > 0 && ev.target.value.trim() && !S.own) { S.own = true; $('az').setAttribute('aria-pressed', 'false'); }
      paintPreview();
    });
    $('chosen').addEventListener('click', ev => {
      const x = ev.target.closest('.x');
      if (x) { S.chosen.splice(+x.dataset.i, 1); S.dirty = true; paintChosen(); paintResults(); }
    });
    $('chosen').addEventListener('pointerdown', dragStart);
    $('az').addEventListener('click', () => { S.own = false; sortChosen(); S.dirty = true; paintChosen(); });
    $('byYear').addEventListener('click', () => { sortChosen('year'); S.own = true; S.dirty = true; paintChosen(); });
    $('forms').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (b) { S.form = b.dataset.form; S.dirty = true; paintChosen(); }
    });
    $('insert').addEventListener('click', () => (S.editing ? updateCitation() : insertCitation()));
    $('remove').addEventListener('click', removeCitation);
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && S.chosen.length && !$('pCite').hidden) { ev.preventDefault(); if (S.editing) updateCitation(); else insertCitation(); }
      if (ev.key === 'Escape' && !$('menu').hidden) { $('menu').hidden = true; $('acct').setAttribute('aria-expanded', 'false'); }
    });
    const tab = which => {
      ['cite', 'refs', 'notes'].forEach(t => {
        const id = t[0].toUpperCase() + t.slice(1);
        $('t' + id).setAttribute('aria-selected', String(which === t));
        $('p' + id).hidden = which !== t;
      });
      if (which === 'refs') { paintRefs(); readZotero(); if (!LINK.rows.length) scanTyped().catch(() => {}); refreshDocument().catch(e => showErr('refsErr', wordError(e))); }
      else if (which === 'notes') { paintLists(); paintNotesList(); }
      else $('q').focus();
    };
    $('tNotes').addEventListener('click', () => tab('notes'));
    $('nOnly').checked = !!store.get('notesOnly', false);
    $('nOnly').addEventListener('change', () => { store.set('notesOnly', $('nOnly').checked); NOTE.shown = 100; paintNotesList(); });
    $('nSort').addEventListener('change', () => { S.sort[sortKey()] = $('nSort').value; store.set('sorts', S.sort); NOTE.shown = 100; search(); });
    $('nq').addEventListener('input', () => { NOTE.shown = 100; if (NOTE.open) closeNotes(); else paintNotesList(); });
    $('nList').addEventListener('click', ev => { const w = ev.target.closest('.nw'); if (w) openNotes(w.dataset.k); });
    $('nList').addEventListener('keydown', ev => { const w = ev.target.closest('.nw'); if (w && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openNotes(w.dataset.k); } });
    $('nBox').addEventListener('scroll', () => { const b = $('nBox'); if (!NOTE.open && b.scrollTop + b.clientHeight > b.scrollHeight - 300) { NOTE.shown += 100; paintNotesList(); } });
    $('nWork').addEventListener('click', ev => {
      if (ev.target.closest('#nBack')) { closeNotes(); return; }
      if (ev.target.closest('#nEdit')) { openLibLande('#open=' + encodeURIComponent(NOTE.open) + '&view=notes'); return; }
      const qb = ev.target.closest('.qb');
      if (qb) {
        const e = S.byKey.get(NOTE.open), fl = e && pdfOf(e), r = fl && NOTE.marks.get(fl.id), m = r && r.marks[+qb.dataset.m];
        if (m) quoteMark(e.k, m, pageLabel(r, m.page));
      }
    });
    $('tCite').addEventListener('click', () => tab('cite'));
    $('tRefs').addEventListener('click', () => tab('refs'));
    $('refsBtn').addEventListener('click', insertOrGoToRefs);
    $('zConvert').addEventListener('click', convertZotero);
    $('style').innerHTML = STYLES.map(([id, name]) => '<option value="' + id + '">' + esc(name) + '</option>').join('');
    $('style').value = S.style;
    $('style').addEventListener('change', () => chooseStyle($('style').value));
    $('lGo').addEventListener('click', linkTyped);
    $('lUndo').addEventListener('click', undoLinks);
    $('lRows').addEventListener('click', ev => {
      const add = ev.target.closest('[data-add]');
      // (A citation not found: looked for by its names and year.)
      if (add) { const row = add.closest('[data-typed]'); addInLibLande(row ? row.dataset.typed.replace(/[()\[\];,]|\bet al\.|&|\band\b|\b(see|also|e\.g\.|cf\.)\b/g, ' ').replace(/\s+/g, ' ') : ''); return; }
      const ch = ev.target.closest('[data-change]');
      if (ch) { const i = +ch.dataset.change; LINK.open = LINK.open === i ? -1 : i; paintLink(); return; }
      const pk = ev.target.closest('.pk');
      if (pk) { changeLink(+pk.closest('[data-pick]').dataset.pick, pk.dataset.k); return; }
      if (ev.target.closest('.pick')) return;
      const row = ev.target.closest('.link-row');
      if (row) { const rows = LINK.rows.length ? LINK.rows : LINK.found.filter(t => !t.ok).map(t => ({ typed: t.text, missing: true })); showLinkRow(rows[+row.dataset.r]); }
    });
    $('lRows').addEventListener('input', ev => {
      const i = ev.target.dataset.find;
      if (i == null) return;
      const toks = norm(ev.target.value.trim()).split(/\s+/).filter(Boolean);
      const hits = toks.length ? S.index.filter(x => toks.every(t => x.hay.includes(t))).slice(0, 6).map(x => x.e) : [];
      document.querySelector('[data-found="' + i + '"]').innerHTML = hits.map(c => '<button type="button" class="pk" data-k="' + esc(c.k) + '" aria-pressed="false"><span class="radio"></span><span><span class="t">' + esc(c.f.title || c.k) + '</span><span class="m"> ' + esc(metaOf(c)) + '</span></span></button>').join('');
    });
    $('plainCopy').addEventListener('click', plainCopy);
    $('plainAskBtn').addEventListener('click', () => { $('plainAsk').hidden = false; });
    $('plainNo').addEventListener('click', () => { $('plainAsk').hidden = true; });
    $('plainYes').addEventListener('click', convertPlain);
    $('signin').addEventListener('click', () => reload(false));
    $('acct').addEventListener('click', ev => {
      ev.stopPropagation();
      const open = $('menu').hidden;
      $('menu').hidden = !open;
      $('acct').setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', ev => { if (!$('menu').hidden && !$('menu').contains(ev.target)) { $('menu').hidden = true; $('acct').setAttribute('aria-expanded', 'false'); } });
    $('mReload').addEventListener('click', () => { $('menu').hidden = true; reload(true); });
    $('refresh').addEventListener('click', async () => {
      const b = $('refresh');
      if (b.classList.contains('busy')) return;
      b.classList.add('busy');
      hideErr('citeErr'); hideErr('refsErr');
      try {
        if (tokenOk() && navigator.onLine) { try { await fetchLibrary(false); } catch (e) { /* the copy here will do */ } }
        readSettings();
        await refreshDocument(true);
        search();
        readZotero();
        if (!$('pRefs').hidden && !LINK.rows.length) await scanTyped();
      } catch (e) { showErr($('pRefs').hidden ? 'citeErr' : 'refsErr', 'Couldn\u2019t refresh: ' + wordError(e)); }
      b.classList.remove('busy');
    });
    $('mOpen').addEventListener('click', () => { $('menu').hidden = true; openLibLande(); });
    $('mOut').addEventListener('click', async () => {
      $('menu').hidden = true;
      try { if (token && window.google && google.accounts) google.accounts.oauth2.revoke(token.value, () => {}); } catch (e) { /* gone anyway */ }
      token = null; store.set('token', null); store.set('email', null); store.set('libStamp', null);
      await idb.clear();
      S.entries = []; S.byKey = new Map(); S.index = [];
      paintAccount();
      view('vSignin');
    });
    window.addEventListener('online', paintOffline);
    window.addEventListener('offline', paintOffline);
  }

  async function start() {
    wire();
    if (S.inWord) {
      try { Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, onSelection); } catch (e) { /* editing by cursor then unavailable */ }
    }
    paintOffline();
    paintAccount();
    readSettings();
    // The library kept here opens at once; Drive is asked for a newer one.
    const kept = await idb.get();
    if (kept && kept.gz) {
      try { useLibrary(await gunzip(kept.gz)); } catch (e) { /* asked for again */ }
    }
    if (S.style !== 'apa') styleEngine(S.style).catch(() => {});
    S.sort = Object.assign(S.sort, store.get('sorts', {}));
    if (S.entries.length) {
      view('vMain');
      search();
      $('q').focus();
      refreshDocument().catch(() => {});
      if (tokenOk() && navigator.onLine) fetchLibrary(false).then(changed => { if (changed) { search(); refreshDocument().catch(() => {}); } }).catch(() => {});
    } else if (tokenOk()) reload(false);
    else view('vSignin');
  }

  // In Word: Office.js says so. (Opened in a browser, as when testing,
  // without it: the panel works, with nothing to insert into.)
  if (window.Office && Office.onReady) {
    Office.onReady(info => {
      S.inWord = info.host === Office.HostType.Word;
      start();
    });
  } else start();
  // (For testing in a browser.)
  window.LLPanel = { S, useLibrary, search, toggle, paintChosen, view, zoteroCite, zoteroMatcher, swapFields, enterEdit, leaveEdit, currentCite, renderAll, styleEngine, LINK, paintLink, paintRefs, unwrapControls, openNotes, readMarks, paintLists, addGroupTab, listKeys, noticeSelection };
})();
