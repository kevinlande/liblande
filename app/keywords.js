// LibLande: Keywords: suggested for a publication (in Add, Edit and its details), and Tidy keywords, for the whole library.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/keywords.js'] = '2026-10-23.08';
/* ------------------------------------------------------------ suggested keywords */
// Suggested from your own keywords: those of the publications most like
// this one (by the words of their titles and abstracts, their authors and
// their journal), each counted by how alike they are; a keyword named in
// the title or abstract counts a little more. (Tried on a library of
// 3,600, leaving each publication's own keywords out: about two of the
// first three suggested were keywords it had.) New ones, not yet in the
// library, are OpenAlex's keywords for its DOI, in Add and Edit, and in
// the details once + Keyword is pressed; one that is a library keyword
// written another way ("philosophy of mind", for phil. mind) counts as
// that one.
const KWS_STOP = new Set(('a an the of and or in on at to for from by with without about as is are was were be been being this that these those it its we our they their ' +
  'not no but than then there here which who whom whose what when where why how can could may might must should would will also such into onto over under between ' +
  'among within via per vs versus do does did done has have had one two three more most less least other some any each both either neither very much many only just so ' +
  'if while because whether however thus therefore paper article chapter book study studies research result results show shows shown argue argues argued claim claims ' +
  'approach new using use used based first second').split(' '));
const kwsStem = w => w.length > 4 && /s$/.test(w) && !/(ss|us|is)$/.test(w) ? w.replace(/ies$/, 'y').replace(/s$/, '') : w;
const kwsWords = s => norm(String(s || '').replace(/[{}\\]/g, '')).split(/[^a-z0-9]+/)
  .filter(w => w.length > 2 && !KWS_STOP.has(w) && !/^\d+$/.test(w)).map(kwsStem);
