// LibLande: Outline editing: change a paper's outline, or make one, and save it into the PDF.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/outline.js'] = '2026-10-19.03';
/* -------------------------------------------------------- outline editor */
// In the sidebar's Outline tab: Edit the outline (the PDF's own, or the one
// made from its printed Contents), or Make one afresh: from the Contents
// (the page you're on, if it's the Contents; otherwise the one found), from
// the paper's headings (lines in larger type than the text), or starting
// empty. Each entry: its title, to type over, and its page, to go to.
// Drag one by its grip to move it in or out a level; This page moves
// it to the page you're on; the red minus deletes it; + puts in an entry
// for the page you're on.
// Save writes it into the PDF (your bookmarks kept), so other apps show it
// too; nothing changes until then.
// items: { title, page, top (in PDF units, or null for the top of the
// page), level }, in order.
const OLE = { on: false, items: [], sel: -1, from: '', busy: false };
const OLE_MAX_LEVEL = 5;

// The outline shown now, as entries to edit.
async function oleLoad() {
  const out = [];
  const o = SIDE.outline;
  const walk = async (list, level) => {
    for (const it of list || []) {
      let page = it.page || 0, top = null;
      if (!page && it.dest) { const w = await destWhere(it.dest).catch(() => null); if (w) { page = w.page; top = w.top; } }
      if (page) out.push({ title: String(it.title || '').trim() || 'Untitled', page, top, level });
      await walk(it.items, page ? level + 1 : level);
    }
  };
  await walk(o && o.items, 0);
  return out;
}
async function oleStart(items, from) {
  if (!V.doc) return;
  OLE.busy = true;
  try { OLE.items = items || await oleLoad(); } finally { OLE.busy = false; }
  OLE.on = true;
  OLE.sel = -1;
  OLE.from = from || '';
  oleRender();
}
function oleEnd() {
  OLE.on = false;
  OLE.items = [];
  OLE.sel = -1;
  if (SIDE.tab === 'outline') showOutline();
}
const olePageName = n => { const L = V.pageLabels; return L && L[n - 1] && L[n - 1] !== String(n) ? L[n - 1] + ' (' + n + ')' : String(n); };
const OLE_GRIP = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';
// Each entry: a grip to drag it by (right or left to move it, with its
// own entries, in or out a level; entries stay in their order), its title,
// This page (move it to the page you're on), its page (to go to), and
// Delete (the red minus, at the end, where it's always in the same place).
function oleRender() {
  if (SIDE.tab !== 'outline' || !OLE.on) return;
  const body = $('#vSideBody'), n = OLE.items.length;
  body.innerHTML = `<div class="v-ole">` +
    `<div class="v-ole-bar"><button type="button" class="tb-btn v-ole-add" data-ole="add" aria-label="Add an entry for the page you\u2019re on" title="Add an entry for the page you\u2019re on"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>` +
    OL_MAKE_MENU.replace('menu right', 'menu') + `<span></span>` +
    `<button type="button" class="btn" data-ole="cancel">Cancel</button><button type="button" class="btn primary" data-ole="save">Save</button></div>` +
    (OLE.from ? `<p class="v-side-note v-ole-from">${esc(OLE.from)} Check it, then Save.</p>` : '') +
    (n ? `<ol class="v-ole-list">` + OLE.items.map((it, i) =>
      `<li data-ole-i="${i}" style="--lvl:${it.level}"><div class="v-ole-row"><span class="v-ole-grip" title="Drag right or left to move it in or out a level" aria-hidden="true">${OLE_GRIP}</span>` +
      `<input type="text" class="v-ole-title" value="${esc(it.title)}" aria-label="Title" spellcheck="true">` +
      `<button type="button" class="v-ole-here" data-ole-here="${i}" aria-label="Move to the page you\u2019re on" title="Move to the page you\u2019re on"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3.5" width="13" height="17" rx="1.5"/><path d="M2.5 12h9M8.5 9l3 3-3 3"/></svg></button>` +
      `<button type="button" class="v-ole-pg" data-ole-go="${i}" title="Go to the page">${esc(olePageName(it.page))}</button>` +
      `<button type="button" class="v-ole-del" data-ole-del="${i}" aria-label="Delete" title="Delete"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7.5 12h9"/></svg></button></div></li>`).join('') + `</ol>`
      : `<p class="v-side-note">No entries. Go to a page and press +, or Make\u2026 one.</p>`) +
    `</div>`;
}
// The entry being typed in (for Tab and shift-Tab).
function oleSelect(i) { OLE.sel = i; }
function oleAct(act) {
  const i = OLE.sel, it = OLE.items[i], list = OLE.items;
  if (act === 'add') {
    const page = V.viewer.currentPageNumber;
    // After the last entry on this page or before; at its level.
    let at = 0;
    for (let k = 0; k < list.length; k++) if (list[k].page <= page) at = k + 1;
    const level = at > 0 ? list[at - 1].level : 0;
    pageHeading(page).then(title => {
      list.splice(at, 0, { title: title || 'Page ' + olePageName(page), page, top: null, level });
      OLE.sel = at;
      oleRender();
      const input = $(`#vSideBody [data-ole-i="${at}"] .v-ole-title`);
      if (input) { input.focus(); input.select(); input.scrollIntoView({ block: 'nearest' }); }
    });
    return;
  }
  if (!it) return;
  if (act === 'out' && it.level > 0) {
    // (Its own entries come out with it.)
    const end = subtreeEnd(i);
    for (let k = i; k < end; k++) list[k].level--;
  } else if (act === 'in' && i > 0 && it.level <= list[i - 1].level && it.level < OLE_MAX_LEVEL) {
    const end = subtreeEnd(i);
    for (let k = i; k < end; k++) list[k].level++;
  } else if (act === 'here') {
    it.page = V.viewer.currentPageNumber; it.top = null;
  } else if (act === 'del') {
    // (Its own entries move up a level, rather than going too.)
    const end = subtreeEnd(i);
    for (let k = i + 1; k < end; k++) list[k].level--;
    list.splice(i, 1);
    OLE.sel = -1;
  }
  oleTidy();
  oleRender();
}
// (Levels never step in by more than one.)
function oleTidy() {
  const list = OLE.items;
  for (let k = 0; k < list.length; k++) list[k].level = Math.max(0, Math.min(list[k].level, k ? list[k - 1].level + 1 : 0, OLE_MAX_LEVEL));
}
// Moving an entry (with its own) to before the entry now at index `to`
// (or to the end; the same index: where it is), `by` levels in (or out,
// below 0).
function oleMove(i, to, by) {
  const list = OLE.items, end = subtreeEnd(i), block = list.splice(i, end - i);
  if (to > i) to -= block.length;
  block.forEach(it => { it.level += by; });
  list.splice(to, 0, ...block);
  oleTidy();
  oleRender();
}
// Where entry i's own entries (those under it) end.
function subtreeEnd(i) {
  const list = OLE.items;
  let e = i + 1;
  while (e < list.length && list[e].level > list[i].level) e++;
  return e;
}

