// LibLande: Citation styles: APA (LibLande's own), or any of the styles Zotero uses (CSL, through citeproc-js), for Copy, Quote, the QR code, Export and Cite Check.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/cite.js'] = '2026-11-11.01';
/* ------------------------------------------------------------ citation styles */
// Your citation style, chosen in Settings > Citing, kept with your account:
// APA by default, which LibLande formats itself (apaCitation, apaInText:
// nothing to download). Any other is a CSL style from the repository
// Zotero uses (10,000-odd: journals, publishers, universities), formatted
// by citeproc-js, the engine Zotero uses: the style's file (and, for a
// journal's style, the style it follows), and the words for its language,
// downloaded the first time and kept on this device, so it works offline
// after. Everything that cites goes through citeRef, citeInText,
// citeInTextMany and citeList; until a style has downloaded they give APA
// (and say so). BibTeX and the .bib are never touched.
const CSL_LIB = './vendor/citeproc/2.4.63/citeproc_commonjs.js';
const CSL_RAW = 'https:\/\/raw.githubusercontent.com/citation-style-language/';
const CSL_INDEX = 'https:\/\/www.zotero.org/styles-files/styles.json';
const CITE = {
  id: store.get('citeStyle', 'apa'),
  // The styles chosen lately ({ id, title }), the newest first: offered in
  // the Copy menu and at the top of Settings' list.
  recent: store.get('citeRecent', []),
  engines: new Map(), loading: new Map(), items: new Map(), locales: {},
  lib: null, index: null, said: false,
};
// Offered in Settings before any search.
const CITE_COMMON = [
  ['apa', 'APA 7th edition', 'author-date'],
  ['chicago-author-date', 'Chicago (author-date)', '17th edition'],
  ['chicago-note-bibliography', 'Chicago (notes and bibliography)', 'footnotes'],
  ['modern-language-association', 'MLA 9th edition', 'author-page'],
  ['harvard-cite-them-right', 'Harvard (Cite Them Right)', 'author-date'],
  ['philosophical-studies', 'Philosophical Studies', 'Springer, author-date'],
];
function citeTitle(id = CITE.id) {
  const c = CITE_COMMON.find(x => x[0] === id), r = CITE.recent.find(x => x.id === id), s = store.get('csl:' + id, null);
  return (c && c[1]) || (r && r.title) || (s && s.title) || id;
}
// The style's name, short, for menus and messages ("APA", "Chicago").
function citeShort(id = CITE.id) {
  return id === 'apa' ? 'APA' : citeTitle(id).replace(/\s*\((?!notes)[^)]*\)\s*$/, '').replace(/ \d+(st|nd|rd|th) edition$/, '');
}

