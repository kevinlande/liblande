// LibLande: Notes: a publication's notes (the .bib's Notes field, written as Markdown) and its PDF's highlights and notes, in the details pane's Notes view and a large pop-out editor, both formatted as you type.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/notes.js'] = '2026-11-10.02';
/* ------------------------------------------------------------ notes */
// The details pane shows Details or Notes (a switch at its top, or Alt-N;
// the choice kept). Notes has your notes, in a box you type in, formatted
// as you type (headings, bold, italics, lists, quotations, links), kept in
// the .bib's Notes field as Markdown, which BibDesk shows as plain text;
// and the PDF's highlights and notes, page by page (read from the PDF in
// Drive, as Copy for AI does, and kept until the reader saves it again).
// Pop out (Alt-Shift-N) opens the notes large, with formatting buttons,
// Cite (another publication's in-text citation) and the highlights to
// insert as quotations.
const NOTES = { view: store.get('detailView', 'details'), h: store.get('notesH', 260), marks: new Map(), loading: new Map(),
  colour: null, saving: Promise.resolve(), pop: null };
// (A sticky note: Notes' own, not the pencil, which is Edit's.)
const NOTE_ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/><path d="M8.5 9h7M8.5 12.5h4"/></svg>';
// Undo and Redo, in the notes' toolbars (as the markup toolbar's).
const UNDO_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
const REDO_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>';
const POP_ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

/* ---- Markdown, the little of it notes need */
// (mdInline and PG_TAG: moved to marks.js.)
// The tags made in what's been typed (outside those there, and links).
function nvTagPages(el) {
  const sel = getSelection(), live = sel.rangeCount && el.contains(sel.anchorNode) ? nvOffset(el, sel.getRangeAt(0)) : -1;
  const kept = RN.ed === el && RN.range && el.contains(RN.range.startContainer) ? nvOffset(el, RN.range) : -1;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode.closest('.pl, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) { PG_TAG.lastIndex = 0; if (PG_TAG.test(n.data)) nodes.push(n); }
  nodes.forEach(n => {
    const frag = document.createDocumentFragment();
    let at = 0, m;
    PG_TAG.lastIndex = 0;
    while ((m = PG_TAG.exec(n.data))) {
      const start = m.index + m[1].length;
      frag.append(n.data.slice(at, start));
      const t = document.createElement('span');
      t.className = 'pl';
      t.dataset.pg = m[3];
      t.textContent = m[2];
      frag.append(t);
      at = start + m[2].length;
    }
    frag.append(n.data.slice(at));
    n.replaceWith(frag);
  });
  if (!nodes.length) return;
  if (live >= 0) { sel.removeAllRanges(); sel.addRange(nvAtOffset(el, live)); }
  if (kept >= 0) RN.range = nvAtOffset(el, kept);
}
// A place in the editor as a count of the letters before it, and back.
function nvOffset(el, range) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(range.startContainer, range.startOffset);
  return r.toString().length;
}
function nvAtOffset(el, n) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), r = document.createRange();
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (n <= t.data.length) { r.setStart(t, n); r.collapse(true); return r; }
    n -= t.data.length;
  }
  r.selectNodeContents(el); r.collapse(false);
  return r;
}
// (mdToHtml: moved to marks.js.)
// What the editor holds, as Markdown again.
function htmlToMd(root) {
  const mark = (s, m) => { const x = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return x[2] ? x[1] + m + x[2] + m + x[3] : s; };
  const inlList = list => list.map(c => {
    if (c.nodeType === 3) return c.data.replace(/\u00a0/g, ' ');
    if (c.nodeType !== 1) return '';
    const t = c.nodeName, inner = inl(c), st = c.style || {};
    if (t === 'BR') return '\n';
    if (t === 'B' || t === 'STRONG' || /bold|[6-9]00/.test(st.fontWeight || '')) return mark(inner, '**');
    if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') return mark(inner, '*');
    if (t === 'A' && safeUrl(c.getAttribute('href') || '')) return '[' + inner + '](' + c.getAttribute('href') + ')';
    if (/^(DIV|P|H\d|LI|UL|OL|BLOCKQUOTE)$/.test(t)) return '\n' + inner + '\n';
    return inner;
  }).join('');
  const inl = n => inlList([...n.childNodes]);
  const tidy = s => s.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
  const blocks = [];
  // (Words and inline marks side by side, outside a paragraph, as a
  // quotation's "(p. 331)" with its tag: one block, not one each.)
  const BLOCK = /^(H\d|UL|OL|BLOCKQUOTE|DIV|P)$/;
  let run = [];
  const flush = () => { const s = tidy(inlList(run)); if (s) blocks.push(s); run = []; };
  const walk = parent => { [...parent.childNodes].forEach(n => {
    if (n.nodeType === 3 || (n.nodeType === 1 && !BLOCK.test(n.nodeName))) { run.push(n); return; }
    if (n.nodeType !== 1) return;
    flush();
    const t = n.nodeName;
    if (/^H\d$/.test(t)) { const s = tidy(inl(n)); if (s) blocks.push((t === 'H1' || t === 'H2' || t === 'H3' ? '# ' : '## ') + s.replace(/\n/g, ' ')); }
    else if (t === 'UL' || t === 'OL') {
      let i = 0;
      const items = [...n.querySelectorAll('li')].map(li => tidy(inl(li)).replace(/\n/g, ' ')).filter(Boolean);
      if (items.length) blocks.push(items.map(x => (t === 'OL' ? ++i + '. ' : '- ') + x).join('\n'));
    }
    else if (t === 'BLOCKQUOTE') { const s = htmlToMd(n); if (s) blocks.push(s.split('\n').map(l => '> ' + l).join('\n')); }
    else if ((t === 'DIV' || t === 'P') && n.querySelector('ul,ol,blockquote,h1,h2,h3,h4,p,div')) walk(n);
    else { const s = tidy(inl(n)); if (s) blocks.push(s); }
  }); flush(); };
  walk(root);
  return blocks.join('\n\n').trim();
}

