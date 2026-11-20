// LibLande: a citation's card, in the reader: the pointer rested on a citation (or on an entry in the reference list), or a tap on one, shows the work cited, from your library or found online.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, related, marksindex, inbox, trash, citecard, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/citecard.js'] = '2026-11-20.02';
/* ------------------------------------------------------------ a citation's card */
// Rest the pointer on a citation in the text, "Siegel (2010)" or "(Burge,
// 2010; Siegel, 2010)" (each name and year its own), on a link to the
// reference list ("[12]"), or on an entry in the list itself, for about
// half a second: a card shows the work: in your library (your rating,
// whether you've read it), or not, and where it was found; its title,
// authors, journal and year, and its abstract to open or close. On a
// touch screen a tap shows it; a link to the reference list, tapped or
// clicked, shows it too, with the link's own choices in it (Go to the
// page, Show in split screen), so there's one thing to read, not a card and a
// menu. Found from your library, the paper's own reference list (OpenAlex's,
// as Related has it), or the text of its entry looked up as Related's Add
// to library does; nothing asked online until a card is wanted, and each
// answer kept while LibLande's open.
//
// The card stays while the pointer is on the citation or the card, and a
// moment after it leaves one for the other (heading for the card, other
// citations crossed on the way don't count); used (the abstract opened,
// say), it stays until Esc, a tap elsewhere, or the page scrolled.
const CC = { el: null, key: '', want: null, pinned: false, inCard: false, showT: 0, hideT: 0, raf: 0, px: 0, py: 0, leave: null,
  list: [], at: 0, t: null, seq: 0, lit: [], found: new Map(), nodes: new WeakMap(), lines: new WeakMap(), absOpen: store.get('ccAbs', false) };
const ccOn = () => store.get('citeCards', true) !== false;
const ccToolOk = () => (V.tool === 'read' || V.tool === 'select') && !V.selected;
const ccSleep = ms => new Promise(r => setTimeout(r, ms));
// A name's family name, as compared: lower case, without accents, the last word.
const ccFam = s => relFam(s).split(' ').pop();

/* ---- what's under the pointer */
// The text layer's run of text under a point, and the character in it (by
// halves, measuring the run up to each).
function ccSpanAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest('.cc-card')) return null;
    if (el.tagName !== 'SPAN' || !el.closest('#vPages .textLayer, #vPeekPages .textLayer')) continue;
    const n = el.firstChild;
    if (!n || n.nodeType !== 3 || !n.data.trim() || el.childElementCount) continue;
    const r = document.createRange();
    let lo = 0, hi = n.data.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      r.setStart(n, 0); r.setEnd(n, mid + 1);
      if (r.getBoundingClientRect().right < x) lo = mid + 1; else hi = mid;
    }
    return { span: el, node: n, off: lo, layer: el.closest('.textLayer') };
  }
  return null;
}
// The layer's runs of text, in order (kept until it's drawn again).
function ccNodes(layer) {
  const k = layer.childElementCount, got = CC.nodes.get(layer);
  if (got && got.k === k && got.nodes.length && got.nodes[0].isConnected && got.nodes[got.nodes.length - 1].isConnected) return got.nodes;
  const nodes = [], w = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) if (n.data) nodes.push(n);
  CC.nodes.set(layer, { k, nodes });
  return nodes;
}
// The words around the pointer, a few runs either side, joined as they
// read (a space between runs, but not after a hyphen), with where each run
// starts in them.
function ccWindow(hit) {
  let nodes = ccNodes(hit.layer), i = nodes.indexOf(hit.node);
  if (i < 0) { CC.nodes.delete(hit.layer); nodes = ccNodes(hit.layer); i = nodes.indexOf(hit.node); }
  if (i < 0) return null;
  const segs = [];
  let text = '';
  for (let j = Math.max(0, i - 8); j < Math.min(nodes.length, i + 9); j++) {
    const d = nodes[j].data;
    if (text && !/[\s\-\u2010\u2011]$/.test(text) && !/^\s/.test(d)) text += ' ';
    segs.push({ node: nodes[j], at: text.length });
    text += d;
  }
  const me = segs.find(s => s.node === hit.node);
  return { text, segs, pos: me.at + hit.off };
}
// The rectangles of a stretch of the window's text, on screen.
function ccRects(win, a, b) {
  const out = [];
  for (const s of win.segs) {
    const from = Math.max(a, s.at), to = Math.min(b, s.at + s.node.data.length);
    if (from >= to) continue;
    const r = document.createRange();
    r.setStart(s.node, from - s.at); r.setEnd(s.node, to - s.at);
    for (const q of r.getClientRects()) if (q.width && q.height) out.push(q);
  }
  return out;
}
// A citation "Name (Year)", "Name, Year", "Name and Name Year", "Name et
// al. (Year)", "van Name Year", and a second year after a first ("Siegel
// 2010, 2012"): the one around the pointer, if any.
const CC_NAME = "(?:(?:van|von|de|der|den|del|della|da|di|du|la|le|St\\.)\\s+)*\\p{Lu}[\\p{L}'\\u2019\\-]+";
const CC_WHO = new RegExp(`(${CC_NAME}(?:(?:,\\s*|\\s+)(?:and|&)\\s+${CC_NAME}|,\\s*${CC_NAME})*(?:,?\\s+et\\s+al\\.?)?)(?:'s|\\u2019s)?[\\s,]*\\(?\\s*$`, 'u');
const CC_YEAR = /(^|[^\d\p{L}])((?:1[5-9]|20)\d\d)([a-z])?(?![\d\p{L}])/gu;
const CC_STOP = new Set(('in see cf the a an as but and also following according since after before by from on at for if thus so yet when while unlike like ' +
  'contra pace compare contrast here this that these those it we i he she they our figure fig table section chapter vol no page pp ed eds trans ' +
  'january february march april may june july august september october november december spring summer autumn fall winter appendix part note ' +
  'however similarly moreover indeed still finally first second third notably likewise recently earlier later instead rather again then now ' +
  'nonetheless nevertheless conversely alternatively specifically importantly crucially therefore hence accordingly consequently meanwhile ' +
  'further furthermore additionally famously recall eg ie copyright act volume issue number vols').split(' '));