/* ---- the engine, the styles and their words */
// (citeproc-js ends with "module.exports = CSL", for Node: run here with a
// stand-in, rather than as a script, where that line throws.)
async function cslEngineLib() {
  if (CITE.lib) return CITE.lib;
  const r = await fetch(CSL_LIB);
  if (!r.ok) throw new Error('The citation formatter couldn\u2019t load (' + r.status + ').');
  CITE.lib = new Function('module', (await r.text()) + '\n;return CSL;')({});
  return CITE.lib;
}
async function cslText(path) {
  const r = await fetch(CSL_RAW + path);
  if (!r.ok) throw Object.assign(new Error('Not found: ' + path), { status: r.status });
  return r.text();
}
// A style: { xml, title, lang }, the xml the independent style's (a
// journal's style only names the one it follows). Kept on this device.
async function cslStyle(id) {
  const kept = store.get('csl:' + id, null);
  if (kept && kept.xml) return kept;
  let text;
  try { text = await cslText('styles/master/' + id + '.csl'); } catch (err) { text = await cslText('styles/master/dependent/' + id + '.csl'); }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const title = ((doc.querySelector('info > title') || {}).textContent || id).trim();
  const parent = doc.querySelector('info > link[rel="independent-parent"]');
  let out = { xml: text, title, lang: doc.documentElement.getAttribute('default-locale') || 'en-US' };
  if (parent) {
    const p = await cslStyle(parent.getAttribute('href').split('/').pop());
    out = { xml: p.xml, title, lang: doc.documentElement.getAttribute('default-locale') || p.lang };
  }
  try { store.set('csl:' + id, out); } catch (err) { /* (too much kept: it's downloaded again next time) */ }
  return out;
}
async function cslLocale(lang) {
  if (CITE.locales[lang]) return CITE.locales[lang];
  let xml = store.get('csl-locale:' + lang, null);
  if (!xml) {
    xml = await cslText('locales/master/locales-' + lang + '.xml');
    try { store.set('csl-locale:' + lang, xml); } catch (err) { /* (as above) */ }
  }
  return (CITE.locales[lang] = xml);
}
// The engine for a style, made once: null for APA (LibLande's own).
function citeLoad(id = CITE.id) {
  if (id === 'apa') return Promise.resolve(null);
  if (CITE.engines.has(id)) return Promise.resolve(CITE.engines.get(id));
  if (!CITE.loading.has(id)) {
    const p = (async () => {
      const [CSL, style] = await Promise.all([cslEngineLib(), cslStyle(id)]);
      await cslLocale('en-US');
      if (style.lang !== 'en-US') { try { await cslLocale(style.lang); } catch (err) { /* (en-US then) */ } }
      const sys = { retrieveLocale: lang => CITE.locales[lang] || CITE.locales['en-US'], retrieveItem: k => CITE.items.get(k) };
      const engine = new CSL.Engine(sys, style.xml, style.lang);
      engine.setOutputFormat('html');
      CITE.engines.set(id, engine);
      return engine;
    })();
    p.catch(() => {}).finally(() => CITE.loading.delete(id));
    CITE.loading.set(id, p);
  }
  return CITE.loading.get(id);
}
// The engine if it's ready; if not, it's fetched, and APA used meanwhile
// (said once).
function citeEngine(id = CITE.id) {
  if (id === 'apa') return null;
  const e = CITE.engines.get(id);
  if (e) return e;
  citeLoad(id).catch(() => {});
  if (!CITE.said) {
    CITE.said = true;
    toast(citeTitle(id) + ' hasn\u2019t downloaded yet' + (navigator.onLine ? '' : ' (you\u2019re offline)') + ': APA meanwhile.', 5000);
    setTimeout(() => { CITE.said = false; }, 10000);
  }
  return null;
}
// An item's id for the engine: changes when the publication does, so an
// edit isn't hidden by what the engine kept.
function cslId(e) {
  const k = e.k + '\u0001' + (e.h || '');
  if (!CITE.items.has(k)) CITE.items.set(k, cslItem(e, k));
  return k;
}
/* ---- what everything cites with */
// A publication's reference.
function citeRef(e, id = CITE.id) {
  const engine = citeEngine(id);
  return engine ? citeList([e], id)[0] : apaCitation(e);
}
// Several, as a reference list: in the style's order.
function citeList(list, id = CITE.id) {
  const engine = citeEngine(id);
  if (!engine) return apaOrder(list).map(e => Object.assign({ e }, apaCitation(e)));
  const ids = list.map(cslId);
  engine.updateItems(ids);
  const [meta, entries] = engine.makeBibliography();
  const byId = new Map(list.map((e, i) => [ids[i], e]));
  return entries.map((h, i) => Object.assign(cslOut(h), { e: byId.get(meta.entry_ids[i][0]) }));
}
// Its in-text citation, with a page (or pages) if given: (Lee 2026, 4).
function citeInText(e, page, id = CITE.id) {
  const engine = citeEngine(id);
  page = String(page || '').trim().replace(/-+/g, '\u2013');
  if (!engine) {
    const base = apaInText(e);
    if (!page) return base;
    const at = ', ' + (/\u2013/.test(page) ? 'pp. ' : 'p. ') + page + ')';
    return { text: base.text.slice(0, -1) + at, html: base.html.slice(0, -1) + esc(at) };
  }
  return citeCluster([e], page, engine);
}
// Several cited at once: (A 2012; B 2026).
function citeInTextMany(list, id = CITE.id) {
  const engine = citeEngine(id);
  if (!engine) return list.length > 1 ? apaInTextMany(list) : apaInText(list[0]);
  return citeCluster(list, '', engine);
}
function citeCluster(list, page, engine) {
  const items = list.map(e => Object.assign({ id: cslId(e) }, page ? { locator: page, label: 'page' } : {}));
  engine.updateItems(items.map(x => x.id));
  return cslOut(engine.makeCitationCluster(items));
}
// What a copy says it copied: "Copied the Chicago reference".
const citeSaid = (what, n) => n > 1 ? 'Copied ' + n + ' ' + citeShort() + ' ' + what + 's' : 'Copied the ' + citeShort() + ' ' + what;