// A keyword as compared: "Philosophy of Mind", "phil. mind" and
// "phil mind" alike; plurals, case, hyphens and "&" too.
const kwsKey = k => norm(k).replace(/\bphilosophy of (the )?/g, 'phil ').replace(/\bphil\.\s*/g, 'phil ').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(w => w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w) ? w.replace(/ies$/, 'y').replace(/s$/, '') : w).join(' ');
const KWS = { idx: null, of: null, building: false, t: 0, seq: 0, oa: new Map(), hide: new Set(store.get('kwsHide', [])) };
// What a publication is like: words of its title (counted twice) and
// abstract, its journal (or book), and its authors' surnames.
function kwsFeatures(f) {
  const m = new Map(), add = (t, w) => m.set(t, (m.get(t) || 0) + w);
  kwsWords(f.title).forEach(w => add(w, 2));
  kwsWords(f.abstract).forEach(w => add(w, 1));
  const venue = norm(f.journal || f.booktitle || '').replace(/[{}]/g, '').trim();
  if (venue) add('j:' + venue, 1.5);
  String(f.author || '').split(/\s+and\s+/i).map(a => norm(a.split(',')[0]).replace(/[{}]/g, '').trim()).filter(Boolean).forEach(a => add('a:' + a, 1.5));
  return m;
}
// The library, as such: built once, then again (when it has changed)
// while nothing else is happening, the old one used meanwhile.
function kwsBuild() {
  const list = ENTRIES.slice(), feats = list.map(e => kwsFeatures(e.f)), df = new Map();
  feats.forEach(m => m.forEach((v, t) => df.set(t, (df.get(t) || 0) + 1)));
  const idx = { list, df, N: list.length, inv: new Map(), vec: [], names: new Map() };
  feats.forEach((m, i) => {
    const v = kwsVector(m, idx);
    idx.vec.push(v);
    v.forEach((x, t) => { let l = idx.inv.get(t); if (!l) idx.inv.set(t, l = []); l.push(i, x); });
  });
  // (Each keyword: its words, to find it named in a text; and by kwsKey.)
  idx.phrase = new Map([...KEYWORDS.keys()].map(k => [k, kwsWords(k.replace(/^phil\.\s*/i, '')).join(' ')]));
  [...KEYWORDS.keys()].forEach(k => { const key = kwsKey(k), was = idx.names.get(key); if (!was || KEYWORDS.get(k).length > KEYWORDS.get(was).length) idx.names.set(key, k); });
  return idx;
}
function kwsVector(m, idx) {
  const v = new Map();
  let s = 0;
  m.forEach((c, t) => { const x = (1 + Math.log(c)) * Math.log(idx.N / (idx.df.get(t) || 1)); if (x > 0) { v.set(t, x); s += x * x; } });
  s = Math.sqrt(s) || 1;
  v.forEach((x, t) => v.set(t, x / s));
  return v;
}
function kwsIndex() {
  if (!KWS.idx) { KWS.idx = kwsBuild(); KWS.of = ENTRIES; }
  else if (KWS.of !== ENTRIES && !KWS.building) {
    KWS.building = true;
    const go = () => { KWS.building = false; KWS.idx = kwsBuild(); KWS.of = ENTRIES; };
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 500);
  }
  return KWS.idx;
}
// Suggestions for a publication's fields, or the one at i in the index:
// [{ k, s }], best first, none it has (written any way).
function kwsScore(v, text, have, self, idx) {
  const sim = new Float64Array(idx.N);
  v.forEach((x, t) => { const l = idx.inv.get(t); if (l) for (let j = 0; j < l.length; j += 2) sim[l[j]] += x * l[j + 1]; });
  if (self >= 0) sim[self] = 0;
  const top = [];
  for (let d = 0; d < idx.N; d++) if (sim[d] > 0) top.push(d);
  top.sort((a, b) => sim[b] - sim[a]);
  const sc = new Map();
  let tot = 0;
  top.slice(0, 30).forEach(d => { const w = sim[d] * sim[d]; tot += w; idx.list[d].kw.forEach(k => sc.set(k, (sc.get(k) || 0) + w)); });
  sc.forEach((s, k) => sc.set(k, s / (tot || 1)));
  // (Named in the title or abstract: a phrase more than a word.)
  if (text) idx.phrase.forEach((p, k) => { if (p && text.includes(' ' + p + ' ')) sc.set(k, (sc.get(k) || 0) + (p.includes(' ') ? 0.15 : 0.09)); });
  const mine = new Set(have.map(kwsKey));
  return [...sc].filter(([k]) => !mine.has(kwsKey(k)) && KEYWORDS.has(k)).map(([k, s]) => ({ k, s })).sort((a, b) => b.s - a.s);
}
const kwsText = f => ' ' + kwsWords((f.title || '') + ' ' + (f.abstract || '')).join(' ') + ' ';
function kwsSuggest(f, have, selfKey) {
  const idx = kwsIndex();
  const self = selfKey ? idx.list.findIndex(e => e.k === selfKey) : -1;
  return kwsScore(kwsVector(kwsFeatures(f), idx), kwsText(f), have || [], self, idx);
}
// OpenAlex's keywords for a DOI (its surer ones), kept for this visit.
function kwsOpenAlex(doi) {
  doi = npDoi(doi);
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) return Promise.resolve([]);
  if (!KWS.oa.has(doi)) {
    KWS.oa.set(doi, npFetch(NP_OA + '/works/doi:' + npPath(doi) + '?select=keywords')
      .then(r => r.ok ? r.json() : {}).then(w => (w.keywords || []).filter(k => k && k.score >= 0.4).map(k => tsClean(k.display_name)).filter(Boolean))
      .catch(() => []));
  }
  return KWS.oa.get(doi);
}
// With OpenAlex's: one that's a library keyword goes up (or in); the
// others go in as new, after.
function kwsWithOA(list, oa, have) {
  const idx = kwsIndex(), mine = new Set(have.map(kwsKey)), out = list.slice(), news = [];
  oa.forEach(name => {
    const key = kwsKey(name);
    if (mine.has(key)) return;
    const lib = idx.names.get(key);
    if (lib) {
      const x = out.find(y => y.k === lib);
      if (x) x.s += 0.2; else out.push({ k: lib, s: 0.25 });
    } else if (!news.some(y => kwsKey(y.k) === key)) news.push({ k: name, s: 0, new: true });
  });
  return out.sort((a, b) => b.s - a.s).concat(news.slice(0, 4));
}
const kwsChips = (list, attr) => list.map(x => `<button type="button" class="chip kw-sug${x.new ? ' new' : ''}" ${attr}="${esc(x.k)}" title="${x.new ? 'A new keyword (OpenAlex\u2019s): add it' : 'Add it'}">+ ${esc(x.k)}</button>`).join('');
// The keywords as the .bib had them, with more: written as they were
// (with commas, or semicolons).
const kwsJoin = (raw, list) => list.join(/,/.test(raw || '') && !/;/.test(raw || '') ? ', ' : '; ');