const ccStopName = s => CC_STOP.has(norm(String(s).split(/\s+/)[0]).replace(/\W/g, '')) || CC_STOP.has(ccFam(s));
function ccCiteAt(win) {
  let prev = null;
  for (const m of win.text.matchAll(CC_YEAR)) {
    const yAt = m.index + m[1].length, yEnd = m.index + m[0].length, before = win.text.slice(Math.max(0, yAt - 90), yAt), base = yAt - before.length;
    let cite = null;
    const w = CC_WHO.exec(before);
    // (Its names, less words before them that aren't ("However, Smith"),
    // and not part of a longer word.)
    const names = w && !(w.index > 0 && /\p{L}/u.test(before[w.index - 1])) ? [...w[1].matchAll(new RegExp(CC_NAME, 'gu'))] : [];
    while (names.length > 1 && ccStopName(names[0][0])) names.shift();
    if (names.length && !ccStopName(names[0][0])) {
      const at = w.index + names[0].index;
      // (Not a running head's journal and volume, "Synthese (2015) 192:", or a notice, "\u00a9 Springer 2015".)
      const after = win.text.slice(yEnd, yEnd + 12), lead = win.text.slice(Math.max(0, base + at - 3), base + at);
      if (!/^\)?\s*\d+\s*[:(]/.test(after) && !/\u00a9|\(c\)/i.test(lead)) cite = { who: before.slice(at, w.index + w[1].length).replace(/\s+/g, ' '), fam: ccFam(names[0][0]), start: base + at };
    } else if (!w && prev && /^\s*[a-z]?\s*,\s*$/.test(win.text.slice(prev.end, yAt))) cite = { who: prev.who, fam: prev.fam, start: yAt };
    if (!cite) { prev = null; continue; }
    Object.assign(cite, { year: m[2], end: yEnd + (win.text[yEnd] === ')' ? 1 : 0) });
    if (win.pos >= cite.start && win.pos < cite.end) return cite;
    prev = { who: cite.who, fam: cite.fam, end: yEnd };
  }
  return null;
}
// The page a layer is on.
const ccPageOf = el => { const p = el.closest('.page'); return p ? +p.dataset.pageNumber : 0; };
// The reference list's lines on a page: its runs of text, grouped into
// lines (by height, and split where a gap shows two columns), each with
// its place on the page.
function ccLines(layer) {
  const pr = layer.getBoundingClientRect(), nodes = ccNodes(layer), k = Math.round(pr.width), got = CC.lines.get(layer);
  if (got && got.k === k && got.nodes === nodes) return got.lines;
  const runs = [], rg = document.createRange();
  nodes.forEach(n => {
    if (!n.data.trim() || !n.isConnected) return;
    rg.selectNodeContents(n);
    const r = rg.getBoundingClientRect();
    // (Not text set sideways, as a publisher's notice down the margin.)
    if (!r.width || !r.height || (r.height > r.width * 1.5 && n.data.trim().length > 2)) return;
    runs.push({ node: n, l: r.left - pr.left, r: r.right - pr.left, t: r.top - pr.top, b: r.bottom - pr.top });
  });
  runs.sort((a, b) => (a.t + a.b) - (b.t + b.b) || a.l - b.l);
  const lines = [];
  for (const u of runs) {
    const h = u.b - u.t, mid = (u.t + u.b) / 2;
    const line = lines.find(L => Math.abs((L.t + L.b) / 2 - mid) < h / 2 && u.l >= L.r - 2 && u.l - L.r < Math.max(18, h * 1.8));
    if (line) { line.runs.push(u); line.r = Math.max(line.r, u.r); line.t = Math.min(line.t, u.t); line.b = Math.max(line.b, u.b); }
    else lines.push({ runs: [u], l: u.l, r: u.r, t: u.t, b: u.b });
  }
  lines.forEach(L => { L.text = L.runs.map(u => u.node.data).join(' ').replace(/\s+/g, ' ').trim(); });
  CC.lines.set(layer, { k, nodes, lines });
  return lines;
}
// The entry in the reference list under a point: its line, then up to
// where the entry starts and down to where the next does (by the hanging
// indent; with none, by "[12]" or "Name, I." starting a line after one
// ending in a full stop).
function ccEntryAt(hit, x, y) {
  const page = ccPageOf(hit.layer);
  if (!V.endPage || page < V.endPage) return null;
  const pr = hit.layer.getBoundingClientRect(), lines = ccLines(hit.layer), px = x - pr.left, py = y - pr.top;
  const me = lines.find(L => py >= L.t - 1 && py <= L.b + 1 && px >= L.l - 2 && px <= L.r + 2);
  if (!me) return null;
  // (Its column: the lines that overlap it across.)
  const col = lines.filter(L => L.l < me.r && L.r > me.l).sort((a, b) => a.t - b.t);
  const minL = Math.min(...col.map(L => L.l)), hanging = col.some(L => L.l > minL + 6);
  const startsAt = j => {
    const L = col[j];
    if (hanging) return L.l <= minL + 3;
    return /^\s*(\[\d+\]|\d+\.)\s/.test(L.text) || (j > 0 && /\.\s*$/.test(col[j - 1].text) && /^\p{Lu}[\p{L}'\u2019-]+,\s*\p{Lu}/u.test(L.text));
  };
  let a = col.indexOf(me), b = a;
  while (a > 0 && !startsAt(a) && b - a < 8) a--;
  while (b + 1 < col.length && !startsAt(b + 1) && b - a < 8 && col[b + 1].t - col[b].b < (col[b].b - col[b].t) * 1.5) b++;
  const part = col.slice(a, b + 1);
  const text = part.map(L => L.text).join(' ').replace(/-\s+(?=\p{Ll})/gu, '').replace(/\s+/g, ' ').trim();
  if (!refLike(text, page)) return null;
  return { kind: 'entry', key: 'E:' + page + ':' + Math.round(part[0].t), text, page,
    rects: part.map(L => new DOMRect(pr.left + L.l, pr.top + L.t, L.r - L.l, L.b - L.t)) };
}
// A citation in a footnote, in full ("Descartes, Philosophical Works, ed.
// Haldane and Ross (New York: Dover, 1955), vol. 1, p. 8"): the footnote
// under the pointer (its lines smaller than the page's, in its lower half,
// from where it starts, with its number, to where the next does), and of it
// the part between semicolons the pointer's in, if that reads as a
// reference. Its card as an entry's in a reference list.
function ccNoteAt(hit, x, y) {
  const pr = hit.layer.getBoundingClientRect(), lines = ccLines(hit.layer), px = x - pr.left, py = y - pr.top;
  const me = lines.find(L => py >= L.t - 1 && py <= L.b + 1 && px >= L.l - 2 && px <= L.r + 2);
  if (!me) return null;
  // (In the page's lower part; the notes below a gap wider than the lines'
  // own spacing: the footnote rule. A scan's text, read by OCR, may not be
  // smaller, so it's where the lines are that counts.)
  const H = pr.height;
  if (me.t < H * 0.45) return null;
  const col = lines.filter(L => L.l < me.r && L.r > me.l && L.t > H * 0.3).sort((a, b) => a.t - b.t);
  const minL = Math.min(...col.map(L => L.l));
  const lh = me.b - me.t;
  const gapAbove = j => j > 0 && col[j].t - col[j - 1].b > lh * 0.9;
  const startsAt = j => (/^\s*[\d*\u2020\u2021\u00a7]{1,3}(?!\d)/.test(col[j].text) && col[j].l <= minL + 14) || gapAbove(j);
  let a = col.indexOf(me), b = a;
  while (a > 0 && !startsAt(a) && b - a < 10) a--;
  while (b + 1 < col.length && !startsAt(b + 1) && b - a < 10) b++;
  // (Below the body text: a gap above where it starts.)
  if (!gapAbove(a) && !col.slice(0, a).some((L, j) => gapAbove(j + 1) && j + 1 <= a)) return null;
  const part = col.slice(a, b + 1);
  // (The pointer's place in the footnote's words, near enough.)
  let pos = 0;
  for (const L of part) {
    if (L === me) {
      const i = L.runs.findIndex(u => u.node === hit.node);
      pos += L.runs.slice(0, Math.max(0, i)).reduce((n, u) => n + u.node.data.length + 1, 0) + (i >= 0 ? hit.off : 0);
      break;
    }
    pos += L.text.length + 1;
  }
  const text = part.map(L => L.text).join(' ');
  // (Its parts, between semicolons; the one the pointer's in.)
  let at = 0, seg = null;
  for (const s of text.split(/;\s+/)) {
    if (pos >= at && pos <= at + s.length + 1) { seg = { s, at }; break; }
    at += s.length + 2;
  }
  if (!seg) return null;
  const clean = seg.s.replace(/-\s+(?=\p{Ll})/gu, '').replace(/^\s*[\d*\u2020\u2021\u00a7]{1,3}\s*/, '').replace(/^(see( also)?|cf\.|e\.g\.,?)\s+/i, '').trim();
  if (!refLike(clean, ccPageOf(hit.layer))) return null;
  if (ccShortOnly(clean)) return null;
  // (Lit: the footnote's lines the part is on.)
  let off = 0;
  const rects = [];
  part.forEach(L => { const end = off + L.text.length; if (end >= seg.at && off <= seg.at + seg.s.length) rects.push(new DOMRect(pr.left + L.l, pr.top + L.t, L.r - L.l, L.b - L.t)); off = end + 1; });
  return { kind: 'entry', note: true, key: 'N:' + ccPageOf(hit.layer) + ':' + Math.round(part[0].t) + ':' + seg.at, text: clean, page: ccPageOf(hit.layer), rects };
}
function ccShortOnly(clean) {
  // (Its years all in short citations, "Klein (2009)", "Sarkar 2015a": a list of them, not a full one.
  // A book's "(Oxford: Clarendon Press, 2009)" kept out first: its year isn't one.)
  if (/\([^()]*:\s*\p{L}[^()]*(?:1[5-9]|20)\d\d[^()]*\)/u.test(clean)) return false;
  const rest = clean.replace(/\p{Lu}[\p{L}'\u2019\-]+(?:\s+(?:et al\.|and|&)\s*(?:\p{Lu}[\p{L}'\u2019\-]+)?)?,?\s*\(?\s*(?:1[5-9]|20)\d\d[a-z]?(?:\s*[,;]\s*(?:1[5-9]|20)\d\d[a-z]?)*\)?/gu, ' ');
  return !/(?:1[5-9]|20)\d\d/.test(rest);
}
// A link within the paper: its destination, from the link's address
// (PDF.js writes a named destination there, or the array as JSON).
function ccLinkDest(a) {
  const h = a.getAttribute('href') || '';
  if (!h.startsWith('#') || h.length < 2) return null;
  let s = h.slice(1);
  // (PDF.js writes it with escape(): %XX, and %uXXXX past Latin-1.)
  try { s = decodeURIComponent(s); } catch (err) { s = s.replace(/%u([0-9a-f]{4})|%([0-9a-f]{2})/gi, (m, u, h) => String.fromCharCode(parseInt(u || h, 16))); }
  if (/^(page|nameddest|zoom|search)=/.test(s)) return null;
  if (s.startsWith('[')) { try { const d = JSON.parse(s); return Array.isArray(d) ? d : null; } catch (err) { return null; } }
  return s;
}
// What's under the pointer: a link to the list, an entry in it, or a
// citation in the text.
function ccTargetAt(x, y) {
  const top = document.elementFromPoint(x, y);
  if (!top || !top.closest('#vPages, #vPeekPages')) return null;
  const a = top.closest('.annotationLayer a');
  if (a) {
    const dest = ccLinkDest(a);
    return dest ? { kind: 'link', key: 'L:' + a.getAttribute('href') + ':' + ccPageOf(a), dest, a, rects: [...a.getClientRects()] } : null;
  }
  const hit = ccSpanAt(x, y);
  if (!hit) return null;
  const entry = ccEntryAt(hit, x, y) || ccNoteAt(hit, x, y);
  if (entry) return entry;
  if (V.endPage && ccPageOf(hit.layer) >= V.endPage) return null;
  const win = ccWindow(hit), cite = win && ccCiteAt(win);
  if (!cite) return null;
  const rects = ccRects(win, cite.start, cite.end);
  return { kind: 'cite', key: 'C:' + ccPageOf(hit.layer) + ':' + cite.who + ':' + cite.year + ':' + Math.round(rects[0] ? rects[0].top : 0), who: cite.who, fam: cite.fam, year: cite.year, rects };
}