/* ---- choosing */
function citeChoose(id, title) {
  CITE.id = id;
  store.set('citeStyle', id);
  if (id !== 'apa') {
    CITE.recent = [{ id, title: title || citeTitle(id) }, ...CITE.recent.filter(x => x.id !== id)].slice(0, 6);
    store.set('citeRecent', CITE.recent);
    citeLoad(id).catch(err => toast('Couldn\u2019t download ' + (title || id) + ': ' + errText(err), 6000));
  }
  sendPrefs({ citeStyle: id, citeRecent: CITE.recent });
  // (What shows citations again, in the new style.)
  if (typeof renderDetail === 'function' && state.selKey) renderDetail();
  if (V.entry && SIDE.tab === 'info' && sideOpen()) showInfo();
  citeLabels();
}
// From your account, on opening: its style wins.
function citeMerge(prefs) {
  if (!prefs) return;
  if (Array.isArray(prefs.citeRecent)) { CITE.recent = prefs.citeRecent.slice(0, 6); store.set('citeRecent', CITE.recent); }
  if (typeof prefs.citeStyle === 'string' && prefs.citeStyle !== CITE.id) {
    CITE.id = prefs.citeStyle;
    store.set('citeStyle', CITE.id);
    citeLabels();
  }
  if (CITE.id !== 'apa') citeLoad().catch(() => {});
}
// (A style chosen on this device: made ready as LibLande opens.)
if (CITE.id !== 'apa') setTimeout(() => citeLoad().catch(() => {}), 1500);
// Menus' and Settings' names for the style.
function citeLabels() {
  document.querySelectorAll('[data-cite-style]').forEach(el => { el.textContent = citeShort(); });
  if ($('#citeNow')) $('#citeNow').textContent = citeTitle();
}