// In Add and Edit: under the keywords, from what's filled in so far;
// again as it changes.
function kwsSheet() { clearTimeout(KWS.t); KWS.t = setTimeout(kwsSheetNow, 350); }
async function kwsSheetNow() {
  const box = $('#kwSugs');
  if (!box || !sheet || !/^(add|edit)$/.test(sheet.mode)) return;
  const v = sheetValues(), have = [...$('#kwEdit').querySelectorAll('.kw-chip')].map(c => c.dataset.kw);
  const seq = ++KWS.seq, s = sheet;
  let list = v.title || v.abstract ? kwsSuggest(v, have, s.mode === 'edit' ? s.entry.k : '').filter(x => x.s >= 0.12).slice(0, 8) : [];
  const show = () => {
    if (seq !== KWS.seq || sheet !== s || !box.isConnected) return;
    box.innerHTML = list.length ? `<span class="kw-sugs-lbl">Suggested</span>${kwsChips(list, 'data-kws-pick')}` : '';
    box.hidden = !list.length;
  };
  show();
  if (v.doi) { const oa = await kwsOpenAlex(v.doi); list = kwsWithOA(list, oa, have).slice(0, 10); show(); }
}
$('#sheetBody').addEventListener('click', ev => {
  const b = ev.target.closest('[data-kws-pick]');
  if (!b) return;
  addKeyword(b.dataset.kwsPick);
  b.remove();
  const box = $('#kwSugs');
  if (box && !box.querySelector('[data-kws-pick]')) box.hidden = true;
});
$('#sheetBody').addEventListener('input', ev => { if (ev.target.matches('[data-field]') && sheet && /^(add|edit)$/.test(sheet.mode)) kwsSheet(); });

// In the details: a few, the surer ones, under the keywords (for a
// publication that can be changed); hidden for one with x.
function kwsDetailRow(e) {
  if (!gs || e.ib || KWS.hide.has(e.k) || !ENTRIES.length) return '';
  const list = kwsSuggest(e.f, e.kw, e.k).filter(x => x.s >= 0.3).slice(0, 4);
  return `<div class="kw-sugs d-kw-sugs" id="kwSugRow"${list.length ? '' : ' hidden'}><span class="kw-sugs-lbl">Suggested</span><span class="kw-sugs-list">${kwsChips(list, 'data-kws-add')}</span>` +
    `<button type="button" class="kw-sugs-x" data-kws-hide title="No suggestions for this one" aria-label="No suggested keywords for this publication">${ICON.x}</button></div>`;
}
detailEl.addEventListener('click', ev => {
  const e = BYKEY.get(state.selKey);
  if (!e) return;
  const a = ev.target.closest('[data-kws-add]');
  if (a) {
    const raw = rawOf(e, 'keywords'), have = splitKw(raw), k = a.dataset.kwsAdd;
    a.disabled = true;
    quickSet(e, { keywords: kwsJoin(raw, have.concat(k)) }, 'Added the keyword \u201c' + k + '\u201d');
    return;
  }
  if (ev.target.closest('[data-kws-hide]')) {
    KWS.hide.add(e.k);
    store.set('kwsHide', [...KWS.hide].slice(-500));
    const row = $('#kwSugRow');
    if (row) row.remove();
    return;
  }
  // + Keyword: OpenAlex's too, for its DOI.
  if (ev.target.closest('[data-kw-add]') && e.f.doi && !e.ib && !KWS.hide.has(e.k)) {
    const k = e.k;
    kwsOpenAlex(e.f.doi).then(oa => {
      const row = $('#kwSugRow');
      if (!oa.length || !row || state.selKey !== k) return;
      const list = kwsWithOA(kwsSuggest(e.f, e.kw, e.k).filter(x => x.s >= 0.3).slice(0, 4), oa, e.kw).slice(0, 8);
      row.querySelector('.kw-sugs-list').innerHTML = kwsChips(list, 'data-kws-add');
      row.hidden = !list.length;
    });
  }
});

