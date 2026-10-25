// LibLande: Link chapters to books: chapters already in the library linked to their books (crossref), and books added for chapters that have none.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/chapters.js'] = '2026-10-25.03';
/* ------------------------------------------------------------ link chapters */
// A chapter is linked to its book by its crossref field (see findChapters).
// Chapters added before that are linked here, after you've looked:
// - those whose book is in the library (the same title), ticked; those
//   whose book's main title alone matches, to check, not ticked;
// - those with no book entry, two or more of one book: the book added,
//   made from what they share, ticked; unless they look like chapters of a
//   series or reference work (the Stanford Encyclopedia, say: different
//   years or editors), not ticked;
// - a book's only chapter here: left as it is.
// Each linked chapter's book details are brought in line with its book:
// those it lacks filled in, and the editors (the same people) written the
// book's way. All in one save, with Undo.
const lcNorm = t => norm(String(t || '')).replace(/[{}\\]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const lcMain = t => lcNorm(String(t || '').split(/[:.?!]/)[0]);
const lcYear = v => (/\d{4}/.exec(String(v || '')) || [''])[0];
// (Names as BibTeX has them, and who they are, for comparing.)
const lcNames = raw => parseNamesLite(String(raw || '')).map(([l, f]) => (f ? l + ', ' + f : l)).join(' and ');
const lcWho = raw => parseNamesLite(String(raw || '')).map(([l]) => lcNorm(l)).sort().join('|');
const lcSeries = /\b(encyclop[a-z]*|lecture notes|annual review|proceedings|working papers?)\b/i;
// The most usual of some values (the first of those written most often).
function lcMost(values, key) {
  const n = new Map();
  values.filter(Boolean).forEach(v => { const k = key ? key(v) : v; n.set(k, (n.get(k) || []).concat([v])); });
  let best = null;
  for (const list of n.values()) if (!best || list.length > best.length) best = list;
  return best ? best[0] : '';
}
function lcFind() {
  const books = ENTRIES.filter(e => isBook(e) && !e.ib), byFull = new Map(), byMain = new Map();
  const add = (m, k, b) => { if (k) m.set(k, (m.get(k) || []).concat([b])); };
  books.forEach(b => { add(byFull, lcNorm(b.f.title), b); add(byMain, lcMain(b.f.title), b); });
  const chs = ENTRIES.filter(e => (e.t === 'incollection' || e.t === 'inbook') && !e.ib && !CHAPTER_OF.has(e.k) && e.f.booktitle);
  const sure = [], near = [], loose = new Map();
  for (const c of chs) {
    const hits = byFull.get(lcNorm(c.f.booktitle));
    if (hits) {
      // (Several books of that title: the one of its year, if just one is.)
      const same = hits.length > 1 ? hits.filter(b => lcYear(b.f.year) && lcYear(b.f.year) === lcYear(c.f.year)) : hits;
      if (same.length === 1) sure.push({ c, b: same[0] });
      else near.push({ c, b: hits[0], why: 'more than one book has this title' });
      continue;
    }
    const m = lcMain(c.f.booktitle), mains = m.length > 8 && byMain.get(m);
    if (mains) { near.push({ c, b: mains[0], why: 'only the main title matches' }); continue; }
    add(loose, lcNorm(c.f.booktitle), c);
  }
  const used = new Set();
  const groups = [...loose.values()].filter(list => list.length >= 2).map(list => {
    const raw = n => list.map(c => rawOf(c, n));
    // (The editors written most often; of those as often, the fullest.)
    const eds = raw('editor').filter(Boolean), byWho = new Map();
    eds.forEach(v => byWho.set(lcWho(v), (byWho.get(lcWho(v)) || []).concat([v])));
    const editor = ([...byWho.values()].sort((x, y) => y.length - x.length || y[0].split(/\s+and\s+/).length - x[0].split(/\s+and\s+/).length)[0] || [''])[0];
    // Not one book: years far apart (a year or two can be the online and
    // the printed one), or two chapters naming no editor in common (spelt
    // a little differently counts as the same).
    const ys = [...new Set(list.map(c => +lcYear(c.f.year)).filter(Boolean))];
    const spread = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    const sets = eds.map(v => lcWho(v).split('|').map(n => n.slice(0, 4)));
    const apart = sets.some((x, i) => sets.slice(i + 1).some(y => !x.some(n => y.includes(n))));
    const fields = { title: lcMost(raw('booktitle'), lcNorm) };
    if (editor) fields.editor = lcNames(editor);
    ['publisher', 'address', 'isbn', 'series'].forEach(n => { const v = lcMost(raw(n), lcNorm); if (v) fields[n] = v; });
    const year = lcMost(list.map(c => lcYear(c.f.year)));
    if (year) fields.year = year;
    const why = lcSeries.test(fields.title) ? 'Looks like a series or reference work'
      : spread > 2 && apart ? 'Not one book, it seems: years ' + Math.min(...ys) + '\u2013' + Math.max(...ys) + ', and different editors'
      : spread > 2 ? 'Not one book, it seems: years ' + Math.min(...ys) + '\u2013' + Math.max(...ys) + ' (editions, or a series)'
      : apart ? 'Not one book, it seems: its chapters name different editors'
      : !editor && !year ? 'Looks like a series: no editors or year in common' : '';
    // (A new cite key, not one in the library or taken by another here.)
    let key = makeCiteKey(fields), n = 1;
    while (used.has(key)) key = makeCiteKey(fields).replace(/[a-z]?$/, String.fromCharCode(97 + n++));
    used.add(key);
    list.sort((a, b) => firstPage(a) - firstPage(b) || cmpStr(a.f.title || '', b.f.title || ''));
    return { key, fields, chapters: list, why };
  }).sort((a, b) => !!a.why - !!b.why || b.chapters.length - a.chapters.length);
  const single = [...loose.values()].filter(list => list.length === 1).length;
  return { sure, near, groups, single };
}
// A chapter's changes to link it to a book (whose fields, as written, are
// given): crossref, and its book details made to agree.
function lcChanges(c, key, book) {
  const set = { crossref: key };
  const want = { booktitle: book.title, editor: book.editor, publisher: book.publisher, address: book.address, year: book.year };
  Object.keys(want).forEach(n => {
    const w = want[n], have = rawOf(c, n);
    if (!w || have === w) return;
    if (!have) set[n] = w;
    else if (n === 'editor' && lcWho(have) === lcWho(w)) set[n] = w;
    else if (n === 'booktitle' && lcNorm(have) === lcNorm(w)) set[n] = w;
  });
  return set;
}
const lcBookFields = b => ({ title: rawOf(b, 'title'), editor: rawOf(b, 'editor'), publisher: rawOf(b, 'publisher'), address: rawOf(b, 'address'), year: rawOf(b, 'year') });

function openLinkChapters() {
  if (!gs) return;
  const s = sheet = { mode: 'linkch', r: lcFind(), more: new Set() };
  const r = s.r;
  r.sure.forEach(x => { x.on = true; });
  r.near.forEach(x => { x.on = false; });
  r.groups.forEach(g => { g.on = !g.why; });
  showSheet(sheetHead('Link chapters to books', 'Link'), 'Link');
  $('#sheet').classList.add('head-mode', 'pop');
  lcRender();
}
function lcCount() {
  const r = sheet.r;
  const ch = r.sure.filter(x => x.on).length + r.near.filter(x => x.on).length + r.groups.filter(g => g.on).reduce((n, g) => n + g.chapters.length, 0);
  return { ch, books: r.groups.filter(g => g.on).length };
}
function lcRender() {
  const s = sheet, r = s.r;
  const who = e => e.authorsShort || '';
  const pp = e => (e.f.pages ? 'pp. ' + e.f.pages.replace(/-+/g, '\u2013') : '');
  const meta = e => [who(e), e.f.year, pp(e)].filter(Boolean).join(' \u00b7 ');
  const bookMeta = b => [b.authorsShort, b.f.year].filter(Boolean).join(' \u00b7 ');
  const box = (id, on) => `<input type="checkbox" class="lc-ck" data-lc="${id}"${on ? ' checked' : ''} aria-label="Link">`;
  const pair = (x, i, kind) => `<label class="lc-pair">${box(kind + ':' + i, x.on)}<span class="lc-c"><span class="lc-t">${esc(x.c.f.title || x.c.k)}</span><span class="lc-m">${esc(meta(x.c))}</span></span>` +
    `<span class="lc-arrow" aria-hidden="true">\u2192</span><span class="lc-b"><span class="lc-t">${esc(x.b.f.title || x.b.k)}</span><span class="lc-m">${esc(bookMeta(x.b))}${x.why ? ` \u00b7 <span class="lc-why">${esc(x.why)}</span>` : ''}</span></span></label>`;
  const SHOW = 6;
  const list = (items, kind) => {
    const all = s.more.has(kind), shown = all ? items : items.slice(0, SHOW);
    return `<div class="lc-list">${shown.map((x, i) => pair(x, i, kind)).join('')}` +
      (items.length > SHOW ? `<button type="button" class="lc-more" data-lc-more="${kind}">${all ? 'Show fewer' : 'Show ' + (items.length - SHOW) + ' more'}</button>` : '') + `</div>`;
  };
  const grp = (g, i) => {
    const f = g.fields, all = s.more.has('g' + i), shown = all ? g.chapters : g.chapters.slice(0, 4);
    const tidy = g.chapters.filter(c => Object.keys(lcChanges(c, g.key, f)).length > 1).length;
    return `<div class="lc-grp${g.why ? ' series' : ''}"><label class="lc-gh">${box('grp:' + i, g.on)}<span class="lc-c">` +
      `<span class="lc-t">${esc(shownValue(f.title))}</span>` +
      (g.why ? `<span class="lc-flag">${esc(g.why)}</span>` : `<span class="lc-new">Adds the book: <b>${esc([f.editor ? shownValue(f.editor) + ' (Ed' + (f.editor.split(' and ').length > 1 ? 's' : '') + '.)' : '', shownValue(f.publisher || ''), f.year].filter(Boolean).join(' \u00b7 '))}</b></span>`) +
      (tidy && !g.why ? `<span class="lc-fix">Also brings ${tidy === g.chapters.length ? 'its chapters\u2019' : tidy + ' of its chapters\u2019'} book details in line with it.</span>` : '') +
      `</span><span class="lc-cnt">${g.chapters.length} chapters</span></label>` +
      `<ul class="lc-chs">${shown.map(c => `<li><span class="lc-ct">${esc(c.f.title || c.k)}</span><span class="lc-ca">${esc(who(c))}</span><span class="lc-pp">${esc((c.f.pages || '').replace(/-+/g, '\u2013'))}</span></li>`).join('')}</ul>` +
      (g.chapters.length > 4 ? `<button type="button" class="lc-more" data-lc-more="g${i}">${all ? 'Show fewer' : 'Show ' + (g.chapters.length - 4) + ' more'}</button>` : '') + `</div>`;
  };
  const head = (label, n, act) => `<h3 class="lc-h"><span>${label}</span><span class="lc-n">${n}</span>${act || ''}</h3>`;
  let h = `<p class="lc-lead">Each chapter ticked is linked to its book (its crossref), so it shows under the book in the list, and its book details are brought in line with the book. Nothing is written until you press Link; then it\u2019s one change, with Undo.</p>`;
  if (!r.sure.length && !r.near.length && !r.groups.length) h += `<p class="lc-lead"><b>Nothing to link:</b> every chapter whose book is here is linked to it.</p>`;
  if (r.sure.length) h += `<section class="lc-sec">${head('Book in your library', r.sure.length, `<button type="button" class="lc-all" data-lc-all="sure">${r.sure.every(x => x.on) ? 'Untick all' : 'Tick all'}</button>`)}${list(r.sure, 'sure')}</section>`;
  if (r.near.length) h += `<section class="lc-sec">${head('Possibly their book: check these', r.near.length)}${list(r.near, 'near')}</section>`;
  if (r.groups.length) {
    const nch = r.groups.reduce((n, g) => n + g.chapters.length, 0);
    h += `<section class="lc-sec">${head('Several chapters, no book entry', r.groups.length + (r.groups.length === 1 ? ' book' : ' books') + ' \u00b7 ' + nch + ' chapters',
      `<button type="button" class="lc-all" data-lc-all="grp">${r.groups.filter(g => !g.why).every(g => g.on) ? 'Untick all' : 'Tick all but series'}</button>`)}${r.groups.map(grp).join('')}</section>`;
  }
  if (r.single) h += `<p class="lc-note">${r.single} chapter${r.single === 1 ? ' is' : 's are'} from books with only that chapter in your library. They\u2019re left as they are; each is linked by itself if you add its book later.</p>`;
  const top = $('#sheetBody').scrollTop;
  const body = $('#sheetBody .lc-body');
  if (body) body.innerHTML = h; else $('#sheetBody').insertAdjacentHTML('beforeend', `<div class="lc-body">${h}</div>`);
  $('#sheetBody').scrollTop = top;
  lcButton();
}
function lcButton() {
  const { ch, books } = lcCount();
  const label = ch ? 'Link ' + ch + ' chapter' + (ch === 1 ? '' : 's') : 'Link';
  document.querySelectorAll('#sheet .sheet-go').forEach(b => { b.textContent = label; b.disabled = !ch; });
  const sum = $('#sheetBody .lc-sum');
  const text = ch ? ch + ' chapter' + (ch === 1 ? '' : 's') + ' to link' + (books ? ' \u00b7 ' + books + ' book' + (books === 1 ? '' : 's') + ' to add' : '') : 'Nothing ticked';
  if (sum) sum.textContent = text; else $('#sheetBody .lc-body').insertAdjacentHTML('afterend', `<p class="lc-sum">${esc(text)}</p>`);
}
$('#sheetBody').addEventListener('change', ev => {
  const b = sheet && sheet.mode === 'linkch' && ev.target.closest('[data-lc]');
  if (!b) return;
  const [kind, i] = b.dataset.lc.split(':'), r = sheet.r;
  (kind === 'grp' ? r.groups : r[kind])[+i].on = b.checked;
  lcButton();
  const all = $('#sheetBody [data-lc-all="' + (kind === 'grp' ? 'grp' : 'sure') + '"]');
  if (all) all.textContent = kind === 'grp' ? (r.groups.filter(g => !g.why).every(g => g.on) ? 'Untick all' : 'Tick all but series') : (r.sure.every(x => x.on) ? 'Untick all' : 'Tick all');
});
$('#sheetBody').addEventListener('click', ev => {
  if (!sheet || sheet.mode !== 'linkch') return;
  const m = ev.target.closest('[data-lc-more]');
  if (m) { const k = m.dataset.lcMore; if (sheet.more.has(k)) sheet.more.delete(k); else sheet.more.add(k); lcRender(); return; }
  const a = ev.target.closest('[data-lc-all]');
  if (a) {
    const r = sheet.r;
    if (a.dataset.lcAll === 'sure') { const on = !r.sure.every(x => x.on); r.sure.forEach(x => { x.on = on; }); }
    else { const on = !r.groups.filter(g => !g.why).every(g => g.on); r.groups.forEach(g => { g.on = on && !g.why; }); }
    lcRender();
  }
});
async function saveLinkChapters() {
  const s = sheet, r = s.r, items = [], undo = [], adds = [];
  const link = (c, key, book) => {
    const set = lcChanges(c, key, book), old = {};
    Object.keys(set).forEach(n => { old[n] = rawOf(c, n); });
    items.push({ key: c.k, set, groups: { add: [], remove: [] }, expectHash: c.h || null });
    undo.push({ c, set: old });
  };
  r.sure.concat(r.near).filter(x => x.on).forEach(x => link(x.c, x.b.k, lcBookFields(x.b)));
  const now = bibdeskTime();
  r.groups.filter(g => g.on).forEach(g => {
    const type = 'book', fields = Object.assign({}, g.fields, { 'date-added': now, 'date-modified': now });
    adds.push({ type, key: g.key, fields });
    g.chapters.forEach(c => link(c, g.key, g.fields));
  });
  if (!items.length) { closeSheet(); return; }
  if (isOffline()) { sheetMsg('Linking chapters needs a connection. Try again when you\u2019re online.', true); return; }
  sheetBusy(true);
  let step = '';
  const t0 = Date.now(), tell = () => { if (step && sheet === s) sheetMsg(step + '\u2026 (' + Math.round((Date.now() - t0) / 1000) + ' s)'); };
  const clock = setInterval(tell, 1000);
  try {
    const res = await callServer('saveEntries', { items, adds, modified: now, backupName: fileTime(), onStep: t => { step = t; tell(); } });
    if (res.stamp) lastBibStamp = res.stamp;
    if (res.gh) DATA.gh = res.gh;
    const done = items.filter(x => res.hashes[x.key]);
    done.forEach(x => { const e = BYKEY.get(x.key); if (!e) return; e.h = res.hashes[x.key]; setFields(e, Object.assign({}, x.set, { 'date-modified': now })); });
    init(DATA, true);
    afterWrite();
    closeSheet();
    const skipped = res.skipped || [];
    const added = adds.filter(a => res.hashes[a.key]);
    toast('Linked ' + done.length + ' chapter' + (done.length === 1 ? '' : 's') + ' to their books' + (added.length ? ', and added ' + added.length + ' book' + (added.length === 1 ? '' : 's') : '') +
      (skipped.length ? '; ' + skipped.length + ' left as they were (changed elsewhere since LibLande read them)' : '') + '.', 10000,
      { label: 'Undo', run: () => undoLinkChapters(undo.filter(u => res.hashes[u.c.k]), added.map(a => ({ key: a.key, expectHash: res.hashes[a.key] })), res.hashes) });
  } catch (err) {
    if (sheet === s) sheetMsg(errText(err), true);
  } finally {
    clearInterval(clock);
    if (sheet === s) sheetBusy(false);
  }
}
// Undo: the chapters' fields as they were, and the books added taken out
// (if they haven't been changed since).
async function undoLinkChapters(undo, removes, hashes) {
  toast('Undoing\u2026', 0, null, true);
  try {
    const now = bibdeskTime();
    const res = await callServer('saveEntries', { items: undo.map(u => ({ key: u.c.k, set: u.set, groups: { add: [], remove: [] }, expectHash: hashes[u.c.k] || null })),
      removes, modified: now, backupName: fileTime() });
    if (res.stamp) lastBibStamp = res.stamp;
    if (res.gh) DATA.gh = res.gh;
    undo.forEach(u => { if (!res.hashes[u.c.k]) return; u.c.h = res.hashes[u.c.k]; setFields(u.c, Object.assign({}, u.set, { 'date-modified': now })); });
    init(DATA, true);
    afterWrite();
    toast('Undone: the chapters are as they were' + (removes.length ? ', and the books added are gone' : '') + '.', 4000);
  } catch (err) {
    toast('Couldn\u2019t undo: ' + errText(err), 8000);
  }
}
// Once on each device, when the library has chapters to link: a word, with
// Review to open the tool. (It's under Tools in the sidebar too.)
function lcOffer() {
  if (!gs || store.get('lcOffered', false) || (window.LIBLANDE_TEST && !window.LIBLANDE_LC_OFFER)) return;
  const r = lcFind(), n = r.sure.length + r.groups.filter(g => !g.why).reduce((k, g) => k + g.chapters.length, 0);
  store.set('lcOffered', true);
  if (n) toast(n + ' chapters could be linked to their books.', 12000, { label: 'Review', run: openLinkChapters });
}

/* ------------------------------------------------------------ kept linked */
// From now on, as publications are added (Add, in editing.js):
// - a chapter whose book is in the library (the same title; of several,
//   the one of its year) is linked to it, and given the book details it
//   lacks;
// - a book whose chapters are already here is offered them, to link.
function lcBookFor(vals) {
  const t = lcNorm(shownValue(vals.booktitle || ''));
  if (!t) return null;
  const hits = ENTRIES.filter(b => isBook(b) && !b.ib && lcNorm(b.f.title) === t);
  if (hits.length === 1) return hits[0];
  const same = hits.filter(b => lcYear(b.f.year) && lcYear(b.f.year) === lcYear(vals.year));
  return same.length === 1 ? same[0] : null;
}
// (A new chapter's fields with the link and its book's details it lacks.)
function lcFill(vals, book) {
  const b = lcBookFields(book), out = { crossref: book.k };
  ['booktitle', 'editor', 'publisher', 'address', 'year'].forEach(n => {
    const w = n === 'booktitle' ? b.title : b[n];
    if (w && !vals[n]) out[n] = w;
  });
  return out;
}
// A book's chapters in the library not linked to a book: by its title, and
// not years apart (another edition).
function lcChaptersFor(book) {
  const t = lcNorm(book.f.title), y = +lcYear(book.f.year);
  if (!t) return [];
  return ENTRIES.filter(c => (c.t === 'incollection' || c.t === 'inbook') && !c.ib && !CHAPTER_OF.has(c.k) && lcNorm(c.f.booktitle) === t &&
    !(y && +lcYear(c.f.year) && Math.abs(+lcYear(c.f.year) - y) > 2));
}
function lcOfferFor(book) {
  if (!gs || !BYKEY.has(book.k)) return;
  const chs = lcChaptersFor(book);
  if (!chs.length) return;
  toast(chs.length + ' chapter' + (chs.length === 1 ? ' in your library is' : 's in your library are') + ' from \u201c' + shortTitle(book.f.title || book.k) + '\u201d.', 15000,
    { label: 'Link ' + (chs.length === 1 ? 'it' : 'them'), run: () => lcLinkTo(book, chs) });
}
async function lcLinkTo(book, chs) {
  if (isOffline()) { toast('Linking chapters needs a connection. Try again when you\u2019re online.', 5000); return; }
  const now = bibdeskTime(), b = lcBookFields(book), items = [], undo = [];
  chs.forEach(c => {
    const set = lcChanges(c, book.k, b), old = {};
    Object.keys(set).forEach(n => { old[n] = rawOf(c, n); });
    items.push({ key: c.k, set, groups: { add: [], remove: [] }, expectHash: c.h || null });
    undo.push({ c, set: old });
  });
  toast('Linking ' + chs.length + ' chapter' + (chs.length === 1 ? '' : 's') + '\u2026', 0, null, true);
  try {
    const res = await callServer('saveEntries', { items, modified: now, backupName: fileTime() });
    if (res.stamp) lastBibStamp = res.stamp;
    if (res.gh) DATA.gh = res.gh;
    const done = items.filter(x => res.hashes[x.key]);
    done.forEach(x => { const e = BYKEY.get(x.key); if (!e) return; e.h = res.hashes[x.key]; setFields(e, Object.assign({}, x.set, { 'date-modified': now })); });
    init(DATA, true);
    afterWrite();
    toast('Linked ' + done.length + ' chapter' + (done.length === 1 ? '' : 's') + ' to \u201c' + shortTitle(book.f.title || book.k) + '\u201d.', 8000,
      { label: 'Undo', run: () => undoLinkChapters(undo.filter(u => res.hashes[u.c.k]), [], res.hashes) });
  } catch (err) {
    toast('Couldn\u2019t link the chapters: ' + errText(err), 8000);
  }
}

/* ------------------------------------------------------------ a chapter's pages */
// Add chapter, for a book whose PDF is here: the chapter's pages (as the
// Pages box gives them) found in the book's PDF, by its page labels or else
// by the printed page numbers on pages near them, and attached to the new
// chapter as a PDF of their own. The first and last are shown, to check,
// each moved a page at a time with < > if it isn't right (always, for a
// scan, whose numbers can't be read).
const CHP = { book: null, doc: null, bytes: null, from: 0, to: 0, sure: false, seq: 0, t: 0 };
async function chDoc(book) {
  if (CHP.book === book.k && CHP.doc) return CHP.doc;
  const bytes = await getPdfBytes(readablePdfs(book)[0]);
  const doc = await openPdf(await loadPdfJs(), { data: bytes.slice(0) }).promise;
  if (CHP.doc) closePdf(CHP.doc);
  Object.assign(CHP, { book: book.k, doc, bytes });
  return doc;
}
// The page numbers printed at a page's head or foot.
async function chNumbers(doc, n) {
  try {
    const page = await doc.getPage(n), h = page.view[3] - page.view[1];
    return (await page.getTextContent()).items.filter(it => /^\d{1,4}$/.test((it.str || '').trim()) && (it.transform[5] > h * 0.86 || it.transform[5] < h * 0.12)).map(it => +it.str.trim());
  } catch (err) { return []; }
}
// The PDF page of printed page p: {n, sure}.
async function chPdfPage(doc, p) {
  const N = doc.numPages;
  const L = await doc.getPageLabels().catch(() => null);
  if (L && L.some((l, i) => l !== String(i + 1))) { const i = L.indexOf(String(p)); if (i >= 0) return { n: i + 1, sure: true }; }
  // (How far the PDF's pages are from the printed ones, as most pages
  // near it show: front matter, a cover.)
  const votes = new Map();
  for (let i = Math.max(1, Math.min(N, p) - 6), k = 0; i <= N && k < 24; i += 3, k++) {
    for (const x of await chNumbers(doc, i)) { const off = i - x; if (off > -30 && off < 300) votes.set(off, (votes.get(off) || 0) + 1); }
  }
  let best = null;
  for (const [off, c] of votes) if (c >= 2 && (!best || c > best[1])) best = [off, c];
  if (best && p + best[0] >= 1 && p + best[0] <= N) return { n: p + best[0], sure: true };
  return { n: Math.max(1, Math.min(N, p)), sure: false };
}
function chPdfSetup(book) {
  sheet.chBook = book.k;
  const fld = $('#addPdf').closest('.fld');
  fld.insertAdjacentHTML('beforebegin', `<div class="fld ch-pdf" id="chPdf"><label>From the book</label><div class="ch-pdf-in">` +
    `<label class="check"><input type="checkbox" id="chPdfOn" checked>Attach its pages from the book\u2019s PDF</label>` +
    `<p class="ch-pdf-st" id="chPdfSt">Give the chapter\u2019s pages, and they\u2019re found in the book\u2019s PDF.</p>` +
    `<div class="ch-pdf-ends" id="chPdfEnds" hidden></div></div></div>`);
  const pages = $('#sheetBody [data-field="pages"]');
  if (pages && pages.value) chPdfFind();
}
const chRange = () => {
  const v = ($('#sheetBody [data-field="pages"]') || {}).value || '';
  const m = /(\d+)\s*(?:[-\u2013\u2014]+\s*(\d+))?/.exec(v);
  return m ? [+m[1], +(m[2] || m[1])] : null;
};
async function chPdfFind() {
  const s = sheet, seq = ++CHP.seq, st = $('#chPdfSt'), r = chRange(), book = s && BYKEY.get(s.chBook);
  if (!st || !book) return;
  if (!r || r[1] < r[0]) { st.textContent = 'Give the chapter\u2019s pages, and they\u2019re found in the book\u2019s PDF.'; $('#chPdfEnds').hidden = true; CHP.from = CHP.to = 0; return; }
  st.textContent = 'Finding pp. ' + r[0] + '\u2013' + r[1] + ' in the book\u2019s PDF\u2026';
  try {
    const doc = await chDoc(book);
    const a = await chPdfPage(doc, r[0]);
    if (seq !== CHP.seq || sheet !== s) return;
    // (A PDF shorter than the chapter's pages, read as they are: not the
    // whole book, it seems.)
    if (!a.sure && r[0] > doc.numPages) {
      CHP.from = CHP.to = 0;
      $('#chPdfEnds').hidden = true;
      st.textContent = 'The book\u2019s PDF has only ' + doc.numPages + ' pages, so pp. ' + r[0] + '\u2013' + r[1] + ' aren\u2019t in it. The chapter is added without a PDF.';
      $('#chPdfOn').checked = false;
      return;
    }
    // (The last page: as far on as the chapter is long, from the first.)
    Object.assign(CHP, { from: a.n, to: Math.min(doc.numPages, a.n + (r[1] - r[0])), sure: a.sure });
    chPdfShow();
  } catch (err) {
    if (seq === CHP.seq && sheet === s) { st.textContent = 'The book\u2019s PDF couldn\u2019t be read (' + errText(err) + '); the chapter is added without it.'; $('#chPdfOn').checked = false; }
  }
}
function chPdfShow() {
  const st = $('#chPdfSt'), ends = $('#chPdfEnds');
  if (!st) return;
  const r = chRange(), N = CHP.doc.numPages;
  st.innerHTML = (r ? 'pp. ' + r[0] + '\u2013' + r[1] + ': ' : '') + 'PDF pages <b>' + CHP.from + '\u2013' + CHP.to + '</b> of ' + N +
    (CHP.sure ? '. Check the first and last.' : '. <span class="ch-guess">A guess (the page numbers couldn\u2019t be read): check the first and last.</span>');
  const end = (k, label, n) => `<div class="ch-end"><button type="button" class="ch-th" data-chp-th="${k}" data-chp-big="${k}" title="See it full size" aria-label="${label}: see it full size"></button><span class="ch-end-l">${label}</span>` +
    `<span class="ch-step"><button type="button" class="btn" data-chp="${k}:-1" aria-label="${label}: a page earlier">\u2039</button><b>${n}</b><button type="button" class="btn" data-chp="${k}:1" aria-label="${label}: a page later">\u203a</button></span></div>`;
  ends.innerHTML = end('from', 'First page', CHP.from) + end('to', 'Last page', CHP.to);
  ends.hidden = false;
  ['from', 'to'].forEach(k => chThumb(CHP[k], ends.querySelector(`[data-chp-th="${k}"]`)));
  if ($('#chBig')) chBig(CHP.big);
}
async function chThumb(n, el, w) {
  const doc = CHP.doc;
  try {
    w = w || 150;
    const page = await doc.getPage(n), dpr = Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: w * dpr / page.getViewport({ scale: 1 }).width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    c.style.width = w + 'px';
    await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp, background: 'white' }).promise;
    if (doc === CHP.doc && el.isConnected) el.replaceChildren(c);
  } catch (err) { /* left blank */ }
}
$('#sheetBody').addEventListener('input', ev => {
  if (!sheet || !sheet.chBook || !ev.target.matches('[data-field="pages"]')) return;
  clearTimeout(CHP.t);
  CHP.t = setTimeout(chPdfFind, 600);
});
// A page full size, over the panel, to read its first or last lines: with
// < > to move that end a page at a time, as beside the thumbnail.
function chBig(k) {
  CHP.big = k;
  let o = $('#chBig');
  if (!o) {
    o = document.createElement('div');
    o.id = 'chBig';
    o.className = 'ch-big';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    document.body.appendChild(o);
    o.addEventListener('click', ev => {
      if (ev.target === o || ev.target.closest('[data-chb-x]')) { chBigClose(); return; }
      const s = ev.target.closest('[data-chp]');
      if (s) { chStep(s.dataset.chp); return; }
      // (A tap on the page: as wide as the window, to read small print;
      // again, the whole page.)
      if (ev.target.closest('[data-chb-page]')) { CHP.wide = !CHP.wide; chBig(CHP.big); }
    });
  }
  const label = k === 'from' ? 'First page' : 'Last page', n = CHP[k];
  o.setAttribute('aria-label', label);
  o.innerHTML = `<div class="ch-big-box"><div class="ch-big-head"><b>${label}</b><span>PDF page ${n} of ${CHP.doc.numPages}</span>` +
    `<span class="ch-step"><button type="button" class="btn" data-chp="${k}:-1" aria-label="A page earlier">\u2039</button><button type="button" class="btn" data-chp="${k}:1" aria-label="A page later">\u203a</button></span>` +
    `<button type="button" class="tb-btn" data-chb-x aria-label="Close" title="Close (Esc)">${ICON.x}</button></div><div class="ch-big-page" data-chb-page></div></div>`;
  const w = CHP.wide ? Math.min(1400, window.innerWidth - 40) : Math.min(820, window.innerWidth - 40, Math.round((window.innerHeight - 120) * 0.72));
  const pg = o.querySelector('[data-chb-page]');
  pg.classList.toggle('wide', !!CHP.wide);
  pg.title = CHP.wide ? 'Tap to see the whole page' : 'Tap to zoom in';
  chThumb(n, pg, w);
}
function chBigClose() { const o = $('#chBig'); if (o) o.remove(); CHP.big = null; CHP.wide = false; }
document.addEventListener('keydown', ev => {
  if (!$('#chBig')) return;
  if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); chBigClose(); }
  else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); chStep(CHP.big + ':' + (ev.key === 'ArrowLeft' ? -1 : 1)); }
}, true);
function chStep(spec) {
  const [k, d] = spec.split(':'), N = CHP.doc.numPages;
  CHP[k] = Math.max(1, Math.min(N, CHP[k] + +d));
  if (CHP.from > CHP.to) { if (k === 'from') CHP.to = CHP.from; else CHP.from = CHP.to; }
  chPdfShow();
}
$('#sheetBody').addEventListener('click', ev => {
  const big = sheet && sheet.chBook && CHP.doc && ev.target.closest('[data-chp-big]');
  if (big) { chBig(big.dataset.chpBig); return; }
  const b = sheet && sheet.chBook && ev.target.closest('[data-chp]');
  if (!b || !CHP.doc) return;
  chStep(b.dataset.chp);
});
const chPdfWanted = () => !!(sheet && sheet.chBook && CHP.doc && CHP.from && $('#chPdfOn') && $('#chPdfOn').checked);
// The pages, as a PDF of their own (pdf-lib).
async function chPdfFile() {
  const PL = await loadPdfLib();
  const src = await PL.PDFDocument.load(CHP.bytes, { ignoreEncryption: true }), out = await PL.PDFDocument.create();
  const idx = [];
  for (let i = CHP.from; i <= CHP.to; i++) idx.push(i - 1);
  (await out.copyPages(src, idx)).forEach(p => out.addPage(p));
  return new File([await out.save()], 'chapter.pdf', { type: 'application/pdf' });
}
