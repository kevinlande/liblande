// LibLande: Link chapters to books: chapters already in the library linked to their books (crossref), and books added for chapters that have none.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/chapters.js'] = '2026-10-25.06';
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
// Suggestions dismissed (\u00d7): a chapter and the book it was matched to
// ("c:chapter>book"), or a book to add for chapters with that book title
// ("g:title"). Kept with your preferences too, so every device knows.
const LC_NO = new Set(store.get('lcNo', []));
function lcNoMerge(prefs) {
  const before = LC_NO.size;
  (prefs && prefs.lcNo || []).forEach(k => LC_NO.add(k));
  if (LC_NO.size !== before) store.set('lcNo', [...LC_NO]);
}
function lcNoSave() {
  store.set('lcNo', [...LC_NO]);
  if (window.google && google.script && google.script.run) google.script.run.withFailureHandler(() => {}).savePrefs({ lcNo: [...LC_NO] });
}
const lcPairId = x => 'c:' + x.c.k + '>' + x.b.k;
const lcGroupId = g => 'g:' + lcNorm(g.fields.title);
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
  // (Dismissed ones set aside, to bring back if you like.)
  const no = x => LC_NO.has(x.id);
  sure.forEach(x => { x.id = lcPairId(x); }); near.forEach(x => { x.id = lcPairId(x); }); groups.forEach(g => { g.id = lcGroupId(g); });
  const dismissed = sure.filter(no).concat(near.filter(no), groups.filter(no));
  return { sure: sure.filter(x => !no(x)), near: near.filter(x => !no(x)), groups: groups.filter(g => !no(g)), single, dismissed };
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
  // (The chapter's own "book title", which it was matched by.)
  const bt = c => `<span class="lc-bt">Book title: <q>${esc(c.f.booktitle || '')}</q></span>`;
  const no = id => `<button type="button" class="lc-no" data-lc-no="${esc(id)}" title="Dismiss: not this one, and don\u2019t suggest it again" aria-label="Dismiss this suggestion">${ICON.x}</button>`;
  const pair = (x, i, kind) => `<div class="lc-pair-row"><label class="lc-pair">${box(kind + ':' + i, x.on)}<span class="lc-c"><span class="lc-t">${esc(x.c.f.title || x.c.k)}</span><span class="lc-m">${esc(meta(x.c))}</span>${bt(x.c)}</span>` +
    `<span class="lc-arrow" aria-hidden="true">\u2192</span><span class="lc-b"><span class="lc-t">${esc(x.b.f.title || x.b.k)}</span><span class="lc-m">${esc(bookMeta(x.b))}${x.why ? ` \u00b7 <span class="lc-why">${esc(x.why)}</span>` : ''}</span></span></label>${no(x.id)}</div>`;
  const SHOW = 6;
  const list = (items, kind) => {
    const all = s.more.has(kind), shown = all ? items : items.slice(0, SHOW);
    return `<div class="lc-list">${shown.map((x, i) => pair(x, i, kind)).join('')}` +
      (items.length > SHOW ? `<button type="button" class="lc-more" data-lc-more="${kind}">${all ? 'Show fewer' : 'Show ' + (items.length - SHOW) + ' more'}</button>` : '') + `</div>`;
  };
  const grp = (g, i) => {
    const f = g.fields, all = s.more.has('g' + i), shown = all ? g.chapters : g.chapters.slice(0, 4);
    const tidy = g.chapters.filter(c => Object.keys(lcChanges(c, g.key, f)).length > 1).length;
    // (The chapters' book titles, as they're written: one way, or several.)
    const ways = [...new Set(g.chapters.map(c => c.f.booktitle || ''))];
    return `<div class="lc-grp${g.why ? ' series' : ''}"><div class="lc-gh-row"><label class="lc-gh">${box('grp:' + i, g.on)}<span class="lc-c">` +
      `<span class="lc-t">${esc(shownValue(f.title))}</span>` +
      `<span class="lc-bt">${ways.length === 1 ? 'Its chapters\u2019 book title' : 'Its chapters\u2019 book title, written ' + ways.length + ' ways'}: ${ways.slice(0, 3).map(w => '<q>' + esc(w) + '</q>').join(', ')}${ways.length > 3 ? '\u2026' : ''}</span>` +
      (g.why ? `<span class="lc-flag">${esc(g.why)}</span>` : `<span class="lc-new">Adds the book: <b>${esc([f.editor ? shownValue(f.editor) + ' (Ed' + (f.editor.split(' and ').length > 1 ? 's' : '') + '.)' : '', shownValue(f.publisher || ''), f.year].filter(Boolean).join(' \u00b7 '))}</b></span>`) +
      (tidy && !g.why ? `<span class="lc-fix">Also brings ${tidy === g.chapters.length ? 'its chapters\u2019' : tidy + ' of its chapters\u2019'} book details in line with it.</span>` : '') +
      `</span><span class="lc-cnt">${g.chapters.length} chapters</span></label>${no(g.id)}</div>` +
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
  if (r.dismissed.length) {
    const open = s.more.has('dismissed');
    h += `<section class="lc-sec lc-dis"><h3 class="lc-h"><span>Dismissed</span><span class="lc-n">${r.dismissed.length}</span><button type="button" class="lc-all" data-lc-more="dismissed">${open ? 'Hide' : 'Show'}</button></h3>` +
      (open ? `<div class="lc-list">` + r.dismissed.map(x => `<div class="lc-pair-row lc-gone"><span class="lc-c"><span class="lc-t">${esc(x.c ? x.c.f.title || x.c.k : shownValue(x.fields.title))}</span>` +
        `<span class="lc-m">${esc(x.c ? '\u2192 ' + (x.b.f.title || x.b.k) : 'A book to add, for ' + x.chapters.length + ' chapters')}</span></span>` +
        `<button type="button" class="lc-back" data-lc-back="${esc(x.id)}">Bring back</button></div>`).join('') + `</div>` : '') + `</section>`;
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
  const x = ev.target.closest('[data-lc-no], [data-lc-back]');
  if (x) {
    ev.preventDefault();
    if (x.dataset.lcNo) LC_NO.add(x.dataset.lcNo); else LC_NO.delete(x.dataset.lcBack);
    lcNoSave();
    // (Found again, with the ticks you'd set kept.)
    const was = new Map(), r0 = sheet.r;
    r0.sure.concat(r0.near, r0.groups).forEach(y => was.set(y.id, y.on));
    const r = sheet.r = lcFind();
    r.sure.forEach(y => { y.on = was.has(y.id) ? was.get(y.id) : true; });
    r.near.forEach(y => { y.on = was.has(y.id) ? was.get(y.id) : false; });
    r.groups.forEach(g => { g.on = was.has(g.id) ? was.get(g.id) : !g.why; });
    lcRender();
    return;
  }
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
    return true;
  } catch (err) {
    toast('Couldn\u2019t undo: ' + errText(err), 8000);
    return false;
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
// (instead: the other thing a drop could have meant, offered with Undo.)
async function lcLinkTo(book, chs, instead) {
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
    const u = () => undoLinkChapters(undo.filter(x => res.hashes[x.c.k]), [], res.hashes);
    toast((chs.length === 1 ? '\u201c' + shortTitle(chs[0].f.title || chs[0].k) + '\u201d is now a chapter of \u201c' : 'Linked ' + done.length + ' chapters to \u201c') + shortTitle(book.f.title || book.k) + '\u201d.', instead ? 10000 : 8000,
      [{ label: 'Undo', run: u }].concat(instead ? [{ label: instead.label, run: async () => { if (await u()) instead.run(); } }] : []));
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

/* ------------------------------------------------------------ suggested chapters */
// Add chapter: the book's chapters not yet in the library, suggested as
// keywords are (dashed chips, under the panel's head); one picked fills in
// its title, authors and pages (and DOI), and its pages are then found in
// the book's PDF. From Crossref (many edited books register each chapter:
// found by the book's ISBN, or else by its title), or else from the book's
// PDF's outline (titles and pages, no authors).
const CHS = { seq: 0, list: [] };
async function chFromCrossref(book) {
  const isbn = (book.f.isbn || '').split(/[,;\s]+/).map(x => x.replace(/[^\dXx]/g, '')).find(x => x.length === 13 || x.length === 10);
  const t = lcNorm(book.f.title);
  const url = TS_CR + '?rows=200&select=DOI,title,subtitle,author,page,container-title&filter=type:book-chapter' +
    (isbn ? ',isbn:' + isbn : '') + (isbn ? '' : '&query.bibliographic=' + encodeURIComponent(shownValue(book.f.title || '')));
  const r = await npFetch(url);
  if (!r.ok) return [];
  const names = list => (list || []).map(a => a.family ? (a.given ? a.family + ', ' + a.given : a.family) : a.name || '').map(tsClean).filter(Boolean);
  return ((await r.json()).message.items || [])
    // (By title: only those in this book.)
    .filter(w => isbn || (w['container-title'] || []).some(c => lcNorm(c) === t))
    .filter(w => (w.title || [])[0])
    .map(w => ({ title: tsClean(w.title[0] + ((w.subtitle || [])[0] ? ': ' + w.subtitle[0] : '')), author: names(w.author).join(' and '),
      pages: String(w.page || '').replace(/\s*[-\u2013]\s*/, '--'), doi: w.DOI || '' }));
}
// The printed page of a PDF page (its label, or by the numbers printed on
// pages near it), or null.
async function chPrinted(doc, n) {
  const L = await doc.getPageLabels().catch(() => null);
  if (L && L.some((l, i) => l !== String(i + 1)) && /^\d+$/.test(L[n - 1] || '')) return +L[n - 1];
  const votes = new Map(), N = doc.numPages;
  for (let i = Math.max(1, n - 3), k = 0; i <= N && k < 8; i++, k++) for (const x of await chNumbers(doc, i)) { const off = i - x; votes.set(off, (votes.get(off) || 0) + 1); }
  let best = null;
  for (const [off, c] of votes) if (c >= 2 && (!best || c > best[1])) best = [off, c];
  return best && n - best[0] > 0 ? n - best[0] : null;
}
const CH_SKIP = /^(cover|half[- ]title|title page|copyright|contents|table of contents|list of (figures|tables|contributors)|notes on contributors|contributors|index|(name|subject) index|bibliography|references|acknowledg\w*|dedication)\b/i;
async function chFromOutline(book) {
  const doc = await chDoc(book), out = await doc.getOutline().catch(() => null);
  if (!out || !out.length) return [];
  // (The top level; or, if it's just a few parts, the chapters in them.)
  let items = out.filter(o => o.title && !CH_SKIP.test(o.title.trim()));
  if (items.length < 3 && items.some(o => o.items && o.items.length)) items = items.flatMap(o => (o.items && o.items.length ? o.items : [o])).filter(o => o.title && !CH_SKIP.test(o.title.trim()));
  const at = async o => {
    try {
      const d = typeof o.dest === 'string' ? await doc.getDestination(o.dest) : o.dest;
      return d && d[0] ? (await doc.getPageIndex(d[0])) + 1 : null;
    } catch (err) { return null; }
  };
  const starts = [];
  for (const o of items) starts.push(await at(o));
  const res = [];
  for (let i = 0; i < items.length; i++) {
    const a = starts[i];
    if (!a) continue;
    const next = starts.slice(i + 1).find(Boolean), p1 = await chPrinted(doc, a), p2 = next ? await chPrinted(doc, next - 1) : null;
    res.push({ title: items[i].title.replace(/\s+/g, ' ').replace(/^(chapter\s+)?\d+[.:]?\s+/i, '').trim(), author: '', pages: p1 ? p1 + (p2 && p2 >= p1 ? '--' + p2 : '') : '', doi: '' });
  }
  return res;
}
// A book's chapters as found (Crossref's, kept half an hour for each
// book; or, if asked for and Crossref has none, the book's PDF's outline),
// in its order, each marked with the publication it is if it's already in
// the library (have).
const CH_FOUND = new Map();
async function chFind(book, outline) {
  const kept = CH_FOUND.get(book.k);
  let list = kept && Date.now() - kept.at < 30 * 60000 ? kept.list : null;
  if (!list) {
    list = [];
    try { if (!isOffline()) list = await chFromCrossref(book); } catch (err) { list = []; }
    if (list.length >= 2 || !isOffline()) CH_FOUND.set(book.k, { at: Date.now(), list });
  }
  if (list.length < 2 && outline && readablePdfs(book).length) { try { list = await chFromOutline(book); } catch (err) { /* none */ } }
  const have = new Map();
  (CHAPTERS.get(book.k) || []).concat(ENTRIES.filter(e => (e.t === 'incollection' || e.t === 'inbook') && lcNorm(e.f.booktitle) === lcNorm(book.f.title)))
    .forEach(e => have.set(lcNorm(e.f.title), e));
  return list.filter(c => c.title).map(c => Object.assign({}, c, { have: have.get(lcNorm(c.title)) || null }))
    .sort((a, b) => (parseInt(a.pages, 10) || 1e9) - (parseInt(b.pages, 10) || 1e9));
}
async function chSuggest(book) {
  const s = sheet, seq = ++CHS.seq;
  CHS.list = [];
  const head = $('#sheetBody .add-in');
  if (!head) return;
  head.insertAdjacentHTML('afterend', `<details class="ch-pick" id="chSugs" open><summary><span class="ch-pick-h">Its chapters</span><span class="ch-pick-n">Looking\u2026</span></summary></details>`);
  const list = await chFind(book, true);
  if (seq !== CHS.seq || sheet !== s) return;
  CHS.list = list;
  const box = $('#chSugs');
  if (!box) return;
  if (!list.length) { box.remove(); return; }
  const n = list.filter(c => c.have).length;
  box.querySelector('.ch-pick-n').textContent = list.length + (n ? ' \u00b7 ' + n + ' in your library' : '');
  box.insertAdjacentHTML('beforeend', `<div class="ch-not ch-in-panel"><ul>${chRows(list, 'data-ch-sug')}</ul></div>`);
}
// A book's chapters as rows (in the details, and in Add a chapter): each
// with its authors and pages, and + to add it; one already in the library
// marked so (\u2713), to go to.
function chRows(list, attr) {
  const who = c => parseNamesLite(c.author || '').map(([l]) => l).slice(0, 3).join(', ');
  return list.map((c, i) => `<li${c.have ? ' class="have"' : ''}><button type="button" ${attr}="${i}" title="${c.have ? 'Already in your library: go to it' : 'Add this chapter, filled in'}">` +
    `<span class="ch-t">${esc(c.title)}</span>${c.author || c.have ? `<span class="ch-a">${c.have ? `<span class="ch-here">${ICON.check}In your library</span>` : ''}${esc(c.author ? who(c) : '')}</span>` : ''}</button>` +
    `${c.pages ? `<span class="ch-pp">pp. ${esc(c.pages.replace('--', '\u2013'))}</span>` : ''}<span class="ch-plus" aria-hidden="true">${c.have ? '' : ICON.plus}</span></li>`).join('');
}
$('#sheetBody').addEventListener('click', ev => {
  const b = sheet && sheet.chapterOf && ev.target.closest('[data-ch-sug]');
  const c = b && CHS.list[+b.dataset.chSug];
  if (!c) return;
  chPick(c, b);
});
// One picked: filled in (or, one already here, gone to).
function chPick(c, b) {
  // (One already here: gone to, the panel closed if nothing's typed yet.)
  if (c.have) {
    const typed = ['title', 'author'].some(n => ($('#sheetBody [data-field="' + n + '"]') || {}).value);
    if (typed) { toast('\u201c' + shortTitle(c.title) + '\u201d is already in your library.', 3000); return; }
    closeSheet();
    showTwin(c.have.k);
    return;
  }
  const put = (n, v) => { const el = $('#sheetBody [data-field="' + n + '"]'); if (el && v != null) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  put('title', c.title);
  if (c.author) put('author', c.author);
  put('pages', c.pages);
  if (c.doi) put('doi', c.doi);
  // (The list folds away, saying which was picked; open it to pick another.)
  document.querySelectorAll('#chSugs li.on').forEach(x => x.classList.remove('on'));
  const i = CHS.list.findIndex(x => x.title === c.title), row = $('#chSugs [data-ch-sug="' + i + '"]');
  if (row) row.closest('li').classList.add('on');
  const box = $('#chSugs');
  if (box) { box.open = false; box.querySelector('.ch-pick-n').textContent = 'Picked: ' + shortTitle(c.title); }
}
// In a book's details, under its chapters here: those not yet here, from
// Crossref (not the PDF's outline: that would mean downloading the book),
// each to add with the book's details and its own filled in.
let CH_DETAIL = { k: null, list: [] };
async function chDetailSuggest(book) {
  const sec = $('#detail .d-chapters');
  if (!sec) return;
  const list = (await chFind(book, false)).filter(c => !c.have);
  if (state.selKey !== book.k || !list.length) return;
  CH_DETAIL = { k: book.k, list };
  const box = $('#detail .d-chapters');
  if (!box || box.querySelector('.ch-not')) return;
  box.insertAdjacentHTML('beforeend', `<div class="ch-not"><h4>Not in your library \u00b7 ${list.length}</h4><ul>${chRows(list, 'data-ch-add')}</ul></div>`);
}
$('#detail').addEventListener('click', ev => {
  const b = ev.target.closest('[data-ch-add]');
  if (!b) return;
  const book = BYKEY.get(CH_DETAIL.k), c = CH_DETAIL.list[+b.dataset.chAdd];
  if (!book || !c) return;
  openAddChapter(book);
  // (Filled in once the panel's own suggestions are drawn, or straight away.)
  CHS.list = CHS.list.length ? CHS.list : [c];
  chPick(c, null);
});