/* ---- the works it could be */
// The paper's reference list from OpenAlex (as Related has it): asked
// once, waited for a while.
async function ccRefs() {
  const e = infoEntry();
  if (!e) return null;
  const st = relState(e);
  if (!st.refs && !st.errs.refs && !isOffline()) {
    if (!st.busy) relFetch(e, st).catch(() => {});
    for (let i = 0; i < 60 && (st.busy || st.work === undefined) && !st.refs && !st.errs.work; i++) await ccSleep(250);
  }
  return st.refs || null;
}
// Your library's works by a name and a year.
const ccMine = (fam, year) => ENTRIES.filter(x => x.f.year === year && ((x.a && x.a[0] && ccFam(x.a[0][0]) === fam) || (!(x.a && x.a.length) && x.e && x.e[0] && ccFam(x.e[0][0]) === fam)));
// One from OpenAlex, or one of yours, as the card has it: yours if it's in
// the library.
const ccItem = c => c.e ? c : (tsHave(c) ? { e: tsHave(c), from: c } : c);
function ccDedupe(list) {
  const out = [], seen = new Set();
  list.map(ccItem).forEach(c => {
    const k = c.e ? 'e:' + c.e.k : 'c:' + (c.doi || plainTitle(c.title));
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  });
  return out;
}
// Where a citation's entry is in the reference list (its page, and its
// words): the first place on the pages from where the list starts where
// the name comes before the year.
const ccEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The reference list's pages' text (from where it starts to the end; or
// the last few), read once a paper.
function ccRefPages() {
  const doc = V.doc;
  if (!doc) return Promise.resolve([]);
  const from = V.endPage || Math.max(1, doc.numPages - 5);
  if (CC.rt && CC.rt.doc === doc && CC.rt.from === from) return CC.rt.loading;
  const loading = (async () => {
    const out = [];
    for (let n = from; n <= doc.numPages; n++) {
      if (SRCH.doc === doc && SRCH.pages) { out.push({ n, text: SRCH.pages[n - 1] || '' }); continue; }
      try { out.push({ n, text: (await (await doc.getPage(n)).getTextContent()).items.map(it => it.str + (it.hasEOL ? ' ' : '')).join('').replace(/\s+/g, ' ') }); }
      catch (err) { /* (a page that won't read) */ }
    }
    return out;
  })();
  CC.rt = { doc, from, loading };
  return loading;
}
async function ccEntryFor(fam, year) {
  if (!V.doc) return null;
  const re = new RegExp('(^|[^a-z])' + ccEsc(fam) + '(?![a-z])', 'g');
  for (const { n, text } of await ccRefPages()) {
    const fold = srchFold(text);
    for (const m of fold.matchAll(re)) {
      const at = m.index + m[1].length;
      // (Not a co-author's name: "Jones, A., & Smith, B.")
      if (/(&|\band|,)\s*$/.test(fold.slice(Math.max(0, at - 8), at))) continue;
      const y = text.slice(at, at + 160).search(new RegExp('(^|\\D)' + year + '(\\D|$)'));
      if (y >= 0 && y < 120) return { page: n, text: text.slice(at, at + 320) };
    }
  }
  return null;
}
// The works an entry's words could be: in the paper's list from OpenAlex,
// in your library, or (with neither) looked up online.
async function ccForText(text) {
  const q = refQuery(text);
  if (CC.found.has(q)) return CC.found.get(q);
  const words = new Set(tsWords(q)), mine = [];
  ENTRIES.forEach(x => {
    if (!x.f.year || !words.has(x.f.year)) return;
    const who = (x.a && x.a.length ? x.a : x.e || []).map(p => p[1] ? p[0] + ', ' + p[1] : p[0]);
    if (!who.length || !tsWords(tsFamily(who[0])).every(w => words.has(w))) return;
    const fit = refFit({ title: String(x.f.title || '').replace(/[{}]/g, ''), people: who, year: x.f.year }, q);
    if (fit > 0) mine.push({ e: x, fit });
  });
  // (Yours at once, if the paper's list isn't here yet.)
  const refs = ccRefsNow() || (mine.length ? null : await ccRefs());
  let list = (refs || []).map(c => Object.assign({}, c, { fit: refFit(c, q) })).filter(c => c.fit > 0).concat(mine);
  if (!list.length && !isOffline()) {
    try {
      const doi = npDoi((/\b(10\.\d{4,9}\/[^\s"<>]+)/.exec(q) || [])[1] || '').replace(/[.,;)\]]+$/, '');
      const found = doi ? await refByDoi(doi).then(c => ({ list: c ? [c] : [] })) : await tsFind(q);
      list = found.list.map(c => Object.assign(c, { fit: refFit(c, q) })).filter(c => c.fit > 0 || (c.doi && q.toLowerCase().includes(c.doi.toLowerCase())));
    } catch (err) { list = null; }
  }
  if (list) {
    list = ccDedupe(list.sort((a, b) => (b.fit || 0) - (a.fit || 0))).slice(0, 4);
    if (list.length) CC.found.set(q, list);
  }
  return list || [];
}
// The works a citation in the text could be: those in the paper's list
// with that name and year; else yours; else its entry's words looked up.
// (Yours at once, if the list isn't here yet: not waited for.)
const ccRefsNow = () => { const e = infoEntry(); return e ? relState(e).refs || null : null; };
async function ccForCite(t) {
  const k = 'C|' + (infoEntry() ? infoEntry().k : '') + '|' + t.fam + '|' + t.year;
  if (CC.found.has(k)) return CC.found.get(k);
  const mine = ccMine(t.fam, t.year);
  if (!ccRefsNow() && mine.length) return ccDedupe(mine.map(e => ({ e }))).slice(0, 4);
  const refs = await ccRefs();
  let list = (refs || []).filter(c => c.year === t.year && c.people[0] && ccFam(tsFamily(c.people[0])) === t.fam);
  if (!list.length) list = mine.map(e => ({ e }));
  if (!list.length) {
    t.entry = t.entry || await ccEntryFor(t.fam, t.year);
    if (t.entry) list = await ccForText(t.entry.text);
  }
  list = ccDedupe(list).slice(0, 4);
  // (Nothing found isn't kept: it may be found later, back online.)
  if (list.length) CC.found.set(k, list);
  return list;
}
// A link's destination's entry: the lines at that place on its page (from
// the destination's top down, in its column), to where the next starts.
async function ccDestText(dest, where) {
  const page = await V.doc.getPage(where.page), tc = await page.getTextContent();
  let d = dest;
  if (typeof d === 'string') d = await V.doc.getDestination(d);
  const left = Array.isArray(d) && d[1] && d[1].name === 'XYZ' && typeof d[2] === 'number' ? d[2] : null;
  const top = where.top == null ? Infinity : where.top + 2;
  const items = tc.items.filter(it => it.str && it.str.trim() && it.transform[5] <= top && (left == null || it.transform[4] >= left - 6));
  let rows = [];
  items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]).forEach(it => {
    const y = it.transform[5], row = rows.find(r => Math.abs(r.y - y) < 2);
    if (row) row.items.push(it); else rows.push({ y, items: [it] });
  });
  rows.forEach(r => {
    const run = [r.items[0]];
    for (let i = 1; i < r.items.length; i++) {
      const p = run[run.length - 1], it = r.items[i];
      if (it.transform[4] - (p.transform[4] + (p.width || 0)) > 12) break;
      run.push(it);
    }
    r.x = run[0].transform[4]; r.text = run.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
  });
  if (!rows.length) return '';
  rows = rows.filter(r => r.x <= rows[0].x + 40);
  const out = [rows[0].text], x0 = rows[0].x;
  for (let i = 1; i < rows.length && i < 7; i++) {
    const r = rows[i];
    if (rows[i - 1].y - r.y > 30) break;
    if (r.x <= x0 + 1 && (/^\s*(\[\d+\]|\d+\.)\s/.test(r.text) || (/\.\s*$/.test(rows[i - 1].text) && /^\p{Lu}[\p{L}'\u2019-]+,\s*\p{Lu}/u.test(r.text)))) break;
    out.push(r.text);
  }
  return out.join(' ').replace(/-\s+(?=\p{Ll})/gu, '');
}
const ccIsRef = where => !!(where && V.endPage && where.page >= V.endPage);

/* ---- the card */
function ccNames(c) {
  const who = c.e ? (c.e.a && c.e.a.length ? c.e.a : c.e.e || []).map(p => p[1] ? p[1] + ' ' + p[0] : p[0])
    : (c.people || []).map(p => { const [f, g] = String(p).split(/,\s*/); return g ? g + ' ' + f : f; });
  return who.length > 3 ? who[0] + ' et al.' : who.join(', ').replace(/, ([^,]*)$/, who.length > 2 ? ', and $1' : ' and $1');
}
// Its abstract: yours; or OpenAlex's (by its ID or DOI), or Semantic
// Scholar's; asked for once.
async function ccAbstract(c) {
  if (c.e) return String(c.e.f.abstract || '').replace(/[{}]/g, '').trim();
  if (c.abs !== undefined) return c.abs;
  let text = '';
  try {
    const id = String(c.id || '').replace(/^https?:\/\/openalex\.org\//, '');
    if (/^W\d+$/.test(id)) {
      const r = await npFetch(NP_OA + '/works/' + id + '?select=abstract_inverted_index');
      if (r.ok) text = npUninvert((await r.json()).abstract_inverted_index);
    }
    if (!text && c.doi) text = await npAbstract({ id: 'doi:' + c.doi, doi: c.doi });
  } catch (err) { /* none, then */ }
  c.abs = String(text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/^abstract[:.\s]+/i, '').trim();
  return c.abs;
}
const CC_I = {
  read: '<path d="M2.5 6h6a3.5 3.5 0 0 1 3.5 3.5V20a2.5 2.5 0 0 0-2.5-2.5h-7zM21.5 6h-6A3.5 3.5 0 0 0 12 9.5V20a2.5 2.5 0 0 1 2.5-2.5h7z"/>',
  go: '<path d="M4 12h14"/><path d="M13 6l6 6-6 6"/>', peek: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 13.5h17"/>',
  inbox: '<path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  down: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M6 15l6-6 6 6"/>', l: '<path d="M15 6l-6 6 6 6"/>', r: '<path d="M9 6l6 6-6 6"/>' };
const ccIcon = k => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${CC_I[k]}</svg>`;
const ccBtn = (act, icon, label, primary) => `<button type="button" class="btn${primary ? ' primary' : ''}" data-cc="${act}">${ccIcon(icon)}<span>${label}</span></button>`;
// Where the work is cited from, as the card's buttons go there.
function ccGoButtons(t) {
  if (t.kind === 'link' && t.where) return ccBtn('go', 'go', 'Go to reference') + (handheld() ? '' : ccBtn('peek', 'peek', 'Show in split screen'));
  if (t.kind === 'cite' && t.entry) return ccBtn('ref', 'go', 'Go to reference') + (handheld() ? '' : ccBtn('refpeek', 'peek', 'Show in split screen'));
  return '';
}
function ccDraw() {
  const t = CC.t;
  if (!CC.el || !t) return;
  const c = CC.list[CC.at];
  let html;
  if (CC.list.loading) {
    html = `<div class="cc-bd"><p class="cc-wait"><span class="cc-spin"></span>Looking up${t.fam ? ' ' + esc(t.who) + ' (' + esc(t.year) + ')' : ''}\u2026</p></div>`;
  } else if (!c) {
    const why = isOffline() ? 'Offline, and not in your library.' : t.kind === 'cite' ? 'Not in your library or the paper\u2019s reference list.' : 'Not in your library or online.';
    const text = t.entry ? t.entry.text : t.text;
    html = `<div class="cc-bd"><p class="cc-kind">Not found</p><p class="cc-m">${why}</p></div>` +
      `<div class="cc-acts">${ccGoButtons(t)}${text ? ccBtn('search', 'search', 'Find\u2026') : ''}</div>`;
  } else {
    const e = c.e;
    const pager = CC.list.length > 1 ? `<span class="cc-pager"><button type="button" data-cc="prev" aria-label="Previous">${ccIcon('l')}</button>${CC.at + 1} of ${CC.list.length}<button type="button" data-cc="next" aria-label="Next">${ccIcon('r')}</button></span>` : '';
    const stars = e ? Math.max(0, Math.min(5, e.rating || 0)) : 0;
    const inIb = !e && ibHas(c), passed = !e && !inIb && ibPassed(c);
    const kind = e ? `<span class="cc-dot"></span>In your library${stars ? ` <span class="cc-stars" aria-label="${stars} stars">${'\u2605'.repeat(stars)}${'\u2606'.repeat(5 - stars)}</span>` : ''}${e.f.read === '1' ? ' \u00b7 Read' : ''}`
      : inIb ? `<span class="pill ib-pill">${ICON.inbox}Inbox</span> added ${esc(ago(Math.round(inIb.added / 1000)))}`
      : 'Not in your library' + (c.src ? ' \u00b7 found on ' + esc(c.src) : '') + (passed ? ` \u00b7 <span class="cc-passed">you passed on it, ${esc(ago(Math.round((passed.passedAt || passed.at) / 1000)))}</span>` : '');
    const title = e ? String(e.f.title || '').replace(/[{}]/g, '') : c.title;
    const venue = e ? e.venue : c.venue, year = e ? e.f.year : c.year;
    const meta = [esc(ccNames(c)), venue ? '<i>' + esc(String(venue).replace(/[{}]/g, '')) + '</i>' : '', esc(year || '')].filter(Boolean).join(' \u00b7 ');
    const abs = c.absText;
    const absHtml = abs === undefined ? `<p class="cc-abs cc-abs-wait">\u2026</p>` : abs ? `<p class="cc-abs${CC.absOpen ? ' open' : ''}">${esc(abs)}</p>` +
      `<button type="button" class="cc-more" data-cc="abs" aria-expanded="${CC.absOpen}">${CC.absOpen ? 'Less' + ccIcon('up') : 'Abstract' + ccIcon('down')}</button>` : '';
    let acts = '';
    if (e) {
      acts += readablePdfs(e).length ? ccBtn('open', 'read', 'Read', true) : ccBtn('show', 'read', 'Show in library', true);
      acts += ccGoButtons(t) + '<span class="cc-sp"></span>';
      if (!RL.has(e.k)) acts += `<button type="button" class="cc-ib" data-cc="rl" title="Add to reading list" aria-label="Add to reading list">${ICON.bookmarkAdd}</button>`;
      acts += `<button type="button" class="cc-ib" data-cc="copy" title="Copy the reference" aria-label="Copy the reference">${ICON.copy}</button>`;
    } else if (inIb) {
      acts += (inIb.pdf ? ccBtn('ibread', 'read', 'Read', true) : '') + ccBtn('ibshow', 'inbox', 'Show in Inbox', !inIb.pdf) + ccGoButtons(t);
    } else acts += ccBtn('add', 'plus', 'Add\u2026', true) + (gs ? ccBtn('ib', 'inbox', 'Add to Inbox') : '') + ccGoButtons(t);
    html = `<div class="cc-bd"><p class="cc-kind">${kind}${pager}</p><p class="cc-t">${esc(title)}</p><p class="cc-m">${meta}</p>${absHtml}</div><div class="cc-acts">${acts}</div>`;
  }
  CC.el.innerHTML = html;
  ccPlace();
  if (CC.focusNext && !CC.list.loading) {
    const b = CC.el.querySelector('.cc-acts button, button');
    if (b) { b.focus({ preventScroll: true }); CC.focusNext = false; }
  }
}
// Beside what it's about: under it, or over it if there's no room below,
// a few pixels away (close enough to move to without leaving).
function ccPlace() {
  const t = CC.t, el = CC.el;
  if (!t || !el || !t.rects.length) return;
  const top = Math.min(...t.rects.map(r => r.top)), bottom = Math.max(...t.rects.map(r => r.bottom));
  const left = t.kind === 'entry' ? Math.max(...t.rects.map(r => r.right)) + 10 : t.rects[t.rects.length - 1].left;
  const w = el.offsetWidth, h = el.offsetHeight;
  let x, y;
  if (t.kind === 'entry' && left + w < innerWidth - 8) { x = left; y = Math.max(8, Math.min(innerHeight - h - 8, top - 10)); }
  else {
    x = Math.max(8, Math.min(innerWidth - w - 8, t.kind === 'entry' ? t.rects[0].left : left - 12));
    y = bottom + 4 + h <= innerHeight - 8 ? bottom + 4 : Math.max(8, top - h - 4);
  }
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}
function ccLight(rects) {
  ccUnlight();
  rects.forEach(r => {
    const d = document.createElement('div');
    d.className = 'cc-lit';
    Object.assign(d.style, { left: r.left - 2 + 'px', top: r.top - 1 + 'px', width: r.width + 4 + 'px', height: r.height + 2 + 'px' });
    document.body.appendChild(d);
    CC.lit.push(d);
  });
}
function ccUnlight() { CC.lit.forEach(d => d.remove()); CC.lit = []; }
// Shown for a target: the card at once (Looking up... while it looks), then
// what's found.
async function ccShow(t, pinned) {
  const my = ++CC.seq;
  clearTimeout(CC.hideT); clearTimeout(CC.showT); clearTimeout(CC.awayT); CC.awayT = 0;
  // (A link: only one to the reference list has a card.)
  if (t.kind === 'link' && !t.where) {
    t.where = await destWhere(t.dest).catch(() => null);
    if (my !== CC.seq) return;
    if (!ccIsRef(t.where)) { if (CC.el) ccClose(); return; }
  }
  CC.t = t; CC.key = t.key; CC.pinned = !!pinned; CC.at = 0; CC.doc = V.doc;
  // (Asked for, with a click or tap: its first button takes the focus, given
  // back on closing.)
  if (pinned) { CC.focusNext = true; CC.back = document.activeElement; }
  CC.st0 = $('#vScroll').scrollTop; CC.sl0 = $('#vScroll').scrollLeft;
  if (!CC.el) {
    CC.el = document.createElement('div');
    CC.el.className = 'cc-card';
    CC.el.setAttribute('role', 'dialog');
    CC.el.setAttribute('aria-label', 'The work cited');
    document.body.appendChild(CC.el);
    CC.el.addEventListener('pointerenter', () => { CC.inCard = true; clearTimeout(CC.hideT); clearTimeout(CC.awayT); CC.awayT = 0; });
    CC.el.addEventListener('pointerleave', () => { CC.inCard = false; if (!CC.pinned) ccHideSoon(); });
    CC.el.addEventListener('click', ccClick);
  }
  ccLight(t.rects);
  CC.list = []; CC.list.loading = true;
  ccDraw();
  let list = [];
  try {
    if (t.kind === 'link') {
      t.text = await ccDestText(t.dest, t.where);
      list = t.text ? await ccForText(t.text) : [];
    } else if (t.kind === 'entry') list = await ccForText(t.text);
    else {
      list = await ccForCite(t);
      if (!t.entry) ccEntryFor(t.fam, t.year).then(en => { if (en && my === CC.seq && CC.t === t) { t.entry = en; ccDraw(); } }).catch(() => {});
    }
  } catch (err) { console.warn('A citation\u2019s card:', err); }
  if (my !== CC.seq || !CC.el) return;
  CC.list = list;
  await ccShowAt(0, my);
}
async function ccShowAt(i, my) {
  CC.at = i;
  const c = CC.list[i];
  if (c && c.absText === undefined && c.e) c.absText = await ccAbstract(c);
  ccDraw();
  if (c && c.absText === undefined) {
    const text = await ccAbstract(c);
    if (my !== CC.seq || CC.list[CC.at] !== c) return;
    c.absText = text;
    ccDraw();
  }
}
function ccHideSoon() {
  clearTimeout(CC.hideT);
  CC.hideT = setTimeout(() => { if (!CC.inCard && !CC.pinned) ccClose(); }, 320);
}
function ccClose() {
  CC.seq++;
  const back = CC.back, had = CC.el && CC.el.contains(document.activeElement);
  CC.back = null; CC.focusNext = false;
  if (had && back && back.isConnected && back.focus) back.focus({ preventScroll: true });
  clearTimeout(CC.hideT); clearTimeout(CC.showT); clearTimeout(CC.awayT); CC.awayT = 0;
  CC.key = ''; CC.want = null; CC.t = null; CC.pinned = false; CC.inCard = false; CC.leave = null;
  ccUnlight();
  if (CC.el) { CC.el.remove(); CC.el = null; }
}
function ccClick(ev) {
  const b = ev.target.closest('[data-cc]');
  CC.pinned = true;
  if (!b) return;
  const act = b.dataset.cc, t = CC.t, c = CC.list[CC.at];
  CC.back = null;
  if (CC.doc !== V.doc || $('#viewer').hidden) { ccClose(); return; }
  if (act === 'abs') {
    CC.absOpen = !CC.absOpen; store.set('ccAbs', CC.absOpen); ccDraw();
    if (CC.absOpen) { const p = CC.el.querySelector('.cc-abs'); if (p) p.scrollTop = 0; }
    return;
  }
  if (act === 'prev' || act === 'next') { ccShowAt((CC.at + (act === 'next' ? 1 : -1) + CC.list.length) % CC.list.length, CC.seq); return; }
  ccClose();
  if (act === 'go' && t.dest) { closePeek(); pushBack(); V.link.goTo(t.dest); }
  else if (act === 'peek' && t.dest) showPeek(t.dest, t.where);
  else if (act === 'ref' && t.entry) { pushBack(); ccGoToEntry(t); }
  else if (act === 'refpeek' && t.entry) ccPeekEntry(t);
  else if (act === 'open' && c && c.e) relOpen(c.e);
  else if (act === 'show' && c && c.e) relOpen(c.e);
  else if (act === 'rl' && c && c.e) rlAdd(c.e.k);
  else if (act === 'copy' && c && c.e) { const r = citeRef(c.e); copy(r.text, 'Copied the ' + citeShort() + ' reference', r.html); }
  else if (act === 'add' && c) relAddFrom(c.from || c);
  else if (act === 'ib' && c) ibAdd(Object.assign({}, c.from || c, { absText: c.absText || (c.from || c).absText }));
  else if (act === 'ibshow' && c) { const x = ibHas(c); if (x) ibShow(x.id); }
  else if (act === 'ibread' && c) { const x = ibHas(c), ie = x && ibByKey(IB_PRE + x.id); if (ie && ie.files) openPaper(ie, ie.files[0]); }
  else if (act === 'search') relAddFrom({ search: refQuery(t.entry ? t.entry.text : t.text || '') });
}
// To a citation's entry: its page, then the entry's first words there,
// once the page is drawn, scrolled to and lit for a moment.
async function ccGoToEntry(t, peek) {
  const n = t.entry.page;
  const pages = peek ? '#vPeekPages' : '#vPages', sc = $(peek ? '#vPeekBody' : '#vScroll');
  (peek ? PEEK.viewer : V.viewer).scrollPageIntoView({ pageNumber: n });
  const first = new RegExp('^\\W*(?:\\[\\d+\\]\\s*|\\d+\\.\\s*)?' + ccEsc(srchFold(t.fam)) + '(?![a-z])'), any = new RegExp('(^|[^a-z])' + ccEsc(srchFold(t.fam)) + '(?![a-z])');
  const has = (lines, j, re) => re.test(srchFold(lines[j].text)) && (lines[j].text + ' ' + ((lines[j + 1] || {}).text || '')).includes(t.year);
  for (let i = 0; i < 30; i++) {
    const layer = document.querySelector(`${pages} .page[data-page-number="${n}"] .textLayer`);
    const lines = layer && layer.childElementCount ? ccLines(layer) : null;
    const L = lines && (lines.find((x, j) => has(lines, j, first)) || lines.find((x, j) => has(lines, j, any)));
    if (L) {
      const pr = layer.getBoundingClientRect(), box = sc.getBoundingClientRect();
      sc.scrollTop += pr.top + L.t - (box.top + box.height / 3);
      await ccSleep(60);
      const pr2 = layer.getBoundingClientRect(), d = document.createElement('div');
      d.className = 'cc-lit cc-flash';
      Object.assign(d.style, { left: pr2.left + L.l - 3 + 'px', top: pr2.top + L.t - 2 + 'px', width: L.r - L.l + 6 + 'px', height: L.b - L.t + 4 + 'px' });
      document.body.appendChild(d);
      const gone = () => { d.remove(); sc.removeEventListener('scroll', gone); };
      setTimeout(gone, 1600);
      sc.addEventListener('scroll', gone, { passive: true });
      return;
    }
    await ccSleep(150);
  }
}

// The entry in the split screen (opened at its page), lit there.
async function ccPeekEntry(t) {
  if (!V.doc) return;
  await showPeek(null, { page: t.entry.page, top: null });
  if (PEEK.viewer) ccGoToEntry(t, true);
}

/* ---- hovering, tapping, clicking */
const ccDist = (x, y) => { if (!CC.el) return Infinity; const r = CC.el.getBoundingClientRect(); return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom)); };
function ccMove() {
  CC.raf = 0;
  const x = CC.px, y = CC.py;
  // (Hovering shows it with a markup tool on too; a tap only with none.)
  if (!ccOn() || !V.doc || V.selected || !getSelection().isCollapsed || $('#viewer').hidden) { ccWant(null); return; }
  let t = null;
  try { t = ccTargetAt(x, y); } catch (err) { t = null; }
  ccWant(t, x, y);
}
// (Within 40px of the citation, lit.)
const ccNearLit = (x, y) => CC.lit.some(d => { const r = d.getBoundingClientRect(); return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom)) < 40; });
function ccWant(t, x, y) {
  if (CC.pinned) {
    // (Kept: put away after the pointer rests elsewhere on the page a while.)
    if (CC.inCard || (t && t.key === CC.key) || ccDist(x, y) < 40 || ccNearLit(x, y)) { clearTimeout(CC.awayT); CC.awayT = 0; }
    else if (!CC.awayT) CC.awayT = setTimeout(() => { CC.awayT = 0; if (CC.pinned && !CC.inCard) ccClose(); }, 1500);
    return;
  }
  const showing = !!CC.el;
  if (t && t.key === CC.key) { clearTimeout(CC.hideT); CC.leave = null; return; }
  if (showing && !CC.leave) CC.leave = { t: Date.now(), d: ccDist(x, y) };
  // (On the way to the card: what's crossed doesn't count.)
  if (showing && CC.leave && Date.now() - CC.leave.t < 600) {
    const d = ccDist(x, y);
    if (d <= CC.leave.d + 2) { CC.leave.d = d; ccHideSoon(); return; }
  }
  if (!t) {
    clearTimeout(CC.showT); CC.want = null;
    if (showing) ccHideSoon();
    return;
  }
  if (CC.want && CC.want.key === t.key) return;
  clearTimeout(CC.showT);
  CC.want = t;
  CC.showT = setTimeout(() => { if (CC.want === t) { CC.leave = null; ccShow(t, false); } }, showing ? 220 : 480);
}
$('#vScroll').addEventListener('pointermove', ev => {
  if (ev.pointerType === 'touch' || ev.buttons) return;
  CC.px = ev.clientX; CC.py = ev.clientY;
  if (!CC.raf) CC.raf = requestAnimationFrame(ccMove);
}, { passive: true });
// The split screen: the same, hovered or tapped (any tool: nothing's
// marked there); scrolled, the card's put away.
$('#vPeekBody').addEventListener('pointermove', ev => {
  if (ev.pointerType === 'touch' || ev.buttons) return;
  CC.px = ev.clientX; CC.py = ev.clientY;
  if (!CC.raf) CC.raf = requestAnimationFrame(ccMove);
}, { passive: true });
$('#vPeekBody').addEventListener('scroll', () => { if (CC.el) ccClose(); }, { passive: true });
(() => {
  let down = null;
  $('#vPeekBody').addEventListener('pointerdown', ev => { down = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: Date.now() }; }, true);
  $('#vPeekBody').addEventListener('pointerup', ev => {
    const d = down;
    down = null;
    if (!d || ev.pointerId !== d.id || ev.button !== 0 || ev.ctrlKey || !ccOn() || !V.doc) return;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8 || Date.now() - d.t > 400) return;
    if (ev.target.closest('a, button')) return;
    const x = ev.clientX, y = ev.clientY;
    setTimeout(() => {
      if (!getSelection().isCollapsed) return;
      let t = null;
      try { t = ccTargetAt(x, y); } catch (err) { t = null; }
      if (t && t.kind !== 'link') ccShow(t, true);
    }, 0);
  });
})();
$('#vScroll').addEventListener('pointerleave', ev => { if (ev.pointerType !== 'touch' && CC.pinned) { clearTimeout(CC.awayT); CC.awayT = 0; } if (ev.pointerType !== 'touch' && !CC.pinned) { clearTimeout(CC.showT); CC.want = null; if (CC.el) ccHideSoon(); } });
$('#vScroll').addEventListener('scroll', () => {
  if (!CC.el && !CC.want) return;
  const sc = $('#vScroll'), dy = sc.scrollTop - CC.st0, dx = sc.scrollLeft - CC.sl0;
  if (CC.el && CC.pinned && Math.abs(dy) < 30 && Math.abs(dx) < 30) {
    [CC.el, ...CC.lit].forEach(el => { el.style.translate = (-dx) + 'px ' + (-dy) + 'px'; });
    return;
  }
  ccClose();
}, { passive: true });
document.addEventListener('pointerdown', ev => { if (CC.el && !ev.target.closest('.cc-card')) ccClose(); }, true);
// (Esc puts the card away, and does nothing else: not the search, nor
// the paper.)
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && CC.el) { ev.stopPropagation(); ev.preventDefault(); ccClose(); } }, true);
// A tap on a citation (touch, with no tool on): its card, kept until a tap
// elsewhere. Said whether it was one (so the tap doesn't also show or hide
// the bars).
function ccTapTarget(x, y) {
  if (!ccOn() || !V.doc || !ccToolOk() || !getSelection().isCollapsed) return null;
  let t = null;
  try { t = ccTargetAt(x, y); } catch (err) { t = null; }
  return t && t.kind !== 'link' ? t : null;
}
function ccTapAt(x, y) {
  const t = ccTapTarget(x, y);
  if (!t) return false;
  ccShow(t, true);
  return true;
}
// A tap or click on a citation that the bars' tap (reader.js) doesn't see:
// with the Select tool on, or a mouse on a Mac. Its card, kept.
(() => {
  let down = null;
  $('#vScroll').addEventListener('pointerdown', ev => { down = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: Date.now() }; }, true);
  $('#vScroll').addEventListener('pointerup', ev => {
    const d = down;
    down = null;
    if (!d || ev.pointerId !== d.id || ev.button !== 0 || ev.ctrlKey || !ccToolOk() || (V.tool === 'read' && TOUCH_UI.matches)) return;
    // (A finger's, with the Pencil in use: the bars' tap has it.)
    if (V.pencil && ev.pointerType === 'touch' && TOUCH_UI.matches) return;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6 || Date.now() - d.t > 400) return;
    if (ev.target.closest('a, button, .annotationLayer section, .editToolbar')) return;
    const x = ev.clientX, y = ev.clientY;
    setTimeout(() => { if (getSelection().isCollapsed) ccTapAt(x, y); }, 0);
  });
})();
// A link to the reference list, clicked or tapped: its card, pinned, with
// the link's choices in it (see linkChoice).
function ccShowLink(dest, where, at) {
  if (!ccOn() || !ccIsRef(where)) return false;
  const top = document.elementFromPoint(at.x, at.y), a = top && top.closest('.annotationLayer a');
  const rects = a ? [...a.getClientRects()] : [new DOMRect(at.x - 6, at.y - 8, 12, 16)];
  ccShow({ kind: 'link', key: 'L:' + (a ? a.getAttribute('href') : String(at.x)) + ':click', dest, where, rects }, true);
  return true;
}
// The Settings switch.
if ($('#citeCardsBox')) {
  $('#citeCardsBox').checked = ccOn();
  $('#citeCardsBox').addEventListener('change', ev => { store.set('citeCards', ev.target.checked); if (!ev.target.checked) ccClose(); });
}