/* ---- the editor: formatted as you type */
// Bold and italic (Cmd/Ctrl-B, -I), and, at the start of a line, "- " or
// "* " for a list, "1. " for a numbered one, "# " for a heading and "> "
// for a quotation, as in Markdown. Pasted text comes in plain.
function nvExec(cmd, arg) {
  try { document.execCommand('styleWithCSS', false, false); document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (err) { /* (older) */ }
  document.execCommand(cmd, false, arg);
}
function nvBlock(el) {
  const s = getSelection();
  if (!s.rangeCount) return null;
  let n = s.anchorNode;
  if (n && n.nodeType === 3) n = n.parentNode;
  const b = n && n.closest && n.closest('p,div,h3,h4,li,blockquote');
  return b && el.contains(b) && b !== el ? b : null;
}
function nvToggleBlock(el, tag) {
  const b = nvBlock(el), inside = b && (b.closest(tag) || null);
  // (Out of a quotation: outdented, as setting the line to a paragraph
  // leaves it inside one.)
  if (inside && el.contains(inside) && tag === 'blockquote') { nvExec('outdent'); nvExec('formatBlock', '<p>'); }
  else nvExec('formatBlock', inside && el.contains(inside) ? '<p>' : '<' + tag + '>');
}
// A Markdown mark typed at the start of a line ("- ", "* ", "1. ", "# ",
// "> "), at its space: the line made a list, heading or quotation instead.
// (As the space is typed, not after: changed after, the caret lost its
// place in some browsers.)
function nvAutoFormat(el, ev) {
  if (ev.inputType !== 'insertText' || ev.data !== ' ') return;
  let b = nvBlock(el);
  const loose = !b && el.textContent.trim() && getSelection().anchorNode && getSelection().anchorNode.parentNode === el;
  const t = (b ? b.textContent : loose ? getSelection().anchorNode.textContent : '').replace(/\u00a0/g, ' ');
  if (!/^([-*]|1[.)]|#|>)$/.test(t)) return;
  if (b && (!/^(P|DIV)$/.test(b.nodeName) || b.closest('li,blockquote'))) return;
  ev.preventDefault();
  if (!b) { nvExec('formatBlock', '<p>'); b = nvBlock(el); if (!b) return; }
  b.innerHTML = '<br>';
  const r = document.createRange();
  r.setStart(b, 0); r.collapse(true);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  if (t === '-' || t === '*') nvExec('insertUnorderedList');
  else if (/^1/.test(t)) nvExec('insertOrderedList');
  else if (t === '#') nvExec('formatBlock', '<h3>');
  else nvExec('formatBlock', '<blockquote>');
  nvEmpty(el);
  el.dispatchEvent(new Event('input'));
}
function nvEmpty(el) { el.classList.toggle('nv-empty', !el.textContent.trim() && !el.querySelector('li')); }
function noteEditor(el, md, changed) {
  el.contentEditable = gs ? 'true' : 'false';
  el.innerHTML = mdToHtml(md) || '<p><br></p>';
  nvEmpty(el);
  if (!gs) return;
  el.addEventListener('beforeinput', ev => nvAutoFormat(el, ev));
  el.addEventListener('input', ev => {
    nvEmpty(el);
    if (changed) changed();
  });
  el.addEventListener('keydown', ev => {
    const mod = (ev.metaKey || ev.ctrlKey) && !ev.altKey;
    // (Return on an empty line of a quotation or heading: out of it, to a
    // plain paragraph, as Return on an empty list item leaves the list.)
    if (ev.key === 'Enter' && !ev.shiftKey && !mod) {
      const b = nvBlock(el), q = b && b.closest('blockquote');
      if (b && !b.textContent.trim() && ((q && el.contains(q)) || /^H\d$/.test(b.nodeName))) {
        ev.preventDefault();
        if (q) nvExec('outdent');
        nvExec('formatBlock', '<p>');
        ev.stopPropagation();
        return;
      }
    }
    if (mod && /^b$/i.test(ev.key)) { ev.preventDefault(); nvExec('bold'); }
    else if (mod && /^i$/i.test(ev.key)) { ev.preventDefault(); nvExec('italic'); }
    else if (mod && /^k$/i.test(ev.key)) { ev.preventDefault(); nvLink(el); }
    ev.stopPropagation();
  });
  el.addEventListener('paste', ev => {
    ev.preventDefault();
    nvExec('insertText', (ev.clipboardData || window.clipboardData).getData('text/plain'));
  });
  // (A link opened with Cmd/Ctrl-click, as in other editors.)
  el.addEventListener('click', ev => {
    const a = ev.target.closest('a[href]');
    if (a && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
  });
}
// A link, its address typed in a little box at the selection (not the
// browser's prompt, which some don't allow): the words selected become
// the link, or, with none, the address itself. Return adds it; Esc, or a
// click elsewhere, doesn't.
function nvLink(el) {
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0).cloneRange();
  const at = range.getBoundingClientRect(), host = el || range.commonAncestorContainer.parentElement.closest('[contenteditable="true"]');
  if (!host) return;
  document.querySelectorAll('.nv-linkbox').forEach(x => x.remove());
  const box = document.createElement('form');
  box.className = 'nv-linkbox';
  // (Not the browser's own check of the address: "example.org" is taken, with https:// added.)
  box.noValidate = true;
  box.innerHTML = `<input type="text" inputmode="url" autocapitalize="off" placeholder="https:\/\/\u2026" aria-label="The link\u2019s address" autocomplete="off" spellcheck="false"><button type="submit" class="btn primary">Add link</button>`;
  document.body.appendChild(box);
  const r = at.width || at.height ? at : host.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.left)) + 'px';
  box.style.top = Math.min(innerHeight - box.offsetHeight - 8, r.bottom + 6) + 'px';
  const input = box.querySelector('input');
  input.focus();
  const done = add => {
    document.removeEventListener('pointerdown', away, true);
    const u = input.value.trim();
    box.remove();
    host.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(range);
    if (!add || !u) return;
    const url = /^[a-z]+:/i.test(u) ? u : 'https:\/\/' + u;
    if (!safeUrl(url)) { toast('That isn\u2019t a web address.', 3000); return; }
    if (range.collapsed) nvExec('insertHTML', `<a href="${esc(url)}">${esc(u)}</a>&nbsp;`);
    else nvExec('createLink', url);
    host.dispatchEvent(new Event('input'));
  };
  const away = ev => { if (!box.contains(ev.target)) done(false); };
  document.addEventListener('pointerdown', away, true);
  box.addEventListener('submit', ev => { ev.preventDefault(); done(true); });
  input.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); done(false); } });
}

// A quotation of its own, at the caret: on a new line if the caret's line
// has words, and a plain line after it, to go on writing.
function nvQuote(ed, q) {
  const line = nvBlock(ed);
  if (line && line.textContent.trim()) nvExec('insertParagraph');
  nvExec('formatBlock', '<blockquote>');
  nvExec('insertText', q);
  nvExec('insertParagraph');
  nvExec('outdent');
  nvExec('formatBlock', '<p>');
  nvTagPages(ed);
}
const nvMarkQuote = (r, m) => (m.text ? '\u201c' + m.text + '\u201d ' : '') + '(p. ' + nvPage(r, m.page) + ')' + (m.note ? ' \u2014 ' + m.note : '');

