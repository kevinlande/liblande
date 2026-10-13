// LibLande: OCR: a scanned PDF made searchable.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/ocr.js'] = '2026-10-13.10';
/* ------------------------------------------------------------------ OCR */
// A scan's pages are pictures, with no text to search, select or mark.
// Make searchable reads each page without text with Tesseract (in this
// browser: the paper goes nowhere new), and writes the words it finds into
// the PDF as invisible text, each over its word in the picture, as Adobe's
// and other OCR do. The page looks just the same; the text can be found,
// selected, copied and highlighted, here and in other apps. It's saved to
// Google Drive like marks (after any marks not yet saved), and the paper
// opened again with it. It goes on while you read, or read another paper;
// Stop keeps the pages read so far (Make searchable again does the rest).
// Pages that already have text are left as they are.
// Tesseract (about 4 MB, and 3 MB of English) is downloaded the first
// time; from the site's own copy on GitHub Pages (vendor.py).
const TESS = './vendor/tesseract.js/7.0.0/';
const TESS_CORE = './vendor/tesseract.js-core/7.0.0/';
const TESS_LANG = './vendor/tesseract-eng/1.0.0/4.0.0_best_int';
// file, entry: the paper being read; pages: the page numbers to read;
// at: how many are done; phase: 'load', 'read', 'save'; found: page
// number -> its lines of words.
const OCR = { file: null, entry: null, pages: [], at: 0, phase: '', load: 0, stop: false, found: null, worker: null, idle: 0 };
// Papers whose "This is a scan" notice was dismissed (it isn't offered
// again; Search still offers it).
const OCR_NO = new Set(store.get('ocrNo', []));
// (Fewer characters than this on a page: no text to speak of.)
const OCR_MIN_CHARS = 12;

let tessReady = null;
function loadTesseract() {
  if (!tessReady) {
    tessReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESS + 'tesseract.min.js';
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error('The OCR tool (Tesseract) couldn\u2019t load. Check your internet connection and try again.'));
      document.head.appendChild(s);
    });
    tessReady.catch(() => { tessReady = null; });
  }
  return tessReady;
}
// One Tesseract worker, made when first needed and ended a minute after
// the last page (it holds a lot of memory).
async function ocrWorker() {
  clearTimeout(OCR.idle);
  if (OCR.worker) return OCR.worker;
  const T = await loadTesseract();
  const abs = u => new URL(u, location.href).href;
  // (From another site, as in testing, the worker is made from a copy of
  // its script: a page can't start one from another site directly.)
  const same = new URL(abs(TESS)).origin === location.origin;
  OCR.worker = T.createWorker('eng', T.OEM ? T.OEM.LSTM_ONLY : 1, {
    workerPath: abs(TESS + 'worker.min.js'), corePath: abs(TESS_CORE), langPath: abs(TESS_LANG),
    workerBlobURL: !same, gzip: true,
    logger: m => {
      if (OCR.phase !== 'load' || !m || typeof m.progress !== 'number') return;
      if (/^loading/.test(m.status || '')) { OCR.load = m.progress; ocrBar(); }
    },
    errorHandler: err => console.warn('OCR:', err),
  });
  OCR.worker.catch(() => { OCR.worker = null; });
  return OCR.worker;
}
function ocrWorkerDone() {
  clearTimeout(OCR.idle);
  OCR.idle = setTimeout(async () => {
    const w = OCR.worker;
    OCR.worker = null;
    if (w) { try { await (await w).terminate(); } catch (e) { /* gone */ } }
  }, 60000);
}

// How much text a page has (its characters, not counting spaces).
async function pageChars(doc, n) {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  return tc.items.reduce((k, it) => k + (it.str ? it.str.replace(/\s+/g, '').length : 0), 0);
}
// The pages with no text to speak of.
async function textlessPages(doc) {
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    if (await pageChars(doc, n) < OCR_MIN_CHARS) out.push(n);
  }
  return out;
}
// On opening a paper: is it a scan? A few pages through it are looked at;
// if most have no text, a notice offers to make it searchable.
async function ocrNotice(doc, file) {
  V.scan = false;
  if (!doc || !file) { ocrBar(); return; }
  const n = doc.numPages, look = [...new Set([1, 2, 3, Math.ceil(n / 3), Math.ceil(n / 2), Math.ceil(2 * n / 3), n].filter(k => k >= 1 && k <= n))];
  let none = 0;
  for (const k of look) {
    if (doc !== V.doc) return;
    if (await pageChars(doc, k).catch(() => OCR_MIN_CHARS) < OCR_MIN_CHARS) none++;
  }
  if (doc !== V.doc) return;
  V.scan = none * 2 > look.length;
  ocrBar();
}

