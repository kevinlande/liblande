// LibLande: saving the marks: to Google Drive (checked first), kept on this device between uploads, and auto-save.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/save.js'] = '2026-11-09.09';
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
      V.md5 = await uploadMarked(file, bytes, doc.numPages);
      V.bytes = bytes;
      recentPdfs.delete(file.id); recentPdfs.set(file.id, bytes); trimRecentPdfs();
      if (V.md5) recentMd5.set(file.id, V.md5); else recentMd5.delete(file.id);
      THUMBS.delete(file.id);
      // (Its highlights, read again for the Notes view: see notes.js.)
      NOTES.marks.delete(file.id);
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
      // Nothing left unsaved: the clock is cleared. (Putting the marks
      // back on the pages after the upload counts as changes to PDF.js,
      // which started it again.)
      if (doc === V.doc && !(V.dirty || V.bmDirty || V.drawing)) { clearTimeout(AUTO.timer); AUTO.first = AUTO.last = 0; }
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
// Upload a changed PDF in place of the one on Drive, once it's checked:
// a whole PDF (it starts and ends as one should), and with pages pages
// when that's given. One that isn't is never sent.
async function uploadMarked(file, bytes, pages) {
  await checkPdf(bytes, pages);
  // (A big file on a slow connection takes a while: at least 5 minutes,
  // more at about 40 KB a second.)
  const within = Math.max(5 * 60 * 1000, bytes.byteLength / 40);
  let r;
  try {
    r = await googleFetch('https:\/\/www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=md5Checksum',
      { method: 'PATCH', headers: { 'Content-Type': 'application/pdf' }, body: bytes }, within);
  } catch (err) {
    // (Given up on, the upload may still have arrived: if Drive's file is
    // now exactly this size, it did, and its checksum is the new one;
    // otherwise the next save would take it for a change made elsewhere.)
    if (err.noAnswer) {
      const now = await googleFetch('https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?fields=md5Checksum,size', {}, 45 * 1000)
        .then(x => (x.ok ? x.json() : null)).catch(() => null);
      if (now && now.md5Checksum && Number(now.size) === bytes.byteLength) return now.md5Checksum;
    }
    throw err;
  }
  if (!r.ok) throw new Error('Google Drive didn\u2019t accept the changes (error ' + r.status + ').');
  return (await r.json().catch(() => ({}))).md5Checksum || null;
}
async function checkPdf(bytes, pages) {
  if (bytes && !(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes.buffer || bytes);
  const bad = 'the saved copy of the PDF didn\u2019t come out whole, so it wasn\u2019t sent to Google Drive (the copy there is unchanged)';
  const n = bytes && bytes.byteLength;
  if (!n || n < 64) throw new Error(bad);
  const latin = (a, b) => new TextDecoder('latin1').decode(bytes.subarray(a, b));
  if (latin(0, Math.min(n, 1024)).indexOf('%PDF-') < 0 || latin(Math.max(0, n - 2048), n).indexOf('%%EOF') < 0) throw new Error(bad);
  if (!pages) return;
  let doc = null, count = 0;
  try { doc = await openPdf(V.lib, { data: bytes.slice(0) }).promise; count = doc.numPages; } catch (err) { count = 0; } finally { if (doc) await closePdf(doc).catch(() => {}); }
  if (count !== pages) throw new Error(bad + ' (it had ' + count + ' page' + (count === 1 ? '' : 's') + ', not ' + pages + ')');
}
// The open paper changed as a whole (pages turned, or OCR's text added):
// any marks not yet saved are saved first, edit(bytes) makes the new PDF
// from the one on Drive, which is uploaded (if it's still the one on
// Drive), and the paper is opened again where you are (or, if it's open
// behind the library, when you go back to it).
// (opts.page: the page to open it at, as when pages were added;
// opts.samePages: the edit keeps the page count, which is checked.)
async function rewritePdf(file, edit, opts = {}) {
  const showing = () => V.file && V.file.id === file.id && V.doc;
  if (!showing()) throw new Error('the paper isn\u2019t open.');
  if (V.dirty || V.bmDirty || V.drawing) {
    const r = await saveMarkup(false, false, true);
    if (r !== true) throw new Error('your marks couldn\u2019t be saved first' + (r === 'kept' ? ' (you\u2019re offline)' : '') + '.');
  }
  if (!showing()) throw new Error('the paper was closed.');
  const md5 = V.md5, pages = opts.samePages ? V.doc.numPages : 0, out = await edit(V.bytes);
  const now = await pdfMd5(file).catch(() => null);
  if (md5 && now && now !== md5) throw new Error('the PDF changed on Google Drive meanwhile.');
  await callServer('backupPdf', file.id);
  const newMd5 = await uploadMarked(file, out, pages);
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
    }, { samePages: true });
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
    const tmp = await openPdf(V.lib, { data: newer.slice(0) }).promise, tmpPages = tmp.numPages;
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
    const newMd5 = await uploadMarked(file, out, tmpPages);
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
// uploaded (for a big PDF, five and fifteen: see AUTO_BIG) (and at once when you switch to another app or tab, or leave
// the paper), but not while you're in the middle of a stroke, the comment
// box or typing. Only changes count: reading and scrolling don't put it off. (Each upload rebuilds the whole PDF and sends it, which costs
// battery; meanwhile they're kept on this device, see JOURNAL.) If the PDF changed
// elsewhere, LibLande asks first and waits.
const AUTO = { timer: 0, down: false, paused: false, failed: false, backedUp: '', first: 0, last: 0 };
const AUTO_QUIET = 2 * 60 * 1000, AUTO_MOST = 5 * 60 * 1000;
// A big PDF (a scanned book, say) is sent whole each time, which is slow
// and heavy on a phone's data: five minutes after the last change, and at
// most fifteen after the first, instead. (Kept on this device meanwhile;
// leaving the paper or the app still saves at once.)
const AUTO_BIG = 10 * 1024 * 1024, AUTO_BIG_QUIET = 5 * 60 * 1000, AUTO_BIG_MOST = 15 * 60 * 1000;
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
  const big = V.bytes && V.bytes.byteLength > AUTO_BIG;
  if (wait == null) wait = Math.max(0, Math.min(AUTO.last + (big ? AUTO_BIG_QUIET : AUTO_QUIET), AUTO.first + (big ? AUTO_BIG_MOST : AUTO_MOST)) - t);
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
