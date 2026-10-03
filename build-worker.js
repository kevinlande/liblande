/*
 * LibLande on GitHub Pages: reading the .bib off the page's thread, so the
 * page doesn't freeze while a large library is parsed and gzipped.
 * build.js is Build.gs, the same parser Apps Script uses; builder.js has
 * the steps (liblandeAssemble).
 */
importScripts('build.js', 'builder.js');
self.onmessage = async ev => {
  try {
    const result = await self.liblandeAssemble(ev.data.job);
    self.postMessage({ result }, result.gz ? [result.gz.buffer] : []);
  } catch (e) {
    self.postMessage({ error: (e && e.message) || String(e) });
  }
};