// The bar at the top of the paper: the notice, or how it's going.
function ocrBar() {
  const bar = $('#vOcr');
  if (!bar) return;
  const busy = !!OCR.file, here = busy && V.file && V.file.id === OCR.file.id;
  const offer = !busy && V.scan && V.file && !OCR_NO.has(V.file.id) && !$('#viewer').hidden && !SPLIT.n;
  bar.hidden = !(busy || offer) || $('#viewer').hidden;
  bar.classList.toggle('busy', busy);
  if (bar.hidden) return;
  const msg = bar.querySelector('.v-ocr-msg'), go = $('#vOcrGo'), x = $('#vOcrX'), fill = bar.querySelector('.v-ocr-fill');
  if (!busy) {
    msg.textContent = 'This PDF is a scan: it has no text to search or select.';
    go.hidden = false; go.textContent = 'Make searchable';
    x.hidden = false;
    fill.style.width = '0';
    return;
  }
  const whose = here ? '' : ' \u201c' + ((OCR.entry && OCR.entry.f.title) || OCR.file.n) + '\u201d';
  let text, part;
  if (OCR.phase === 'load') { text = 'Getting the OCR tool (once)\u2026'; part = OCR.load; }
  else if (OCR.phase === 'save') { text = 'Adding the text' + (whose ? ' to' + whose : '') + ' and saving\u2026'; part = 1; }
  else if (OCR.phase === 'read') {
    text = (OCR.stop ? 'Stopping\u2026 ' : 'Making' + (whose || ' it') + ' searchable: ') + 'page ' + Math.min(OCR.at + 1, OCR.pages.length) + ' of ' + OCR.pages.length;
    part = OCR.at / Math.max(1, OCR.pages.length);
  } else { text = 'Looking for pages without text\u2026'; part = 0; }
  msg.textContent = text;
  go.hidden = OCR.phase !== 'read' || OCR.stop;
  go.textContent = 'Stop';
  x.hidden = true;
  fill.style.width = Math.round(Math.max(0, Math.min(1, part)) * 100) + '%';
}
$('#vOcrGo').addEventListener('click', () => {
  if (OCR.file) { OCR.stop = true; ocrBar(); return; }
  makeSearchable();
});
$('#vOcrX').addEventListener('click', () => {
  if (!V.file) return;
  OCR_NO.add(V.file.id);
  store.set('ocrNo', [...OCR_NO].slice(-300));
  ocrBar();
});
$('#vFindOcr').addEventListener('click', () => { $('#vFindOcr').hidden = true; makeSearchable(); });

