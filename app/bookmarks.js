// LibLande: bookmarked pages, and writing bookmarks into the PDF.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/bookmarks.js'] = '2026-11-11.02';
/* ---- bookmarked pages */
// Tap a page's top right corner twice to bookmark it (or press B for the
// current page). Bookmarks are saved into the PDF with your markup, as ordinary PDF
// bookmarks titled "Page n" that other PDF apps show too. The PDF's other
// bookmarks (a table of contents, if it has one) are under Outline.
const BM = { pages: new Set(), saved: new Set(), orig: new Set(), snips: new Map(), token: 0 };
const BM_TITLE = /^Page (\d+)$/;
const sameSet = (a, b) => a.size === b.size && Array.from(a).every(n => b.has(n));
const isBookmarkItem = it => BM_TITLE.test(String(it.title || '').trim()) && !(it.items && it.items.length);
const RIBBON = '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M1 0h18v26.5l-9-6.5-9 6.5z"/></svg>';
function ribbonFor(n) {
  const pv = V.viewer && V.viewer.getPageView(n - 1);
  if (!pv || !pv.div) return;
  let b = pv.div.querySelector(':scope > .pg-mark');
  if (!b) {
    b = document.createElement('button');
    b.type = 'button';
    b.className = 'pg-mark';
    b.innerHTML = RIBBON;
    pv.div.appendChild(b);
  }
  const on = BM.pages.has(n);
  if (on) b.classList.remove('armed');
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? 'Remove the bookmark on page ' + n : 'Bookmark page ' + n);
  b.title = on ? 'Bookmarked (tap to remove)' : 'Tap twice to bookmark this page';
}
function allRibbons() {
  document.querySelectorAll('#vPages .page[data-page-number]').forEach(p => ribbonFor(+p.dataset.pageNumber));
}
function resetBookmarks() {
  BM.token++;
  BM.pages = new Set(); BM.saved = new Set(); BM.orig = new Set(); BM.snips = new Map();
  V.bmDirty = false;
}
// The page an outline item goes to (0 if none).
async function destPage(doc, dest) {
  try {
    const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(d) || d[0] == null) return 0;
    if (typeof d[0] === 'object') return (await doc.getPageIndex(d[0])) + 1;
    return Number.isInteger(d[0]) ? d[0] + 1 : 0;
  } catch (err) { return 0; }
}
// The pages a PDF has "Page n" bookmarks for.
async function bookmarksOf(doc) {
  const pages = new Set();
  let items = [];
  try { items = (await doc.getOutline()) || []; } catch (err) { items = []; }
  for (const it of items) {
    if (!isBookmarkItem(it)) continue;
    const n = await destPage(doc, it.dest);
    if (n && n === +BM_TITLE.exec(String(it.title).trim())[1]) pages.add(n);
  }
  return pages;
}
async function loadBookmarks(doc) {
  const my = BM.token, pages = await bookmarksOf(doc);
  if (my !== BM.token || doc !== V.doc) return;
  BM.pages = new Set(pages); BM.saved = new Set(pages); BM.orig = new Set(pages);
  V.bmDirty = false;
  allRibbons();
  if (sideOpen() && SIDE.tab === 'bookmarks') showBookmarks();
}
function toggleBookmark(n) {
  if (!V.doc || !n) return;
  const on = !BM.pages.has(n);
  if (on) BM.pages.add(n); else BM.pages.delete(n);
  V.bmDirty = !sameSet(BM.pages, BM.saved);
  V.seq = (V.seq || 0) + 1;
  saveUI();
  autoChanged();
  ribbonFor(n);
  toast(on ? 'Bookmarked page ' + n : 'Removed the bookmark on page ' + n, 1600);
  if (sideOpen() && SIDE.tab === 'bookmarks') showBookmarks();
}
// The PDF's bytes with its "Page n" bookmarks made to match, using
// pdf-lib (PDF.js can't write bookmarks). Its other bookmarks stay as
// they are. Needed on every save while they differ from the PDF as opened,
// since PDF.js saves from that.
async function withBookmarks(bytes, pagesNow, always) {
  const want = pagesNow || BM.pages;
  if (!always && sameSet(want, BM.orig)) return bytes;
  const { PDFDocument, PDFName, PDFDict, PDFRef, PDFNumber, PDFHexString } = await loadPdfLib();
  let pdf;
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (err) {
    if (/encrypt/i.test(String(err && err.message))) throw new Error('This PDF is password-protected, so bookmarks can\u2019t be saved into it.');
    throw new Error('LibLande couldn\u2019t add the bookmarks to this PDF: ' + errText(err));
  }
  const ctx = pdf.context, cat = pdf.catalog, N = PDFName.of, pages = pdf.getPages();
  let rootRef = cat.get(N('Outlines')), root = cat.lookupMaybe(N('Outlines'), PDFDict);
  if (!root) { root = ctx.obj({ Type: 'Outlines' }); rootRef = ctx.register(root); cat.set(N('Outlines'), rootRef); }
  else if (!(rootRef instanceof PDFRef)) { rootRef = ctx.register(root); cat.set(N('Outlines'), rootRef); }
  const title = d => { try { const t = d.lookup(N('Title')); return t && t.decodeText ? t.decodeText() : ''; } catch (err) { return ''; } };
  const items = [];
  for (let ref = root.get(N('First')), guard = 0; ref instanceof PDFRef && guard < 20000; guard++) {
    const d = ctx.lookupMaybe(ref, PDFDict);
    if (!d || items.some(it => it.ref === ref)) break;
    items.push({ ref, d });
    ref = d.get(N('Next'));
  }
  const keep = items.filter(it => !(BM_TITLE.test(title(it.d).trim()) && !it.d.get(N('First'))));
  const add = Array.from(want).sort((a, b) => a - b).filter(n => n <= pages.length).map(n => {
    const d = ctx.obj({ Title: PDFHexString.fromText('Page ' + n), Parent: rootRef, Dest: [pages[n - 1].ref, 'Fit'] });
    return { ref: ctx.register(d), d };
  });
  const all = keep.concat(add);
  all.forEach((it, i) => {
    it.d.set(N('Parent'), rootRef);
    if (i > 0) it.d.set(N('Prev'), all[i - 1].ref); else it.d.delete(N('Prev'));
    if (i < all.length - 1) it.d.set(N('Next'), all[i + 1].ref); else it.d.delete(N('Next'));
  });
  if (!all.length) {
    cat.delete(N('Outlines'));
  } else {
    root.set(N('First'), all[0].ref);
    root.set(N('Last'), all[all.length - 1].ref);
    // Visible items: the top level, plus the open ones' own.
    let count = 0;
    for (const it of all) {
      count++;
      const c = it.d.lookup(N('Count'));
      if (c instanceof PDFNumber && c.asNumber() > 0) count += c.asNumber();
    }
    root.set(N('Count'), PDFNumber.of(count));
  }
  return pdf.save();
}
// The start of a page's text, to recognise it by.
async function pageSnippet(n) {
  if (BM.snips.has(n)) return BM.snips.get(n);
  let t = '';
  try {
    const tc = await (await V.doc.getPage(n)).getTextContent();
    t = tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  } catch (err) { t = ''; }
  BM.snips.set(n, t);
  return t;
}
async function showBookmarks() {
  const body = $('#vSideBody'), my = SIDE.token, doc = V.doc;
  const list = Array.from(BM.pages).sort((a, b) => a - b).filter(n => !doc || n <= doc.numPages);
  if (!list.length) {
    body.innerHTML = `<p class="v-side-note">No bookmarks yet. Tap the top right corner of a page twice to bookmark it (or press B).</p>`;
    return;
  }
  body.innerHTML = `<ul class="v-bms">` + list.map(n => `<li><button type="button" class="v-bm-go" data-page="${n}"><span class="v-bm-n">Page ${n}</span><span class="v-bm-snip" data-snip="${n}"></span></button>` +
    `<button type="button" class="v-bm-x" data-bm-del="${n}" aria-label="Remove the bookmark on page ${n}" title="Remove"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`).join('') + `</ul>`;
  for (const n of list) {
    const t = await pageSnippet(n);
    if (my !== SIDE.token || SIDE.tab !== 'bookmarks' || doc !== V.doc) return;
    const el = body.querySelector(`[data-snip="${n}"]`);
    if (el) el.textContent = t;
  }
}
// The ribbon takes the tap before any markup tool sees it.
window.addEventListener('pointerdown', ev => { if (ev.target.closest && ev.target.closest('.pg-mark')) ev.stopPropagation(); }, true);
$('#vPages').addEventListener('click', ev => {
  const b = ev.target.closest('.pg-mark');
  if (!b) return;
  ev.stopPropagation();
  const n = +b.closest('.page').dataset.pageNumber;
  // Not bookmarked: the first tap shows the ribbon, a second (within a few
  // seconds) adds it. Bookmarked: a tap removes it.
  if (b.getAttribute('aria-pressed') !== 'true' && !b.classList.contains('armed')) {
    b.classList.add('armed');
    clearTimeout(b._disarm);
    b._disarm = setTimeout(() => b.classList.remove('armed'), 3000);
    return;
  }
  clearTimeout(b._disarm);
  b.classList.remove('armed');
  toggleBookmark(n);
}, true);
window.addEventListener('resize', () => {
  if ($('#viewer').hidden) return;
  $('#viewer').classList.toggle('side-open', sideOpen() && !sidePhone());
});
