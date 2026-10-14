// LibLande: Split pages: a scan of an open book, two pages to each page of the PDF, made one page each.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/split.js'] = '2026-10-13.13';
/* ---------------------------------------------------------- split pages */
// From a page's thumbnail (Split), or all the wide pages at once (Split
// all). A dashed line shows where the page will be cut, at the fold
// LibLande finds (the band down the middle with no lines of print); drag
// it if it's not quite there. Each page becomes two, in the PDF itself:
// both show the same picture, each cut down to its half (so nothing is
// lost, and other apps show them so too). Marks go with the half they're
// on. Split all cuts each wide page at its own fold, and leaves pages that
// aren't wide (a cover, say) as they are. Saved to Google Drive like
// rotation (rewritePdf), and you stay on the page you were reading.
// (Words in a page's text, as from OCR, stay in the whole page: LibLande
// leaves out those outside each half, but other apps may find them on
// both. Best split a scan before making it searchable.)
const SPLIT = { n: 0, all: false, at: 0.5, busy: false, token: 0 };
// (Wider than tall by this much: two pages side by side.)
const SPLIT_WIDE = 1.15;

// Where the fold is on page n, from 0 (left) to 1 (right): the widest band
// near the middle with no lines of print, found in a small drawing of the
// page. (Print makes many changes from light to dark going down a column
// of dots; margins, the gutter and its shadow make few.)
async function foldOf(doc, n) {
  const page = await doc.getPage(n);
  const one = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: 480 / one.width });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const cx = c.getContext('2d', { willReadFrequently: true });
  try {
    await page.render({ canvas: c, canvasContext: cx, viewport: vp, background: 'white', annotationMode: V.lib.AnnotationMode.DISABLE }).promise;
    const W = c.width, H = c.height, px = cx.getImageData(0, 0, W, H).data;
    const grey = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) grey[i] = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11;
    const edges = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let k = 0;
      for (let y = 0; y + 1 < H; y++) if (Math.abs(grey[y * W + x] - grey[(y + 1) * W + x]) > 48) k++;
      edges[x] = k;
    }
    const s = new Float32Array(W);
    for (let x = 0; x < W; x++) { let t = 0, m = 0; for (let d = -2; d <= 2; d++) if (x + d >= 0 && x + d < W) { t += edges[x + d]; m++; } s[x] = t / m; }
    const body = Array.from(s.slice(Math.floor(W * 0.1), Math.ceil(W * 0.9))).sort((a, b) => a - b);
    const busy = body[Math.floor(body.length * 0.75)] || 0;
    const quiet = x => s[x] <= Math.max(1, busy * 0.08);
    let best = null;
    const lo = Math.floor(W * 0.3), hi = Math.ceil(W * 0.7);
    for (let x = lo; x < hi;) {
      if (!quiet(x)) { x++; continue; }
      let y = x;
      while (y < hi && quiet(y)) y++;
      const mid = (x + y) / 2, score = (y - x) - Math.abs(mid - W / 2) * 0.15;
      if (!best || score > best.score) best = { mid, score };
      x = y;
    }
    return best ? best.mid / W : 0.5;
  } finally {
    c.width = c.height = 0;
    page.cleanup();
  }
}
const isWide = async (doc, n) => { const v = (await doc.getPage(n)).getViewport({ scale: 1 }); return v.width > v.height * SPLIT_WIDE; };

