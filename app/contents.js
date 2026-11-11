// LibLande: an outline made from the printed Contents of a scanned or unmarked book.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/contents.js'] = '2026-11-11.08';
/* ---- an outline from the printed Contents */
// For a PDF with no outline of its own: its Contents page (in the first 25
// pages, perhaps running over several) read line by line: each entry, its
// page number at the end (roman for the front matter); lines without one,
// such as "CHAPTER 2. DEFINITION OF OBSERVER", heading what follows. The
// printed pages are found in the PDF by its page labels, if it has them,
// or else by the page numbers printed at the top or foot of its pages (or
// failing that, by finding the first entry's title). Kept on this device.
const TOC_CACHE = store.get('tocMade', {});
// A page's text as lines, top to bottom (down the left column, then the
// right, when there are two), each with where it starts, from its
// column's left edge too (rx).
async function pageLines(doc, n) {
  const rows = (await pageRows(await doc.getPage(n))).sort((a, b) => a.col - b.col || b.y - a.y);
  const left = [Infinity, Infinity];
  rows.forEach(r => { left[r.col] = Math.min(left[r.col], r.x); });
  return rows.map(r => ({ x: r.x, rx: r.x - left[r.col], col: r.col, text: r.text }));
}
const romanValue = s => { const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }; let n = 0; for (let i = 0; i < s.length; i++) { const a = v[s[i]], b = v[s[i + 1]] || 0; n += a < b ? -a : a; } return n; };
const TOC_HEAD = /^(table ?of ?)?contents$/i;
// (The page number: in figures, OCR's misreadings of them too, as "4]" or
// "l6"; or in roman numerals, small or capital.)
const TOC_ENTRY = /^(.*?\S)(?:\s*[.\u00b7\u2026_]{2,}\s*|\s+)(\d[\dIl|\]]{0,3}|[Il|\]]\d{1,3}|[ivxlcdm]{1,8}|[IVXLCDM]{1,8})$/;
const tocNum = n => /\d/.test(n) ? n.replace(/[Il|\]]/g, '1') : n.toLowerCase();
// "2.3 Title": a section numbered within a chapter (depth 1).
const TOC_NUMBERED = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+\S/;
// (A line starting "Chapter", "Part", "Appendix"... is a heading if it's
// short: a long one is an entry's title running over two lines.)
const tocHeading = t => (/^(chapter|part|book|section|appendix|appendices)\b/i.test(t) && t.split(/\s+/).length <= 6) || ((l => l.length >= 4 && l.replace(/[^A-Z]/g, '').length / l.length > 0.7)(t.replace(/[^A-Za-z]/g, '')));
// OCR's specks and misreadings tidied in a title: a stray mark or letter
// read from the margin before it ("f Introduction", ") Notes"), and a
// section's roman numeral read as look-alikes ("Section]", "Section Il").
const TOC_SPECK = /^(?:[^\w\s"'\u201c\u2018(\u00a7]+|[a-z])\s+(?=[A-Z0-9"\u201c\u2018\u00a7])/;
const tocClean = t => t
  .replace(TOC_SPECK, '')
  .replace(/\b(section|chapter|part|book|lecture|essay)\s*([IVXl1|\]\[!]{1,6})(?=[\s.:]|$)/gi, (m, w, n) => /^\d+$/.test(n) ? m : w + ' ' + n.replace(/[l1|\]\[!]/g, 'I'))
  .trim();
