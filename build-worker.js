/*
 * LibLande on GitHub Pages: the heavy work on the .bib, off the page's
 * thread, so the page doesn't freeze. build.js is Build.gs, the same
 * parser Apps Script uses; builder.js has the library's build
 * (liblandeAssemble); edits.js the work on the .bib's text for a change
 * (liblandeEditCore).
 *
 * {job}: build the library. {id, call, args}: a function of edits.js's.
 */
importScripts('build.js', 'builder.js', 'edits.js');
self.onmessage = async ev => {
  const d = ev.data;
  if (d.call) {
    try {
      self.postMessage({ id: d.id, result: self.liblandeEditCore[d.call](...d.args) });
    } catch (e) {
      self.postMessage({ id: d.id, error: (e && e.message) || String(e) });
    }
    return;
  }
  try {
    const result = await self.liblandeAssemble(d.job);
    self.postMessage({ result }, result.gz ? [result.gz.buffer] : []);
  } catch (e) {
    self.postMessage({ error: (e && e.message) || String(e) });
  }
};