// Choosing where to cut: the line on the page, and the bar at the top.
async function splitStart(n, all) {
  if (!V.doc || !V.file || !V.viewer || SPLIT.busy) return;
  if (!gs || !navigator.onLine) { toast('Splitting pages needs an internet connection, to save them to Google Drive.', 3500); return; }
  if (OCR.file && OCR.file.id === V.file.id) { toast('Wait until the paper has been made searchable.', 3500); return; }
  const doc = V.doc, my = ++SPLIT.token;
  if (all) {
    // (The page you're on, if it's wide; otherwise the first wide one.)
    const cur = V.viewer.currentPageNumber;
    let at = (await isWide(doc, cur)) ? cur : 0;
    for (let k = 1; !at && k <= doc.numPages; k++) if (await isWide(doc, k)) at = k;
    if (my !== SPLIT.token || doc !== V.doc) return;
    if (!at) { toast('No page here is wider than tall, as two pages side by side are.', 4000); return; }
    n = at;
  }
  if (sidePhone() && sideOpen()) toggleSide(false);
  setTool('read');
  Object.assign(SPLIT, { n, all, at: 0.5 });
  V.viewer.scrollPageIntoView({ pageNumber: n });
  splitBar('Finding the fold\u2026');
  const at = await foldOf(doc, n).catch(() => 0.5);
  if (my !== SPLIT.token || doc !== V.doc || !SPLIT.n) return;
  SPLIT.at = at;
  splitLine();
  let wide = 0;
  if (all) for (let k = 1; k <= doc.numPages; k++) if (await isWide(doc, k)) wide++;
  if (my !== SPLIT.token || !SPLIT.n) return;
  SPLIT.wide = wide;
  splitBar(all
    ? 'Split ' + wide + ' wide page' + (wide === 1 ? '' : 's') + ' in two, each at its fold. On this one, drag the line if it\u2019s not at the fold.'
    : 'Split page ' + n + ' in two at the line. Drag it to the fold if it\u2019s not there.', true);
}
function splitEnd() {
  SPLIT.token++;
  SPLIT.n = 0;
  document.querySelectorAll('.v-cut-line').forEach(el => el.remove());
  $('#vCut').hidden = true;
  ocrBar();
}
function splitBar(msg, ready) {
  const bar = $('#vCut');
  bar.hidden = false;
  bar.querySelector('.v-cut-msg').textContent = msg;
  $('#vCutGo').hidden = !ready;
  $('#vCutGo').textContent = SPLIT.all ? 'Split all' : 'Split';
  $('#vCutX').hidden = !!SPLIT.busy;
  $('#vOcr').hidden = true;
}
// The line, on the page (put back when PDF.js draws the page afresh).
function splitLine() {
  const page = SPLIT.n && $(`#vPages .page[data-page-number="${SPLIT.n}"]`);
  if (!page) return;
  let line = page.querySelector('.v-cut-line');
  if (!line) {
    line = document.createElement('div');
    line.className = 'v-cut-line';
    line.innerHTML = '<span class="v-cut-grip" aria-hidden="true"></span>';
    page.appendChild(line);
    let held = null;
    line.addEventListener('pointerdown', ev => {
      ev.stopPropagation(); ev.preventDefault();
      held = ev.pointerId;
      try { line.setPointerCapture(ev.pointerId); } catch (err) { /* (still followed while over the line) */ }
      line.classList.add('moving');
    });
    line.addEventListener('pointermove', ev => {
      if (held !== ev.pointerId) return;
      ev.stopPropagation(); ev.preventDefault();
      const r = page.getBoundingClientRect();
      SPLIT.at = Math.max(0.1, Math.min(0.9, (ev.clientX - r.left) / r.width));
      line.style.left = (SPLIT.at * 100) + '%';
    });
    const up = ev => { ev.stopPropagation(); held = null; line.classList.remove('moving'); };
    line.addEventListener('pointerup', up);
    line.addEventListener('pointercancel', up);
  }
  line.style.left = (SPLIT.at * 100) + '%';
}

