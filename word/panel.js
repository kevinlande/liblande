// LibLande for Word: the side panel. Search your library, choose works,
// insert a citation at the cursor; the References list kept up to date.
// Citations are Word content controls tagged "LL:<id>", their works kept in
// the document's add-in settings ("liblande": {cites: {id: citation}}); the
// References list is the one tagged "LL:refs". Their text comes from
// engine.js (APA), for the whole document at once.
'use strict';
(() => {
  const CLIENT_ID = '789682218462-98mjugngb46ttd01ucp9dcj71ufspjgn.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  const API = 'https://www.googleapis.com/drive/v3/';
  const LIBLANDE = 'https://kevinlande.github.io/liblande/';
  const $ = id => document.getElementById(id);
  const S = {
    entries: [], byKey: new Map(), index: [],
    cites: {}, present: null,
    chosen: [], form: 'paren', pre: '', own: false,
    results: [], marker: -1, inWord: false,
  };

  /* ---- storage: the token, and the library kept in this panel */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('llw.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem('llw.' + k); else localStorage.setItem('llw.' + k, JSON.stringify(v)); } catch (e) { /* none */ } },
  };
  const idb = {
    open() { return new Promise((ok, no) => { const r = indexedDB.open('llw', 1); r.onupgradeneeded = () => r.result.createObjectStore('lib'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
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
    ENTRIES = S.entries;
    CASE_SETS = null;
    S.byKey = new Map(S.entries.map(e => [e.k, e]));
    S.index = S.entries.map(e => ({ e, hay: norm([
      ...(e.a || []).map(n => n[0] + ' ' + (n[1] || '')), ...(e.e || []).map(n => n[0] + ' ' + (n[1] || '')),
      e.f.title, e.f.booktitle, e.f.journal, e.f.year, e.f.keywords, e.k].filter(Boolean).join(' ')) }));
  }

  /* ---- the document's citations (Word) */
  const SETTINGS = 'liblande';
  function readSettings() {
    try { const v = Office.context.document.settings.get(SETTINGS); S.cites = (v && v.cites) || {}; } catch (e) { S.cites = {}; }
  }
  function saveSettings() {
    return new Promise(ok => {
      try {
        Office.context.document.settings.set(SETTINGS, { v: 1, cites: S.cites });
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
    await Word.run(async ctx => {
      const ccs = ctx.document.contentControls;
      ccs.load('items/tag,items/text');
      await ctx.sync();
      const mine = ccs.items.filter(c => /^LL:/.test(c.tag));
      S.present = mine.map(c => c.tag.slice(3)).filter(id => id !== 'refs');
      const out = LLWord.render(presentCites(), S.byKey);
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

  async function insertCitation() {
    const c = currentCite();
    if (!c.items.length) return;
    hideErr('citeErr');
    const id = newId();
    const all = Object.assign({}, presentCites(), { [id]: c });
    const text = LLWord.render(all, S.byKey).texts[id];
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
    await saveSettings();
    clearChosen();
    $('q').value = '';
    search();
    $('q').focus();
    try { await refreshDocument(); } catch (e) { showErr('citeErr', 'The other citations couldn\u2019t be updated: ' + wordError(e)); }
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
        const out = LLWord.render(presentCites(), S.byKey);
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
        items: items.map(x => ({ k: x.e.k, page: page(x.it).trim() })),
        form: its.some(it => it['suppress-author']) ? 'year' : 'paren',
        pre: String(its[0].prefix || '').replace(/[,\s]+$/, '').trim(),
        own: false,
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

  // Each Zotero citation that can be made LibLande's: its field selected
  // and replaced by the citation, as a LibLande content control; Zotero's
  // bibliography replaced by the References list. (The first is checked
  // before the rest: if its field is still there, Word replaced only its
  // text, and nothing more is done.)
  async function convertZotero() {
    hideErr('refsErr');
    const b = $('zConvert');
    b.disabled = true;
    const M = zoteroMatcher();
    let done = 0, kept = 0, bibl = false;
    try {
      await Word.run(async ctx => {
        const fields = ctx.document.body.fields;
        fields.load('items/code');
        await ctx.sync();
        // (From the end back, so what's replaced doesn't move what's still to
        // come; and Zotero's bibliography kept if any citation stays Zotero's,
        // as LibLande's list wouldn't have its works.)
        const zf = fields.items.filter(f => /ZOTERO_(ITEM|BIBL)/.test(f.code || '')).reverse();
        const keepBib = zf.some(f => /ZOTERO_ITEM/.test(f.code) && !zoteroCite(f.code, M).cite);
        const count = async () => { const f = ctx.document.body.fields; f.load('items/code'); await ctx.sync(); return f.items.filter(x => /ZOTERO_(ITEM|BIBL)/.test(x.code || '')).length; };
        const before = zf.length;
        let checked = false;
        for (const f of zf) {
          const isBib = /ZOTERO_BIBL/.test(f.code);
          const z = isBib ? null : zoteroCite(f.code, M);
          if (!isBib && !z.cite) { kept++; continue; }
          if (isBib && keepBib) continue;
          f.select();
          await ctx.sync();
          const sel = ctx.document.getSelection();
          if (isBib) {
            const para = sel.insertParagraph('', 'Before');
            sel.insertText('', 'Replace');
            const cc = para.getRange('Whole').insertContentControl();
            cc.tag = 'LL:refs'; cc.title = 'LibLande References'; cc.appearance = 'BoundingBox';
            await ctx.sync();
            bibl = true;
          } else {
            const id = newId();
            const r = sel.insertText(LLWord.render(Object.assign({}, presentCites(), { [id]: z.cite }), S.byKey).texts[id], 'Replace');
            const cc = r.insertContentControl();
            cc.tag = 'LL:' + id; cc.title = 'LibLande'; cc.appearance = 'BoundingBox';
            S.cites[id] = z.cite;
            if (S.present) S.present.push(id);
            await ctx.sync();
          }
          // (The first: was the field itself replaced?)
          if (!checked) {
            checked = true;
            if ((await count()) >= before) throw new Error('Word changed the citation\u2019s text but kept Zotero\u2019s field, so nothing more was converted. (Undo with \u2318Z.)');
          }
          if (!isBib) done++;
        }
      });
    } catch (e) {
      await saveSettings();
      showErr('refsErr', (done ? 'Converted ' + done + ', then stopped: ' : 'Couldn\u2019t convert them: ') + wordError(e));
      b.disabled = false;
      return;
    }
    await saveSettings();
    b.disabled = false;
    try { await refreshDocument(true); } catch (e) { /* Refresh will */ }
    readZotero();
    showErr('refsErr', 'Converted ' + done + ' citation' + (done === 1 ? '' : 's') + (bibl ? ' and the bibliography' : '') + (kept ? '; ' + kept + ' left as Zotero\u2019s' : '') + '.');
    $('refsErr').classList.add('ok');
  }

  /* ---- search */
  function search() {
    const text = $('q').value.trim();
    const counts = LLWord.counts(presentCites());
    if (!text) {
      // (Nothing typed: what this document cites.)
      const keys = [...counts.keys()].filter(k => S.byKey.has(k));
      S.results = keys.map(k => S.byKey.get(k)).sort((a, b) => cmpStr(norm(firstName(a)), norm(firstName(b))));
      S.heading = S.results.length ? 'Cited in this document' : '';
    } else {
      const toks = norm(text).split(/\s+/).filter(Boolean);
      const hits = S.index.filter(x => toks.every(t => x.hay.includes(t))).map(x => x.e);
      const lead = toks[0];
      hits.sort((a, b) => (norm(firstName(b)).startsWith(lead) - norm(firstName(a)).startsWith(lead)) || cmpStr(b.f.year || '', a.f.year || ''));
      S.results = hits.slice(0, 60);
      S.heading = '';
    }
    S.marker = S.results.length && text ? 0 : -1;
    paintResults();
  }
  const firstName = e => { const n = (e.a && e.a[0]) || (e.e && e.e[0]); return n ? n[0] : (e.f.title || ''); };
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
    let html = S.heading ? '<div class="sub">' + esc(S.heading) + '</div>' : '';
    if (!S.results.length) {
      html += text ? '<div class="empty">No matches.<br><button class="btn" type="button" id="addLib">Add to LibLande\u2026</button></div>' : '';
    }
    html += S.results.map((e, i) => {
      const n = counts.get(e.k) || 0;
      return '<div class="it' + (i === S.marker ? ' kb' : '') + '" role="option" aria-selected="' + picked.has(e.k) + '" aria-checked="' + picked.has(e.k) + '" data-k="' + esc(e.k) + '" id="r' + i + '">' +
        '<span class="box" aria-hidden="true">' + (picked.has(e.k) ? '\u2713' : '') + '</span>' +
        '<div class="tx"><div class="t">' + esc(e.f.title || e.k) + '</div><div class="m">' + esc(metaOf(e)) + '</div></div>' +
        (n ? '<span class="cited">cited ' + n + '\u00d7</span>' : '') + '</div>';
    }).join('');
    $('res').innerHTML = html;
    const kb = $('r' + S.marker);
    if (kb) kb.scrollIntoView({ block: 'nearest' });
    const add = $('addLib');
    if (add) add.addEventListener('click', () => openLibLande());
  }

  /* ---- the citation being made */
  const currentCite = () => ({ items: S.chosen.map(c => ({ k: c.k, page: c.page || '' })), form: S.form, pre: S.form === 'paren' ? S.pre : '', own: S.own });
  function toggle(k) {
    const i = S.chosen.findIndex(c => c.k === k);
    if (i >= 0) S.chosen.splice(i, 1); else S.chosen.push({ k, page: '' });
    if (!S.own) S.chosen = LLWord.order(S.chosen, S.byKey);
    paintChosen();
    paintResults();
  }
  function clearChosen() { S.chosen = []; S.own = false; S.pre = ''; $('pre').value = ''; paintChosen(); }
  const label = c => { const e = S.byKey.get(c.k); if (!e) return c.k; const t = LLWord.render({ x: { items: [{ k: c.k }], form: 'paren' } }, S.byKey).texts.x; return t.slice(1, -1); };
  function paintChosen() {
    $('foot').hidden = !S.chosen.length;
    if (!S.chosen.length) return;
    $('az').hidden = !S.own || S.chosen.length < 2;
    $('chosen').innerHTML = S.chosen.map((c, i) =>
      '<div class="ch" data-i="' + i + '">' + (S.chosen.length > 1 ? '<span class="grip" aria-label="Drag to reorder" title="Drag to reorder">\u22ee\u22ee</span>' : '') +
      '<span class="n">' + esc(label(c)) + '</span>' +
      '<input data-i="' + i + '" value="' + esc(c.page) + '" placeholder="page" aria-label="Page for ' + esc(label(c)) + '">' +
      '<button class="x" type="button" data-i="' + i + '" aria-label="Remove ' + esc(label(c)) + '">\u2715</button></div>').join('');
    const y = (() => { const e = S.byKey.get(S.chosen[0].k); return e ? (e.f.year || 'n.d.') : '2011'; })();
    const names = { paren: '(Author, ' + y + ')', narr: 'Author (' + y + ')', year: '(' + y + ')' };
    document.querySelectorAll('#forms button').forEach(b => { b.textContent = names[b.dataset.form]; b.setAttribute('aria-checked', String(b.dataset.form === S.form)); });
    $('preWrap').hidden = S.form !== 'paren';
    paintPreview();
  }
  function paintPreview() {
    if (!S.chosen.length) return;
    const before = LLWord.render(presentCites(), S.byKey).texts;
    const out = LLWord.render(Object.assign({}, presentCites(), { __new: currentCite() }), S.byKey);
    $('prev').textContent = out.texts.__new;
    const changed = Object.keys(before).filter(id => before[id] !== out.texts[id]).length;
    $('prevNote').hidden = !changed;
    $('prevNote').textContent = 'Also changes ' + changed + ' other citation' + (changed === 1 ? '' : 's') + ' (as 2011a, 2011b, or with more names).';
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
      row.style.transform = 'translateY(' + dy + 'px) scale(1.02)';
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
  const openLibLande = () => { try { Office.context.ui.openBrowserWindow(LIBLANDE); } catch (e) { window.open(LIBLANDE, '_blank'); } };

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
    $('q').addEventListener('input', search);
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
        if ($('q').value) { $('q').value = ''; search(); } else clearChosen();
      }
    });
    $('res').addEventListener('click', ev => {
      const it = ev.target.closest('.it');
      if (it) { S.marker = [...$('res').querySelectorAll('.it')].indexOf(it); toggle(it.dataset.k); }
    });
    $('chosen').addEventListener('input', ev => {
      const i = ev.target.dataset.i;
      if (i != null && ev.target.tagName === 'INPUT') { S.chosen[+i].page = ev.target.value; paintPreview(); }
    });
    $('chosen').addEventListener('click', ev => {
      const x = ev.target.closest('.x');
      if (x) { S.chosen.splice(+x.dataset.i, 1); paintChosen(); paintResults(); }
    });
    $('chosen').addEventListener('pointerdown', dragStart);
    $('az').addEventListener('click', () => { S.own = false; S.chosen = LLWord.order(S.chosen, S.byKey); paintChosen(); });
    $('forms').addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (b) { S.form = b.dataset.form; paintChosen(); }
    });
    $('pre').addEventListener('input', () => { S.pre = $('pre').value; paintPreview(); });
    $('insert').addEventListener('click', insertCitation);
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && S.chosen.length && !$('pCite').hidden) { ev.preventDefault(); insertCitation(); }
      if (ev.key === 'Escape' && !$('menu').hidden) { $('menu').hidden = true; $('acct').setAttribute('aria-expanded', 'false'); }
    });
    const tab = which => {
      $('tCite').setAttribute('aria-selected', String(which === 'cite'));
      $('tRefs').setAttribute('aria-selected', String(which === 'refs'));
      $('pCite').hidden = which !== 'cite';
      $('pRefs').hidden = which !== 'refs';
      if (which === 'refs') { paintRefs(); readZotero(); refreshDocument().catch(e => showErr('refsErr', wordError(e))); } else $('q').focus();
    };
    $('tCite').addEventListener('click', () => tab('cite'));
    $('tRefs').addEventListener('click', () => tab('refs'));
    $('refsBtn').addEventListener('click', insertOrGoToRefs);
    $('zConvert').addEventListener('click', convertZotero);
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
    paintOffline();
    paintAccount();
    readSettings();
    // The library kept here opens at once; Drive is asked for a newer one.
    const kept = await idb.get();
    if (kept && kept.gz) {
      try { useLibrary(await gunzip(kept.gz)); } catch (e) { /* asked for again */ }
    }
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
  window.LLPanel = { S, useLibrary, search, toggle, paintChosen, view, zoteroCite, zoteroMatcher };
})();
