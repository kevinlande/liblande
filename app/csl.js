// LibLande: Citation styles' data: a publication as CSL wants it (cslItem), and what citeproc-js gives back as LibLande's { text, html, parts } (cslOut). Shared with LibLande for Word (pages/word), which loads this file on its own.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/csl.js'] = '2026-11-12.03';
/* ---- a publication as CSL wants it */
const CSL_TYPES = { article: 'article-journal', book: 'book', proceedings: 'book', incollection: 'chapter', inbook: 'chapter',
  inproceedings: 'paper-conference', conference: 'paper-conference', phdthesis: 'thesis', mastersthesis: 'thesis',
  techreport: 'report', unpublished: 'manuscript', online: 'webpage' };
const CSL_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function cslDate(year, month) {
  const y = (/\d{4}/.exec(year || '') || [''])[0];
  if (!y) return year && String(year).trim() ? { literal: String(year).trim() } : null;
  const m = String(month || '').trim().toLowerCase(), n = /^\d+$/.test(m) ? +m : CSL_MONTHS.indexOf(m.slice(0, 3)) + 1;
  return { 'date-parts': [n >= 1 && n <= 12 ? [+y, n] : [+y]] };
}
function cslItem(e, id) {
  const f = e.f, t = e.t, v = s => String(s || '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  const names = list => (list || []).map(n => n[1] ? { family: v(n[0]), given: v(n[1]) } : { literal: v(n[0]) });
  const misc = t === 'misc' && (e.u || []).some(u => safeUrl(u)) && !f.doi ? 'webpage' : 'document';
  const item = { id, type: CSL_TYPES[t] || misc, title: v(f.title) };
  if (e.a && e.a.length) item.author = names(e.a);
  if (e.e && e.e.length) item.editor = names(e.e);
  const cont = t === 'article' ? f.journal : f.booktitle;
  if (cont) item['container-title'] = v(cont);
  if (f.shortjournal || f.journalabbr) item['container-title-short'] = v(f.shortjournal || f.journalabbr);
  if (f.volume) item.volume = v(f.volume);
  if (f.number) item[t === 'article' ? 'issue' : 'number'] = v(f.number);
  if (f.pages) item.page = v(f.pages).replace(/-+/g, '\u2013');
  const pub = t === 'phdthesis' || t === 'mastersthesis' ? f.school : t === 'techreport' ? f.institution : f.publisher;
  if (pub) item.publisher = v(pub);
  if (f.address || f.location) item['publisher-place'] = v(f.address || f.location);
  if (f.edition) item.edition = v(f.edition);
  if (f.series) item['collection-title'] = v(f.series);
  if (t === 'phdthesis') item.genre = 'PhD dissertation';
  if (t === 'mastersthesis') item.genre = 'Master\u2019s thesis';
  if (f.isbn) item.ISBN = v(f.isbn);
  const doi = v(f.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  if (doi) item.DOI = doi;
  const url = (e.u || []).find(u => safeUrl(u) && !/doi\.org\//i.test(u)) || (safeUrl(f.url || '') ? f.url : '');
  if (url) item.URL = url;
  const year = v(f.year);
  if (/^(forthcoming|in press)$/i.test(year)) item.status = year.toLowerCase();
  else { const d = cslDate(year, f.month); if (d) item.issued = d; }
  const orig = origYear(e);
  if (orig) item['original-date'] = { 'date-parts': [[+orig]] };
  return item;
}

// The engine's HTML as LibLande's { text, html, parts }: italics, bold,
// superscripts and small capitals kept; links and the rest as their text.
function cslOut(h) {
  const box = new DOMParser().parseFromString('<body>' + h + '</body>', 'text/html').body;
  let text = '', html = '';
  const parts = [];
  const walk = (n, it) => n.childNodes.forEach(c => {
    if (c.nodeType === 3) { text += c.data; html += esc(c.data); parts.push({ t: c.data, i: it }); return; }
    if (c.nodeType !== 1) return;
    // (A numbered style's number, in its own block before the entry.)
    if (c.nodeName === 'DIV' && text && !/\s$/.test(text)) { text += ' '; html += ' '; parts.push({ t: ' ', i: false }); }
    const tag = { I: 'i', EM: 'i', B: 'b', STRONG: 'b', SUP: 'sup', SUB: 'sub' }[c.nodeName] ||
      (/small-caps/.test(c.getAttribute('style') || '') ? 'span style="font-variant:small-caps"' : '');
    if (tag) html += '<' + tag + '>';
    walk(c, it || tag === 'i');
    if (tag) html += '</' + tag.split(' ')[0] + '>';
  });
  walk(box, false);
  return { text: text.replace(/\s+/g, ' ').trim(), html: html.replace(/\s+/g, ' ').trim(), parts };
}