// Dragging by the grip, side to side: a line shows the level it will be at.
const OLE_DRAG = { i: -1, end: 0, x0: 0, level0: 0, level: 0, line: null };
const OLE_STEP = 14;
function oleDragTo(ev) {
  const D = OLE_DRAG, list = $('#vSideBody .v-ole-list');
  if (!list) return;
  const rows = [...list.querySelectorAll(':scope > li')];
  const most = D.i > 0 ? OLE.items[D.i - 1].level + 1 : 0;
  const level = Math.max(0, Math.min(most, OLE_MAX_LEVEL, D.level0 + Math.round((ev.clientX - D.x0) / OLE_STEP)));
  D.level = level;
  const lr = list.getBoundingClientRect();
  D.line.style.top = (rows[D.i].getBoundingClientRect().bottom - lr.top + list.scrollTop - 1) + 'px';
  D.line.style.left = (8 + level * OLE_STEP) + 'px';
}
$('#vSideBody').addEventListener('pointerdown', ev => {
  const grip = OLE.on && ev.target.closest && ev.target.closest('.v-ole-grip');
  if (!grip) return;
  ev.preventDefault();
  const li = grip.closest('[data-ole-i]'), i = +li.dataset.oleI, list = li.parentNode;
  Object.assign(OLE_DRAG, { i, end: subtreeEnd(i), x0: ev.clientX, level0: OLE.items[i].level, level: OLE.items[i].level, id: ev.pointerId });
  [...list.querySelectorAll(':scope > li')].slice(i, OLE_DRAG.end).forEach(r => r.classList.add('lifted'));
  const line = document.createElement('div');
  line.className = 'v-ole-drop';
  list.appendChild(line);
  OLE_DRAG.line = line;
  try { grip.setPointerCapture(ev.pointerId); } catch (err) { /* (followed on the window) */ }
  oleDragTo(ev);
});
window.addEventListener('pointermove', ev => {
  if (OLE_DRAG.i < 0 || ev.pointerId !== OLE_DRAG.id) return;
  ev.preventDefault();
  oleDragTo(ev);
}, { passive: false });
const oleDrop = ev => {
  const D = OLE_DRAG;
  if (D.i < 0 || ev.pointerId !== D.id) return;
  const { i, level, level0 } = D;
  if (D.line) D.line.remove();
  D.i = -1; D.line = null;
  if (ev.type === 'pointercancel' || level === level0) { oleRender(); return; }
  oleMove(i, i, level - level0);
};
window.addEventListener('pointerup', oleDrop);
window.addEventListener('pointercancel', oleDrop);


