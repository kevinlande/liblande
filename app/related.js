// LibLande: Related, in the reader: a reference selected in a paper looked up, to add it; and the sidebar's list of the works a paper cites, and of works like it, in your library and not.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, related, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/related.js'] = '2026-11-14.02';
/* ------------------------------------------------------------ a reference selected */
// Words selected in a paper that look like a reference (a year, or a DOI,
// with a name as "Fodor, J." or the like, pages or a journal's volume;
// on the pages where the references are, less is needed): the Quote
// bar's Add to library looks them up, with the title search's sources
// (Crossref is good at a whole reference), and shows what it found: one
// already in the library opens; another, Add opens, filled in.
function refLike(text, page) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length < 25 || t.length > 900) return false;
  const doi = /\b10\.\d{4,9}\/\S+/.test(t);
  const year = /\b(1[5-9]\d\d|20\d\d)[a-z]?\b/.test(t) || /\b(n\.\s?d\.|forthcoming|in press)(?!\w)/i.test(t);
  if (!doi && !year) return false;
  let s = doi ? 2 : 0;
  // (A name first, as references begin: "Fodor, J.", "Fodor, Jerry", "J. Fodor".)
  if (/^\s*(\[\d+\]|\d+\.)?\s*(\p{Lu}[\p{L}'\u2019-]+,\s*\p{Lu}|\p{Lu}\.\s*(\p{Lu}\.\s*)?\p{Lu}[\p{L}'\u2019-]+)/u.test(t)) s++;
  if (/\bet al\.|\(eds?\.\)|\beds?\.|\bpp?\.\s*\d|\b\d+\s*\(\d+\)|\b\d+\s*[-\u2013]\s*\d+\b|\bpress\b|\bjournal\b|\bvol\.|\bIn\s+\p{Lu}/u.test(t)) s++;
  if (/\(\s*(1[5-9]\d\d|20\d\d)[a-z]?\s*\)/.test(t)) s++;
  if (V.endPage && page >= V.endPage) s++;
  return s >= 2;
}
// The reference as asked about: without its number in the list ("[12]",
// "12."), and with its words joined again where a line broke one.
const refQuery = t => String(t || '').replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ').replace(/^\s*(\[\d+\]|\d+\.)\s*/, '').trim();
// How well a candidate fits the reference: most of its title's words in
// it, and its first author's surname or its year.
function refFit(c, text) {
  const words = new Set(tsWords(text)), tw = tsWords(c.title).filter(w => w.length > 2);
  if (!tw.length) return 0;
  const inTitle = tw.filter(w => words.has(w)).length / tw.length;
  const fam = tsWords(tsFamily(c.people[0] || '')), who = fam.length && fam.every(w => words.has(w));
  const when = c.year && words.has(c.year);
  return inTitle >= 0.75 && (who || when) ? inTitle + (who ? 0.5 : 0) + (when ? 0.3 : 0) : 0;
}
const REF = { seq: 0, el: null, list: [], at: 0, text: '' };
// A DOI's work, from Crossref, as a candidate.
async function refByDoi(doi) {
  const r = await npFetch(TS_CR + '/' + npPath(doi));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Crossref answered ' + r.status);
  const w = (await r.json()).message || {}, year = ((w.issued || {})['date-parts'] || [[]])[0][0];
  const p = list => (list || []).map(a => a.family ? (a.given ? a.family + ', ' + a.given : a.family) : a.name || '').map(tsClean).filter(Boolean);
  return { src: 'Crossref', doi: npDoi(w.DOI || doi), title: tsClean(((w.title || [])[0] || '') + ((w.subtitle || [])[0] ? ': ' + w.subtitle[0] : '')),
    people: p(w.author).length ? p(w.author) : p(w.editor), year: year ? String(year) : '', venue: tsClean((w['container-title'] || [])[0] || w.publisher || ''), score: 0 };
}
async function refFind(sel) {
  const text = refQuery(sel.text), my = ++REF.seq;
  REF.text = text;
  refCard(`<p class="ref-wait">Looking it up\u2026</p>`, sel.rect);
  let found;
  try {
    // (A DOI in it: that one, from Crossref; else the sources' matches
    // that fit.)
    const doi = npDoi((/\b(10\.\d{4,9}\/[^\s"<>]+)/.exec(text) || [])[1] || '').replace(/[.,;)\]]+$/, '');
    found = doi ? await refByDoi(doi).then(c => ({ list: c ? [c] : [], failed: [] })) : await tsFind(text);
    if (doi && !found.list.length) found = await tsFind(text.replace(/\b10\.\d{4,9}\/\S+/g, ' '));
  } catch (err) { found = { list: [], failed: ['all'] }; }
  if (my !== REF.seq || !REF.el) return;
  REF.list = found.list.map(c => Object.assign(c, { fit: refFit(c, text) })).filter(c => c.fit > 0 || (c.doi && text.toLowerCase().includes(c.doi.toLowerCase())))
    .sort((a, b) => b.fit - a.fit || b.score - a.score).slice(0, 4);
  REF.at = 0;
  refShow(found.failed && found.failed.length === TS_SOURCES.length);
}
function refShow(offline) {
  const c = REF.list[REF.at];
  if (!c) {
    refCard(`<p class="ref-none">${esc(offline ? (navigator.onLine ? 'The search didn\u2019t answer just now.' : 'You\u2019re offline.') : REF.list.length ? 'Nothing else found.' : 'Not found.')}</p>` +
      `<div class="ref-row"><button type="button" class="btn" data-ref-x>Close</button><button type="button" class="btn primary" data-ref-search>Search in Add\u2026</button></div>`);
    return;
  }
  const people = c.people.map(tsFamily), names = people.length > 2 ? people[0] + ' et al.' : people.join(' & ');
  const meta = [names, c.year, c.venue].filter(Boolean).map(esc).join(' \u00b7 ');
  const have = tsHave(c);
  refCard(`<p class="ref-k">${have ? 'In your library' : 'Found on ' + esc(c.src)}</p><p class="ref-t">${esc(have ? have.f.title || c.title : c.title)}</p>` +
    `<p class="ref-m">${meta}${c.doi ? ' \u00b7 ' + esc(c.doi) : ''}</p>` +
    `<div class="ref-row">${REF.list.length > REF.at + 1 || !have ? '<button type="button" class="btn" data-ref-next>Not this one</button>' : '<button type="button" class="btn" data-ref-x>Close</button>'}` +
    (have ? `<button type="button" class="btn primary" data-ref-open>Open</button>` : `<button type="button" class="btn primary" data-ref-add>Add\u2026</button>`) + `</div>`);
}
// The card: under the Quote bar (or the passage), until Esc, a tap
// elsewhere, or a choice.
function refCard(html, rect) {
  if (!REF.el) {
    REF.el = document.createElement('div');
    REF.el.className = 'ref-card';
    REF.el.setAttribute('role', 'dialog');
    REF.el.setAttribute('aria-label', 'Add this reference');
    document.body.appendChild(REF.el);
    REF.el.addEventListener('click', ev => {
      const c = REF.list[REF.at];
      if (ev.target.closest('[data-ref-x]')) refClose();
      else if (ev.target.closest('[data-ref-next]')) { REF.at++; refShow(); }
      else if (ev.target.closest('[data-ref-search]')) { const t = REF.text; refClose(); relAddFrom({ search: t }); }
      else if (ev.target.closest('[data-ref-open]') && c) { const e = tsHave(c); refClose(); if (e) relOpen(e); }
      else if (ev.target.closest('[data-ref-add]') && c) { refClose(); relAddFrom(c); }
    });
  }
  REF.el.innerHTML = html;
  REF.el.hidden = false;
  if (rect || !REF.el.style.top) {
    const q = QUOTE.el && !QUOTE.el.hidden ? QUOTE.el.getBoundingClientRect() : rect;
    const w = REF.el.offsetWidth, h = REF.el.offsetHeight;
    let top = q.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(8, q.top - h - 6);
    REF.el.style.top = top + 'px';
    REF.el.style.left = Math.max(8, Math.min(innerWidth - w - 8, q.left)) + 'px';
  }
}
function refClose() {
  REF.seq++;
  if (REF.el) { REF.el.remove(); REF.el = null; }
}
document.addEventListener('pointerdown', ev => { if (REF.el && !ev.target.closest('.ref-card, .quote-bar')) refClose(); }, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && REF.el) { ev.stopPropagation(); refClose(); } }, true);

// Adding one: Add, beside the paper (as Edit is), filled in from its DOI,
// or what was found, or searched for; the sidebar's list drawn again once
// it closes, added or not.
function relAddFrom(c) {
  if (!gs || $('#addBtn').hidden) return;
  // (Not over Edit, say, open beside the paper: its changes would be lost.)
  if (sheet) { toast('Save or cancel ' + (sheet.mode === 'edit' ? 'Edit' : 'what\u2019s open') + ' first.', 4000); return; }
  openAdd();
  if (!$('#viewer').hidden && !phoneMQ.matches) dockSheet();
  sheet.relBack = true;
  if (c.doi) { $('#doiLookup').value = c.doi; lookupIntoForm(); return; }
  if (c.fields) { tsChoose(c); return; }
  const q = c.search || [c.title, tsFamily(c.people && c.people[0])].filter(Boolean).join(' ');
  $('#doiLookup').value = q;
  if (tsIsQuery(q)) tsSearch(q); else lookupIntoForm();
}
// One in the library: its PDF in a tab of its own; or, with none, shown
// in the library.
function relOpen(e) {
  const fl = readablePdfs(e)[0];
  if (fl) { openPaper(e, fl); return; }
  if (!$('#viewer').hidden) $('#vClose').click();
  if (!state.view.some(x => x.k === e.k)) {
    if (state.q) { $('#q').value = ''; state.q = ''; }
    if (state.group !== 'all') setGroup('all'); else refresh(false);
  }
  const i = state.view.findIndex(x => x.k === e.k);
  if (i >= 0) select(i); else { state.selKey = e.k; renderDetail(); }
  if (phoneMQ.matches) go('detail');
}

/* ------------------------------------------------------------ the sidebar's Related */
// Cited here: the works the paper cites, from OpenAlex (found by its DOI,
// or else its title and year), those in your library marked, the others
// each with + to add it. Related: those in your library most like it (by
// the words of their titles and abstracts, their authors and journal, as
// for suggested keywords), with those it cites and those citing it, each
// saying why; or, for This page, most like the words of the page you're
// on. And OpenAlex's related works not in your library (or Semantic
// Scholar's recommendations, failing those). Asked once a paper, kept
// while LibLande's open.
const REL = { seg: store.get('relSeg', 'cited'), scope: 'paper', cache: new Map(), t: 0, token: 0, pageFor: '', pageHtml: '' };
const REL_SHOW = 8;
function relKey(e) { return e ? e.k : ''; }
function relState(e) {
  const k = relKey(e);
  if (!REL.cache.has(k)) REL.cache.set(k, { work: undefined, refs: null, citers: null, recs: null, errs: {} });
  return REL.cache.get(k);
}
function showRelated() {
  const body = $('#vSideBody'), e = infoEntry();
  if (!e) { body.innerHTML = `<p class="v-side-note">This paper has no entry in the library.</p>`; return; }
  const st = relState(e);
  REL.token++;
  const nRefs = st.refs ? ' <span class="rel-n">' + st.refs.length + '</span>' : '';
  let h = `<div class="rel" data-rel-for="${esc(e.k)}"><div class="rel-seg" role="tablist">` +
    `<button type="button" role="tab" data-rel-seg="cited" aria-selected="${REL.seg === 'cited'}">Cited here${nRefs}</button>` +
    `<button type="button" role="tab" data-rel-seg="related" aria-selected="${REL.seg === 'related'}">Related</button></div>`;
  if (REL.seg === 'cited') h += relCitedHtml(st);
  else {
    h += `<div class="rel-seg rel-scope"><button type="button" data-rel-scope="paper" aria-selected="${REL.scope === 'paper'}">This paper</button>` +
      `<button type="button" id="relPageBtn" data-rel-scope="page" aria-selected="${REL.scope === 'page'}"${V.doc ? '' : ' disabled'}>${relPageLabel()}</button></div>`;
    h += `<p class="rel-sec">In your library</p><div class="rel-list" id="relMine">${REL.scope === 'page' ? (REL.pageFor === relPageKey() && REL.pageHtml) || '<p class="v-side-note">Reading the page\u2026</p>' : relMineHtml(e, st)}</div>`;
    h += `<p class="rel-sec">Not in your library</p><div class="rel-list" id="relRecs">${relRecsHtml(st)}</div>`;
  }
  body.innerHTML = h + `</div>`;
  if (REL.seg === 'related' && REL.scope === 'page') relPage();
  relFetch(e, st);
}
// (Drawn again when what was asked for comes, if it's still this paper's
// Related that's showing.)
const relLive = e => SIDE.tab === 'related' && sideOpen() && !$('#viewer').hidden && infoEntry() && infoEntry().k === e.k;
// What's still to ask (the work, then its references and citers, and the
// recommendations), drawn once it's come. (Not asked again after it
// failed, until Try again.)
async function relFetch(e, st) {
  if (st.busy || !navigator.onLine) return;
  const jobs = [];
  st.busy = true;
  try {
    if (st.work === undefined && !st.errs.work) {
      try { st.work = await relWork(e); } catch (err) { st.errs.work = errText(err); }
    }
    const w = st.work;
    if (w && !st.refs && !st.errs.refs) jobs.push(relRefs(w).then(x => { st.refs = x; }, err => { st.errs.refs = errText(err); }));
    if (w && !st.citers && !st.errs.citers) jobs.push(relCiters(w).then(x => { st.citers = x; }, err => { st.errs.citers = errText(err); }));
    if (w !== undefined && !st.recs && !st.errs.recs) jobs.push(relRecs(e, w).then(x => { st.recs = x; }, err => { st.errs.recs = errText(err); }));
    await Promise.all(jobs);
  } finally { st.busy = false; }
  if ((jobs.length || st.errs.work) && relLive(e)) showRelated();
}
// The paper on OpenAlex: by its DOI, or by its title (and year).
async function relWork(e) {
  const sel = 'id,doi,display_name,publication_year,referenced_works,related_works';
  const doi = npDoi(e.f.doi);
  if (doi && !/[,|]/.test(doi)) {
    const r = await npFetch(NP_OA + '/works/doi:' + npPath(doi) + '?select=' + sel);
    if (r.ok) return r.json();
    if (r.status !== 404) throw new Error('OpenAlex didn\u2019t answer (' + r.status + ')');
  }
  const t = tsClean(e.f.title || '');
  if (!t) return null;
  const j = await npOa('/works', { filter: 'title.search:' + t.replace(/[,:|]/g, ' '), per_page: '5', select: sel });
  return (j.results || []).find(w => plainTitle(w.display_name) === plainTitle(t) && (!/^\d{4}$/.test(e.f.year || '') || !w.publication_year || Math.abs(w.publication_year - +e.f.year) <= 1)) || null;
}
// OpenAlex's works by their IDs, 50 at a time.
async function relWorks(ids) {
  const out = [], short = ids.map(x => String(x).replace(/^https?:\/\/openalex\.org\//, '')).filter(x => /^W\d+$/.test(x));
  for (let i = 0; i < short.length; i += 50) {
    const j = await npOa('/works', { filter: 'openalex_id:' + short.slice(i, i + 50).join('|'), per_page: '50', select: TS_OA_SELECT });
    (j.results || []).filter(w => w.display_name).forEach(w => out.push(tsOaWork(w)));
  }
  return out;
}
const relSort = list => list.sort((a, b) => norm(tsFamily(a.people[0] || a.title)).localeCompare(norm(tsFamily(b.people[0] || b.title))) || String(a.year).localeCompare(String(b.year)));
async function relRefs(w) { return relSort(await relWorks(w.referenced_works || [])); }
// Those citing it: only those in your library matter here, so the first
// 200 (most cited first) are enough.
async function relCiters(w) {
  const j = await npOa('/works', { filter: 'cites:' + String(w.id).replace(/^https?:\/\/openalex\.org\//, ''), per_page: '200', sort: 'cited_by_count:desc', select: 'id,doi,display_name,publication_year' });
  return (j.results || []).map(x => ({ doi: npDoi(x.doi), title: tsClean(x.display_name || ''), year: x.publication_year ? String(x.publication_year) : '' }));
}
// Works like it, not in your library: OpenAlex's related works (by the
// topics they share); or, with none, Semantic Scholar's recommendations
// for a DOI. (Semantic Scholar's are of recent papers only, and so less
// alike: tried on a philosophy paper, they were mostly about AI.)
async function relRecs(e, w) {
  if (w && (w.related_works || []).length) return relWorks(w.related_works.slice(0, 30));
  const doi = npDoi(e.f.doi);
  if (!doi) return [];
  const r = await npFetch(NP_S2 + '/forpaper/DOI:' + npPath(doi) + '?fields=title,externalIds,authors,venue,year&limit=30');
  if (r.status === 404) return [];
  if (!r.ok) throw new Error('Semantic Scholar didn\u2019t answer (' + r.status + ')');
  return ((await r.json()).recommendedPapers || []).filter(p => p.title).map(p => ({ src: 'Semantic Scholar', doi: npDoi(p.externalIds && p.externalIds.DOI),
    title: tsClean(p.title), people: (p.authors || []).map(a => tsPerson(a.name)).filter(Boolean), year: p.year ? String(p.year) : '', venue: tsClean(p.venue || ''),
    url: 'https:\/\/www.semanticscholar.org/paper/' + p.paperId }));
}
// A row: its title and who, when and where; then In library, or +.
function relRow(c, why, mine) {
  const have = c.e || tsHave(c);
  const people = (have ? (have.a || []).map(a => a[0]) : c.people.map(tsFamily)).filter(Boolean);
  const names = people.length > 2 ? people[0] + ' et al.' : people.join(' & ');
  const f = have ? have.f : {};
  const meta = [names, have ? f.year : c.year, have ? tsClean(f.journal || f.booktitle || f.publisher || '') : c.venue].filter(Boolean).map(esc).join(' \u00b7 ');
  const link = !have && (c.doi ? 'https:\/\/doi.org/' + c.doi : c.url || '');
  const title = esc(have ? tsClean(f.title || have.k) : c.title);
  return `<div class="rel-it${have ? ' have' : ''}"${have ? ` data-rel-open="${esc(have.k)}"` : ''}>` +
    `<span class="rel-t">${have ? `<button type="button" class="rel-title">${title}</button>` : link ? `<a class="rel-title" href="${esc(link)}" target="_blank" rel="noopener">${title}</a>` : `<span class="rel-title">${title}</span>`}` +
    `<span class="rel-m">${meta}</span>${why ? `<span class="rel-why">${esc(why)}</span>` : ''}</span>` +
    (have ? (mine ? '' : `<span class="rel-have">In library</span>`) : gs && !$('#addBtn').hidden ? `<button type="button" class="rel-add" data-rel-add="${esc(c.relId)}" aria-label="Add \u201c${esc(c.title)}\u201d to your library" title="Add to your library">${ICON.plus}</button>` : '') +
    `</div>`;
}
function relWait(st, what) {
  if (!navigator.onLine && !st.work) return `<p class="v-side-note">Online only: you\u2019re offline.</p>`;
  if (st.errs[what] || st.errs.work) return `<p class="v-side-note">Couldn\u2019t ask just now: ${esc(st.errs[what] || st.errs.work)}. <button type="button" class="link-btn" data-rel-retry>Try again</button></p>`;
  return `<p class="v-side-note">${navigator.onLine ? 'Looking\u2026' : 'Online only: you\u2019re offline.'}</p>`;
}
// (Each candidate given an id, to add it by.)
const REL_IDS = new Map();
function relId(c) { if (!c.relId) { c.relId = 'r' + REL_IDS.size; REL_IDS.set(c.relId, c); } return c; }
function relCitedHtml(st) {
  if (st.work === null) return `<p class="v-side-note">OpenAlex doesn\u2019t know this paper${infoEntry().f.doi ? '' : ' (it has no DOI)'}, so its references can\u2019t be listed. Select one in the paper\u2019s references to add it.</p>`;
  if (!st.refs) return relWait(st, 'refs');
  if (!st.refs.length) return `<p class="v-side-note">OpenAlex lists no references for this paper. Select one in the paper to add it.</p>`;
  const have = st.refs.filter(c => tsHave(c)).length;
  return `<p class="rel-sum">${have} in your library \u00b7 ${st.refs.length - have} not</p><div class="rel-list">${st.refs.map(c => relRow(relId(c))).join('')}</div>`;
}
// In your library: most like it, with those it cites and those citing it.
function relMineHtml(e, st) {
  const idx = kwsIndex(), i = idx.list.findIndex(x => x.k === e.k);
  const v = i >= 0 ? idx.vec[i] : kwsVector(kwsFeatures(e.f), idx);
  const cited = new Set((st.refs || []).map(c => tsHave(c)).filter(Boolean).map(x => x.k));
  const citing = new Set((st.citers || []).map(c => tsHave(Object.assign({ people: [] }, c))).filter(Boolean).map(x => x.k));
  // (Names compared as written any way: "Quilty-Dunn" with either hyphen.)
  const nk = a => norm(nameKey(a)), mine = new Set((e.a || []).map(nk));
  const top = relLike(v, e, idx, 40).map(({ e: x, s }) => ({ e: x, s: s + (cited.has(x.k) ? 0.35 : 0) + (citing.has(x.k) ? 0.35 : 0) }));
  // (Those it cites or that cite it, though not alike in words.)
  [...cited, ...citing].forEach(k => { if (!top.some(t => t.e.k === k) && BYKEY.get(k) && k !== e.k) top.push({ e: BYKEY.get(k), s: 0.35 + (cited.has(k) && citing.has(k) ? 0.35 : 0) }); });
  const list = top.sort((a, b) => b.s - a.s).slice(0, REL_SHOW);
  if (!list.length) return `<p class="v-side-note">Nothing in your library is much like it.</p>`;
  return list.map(({ e: x, s }) => {
    const why = [cited.has(x.k) && 'Cited here', citing.has(x.k) && 'Cites this', (x.a || []).some(a => mine.has(nk(a))) && 'Same author',
      s - (cited.has(x.k) ? 0.35 : 0) - (citing.has(x.k) ? 0.35 : 0) > 0.25 ? 'Very alike' : s - (cited.has(x.k) ? 0.35 : 0) - (citing.has(x.k) ? 0.35 : 0) > 0.06 ? 'Alike' : ''].filter(Boolean).join(' \u00b7 ');
    return relRow({ e: x, people: [], title: '' }, why, true);
  }).join('');
}
// The library's publications most like a vector: [{ e, s }], best first,
// without the paper itself (or a copy of it, by its title).
function relLike(v, self, idx, n) {
  const sim = new Float64Array(idx.N), own = plainTitle(self.f.title);
  v.forEach((x, t) => { const l = idx.inv.get(t); if (l) for (let j = 0; j < l.length; j += 2) sim[l[j]] += x * l[j + 1]; });
  const top = [];
  for (let d = 0; d < idx.N; d++) if (sim[d] > 0.04 && idx.list[d].k !== self.k && plainTitle(idx.list[d].f.title) !== own) top.push(d);
  return top.sort((a, b) => sim[b] - sim[a]).slice(0, n).map(d => ({ e: idx.list[d], s: sim[d] }));
}
function relRecsHtml(st) {
  if (!st.recs) return relWait(st, 'recs');
  const list = st.recs.filter(c => !tsHave(c)).slice(0, REL_SHOW);
  if (!list.length) return `<p class="v-side-note">None found${st.recs.length ? ' that aren\u2019t in your library already' : ''}.</p>`;
  return list.map(c => relRow(relId(c))).join('');
}
// This page: the library against the page's words; again as you turn
// pages (after a pause).
const relPageLabel = () => 'This page' + (V.viewer ? ' (' + esc(String(V.viewer.currentPageNumber)) + ')' : '');
const relPageKey = () => (infoEntry() ? infoEntry().k : '') + '|' + (V.viewer ? V.viewer.currentPageNumber : 0);
// (The page's number at once; its list after a pause in the turning, the
// old one kept meanwhile, and faded into the new only if it's changed.)
function relPageSoon() {
  if (REL.seg !== 'related' || REL.scope !== 'page') return;
  const b = $('#relPageBtn');
  if (b) b.textContent = relPageLabel();
  clearTimeout(REL.t);
  REL.t = setTimeout(() => { if (sideOpen() && SIDE.tab === 'related' && $('#relMine')) relPage(); }, 450);
}
async function relPage() {
  const e = infoEntry(), my = REL.token, key = relPageKey();
  if (!V.doc || !V.viewer || !e) return;
  const n = V.viewer.currentPageNumber;
  let text = '';
  try { text = (await (await V.doc.getPage(n)).getTextContent()).items.map(it => it.str).join(' '); } catch (err) { text = ''; }
  const el = $('#relMine');
  if (my !== REL.token || !el || key !== relPageKey()) return;
  const idx = kwsIndex(), m = new Map();
  kwsWords(text).forEach(w => m.set(w, (m.get(w) || 0) + 1));
  const list = m.size ? relLike(kwsVector(m, idx), e, idx, REL_SHOW) : [];
  const html = list.length ? list.map(({ e: x, s }) => relRow({ e: x, people: [], title: '' }, s > 0.2 ? 'Very alike' : 'Alike', true)).join('')
    : `<p class="v-side-note">${text.trim() ? 'Nothing in your library is much like this page.' : 'This page has no text to go by (a scan? Make it searchable first).'}</p>`;
  REL.pageFor = key;
  if (html === REL.pageHtml && el.innerHTML) return;
  REL.pageHtml = html;
  const swap = () => { if (el.isConnected) el.innerHTML = html; };
  if (!el.querySelector('.rel-it') || matchMedia('(prefers-reduced-motion: reduce)').matches) { swap(); return; }
  el.classList.add('rel-fade');
  clearTimeout(REL.fadeT);
  REL.fadeT = setTimeout(() => { swap(); el.offsetWidth; el.classList.remove('rel-fade'); }, 160);
}
$('#vSideBody').addEventListener('click', ev => {
  if (SIDE.tab !== 'related') return;
  const seg = ev.target.closest('[data-rel-seg]');
  if (seg) { REL.seg = seg.dataset.relSeg; store.set('relSeg', REL.seg); showRelated(); return; }
  const sc = ev.target.closest('[data-rel-scope]');
  if (sc) { REL.scope = sc.dataset.relScope; showRelated(); return; }
  if (ev.target.closest('[data-rel-retry]')) { const e = infoEntry(); if (e) relState(e).errs = {}; showRelated(); return; }
  const add = ev.target.closest('[data-rel-add]');
  if (add && REL_IDS.get(add.dataset.relAdd)) { relAddFrom(REL_IDS.get(add.dataset.relAdd)); return; }
  const open = ev.target.closest('.rel-title') && ev.target.closest('[data-rel-open]');
  if (open && BYKEY.get(open.dataset.relOpen)) relOpen(BYKEY.get(open.dataset.relOpen));
});

/* ------------------------------------------------------------ a passage's Related */
// With the Related tab open, a passage selected (or a highlight clicked)
// brings a card over the list, about that passage: the works it cites
// ("Fodor 2007", matched to the paper's references, or else your library),
// your publications most like its words, and OpenAlex's search for its
// key terms. The list behind is left as it was; Esc, the x, or a press
// anywhere else puts the card away.
const RELP = { el: null, text: '', seq: 0, shut: '' };
// Its author-year citations: [{ fam, year }] ("Fodor 2007", "Fodor
// (2007)", "Green and Quilty-Dunn 2021", "Smith et al., 2019"). Only those
// found among the references or in the library are shown, so a capital
// word before a year ("In 2007") does no harm.
function relCites(text) {
  const out = [], seen = new Set();
  const re = /([A-Z][\p{L}\u2019'\-]+)(?:(?:,\s*|\s+(?:and|&)\s+)[A-Z][\p{L}\u2019'\-]+)*(?:\s+et\s+al\.?)?,?\s*\(?((?:1[5-9]|20)\d\d)[a-z]?\b/gu;
  for (const m of String(text || '').matchAll(re)) {
    const k = norm(m[1]) + '|' + m[2];
    if (!seen.has(k)) { seen.add(k); out.push({ fam: norm(m[1]), year: m[2] }); }
  }
  return out;
}
const relFam = s => norm(String(s || '').replace(/[{}]/g, '')).replace(/\s+/g, ' ').trim();
function relCitedIn(text, st) {
  const rows = [], keys = new Set();
  relCites(text).forEach(({ fam, year }) => {
    const r = (st.refs || []).find(c => c.year === year && relFam(tsFamily(c.people[0])).split(' ').pop() === fam);
    const e = r ? null : ENTRIES.find(x => x.f.year === year && x.a && x.a[0] && relFam(x.a[0][0]).split(' ').pop() === fam);
    const k = r ? 'r:' + (r.doi || r.title) : e ? 'e:' + e.k : '';
    if (!k || keys.has(k)) return;
    keys.add(k);
    rows.push(r ? relRow(relId(r)) : relRow({ e, people: [], title: '' }, '', false));
  });
  return rows.join('');
}
// The passage's words, weighed as the library weighs them; its key terms
// (the rarest in your library) to search OpenAlex with.
function relPassageWords(text) {
  const m = new Map();
  kwsWords(String(text).replace(/\([^)]*\d{4}[^)]*\)/g, ' ')).forEach(w => m.set(w, (m.get(w) || 0) + 1));
  return m;
}
function relTerms(m, idx) {
  return [...m.keys()].filter(w => w.length > 3).sort((a, b) => (idx.df.get(a) || 0) - (idx.df.get(b) || 0) || m.get(b) - m.get(a)).slice(0, 5);
}
// (again: a highlight clicked again after its card was put away; else a
// selection's card, put away, stays away while it's the same passage,
// though the Quote bar comes back after a scroll.)
async function relPassage(text, colour, again) {
  const e = infoEntry();
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (!e || !sideOpen() || SIDE.tab !== 'related') return;
  if (text === RELP.text && RELP.el && !RELP.el.hidden) return;
  if (text === RELP.shut && !again) return;
  const idx = kwsIndex(), m = relPassageWords(text);
  // (A word or two selected is enough to go by; a highlight, any.)
  if (m.size < (again ? 1 : 2)) return;
  const my = ++RELP.seq, st = relState(e);
  RELP.text = text;
  if (!RELP.el) {
    RELP.el = document.createElement('div');
    RELP.el.className = 'rel-card';
    RELP.el.setAttribute('role', 'dialog');
    RELP.el.setAttribute('aria-label', 'Related to the passage');
    RELP.el.addEventListener('click', ev => {
      if (ev.target.closest('[data-relp-x]')) { relPassageClose(); return; }
      const add = ev.target.closest('[data-rel-add]');
      if (add && REL_IDS.get(add.dataset.relAdd)) { relPassageClose(); relAddFrom(REL_IDS.get(add.dataset.relAdd)); return; }
      const open = ev.target.closest('.rel-title') && ev.target.closest('[data-rel-open]');
      if (open && BYKEY.get(open.dataset.relOpen)) { relPassageClose(); relOpen(BYKEY.get(open.dataset.relOpen)); }
    });
    $('#vSide').appendChild(RELP.el);
  }
  const mine = relLike(kwsVector(m, idx), e, idx, 4)
    .map(({ e: x, s }) => relRow({ e: x, people: [], title: '' }, s > 0.2 ? 'Very alike' : 'Alike', true)).join('');
  const draw = (cited, recs) => {
    if (my !== RELP.seq || !RELP.el) return;
    RELP.el.innerHTML = `<div class="relp-hd"><p class="relp-q" style="border-left-color:${esc(colour || 'var(--accent)')}">\u201c${esc(text.length > 160 ? text.slice(0, 160).replace(/\s+\S*$/, '') + '\u2026' : text)}\u201d</p>` +
      `<button type="button" class="relp-x" data-relp-x aria-label="Close" title="Close (Esc)">${ICON.x}</button></div>` +
      (cited ? `<p class="rel-sec">Cited in it</p>${cited}` : '') +
      `<p class="rel-sec">In your library</p>${mine || '<p class="v-side-note">Nothing in your library is much like it.</p>'}` +
      `<p class="rel-sec">Not in your library</p>${recs}`;
  };
  const wait = `<p class="v-side-note">${navigator.onLine ? 'Asking OpenAlex\u2026' : 'Online only: you\u2019re offline.'}</p>`;
  draw(relCitedIn(text, st), wait);
  RELP.el.hidden = false;
  RELP.el.style.top = ($('#vSideBody').offsetTop + 6) + 'px';
  RELP.el.scrollTop = 0;
  $('#vSide').classList.add('relp-on');
  // (The references, if not asked for yet; then the citations again.)
  if (!st.refs && !st.busy) relFetch(e, st).then(() => { if (my === RELP.seq) draw(relCitedIn(text, st), RELP.recs || wait); });
  RELP.recs = null;
  if (!navigator.onLine) return;
  let recs;
  try {
    const terms = relTerms(m, idx), own = plainTitle(e.f.title);
    const j = await npOa('/works', { search: terms.join(' '), per_page: '15', select: TS_OA_SELECT });
    const list = (j.results || []).filter(w => w.display_name).map(tsOaWork).filter(c => !tsHave(c) && plainTitle(c.title) !== own).slice(0, 4);
    recs = list.length ? list.map(c => relRow(relId(c))).join('') : `<p class="v-side-note">None found that aren\u2019t in your library.</p>`;
  } catch (err) { recs = `<p class="v-side-note">Couldn\u2019t ask just now: ${esc(errText(err))}.</p>`; }
  if (my !== RELP.seq) return;
  RELP.recs = recs;
  draw(relCitedIn(text, st), recs);
}
function relPassageClose() {
  RELP.seq++;
  if (RELP.text) RELP.shut = RELP.text;
  RELP.text = '';
  if (RELP.el) RELP.el.hidden = true;
  $('#vSide').classList.remove('relp-on');
}
// A highlight clicked: its words and colour, and its note's words too.
// (One saved in the PDF: as the PDF has them, as the Annotations tab
// reads them. One made since: the words under it.)
async function relPassageMark(hit) {
  if (!hit || !hit.el || SIDE.tab !== 'related' || !sideOpen() || !V.doc) return;
  const n = +hit.page.dataset.pageNumber, r = hit.el.getBoundingClientRect();
  let text = '', colour = '';
  if (hit.id) {
    try {
      const page = await V.doc.getPage(n), a = (await page.getAnnotations()).find(x => x.id === hit.id);
      if (a) {
        if (a.quadPoints && a.quadPoints.length) text = textInQuads((await page.getTextContent()).items, a.quadPoints);
        text = [text, a.contentsObj && a.contentsObj.str].filter(Boolean).join(' ');
        if (a.color && a.color.length >= 3) colour = `rgb(${a.color[0]},${a.color[1]},${a.color[2]})`;
      }
    } catch (err) { /* the words under it, then */ }
  }
  if (!text.trim()) {
    text = regionText(r);
    const svg = drawnSvg(hit.page, r, '.canvasWrapper svg.highlight'), f = svg && (svg.getAttribute('fill') || (svg.querySelector('[fill]') ? svg.querySelector('[fill]').getAttribute('fill') : ''));
    if (f && f !== 'none') colour = f;
  }
  relPassage(text, colour, true);
}
document.addEventListener('pointerdown', ev => { if (RELP.el && !RELP.el.hidden && !ev.target.closest('.rel-card, .quote-bar')) relPassageClose(); }, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && RELP.el && !RELP.el.hidden) { ev.stopPropagation(); relPassageClose(); } }, true);