/* ---- the Copy menu: another style, for this copy */
// At the menu's foot: "Style: APA", opening the styles used lately; one
// chosen is used by that menu's Reference and In-text until it closes.
// (Plain buttons, not menu items: choosing one keeps the menu open.)
function citeOnceHTML() {
  const ids = ['apa', CITE.id, ...CITE.recent.map(x => x.id)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
  return `<hr class="mi-sep"><button type="button" class="mi cite-more" data-cite-more aria-expanded="false">${ICON.chev}<span>Style: <b data-cite-label>${esc(citeShort())}</b></span></button>` +
    `<div class="cite-once" hidden>` + ids.map(id => `<button type="button" class="mi" data-cite-once-id="${esc(id)}" aria-pressed="${id === CITE.id}">${ICON.check}<span>${esc(citeTitle(id))}</span></button>`).join('') +
    `<button type="button" class="mi" data-cite-settings><span>More styles…</span></button></div>`;
}
document.addEventListener('click', ev => {
  const more = ev.target.closest('[data-cite-more]');
  if (more) {
    const box = more.nextElementSibling;
    box.hidden = !box.hidden;
    more.setAttribute('aria-expanded', String(!box.hidden));
    const d = more.closest('details.menu');
    if (d) placeMenu(d);
    return;
  }
  const once = ev.target.closest('[data-cite-once-id]');
  if (once) {
    const d = once.closest('details.menu'), id = once.dataset.citeOnceId;
    d.dataset.citeOnce = id;
    d.querySelectorAll('[data-cite-label]').forEach(el => { el.textContent = citeShort(id); });
    d.querySelectorAll('[data-cite-once-id]').forEach(b => b.setAttribute('aria-pressed', String(b === once)));
    if (id !== 'apa') citeLoad(id).catch(err => toast('Couldn’t download ' + citeTitle(id) + ': ' + errText(err), 6000));
    return;
  }
  if (ev.target.closest('[data-cite-settings]')) {
    const d = ev.target.closest('details.menu');
    if (d) d.open = false;
    $('#settingsBtn').click();
    setTimeout(() => { setSettingsTab('cite'); const s = $('#citeSec'); if (s) s.scrollIntoView({ block: 'start' }); }, 450);
  }
});
// (Closed: back to your own style.)
document.addEventListener('toggle', ev => {
  const d = ev.target;
  if (!d || !d.dataset || d.open || !d.dataset.citeOnce) return;
  delete d.dataset.citeOnce;
  d.querySelectorAll('[data-cite-label]').forEach(el => { el.textContent = citeShort(); });
  d.querySelectorAll('[data-cite-once-id]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.citeOnceId === CITE.id)));
  const box = d.querySelector('.cite-once'), more = d.querySelector('[data-cite-more]');
  if (box) box.hidden = true;
  if (more) more.setAttribute('aria-expanded', 'false');
}, true);

/* ---- Settings > Citing */
// The list: the common styles and those used lately; or, with words typed,
// the styles whose names have them all (from the repository's index,
// fetched once a session).
async function citeIndex() {
  if (CITE.index) return CITE.index;
  const r = await fetch(CSL_INDEX);
  if (!r.ok) throw new Error('The list of styles couldn\u2019t load (' + r.status + ').');
  CITE.index = (await r.json()).map(s => ({ id: s.name, title: s.title, short: s.titleShort || '', format: (s.categories || {}).format || '', dep: !!s.dependent }));
  return CITE.index;
}
let citeFindT = 0;
function citeRows(rows) {
  return rows.map(([id, title, note]) => `<label class="cite-st${id === CITE.id ? ' on' : ''}"><input type="radio" name="citeStyle" value="${esc(id)}" data-title="${esc(title)}"${id === CITE.id ? ' checked' : ''}>` +
    `<span>${esc(title)}</span><small>${esc(note || '')}</small></label>`).join('');
}
function citeSettings() {
  const box = $('#citeList');
  if (!box) return;
  const q = norm($('#citeFind').value).trim();
  if (!q) {
    const common = CITE_COMMON.map(x => x[0]);
    const extra = CITE.recent.filter(x => !common.includes(x.id)).map(x => [x.id, x.title, 'used lately']);
    if (CITE.id !== 'apa' && !common.includes(CITE.id) && !extra.some(x => x[0] === CITE.id)) extra.unshift([CITE.id, citeTitle(), '']);
    box.innerHTML = citeRows(CITE_COMMON.concat(extra));
    citePreview();
    return;
  }
  clearTimeout(citeFindT);
  citeFindT = setTimeout(async () => {
    box.innerHTML = '<p class="hint">Looking\u2026</p>';
    try {
      const all = await citeIndex(), words = q.split(/\s+/);
      const hits = all.filter(s => { const n = norm(s.title + ' ' + s.short + ' ' + s.id); return words.every(w => n.includes(w)); })
        .sort((a, b) => a.title.length - b.title.length).slice(0, 40);
      if (norm($('#citeFind').value).trim() !== q) return;
      box.innerHTML = hits.length ? citeRows(hits.map(s => [s.id, s.title, s.format])) : '<p class="hint">No style by that name.</p>';
    } catch (err) { box.innerHTML = `<p class="hint">${esc(errText(err))}</p>`; }
  }, 250);
}
// This style, shown with the publication selected (or the first).
async function citePreview() {
  const box = $('#citePreview');
  if (!box) return;
  const e = (state.selKey && BYKEY.get(state.selKey)) || ENTRIES[0];
  if (!e) { box.hidden = true; return; }
  box.hidden = false;
  const id = CITE.id;
  if (id !== 'apa' && !CITE.engines.has(id)) {
    box.innerHTML = '<p class="hint">Downloading ' + esc(citeTitle(id)) + '\u2026</p>';
    try { await citeLoad(id); } catch (err) { box.innerHTML = `<p class="hint">Couldn\u2019t download it: ${esc(errText(err))}</p>`; return; }
    if (CITE.id !== id) return;
  }
  const r = citeRef(e, id), c = citeInText(e, '', id);
  box.innerHTML = `<span class="cite-lbl">Reference</span><p>${r.html}</p><span class="cite-lbl">In-text</span><p>${c.html}</p>`;
}
if ($('#citeList')) {
  $('#citeFind').addEventListener('input', citeSettings);
  $('#citeList').addEventListener('change', ev => {
    const r = ev.target.closest('input[name="citeStyle"]');
    if (!r) return;
    citeChoose(r.value, r.dataset.title);
    $('#citeList').querySelectorAll('.cite-st').forEach(l => l.classList.toggle('on', l.contains(r)));
    citePreview();
  });
}
