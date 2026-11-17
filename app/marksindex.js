// LibLande: the PDFs' highlights and notes, indexed, for the library's search in "Notes & highlights".
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, related, marksindex, citecard, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/marksindex.js'] = '2026-11-17.04';
/* ------------------------------------------------------------ the index */
// Each PDF's highlights (their words, page and note), read from the PDF
// once and kept in LibLande/marks.json in Drive, so every device can
// search them. It's built on a Mac, in the background, a PDF at a time
// (not while a paper is open in the reader), and saved every so often, so
// it can stop and go on later. After that, Drive's list of changes says
// which PDFs changed since (in LibLande or elsewhere), and those are read
// again. A phone or iPad searches it but doesn't build it.
const MX = { data: null, loading: null, ver: 0, running: false, pending: {}, gone: [], lastPut: 0 };
const mxCan = () => !!(window.LIBLANDE_PAGES && !window.LIBLANDE_TEST && gs && /Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2);
const mxSleep = ms => new Promise(r => setTimeout(r, ms));
function mxLoad() {
  if (MX.data && !MX.running && Date.now() - MX.loadedAt > 30 * 60 * 1000) { MX.data = null; MX.loading = null; }
  if (MX.data) return Promise.resolve(MX.data);
  if (!MX.loading) {
    MX.loading = Promise.resolve().then(() => callServer('getMarksIndex')).then(d => d, () => null)
      .then(d => { MX.data = d && d.files ? d : { v: 1, files: {} }; MX.loadedAt = Date.now(); MX.ver++; return MX.data; });
  }
  return MX.loading;
}
// (Every PDF that can be read: by its id, with its publication.)
function mxPdfs() {
  const out = new Map();
  ENTRIES.forEach(e => readablePdfs(e).forEach(f => { if (!out.has(f.id)) out.set(f.id, { e, f }); }));
  return out;
}
// (Downloaded here, not kept with the reader's recent papers.)
async function mxBytes(fl) {
  const r = await googleFetch('https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(fl.id) + '?alt=media', {}, 180 * 1000);
  if (!r.ok) { const err = new Error('Drive said ' + r.status); err.status = r.status; throw err; }
  return new Uint8Array(await r.arrayBuffer());
}
// (Too big to read in the background, over 60 MB, as a scanned book: left
// out, marked so.) A PDF that can't be opened is marked too; any other
// trouble (Drive busy, the sign-in lapsed, the network) is thrown, and the
// run stops, to go on later.
async function mxRead(x) {
  const m = await googleFetch('https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(x.f.id) + '?fields=size', {}, 30 * 1000);
  if (m.status === 404) return { k: x.e.k, at: Date.now(), h: [], bad: 1 };
  if (!m.ok) { const err = new Error('Drive said ' + m.status); err.status = m.status; throw err; }
  if (+(await m.json()).size > 60e6) return { k: x.e.k, at: Date.now(), h: [], big: 1 };
  const bytes = await mxBytes(x.f), lib = await loadPdfJs();
  let doc;
  try { doc = await openPdf(lib, { data: bytes }).promise; } catch (err) { return { k: x.e.k, at: Date.now(), h: [], bad: 1 }; }
  try {
    const marks = ((await collectMarks(doc, null)) || []).filter(m => m.text || m.note);
    return { k: x.e.k, at: Date.now(), h: marks.map(m => [m.page, String(m.text || '').slice(0, 800), String(m.note || '').slice(0, 800)]) };
  } finally { closePdf(doc); }
}
async function mxSave() {
  const files = MX.pending, gone = MX.gone;
  if (!Object.keys(files).length && !gone.length) return;
  MX.pending = {}; MX.gone = []; MX.lastPut = Date.now();
  try { await callServer('putMarksIndex', { files, gone }); }
  catch (err) { Object.assign(MX.pending, files); MX.gone.push(...gone); }
}
// PDFs changed since the last time (Drive's changes): read again.
async function mxChanges(d) {
  const api = 'https:\/\/www.googleapis.com/drive/v3/changes';
  try {
    d.token = d.token || store.get('mxToken', null);
    if (!d.token) {
      const r = await googleFetch(api + '/startPageToken');
      if (r.ok) { d.token = (await r.json()).startPageToken; store.set('mxToken', d.token); }
      return;
    }
    let tok = d.token;
    for (let i = 0; i < 100 && tok; i++) {
      const r = await googleFetch(api + '?pageSize=1000&fields=nextPageToken,newStartPageToken,changes(fileId)&pageToken=' + encodeURIComponent(tok));
      if (!r.ok) return;
      const j = await r.json();
      (j.changes || []).forEach(c => { if (d.files[c.fileId]) { delete d.files[c.fileId]; MX.gone.push({ id: c.fileId, at: Date.now() }); } });
      if (j.newStartPageToken) { d.token = j.newStartPageToken; store.set('mxToken', d.token); break; }
      tok = j.nextPageToken;
    }
    if (MX.gone.length) MX.ver++;
  } catch (err) { /* next time */ }
}
async function mxRun() {
  if (MX.running || !mxCan() || !ENTRIES.length) return;
  MX.running = true;
  try {
    const d = await mxLoad();
    await mxChanges(d);
    const all = mxPdfs();
    for (const [id, x] of all) {
      if (d.files[id]) continue;
      // (Not while a paper is being read, nor offline: later.)
      while ((!$('#viewer').hidden || !navigator.onLine) && MX.running) await mxSleep(20000);
      if (!ENTRIES.length) break;
      try { d.files[id] = MX.pending[id] = await mxRead(x); }
      catch (err) { break; }
      MX.ver++;
      mxShowStatus();
      if (Object.keys(MX.pending).length >= 40 || Date.now() - MX.lastPut > 3 * 60 * 1000) { await mxSave(); if (state.scope === 'notes' && state.q) refresh(false); }
      await mxSleep(300);
    }
    await mxSave();
  } finally { MX.running = false; mxShowStatus(); }
}
// (Begun a minute after the library opens, and looked at again every half hour.)
setTimeout(function mxTick() { if (ENTRIES.length) mxRun(); setTimeout(mxTick, 30 * 60 * 1000); }, 60 * 1000);

/* ------------------------------------------------------------ searching it */
// A publication's notes and its PDFs' highlights, as searched.
function mxNotesText(e) {
  if (e._mxv === MX.ver) return e._mx;
  const files = (MX.data && MX.data.files) || {};
  const marks = readablePdfs(e).map(f => files[f.id]).filter(Boolean).flatMap(r => r.h.map(h => h[1] + ' ' + h[2]));
  e._mxv = MX.ver;
  e._mx = norm([notesOf(e)].concat(marks).join(' | '));
  return e._mx;
}
// Where the words were found: the highlight (with its page) or the notes.
function mxSnip(e, q) {
  const word = String(q || '').replace(/["\u201c\u201d]/g, ' ').trim().split(/\s+/).find(w => w.length > 1 && !/:/.test(w)) || '';
  if (!word) return '';
  const files = (MX.data && MX.data.files) || {};
  for (const f of readablePdfs(e)) {
    for (const h of ((files[f.id] || {}).h || [])) {
      for (const t of [h[1], h[2]]) {
        const i = srchHits(t, word, 1)[0];
        if (i != null) return `<span class="snip-l">p. ${esc(String(h[0]))}</span>${srchSnip(t, i, word.length, 30)}`;
      }
    }
  }
  const n = notesOf(e).replace(/[*#>_`]/g, ''), i = srchHits(n, word, 1)[0];
  return i != null ? `<span class="snip-l">Notes</span>${srchSnip(n, i, word.length, 30)}` : '';
}
// The list's foot, while "Notes & highlights" is chosen: how far the index is.
function mxStatus() {
  if (!MX.data) return 'Reading the index\u2026';
  const all = mxPdfs(), have = [...all.keys()].filter(id => MX.data.files[id]).length;
  if (!all.size) return '';
  if (have >= all.size) return 'Searching notes and highlights in ' + all.size.toLocaleString() + ' PDFs';
  const of = 'Highlights in ' + have.toLocaleString() + ' of ' + all.size.toLocaleString() + ' PDFs';
  if (!mxCan()) return of + ': LibLande reads them while it\u2019s open on a Mac';
  return of + (!MX.running ? ' \u00b7 more soon' : !$('#viewer').hidden ? ' \u00b7 paused while a paper is open' : ' \u00b7 reading the rest\u2026');
}
function mxShowStatus() { if (state.scope === 'notes' && $('#statusR')) $('#statusR').textContent = mxStatus(); }