// A page number OCR read partly as letters ("a7" for 47): figures, if
// every letter is one often read for a figure, and there's a figure in it.
const TOC_DIGIT = { a: '4', A: '4', s: '5', S: '5', o: '0', O: '0', b: '6', B: '8', g: '9', q: '9', z: '2', Z: '2', l: '1', I: '1', t: '7', T: '7' };
const tocDigits = text => {
  const m = /^(.*\S)\s+([0-9A-Za-z]{2,4})$/.exec(text);
  if (!m || !/\d/.test(m[2]) || /^\d+$/.test(m[2]) || ![...m[2]].every(c => /\d/.test(c) || TOC_DIGIT[c])) return null;
  return { text: m[1] + ' ' + [...m[2]].map(c => TOC_DIGIT[c] || c).join(''), was: m[2] };
};
// (at: the Contents start on that page, said so, rather than found.)
async function printedContents(doc, fileId, at) {
  if (at) fileId = null;
  // (v5: read again since OCR's misreadings were tidied, and printed
  // pages ahead of the PDF's counted.)
  const ck = 'v5:' + (fileId || '') + ':' + doc.numPages;
  if (fileId && TOC_CACHE[ck]) return TOC_CACHE[ck];
  const N = doc.numPages, lines = {};
  const read = async n => (lines[n] = lines[n] || await pageLines(doc, n));
  // The Contents page, and the pages of it that follow.
  let from = at || 0;
  // (Spaces taken out: "C O N T E N T S" too.)
  for (let n = 1; n <= Math.min(25, N) && !from; n++) if ((await read(n)).some(l => TOC_HEAD.test(l.text.replace(/\s+/g, '')))) from = n;
  if (!from) return null;
  let to = from;
  for (let n = from + 1; n <= Math.min(from + 8, N); n++) {
    if ((await read(n)).filter(l => TOC_ENTRY.test(l.text)).length >= 3) to = n; else break;
  }
  // Lines on every page, as a running head or a scan's "Copyrighted
  // Material": on two or more of the pages around the Contents, or twice on
  // one page (at its top and foot).
  const others = [from - 2, from - 1, to + 1, to + 2, to + 3].filter(n => n >= 1 && n <= N && (n < from || n > to));
  const seen = new Map(), twice = new Set();
  for (const n of others) for (const t of new Set((await read(n)).map(l => l.text.trim().toLowerCase()))) seen.set(t, (seen.get(t) || 0) + 1);
  for (let n = from; n <= to; n++) {
    const on = new Map();
    for (const l of await read(n)) { const t = l.text.trim().toLowerCase(); on.set(t, (on.get(t) || 0) + 1); }
    on.forEach((k, t) => { if (k >= 2 && !TOC_ENTRY.test(t)) twice.add(t); });
  }
  const repeated = l => { const t = l.text.trim().toLowerCase(); return (seen.get(t) || 0) >= 2 || twice.has(t); };
  // The entries.
  const raw = [];
  for (let n = from; n <= to; n++) {
    // (Not the heading, page numbers, or running heads such as "viii CONTENTS".)
    const ls = (await read(n)).filter(l => !TOC_HEAD.test(l.text.replace(/^(\d{1,4}|[ivxlc]{1,7})\s+|\s+(\d{1,4}|[ivxlc]{1,7})$/gi, '').replace(/\s+/g, '')) && !/^\d{1,4}$|^[ivxlc]{1,6}$/i.test(l.text) && !repeated(l)
      // (Nor a speck read as a letter or mark on a line of its own.)
      && /\w\W*\w/.test(l.text));
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], fix = !TOC_ENTRY.test(l.text) && tocDigits(l.text), m = TOC_ENTRY.exec(fix ? fix.text : l.text);
      if (m && !(/^[ivxlcdm]+$/.test(tocNum(m[2])) && /\b(part|chapter|book|volume)$/i.test(m[1]))) { raw.push({ title: tocClean(m[1].replace(/[\s.\u00b7\u2026_]+$/, '')), num: tocNum(m[2]), x: l.x, rx: l.rx, col: l.col, was: fix ? fix.was : null, line: l.text, speck: TOC_SPECK.test(l.text) }); continue; }
      if (tocHeading(l.text)) { raw.push({ title: tocClean(l.text), num: null, x: l.x, rx: l.rx, col: l.col, head: true, speck: TOC_SPECK.test(l.text) }); continue; }
      // (A title over two lines, its page number on the second.)
      const next = ls[i + 1], nm = next && TOC_ENTRY.exec(next.text);
      if (nm && !tocHeading(next.text)) { raw.push({ title: tocClean(l.text) + ' ' + nm[1].replace(/[\s.\u00b7\u2026_]+$/, ''), num: tocNum(nm[2]), x: l.x, rx: l.rx, col: l.col }); i++; }
    }
  }
  // (A number made from letters kept only if it falls between the entries
  // around it; else the line is as it was, a heading or a title.)
  raw.forEach((r, i) => {
    if (!r.was) return;
    const prev = raw.slice(0, i).reverse().find(x => x.num && /^\d+$/.test(x.num) && !x.was), next = raw.slice(i + 1).find(x => x.num && /^\d+$/.test(x.num) && !x.was);
    if ((prev && +r.num < +prev.num) || (next && +r.num > +next.num)) { r.num = null; r.title = tocClean(r.line); r.head = tocHeading(r.line); }
  });
  if (raw.filter(r => r.num).length < 3) return null;
  // (A line that started with a speck in the margin starts, in fact, where
  // most lines without one do: its indent isn't the speck's.)
  const commonest = list => { const k = new Map(); list.forEach(v => { const b = Math.round(v / 4) * 4; k.set(b, (k.get(b) || 0) + 1); }); const best = [...k].sort((a, b) => b[1] - a[1])[0]; return best ? best[0] : null; };
  const clean = raw.filter(r => !r.speck), cx = commonest(clean.map(r => r.x)), crx = commonest(clean.map(r => r.rx || 0));
  if (clean.length && cx != null) raw.forEach(r => { if (r.speck) { r.x = cx; r.rx = crx; } });
  // (A page number set apart, "The Algorithmic Level 7 2" for 72: joined
  // when that fits between the entries around it.)
  raw.forEach((r, i) => {
    const m = /^(.*\S)\s(\d)$/.exec(r.title), prev = raw.slice(0, i).reverse().find(x => x.num && /^\d+$/.test(x.num));
    if (!m || !r.num || !/^\d+$/.test(r.num) || !prev) return;
    const joined = +(m[2] + r.num);
    if (+r.num < +prev.num && joined >= +prev.num && joined <= +prev.num + 40) { r.title = m[1]; r.num = String(joined); }
  });
  // Printed page to PDF page.
  const tocEnd = to, pdfOf = await pageMapper(doc, raw, from, tocEnd, read);
  raw.forEach(r => { r.page = r.num ? pdfOf(r.num) : 0; });
  // Headings go to their first entry's page; levels from headings, or else
  // from how far in each line starts.
  for (let i = 0; i < raw.length; i++) if (!raw[i].num) { const nx = raw.slice(i + 1).find(r => r.page); raw[i].page = nx ? nx.page : 0; }
  const out = [], heads = raw.some(r => r.head), minX = Math.min(...raw.map(r => r.x));
  // (How far in: from the page's left edge, or in two columns, from the
  // column's.)
  const twoCols = raw.some(r => r.col === 1), ind = r => twoCols ? r.rx : r.x - minX;
  // Sections numbered within chapters ("2.3 ..."): levels from the
  // numbers, under any parts ("I Foundations"); one not numbered, under the
  // nearest entry above it that starts further left (as "Ambiguous
  // Figures" under "1.1.3").
  const depth = r => { const m = TOC_NUMBERED.exec(r.title); return m ? m[1].split('.').length - 1 : null; };
  const PART = /^(part\s+)?[IVX]{1,4}\.?\s+[A-Z]/;
  if (raw.filter(r => depth(r) != null).length >= 3 && raw.some(r => depth(r) > 0)) {
    // (A chapter whose number isn't with its title, set apart: the one
    // just before "8.1 ...", and no further in, is chapter 8.)
    // (Not when chapter 8 is there already, its first section before 8.1
    // unnumbered.)
    const chapters = new Set();
    raw.forEach((r, i) => {
      const next = raw[i + 1], m = next && /^(\d{1,2})\.1\b/.exec(next.title);
      if (depth(r) == null && m && !chapters.has(m[1]) && !PART.test(r.title) && (r.rx || 0) <= (next.rx || 0) + 2) r.title = m[1] + ' ' + r.title;
      if (depth(r) === 0) chapters.add(TOC_NUMBERED.exec(r.title)[1]);
    });
    // (Back matter, and appendices, at the top.)
    const BACK = /^(appendix|appendices|glossary|references|bibliography|notes|(name |subject |author )?index|acknowledg)/i;
    const parts = raw.some(r => PART.test(r.title) && depth(r) == null), stack = [];
    for (const r of raw) {
      const item = { title: r.title, page: r.page, items: [] };
      let lv = (PART.test(r.title) || BACK.test(r.title)) && depth(r) == null ? 0 : depth(r) != null ? depth(r) + (parts ? 1 : 0) : null;
      if (lv == null) { let k = stack.length - 1; while (k >= 0 && stack[k].rx >= (r.rx || 0) - 2) k--; lv = k + 1; }
      lv = Math.min(lv, stack.length);
      stack.length = lv;
      (lv ? stack[lv - 1].item.items : out).push(item);
      stack.push({ item, rx: r.rx || 0 });
    }
  } else {
    let cur = null;
    for (const r of raw) {
      const item = { title: r.title, page: r.page, items: [] };
      if (r.head || (!heads && ind(r) <= 8)) { out.push(item); cur = r.head || !heads ? item : null; }
      else if (cur && (heads || ind(r) > 8)) cur.items.push(item);
      else out.push(item);
    }
  }
  const made = { items: out, from, to };
  if (fileId) {
    TOC_CACHE[ck] = made;
    const keys = Object.keys(TOC_CACHE);
    if (keys.length > 30) delete TOC_CACHE[keys[0]];
    store.set('tocMade', TOC_CACHE);
  }
  return made;
}
// How printed page numbers become the PDF's pages: its page labels, if it
// has them; or the numbers printed at the top or foot of the pages after
// the Contents (the commonest difference between the two); or, failing
// that, where the first entry's title is found. Roman ones likewise, in
// the pages before.
async function pageMapper(doc, raw, tocStart, tocEnd, read) {
  const N = doc.numPages;
  let labels = null;
  try { labels = await doc.getPageLabels(); } catch (err) { labels = null; }
  if (labels && labels.some((l, i) => l !== String(i + 1))) {
    const at = new Map();
    labels.forEach((l, i) => { const k = String(l).trim().toLowerCase(); if (!at.has(k)) at.set(k, i + 1); });
    const hits = raw.filter(r => r.num && at.has(r.num.toLowerCase())).length;
    // (A page without a label, as a chapter's first: counted from the
    // nearest page with a number for its label.)
    const numbered = [];
    labels.forEach((l, i) => { if (/^\d+$/.test(String(l).trim())) numbered.push([+l, i + 1]); });
    const near = num => {
      let best = null;
      for (const [v, p] of numbered) if (!best || Math.abs(v - num) < Math.abs(best[0] - num)) best = [v, p];
      const p = best ? best[1] + num - best[0] : 0;
      return p >= 1 && p <= N ? p : 0;
    };
    if (hits >= raw.filter(r => r.num).length / 2) return num => at.get(num.toLowerCase()) || (/^\d+$/.test(num) ? near(+num) : 0);
  }
  const isRoman = num => /^[ivxlcdm]+$/.test(num);
  const offsetFrom = async (pages, roman) => {
    const votes = new Map();
    for (const n of pages) {
      const ls = await read(n), ends = ls.slice(0, 2).concat(ls.slice(-2));
      for (const l of ends) {
        const m = roman ? /^([ivxlc]{1,7})$/.exec(l.text) : /^(\d{1,4})$/.exec(l.text) || /^(\d{1,4})\s+\S|\S\s+(\d{1,4})$/.exec(l.text);
        const v = m && (roman ? romanValue(m[1]) : +(m[1] || m[2]));
        // (The printed number may be ahead of the PDF's: a scan starting
        // part way into a book.)
        if (v && (roman ? v <= n : v <= n + 40)) { const off = n - v; votes.set(off, (votes.get(off) || 0) + 1); }
      }
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    return best && best[1] >= 2 ? best[0] : null;
  };
  const sq = t => norm(t).replace(/^[\divxlc]+[.)]?\s+/i, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
  const findTitle = async (r, lo, hi) => {
    const want = sq(r.title);
    if (want.length < 4) return null;
    // (Not on the Contents pages, where every title is.)
    for (let n = lo; n <= hi; n++) if ((n < tocStart || n > tocEnd) && (await read(n)).some(l => sq(l.text).includes(want))) return n;
    return null;
  };
  let off = await offsetFrom(Array.from({ length: Math.min(40, N - tocEnd) }, (_, i) => tocEnd + 1 + i), false);
  if (off == null) {
    const first = raw.find(r => r.num && !isRoman(r.num));
    const at = first && await findTitle(first, tocEnd + 1, Math.min(N, tocEnd + 60));
    off = at ? at - +first.num : tocEnd;
  }
  let roff = null;
  if (raw.some(r => r.num && isRoman(r.num))) {
    roff = await offsetFrom(Array.from({ length: Math.min(tocEnd + 15, N) }, (_, i) => i + 1), true);
    if (roff == null) {
      const first = raw.find(r => r.num && isRoman(r.num));
      const at = await findTitle(first, tocEnd + 1, Math.min(N, tocEnd + 20)) || await findTitle(first, 1, tocStart - 1);
      roff = at ? at - romanValue(first.num) : 0;
    }
  }
  return num => { const p = isRoman(num) ? romanValue(num) + roff : +num + off; return p >= 1 && p <= N ? p : 0; };
}
