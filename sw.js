/*
 * LibLande on GitHub Pages: what lets it open, and open papers, offline.
 * (build.py fills in VERSION and VENDOR_FILES.)
 *
 * - The app (index.html, server.js, the icon): from the internet when it
 *   answers within a few seconds, so updates arrive; otherwise the copy
 *   kept here.
 * - The libraries (PDF.js with its stylesheet and icons, pdf-lib, JSZip),
 *   served from the site's own vendor/ folder: all kept here at install
 *   (their addresses change with their versions). The fonts and Google's
 *   sign-in script: kept here once fetched.
 * - Papers: each one opened is kept here (the 60 most recent), with its
 *   checksum, and used when Google Drive can't be reached. A paper saved
 *   with marks replaces the copy kept here, so it opens with them.
 *   (The library itself is kept by the page, in IndexedDB.)
 */
const VERSION = '2026-10-02.02';
const VENDOR_FILES = ["vendor/jszip/3.10.2/jszip.min.js", "vendor/pdf-lib/1.17.1/pdf-lib.min.js", "vendor/pdf.js/5.4.149/images/altText_add.svg", "vendor/pdf.js/5.4.149/images/altText_disclaimer.svg", "vendor/pdf.js/5.4.149/images/altText_done.svg", "vendor/pdf.js/5.4.149/images/altText_spinner.svg", "vendor/pdf.js/5.4.149/images/altText_warning.svg", "vendor/pdf.js/5.4.149/images/annotation-check.svg", "vendor/pdf.js/5.4.149/images/annotation-comment.svg", "vendor/pdf.js/5.4.149/images/annotation-help.svg", "vendor/pdf.js/5.4.149/images/annotation-insert.svg", "vendor/pdf.js/5.4.149/images/annotation-key.svg", "vendor/pdf.js/5.4.149/images/annotation-newparagraph.svg", "vendor/pdf.js/5.4.149/images/annotation-noicon.svg", "vendor/pdf.js/5.4.149/images/annotation-note.svg", "vendor/pdf.js/5.4.149/images/annotation-paperclip.svg", "vendor/pdf.js/5.4.149/images/annotation-paragraph.svg", "vendor/pdf.js/5.4.149/images/annotation-pushpin.svg", "vendor/pdf.js/5.4.149/images/comment-actionsButton.svg", "vendor/pdf.js/5.4.149/images/comment-closeButton.svg", "vendor/pdf.js/5.4.149/images/comment-editButton.svg", "vendor/pdf.js/5.4.149/images/cursor-editorFreeHighlight.svg", "vendor/pdf.js/5.4.149/images/cursor-editorFreeText.svg", "vendor/pdf.js/5.4.149/images/cursor-editorInk.svg", "vendor/pdf.js/5.4.149/images/cursor-editorTextHighlight.svg", "vendor/pdf.js/5.4.149/images/editor-toolbar-delete.svg", "vendor/pdf.js/5.4.149/images/editor-toolbar-edit.svg", "vendor/pdf.js/5.4.149/images/loading-icon.gif", "vendor/pdf.js/5.4.149/images/messageBar_closingButton.svg", "vendor/pdf.js/5.4.149/images/messageBar_info.svg", "vendor/pdf.js/5.4.149/images/messageBar_warning.svg", "vendor/pdf.js/5.4.149/images/toolbarButton-editorHighlight.svg", "vendor/pdf.js/5.4.149/images/toolbarButton-menuArrow.svg", "vendor/pdf.js/5.4.149/pdf.min.mjs", "vendor/pdf.js/5.4.149/pdf.worker.min.mjs", "vendor/pdf.js/5.4.149/pdf_viewer.css", "vendor/pdf.js/5.4.149/pdf_viewer.mjs"];
const VENDOR = new URL('vendor/', self.location).href;
const APP = 'liblande-app-' + VERSION, LIBS = 'liblande-libs-2', PAPERS = 'liblande-papers';
const KEEP_PAPERS = 60;
const SHELL = ['./', 'server.js', 'icon.png'];
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files/';

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const app = await caches.open(APP);
    await app.addAll(SHELL);
    // The libraries now, so the first paper opened offline works; one that
    // fails is fetched when it's first needed instead.
    const libs = await caches.open(LIBS);
    await Promise.all(VENDOR_FILES.map(async u => { if (!(await libs.match(u))) await libs.add(u).catch(() => {}); }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith('liblande-app-') && k !== APP) || k === 'liblande-libs') await caches.delete(k);
    await self.clients.claim();
  })());
});