// Make the open paper searchable.
async function makeSearchable() {
  if (OCR.file) { toast(V.file && OCR.file.id === V.file.id ? 'This paper is being made searchable already.' : 'Another paper is being made searchable: one at a time.', 3500); return; }
  if (!V.doc || !V.file || !V.bytes) return;
  if (!gs) { toast('Making a paper searchable needs Google Drive, to save it.', 4000); return; }
  if (!navigator.onLine) { toast('Making a paper searchable needs an internet connection.', 4000); return; }
  const file = V.file, entry = V.entry;
  Object.assign(OCR, { file, entry, pages: [], at: 0, phase: 'find', load: 0, stop: false, found: new Map() });
  ocrBar();
  let own = null, saved = false;
  try {
    // (Its own copy of the paper, so it goes on if you switch papers.)
    own = await openPdf(V.lib, { data: V.bytes.slice(0) }).promise;
    OCR.pages = await textlessPages(own);
    if (!OCR.pages.length) { toast('Every page of this paper has text already.', 3500); return; }
    OCR.phase = 'load';
    ocrBar();
    const worker = await ocrWorker();
    OCR.phase = 'read';
    for (OCR.at = 0; OCR.at < OCR.pages.length && !OCR.stop; OCR.at++) {
      ocrBar();
      const n = OCR.pages[OCR.at];
      OCR.found.set(n, await ocrPage(own, n, worker));
    }
    ocrBar();
    closePdf(own); own = null;
    const words = [...OCR.found.values()].reduce((k, lines) => k + lines.reduce((j, l) => j + l.length, 0), 0);
    if (!words) { toast(OCR.stop ? 'Stopped before any text was found.' : 'No text was found on the pages without it.', 4000); return; }
    OCR.phase = 'save';
    ocrBar();
    await ocrSave(file, OCR.found);
    saved = true;
    const read = OCR.found.size;
    toast(OCR.stop && read < OCR.pages.length
      ? 'Stopped: the ' + read + ' page' + (read === 1 ? '' : 's') + ' read so far can be searched now. Make searchable again does the rest.'
      : '\u201c' + ((entry && entry.f.title) || file.n) + '\u201d can be searched now (' + read + ' page' + (read === 1 ? '' : 's') + ' read). OCR can get some words wrong.', 6000);
  } catch (err) {
    console.warn('OCR:', err);
    const found = OCR.found;
    const again = found && found.size && OCR.phase === 'save' ? () => retrySave(file, entry, found) : null;
    if (V.file && V.file.id === file.id && !$('#viewer').hidden) {
      vStatus('Couldn\u2019t make the paper searchable: ' + errText(err), true,
        again ? [['Try again', again], ['Not now', null]] : [['OK', null]]);
    } else toast('Couldn\u2019t make \u201c' + ((entry && entry.f.title) || file.n) + '\u201d searchable: ' + errText(err), 6000);
  } finally {
    if (own) closePdf(own);
    Object.assign(OCR, { file: null, entry: null, phase: '', found: null, stop: false });
    if (saved) V.scan = false;
    ocrWorkerDone();
    ocrBar();
  }
}
async function retrySave(file, entry, found) {
  Object.assign(OCR, { file, entry, phase: 'save', found });
  ocrBar();
  try {
    await ocrSave(file, found);
    V.scan = false;
    toast('\u201c' + ((entry && entry.f.title) || file.n) + '\u201d can be searched now.', 4000);
  } catch (err) {
    vStatus('Couldn\u2019t make the paper searchable: ' + errText(err), true, [['Try again', () => retrySave(file, entry, found)], ['Not now', null]]);
  } finally {
    Object.assign(OCR, { file: null, entry: null, phase: '', found: null });
    ocrBar();
  }
}

// One page read: its lines, each a list of words {text, box: [x0, y0, x1,
// y1], base: [y at x0, y at x1], em}, in PDF coordinates (see ocrLayer).
async function ocrPage(doc, n, worker) {
  const page = await doc.getPage(n);
  const one = page.getViewport({ scale: 1 });
  // About 300 dpi, which Tesseract reads best, but no bigger than a
  // phone or iPad can easily hold.
  const most = coarseMQ.matches ? 2400 : 3400;
  const scale = Math.min(300 / 72, most / Math.max(one.width, one.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  try {
    // (Without the marks on it: just the page.)
    await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp, background: 'white', annotationMode: V.lib.AnnotationMode.DISABLE }).promise;
    const { data } = await worker.recognize(c, {}, { text: false, blocks: true });
    return ocrLines(data, vp);
  } finally {
    c.width = c.height = 0;
    page.cleanup();
  }
}
// Tesseract's words, in the page's own coordinates. Each word's place on
// the page is given by where its baseline starts and ends and how tall its
// letters are, so a word on a page turned sideways is placed right too.
function ocrLines(data, vp) {
  const lines = [];
  for (const b of (data && data.blocks) || []) {
    for (const p of b.paragraphs || []) {
      for (const l of p.lines || []) {
        const bl = l.baseline && l.baseline.has_baseline !== false ? l.baseline : null;
        const lb = l.bbox;
        const baseAt = x => bl && bl.x1 !== bl.x0 ? bl.y0 + (bl.y1 - bl.y0) * (x - bl.x0) / (bl.x1 - bl.x0) : lb.y1 - (lb.y1 - lb.y0) * 0.2;
        const words = [];
        for (const w of l.words || []) {
          const text = (w.text || '').normalize('NFKC').trim();
          // (Tesseract's guesses at a smudge or a picture are left out.)
          if (!text || w.confidence < 20) continue;
          const y0 = baseAt(w.bbox.x0), y1 = baseAt(w.bbox.x1);
          // Letters are about three-quarters of the font's size above the
          // baseline: from the line's top.
          const lineH = Math.max(1, lb.y1 - lb.y0);
          const em = Math.max(lineH * 0.6, Math.min(lineH * 1.5, (Math.min(y0, y1) - lb.y0) / 0.75));
          const pt = (x, y) => vp.convertToPdfPoint(x, y);
          words.push({ text, start: pt(w.bbox.x0, y0), end: pt(w.bbox.x1, y1), up: pt(w.bbox.x0, y0 - em) });
        }
        if (words.length) lines.push(words);
      }
    }
  }
  return lines;
}