// Your notes as you wrote them: the .bib has each & as \& (or BibDesk's
// \{&}), as LaTeX needs, and saving writes it so again (see texSafe in
// pages/edits.js); shown and edited, it's &.
const notesOf = e => rawOf(e, 'annote').replace(/\\\{&\}|\\&/g, '&');

/* ---- saving */
// One save at a time, each from the publication as it is after the last.
// Unbalanced braces ({ }) would break the .bib, so aren't saved.
function notesSave(key, md, quiet) {
  md = String(md || '').trim();
  NOTES.saving = NOTES.saving.then(async () => {
    const e = BYKEY.get(key);
    if (!e || md === notesOf(e).trim()) return true;
    if (!balanced(md)) { toast('Your notes have unbalanced braces { }, so they weren\u2019t saved. Take one out, or add its pair.', 6000); return false; }
    try {
      const done = await writeEdit(e, { annote: md }, [], []);
      if (!quiet) toast(/device/.test(done || '') ? done : 'Saved your notes', 2500);
      return true;
    } catch (err) { toast('Couldn\u2019t save your notes: ' + errText(err), 6000); return false; }
  });
  return NOTES.saving;
}

/* ---- the PDF's highlights and notes */
// Read from the PDF in Drive, once, and kept until the reader saves the
// PDF again (reader.js lets them go then).
function notesMarks(e) {
  const fl = readablePdfs(e)[0];
  if (!fl) return Promise.resolve(null);
  if (NOTES.marks.has(fl.id)) return Promise.resolve(NOTES.marks.get(fl.id));
  if (!NOTES.loading.has(fl.id)) {
    const p = (async () => {
      const doc = await openPdf(await loadPdfJs(), { data: (await getPdfBytes(fl)).slice(0) }).promise;
      try {
        const marks = ((await collectMarks(doc, null)) || []).filter(m => m.text || m.note);
        let labels = null;
        try { labels = await doc.getPageLabels(); } catch (err) { labels = null; }
        const r = { e, fl, marks, labels };
        NOTES.marks.set(fl.id, r);
        return r;
      } finally { closePdf(doc); }
    })();
    p.catch(() => {}).finally(() => NOTES.loading.delete(fl.id));
    NOTES.loading.set(fl.id, p);
  }
  return NOTES.loading.get(fl.id);
}
const nvPage = (r, n) => (r.labels && r.labels[n - 1]) || String(n);
function nvMarksHTML(r, insert) {
  const all = r.marks;
  if (!all.length) return `<p class="nv-none">No highlights or notes in the PDF yet.</p>`;
  const cols = new Map();
  all.forEach(m => { const c = markColour(m); if (c) { const x = cols.get(c.key) || { c, n: 0 }; x.n++; cols.set(c.key, x); } });
  const notes = all.filter(m => m.note).length;
  const on = insert ? null : NOTES.colour;
  const shown = all.filter(m => !on || (on === 'note' ? !!m.note : (markColour(m) || {}).key === on));
  let h = insert ? '' : `<div class="nv-chips"><button type="button" class="nv-chip${on ? '' : ' on'}" data-nv-col="">All ${all.length}</button>` +
    [...cols.values()].map(({ c, n }) => `<button type="button" class="nv-chip${on === c.key ? ' on' : ''}" data-nv-col="${esc(c.key)}"><i style="background:${esc(c.css)}"></i>${esc(c.name)} ${n}</button>`).join('') +
    (notes ? `<button type="button" class="nv-chip${on === 'note' ? ' on' : ''}" data-nv-col="note">Notes ${notes}</button>` : '') + `</div>`;
  let last = 0;
  shown.forEach(m => {
    const i = all.indexOf(m);
    if (m.page !== last) { last = m.page; h += `<div class="nv-pg">p. ${esc(nvPage(r, m.page))}${insert ? '' : ` <button type="button" class="linkish" data-nv-open="${m.page}">open</button>`}</div>`; }
    const c = markColour(m);
    h += `<div class="nv-mark"><span class="nv-bar" style="background:${esc((c && c.css) || 'var(--line)')}"></span><div class="nv-mk">` +
      (m.text ? `\u201c${esc(m.text)}\u201d` : '') + (m.note ? `<div class="nv-nt"><b>${m.text ? 'Note:' : 'Note'}</b> ${esc(m.note)}</div>` : '') + `</div>` +
      (insert ? `<button type="button" class="nv-ins" data-np-ins="${i}">Insert</button>`
        : `<button type="button" class="nv-copy" data-nv-copy="${i}" title="Copy the words" aria-label="Copy the words">${ICON.copy}</button>`) + `</div>`;
  });
  return h;
}
// All of them, with the citation: as the reader's Marks tab copies them.
function nvMarksCopy(r) {
  const list = r.marks.filter(m => !NOTES.colour || (NOTES.colour === 'note' ? !!m.note : (markColour(m) || {}).key === NOTES.colour));
  const ref = citeRef(r.e);
  const text = ref.text + '\n\n' + list.map(m => 'p. ' + nvPage(r, m.page) + ' \u2014 ' + m.name + (m.text ? ': \u201c' + m.text + '\u201d' : '') +
    (m.note ? (m.text ? '\n    Note: ' : ': ') + m.note : '')).join('\n');
  const html = '<p>' + ref.html + '</p><ul>' + list.map(m => `<li><b>p. ${esc(nvPage(r, m.page))}</b> ${esc(m.name)}` + (m.text ? `: \u201c${esc(m.text)}\u201d` : '') +
    (m.note ? (m.text ? '<br>' : ': ') + `<i>${esc(m.note)}</i>` : '') + '</li>').join('') + '</ul>';
  copy(text, 'Copied ' + list.length + ' highlight' + (list.length === 1 ? '' : 's') + ' and note' + (list.length === 1 ? '' : 's') + ', with the citation', html);
}
// The reader, open at a page.
function nvOpenAt(e, page) {
  const fl = readablePdfs(e)[0];
  if (!fl) return;
  if (V.doc && V.file && V.file.id === fl.id) { openPaper(e, fl); setTimeout(() => { if (V.viewer) V.viewer.currentPageNumber = page; }, 200); return; }
  POS[fl.id] = { page, at: Date.now(), dev: DEVICE };
  store.set('positions', POS);
  openPaper(e, fl);
}

