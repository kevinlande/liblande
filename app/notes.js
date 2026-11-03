// LibLande: Notes: a publication's notes (the .bib's Notes field, written as Markdown) and its PDF's highlights and notes, in the details pane's Notes view and a large pop-out editor, both formatted as you type.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/notes.js'] = '2026-11-02.12';
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
const POP_ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

/* ---- Markdown, the little of it notes need */
function mdInline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<i>$2</i>');
}
function mdToHtml(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n'), out = [];
  let para = [], list = null, quote = [];
  const flushPara = () => { if (para.length) out.push('<p>' + para.map(mdInline).join('<br>') + '</p>'); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>` + list.items.map(x => '<li>' + mdInline(x) + '</li>').join('') + `</${list.tag}>`); list = null; };
  const flushQuote = () => { if (quote.length) out.push('<blockquote>' + mdToHtml(quote.join('\n')) + '</blockquote>'); quote = []; };
  for (const line of lines) {
    let m;
    if (/^>\s?/.test(line)) { flushPara(); flushList(); quote.push(line.replace(/^>\s?/, '')); continue; }
    flushQuote();
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flushPara(); flushList(); const t = m[1].length === 1 ? 'h3' : 'h4'; out.push(`<${t}>${mdInline(m[2])}</${t}>`); continue; }
    if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { flushPara(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushPara(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList(); flushQuote();
  return out.join('');
}
// What the editor holds, as Markdown again.
function htmlToMd(root) {
  const mark = (s, m) => { const x = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return x[2] ? x[1] + m + x[2] + m + x[3] : s; };
  const inl = n => [...n.childNodes].map(c => {
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
  const tidy = s => s.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
  const blocks = [];
  const walk = parent => [...parent.childNodes].forEach(n => {
    if (n.nodeType === 3) { if (n.data.trim()) blocks.push(tidy(n.data)); return; }
    if (n.nodeType !== 1) return;
    const t = n.nodeName;
    if (/^H\d$/.test(t)) { const s = tidy(inl(n)); if (s) blocks.push((t === 'H1' || t === 'H2' || t === 'H3' ? '# ' : '## ') + s.replace(/\n/g, ' ')); }
    else if (t === 'UL' || t === 'OL') {
      let i = 0;
      const items = [...n.querySelectorAll('li')].map(li => tidy(inl(li)).replace(/\n/g, ' ')).filter(Boolean);
      if (items.length) blocks.push(items.map(x => (t === 'OL' ? ++i + '. ' : '- ') + x).join('\n'));
    }
    else if (t === 'BLOCKQUOTE') { const s = htmlToMd(n); if (s) blocks.push(s.split('\n').map(l => '> ' + l).join('\n')); }
    else if ((t === 'DIV' || t === 'P') && n.querySelector('ul,ol,blockquote,h1,h2,h3,h4,p,div')) walk(n);
    else if (t !== 'BR') { const s = tidy(inl(n)); if (s) blocks.push(s); }
  });
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

/* ---- saving */
// One save at a time, each from the publication as it is after the last.
// Unbalanced braces ({ }) would break the .bib, so aren't saved.
function notesSave(key, md, quiet) {
  md = String(md || '').trim();
  NOTES.saving = NOTES.saving.then(async () => {
    const e = BYKEY.get(key);
    if (!e || md === rawOf(e, 'annote').trim()) return true;
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
  noteEditor(box, rawOf(e, 'annote'));
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
  const box = detailEl.querySelector('[data-nv-box]');
  const md = box ? htmlToMd(box) : rawOf(e, 'annote');
  const year = (/\d{4}/.exec(e.f.year || '') || [''])[0], who = (e.a && e.a[0] && e.a[0][0]) || (e.e && e.e[0] && e.e[0][0]) || '';
  const b = (cmd, title, icon) => `<button type="button" data-np="${cmd}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</button>`;
  const I = d => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
  const wrap = document.createElement('div');
  wrap.className = 'np-wrap';
  wrap.innerHTML = `<div class="np-scrim" data-np-close></div><div class="np" role="dialog" aria-modal="true" aria-label="Notes on ${esc(e.f.title || e.k)}">` +
    `<div class="np-head"><h2>${esc(e.f.title || e.k)}<small>${esc([who.replace(/[{}]/g, ''), year].filter(Boolean).join(' ') + ' \u00b7 ' + e.k)}</small></h2>` +
    `<span class="np-state" aria-live="polite">Saved</span><button type="button" class="btn primary" data-np-close>Done</button></div>` +
    `<div class="np-tools">` +
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
      const q = (m.text ? '\u201c' + m.text + '\u201d ' : '') + '(p. ' + nvPage(NOTES.popMarks, m.page) + ')' + (m.note ? ' \u2014 ' + m.note : '');
      const line = nvBlock(ed);
      if (line && line.textContent.trim()) nvExec('insertParagraph');
      nvExec('formatBlock', '<blockquote>');
      nvExec('insertText', q);
      nvExec('insertParagraph');
      nvExec('outdent');
      nvExec('formatBlock', '<p>');
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