// The PDF with the words written in as invisible text, page by page.
async function ocrLayer(bytes, found) {
  const { StandardFonts, TextRenderingMode, beginText, endText, setFontAndSize, setTextMatrix, setTextRenderingMode, showText } = await loadPdfLib();
  const doc = await pdfLibOpen(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // (Helvetica has the Latin letters; others are left out of the text.)
  const can = new Set(font.getCharacterSet());
  const keep = s => [...s].filter(ch => can.has(ch.codePointAt(0))).join('');
  const pages = doc.getPages();
  for (const [n, lines] of found) {
    const page = pages[n - 1];
    if (!page || !lines.length) continue;
    const key = page.node.newFontDictionary(font.name, font.ref);
    const ops = [beginText(), setFontAndSize(key, 1), setTextRenderingMode(TextRenderingMode.Invisible)];
    for (const words of lines) {
      words.forEach((w, i) => {
        const text = keep(w.text);
        const wide = text ? font.widthOfTextAtSize(text, 1) : 0;
        if (!wide) return;
        // Text space to the page: along the baseline, the word's width;
        // up, the letters' size. (A space after each word but the line's
        // last, so the words come apart when copied.)
        const [x0, y0] = w.start, [x1, y1] = w.end, [ux, uy] = w.up;
        ops.push(setTextMatrix((x1 - x0) / wide, (y1 - y0) / wide, ux - x0, uy - y0, x0, y0),
          showText(font.encodeText(i < words.length - 1 ? text + ' ' : text)));
      });
    }
    ops.push(endText());
    page.pushOperators(...ops);
  }
  return doc.save();
}

// Saved to Drive: written into the PDF as it is there now (with any marks
// made meanwhile saved first), uploaded, and the paper opened again with it
// if it's open (rewritePdf); if it's been closed, into the one on Drive.
async function ocrSave(file, found) {
  if (V.file && V.file.id === file.id && V.doc) { await rewritePdf(file, bytes => ocrLayer(bytes, found)); return; }
  // (Its marks were saved on leaving it, unless offline.)
  const kept = await JOURNAL.load(file.id).catch(() => null);
  if (kept && kept.bytes) throw new Error('it has marks kept on this device that haven\u2019t reached Google Drive yet. Open it while online, then try again.');
  const md5 = await pdfMd5(file).catch(() => null);
  if (md5 && recentMd5.get(file.id) !== md5) recentPdfs.delete(file.id);
  const out = await ocrLayer(await getPdfBytes(file), found);
  const now = await pdfMd5(file).catch(() => null);
  if (md5 && now && now !== md5) throw new Error('the PDF changed on Google Drive meanwhile.');
  await callServer('backupPdf', file.id);
  const newMd5 = await uploadMarked(file, out);
  recentPdfs.delete(file.id); recentPdfs.set(file.id, out); trimRecentPdfs();
  if (newMd5) recentMd5.set(file.id, newMd5); else recentMd5.delete(file.id);
  THUMBS.delete(file.id);
}