// The reader, open at a page as printed (a page tag in your notes).
function nvOpenAtLabel(e, label) {
  const fl = readablePdfs(e)[0];
  if (!fl) return;
  openPaper(e, fl);
  const t0 = Date.now();
  const wait = () => {
    if (V.doc && V.file && V.file.id === fl.id && V.viewer && V.viewer.pagesCount) { rnGo(label); return; }
    if (Date.now() - t0 < 15000) setTimeout(wait, 150);
  };
  setTimeout(wait, 150);
}

/* ---- the Notes view, in the details pane */
function notesSeg(e) {
  const r = (readablePdfs(e)[0] && NOTES.marks.get(readablePdfs(e)[0].id)) || null;
  return `<span class="nv-seg" role="tablist" aria-label="Show"><button type="button" role="tab" data-dview="details" aria-selected="${NOTES.view !== 'notes'}" title="The publication\u2019s details (${esc(keyHint('notesView'))})">${ICON.doc}<span class="nv-lbl">Details</span></button>` +
    `<button type="button" role="tab" data-dview="notes" aria-selected="${NOTES.view === 'notes'}" title="Your notes, and the PDF\u2019s highlights (${esc(keyHint('notesView'))})">${NOTE_ICON}<span class="nv-lbl">Notes</span>${r && r.marks.length ? `<span class="ct">${r.marks.length}</span>` : ''}</button></span>`;
}
// The switch kept on the top line: when Details and Notes won't fit there
// beside the type and cite key, they become icons (their names still
// their tooltips, and said to screen readers).
function notesSegFit() {
  const seg = detailEl.querySelector('.nv-seg'), first = seg && seg.parentNode.firstElementChild;
  if (!seg) return;
  seg.classList.remove('tight');
  const k = seg.parentNode;
  // (Wrapped, or pushing past the edge, or squeezing the cite key, which
  // shortens on a phone.)
  const ck = k.querySelector('.citekey .ck');
  if (seg.offsetTop > first.offsetTop + 4 || k.scrollWidth > k.clientWidth + 1 || (ck && ck.scrollWidth > ck.clientWidth + 1)) seg.classList.add('tight');
}
if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(notesSegFit)).observe(detailEl);
function notesViewHTML(e) {
  const pdf = readablePdfs(e).length;
  return `<section class="d-sec nv"><h3 class="nv-h">Your notes` + (gs ? `<button type="button" class="nv-pop" data-nv-pop title="Notes, large, with formatting buttons (${esc(keyHint('notesPop'))})">${POP_ICON}<span>Pop out</span></button>` : '') + `</h3>` +
    `<div class="nv-wrap"><div class="nv-box notes-rich" data-nv-box role="textbox" aria-multiline="true" aria-label="Your notes" data-placeholder="${gs ? 'Write your notes\u2026' : 'No notes.'}" style="height:${NOTES.h}px"></div>` +
    (gs ? `<span class="nv-grip" data-nv-grip title="Drag to make the box taller or shorter"></span>` : '') + `</div>` +
    (gs ? `<p class="nv-hint">Saved as you leave the box \u00b7 drag its bottom edge to make it taller or shorter</p>` : '') + `</section>` +
    `<section class="d-sec nv-pdf"><h3 class="nv-h">From the PDF` + (pdf ? `<button type="button" class="nv-pop" data-nv-reader>Open in the reader \u2192</button>` : '') + `</h3>` +
    `<div data-nv-marks>${pdf ? '<p class="nv-none">Reading the PDF\u2019s highlights\u2026</p>' : '<p class="nv-none">No PDF here, so no highlights to show.</p>'}</div>` +
    (pdf ? `<div class="nv-foot" data-nv-foot hidden><button type="button" class="btn" data-nv-copyall>${ICON.copy}<span>Copy all, with the citation</span></button>` +
      `<button type="button" class="btn" data-nv-ai>${ICON.ai}<span>Copy for AI</span></button></div>` : '') + `</section>`;
}
// Once drawn: the box made an editor, saved as you leave it; the PDF's
// highlights read, and shown.
function notesMount(e) {
  const box = detailEl.querySelector('[data-nv-box]');
  if (!box) return;
  noteEditor(box, notesOf(e));
  box.addEventListener('blur', ev => {
    // (Not when it's popping out: that editor takes over.)
    if (ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('[data-nv-pop]')) return;
    notesSave(e.k, htmlToMd(box));
  });
  const grip = detailEl.querySelector('[data-nv-grip]');
  if (grip) {
    // (Followed over the whole window while dragging, so a finger or the
    // pointer can leave the grip.)
    grip.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      const y0 = ev.clientY, h0 = box.offsetHeight;
      const move = m => { box.style.height = Math.round(Math.max(120, Math.min(innerHeight * 0.8, h0 + m.clientY - y0))) + 'px'; };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        NOTES.h = box.offsetHeight;
        store.set('notesH', NOTES.h);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }
  nvShowMarks(e);
}
async function nvShowMarks(e) {
  const slot = detailEl.querySelector('[data-nv-marks]');
  if (!slot || !readablePdfs(e).length) return;
  let r;
  try { r = await notesMarks(e); } catch (err) {
    if (slot.isConnected) slot.innerHTML = `<p class="nv-none">Couldn\u2019t read the PDF\u2019s highlights: ${esc(errText(err))}</p>`;
    return;
  }
  if (!r || !slot.isConnected || state.selKey !== e.k) return;
  slot.innerHTML = nvMarksHTML(r, false);
  const foot = detailEl.querySelector('[data-nv-foot]');
  if (foot) foot.hidden = !r.marks.length;
  const tab = detailEl.querySelector('[data-dview="notes"]');
  if (tab && r.marks.length && !tab.querySelector('.ct')) { tab.insertAdjacentHTML('beforeend', `<span class="ct">${r.marks.length}</span>`); notesSegFit(); }
}
function setDetailView(v) {
  if (v === NOTES.view) return;
  // (Notes being written: kept first.)
  const box = detailEl.querySelector('[data-nv-box]');
  if (box && state.selKey) notesSave(state.selKey, htmlToMd(box));
  NOTES.view = v;
  store.set('detailView', v);
  renderDetail();
}
detailEl.addEventListener('click', ev => {
  const e = state.selKey && BYKEY.get(state.selKey);
  const dv = ev.target.closest('[data-dview]');
  if (dv) { setDetailView(dv.dataset.dview); return; }
  if (!e) return;
  if (ev.target.closest('[data-nv-pop]')) { openNotesPop(e); return; }
  if (ev.target.closest('[data-nv-reader]')) { const fl = readablePdfs(e)[0]; if (fl) openPaper(e, fl); return; }
  const col = ev.target.closest('[data-nv-col]');
  if (col) { NOTES.colour = col.dataset.nvCol || null; nvShowMarks(e); return; }
  const r = readablePdfs(e)[0] && NOTES.marks.get(readablePdfs(e)[0].id);
  const tag = ev.target.closest('[data-nv-box] .pl[data-pg]');
  if (tag && !gs) { nvOpenAtLabel(e, tag.dataset.pg); return; }
  if (tag && (ev.metaKey || ev.ctrlKey || ev.detail === 0)) { nvOpenAtLabel(e, tag.dataset.pg); return; }
  const go = ev.target.closest('[data-nv-open]');
  if (go) { nvOpenAt(e, +go.dataset.nvOpen); return; }
  const cp = ev.target.closest('[data-nv-copy]');
  if (cp && r) { const m = r.marks[+cp.dataset.nvCopy]; if (m) copy(m.text || m.note, 'Copied the words'); return; }
  if (ev.target.closest('[data-nv-copyall]') && r) { nvMarksCopy(r); return; }
  if (ev.target.closest('[data-nv-ai]')) aiCopyFor(e);
});