// Cutting: each page's two halves, as boxes on the page in the PDF's own
// coordinates (turned pages too), written by splitPdf.
async function splitApply() {
  if (!SPLIT.n || SPLIT.busy || !V.doc || !V.file) return;
  const doc = V.doc, file = V.file, first = SPLIT.n, all = SPLIT.all, at0 = SPLIT.at;
  SPLIT.busy = true;
  document.querySelectorAll('.v-cut-line').forEach(el => el.remove());
  try {
    const list = [];
    if (all) { for (let k = 1; k <= doc.numPages; k++) if (await isWide(doc, k)) list.push(k); } else list.push(first);
    const cuts = [];
    for (const [i, n] of list.entries()) {
      if (doc !== V.doc) throw new Error('the paper was closed.');
      if (list.length > 1) splitBar('Finding the fold: page ' + (i + 1) + ' of ' + list.length + '\u2026');
      const at = n === first ? at0 : await foldOf(doc, n);
      const vp = (await doc.getPage(n)).getViewport({ scale: 1 }), W = vp.width, H = vp.height;
      const box = (x0, x1) => {
        const [ax, ay] = vp.convertToPdfPoint(x0, 0), [bx, by] = vp.convertToPdfPoint(x1, H);
        return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
      };
      cuts.push({ n, first: box(0, at * W), second: box(at * W, W) });
    }
    splitBar('Splitting and saving\u2026');
    // Where you were: the same page, numbered anew (its first half).
    const cur = V.viewer.currentPageNumber, page = cur + cuts.filter(c => c.n < cur).length;
    await rewritePdf(file, bytes => splitPdf(bytes, cuts), { page });
    toast(cuts.length === 1 ? 'Page ' + first + ' split in two.' : cuts.length + ' pages split in two.', 3500);
  } catch (err) {
    toast('Couldn\u2019t split the page' + (all ? 's' : '') + ': ' + errText(err), 6000);
  } finally {
    SPLIT.busy = false;
    splitEnd();
  }
}
// The PDF with each page in cuts made two: the page itself cut down to its
// first half, and a new page after it sharing its contents, cut down to
// the second. Last first, so the page numbers still hold.
async function splitPdf(bytes, cuts) {
  const { PDFName, PDFArray, PDFDict, PDFNumber, PDFPage, PDFPageLeaf } = await loadPdfLib();
  const doc = await pdfLibOpen(bytes), cx = doc.context;
  const N = k => PDFName.of(k);
  const inBox = (r, x, y) => x >= r[0] - 0.5 && x <= r[2] + 0.5 && y >= r[1] - 0.5 && y <= r[3] + 0.5;
  for (const c of [...cuts].sort((a, b) => b.n - a.n)) {
    const page = doc.getPage(c.n - 1), src = page.node;
    const node = PDFPageLeaf.fromMapWithContext(new Map(), cx);
    for (const [k, v] of src.entries()) node.set(k, v);
    // (What it may take from the pages above it, its own: it may not end
    // up under the same ones.)
    for (const k of ['Resources', 'MediaBox', 'CropBox']) if (!src.get(N(k))) { const v = src.getInheritableAttribute(N(k)); if (v) node.set(N(k), v); }
    node.set(N('Rotate'), PDFNumber.of(page.getRotation().angle));
    // Its own list of contents (shared streams; a list changed on one
    // page, as by OCR later, mustn't change the other).
    const contents = cx.lookup(src.get(N('Contents')));
    if (contents instanceof PDFArray) node.set(N('Contents'), cx.obj(contents.asArray()));
    const ref = cx.register(node);
    // The marks: each on the half its middle is on.
    const annots = src.lookup(N('Annots'));
    if (annots instanceof PDFArray) {
      const one = [], two = [];
      for (let i = 0; i < annots.size(); i++) {
        const a = annots.lookup(i), rect = a instanceof PDFDict ? a.lookup(N('Rect')) : null;
        const nums = rect instanceof PDFArray ? rect.asArray().map(v => { const o = cx.lookup(v); return o instanceof PDFNumber ? o.asNumber() : 0; }) : null;
        const second = nums && nums.length === 4 && inBox(c.second, (nums[0] + nums[2]) / 2, (nums[1] + nums[3]) / 2) && !inBox(c.first, (nums[0] + nums[2]) / 2, (nums[1] + nums[3]) / 2);
        if (second) { two.push(annots.get(i)); if (a instanceof PDFDict && a.get(N('P'))) a.set(N('P'), ref); } else one.push(annots.get(i));
      }
      if (one.length) src.set(N('Annots'), cx.obj(one)); else src.delete(N('Annots'));
      if (two.length) node.set(N('Annots'), cx.obj(two)); else node.delete(N('Annots'));
    }
    for (const [nd, r] of [[src, c.first], [node, c.second]]) {
      nd.set(N('MediaBox'), cx.obj(r));
      nd.set(N('CropBox'), cx.obj(r));
      for (const k of ['TrimBox', 'BleedBox', 'ArtBox']) nd.delete(N(k));
    }
    doc.insertPage(c.n, PDFPage.of(node, ref, doc));
  }
  // (The PDF's own page numbering, if it had one, no longer fits.)
  doc.catalog.delete(N('PageLabels'));
  return doc.save();
}

$('#vCutGo').addEventListener('click', splitApply);
$('#vCutX').addEventListener('click', splitEnd);
// (Leaving the paper, or another one opened: no line.)
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && SPLIT.n && !SPLIT.busy) { ev.stopPropagation(); splitEnd(); } }, true);