// A page's heading, to name a new entry by: its first line in the largest
// type near the top (not a running head or a page number).
async function pageHeading(n) {
  try {
    const page = await V.doc.getPage(n), vp = page.getViewport({ scale: 1 });
    const rows = (await pageRows(page)).filter(r => r.y > vp.viewBox[1] + (vp.viewBox[3] - vp.viewBox[1]) * 0.35);
    const body = bodySize(rows);
    const big = rows.filter(r => r.size > body * 1.1 && r.text.length >= 2 && r.text.length <= 100 && /[A-Za-z]/.test(r.text));
    const pick = big.sort((a, b) => b.size - a.size || b.y - a.y)[0] || rows.find(r => r.text.length > 3 && !/^\d+$/.test(r.text));
    return pick ? pick.text.slice(0, 100) : '';
  } catch (err) { return ''; }
}

// Letter-spaced text, "T h e  r e f u t a t i o n": closed up (a wider
// space kept as the space between words).
const spacedOut = t => /^\s*(?:\S {1,3}){2,}\S\s*$/.test(t) && !/\S\S/.test(t) && /[A-Za-z]/.test(t) ? t.trim().split(/ {2,}/).map(w => w.replace(/ /g, '')).join(' ') : t;
// A page's text as lines, each with its type size (the largest in it),
// where it is, and (with fonts) whether it's all in bold.
async function pageRows(page, fonts) {
  const tc = await page.getTextContent();
  // (The fonts' names, as "Minion-Bold", once the page's drawing has been
  // worked out, which loads them.)
  const bold = new Map();
  if (fonts) {
    try { await page.getOperatorList(); } catch (err) { /* (no fonts: none bold) */ }
    for (const it of tc.items) {
      if (bold.has(it.fontName)) continue;
      let f = null;
      try { f = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null; } catch (err) { f = null; }
      bold.set(it.fontName, !!(f && /bold|black|heavy|semibold|demi/i.test(String(f.name || ''))));
    }
  }
  const rows = [];
  for (const it of tc.items) {
    if (!it.str || !it.transform || !it.str.trim()) continue;
    const t = it.transform, size = Math.hypot(t[2], t[3]) || it.height || 0, x = t[4], y = t[5];
    if (size < 1) continue;
    let r = rows.find(q => Math.abs(q.y - y) < Math.max(1.5, Math.min(q.size, size) * 0.45));
    if (!r) rows.push(r = { y, size, parts: [] });
    r.size = Math.max(r.size, size);
    // (Letter-spaced, "F i r s t - o r d e r": closed up.)
    const str = spacedOut(it.str);
    r.parts.push({ x, str, w: it.width || 0, size, k: str.replace(/\s/g, '').length, bold: !!bold.get(it.fontName) });
  }
  rows.sort((a, b) => b.y - a.y);
  // Two columns: a band down the middle that (almost) no line crosses.
  // Each line is split there, the columns' lines side by side being two.
  const [vx0, , vx1] = page.view, bins = new Uint16Array(Math.ceil((vx1 - vx0) / 2) + 1);
  for (const r of rows) {
    const seen = new Set();
    for (const q of r.parts) for (let b = Math.max(0, Math.floor((q.x - vx0) / 2)); b <= Math.min(bins.length - 1, Math.floor((q.x + q.w - vx0) / 2)); b++) seen.add(b);
    seen.forEach(b => { bins[b]++; });
  }
  // (The band with the least text, if clearly less than the columns
  // have: lines across the whole page, as a title or an abstract, cross it.)
  let gutter = null;
  const lo = Math.floor(bins.length * 0.3), hi = Math.ceil(bins.length * 0.7);
  const mid = Array.from(bins.slice(lo, hi)), least = Math.min(...mid);
  const typical = Array.from(bins.slice(Math.floor(bins.length * 0.1), Math.ceil(bins.length * 0.9))).sort((a, b) => a - b)[Math.floor(bins.length * 0.4)] || 0;
  if (rows.length >= 6 && least <= typical * 0.6) {
    const under = least + Math.max(1, rows.length * 0.03);
    for (let b = lo, run = 0; b < hi; b++) {
      if (bins[b] <= under) { run++; if (run >= 3 && (!gutter || run > gutter.run)) gutter = { run, x: vx0 + (b + 1 - run / 2) * 2 }; } else run = 0;
    }
  }
  const out = [];
  for (const r of rows) {
    r.parts.sort((a, b) => a.x - b.x);
    // (Letter-spaced text, each letter on its own, as "F i r s t": a space
    // only where the gap is clearly more than between the letters.)
    let wide = 1.5;
    if (r.parts.filter(q => q.k === 1).length > r.parts.length / 2 && r.parts.length >= 6) {
      const g = r.parts.slice(1).map((q, i) => q.x - (r.parts[i].x + r.parts[i].w)).filter(x => x > 0).sort((a, b) => a - b);
      if (g.length) wide = Math.max(1.5, g[Math.floor(g.length / 2)] * 1.8);
    }
    let cur = null, end = null, side = -1;
    for (const q of r.parts) {
      const s = gutter && q.x >= gutter.x ? 1 : 0;
      if (!cur || (s !== side && q.x - end > 4)) { out.push(cur = { y: r.y, x: q.x, size: 0, chars: 0, boldChars: 0, t: '', col: s }); end = null; }
      side = s;
      if (end != null && q.x - end > wide && !/\s$/.test(cur.t) && !/^\s/.test(q.str)) cur.t += ' ';
      cur.t += q.str;
      end = Math.max(end == null ? -Infinity : end, q.x + q.w);
      cur.end = end;
      cur.size = Math.max(cur.size, q.size);
      (cur.sizes = cur.sizes || new Map()).set(q.size, (cur.sizes.get(q.size) || 0) + q.k);
      cur.chars += q.k;
      if (q.bold) cur.boldChars += q.k;
    }
  }
  // (w: how wide the line is; col: which column, when there are two;
  // size: the size most of its letters are, not a symbol's, larger.)
  const most = r => r.sizes ? [...r.sizes].sort((a, b) => b[1] - a[1])[0][0] : r.size;
  return out.map(r => ({ y: r.y, x: r.x, w: r.end - r.x, col: r.col, size: Math.round(most(r) * 2) / 2, chars: r.chars, bold: r.chars > 0 && r.boldChars / r.chars > 0.85, text: r.t.replace(/\s+/g, ' ').trim() }))
    .filter(r => r.text);
}
// The size most of the text is in.
function bodySize(rows) {
  const by = new Map();
  for (const r of rows) by.set(r.size, (by.get(r.size) || 0) + r.chars);
  let best = 0, size = 10;
  for (const [s, c] of by) if (c > best) { best = c; size = s; }
  return size;
}
// An outline from the headings. Each page is judged by itself (a scan's
// type can be larger on one page than the next): a heading is a line in
// larger type than the page's text; or one in bold (where the text isn't),
// or numbered ("2.1. Learning"), with more space above it than between the
// lines of the text, and short (not a paragraph's first line, as an
// exercise "1.2 Explain ..." is); and not on page after page (running
// heads). Levels from the numbering ("2.1" under "2"), unnumbered ones
// with numbered ones like them in type; otherwise by type, the largest the
// top level. (A heading over two lines is one entry.)
const HEAD_NUM = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?(?:\s*[|:.)]\s*|\s+)(?=[A-Za-z‘“'"])/;
async function headingOutline(doc, onPage) {
  const all = [], pages = [], whole = new Map();
  for (let n = 1; n <= doc.numPages; n++) {
    if (onPage) onPage(n);
    const page = await doc.getPage(n);
    const rows = await pageRows(page, true);
    page.cleanup();
    pages.push(rows);
    rows.forEach(r => whole.set(r.size, (whole.get(r.size) || 0) + r.chars));
  }
  const docBody = [...whole].sort((a, b) => b[1] - a[1])[0];
  // The printed page numbers: how far they are from the PDF's (the
  // commonest difference, from the numbers at the start or end of each
  // page's first and last lines), to know a running head by.
  const PN = /^(\d{1,4})\s|\s(\d{1,4})$|^(\d{1,4})$/, votes = new Map();
  pages.forEach((rows, i) => {
    const ends = rows.slice().sort((a, b) => b.y - a.y);
    for (const r of ends.slice(0, 2).concat(ends.slice(-2))) { const m = PN.exec(r.text); if (m) { const off = i + 1 - +(m[1] || m[2] || m[3]); votes.set(off, (votes.get(off) || 0) + 1); } }
  });
  const best = [...votes].sort((a, b) => b[1] - a[1])[0], pageOff = best && best[1] >= 3 ? best[0] : null;
  for (let n = 1; n <= pages.length; n++) {
    const rows = pages[n - 1];
    if (!rows.length) continue;
    // (Down the left column, then the right.)
    rows.sort((a, b) => a.col - b.col || b.y - a.y);
    // The page's text: its size (of those with a fair share of the page,
    // the nearest the paper's, not the footnotes'); whether it's (nearly)
    // all bold, as in a PDF whose every font is named bold, when bold says
    // nothing; the space between its lines; and how wide its lines run.
    const by = new Map();
    let chars = 0, boldChars = 0, pageChars = 0;
    rows.forEach(r => { by.set(r.size, (by.get(r.size) || 0) + r.chars); pageChars += r.chars; });
    const near = s => Math.abs(Math.log(s / docBody[0]));
    const body = ([...by].filter(([, c]) => c >= Math.min(pageChars * 0.15, 250)).sort((a, b) => near(a[0]) - near(b[0]))[0] || [...by].sort((a, b) => b[1] - a[1])[0])[0];
    rows.forEach(r => { if (r.size === body) { chars += r.chars; if (r.bold) boldChars += r.chars; } });
    const allBold = chars > 0 && boldChars / chars > 0.5;
    const gaps = [], widths = [];
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      r.gap = prev && prev.col === r.col ? prev.y - r.y : Infinity;
      if (r.size === body) { widths.push(r.w); if (r.gap > 0 && r.gap < body * 2.5 && prev.size === body) gaps.push(r.gap); }
    });
    gaps.sort((a, b) => a - b); widths.sort((a, b) => a - b);
    const spacing = gaps[Math.floor(gaps.length / 2)] || body * 1.2, lineW = widths[Math.floor(widths.length * 0.9)] || Infinity;
    let prev = null;
    rows.forEach((r, i) => {
      const last = prev;
      prev = null;
      // (Not a heading: too few letters, a formula or a table's row (many
      // symbols), or a figure's or table's caption.)
      const ratio = r.size / body, letters = r.text.replace(/[^A-Za-z]/g, '').length;
      if ((letters < 5 && !/^[A-Z][a-z]{3}$/.test(r.text)) || r.text.length > 120 || !/[A-Za-z]{4}/.test(r.text) || /^[\divxlc.\s]+$/i.test(r.text)) return;
      // (Code or a formula, as "in(robot1, room1)", or a table's row of
      // short entries.)
      const words = r.text.split(/\s+/);
      if (/[A-Za-z]\(/.test(r.text) || (r.text.match(/\(/g) || []).length > 2 || (words.length >= 4 && words.join('').length / words.length < 3)) return;
      if (r.text.replace(/[\sA-Za-z\u00c0-\u024f.,:;'\u2018\u2019?!\-()0-9\u2013\u2014&"\u201c\u201d/|\u00b7*\u2020\u2021]/g, '').length > 0 || letters / r.text.replace(/[\s\d.]/g, '').length < 0.6) return;
      if (/^(figure|fig\.|table|plate|chart)\s*\d/i.test(r.text)) return;
      // (A running head or foot: the page's first or last line, in the
      // text's size or smaller, with its printed page number, as "34 J.A.
      // Fodor and Z. W. Pylyshyn"; not a chapter's "1 Recognition", or "6 |
      // Conclusion" at the top of a page.)
      const pn = PN.exec(r.text);
      if (pn && ratio < 1.15 && (r.gap === Infinity || i === rows.length - 1) && pageOff != null && Math.abs(n - +(pn[1] || pn[2] || pn[3]) - pageOff) <= 1) return;
      // (The next line of a heading: as it, and just under it; a numbered
      // one's only if it ran the width of the text.)
      if (last && Math.abs(r.size - last.size) <= 0.5 && (last.kind !== 'bold' || r.bold) && last.y - r.y > 0 && last.y - r.y < r.size * 1.9 && (last.kind !== 'num' || last.long) && !HEAD_NUM.test(r.text)) {
        all.push(prev = { page: n, col: r.col, y: r.y, size: r.size, ratio, kind: last.kind, num: '', text: r.text, more: true });
        return;
      }
      // (A heading starts with a capital, a number, or "(a)"; not as a
      // label in a figure, "shape: T-shaped", or code.)
      if (!/^(\d|[A-Z\u00c0-\u00de]|\([a-zA-Z0-9]{1,4}\)\s|["'\u2018\u201c\u2022])/.test(r.text) || (r.text.match(/:/g) || []).length > 1) return;
      const apart = r.gap >= spacing * 1.5, long = r.w > lineW * 0.8;
      const short = !long && r.text.split(/\s+/).length <= 14 && !/[,;:\-]$/.test(r.text);
      const num = HEAD_NUM.exec(r.text);
      let kind = '';
      if (ratio >= 1.15) kind = 'big';
      else if (r.bold && !allBold && ratio >= 0.9 && apart && r.text.length <= 100) kind = 'bold';
      // (A long numbered one, with a lot of space above it: a chapter's
      // heading running over two lines.)
      // (Not an exercise, as "3.3 Suppose a function ...".)
      else if (num && ratio >= 0.9 && apart && (short || r.gap >= spacing * 3) && !/\.$/.test(r.text) &&
        !/^(suppose|give|find|explain|show|prove|let|consider|compute|calculate|describe|write|draw|discuss|assume|obtain|derive|determine)\b/i.test(r.text.slice(num[0].length))) kind = 'num';
      if (kind) all.push(prev = { page: n, col: r.col, y: r.y, size: r.size, bold: r.bold, ratio, kind, long, num: num ? num[1] : '', text: r.text });
    });
  }
  // Not running heads (the same words at the top or foot of page after
  // page).
  const key = t => t.toLowerCase().replace(/[\d\s.,:;|ivxlc]+$/g, '').replace(/^[\d\s.,:;|ivxlc]+/, '').trim();
  const pagesWith = new Map();
  pages.forEach((rows, i) => rows.forEach((r, j) => { const k = key(r.text); if (k.length < 4 || (j > 1 && j < rows.length - 2)) return; if (!pagesWith.has(k)) pagesWith.set(k, new Set()); pagesWith.get(k).add(i + 1); }));
  // (A chapter's title in large type, the same as the running head over
  // its pages, is kept.)
  let heads = all.filter(h => h.ratio >= 1.15 || (pagesWith.get(key(h.text)) || new Set()).size <= 3);
  // Two lines of one heading (the second found as such, above).
  const joined = [];
  for (const h of heads) {
    const last = joined[joined.length - 1];
    if (last && h.more && last.page === h.page && last.col === h.col && last.lines < 3) {
      last.text += ' ' + h.text; last.y = h.y; last.lines++;
    } else joined.push(Object.assign({ lines: 1, top: h.y + h.size }, h));
  }
  heads = joined;
  // Numbered ones in order: one numbered lower than the one before isn't a
  // heading (a list, or an exercise).
  const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return x.length - y.length; };
  if (window.LIBLANDE_TEST) headingOutline.seen = heads.slice();
  let lastNum = '';
  heads = heads.filter(h => { if (!h.num) return true; if (lastNum && cmp(h.num, lastNum) <= 0) return false; lastNum = h.num; return true; });
  // Their type: larger ones by size (to a tenth of the text's; sizes within
  // an eighth of each other one, as a scan's can vary), then bold, then
  // plain numbered.
  const zc = new Map();
  heads.filter(h => h.kind === 'big').forEach(h => { const z = Math.round(h.ratio * 10); zc.set(z, (zc.get(z) || 0) + 1); });
  const zOf = new Map(), zs0 = [...zc.keys()].sort((a, b) => a - b);
  for (let i = 0; i < zs0.length;) {
    let j = i;
    while (j + 1 < zs0.length && zs0[j + 1] / zs0[j] <= 1.12) j++;
    const group = zs0.slice(i, j + 1), main = group.slice().sort((a, b) => zc.get(b) - zc.get(a))[0];
    group.forEach(z => zOf.set(z, main));
    i = j + 1;
  }
  const style = h => h.kind === 'big' ? 'z' + zOf.get(Math.round(h.ratio * 10)) : h.kind;
  const rank = st => st[0] === 'z' ? -+st.slice(1) : st === 'bold' ? 0 : 1;
  // (A larger size seen once or twice is an odd line, as a figure's label
  // or the title page's: not a heading, unless there are hardly any.)
  const seen = new Map();
  heads.forEach(h => seen.set(style(h), (seen.get(style(h)) || 0) + 1));
  const styles = [...seen.keys()].sort((a, b) => rank(a) - rank(b));
  const zs = styles.filter(st => st[0] === 'z' && (seen.get(st) > 2 || heads.length <= 3)).slice(0, 3);
  const kept = styles.filter(st => st[0] !== 'z' || zs.includes(st));
  heads = heads.filter(h => kept.includes(style(h)));
  // Levels: numbered ones by their numbers; others as the numbered ones in
  // their type (most often), or else in order of type.
  const depthOf = new Map();
  heads.filter(h => h.num).forEach(h => { const st = style(h), d = h.num.split('.').length - 1, m = depthOf.get(st) || new Map(); m.set(d, (m.get(d) || 0) + 1); depthOf.set(st, m); });
  const levelOfStyle = new Map();
  kept.forEach(st => { const m = depthOf.get(st); if (m) levelOfStyle.set(st, [...m].sort((a, b) => b[1] - a[1])[0][0]); });
  let next = 0;
  kept.forEach(st => { if (levelOfStyle.has(st)) next = levelOfStyle.get(st) + 1; else levelOfStyle.set(st, next++); });
  return heads.map(h => ({ title: h.text.slice(0, 160), page: h.page, top: Math.round(h.top + 2), level: Math.min(h.num ? h.num.split('.').length - 1 : levelOfStyle.get(style(h)), OLE_MAX_LEVEL) }))
    .map((h, i, list) => Object.assign(h, { level: i ? Math.min(h.level, list[i - 1].level + 1) : 0 }));
}
// Making one: from the Contents on the page you're on, from the headings,
// or empty. (Then edited, and saved.)
async function oleMake(kind) {
  if (!V.doc || OLE.busy) return;
  const doc = V.doc, body = $('#vSideBody');
  if (kind === 'empty') { oleStart([], ''); return; }
  OLE.busy = true;
  try {
    let items = [], from = '';
    if (kind === 'toc') {
      // The Contents on the page you're on; or else the one found in the
      // first pages.
      const n = V.viewer.currentPageNumber;
      body.innerHTML = `<p class="v-side-note">Reading the Contents\u2026</p>`;
      let made = await printedContents(doc, null, n);
      if (!made || !made.items.length) made = await printedContents(doc, null);
      if (doc !== V.doc) return;
      if (!made || !made.items.length) {
        // (Many papers, and some books, have none: the headings instead.)
        toast('No Contents page was found. Go to it (its first page) and try again, or make the outline from the headings.', 9000,
          { label: 'From the headings', run: () => oleMake('heads') });
        OLE.busy = false;
        if (OLE.on) oleRender(); else showOutline();
        return;
      }
      const walk = (list, level) => { for (const it of list) { if (it.page) items.push({ title: it.title, page: it.page, top: null, level }); walk(it.items || [], level + 1); } };
      walk(made.items, 0);
      from = 'Made from the Contents on page' + (made.from === made.to ? ' ' + made.from : 's ' + made.from + '\u2013' + made.to) + '.';
    } else {
      items = await headingOutline(doc, p => { if (p % 10 === 1) body.innerHTML = `<p class="v-side-note">Looking for headings: page ${p} of ${doc.numPages}\u2026</p>`; });
      if (doc !== V.doc) return;
      if (!items.length) {
        toast('No headings were found: no lines in larger type than the text' + (V.scan ? ' (a scan has no text: make it searchable first)' : '') + '.', 6000);
        OLE.busy = false;
        if (OLE.on) oleRender(); else showOutline();
        return;
      }
      from = 'Made from ' + items.length + ' heading' + (items.length === 1 ? '' : 's') + ' (lines in larger type).';
    }
    OLE.busy = false;
    await oleStart(items, from);
  } catch (err) {
    toast('Couldn\u2019t make an outline: ' + errText(err), 6000);
  } finally {
    OLE.busy = false;
  }
}
// Saving: the outline written into the PDF in place of its old one (the
// bookmarks kept, after it), then the paper opened again with it.
async function oleSave() {
  if (!V.doc || !V.file || OLE.busy) return;
  if (!gs || !navigator.onLine) { toast('Saving the outline needs an internet connection, to save it to Google Drive.', 3500); return; }
  const items = OLE.items.map(it => Object.assign({}, it, { title: it.title.trim() || 'Untitled' })), file = V.file;
  OLE.busy = true;
  const bar = $('#vSideBody .v-ole-bar [data-ole="save"]');
  if (bar) { bar.disabled = true; bar.textContent = 'Saving\u2026'; }
  try {
    await rewritePdf(file, bytes => writeOutline(bytes, items));
    OLE.on = false; OLE.items = []; OLE.sel = -1;
    toast(items.length ? 'Outline saved into the PDF.' : 'Outline removed from the PDF.', 3000);
    if (V.file && V.file.id === file.id) {
      if (!sideOpen()) toggleSide(true);
      showSideTab('outline');
    }
  } catch (err) {
    toast('Couldn\u2019t save the outline: ' + errText(err), 6000);
    if (bar) { bar.disabled = false; bar.textContent = 'Save'; }
  } finally {
    OLE.busy = false;
  }
}
async function writeOutline(bytes, items) {
  const { PDFName, PDFDict, PDFRef, PDFNumber, PDFHexString } = await loadPdfLib();
  const pdf = await pdfLibOpen(bytes), ctx = pdf.context, cat = pdf.catalog, N = PDFName.of, pages = pdf.getPages();
  let rootRef = cat.get(N('Outlines')), root = cat.lookupMaybe(N('Outlines'), PDFDict);
  if (!root) { root = ctx.obj({ Type: 'Outlines' }); rootRef = ctx.register(root); cat.set(N('Outlines'), rootRef); }
  else if (!(rootRef instanceof PDFRef)) { rootRef = ctx.register(root); cat.set(N('Outlines'), rootRef); }
  const title = d => { try { const t = d.lookup(N('Title')); return t && t.decodeText ? t.decodeText() : ''; } catch (err) { return ''; } };
  // The bookmarks ("Page n" entries) stay; the rest goes.
  const marks = [];
  for (let ref = root.get(N('First')), guard = 0; ref instanceof PDFRef && guard < 20000; guard++) {
    const d = ctx.lookupMaybe(ref, PDFDict);
    if (!d || marks.some(it => it.ref === ref)) break;
    if (BM_TITLE.test(title(d).trim()) && !d.get(N('First'))) marks.push({ ref, d });
    ref = d.get(N('Next'));
  }
  // The new entries, as a tree.
  const made = items.filter(it => it.page >= 1 && it.page <= pages.length).map(it => {
    const page = pages[it.page - 1], box = page.getCropBox();
    const top = it.top != null ? it.top : box.y + box.height;
    const d = ctx.obj({ Title: PDFHexString.fromText(it.title), Dest: [page.ref, 'XYZ', null, top, null] });
    return { ref: ctx.register(d), d, level: it.level, kids: [] };
  });
  const top = [], stack = [];
  for (const it of made) {
    while (stack.length && stack[stack.length - 1].level >= it.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) { it.d.set(N('Parent'), parent.ref); parent.kids.push(it); } else top.push(it);
    stack.push(it);
  }
  const link = (list, parentRef) => {
    list.forEach((it, i) => {
      it.d.set(N('Parent'), parentRef);
      if (i > 0) it.d.set(N('Prev'), list[i - 1].ref); else it.d.delete(N('Prev'));
      if (i < list.length - 1) it.d.set(N('Next'), list[i + 1].ref); else it.d.delete(N('Next'));
    });
  };
  // (Open: every entry shown, its count the entries under it.)
  const count = it => it.kids.reduce((k, c) => k + 1 + count(c), 0);
  const build = it => {
    if (!it.kids.length) return;
    link(it.kids, it.ref);
    it.d.set(N('First'), it.kids[0].ref);
    it.d.set(N('Last'), it.kids[it.kids.length - 1].ref);
    it.d.set(N('Count'), PDFNumber.of(count(it)));
    it.kids.forEach(build);
  };
  top.forEach(build);
  const all = top.concat(marks.map(m => ({ ref: m.ref, d: m.d, kids: [] })));
  link(all, rootRef);
  if (!all.length) { cat.delete(N('Outlines')); return pdf.save(); }
  root.set(N('First'), all[0].ref);
  root.set(N('Last'), all[all.length - 1].ref);
  root.set(N('Count'), PDFNumber.of(all.reduce((k, it) => k + 1 + count(it), 0)));
  return pdf.save();
}

// The editor's buttons and typing.
$('#vSideBody').addEventListener('click', ev => {
  const mk = ev.target.closest('[data-ol-make]');
  if (mk) { const d = mk.closest('details'); if (d) d.open = false; oleMake(mk.dataset.olMake); return; }
  if (ev.target.closest('[data-ol-edit]')) { oleStart(null, ''); return; }
  if (!OLE.on) return;
  const go = ev.target.closest('[data-ole-go]');
  if (go) {
    const it = OLE.items[+go.dataset.oleGo];
    if (it && V.viewer) { pushBack(); V.viewer.scrollPageIntoView({ pageNumber: it.page, destArray: it.top != null ? [null, { name: 'XYZ' }, null, it.top, null] : null, allowNegativeOffset: true }); }
    return;
  }
  const here = ev.target.closest('[data-ole-here]'), del = ev.target.closest('[data-ole-del]');
  if (here || del) { OLE.sel = +(here || del).dataset[here ? 'oleHere' : 'oleDel']; oleAct(here ? 'here' : 'del'); return; }
  const b = ev.target.closest('[data-ole]');
  if (b) {
    const act = b.dataset.ole;
    if (act === 'save') oleSave();
    else if (act === 'cancel') oleEnd();
    else oleAct(act);
    return;
  }
});
$('#vSideBody').addEventListener('focusin', ev => {
  const row = OLE.on && ev.target.closest && ev.target.closest('[data-ole-i]');
  if (row && +row.dataset.oleI !== OLE.sel) oleSelect(+row.dataset.oleI);
});
$('#vSideBody').addEventListener('input', ev => {
  const row = OLE.on && ev.target.closest('[data-ole-i]');
  if (row && ev.target.matches('.v-ole-title')) { const it = OLE.items[+row.dataset.oleI]; if (it) it.title = ev.target.value; }
});
$('#vSideBody').addEventListener('keydown', ev => {
  if (!OLE.on || !ev.target.matches || !ev.target.matches('.v-ole-title')) return;
  // (Keys typed here are the title's, not the reader's shortcuts.)
  ev.stopPropagation();
  if (ev.key === 'Tab') { ev.preventDefault(); oleAct(ev.shiftKey ? 'out' : 'in'); oleFocusSel(); }
  else if (ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); }
  else if (ev.key === 'Escape') { ev.preventDefault(); ev.target.blur(); }
});
function oleFocusSel() {
  const input = $(`#vSideBody [data-ole-i="${OLE.sel}"] .v-ole-title`);
  if (input) { input.focus(); const n = input.value.length; try { input.setSelectionRange(n, n); } catch (err) { /* (not text) */ } }
}