/* ---- popped out: large, with formatting buttons */
function openNotesPop(e) {
  if (!gs || NOTES.pop) return;
  // (What the box in the details had, unsaved, comes too.)
  const box = rnFor(e) ? RN.ed : detailEl.querySelector('[data-nv-box]');
  const md = box ? htmlToMd(box) : notesOf(e);
  const year = (/\d{4}/.exec(e.f.year || '') || [''])[0], who = (e.a && e.a[0] && e.a[0][0]) || (e.e && e.e[0] && e.e[0][0]) || '';
  const b = (cmd, title, icon) => `<button type="button" data-np="${cmd}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</button>`;
  const I = d => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
  const wrap = document.createElement('div');
  wrap.className = 'np-wrap';
  wrap.innerHTML = `<div class="np-scrim" data-np-close></div><div class="np" role="dialog" aria-modal="true" aria-label="Notes on ${esc(e.f.title || e.k)}">` +
    `<div class="np-head"><h2>${esc(e.f.title || e.k)}<small>${esc([who.replace(/[{}]/g, ''), year].filter(Boolean).join(' ') + ' \u00b7 ' + e.k)}</small></h2>` +
    `<span class="np-state" aria-live="polite">Saved</span><button type="button" class="btn primary" data-np-close>Done</button></div>` +
    `<div class="np-tools">` +
    b('undo', 'Undo (\u2318Z)', UNDO_ICON) + b('redo', 'Redo (\u21e7\u2318Z)', REDO_ICON) + '<span class="np-sep"></span>' +
    b('h', 'Heading', '<b>H</b>') + b('bold', 'Bold (\u2318B)', '<b>B</b>') + b('italic', 'Italic (\u2318I)', '<i>I</i>') + '<span class="np-sep"></span>' +
    b('ul', 'Bulleted list', I('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>')) +
    b('ol', 'Numbered list', I('<path d="M10 6h10M10 12h10M10 18h10M4 5h1.5v4M4 9h3M4 14.5c0-1 2.5-1.5 2.5 0S4 17 4 18h3"/>')) +
    b('quote', 'Quotation', I('<path d="M5 17c2.5-.4 4-2.2 4-5V7H5v5h3"/><path d="M14 17c2.5-.4 4-2.2 4-5V7h-4v5h3"/>')) +
    b('link', 'Link (\u2318K)', I('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')) + '<span class="np-sep"></span>' +
    `<button type="button" class="np-wide" data-np="cite" title="Cite another publication: its in-text citation, in your style">${I('<path d="M4 6h16M4 12h10M4 18h6"/>')}<span>Cite\u2026</span></button>` +
    `<div class="np-cite" hidden><input type="search" placeholder="A title or author in your library" aria-label="Find a publication to cite" autocomplete="off" spellcheck="false"><div class="np-cite-list"></div></div>` +
    `</div><div class="np-body"><div class="np-edit notes-rich" role="textbox" aria-multiline="true" aria-label="Your notes" data-placeholder="Write your notes\u2026"></div>` +
    (readablePdfs(e).length ? `<aside class="np-side"><h4>From the PDF \u00b7 insert a quotation</h4><div class="np-marks"><p class="nv-none">Reading the PDF\u2019s highlights\u2026</p></div></aside>` : '') + `</div>` +
    `<div class="np-foot"><span>Markdown, kept in the .bib\u2019s Notes field \u00b7 saved as you type</span><span>Esc or Done to close</span></div></div>`;
  document.body.appendChild(wrap);
  const ed = wrap.querySelector('.np-edit'), state_ = wrap.querySelector('.np-state');
  let timer = 0, range = null;
  const save = () => { clearTimeout(timer); state_.textContent = 'Saving\u2026'; return notesSave(e.k, htmlToMd(ed), true).then(ok => { if (wrap.isConnected) state_.textContent = ok ? 'Saved' : 'Not saved'; }); };
  noteEditor(ed, md, () => { state_.textContent = 'Edited'; clearTimeout(timer); timer = setTimeout(save, 2000); });
  // (Where the caret was, for the buttons and insertions, which take the focus.)
  const keep = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); };
  document.addEventListener('selectionchange', keep);
  ['input', 'keyup', 'mouseup', 'touchend'].forEach(t => ed.addEventListener(t, keep));
  const back = () => {
    ed.focus();
    const s = getSelection(); s.removeAllRanges();
    if (range) s.addRange(range); else { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); s.addRange(r); }
  };
  ed.focus();
  const close = async () => {
    document.removeEventListener('selectionchange', keep);
    document.removeEventListener('keydown', onKey, true);
    await save();
    wrap.remove();
    NOTES.pop = null;
    if (state.selKey === e.k) renderDetail();
    // (The reader's notes, as the large editor left them.)
    if (rnFor(e)) { RN.ed = null; rnMount(RN.host, BYKEY.get(e.k) || e, RN.where); }
  };
  const onKey = ev => { if (ev.key === 'Escape' && !wrap.querySelector('.np-cite:not([hidden])') && !document.querySelector('.nv-linkbox')) { ev.preventDefault(); ev.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  NOTES.pop = { e, close };
  // The buttons keep the caret where it was.
  wrap.addEventListener('mousedown', ev => { if (ev.target.closest('[data-np], [data-np-ins]')) ev.preventDefault(); });
  wrap.addEventListener('click', ev => {
    if (ev.target.closest('[data-np-close]')) { close(); return; }
    const t = ev.target.closest('[data-np]');
    if (t) {
      const k = t.dataset.np;
      if (k === 'cite') { const c = wrap.querySelector('.np-cite'); c.hidden = !c.hidden; if (!c.hidden) { c.querySelector('input').value = ''; citeFind(''); c.querySelector('input').focus(); } return; }
      back();
      if (k === 'h') nvToggleBlock(ed, 'h3');
      else if (k === 'quote') nvToggleBlock(ed, 'blockquote');
      else if (k === 'ul') nvExec('insertUnorderedList');
      else if (k === 'ol') nvExec('insertOrderedList');
      else if (k === 'link') nvLink(ed);
      else nvExec(k);
      ed.dispatchEvent(new Event('input'));
      return;
    }
    const ins = ev.target.closest('[data-np-ins]');
    if (ins && NOTES.popMarks) {
      const m = NOTES.popMarks.marks[+ins.dataset.npIns];
      if (!m) return;
      back();
      // (A quotation of its own: on a new line if the caret's line has
      // words, and a plain line after it, to go on writing.)
      nvQuote(ed, nvMarkQuote(NOTES.popMarks, m));
      ed.dispatchEvent(new Event('input'));
      return;
    }
    const pick = ev.target.closest('[data-np-cite]');
    if (pick) {
      const x = BYKEY.get(pick.dataset.npCite);
      wrap.querySelector('.np-cite').hidden = true;
      back();
      if (x) { nvExec('insertText', citeInText(x).text); ed.dispatchEvent(new Event('input')); }
    }
  });
  // Cite: a publication found by title or author.
  const citeFind = q => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const hits = words.length ? ENTRIES.filter(x => { const s = norm((x.f.title || '') + ' ' + (x.a || x.e || []).map(n => n[0]).join(' ') + ' ' + (x.f.year || '')); return words.every(w => s.includes(w)); }).slice(0, 8) : [];
    wrap.querySelector('.np-cite-list').innerHTML = hits.map(x => `<button type="button" data-np-cite="${esc(x.k)}"><b>${esc(citeInText(x).text)}</b> ${esc(x.f.title || '')}</button>`).join('') ||
      (words.length ? '<p class="nv-none">None found.</p>' : '');
  };
  const ci = wrap.querySelector('.np-cite input');
  ci.addEventListener('input', () => citeFind(ci.value));
  ci.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); wrap.querySelector('.np-cite').hidden = true; back(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); const f = wrap.querySelector('[data-np-cite]'); if (f) f.click(); }
    ev.stopPropagation();
  });
  // The highlights, to insert.
  const side = wrap.querySelector('.np-marks');
  if (side) notesMarks(e).then(r => {
    if (!wrap.isConnected) return;
    NOTES.popMarks = r;
    side.innerHTML = r && r.marks.length ? nvMarksHTML(r, true) : '<p class="nv-none">No highlights or notes in the PDF yet.</p>';
  }, err => { if (side.isConnected) side.innerHTML = `<p class="nv-none">Couldn\u2019t read them: ${esc(errText(err))}</p>`; });
}

