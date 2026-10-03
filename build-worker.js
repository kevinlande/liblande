/*
 * LibLande on GitHub Pages: reading the .bib off the page's thread, so the
 * page doesn't freeze while a large library is parsed. build.js is
 * Build.gs, the same parser Apps Script uses.
 */
importScripts('build.js');
const b64ToBytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
self.onmessage = ev => {
  try {
    const results = ev.data.jobs.map(j => buildLibrary_(j.text, j.ids, Object.assign({ base64Decode: b64ToBytes }, j.opts)));
    self.postMessage({ results });
  } catch (e) {
    self.postMessage({ error: (e && e.message) || String(e) });
  }
};
