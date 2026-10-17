// LibLande: Outline editing: change a paper's outline, or make one, and save it into the PDF.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/outline.js'] = '2026-10-17.01';
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
    r.parts.push({ x, str: it.str, w: it.width || 0, size, k: it.str.replace(/\s/g, '').length, bold: !!bold.get(it.fontName) });
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
    let cur = null, end = null, side = -1;
    for (const q of r.parts) {
      const s = gutter && q.x >= gutter.x ? 1 : 0;
      if (!cur || (s !== side && q.x - end > 4)) { out.push(cur = { y: r.y, x: q.x, size: 0, chars: 0, boldChars: 0, t: '' }); end = null; }
      side = s;
      if (end != null && q.x - end > 1.5 && !/\s$/.test(cur.t) && !/^\s/.test(q.str)) cur.t += ' ';
      cur.t += q.str;
      end = Math.max(end == null ? -Infinity : end, q.x + q.w);
      cur.size = Math.max(cur.size, q.size);
      cur.chars += q.k;
      if (q.bold) cur.boldChars += q.k;
    }
  }
  return out.map(r => ({ y: r.y, x: r.x, size: Math.round(r.size * 2) / 2, chars: r.chars, bold: r.chars > 0 && r.boldChars / r.chars > 0.85, text: r.t.replace(/\s+/g, ' ').trim() }))
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
// An outline from the headings: lines in larger type than the body text,
// or all in bold, not too long, not repeated on page after page (running
// heads). Levels from their numbering ("2.1 | ..." under "2 | ...") or,
// unnumbered, their type: the largest the top level, bold text-sized ones
// below the larger. (A heading over two lines is one entry.)
async function headingOutline(doc, onPage) {
  const all = [], by = new Map();
  for (let n = 1; n <= doc.numPages; n++) {
    if (onPage) onPage(n);
    const page = await doc.getPage(n);
    const rows = await pageRows(page, true);
    // (Down the left column, then the right.)
    const [x0, , x1] = page.view, half = (x1 - x0) / 2;
    rows.forEach(r => { r.col = r.x - x0 > half ? 1 : 0; });
    rows.sort((a, b) => a.col - b.col || b.y - a.y);
    for (const r of rows) { all.push(Object.assign({ page: n }, r)); by.set(r.size, (by.get(r.size) || 0) + r.chars); }
    page.cleanup();
  }
  let best = 0, body = 10;
  for (const [s, c] of by) if (c > best) { best = c; body = s; }
  const key = t => t.toLowerCase().replace(/[\d\s.,:;|ivxlc]+$/g, '').replace(/^[\d\s.,:;|ivxlc]+/, '').trim();
  const pagesWith = new Map();
  for (const r of all) { const k = key(r.text); if (!k) continue; if (!pagesWith.has(k)) pagesWith.set(k, new Set()); pagesWith.get(k).add(r.page); }
  const big = r => r.size >= body * 1.12, boldHead = r => r.bold && r.size >= body * 0.95 && r.text.length <= 90;
  let heads = all.filter(r => (big(r) || boldHead(r)) && r.text.length >= 2 && r.text.length <= 120 && /[A-Za-z]{2}/.test(r.text) &&
    !/^[\divxlc.\s]+$/i.test(r.text) && (pagesWith.get(key(r.text)) || new Set()).size <= 3);
  // Two lines of one heading: the same size, one just under the other.
  const joined = [];
  for (const r of heads) {
    const last = joined[joined.length - 1];
    if (last && last.page === r.page && last.col === r.col && last.size === r.size && last.y - r.y > 0 && last.y - r.y < r.size * 1.8 && last.lines < 3) {
      last.text += ' ' + r.text; last.y = r.y; last.lines++;
    } else joined.push(Object.assign({ lines: 1, top: r.y + r.size }, r));
  }
  heads = joined;
  // Levels: by size, the largest three (or two, if there are very many),
  // then bold; or by numbering.
  const sizes = [...new Set(heads.filter(big).map(h => h.size))].sort((a, b) => b - a).slice(0, heads.length > 400 ? 2 : 3);
  const NUM = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?(?:\s*[|:.)]\s*|\s+)(?=[A-Za-z\u2018\u201c'"])/;
  const levelOf = h => {
    const m = NUM.exec(h.text);
    if (m) return m[1].split('.').length - 1;
    return big(h) ? sizes.indexOf(h.size) : sizes.length;
  };
  return heads.filter(h => !big(h) || sizes.includes(h.size)).map(h => ({ title: h.text.slice(0, 160), page: h.page, top: Math.round(h.top + 2), level: Math.min(levelOf(h), OLE_MAX_LEVEL) }))
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
        toast('No Contents page was found. Go to it (its first page), then try again.', 6000);
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