// A paper's two cache keys: its bytes and its checksum.
const paperId = url => { const m = url.match(/\/files\/([^/?]+)/); return m ? decodeURIComponent(m[1]) : null; };
const bytesKey = id => DRIVE + encodeURIComponent(id) + '?alt=media';
const md5Key = id => DRIVE + encodeURIComponent(id) + '?fields=md5Checksum';

async function keepPaper(id, bytesRes, md5) {
  const c = await caches.open(PAPERS);
  await c.delete(bytesKey(id));   // (re-added last: the most recent)
  await c.put(bytesKey(id), bytesRes);
  if (md5 != null) await c.put(md5Key(id), new Response(JSON.stringify({ md5Checksum: md5 }), { headers: { 'Content-Type': 'application/json' } }));
  const kept = (await c.keys()).filter(r => r.url.endsWith('?alt=media'));
  for (const r of kept.slice(0, Math.max(0, kept.length - KEEP_PAPERS))) {
    await c.delete(r);
    const old = paperId(r.url);
    if (old) await c.delete(md5Key(old));
  }
}

self.addEventListener('fetch', ev => {
  const req = ev.request, url = req.url;
  // Papers and their checksums: the internet first, the copy kept here if
  // it can't be reached.
  if (req.method === 'GET' && url.startsWith(DRIVE)) {
    const u = new URL(url), id = paperId(url);
    const media = u.searchParams.get('alt') === 'media', md5 = u.searchParams.get('fields') === 'md5Checksum';
    if (!id || !(media || md5)) return;
    ev.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const c = await caches.open(PAPERS);
          if (media) ev.waitUntil(keepPaper(id, res.clone(), null));
          else ev.waitUntil(c.put(md5Key(id), res.clone()));
        }
        return res;
      } catch (err) {
        const kept = await caches.match(media ? bytesKey(id) : md5Key(id), { cacheName: PAPERS });
        if (kept) return kept;
        throw err;
      }
    })());
    return;
  }
  // A paper saved (marks, or Combine): what was sent is what's kept now.
  if (req.method === 'PATCH' && url.startsWith(UPLOAD)) {
    const id = paperId(url);
    if (!id) return;
    ev.respondWith((async () => {
      const body = await req.clone().arrayBuffer();
      // (Offline: a plain network error, which the page knows to keep the
      // changes on the device for.)
      let res;
      try { res = await fetch(req); } catch (e) { return Response.error(); }
      if (res.ok) {
        const info = await res.clone().json().catch(() => ({}));
        ev.waitUntil(keepPaper(id, new Response(body, { headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(body.byteLength) } }),
          info.md5Checksum || null));
      }
      return res;
    })());
    return;
  }
  if (req.method !== 'GET') return;
  const u = new URL(url);
  // The libraries: the copy kept here (a new version has a new address).
  if (url.startsWith(VENDOR)) {
    ev.respondWith((async () => {
      const c = await caches.open(LIBS);
      const kept = await c.match(req, { ignoreSearch: true });
      if (kept) return kept;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    })());
    return;
  }
  // The app itself: the internet if it answers in 3 seconds, else the copy.
  if (u.origin === self.location.origin) {
    ev.respondWith((async () => {
      const app = await caches.open(APP);
      const key = req.mode === 'navigate' ? './' : req;
      const net = fetch(req).then(res => {
        if (res.ok && (req.mode === 'navigate' || SHELL.some(s => u.pathname.endsWith('/' + s)))) app.put(key, res.clone());
        return res;
      });
      const kept = await app.match(key, { ignoreSearch: true });
      if (!kept) return net;
      const late = new Promise(r => setTimeout(() => r(null), 3000));
      try { return (await Promise.race([net, late])) || kept; } catch (e) { return kept; }
    })());
    return;
  }
  // The fonts, Google's sign-in script: kept once fetched.
  const lib = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  const gis = url.startsWith('https://accounts.google.com/gsi/client');
  if (lib || gis) {
    ev.respondWith((async () => {
      const c = await caches.open(LIBS);
      const kept = await c.match(req);
      if (kept && lib) return kept;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      } catch (e) {
        if (kept) return kept;
        throw e;
      }
    })());
  }
});
