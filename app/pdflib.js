// LibLande: pdf-lib: loading it, clean copies without marks, and rebuilding a damaged PDF.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/pdflib.js'] = '2026-11-09.13';
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
