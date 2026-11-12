// LibLande: A PDF's marks as text (which text a highlight covers, the kinds of mark), and notes' Markdown as HTML. Shared with LibLande for Word (pages/word), which loads this file on its own.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/marks.js'] = '2026-11-12.14';
/* ---- a PDF's marks */
// A note is a highlight drawn this faint (see reader.js).
const NOTE_OPACITY = 0.03;
const isNoteOpacity = op => op != null && Math.abs(op - NOTE_OPACITY) < 0.004;
// Annotations: every highlight, drawing, note and shape, by page, with the
// highlighted words where the PDF has text.
const MARK_NAMES = { Highlight: 'Highlight', Underline: 'Underline', StrikeOut: 'Strikethrough', Squiggly: 'Squiggly underline',
  Ink: 'Drawing', Text: 'Note', FreeText: 'Text box', Square: 'Rectangle', Circle: 'Oval', Line: 'Line', Polygon: 'Shape',
  PolyLine: 'Lines', Stamp: 'Stamp', Caret: 'Insertion' };
function textInQuads(items, qp) {
  const rects = [];
  for (let i = 0; i + 7 < qp.length; i += 8) {
    const xs = [qp[i], qp[i + 2], qp[i + 4], qp[i + 6]], ys = [qp[i + 1], qp[i + 3], qp[i + 5], qp[i + 7]];
    rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  const out = [], used = new Set();
  for (const [x0, y0, x1, y1] of rects) {
    const line = [];
    for (const it of items) {
      // (A line's words once, though the boxes of two lines overlap.)
      if (!it.str || !it.transform || used.has(it)) continue;
      const x = it.transform[4], y = it.transform[5], w = it.width || 0, h = it.height || Math.hypot(it.transform[2], it.transform[3]);
      const cy = y + h / 2;
      if (cy < y0 || cy > y1 || x + w < x0 || x > x1 || w <= 0) continue;
      const a = Math.max(0, Math.round((x0 - x) / w * it.str.length)), b = Math.min(it.str.length, Math.round((x1 - x) / w * it.str.length));
      if (b > a) { line.push([x, it.str.slice(a, b)]); used.add(it); }
    }
    line.sort((p, q) => p[0] - q[0]);
    out.push(line.map(p => p[1]).join(''));
  }
  return joinBroken(out.join(' ').replace(/\s+/g, ' ').trim(), items.map(it => (it.str || '') + (it.hasEOL ? '\n' : '')).join(''));
}
// A word broken at a line's end ("na- ture"), joined: "nature", or
// "sense-data" when the page has it so elsewhere, unbroken.
function joinBroken(t, pageText) {
  const page = norm(pageText || '');
  return t.replace(/(\p{L}+)[-\u2010] (\p{Ll}+)/gu, (m, a, b) => page.includes(norm(a + '-' + b)) ? a + '-' + b : a + b);
}

/* ---- Markdown, the little of it notes need */
function mdInline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<i>$2</i>')
    .replace(PG_TAG, (m, pre, tag, pg) => `${pre}<span class="pl" data-pg="${pg}">${tag}</span>`);
}
// A page in your notes, "p. 331" (or "pp. 331-2", or a roman one): shown
// as a tag, which goes to that page of the paper. (Still plain text in the
// .bib.)
const PG_TAG = /(^|[\s(\[\u201c])(pp?\.\s?(\d+|[ivxlcdm]+)(?:\s?[\u2013-]\s?(?:\d+|[ivxlcdm]+))?)(?=[\s).,;:\]\u201d]|$)/gi;
function mdToHtml(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n'), out = [];
  let para = [], list = null, quote = [];
  const flushPara = () => { if (para.length) out.push('<p>' + para.map(mdInline).join('<br>') + '</p>'); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>` + list.items.map(x => '<li>' + mdInline(x) + '</li>').join('') + `</${list.tag}>`); list = null; };
  const flushQuote = () => { if (quote.length) out.push('<blockquote>' + mdToHtml(quote.join('\n')) + '</blockquote>'); quote = []; };
  for (const line of lines) {
    let m;
    if (/^>\s?/.test(line)) { flushPara(); flushList(); quote.push(line.replace(/^>\s?/, '')); continue; }
    flushQuote();
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flushPara(); flushList(); const t = m[1].length === 1 ? 'h3' : 'h4'; out.push(`<${t}>${mdInline(m[2])}</${t}>`); continue; }
    if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { flushPara(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushPara(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList(); flushQuote();
  return out.join('');
}