/* ------------------------------------------------------------ tidy keywords */
// For the whole library, nothing changed until Apply: keywords written
// more than one way (or misspelt), each made the one you choose; those
// used only once, kept, removed or changed; keywords publications
// probably should have (as suggested above, the surest), and suggestions
// for those with none. One save to the .bib, with a backup first.
const KT = { busy: false };
const ktLev = (a, b) => {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (x, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};
async function openKwTidy() {
  if (!gs) return;
  const s = sheet = { mode: 'kwtidy' };
  showSheet(`<h2>Tidy keywords</h2><p class="sheet-note" id="ktWait">Looking through ${ENTRIES.length.toLocaleString()} publications\u2026</p>`, 'Apply');
  $('#sheetSave').disabled = true;
  await new Promise(ok => setTimeout(ok, 30));
  const r = await ktFind(() => sheet !== s);
  if (!r || sheet !== s) return;
  s.r = r;
  ktRender();
}
// What could be done: { groups: [[keyword...]], typos: [[keyword, misspelt]], rare: [{ k, e, to: [] }],
// missing: Map keyword -> [{ e, s }], none: [{ e, sugg: [] }] }.
async function ktFind(gone) {
  KWS.idx = kwsBuild();
  KWS.of = ENTRIES;
  const idx = KWS.idx, count = k => (KEYWORDS.get(k) || []).length, names = [...KEYWORDS.keys()];
  // The same written differently, or misspelt (a rare one a step or two
  // from a common one).
  const byKey = new Map();
  names.forEach(k => { const key = kwsKey(k); if (!byKey.has(key)) byKey.set(key, []); byKey.get(key).push(k); });
  const groups = [...byKey.values()].filter(g => g.length > 1);
  const grouped = new Set(groups.flat());
  groups.forEach(g => g.sort((a, b) => count(b) - count(a) || a.localeCompare(b)));
  // (Misspelt, perhaps: only offered, as some are other words, as
  // intensions for intentions. Not one that starts otherwise, or ends
  // with another suffix, as idealization or reliabilism.)
  const SUFFIX = /(ity|ism|ist|ion|al|ic|ive|ing|ed|er|y)$/;
  const typos = [];
  names.filter(k => !grouped.has(k) && count(k) <= 2 && k.length >= 5).forEach(k => {
    const a = norm(k);
    const near = names.filter(o => {
      const b = norm(o);
      if (o === k || count(o) < 3 * count(k) || count(o) < 3 || a.slice(0, 2) !== b.slice(0, 2)) return false;
      const sa = (SUFFIX.exec(a) || [''])[0], sb = (SUFFIX.exec(b) || [''])[0];
      if (sa && sb && sa !== sb) return false;
      return ktLev(a, b) <= (a.length >= 9 ? 2 : 1);
    }).sort((x, y) => count(y) - count(x))[0];
    if (near) { typos.push([near, k]); grouped.add(k); }
  });
  // Used once: changed to one with a word in common, or one suggested for
  // its publication.
  const rare = names.filter(k => count(k) === 1 && !grouped.has(k)).sort(COLLATE.compare).map(k => {
    const e = KEYWORDS.get(k)[0], words = kwsKey(k).split(' ').filter(w => w.length >= 4);
    const alike = names.filter(o => o !== k && count(o) > 1 && kwsKey(o).split(' ').some(w => words.includes(w))).sort((a, b) => count(b) - count(a));
    const i = idx.list.indexOf(e);
    const sugg = i >= 0 ? kwsScore(idx.vec[i], kwsText(e.f), e.kw, i, idx).map(x => x.k) : [];
    return { k, e, to: [...new Set(alike.slice(0, 2).concat(sugg))].filter(o => !e.kw.includes(o)).slice(0, 3) };
  });
  // Probably missing, and those with none: every publication, a little at
  // a time (so the page keeps answering).
  const missing = new Map(), none = [];
  for (let i = 0; i < idx.N; i++) {
    if (i % 150 === 149) { await new Promise(ok => setTimeout(ok, 0)); if (gone()) return null; }
    const e = idx.list[i];
    if (e.ib) continue;
    const list = kwsScore(idx.vec[i], kwsText(e.f), e.kw, i, idx);
    if (!e.kw.length) { if (e.f.title) none.push({ e, sugg: list.filter(x => x.s >= 0.12).slice(0, 4).map(x => x.k) }); continue; }
    list.filter(x => x.s >= 0.7).forEach(x => { if (!missing.has(x.k)) missing.set(x.k, []); missing.get(x.k).push({ e, s: x.s }); });
  }
  missing.forEach(l => l.sort((a, b) => b.s - a.s));
  return { groups, typos, rare, missing: new Map([...missing].sort((a, b) => b[1].length - a[1].length)), none: none.filter(x => x.sugg.length) };
}
function ktRender() {
  const r = sheet.r, count = k => (KEYWORDS.get(k) || []).length;
  const name = e => esc(String(e.f.title || e.k).replace(/[{}]/g, '').slice(0, 90)) + (e.f.year ? ' (' + esc(e.f.year) + ')' : '');
  const nMissing = [...r.missing.values()].reduce((a, l) => a + l.length, 0);
  let h = `<h2>Tidy keywords</h2><p class="sheet-note">${KEYWORDS.size.toLocaleString()} keywords on ${ENTRIES.filter(e => e.kw.length).length.toLocaleString()} publications. Nothing changes until you press Apply; the .bib is backed up first.</p>`;
  const sec = (id, title, n, note, body) => `<details class="kt-sec" id="${id}"${n ? ' open' : ''}><summary><h3>${title} <span class="bulk-n">${n}</span></h3></summary>` +
    (n ? `<p class="sheet-note">${note}</p>${body}` : `<p class="sheet-note">None.</p>`) + `</details>`;
  h += sec('ktGroups', 'Written differently', r.groups.length, 'The same keyword written more than one way: each made the one chosen. Untick a group to leave it.',
    r.groups.map((g, i) => `<div class="kt-group"><label class="check kt-on"><input type="checkbox" data-kt-g="${i}" checked></label><div class="kt-opts">` +
      g.map((k, j) => `<label class="kt-opt"><input type="radio" name="ktg${i}" value="${esc(k)}"${j ? '' : ' checked'}> ${esc(k)} <span class="bulk-n">${count(k)}</span></label>`).join('') + `</div></div>`).join(''));
  h += sec('ktTypos', 'Possibly misspelt', r.typos.length, 'A keyword used once or twice, a letter or two from a common one. Some are other words: tick only the misspellings, to be made the common one.',
    r.typos.map(([to, k], i) => `<label class="check kt-typo"><input type="checkbox" data-kt-t="${i}"> <span><b>${esc(k)}</b> <span class="bulk-n">${count(k)}</span> \u2192 ${esc(to)} <span class="bulk-n">${count(to)}</span></span></label>`).join(''));
  h += sec('ktRare', 'Used once', r.rare.length, 'Keywords only one publication has: keep each, remove it, or change it to one suggested.',
    r.rare.map((x, i) => `<div class="kt-rare"><div class="kt-rare-k"><b>${esc(x.k)}</b><span class="kt-pub">${name(x.e)}</span></div>` +
      `<div class="kt-acts" role="group" data-kt-rare="${i}" aria-label="What to do with \u201c${esc(x.k)}\u201d">` +
      `<button type="button" class="kt-act" data-kt-v="" aria-pressed="true">Keep</button><button type="button" class="kt-act kt-rm" data-kt-v="\u0000" aria-pressed="false">Remove</button>` +
      x.to.map(o => `<button type="button" class="kt-act" data-kt-v="${esc(o)}" aria-pressed="false" title="Change it to \u201c${esc(o)}\u201d">\u2192 ${esc(o)}</button>`).join('') + `</div></div>`).join(''));
  h += sec('ktMissing', 'Probably missing', nMissing, 'Keywords that publications very like these have, and these don\u2019t. Tick the ones to add.',
    [...r.missing].map(([k, l], i) => `<div class="kt-miss"><div class="kt-miss-h"><label class="check"><input type="checkbox" data-kt-mall="${i}"> ${esc(k)}</label>` +
      `<button type="button" class="kt-show" data-kt-show aria-expanded="false">${l.length} publication${l.length === 1 ? '' : 's'}${ICON.chev}</button></div><div class="kt-miss-l" hidden>` +
      l.map((x, j) => `<label class="check kt-pub-row"><input type="checkbox" data-kt-m="${i}:${j}"> ${name(x.e)}</label>`).join('') + `</div></div>`).join(''));
  h += sec('ktNone', 'Without keywords', r.none.length, 'Suggestions for publications with no keywords. Tap the ones to add.',
    r.none.map((x, i) => `<div class="kt-none"><span class="kt-pub">${name(x.e)}</span><div class="kt-none-k">` +
      x.sugg.map((k, j) => `<button type="button" class="kt-act" data-kt-n="${i}:${j}" aria-pressed="false">+ ${esc(k)}</button>`).join('') + `</div></div>`).join(''));
  $('#sheetBody').innerHTML = h;
  ktCount();
}
// The changes ticked: Map entry -> { drop: Set, add: [], rename: Map }.
function ktChanges() {
  const r = sheet.r, body = $('#sheetBody'), out = new Map();
  const of = e => { if (!out.has(e)) out.set(e, { rename: new Map(), drop: new Set(), add: [] }); return out.get(e); };
  r.groups.forEach((g, i) => {
    if (!body.querySelector(`[data-kt-g="${i}"]`).checked) return;
    const to = (body.querySelector(`[name="ktg${i}"]:checked`) || {}).value;
    g.filter(k => k !== to).forEach(k => (KEYWORDS.get(k) || []).forEach(e => { if (!e.ib) of(e).rename.set(k, to); }));
  });
  body.querySelectorAll('[data-kt-t]:checked').forEach(b => { const [to, k] = r.typos[+b.dataset.ktT]; (KEYWORDS.get(k) || []).forEach(e => { if (!e.ib) of(e).rename.set(k, to); }); });
  r.rare.forEach((x, i) => {
    const v = (body.querySelector(`[data-kt-rare="${i}"] [aria-pressed="true"]`) || { dataset: { ktV: '' } }).dataset.ktV;
    if (!v || x.e.ib) return;
    if (v === '\u0000') of(x.e).drop.add(x.k); else of(x.e).rename.set(x.k, v);
  });
  const ms = [...r.missing];
  body.querySelectorAll('[data-kt-m]:checked').forEach(b => { const [i, j] = b.dataset.ktM.split(':').map(Number); of(ms[i][1][j].e).add.push(ms[i][0]); });
  body.querySelectorAll('[data-kt-n][aria-pressed="true"]').forEach(b => { const [i, j] = b.dataset.ktN.split(':').map(Number); of(r.none[i].e).add.push(r.none[i].sugg[j]); });
  return out;
}
function ktCount() {
  const n = sheet && sheet.mode === 'kwtidy' && sheet.r ? ktChanges().size : 0;
  $('#sheetSave').textContent = n ? 'Apply to ' + n.toLocaleString() + ' publication' + (n === 1 ? '' : 's') : 'Apply';
  $('#sheetSave').disabled = !n;
}
$('#sheetBody').addEventListener('change', ev => {
  if (!sheet || sheet.mode !== 'kwtidy' || !sheet.r) return;
  const all = ev.target.closest('[data-kt-mall]');
  if (all) ev.target.closest('.kt-miss').querySelectorAll('[data-kt-m]').forEach(b => { b.checked = all.checked; });
  const one = ev.target.closest('[data-kt-m]');
  if (one) { const d = one.closest('.kt-miss'), bs = [...d.querySelectorAll('[data-kt-m]')], on = bs.filter(b => b.checked).length, a = d.querySelector('[data-kt-mall]'); a.checked = on === bs.length; a.indeterminate = on > 0 && on < bs.length; }
  ktCount();
});
// Used once: one of its buttons pressed (Keep, to start with); without
// keywords, each pressed or not.
$('#sheetBody').addEventListener('click', ev => {
  const n = sheet && sheet.mode === 'kwtidy' && ev.target.closest('[data-kt-n]');
  if (n) { n.setAttribute('aria-pressed', String(n.getAttribute('aria-pressed') !== 'true')); ktCount(); return; }
  const b = sheet && sheet.mode === 'kwtidy' && ev.target.closest('[data-kt-rare] .kt-act');
  if (!b) return;
  b.parentElement.querySelectorAll('.kt-act').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  ktCount();
});
$('#sheetBody').addEventListener('click', ev => {
  const b = sheet && sheet.mode === 'kwtidy' && ev.target.closest('[data-kt-show]');
  if (!b) return;
  const l = b.closest('.kt-miss').querySelector('.kt-miss-l'), open = l.hidden;
  l.hidden = !open;
  b.setAttribute('aria-expanded', String(open));
});
async function saveKwTidy() {
  const s = sheet, changes = ktChanges();
  const todo = [...changes].map(([e, c]) => {
    const raw = rawOf(e, 'keywords'), have = splitKw(raw), next = [];
    have.forEach(k => { if (c.drop.has(k)) return; const to = c.rename.get(k) || k; if (!next.includes(to)) next.push(to); });
    c.add.forEach(k => { if (!next.some(x => kwsKey(x) === kwsKey(k))) next.push(k); });
    return { e, set: next.join('\u0001') !== have.join('\u0001') ? { keywords: kwsJoin(raw, next) } : null, renamed: [...c.rename.keys(), ...c.drop] };
  }).filter(x => x.set);
  if (!todo.length) { closeSheet(); return; }
  sheetBusy(true);
  let step = '';
  const t0 = Date.now(), tell = () => { if (step && sheet === s) sheetMsg(step + '\u2026 (' + Math.round((Date.now() - t0) / 1000) + ' s)'); };
  const clock = setInterval(tell, 1000);
  try {
    const now = bibdeskTime();
    const res = await callServer('saveEntries', { items: todo.map(x => ({ key: x.e.k, set: x.set, groups: { add: [], remove: [] }, expectHash: x.e.h || null })),
      modified: now, backupName: fileTime(), onStep: t => { step = t; tell(); } });
    if (res.stamp) lastBibStamp = res.stamp;
    if (res.gh) DATA.gh = res.gh;
    let done = 0;
    todo.forEach(x => {
      if (!res.hashes[x.e.k]) return;
      x.e.h = res.hashes[x.e.k];
      setFields(x.e, Object.assign({}, x.set, { 'date-modified': now }));
      done++;
    });
    init(DATA, true);
    afterWrite();
    closeSheet();
    // (Saved searches by a keyword changed or removed: to look at.)
    const gone = new Set(todo.flatMap(x => x.renamed).map(norm));
    const searches = SMART.list.filter(x => /\bkw:/i.test(x.q) && [...gone].some(k => norm(x.q).includes(k))).map(x => '\u201c' + x.name + '\u201d');
    const skipped = res.skipped || [];
    toast('Changed the keywords of ' + done.toLocaleString() + ' publication' + (done === 1 ? '' : 's') +
      (skipped.length ? '; ' + skipped.length + ' left as they were (changed elsewhere since LibLande read them)' : '') +
      (searches.length ? '. Check the saved search' + (searches.length === 1 ? ' ' : 'es ') + searches.join(', ') + ': ' + (searches.length === 1 ? 'it looks' : 'they look') + ' for a keyword changed.' : ''), skipped.length || searches.length ? 9000 : 4000);
  } catch (err) {
    if (sheet === s) sheetMsg(errText(err), true);
  } finally {
    clearInterval(clock);
    if (sheet === s) sheetBusy(false);
  }
}