/* ---- in the reader: beside the paper, or below it */
// Your notes while you read: the sidebar's Notes tab (made wider while
// it's open; drag its edge, and that width is kept for Notes), or, where
// that would leave the page too narrow (an iPad held upright, a phone, a
// narrow window), the bottom half, in the split screen's place. The same
// notes and editor as the details pane's, saved as you type. Add to notes
// (beside a passage you select) puts it in as a quotation with its page,
// and highlights it; a page tag goes to that page of the paper.
const RN = { e: null, ed: null, host: null, where: null, timer: 0, range: null, from: null, last: null };
const rnFor = e => !!(RN.ed && RN.ed.isConnected && RN.e && e && RN.e.k === e.k);
const rnShown = () => !!(RN.ed && RN.ed.isConnected && !$('#viewer').hidden && (RN.where === 'bottom' ? !$('#vPeek').hidden : sideOpen() && SIDE.tab === 'notes'));
// (The page would be under 480px beside the notes: below it instead. On a
// phone, the sidebar's Notes tab, which fills the screen there.)
// (Moved with the button for it: kept, for the screen held that way, wide
// or tall.)
const rnWhereKey = () => innerWidth > innerHeight ? 'notesWhereWide' : 'notesWhereTall';
function rnWhere() {
  if (handheld()) return 'side';
  const chosen = store.get(rnWhereKey(), null);
  if (chosen === 'side' || chosen === 'bottom') return chosen;
  const w = $('#viewer').clientWidth || innerWidth;
  const side = Math.max(320, Math.min(store.get('notesSideW', 380), w * 0.5));
  return sidePhone() || w - side < 480 ? 'bottom' : 'side';
}
// The button that moves them: beside the page, or below it.
const RN_MOVE = {
  side: ['Move your notes beside the page', '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M10 4.5v15"/><path d="M5.5 9h2.5M5.5 12h2.5" opacity=".6"/></svg>'],
  bottom: ['Move your notes below the page', '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 13h17"/><path d="M7 16.3h10" opacity=".6"/></svg>'],
};
function rnHTML(e, where) {
  const b = (k, title, icon) => `<button type="button" data-rn="${k}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</button>`;
  const I = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  return `<div class="rn">` + (gs ? `<div class="rn-tools">` +
    b('undo', 'Undo (\u2318Z)', UNDO_ICON) + b('redo', 'Redo (\u21e7\u2318Z)', REDO_ICON) + '<span class="rn-sep"></span>' +
    b('h', 'Heading', '<b>H</b>') + b('bold', 'Bold (\u2318B)', '<b>B</b>') + b('italic', 'Italic (\u2318I)', '<i>I</i>') + '<span class="rn-sep"></span>' +
    b('ul', 'Bulleted list', I('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>')) +
    b('quote', 'Quotation', I('<path d="M5 17c2.5-.4 4-2.2 4-5V7H5v5h3"/><path d="M14 17c2.5-.4 4-2.2 4-5V7h-4v5h3"/>')) +
    b('link', 'Link (\u2318K)', I('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')) +
    // (At the right, after Saved: where the notes go, not how they look.)
    `<span class="rn-state" aria-live="polite" data-ok>Saved</span>` +
    (handheld() ? '' : b('move', RN_MOVE[where === 'bottom' ? 'side' : 'bottom'][0], RN_MOVE[where === 'bottom' ? 'side' : 'bottom'][1]) +
      b('pop', 'Notes, large, with Cite (' + keyHint('notesPop') + ')', POP_ICON)) +
    (handheld() ? `<button type="button" class="rn-done" data-rn="done">Done</button>` : '') + `</div>` : '') +
    `<div class="rn-edit notes-rich" role="textbox" aria-multiline="true" aria-label="Your notes" data-placeholder="${gs ? 'Write your notes\u2026 (select a passage in the paper, then Add to notes, to quote it)' : 'No notes.'}"></div>` +
    `<div class="rn-marks" hidden></div>` +
    (gs ? `<div class="rn-foot"><button type="button" class="linkish" data-rn-marks aria-expanded="false">Highlights</button></div>` : '') + `</div>`;
}
// (Saved: left out of a narrow toolbar, where there's no room; anything
// else, said.)
function rnState(st, text) { st.textContent = text; st.toggleAttribute('data-ok', text === 'Saved'); }
function rnFlush() {
  clearTimeout(RN.timer);
  if (!RN.ed || !RN.e || !gs) return Promise.resolve(true);
  const ed = RN.ed, k = RN.e.k, st = RN.host && RN.host.querySelector('.rn-state'), md = htmlToMd(ed);
  const last = RN.last = { k, md };
  return notesSave(k, md, true).then(ok => {
    if (ok && RN.last === last) RN.last = null;
    if (st && st.isConnected && RN.ed === ed) rnState(st, ok ? 'Saved' : 'Not saved');
    return ok;
  });
}
function rnMount(host, e, where) {
  if (RN.ed && RN.ed !== host.querySelector('.rn-edit')) rnFlush();
  Object.assign(RN, { e, host, where, ed: null, range: null });
  if (!e) { host.innerHTML = `<p class="v-side-note">This paper has no entry in the library, so no notes.</p>`; return; }
  host.innerHTML = rnHTML(e, where);
  const ed = host.querySelector('.rn-edit'), st = host.querySelector('.rn-state');
  RN.ed = ed;
  // (Just moved, or another tab and back: what was written, though its
  // save may not be done yet.)
  const md = RN.last && RN.last.k === e.k ? RN.last.md : notesOf(e);
  noteEditor(ed, md, () => {
    if (st) rnState(st, 'Edited');
    clearTimeout(RN.timer);
    RN.timer = setTimeout(() => { if (st) rnState(st, 'Saving\u2026'); rnFlush(); }, 1500);
  });
  nvTagPages(ed);
  ed.addEventListener('blur', () => { if (RN.ed === ed) { nvTagPages(ed); rnFlush(); } });
  // (Where the caret was, for the buttons and Add to notes, which take the focus.)
  ['input', 'keyup', 'mouseup', 'touchend', 'focus'].forEach(t => ed.addEventListener(t, rnKeep));
  // Alt-N closes them again, from inside too (the editor keeps its keys).
  ed.addEventListener('keydown', ev => { if (keyIs(ev, 'notesView')) { ev.preventDefault(); ev.stopPropagation(); toggleReaderNotes(); } }, true);
}
function rnKeep() { const s = getSelection(); if (RN.ed && s.rangeCount && RN.ed.contains(s.anchorNode)) RN.range = s.getRangeAt(0).cloneRange(); }
document.addEventListener('selectionchange', () => { if (RN.ed && document.activeElement === RN.ed) rnKeep(); });
function rnBack() {
  const ed = RN.ed;
  ed.focus();
  const s = getSelection(); s.removeAllRanges();
  if (RN.range && ed.contains(RN.range.startContainer)) s.addRange(RN.range);
  else { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); s.addRange(r); }
}
// The buttons, the page tags, the highlights to insert.
function rnClick(ev) {
  if (!RN.ed || !RN.host || !RN.host.contains(ev.target)) return;
  const ed = RN.ed, t = ev.target.closest('[data-rn]');
  if (t) {
    const k = t.dataset.rn;
    if (k === 'pop') { const e = BYKEY.get(RN.e.k); if (e) openNotesPop(e); return; }
    if (k === 'done') { closeReaderNotes(); return; }
    if (k === 'move') { rnMove(RN.where === 'bottom' ? 'side' : 'bottom'); return; }
    rnBack();
    if (k === 'h') nvToggleBlock(ed, 'h3');
    else if (k === 'quote') nvToggleBlock(ed, 'blockquote');
    else if (k === 'ul') nvExec('insertUnorderedList');
    else if (k === 'link') nvLink(ed);
    else nvExec(k);
    ed.dispatchEvent(new Event('input'));
    return;
  }
  const tag = ev.target.closest('.rn-edit .pl[data-pg]');
  if (tag) { rnGo(tag.dataset.pg); return; }
  if (ev.target.closest('[data-rn-marks]')) { rnMarks(); return; }
  const ins = ev.target.closest('[data-np-ins]');
  if (ins && RN.marks) {
    const m = RN.marks.marks[+ins.dataset.npIns];
    if (!m) return;
    rnBack();
    nvQuote(ed, nvMarkQuote(RN.marks, m));
    ed.dispatchEvent(new Event('input'));
  }
}
document.addEventListener('click', rnClick);
// (The buttons keep the caret where it was.)
document.addEventListener('mousedown', ev => { if (RN.host && RN.host.contains(ev.target) && ev.target.closest('[data-rn], [data-np-ins], [data-rn-marks]')) ev.preventDefault(); });
// The paper's highlights and notes (as it is now, in the reader), to insert.
async function rnMarks() {
  const box = RN.host.querySelector('.rn-marks'), btn = RN.host.querySelector('[data-rn-marks]');
  if (!box) return;
  const open = box.hidden;
  box.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (!open || !V.doc) return;
  box.innerHTML = '<p class="nv-none">Reading the highlights\u2026</p>';
  const doc = V.doc;
  try {
    const marks = ((await collectMarks(doc, null)) || []).filter(m => m.text || m.note);
    let labels = null;
    try { labels = await doc.getPageLabels(); } catch (err) { labels = null; }
    if (!box.isConnected) return;
    RN.marks = { marks, labels };
    box.innerHTML = marks.length ? nvMarksHTML(RN.marks, true) : '<p class="nv-none">No highlights or notes in the PDF yet (saved ones: those just made come once it\u2019s saved).</p>';
  } catch (err) { if (box.isConnected) box.innerHTML = `<p class="nv-none">Couldn\u2019t read them: ${esc(errText(err))}</p>`; }
}
// Open (beside the paper or below it), or close.
function openReaderNotes() {
  if ($('#viewer').hidden || !V.entry) return false;
  if (rnShown()) return true;
  const where = rnWhere();
  if (where === 'side') {
    RN.from = { open: sideOpen(), tab: SIDE.tab };
    if (!sideOpen()) toggleSide(true);
    showSideTab('notes');
  } else rnBottom();
  rnPressed();
  return true;
}
function closeReaderNotes() {
  if (!rnShown()) return;
  if (RN.where === 'bottom') { closePeek(); return; }
  const f = RN.from;
  RN.from = null;
  if (f && !f.open) toggleSide(false);
  else showSideTab(f && f.tab && f.tab !== 'notes' ? f.tab : 'pages');
  rnPressed();
}
// Beside the page, or below it: kept for the screen held this way.
function rnMove(to) {
  store.set(rnWhereKey(), to);
  if (RN.where === 'bottom') { closePeek(); RN.ed = null; }
  else closeReaderNotes();
  openReaderNotes();
  if (RN.ed) rnBack();
}
function toggleReaderNotes() { if (rnShown()) closeReaderNotes(); else { openReaderNotes(); if (RN.ed) rnBack(); } }
function rnPressed() { const b = $('#vNotesBtn'); if (b) b.setAttribute('aria-pressed', String(rnShown())); }
// Below the paper: the split screen's panel, showing the notes instead.
function rnBottom() {
  const panel = $('#vPeek');
  PEEK.token++;
  PEEK.dest = null;
  panel.classList.add('notes');
  panel.setAttribute('aria-label', 'Your notes');
  $('#vPeekTitle').textContent = 'Notes';
  $('#vPeekNotes').hidden = false;
  $('#vSplitBtn').setAttribute('aria-pressed', 'false');
  if (panel.hidden) {
    peekHeight(store.get('peekH', 1 / 3) < 0.4 ? 0.45 : store.get('peekH', 1 / 3));
    panel.hidden = false; panel.classList.add('entering'); void panel.offsetWidth; panel.classList.remove('entering');
  }
  rnMount($('#vPeekNotes'), V.entry && (BYKEY.get(V.entry.k) || null), 'bottom');
  showBack();
  peekRoom();
}
// (The panel goes back to being the split screen: notes kept first.)
function rnBottomOff() {
  const panel = $('#vPeek');
  if (!panel.classList.contains('notes')) return;
  if (RN.where === 'bottom') rnFlush();
  panel.classList.remove('notes');
  panel.setAttribute('aria-label', 'Link destination');
  $('#vPeekNotes').hidden = true;
  $('#vPeekNotes').replaceChildren();
  if (RN.where === 'bottom') RN.ed = null;
  setTimeout(rnPressed, 0);
}
// Add to notes: the passage selected, as a quotation with its page (the
// one in the Quote bar), at the caret in your notes (opened if need be);
// and highlighted in the paper, so the two go together. On a phone, where
// the notes would cover the paper, at the end of them, unopened: you read
// on.
function rnAddQuote() {
  const s = QUOTE.sel;
  if (!s || !V.entry || !gs || !BYKEY.get(V.entry.k)) return;
  const pg = String(QUOTE.el.querySelector('input').value || '');
  rnHighlight(s.range);
  hideQuote();
  rnAddPassage(s.text, pg);
}
// (A highlight's words too: see markQuote.)
function rnAddPassage(text, pg) {
  if (!V.entry || !gs || !BYKEY.get(V.entry.k)) return;
  pg = String(pg || '').trim().replace(/-+/g, '\u2013');
  const q = '\u201c' + text.replace(/[.,;:]+$/, '') + '\u201d' + (pg ? ' (p. ' + pg + ')' : '');
  if (handheld() && !rnShown()) {
    // (After any save still going, so two in a row both stay.)
    const k = V.entry.k;
    NOTES.saving.then(() => {
      const was = notesOf(BYKEY.get(k)).trim();
      return notesSave(k, (was ? was + '\n\n' : '') + '> ' + q, true);
    }).then(ok => { if (ok) toast('Added to your notes' + (pg ? ' (p. ' + pg + ')' : ''), 2200); });
    return;
  }
  // (Not open: on an iPad held upright, below the page, whatever the notes
  // button opens; elsewhere where the notes button opens them.)
  if (!rnShown()) {
    if (coarseMQ.matches && innerHeight > innerWidth) { rnBottom(); rnPressed(); } else openReaderNotes();
  }
  if (!RN.ed) return;
  rnBack();
  nvQuote(RN.ed, q);
  RN.ed.dispatchEvent(new Event('input'));
  rnKeep();
}
function rnHighlight(range) {
  const ui = V.ui, T = V.lib && V.lib.AnnotationEditorType;
  if (!ui || !T || !V.viewer || typeof ui.highlightSelection !== 'function') return;
  const run = () => {
    try {
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      V.newHighlight = true;
      ui.highlightSelection('main_toolbar');
    } catch (err) { /* the quotation's still added */ }
    // (Back to reading.)
    setTimeout(() => { if (V.tool === 'read' && V.viewer && V.doc) { try { V.viewer.annotationEditorMode = { mode: T.NONE }; } catch (err) { /* later */ } } }, 300);
  };
  // PDF.js highlights a selection only in its highlighting mode (and its
  // own way there is its full viewer's, not this one's): so, that mode
  // first, and back after.
  if (V.viewer.annotationEditorMode !== T.HIGHLIGHT) {
    V.bus.on('annotationeditormodechanged', () => setTimeout(run, 0), { once: true });
    try { V.viewer.annotationEditorMode = { mode: T.HIGHLIGHT }; } catch (err) { /* not ready */ }
  } else run();
}
// A page tag: to that page of the paper (as printed: the journal's page
// numbers, as the Quote bar works them out), with Back to where you were.
async function rnGo(label) {
  if (!V.doc || !V.viewer) return;
  const n = await rnPageOf(String(label));
  if (!n) { toast('Page ' + label + ' isn\u2019t in this PDF.', 2500); return; }
  pushBack();
  V.viewer.currentPageNumber = n;
  const pv = V.viewer.getPageView(n - 1);
  if (pv && pv.div) { pv.div.classList.remove('rn-flash'); void pv.div.offsetWidth; pv.div.classList.add('rn-flash'); setTimeout(() => pv.div.classList.remove('rn-flash'), 1700); }
}
async function rnPageOf(label) {
  const doc = V.doc, N = doc.numPages, want = label.toLowerCase();
  if (V.pageLabels === undefined) V.pageLabels = await doc.getPageLabels().catch(() => null);
  const L = V.pageLabels;
  if (L) { const i = L.findIndex(l => String(l).toLowerCase() === want); if (i >= 0 && L.some((l, j) => l !== String(j + 1))) return i + 1; }
  for (let n = 1; n <= N; n++) { const p = await printedPage(n); if (p && String(p.page).toLowerCase() === want) return n; }
  return /^\d+$/.test(label) && +label >= 1 && +label <= N ? +label : 0;
}
