// LibLande: the PDF reader: pages, marks, tools, saving, the sidebar.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/reader.js'] = '2026-10-25.04';
/* ------------------------------------------------------------ PDF reader */
// The reader downloads a paper straight from Google Drive and shows it with
// PDF.js 5 (the viewer inside Firefox), which draws highlights, pen marks and
// notes stored in the PDF and can add new ones. PDF.js loads the first time
// a paper is opened.
const PDFJS = './vendor/pdf.js/6.4.299/';
// PDF.js's decoders for images in some scans (JBIG2, JPEG 2000), character
// maps and standard fonts: npm's package (the site's own copy on Pages).
// Full addresses: the worker, started from a copy, can't follow a relative one.
const PDFJS_DATA = new URL('./vendor/pdf.js/6.4.299/', location.href).href;
let pdfjsReady = null, viewerReady = null;
// Whether a mark is selected (PDF.js 6 keeps this on the mark itself).
const isPicked = ed => !!ed && (V.ui && V.ui.isSelected ? V.ui.isSelected(ed) : !!ed.isSelected);
// A document closed: in PDF.js 6, through the task that opened it.
function closePdf(d) {
  if (!d) return undefined;
  return d.loadingTask ? d.loadingTask.destroy() : d.destroy();
}
// Every PDF opened with the one worker, handed over: then closing a paper
// leaves it running. (Left to PDF.js, a paper's task shares the worker and
// takes it down on closing; a paper opened meanwhile, as one is on a slow
// iPhone, fails: "the worker is being destroyed".)
let PDF_WORKER = null;
// (Fonts keep their names, as "Times-Italic": Quote tells italic and bold
// by them.)
const openPdf = (lib, params) => lib.getDocument(Object.assign({ fontExtraProperties: true, wasmUrl: PDFJS_DATA + 'wasm/',
  cMapUrl: PDFJS_DATA + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS_DATA + 'standard_fonts/' }, params, PDF_WORKER ? { worker: PDF_WORKER } : {}));
// PDF.js 6's search uses RegExp.escape, new in Safari 18.2: without it
// (an iPhone on an older iOS), searching a paper finds nothing. The
// characters that mean something in a pattern, escaped (also valid with
// the u flag, which PDF.js uses).
if (typeof RegExp.escape !== 'function') {
  RegExp.escape = s => String(s).replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}
// PDF.js 6 reads a page's text (for searching a paper) with "for await"
// over a stream, which some Safari versions can't do: then every search
// in a paper was "Not found" on an iPhone. Here, and in PDF.js's worker,
// streams are made to work that way when they don't already.
function addStreamIteration() {
  const RS = self.ReadableStream;
  if (!RS || RS.prototype[Symbol.asyncIterator]) return;
  RS.prototype.values = RS.prototype.values || function ({ preventCancel = false } = {}) {
    const reader = this.getReader();
    return {
      next: () => reader.read(),
      async return(value) {
        if (!preventCancel) { const p = reader.cancel(value); reader.releaseLock(); await p; } else reader.releaseLock();
        return { done: true, value };
      },
      [Symbol.asyncIterator]() { return this; },
    };
  };
  RS.prototype[Symbol.asyncIterator] = RS.prototype.values;
}
addStreamIteration();
// PDF.js itself, with fixes to its drawing (the pen and the freehand
// highlighter, which share one drawing under way):
// - A second touch (a palm, another finger) just as a stroke ends finds the
//   stroke already gone, and PDF.js 6 throws "null is not an object
//   (evaluating 'DrawingEditor.#sl.isCancellable')": a stroke that's gone
//   is skipped.
// - PDF.js hears a stroke's end (the lift) on the window, last, and on the
//   page's layer: one of LibLande's own handlers that stops the lift (a
//   drawing moved with a long press, say) left the stroke "under way". The
//   layer then ignored the next stroke; PDF.js refused strokes of the other
//   kind (it took the Pencil for a palm); and a pen stroke after a freehand
//   highlight threw "DrawingEditor.#sl.startNew is not a function". So
//   PDF.js hears the lift first (on the window, capturing); the layer only
//   ignores a press while something else is really touching the screen
//   (POINTERS_DOWN); and a new stroke with nothing else touching the screen
//   starts afresh, the stale one's listeners, drawing and pointer kind
//   cleared.
// Loaded as it is if a later PDF.js doesn't have that code, or the copy
// can't be made.
const POINTERS_DOWN = new Map();
window.addEventListener('pointerdown', ev => { POINTERS_DOWN.set(ev.pointerId, Date.now()); }, true);
['pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, ev => { POINTERS_DOWN.delete(ev.pointerId); }, true));
// (Anything else touching the screen? One down over a minute ago without
// a lift counts as lifted: iPadOS doesn't always say.)
window.__llOthersDown = id => { const now = Date.now(); for (const [p, t] of POINTERS_DOWN) if (p !== id && now - t < 60000) return true; return false; };
function pdfJsFix(src) {
  let out = src.replace(/if\((\w+)\.#(\w+)\.isCancellable\(\)\)\{\1\.#\2\./g, 'if($1.#$2?.isCancellable()){$1.#$2.');
  out = out.replace(/(window\.addEventListener\("pointer(?:up|cancel)",(\w+)=>\{CurrentPointers\.isSamePointerIdOrRemove\(\2\.pointerId\)&&this\._endDraw(?:ingSession\(\)|\(\2\))\},\{signal:\w+)\}/g, '$1,capture:!0}');
  out = out.replace(/(pointerdown\((\w+)\)\{this\.#\w+\.getMode\(\)===\w+\.HIGHLIGHT&&this\.enableTextSelection\(\);)if\(this\.#(\w+)\)\{this\.#\3=!1;return\}/,
    '$1if(this.#$3&&globalThis.__llOthersDown&&!globalThis.__llOthersDown($2.pointerId))this.#$3=!1;if(this.#$3){this.#$3=!1;return}');
  // The drawing's private fields, by what they hold (named differently in each build).
  const clean = /static _cleanup\(\w+\)\{if\(\w+\)\{this\._currentDrawId=-1;this\._currentParent=null;(\w+)\.#(\w+)=null;\1\.#(\w+)=null;\1\.#(\w+)=null;[^}]*\}if\(\1\.#(\w+)\)\{/.exec(out);
  const start = /static startDrawing\((\w+),(\w+),(\w+),(\w+)\)\{/.exec(out);
  if (clean && start && /CurrentPointers\.clearPointerType\(\)/.test(out)) {
    const [, C, sl, al, ol, rl] = clean, ev = start[4];
    const fresh = `if(!globalThis.__llOthersDown||!globalThis.__llOthersDown(${ev}.pointerId)){if(${C}.#${rl}){${C}.#${rl}.abort();${C}.#${rl}=null}CurrentPointers.clearPointerIds();CurrentPointers.clearPointerType();const _ll=${C}.#${sl};if(_ll&&(typeof _ll.startNew!=="function"||!this._currentParent)){${C}.#${sl}=null;${C}.#${al}=null;${C}.#${ol}=null}}`;
    out = out.slice(0, start.index + start[0].length) + fresh + out.slice(start.index + start[0].length);
  }
  return out;
}
// And the page viewer, with a fix: in Safari (and older Chrome), PDF.js
// tidies every text selection on the page, and one that ends at the very
// start of something outside the paper (a click on Light, in the sidebar,
// say) sent it up past the top of the page: "null is not an object
// (evaluating 'anchor.previousSibling')". It stops at the top now.
function pdfViewerFix(src) {
  return src.replace(/while \(!(\w+)\.previousSibling\) \{\s*\1 = \1\.parentNode;\s*\}/, 'while (!$1.previousSibling) { $1 = $1.parentNode; if (!$1) return; }');
}
async function importPdfViewer() {
  try {
    const r = await fetch(PDFJS + 'pdf_viewer.mjs');
    if (r.ok) {
      const src = await r.text(), fixed = pdfViewerFix(src);
      if (fixed !== src) {
        const url = URL.createObjectURL(new Blob([fixed], { type: 'text/javascript' }));
        try { return await import(url); } finally { URL.revokeObjectURL(url); }
      }
    }
  } catch (err) { console.warn(err); }
  return import(PDFJS + 'pdf_viewer.mjs');
}
async function importPdfJs() {
  try {
    const r = await fetch(PDFJS + 'pdf.min.mjs');
    if (r.ok) {
      const src = await r.text(), fixed = pdfJsFix(src);
      if (fixed !== src) {
        const url = URL.createObjectURL(new Blob([fixed], { type: 'text/javascript' }));
        try { return await import(url); } finally { URL.revokeObjectURL(url); }
      }
    }
  } catch (err) { console.warn(err); }
  return import(PDFJS + 'pdf.min.mjs');
}
function loadPdfJs() {
  if (!pdfjsReady) {
    pdfjsReady = (async () => {
      const lib = await importPdfJs();
      // A worker from another site isn't allowed, so start it from a copy.
      const r = await fetch(PDFJS + 'pdf.worker.min.mjs');
      if (!r.ok) throw new Error('worker ' + r.status);
      const url = URL.createObjectURL(new Blob(['(' + addStreamIteration + ')();\n', await r.text()], { type: 'text/javascript' }));
      lib.GlobalWorkerOptions.workerPort = new Worker(url, { type: 'module' });
      PDF_WORKER = new lib.PDFWorker({ port: lib.GlobalWorkerOptions.workerPort });
      globalThis.pdfjsLib = lib;
      return lib;
    })().catch(err => {
      pdfjsReady = null;
      console.warn(err);
      throw new Error('The PDF reader couldn\u2019t load. Check your internet connection and try again.');
    });
  }
  return pdfjsReady;
}
// The page viewer and its editing tools. Its stylesheet is loaded as text
// so its one rule for a ".sidebar" (a PDF.js panel) can be renamed, and its
// icons still load from cdnjs.
function loadPdfViewer() {
  if (!viewerReady) {
    viewerReady = (async () => {
      const lib = await loadPdfJs();
      const [css, viewerLib] = await Promise.all([
        // Not the .min.css: its minifier joins some selectors together
        // (":is(.a .b) canvas" becomes ":is(.a.b)canvas"), which breaks page sizing.
        fetch(PDFJS + 'pdf_viewer.css').then(r => (r.ok ? r.text() : '')),
        importPdfViewer(),
      ]);
      const style = document.createElement('style');
      style.textContent = css.replace(/\.sidebar(?![\w-])/g, '.pdfjs-sidebar').replace(/url\((['"]?)images[/]/g, 'url($1' + PDFJS + 'images/');
      document.head.appendChild(style);
      return { lib, viewerLib };
    })().catch(err => {
      viewerReady = null;
      throw err;
    });
  }
  return viewerReady;
}

// Downloads use the same kind of short-lived token as the library download.
let tokenCache = null;
// On GitHub Pages: the PDFs of the papers Up next on your reading list,
// and of the publications added most recently (in the inbox too), are
// downloaded ahead, once each, so they open with no
// connection too (sw.js keeps them, with the papers you've opened). A
// little after LibLande opens, and again whenever it comes back to the
// screen or online, or the library or reading list changes: an app kept on the home
// screen is mostly resumed, not opened afresh, and a run stops when
// LibLande goes to the background. Only with a token already in hand
// (never asking you to sign in for it), and one paper at a time.
const AHEAD = 10;
let aheadRun = null, aheadTimer = 0;
function fetchAheadSoon(ms) { clearTimeout(aheadTimer); aheadTimer = setTimeout(fetchAhead, ms == null ? 3000 : ms); }
function fetchAhead() {
  if (!aheadRun) aheadRun = fetchAheadNow().catch(() => {}).then(() => { aheadRun = null; refreshSavedSoon(500); });
  return aheadRun;
}
async function fetchAheadNow() {
  if (!window.LIBLANDE_PAGES || !window.caches || !navigator.onLine || !ENTRIES.length) return;
  const next = readingOrder().filter(x => x.list === 'next').map(x => BYKEY.get(x.key));
  const newest = ENTRIES.slice().sort((a, b) => cmpStr(b.added || '', a.added || '')).filter(e => readablePdfs(e).length).slice(0, AHEAD);
  const list = [...new Set(next.concat(newest))].filter(e => e && readablePdfs(e).length);
  const kept = await caches.open('liblande-papers');
  for (const e of list) {
    const f = readablePdfs(e)[0], url = 'https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id) + '?alt=media';
    if (await kept.match(url)) continue;
    if (!navigator.onLine || document.hidden || !tokenCache || Date.now() - tokenCache.at > 50 * 60 * 1000) return;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tokenCache.token } });
    if (!r.ok) return;
    const bytes = await r.arrayBuffer();
    // (Kept by sw.js on its way here; here, if it isn't running yet.)
    if (!(navigator.serviceWorker && navigator.serviceWorker.controller)) {
      await kept.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } }));
    }
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchAheadSoon(); });
window.addEventListener('online', () => fetchAheadSoon(5000));
async function driveToken(fresh) {
  if (!fresh && tokenCache && Date.now() - tokenCache.at < 30 * 60 * 1000) return tokenCache.token;
  let token;
  try {
    token = await callServer('getToken');
  } catch (err) {
    // An older Code.gs has no getToken; the library download's token works too.
    token = (await callServer('getLibraryInfo')).token;
  }
  tokenCache = { token, at: Date.now() };
  return tokenCache.token;
}

// How many pages a PDF has (for the reading list's Length): from a copy
// at hand (in memory, or kept on this device for reading offline), or else
// from Drive just the pieces of the file that say so, a part at a time,
// as PDF.js asks for them (not the whole file).
async function countPdfPages(fl) {
  const lib = await loadPdfJs(), id = fl.id;
  let bytes = recentPdfs.get(id) || null;
  if (!bytes && window.caches) {
    const kept = await caches.match('https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media').catch(() => null);
    if (kept) bytes = new Uint8Array(await kept.arrayBuffer());
  }
  let task;
  if (bytes) task = openPdf(lib, { data: bytes.slice(0) });
  else {
    const url = 'https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(id);
    const auth = async () => ({ Authorization: 'Bearer ' + await driveToken() });
    const meta = await fetch(url + '?fields=size', { headers: await auth() });
    if (!meta.ok) throw new Error('Drive answered ' + meta.status);
    const size = +(await meta.json()).size;
    if (!size) throw new Error('no size');
    const part = async (a, b) => {
      const r = await fetch(url + '?alt=media', { headers: Object.assign(await auth(), { Range: 'bytes=' + a + '-' + (b - 1) }) });
      if (!r.ok) throw new Error('Drive answered ' + r.status);
      return new Uint8Array(await r.arrayBuffer());
    };
    const CHUNK = 65536, tr = new lib.PDFDataRangeTransport(size, await part(0, Math.min(size, CHUNK)));
    tr.requestDataRange = (a, b) => { part(a, b).then(d => tr.onDataRange(a, d)).catch(() => tr.abort && tr.abort()); };
    task = openPdf(lib, { range: tr, length: size, rangeChunkSize: CHUNK, disableAutoFetch: true, disableStream: true });
  }
  try { return (await task.promise).numPages; } finally { task.destroy(); }
}

// The last few papers opened, kept in memory so reopening or sharing is instant.
const recentPdfs = new Map(), recentMd5 = new Map();
// The PDFs kept in memory, to open again at once: the last three, or fewer
// if they're big (a scanned book can be 30 MB), no more than 60 MB in all
// (but always the last one).
function trimRecentPdfs() {
  let total = 0;
  for (const b of recentPdfs.values()) total += b ? b.byteLength : 0;
  while (recentPdfs.size > 1 && (recentPdfs.size > 3 || total > 60e6)) {
    const k = recentPdfs.keys().next().value, b = recentPdfs.get(k);
    total -= b ? b.byteLength : 0;
    recentPdfs.delete(k); recentMd5.delete(k);
  }
}
async function getPdfBytes(file, onProgress) {
  if (recentPdfs.has(file.id)) return recentPdfs.get(file.id);
  const url = 'https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media';
  let r = await fetch(url, { headers: { Authorization: 'Bearer ' + await driveToken() } });
  if (r.status === 401) r = await fetch(url, { headers: { Authorization: 'Bearer ' + await driveToken(true) } });
  if (!r.ok) {
    throw new Error(r.status === 404
      ? 'Google Drive can\u2019t find this file any more. It may have been moved or deleted.'
      : 'Google Drive didn\u2019t send the file (error ' + r.status + ').');
  }
  let bytes;
  const total = Number(r.headers.get('Content-Length')) || 0;
  if (r.body && total && onProgress) {
    const reader = r.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      onProgress(got / total);
    }
    bytes = new Uint8Array(got);
    let at = 0;
    for (const p of parts) { bytes.set(p, at); at += p.length; }
  } else {
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  recentPdfs.set(file.id, bytes);
  refreshSavedSoon();
  trimRecentPdfs();
  return bytes;
}

// "Share to...": the share sheet on iPhone and iPad (PDF Expert, Files,
// Books...), a download on a computer.
// Sent to another app: the share sheet (on a touch screen; for a PDF, on
// a computer too, where the browser has one), or else downloaded. With
// mail ({ subject, text }): the citation with it, as a message's text (in
// Mail, say), and the title as its subject; without a share sheet, the
// file downloaded and the citation copied. With mail 'download': just
// downloaded.
// (refused: what to do if the share sheet won't open, too long after the
// click that asked for it.)
function openIn(bytes, name, type, downloadNote, mail, refused) {
  const file = new File([bytes], name, { type: type || 'application/pdf' });
  const saveCopy = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(downloadNote || 'Downloading ' + name + '. If nothing happens, use Google Drive and its Open in menu.', 5000);
  };
  if (mail === 'download') { saveCopy(); return; }
  const mailNoSheet = () => {
    saveCopy();
    if (navigator.clipboard) navigator.clipboard.writeText(mail.text).then(() => toast('Downloading ' + name + '; its citation is copied.', 5000)).catch(() => {});
  };
  const canShare = (coarseMQ.matches || !type || mail) && navigator.canShare && navigator.canShare({ files: [file] });
  if (!canShare) { if (mail) mailNoSheet(); else saveCopy(); return; }
  navigator.share(mail ? { files: [file], title: mail.subject, text: mail.text } : { files: [file] }).catch(err => {
    if (err && err.name === 'AbortError') return;
    if (err && err.name === 'NotAllowedError' && refused) { refused(); return; }
    if (mail) mailNoSheet(); else saveCopy();
  });
}

const V = { token: 0, lib: null, viewer: null, bus: null, link: null, doc: null, file: null, entry: null, bytes: null, md5: null,
  dirty: false, drawing: false, saving: null, tool: 'read', selected: false, canUndo: false, canRedo: false, pencil: false };
const PEN_COLORS = [['Black', '#1b1b1b'], ['Red', '#d92d20'], ['Blue', '#1f5fd6'], ['Green', '#138a4b'], ['Orange', '#e8780c']];
const HL_COLORS = [['Yellow', '#FFFF98'], ['Green', '#53FFBC'], ['Blue', '#80EBFF'], ['Pink', '#FFCBE6'], ['Red', '#FF4F5F']];
const PEN_SIZES = [1, 2, 4];
const MARK = {
  penColor: store.get('penColor', PEN_COLORS[0][1]),
  penSize: store.get('penSize', 2),
  hlColor: store.get('hlColor', HL_COLORS[0][1]),
  // The highlighter: 'text' highlights the words dragged across, 'free' draws.
  hlMode: store.get('hlMode', 'text'),
  // The markup tool's kind: highlight, free (highlight), underline, strike.
  markKind: store.get('hlMode', 'text') === 'free' ? 'free' : 'highlight',
  // The underline button's kind: underline or strike.
  lineKind: store.get('lineKind', store.get('markKind', '') === 'strike' ? 'strike' : 'underline'),
  lineColor: store.get('lineColor', '#d92d20'),
  textColor: store.get('textColor', PEN_COLORS[0][1]),
  textSize: store.get('textSize', 14),
  // The eraser: 'part' rubs out bits of strokes, 'whole' removes strokes;
  // its radius in screen pixels.
  eraserMode: store.get('eraserMode', 'part'),
  eraserSize: store.get('eraserSize', 12),
};

// Messages over the page, optionally with buttons: [[label, action], ...].
function vStatus(msg, isError, actions) {
  const el = $('#vStatus');
  el.hidden = !msg;
  el.classList.toggle('err', !!isError);
  if (!msg) { el.replaceChildren(); return; }
  el.innerHTML = esc(msg) + (isError && V.file && !actions ? `<br><a href="${esc(driveUrl(V.file))}" target="_blank" rel="noopener">Open it in Google Drive instead</a>` : '') +
    (actions ? `<div class="v-status-acts">` + actions.map((a, i) => `<button type="button" class="btn${i === 0 ? ' primary' : ''}" data-act="${i}">${esc(a[0])}</button>`).join('') + `</div>` : '');
  if (actions) {
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      vStatus('');
      const fn = actions[+b.dataset.act][1];
      if (fn) fn();
    }));
  }
}

async function pdfMd5(file) {
  const url = 'https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?fields=md5Checksum';
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + await driveToken() } });
  if (!r.ok) return null;
  return (await r.json()).md5Checksum || null;
}

function ensureViewer(lib, VL) {
  if (V.viewer) return;
  const bus = new VL.EventBus();
  const link = new VL.PDFLinkService({ eventBus: bus, externalLinkTarget: VL.LinkTarget ? VL.LinkTarget.BLANK : 2 });
  const findController = new VL.PDFFindController({ linkService: link, eventBus: bus });
  const viewer = new VL.PDFViewer({
    container: $('#vScroll'), viewer: $('#vPages'), eventBus: bus, linkService: link, findController,
    annotationEditorMode: lib.AnnotationEditorType.NONE,
    annotationEditorHighlightColors: HL_COLORS.map(([n, c]) => n.toLowerCase() + '=' + c).join(','),
    // Draw pages with the graphics card, as Firefox's own viewer does (the
    // viewer component defaults to drawing in software).
    enableHWA: true,
    // A page is drawn whole at most this big (the most iOS allows one
    // canvas; bigger ones fail to draw; and on a computer, enough: each is
    // up to 64 MB); zoomed in further, PDF.js draws the part on screen
    // sharply on top.
    maxCanvasPixels: 2 ** 24,
    enableDetailCanvas: true,
    // Our own comment box (PDF.js asks the viewer for one).
    commentManager,
  });
  link.setViewer(viewer);
  bus.on('pagesinit', () => {
    viewer.currentScaleValue = (V.restore && V.restore.scale) || (coarseMQ.matches ? 'page-width' : 'auto');
  });
  // A tab's paper comes back where it was.
  bus.on('pagesloaded', () => {
    const r = V.restore;
    V.restore = null;
    if (r && r.top != null) { const sc = $('#vScroll'); sc.scrollTop = r.top; sc.scrollLeft = r.left || 0; }
  });
  bus.on('scalechanging', e => {
    $('#vZoomLevel').textContent = Math.round(e.scale * 100) + '%';
    zoomLabel(e.presetValue);

  });
  const findCount = (mc, state) => {
    const el = $('#vFindCount');
    const q = $('#vFindInput').value.trim();
    const none = !!q && state === 1;
    el.classList.toggle('none', none);
    el.textContent = !q ? '' : none ? 'Not found' : mc && mc.total ? (mc.current || 1) + ' of ' + mc.total + (mc.total >= 1000 ? '+' : '') : state === 3 ? 'Searching\u2026' : '';
    // (Nothing found in a scan: it has no text to find, until it's made
    // searchable.)
    $('#vFindOcr').hidden = !(none && V.scan && !OCR.file);
  };
  bus.on('updatefindmatchescount', e => findCount(e.matchesCount));
  bus.on('updatefindcontrolstate', e => { findCount(e.matchesCount, e.state); revealFindMatch(); });
  bus.on('pagechanging', e => {
    $('#vPage').textContent = e.pageNumber + ' / ' + viewer.pagesCount;
    markCurrentThumb(true);
    railSoon();
    if (RAIL.lastPage && e.pageNumber !== RAIL.lastPage) showPagePill(e.pageNumber, viewer.pagesCount);
    RAIL.lastPage = e.pageNumber;
    noteProgress(e.pageNumber, viewer.pagesCount);
    notePosition(e.pageNumber);
  });
  bus.on('pagerendered', e => { if (SPLIT.n === e.pageNumber) splitLine(); });
  bus.on('pagesloaded', e => {
    $('#vPage').textContent = viewer.currentPageNumber + ' / ' + e.pagesCount; RAIL.lastPage = viewer.currentPageNumber; railSoon();
    V.endPage = 0;
    endPageFor(V.doc, V.file).catch(err => console.warn('Where the references start:', err));
    ocrNotice(V.doc, V.file).catch(err => console.warn('Is it a scan:', err));
    highlighterFor(V.doc, V.file).catch(() => {});
  });
  bus.on('scalechanging', () => railSoon());
  // (PDF.js 6 calls it editingstateschanged; 5, annotationeditorstateschanged.)
  const onEditingStates = e => {
    if (e.details && e.details.hasSelectedEditor) { setTimeout(toolbarAtTap, 0); setTimeout(toolbarAtTap, 120); }
    const d = e.details || {};
    V.selected = !!d.hasSelectedEditor; V.canUndo = !!d.hasSomethingToUndo; V.canRedo = !!d.hasSomethingToRedo;
    refreshAllPins();
    // PDF.js selects a highlight as soon as it's made; show just the
    // highlight instead. (Clicking an existing one still selects it.)
    // Nothing is picked up while the eraser is on (a pen stroke PDF.js
    // finishes just after the switch comes selected).
    if (d.hasSelectedEditor && V.tool === 'eraser' && V.ui) setTimeout(() => { if (V.tool === 'eraser' && V.ui) V.ui.unselectAll(); }, 0);
    if (d.hasSelectedEditor && V.newHighlight && V.ui) {
      V.newHighlight = false;
      setTimeout(() => { if (V.ui) V.ui.unselectAll(); }, 0);
    }
    paletteState();
  };
  bus.on('annotationeditorstateschanged', onEditingStates);
  bus.on('editingstateschanged', onEditingStates);
  bus.on('annotationeditormodechanged', () => { applyMarkParams(); refreshAllPins(); });
  // When nothing is being drawn, draw the next few pages ahead too, so
  // they're ready before they scroll into view.
  bus.on('pagerendered', e => { clearTimeout(V.aheadTimer); V.aheadTimer = setTimeout(drawAhead, 150); refreshPins(e.pageNumber); ribbonFor(e.pageNumber); });
  bus.on('annotationlayerrendered', e => { sectionLines(e.pageNumber); decorateLines(); });
  bus.on('annotationeditoruimanager', e => { V.ui = e.uiManager; watchChanges(V.ui); });
  // A jump to a page (a link, the outline, a bookmark) lands below the bars
  // at the top while they're showing.
  const scrollTo = viewer.scrollPageIntoView.bind(viewer);
  viewer.scrollPageIntoView = params => {
    scrollTo(params);
    if (!$('#viewer').classList.contains('bars-hidden')) $('#vScroll').scrollTop -= topH();
  };
  // A link tapped on the page (not the outline) on a desktop or iPad asks
  // where to show its destination first (see LINKTAP).
  const goTo = link.goToDestination.bind(link);
  link.goTo = goTo;
  link.goToDestination = dest => {
    const tap = LINKTAP.at;
    LINKTAP.at = null;
    if (tap && !phoneMQ.matches) { linkChoice(dest, tap); return Promise.resolve(); }
    return goTo(dest);
  };
  Object.assign(V, { lib, viewer, bus, link, VL });
}

function drawAhead() {
  const v = V.viewer;
  if (!v || !V.doc || !v.renderingQueue || $('#vPages').classList.contains('zooming')) return;
  const n = v.pagesCount, view = i => v.getPageView(i);
  // Not while a page is being drawn. (A page drawn ahead is paused when
  // one on screen needs drawing first, and PDF.js doesn't come back to it
  // once it's off screen: it's picked up again below.)
  for (let i = 0; i < n; i++) {
    if (view(i) && view(i).renderingState === 1) return;
  }
  // Ahead the way you're reading: down the paper, or back up it.
  const cur = v.currentPageNumber - 1, sc = $('#vScroll');
  const d = sc.scrollTop < (drawAhead.top || 0) - 4 ? -1 : 1;
  drawAhead.top = sc.scrollTop;
  // Zoomed in well past the screen's width on a touch screen, just the
  // next page (each is big to draw and to keep in memory).
  const pv0 = view(cur);
  const big = coarseMQ.matches && pv0 && pv0.width > sc.clientWidth * 1.4;
  for (const i of big ? [cur + d] : [cur + d, cur + 2 * d, cur + 3 * d, cur - d]) {
    const pv = i >= 0 && i < n ? view(i) : null;
    if (pv && (pv.renderingState === 0 || pv.renderingState === 2)) { v.renderingQueue.renderView(pv); return; }
  }
}
// (Also once scrolling stops, in case nothing was drawn meanwhile.)
$('#vScroll').addEventListener('scroll', () => { clearTimeout(V.aheadTimer); V.aheadTimer = setTimeout(drawAhead, 250); }, { passive: true });

async function openReader(entry, file, pos) {
  const my = ++V.token;
  TAKEN.clear();
  $('#viewer').classList.remove('bars-hidden');
  V.restore = pos && pos.top != null ? pos : null;
  if (SPLIT.n && !SPLIT.busy) splitEnd();
  Object.assign(V, { entry, file, bytes: null, md5: null, stale: null, scan: false, dirty: false, drawing: false, selected: false, canUndo: false, canRedo: false, pageLabels: undefined, quotePages: null, quoteFonts: null });
  hideQuote();
  $('#vTitle').textContent = entry.f.title || file.n;
  $('#vDrive').href = driveUrl(file);
  syncReaderRL();
  $('#vPage').textContent = '';
  $('#vFind').hidden = true;
  $('#vFindBtn').setAttribute('aria-pressed', 'false');
  $('#vFindCount').textContent = '';
  $('#viewer').hidden = false;
  resetSide();
  clearBack();
  resetBookmarks();
  autoReset();
  V.savedSinceOpen = false;
  toggleSide(!sidePhone() && store.get('readerSide', false));
  showPalette();
  setTool('read');
  saveUI();
  $('#vClose').focus();
  vStatus('Downloading the paper\u2026');
  try {
    const [{ lib, viewerLib }, md5] = await Promise.all([loadPdfViewer(), gs ? pdfMd5(file).catch(() => null) : null]);
    if (md5 && recentMd5.get(file.id) !== md5) recentPdfs.delete(file.id);
    const bytes = await getPdfBytes(file, f => { if (my === V.token) vStatus('Downloading the paper\u2026 ' + Math.round(f * 100) + '%'); });
    if (md5) recentMd5.set(file.id, md5);
    if (my !== V.token) return;
    // Changes kept on this device and never uploaded: opened with them,
    // if the PDF on Drive is still the one they were made to (or you said
    // to use them anyway); otherwise you're asked.
    let kept = null, clash = null;
    if (gs) {
      const j = await JOURNAL.load(file.id).catch(() => null);
      if (my !== V.token) return;
      if (j && j.bytes) {
        if (!md5 || j.base === md5 || JOURNAL_USE.has(file.id)) kept = j;
        else clash = j;
      }
      JOURNAL_USE.delete(file.id);
    }
    let data = kept ? new Uint8Array(kept.bytes) : bytes;
    vStatus('Opening\u2026');
    // PDF.js takes over the buffer it's given, so hand it a copy.
    let doc = await openPdf(lib, { data: data.slice(0), enableHWA: true }).promise;
    if (my !== V.token) { closePdf(doc); return; }
    // September's underlines and strike-throughs made real (see
    // oldLineMarks): the paper opened again, with them. (Not in the tests,
    // unless one asks: a test paper has a stroke like them.)
    let oldLines = 0;
    const seenKey = file.id + ':' + (md5 || data.length);
    if (gs && !kept && !OLD_LINES_SEEN.has(seenKey) && (!window.LIBLANDE_TEST || window.LIBLANDE_OLD_LINES) && mayHaveOldLines(data)) {
      try {
        const found = await oldLineMarks(doc);
        if (found.length) {
          const r = await convertOldLines(data, found);
          if (r.n && my === V.token) {
            // (The new one opened before the first is closed, as when
            // switching papers: they share PDF.js's worker.)
            const next = await openPdf(lib, { data: r.bytes.slice(0), enableHWA: true }).promise;
            closePdf(doc);
            doc = next; data = r.bytes; oldLines = r.n;
          }
        }
      } catch (err) { console.warn('Old underlines:', err); }
      if (my !== V.token) { closePdf(doc); return; }
      if (!oldLines) { OLD_LINES_SEEN.add(seenKey); store.set('oldLinesSeen', [...OLD_LINES_SEEN].slice(-400)); }
    }
    V.bytes = data; V.md5 = md5; V.openBytes = data;
    ensureViewer(lib, viewerLib);
    // The copy of the paper shown before (as when it's opened again after
    // pages were turned or split): closed once this one is in its place,
    // or it stays in memory, with every page's pictures.
    const before = V.doc !== doc ? V.doc : null;
    V.doc = doc;
    // (PDF.js 6 counts the PDF's own marks as changes when it puts them on
    // a page again, as after an upload: a change that leaves the marks as
    // they were saved isn't one, and the count starts again, so the next
    // real change is noticed.)
    V.savedMarks = storageHash(doc);
    doc.annotationStorage.onSetModified = () => {
      if (doc !== V.doc) return;
      V.dirty = true; saveUI();
      setTimeout(() => {
        if (doc !== V.doc || V.saving || LOCAL.making) return;
        if (storageHash(doc) !== V.savedMarks) return;
        doc.annotationStorage.resetModified();
        V.dirty = false;
        // (Putting them back also counts as a step for Undo, which started
        // the auto-save clock: nothing to upload.)
        if (!V.bmDirty && !V.drawing) { clearTimeout(AUTO.timer); AUTO.first = AUTO.last = 0; }
        saveUI();
      }, 0);
    };
    doc.annotationStorage.onResetModified = () => { if (doc === V.doc && !LOCAL.making) { V.dirty = false; saveUI(); } };
    pinsReset();
    const bmLoaded = loadBookmarks(doc);
    V.viewer.setDocument(doc);
    V.link.setDocument(doc);
    if (before) closePdf(before);
    // (Where you left it on another device: there, once its pages are laid
    // out, after this device's own place for it.)
    const far = elsewhere(file.id);
    if (far) {
      const once = () => {
        V.bus.off('pagesinit', once);
        setTimeout(() => {
          if (V.doc !== doc) return;
          V.viewer.currentPageNumber = Math.min(far.page, doc.numPages);
          toast('Opened at page ' + far.page + ', where you left off on another device', 3500);
        }, 80);
      };
      V.bus.on('pagesinit', once);
    }
    closeLinkMenu(); PEEK.token++; $('#vPeek').hidden = true; peekForget();
    vStatus('');
    if (kept) {
      bmLoaded.then(() => {
        if (doc !== V.doc) return;
        BM.pages = new Set(kept.bm || []);
        V.bmDirty = !sameSet(BM.pages, BM.saved);
        allRibbons();
        V.dirty = true;
        saveUI();
        autoSaveSoon(5000);
      });
      toast('Your marks from ' + new Date(kept.at).toLocaleString() + ' that hadn\u2019t reached Google Drive are back' +
        (navigator.onLine ? ', and are being saved to it.' : ' (kept on this device until you\u2019re online).'), 6000);
    } else if (oldLines) {
      // (To be saved: the paper as it now is, with the real ones.)
      bmLoaded.then(() => {
        if (doc !== V.doc) return;
        V.dirty = true;
        saveUI();
        autoChanged();
      });
      toast(oldLines + (oldLines === 1 ? ' underline or strike-through' : ' underlines and strike-throughs') +
        ' drawn as pen strokes by an earlier LibLande ' + (oldLines === 1 ? 'is' : 'are') + ' now real, as other apps show them. Saved with the paper.', 7000);
    }
    if (clash) {
      vStatus('Marks you made on this device (' + new Date(clash.at).toLocaleString() + ') never reached Google Drive, and the PDF there has changed since.', false,
        [['Use my marks', () => { JOURNAL_USE.add(file.id); openReader(entry, file, spot()); }],
          ['Discard them', () => { forgetKept(file.id).catch(() => {}); vStatus(''); }], ['Decide later', null]]);
    }
    if (sideOpen()) showSideTab(SIDE.tab);
  } catch (err) {
    if (my !== V.token) return;
    // Offline, a request that couldn't be made (the browser's own words for
    // it are no help): said plainly.
    const net = /load failed|failed to fetch|networkerror|respondwith|network connection/i.test(errText(err));
    if (net && isOffline()) {
      vStatus(SAVED.has(file.id) ? 'This paper couldn\u2019t be opened offline: something it needs isn\u2019t on this device yet. Open it once while you\u2019re online, and it will open offline after that.'
        : 'You\u2019re offline, and this paper isn\u2019t saved on this device. Papers are kept here once you\u2019ve opened them while online.', true);
    } else vStatus(errText(err), true);
  }
}

// Closing saves any new markup first; if that fails the paper stays open.
// Save everything now (before switching tabs or leaving the viewer).
async function saveNow() {
  clearTimeout(AUTO.timer);
  for (let i = 0; i < 4 && (V.dirty || V.bmDirty || V.drawing || V.saving); i++) {
    const r = await saveMarkup();
    if (!r || r === 'kept') return r;
  }
  return true;
}
// The reader stays ready for 2 minutes in the library (so going back is
// instant), then is put away (see .dormant); so is it when you switch to
// another app. Shown again, it lays out its pages afresh, at the same
// place (put away, the scroll area forgets where it was).
(() => {
  const v = $('#viewer');
  let timer = 0, was = null;
  const sleep = () => {
    if (!v.hidden || v.classList.contains('dormant')) return;
    was = V.viewer && V.doc ? { at: spot(), file: V.file } : null;
    v.classList.add('dormant');
  };
  new MutationObserver(() => {
    clearTimeout(timer);
    if (v.hidden) timer = setTimeout(sleep, 2 * 60 * 1000);
    else if (v.classList.contains('dormant')) {
      v.classList.remove('dormant');
      const back = was;
      was = null;
      requestAnimationFrame(() => {
        if (v.hidden || !V.viewer || !V.doc) return;
        refit();
        V.viewer.update();
        if (back && back.file === V.file) goSpot(back.at);
      });
    }
  }).observe(v, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { if (document.hidden) sleep(); });
})();
// Back to the library, with the papers left open: at once, saving any
// changes in the background (the paper stays open, so nothing is lost if
// that fails; you're told, and can come back to it).
async function closeReader() {
  hideQuote();
  if ($('#viewer').hidden) return;
  rememberTab();
  hidePanel();
  $('#viewer').hidden = true;
  // (Where you were, kept now: the reading list's Continue card shows it.)
  if (notePosition.t) savePositions();
  renderPaperTabs();
  const r = await saveNow();
  if (!r) toast('Your marks on this paper aren\u2019t saved yet. Open it again to save them.', 6000);
  else keptNote(r);
}
// Close the paper in the front tab (already saved, or given up).
function shutReader() {
  const entry = V.entry, fileId = V.file && V.file.id;
  noteClosed(entry && entry.k, fileId);
  unloadDoc();
  const i = PTABS.list.findIndex(t => t.fileId === fileId);
  if (i >= 0) PTABS.list.splice(i, 1);
  if (PTABS.list.length) {
    PTABS.active = Math.max(0, Math.min(i >= 0 ? i : PTABS.active, PTABS.list.length - 1));
    loadActiveTab();
  } else {
    PTABS.active = -1;
    renderPaperTabs();
    $('#viewer').hidden = true;
  }
}
function unloadDoc() {
  V.token++;
  if (V.doc) {
    const doc = V.doc;
    V.doc = null;
    V.viewer.setDocument(null);
    V.link.setDocument(null);
    closeLinkMenu(); PEEK.token++; $('#vPeek').hidden = true; peekForget();
    closePdf(doc);
  }
  V.dirty = V.drawing = false;
  V.file = null;
  resetBookmarks();
  autoReset();
  vStatus('');
  resetSide();
  clearBack();
}

/* ---- tabs: several papers open */
// Opening a paper adds a tab next to the current one (or goes to its tab if
// it's open). Only the front tab's paper is loaded; each tab remembers its
// page and zoom, and switching saves first. Library (or Esc) goes back to
// the library with the tabs kept; Viewer in the sidebar comes back. The
// tabs are remembered in this browser.
const PTABS = { list: store.get('readerTabs', []), active: store.get('readerActive', -1) };
function tabEntry(t) {
  const e = BYKEY.get(t.key);
  const f = e && (e.files || []).find(x => x.id === t.fileId);
  return e && f ? { e, f } : null;
}
function saveTabs() {
  store.set('readerTabs', PTABS.list.map(({ key, fileId, page, scale, top, left }) => ({ key, fileId, page, scale, top, left })));
  store.set('readerActive', PTABS.active);
}
function renderPaperTabs() {
  if (BYKEY.size) PTABS.list = PTABS.list.filter(t => tabEntry(t));
  if (PTABS.active >= PTABS.list.length) PTABS.active = PTABS.list.length - 1;
  if (PTABS.active < 0 && PTABS.list.length) PTABS.active = 0;
  const nav = $('#vTabs');
  closeTabsMenu();
  nav.innerHTML = PTABS.list.map((t, i) => {
    const x = tabEntry(t), title = x ? x.e.f.title || x.f.n : t.key;
    return `<div class="v-tab" role="tab" aria-selected="${i === PTABS.active}"><button type="button" class="v-tab-go" data-ptab="${i}" title="${esc(title)}">${esc(title)}</button>` +
      `<button type="button" class="v-tab-x" data-ptab-x="${i}" aria-label="Close ${esc(title)}" title="Close"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
  }).join('');
  const n = PTABS.list.length;
  nav.classList.toggle('single', n < 2);
  // (One paper open: no tabs, so its close button is beside its title.)
  $('#vTitleX').hidden = n !== 1;
  $('#readerBtn').hidden = !n;
  readerMoreShown();
  $('#readerCt').textContent = n > 1 ? String(n) : '';
  $('#readerBtn').setAttribute('aria-label', n === 1 ? 'Back to your open paper' : 'Back to your ' + n + ' open papers');
  saveTabs();
  const on = nav.querySelector('[aria-selected="true"]');
  if (on && !$('#viewer').hidden) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  tabsMore();
}
// The tabs out of sight at each end of the strip, as buttons over its
// ends: a tap lists them.
const TABS_OUT = { left: [], right: [] };
function tabsMore() {
  const nav = $('#vTabs'), L = $('#vTabsLeft'), R = $('#vTabsRight');
  const box = nav.getBoundingClientRect();
  TABS_OUT.left = []; TABS_OUT.right = [];
  const room = nav.scrollWidth - nav.clientWidth;
  if (room > 1) {
    // (Only at an end it can scroll to; there, a tab partly hidden under
    // the button counts too.)
    const atStart = nav.scrollLeft < 2, atEnd = nav.scrollLeft > room - 2;
    [...nav.children].forEach((t, i) => {
      const r = t.getBoundingClientRect();
      if (!atStart && r.left < box.left + 24) TABS_OUT.left.push(i);
      else if (!atEnd && r.right > box.right - 24) TABS_OUT.right.push(i);
    });
  }
  const left = TABS_OUT.left.length, right = TABS_OUT.right.length;
  const chev = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  L.hidden = !left; R.hidden = !right;
  if (left) { L.innerHTML = chev('M15 6l-6 6 6 6') + `<b>${left}</b>`; L.setAttribute('aria-label', left + ' more open paper' + (left > 1 ? 's' : '') + ', to the left'); L.title = L.getAttribute('aria-label'); }
  if (right) { R.innerHTML = `<b>${right}</b>` + chev('M9 6l6 6-6 6'); R.setAttribute('aria-label', right + ' more open paper' + (right > 1 ? 's' : '') + ', to the right'); R.title = R.getAttribute('aria-label'); }
}
$('#vTabs').addEventListener('scroll', () => requestAnimationFrame(tabsMore), { passive: true });
// (And when the strip's width changes: the window, or the viewer shown.)
if (window.ResizeObserver) new ResizeObserver(() => tabsMore()).observe($('#vTabs'));
function closeTabsMenu() { const m = $('#tabsMenu'); if (m) m.remove(); }
function tabsMenu(side) {
  const was = $('#tabsMenu');
  closeTabsMenu();
  if (was && was.dataset.side === side) return;
  const list = TABS_OUT[side].filter(i => PTABS.list[i]);
  if (!list.length) return;
  const btn = side === 'left' ? $('#vTabsLeft') : $('#vTabsRight');
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu link-menu recent-menu';
  m.id = 'tabsMenu';
  m.dataset.side = side;
  m.setAttribute('role', 'menu');
  m.innerHTML = '<div class="menu-head">Open papers ' + (side === 'left' ? 'to the left' : 'to the right') + '</div>' + list.map(i => {
    const t = PTABS.list[i], x = tabEntry(t), e = x && x.e;
    const title = x ? e.f.title || x.f.n : t.key;
    return `<div class="op-row"><button type="button" role="menuitem" data-tm="${i}"><span class="rc-title">${esc(title)}</span>` +
      (e ? `<span class="rc-sub">${esc(e.authorsShort || '')}${e.f.year ? ' \u00b7 ' + esc(e.f.year) : ''}</span>` : '') + '</button>' +
      `<button type="button" class="op-x" data-tm-x="${i}" aria-label="Close ${esc(title)}" title="Close it">${ICON.x}</button></div>`;
  }).join('');
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  const x = side === 'left' ? r.left : r.right - m.offsetWidth;
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, x)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  m.addEventListener('click', async ev => {
    // (Closed: the list again, with those still out of sight there.)
    const x = ev.target.closest('[data-tm-x]');
    if (x) {
      await closePaperTab(+x.dataset.tmX);
      if (TABS_OUT[side].length) tabsMenu(side);
      return;
    }
    const b = ev.target.closest('[data-tm]');
    if (!b) return;
    closeTabsMenu();
    const i = +b.dataset.tm;
    if (i !== PTABS.active) switchPaperTab(i);
  });
}
$('#vTabsLeft').addEventListener('click', () => tabsMenu('left'));
$('#vTabsRight').addEventListener('click', () => tabsMenu('right'));
document.addEventListener('pointerdown', ev => { if ($('#tabsMenu') && !ev.target.closest('#tabsMenu, .v-tabs-more, #tabs .tab.pinned')) closeTabsMenu(); }, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#tabsMenu')) { ev.stopPropagation(); closeTabsMenu(); } }, true);
// Where the front tab's paper is (only while it's showing).
function rememberTab() {
  const t = PTABS.list[PTABS.active];
  if (!t || !V.doc || !V.viewer || !V.file || V.file.id !== t.fileId || $('#viewer').hidden) return;
  const sc = $('#vScroll');
  Object.assign(t, { page: V.viewer.currentPageNumber, scale: V.viewer.currentScaleValue, top: sc.scrollTop, left: sc.scrollLeft });
  saveTabs();
}
function loadActiveTab() {
  const t = PTABS.list[PTABS.active], x = t && tabEntry(t);
  if (!x) { if (t) PTABS.list.splice(PTABS.active, 1); renderPaperTabs(); if (!PTABS.list.length) $('#viewer').hidden = true; else loadActiveTab(); return; }
  renderPaperTabs();
  openReader(x.e, x.f, t);
}
async function switchPaperTab(i) {
  const t = PTABS.list[i];
  if (!t) return;
  if (V.doc && V.file && V.file.id === t.fileId) { PTABS.active = i; showViewer(); return; }
  if (V.doc) {
    if (!keptNote(await saveNow())) return;
    rememberTab();
    unloadDoc();
  }
  PTABS.active = i;
  loadActiveTab();
}
async function closePaperTab(i) {
  const t = PTABS.list[i];
  if (!t) return;
  if (V.doc && V.file && V.file.id === t.fileId) {
    if (!keptNote(await saveNow())) return;
    shutReader();
    return;
  }
  PTABS.list.splice(i, 1);
  if (i < PTABS.active) PTABS.active--;
  noteClosed(t.key, t.fileId);
  renderPaperTabs();
}
// Open a paper: in its tab if it has one, otherwise in a new tab.
function openPaper(entry, file) {
  noteSeen(entry.k);
  let i = PTABS.list.findIndex(t => t.fileId === file.id);
  if (i < 0) {
    i = PTABS.active >= 0 ? PTABS.active + 1 : PTABS.list.length;
    PTABS.list.splice(i, 0, { key: entry.k, fileId: file.id });
  }
  switchPaperTab(i);
}
function showViewer() {
  if (!PTABS.list.length) return;
  if (PTABS.active < 0) PTABS.active = 0;
  const t = PTABS.list[PTABS.active];
  // (Also if it was changed while it was out of sight: made searchable.)
  if (!V.doc || !V.file || V.file.id !== t.fileId || V.stale === V.file.id) { V.stale = null; loadActiveTab(); return; }
  $('#viewer').hidden = false;
  renderPaperTabs();
  refit();
  allRibbons();
}
$('#vTabs').addEventListener('click', ev => {
  const x = ev.target.closest('[data-ptab-x]');
  if (x) { closePaperTab(+x.dataset.ptabX); return; }
  const g = ev.target.closest('[data-ptab]');
  if (g && +g.dataset.ptab !== PTABS.active) switchPaperTab(+g.dataset.ptab);
});
$('#readerBtn').addEventListener('click', () => {
  // (Not after a long press, which listed them.)
  if (RB.long) { RB.long = false; return; }
  closeOpenMenu();
  showViewer();
});
// The papers open, listed under the button, each with a picture of its
// first page: on a computer when the pointer rests on it, on a touch
// screen when it's held or with the \u25be beside it; or the down arrow;
// one picked is gone to. The list stays while the pointer is over
// it, and goes once it leaves both, or on a tap elsewhere or Esc.
const RB = { t: 0, hide: 0, long: false, x: 0, y: 0 };
function closeOpenMenu() { clearTimeout(RB.hide); const m = $('#openMenu'); if (m) m.remove(); $('#readerMore').setAttribute('aria-expanded', 'false'); }
function openPapersMenu(focus) {
  closeOpenMenu();
  const btn = $('#readerBtn');
  if (!PTABS.list.length || btn.hidden || !$('#viewer').hidden) return;
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu link-menu recent-menu open-menu';
  m.id = 'openMenu';
  m.setAttribute('role', 'menu');
  m.setAttribute('aria-label', 'Open papers');
  m.innerHTML = `<div class="menu-head">Open paper${PTABS.list.length === 1 ? '' : 's'}</div>` + PTABS.list.map((t, i) => {
    const x = tabEntry(t);
    if (!x) return '';
    const e = x.e, sub = [e.authorsShort || '', e.f.year || '', t.page > 1 ? 'p. ' + t.page : ''].filter(Boolean).join(' \u00b7 ');
    const title = e.f.title || x.f.n;
    return `<div class="op-row"><button type="button" role="menuitem" data-op="${i}"${i === PTABS.active ? ' aria-current="true"' : ''}>${opThumb(t.fileId)}` +
      `<span class="op-text"><span class="rc-title">${esc(title)}</span>${sub ? `<span class="rc-sub">${esc(sub)}</span>` : ''}</span></button>` +
      `<button type="button" class="op-x" data-op-x="${i}" aria-label="Close ${esc(title)}" title="Close it">${ICON.x}</button></div>`;
  }).join('');
  document.body.appendChild(m);
  $('#readerMore').setAttribute('aria-expanded', 'true');
  opThumbs(m);
  const r = btn.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  m.addEventListener('click', ev => {
    const x = ev.target.closest('[data-op-x]');
    if (x) { closeFromList(+x.dataset.opX); return; }
    const b = ev.target.closest('[data-op]');
    if (!b) return;
    closeOpenMenu();
    switchPaperTab(+b.dataset.op);
  });
  m.addEventListener('pointerenter', () => clearTimeout(RB.hide));
  m.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') RB.hide = setTimeout(closeOpenMenu, 250); });
  m.addEventListener('keydown', ev => {
    const items = [...m.querySelectorAll('[data-op]')], i = items.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (i <= 0) btn.focus(); else items[i - 1].focus(); }
  });
  if (focus) { const first = m.querySelector('[aria-current]') || m.querySelector('[data-op]'); if (first) first.focus(); }
}
// (The \u25be only on a touch screen: with a mouse or trackpad, resting
// the pointer on the button lists them.)
function readerMoreShown() { $('#readerMore').hidden = $('#readerBtn').hidden || !coarseMQ.matches; }
coarseMQ.addEventListener('change', readerMoreShown);
// Closed from the list (the reader not opened for it): the one loaded is
// saved first, as when its tab is closed; the list then drawn again, or
// put away with none left. (Recently closed, in the reader, reopens it.)
async function closeFromList(i) {
  const t = PTABS.list[i];
  if (!t) return;
  if (V.doc && V.file && V.file.id === t.fileId) {
    if (!keptNote(await saveNow())) return;
    noteClosed(t.key, t.fileId);
    unloadDoc();
    PTABS.list.splice(i, 1);
    PTABS.active = PTABS.list.length ? Math.max(0, Math.min(i, PTABS.list.length - 1)) : -1;
    renderPaperTabs();
  } else await closePaperTab(i);
  if (PTABS.list.length) openPapersMenu(); else { closeOpenMenu(); $('#readerBtn').focus(); }
}
// (Pictures from Drive, as the details' thumbnails, kept with them.)
const opThumb = id => `<span class="op-thumb" data-op-thumb="${esc(id)}">${THUMBS.get(id) ? `<img src="${esc(THUMBS.get(id))}" alt="">` : ICON.doc}</span>`;
function opThumbs(m) {
  const ids = [...new Set([...m.querySelectorAll('[data-op-thumb]')].map(el => el.dataset.opThumb))].filter(id => !THUMBS.has(id) && !THUMB_WAIT.has(id));
  if (!ids.length || !gs) return;
  ids.forEach(id => THUMB_WAIT.add(id));
  callServer('getThumbnails', ids).catch(() => ({})).then(map => {
    ids.forEach(id => {
      THUMB_WAIT.delete(id);
      THUMBS.set(id, (map && map[id]) || null);
      if (!THUMBS.get(id)) setTimeout(() => { if (THUMBS.get(id) === null) THUMBS.delete(id); }, 60 * 1000);
      const el = m.isConnected && m.querySelector(`[data-op-thumb="${CSS.escape(id)}"]`);
      if (el) el.outerHTML = opThumb(id);
    });
  });
}
$('#readerMore').addEventListener('click', ev => {
  if ($('#openMenu')) { closeOpenMenu(); return; }
  // (From the keyboard, into the list.)
  openPapersMenu(ev.detail === 0);
});
$('#readerBtn').addEventListener('pointerenter', ev => {
  if (ev.pointerType !== 'mouse') return;
  clearTimeout(RB.hide);
  if (!$('#openMenu')) { clearTimeout(RB.t); RB.t = setTimeout(() => openPapersMenu(), 350); }
});
$('#readerBtn').addEventListener('pointerleave', ev => {
  if (ev.pointerType !== 'mouse') return;
  clearTimeout(RB.t);
  RB.hide = setTimeout(closeOpenMenu, 250);
});
$('#readerBtn').addEventListener('pointerdown', ev => {
  if (ev.pointerType === 'mouse') return;
  RB.long = false;
  RB.x = ev.clientX; RB.y = ev.clientY;
  clearTimeout(RB.t);
  RB.t = setTimeout(() => { RB.long = true; openPapersMenu(); }, 450);
});
$('#readerBtn').addEventListener('pointermove', ev => { if (ev.pointerType !== 'mouse' && Math.hypot(ev.clientX - RB.x, ev.clientY - RB.y) > 10) clearTimeout(RB.t); });
['pointerup', 'pointercancel'].forEach(n => $('#readerBtn').addEventListener(n, ev => { if (ev.pointerType !== 'mouse') clearTimeout(RB.t); }));
// (Held: not the browser's own menu for it.)
$('#readerBtn').addEventListener('contextmenu', ev => { if (RB.long || $('#openMenu')) ev.preventDefault(); });
$('#readerBtn').addEventListener('keydown', ev => { if (ev.key === 'ArrowDown') { ev.preventDefault(); openPapersMenu(true); } });
document.addEventListener('pointerdown', ev => { if ($('#openMenu') && !ev.target.closest('#openMenu, #readerBtn, #readerMore')) closeOpenMenu(); }, true);
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || !$('#openMenu')) return;
  ev.stopPropagation();
  const back = ev.target.closest && ev.target.closest('#openMenu');
  closeOpenMenu();
  if (back) $('#readerBtn').focus();
}, true);
window.addEventListener('resize', closeOpenMenu);
$('#vTitleX').addEventListener('click', () => { if (PTABS.list.length) closePaperTab(PTABS.active >= 0 ? PTABS.active : 0); });
// Recently viewed: pressed again, back to the list you were on.
$('#recentBtn').addEventListener('click', () => {
  if (state.group === 'recent') { setGroup(RECENT.back && groupItems(RECENT.back) ? RECENT.back : 'all'); return; }
  RECENT.back = state.group;
  setGroup('recent');
});
// In the reader: the papers closed lately (not ones still open), to reopen.
function closeRecentMenu() { const m = $('#recentMenu'); if (m) m.remove(); }
$('#vRecentBtn').addEventListener('click', () => {
  if ($('#recentMenu')) { closeRecentMenu(); return; }
  const open = new Set(PTABS.list.map(t => t.fileId));
  const list = RECENT.closed.filter(x => !open.has(x[1]) && BYKEY.get(x[0])).slice(0, 15);
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu link-menu recent-menu';
  m.id = 'recentMenu';
  m.setAttribute('role', 'menu');
  m.innerHTML = '<div class="menu-head">Recently closed</div>' + (list.length ? list.map((x, i) => {
    const e = BYKEY.get(x[0]);
    return `<button type="button" role="menuitem" data-rc="${i}"><span class="rc-title">${esc(e.f.title || e.k)}</span><span class="rc-sub">${esc(e.authorsShort || '')}${e.f.year ? ' \u00b7 ' + esc(e.f.year) : ''} \u00b7 ${ago(x[2])}</span></button>`;
  }).join('') : '<p class="rc-none">No papers closed lately.</p>');
  document.body.appendChild(m);
  const r = $('#vRecentBtn').getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-rc]');
    if (!b) return;
    closeRecentMenu();
    const x = list[+b.dataset.rc], e = BYKEY.get(x[0]), f = e && (e.files || []).find(fl => fl.id === x[1]);
    if (f) openPaper(e, f); else toast('That PDF isn\u2019t linked to the publication any more.', 3000);
  });
});
document.addEventListener('pointerdown', ev => { if ($('#recentMenu') && !ev.target.closest('#recentMenu, #vRecentBtn')) closeRecentMenu(); }, true);
function discardAndClose() {
  if (V.file && gs) forgetKept(V.file.id).catch(() => {});
  if (V.doc) V.doc.annotationStorage.resetModified();
  V.dirty = V.drawing = false;
  shutReader();
}

/* ---- saving markup */
// A new mark isn't in the PDF's annotations until PDF.js commits it (on a
// change of tool), so anything done with a tool counts as possibly
// unsaved; saving commits first and uploads only if something changed.
// The match found: PDF.js scrolls it to just below the top of the paper's
// area, but the bars at the top (and the search bar) sit over that area,
// so it can land under them. For a moment after each step of a search
// (PDF.js scrolls when the page's text is ready), a match out of sight is
// brought a third of the way down what's in view.
let FIND_REVEAL = 0;
function revealFindMatch() {
  cancelAnimationFrame(FIND_REVEAL);
  const until = performance.now() + 900;
  const step = () => {
    const el = document.querySelector('#vPages .textLayer .highlight.selected'), sc = $('#vScroll');
    if (el && sc) {
      const r = el.getBoundingClientRect(), box = sc.getBoundingClientRect();
      let top = box.top;
      document.querySelectorAll('#vTop, #viewer .v-bar, #vFind').forEach(b => { if (!b.hidden && b.offsetParent !== null) top = Math.max(top, b.getBoundingClientRect().bottom); });
      const bottom = box.bottom;
      if (r.top < top + 8 || r.bottom > bottom - 8) sc.scrollTop += r.top - (top + (bottom - top) / 3);
    }
    if (performance.now() < until) FIND_REVEAL = requestAnimationFrame(step);
  };
  FIND_REVEAL = requestAnimationFrame(step);
}
// What the marks on the paper come to (PDF.js's own fingerprint of them).
function storageHash(doc) {
  try { return doc.annotationStorage.serializable.hash; } catch (err) { return null; }
}
function markDrawing() {
  if (!V.doc || V.drawing) return;
  V.drawing = true;
  saveUI();
}
// Making a mark shouldn't move the page. PDF.js focuses each new mark,
// and Safari scrolls to whatever gets focus (or to a new selection), so
// focusing marks doesn't scroll, and for a moment after a highlight the
// page is put back if it moves without you moving it.
const nativeFocus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function (opts) {
  if (this.closest && this.closest('#vPages')) return nativeFocus.call(this, Object.assign({}, opts, { preventScroll: true }));
  return nativeFocus.call(this, opts);
};
const HOLD = { top: 0, left: 0, until: 0 };
function holdScroll() {
  const sc = $('#vScroll');
  HOLD.top = sc.scrollTop; HOLD.left = sc.scrollLeft; HOLD.until = Date.now() + 900;
}
$('#vScroll').addEventListener('scroll', () => {
  if (Date.now() > HOLD.until) return;
  const sc = $('#vScroll');
  if (sc.scrollTop !== HOLD.top || sc.scrollLeft !== HOLD.left) { sc.scrollTop = HOLD.top; sc.scrollLeft = HOLD.left; }
}, { passive: true });
['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(t => window.addEventListener(t, () => { HOLD.until = 0; }, { capture: true, passive: true }));
let pageDown = false;
$('#vScroll').addEventListener('pointerdown', ev => {
  pageDown = !(ev.pointerType === 'touch' && V.pencil);
  if (V.tool === 'highlight') {
    V.newHighlight = !ev.target.closest('.highlightEditor, .editToolbar');
    clearTimeout(V.newHighlightTimer);
  }
}, true);
$('#vScroll').addEventListener('pointerup', () => {
  if (V.newHighlight) V.newHighlightTimer = setTimeout(() => { V.newHighlight = false; }, 800);
}, true);
window.addEventListener('pointerup', () => {
  if (pageDown && V.tool !== 'read' && !$('#viewer').hidden) markDrawing();
  pageDown = false;
}, true);
window.addEventListener('keydown', ev => {
  if (V.tool !== 'read' && !$('#viewer').hidden && /^(Backspace|Delete|z|y)$/i.test(ev.key)) setTimeout(markDrawing, 0);
}, true);
// The PDF with its new annotations goes back into the same Google Drive
// file (so its link in the .bib stays the same), after the old version is
// copied to LibLande/Backups/PDFs. If the file changed elsewhere
// since it was opened (in PDF Expert, say), LibLande asks first.
// Commit a mark being drawn. With the pen (or eraser) on, PDF.js can end
// the drawing in place, staying in ink mode; otherwise switch PDF.js to no
// tool, then back. (Switching resets every page's drawing layer, so a
// stroke begun during it -- the auto-save comes a while after the last
// one, when the next is likely -- was cut off after its first
// point, leaving a dot.)
function commitDrawing() {
  commitTextBox();
  if (!V.viewer || !V.doc || V.viewer.annotationEditorMode === V.lib.AnnotationEditorType.NONE) return Promise.resolve();
  if (V.viewer.annotationEditorMode === V.lib.AnnotationEditorType.INK && V.ui && V.ui.getLayer) {
    // (Not in the middle of a stroke: the next save gets it.)
    if (AUTO.down) return Promise.resolve();
    for (let i = 0; i < V.doc.numPages; i++) {
      const layer = V.ui.getLayer(i);
      if (layer && layer.commitOrRemove) layer.commitOrRemove();
    }
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); V.bus.off('annotationeditormodechanged', done); resolve(); };
    const timer = setTimeout(done, 1500);
    V.bus.on('annotationeditormodechanged', done);
    V.viewer.annotationEditorMode = { mode: V.lib.AnnotationEditorType.NONE };
  });
}
async function saveMarkup(force, auto, now) {
  if (V.saving) return V.saving;
  if (!(V.dirty || V.bmDirty || V.drawing) || !V.doc || !gs) return true;
  // Bookmarks are written into the PDF (which rewrites the whole file) only
  // by a save you ask for, or on leaving the paper or the app; auto-save's
  // uploads in between leave them out (they're kept on this device).
  const withBm = !auto || !!now;
  if (!withBm && !(V.dirty || V.drawing)) return true;
  // An automatic save while a mark is selected (or a menu is open) saves
  // what's recorded without finishing the stroke being drawn, which would
  // switch tools and drop the selection; the next save finishes it.
  const quiet = auto && (V.selected || !$('#vpPanel').hidden || !$('#vRegion').hidden);
  if (quiet && !V.dirty && !V.bmDirty) return true;
  const doc = V.doc, file = V.file;
  // Changes made while this save is under way are saved by the next one.
  const seq = V.seq || 0, bmSnap = new Set(BM.pages);
  // Offline (or Drive can't be reached), the changes are kept on this
  // device instead, and uploaded once it's back online (see uploadKept).
  let offline = false;
  V.saving = (async () => {
    AUTO.first = AUTO.last = 0;
    saveUI('saving');
    if (!quiet) {
      await commitDrawing();
      V.drawing = false;
      if (V.tool !== 'read' && doc === V.doc) setTool(V.tool);
    }
    if (!V.dirty && !V.bmDirty) { saveUI(); return true; }
    if (!navigator.onLine) { offline = true; saveUI(); return false; }
    try {
      const md5 = await pdfMd5(file).catch(() => null);
      if (!force && V.md5 && md5 && md5 !== V.md5) {
        AUTO.paused = true;
        saveUI();
        vStatus('This PDF was changed somewhere else after you opened it (on another device, or perhaps in PDF Expert). ' +
          'Combine adds the marks you made here to that version; Save anyway replaces it (Google Drive keeps it in the file\u2019s version history).', false,
          [['Combine', combineMarks], ['Save anyway', () => saveMarkup(true)], ['Keep reading', null], ['Close without saving', discardAndClose]]);
        return false;
      }
      // One backup a day is kept on Drive; ask for it once a day here.
      const day = new Date().toDateString();
      if (AUTO.backedUp !== file.id + ' ' + day) {
        await callServer('backupPdf', file.id);
        AUTO.backedUp = file.id + ' ' + day;
      }
      const saved = await doc.saveDocument();
      const bytes = await realLines(withBm ? await withBookmarks(saved, bmSnap) : saved);
      const up = token => fetch('https:\/\/www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=md5Checksum',
        { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/pdf' }, body: bytes });
      let r = await up(await driveToken());
      if (r.status === 401) r = await up(await driveToken(true));
      if (!r.ok) throw new Error('Google Drive didn\u2019t accept the changes (error ' + r.status + ').');
      const res = await r.json().catch(() => ({}));
      V.md5 = res.md5Checksum || null;
      V.bytes = bytes;
      recentPdfs.delete(file.id); recentPdfs.set(file.id, bytes); trimRecentPdfs();
      if (V.md5) recentMd5.set(file.id, V.md5); else recentMd5.delete(file.id);
      THUMBS.delete(file.id);
      V.savedSinceOpen = true;
      if (doc === V.doc) {
        doc.annotationStorage.resetModified();
        V.savedMarks = storageHash(doc);
        // (PDF.js reports only its own changes; this may have been set here.)
        V.dirty = false;
        // (Without them, Drive has the bookmarks the PDF was opened with.)
        BM.saved = withBm ? bmSnap : new Set(BM.orig);
        V.bmDirty = !sameSet(BM.pages, BM.saved);
        if ((V.seq || 0) !== seq) V.dirty = true;
      }
      AUTO.paused = false;
      AUTO.failed = false;
      // Drive has the changes: the copy on this device goes (or, with
      // changes made during the upload, is made again).
      // (After any copy being made meanwhile, which would otherwise be left.)
      if (doc === V.doc && (V.dirty || V.bmDirty)) localSaveSoon(0);
      else {
        const md5Now = V.md5;
        const drop = () => {
          if (LOCAL.busy) { setTimeout(drop, 300); return; }
          if (V.file === file && (V.dirty || V.bmDirty || V.md5 !== md5Now)) return;
          JOURNAL.drop(file.id).catch(() => {});
        };
        drop();
      }
      sideChanged();
      saveUI('saved');
      return true;
    } catch (err) {
      if (netError(err)) { offline = true; saveUI(); return false; }
      // (Tried again two minutes on.)
      if (!AUTO.first) AUTO.first = AUTO.last = Date.now();
      saveUI();
      if (auto) {
        if (!AUTO.failed) toast('Couldn\u2019t save your changes just now (' + errText(err) + '). LibLande will keep trying.', 5000);
        AUTO.failed = true;
        return false;
      }
      vStatus('Your markup wasn\u2019t saved: ' + errText(err), true,
        [['Try again', () => saveMarkup(force)], ['Keep reading', null], ['Close without saving', discardAndClose]]);
      return false;
    }
  })();
  let res;
  try { res = await V.saving; } finally { V.saving = null; }
  if (offline && doc === V.doc) return (await keepOnDevice()) ? 'kept' : false;
  return res;
}
// A save that failed for want of a connection (rather than being refused).
const netError = err => err instanceof TypeError ||
  /offline|can\u2019t be reached|NetworkError|Load failed|Failed to fetch|respondWith|network connection/i.test(String(err && err.message));
// The open paper's changes kept on this device now (not in a few
// seconds): true once they are.
async function keepOnDevice() {
  for (let i = 0; i < 100 && LOCAL.busy; i++) await new Promise(r => setTimeout(r, 100));
  clearTimeout(LOCAL.timer);
  if (!V.file) return false;
  const id = V.file.id, t0 = Date.now();
  await localSave();
  const j = await JOURNAL.get(id).catch(() => null);
  return !!(j && (j.bytes || j.tail) && j.at >= t0);
}
const KEPT_NOTE = 'You\u2019re offline: your marks are kept on this device, and go to Google Drive when you\u2019re back online.';
const keptNote = r => { if (r === 'kept') toast(KEPT_NOTE, 4500); return r; };
// Combine: the PDF changed on Drive (another device, another app) while
// marks were made here. The newer PDF is downloaded, and the marks made
// here are written into it by PDF.js (out of sight), with the bookmarks
// made or removed here; then it's uploaded, and shown. Marks that were
// already in the PDF and were changed or deleted here aren't carried over
// (the other version may have changed them too); you're told how many.
// Papers with changes kept on this device (made offline, or left before
// they could be uploaded) go to Drive when LibLande is online: on start,
// and when the connection comes back. Each only if the PDF on Drive is
// still the one the changes were made to; otherwise it's left, and
// opening it offers Combine.
const KEPT_UP = { busy: false, again: false };
// A message floats while they go ("Back online: saving...") and says how
// it went.
async function uploadKept(back) {
  if (!gs || !navigator.onLine) return;
  // (Asked again while under way: once more when it's done.)
  if (KEPT_UP.busy) { KEPT_UP.again = true; return; }
  KEPT_UP.busy = true;
  KEPT_UP.again = false;
  let done = 0, others = 0;
  const lead = back ? 'Back online: s' : 'S';
  try {
    const keys = ((await JOURNAL.run('readonly', st => st.getAllKeys()).catch(() => [])) || [])
      .filter(id => typeof id === 'string' && !id.startsWith('open:'));
    const showing = id => V.file && V.file.id === id && V.doc && !$('#viewer').hidden;
    others = keys.filter(id => !showing(id)).length;
    if (others) toast(lead + 'aving marks made offline to Google Drive\u2026', 0);
    else if (keys.length && (V.dirty || V.bmDirty || V.drawing)) toast(lead + 'aving your marks to Google Drive\u2026', 3000);
    for (const id of keys) {
      // (The paper that's loaded is saved the usual way: by auto-save if
      // it's showing, now if it's been closed.)
      if (V.file && V.file.id === id && V.doc) {
        if (!(V.dirty || V.bmDirty || V.drawing)) continue;
        if (!$('#viewer').hidden) autoSaveSoon(1000);
        else if ((await saveMarkup(false, true, true)) === true) done++;
        continue;
      }
      const j = await JOURNAL.load(id).catch(() => null);
      if (!j || !j.bytes || !j.base) continue;
      const file = { id };
      const md5 = await pdfMd5(file).catch(() => null);
      if (!md5 || md5 !== j.base) continue;
      try {
        await callServer('backupPdf', id);
        const bytes = await realLines(j.bm ? await withBookmarks(j.bytes, new Set(j.bm), true).catch(() => j.bytes) : j.bytes);
        await uploadMarked(file, bytes);
      } catch (err) {
        if (netError(err)) break;
        console.warn('Uploading kept changes failed:', err);
        continue;
      }
      if (V.file && V.file.id === id && V.doc) continue;
      await JOURNAL.drop(id).catch(() => {});
      recentPdfs.delete(id); recentMd5.delete(id); THUMBS.delete(id);
      done++;
    }
  } finally {
    KEPT_UP.busy = false;
    if (KEPT_UP.again) setTimeout(uploadKept, 500);
  }
  if (done) toast('Marks made offline on ' + done + ' paper' + (done === 1 ? '' : 's') + ' saved to Google Drive', 4000);
  else if (others) toast('Marks made offline couldn\u2019t be saved to Google Drive yet. They\u2019re kept on this device; opening the paper saves them.', 6000);
}
window.addEventListener('online', () => setTimeout(() => uploadKept(true), 1500));
async function uploadMarked(file, bytes) {
  const up = token => fetch('https:\/\/www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=md5Checksum',
    { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/pdf' }, body: bytes });
  let r = await up(await driveToken());
  if (r.status === 401) r = await up(await driveToken(true));
  if (!r.ok) throw new Error('Google Drive didn\u2019t accept the changes (error ' + r.status + ').');
  return (await r.json().catch(() => ({}))).md5Checksum || null;
}
// The open paper changed as a whole (pages turned, or OCR's text added):
// any marks not yet saved are saved first, edit(bytes) makes the new PDF
// from the one on Drive, which is uploaded (if it's still the one on
// Drive), and the paper is opened again where you are (or, if it's open
// behind the library, when you go back to it).
// (opts.page: the page to open it at, as when pages were added.)
async function rewritePdf(file, edit, opts = {}) {
  const showing = () => V.file && V.file.id === file.id && V.doc;
  if (!showing()) throw new Error('the paper isn\u2019t open.');
  if (V.dirty || V.bmDirty || V.drawing) {
    const r = await saveMarkup(false, false, true);
    if (r !== true) throw new Error('your marks couldn\u2019t be saved first' + (r === 'kept' ? ' (you\u2019re offline)' : '') + '.');
  }
  if (!showing()) throw new Error('the paper was closed.');
  const md5 = V.md5, out = await edit(V.bytes);
  const now = await pdfMd5(file).catch(() => null);
  if (md5 && now && now !== md5) throw new Error('the PDF changed on Google Drive meanwhile.');
  await callServer('backupPdf', file.id);
  const newMd5 = await uploadMarked(file, out);
  recentPdfs.delete(file.id); recentPdfs.set(file.id, out); trimRecentPdfs();
  if (newMd5) recentMd5.set(file.id, newMd5); else recentMd5.delete(file.id);
  THUMBS.delete(file.id);
  // (Marks made in the moment since are offered to Combine, as the PDF on
  // Drive is newer.) The sidebar as it was: open (even on a phone, to
  // turn another page), scrolled to the same place.
  if (showing()) {
    if (!$('#viewer').hidden) {
      const side = sideOpen(), sideTop = $('#vSideBody').scrollTop;
      await openReader(V.entry, V.file, opts.page ? null : spot());
      if (opts.page && V.viewer) {
        // (Once its pages are laid out, and after any place it would
        // otherwise open at.)
        const go = () => setTimeout(() => { if (V.viewer && V.viewer.pagesCount >= opts.page) V.viewer.currentPageNumber = opts.page; }, 150);
        if (V.viewer.pagesCount && V.doc && V.viewer.pdfDocument === V.doc) go();
        else { const once = () => { V.bus.off('pagesinit', once); go(); }; V.bus.on('pagesinit', once); }
      }
      if (side && V.doc && V.file && V.file.id === file.id) {
        if (!sideOpen()) toggleSide(true);
        setTimeout(() => { $('#vSideBody').scrollTop = sideTop; }, 150);
      }
    } else V.stale = file.id;
  }
}
// A PDF opened with pdf-lib to be changed (rebuilt first if its structure
// is damaged).
async function pdfLibOpen(bytes) {
  const { PDFDocument } = await loadPdfLib();
  const open = data => PDFDocument.load(data, { updateMetadata: false, throwOnInvalidObject: false });
  try {
    return await open(bytes);
  } catch (err) {
    if (/encrypt/i.test(String(err && err.message))) throw new Error('this PDF is password-protected.');
    try { return await open(rebuildPdf(bytes)); } catch (err2) { throw new Error('LibLande couldn\u2019t read the PDF\u2019s file structure.'); }
  }
}

// Rotating a page (from its thumbnail): turned in the PDF itself (the
// page's /Rotate), so it's turned in other apps too. It turns on screen at
// once, and is saved a moment after the last turn (turning it twice is one
// save), then the paper opened again with it.
const ROT = { file: null, want: new Map(), timer: 0, busy: false };
const rotatePage = (n, by) => rotatePages([n], by);
function rotatePages(list, by) {
  if (!V.doc || !V.file || !V.viewer) return;
  if (!gs || !navigator.onLine) { toast('Turning pages needs an internet connection, to save them to Google Drive.', 3500); return; }
  if (ROT.file && ROT.file.id !== V.file.id) ROT.want.clear();
  ROT.file = V.file;
  for (const n of list) {
    const k = (((ROT.want.get(n) || 0) + by) % 360 + 360) % 360;
    ROT.want.set(n, k);
    // Turned on screen now: the page, and its thumbnail.
    const pv = V.viewer.getPageView(n - 1);
    if (pv) pv.update({ rotation: (V.viewer.pagesRotation + k) % 360 });
    const t = SIDE.thumbs[n - 1], box = t && t.el.querySelector('.v-thumb-img');
    if (box) {
      const r = box.clientHeight && box.clientWidth ? Math.min(box.clientWidth / box.clientHeight, box.clientHeight / box.clientWidth) : 1;
      box.style.transform = k ? `rotate(${k}deg)` + (k % 180 ? ` scale(${r.toFixed(3)})` : '') : '';
    }
  }
  // (Pages turned sideways take less room: the rest drawn as they come into view.)
  if (list.length > 1) V.viewer.update();
  clearTimeout(ROT.timer);
  ROT.timer = setTimeout(saveRotation, 1200);
}
async function saveRotation() {
  if (ROT.busy || V.saving) { ROT.timer = setTimeout(saveRotation, 500); return; }
  const file = ROT.file, want = new Map([...ROT.want].filter(([, k]) => k));
  ROT.want.clear(); ROT.file = null;
  if (!file || !want.size) return;
  if (!V.file || V.file.id !== file.id) { toast('The page wasn\u2019t turned: the paper was closed first.', 4000); return; }
  ROT.busy = true;
  saveUI('saving');
  try {
    await rewritePdf(file, async bytes => {
      const { degrees } = await loadPdfLib();
      const doc = await pdfLibOpen(bytes), pages = doc.getPages();
      for (const [n, k] of want) {
        const page = pages[n - 1];
        if (page) page.setRotation(degrees(((page.getRotation().angle + k) % 360 + 360) % 360));
      }
      return doc.save();
    });
  } catch (err) {
    toast('Couldn\u2019t turn the page' + (want.size === 1 ? '' : 's') + ': ' + errText(err), 6000);
    // (Back as it is on Drive.)
    if (V.file && V.file.id === file.id && V.viewer) {
      for (const n of want.keys()) {
        const pv = V.viewer.getPageView(n - 1);
        if (pv) pv.update({ rotation: V.viewer.pagesRotation });
        const t = SIDE.thumbs[n - 1], box = t && t.el.querySelector('.v-thumb-img');
        if (box) box.style.transform = '';
      }
    }
  } finally {
    ROT.busy = false;
    saveUI();
  }
}

async function combineMarks() {
  if (!V.doc || !V.file || !gs || V.saving) return;
  const doc = V.doc, file = V.file, entry = V.entry, at = spot();
  AUTO.paused = true;
  vStatus('Combining your marks with the newer version\u2026');
  try {
    await commitDrawing();
    const { map } = doc.annotationStorage.serializable;
    const mine = [];
    let skipped = 0;
    for (const v of (map ? map.values() : [])) {
      if (!v) continue;
      if (v.id || v.deleted || v.bitmap) { skipped++; continue; }
      mine.push(v);
    }
    const added = Array.from(BM.pages).filter(n => !BM.orig.has(n)), removed = Array.from(BM.orig).filter(n => !BM.pages.has(n));
    const md5 = await pdfMd5(file).catch(() => null);
    recentPdfs.delete(file.id);
    const newer = await getPdfBytes(file);
    const tmp = await openPdf(V.lib, { data: newer.slice(0) }).promise;
    let out = newer;
    try {
      // (PDF.js writes only entries named as its marks are.)
      mine.forEach((v, i) => tmp.annotationStorage.setValue('pdfjs_internal_editor_combined_' + i, v));
      if (mine.length) out = await tmp.saveDocument();
      if (added.length || removed.length) {
        const want = await bookmarksOf(tmp);
        added.forEach(n => want.add(n));
        removed.forEach(n => want.delete(n));
        out = await withBookmarks(out, want, true);
      }
    } finally { await closePdf(tmp); }
    out = await realLines(out);
    const now = await pdfMd5(file).catch(() => null);
    if (md5 && now && now !== md5) throw new Error('The PDF changed on Google Drive again meanwhile.');
    const newMd5 = await uploadMarked(file, out);
    // Drive has both sets: this paper is shown from it (once the copy kept
    // on this device is gone, or it would be offered again).
    await forgetKept(file.id).catch(() => {});
    if (doc === V.doc) { doc.annotationStorage.resetModified(); V.dirty = V.drawing = V.bmDirty = false; }
    recentPdfs.delete(file.id); recentPdfs.set(file.id, out); trimRecentPdfs();
    if (newMd5) recentMd5.set(file.id, newMd5); else recentMd5.delete(file.id);
    AUTO.paused = false;
    vStatus('');
    await openReader(entry, file, at);
    toast('Combined: ' + mine.length + ' mark' + (mine.length === 1 ? '' : 's') + ' from here added to the newer version' +
      (skipped ? '. ' + skipped + ' change' + (skipped === 1 ? '' : 's') + ' to marks that were already there couldn\u2019t be carried over' : '') + '.', 6000);
  } catch (err) {
    vStatus('Couldn\u2019t combine your marks: ' + errText(err), true,
      [['Try again', combineMarks], ['Keep reading', null]]);
  }
}
let savedTimer;
// The open paper's saving shows on the viewer's cloud (netRender): changes
// not yet on Drive, saving, and saved for a moment.
function saveUI(state) {
  clearTimeout(savedTimer);
  const unsaved = V.dirty || V.bmDirty || V.drawing;
  NET.save = state === 'saving' ? 'saving' : state === 'saved' ? 'saved' : gs && unsaved ? 'unsaved' : '';
  netRender();
  if (state === 'saved') savedTimer = setTimeout(() => saveUI(), 1800);
  if (unsaved && state !== 'saving') { autoSaveSoon(); localSaveSoon(); }
}

/* ---- saving on this device between uploads */
// Google Drive only takes a whole file, and uploading one is what costs
// battery; so changes are kept on this device (in the browser's storage) a
// few seconds after each one, and go to Drive only now and then (see
// auto-save). If the app is closed before they're uploaded, they're picked
// up the next time the paper is opened here, and uploaded then. Each
// paper's copy is removed once Drive has its changes.
const JOURNAL = {
  db() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('landelib-marks', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('marks');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },
  async run(mode, fn) {
    const db = await this.db();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('marks', mode), q = fn(tx.objectStore('marks'));
        tx.oncomplete = () => resolve(q && q.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  },
  get(id) { return this.run('readonly', st => st.get(id)); },
  // A paper's copy, and the file it was opened from (see localSave).
  drop(id) {
    LOCAL.openKept = null;
    const done = this.run('readwrite', st => { st.delete('open:' + id); return st.delete(id); });
    done.then(() => netBadge(), () => {});
    return done;
  },
  // The changes as a whole file, put back together if kept in two parts.
  async load(id) {
    const j = await this.get(id);
    if (!j) return null;
    if (j.bytes) return Object.assign({}, j, { bytes: new Uint8Array(j.bytes) });
    if (!j.tail) return null;
    const o = await this.get('open:' + id);
    if (!o || !o.bytes) return null;
    const bytes = new Uint8Array(o.bytes.length + j.tail.length);
    bytes.set(o.bytes);
    bytes.set(j.tail, o.bytes.length);
    return Object.assign({}, j, { bytes });
  },
};
// A paper's copy removed for good (discarded, or on Drive now): any copy
// about to be made, or being made, is waited out first, so it can't come
// back.
async function forgetKept(id) {
  clearTimeout(LOCAL.timer);
  for (let i = 0; i < 100 && LOCAL.busy; i++) await new Promise(r => setTimeout(r, 100));
  return JOURNAL.drop(id);
}
const samePrefix = (a, b) => {
  if (a.length < b.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const LOCAL = { timer: 0, busy: false, making: false, openKept: null };
// Papers whose device copy you chose over a newer PDF on Drive.
const JOURNAL_USE = new Set();
function localSaveSoon(wait) {
  clearTimeout(LOCAL.timer);
  if (!gs || !V.doc || !(V.dirty || V.bmDirty || V.drawing)) return;
  LOCAL.timer = setTimeout(localSave, wait == null ? 4000 : wait);
}
async function localSave() {
  if (!gs || !V.doc || !V.file || !(V.dirty || V.bmDirty)) return;
  // (Not in the middle of a stroke, or of an upload or another copy: soon.)
  if (AUTO.down || V.saving || LOCAL.busy) { localSaveSoon(1500); return; }
  const doc = V.doc, file = V.file, base = V.md5, bm = Array.from(BM.pages), open = V.openBytes;
  LOCAL.busy = true;
  try {
    // PDF.js counts making a copy as saving; here it isn't (see onResetModified).
    LOCAL.making = true;
    let bytes;
    try { bytes = await doc.saveDocument(); } finally { LOCAL.making = false; }
    // Uploaded meanwhile (or the paper closed): nothing to keep.
    if (doc !== V.doc || V.md5 !== base || !(V.dirty || V.bmDirty)) return;
    // PDF.js adds the marks to the end of the file as opened: only that
    // part is kept each time (a few KB), with the file as opened kept once
    // alongside. (If it rewrote the file instead, the whole of it.)
    const appended = open && bytes.length > open.length && samePrefix(bytes, open);
    const at = Date.now(), withOpen = appended && LOCAL.openKept !== doc;
    const entry = appended ? { base, tail: bytes.slice(open.length), bm, at } : { base, bytes, bm, at };
    await JOURNAL.run('readwrite', st => {
      if (withOpen) st.put({ bytes: open }, 'open:' + file.id);
      else if (!appended) st.delete('open:' + file.id);
      return st.put(entry, file.id);
    });
    if (withOpen) LOCAL.openKept = doc;
    netBadge();
  } catch (err) {
    console.warn('Keeping the changes on this device failed:', err);
  } finally { LOCAL.busy = false; }
}

/* ---- auto-save */
// Every mark added, moved, recoloured or removed goes through PDF.js's undo
// list, as do undo and redo: those are the changes that time the upload.
function watchChanges(ui) {
  if (!ui || ui._watched) return;
  ui._watched = true;
  ['addCommands', 'undo', 'redo'].forEach(k => {
    const f = ui[k];
    if (typeof f === 'function') ui[k] = function () { const r = f.apply(this, arguments); autoChanged(); decorateLines(); return r; };
  });
}
// Changes are uploaded to Drive on their own two minutes after the last
// one, and never more than five minutes after the first one not yet
// uploaded (and at once when you switch to another app or tab, or leave
// the paper), but not while you're in the middle of a stroke, the comment
// box or typing. Only changes count: reading and scrolling don't put it off. (Each upload rebuilds the whole PDF and sends it, which costs
// battery; meanwhile they're kept on this device, see JOURNAL.) If the PDF changed
// elsewhere, LibLande asks first and waits.
const AUTO = { timer: 0, down: false, paused: false, failed: false, backedUp: '', first: 0, last: 0 };
const AUTO_QUIET = 2 * 60 * 1000, AUTO_MOST = 5 * 60 * 1000;
// A change made (a mark, an undo, a comment, a bookmark).
function autoChanged() {
  const t = Date.now();
  if (!AUTO.first) AUTO.first = t;
  AUTO.last = t;
  autoSaveSoon();
}
// Something unsaved with no change seen is left for leaving the paper: PDF.js
// counts picking up a tool as a change (it makes the marks already there
// editable), and so does drawing pages in tool mode.
function autoSaveSoon(wait) {
  clearTimeout(AUTO.timer);
  if (!gs || !V.doc || AUTO.paused || !(V.dirty || V.bmDirty || V.drawing)) return;
  if (wait == null && !AUTO.first) return;
  const t = Date.now();
  if (wait == null) wait = Math.max(0, Math.min(AUTO.last + AUTO_QUIET, AUTO.first + AUTO_MOST) - t);
  AUTO.due = t + wait;
  AUTO.timer = setTimeout(() => autoSave(false), wait);
}
function autoBusy(now) {
  const a = document.activeElement;
  if ((!$('#vComment').hidden && $('#vComment').dataset.mode === 'edit') || (a && a.closest && a.closest('.freeTextEditor, input, textarea, [contenteditable="true"]'))) return true;
  return !now && AUTO.down;
}
async function autoSave(now) {
  if (!gs || !V.doc || AUTO.paused || $('#viewer').hidden) return;
  if (V.saving || autoBusy(now)) { autoSaveSoon(2000); return; }
  await saveMarkup(false, true, now);
  if (!(V.dirty || V.bmDirty || V.drawing)) AUTO.first = AUTO.last = 0;
  autoSaveSoon();
}
function autoReset() { clearTimeout(AUTO.timer); Object.assign(AUTO, { down: false, paused: false, failed: false, first: 0, last: 0 }); }
// Activity in the reader puts the save off, and counts as a change made
// during a save that's under way.
window.addEventListener('pointerdown', ev => { if (!$('#viewer').hidden && ev.target.closest && ev.target.closest('#viewer')) { AUTO.down = true; clearTimeout(AUTO.timer); } }, true);
const autoUp = () => { if (!AUTO.down) return; AUTO.down = false; if (V.tool !== 'read' || V.selected) V.seq = (V.seq || 0) + 1; autoSaveSoon(); };
window.addEventListener('pointerup', autoUp, true);
window.addEventListener('pointercancel', autoUp, true);
window.addEventListener('keydown', ev => {
  if ($('#viewer').hidden) return;
  if (!ev.metaKey && !ev.ctrlKey) { V.seq = (V.seq || 0) + 1; autoSaveSoon(); } else if (/^[zy]$/i.test(ev.key)) { V.seq = (V.seq || 0) + 1; autoChanged(); }
}, true);
// (Kept on the device first: quick, before iOS stops the app.)
document.addEventListener('visibilitychange', () => { if (document.hidden && (V.dirty || V.bmDirty || V.drawing)) { localSave(); autoSave(true); } });
window.addEventListener('pagehide', () => { if (V.dirty || V.bmDirty || V.drawing) { localSave(); autoSave(true); } });
window.addEventListener('beforeunload', ev => { if (V.dirty || V.bmDirty || V.drawing) { ev.preventDefault(); ev.returnValue = ''; } });

/* ---- the Pencil's hover preview */
// On iPads that sense the Pencil just above the screen, a preview of the
// tool's mark follows the tip: the pen's dot (its colour, and its width at
// this zoom), the eraser's circle, the highlighter's colour as a bar the
// height of the line of text below, an underline or strike-through, or a
// text cursor. It goes when the Pencil touches down or moves away. (A mouse
// has the tools' cursors instead.)
const HOVER = { el: null, raf: 0, x: 0, y: 0 };
function hoverHide() {
  cancelAnimationFrame(HOVER.raf);
  HOVER.raf = 0;
  if (HOVER.el) HOVER.el.hidden = true;
}
function hoverPreview() {
  HOVER.raf = 0;
  const t = V.tool, x = HOVER.x, y = HOVER.y;
  if (!V.doc || $('#viewer').hidden || t === 'read' || t === 'select' || V.selected) { hoverHide(); return; }
  if (!HOVER.el) {
    HOVER.el = document.createElement('div');
    HOVER.el.className = 'v-hover';
    HOVER.el.setAttribute('aria-hidden', 'true');
    $('#viewer').append(HOVER.el);
  }
  const el = HOVER.el, scale = (V.viewer && V.viewer.currentScale) || 1, css = scale * 96 / 72;
  // The line of text under the tip, for the highlighter and the lines.
  const span = () => document.elementsFromPoint(x, y).find(n => n.parentElement && n.parentElement.classList.contains('textLayer') && n.textContent.trim());
  let kind = 'dot', w = 8, h = 8, color = toolColor(), cx = x, cy = y, soft = false;
  if (t === 'pen') { w = h = Math.max(3, MARK.penSize * css); }
  else if (t === 'eraser') { kind = 'ring'; w = h = MARK.eraserSize * 2; color = ''; }
  else if (t === 'text') { kind = 'bar'; w = 2; h = Math.max(10, MARK.textSize * css); }
  else if (t === 'comment') { w = h = 10; color = 'var(--accent)'; }
  else if (t === 'highlight' && MARK.markKind === 'free') { w = h = Math.max(6, 12 * css); soft = true; }
  else if (t === 'highlight' || t === 'underline' || t === 'strike') {
    const sp = span(), r = sp && sp.getBoundingClientRect();
    if (t === 'highlight') { kind = 'bar'; w = 3; h = r ? r.height : 14; if (r) cy = r.top + r.height / 2; }
    else { kind = 'bar'; w = 14; h = 2; if (r) cy = t === 'underline' ? r.bottom - 1 : r.top + r.height * 0.55; }
  } else { hoverHide(); return; }
  el.className = 'v-hover ' + kind + (soft ? ' soft' : '');
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.style.background = color;
  el.style.left = cx + 'px';
  el.style.top = cy + 'px';
  el.hidden = false;
}
(() => {
  const sc = $('#vScroll');
  sc.addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'pen' || ev.buttons) return;
    HOVER.x = ev.clientX; HOVER.y = ev.clientY;
    if (!HOVER.raf) HOVER.raf = requestAnimationFrame(hoverPreview);
  }, { passive: true });
  sc.addEventListener('pointerdown', hoverHide, true);
  sc.addEventListener('pointerleave', hoverHide);
  sc.addEventListener('scroll', () => { if (HOVER.el && !HOVER.el.hidden) hoverHide(); }, { passive: true });
})();

/* ---- markup tools */
// A floating palette: read (select text), highlighter, pen; colours and
// sizes for the tool; undo, redo and delete. It can be dragged anywhere
// and tucked away into a small button.
// The highlight button (text or freehand) and the underline button
// (underline or strike-through).
const MARKUP_TOOLS = new Set(['highlight', 'underline', 'strike']);
const LINE_TOOLS = new Set(['underline', 'strike']);
const markupTool = () => 'highlight';
const lineTool = () => MARK.lineKind;
const toolOn = (btn, tool) => (btn === 'markup' ? tool === 'highlight' : btn === 'lines' ? LINE_TOOLS.has(tool) : btn === tool);
const TEXT_SIZES = [10, 14, 20];
// Finish a text box being typed in (PDF.js commits one when it loses focus).
function commitTextBox() {
  if (!V.ui) return;
  document.querySelectorAll('#vPages .freeTextEditor').forEach(div => {
    const box = div.querySelector('[contenteditable="true"]');
    if (!box) return;
    const ed = V.ui.getEditor(div.id);
    try { if (ed) ed.commitOrRemove(); } catch (err) { /* leave it */ }
  });
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.freeTextEditor')) document.activeElement.blur();
}
// The text tool: the new box takes the keyboard during the tap itself, as
// Safari on the iPad only shows the keyboard for a box focused then (PDF.js
// focuses it a moment later, and the empty box is then dropped).
$('#vScroll').addEventListener('pointerup', () => {
  if (V.tool !== 'text') return;
  const box = Array.from(document.querySelectorAll('#vPages .freeTextEditor [contenteditable="true"]')).pop();
  if (box && document.activeElement !== box) box.focus({ preventScroll: true });
});
function setTool(tool) {
  if (tool !== 'read') hideQuote();
  if (tool === 'read') fingerMode(false);
  if (tool === 'markup') tool = markupTool();
  if (tool === 'lines') tool = lineTool();
  if (V.tool === 'text' && tool !== 'text') commitTextBox();
  // (The highlighter put down goes back to highlighting text, unless this
  // paper keeps it freehand: see freehandHere.)
  if (V.tool === 'highlight' && tool !== 'highlight' && MARK.markKind === 'free' && !freehandHere()) { MARK.markKind = 'highlight'; MARK.hlMode = 'text'; store.set('hlMode', 'text'); }
  V.tool = tool;
  V.fromRead = false;
  if (tool === 'highlight') MARK.hlMode = MARK.markKind === 'free' ? 'free' : 'text';
  hidePanel();
  hideRegionMenu();
  if (!$('#vComment').hidden) closeComment(true);
  $('#viewer').dataset.markup = tool;
  $('#viewer').dataset.hl = MARK.hlMode;
  // (Nothing stays picked up under the eraser: a mark just drawn with the
  // pen is still selected, and would move with the Pencil.)
  if (tool === 'eraser' && V.ui) { try { V.ui.unselectAll(); } catch (err) { /* nothing selected */ } }
  eraserTouch(tool !== 'read');
  document.querySelectorAll('#vPalette [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(toolOn(b.dataset.tool, tool))));
  if (tool !== 'read') store.set('lastTool', tool);
  paletteOptions();
  if (!V.viewer || !V.doc) return;
  const T = V.lib.AnnotationEditorType;
  const mode = tool === 'highlight' ? T.HIGHLIGHT : tool === 'text' ? T.FREETEXT : tool === 'read' ? T.NONE : T.INK;
  try {
    // The pen and the eraser share PDF.js's ink mode; strokes drawn with
    // the pen only become marks the eraser can find once PDF.js commits
    // them, which it does on a change of mode, so go through "none".
    if (tool !== 'pen' && mode === T.INK && V.viewer.annotationEditorMode === T.INK) {
      commitDrawing().then(() => { if (V.tool === tool && V.doc) V.viewer.annotationEditorMode = { mode: T.INK }; });
    } else {
      V.viewer.annotationEditorMode = { mode };
    }
  } catch (err) { /* not ready yet; the mode is set again on the next tap */ }
}
// Cursors: crosshairs with a dot in the ink (or highlight) colour, and the
// ordinary text cursor over text in highlighter mode.
function crosshair(color, dot) {
  const r = Math.max(2, Math.min(6, dot));
  const svg = `<svg xmlns="http:\/\/www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<g stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></g>` +
    `<g stroke="#222" stroke-width="1.2" stroke-linecap="round"><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></g>` +
    `<circle cx="12" cy="12" r="${r}" fill="${color}" stroke="#fff" stroke-width="1.2"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
}
function updateCursors() {
  const v = $('#viewer');
  v.style.setProperty('--pen-cursor', crosshair(MARK.penColor, MARK.penSize + 1));
  v.style.setProperty('--hl-cursor', crosshair(MARK.hlColor, 4));
  v.style.setProperty('--hl-color', MARK.hlColor);
  v.style.setProperty('--line-color', MARK.lineColor);
  const er = MARK.eraserSize, sz = er * 2 + 6, c = sz / 2;
  const ring = `<svg xmlns="http:\/\/www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><circle cx="${c}" cy="${c}" r="${er}" fill="rgba(255,255,255,.35)" stroke="#fff" stroke-width="3"/><circle cx="${c}" cy="${c}" r="${er}" fill="none" stroke="#222" stroke-width="1.3"/></svg>`;
  v.style.setProperty('--eraser-cursor', `url("data:image/svg+xml,${encodeURIComponent(ring)}") ${c} ${c}, cell`);
}
function applyMarkParams() {
  updateCursors();
  if (!V.bus) return;
  const P = V.lib.AnnotationEditorParamsType;
  const param = (type, value) => V.bus.dispatch('switchannotationeditorparams', { source: null, type, value });
  if (V.tool === 'pen') { param(P.INK_COLOR, MARK.penColor); param(P.INK_THICKNESS, MARK.penSize); param(P.INK_OPACITY, 1); }
  if (V.tool === 'highlight' || V.tool === 'comment') param(P.HIGHLIGHT_COLOR, MARK.hlColor);
  if (V.tool === 'text') { param(P.FREETEXT_COLOR, MARK.textColor); param(P.FREETEXT_SIZE, MARK.textSize); }
}
const KIND_ICONS = {
  highlight: '<svg class="i" viewBox="0 0 24 24"><path d="M14.5 4.5l5 5-7.5 7.5H7v-5z"/><path d="M4 20.5h9"/><path d="M11 8l5 5"/></svg>',
  free: '<svg class="i" viewBox="0 0 24 24"><path d="M4 16c3-6 5-6 7-2s4 4 9-4"/><path d="M4 20.5h16" opacity=".4"/></svg>',
  underline: '<svg class="i" viewBox="0 0 24 24"><path d="M7 4v6a5 5 0 0 0 10 0V4"/><path d="M5 20h14"/></svg>',
  strike: '<svg class="i" viewBox="0 0 24 24"><path d="M16.5 7.5C16 5.6 14.3 4.5 12 4.5c-2.8 0-4.5 1.5-4.5 3.4 0 4.2 9.4 2.6 9.4 7.4 0 2.2-2 3.7-4.9 3.7-2.6 0-4.6-1.3-5-3.3"/><path d="M4 12h16"/></svg>',
};
const KINDS = [['highlight', 'Highlight text'], ['free', 'Freehand highlight'], ['underline', 'Underline'], ['strike', 'Strike through']];
// The style button shows the tool's colour (or the eraser's size); it opens
// a small panel beside the toolbar with the tool's choices, so the toolbar
// itself stays one row (or one column) of buttons.
function toolColor() {
  const t = V.tool;
  return t === 'pen' ? MARK.penColor : t === 'underline' || t === 'strike' ? MARK.lineColor : t === 'text' ? MARK.textColor : MARK.hlColor;
}
// The other kind of the highlighter (text or freehand) or the underline
// tool (underline or strike-through), switched to by holding its button.
const altKindOf = btn => (btn === 'markup' ? (MARK.markKind === 'free' ? 'highlight' : 'free') : MARK.lineKind === 'strike' ? 'underline' : 'strike');
const kindName = k => KINDS.find(([x]) => x === k)[1];
function setKind(kind) {
  if (kind === 'underline' || kind === 'strike') { MARK.lineKind = kind; store.set('lineKind', kind); setTool(kind); }
  else {
    // (Chosen for the paper open: kept for it.)
    if (V.file) { if (kind === 'free') FREEHAND.add(V.file.id); else FREEHAND.delete(V.file.id); store.set('freehandPapers', [...FREEHAND].slice(-300)); }
    MARK.markKind = kind; MARK.hlMode = kind === 'free' ? 'free' : 'text'; store.set('hlMode', MARK.hlMode); setTool('highlight');
  }
}
// Papers whose highlighter is freehand: those where you chose it (kept,
// across putting it down and opening the paper again), and those with no
// text to highlight (a scan without a text layer), found when they open.
// Elsewhere it starts as the text highlighter.
const FREEHAND = new Set(store.get('freehandPapers', []));
const freehandHere = () => !!(V.file && (FREEHAND.has(V.file.id) || V.noText));
async function highlighterFor(doc, file) {
  V.noText = false;
  // (Text on the first few pages: enough to say the paper has some.)
  let chars = 0;
  for (let n = 1; n <= Math.min(3, doc.numPages) && chars < 40; n++) {
    try { chars += (await (await doc.getPage(n)).getTextContent()).items.reduce((k, it) => k + (it.str || '').trim().length, 0); } catch (err) { chars = 40; }
  }
  if (doc !== V.doc || V.file !== file) return;
  V.noText = chars < 40;
  const free = freehandHere();
  if (free === (MARK.markKind === 'free')) return;
  MARK.markKind = free ? 'free' : 'highlight';
  MARK.hlMode = free ? 'free' : 'text';
  if (V.tool === 'highlight') setTool('highlight');
  else paletteOptions();
}
function paletteOptions() {
  const t = V.tool, grp = $('#vpStyleGrp'), b = $('#vpStyle');
  grp.hidden = t === 'read' || t === 'select';
  // Each button shows its kind (its icon, a dot for the less usual one, and
  // its name), and says how to have the other.
  [['#vpMarkup', 'markup', MARK.markKind, 'free', 'H'], ['#vpLines', 'lines', MARK.lineKind, 'strike', 'U']].forEach(([sel, btn, kind, odd, key]) => {
    const b = $(sel);
    b.innerHTML = KIND_ICONS[kind] || KIND_ICONS[btn === 'markup' ? 'highlight' : 'underline'];
    b.classList.toggle('odd-kind', kind === odd);
    b.title = kindName(kind) + ' (' + key + '). Hold for ' + kindName(altKindOf(btn)).toLowerCase() + '.';
    b.setAttribute('aria-label', kindName(kind) + '; hold for ' + kindName(altKindOf(btn)).toLowerCase());
  });
  if (grp.hidden) { hidePanel(); return; }
  b.querySelector('i').className = t === 'eraser' ? 'ring' : t === 'text' ? 'aa' : 'dot';
  b.querySelector('i').style.setProperty('--sw', toolColor());
  b.querySelector('i').style.setProperty('--d', t === 'eraser' ? (6 + ERASER_SIZES.indexOf(MARK.eraserSize) * 5) + 'px' : '14px');
  b.querySelector('i').textContent = t === 'text' ? 'A' : '';
  if (!$('#vpPanel').hidden) renderPanel();
}
function renderPanel() {
  const t = V.tool, box = $('#vpPanel');
  const sw = (list, cur) => `<div class="vpp-row">` + list.map(([n, c]) => `<button type="button" class="vp-sw${c === cur ? ' on' : ''}" data-color="${c}" title="${n}" aria-label="${n}" style="--sw:${c}"></button>`).join('') + `</div>`;
  let h = '';
  if (MARKUP_TOOLS.has(t)) {
    // (The other kind: hold the tool's button.)
    h += t === 'highlight' ? sw(HL_COLORS, MARK.hlColor) : sw(PEN_COLORS, MARK.lineColor);
  } else if (t === 'pen') {
    h += sw(PEN_COLORS, MARK.penColor) + `<div class="vpp-row">` + PEN_SIZES.map((z, i) => `<button type="button" class="vp-size${z === MARK.penSize ? ' on' : ''}" data-size="${z}" title="${['Fine', 'Medium', 'Thick'][i]}" aria-label="${['Fine', 'Medium', 'Thick'][i]}"><i style="--d:${3 + z * 2}px"></i></button>`).join('') + `</div>`;
  } else if (t === 'text') {
    h += sw(PEN_COLORS, MARK.textColor) + `<div class="vpp-row">` + TEXT_SIZES.map((z, i) => `<button type="button" class="vp-size vp-tsize${z === MARK.textSize ? ' on' : ''}" data-tsize="${z}" title="${['Small', 'Medium', 'Large'][i]} text" aria-label="${['Small', 'Medium', 'Large'][i]} text" style="font-size:${10 + i * 4}px">A</button>`).join('') + `</div>`;
  } else if (t === 'comment') {
    h += sw(HL_COLORS, MARK.hlColor);
  } else if (t === 'eraser') {
    h += `<div class="vpp-row"><button type="button" class="vp-mode${MARK.eraserMode === 'part' ? ' on' : ''}" data-ermode="part" title="Rub out parts of marks" aria-label="Rub out parts of marks"><svg class="i" viewBox="0 0 24 24"><path d="M4 15c3-6 5-6 7-2"/><path d="M15 11c2-2 3-3 5-5" stroke-dasharray="2 3"/></svg></button>` +
      `<button type="button" class="vp-mode${MARK.eraserMode === 'whole' ? ' on' : ''}" data-ermode="whole" title="Remove whole marks" aria-label="Remove whole marks"><svg class="i" viewBox="0 0 24 24"><path d="M4 16c3-6 5-6 7-2s4 4 9-4" stroke-dasharray="2 3"/></svg></button></div>` +
      `<div class="vpp-row">` + ERASER_SIZES.map((r, i) => `<button type="button" class="vp-size${r === MARK.eraserSize ? ' on' : ''}" data-ersize="${r}" title="${['Small', 'Medium', 'Large'][i]} eraser" aria-label="${['Small', 'Medium', 'Large'][i]} eraser"><i class="ring" style="--d:${6 + i * 5}px"></i></button>`).join('') + `</div>`;
  }
  box.innerHTML = h;
  placePanel();
}
function placePanel() {
  const box = $('#vpPanel'), pal = $('#vPalette');
  if (box.hidden || pal.hidden) return;
  const body = $('.v-body').getBoundingClientRect(), pr = pal.getBoundingClientRect(), sr = $('#vpStyle').getBoundingClientRect();
  const w = box.offsetWidth, h = box.offsetHeight;
  let left, top;
  if (pal.classList.contains('vertical')) {
    left = pal.dataset.dock === 'right' ? pr.left - w - 8 : pr.right + 8;
    top = sr.top - 6;
  } else {
    left = sr.left + sr.width / 2 - w / 2;
    top = pr.top + pr.height / 2 > body.top + body.height / 2 ? pr.top - h - 8 : pr.bottom + 8;
  }
  box.style.left = Math.max(8, Math.min(body.width - w - 8, left - body.left)) + 'px';
  box.style.top = Math.max(8, Math.min(body.height - h - 8, top - body.top)) + 'px';
}
function hidePanel() {
  const box = $('#vpPanel');
  if (!box) return;
  box.hidden = true;
  $('#vpStyle').setAttribute('aria-expanded', 'false');
}
// Hold the highlighter or the underline button (or right-click it) for its
// other kind, picked up at once; a tap still picks it up or puts it down.
(() => {
  let hold = null, swapped = 0;
  const swap = btn => {
    swapped = Date.now();
    // (Any selection the long press began goes.)
    try { getSelection().removeAllRanges(); } catch (err) { /* none */ }
    if (V.tool === 'pen') endStrokes();
    const kind = altKindOf(btn);
    setKind(kind);
    paletteOptions();
    applyMarkParams();
    saveToolPrefs();
    toast(kindName(kind), 1400);
  };
  const stopClick = () => {
    const stop = e => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, true), 600);
  };
  ['#vpMarkup', '#vpLines'].forEach(sel => {
    const b = $(sel), btn = b.dataset.tool;
    b.addEventListener('pointerdown', ev => {
      if (ev.button > 0) return;
      clearTimeout(hold && hold.t);
      hold = { x: ev.clientX, y: ev.clientY, t: setTimeout(() => { hold = null; stopClick(); swap(btn); }, 450) };
    });
    b.addEventListener('pointermove', ev => { if (hold && Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > 10) { clearTimeout(hold.t); hold = null; } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => b.addEventListener(t, () => { if (hold) { clearTimeout(hold.t); hold = null; } }));
    // (A long press can also send a right-click: not a second switch.)
    b.addEventListener('contextmenu', ev => { ev.preventDefault(); if (Date.now() - swapped > 800) swap(btn); });
    b.addEventListener('selectstart', ev => ev.preventDefault());
  });
})();
$('#vpStyle').addEventListener('click', () => {
  const box = $('#vpPanel');
  if (!box.hidden) { hidePanel(); return; }
  box.hidden = false;
  $('#vpStyle').setAttribute('aria-expanded', 'true');
  renderPanel();
});
document.addEventListener('pointerdown', ev => {
  if ($('#vpPanel').hidden || ev.target.closest('#vpPanel, #vpStyle')) return;
  hidePanel();
}, true);
$('#vpPanel').addEventListener('click', ev => {
  const t = V.tool;
  // The toolbox sets the colour and size of the next mark: the drawing in
  // progress is finished first, and nothing selected takes the change.
  if (ev.target.closest('[data-color], [data-size], [data-tsize]')) {
    if (t === 'pen') endStrokes();
    if (V.ui) V.ui.unselectAll();
  }
  const c = ev.target.closest('[data-color]');
  if (c) {
    const v = c.dataset.color;
    if (t === 'pen') { MARK.penColor = v; store.set('penColor', v); }
    else if (t === 'underline' || t === 'strike') { MARK.lineColor = v; store.set('lineColor', v); }
    else if (t === 'text') { MARK.textColor = v; store.set('textColor', v); }
    else { MARK.hlColor = v; store.set('hlColor', v); }
  }
  const z = ev.target.closest('[data-size]');
  if (z) { MARK.penSize = +z.dataset.size; store.set('penSize', MARK.penSize); }
  const ts = ev.target.closest('[data-tsize]');
  if (ts) { MARK.textSize = +ts.dataset.tsize; store.set('textSize', MARK.textSize); }
  const em = ev.target.closest('[data-ermode]');
  if (em) { MARK.eraserMode = em.dataset.ermode; store.set('eraserMode', MARK.eraserMode); }
  const es = ev.target.closest('[data-ersize]');
  if (es) { MARK.eraserSize = +es.dataset.ersize; store.set('eraserSize', MARK.eraserSize); }
  paletteOptions();
  renderPanel();
  applyMarkParams();
  saveToolPrefs();
});
// The tools' colours, sizes and kinds are kept on this device and with your
// Google account (so they survive LibLande being updated).
const TOOL_PREFS = ['penColor', 'penSize', 'hlColor', 'hlMode', 'lineKind', 'lineColor', 'textColor', 'textSize', 'eraserMode', 'eraserSize'];
let toolPrefsTimer = 0;
function saveToolPrefs() {
  clearTimeout(toolPrefsTimer);
  toolPrefsTimer = setTimeout(() => {
    if (!gs || !window.google || !google.script || !google.script.run) return;
    const tools = {};
    TOOL_PREFS.forEach(k => { tools[k] = MARK[k]; });
    google.script.run.withFailureHandler(() => {}).savePrefs({ tools });
  }, 1500);
}
function applyToolPrefs(tools) {
  if (!tools) return;
  TOOL_PREFS.forEach(k => { if (tools[k] != null) { MARK[k] = tools[k]; store.set(k, tools[k]); } });
  MARK.markKind = MARK.hlMode === 'free' ? 'free' : 'highlight';
  if (V.viewer) { paletteOptions(); applyMarkParams(); }
}
// (The Delete button comes only for a selection that lasts: a new mark is
// selected for an instant as it's made, and the toolbar would flicker.)
let DELETE_TIMER = 0;
function paletteState() {
  $('#vpUndo').disabled = !V.canUndo;
  $('#vpRedo').disabled = !V.canRedo;
  clearTimeout(DELETE_TIMER);
  if (!V.selected) $('#vpDelete').hidden = true;
  else if ($('#vpDelete').hidden) DELETE_TIMER = setTimeout(() => { $('#vpDelete').hidden = !V.selected; }, 250);
}
// Shows or hides the toolbar (or its pencil button) with a short fade;
// what's going away stays in place until it has faded.
function fadeShown(el, show) {
  clearTimeout(el.fadeTimer);
  if (show) {
    el.classList.remove('leaving');
    if (!el.hidden) return;
    el.hidden = false;
    el.classList.add('entering');
    void el.offsetWidth;
    el.classList.remove('entering');
  } else if (!el.hidden) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || $('#viewer').hidden) { el.hidden = true; return; }
    el.classList.add('leaving');
    el.fadeTimer = setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); }, 520);
  }
}
function showPalette() {
  const open = store.get('paletteOpen', true), pill = $('#vpShow');
  fadeShown($('#vPalette'), gs && open);
  // (Tucked away: the small button comes once the toolbar is on its way.)
  clearTimeout(pill.waitTimer);
  if (gs && !open && pill.hidden && !$('#vPalette').hidden) pill.waitTimer = setTimeout(() => fadeShown(pill, store.get('paletteOpen', true) === false), 300);
  else fadeShown(pill, gs && !open);
  placePalette();
  paletteState();
  placePanel();
  if (!$('#vBack').hidden) showBack();
}
// Where the toolbar is kept is saved with your Google account too (one
// place for iPad, one for iPhone, one for a computer), so it's where you
// left it after LibLande is updated and in any browser on that device.
const deviceKind = () => /iPhone|iPod/.test(navigator.userAgent) ? 'iphone'
  : /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ipad' : 'desktop';
function savePalettePlace() {
  if (!gs || !window.google || !google.script || !google.script.run) return;
  google.script.run.withFailureHandler(() => {}).savePrefs({ ['palette.' + deviceKind()]: { pos: store.get('palettePos', null), snap: store.get('paletteSnap', 'bottom'), pencil: !!store.get('pencil', false) } });
}
// Dragged near the left or right edge of the pages (beside the sidebar,
// if it's open; on a screen at least 600px wide), the palette snaps there
// as a column; dragged well away again, it's a row. (Two distances, so it
// doesn't flicker between the two along the line.)
const DOCK_EDGE = 90, UNDOCK_EDGE = 150;
const canDock = () => window.innerWidth >= 600;
function placePalette() {
  if (phoneMQ.matches) {
    const top = store.get('paletteSnap', 'bottom') === 'top';
    [$('#vPalette'), $('#vpShow')].forEach(el => {
      el.classList.remove('vertical', 'placed');
      el.dataset.dock = '';
      el.style.left = el.style.top = '';
      el.classList.toggle('at-top', top);
    });
    return;
  }
  [$('#vPalette'), $('#vpShow')].forEach(el => el.classList.remove('at-top'));
  const pos = store.get('palettePos', null);
  const dock = pos && canDock() ? pos.dock || null : null;
  [$('#vPalette'), $('#vpShow')].forEach(el => {
    el.classList.toggle('vertical', !!dock && el.id === 'vPalette');
    el.dataset.dock = dock || '';
    if (!pos) { el.style.left = el.style.top = ''; el.classList.remove('placed'); return; }
    el.classList.add('placed');
    // Positions are within the page area (below the reader's top bar).
    const body = $('.v-body'), W = body.clientWidth, H = body.clientHeight, w = el.offsetWidth || 60, h = el.offsetHeight || 44;
    const inset = $('#viewer').classList.contains('side-open') ? $('#vSide').offsetWidth : 0;
    const left = dock === 'left' ? inset + 8 : dock === 'right' ? W - w - 8 : pos.x * W;
    el.style.left = Math.max(inset + 8, Math.min(W - w - 8, left)) + 'px';
    const top = $('#vTop').offsetHeight + 8;
    el.style.top = Math.max(top, Math.min(H - h - 8, pos.y * H)) + 'px';
  });
}
// (Menus are placed to be seen whole: placeMenu.)
// (What pressed a tool: a finger, the Pencil or the mouse; see FINGER.)
$('#vPalette').addEventListener('pointerdown', ev => { FINGER.by = ev.pointerType; }, true);
$('#vPalette').addEventListener('click', ev => {
  const t = ev.target.closest('button[data-tool]');
  // Pressing the tool in use again puts it down (back to reading).
  if (t) {
    $('#vPalette').classList.remove('more-open');
    $('#vpMore').setAttribute('aria-expanded', 'false');
    const on = toolOn(t.dataset.tool, V.tool);
    if (!on) fingerMode(FINGER.by === 'touch' && (V.pencil || FINGER.on));
    setTool(on ? 'read' : t.dataset.tool);
    return;
  }
  const act = ev.target.closest('#vpUndo, #vpRedo, #vpDelete');
  if (act && V.bus) V.bus.dispatch('editingaction', { source: null, name: { vpUndo: 'undo', vpRedo: 'redo', vpDelete: 'delete' }[act.id] });
  if (ev.target.closest('#vpMin')) tuckPalette(false);
});
// On a phone, More shows the less-used tools in the toolbar until one is
// picked (or More is pressed again).
$('#vpMore').addEventListener('click', () => {
  const open = $('#vPalette').classList.toggle('more-open');
  $('#vpMore').setAttribute('aria-expanded', String(open));
  placePanel();
});
// Swipes: a quick flick of the toolbar towards its edge tucks it away; a
// swipe in from that edge brings it back. Its edge: the side it's docked
// at, else the top or bottom, whichever it's nearer. (The grip still moves
// it; a flick isn't a tap on the button it started on.)
function paletteEdge() {
  const p = $('#vPalette'), dock = p.dataset.dock;
  if (dock) return dock;
  const r = (p.hidden ? $('#vpShow') : p).getBoundingClientRect();
  if (!r.height) return store.get('paletteSnap', 'bottom') === 'top' ? 'top' : 'bottom';
  return r.top + r.height / 2 < innerHeight / 2 ? 'top' : 'bottom';
}
function tuckPalette(open) {
  $('#vPalette').dataset.edge = paletteEdge();
  if (!open) hidePanel();
  store.set('paletteOpen', open);
  showPalette();
}
(() => {
  const FLICK = 40, QUICK = 400, EDGE = 28;
  const toward = (edge, dx, dy) => ({ left: -dx, right: dx, top: -dy, bottom: dy })[edge];
  const across = (edge, dx, dy) => (edge === 'left' || edge === 'right' ? Math.abs(dy) : Math.abs(dx));
  let f = null;
  $('#vPalette').addEventListener('pointerdown', ev => {
    f = ev.target.closest('#vpGrip') ? null : { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId };
  }, true);
  // (A flick can start a little way out from it too, on the page: with a
  // finger, so a Pencil stroke near it isn't taken for one.)
  const NEAR = 48;
  $('#vScroll').addEventListener('pointerdown', ev => {
    const p = $('#vPalette');
    if (p.hidden || ev.pointerType !== 'touch' || ev.target.closest('#vPalette')) return;
    const r = p.getBoundingClientRect();
    if (ev.clientX >= r.left - NEAR && ev.clientX <= r.right + NEAR && ev.clientY >= r.top - NEAR && ev.clientY <= r.bottom + NEAR) {
      f = { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId, near: true };
    }
  }, true);
  window.addEventListener('pointerup', ev => {
    const s = f;
    f = null;
    if (!s || s.id !== ev.pointerId || $('#vPalette').hidden) return;
    const dx = ev.clientX - s.x, dy = ev.clientY - s.y, edge = paletteEdge();
    if (performance.now() - s.t > QUICK || toward(edge, dx, dy) < FLICK || across(edge, dx, dy) > toward(edge, dx, dy) * 0.8) return;
    // (Not the tap on whatever button the flick began on.)
    if (!s.near) {
      const stop = e => { e.stopPropagation(); e.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, true), 400);
    }
    tuckPalette(false);
  }, true);
  // In from the edge: a swipe starting at the edge of the page area, while
  // the toolbar's tucked away.
  let e0 = null;
  $('#vScroll').addEventListener('pointerdown', ev => {
    e0 = null;
    if (!gs || !$('#vPalette').hidden || ev.pointerType === 'mouse') return;
    const r = $('#vScroll').getBoundingClientRect(), edge = paletteEdge();
    const d = { left: ev.clientX - r.left, right: r.right - ev.clientX, top: ev.clientY - Math.max(r.top, $('#vTop').getBoundingClientRect().bottom), bottom: r.bottom - ev.clientY }[edge];
    if (d >= 0 && d <= EDGE) e0 = { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId, edge };
  }, true);
  window.addEventListener('pointermove', ev => {
    if (!e0 || e0.id !== ev.pointerId) return;
    const dx = ev.clientX - e0.x, dy = ev.clientY - e0.y, away = -toward(e0.edge, dx, dy);
    if (performance.now() - e0.t > 700) { e0 = null; return; }
    if (away >= FLICK && across(e0.edge, dx, dy) < away) { e0 = null; tuckPalette(true); }
  }, true);
  window.addEventListener('pointerup', () => { e0 = null; }, true);
})();
$('#vpShow').addEventListener('click', ev => {
  if ($('#vpShow').dataset.dragged) { delete $('#vpShow').dataset.dragged; return; }
  tuckPalette(true);
});
// On a phone: the toolbar follows the finger (moved, not re-laid out, so it
// keeps up), then glides to the top or the bottom, whichever is nearer.
function snapDrag(ev, h, box, isShow) {
  const x0 = ev.clientX, y0 = ev.clientY, base = isShow ? '' : 'translateX(-50%) ';
  let moved = false;
  try { h.setPointerCapture(ev.pointerId); } catch (err) { /* fine without */ }
  const move = e => {
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { moved = true; hidePanel(); box.style.transition = 'none'; }
    box.style.transform = `${base}translate(${dx}px, ${dy}px)`;
  };
  const up = e => {
    h.removeEventListener('pointermove', move);
    h.removeEventListener('pointerup', up);
    h.removeEventListener('pointercancel', up);
    if (!moved) return;
    if (isShow) h.dataset.dragged = '1';
    const b = $('.v-body').getBoundingClientRect();
    const before = box.getBoundingClientRect();
    store.set('paletteSnap', e.clientY < b.top + b.height / 2 ? 'top' : 'bottom');
    savePalettePlace();
    box.style.transform = '';
    placePalette();
    const after = box.getBoundingClientRect();
    // From where it was let go to its place.
    box.style.transform = `${base}translate(${before.left - after.left}px, ${before.top - after.top}px)`;
    void box.offsetWidth;
    box.style.transition = 'transform .22s ease';
    box.style.transform = '';
    setTimeout(() => { box.style.transition = ''; }, 260);
  };
  h.addEventListener('pointermove', move);
  h.addEventListener('pointerup', up);
  h.addEventListener('pointercancel', up);
}
// Drag the palette by its grip (or the tucked-away button).
[['#vpGrip', '#vPalette'], ['#vpShow', '#vpShow']].forEach(([handle, boxSel]) => {
  const h = $(handle);
  h.addEventListener('pointerdown', ev => {
    if (phoneMQ.matches) { snapDrag(ev, h, $(boxSel), handle === '#vpShow'); return; }
    const box = $(boxSel), r = box.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top, x0 = ev.clientX, y0 = ev.clientY;
    let moved = false, frame = 0, last = null, dock = box.dataset.dock || null;
    try { h.setPointerCapture(ev.pointerId); } catch (err) { /* fine without */ }
    // (At most once a frame.)
    const place = () => {
      frame = 0;
      const e = last, b = $('.v-body').getBoundingClientRect(), W = b.width, H = b.height;
      const x = e.clientX - b.left, y = e.clientY - b.top;
      const inset = $('#viewer').classList.contains('side-open') ? $('#vSide').offsetWidth : 0;
      const fromLeft = x - inset, fromRight = W - x;
      const was = dock;
      if (!canDock()) dock = null;
      else if (dock === 'left' && fromLeft > UNDOCK_EDGE) dock = null;
      else if (dock === 'right' && fromRight > UNDOCK_EDGE) dock = null;
      if (!dock && canDock()) dock = fromLeft < DOCK_EDGE ? 'left' : fromRight < DOCK_EDGE ? 'right' : null;
      // Turning from a row to a column (or back), it glides there.
      if (dock !== was) {
        box.classList.add('snapping');
        clearTimeout(box.snapTimer);
        box.snapTimer = setTimeout(() => box.classList.remove('snapping'), 220);
      }
      // Docked, the grip is at the top of the column, so follow the pointer.
      store.set('palettePos', dock
        ? { x: (x - dx) / W, y: (y - Math.min(dy, 18)) / H, dock }
        : { x: (x - Math.min(dx, 14)) / W, y: (y - dy) / H });
      placePalette();
    };
    const move = e => {
      if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
      if (!moved) hidePanel();
      moved = true;
      last = e;
      if (!frame) frame = requestAnimationFrame(place);
    };
    const up = () => {
      if (frame) { cancelAnimationFrame(frame); place(); }
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      if (moved && handle === '#vpShow') h.dataset.dragged = '1';
      if (moved) savePalettePlace();
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  });
});
window.addEventListener('resize', () => { if (!$('#viewer').hidden) placePalette(); });

// Apple Pencil: once LibLande sees the Pencil, fingers scroll and zoom
// while a tool is on, and the Pencil draws (the Pencil's squeeze and
// double-tap aren't available to web pages). A tool is only ever on when
// you choose it. The device remembers it has a Pencil (with your account
// too), so one finger scrolls from the start.
// Pen strokes. PDF.js keeps adding strokes to one drawing until its drawing
// session ends, however far apart they are (one drawing then spans the
// page: pressing anywhere in it picks it all up, and a new pen colour
// changes it). So the drawing is finished when the next stroke starts well
// away from it (80 px), after a pause (1.5 s), or before the toolbox's pen
// colour or size changes.
const STROKES = { box: null, cur: null, timer: 0 };
function endStrokes() {
  clearTimeout(STROKES.timer);
  STROKES.box = STROKES.cur = null;
  if (!V.ui || !V.doc) return;
  for (let i = 0; i < V.doc.numPages; i++) {
    const layer = V.ui.getLayer(i);
    if (layer && layer.commitOrRemove) layer.commitOrRemove();
  }
}
(() => {
  const sc = $('#vScroll');
  // (In page terms, so scrolling doesn't move it.)
  const at = ev => [ev.clientX + sc.scrollLeft, ev.clientY + sc.scrollTop];
  const drawing = ev => V.tool === 'pen' && ev.button <= 0 && !(ev.pointerType === 'touch' && V.pencil) && !(ev.target.closest && ev.target.closest('.editToolbar, .note-pin'));
  // Before PDF.js (or LibLande, for a press on a drawing) starts the stroke.
  sc.addEventListener('pointerdown', ev => {
    if (!drawing(ev)) return;
    clearTimeout(STROKES.timer);
    const [x, y] = at(ev), b = STROKES.box, far = 80;
    if (b && (x < b.l - far || x > b.r + far || y < b.t - far || y > b.b + far)) endStrokes();
    STROKES.cur = { id: ev.pointerId, l: x, r: x, t: y, b: y };
  }, true);
  sc.addEventListener('pointermove', ev => {
    const c = STROKES.cur;
    if (!c || ev.pointerId !== c.id) return;
    const [x, y] = at(ev);
    c.l = Math.min(c.l, x); c.r = Math.max(c.r, x); c.t = Math.min(c.t, y); c.b = Math.max(c.b, y);
  }, { capture: true, passive: true });
  window.addEventListener('pointerup', ev => {
    const c = STROKES.cur;
    if (!c || ev.pointerId !== c.id) return;
    STROKES.cur = null;
    const b = STROKES.box;
    STROKES.box = b ? { l: Math.min(b.l, c.l), r: Math.max(b.r, c.r), t: Math.min(b.t, c.t), b: Math.max(b.b, c.b) } : c;
    STROKES.timer = setTimeout(endStrokes, 1500);
  }, true);
})();
// A tool chosen with a finger is used with a finger, even where there's a
// Pencil (as on a phone: one finger marks, two scroll); chosen with the
// Pencil, the Pencil marks and fingers scroll. Putting the tool down, or
// using the Pencil, goes back to the Pencil's way.
const FINGER = { on: false, by: '' };
function fingerMode(on) {
  if (!on && !FINGER.on) return;
  FINGER.on = !!on;
  V.pencil = !on && matchMedia('(pointer: coarse)').matches && store.get('pencil', false);
  $('#viewer').classList.toggle('pencil', V.pencil);
}
(() => {
  const sc = $('#vScroll');
  if (matchMedia('(pointer: coarse)').matches && store.get('pencil', false)) { V.pencil = true; $('#viewer').classList.add('pencil'); }
  const pencilOn = () => {
    if (V.pencil) return;
    FINGER.on = false;
    V.pencil = true;
    $('#viewer').classList.add('pencil');
    store.set('pencil', true);
    savePalettePlace();
  };
  sc.addEventListener('pointermove', ev => { if (ev.pointerType === 'pen' && ev.buttons) pencilOn(ev); }, { capture: true, passive: true });
  sc.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'pen') pencilOn(ev);
    else if (ev.pointerType === 'touch' && V.pencil && V.tool !== 'read') ev.stopPropagation();
  }, { capture: true });
})();
// Stops the Pencil from scrolling while a tool is on. It's attached only
// then: a listener that can cancel touches makes Safari wait for it before
// every scroll.
const stylusStop = ev => {
  // Not on buttons and text fields: cancelling the touch would stop the
  // Pencil's tap from becoming a click.
  if (ev.target.closest && ev.target.closest('button, a, input, textarea, select, [contenteditable="true"], .editToolbar, .note-pin')) return;
  if (V.tool !== 'read' && Array.from(ev.changedTouches).some(t => t.touchType === 'stylus')) ev.preventDefault();
};
// With a markup tool on, one finger marks the page and two fingers scroll
// it (whatever the first finger had started is dropped). With the Pencil,
// fingers scroll anyway.
const PAN = { on: false, used: false, x: 0, y: 0, pid: null, target: null, down: new Set() };
// The first finger down (the one whose stroke a second finger cancels).
$('#vScroll').addEventListener('pointerdown', ev => {
  if (ev.pointerType !== 'touch') { if (!PAN.on) PAN.used = false; return; }
  if (!PAN.down.size && !PAN.on) { PAN.used = false; PAN.pid = ev.pointerId; PAN.target = ev.target; }
  PAN.down.add(ev.pointerId);
}, true);
['pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, ev => { if (ev.isTrusted) PAN.down.delete(ev.pointerId); }, true));
const panMid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
const panStart = ev => {
  if (V.tool === 'read' || V.pencil || ev.touches.length !== 2) return;
  PAN.on = PAN.used = true;
  PAN.axis = null;
  PAN.t0 = performance.now();
  [PAN.x, PAN.y] = panMid(ev.touches);
  PAN.x0 = PAN.x; PAN.y0 = PAN.y;
  if (PAN.target && PAN.pid != null) {
    PAN.target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: PAN.pid, pointerType: 'touch', bubbles: true }));
  }
  getSelection().removeAllRanges();
  ev.preventDefault();
};
const panMove = ev => {
  if (!PAN.on || ev.touches.length < 2) return;
  ev.preventDefault();
  const [x, y] = panMid(ev.touches), sc = $('#vScroll');
  // A quick swipe goes one way (whichever it starts with); a slower,
  // deliberate drag goes wherever the fingers do.
  if (!PAN.axis) {
    const d = Math.hypot(x - PAN.x0, y - PAN.y0);
    if (d < 8) return;
    PAN.axis = d / Math.max(1, performance.now() - PAN.t0) >= SWIPE_SPEED ? swipeAxis(x - PAN.x0, y - PAN.y0) : 'free';
  }
  if (PAN.axis !== 'y') sc.scrollLeft -= x - PAN.x;
  if (PAN.axis !== 'x') sc.scrollTop -= y - PAN.y;
  PAN.x = x; PAN.y = y;
};
const panEnd = ev => { if (ev.touches.length < 2) PAN.on = false; };
let stylusStopOn = false;
function eraserTouch(on) {
  if (on === stylusStopOn) return;
  stylusStopOn = on;
  const sc = $('#vScroll'), opt = { capture: true, passive: false };
  // (Attached only while a tool is on: listeners that can cancel touches
  // make Safari wait for them before every scroll.)
  if (on) {
    sc.addEventListener('touchstart', stylusStop, opt);
    sc.addEventListener('touchstart', panStart, opt);
    sc.addEventListener('touchmove', panMove, opt);
    sc.addEventListener('touchend', panEnd, true);
    sc.addEventListener('touchcancel', panEnd, true);
  } else {
    sc.removeEventListener('touchstart', stylusStop, { capture: true });
    sc.removeEventListener('touchstart', panStart, { capture: true });
    sc.removeEventListener('touchmove', panMove, { capture: true });
    sc.removeEventListener('touchend', panEnd, true);
    sc.removeEventListener('touchcancel', panEnd, true);
    PAN.on = false;
  }
}


/* ---- marks from text: underline, strike-through, comments */
// Drag across words (or tap one) with the underline, strike-through or
// comment tool. Underlines and strike-throughs become thin pen lines along
// each line of text (PDF.js can't make underline annotations; every viewer
// shows pen lines). A comment highlights the words and opens a comment box;
// with the comment tool, tapping an existing mark edits its comment.
// Whole words: an end that falls inside a word takes in the whole word
// if it covers at least a third of it, and otherwise leaves it out; a
// selection inside one word takes that word. (Highlights and underlines.)
const WORD = /[\p{L}\p{N}\p{M}'\u2019]/u;
const inWord = (t, i) => i > 0 && i < t.length && WORD.test(t[i - 1]) && WORD.test(t[i]);
const wordSpan = (t, i) => {
  let a = i, b = i;
  while (a > 0 && WORD.test(t[a - 1])) a--;
  while (b < t.length && WORD.test(t[b])) b++;
  return [a, b];
};
const snapWords = r => {
  const out = r.cloneRange();
  const sn = r.startContainer, en = r.endContainer;
  const st = sn.nodeType === 3 ? sn.data : null, et = en.nodeType === 3 ? en.data : null;
  if (sn === en && st != null) {
    const [a, b] = wordSpan(st, r.startOffset);
    if (r.endOffset <= b && a < b && (inWord(st, r.startOffset) || r.startOffset === a) && (inWord(st, r.endOffset) || r.endOffset === b)) {
      out.setStart(sn, a); out.setEnd(sn, b);
      return out;
    }
  }
  if (st != null && inWord(st, r.startOffset)) {
    const [a, b] = wordSpan(st, r.startOffset);
    if ((b - r.startOffset) / (b - a) >= 1 / 3) out.setStart(sn, a);
    else { let k = b; while (k < st.length && /\s/.test(st[k])) k++; out.setStart(sn, k); }
  }
  if (et != null && inWord(et, r.endOffset)) {
    const [a, b] = wordSpan(et, r.endOffset);
    if ((r.endOffset - a) / (b - a) >= 1 / 3) out.setEnd(en, b);
    else { let k = a; while (k > 0 && /\s/.test(et[k - 1])) k--; out.setEnd(en, k); }
  }
  return out.collapsed ? r : out;
};
const TEXT_TOOLS = new Set(['underline', 'strike', 'comment']);
// Highlights made by the comment tool: they exist for their comment, so
// deleting the comment deletes them too.
const COMMENT_MARKS = new WeakSet();

// The mark (PDF.js editor) under a point, if any.
function markAt(x, y) {
  if (!V.ui) return null;
  const page = document.elementsFromPoint(x, y).map(el => el.closest && el.closest('.page')).find(Boolean);
  if (!page) return null;
  const divs = Array.from(page.querySelectorAll('.annotationEditorLayer > [id]')).reverse();
  for (const div of divs) {
    const r = div.getBoundingClientRect();
    if (x < r.left - 4 || x > r.right + 4 || y < r.top - 4 || y > r.bottom + 4) continue;
    const ed = V.ui.getEditor(div.id);
    if (ed) return ed;
  }
  return null;
}

// A highlight's lines (screen boxes, one per line, top to bottom) made to
// meet: each grows halfway across the space to the next, as in Preview,
// so a highlight over several lines is one block, not stripes. (The first
// and last grow as much, so every line is as tall. Lines far apart, as
// across a paragraph break or a figure, or side by side, are left.)
function joinLines(list) {
  const out = list.map(b => Object.assign({}, b)).sort((a, b) => a.top - b.top);
  const halves = [];
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i], b = out[i + 1], h = Math.min(a.bottom - a.top, b.bottom - b.top), gap = b.top - a.bottom;
    if (gap <= 0 || gap > h * 0.9 || Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 0) continue;
    const mid = (a.bottom + b.top) / 2;
    halves.push(gap / 2);
    a.bottom = mid; b.top = mid; a.joinedDown = b.joinedUp = true;
  }
  if (halves.length) {
    const half = halves.sort((x, y) => x - y)[halves.length >> 1];
    for (const b of out) {
      if (!b.joinedUp) b.top -= half;
      if (!b.joinedDown) b.bottom += half;
    }
  }
  return out.map(({ left, right, top, bottom }) => ({ left, right, top, bottom }));
}
// Screen boxes to PDF coordinates on one page.
function pageOf(el) { return el && el.closest ? el.closest('.page') : null; }
function toPdfBoxes(page, bars) {
  const pv = V.viewer.getPageView(+page.dataset.pageNumber - 1);
  const cw = page.querySelector('.canvasWrapper').getBoundingClientRect();
  const pt = (x, y) => pv.viewport.convertToPdfPoint(x - cw.left, y - cw.top);
  return bars.map(b => {
    const [xl, yt] = pt(b.left, b.top), [xr, yb] = pt(b.right, b.bottom);
    return { xl: Math.min(xl, xr), xr: Math.max(xl, xr), yt: Math.max(yt, yb), yb: Math.min(yt, yb) };
  });
}
// The boxes of a range's letters only. (A range's own boxes include any
// element it spans, such as the page-sized one PDF.js moves among the
// words while you select.)
// The screen boxes of the text in a range. Text running another way from
// where the range starts is left out (like the rotated "Downloaded from"
// line down the side of a journal's pages, which can sit in the middle of
// the page's text). While a highlight is being made, so is text off to
// the side of where you dragged (TEXT_CLIP): PDFs don't always keep a
// column's lines together, so a range in one column can take in lines of
// the other.
let TEXT_CLIP = null;
// The column you dragged in: from where you dragged, side to side, out
// along the words of the lines you dragged over, as long as they run on
// (a gap wider than a line is tall, between columns, stops it). So a drag
// straight down a page takes whole lines, and one in a column only that
// column.
function dragColumn(path) {
  const near = { left: path.minX - 60, right: path.maxX + 60 };
  const page = path.page;
  if (!page) return near;
  const boxes = [];
  for (const sp of page.querySelectorAll('.textLayer span')) {
    if (!sp.textContent.trim()) continue;
    const r = sp.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < path.minY - r.height || r.top > path.maxY + r.height) continue;
    boxes.push(r);
  }
  if (!boxes.length) return near;
  const hs = boxes.map(b => b.height).sort((a, b) => a - b), gap = Math.max(6, hs[hs.length >> 1]);
  let left = path.minX, right = path.maxX;
  for (let grew = true; grew;) {
    grew = false;
    for (const b of boxes) {
      if (b.left <= right + gap && b.right >= left - gap && (b.left < left || b.right > right)) {
        left = Math.min(left, b.left); right = Math.max(right, b.right); grew = true;
      }
    }
  }
  return { left: Math.min(left, near.left + 50) - 2, right: Math.max(right, near.right - 50) + 2 };
}
const textTurn = n => {
  const el = n.nodeType === 3 ? n.parentNode : n;
  const m = el && el.style && /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || '');
  return m ? Math.round(+m[1]) % 360 : 0;
};
function textRects(r) {
  const root = r.commonAncestorContainer;
  const keep = b => !TEXT_CLIP || (b.right >= TEXT_CLIP.left && b.left <= TEXT_CLIP.right);
  if (root.nodeType === 3) return Array.from(r.getClientRects()).filter(keep);
  const out = [], sub = document.createRange();
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let turn = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!r.intersectsNode(n)) continue;
    if (turn === null) turn = textTurn(n);
    else if (textTurn(n) !== turn) continue;
    sub.selectNodeContents(n);
    if (n === r.startContainer) sub.setStart(n, r.startOffset);
    if (n === r.endContainer) sub.setEnd(n, r.endOffset);
    if (!sub.collapsed) out.push(...Array.from(sub.getClientRects()).filter(keep));
  }
  return out;
}
const hexRgb = hex => { const h = String(hex).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
// Put a mark on a page (or back on it) without PDF.js recording that as a
// step for Undo of its own: LibLande records the whole change as one step.
function putMark(layer, ed, rebuild) {
  const own = Object.prototype.hasOwnProperty.call(layer, 'addUndoableEditor');
  layer.addUndoableEditor = () => {};
  try { if (rebuild) layer.addOrRebuild(ed); else layer.add(ed); } finally { if (!own) delete layer.addUndoableEditor; }
}
// Add a new mark and record it as a step for Undo.
async function addMark(page, data) {
  const idx = +page.dataset.pageNumber - 1;
  const layer = V.ui && V.ui.getLayer(idx);
  if (!layer) return null;
  const ed = await layer.deserialize(Object.assign({ pageIndex: idx, rotation: 0, boxes: null }, data));
  if (!ed) return null;
  putMark(layer, ed);
  V.ui.addCommands({ cmd: () => putMark(layer, ed, true), undo: () => ed.remove(), mustExec: false });
  markDrawing();
  return ed;
}
/* ---- underlines and strike-throughs */
// PDF.js can make highlights, drawings, text and pictures, but not the
// PDF Underline and StrikeOut marks other readers make. So LibLande makes
// them as highlights of the words (they select, recolour, erase and take
// comments as highlights do) with a fill too faint to see, whose opacity
// says which they are, and draws the line over them itself (drawLines).
// Every save to Google Drive turns them into real Underline and StrikeOut
// marks (realLines), which any reader shows; on this device, until then,
// they stay as they are. Real ones already in a PDF become LibLande's when
// picked up (takeOverLine), and PDF.js removes the original at the save.
// (PDF.js writes opacity to two decimal places.)
const LINE_OPACITY = { underline: 0.01, strike: 0.02 };
const lineKindOf = op => (op == null ? null : Math.abs(op - LINE_OPACITY.underline) < 0.004 ? 'underline' : Math.abs(op - LINE_OPACITY.strike) < 0.004 ? 'strike' : null);
const LINE_KIND = new WeakMap();
function lineKindOfEd(ed) {
  if (!ed || !ed.div || !ed.div.classList.contains('highlightEditor')) return null;
  if (LINE_KIND.has(ed)) return LINE_KIND.get(ed);
  let k = null;
  try { const d = ed.serialize(); k = d ? lineKindOf(d.opacity) : null; } catch (err) { k = null; }
  LINE_KIND.set(ed, k);
  return k;
}
// Where the line crosses a line of text (PDF units up from its bottom),
// and how thick it is.
const lineY = (kind, yb, yt) => (kind === 'underline' ? yb + (yt - yb) * 0.08 : yb + (yt - yb) * 0.42);
const lineThickness = h => Math.max(0.6, Math.min(2, h * 0.07));
const rgbHex = c => '#' + Array.from(c || [0, 0, 0]).slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
// The lines, in an element that covers rect (PDF units: x0 y0 x1 y1).
function drawLines(host, rect, quads, color, kind) {
  let box = host.querySelector(':scope > .ll-lines');
  if (!box) { box = document.createElement('div'); box.className = 'll-lines'; box.setAttribute('aria-hidden', 'true'); host.append(box); }
  const [x0, y0, x1, y1] = rect, w = (x1 - x0) || 1, h = (y1 - y0) || 1;
  let html = '';
  for (let i = 0; i + 7 < quads.length; i += 8) {
    const xs = [quads[i], quads[i + 2], quads[i + 4], quads[i + 6]], ys = [quads[i + 1], quads[i + 3], quads[i + 5], quads[i + 7]];
    const xl = Math.min(...xs), xr = Math.max(...xs), yb = Math.min(...ys), yt = Math.max(...ys);
    html += `<i style="left:${(xl - x0) / w * 100}%;width:${(xr - xl) / w * 100}%;top:${(y1 - lineY(kind, yb, yt)) / h * 100}%;--th:${lineThickness(yt - yb).toFixed(2)}"></i>`;
  }
  if (box.innerHTML !== html) box.innerHTML = html;
  box.style.setProperty('--c', color);
}
function decorateLine(ed) {
  const kind = lineKindOfEd(ed);
  if (!kind) return;
  let d = null;
  try { d = ed.serialize(); } catch (err) { d = null; }
  if (!d || !d.quadPoints) return;
  ed.div.classList.add('ll-line', 'll-' + kind);
  drawLines(ed.div, d.rect, Array.from(d.quadPoints), rgbHex(d.color), kind);
}
/* ---- notes pinned to a spot */
// PDF.js can't make the PDF Text marks (sticky notes) other readers make
// either. So a note is a small highlight square with a fill too faint to
// see, NOTE_OPACITY saying what it is, and a speech bubble drawn over it;
// it takes its comment as any mark does. Every save turns it into a real
// Text note (realLines); a Text note in the PDF, from any app, becomes
// LibLande's when tapped (takeOverNote).
const NOTE_OPACITY = 0.03, NOTE_PT = 16;
const isNoteOpacity = op => op != null && Math.abs(op - NOTE_OPACITY) < 0.004;
const NOTE_KIND = new WeakMap();
function isNoteEd(ed) {
  if (!ed || !ed.div || !ed.div.classList.contains('highlightEditor')) return false;
  if (NOTE_KIND.has(ed)) return NOTE_KIND.get(ed);
  let k = false;
  try { const d = ed.serialize(); k = !!d && isNoteOpacity(d.opacity); } catch (err) { k = false; }
  NOTE_KIND.set(ed, k);
  return k;
}
const NOTE_BUBBLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z"/></svg>';
function decorateNote(ed) {
  if (!isNoteEd(ed)) return;
  ed.div.classList.add('ll-note');
  let i = ed.div.querySelector(':scope > .ll-note-icon');
  if (!i) { i = document.createElement('i'); i.className = 'll-note-icon'; i.innerHTML = NOTE_BUBBLE; ed.div.append(i); }
  let c = null;
  try { const d = ed.serialize(); c = d && d.color; } catch (err) { c = null; }
  i.style.setProperty('--c', c ? rgbHex(c) : '#ffd84a');
}
// A note centred on a spot on the screen.
async function noteMark(page, x, y) {
  const pv = V.viewer.getPageView(+page.dataset.pageNumber - 1), half = NOTE_PT / 2 * pv.viewport.scale;
  const [b] = toPdfBoxes(page, [{ left: x - half, right: x + half, top: y - half, bottom: y + half }]);
  if (!b) return null;
  const ed = await addMark(page, {
    annotationType: V.lib.AnnotationEditorType.HIGHLIGHT, color: hexRgb(MARK.hlColor), opacity: NOTE_OPACITY,
    quadPoints: Float32Array.from([b.xl, b.yt, b.xr, b.yt, b.xl, b.yb, b.xr, b.yb]), rect: [b.xl, b.yb, b.xr, b.yt],
  });
  if (ed) { NOTE_KIND.set(ed, true); decorateLines(); }
  return ed;
}
// A Text note in the PDF made LibLande's, in its place, with its comment.
async function takeOverNote(page, id) {
  if (!V.doc || !V.ui) return null;
  const idx = +page.dataset.pageNumber - 1, layer = V.ui.getLayer(idx);
  if (!layer) return null;
  let a = null;
  try { a = (await (await V.doc.getPage(idx + 1)).getAnnotations()).find(x => x.id === id); } catch (err) { a = null; }
  if (!a || a.subtype !== 'Text' || !a.rect) return null;
  // (Other apps' notes are drawn the same size whatever their rectangle.)
  const x0 = Math.min(a.rect[0], a.rect[2]), y1 = Math.max(a.rect[1], a.rect[3]), x1 = x0 + NOTE_PT, y0 = y1 - NOTE_PT;
  const ed = await layer.deserialize({
    annotationType: V.lib.AnnotationEditorType.HIGHLIGHT, color: a.color && a.color.length >= 3 ? Array.from(a.color) : [255, 216, 74], opacity: NOTE_OPACITY,
    quadPoints: Float32Array.from([x0, y1, x1, y1, x0, y0, x1, y0]), boxes: null, pageIndex: idx, rect: [x0, y0, x1, y1], rotation: 0,
  });
  if (!ed) return null;
  NOTE_KIND.set(ed, true);
  ed.annotationElementId = a.id;
  ed._initialData = { color: [-1, -1, -1] };
  putMark(layer, ed);
  TAKEN.add(a.id);
  const note = a.contentsObj && a.contentsObj.str;
  if (note) { try { ed.comment = note; } catch (err) { /* without it */ } }
  const sec = page.querySelector(`.annotationLayer [data-annotation-id="${CSS.escape(a.id)}"]`);
  if (sec) sec.style.display = 'none';
  try { V.doc.annotationStorage.resetModifiedIds(); } catch (err) { /* older PDF.js */ }
  markDrawing();
  decorateLines();
  return ed;
}
// A tap on a note (reading, or with the comment tool) opens its comment.
// (Caught first, before the page's own handling of taps.)
const noteTarget = ev => ev.target.closest && ev.target.closest('#vPages') ? ev.target.closest('.ll-note-icon, .annotationLayer .textAnnotation') : null;
window.addEventListener('pointerdown', ev => {
  if ((V.tool !== 'read' && V.tool !== 'comment') || !noteTarget(ev)) return;
  ev.stopPropagation();
  ev.preventDefault();
}, true);
window.addEventListener('click', async ev => {
  if (V.tool !== 'read' && V.tool !== 'comment') return;
  const hit = noteTarget(ev), mine = hit && hit.matches('.ll-note-icon') ? hit : null, theirs = hit && !mine ? hit : null;
  if (!hit) return;
  ev.stopPropagation();
  ev.preventDefault();
  const anchor = (mine || theirs).getBoundingClientRect();
  if (mine) { const ed = V.ui && V.ui.getEditor(mine.closest('.highlightEditor').id); if (ed) openComment(ed, false, anchor); return; }
  const ed = await takeOverNote(theirs.closest('.page'), theirs.dataset.annotationId);
  if (ed) openComment(ed, false, anchor); else toast('That note can\u2019t be opened here.', 3000);
}, true);
// (After any change: a new mark, an undo, a new colour.)
let LINE_DECOR = 0;
function decorateLines() {
  if (LINE_DECOR) return;
  LINE_DECOR = requestAnimationFrame(() => {
    LINE_DECOR = 0;
    if (!V.ui) return;
    document.querySelectorAll('#vPages .annotationEditorLayer > .highlightEditor').forEach(div => { const ed = V.ui.getEditor(div.id); decorateLine(ed); decorateNote(ed); });
  });
}
async function lineMarks(page, bars, kind) {
  const boxes = toPdfBoxes(page, bars);
  if (!boxes.length) return null;
  const quads = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    quads.push(b.xl, b.yt, b.xr, b.yt, b.xl, b.yb, b.xr, b.yb);
    x0 = Math.min(x0, b.xl); x1 = Math.max(x1, b.xr); y0 = Math.min(y0, b.yb); y1 = Math.max(y1, b.yt);
  }
  const ed = await addMark(page, {
    annotationType: V.lib.AnnotationEditorType.HIGHLIGHT, color: hexRgb(MARK.lineColor), opacity: LINE_OPACITY[kind],
    quadPoints: Float32Array.from(quads), rect: [x0, y0, x1, y1],
  });
  if (ed) { LINE_KIND.set(ed, kind); decorateLine(ed); setTimeout(() => { if (V.ui && isPicked(ed)) V.ui.unselectAll(); }, 0); }
  return ed;
}
// Ones made on this device and not yet saved to Drive, opened again
// (the faint highlights PDF.js shows when no tool is on): their lines.
const PAGE_ANNOTS = new WeakMap();
async function sectionLines(pageNumber) {
  if (!V.doc) return;
  const page = document.querySelector(`#vPages .page[data-page-number="${pageNumber}"]`);
  if (!page) return;
  const doc = V.doc;
  let list = PAGE_ANNOTS.get(doc) && PAGE_ANNOTS.get(doc).get(pageNumber);
  if (!list) {
    try { list = await (await doc.getPage(pageNumber)).getAnnotations(); } catch (err) { return; }
    if (!PAGE_ANNOTS.has(doc)) PAGE_ANNOTS.set(doc, new Map());
    PAGE_ANNOTS.get(doc).set(pageNumber, list);
  }
  for (const a of list) {
    const sec = page.querySelector(`.annotationLayer [data-annotation-id="${CSS.escape(a.id)}"]`);
    if (!sec) continue;
    if (TAKEN.has(a.id)) { sec.style.display = 'none'; continue; }
    const kind = a.subtype === 'Highlight' ? lineKindOf(a.opacity) : null;
    if (kind && a.quadPoints) drawLines(sec, a.rect, Array.from(a.quadPoints), rgbHex(a.color), kind);
  }
}
// A real Underline or StrikeOut from the PDF, picked up: LibLande's own in
// its place (same words, colour and comment), standing for the original
// as PDF.js's edited marks do (annotationElementId): PDF.js leaves the
// original out of the page it draws, writes this one in its place when
// the PDF is saved, and removes it if this one is deleted. (Not a step
// for Undo: nothing about it has changed yet.)
const TAKEN = new Set();
// (batch: the page isn't drawn again here; the caller does it once, with
// redrawPages, after taking over several.)
async function takeOverLine(hit, batch) {
  if (!V.doc || !V.ui || !hit || !hit.id) return null;
  const idx = +hit.page.dataset.pageNumber - 1, layer = V.ui.getLayer(idx);
  if (!layer) return null;
  let a = null;
  try { a = (await (await V.doc.getPage(idx + 1)).getAnnotations()).find(x => x.id === hit.id); } catch (err) { a = null; }
  if (!a || !/^(Underline|StrikeOut)$/.test(a.subtype) || !a.quadPoints) return null;
  const kind = a.subtype === 'Underline' ? 'underline' : 'strike';
  const quads = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 7 < a.quadPoints.length; i += 8) {
    const xs = [0, 2, 4, 6].map(k => a.quadPoints[i + k]), ys = [1, 3, 5, 7].map(k => a.quadPoints[i + k]);
    const xl = Math.min(...xs), xr = Math.max(...xs), yb = Math.min(...ys), yt = Math.max(...ys);
    quads.push(xl, yt, xr, yt, xl, yb, xr, yb);
    x0 = Math.min(x0, xl); x1 = Math.max(x1, xr); y0 = Math.min(y0, yb); y1 = Math.max(y1, yt);
  }
  const ed = await layer.deserialize({
    annotationType: V.lib.AnnotationEditorType.HIGHLIGHT, color: Array.from(a.color || [0, 0, 0]), opacity: LINE_OPACITY[kind],
    quadPoints: Float32Array.from(quads), boxes: null, pageIndex: idx, rect: [x0, y0, x1, y1], rotation: 0,
  });
  if (!ed) return null;
  LINE_KIND.set(ed, kind);
  ed.annotationElementId = a.id;
  // (PDF.js compares a mark like this with the one it stands for; this one
  // always counts as changed: it becomes an Underline again when saved.)
  ed._initialData = { color: [-1, -1, -1] };
  // (The page is drawn again, without it, once PDF.js counts this one as
  // standing for it; done when drawn.)
  const hide = async () => {
    const sec = hit.page.querySelector(`.annotationLayer [data-annotation-id="${CSS.escape(a.id)}"]`);
    if (sec) sec.style.display = 'none';
    try { V.doc.annotationStorage.resetModifiedIds(); } catch (err) { /* older PDF.js */ }
    for (let i = 0; i < 20 && !V.doc.annotationStorage.modifiedIds.ids.has(a.id); i++) await new Promise(r => requestAnimationFrame(r));
    return redrawPages([idx + 1]);
  };
  putMark(layer, ed);
  TAKEN.add(a.id);
  const note = a.contentsObj && a.contentsObj.str;
  if (note) { try { ed.comment = note; } catch (err) { /* without it */ } }
  if (batch) {
    const sec = hit.page.querySelector(`.annotationLayer [data-annotation-id="${CSS.escape(a.id)}"]`);
    if (sec) sec.style.display = 'none';
  } else await hide();
  markDrawing();
  decorateLines();
  return ed;
}
// Pages drawn again (each once), without the originals of marks taken over.
async function redrawPages(pageNumbers) {
  if (!V.viewer || !V.bus || !V.doc) return;
  try { V.doc.annotationStorage.resetModifiedIds(); } catch (err) { /* older PDF.js */ }
  const drawn = [...new Set(pageNumbers)].map(n => {
    const pv = V.viewer.getPageView(n - 1);
    if (!pv) return null;
    const p = pageDrawn(n);
    pv.reset();
    return p;
  });
  V.viewer.update();
  await Promise.all(drawn);
}
// A page drawn again, all of it: a drawing under way when it was started
// over (which PDF.js still reports) doesn't count; at a high zoom, the
// sharper detail drawn over part of it (PDF.js 6) comes after the page
// and counts too. At most 3 seconds.
function pageDrawn(n) {
  return new Promise(res => {
    let pageDone = false, timer = 0;
    const finish = () => { V.bus.off('pagerendered', seen); clearTimeout(timer); res(); };
    const seen = e => {
      if (e.pageNumber !== n) return;
      if (e.isDetailView) { if (pageDone) finish(); return; }
      pageDone = true;
      // (Without a detail layer, the page is all there is.)
      setTimeout(() => {
        const pv = V.viewer && V.viewer.getPageView(n - 1), dv = pv && pv.detailView;
        if (!dv || dv.renderingState === 3) finish();
      }, 60);
    };
    V.bus.on('pagerendered', seen);
    timer = setTimeout(finish, 3000);
  });
}
// A PDF mark (pdf-lib dict d) made an Underline or StrikeOut over the
// lines in quads, with an appearance (the line, drawn) any reader can show.
// A note as a PDF Text note: other readers draw their own icon for it.
function makeNoteMark(N, d) {
  d.set(N('Subtype'), N('Text'));
  d.set(N('Name'), N('Comment'));
  ['QuadPoints', 'AP', 'CA'].forEach(k => d.delete(N(k)));
}
function makeLineMark(ctx, N, d, kind, q, c, rect) {
  const f = v => (+v).toFixed(2);
  let ops = (c.length === 3 ? c.map(f).join(' ') : '0 0 0') + ' RG 0 J\n';
  for (let k = 0; k + 7 < q.length; k += 8) {
    const xs = [q[k], q[k + 2], q[k + 4], q[k + 6]], ys = [q[k + 1], q[k + 3], q[k + 5], q[k + 7]];
    const xl = Math.min(...xs), xr = Math.max(...xs), yb = Math.min(...ys), yt = Math.max(...ys), y = lineY(kind, yb, yt);
    ops += `${f(lineThickness(yt - yb))} w ${f(xl)} ${f(y)} m ${f(xr)} ${f(y)} l S\n`;
  }
  const ap = ctx.register(ctx.stream(ops, { Type: 'XObject', Subtype: 'Form', BBox: rect.length === 4 ? rect : [0, 0, 1, 1], Resources: {} }));
  d.set(N('Subtype'), N(kind === 'underline' ? 'Underline' : 'StrikeOut'));
  d.set(N('AP'), ctx.obj({ N: ap }));
}

// Underlines and strike-throughs LibLande drew on 1 October 2026 (versions
// .10 and .11, before it made real ones) were pen strokes: one straight,
// level, thin stroke per line of text, a little under the text or through
// its middle. Found when a paper opens (only one with pen strokes is
// looked at), they become real Underline and StrikeOut marks in their
// place, saved with the paper's next upload. A stroke that isn't on a line
// of the paper's text is left as a drawing.
// (Cheap, first: a stroke of exactly two points in the file at all.)
const mayHaveOldLines = data => /\/InkList\s*\[\s*\[\s*-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s*\]/.test(new TextDecoder('latin1').decode(data));
async function oldLineMarks(doc) {
  const points = list => {
    if (!list) return [];
    if (typeof list[0] === 'number' || ArrayBuffer.isView(list)) { const o = []; for (let i = 0; i + 1 < list.length; i += 2) o.push([list[i], list[i + 1]]); return o; }
    return Array.from(list).map(p => [p.x, p.y]);
  };
  // (Each stroke exactly two points at the same height: no hand draws
  // that. 0.8 to 2 points thick, as LibLande made them.)
  const level = a => {
    const w = a.borderStyle ? a.borderStyle.width : 1;
    return a.subtype === 'Ink' && a.inkLists && a.inkLists.length && w >= 0.79 && w <= 2.01 &&
      Array.from(a.inkLists).every(l => {
        const ps = points(l);
        return ps.length === 2 && Math.abs(ps[0][1] - ps[1][1]) < 0.01 && Math.abs(ps[0][0] - ps[1][0]) > 3;
      });
  };
  const found = [];
  {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const marks = (await page.getAnnotations()).filter(level);
      if (!marks.length) continue;
      const lines = (await page.getTextContent()).items.filter(it => it.str && it.str.trim())
        .map(it => ({ x0: it.transform[4], x1: it.transform[4] + it.width, b: it.transform[5], h: it.height || Math.hypot(it.transform[2], it.transform[3]) || 10 }));
      for (const a of marks) {
        const quads = [];
        let kind = null, ok = true;
        for (const l of Array.from(a.inkLists)) {
          const ps = points(l), xs = ps.map(q => q[0]), xl = Math.min(...xs), xr = Math.max(...xs), y = ps.reduce((t, q) => t + q[1], 0) / ps.length;
          const line = lines.find(it => it.x1 > xl + 1 && it.x0 < xr - 1 && y > it.b - 0.45 * it.h && y < it.b + 0.8 * it.h);
          if (!line) { ok = false; break; }
          const k = (y - line.b) / line.h < 0.12 ? 'underline' : 'strike';
          if (kind && k !== kind) { ok = false; break; }
          kind = k;
          // (A box for the line of text that puts LibLande's line where the stroke was.)
          const H = line.h * 1.2, yb = y - (k === 'underline' ? 0.08 : 0.42) * H;
          quads.push(xl, yb + H, xr, yb + H, xl, yb, xr, yb);
        }
        if (ok && kind) found.push({ id: a.id, kind, quads, color: Array.from(a.color || [0.85, 0.18, 0.13]).map(v => (v > 1 ? v / 255 : v)) });
      }
    }
  }
  return found;
}
async function convertOldLines(bytes, found) {
  const { PDFDocument, PDFName, PDFDict, PDFRef } = await loadPdfLib();
  let pdf;
  try { pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false }); } catch (err) { return { bytes, n: 0 }; }
  const N = PDFName.of, ctx = pdf.context, byId = new Map(found.map(f => [f.id, f]));
  let n = 0;
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      if (!(ref instanceof PDFRef)) continue;
      const f = byId.get(ref.objectNumber + 'R' + (ref.generationNumber ? ref.generationNumber : ''));
      const d = f && ctx.lookup(ref);
      if (!(d instanceof PDFDict) || d.get(N('Subtype')) !== N('Ink')) continue;
      const q = f.quads;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k + 1 < q.length; k += 2) { x0 = Math.min(x0, q[k]); x1 = Math.max(x1, q[k]); y0 = Math.min(y0, q[k + 1]); y1 = Math.max(y1, q[k + 1]); }
      const rect = [x0, y0, x1, y1];
      d.delete(N('InkList')); d.delete(N('BS')); d.delete(N('Border')); d.delete(N('IT'));
      d.set(N('QuadPoints'), ctx.obj(q));
      d.set(N('Rect'), ctx.obj(rect));
      d.set(N('C'), ctx.obj(f.color));
      makeLineMark(ctx, N, d, f.kind, q, f.color, rect);
      n++;
    }
  }
  return { bytes: n ? await pdf.save({ useObjectStreams: false }) : bytes, n };
}
// Papers already looked at (file ID and checksum): not looked at again.
const OLD_LINES_SEEN = new Set(store.get('oldLinesSeen', []));

// For Google Drive (and sharing): LibLande's underlines and strike-throughs
// as real Underline and StrikeOut marks, each with an appearance any PDF
// reader can draw. A file without any comes back as it was.
async function realLines(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  if (!/\/CA 0\.0[123]\b/.test(text)) return bytes;
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber } = await loadPdfLib();
  let pdf;
  try { pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false }); } catch (err) { return bytes; }
  const N = PDFName.of, ctx = pdf.context;
  const nums = a => (a ? a.asArray().map(v => (v instanceof PDFNumber ? v.asNumber() : 0)) : []);
  let n = 0;
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const d = annots.lookupMaybe(i, PDFDict);
      if (!d || d.get(N('Subtype')) !== N('Highlight')) continue;
      const ca = d.lookupMaybe(N('CA'), PDFNumber), kind = lineKindOf(ca && ca.asNumber());
      if (ca && isNoteOpacity(ca.asNumber())) { makeNoteMark(N, d); n++; continue; }
      if (!kind) continue;
      const q = nums(d.lookupMaybe(N('QuadPoints'), PDFArray)), c = nums(d.lookupMaybe(N('C'), PDFArray)), rect = nums(d.lookupMaybe(N('Rect'), PDFArray));
      makeLineMark(ctx, N, d, kind, q, c, rect);
      d.delete(N('CA'));
      n++;
    }
  }
  return n ? pdf.save({ useObjectStreams: false }) : bytes;
}

// The comment box, for PDF.js's comment button on a selected mark too.
// (PDF.js 5 calls open; PDF.js 6 calls showDialog, and the rest of its
// comment interface, whose popups and sidebar LibLande doesn't use: its
// own pins show comments.)
const commentManager = {
  open(ui, editor) { openComment(editor, false); },
  showDialog(ui, editor) { if (editor) openComment(editor, false); },
  setSidebarUiManager() {}, updateComment() {}, updatePopupColor() {}, removeComments() {},
  toggleCommentPopup() {}, makeCommentColor() { return null; }, destroyPopup() {},
  // (What a mark's comment button opens: LibLande's comment box.)
  get dialogElement() { return document.getElementById('vComment'); },
  destroy() {}, showSidebar() {}, hideSidebar() {},
};
function commentText(ed) {
  try { const c = ed.comment; return c && !c.deleted ? c.text || '' : ''; } catch (err) { return ''; }
}
// A saved comment is shown as text, with buttons for editing and deleting;
// a tap on the text (or the pencil) edits it. A new one opens for writing.
function commentView(text) {
  const box = $('#vComment');
  box.dataset.mode = 'view';
  $('#vCommentView').textContent = text;
  $('#vCommentDelete').hidden = false;
}
function commentEdit() {
  const box = $('#vComment'), ta = $('#vCommentText');
  box.dataset.mode = 'edit';
  if (box._ed) ta.value = commentText(box._ed);
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
}
function openComment(ed, isNew, anchor) {
  const box = $('#vComment'), ta = $('#vCommentText');
  box.hidden = false;
  // (The mark's own toolbar would sit over the box.)
  $('#viewer').classList.add('commenting');
  box.dataset.new = isNew ? '1' : '';
  box._ed = ed;
  const text = commentText(ed);
  ta.value = text;
  $('#vCommentDelete').hidden = isNew || !text;
  const what = ed.div && ed.div.classList.contains('inkEditor') ? 'drawing' : ed.div && ed.div.classList.contains('freeTextEditor') ? 'text box' : isNoteEd(ed) ? 'note' : 'highlight';
  // (A note's box says Note; a mark's, Comment.)
  box.querySelector('.v-comment-title').textContent = what === 'note' ? 'Note' : 'Comment';
  box.setAttribute('aria-label', what === 'note' ? 'Note' : 'Comment');
  $('#vCommentRemove').title = 'Delete ' + what;
  $('#vCommentRemove').setAttribute('aria-label', 'Delete ' + what);
  // (A note that's only a comment goes with its comment.)
  $('#vCommentRemove').hidden = isNew || COMMENT_MARKS.has(ed) || isNoteEd(ed);
  // Next to the mark, kept on screen.
  const r = anchor || (ed.div && ed.div.isConnected ? ed.div.getBoundingClientRect() : { left: 80, bottom: 120, top: 100 });
  const w = Math.min(320, window.innerWidth - 24), h = 190;
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8);
  box.style.width = w + 'px';
  box.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left)) + 'px';
  box.style.top = top + 'px';
  if (isNew || !text) commentEdit();
  else commentView(text);
}
function closeComment(save) {
  const box = $('#vComment'), ed = box._ed, isNew = box.dataset.new === '1';
  box.hidden = true;
  $('#viewer').classList.remove('commenting');
  box._ed = null;
  if (!ed) return;
  const text = $('#vCommentText').value.trim();
  // (Only what was being written is saved; a comment just being read stays.)
  if (save && box.dataset.mode === 'edit') {
    ed.comment = text || null;
    if (V.ui && V.ui.addToAnnotationStorage) V.ui.addToAnnotationStorage(ed);
    V.dirty = true;
    saveUI();
    autoChanged();
    if (isNew && !text) ed.remove();
  } else if (isNew && !commentText(ed)) {
    ed.remove();
  }
  refreshAllPins();
}
// Saved: shown as text (an empty one is removed, and the box closes).
$('#vCommentSave').addEventListener('click', () => {
  const box = $('#vComment'), ed = box._ed, text = $('#vCommentText').value.trim();
  if (!ed || !text) { closeComment(true); return; }
  ed.comment = text;
  if (V.ui && V.ui.addToAnnotationStorage) V.ui.addToAnnotationStorage(ed);
  V.dirty = true;
  saveUI();
  autoChanged();
  refreshAllPins();
  box.dataset.new = '';
  $('#vCommentRemove').hidden = COMMENT_MARKS.has(ed);
  commentView(text);
});
// Cancelled: back to the comment as it was (or, if there was none, closed).
$('#vCommentCancel').addEventListener('click', () => {
  const box = $('#vComment'), ed = box._ed, text = ed ? commentText(ed) : '';
  if (box.dataset.new === '1' || !text) { closeComment(false); return; }
  $('#vCommentText').value = text;
  commentView(text);
});
$('#vCommentEdit').addEventListener('click', commentEdit);
$('#vCommentView').addEventListener('click', () => { if (getSelection().isCollapsed) commentEdit(); });
$('#vCommentClose').addEventListener('click', () => closeComment(true));
// A comment being read closes with Escape (not the paper), or a tap
// anywhere else.
document.addEventListener('keydown', ev => {
  const box = $('#vComment');
  if (ev.key !== 'Escape' || box.hidden || box.dataset.mode !== 'view') return;
  ev.preventDefault();
  ev.stopPropagation();
  closeComment(false);
}, true);
document.addEventListener('pointerdown', ev => {
  const box = $('#vComment');
  if (box.hidden || box.dataset.mode !== 'view' || (ev.target.closest && ev.target.closest('#vComment, .note-pin, .editToolbar'))) return;
  closeComment(false);
}, true);
// Delete the mark itself (and its comment), as a step Undo can take back.
function deleteMark(ed) {
  const box = $('#vComment');
  box.hidden = true;
  $('#viewer').classList.remove('commenting');
  box._ed = null;
  if (!ed || !V.ui) return;
  V.ui.setSelected(ed);
  V.ui.delete();
  markDrawing();
  refreshAllPins();
}
$('#vCommentDelete').addEventListener('click', () => {
  const ed = $('#vComment')._ed;
  if (ed && COMMENT_MARKS.has(ed)) { deleteMark(ed); return; }
  $('#vCommentText').value = '';
  $('#vComment').dataset.mode = 'edit';
  closeComment(true);
});
$('#vCommentRemove').addEventListener('click', () => deleteMark($('#vComment')._ed));
$('#vCommentText').addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); closeComment(true); }
  else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeComment(false); }
});

(() => {
  const sc = $('#vScroll'), preview = $('#hlPreview');
  let anchor = null, range = null, page = null, frame = 0, start = null, hit = null;
  const caret = (x, y) => {
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, offset: p.offset }; }
    const r = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
    return r && { node: r.startContainer, offset: r.startOffset };
  };
  const rangeTo = focus => {
    const r = document.createRange();
    try {
      r.setStart(anchor.node, anchor.offset); r.setEnd(focus.node, focus.offset);
      if (r.collapsed) { r.setStart(focus.node, focus.offset); r.setEnd(anchor.node, anchor.offset); }
    } catch (err) { return null; }
    return r.collapsed ? null : r;
  };
  // A point in the page's own text (not the text layer around it, or
  // another page): a drag's ends only count there, or a range could run
  // from a word to the end of the page.
  const inText = c => !!c && !!c.node && c.node.nodeType === 3 && !!c.node.parentElement &&
    !!c.node.parentElement.closest('.textLayer') && pageOf(c.node.parentElement) === page;
  // The word under a point (for a tap without a drag): its letters and
  // digits, not the punctuation around them; none on a space.
  const wordAt = c => {
    if (!inText(c)) return null;
    const t = c.node.data;
    let [a, b] = wordSpan(t, c.offset);
    if (a === b && c.offset > 0) [a, b] = wordSpan(t, c.offset - 1);
    if (a === b) {
      a = c.offset; b = c.offset;
      while (a > 0 && /\S/.test(t[a - 1])) a--;
      while (b < t.length && /\S/.test(t[b])) b++;
    }
    if (a === b) return null;
    const r = document.createRange();
    r.setStart(c.node, a); r.setEnd(c.node, b);
    return r;
  };
  // One bar per line, within the page the drag started on.
  const bars = r => {
    const pr = page.getBoundingClientRect();
    const boxes = textRects(r).filter(b => b.width >= 1 && b.height >= 1 && b.top >= pr.top - 2 && b.bottom <= pr.bottom + 2)
      .sort((a, b) => a.top - b.top || a.left - b.left);
    const out = [];
    for (const b of boxes) {
      const line = out.find(l => Math.min(l.bottom, b.bottom) - Math.max(l.top, b.top) > Math.min(l.bottom - l.top, b.height) * 0.5);
      if (line) { line.left = Math.min(line.left, b.left); line.right = Math.max(line.right, b.right); line.top = Math.min(line.top, b.top); line.bottom = Math.max(line.bottom, b.bottom); }
      else out.push({ left: b.left, right: b.right, top: b.top, bottom: b.bottom });
    }
    return out;
  };
  // (Underlines take whole words, as highlights do; strike-throughs go
  // where they're drawn.)
  // (Never the spaces at either end: a Pencil's tap that slides a little
  // is a short drag, and would take in the space after the word.)
  const trimSpaces = r => {
    const o = r.cloneRange(), one = o.startContainer === o.endContainer;
    if (o.startContainer.nodeType === 3) { const t = o.startContainer.data; let i = o.startOffset; while (i < t.length && /\s/.test(t[i]) && !(one && i >= o.endOffset)) i++; o.setStart(o.startContainer, i); }
    if (o.endContainer.nodeType === 3) { const t = o.endContainer.data; let j = o.endOffset; while (j > 0 && /\s/.test(t[j - 1]) && !(one && j <= o.startOffset)) j--; o.setEnd(o.endContainer, j); }
    return o.collapsed ? r : o;
  };
  const lineRange = (tool, r) => (tool === 'underline' ? trimSpaces(snapWords(r)) : tool === 'strike' ? trimSpaces(r) : r);
  const words = r => lineRange(V.tool, r);
  const draw = () => {
    frame = 0;
    const list = range && page ? bars(words(range)) : [];
    while (preview.children.length < list.length) preview.appendChild(document.createElement('div'));
    Array.from(preview.children).forEach((d, i) => {
      const b = list[i];
      d.hidden = !b;
      if (b) d.style.cssText = `left:${b.left - 1}px;top:${b.top}px;width:${b.right - b.left + 2}px;height:${b.bottom - b.top}px`;
    });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const clear = () => { range = null; anchor = null; page = null; preview.className = 'hl-preview'; Array.from(preview.children).forEach(d => { d.hidden = true; }); };
  const pen = ev => !(ev.pointerType === 'touch' && V.pencil);
  const ours = ev => TEXT_TOOLS.has(V.tool) && V.tool !== 'comment' && pen(ev);
  // The comment tool: a tap puts a note there, pinned to the spot (or
  // opens the comment of a mark tapped). Comments on highlights and
  // underlines come from the comment button on the mark's own toolbar.
  let noteAt = null;
  sc.addEventListener('pointerdown', ev => {
    if (V.tool !== 'comment' || ev.button > 0 || !pen(ev)) return;
    if (ev.target.closest('.editToolbar, .note-pin, #vComment')) return;
    ev.stopPropagation();
    ev.preventDefault();
    const wasOpen = !$('#vComment').hidden;
    if (wasOpen) closeComment(true);
    const ed = markAt(ev.clientX, ev.clientY);
    if (ed) { openComment(ed, false); return; }
    const page = pageOf(document.elementsFromPoint(ev.clientX, ev.clientY).find(el => el.closest && el.closest('.page .canvasWrapper, .page .textLayer, .page .annotationEditorLayer')));
    noteAt = page && !wasOpen ? { x: ev.clientX, y: ev.clientY, page } : null;
  }, true);
  sc.addEventListener('pointerup', async ev => {
    const at = noteAt;
    noteAt = null;
    if (!at || V.tool !== 'comment' || Math.hypot(ev.clientX - at.x, ev.clientY - at.y) >= 10) return;
    ev.stopPropagation();
    const ed = await noteMark(at.page, at.x, at.y);
    if (ed) { COMMENT_MARKS.add(ed); openComment(ed, true); }
  }, true);
  sc.addEventListener('pointerdown', ev => {
    if (!ours(ev) || ev.button > 0) return;
    // (Not a mark's toolbar or its colours: those are PDF.js's.)
    if (ev.target.closest('.editToolbar, .note-pin')) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (!$('#vComment').hidden) closeComment(true);
    page = pageOf(document.elementsFromPoint(ev.clientX, ev.clientY).find(el => el.closest && el.closest('.page')));
    anchor = page ? caret(ev.clientX, ev.clientY) : null;
    start = { x: ev.clientX, y: ev.clientY };
    // (An underline or strike-through already there: a tap picks it up.)
    hit = readMarkAt(ev.clientX, ev.clientY);
    preview.className = 'hl-preview line ' + V.tool;
    try { sc.setPointerCapture(ev.pointerId); } catch (err) { /* fine without */ }
  }, true);
  sc.addEventListener('pointermove', ev => {
    if (!anchor || !ours(ev)) return;
    ev.stopPropagation();
    // (A tap's wobble isn't a drag.)
    if (!range && start && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
    const focus = caret(ev.clientX, ev.clientY);
    if (!inText(anchor) || !inText(focus)) return;
    range = rangeTo(focus);
    schedule();
  }, true);
  const up = async ev => {
    if (!anchor || !ours(ev)) { if (anchor) clear(); return; }
    ev.stopPropagation();
    const tool = V.tool, pg = page, mark = hit, at = start;
    const tap = !range && at && Math.hypot(ev.clientX - at.x, ev.clientY - at.y) < 6;
    // A tap on an underline or strike-through: it's picked up, with its
    // toolbar (and the tool comes back when it's put down).
    if (tap && mark) { clear(); hit = null; pickUpMark(mark, at.x, at.y, tool, true); return; }
    let r = range;
    if (!r && tap) r = wordAt(anchor);
    const list = r && pg ? bars(lineRange(tool, r)) : [];
    clear();
    hit = null;
    if (!list.length) return;
    await lineMarks(pg, list, tool);
  };
  sc.addEventListener('pointerup', up, true);
  sc.addEventListener('pointercancel', () => clear(), true);
})();

/* ---- copying part of a page */
// The select tool's box, once drawn, offers: copy the text inside it, copy
// a picture of it (drawn fresh from the PDF at twice screen resolution,
// marks included), and select the marks it touches.
const REGION = { rect: null, hits: [], png: null, blob: null };
// Sharing a file needs the device's share sheet (iPad, iPhone, Mac Safari).
const CAN_SHARE_IMAGE = (() => {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })); } catch (err) { return false; }
})();
function pagesIn(r) {
  return Array.from(document.querySelectorAll('#vPages .page[data-page-number]')).filter(p => {
    const b = p.getBoundingClientRect();
    return b.bottom > r.top && b.top < r.bottom && b.right > r.left && b.left < r.right;
  });
}
function regionText(r) {
  const out = [];
  const rng = document.createRange();
  for (const page of pagesIn(r)) {
    const bits = [];
    for (const span of page.querySelectorAll('.textLayer span')) {
      const sr = span.getBoundingClientRect();
      if (sr.right < r.left || sr.left > r.right || sr.bottom < r.top || sr.top > r.bottom || !sr.width) continue;
      const node = span.firstChild;
      if (!node || node.nodeType !== 3) continue;
      if (sr.left >= r.left && sr.right <= r.right && sr.top >= r.top && sr.bottom <= r.bottom) {
        bits.push({ x: sr.left, r: sr.right, y: sr.top + sr.height / 2, h: sr.height, t: node.data });
        continue;
      }
      for (let i = 0; i < node.length; i++) {
        rng.setStart(node, i); rng.setEnd(node, i + 1);
        const b = rng.getBoundingClientRect();
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        if (b.width && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) bits.push({ x: b.left, r: b.right, y: cy, h: b.height, t: node.data[i] });
      }
    }
    // Into lines, top to bottom, left to right, with spaces at gaps.
    bits.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const b of bits) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(b.y - line.y) < Math.max(b.h, line.h) * 0.5) line.bits.push(b);
      else lines.push({ y: b.y, h: b.h, bits: [b] });
    }
    const text = lines.map(l => {
      l.bits.sort((a, b) => a.x - b.x);
      let s = '', end = null;
      for (const b of l.bits) {
        if (end != null && b.x - end > b.h * 0.2 && !/\s$/.test(s) && !/^\s/.test(b.t)) s += ' ';
        s += b.t;
        end = b.r;
      }
      return s.replace(/\s+/g, ' ').trim();
    }).filter(Boolean).join('\n');
    if (text) out.push(text);
  }
  return out.join('\n\n');
}
// A PNG of the region, drawn from the PDF (not copied off the screen).
async function regionImage(r) {
  const parts = [];
  for (const page of pagesIn(r)) {
    const pv = V.viewer.getPageView(+page.dataset.pageNumber - 1);
    if (!pv) continue;
    // (A page not drawn yet has no canvas: measured inside its border.)
    const pdfPage = pv.pdfPage || await V.doc.getPage(+page.dataset.pageNumber);
    const cw = page.querySelector('.canvasWrapper');
    let pb = cw && cw.getBoundingClientRect();
    if (!pb || !pb.width) {
      const b = page.getBoundingClientRect(), cs = getComputedStyle(page);
      pb = { left: b.left + parseFloat(cs.borderLeftWidth), top: b.top + parseFloat(cs.borderTopWidth), right: b.right - parseFloat(cs.borderRightWidth), bottom: b.bottom - parseFloat(cs.borderBottomWidth) };
    }
    const c = { left: Math.max(r.left, pb.left), top: Math.max(r.top, pb.top), right: Math.min(r.right, pb.right), bottom: Math.min(r.bottom, pb.bottom) };
    if (c.right - c.left < 2 || c.bottom - c.top < 2) continue;
    const w = c.right - c.left, h = c.bottom - c.top;
    const k = Math.min(2 * Math.max(1, window.devicePixelRatio || 1) / 1, Math.sqrt(16e6 / (w * h)));
    const vp = pdfPage.getViewport({ scale: pv.viewport.scale * k, rotation: pv.viewport.rotation });
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    await pdfPage.render({
      canvasContext: cv.getContext('2d'), viewport: vp,
      transform: [1, 0, 0, 1, -(c.left - pb.left) * k, -(c.top - pb.top) * k],
      annotationMode: V.lib.AnnotationMode.ENABLE_STORAGE,
    }).promise;
    parts.push(cv);
  }
  if (!parts.length) throw new Error('Nothing to copy there.');
  let out = parts[0];
  if (parts.length > 1) {
    out = document.createElement('canvas');
    out.width = Math.max(...parts.map(p => p.width));
    out.height = parts.reduce((n, p) => n + p.height, 0);
    const g = out.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
    let y = 0;
    for (const p of parts) { g.drawImage(p, 0, y); y += p.height; }
  }
  return new Promise((resolve, reject) => out.toBlob(b => (b ? resolve(b) : reject(new Error('The picture couldn\u2019t be made.'))), 'image/png'));
}
function showRegionMenu(r, hits) {
  REGION.rect = r; REGION.hits = hits;
  const m = $('#vRegion'), box = $('#vMarquee');
  box.hidden = false;
  box.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.right - r.left}px;height:${r.bottom - r.top}px`;
  $('#vRegionMarks').hidden = !hits.length;
  $('#vRegionMarks span').textContent = 'Select ' + hits.length + ' mark' + (hits.length === 1 ? '' : 's');
  $('#vRegionShare').hidden = !CAN_SHARE_IMAGE;
  // The picture is drawn straight away, so it's ready when Copy image or
  // Share image is tapped (the share sheet opens only at once on a tap).
  const png = regionImage(r);
  REGION.png = png; REGION.blob = null;
  png.then(b => { if (REGION.png === png) REGION.blob = b; }, () => {});
  m.hidden = false;
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let top = r.bottom + 8;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 8);
  m.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.left)) + 'px';
  m.style.top = top + 'px';
}
function hideRegionMenu() {
  $('#vRegion').hidden = true;
  $('#vMarquee').hidden = true;
  REGION.rect = null; REGION.hits = []; REGION.png = null; REGION.blob = null;
}
$('#vRegionText').addEventListener('click', () => {
  const text = REGION.rect ? regionText(REGION.rect) : '';
  hideRegionMenu();
  if (!text) { toast('There\u2019s no text there. Try Copy image.', 3000); return; }
  copy(text, 'Copied the text (' + text.length.toLocaleString() + ' characters)');
});
$('#vRegionImage').addEventListener('click', () => {
  const png = REGION.png;
  hideRegionMenu();
  if (!png) return;
  const share = () => png.then(async b => openIn(new Uint8Array(await b.arrayBuffer()), 'Selection.png', 'image/png', 'Downloading Selection.png'))
    .catch(err => toast('Couldn\u2019t make the picture: ' + errText(err), 5000));
  // The copy starts during the tap (Safari requires that); the picture
  // follows as it's drawn.
  try {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      .then(() => toast('Copied a picture of the selection', 2200), share);
  } catch (err) { share(); }
});
// Share image: to Messages, Mail, Photos, AirDrop and so on.
function shareRegionImage(blob) {
  const file = new File([blob], ((V.entry && V.entry.f.title) || 'Selection').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60).trim() + '.png', { type: 'image/png' });
  navigator.share({ files: [file] }).catch(err => {
    if (err && err.name === 'AbortError') return;
    // Drawn too slowly for the tap to count: offer it again, now ready.
    if (err && err.name === 'NotAllowedError') {
      vStatus('The picture is ready to share.', false, [['Share', () => { vStatus(''); shareRegionImage(blob); }], ['Cancel', () => vStatus('')]]);
      return;
    }
    toast('Couldn\u2019t share the picture: ' + errText(err), 5000);
  });
}
$('#vRegionShare').addEventListener('click', () => {
  const png = REGION.png, blob = REGION.blob;
  hideRegionMenu();
  if (blob) { shareRegionImage(blob); return; }
  if (png) png.then(shareRegionImage, err => toast('Couldn\u2019t make the picture: ' + errText(err), 5000));
});
$('#vRegionMarks').addEventListener('click', () => {
  const hits = REGION.hits;
  hideRegionMenu();
  V.ui.unselectAll();
  hits.forEach((ed, i) => { if (i === 0) V.ui.setSelected(ed); else if (!isPicked(ed)) V.ui.toggleSelected(ed); });
});
document.addEventListener('pointerdown', ev => {
  if ($('#vRegion').hidden || ev.target.closest('#vRegion')) return;
  hideRegionMenu();
}, true);

/* ---- the select tool */
// Tap a mark to pick it up (then drag to move it; pen strokes and text
// boxes can be resized). Or drag a box on empty page: then copy the text
// or a picture of what's inside, or select the marks it touches to
// delete, recolour, comment on or move them together.
// PDF.js, with its highlighting on (as it is while a mark you tapped is
// picked up, for a moment after a tool is put down, and with the
// highlighter highlighting text), takes a drag on the page off the words
// for a new freehand highlight: only the freehand highlighter, chosen,
// and used with the Pencil (or a finger, if it's the finger's tool),
// draws one. Otherwise the press goes no further than LibLande's own
// handling (selecting text, scrolling, picking up a mark); presses on a
// mark or its toolbar still reach it, and with the text highlighter, on
// the words.
$('#vScroll').addEventListener('pointerdown', ev => {
  if (!V.viewer || !V.lib) return;
  if (V.viewer.annotationEditorMode !== V.lib.AnnotationEditorType.HIGHLIGHT) return;
  const free = V.tool === 'highlight' && MARK.hlMode === 'free' && !(ev.pointerType === 'touch' && V.pencil);
  if (free) return;
  const t = ev.target;
  if (!t.closest || !t.closest('#vPages') || t.closest('.annotationEditorLayer > [id], .editToolbar, .note-pin')) return;
  if (V.tool === 'highlight' && t.closest('.textLayer span')) return;
  ev.stopPropagation();
}, true);
(() => {
  const sc = $('#vScroll'), box = $('#vMarquee');
  let start = null;
  const ours = ev => V.tool === 'select' && !(ev.pointerType === 'touch' && V.pencil) && V.ui;
  sc.addEventListener('pointerdown', ev => {
    if (!ours(ev) || ev.button > 0) return;
    if (ev.target.closest('.annotationEditorLayer > [id], .editToolbar, .note-pin')) return;
    ev.stopPropagation();
    ev.preventDefault();
    const ed = markAt(ev.clientX, ev.clientY);
    if (ed) { V.ui.setSelected(ed); return; }
    if (V.fromRead) { const t = V.fromRead === true ? 'read' : V.fromRead; V.ui.unselectAll(); setTool(t); return; }
    start = { x: ev.clientX, y: ev.clientY };
    try { sc.setPointerCapture(ev.pointerId); } catch (err) { /* fine without */ }
  }, true);
  const rectOf = (x, y) => ({ left: Math.min(start.x, x), top: Math.min(start.y, y), right: Math.max(start.x, x), bottom: Math.max(start.y, y) });
  sc.addEventListener('pointermove', ev => {
    if (!start || !ours(ev)) return;
    ev.stopPropagation();
    const r = rectOf(ev.clientX, ev.clientY);
    box.hidden = false;
    box.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.right - r.left}px;height:${r.bottom - r.top}px`;
  }, true);
  const end = async ev => {
    if (!start) return;
    ev.stopPropagation();
    const r = rectOf(ev.clientX, ev.clientY);
    start = null;
    if (r.right - r.left < 5 && r.bottom - r.top < 5) { box.hidden = true; V.ui.unselectAll(); return; }
    // Every mark the box touches, on the pages it covers.
    const hits = [], lines = [];
    const inBox = b => b.right >= r.left && b.left <= r.right && b.bottom >= r.top && b.top <= r.bottom;
    document.querySelectorAll('#vPages .page[data-page-number]').forEach(page => {
      const pr = page.getBoundingClientRect();
      if (pr.bottom < r.top || pr.top > r.bottom) return;
      for (const ed of V.ui.getEditors(+page.dataset.pageNumber - 1)) {
        if (!ed.div || ed.deleted || !ed.div.isConnected) continue;
        const b = ed.div.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        if (inBox(b)) hits.push(ed);
      }
      // Underlines and strike-throughs saved in the PDF aren't marks PDF.js
      // can edit: each gets LibLande's in its place (as a tap does), and
      // that one counts.
      page.querySelectorAll('.annotationLayer section.underlineAnnotation, .annotationLayer section.strikeoutAnnotation').forEach(sec => {
        const id = sec.dataset.annotationId;
        if (!id || TAKEN.has(id) || V.ui.isDeletedAnnotationElement?.(id)) return;
        const b = sec.getBoundingClientRect();
        if (b.width && inBox(b)) lines.push({ id, page });
      });
    });
    for (const hit of lines) {
      const ed = await takeOverLine(hit, true);
      if (ed) hits.push(ed);
    }
    if (lines.length) await redrawPages(lines.map(h => +h.page.dataset.pageNumber));
    V.ui.unselectAll();
    showRegionMenu(r, hits);
  };
  sc.addEventListener('pointerup', end, true);
  sc.addEventListener('pointercancel', () => { if (start) { start = null; box.hidden = true; } }, true);
})();

/* ---- icons on the selected mark's toolbar */
// PDF.js draws the comment and delete icons as CSS masks, which Safari on
// the iPad leaves blank there; so the buttons get real icons instead.
const EDIT_ICONS = {
  comment: ['Comment', '<path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z"/><path d="M8 9h8M8 12h5"/>'],
  deleteButton: ['Delete', '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>'],
};
// Drawings (and so underlines and strike-throughs) and text boxes: PDF.js
// gives them the system colour well, which on the iPad opens a full colour
// picker over the page (or nothing); they get LibLande's few colours
// instead, as a list like the highlights' (the list for the pen and text).
function colourList(tb) {
  const input = tb.querySelector('input.basicColorPicker, .colorPicker:not(.ll-colours)');
  if (!input || tb.querySelector('.ll-colours')) return;
  const div = tb.closest('.annotationEditorLayer > [id]'), ed = div && V.ui && V.ui.getEditor(div.id);
  if (!ed) return;
  const text = div.classList.contains('freeTextEditor'), line = lineKindOfEd(ed);
  // (A highlight keeps PDF.js's list of highlight colours.)
  if (input.matches('.colorPicker') && !line) return;
  const now = input.matches('input') ? input.value : ed.color || '#000000';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'colorPicker ll-colours';
  btn.title = 'Change colour';
  btn.setAttribute('aria-label', 'Change colour');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.backgroundColor = now;
  const dd = document.createElement('div');
  dd.className = 'dropdown hidden';
  dd.setAttribute('role', 'listbox');
  for (const [name, c] of PEN_COLORS) {
    const o = document.createElement('button');
    o.type = 'button';
    o.setAttribute('role', 'option');
    o.dataset.color = c;
    o.title = name;
    o.setAttribute('aria-label', name);
    o.setAttribute('aria-selected', String(c.toLowerCase() === String(now).toLowerCase()));
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.backgroundColor = c;
    o.append(sw);
    dd.append(o);
  }
  btn.append(swatch, dd);
  input.before(btn);
  input.hidden = true;
  input.style.display = 'none';
  const close = () => { dd.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const o = ev.target.closest('[data-color]');
    if (o) {
      const P = V.lib.AnnotationEditorParamsType;
      if (line) {
        // PDF.js gives a highlight a new colour at the usual highlight
        // opacity, which would make an underline a highlight: for this
        // change (and its Undo and Redo) the opacity it uses is the line's.
        // (PDF.js 6 takes the opacity with the colour; 5 took its default.)
        if (typeof ed._updateColorAndOpacity === 'function') ed._updateColorAndOpacity(o.dataset.color, LINE_OPACITY[line], P.HIGHLIGHT_COLOR);
        else {
          const HE = ed.constructor, was = HE._defaultOpacity;
          HE._defaultOpacity = LINE_OPACITY[line];
          try { ed.updateParams(P.HIGHLIGHT_COLOR, o.dataset.color); } finally { HE._defaultOpacity = was; }
        }
        decorateLine(ed);
      } else {
        ed.updateParams(text ? P.FREETEXT_COLOR : P.INK_COLOR, o.dataset.color);
      }
      swatch.style.backgroundColor = o.dataset.color;
      dd.querySelectorAll('[data-color]').forEach(x => x.setAttribute('aria-selected', String(x === o)));
      markDrawing();
      close();
      return;
    }
    const open = dd.classList.contains('hidden');
    dd.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
  });
  // (Any press outside the list closes it.)
  window.addEventListener('pointerdown', ev => { if (!btn.contains(ev.target)) close(); }, true);
}
function iconEditToolbar(root) {
  root.querySelectorAll('.editToolbar').forEach(colourList);
  if (root.matches && root.matches('.editToolbar')) colourList(root);
  for (const [cls, [name, svg]] of Object.entries(EDIT_ICONS)) {
    root.querySelectorAll('.editToolbar button.' + cls + ':not(.has-icon)').forEach(b => {
      b.classList.add('has-icon');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + svg + '</svg>';
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', name);
      if (!b.title) b.title = name;
    });
  }
}
new MutationObserver(list => {
  for (const m of list) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches('.editToolbar, .editToolbar *') || n.querySelector('.editToolbar')) { iconEditToolbar(n.closest('.editToolbar') || n); toolbarAtTap(); }
    if (n.matches('.annotationEditorLayer > .highlightEditor')) decorateLines();
  }
}).observe($('#vPages'), { childList: true, subtree: true });
// A mark's toolbar (and its colours) comes up where the mark was tapped,
// just below the tap, rather than at the mark's far corner (PDF.js's
// place, which can be far from the Pencil).
const TAP = { x: 0, y: 0, t: 0 };
$('#vScroll').addEventListener('pointerdown', ev => {
  if (ev.target.closest && ev.target.closest('.editToolbar')) return;
  Object.assign(TAP, { x: ev.clientX, y: ev.clientY, t: Date.now() });
}, true);
function toolbarAtTap() {
  if (Date.now() - TAP.t > 2500) return;
  const div = document.querySelector('#vPages .annotationEditorLayer > .selectedEditor');
  const tb = div && div.querySelector(':scope > .editToolbar');
  if (!tb || tb.classList.contains('hidden') || tb.dataset.tap === String(TAP.t)) return;
  const r = div.getBoundingClientRect();
  if (TAP.x < r.left - 30 || TAP.x > r.right + 30 || TAP.y < r.top - 30 || TAP.y > r.bottom + 30) return;
  tb.dataset.tap = String(TAP.t);
  // Centred on the tap, a little below it (in the mark's own units, since
  // it moves and zooms with the mark); then, once it has its size, kept on
  // screen, above the tap if there's no room below.
  const k = r.width / (div.offsetWidth || r.width) || 1;
  tb.style.insetInlineEnd = 'auto';
  tb.style.translate = '-50% 0';
  tb.style.left = (TAP.x - r.left) / k + 'px';
  tb.style.top = (TAP.y + 16 - r.top) / k + 'px';
  requestAnimationFrame(() => {
    const b = tb.getBoundingClientRect();
    if (!b.width) return;
    const dx = b.left < 8 ? 8 - b.left : b.right > window.innerWidth - 8 ? window.innerWidth - 8 - b.right : 0;
    if (dx) tb.style.left = (TAP.x + dx - r.left) / k + 'px';
    if (b.bottom > window.innerHeight - 8) tb.style.top = (TAP.y - 16 - b.height - r.top) / k + 'px';
  });
}
// A colour chosen: its list closes (PDF.js leaves it open).
$('#vPages').addEventListener('click', ev => {
  const opt = ev.target.closest && ev.target.closest('.colorPicker .dropdown [data-color], .colorPicker .dropdown button');
  if (!opt) return;
  const cp = opt.closest('.colorPicker'), dd = opt.closest('.dropdown');
  setTimeout(() => { dd.classList.add('hidden'); cp.setAttribute('aria-expanded', 'false'); }, 0);
}, true);

/* ---- picking up a mark when no tool is on */
// A tap on a mark (the Pencil, a finger or the mouse) switches to the select
// tool with that mark picked up and its toolbar showing; a tap on empty
// page then puts it down and turns the tool off again.
const READ_MARK_TYPES = ['highlight', 'underline', 'strikeout', 'squiggly', 'ink', 'freeText', 'stamp', 'text', 'square', 'circle', 'line', 'polygon', 'polyline', 'caret'];
const READ_MARKS = READ_MARK_TYPES.map(t => '.annotationLayer section.' + t + 'Annotation').join(', ') + ', .annotationEditorLayer > [id]';
function readMarkAt(x, y) {
  const page = document.elementsFromPoint(x, y).map(el => el.closest && el.closest('.page')).find(Boolean);
  if (!page) return null;
  for (const el of Array.from(page.querySelectorAll(READ_MARKS)).reverse()) {
    if (el.hidden || getComputedStyle(el).display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) return { page, id: el.dataset.annotationId || null };
  }
  return null;
}
async function pickUpMark(hit, x, y, back, bar) {
  // (PDF.js finishes switching tools a moment later, putting down whatever
  // is picked up as it does: a mark made here waits for that.)
  const switched = V.tool === 'select' || !V.bus ? Promise.resolve() : new Promise(res => {
    const done = () => { V.bus.off('annotationeditormodechanged', done); res(); };
    V.bus.on('annotationeditormodechanged', done);
    setTimeout(done, 2500);
  });
  setTool('select');
  V.fromRead = back || 'read';
  // (The select tool holds the mark, but no tool button lights up: you
  // didn't choose one.)
  if (V.fromRead === 'read') document.querySelectorAll('#vPalette [data-tool]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  const idx = +hit.page.dataset.pageNumber - 1;
  // A real underline or strike-through from the PDF: LibLande's in its place.
  const sec = hit.id && hit.page.querySelector(`.annotationLayer [data-annotation-id="${CSS.escape(hit.id)}"]`);
  if (sec && (sec.classList.contains('underlineAnnotation') || sec.classList.contains('strikeoutAnnotation'))) {
    await switched;
    const ed = V.tool === 'select' ? await takeOverLine(hit) : null;
    if (ed && V.tool === 'select') { V.ui.setSelected(ed); if (!back || bar) showBar(ed); return; }
  }
  for (let i = 0; i < 20; i++) {
    if (V.tool !== 'select') return;
    const ed = V.ui && ((hit.id && V.ui.getEditors(idx).find(e => e.annotationElementId === hit.id && !e.deleted)) || markAt(x, y));
    if (ed) { V.ui.setSelected(ed); if (!back || bar) showBar(ed); return; }
    await new Promise(r => setTimeout(r, 100));
  }
  if (V.tool === 'select' && V.fromRead) setTool(V.fromRead === true ? 'read' : V.fromRead);
  toast('That mark can\u2019t be edited here.', 3000);
}
(() => {
  const sc = $('#vScroll');
  let down = null;
  sc.addEventListener('pointerdown', ev => {
    down = V.tool === 'read' && V.ui && ev.button <= 0 && !ev.target.closest('.note-pin, .editToolbar, a')
      ? { x: ev.clientX, y: ev.clientY, t: Date.now() } : null;
  }, true);
  sc.addEventListener('pointerup', ev => {
    const d = down;
    down = null;
    if (!d || V.tool !== 'read' || LP.took) return;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8 || Date.now() - d.t > 600) return;
    if (!getSelection().isCollapsed) return;
    const hit = readMarkAt(d.x, d.y);
    if (!hit) return;
    getSelection().removeAllRanges();
    pickUpMark(hit, d.x, d.y);
  }, true);
})();


/* ---- note icons for comments */
// Every mark with a comment gets a note icon in the page's right margin,
// level with the mark; tapping it opens the comment. Comments already in
// the PDF (from any app) come from the page's annotations; marks added or
// changed in this session come from PDF.js's editors, and take precedence.
const PIN_TYPES = new Set(['Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Ink', 'Text', 'Square', 'Circle', 'Line', 'Polygon', 'PolyLine', 'Caret', 'Stamp']);
const PINS = { annots: new Map(), timer: 0 };
function pinsReset() { PINS.annots = new Map(); }
async function pageComments(pv) {
  const n = pv.id;
  if (!PINS.annots.has(n)) {
    PINS.annots.set(n, pv.pdfPage.getAnnotations().then(list => list.filter(a =>
      PIN_TYPES.has(a.subtype) && a.contentsObj && a.contentsObj.str && a.contentsObj.str.trim())).catch(() => []));
  }
  return PINS.annots.get(n);
}
async function refreshPins(n) {
  const v = V.viewer;
  if (!v || !V.doc) return;
  const pv = v.getPageView(n - 1);
  if (!pv || !pv.pdfPage || !pv.div) return;
  const page = pv.div, idx = n - 1;
  let box = page.querySelector(':scope > .note-pins');
  const pins = [];
  const eds = V.ui ? V.ui.getEditors(idx) : [];
  const taken = new Set();
  const h = page.clientHeight || page.getBoundingClientRect().height;
  for (const ed of eds) {
    if (ed.annotationElementId) taken.add(ed.annotationElementId);
    const text = commentText(ed);
    if (!text || ed.deleted || isNoteEd(ed)) continue;
    pins.push({ top: (ed.y || 0) * h, text, ed });
  }
  for (const a of await pageComments(pv)) {
    if (taken.has(a.id)) continue;
    const sec = page.querySelector(`.annotationLayer [data-annotation-id="${CSS.escape(a.id)}"]`);
    if (sec && (sec.hidden || sec.style.display === 'none')) continue;
    if (sec && a.subtype === 'Text') continue;
    const vp = pv.viewport, top = Math.min(vp.convertToViewportPoint(a.rect[0], a.rect[1])[1], vp.convertToViewportPoint(a.rect[2], a.rect[3])[1]);
    pins.push({ top, text: a.contentsObj.str, annot: a });
  }
  if (!pins.length) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.className = 'note-pins'; page.appendChild(box); }
  // Pins that would overlap are nudged down.
  pins.sort((p, q) => p.top - q.top);
  let last = -Infinity;
  box.replaceChildren(...pins.map(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'note-pin';
    b.title = p.text.length > 200 ? p.text.slice(0, 200) + '\u2026' : p.text;
    b.setAttribute('aria-label', 'Comment: ' + b.title);
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z"/></svg>';
    const top = Math.max(p.top, last + 24);
    last = top;
    b.style.top = Math.max(2, top - 2) + 'px';
    b._pin = p;
    return b;
  }));
}
function refreshAllPins() {
  clearTimeout(PINS.timer);
  PINS.timer = setTimeout(() => {
    document.querySelectorAll('#vPages .page[data-page-number]').forEach(p => {
      if (p.querySelector('.canvasWrapper canvas')) refreshPins(+p.dataset.pageNumber);
    });
  }, 120);
}
$('#vPages').addEventListener('click', async ev => {
  const b = ev.target.closest('.note-pin');
  if (!b) return;
  ev.stopPropagation();
  const p = b._pin, anchor = b.getBoundingClientRect();
  if (p.ed) { openComment(p.ed, false, anchor); return; }
  // A comment in the PDF: PDF.js turns it into an editable mark in an
  // editing mode, so switch to the comment tool and find it.
  const idx = +b.closest('.page').dataset.pageNumber - 1;
  if (V.tool !== 'comment') setTool('comment');
  for (let i = 0; i < 20; i++) {
    const ed = V.ui && V.ui.getEditors(idx).find(e => e.annotationElementId === p.annot.id);
    if (ed) { openComment(ed, false, anchor); return; }
    await new Promise(r => setTimeout(r, 100));
  }
  toast('That comment can\u2019t be edited here.', 3000);
}, true);
$('#vPages').addEventListener('pointerdown', ev => { if (ev.target.closest('.note-pin')) ev.stopPropagation(); }, true);

// Highlighting text: while dragging, the words show in the highlight
// colour as continuous bars, one per line (the browser's own selection is
// hidden, since it's drawn piece by piece, and in its own blue on iPad).
// The bars follow the selection at most once a frame. With the Pencil,
// which iPadOS doesn't let select web text, LibLande makes the selection
// itself; either way PDF.js turns it into the highlight on release.
(() => {
  const sc = $('#vScroll'), preview = $('#hlPreview');
  let anchor = null, range = null, frame = 0, dragging = false, path = null;
  // A spot in the page's text (not a gap, or another page).
  const pageOfNode = n => n && (n.nodeType === 3 ? n.parentNode : n).closest && (n.nodeType === 3 ? n.parentNode : n).closest('.page');
  const textAt = (x, y, page) => {
    const c = caret(x, y);
    if (!c || !c.node || c.node.nodeType !== 3 || !c.node.parentNode.closest('.textLayer')) return null;
    return !page || pageOfNode(c.node) === page ? c : null;
  };
  const caret = (x, y) => {
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, offset: p.offset }; }
    const r = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
    return r && { node: r.startContainer, offset: r.startOffset };
  };
  const rangeTo = focus => {
    const r = document.createRange();
    try {
      r.setStart(anchor.node, anchor.offset);
      r.setEnd(focus.node, focus.offset);
      if (r.collapsed) { r.setStart(focus.node, focus.offset); r.setEnd(anchor.node, anchor.offset); }
    } catch (err) { return null; }
    return r.collapsed ? null : r;
  };
  const inText = r => { const n = r.commonAncestorContainer; return !!(n && (n.nodeType === 3 ? n.parentNode : n).closest('.textLayer, .page')); };
  // The range's boxes joined into one bar per line.
  const bars = r => {
    const boxes = textRects(r).filter(b => b.width >= 1 && b.height >= 1)
      .sort((a, b) => a.top - b.top || a.left - b.left);
    const out = [];
    for (const b of boxes) {
      const line = out.find(l => Math.min(l.bottom, b.bottom) - Math.max(l.top, b.top) > Math.min(l.bottom - l.top, b.height) * 0.5);
      if (line) {
        line.left = Math.min(line.left, b.left); line.right = Math.max(line.right, b.right);
        line.top = Math.min(line.top, b.top); line.bottom = Math.max(line.bottom, b.bottom);
      } else {
        out.push({ left: b.left, right: b.right, top: b.top, bottom: b.bottom });
      }
    }
    return joinLines(out);
  };
  const draw = () => {
    frame = 0;
    const r = range || (dragging && getSelection().rangeCount ? getSelection().getRangeAt(0) : null);
    let list = [];
    if (r && !r.collapsed) {
      TEXT_CLIP = path ? dragColumn(path) : null;
      try { list = bars(snapWords(r)); } finally { TEXT_CLIP = null; }
    }
    while (preview.children.length < list.length) preview.appendChild(document.createElement('div'));
    Array.from(preview.children).forEach((d, i) => {
      const b = list[i];
      d.hidden = !b;
      if (b) d.style.cssText = `left:${b.left - 1}px;top:${b.top}px;width:${b.right - b.left + 2}px;height:${b.bottom - b.top}px`;
    });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const active = () => V.tool === 'highlight' && MARK.hlMode === 'text';
  // Making a highlight longer: press on it with the Pencil and drag over
  // more words; it grows to take them in, keeping its colour and comment.
  // Other text highlights it reaches (or comes up next to) are merged into
  // it, their comments too. A tap still selects it. One step for Undo.
  let ext = null;
  const hlSvg = (page, r) => Array.from(page.querySelectorAll('.canvasWrapper svg.highlight')).find(v => {
    const q = v.getBoundingClientRect();
    return Math.abs(q.left - r.left) < 3 && Math.abs(q.top - r.top) < 3 && Math.abs(q.width - r.width) < 3 && Math.abs(q.height - r.height) < 3;
  }) || null;
  // The first and last letters under a highlight.
  const hlEnds = (div, page) => {
    const r = div.getBoundingClientRect(), svg = hlSvg(page, r), path = svg && svg.querySelector('path');
    const vb = svg ? (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number) : null;
    const inside = (px, py) => !path || !path.isPointInFill || path.isPointInFill(new DOMPoint(vb[0] + (px - r.left) / r.width * vb[2], vb[1] + (py - r.top) / r.height * vb[3]));
    const rng = document.createRange();
    let first = null, last = null;
    for (const span of page.querySelectorAll('.textLayer span')) {
      const sr = span.getBoundingClientRect();
      if (sr.right < r.left || sr.left > r.right || sr.bottom < r.top || sr.top > r.bottom) continue;
      const node = span.firstChild;
      if (!node || node.nodeType !== 3) continue;
      for (let i = 0; i < node.length; i++) {
        rng.setStart(node, i); rng.setEnd(node, i + 1);
        const b = rng.getBoundingClientRect();
        if (b.width < 0.5 || !inside(b.left + b.width / 2, b.top + b.height / 2)) continue;
        if (!first) first = { node, offset: i };
        last = { node, offset: i + 1 };
      }
    }
    return first && { first, last, opacity: (svg && parseFloat(svg.getAttribute('fill-opacity'))) || 1 };
  };
  // The text highlights of one colour on a page that overlap a range or
  // sit next to it (nothing but spaces between); the range grows to take
  // them in. Highlights of other colours stay separate.
  const sameColour = (c1, c2) => {
    const a = hexRgb(c1 || '#FFFF98'), b = hexRgb(c2 || '#FFFF98');
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 60;
  };
  const between = (a, b) => {
    try { const g = document.createRange(); g.setStart(a.node, a.offset); g.setEnd(b.node, b.offset); return g.toString(); } catch (err) { return 'x'; }
  };
  const touching = (page, r, skip, colour) => {
    const out = [];
    for (let pass = 0, grew = true; grew && pass < 5; pass++) {
      grew = false;
      for (const o of V.ui.getEditors(+page.dataset.pageNumber - 1)) {
        if (o === skip || out.includes(o) || o.deleted || !o.div || !o.div.isConnected) continue;
        if (!o.div.classList.contains('highlightEditor') || o.div.classList.contains('free') || lineKindOfEd(o) || !sameColour(o.color, colour)) continue;
        const e = hlEnds(o.div, page);
        if (!e) continue;
        let a, b;
        try { a = r.comparePoint(e.first.node, e.first.offset); b = r.comparePoint(e.last.node, e.last.offset); } catch (err) { continue; }
        const rs = { node: r.startContainer, offset: r.startOffset }, re = { node: r.endContainer, offset: r.endOffset };
        if (a === 1 && between(re, e.first).trim()) continue;
        if (b === -1 && between(e.last, rs).trim()) continue;
        if (r.comparePoint(e.first.node, e.first.offset) < 0) r.setStart(e.first.node, e.first.offset);
        if (r.comparePoint(e.last.node, e.last.offset) > 0) r.setEnd(e.last.node, e.last.offset);
        out.push(o);
        grew = true;
      }
    }
    return out;
  };
  // One highlight over the range in place of the old ones (their comments
  // joined), as one step for Undo.
  const replaceWith = async (page, r, old, color, opacity) => {
    const idx = +page.dataset.pageNumber - 1, layer = V.ui.getLayer(idx);
    const boxes = layer ? toPdfBoxes(page, bars(r)) : [];
    if (!boxes.length) return;
    const quads = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of boxes) {
      quads.push(b.xl, b.yt, b.xr, b.yt, b.xl, b.yb, b.xr, b.yb);
      x0 = Math.min(x0, b.xl); x1 = Math.max(x1, b.xr); y0 = Math.min(y0, b.yb); y1 = Math.max(y1, b.yt);
    }
    const piece = await layer.deserialize({
      annotationType: V.lib.AnnotationEditorType.HIGHLIGHT, color: hexRgb(color || '#FFFF98'), opacity: opacity || 1,
      quadPoints: Float32Array.from(quads), boxes: null, pageIndex: idx, rect: [x0, y0, x1, y1], rotation: 0,
    });
    if (!piece) return;
    const note = old.map(commentText).filter(Boolean).join('\n\n');
    old.forEach(o => o.remove());
    putMark(layer, piece);
    if (note) { try { piece.comment = note; } catch (err) { /* keeps the old ones on Undo */ } }
    V.ui.addCommands({
      cmd: () => { old.forEach(o => o.remove()); putMark(layer, piece, true); },
      undo: () => { piece.remove(); old.forEach(o => putMark(layer, o, true)); },
      mustExec: false,
    });
    markDrawing();
    refreshPins(idx + 1);
    // Shown, not selected (as with a new highlight).
    setTimeout(() => { if (V.ui) V.ui.unselectAll(); }, 0);
  };
  const extend = (x, r) => replaceWith(x.page, r, [x.ed, ...touching(x.page, r, x.ed, x.ed.color)], x.ed.color, x.ends.opacity);
  // A new highlight over or next to others of its colour joins them.
  // True if it did (and PDF.js then makes nothing of the selection).
  const mergeNew = r => {
    if (!V.ui) return false;
    const pg = n => pageOf(n.nodeType === 3 ? n.parentNode : n);
    const page = pg(r.startContainer);
    if (!page || page !== pg(r.endContainer)) return false;
    const m = r.cloneRange(), hits = touching(page, m, null, MARK.hlColor);
    if (!hits.length) return false;
    const e = hlEnds(hits[0].div, page);
    V.newHighlight = false;
    replaceWith(page, m, hits, hits[0].color, e && e.opacity).catch(err => console.warn(err));
    return true;
  };
  // A new highlight over a range, one per page it crosses (LibLande makes
  // it, rather than leaving a selection for PDF.js to highlight).
  const makeNew = r => {
    for (const page of document.querySelectorAll('#vPages .page')) {
      if (!r.intersectsNode(page)) continue;
      const tl = page.querySelector('.textLayer');
      if (!tl) continue;
      const sub = r.cloneRange();
      try {
        if (r.comparePoint(tl, 0) === 0) sub.setStart(tl, 0);
        if (r.comparePoint(tl, tl.childNodes.length) === 0) sub.setEnd(tl, tl.childNodes.length);
      } catch (err) { continue; }
      if (!sub.collapsed && sub.toString().trim()) replaceWith(page, sub, [], MARK.hlColor, 1).catch(err => console.warn(err));
    }
  };
  sc.addEventListener('pointerdown', ev => {
    ext = null;
    if (V.tool !== 'highlight' || ev.pointerType !== 'pen' || !V.ui) return;
    // (Only with the highlighter set to the highlight's colour.)
    const pressed = ev.target.closest && ev.target.closest('.annotationEditorLayer > .highlightEditor');
    const pe = pressed && V.ui.getEditor(pressed.id);
    if (pe && !sameColour(pe.color, MARK.hlColor)) return;
    // (Not the highlight's toolbar, such as its colours, which PDF.js puts
    // inside the highlight: a tap there changes the colour.)
    if (ev.target.closest && ev.target.closest('.editToolbar, .colorPicker, .dropdown, button')) return;
    const div = ev.target.closest && ev.target.closest('.annotationEditorLayer > .highlightEditor');
    if (!div || div.classList.contains('free')) return;
    const ed = V.ui.getEditor(div.id);
    if (ed) ext = { ed, div, page: div.closest('.page'), x: ev.clientX, y: ev.clientY, ends: null };
  }, true);
  sc.addEventListener('pointermove', ev => {
    if (!ext || ev.pointerType !== 'pen') return;
    ev.stopPropagation();
    if (!ext.ends) {
      if (Math.hypot(ev.clientX - ext.x, ev.clientY - ext.y) < 6) return;
      ext.ends = hlEnds(ext.div, ext.page);
      if (!ext.ends) { ext = null; return; }
      V.ui.unselectAll();
      dragging = true;
      $('#viewer').classList.add('hl-drag');
    }
    const f = caret(ev.clientX, ev.clientY);
    if (!f || !f.node || !ext.page.contains(f.node) || !f.node.parentNode.closest('.textLayer')) return;
    const e = ext.ends, r = document.createRange();
    try {
      r.setStart(e.first.node, e.first.offset);
      r.setEnd(e.last.node, e.last.offset);
      const c = r.comparePoint(f.node, f.offset);
      if (c < 0) r.setStart(f.node, f.offset); else if (c > 0) r.setEnd(f.node, f.offset);
    } catch (err) { return; }
    range = r;
    schedule();
  }, true);
  window.addEventListener('pointerup', ev => {
    const x = ext;
    ext = null;
    if (!x || !x.ends || !range) return;
    ev.stopPropagation();
    extend(x, snapWords(range)).catch(err => console.warn(err));
  }, true);
  sc.addEventListener('pointerdown', ev => {
    anchor = null; range = null; dragging = false;
    if (!active() || (ev.pointerType === 'touch' && V.pencil)) return;
    // In text mode, a press on blank page (not on words) doesn't start a
    // freehand highlight, which is what PDF.js would otherwise do.
    if (ev.target.classList && (ev.target.classList.contains('textLayer') || ev.target.classList.contains('endOfContent'))) ev.stopPropagation();
    // A press on a highlight of another colour starts a new highlight over
    // it (one of the same colour is made longer instead: see ext).
    const onHl = ev.target.closest && ev.target.closest('.annotationEditorLayer > .highlightEditor:not(.free)');
    if (onHl) {
      const ed = V.ui && V.ui.getEditor(onHl.id);
      if (!ed || sameColour(ed.color, MARK.hlColor) || ev.target.closest('.editToolbar')) return;
      ev.stopPropagation();
    } else if (!ev.target.closest('.textLayer')) return;
    dragging = true;
    // The Pencil, and a finger (no Pencil known), pick the words directly:
    // the iPad doesn't let the Pencil select web text, and a phone only
    // does after a long press.
    const direct = ev.pointerType === 'pen' || ev.pointerType === 'touch' || !!onHl;
    path = { minY: ev.clientY, maxY: ev.clientY, minX: ev.clientX, maxX: ev.clientX, page: ev.target.closest('.page'), pen: direct };
    // (Highlights let presses through now, so the words under them are found.)
    $('#viewer').classList.add('hl-drag');
    if (direct) {
      anchor = textAt(ev.clientX, ev.clientY);
      getSelection().removeAllRanges();
    }
  }, true);
  sc.addEventListener('pointermove', ev => {
    if (!dragging || !path) return;
    path.minY = Math.min(path.minY, ev.clientY); path.maxY = Math.max(path.maxY, ev.clientY);
    path.minX = Math.min(path.minX, ev.clientX); path.maxX = Math.max(path.maxX, ev.clientX);
    if ((ev.pointerType !== 'pen' && ev.pointerType !== 'touch') || !path.pen || LP.took) return;
    // The Pencil's selection: from where it first touched words to where
    // it is now, on the same page. (Over a gap between words the browser
    // can report a spot far off; those are skipped.)
    if (!anchor) { anchor = textAt(ev.clientX, ev.clientY, path.page); return; }
    const focus = textAt(ev.clientX, ev.clientY, pageOfNode(anchor.node));
    if (!focus) return;
    range = rangeTo(focus);
    schedule();
  }, true);
  // The mouse (and a finger): follow the browser's own selection.
  document.addEventListener('selectionchange', () => { if (dragging && !anchor && active()) schedule(); });
  const up = () => {
    const sel = getSelection();
    if (PAN.used || LP.took) {
      sel.removeAllRanges();
      anchor = null; range = null; dragging = false;
      Array.from(preview.children).forEach(d => { d.hidden = true; });
      $('#viewer').classList.remove('hl-drag');
      return;
    }
    let made = null;
    if (anchor && range) made = snapWords(range);
    else if (dragging && active() && sel.rangeCount && !sel.isCollapsed && inText(sel.getRangeAt(0))) made = snapWords(sel.getRangeAt(0));
    // Only text within reach of where you dragged, side to side (so lines
    // of the other column don't come along); and not a highlight that then
    // still runs well above or below where you dragged (a selection that
    // jumped): that's a mistake, not what you meant.
    TEXT_CLIP = path ? dragColumn(path) : null;
    try {
      if (made && path) {
        const bs = bars(made), hs = bs.map(b => b.bottom - b.top).sort((a, b) => a - b);
        const pad = Math.max(12, 1.5 * (hs[hs.length >> 1] || 0));
        if (!bs.length || bs.some(b => b.bottom < path.minY - pad || b.top > path.maxY + pad)) {
          made = null;
          toast('That highlight ran past where you dragged, so it wasn\u2019t made. Try again.', 3500);
        }
      }
      if (made) {
        sel.removeAllRanges();
        if (!mergeNew(made)) makeNew(made);
      } else if (dragging && active()) sel.removeAllRanges();
    } finally { TEXT_CLIP = null; }
    path = null;
    if (dragging && active()) holdScroll();
    anchor = null; range = null;
    if (!dragging) return;
    dragging = false;
    setTimeout(() => {
      if (dragging) return;
      Array.from(preview.children).forEach(d => { d.hidden = true; });
      $('#viewer').classList.remove('hl-drag');
    }, 120);
  };
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
})();
// A finger with a tool on (and no Pencil) marks; it doesn't start the
// phone's own text selection.
let lastPointer = '';
window.addEventListener('pointerdown', ev => { lastPointer = ev.pointerType; }, true);
document.addEventListener('selectstart', ev => {
  const el = ev.target && (ev.target.nodeType === 3 ? ev.target.parentNode : ev.target);
  if (lastPointer === 'touch' && !V.pencil && V.tool !== 'read' && !$('#viewer').hidden && el && el.closest && el.closest('#vScroll')) ev.preventDefault();
}, true);
// With a tool on, PDF.js turns any text selection into a highlight -- one
// a finger's press makes on the iPad, say. LibLande makes highlights itself
// (above), so PDF.js doesn't hear of selections then.
document.addEventListener('selectionchange', ev => {
  if (V.ui && V.tool !== 'read' && !$('#viewer').hidden) ev.stopImmediatePropagation();
});

/* ---- quoting: a passage selected while reading, copied with its citation */
// A passage selected in Read mode gets a small bar with Quote, which copies
// it as APA has it: "the passage" (Lee, 2026, p. 4), or, at 40 words or
// more, as a block quotation with the citation after it. The page is the
// journal's: from the PDF's own page labels, or the publication's page
// range lined up with the PDF (a cover page skipped), or the number printed
// at the top or foot of the page. A guess is marked, and can be changed.
const QUOTE = { el: null, sel: null, timer: 0, run: 0, down: new Set() };
const LIGATURES = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
function quoteText(raw) {
  let t = String(raw).replace(/­/g, '').replace(/[ﬀ-ﬆ]/g, c => LIGATURES[c])
    .replace(/(\p{L})[-‐]\s*\n\s*(\p{Ll})/gu, '$1$2')
    .replace(/\s+/g, ' ').trim();
  // (Quotation marks in the passage become single ones.)
  let open = false;
  t = t.replace(/[“”"]/g, c => c === '“' ? '‘' : c === '”' ? '’' : ((open = !open) ? '‘' : '’'));
  return t;
}
// Italic and bold, from the passage's own fonts: each span of a page's
// text layer is one of the page's text items (those with text), in order,
// and each item names its font. A font is italic or bold by its name
// ("MinionPro-It", "Times-BoldItalic", "AdvOT1234.BI") or its flags.
// Per page: an array, one {i, b} for each span.
const FONT_I = /italic|oblique|slant|-it$|-it[a-z]*$|\bit$|\.b?i$|-ital/i;
const FONT_B = /bold|black|heavy|semibold|demibold|-bd|\bbd$|\.bi?$|-sb$/i;
async function quoteFonts(n) {
  const cache = V.quoteFonts || (V.quoteFonts = new Map());
  if (cache.has(n)) return cache.get(n);
  let out = null;
  try {
    const page = await V.doc.getPage(n);
    await page.getOperatorList();
    const items = (await page.getTextContent({ includeMarkedContent: true })).items.filter(it => it.str);
    out = items.map(it => {
      let f = null;
      try { f = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null; } catch (err) { /* none */ }
      const name = String((f && f.name) || '').replace(/^[A-Z]{6}\+/, '');
      return { i: !!(f && f.italic) || FONT_I.test(name), b: !!(f && (f.bold || f.black)) || FONT_B.test(name) };
    });
  } catch (err) { out = null; }
  cache.set(n, out);
  return out;
}
// The selection as letters, each with its style (0 plain, 1 italic, 2
// bold, 3 both), line ends as "\n"; then tidied as quoteText tidies.
async function quoteLetters(range) {
  const pages = new Map(), spansOf = page => {
    if (!pages.has(page)) pages.set(page, [...page.querySelectorAll('.textLayer span')].filter(x => !x.classList.contains('markedContent') && !x.querySelector('span')));
    return pages.get(page);
  };
  const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const out = [];
  for (let node = walk.currentNode; node; node = walk.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    if (node.nodeType === 1) { if (node.tagName === 'BR') out.push({ c: '\n', s: 0 }); continue; }
    const span = node.parentElement && node.parentElement.closest('.textLayer span');
    const page = span && span.closest('.page');
    if (!page || !page.closest('#vPages')) continue;
    const from = node === range.startContainer ? range.startOffset : 0, to = node === range.endContainer ? range.endOffset : node.length;
    const fonts = await quoteFonts(+page.dataset.pageNumber), k = spansOf(page).indexOf(span), f = fonts && k >= 0 ? fonts[k] : null;
    const st = f ? (f.i ? 1 : 0) + (f.b ? 2 : 0) : 0;
    for (const c of node.data.slice(from, to)) out.push({ c, s: st });
  }
  // (The text of the pages, to tell a hyphenated word from a broken one.)
  const pageText = norm([...pages.keys()].map(pg => (pg.querySelector('.textLayer') || {}).innerText || '').join('\n'));
  // The tidying: soft hyphens out, ligatures spelled out, a word broken at
  // a line's end joined, spaces and line ends as single spaces, quotation
  // marks inside made single.
  let L = [];
  out.forEach(x => {
    if (x.c === '­') return;
    const lig = LIGATURES[x.c];
    if (lig) [...lig].forEach(c => L.push({ c, s: x.s })); else L.push(x);
  });
  const joined = [];
  for (let i = 0; i < L.length; i++) {
    if (/[-‐]/.test(L[i].c) && i > 0 && /\p{L}/u.test(L[i - 1].c)) {
      let j = i + 1;
      while (j < L.length && /[ \t]/.test(L[j].c)) j++;
      if (j < L.length && L[j].c === '\n') {
        j++;
        while (j < L.length && /\s/.test(L[j].c)) j++;
        if (j < L.length && /\p{Ll}/u.test(L[j].c)) {
          // (Kept, as "sense-data", when the page has the word so elsewhere.)
          let a = i - 1, b = j;
          while (a > 0 && /\p{L}/u.test(L[a - 1].c)) a--;
          while (b < L.length - 1 && /\p{L}/u.test(L[b + 1].c)) b++;
          const word = L.slice(a, i).map(x => x.c).join('') + '-' + L.slice(j, b + 1).map(x => x.c).join('');
          if (pageText.includes(norm(word))) joined.push(L[i]);
          i = j - 1;
          continue;
        }
      }
    }
    joined.push(L[i]);
  }
  L = [];
  joined.forEach(x => {
    if (/\s/.test(x.c)) { if (L.length && L[L.length - 1].c !== ' ') L.push({ c: ' ', s: L[L.length - 1].s }); return; }
    L.push(x);
  });
  while (L.length && L[0].c === ' ') L.shift();
  while (L.length && L[L.length - 1].c === ' ') L.pop();
  let open = false;
  L.forEach(x => { if (x.c === '“') x.c = '‘'; else if (x.c === '”') x.c = '’'; else if (x.c === '"') x.c = (open = !open) ? '‘' : '’'; });
  return L;
}
// Letters to HTML: runs of the same style in <i>, <b>.
function lettersHTML(L) {
  let html = '', run = '', st = -1;
  const flush = () => { if (!run) return; let h = esc(run); if (st & 1) h = '<i>' + h + '</i>'; if (st & 2) h = '<b>' + h + '</b>'; html += h; run = ''; };
  L.forEach(x => { const s = x.c === ' ' ? st : x.s; if (s !== st) { flush(); st = s; } run += x.c; });
  flush();
  return html;
}
// The printed numbers at the top or foot of a PDF page.
async function printedNumbers(n) {
  try {
    const page = await V.doc.getPage(n), h = page.view[3] - page.view[1];
    const items = (await page.getTextContent()).items;
    return items.filter(it => /^\d{1,4}$/.test((it.str || '').trim()) && (it.transform[5] > h * 0.86 || it.transform[5] < h * 0.12)).map(it => +it.str.trim());
  } catch (err) { return []; }
}
// The journal's page for a PDF page: {page, sure}.
async function printedPage(n) {
  const doc = V.doc, cache = V.quotePages || (V.quotePages = new Map());
  if (cache.has(n)) return cache.get(n);
  let out = null;
  if (V.pageLabels === undefined) V.pageLabels = await doc.getPageLabels().catch(() => null);
  const L = V.pageLabels;
  if (L && L.some((l, i) => l !== String(i + 1)) && /^(\d+|[ivxlcdm]+)$/i.test(L[n - 1] || '')) out = { page: L[n - 1], sure: true };
  const m = /^(\d+)\s*[-–—]+\s*(\d+)$/.exec(((V.entry && V.entry.f.pages) || '').trim());
  const start = m ? +m[1] : 0, count = m ? +m[2] - start + 1 : 0, N = doc.numPages;
  if (!out && m && N === count) out = { page: String(start + n - 1), sure: true };
  if (!out && m && N === count + 1 && n > 1) out = { page: String(start + n - 2), sure: true };
  if (!out) {
    const here = await printedNumbers(n);
    if (here.length) {
      const next = n < N ? await printedNumbers(n + 1) : [], prev = n > 1 ? await printedNumbers(n - 1) : [];
      const seq = here.find(x => next.includes(x + 1) || prev.includes(x - 1));
      out = seq != null ? { page: String(seq), sure: true } : here.length === 1 ? { page: String(here[0]), sure: false } : null;
    }
  }
  if (!out) out = { page: String(m ? start + n - 1 : n), sure: false };
  cache.set(n, out);
  return out;
}
// The selection, if it's a passage of the paper being read.
function quoteSelection() {
  if ($('#viewer').hidden || !V.doc || !V.entry || V.tool !== 'read') return null;
  const s = getSelection();
  if (!s || s.isCollapsed || !s.rangeCount) return null;
  const r = s.getRangeAt(0), el = n => (n && n.nodeType === 3 ? n.parentNode : n);
  const a = el(r.startContainer), b = el(r.endContainer);
  if (!a || !b || !a.closest || !a.closest('#vPages .textLayer') || !b.closest('#vPages .page')) return null;
  const text = quoteText(s.toString());
  if (text.length < 2) return null;
  const pa = +a.closest('.page').dataset.pageNumber, pb = +b.closest('.page').dataset.pageNumber;
  return { text, from: Math.min(pa, pb), to: Math.max(pa, pb), rect: r.getBoundingClientRect(), range: r.cloneRange() };
}
// Dark pages: kept for this device.
function setDarkPages(on) {
  store.set('darkPages', !!on);
  $('#viewer').classList.toggle('dark-pages', !!on);
  $('#vDarkBtn').setAttribute('aria-pressed', String(!!on));
}
setDarkPages(store.get('darkPages', false));
$('#vDarkBtn').addEventListener('click', () => setDarkPages(!$('#viewer').classList.contains('dark-pages')));
function hideQuote() { if (QUOTE.el) QUOTE.el.hidden = true; QUOTE.sel = null; }
function quoteDismiss() {
  if (QUOTE.el && QUOTE.el.contains(document.activeElement)) document.activeElement.blur();
  hideQuote();
  const sel = getSelection();
  if (sel) sel.removeAllRanges();
}
async function showQuote() {
  const sel = quoteSelection();
  if (!sel) { hideQuote(); return null; }
  const my = ++QUOTE.run;
  const [p1, p2] = await Promise.all([printedPage(sel.from), sel.to !== sel.from ? printedPage(sel.to) : null]);
  // (Its italics and bold, worked out now: the copy itself has to be at
  // once, on the click.)
  const L = await quoteLetters(sel.range).catch(() => null);
  if (my !== QUOTE.run) return null;
  if (L && L.length) { sel.letters = L; sel.text = L.map(x => x.c).join(''); }
  if (!QUOTE.el) {
    QUOTE.el = document.createElement('div');
    QUOTE.el.className = 'quote-bar';
    QUOTE.el.innerHTML = `<button type="button" class="quote-go" title="Copy the passage as a quotation, with its citation (${esc(keyHint('quote'))})">${ICON.quote}<span>Quote</span></button>` +
      `<label class="quote-pg"><span>p.</span><input type="text" inputmode="numeric" autocomplete="off" aria-label="Page" readonly></label>`;
    QUOTE.el.querySelector('.quote-go').addEventListener('click', quoteCopy);
    // (Pressing in the bar keeps the selection.) The page box can be
    // written in only once pressed: otherwise the iPad's Scribble takes a
    // Pencil passing near it for handwriting.
    QUOTE.el.addEventListener('pointerdown', ev => {
      const inp = ev.target.closest('input');
      if (!inp) { ev.preventDefault(); return; }
      if (inp.readOnly) { inp.readOnly = false; setTimeout(() => { inp.focus(); inp.select(); }, 0); }
    });
    QUOTE.el.querySelector('input').addEventListener('blur', ev => { ev.target.readOnly = true; });
    QUOTE.el.querySelector('input').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); quoteCopy(); } });
    // (Wide enough for what's typed: 327–345, say.)
    QUOTE.el.querySelector('input').addEventListener('input', ev => { ev.target.size = Math.max(3, ev.target.value.length + 1); });
    document.body.appendChild(QUOTE.el);
  }
  QUOTE.sel = sel;
  // (Another passage chosen: the last copy's tidying up is called off.)
  const go = QUOTE.el.querySelector('.quote-go');
  if (go.classList.contains('done') && QUOTE.copied !== sel.text) { clearTimeout(QUOTE.doneT); go.classList.remove('done'); go.innerHTML = ICON.quote + '<span>Quote</span>'; }
  const page = p2 && p2.page !== p1.page ? p1.page + '–' + p2.page : p1.page, sure = p1.sure && (!p2 || p2.sure);
  const inp = QUOTE.el.querySelector('input');
  inp.value = page;
  inp.size = Math.max(3, page.length + 1);
  QUOTE.el.classList.toggle('unsure', !sure);
  QUOTE.el.querySelector('.quote-pg').title = sure ? 'The journal’s page (click to change it)' : 'A guess at the journal’s page: check it, and change it if need be';
  QUOTE.el.hidden = false;
  // Where the selecting ended: the point lifted from (a drag's end), else
  // the end of the selection (made with the keys, say). Just below it, so
  // the passage isn't covered (and iOS's own menu, above, isn't either);
  // above it when there's no room below.
  const w = QUOTE.el.offsetWidth, h = QUOTE.el.offsetHeight;
  const touch = lastPointer === 'touch' || coarseMQ.matches;
  const up = QUOTE.up && Date.now() - QUOTE.up.at < 3000 ? QUOTE.up : null;
  const ends = sel.range.getClientRects(), last = ends.length ? ends[ends.length - 1] : sel.rect;
  const x = up ? up.x : last.right, yTop = up ? up.y - 10 : last.top, yBottom = up ? up.y + 14 : last.bottom;
  let top = yBottom + (touch ? 10 : 6);
  if (top + h > innerHeight - 8) top = Math.max(8, yTop - h - 6);
  QUOTE.el.style.top = top + 'px';
  QUOTE.el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + 'px';
  return sel;
}
// A passage as APA quotes it: "the passage" (Lee, 2026, p. 4); at 40
// words or more, a block quotation (no quotation marks, the citation after
// its end). Plain text only, so it takes on the document's own font and
// colour where it's pasted (formatted text came into Word with a colour of
// its own: invisible on a dark page).
function quoteWith(passage, pg) {
  pg = String(pg || '').trim().replace(/-+/g, '–');
  const base = apaInText(V.entry).text;
  const cite = pg ? base.slice(0, -1) + ', ' + (/–/.test(pg) ? 'pp. ' : 'p. ') + pg + ')' : base;
  const block = passage.split(/\s+/).length >= 40;
  return { cite, block, text: block ? passage + ' ' + cite : '“' + passage.replace(/[.,;:]+$/, '') + '” ' + cite };
}
function quoteCopy() {
  const s = QUOTE.sel;
  if (!s || !V.entry) return;
  const { cite, block, text } = quoteWith(s.text, QUOTE.el.querySelector('input').value);
  // Formatted too: the passage's italics and bold (in black: see copy).
  let html = null;
  if (s.letters) {
    const L = s.letters.slice();
    if (!block) while (L.length && /[.,;:]/.test(L[L.length - 1].c)) L.pop();
    html = block ? '<p style="margin:0 0 0 0.5in">' + lettersHTML(L) + ' ' + esc(cite) + '</p>' : '“' + lettersHTML(L) + '” ' + esc(cite);
  }
  QUOTE.copied = s.text;
  copy(text, block ? 'Copied the block quotation, with its citation' : 'Copied the quotation, with its citation', html);
  // (The button says so for a moment; then the bar and the selection go.)
  const go = QUOTE.el.querySelector('.quote-go');
  go.innerHTML = ICON.check + '<span>Copied</span>';
  go.classList.add('done');
  clearTimeout(QUOTE.doneT);
  if (quoteEditing()) document.activeElement.blur();
  QUOTE.doneT = setTimeout(() => {
    go.innerHTML = ICON.quote + '<span>Quote</span>';
    go.classList.remove('done');
    // (Only if it's still that passage: not one chosen meanwhile.)
    const now = quoteSelection();
    if (now && now.text !== s.text) return;
    hideQuote();
    const sel = getSelection();
    if (sel) sel.removeAllRanges();
  }, 900);
}
// (Typing in the page field moves the browser's selection there: the bar
// and the passage it had stay.)
const quoteEditing = () => !!(QUOTE.el && !QUOTE.el.hidden && QUOTE.el.contains(document.activeElement));
// (Where a drag or press over the paper ended, to put the bar there.)
// (Not while the passage is still being chosen, with a press down on the
// paper: the bar would come up under the Pencil or finger. It comes when
// it's lifted.)
document.addEventListener('pointerdown', ev => {
  if (ev.target && ev.target.closest && ev.target.closest('#vPages')) QUOTE.down.add(ev.pointerId);
}, true);
['pointerup', 'pointercancel'].forEach(n => document.addEventListener(n, ev => {
  if (!QUOTE.down.delete(ev.pointerId)) return;
  if (n === 'pointerup') QUOTE.up = { x: ev.clientX, y: ev.clientY, at: Date.now() };
  if (!QUOTE.down.size && !$('#viewer').hidden && !quoteEditing()) { clearTimeout(QUOTE.timer); QUOTE.timer = setTimeout(showQuote, 150); }
}, true));
document.addEventListener('selectionchange', () => {
  if ($('#viewer').hidden || quoteEditing()) return;
  clearTimeout(QUOTE.timer);
  if (QUOTE.el && !QUOTE.el.hidden && !quoteSelection()) hideQuote();
  if (QUOTE.down.size) { if (QUOTE.el) QUOTE.el.hidden = true; return; }
  QUOTE.timer = setTimeout(showQuote, 250);
});
$('#vScroll').addEventListener('scroll', () => {
  if (!QUOTE.el || QUOTE.el.hidden || quoteEditing()) return;
  QUOTE.up = null;
  QUOTE.el.hidden = true;
  clearTimeout(QUOTE.timer);
  QUOTE.timer = setTimeout(showQuote, 300);
}, { passive: true });

/* ---- marks: the toolbar on a tap; drawings moved with a long press */
// A mark's toolbar (colour, comment, delete) shows only when you tap the
// mark, not when it's made or picked up otherwise. A long press on a
// drawing (the Pencil, a finger or the mouse, held still for a moment)
// picks it up to move; lift to put it down (one step for Undo). With the
// pen, a stroke can start on an old drawing (only a press on its line, held
// or tapped, is about the drawing).
const LP = { took: false, hold: 450 };
// Put down whatever's selected (as a tap on empty page does); back to
// reading if it was picked up with no tool on.
function putDown() {
  showBar(null);
  if (!V.ui) return;
  V.ui.unselectAll();
  if (V.tool === 'select' && V.fromRead) setTool(V.fromRead === true ? 'read' : V.fromRead);
}
function showBar(ed) {
  document.querySelectorAll('#vPages .bar-on').forEach(d => d.classList.remove('bar-on'));
  if (ed && ed.div) ed.div.classList.add('bar-on');
}
// How near a point is to a drawing's line (px); Infinity if not drawn.
// Points along a drawn line, in its SVG's own units, measured once per
// shape (measuring along a path is slow on the iPad) and kept until the
// shape changes. Placing them on screen is then just arithmetic.
const PATH_PTS = new WeakMap();
function pathPoints(svg) {
  const shape = svg && svg.querySelector('path');
  if (!shape || !shape.getTotalLength) return null;
  const d = shape.getAttribute('d'), had = PATH_PTS.get(shape);
  if (had && had.d === d) return had;
  const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
  const len = shape.getTotalLength(), n = Math.min(300, Math.max(12, Math.round(len / 5))), xs = new Float32Array(n + 1), ys = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) { const p = shape.getPointAtLength(len * i / n); xs[i] = p.x; ys[i] = p.y; }
  const out = { d, vb, xs, ys };
  PATH_PTS.set(shape, out);
  return out;
}
// The closest a line comes to a point, on screen (r: the SVG's box).
function pathDistance(pp, r, x, y) {
  const sx = r.width / pp.vb[2], sy = r.height / pp.vb[3];
  let best = Infinity;
  for (let i = 0; i < pp.xs.length; i++) {
    const dx = r.left + (pp.xs[i] - pp.vb[0]) * sx - x, dy = r.top + (pp.ys[i] - pp.vb[1]) * sy - y;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
// The SVG PDF.js draws a mark's shape with (its box matches the mark's).
function drawnSvg(page, r, sel) {
  for (const v of page.querySelectorAll(sel || '.canvasWrapper svg.draw')) {
    const q = v.getBoundingClientRect();
    if (Math.abs(q.left - r.left) < 3 && Math.abs(q.top - r.top) < 3 && Math.abs(q.width - r.width) < 3 && Math.abs(q.height - r.height) < 3) return v;
  }
  return null;
}
function strokeDistance(div, x, y) {
  const r = div.getBoundingClientRect(), page = div.closest('.page');
  if (!page || x < r.left - 30 || x > r.right + 30 || y < r.top - 30 || y > r.bottom + 30) return Infinity;
  const pp = pathPoints(drawnSvg(page, r));
  // (No line found to measure: not taken as a press on it, or pressing
  // anywhere in its box would pick the drawing up instead of drawing.)
  if (!pp) return Infinity;
  return pathDistance(pp, r, x, y);
}
// The drawing under a point (on its line, within reach).
function drawingAt(x, y, reach) {
  if (!V.ui) return null;
  let best = null, bestD = reach;
  document.querySelectorAll('#vPages .annotationEditorLayer > .inkEditor').forEach(div => {
    const d = strokeDistance(div, x, y);
    if (d <= bestD) { const ed = V.ui.getEditor(div.id); if (ed && !ed.deleted) { best = ed; bestD = d; } }
  });
  return best;
}
(() => {
  const sc = $('#vScroll');
  let g = null, replaying = false, frame = 0;
  const moved = (ev, lim) => Math.hypot(ev.clientX - g.x, ev.clientY - g.y) > lim;
  // A drag that starts on a drawing mustn't turn into a scroll of the page
  // (which ends the drag on the iPad). Each drawing gets its own handler
  // for that, so touches elsewhere scroll as freely as ever.
  const armed = new WeakSet();
  const arm = el => {
    if (armed.has(el)) return;
    armed.add(el);
    el.addEventListener('touchmove', ev => { if (g && (g.dragging || g.lifting)) ev.preventDefault(); }, { passive: false });
  };
  const DRAWINGS = '.annotationEditorLayer > .inkEditor, .annotationLayer section.inkAnnotation';
  new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches(DRAWINGS)) arm(n);
      n.querySelectorAll && n.querySelectorAll(DRAWINGS).forEach(arm);
    }
  }).observe($('#vPages'), { childList: true, subtree: true });
  // The drawing follows the pointer once a frame (not at every touch event).
  const follow = () => {
    frame = 0;
    if (!g || !g.dragging) return;
    V.ui.dragSelectedEditors(g.cx - g.lx, g.cy - g.ly);
    g.lx = g.cx; g.ly = g.cy;
  };
  // No text selection while a drawing is pressed on or moved (the iPad
  // starts one on a long press, and dragging would stretch it over the page).
  const noSelect = on => { $('#viewer').classList.toggle('lp-hold', on); if (on) getSelection().removeAllRanges(); };
  document.addEventListener('selectstart', ev => { if (g && !g.drawing) ev.preventDefault(); }, true);
  // The pen: the press becomes the start of a stroke after all.
  const draw = () => {
    g.drawing = true;
    const layer = g.div.closest('.annotationEditorLayer');
    replaying = true;
    try {
      layer.dispatchEvent(new PointerEvent('pointerdown', { clientX: g.x, clientY: g.y, pointerId: g.id, pointerType: g.type, isPrimary: true, button: 0, buttons: 1, pressure: 0.5, bubbles: true, cancelable: true }));
    } finally { replaying = false; }
  };
  // Picked up: follow the pointer.
  const lift = ed => {
    if (!g || !ed) return;
    LP.took = true;
    getSelection().removeAllRanges();
    V.ui.setSelected(ed);
    showBar(null);
    V.ui.setUpDragSession();
    g.dragging = true;
    g.lifting = false;
    // From where it was pressed: it catches up with any move made while it
    // was being picked up.
    g.lx = g.x; g.ly = g.y;
    follow();
    noSelect(true);
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (err) { /* fine */ } }
  };
  const hold = async () => {
    if (!g) return;
    LP.took = true;
    const my = g;
    if (g.ed) { lift(g.ed); return; }
    // No tool, or another one: pick the drawing up with the select tool
    // (which takes a moment; moves meanwhile are kept, not taken as a
    // scroll).
    g.lifting = true;
    const back = V.tool;
    await pickUpMark(g.hit, g.x, g.y, back);
    // Let go before it was picked up: put it straight down.
    if (g !== my) { if (V.tool === 'select' && V.fromRead) putDown(); return; }
    if (V.tool !== 'select') { g = null; return; }
    lift(V.ui && [...(V.ui.getEditors(+g.hit.page.dataset.pageNumber - 1) || [])].find(e => isPicked(e)));
  };
  sc.addEventListener('pointerdown', ev => {
    if (replaying) return;
    LP.took = false;
    g = null;
    if (ev.button > 0 || !V.ui || $('#viewer').hidden) return;
    // (Not the toolbar, a comment icon, a link, or a selected mark's resize
    // handles.)
    if (ev.target.closest('.editToolbar, .note-pin, a, button, .resizer')) return;
    if (ev.pointerType === 'touch' && V.pencil && V.tool !== 'read') return;
    const x = ev.clientX, y = ev.clientY;
    const base = { x, y, cx: x, cy: y, id: ev.pointerId, type: ev.pointerType, t: Date.now() };
    if (V.tool === 'pen') {
      const div = ev.target.closest('.annotationEditorLayer > .inkEditor');
      if (!div) return;
      // PDF.js would pick up the old drawing wherever its box is pressed;
      // only a press on its line is about the drawing, anywhere else draws.
      ev.stopPropagation(); ev.preventDefault();
      g = Object.assign(base, { div, ed: strokeDistance(div, x, y) <= 14 ? V.ui.getEditor(div.id) : null, had: div.classList.contains('bar-on') });
      if (!g.ed) { draw(); return; }
      g.timer = setTimeout(hold, LP.hold);
      return;
    }
    if (V.tool === 'read' || V.tool === 'highlight') {
      const hit = V.tool === 'read' ? inkReadAt(x, y) : null;
      const ed = V.tool === 'highlight' ? drawingAt(x, y, 14) : null;
      if (!hit && !ed) return;
      g = Object.assign(base, { hit, ed });
      noSelect(true);
      g.timer = setTimeout(hold, LP.hold);
    }
  }, true);
  window.addEventListener('pointermove', ev => {
    if (!g || ev.pointerId !== g.id || replaying) return;
    g.cx = ev.clientX; g.cy = ev.clientY;
    if (g.dragging || g.lifting) {
      ev.stopPropagation(); ev.preventDefault();
      if (g.dragging && !frame) frame = requestAnimationFrame(follow);
      return;
    }
    if (g.drawing || !moved(ev, 8)) return;
    // Moved before the hold: the pen draws; anything else carries on.
    clearTimeout(g.timer);
    if (V.tool === 'pen' && g.div) { ev.stopPropagation(); draw(); return; }
    g = null;
    noSelect(false);
  }, true);
  const end = ev => {
    if (!g || (ev && ev.pointerId !== g.id)) return;
    const was = g;
    g = null;
    clearTimeout(was.timer);
    if ($('#viewer').classList.contains('lp-hold')) { noSelect(false); getSelection().removeAllRanges(); }
    if (was.dragging) {
      ev && ev.stopPropagation();
      // The last move, then put it down (deselected; back to reading if it
      // was picked up with no tool on).
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      g = was; follow(); g = null;
      getSelection().removeAllRanges();
      if (V.ui.endDragSession()) markDrawing();
      putDown();
      return;
    }
    // The pen, a tap on a drawing's line: the drawing, with its toolbar.
    // Tapped again (its toolbar showing): put it down.
    if (V.tool === 'pen' && was.ed && !was.drawing && ev && ev.type === 'pointerup') {
      ev.stopPropagation();
      if (was.had) { putDown(); return; }
      V.ui.setSelected(was.ed);
      showBar(was.ed);
    }
  };
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  // Anything pressed that isn't a mark's toolbar hides the toolbar; a tap
  // on a mark (with any tool but the pen and eraser) shows it.
  let tap = null;
  sc.addEventListener('pointerdown', ev => {
    const had = document.querySelector('#vPages .bar-on');
    // (A tap on a mark's toolbar, or its list of colours, is the toolbar's:
    // not a tap on whatever mark lies under it.)
    if (ev.target.closest('.editToolbar')) { tap = null; return; }
    showBar(null);
    tap = { x: ev.clientX, y: ev.clientY, t: Date.now(), id: ev.pointerId, had };
  }, true);
  window.addEventListener('pointerup', ev => {
    const t = tap;
    tap = null;
    if (!t || t.id !== ev.pointerId || LP.took || !V.ui || $('#viewer').hidden) return;
    if (Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > 8 || Date.now() - t.t > LP.hold) return;
    if (V.tool === 'pen' || V.tool === 'eraser' || V.tool === 'read') return;
    // (The underline, strike-through and comment tools see to their own taps.)
    if (TEXT_TOOLS.has(V.tool)) return;
    const x = ev.clientX, y = ev.clientY;
    // A mark picked up from reading: a finger's tap on empty page puts it
    // down (the select tool leaves fingers to scroll once there's a Pencil).
    if (V.tool === 'select' && V.fromRead && ev.pointerType === 'touch' && V.pencil && !markAt(x, y)) {
      const back = V.fromRead === true ? 'read' : V.fromRead;
      V.ui.unselectAll();
      setTool(back);
      return;
    }
    setTimeout(() => {
      const ed = markAt(x, y);
      if (!ed) return;
      // The mark whose toolbar was showing, tapped again: put it down.
      if (t.had && ed.div === t.had) { putDown(); return; }
      if (!isPicked(ed)) V.ui.setSelected(ed);
      showBar(ed);
    }, 30);
  }, true);
})();
// A drawing under a point with no tool on: one made since the PDF was
// opened (still PDF.js's), or one in the page's annotations.
function inkReadAt(x, y) {
  const page = document.elementsFromPoint(x, y).map(el => el.closest && el.closest('.page')).find(Boolean);
  if (!page) return null;
  for (const div of page.querySelectorAll('.annotationEditorLayer > .inkEditor')) {
    if (strokeDistance(div, x, y) <= 14) return { page, id: null };
  }
  for (const el of Array.from(page.querySelectorAll('.annotationLayer section.inkAnnotation')).reverse()) {
    const r = el.getBoundingClientRect();
    if (r.width && x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) return { page, id: el.dataset.annotationId || null };
  }
  return null;
}

// The eraser. "Part" rubs out just what it passes over: bits of pen
// strokes and freehand highlights, and letters of text highlights;
// "Whole" removes any mark it touches. Each drag is one step for Undo.
// With the Pencil, fingers still scroll.
const ERASER_SIZES = [6, 12, 24];
(() => {
  const sc = $('#vScroll');
  let erasing = false, busy = Promise.resolve(), drag = null, shapes = new Map();
  const R = () => MARK.eraserSize;
  // A drawn shape (the SVG PDF.js draws a mark with) matching an editor box.
  const svgFor = (page, r) => {
    for (const s of page.querySelectorAll('.canvasWrapper svg.draw, .canvasWrapper svg.highlight')) {
      const q = s.getBoundingClientRect();
      if (Math.abs(q.left - r.left) < 3 && Math.abs(q.top - r.top) < 3 && Math.abs(q.width - r.width) < 3 && Math.abs(q.height - r.height) < 3) return s;
    }
    return null;
  };
  const touches = (page, div, x, y) => {
    const tol = R(), r = div.getBoundingClientRect();
    if (x < r.left - tol || x > r.right + tol || y < r.top - tol || y > r.bottom + tol) return false;
    const svg = svgFor(page, r);
    if (!svg) return true;
    if (svg.classList.contains('draw')) {
      const pp = pathPoints(svg);
      return !pp || pathDistance(pp, r, x, y) <= tol + 2;
    }
    const path = svg.querySelector('path');
    const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
    if (!path || !path.isPointInFill) return true;
    const at = (dx, dy) => path.isPointInFill(new DOMPoint(vb[0] + (x + dx - r.left) / r.width * vb[2], vb[1] + (y + dy - r.top) / r.height * vb[3]));
    return at(0, 0) || [[tol, 0], [-tol, 0], [0, tol], [0, -tol]].some(([dx, dy]) => at(dx, dy));
  };
  // Remove or add an editor, keeping track for this drag's Undo step.
  const takeAway = ed => {
    drag.layers.set(ed, ed.parent);
    if (drag.made.has(ed)) drag.made.delete(ed); else drag.gone.add(ed);
    ed.remove();
  };
  const bringIn = (layer, ed) => {
    drag.layers.set(ed, layer);
    putMark(layer, ed);
    drag.made.add(ed);
  };
  // What's left of a stroke after rubbing out a circle (PDF coordinates),
  // as runs of points. Lines are filled in first, so long straight pieces
  // can be cut too.
  const cut = (lists, cx, cy, rad) => {
    const step = Math.max(rad / 3, 0.5), out = [];
    let removed = false;
    for (const list of lists) {
      const pts = [];
      for (let i = 0; i + 1 < list.length; i += 2) {
        const x = list[i], y = list[i + 1];
        if (pts.length) {
          const [px, py] = pts[pts.length - 1], d = Math.hypot(x - px, y - py), k = Math.floor(d / step);
          for (let j = 1; j <= k; j++) pts.push([px + (x - px) * j / (k + 1), py + (y - py) * j / (k + 1)]);
        }
        pts.push([x, y]);
      }
      let run = [];
      for (const [x, y] of pts) {
        if (Math.hypot(x - cx, y - cy) <= rad) { removed = true; if (run.length >= 4) out.push(run); run = []; }
        else run.push(x, y);
      }
      if (run.length >= 4) out.push(run);
    }
    return removed ? out : null;
  };
  const eraseStroke = async (ed, page, x, y) => {
    const data = ed.serialize(true);
    const pv = V.viewer.getPageView(ed.pageIndex);
    if (!data || !data.paths || !data.paths.points || !pv) { takeAway(ed); return; }
    const box = page.querySelector('.canvasWrapper').getBoundingClientRect();
    const [cx, cy] = pv.viewport.convertToPdfPoint(x - box.left, y - box.top);
    const rad = R() / pv.viewport.scale + (data.thickness || 1) / 2;
    const lists = Array.from(data.paths.points, l => Array.from(l));
    const left = cut(lists, cx, cy, rad);
    if (!left) return;
    const layer = ed.parent;
    takeAway(ed);
    if (!left.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    left.forEach(l => { for (let i = 0; i < l.length; i += 2) { x0 = Math.min(x0, l[i]); x1 = Math.max(x1, l[i]); y0 = Math.min(y0, l[i + 1]); y1 = Math.max(y1, l[i + 1]); } });
    const m = (data.thickness || 1) / 2;
    const piece = await layer.deserialize({
      annotationType: data.annotationType, color: data.color, opacity: data.opacity, thickness: data.thickness,
      paths: { points: left.map(l => Float32Array.from(l)) }, boxes: null,
      pageIndex: data.pageIndex, rect: [x0 - m, y0 - m, x1 + m, y1 + m], rotation: data.rotation,
    });
    if (piece) bringIn(layer, piece);
  };
  // Freehand highlights: their stroke cut as a pen stroke's is (from its
  // middle line, widened by its width), each piece left a highlight of its
  // own.
  const eraseFree = async (ed, page, x, y) => {
    // (One from the PDF, unchanged, gives PDF.js nothing to write: it's
    // read as if changed.)
    let data = null;
    const was = ed._initialData;
    if (ed.annotationElementId) ed._initialData = { color: [-1, -1, -1] };
    try { data = ed.serialize(); } catch (err) { data = null; } finally { if (ed.annotationElementId) ed._initialData = was; }
    const pv = V.viewer.getPageView(ed.pageIndex), pts = data && data.outlines && data.outlines.points;
    if (!pts || !pts.length || !pv) { takeAway(ed); return; }
    const box = page.querySelector('.canvasWrapper').getBoundingClientRect();
    const [cx, cy] = pv.viewport.convertToPdfPoint(x - box.left, y - box.top);
    const th = data.thickness || 12, rad = R() / pv.viewport.scale + th / 2;
    const left = cut(Array.from(pts, l => Array.from(l)), cx, cy, rad);
    if (!left) return;
    const layer = ed.parent;
    takeAway(ed);
    for (const run of left) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < run.length; i += 2) { x0 = Math.min(x0, run[i]); x1 = Math.max(x1, run[i]); y0 = Math.min(y0, run[i + 1]); y1 = Math.max(y1, run[i + 1]); }
      const piece = await layer.deserialize({
        annotationType: V.lib.AnnotationEditorType.HIGHLIGHT, color: data.color, opacity: data.opacity, thickness: th,
        inkLists: [Float32Array.from(run)], boxes: null, pageIndex: data.pageIndex,
        rect: [x0 - th / 2, y0 - th / 2, x1 + th / 2, y1 + th / 2], rotation: data.rotation || 0,
      });
      if (piece) bringIn(layer, piece);
    }
  };
  // Text highlights: rebuilt from the letters still under them after the
  // eraser's circle, joined into boxes line by line.
  const eraseHighlight = async (ed, div, page, x, y) => {
    const r = div.getBoundingClientRect(), svg = svgFor(page, r);
    if (svg && svg.classList.contains('free')) { await eraseFree(ed, page, x, y); return; }
    const path = svg && svg.querySelector('path');
    const pv = V.viewer.getPageView(ed.pageIndex);
    if (!path || !path.isPointInFill || !pv) { takeAway(ed); return; }
    const vb = (svg.getAttribute('viewBox') || '0 0 1 1').split(/\s+/).map(Number);
    const inside = (px, py) => path.isPointInFill(new DOMPoint(vb[0] + (px - r.left) / r.width * vb[2], vb[1] + (py - r.top) / r.height * vb[3]));
    const rad = R(), rng = document.createRange(), kept = [];
    let erased = false, found = false;
    for (const span of page.querySelectorAll('.textLayer span')) {
      const sr = span.getBoundingClientRect();
      if (sr.right < r.left || sr.left > r.right || sr.bottom < r.top || sr.top > r.bottom) continue;
      const node = span.firstChild;
      if (!node || node.nodeType !== 3) continue;
      for (let i = 0; i < node.length; i++) {
        rng.setStart(node, i); rng.setEnd(node, i + 1);
        const b = rng.getBoundingClientRect();
        if (b.width < 0.5 || !inside(b.left + b.width / 2, b.top + b.height / 2)) continue;
        found = true;
        const dx = Math.max(b.left - x, 0, x - b.right), dy = Math.max(b.top - y, 0, y - b.bottom);
        if (Math.hypot(dx, dy) <= rad) erased = true; else kept.push(b);
      }
    }
    if (!found) { takeAway(ed); return; }
    if (!erased) return;
    const layer = ed.parent;
    takeAway(ed);
    if (!kept.length) return;
    // Letters into boxes: same line, and next to each other.
    kept.sort((a, b) => (Math.abs(a.top - b.top) > a.height / 2 ? a.top - b.top : a.left - b.left));
    const boxes = [];
    for (const b of kept) {
      const last = boxes[boxes.length - 1];
      if (last && Math.abs(b.top - last.top) < b.height / 2 && b.left - last.right < b.height * 0.8) {
        last.right = Math.max(last.right, b.right); last.bottom = Math.max(last.bottom, b.bottom); last.top = Math.min(last.top, b.top);
      } else {
        boxes.push({ left: b.left, right: b.right, top: b.top, bottom: b.bottom });
      }
    }
    const cw = page.querySelector('.canvasWrapper').getBoundingClientRect();
    const toPdf = (px, py) => pv.viewport.convertToPdfPoint(px - cw.left, py - cw.top);
    const quads = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of boxes) {
      const [xl, yt] = toPdf(b.left, b.top), [xr, yb] = toPdf(b.right, b.bottom);
      quads.push(xl, yt, xr, yt, xl, yb, xr, yb);
      x0 = Math.min(x0, xl, xr); x1 = Math.max(x1, xl, xr); y0 = Math.min(y0, yt, yb); y1 = Math.max(y1, yt, yb);
    }
    const hex = String(ed.color || '#FFFF98').replace('#', '');
    const color = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) || 0);
    const opacity = parseFloat(svg.getAttribute('fill-opacity')) || 1;
    const piece = await layer.deserialize({
      annotationType: V.lib.AnnotationEditorType.HIGHLIGHT, color, opacity, quadPoints: Float32Array.from(quads),
      boxes: null, pageIndex: ed.pageIndex, rect: [x0, y0, x1, y1], rotation: 0,
    });
    if (piece) bringIn(layer, piece);
  };
  const eraseAt = async (x, y) => {
    if (!V.ui) return;
    const page = document.elementsFromPoint(x, y).map(el => el.closest && el.closest('.page')).find(Boolean);
    if (!page) return;
    for (const div of page.querySelectorAll('.annotationEditorLayer > [id]')) {
      if (!touches(page, div, x, y)) continue;
      const ed = V.ui.getEditor(div.id);
      if (!ed) continue;
      shapes.delete(div.id);
      if (MARK.eraserMode === 'part' && div.classList.contains('inkEditor')) await eraseStroke(ed, page, x, y);
      else if (MARK.eraserMode === 'part' && div.classList.contains('highlightEditor')) await eraseHighlight(ed, div, page, x, y);
      else takeAway(ed);
      markDrawing();
    }
  };
  // Points come faster than erasing (the Pencil reports up to 240 a
  // second): gather them, and erase along the latest, skipping ones closer
  // together than a third of the eraser, so it keeps up with your hand.
  let pending = [], pumping = false;
  const queue = (x, y) => {
    pending.push([x, y]);
    if (pumping) return;
    pumping = true;
    busy = busy.then(async () => {
      while (pending.length) {
        const pts = pending;
        pending = [];
        const gap = Math.max(2, R() / 3);
        let last = null;
        for (let i = 0; i < pts.length; i++) {
          const [px, py] = pts[i];
          if (last && i < pts.length - 1 && Math.hypot(px - last[0], py - last[1]) < gap) continue;
          last = pts[i];
          await eraseAt(px, py);
        }
      }
    }).catch(err => console.warn(err)).finally(() => { pumping = false; });
  };
  const ours = ev => V.tool === 'eraser' && !(ev.pointerType === 'touch' && V.pencil);
  // A circle the size of the eraser under the Pencil or a finger (the
  // mouse gets a ring for its pointer instead): while erasing, and while
  // the Pencil hovers, on iPads that sense that. It fades soon after.
  const ring = document.createElement('div');
  ring.className = 'eraser-ring';
  ring.hidden = true;
  $('#viewer').appendChild(ring);
  let ringTimer = 0;
  const showRing = ev => {
    if (ev.pointerType === 'mouse' || V.tool !== 'eraser' || !ours(ev)) { ring.hidden = true; return; }
    const d = 2 * R();
    ring.style.width = ring.style.height = d + 'px';
    ring.style.transform = `translate(${ev.clientX - d / 2}px, ${ev.clientY - d / 2}px)`;
    ring.hidden = false;
    ring.classList.remove('fading');
    clearTimeout(ringTimer);
  };
  const fadeRing = () => {
    clearTimeout(ringTimer);
    ring.classList.add('fading');
    ringTimer = setTimeout(() => { ring.hidden = true; ring.classList.remove('fading'); }, 700);
  };
  ['pointerdown', 'pointermove'].forEach(t => sc.addEventListener(t, showRing, { capture: true, passive: true }));
  sc.addEventListener('pointerup', fadeRing, true);
  sc.addEventListener('pointercancel', fadeRing, true);
  sc.addEventListener('pointerleave', fadeRing);
  sc.addEventListener('pointerdown', ev => {
    if (!ours(ev) || ev.button > 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    erasing = true;
    if (V.ui && V.selected) { try { V.ui.unselectAll(); } catch (err) { /* fine */ } }
    shapes = new Map();
    drag = { gone: new Set(), made: new Set(), layers: new Map() };
    try { sc.setPointerCapture(ev.pointerId); } catch (err) { /* fine without */ }
    queue(ev.clientX, ev.clientY);
  }, true);
  sc.addEventListener('pointermove', ev => {
    if (!erasing || !ours(ev)) return;
    ev.stopPropagation();
    const list = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [];
    (list.length ? list : [ev]).forEach(e => queue(e.clientX, e.clientY));
  }, true);
  const stop = ev => {
    if (!erasing) return;
    erasing = false;
    ev.stopPropagation();
    const d = drag;
    busy = busy.then(() => {
      shapes = new Map();
      if (!V.ui || (!d.gone.size && !d.made.size)) return;
      const gone = Array.from(d.gone), made = Array.from(d.made);
      // Already done; this records the drag as one step for Undo and Redo.
      V.ui.addCommands({
        cmd: () => { gone.forEach(e => e.remove()); made.forEach(e => putMark(d.layers.get(e), e, true)); },
        undo: () => { made.forEach(e => e.remove()); gone.forEach(e => putMark(d.layers.get(e), e, true)); },
        mustExec: false,
      });
    });
  };
  sc.addEventListener('pointerup', stop, true);
  sc.addEventListener('pointercancel', stop, true);
})();


/* ---- sidebar: pages, annotations, bookmarks, outline */
// A pane on the left of the reader (over the page on a phone): page
// thumbnails, a list of the paper's annotations, your bookmarked pages,
// and the PDF's outline (the table of contents built into some PDFs).
const SIDE = { tab: store.get('readerTab', 'pages'), io: null, thumbs: [], queue: [], busy: false, marks: null, outline: null, token: 0 };
const sideOpen = () => !$('#vSide').hidden;
const sidePhone = () => window.innerWidth < 600;

function resetSide() {
  SIDE.token++;
  if (SIDE.io) SIDE.io.disconnect();
  if (SIDE.far) SIDE.far.disconnect();
  Object.assign(SIDE, { io: null, far: null, thumbs: [], queue: [], busy: false, marks: null, outline: null, pp: null, colour: null });
  Object.assign(OLE, { on: false, items: [], sel: -1, from: '' });
  $('#vSideBody').replaceChildren();
}
function toggleSide(open) {
  if (open == null) open = !sideOpen();
  $('#vSide').hidden = !open;
  const was = $('#viewer').classList.contains('side-open');
  $('#viewer').classList.toggle('side-open', open && !sidePhone());
  $('#vSideBtn').setAttribute('aria-pressed', String(open));
  if (!sidePhone()) store.set('readerSide', open);
  // Only when the page area changed width (not for the phone's overlay).
  if (was !== $('#viewer').classList.contains('side-open')) refit();
  placePalette();
  if (open) showSideTab(SIDE.tab);
}
// After the page area changes size, keep "fit" zooms fitting.
function refit() {
  if (!V.doc || !V.viewer) return;
  const v = V.viewer.currentScaleValue;
  if (v === 'auto' || v === 'page-width' || v === 'page-fit') V.viewer.currentScaleValue = v;
}
function showSideTab(tab) {
  // (What it shows was made for another copy of the paper, as one opened
  // again after pages were split or turned: made again.)
  if (V.doc && SIDE.forDoc !== V.doc) {
    if (SIDE.io) SIDE.io.disconnect();
    if (SIDE.far) SIDE.far.disconnect();
    SIDE.token++;
    Object.assign(SIDE, { io: null, far: null, thumbs: [], queue: [], marks: null, outline: null, pp: null, forDoc: V.doc });
  }
  SIDE.tab = tab;
  store.set('readerTab', tab);
  document.querySelectorAll('#vSide [data-vtab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.vtab === tab)));
  if (tab === 'info') { showInfo(); return; }
  if (!V.doc) { $('#vSideBody').innerHTML = `<p class="v-side-note">Opening\u2026</p>`; return; }
  if (tab === 'pages') showThumbs();
  else if (tab === 'marks') showMarks();
  else if (tab === 'bookmarks') showBookmarks();
  else showOutline();
}
// Citation: the paper's entry in the library (as it is now, with any
// edits), to read and copy.
const infoEntry = () => (V.entry && BYKEY.get(V.entry.k)) || V.entry;
function showInfo() {
  const body = $('#vSideBody'), e = infoEntry();
  if (!e) { body.innerHTML = `<p class="v-side-note">This paper has no entry in the library.</p>`; return; }
  const f = e.f, people = e.a && e.a.length ? e.a : e.e || [];
  let h = `<div class="v-info">`;
  h += `<div class="vi-kicker"><span>${esc(TYPE_NAMES[e.t] || e.t)}</span>` +
    `<button type="button" class="vi-key" data-icopy="key" title="Copy the cite key"><span>${esc(e.k)}</span>${ICON.copy}</button></div>`;
  h += `<h3 class="vi-title">${esc(f.title || '(untitled)')}</h3>`;
  if (people.length) h += `<p class="vi-authors">${people.map(n => esc(fullName(n))).join(', ')}${!(e.a && e.a.length) && e.e ? ' (Eds.)' : ''}</p>`;
  // (Copied in one click, with the button at its corner.)
  h += `<div class="vi-ref-box"><p class="vi-ref">${apaCitation(e).html}</p>` +
    `<button type="button" class="vi-ref-copy" data-icopy="apa" title="Copy the citation (${esc(keyHint('copyApa'))})" aria-label="Copy the citation">${ICON.copy}</button></div>`;
  // Copy, the links and Edit, in one row (one link: just a button).
  const links = [];
  if (f.doi) links.push([`https:\/\/doi.org/${f.doi.replace(/^https?:\/\/(dx\.)?doi\.org[/]/i, '')}`, 'DOI']);
  (e.u || []).filter(u => safeUrl(u) && !(f.doi && /doi\.org[/]/i.test(u))).slice(0, 3).forEach(u => {
    let host = u; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (err) { /* as is */ }
    links.push([u, host]);
  });
  h += `<div class="vi-row"><details class="menu"><summary class="btn" title="Copy the citation">${ICON.copy}<span>Copy</span>${ICON.chev}</summary><div class="menu-list" role="menu">` +
    [['apa', ICON.apa, 'APA'], ['apa-short', ICON.intext, 'In-text'], ['bibtex', ICON.bib, 'BibTeX'], ['qr', ICON.qr, 'QR code\u2026']].map(([k, i, l]) => `<button type="button" role="menuitem" class="mi" data-icopy="${k}">${i}<span>${l}</span></button>`).join('') + `</div></details>` +
    (links.length === 1 ? `<a class="btn" href="${esc(links[0][0])}" target="_blank" rel="noopener" title="${esc(links[0][0])}">${ICON.link}<span>${esc(links[0][1])}</span></a>`
      : links.length ? `<details class="menu"><summary class="btn" title="Open a link">${ICON.link}<span>Links</span>${ICON.chev}</summary><div class="menu-list" role="menu">` +
        links.map(([u, l]) => `<a role="menuitem" href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}">${esc(l)}</a>`).join('') + `</div></details>` : '') +
    (gs && !e.ib && BYKEY.get(e.k) ? `<button type="button" class="btn" data-iedit title="Edit this publication\u2019s details">${ICON.pencil}<span>Edit</span></button>` : '') + `</div>`;
  if (e.kw && e.kw.length) h += `<div class="vi-kw">${e.kw.map(k => `<span>${esc(k)}</span>`).join('')}</div>`;
  if (f.abstract) h += `<details class="vi-sec" open><summary>Abstract</summary><p>${esc(f.abstract)}</p></details>`;
  if (f.annote) h += `<details class="vi-sec" open><summary>Notes</summary><p>${esc(f.annote)}</p></details>`;
  const skip = new Set(['abstract', 'annote', 'keywords', 'date-added', 'date-modified', 'read', 'rating']);
  const keys = Object.keys(f).filter(k => !skip.has(k) && f[k]).sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a), ib = FIELD_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  h += `<details class="vi-sec"><summary>All fields</summary><dl class="vi-fields">` +
    keys.map(k => `<dt>${esc(k)}</dt><dd>${safeUrl(f[k]) ? `<a href="${esc(f[k])}" target="_blank" rel="noopener">${esc(f[k])}</a>` : esc(f[k])}</dd>`).join('') + `</dl></details>`;
  body.innerHTML = h + `</div>`;
  body.scrollTop = 0;
}
$('#vSideBtn').addEventListener('click', () => toggleSide());
// The sidebar's width: dragged by its right edge (or with the arrow keys
// on it), kept on this device; double-click (or double-tap) for the usual
// width. The pages refit once it's let go, not at every move.
(() => {
  const grip = $('#vSideGrip'), viewer = $('#viewer'), SIDE_W = 200;
  const clamp = w => Math.round(Math.max(160, Math.min(w, Math.max(160, Math.min(480, window.innerWidth * 0.5)))));
  const set = w => { viewer.style.setProperty('--side-w', clamp(w) + 'px'); return clamp(w); };
  const done = w => { store.set('sideW', w); refit(); placePalette(); railSoon(); thumbsResized(); };
  set(store.get('sideW', SIDE_W));
  let drag = null, frame = 0;
  grip.addEventListener('pointerdown', ev => {
    if (ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    drag = { id: ev.pointerId, left: $('#vSide').getBoundingClientRect().left, w: $('#vSide').offsetWidth };
    try { grip.setPointerCapture(ev.pointerId); } catch (err) { /* fine without */ }
    grip.classList.add('dragging');
    viewer.classList.add('side-sizing');
  });
  grip.addEventListener('pointermove', ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    ev.preventDefault();
    drag.x = ev.clientX;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (drag) drag.w = set(drag.x - drag.left); });
  });
  const end = ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    const w = drag.x != null ? set(drag.x - drag.left) : drag.w;
    drag = null;
    grip.classList.remove('dragging');
    viewer.classList.remove('side-sizing');
    done(w);
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  // Not a scroll, or a text selection, on the iPad.
  grip.addEventListener('touchstart', ev => ev.preventDefault(), { passive: false });
  grip.addEventListener('dblclick', () => done(set(SIDE_W)));
  let lastTap = 0;
  grip.addEventListener('pointerup', ev => {
    if (ev.pointerType === 'mouse') return;
    const now = Date.now();
    if (now - lastTap < 320) { lastTap = 0; done(set(SIDE_W)); } else lastTap = now;
  });
  grip.addEventListener('keydown', ev => {
    const step = ev.shiftKey ? 48 : 16;
    const d = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0;
    if (!d) return;
    ev.preventDefault();
    done(set($('#vSide').offsetWidth + d));
  });
  // A narrower window can't keep a wide sidebar.
  window.addEventListener('resize', () => set(store.get('sideW', SIDE_W)));
})();
$('#vSide').addEventListener('click', ev => {
  const t = ev.target.closest('[data-vtab]');
  if (t) { showSideTab(t.dataset.vtab); return; }
  if (ev.target.closest('[data-iedit]')) { const e = infoEntry(); if (e && BYKEY.get(e.k)) { openEdit(BYKEY.get(e.k)); if (sheet) sheet.infoBack = true; } return; }
  const ic = ev.target.closest('[data-icopy]');
  if (ic) {
    const e = infoEntry(), kind = ic.dataset.icopy;
    if (!e) return;
    if (kind === 'apa') {
      const cite = apaCitation(e);
      copy(cite.text, 'Copied APA citation', cite.html);
      // (The corner button says so, with a tick, for a moment.)
      if (ic.matches('.vi-ref-copy')) { ic.innerHTML = ICON.check; ic.classList.add('done'); setTimeout(() => { if (ic.isConnected) { ic.innerHTML = ICON.copy; ic.classList.remove('done'); } }, 1500); }
    }
    else if (kind === 'apa-short') { const cite = apaInText(e); copy(cite.text, 'Copied APA in-text citation', cite.html); }
    else if (kind === 'qr') openQr([e]);
    else copy(kind === 'key' ? e.k : bibtex(e), kind === 'key' ? 'Copied cite key' : 'Copied BibTeX');
    return;
  }
  const del = ev.target.closest('[data-bm-del]');
  if (del) { toggleBookmark(+del.dataset.bmDel); return; }
  const rot = ev.target.closest('[data-rot]');
  if (rot) { rotatePage(+rot.dataset.rotPage, +rot.dataset.rot); return; }
  const sp = ev.target.closest('[data-split]');
  if (sp) { splitStart(+sp.dataset.split, false); return; }
  if (ev.target.closest('[data-split-all]')) { splitStart(0, true); return; }
  const rotAll = ev.target.closest('[data-rot-all]');
  if (rotAll && V.doc) { rotatePages(Array.from({ length: V.doc.numPages }, (_, i) => i + 1), +rotAll.dataset.rotAll); return; }
  const pg = ev.target.closest('[data-page]');
  if (pg && V.doc) {
    const n = +pg.dataset.page, y = pg.dataset.y;
    if (n !== V.viewer.currentPageNumber || y) pushBack();
    if (y) V.viewer.scrollPageIntoView({ pageNumber: n, destArray: [null, { name: 'XYZ' }, null, +y + 40, null], allowNegativeOffset: true });
    else V.viewer.scrollPageIntoView({ pageNumber: n });
    if (sidePhone()) toggleSide(false);
    return;
  }
  const ol = ev.target.closest('[data-outline]');
  if (ol && V.doc) {
    const item = SIDE.outline && SIDE.outline.flat[+ol.dataset.outline];
    if (!item) return;
    if (item.dest) { pushBack(); V.link.goToDestination(item.dest); }
    else if (item.page) { pushBack(); V.viewer.currentPageNumber = item.page; }
    else if (item.url && safeUrl(item.url)) window.open(item.url, '_blank', 'noopener');
    if (sidePhone()) toggleSide(false);
    return;
  }
  const tw = ev.target.closest('[data-twist]');
  if (tw) { const li = tw.closest('li'); li.classList.toggle('shut'); tw.setAttribute('aria-expanded', String(!li.classList.contains('shut'))); }
});

// Pages: thumbnails drawn as they scroll into view, one at a time, with
// the paper's annotations (including new, unsaved ones).
async function showThumbs() {
  const body = $('#vSideBody'), doc = V.doc, my = SIDE.token;
  if (SIDE.thumbs.length) { body.replaceChildren(SIDE.list); markCurrentThumb(true); return; }
  const first = await doc.getPage(1);
  if (my !== SIDE.token || SIDE.tab !== 'pages') return;
  const vp = first.getViewport({ scale: 1 }), ratio = vp.height / vp.width;
  const list = document.createElement('div');
  list.className = 'v-thumbs';
  // Every page turned at once (a paper scanned sideways).
  const head = document.createElement('div');
  head.className = 'v-thumbs-head';
  head.innerHTML = `<span>All pages</span><button type="button" data-split-all aria-label="Split all wide pages in two" title="Split all wide pages in two (two book pages scanned side by side)"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M12 2.5v19" stroke-dasharray="2.2 2"/></svg></button><button type="button" data-rot-all="-90" aria-label="Rotate all pages left" title="Rotate all pages left"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5A8 8 0 1 1 6 16.5"/><path d="M4 4.5v5h5"/></svg></button><button type="button" data-rot-all="90" aria-label="Rotate all pages right" title="Rotate all pages right"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 9.5A8 8 0 1 0 18 16.5"/><path d="M20 4.5v5h-5"/></svg></button>`;
  list.appendChild(head);
  for (let n = 1; n <= doc.numPages; n++) {
    const box = document.createElement('div');
    box.className = 'v-thumb-box';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'v-thumb';
    b.dataset.page = n;
    b.innerHTML = `<span class="v-thumb-img" style="aspect-ratio:${(1 / ratio).toFixed(4)}"></span><span class="v-thumb-n">${n}</span>`;
    // (Turning the page: shown on the page you're on, and on the one
    // under the pointer.)
    box.innerHTML = `<span class="v-thumb-rot"><button type="button" data-rot="-90" data-rot-page="${n}" aria-label="Rotate page ${n} left" title="Rotate left"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9.5A8 8 0 1 1 6 16.5"/><path d="M4 4.5v5h5"/></svg></button><button type="button" data-rot="90" data-rot-page="${n}" aria-label="Rotate page ${n} right" title="Rotate right"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 9.5A8 8 0 1 0 18 16.5"/><path d="M20 4.5v5h-5"/></svg></button><button type="button" data-split="${n}" aria-label="Split page ${n} in two" title="Split in two (two book pages scanned side by side)"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M12 2.5v19" stroke-dasharray="2.2 2"/></svg></button></span>`;
    box.prepend(b);
    list.appendChild(box);
    SIDE.thumbs.push({ el: b, done: false });
  }
  SIDE.list = list;
  body.replaceChildren(list);
  SIDE.io = new IntersectionObserver(items => items.forEach(it => {
    if (it.isIntersecting) queueThumb(+it.target.dataset.page);
  }), { root: body, rootMargin: '300px 0px' });
  SIDE.thumbs.forEach(t => SIDE.io.observe(t.el));
  // Thumbnails well out of sight are let go (a long book's would otherwise
  // all be kept, scrolled past once), and drawn again if they come back.
  SIDE.far = new IntersectionObserver(items => items.forEach(it => {
    if (it.isIntersecting) return;
    const t = SIDE.thumbs[+it.target.dataset.page - 1], box = t && t.el.querySelector('.v-thumb-img');
    if (!t || !t.done || !box) return;
    const c = box.querySelector('canvas');
    if (c) { c.width = c.height = 0; c.remove(); }
    t.done = false;
  }), { root: body, rootMargin: '2000px 0px' });
  SIDE.thumbs.forEach(t => SIDE.far.observe(t.el));
  markCurrentThumb(true);
}
function queueThumb(n) {
  const t = SIDE.thumbs[n - 1];
  if (!t || t.done || SIDE.queue.indexOf(n) >= 0) return;
  SIDE.queue.push(n);
  drawThumbs();
}
async function drawThumbs() {
  if (SIDE.busy) return;
  SIDE.busy = true;
  const my = SIDE.token;
  try {
    while (SIDE.queue.length && my === SIDE.token && V.doc) {
      const n = SIDE.queue.shift(), t = SIDE.thumbs[n - 1];
      if (!t || t.done) continue;
      const page = await V.doc.getPage(n);
      if (my !== SIDE.token) return;
      const base = page.getViewport({ scale: 1 });
      // At the size it's shown (the sidebar's width), for the screen.
      const box = t.el.querySelector('.v-thumb-img');
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5), cssW = Math.max(96, box.clientWidth || 128);
      const vp = page.getViewport({ scale: cssW / base.width * dpr });
      // (Each its own shape: a page turned sideways is wide.)
      box.style.aspectRatio = (base.width / base.height).toFixed(4);
      box.style.transform = '';
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp, annotationMode: V.lib.AnnotationMode.ENABLE_STORAGE }).promise;
      if (my !== SIDE.token) return;
      box.replaceChildren(c);
      t.done = true;
      t.w = cssW;
    }
  } catch (err) {
    /* a page that won't draw keeps its blank frame */
  } finally {
    SIDE.busy = false;
    // (Pages asked for meanwhile, for a new list, are drawn now.)
    if (my !== SIDE.token && SIDE.queue.length) setTimeout(drawThumbs, 0);
  }
}
function markCurrentThumb(scroll) {
  if (!SIDE.thumbs.length || !V.viewer) return;
  const n = V.viewer.currentPageNumber;
  SIDE.thumbs.forEach((t, i) => t.el.classList.toggle('current', i + 1 === n));
  const cur = SIDE.thumbs[n - 1];
  if (scroll && cur && sideOpen() && SIDE.tab === 'pages') cur.el.scrollIntoView({ block: 'nearest' });
}
// The sidebar made wider: thumbnails drawn smaller than they're now shown
// are drawn again (those in view now, the rest as they come into view);
// meanwhile the old drawing is stretched to fit.
function thumbsResized() {
  if (!SIDE.thumbs.length) return;
  const img = SIDE.thumbs[0].el.querySelector('.v-thumb-img'), w = img ? img.clientWidth : 0;
  if (!w) return;
  SIDE.thumbs.forEach(t => { if (t.done && (t.w || 0) < w * 0.95) t.done = false; });
  if (!sideOpen() || SIDE.tab !== 'pages') return;
  const b = $('#vSideBody').getBoundingClientRect();
  SIDE.thumbs.forEach(t => {
    const r = t.el.getBoundingClientRect();
    if (!t.done && r.bottom > b.top - 300 && r.top < b.bottom + 300) queueThumb(+t.el.dataset.page);
  });
}
// Thumbnails and the annotation list are redrawn after markup is saved.
function sideChanged() {
  SIDE.thumbs.forEach(t => { t.done = false; });
  SIDE.marks = null;
  if (!sideOpen()) return;
  if (SIDE.tab === 'pages') SIDE.thumbs.forEach(t => {
    const r = t.el.getBoundingClientRect(), b = $('#vSideBody').getBoundingClientRect();
    if (r.bottom > b.top - 300 && r.top < b.bottom + 300) queueThumb(+t.el.dataset.page);
  });
  if (SIDE.tab === 'marks') showMarks();
}

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
async function collectMarks(doc, my) {
  const marks = [];
  for (let n = 1; n <= doc.numPages; n++) {
    if (my !== SIDE.token) return null;
    const page = await doc.getPage(n);
    const anns = (await page.getAnnotations()).filter(a => MARK_NAMES[a.subtype]);
    if (!anns.length) continue;
    let items = null;
    const onPage = [];
    for (const a of anns) {
      let text = '';
      const note = a.subtype === 'Highlight' && isNoteOpacity(a.opacity);
      if (a.quadPoints && a.quadPoints.length && !note) {
        items = items || (await page.getTextContent()).items;
        text = textInQuads(items, a.quadPoints);
      }
      const c = a.color;
      onPage.push({
        page: n, y: a.rect ? a.rect[3] : null,
        name: note ? 'Note' : a.it === 'InkHighlight' ? 'Highlight' : MARK_NAMES[a.subtype],
        color: c && c.length >= 3 ? `rgb(${c[0]},${c[1]},${c[2]})` : null,
        text, note: (a.contentsObj && a.contentsObj.str) || '',
      });
    }
    // Top of the page first.
    onPage.sort((p, q) => (q.y || 0) - (p.y || 0));
    marks.push(...onPage);
    if (n % 10 === 0 && my === SIDE.token && SIDE.tab === 'marks') $('#vSideBody').innerHTML = `<p class="v-side-note">Reading page ${n} of ${doc.numPages}\u2026</p>`;
  }
  return marks;
}
async function showMarks() {
  const body = $('#vSideBody'), my = SIDE.token;
  if (!SIDE.marks) {
    body.innerHTML = `<p class="v-side-note">Finding annotations\u2026</p>`;
    // The list comes from the PDF as last saved, so read the saved copy.
    let doc = V.doc, temp = null;
    try {
      if (V.bytes && V.savedSinceOpen) { temp = await openPdf(V.lib, { data: V.bytes.slice(0) }).promise; doc = temp; }
      const marks = await collectMarks(doc, my);
      if (!marks || my !== SIDE.token) return;
      SIDE.marks = marks;
    } catch (err) {
      if (my === SIDE.token && SIDE.tab === 'marks') body.innerHTML = `<p class="v-side-note">Couldn\u2019t read the annotations: ${esc(errText(err))}</p>`;
      return;
    } finally {
      if (temp) closePdf(temp);
    }
  }
  if (my !== SIDE.token || SIDE.tab !== 'marks') return;
  const unsaved = V.dirty || V.drawing ? `<p class="v-side-note">New marks appear here once they\u2019re saved.</p>` : '';
  if (!SIDE.marks.length) { body.innerHTML = unsaved + `<p class="v-side-note">This paper has no annotations yet.</p>`; return; }
  // By colour: a chip for each colour used (with how many), to see only
  // those; the summary, then, is of those too.
  const cols = new Map();
  SIDE.marks.forEach(m => { const c = markColour(m); if (c) cols.set(c.key, Object.assign(cols.get(c.key) || { n: 0 }, c, { n: ((cols.get(c.key) || {}).n || 0) + 1 })); });
  if (SIDE.colour && !cols.has(SIDE.colour)) SIDE.colour = null;
  const chips = cols.size > 1 ? `<div class="v-mark-cols" role="group" aria-label="Show marks of one colour">` +
    `<button type="button" class="v-mark-col${SIDE.colour ? '' : ' on'}" data-mcol="" aria-pressed="${!SIDE.colour}">All <span>${SIDE.marks.length}</span></button>` +
    [...cols.values()].sort((a, b) => b.n - a.n).map(c => `<button type="button" class="v-mark-col${SIDE.colour === c.key ? ' on' : ''}" data-mcol="${esc(c.key)}" aria-pressed="${SIDE.colour === c.key}" title="${esc(c.name)}">` +
      `<i style="background:${c.css}"></i>${esc(c.name)} <span>${c.n}</span></button>`).join('') + `</div>` : '';
  const shown = SIDE.colour ? SIDE.marks.filter(m => (markColour(m) || {}).key === SIDE.colour) : SIDE.marks;
  const worded = shown.filter(m => m.text || m.note).length;
  let h = unsaved + chips + (worded ? `<div class="v-marks-acts"><button type="button" class="btn" data-marks-copy title="Every highlight and note, by page, with the reference">${ICON.copy}<span>Copy summary</span></button>` +
    (gs ? `<button type="button" class="btn" data-marks-notes title="Added to the publication\u2019s Notes">${ICON.pencil}<span>Add to notes</span></button>` : '') + `</div>` : '') + `<div class="v-marks">`, last = 0;
  // (A mark of words, as a highlight or underline: Copy and Quote at its
  // top right.)
  SIDE.shown = shown;
  shown.forEach((m, i) => {
    if (m.page !== last) { h += `<div class="v-marks-page">Page ${m.page}</div>`; last = m.page; }
    h += `<div class="v-mark-wrap"><button type="button" class="v-mark" data-page="${m.page}"${m.y != null ? ` data-y="${m.y}"` : ''}>` +
      `<span class="v-mark-sw" style="background:${m.color || 'var(--faint)'}"></span><span class="v-mark-body">` +
      `<span class="v-mark-kind">${esc(m.name)}</span>` +
      (m.text ? `<span class="v-mark-text">\u201c${esc(m.text.length > 220 ? m.text.slice(0, 220) + '\u2026' : m.text)}\u201d</span>` : '') +
      (m.note ? `<span class="v-mark-note">${esc(m.note)}</span>` : '') + `</span></button>` +
      (m.text ? `<span class="v-mark-acts"><button type="button" data-mk-copy="${i}" title="Copy the words" aria-label="Copy the words">${ICON.copy}</button>` +
        `<button type="button" data-mk-quote="${i}" title="Copy as a quotation, with its page and citation" aria-label="Copy as a quotation">${ICON.quote}</button></span>` : '') + `</div>`;
  });
  body.innerHTML = h + `</div>`;
  // (The journal's page numbers, for the summary: worked out now, so the
  // copy is at once on the click.)
  SIDE.pp = SIDE.pp || new Map();
  for (const n of new Set(SIDE.marks.map(m => m.page))) if (!SIDE.pp.has(n)) SIDE.pp.set(n, (await printedPage(n)).page);
}
// A paper's highlights and notes as text: by page (the journal's), the
// kind, the words marked, the comment; the reference first, when asked.
// A mark's colour: its key (rounded), how to show it, and its name (the
// nearest of the highlighter's, else "Other").
function markColour(m) {
  const x = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(m.color || '');
  if (!x) return null;
  const rgb = x.slice(1, 4).map(Number);
  let best = null, d = Infinity;
  HL_COLORS.concat(PEN_COLORS).forEach(([name, hex]) => {
    const c = hexRgb(hex), e = Math.abs(c[0] - rgb[0]) + Math.abs(c[1] - rgb[1]) + Math.abs(c[2] - rgb[2]);
    if (e < d) { d = e; best = name; }
  });
  const name = d < 90 ? best : 'Other';
  return { key: name === 'Other' ? rgb.map(v => Math.round(v / 32)).join('-') : name, name, css: m.color };
}
$('#vSideBody').addEventListener('click', ev => {
  const b = ev.target.closest('[data-mcol]');
  if (!b) return;
  SIDE.colour = b.dataset.mcol || null;
  showMarks();
});
function marksSummary(withRef) {
  const list = (SIDE.marks || []).filter(m => (m.text || m.note) && (!SIDE.colour || (markColour(m) || {}).key === SIDE.colour)), pg = n => (SIDE.pp && SIDE.pp.get(n)) || String(n);
  const ref = apaCitation(V.entry);
  const text = (withRef ? ref.text + '\n\n' : '') + list.map(m => 'p. ' + pg(m.page) + ' \u2014 ' + m.name +
    (m.text ? ': \u201c' + m.text + '\u201d' : '') + (m.note ? (m.text ? '\n    Note: ' : ': ') + m.note : '')).join('\n');
  const html = (withRef ? '<p>' + ref.html + '</p>' : '') + '<ul>' + list.map(m => `<li><b>p. ${esc(pg(m.page))}</b> ${esc(m.name)}` +
    (m.text ? `: \u201c${esc(m.text)}\u201d` : '') + (m.note ? (m.text ? '<br>' : ': ') + `<i>${esc(m.note)}</i>` : '') + '</li>').join('') + '</ul>';
  return { text, html, n: list.length };
}
// A mark's words, copied; or as a quotation (as Quote does a selection),
// with the journal's page. The icon ticks for a moment.
$('#vSideBody').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-mk-copy], [data-mk-quote]');
  if (!b) return;
  ev.stopPropagation();
  const m = (SIDE.shown || [])[+(b.dataset.mkCopy || b.dataset.mkQuote)];
  if (!m || !m.text || !V.entry) return;
  const words = quoteText(m.text);
  if (b.dataset.mkCopy != null) copy(words, 'Copied the words');
  else {
    const pg = (SIDE.pp && SIDE.pp.get(m.page)) || (await printedPage(m.page)).page;
    const q = quoteWith(words, String(pg || ''));
    copy(q.text, q.block ? 'Copied the block quotation, with its citation' : 'Copied the quotation, with its citation');
  }
  const was = b.innerHTML;
  b.innerHTML = ICON.check;
  b.classList.add('done');
  setTimeout(() => { if (b.isConnected) { b.innerHTML = was; b.classList.remove('done'); } }, 1200);
}, true);
$('#vSideBody').addEventListener('click', ev => {
  if (ev.target.closest('[data-marks-copy]')) { const s = marksSummary(true); copy(s.text, 'Copied ' + s.n + ' highlight' + (s.n === 1 ? '' : 's') + ' and notes, with the reference', s.html); return; }
  if (ev.target.closest('[data-marks-notes]') && V.entry) {
    const e = BYKEY.get(V.entry.k) || V.entry, s = marksSummary(false), was = rawOf(e, 'annote').trim();
    const head = 'Highlights and notes (' + new Date().toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) + '):\n';
    quickSet(e, { annote: (was ? was + '\n\n' : '') + head + s.text }, 'Added ' + s.n + ' highlight' + (s.n === 1 ? '' : 's') + ' and notes to the Notes');
  }
});

// Outline: the PDF's table of contents, as a tree.
async function showOutline() {
  const body = $('#vSideBody'), my = SIDE.token;
  if (!SIDE.outline) {
    body.innerHTML = `<p class="v-side-note">Reading the outline\u2026</p>`;
    let items = null;
    try { items = await V.doc.getOutline(); } catch (err) { items = null; }
    if (my !== SIDE.token) return;
    const flat = [];
    const walk = list => (list || []).map(it => {
      const i = flat.push(it) - 1;
      const kids = it.items && it.items.length ? `<ul>${walk(it.items)}</ul>` : '';
      return `<li class="${kids ? 'has-kids' : ''}">` + (kids ? `<button type="button" class="v-ol-twist" data-twist aria-expanded="true" aria-label="Show or hide">${ICON.chev}</button>` : '<span class="v-ol-pad"></span>') +
        `<button type="button" class="v-ol-item" data-outline="${i}">${esc(it.title || 'Untitled')}</button>${kids}</li>`;
    }).join('');
    // The page bookmarks are under Bookmarks.
    let rest = (items || []).filter(it => !isBookmarkItem(it)), note = '', made = null;
    // (None in the file: one made from the printed Contents, if there is one.)
    if (!rest.length) {
      if (SIDE.tab === 'outline') body.innerHTML = `<p class="v-side-note">This PDF has no outline built in. Looking for a Contents page\u2026</p>`;
      let failed = null;
      try { made = await printedContents(V.doc, V.file && V.file.id); } catch (err) { failed = err; console.warn('Reading the Contents page:', err); }
      if (my !== SIDE.token) return;
      if (made && made.items.length) {
        rest = made.items;
        note = `Made from the printed Contents (page${made.from === made.to ? ' ' + made.from : 's ' + made.from + '\u2013' + made.to}).`;
      } else if (failed) {
        // (Said, rather than that there's none.)
        SIDE.outline = { flat, html: '', items: [], none: `This PDF has no outline built in, and its Contents page couldn\u2019t be read: ${esc(errText(failed))}` };
        if (SIDE.tab === 'outline') showOutline();
        return;
      }
    }
    const html = rest.length ? `<ul class="v-outline">${walk(rest)}</ul>` : '';
    SIDE.outline = { flat, html, items: rest, note };
  }
  if (SIDE.tab !== 'outline') return;
  // Being edited (see outline.js): the editor.
  if (OLE.on) { oleRender(); return; }
  const o = SIDE.outline;
  if (o.html) {
    body.innerHTML = `<div class="v-ol-head"><span class="v-ol-note">${esc(o.note || '')}</span>` + OL_MAKE_MENU +
      `<button type="button" class="btn" data-ol-edit title="Change the outline, and save it into the PDF">Edit</button></div>` + o.html;
    return;
  }
  // None: ways to make one.
  body.innerHTML = `<p class="v-side-note">${o.none || 'This PDF has no outline (a table of contents built into the file), and no Contents page was found in its first pages. Many journal articles have neither.'}</p>` +
    `<div class="v-ol-make"><span>Make one:</span>` +
    `<button type="button" class="btn" data-ol-make="toc" title="The Contents page you\u2019re on, or else the one LibLande finds">From the Contents</button>` +
    `<button type="button" class="btn" data-ol-make="heads" title="Lines in larger type than the text">From the headings</button>` +
    `<button type="button" class="btn" data-ol-make="empty" title="Add entries yourself, page by page">Empty, to fill in</button></div>`;
}

// Make... (an outline afresh), in the Outline tab and its editor.
const OL_MAKE_MENU = `<details class="menu right v-ole-make"><summary class="btn" title="Make the outline afresh">Make\u2026</summary><div class="menu-list" role="menu">` +
  `<button type="button" role="menuitem" data-ol-make="toc">From the Contents</button>` +
  `<button type="button" role="menuitem" data-ol-make="heads">From the headings</button>` +
  `<button type="button" role="menuitem" data-ol-make="empty">Empty</button></div></details>`;

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
// (at: the Contents start on that page, said so, rather than found.)
async function printedContents(doc, fileId, at) {
  if (at) fileId = null;
  // (v4: read again since two columns, page labels with gaps and parts
  // were read.)
  const ck = 'v4:' + (fileId || '') + ':' + doc.numPages;
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
    const ls = (await read(n)).filter(l => !TOC_HEAD.test(l.text.replace(/^(\d{1,4}|[ivxlc]{1,7})\s+|\s+(\d{1,4}|[ivxlc]{1,7})$/gi, '').replace(/\s+/g, '')) && !/^\d{1,4}$|^[ivxlc]{1,6}$/i.test(l.text) && !repeated(l));
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], m = TOC_ENTRY.exec(l.text);
      if (m && !(/^[ivxlcdm]+$/.test(tocNum(m[2])) && /\b(part|chapter|book|volume)$/i.test(m[1]))) { raw.push({ title: m[1].replace(/[\s.\u00b7\u2026_]+$/, ''), num: tocNum(m[2]), x: l.x, rx: l.rx, col: l.col }); continue; }
      if (tocHeading(l.text)) { raw.push({ title: l.text, num: null, x: l.x, rx: l.rx, col: l.col, head: true }); continue; }
      // (A title over two lines, its page number on the second.)
      const next = ls[i + 1], nm = next && TOC_ENTRY.exec(next.text);
      if (nm && !tocHeading(next.text)) { raw.push({ title: l.text + ' ' + nm[1].replace(/[\s.\u00b7\u2026_]+$/, ''), num: tocNum(nm[2]), x: l.x, rx: l.rx, col: l.col }); i++; }
    }
  }
  if (raw.filter(r => r.num).length < 3) return null;
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
        if (v && v <= n) { const off = n - v; votes.set(off, (votes.get(off) || 0) + 1); }
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

/* ---- back after following a link */
// Following a link inside the paper (to a reference, a figure, a section)
// remembers where you were; "Back to page n" returns there. Several links
// in a row step back one at a time.
const BACK = [];
// Where you are now (to come back to).
function spot() {
  const sc = $('#vScroll');
  return { page: V.viewer.currentPageNumber, top: sc.scrollTop, left: sc.scrollLeft, scale: V.viewer.currentScale };
}
// Remember a place to come back to (now, or one given), before a jump.
// After going back, the button offers a return to where you'd jumped to.
let FWD = null;
function pushBack(from) {
  BACK.push(from || spot());
  if (BACK.length > 20) BACK.shift();
  FWD = null;
  setTimeout(showBack, 0);
}
function goSpot(b) {
  if (!b || !V.doc) return;
  if (Math.abs(V.viewer.currentScale - b.scale) < 0.001) $('#vScroll').scrollTo(b.left, b.top);
  else V.viewer.currentPageNumber = b.page;
}
// On a desktop or iPad, a link inside the paper offers two ways to see
// where it goes: go there, or show it in a panel along the bottom, leaving
// your place as it is. (The link's own click handler hands PDF.js the
// destination, which goToDestination then passes to linkChoice.)
const LINKTAP = { at: null };
$('#vPages').addEventListener('click', ev => {
  const a = ev.target.closest('.annotationLayer a');
  if (!a || !V.doc || !(a.getAttribute('href') || '').startsWith('#')) return;
  if (phoneMQ.matches) { pushBack(); return; }
  LINKTAP.at = { x: ev.clientX, y: ev.clientY };
  setTimeout(() => { LINKTAP.at = null; }, 0);
}, true);
// Where a destination is: its page, and how far down it (in PDF units).
async function destWhere(dest) {
  const d = typeof dest === 'string' ? await V.doc.getDestination(dest) : dest;
  if (!Array.isArray(d)) return null;
  const ref = d[0];
  const index = ref && typeof ref === 'object' ? await V.doc.getPageIndex(ref) : Number.isInteger(ref) ? ref : null;
  if (index == null) return null;
  const kind = d[1] && d[1].name, top = kind === 'XYZ' ? d[3] : kind === 'FitH' || kind === 'FitBH' ? d[2] : kind === 'FitR' ? d[5] : null;
  return { page: index + 1, top: typeof top === 'number' ? top : null };
}
function closeLinkMenu() { const m = $('#linkMenu'); if (m) m.remove(); }
async function linkChoice(dest, at) {
  closeLinkMenu();
  let where = null;
  try { where = await destWhere(dest); } catch (err) { /* go there instead */ }
  if (!where) { pushBack(); V.link.goTo(dest); return; }
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu link-menu';
  m.id = 'linkMenu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `<button type="button" role="menuitem" data-link="go"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14"/><path d="M13 6l6 6-6 6"/></svg><span>Go to page ${where.page}</span></button>` +
    `<button type="button" role="menuitem" data-link="peek"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 13.5h17"/><path d="M7 16.8h10" opacity=".6"/></svg><span>Show in a panel</span></button>`;
  document.body.appendChild(m);
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, at.x - 12)) + 'px';
  m.style.top = (at.y + 14 + m.offsetHeight > window.innerHeight - 8 ? Math.max(8, at.y - m.offsetHeight - 10) : at.y + 14) + 'px';
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-link]');
    if (!b) return;
    closeLinkMenu();
    if (b.dataset.link === 'go') { closePeek(); pushBack(); V.link.goTo(dest); }
    else showPeek(dest, where);
  });
}
document.addEventListener('pointerdown', ev => { if ($('#linkMenu') && !ev.target.closest('#linkMenu')) closeLinkMenu(); }, true);
$('#vScroll').addEventListener('scroll', closeLinkMenu, { passive: true });
// The panel: a second, smaller viewer of the same paper (sharing what's
// already loaded), at the paper's zoom (or narrower, to fit), with your
// marks; it opens at the link's destination and scrolls through every page.
// Links in it move it, not the paper.
const PEEK = { token: 0, dest: null, viewer: null, link: null, bus: null };
function peekViewer() {
  if (PEEK.viewer) return PEEK.viewer;
  const VL = V.VL, bus = new VL.EventBus();
  const link = new VL.PDFLinkService({ eventBus: bus, externalLinkTarget: VL.LinkTarget ? VL.LinkTarget.BLANK : 2 });
  const viewer = new VL.PDFViewer({
    container: $('#vPeekBody'), viewer: $('#vPeekPages'), eventBus: bus, linkService: link,
    annotationEditorMode: V.lib.AnnotationEditorType.DISABLE,
    annotationMode: V.lib.AnnotationMode.ENABLE_STORAGE,
    enableHWA: true,
  });
  link.setViewer(viewer);
  bus.on('pagechanging', e => { $('#vPeekTitle').textContent = 'Page ' + e.pageNumber; });
  Object.assign(PEEK, { viewer, link, bus });
  return viewer;
}
function peekForget() {
  if (!PEEK.viewer || !PEEK.viewer.pdfDocument) return;
  PEEK.viewer.setDocument(null);
  PEEK.link.setDocument(null);
}
async function showPeek(dest, where) {
  const my = ++PEEK.token;
  PEEK.dest = dest;
  const panel = $('#vPeek'), body = $('#vPeekBody');
  $('#vPeekTitle').textContent = 'Page ' + where.page;
  if (panel.hidden) {
    peekHeight(store.get('peekH', 1 / 3));
    panel.hidden = false; panel.classList.add('entering'); void panel.offsetWidth; panel.classList.remove('entering');
  }
  const viewer = peekViewer();
  if (viewer.pdfDocument !== V.doc) {
    const ready = new Promise(r => PEEK.bus.on('pagesinit', r, { once: true }));
    viewer.setDocument(V.doc);
    PEEK.link.setDocument(V.doc);
    await ready;
    if (my !== PEEK.token) return;
  }
  const main = V.viewer.getPageView(where.page - 1);
  viewer.currentScaleValue = main && main.width > body.clientWidth - 24 ? 'page-width' : String(V.viewer.currentScale);
  if (dest) PEEK.link.goToDestination(dest);
  else {
    // Split screen: where the paper is now.
    const loc = V.viewer._location;
    viewer.scrollPageIntoView(loc && loc.pageNumber === where.page && loc.top != null
      ? { pageNumber: where.page, destArray: [null, { name: 'XYZ' }, loc.left, loc.top, null], allowNegativeOffset: true }
      : { pageNumber: where.page });
  }
  $('#vSplitBtn').setAttribute('aria-pressed', 'true');
  showBack();
}
function closePeek() {
  const panel = $('#vPeek');
  PEEK.token++;
  $('#vSplitBtn').setAttribute('aria-pressed', 'false');
  if (panel.hidden) return;
  panel.classList.add('leaving');
  setTimeout(() => { panel.hidden = true; panel.classList.remove('leaving'); showBack(); }, 220);
}
$('#vPeekX').addEventListener('click', closePeek);
// (A tap of the Apple Pencil on the panel's buttons, acted on as it
// lifts: on the iPad its click can go missing, over the paper. The click,
// if it comes too, isn't acted on twice.)
function penTaps(b) {
  let at = 0;
  b.addEventListener('pointerup', ev => {
    if (ev.pointerType !== 'pen' || !b.contains(document.elementFromPoint(ev.clientX, ev.clientY))) return;
    at = Date.now();
    b.click();
  });
  b.addEventListener('click', ev => { if (ev.isTrusted && Date.now() - at < 800) ev.stopImmediatePropagation(); }, true);
}
penTaps($('#vPeekX'));
// Its height, as a share of the page area: at least 120px, and leaving
// 80px of the paper showing between it and the bars at the top.
// (Remembered.)
function peekLimits() {
  const H = $('.v-body').clientHeight || window.innerHeight;
  const bars = $('#viewer').classList.contains('bars-hidden') ? 0 : topH();
  return { H, min: 120, max: Math.max(120, H - bars - 80) };
}
function peekHeight(share) {
  const { H, min, max } = peekLimits();
  const px = Math.max(min, Math.min(max, share * H));
  $('#vPeek').style.height = px + 'px';
  return px / H;
}
// Dragging the handle, or anywhere on the header but its buttons, resizes
// it. While dragging, the panel is made as tall as it can be and slid down
// (which the iPad does smoothly); its height is set when you let go. The
// header never scrolls the window, however it's dragged.
(() => {
  const panel = $('#vPeek'), grip = $('#vPeekGrip'), head = panel.querySelector('.v-peek-head');
  let drag = null, frame = 0;
  const handle = t => t.closest('#vPeekGrip') || (t.closest('.v-peek-head') && !t.closest('button'));
  const place = () => {
    frame = 0;
    if (!drag) return;
    drag.h = Math.max(drag.lim.min, Math.min(drag.lim.max, drag.h0 + drag.y0 - drag.y));
    panel.style.transform = 'translateY(' + (drag.lim.max - drag.h) + 'px)';
  };
  panel.addEventListener('pointerdown', ev => {
    if (ev.button > 0 || !handle(ev.target)) return;
    ev.preventDefault();
    const lim = peekLimits();
    drag = { y0: ev.clientY, y: ev.clientY, h0: panel.offsetHeight, h: panel.offsetHeight, lim, id: ev.pointerId, el: ev.target };
    panel.classList.add('resizing');
    panel.style.height = lim.max + 'px';
    panel.style.transform = 'translateY(' + (lim.max - drag.h0) + 'px)';
    try { ev.target.setPointerCapture(ev.pointerId); } catch (err) { /* fine without */ }
  });
  panel.addEventListener('pointermove', ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    drag.y = ev.clientY;
    if (!frame) frame = requestAnimationFrame(place);
  });
  const up = ev => {
    if (!drag || (ev && ev.pointerId !== drag.id)) return;
    if (frame) { cancelAnimationFrame(frame); place(); }
    const { h, lim } = drag;
    drag = null;
    // (Height and slide together, before the panel's own animation is back.)
    panel.style.transform = '';
    panel.style.height = h + 'px';
    requestAnimationFrame(() => panel.classList.remove('resizing'));
    store.set('peekH', h / lim.H);
    if (PEEK.viewer && PEEK.viewer.pdfDocument) PEEK.viewer.update();
    showBack();
  };
  panel.addEventListener('pointerup', up);
  panel.addEventListener('pointercancel', up);
  // No scrolling or bouncing of the window from the header (taps on its
  // buttons still work: only moves are stopped).
  head.addEventListener('touchmove', ev => ev.preventDefault(), { passive: false });
  grip.addEventListener('touchmove', ev => ev.preventDefault(), { passive: false });
  const reset = ev => {
    if (!handle(ev.target)) return;
    store.set('peekH', peekHeight(1 / 3));
    if (PEEK.viewer && PEEK.viewer.pdfDocument) PEEK.viewer.update();
  };
  panel.addEventListener('dblclick', reset);
  grip.addEventListener('keydown', ev => {
    const step = { ArrowUp: 40, ArrowDown: -40 }[ev.key];
    if (!step) return;
    ev.preventDefault();
    store.set('peekH', peekHeight((panel.offsetHeight + step) / peekLimits().H));
    if (PEEK.viewer && PEEK.viewer.pdfDocument) PEEK.viewer.update();
  });
  window.addEventListener('resize', () => { if (!panel.hidden) peekHeight(store.get('peekH', 1 / 3)); });
})();
// Go there: to the link's destination; in split screen, to where the
// panel is.
penTaps($('#vPeekGo'));
$('#vPeekGo').addEventListener('click', () => {
  const d = PEEK.dest, loc = PEEK.viewer && PEEK.viewer._location;
  closePeek();
  if (d) { pushBack(); V.link.goTo(d); return; }
  if (loc && V.doc) {
    pushBack();
    V.viewer.scrollPageIntoView({ pageNumber: loc.pageNumber, destArray: [null, { name: 'XYZ' }, loc.left, loc.top, null], allowNegativeOffset: true });
  }
});
$('#vSplitBtn').addEventListener('click', () => {
  if (!V.doc) return;
  if (!$('#vPeek').hidden) { closePeek(); return; }
  closeLinkMenu();
  showPeek(null, { page: V.viewer.currentPageNumber, top: null });
});
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  if ($('#linkMenu')) { closeLinkMenu(); ev.stopImmediatePropagation(); ev.preventDefault(); }
  else if (!$('#vPeek').hidden) { closePeek(); ev.stopImmediatePropagation(); ev.preventDefault(); }
}, true);
function showBack() {
  const el = $('#vBack');
  const last = BACK[BACK.length - 1];
  el.hidden = !(last || FWD) || $('#viewer').hidden;
  if (el.hidden) return;
  el.classList.toggle('fwd', !last);
  el.querySelector('span').textContent = last ? 'Back to page ' + last.page : 'Return to page ' + FWD.page;
  // Stay clear of the markup toolbar and its button.
  el.style.bottom = '';
  const r = el.getBoundingClientRect();
  let bottom = null;
  [$('#vPalette'), $('#vpShow')].forEach(o => {
    if (o.hidden) return;
    const q = o.getBoundingClientRect();
    if (q.width && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) {
      bottom = Math.max(bottom || 0, $('.v-body').getBoundingClientRect().bottom - q.top + 10);
    }
  });
  // Above the panel, when it's open.
  const peek = $('#vPeek');
  if (!peek.hidden) bottom = Math.max(bottom || 0, peek.offsetHeight + 12);
  if (bottom != null) el.style.bottom = bottom + 'px';
}
// The browser's own scroll bar (on a computer): dragging it to another
// page offers Back too.
(() => {
  const sc = $('#vScroll');
  let from = null;
  sc.addEventListener('pointerdown', ev => {
    from = null;
    if (ev.pointerType !== 'mouse' || ev.target !== sc || !V.doc) return;
    const r = sc.getBoundingClientRect();
    if (ev.clientX > r.left + sc.clientWidth || ev.clientY > r.top + sc.clientHeight) from = spot();
  }, true);
  window.addEventListener('pointerup', () => {
    const f = from;
    from = null;
    if (f && V.doc && V.viewer.currentPageNumber !== f.page) pushBack(f);
  }, true);
})();
// Two fingers with a tool on (scrolled here, see panMove, and the pinch
// preview): a quick swipe goes one way, up and down or side to side,
// whichever it starts with; a slower, deliberate drag goes wherever the
// fingers do. (SWIPE_SPEED: px per ms.) One finger is left to the browser:
// iOS can't be made to keep its own scrolling to one direction (shutting
// the other direction mid-scroll makes the page jump).
const SWIPE_SPEED = 0.6;
const swipeAxis = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? 'x' : 'y');
/* ---- the scroll bar, and the page number on a new page */
// The scroll bar, on every device: it starts below the toolbar (the
// browser's own ran up behind it, where it couldn't be grabbed). The page
// number shows on all.
const TOUCH_UI = matchMedia('(pointer: coarse)');
const RAIL = { frame: 0, drag: null, pillTimer: 0, activeTimer: 0, lastPage: 0 };
function railMetrics() {
  const sc = $('#vScroll'), rail = $('#vRail');
  const H = rail.clientHeight, max = sc.scrollHeight - sc.clientHeight;
  const th = Math.max(36, Math.min(H, H * sc.clientHeight / Math.max(1, sc.scrollHeight)));
  return { sc, H, max, th };
}
function drawRail() {
  RAIL.frame = 0;
  const rail = $('#vRail'), m = railMetrics();
  rail.hidden = $('#viewer').hidden || !V.doc || m.max < 20;
  if (rail.hidden) return;
  const t = $('#vThumb');
  t.style.height = m.th + 'px';
  t.style.top = (m.max > 0 ? m.sc.scrollTop / m.max * (m.H - m.th) : 0) + 'px';
  if (V.viewer) $('#vThumbTip').textContent = 'Page ' + V.viewer.currentPageNumber + ' of ' + V.viewer.pagesCount;
}
const railSoon = () => { if (!RAIL.frame) RAIL.frame = requestAnimationFrame(drawRail); };
$('#vScroll').addEventListener('scroll', () => {
  railSoon();
  $('#vRail').classList.add('active');
  clearTimeout(RAIL.activeTimer);
  RAIL.activeTimer = setTimeout(() => $('#vRail').classList.remove('active'), 900);
}, { passive: true });
window.addEventListener('resize', railSoon);
try { TOUCH_UI.addEventListener('change', railSoon); } catch (err) { /* older Safari: checked on each scroll anyway */ }
(() => {
  const rail = $('#vRail'), thumb = $('#vThumb');
  const moveTo = y => {
    const m = railMetrics(), r = rail.getBoundingClientRect();
    const top = Math.max(0, Math.min(m.H - m.th, y - r.top - RAIL.drag.grab));
    m.sc.scrollTop = m.H > m.th ? top / (m.H - m.th) * m.max : 0;
  };
  rail.addEventListener('pointerdown', ev => {
    if (ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const tr = thumb.getBoundingClientRect();
    // On the thumb: hold it where it was grabbed. On the track: jump there.
    const grab = ev.clientY >= tr.top && ev.clientY <= tr.bottom ? ev.clientY - tr.top : tr.height / 2;
    RAIL.drag = { id: ev.pointerId, grab, from: V.doc ? spot() : null };
    rail.classList.add('dragging');
    try { rail.setPointerCapture(ev.pointerId); } catch (err) { /* fine without */ }
    moveTo(ev.clientY);
  });
  rail.addEventListener('pointermove', ev => {
    if (!RAIL.drag || ev.pointerId !== RAIL.drag.id) return;
    ev.preventDefault();
    moveTo(ev.clientY);
  });
  const end = ev => {
    if (!RAIL.drag || ev.pointerId !== RAIL.drag.id) return;
    const from = RAIL.drag.from;
    RAIL.drag = null;
    rail.classList.remove('dragging');
    // Dragged to another page: Back returns to where you were.
    if (from && V.doc && V.viewer.currentPageNumber !== from.page) pushBack(from);
  };
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointercancel', end);
})();
// The library's list gets the same scroll bar (touch screens), labelled
// while dragging with where it is in the sort order: the author, year,
// date or title there.
const LR = { frame: 0, drag: null, activeTimer: 0 };
const libRail = (() => {
  const rail = document.createElement('div');
  rail.className = 'v-rail l-rail';
  rail.hidden = true;
  rail.setAttribute('aria-hidden', 'true');
  rail.innerHTML = '<div class="v-grab"><span class="v-grab-tip"></span></div>';
  $('#listwrap').appendChild(rail);
  return rail;
})();
function libRailLabel() {
  const v = state.view, e = v[rowAt(listEl.scrollTop + 1)];
  if (!e) return '';
  const cut = t => (t.length > 26 ? t.slice(0, 25) + '\u2026' : t);
  if (state.sort === 'author') return cut((e.authorsInit || '').split(/,| & /)[0]);
  if (state.sort === 'year') return e.f.year || '';
  if (state.sort === 'added') return e.added.slice(0, 10);
  if (state.sort === 'title') return cut(e.f.title || '');
  if (state.sort === 'venue') return cut(e.venue || '');
  const d = colDef(state.sort);
  return d && d.cell ? cut(String(d.cell(e))) : '';
}
function drawLibRail() {
  LR.frame = 0;
  const rail = libRail, max = listEl.scrollHeight - listEl.clientHeight;
  rail.hidden = !TOUCH_UI.matches || !ENTRIES.length || max < 40 || !listEl.offsetParent;
  if (rail.hidden) return;
  rail.style.top = (listEl.offsetTop + 4) + 'px';
  rail.style.bottom = 'auto';
  rail.style.height = (listEl.clientHeight - 8) + 'px';
  const H = listEl.clientHeight - 8, th = Math.max(36, Math.min(H, H * listEl.clientHeight / listEl.scrollHeight));
  const g = rail.firstElementChild;
  g.style.height = th + 'px';
  g.style.top = (listEl.scrollTop / max * (H - th)) + 'px';
  if (LR.drag) g.firstElementChild.textContent = libRailLabel();
}
function libRailSoon() { if (!LR.frame) LR.frame = requestAnimationFrame(drawLibRail); }
listEl.addEventListener('scroll', () => {
  libRailSoon();
  libRail.classList.add('active');
  clearTimeout(LR.activeTimer);
  LR.activeTimer = setTimeout(() => libRail.classList.remove('active'), 900);
}, { passive: true });
window.addEventListener('resize', libRailSoon);
(() => {
  const rail = libRail, g = rail.firstElementChild;
  const moveTo = y => {
    const r = rail.getBoundingClientRect(), H = rail.clientHeight, th = g.offsetHeight, max = listEl.scrollHeight - listEl.clientHeight;
    const top = Math.max(0, Math.min(H - th, y - r.top - LR.drag.grab));
    listEl.scrollTop = H > th ? top / (H - th) * max : 0;
    g.firstElementChild.textContent = libRailLabel();
  };
  rail.addEventListener('pointerdown', ev => {
    if (ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const gr = g.getBoundingClientRect();
    LR.drag = { id: ev.pointerId, grab: ev.clientY >= gr.top && ev.clientY <= gr.bottom ? ev.clientY - gr.top : gr.height / 2 };
    rail.classList.add('dragging');
    try { rail.setPointerCapture(ev.pointerId); } catch (err) { /* fine without */ }
    moveTo(ev.clientY);
  });
  rail.addEventListener('pointermove', ev => { if (LR.drag && ev.pointerId === LR.drag.id) { ev.preventDefault(); moveTo(ev.clientY); } });
  const end = ev => { if (LR.drag && ev.pointerId === LR.drag.id) { LR.drag = null; rail.classList.remove('dragging'); } };
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointercancel', end);
})();
// In the reader, a tap on an empty part of the bar at the top goes back to
// the top. (In the library, a tap on the tab that's showing does.)
const bareTap = el => !el.closest('button, a, input, select, textarea, summary, details, label, .tab, .search, .v-tab');
['.v-bar', '#vTabs'].forEach(sel => $(sel).addEventListener('click', ev => {
  if (!bareTap(ev.target) || !V.doc) return;
  $('#vScroll').scrollTo({ top: 0, behavior: 'smooth' });
}));
// The page number, for a moment, at the bottom (above the markup toolbar
// if that's in the way). Not while dragging the scroll bar, which shows it.
function showPagePill(n, total) {
  const pill = $('#vPagePill');
  if (RAIL.drag || $('#viewer').hidden || !total) return;
  pill.textContent = n + ' / ' + total;
  pill.style.bottom = '';
  pill.classList.add('show');
  const r = pill.getBoundingClientRect();
  let bottom = null;
  [$('#vPalette'), $('#vpShow'), $('#vBack')].forEach(o => {
    if (o.hidden) return;
    const q = o.getBoundingClientRect();
    if (q.width && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) {
      bottom = Math.max(bottom || 0, $('.v-body').getBoundingClientRect().bottom - q.top + 10);
    }
  });
  if (bottom != null) pill.style.bottom = bottom + 'px';
  clearTimeout(RAIL.pillTimer);
  RAIL.pillTimer = setTimeout(() => pill.classList.remove('show'), 1200);
}
const BARS = { down: null, lastTap: null, tapTimer: 0, scrollAt: 0, active: new Set(), multiAt: 0 };
const topH = () => $('#vTop').offsetHeight;
new ResizeObserver(() => { $('#viewer').style.setProperty('--top-h', topH() + 'px'); placePalette(); }).observe($('#vTop'));
function barsHidden(on) {
  const v = $('#viewer');
  if (on === v.classList.contains('bars-hidden')) return;
  v.classList.toggle('bars-hidden', on);
  // (The scroll bar grows or shrinks with it: its thumb drawn again, as
  // it slides and once it's there.)
  const t0 = performance.now(), each = () => { drawRail(); if (performance.now() - t0 < 340) requestAnimationFrame(each); };
  requestAnimationFrame(each);
}
const keepBars = () => !TOUCH_UI.matches || !$('#vFind').hidden || sideOpen() || !$('#vComment').hidden || !$('#vpPanel').hidden || $('#vShare').open || $('#vRLMenu').open || V.selected;
// (Scrolling leaves them as they are: only a tap hides or shows them.)
// The link within the paper nearest a point, if one is within reach (px).
// (Not links to websites: a near miss shouldn't open another page.)
function linkNear(x, y, reach) {
  let best = null, bestD = reach;
  document.querySelectorAll('#vPages .annotationLayer a[href^="#"]').forEach(a => {
    const r = a.getBoundingClientRect();
    if (!r.width || r.bottom < y - reach || r.top > y + reach) return;
    const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (d <= bestD) { best = a; bestD = d; }
  });
  return best;
}
// A tap on the page (with no tool on) hides them, or brings them back;
// so does a finger's, with a tool on and the Pencil drawing (fingers don't
// mark then). Not a touch that isn't meant as a tap: one that stops the
// page while it's still gliding, one of several fingers at once, or a
// palm (a large touch: the iPad gives a fingertip as 40 or 50px across).
$('#vScroll').addEventListener('scroll', () => { BARS.scrollAt = Date.now(); }, { passive: true });
$('#vScroll').addEventListener('pointerdown', ev => {
  const now = Date.now();
  if (BARS.active.size) BARS.multiAt = now;
  BARS.active.add(ev.pointerId);
  BARS.down = { x: ev.clientX, y: ev.clientY, t: now, gliding: now - BARS.scrollAt < 150, palm: ev.pointerType === 'touch' && Math.max(ev.width || 0, ev.height || 0) > 100 };
}, true);
['pointerup', 'pointercancel'].forEach(n => window.addEventListener(n, ev => { setTimeout(() => BARS.active.delete(ev.pointerId), 0); }, true));
$('#vScroll').addEventListener('pointerup', ev => {
  const d = BARS.down;
  BARS.down = null;
  const fingerOnly = V.tool !== 'read' && V.pencil && ev.pointerType === 'touch';
  if (!d || (V.tool !== 'read' && !fingerOnly) || !TOUCH_UI.matches) return;
  if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8 || Date.now() - d.t > 400) return;
  if (d.gliding || d.palm || BARS.active.size > 1 || Date.now() - BARS.multiAt < 400) return;
  // (Hidden, a tap brings them back wherever it lands on the paper: on a
  // mark, which it also picks up, or ending a selection.)
  const hiddenNow = $('#viewer').classList.contains('bars-hidden');
  if (ev.target.closest('a, button, .editToolbar') || LP.took) return;
  if (!hiddenNow) {
    if (ev.target.closest('.annotationLayer section')) return;
    // Not when the tap ends a text selection.
    if (!getSelection().isCollapsed) return;
    // A tap on a mark picks it up (see above), rather than the bars.
    if (readMarkAt(ev.clientX, ev.clientY)) return;
  }
  // A tap just beside a link within the paper (they can be tiny, like a
  // footnote's star) is a tap on the link, not on the page.
  const near = linkNear(ev.clientX, ev.clientY, 24);
  if (near) {
    const x = ev.clientX, y = ev.clientY;
    setTimeout(() => near.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })), 0);
    return;
  }
  // A second tap soon after, nearby, is a double tap: zoom (see
  // doubleTapZoom). So a single tap waits a moment before showing or
  // hiding the bars, as iOS does where double tap is used.
  const x = ev.clientX, y = ev.clientY, last = BARS.lastTap, now = Date.now();
  clearTimeout(BARS.tapTimer);
  if (last && now - last.t < 320 && Math.hypot(x - last.x, y - last.y) < 40) {
    BARS.lastTap = null;
    doubleTapZoom(x, y);
    return;
  }
  BARS.lastTap = { t: now, x, y };
  BARS.tapTimer = setTimeout(() => {
    BARS.lastTap = null;
    const hidden = $('#viewer').classList.contains('bars-hidden');
    if (hidden) barsHidden(false);
    else if (!keepBars()) barsHidden(true);
  }, 300);
}, true);
// Double tap (no tool on, or a finger's with the Pencil in use; touch
// screens): the page's width, then the
// column you tapped fitted to the screen (a single column, or none found:
// twice the size), then the whole page, then the width again. The spot
// you tapped stays under your finger.
// The zoom glides: the pages are laid out at the new size straight away,
// then drawn (by a transform) where they were, and eased into place.
let tapZoomEnd = 0;
function tapZoomGlide(page, change, before) {
  const pages = $('#vPages');
  clearTimeout(tapZoomEnd);
  pages.classList.remove('tap-zoom');
  pages.style.transform = '';
  before = before || page.getBoundingClientRect();
  change();
  const after = page.getBoundingClientRect(), box = pages.getBoundingClientRect();
  if (!after.width || !before.width) return;
  const k = before.width / after.width, dx = before.left - after.left, dy = before.top - after.top;
  if (Math.abs(k - 1) < 0.01 && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  pages.style.transformOrigin = (after.left - box.left) + 'px ' + (after.top - box.top) + 'px';
  pages.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
  pages.getBoundingClientRect();
  pages.classList.add('tap-zoom');
  pages.style.transform = '';
  tapZoomEnd = setTimeout(() => pages.classList.remove('tap-zoom'), 320);
}
function doubleTapZoom(x, y, before) {
  if (!V.viewer || !V.doc) return;
  const pagesEl = $('#vPages');
  clearTimeout(tapZoomEnd);
  pagesEl.classList.remove('tap-zoom');
  pagesEl.style.transform = '';
  const sc = $('#vScroll'), v = V.viewer.currentScaleValue;
  const page = document.elementsFromPoint(x, y).map(el => el.closest && el.closest('.page')).find(Boolean);
  if (!page) return;
  if (before && before.page !== page) before = null;
  const pr = page.getBoundingClientRect(), fy = (y - pr.top) / pr.height, fx = (x - pr.left) / pr.width;
  // After a zoom: put the same spot of the page back under the finger (or
  // the column's left edge at the screen's).
  const settle = (fl, gap) => {
    const r = page.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    if (fl != null) sc.scrollLeft += r.left + fl * r.width - (sr.left + gap);
    else sc.scrollLeft += r.left + fx * r.width - x;
    sc.scrollTop += r.top + fy * r.height - y;
  };
  if (v === 'page-fit') {
    const fit = V.viewer.currentScale, r0 = page.getBoundingClientRect();
    const was = { left: r0.left, top: r0.top, width: r0.width, page };
    V.viewer.currentScaleValue = 'page-width';
    // (On a phone held upright the whole page and the page's width are the
    // same size: skip on to the column.)
    if (Math.abs(V.viewer.currentScale - fit) <= 0.02) { settle(); doubleTapZoom(x, y, was); return; }
    tapZoomGlide(page, settle, was);
    return;
  }
  if (v !== 'page-width' && v !== 'auto') {
    tapZoomGlide(page, () => {
      V.viewer.currentScaleValue = 'page-fit';
      V.viewer.scrollPageIntoView({ pageNumber: +page.dataset.pageNumber });
    }, before);
    return;
  }
  // The column: lines of text on this page within reach above and below,
  // that run under the tapped spot.
  let left = Infinity, right = -Infinity;
  for (const span of page.querySelectorAll('.textLayer span')) {
    if (/rotate/.test(span.style.transform) || !span.textContent.trim()) continue;
    const b = span.getBoundingClientRect();
    if (b.bottom < y - 250 || b.top > y + 250 || b.left > x + 12 || b.right < x - 12) continue;
    left = Math.min(left, b.left); right = Math.max(right, b.right);
  }
  const gap = 10, w = right - left;
  let k = w > 60 ? (sc.clientWidth - 2 * gap) / w : 2;
  if (k < 1.25) k = 2;
  k = Math.min(k, 4);
  tapZoomGlide(page, () => {
    zoomBy(k, x, y);
    settle(w > 60 && k !== 2 ? (left - pr.left) / pr.width : null, gap);
  }, before);
}
function clearBack() { BACK.length = 0; FWD = null; $('#vBack').hidden = true; }
$('#vBackGo').addEventListener('click', () => {
  if (!V.doc) return;
  if (BACK.length) {
    const here = spot(), b = BACK.pop();
    goSpot(b);
    // With nothing further back, offer the way back to where you were.
    if (!BACK.length) FWD = here;
  } else if (FWD) {
    const here = spot(), f = FWD;
    FWD = null;
    goSpot(f);
    BACK.push(here);
  }
  showBack();
});
$('#vBackX').addEventListener('click', clearBack);

/* ---- zoom, page, share */
const zoomBy = (factor, x, y) => {
  if (!V.viewer || !V.doc) return;
  const r = $('#vScroll').getBoundingClientRect();
  V.viewer.updateScale({ scaleFactor: factor, origin: [x == null ? r.left + r.width / 2 : x, y == null ? r.top + r.height / 2 : y], drawingDelay: 300 });
};
$('#vClose').addEventListener('click', closeReader);
$('#vZoomIn').addEventListener('click', () => { if (V.doc) V.viewer.increaseScale(); });
$('#vZoomOut').addEventListener('click', () => { if (V.doc) V.viewer.decreaseScale(); });
// The zoom level is also the fit button: each tap goes on to the next of
// the whole page, the page's width, and actual size (100%).
const FITS = [['page-fit', 'the whole page'], ['page-width', 'the page\u2019s width'], ['page-actual', 'actual size']];
function zoomLabel(preset) {
  const b = $('#vZoomLevel'), i = FITS.findIndex(([v]) => v === preset), next = FITS[(i + 1) % FITS.length];
  b.title = 'Fit ' + next[1] + (i >= 0 ? ' (now: ' + FITS[i][1] + ')' : '');
  b.setAttribute('aria-label', 'Zoom ' + b.textContent + ': tap to fit ' + next[1]);
}
$('#vZoomLevel').addEventListener('click', () => {
  if (!V.doc) return;
  const i = FITS.findIndex(([v]) => v === V.viewer.currentScaleValue);
  V.viewer.currentScaleValue = FITS[(i + 1) % FITS.length][0];
});

// Search in the paper with PDF.js's find controller: every match is
// highlighted, Return goes to the next one, shift-Return to the previous.
function openFind() {
  if (!V.doc) return;
  $('#vFind').hidden = false;
  $('#vFindBtn').setAttribute('aria-pressed', 'true');
  const input = $('#vFindInput');
  input.focus();
  input.select();
  if (input.value.trim()) runFind('');
}
function closeFind() {
  if ($('#vFind').hidden) return;
  $('#vFind').hidden = true;
  $('#vFindBtn').setAttribute('aria-pressed', 'false');
  if (V.bus) V.bus.dispatch('findbarclose', { source: null });
}
function runFind(type, previous) {
  if (!V.bus || !V.doc) return;
  const query = $('#vFindInput').value.trim();
  if (!query) { $('#vFindCount').textContent = ''; V.bus.dispatch('findbarclose', { source: null }); return; }
  V.bus.dispatch('find', { source: null, type, query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: !!previous, matchDiacritics: false });
}
let findTimer;
$('#vFindBtn').addEventListener('click', () => { if ($('#vFind').hidden) openFind(); else closeFind(); });
$('#vFindClose').addEventListener('click', closeFind);
$('#vFindNext').addEventListener('click', () => runFind('again', false));
$('#vFindPrev').addEventListener('click', () => runFind('again', true));
$('#vFindInput').addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(() => runFind(''), 200); });
$('#vFindInput').addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(findTimer); runFind('again', ev.shiftKey); }
  else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeFind(); }
});
// (Its items, as the details' Share menu has them, before Google Drive.)
$('#vDrive').insertAdjacentHTML('beforebegin', shareItems(k => `data-vshare="${k}"`, true) + '<hr class="mi-sep">');
// (Its shortcuts, yours as they are now, each time it opens.)
$('#vShare').addEventListener('toggle', () => {
  if (!$('#vShare').open) return;
  $('#vShare').querySelectorAll('[data-key-hint]').forEach(k => { k.textContent = keyHint(k.dataset.keyHint); });
  $('#vShare').querySelectorAll('[data-key-title]').forEach(b => { b.title = b.getAttribute('aria-label') + ' (' + keyHint(b.dataset.keyTitle) + ')'; });
});
$('#vShare').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-vshare]');
  if (!b) return;
  $('#vShare').open = false;
  if (!V.file) return;
  const mail = b.dataset.vshare[0] === 'd' ? 'download' : V.entry ? mailOf(V.entry) : null;
  if (b.dataset.vshare[1] === '1') { prepareShare(V.file, true, mail, $('#vShare summary')); return; }
  if (!V.bytes) { toast('The paper is still downloading.', 2000); return; }
  if (V.drawing) { await commitDrawing(); V.drawing = false; if (V.tool !== 'read') setTool(V.tool); }
  try {
    openIn((V.dirty || V.bmDirty) && V.doc ? await realLines(await withBookmarks(await V.doc.saveDocument())) : V.bytes, V.file.n, null, null, mail);
  } catch (err) { toast(errText(err), 5000); }
});
window.addEventListener('resize', () => {
  if ($('#viewer').hidden || !V.doc) return;
  const v = V.viewer.currentScaleValue;
  if (v === 'auto' || v === 'page-width' || v === 'page-fit') V.viewer.currentScaleValue = v;
});
// Zooming by pinch or trackpad: the pages are scaled on screen while the
// gesture lasts (cheap), and PDF.js lays them out and redraws them once at
// the end, rather than at every step.
// With two fingers the pages also follow the fingers (move is how far
// they've gone), so zooming and moving the page happen together.
const PINCH = { k: 1, x: 0, y: 0, timer: 0, s0: null, move: [0, 0] };
function zoomPreview(k, x, y, move) {
  if (!V.doc) return;
  const sc = $('#vScroll'), pages = $('#vPages');
  if (PINCH.k === 1 && !pages.classList.contains('zooming')) {
    clearTimeout(tapZoomEnd);
    pages.classList.remove('tap-zoom');
    const r = sc.getBoundingClientRect();
    PINCH.x = x; PINCH.y = y;
    PINCH.s0 = [sc.scrollLeft, sc.scrollTop];
    pages.style.transformOrigin = (sc.scrollLeft + x - r.left) + 'px ' + (sc.scrollTop + y - r.top) + 'px';
    pages.classList.add('zooming');
  }
  const scale = V.viewer.currentScale;
  PINCH.k = Math.max(0.25 / scale, Math.min(10 / scale, k));
  PINCH.move = move || [0, 0];
  // Any scrolling the browser did meanwhile is taken off, so the page
  // moves just as the fingers do.
  const tx = PINCH.move[0] + sc.scrollLeft - PINCH.s0[0], ty = PINCH.move[1] + sc.scrollTop - PINCH.s0[1];
  pages.style.transform = `translate(${tx}px, ${ty}px) scale(${PINCH.k})`;
}
function zoomCommit() {
  clearTimeout(PINCH.timer);
  const sc = $('#vScroll'), pages = $('#vPages'), k = PINCH.k, [mx, my] = PINCH.move, s0 = PINCH.s0;
  // The page under the fingers, and where the preview shows it.
  const page = document.elementsFromPoint(PINCH.x + mx, PINCH.y + my).map(el => el.closest && el.closest('.page')).find(Boolean);
  const shown = page && page.getBoundingClientRect();
  pages.style.transform = '';
  pages.classList.remove('zooming');
  PINCH.k = 1; PINCH.move = [0, 0]; PINCH.s0 = null;
  // Zoom about where the fingers started, then move by as far as they went.
  if (s0) { sc.scrollLeft = s0[0]; sc.scrollTop = s0[1]; }
  if (Math.abs(k - 1) > 0.02) zoomBy(k, PINCH.x, PINCH.y);
  if (mx || my) { sc.scrollLeft -= mx; sc.scrollTop -= my; }
  // PDF.js centres pages narrower than the screen, which its zoom doesn't
  // allow for; line the page up with where the preview had it.
  if (shown) {
    const now = page.getBoundingClientRect();
    sc.scrollLeft += now.left - shown.left;
    sc.scrollTop += now.top - shown.top;
  }
}
// Ctrl + scroll wheel, and trackpad pinch outside Safari. (Safari sends its
// own gesture events, below, so there it isn't needed; a wheel listener
// that can cancel scrolling makes every scroll wait for it.)
if (!('GestureEvent' in window)) {
  $('#vScroll').addEventListener('wheel', ev => {
    if (!ev.ctrlKey || !V.doc) return;
    ev.preventDefault();
    zoomPreview(PINCH.k * Math.exp(-ev.deltaY / 120), ev.clientX, ev.clientY);
    clearTimeout(PINCH.timer);
    PINCH.timer = setTimeout(zoomCommit, 180);
  }, { passive: false });
}

// Pinch to zoom with two fingers: scale (and move) what's on screen while
// the fingers move, then let PDF.js redraw at the new size.
(() => {
  const sc = $('#vScroll'), pages = $('#vPages');
  let pinch = null, gesture = 1;
  const gap = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  // Two fingers on a touch screen. The listeners are passive (they never
  // hold up scrolling); the scroll area's touch-action keeps the browser
  // from zooming the whole page.
  sc.addEventListener('touchstart', ev => {
    const fingers = Array.from(ev.touches).filter(t => t.touchType !== 'stylus');
    if (fingers.length !== 2) return;
    const x = (fingers[0].clientX + fingers[1].clientX) / 2, y = (fingers[0].clientY + fingers[1].clientY) / 2;
    // On a phone, the gesture is one or the other: a pinch zooms (without
    // moving the page) and a two-finger drag moves it (without zooming),
    // decided by which the fingers do first. On an iPad, both at once.
    pinch = { d: gap(fingers), x, y, mode: phoneMQ.matches ? null : 'both', t0: performance.now() };
    zoomPreview(1, x, y);
  }, { passive: true });
  sc.addEventListener('touchmove', ev => {
    const fingers = Array.from(ev.touches).filter(t => t.touchType !== 'stylus');
    if (!pinch || fingers.length !== 2) return;
    const x = (fingers[0].clientX + fingers[1].clientX) / 2, y = (fingers[0].clientY + fingers[1].clientY) / 2;
    let k = gap(fingers) / pinch.d;
    const mv = [x - pinch.x, y - pinch.y];
    // On an iPad, the page doesn't zoom until the fingers have pinched (or
    // spread) by 30 px, and by more than half as far as they've moved
    // together, so a two-finger scroll doesn't wobble the size; from there
    // it zooms smoothly on.
    if (pinch.mode === 'both') {
      const spread = Math.abs(gap(fingers) - pinch.d);
      if (!pinch.zoomFrom && spread > 30 && spread > 0.5 * Math.hypot(mv[0], mv[1])) pinch.zoomFrom = k;
      k = pinch.zoomFrom ? k / pinch.zoomFrom : 1;
    }
    // (On a phone: a clear pinch or spread, more than half as far as the
    // fingers have moved together, zooms; otherwise a move of the fingers
    // together moves the page.)
    if (!pinch.mode) {
      const spread = Math.abs(gap(fingers) - pinch.d), move = Math.hypot(mv[0], mv[1]);
      if (spread > Math.max(24, 0.15 * pinch.d) && spread > 0.5 * move) pinch.mode = 'zoom';
      else if (move > 14) pinch.mode = 'pan';
      else return;
    }
    // With a tool on, two fingers scroll in one direction (see panMove).
    if (V.tool !== 'read' && !V.pencil && Math.hypot(mv[0], mv[1]) >= 8) {
      pinch.axis = pinch.axis || (Math.hypot(mv[0], mv[1]) / Math.max(1, performance.now() - pinch.t0) >= SWIPE_SPEED ? swipeAxis(mv[0], mv[1]) : 'free');
      if (pinch.axis !== 'free') mv[pinch.axis === 'x' ? 1 : 0] = 0;
    }
    if (pinch.mode === 'zoom') zoomPreview(k, PINCH.x, PINCH.y, [0, 0]);
    else if (pinch.mode === 'pan') zoomPreview(1, PINCH.x, PINCH.y, mv);
    else zoomPreview(k, PINCH.x, PINCH.y, mv);
  }, { passive: true });
  const endPinch = ev => {
    if (!pinch || ev.touches.length >= 2) return;
    pinch = null;
    zoomCommit();
  };
  sc.addEventListener('touchend', endPinch, { passive: true });
  sc.addEventListener('touchcancel', endPinch, { passive: true });
  // Safari's own pinch gestures: a trackpad on a Mac. (On iPad the touch
  // listeners above handle it.)
  document.addEventListener('gesturestart', ev => {
    if ($('#viewer').hidden) return;
    ev.preventDefault();
    gesture = 1;
    if (!coarseMQ.matches && V.doc) zoomPreview(1, ev.clientX, ev.clientY);
  });
  document.addEventListener('gesturechange', ev => {
    if ($('#viewer').hidden || pinch || !V.doc) return;
    ev.preventDefault();
    if (coarseMQ.matches) return;
    zoomPreview(ev.scale, PINCH.x, PINCH.y);
  });
  document.addEventListener('gestureend', ev => {
    if ($('#viewer').hidden || pinch || !V.doc || coarseMQ.matches) return;
    ev.preventDefault();
    zoomCommit();
  });
})();

// Clean copies: the same PDF with markup annotations (highlights, pen
// marks, notes, shapes) removed, using pdf-lib. Links and form fields stay.
// Marks that an app has flattened into the page itself can't be removed.
const PDFLIB = './vendor/pdf-lib/1.17.1/pdf-lib.min.js';
const MARKUP = new Set(['Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Ink', 'Text', 'FreeText', 'Popup',
  'Square', 'Circle', 'Line', 'Polygon', 'PolyLine', 'Stamp', 'Caret', 'FileAttachment', 'Sound', 'Redact']);
let pdfLibReady = null;
function loadPdfLib() {
  if (!pdfLibReady) {
    pdfLibReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFLIB;
      s.onload = () => resolve(window.PDFLib);
      s.onerror = () => reject(new Error('A PDF tool LibLande needs (pdf-lib) couldn\u2019t load. Check your internet connection and try again.'));
      document.head.appendChild(s);
    });
    pdfLibReady.catch(() => { pdfLibReady = null; });
  }
  return pdfLibReady;
}

async function cleanPdf(bytes) {
  const { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef } = await loadPdfLib();
  const open = data => PDFDocument.load(data, { updateMetadata: false, throwOnInvalidObject: false });
  let doc;
  try {
    doc = await open(bytes);
  } catch (err) {
    if (/encrypt/i.test(String(err && err.message))) {
      throw new Error('This PDF is password-protected, so LibLande can\u2019t make a clean copy of it.');
    }
    // A damaged file: rebuild it from its objects and try again.
    try {
      doc = await open(rebuildPdf(bytes));
    } catch (err2) {
      throw new Error('LibLande couldn\u2019t read this PDF to make a clean copy. Its file structure may be damaged.');
    }
  }
  const ctx = doc.context;
  const drop = ref => { if (ref instanceof PDFRef) ctx.delete(ref); };
  let removed = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) continue;
    const keep = [];
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const dict = annots.lookup(i);
      const subtype = dict instanceof PDFDict ? dict.get(PDFName.of('Subtype')) : null;
      if (!subtype || !MARKUP.has(subtype.toString().replace(/^[/]/, ''))) { keep.push(ref); continue; }
      removed++;
      // Take the annotation's drawing and text out of the file too.
      const ap = dict.lookup(PDFName.of('AP'));
      if (ap instanceof PDFDict) {
        for (const key of ['N', 'R', 'D']) {
          const v = ap.get(PDFName.of(key));
          if (v instanceof PDFRef) drop(v);
          else if (v instanceof PDFDict) v.entries().forEach(([, s]) => drop(s));
        }
      }
      drop(ref);
    }
    if (keep.length) page.node.set(PDFName.of('Annots'), ctx.obj(keep));
    else page.node.delete(PDFName.of('Annots'));
  }
  return { bytes: await doc.save(), removed };
}
// A fresh copy of a PDF whose structure is damaged, rebuilt from its
// objects. Some apps (PDF Expert, for one) can leave a save half-written:
// an index ("xref" table) or trailer cut off mid-line, with the next object
// starting right after. Viewers cope; pdf-lib doesn't. This keeps the
// newest complete copy of each object, skips truncated ones, and writes a
// new index and trailer.
function rebuildPdf(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  let maxSize = 0;
  for (const m of text.matchAll(/[/]Size\s+(\d+)/g)) maxSize = Math.max(maxSize, +m[1]);
  if (!maxSize) maxSize = 1e7;
  const HEAD = /(\d+)[ \t\r\n]+(\d+)[ \t\r\n]+obj\b/g;
  const objs = new Map();
  let m;
  while ((m = HEAD.exec(text))) {
    // A damaged save can run digits together ("...dd591250 0 obj"): take
    // the longest ending of the digit run that's a plausible object number.
    let digits = m[1];
    const before = m.index > 0 ? text[m.index - 1] : ' ';
    if (!/[\s>\]]/.test(before) || +digits > maxSize) {
      let k = 0;
      while (k < digits.length - 1 && +digits.slice(k) > maxSize) k++;
      digits = digits.slice(k);
    }
    const num = +digits, gen = +m[2], bodyStart = HEAD.lastIndex;
    const endobj = text.indexOf('endobj', bodyStart);
    if (endobj < 0) break;
    const streamAt = text.indexOf('stream', bodyStart);
    let end = endobj;
    if (streamAt >= 0 && streamAt < endobj) {
      // Truncated if another object starts inside the dictionary part.
      HEAD.lastIndex = bodyStart;
      const inner = HEAD.exec(text);
      if (inner && inner.index < streamAt) { HEAD.lastIndex = inner.index; continue; }
      const len = /[/]Length\s+(\d+)(?!\s+\d+\s+R)/.exec(text.slice(bodyStart, streamAt));
      let dataStart = streamAt + 6;
      if (text[dataStart] === '\r') dataStart++;
      if (text[dataStart] === '\n') dataStart++;
      let endstream = len ? text.indexOf('endstream', dataStart + +len[1]) : -1;
      if (endstream < 0 || endstream > dataStart + +(len ? len[1] : 0) + 64) endstream = text.indexOf('endstream', dataStart);
      if (endstream < 0) break;
      end = text.indexOf('endobj', endstream);
      if (end < 0) break;
    } else {
      HEAD.lastIndex = bodyStart;
      const inner = HEAD.exec(text);
      if (inner && inner.index < endobj) { HEAD.lastIndex = inner.index; continue; }
    }
    end += 6;
    const dict = text.slice(bodyStart, Math.min(end, bodyStart + 400));
    if (!/[/]Type\s*[/]XRef\b/.test(dict)) objs.set(num, { gen, bodyStart, end });
    HEAD.lastIndex = end;
  }
  const lastRef = re => { let r = null; for (const x of text.matchAll(re)) if (objs.has(+x[1])) r = x[1] + ' ' + x[2] + ' R'; return r; };
  let root = lastRef(/[/]Root\s+(\d+)\s+(\d+)\s+R/g);
  if (!root) {
    for (const [num, o] of objs) {
      if (/[/]Type\s*[/]Catalog\b/.test(text.slice(o.bodyStart, Math.min(o.end, o.bodyStart + 400)))) root = num + ' ' + o.gen + ' R';
    }
  }
  if (!root) throw new Error('No document catalog');
  const info = lastRef(/[/]Info\s+(\d+)\s+(\d+)\s+R/g);
  const enc = s => Uint8Array.from(s, c => c.charCodeAt(0));
  const chunks = [enc('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n')];
  let pos = chunks[0].length;
  const where = new Map();
  const nums = [...objs.keys()].sort((a, b) => a - b);
  for (const num of nums) {
    const o = objs.get(num);
    where.set(num, [pos, o.gen]);
    const head = enc(num + ' ' + o.gen + ' obj'), body = bytes.subarray(o.bodyStart, o.end), nl = enc('\n');
    chunks.push(head, body, nl);
    pos += head.length + body.length + nl.length;
  }
  const size = (nums.length ? nums[nums.length - 1] : 0) + 1;
  let xref = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
  for (let n = 1; n < size; n++) {
    const w = where.get(n);
    xref += w ? String(w[0]).padStart(10, '0') + ' ' + String(w[1]).padStart(5, '0') + ' n \n' : '0000000000 65535 f \n';
  }
  xref += 'trailer\n<< /Size ' + size + ' /Root ' + root + (info ? ' /Info ' + info : '') + ' >>\nstartxref\n' + pos + '\n%%EOF\n';
  chunks.push(enc(xref));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
const cleanName = name => name.replace(/\s*\.pdf$/i, '') + ' (clean).pdf';


// "Share to...": the PDF as is, or a clean copy, from the button (anchor)
// in the reader or the details. The share sheet only opens straight after
// a click, so if getting the PDF from Drive or making the copy takes a
// while, a bar fills along the button's foot, and then "ready" appears
// under it, to click; quicker, the share sheet opens at once. A download
// is saved as soon as it's ready. The last clean copy is kept, for the same
// PDF. (mail: the citation to go with it; see openIn.)
const mailOf = e => ({ subject: String(e.f.title || e.k).replace(/[{}]/g, ''), text: apaCitation(e).text });
const CLEAN = { src: null, made: null };
function shareProgress(anchor) {
  if (!anchor || !anchor.getBoundingClientRect().width) return { set() {}, creep() {}, done() {}, none: true };
  anchor.classList.add('share-busy');
  const bar = document.createElement('span');
  bar.className = 'share-prog';
  anchor.appendChild(bar);
  let w = 0, timer = 0;
  const put = f => { w = Math.max(w, Math.min(1, f)); bar.style.width = (w * 100) + '%'; };
  return {
    set: put,
    // (Making a clean copy can't be measured: the bar creeps on, and fills
    // when it's done.)
    creep() { clearInterval(timer); timer = setInterval(() => put(w + (0.92 - w) * 0.08), 150); },
    done() { clearInterval(timer); put(1); setTimeout(() => { bar.remove(); anchor.classList.remove('share-busy'); }, 250); },
  };
}
function showReady(note, name, label, go, anchor) {
  const bar = $('#readyBar'), r = anchor && anchor.getBoundingClientRect();
  bar.querySelector('span').innerHTML = `<b>${esc(note)}</b> \u00b7 ${esc(name)}`;
  const b = bar.querySelector('#readyGo');
  b.lastChild.textContent = label;
  b.onclick = () => { bar.hidden = true; go(); };
  // (Under the button, pointing to it; or, with none in sight, at the foot.)
  const pop = r && r.width > 0;
  bar.classList.toggle('ready-pop', !!pop);
  Object.assign(bar.style, pop ? { top: (r.bottom + 10) + 'px', right: Math.max(8, innerWidth - r.right - 8) + 'px', bottom: 'auto', left: 'auto' } : { top: '', right: '', bottom: '', left: '' });
  if (pop) bar.style.setProperty('--arrow', Math.max(10, r.width / 2 + 3) + 'px');
  bar.hidden = false;
  b.focus();
}
async function prepareShare(file, clean, mail, anchor) {
  if (!clean && recentPdfs.has(file.id)) { openIn(recentPdfs.get(file.id), file.n, null, null, mail); return; }
  const t0 = performance.now(), prog = shareProgress(anchor);
  if (prog.none) toast(recentPdfs.has(file.id) ? 'Making a clean copy…' : 'Getting the PDF from Google Drive…', 0);
  try {
    let bytes = await getPdfBytes(file, f => prog.set(clean ? f * 0.5 : f)), name = file.n, note = '';
    if (clean) {
      if (CLEAN.src !== bytes) {
        if (prog.none) toast('Making a clean copy…', 0);
        prog.creep();
        CLEAN.made = await cleanPdf(bytes);
        CLEAN.src = bytes;
      }
      bytes = CLEAN.made.bytes;
      name = cleanName(file.n);
      note = CLEAN.made.removed ? 'Clean copy ready' : 'No annotations to remove';
    }
    prog.done();
    if (prog.none) toast('', 1);
    // (Downloading needs no click of its own, as the share sheet does.)
    if (mail === 'download') { openIn(bytes, name, null, null, 'download'); return; }
    const ready = () => showReady(note || 'Ready', name, 'Share', () => openIn(bytes, name, null, null, mail), anchor);
    // (Soon enough after the click: the share sheet at once; if the
    // browser says it's too late after all, "ready".)
    if (performance.now() - t0 < (window.LIBLANDE_SHARE_WAIT == null ? 800 : window.LIBLANDE_SHARE_WAIT)) openIn(bytes, name, null, null, mail, ready); else ready();
  } catch (err) {
    prog.done();
    toast((clean ? 'Couldn’t make a clean copy: ' : 'Couldn’t get the PDF: ') + errText(err), 6000);
  }
}
$('#readyClose').addEventListener('click', () => { $('#readyBar').hidden = true; });
