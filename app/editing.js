// LibLande: adding and editing, BibTeX pasted in, selecting several, updates, cite keys, versions, export, the keyboard.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/editing.js'] = '2026-10-25.04';
/* ------------------------------------------------------------ add and edit */
const TYPE_FIELDS = {
  article: ['journal', 'volume', 'number', 'pages'],
  incollection: ['booktitle', 'editor', 'pages', 'publisher'],
  inbook: ['booktitle', 'editor', 'pages', 'publisher'],
  inproceedings: ['booktitle', 'editor', 'pages', 'publisher'],
  conference: ['booktitle', 'editor', 'pages', 'publisher'],
  book: ['editor', 'edition', 'publisher'],
  proceedings: ['editor', 'publisher'],
  phdthesis: ['school'],
  mastersthesis: ['school'],
  techreport: ['number', 'institution'],
  unpublished: ['note'],
  misc: ['howpublished', 'publisher', 'note'],
};
const FIELD_LABELS = { title: 'Title', author: 'Authors', editor: 'Editors', year: 'Year', journal: 'Journal',
  booktitle: 'Book title', volume: 'Volume', number: 'Number', pages: 'Pages', publisher: 'Publisher',
  edition: 'Edition', school: 'School', institution: 'Institution', howpublished: 'Published as', note: 'Note',
  doi: 'DOI', url: 'URL', issn: 'ISSN', isbn: 'ISBN', abstract: 'Abstract', annote: 'Notes', month: 'Month', address: 'Place' };
const SHORT_FIELDS = new Set(['year', 'month', 'volume', 'number', 'pages', 'edition']);
const AREA_FIELDS = new Set(['abstract', 'annote', 'note']);
const TYPE_CHOICES = [['article', 'Journal article'], ['incollection', 'Book chapter'], ['book', 'Book'],
  ['inproceedings', 'Conference paper'], ['phdthesis', 'PhD thesis'], ['techreport', 'Report'],
  ['unpublished', 'Unpublished'], ['misc', 'Other']];
let sheet = null;
let lastBibStamp = 0;

const rawOf = (e, n) => ((e.r && e.r[n] != null ? e.r[n] : e.f[n]) || '');
const shownValue = v => v.replace(/\\([&%$#_{}])/g, '$1').replace(/---/g, '\u2014').replace(/--/g, '\u2013').replace(/[{}]/g, '');
const pad2 = n => String(n).padStart(2, '0');
function bibdeskTime(d = new Date()) {
  const off = -d.getTimezoneOffset(), a = Math.abs(off);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${off >= 0 ? '+' : '-'}${pad2(Math.floor(a / 60))}${pad2(a % 60)}`;
}
const fileTime = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
function parseNamesLite(s) {
  return s.split(/\s+and\s+/i).map(n => n.replace(/[{}]/g, '').trim()).filter(Boolean).map(n => {
    if (n.indexOf(',') >= 0) { const bits = n.split(','); return [bits[0].trim(), bits[bits.length - 1].trim()]; }
    const w = n.split(/\s+/), last = w.pop();
    return [last, w.join(' ')];
  });
}
// A list of full names as written in prose ("Daniel M. Bear, Chaofei Fan,
// and Jiajun Wu", or with "&" or ";"), as BibTeX has them: "Bear, Daniel
// M. and Fan, Chaofei and Wu, Jiajun". Null if it isn't one: BibTeX's own
// "Last, First and Last, First", one "Last, First", or just two names
// with a comma between (as a two-word surname: "Le Bear, Daniel Michael").
const NAME_PARTICLE = /^(van|von|de|der|den|del|della|di|da|du|la|le|dos|das|ten|ter|bin|ibn|al)$/;
const NAME_SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
function namesFromList(s) {
  const t = String(s || '').trim();
  if (!t || /[{}\\]/.test(t) || !/[,;&]/.test(t)) return null;
  const parts = t.split(/\s*(?:;|,?\s*&\s*|,\s*and\s+|,|\s+and\s+)\s*/i).map(p => p.trim()).filter(Boolean);
  const words = p => p.split(/\s+/).filter(w => !NAME_SUFFIX.test(w));
  if (parts.some(p => words(p).length < 2)) return null;
  if (parts.length < 3 && !/[;&]/.test(t)) return null;
  return parts.map(p => {
    const w = p.split(/\s+/), suffix = NAME_SUFFIX.test(w[w.length - 1]) ? w.pop() : '';
    // (A surname with "van", "de"... starts there.)
    let at = w.findIndex((x, i) => i > 0 && i < w.length - 1 && NAME_PARTICLE.test(x));
    if (at < 0) at = w.length - 1;
    return w.slice(at).join(' ') + (suffix ? ', ' + suffix : '') + ', ' + w.slice(0, at).join(' ');
  }).join(' and ');
}
// (In Add and Edit: the authors or editors box, so written.)
function namesTidy(el, say) {
  const to = namesFromList(el.value);
  if (!to) return false;
  el.value = to;
  if (say) sheetMsg('Read the ' + (FIELD_LABELS[el.dataset.field] || el.dataset.field).toLowerCase() + ' as ' + to.split(' and ').length + ' names, and wrote them as BibTeX does (Last, First and Last, First). Check them.');
  return true;
}
$('#sheetBody').addEventListener('change', ev => {
  if (sheet && /^(add|edit)$/.test(sheet.mode) && ev.target.matches('[data-field="author"], [data-field="editor"]')) namesTidy(ev.target, true);
});
// (Every brace counts, as for BibTeX, a backslash before it or not.)
function balanced(v) {
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '{') depth++;
    else if (v[i] === '}' && --depth < 0) return false;
  }
  return depth === 0;
}
function makeCiteKey(v) {
  const fold = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const first = (v.author || v.editor || '').split(/\s+and\s+/i)[0].replace(/[{}\\]/g, '');
  const last = first.indexOf(',') >= 0 ? first.split(',')[0] : (first.trim().split(/\s+/).pop() || 'anon');
  const stop = new Set('a an the on of in and for to from with by at as is are be'.split(' '));
  const word = (fold(v.title).match(/[a-z0-9]+/g) || []).find(w => !stop.has(w)) || 'untitled';
  const base = (fold(last).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'anon') + '_' + word + '_' + (v.year || 'nd');
  let key = base, n = 1;
  while (BYKEY.has(key)) key = base + String.fromCharCode(97 + n++);
  return key;
}

function formFieldNames(type, present) {
  const list = ['title', 'author', 'year'].concat(TYPE_FIELDS[type] || TYPE_FIELDS.misc, ['doi', 'url']);
  Object.keys(FIELD_LABELS).forEach(n => { if (list.indexOf(n) < 0 && present(n) && !AREA_FIELDS.has(n)) list.push(n); });
  return list.concat(['abstract', 'annote'].filter(n => list.indexOf(n) < 0));
}
function fieldInput(n, value, lead) {
  const id = 'fld-' + n;
  const hint = n === 'author' || n === 'editor' ? ' placeholder="Last, First and Last, First (or a list of full names)"' : '';
  const input = AREA_FIELDS.has(n) || n === 'title'
    ? `<textarea id="${id}" data-field="${n}" rows="${n === 'abstract' ? 4 : 2}">${esc(value)}</textarea>`
    : `<input id="${id}" data-field="${n}" type="text" value="${esc(value)}" autocomplete="off"${hint}${n === 'doi' || n === 'url' ? ' autocapitalize="off" spellcheck="false"' : ''}>`;
  return `<div class="fld${SHORT_FIELDS.has(n) ? ' short' + (lead ? ' lead' : '') : ''}"><label for="${id}">${esc(FIELD_LABELS[n] || n)}</label>${input}</div>`;
}
// The fields, in order; a short field that starts a row (its name lines
// up with the names of the long fields) is the lead.
const fieldsHtml = (names, get) => names.map((n, i) => fieldInput(n, get(n), !i || !SHORT_FIELDS.has(names[i - 1]))).join('');
const kwChip = k => `<span class="kw-chip" data-kw="${esc(k)}">${esc(k)}<button type="button" aria-label="Remove ${esc(k)}">\u00d7</button></span>`;
function keywordEditor(list) {
  return `<div class="fld"><label for="kwInput">Keywords</label><div class="kw-edit" id="kwEdit">${list.map(kwChip).join('')}` +
    `<input id="kwInput" placeholder="Add a keyword" autocomplete="off" autocapitalize="off" spellcheck="false"></div>` +
    // (Suggested ones: see keywords.js.)
    `<div class="kw-sugs" id="kwSugs" hidden></div></div>`;
}
/* Keyword suggestions, under a box for adding keywords: the library's
   keywords that contain what's typed, those that start with it first.
   (Safari's own list, for an <input list=...>, came up blank.) */
const kwWrap = el => el.closest('.kw-edit, .kw-add-wrap');
function kwSuggest(input, have) {
  const wrap = kwWrap(input);
  let box = wrap.querySelector('.kw-sugg');
  if (!box) { box = document.createElement('div'); box.className = 'kw-sugg'; box.setAttribute('role', 'listbox'); wrap.appendChild(box); }
  const q = input.value.replace(/[;,]+$/, '').trim().toLowerCase(), hits = [];
  if (q) for (const k of KEYWORDS.keys()) {
    const i = k.toLowerCase().indexOf(q);
    if (i >= 0 && have.indexOf(k) < 0) hits.push([i ? 1 : 0, k]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  box.innerHTML = hits.slice(0, 8).map(x => `<button type="button" role="option" data-kw-pick="${esc(x[1])}">${esc(x[1])}</button>`).join('');
  box.hidden = !hits.length;
}
function kwSuggHide(input) { const w = kwWrap(input), b = w && w.querySelector('.kw-sugg'); if (b) b.hidden = true; }
// Up and down move through the suggestions, Escape puts them away: true
// if the key was for them.
function kwSuggKey(ev) {
  const w = kwWrap(ev.target), box = w && w.querySelector('.kw-sugg');
  if (!box || box.hidden) return false;
  const opts = [...box.children], i = opts.findIndex(o => o.classList.contains('on'));
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    const n = ev.key === 'ArrowDown' ? Math.min(opts.length - 1, i + 1) : Math.max(-1, i - 1);
    opts.forEach((o, j) => o.classList.toggle('on', j === n));
    if (n >= 0) opts[n].scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); box.hidden = true; return true; }
  return false;
}
// The suggestion picked with the arrow keys, if any.
const kwSuggOn = input => { const w = kwWrap(input), o = w && w.querySelector('.kw-sugg:not([hidden]) .on'); return o ? o.dataset.kwPick : ''; };
// (Pressed, the input keeps the focus, and the keyboard stays up.)
document.addEventListener('mousedown', ev => { if (ev.target.closest('[data-kw-pick]')) ev.preventDefault(); });
document.addEventListener('click', ev => {
  const p = ev.target.closest('[data-kw-pick]');
  if (!p) return;
  const input = kwWrap(p).querySelector('input');
  if (input.id === 'kwInput') { addKeyword(p.dataset.kwPick); input.focus(); return; }
  const e = BYKEY.get(state.selKey);
  if (e) addDetailKeyword(e, p.dataset.kwPick, input);
});
// Adding a keyword from the details: the + Keyword chip opens a box.
function openKwAdd(btn) {
  const wrap = btn.parentElement;
  btn.hidden = true;
  wrap.insertAdjacentHTML('beforeend', `<input class="kw-add-input" type="text" placeholder="Add a keyword" aria-label="Add a keyword" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">`);
  wrap.querySelector('.kw-add-input').focus();
}
function closeKwAdd(input) {
  const wrap = kwWrap(input);
  if (!wrap) return;
  const b = wrap.querySelector('.kw-sugg');
  if (b) b.remove();
  input.remove();
  wrap.querySelector('[data-kw-add]').hidden = false;
}
function addDetailKeyword(e, v, input) {
  v = v.replace(/[;,]+$/, '').trim();
  const raw = rawOf(e, 'keywords'), have = splitKw(raw);
  if (!v || have.indexOf(v) >= 0) { closeKwAdd(input); return; }
  input.disabled = true;
  kwSuggHide(input);
  have.push(v);
  quickSet(e, { keywords: have.join(/,/.test(raw) && !/;/.test(raw) ? ', ' : '; ') }, 'Added the keyword \u201c' + v + '\u201d');
}
const starButtons = r => [1, 2, 3, 4, 5].map(i => `<button type="button" data-star="${i}" aria-label="${i} star${i > 1 ? 's' : ''}">${i <= r ? '\u2605' : '\u2606'}</button>`).join('');

function showSheet(html, saveLabel) {
  // (Never busy to start with, whatever the last one was left as.)
  sheetBusy(false);
  // (On an iPad or computer, a panel over the library; a phone's fills the
  // screen.)
  $('#sheet').classList.remove('head-mode', 'compact', 'join-sheet');
  $('#sheet').classList.add('pop');
  $('#sheetBody').innerHTML = html;
  $('#sheetSave').textContent = saveLabel;
  $('#sheetSave').hidden = false;
  $('#sheetCancel').hidden = false;
  $('#sheetCancel').textContent = 'Cancel';
  sheetMsg('');
  $('#sheet').hidden = false;
  $('#sheet').scrollTop = $('#sheetForm').scrollTop = 0;
  closeDrawer();
  const first = $('#sheetBody').querySelector('input[type="text"], textarea');
  if (first && !coarseMQ.matches) first.focus();
}
function sheetMsg(msg, isError) {
  const e = $('#sheetError'), s = $('#sheetStatus');
  e.hidden = !(isError && msg); e.textContent = isError ? msg : '';
  s.hidden = !(!isError && msg); s.textContent = isError ? '' : msg || '';
  // (What's happening shows on the busy button too: the line here can be
  // far down the form, and isn't scrolled to then.)
  const busy = $('#sheet').querySelectorAll('.btn.busy');
  if (msg && !isError) busy.forEach(b => { b.textContent = msg; });
  // In Add, a pop-up over the form instead (its lookups are at the top,
  // and the line is at the foot of a long form: no jump down to it),
  // with a spinner while it's still at work.
  if (sheet && sheet.mode === 'add') {
    if (msg) toast(msg, isError ? 6000 : /\u2026$/.test(msg) ? 30000 : 4000, null, !isError && /\u2026$/.test(msg));
    else if ($('#toast').classList.contains('busy')) $('#toast').classList.remove('show');
    return;
  }
  // (The form can be long, with Add at the top.)
  if (msg && (isError || !busy.length)) (isError ? e : s).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function sheetBusy(on) {
  $('#sheetSave').disabled = $('#sheetCancel').disabled = on;
  $('#sheetBody').querySelectorAll('.sheet-go, .sheet-x').forEach(b => { b.disabled = on; });
  // While saving, the Save (or Add) button says so, with a spinner, and
  // the form fades.
  $('#sheet').classList.toggle('saving', on);
  [$('#sheetSave'), ...$('#sheetBody').querySelectorAll('.sheet-go')].forEach(b => {
    if (on && !b.classList.contains('busy')) { b.dataset.label = b.textContent; b.classList.add('busy'); b.textContent = 'Saving\u2026'; }
    else if (!on && b.classList.contains('busy')) { b.classList.remove('busy'); b.textContent = b.dataset.label; }
  });
}
// (A panel opened from a manuscript's report, Add say, goes back to the
// report when it closes, saved or not.)
function closeSheet() {
  const back = sheet && sheet.msBack, np = sheet && sheet.npBack, info = sheet && sheet.infoBack;
  // (Add's "Scanning text\u2026" and the like go with it.)
  if (sheet && sheet.mode === 'add' && $('#toast').classList.contains('busy')) $('#toast').classList.remove('show');
  $('#sheet').hidden = true;
  undockSheet();
  sheet = null;
  if (back) setTimeout(() => { if (!sheet) msReturn(back); }, 0);
  // (And one opened from New papers, back to New papers.)
  if (np) setTimeout(() => { if (!sheet) openNewPapers(); }, 0);
  // (Edit from the reader's Info: Info shows what was saved.)
  // (A moment later: Edit closes its panel just before the change is applied.)
  if (info) setTimeout(() => { if (SIDE.tab === 'info' && !$('#vSide').hidden) showInfo(); }, 0);
}

// Edit, from the reader: the panel in the reader's sidebar, in place of
// what it shows (its tabs still there), the sidebar widened for it while
// it's open (as it was, after). Put back where it was when it closes.
const DOCK = { home: null, width: null };
function dockSheet() {
  const el = $('#sheet'), side = $('#vSide'), viewer = $('#viewer');
  if (el.classList.contains('in-side')) return;
  if (side.hidden) toggleSide(true);
  DOCK.home = el.nextSibling;
  DOCK.width = viewer.style.getPropertyValue('--side-w');
  const w = side.getBoundingClientRect().width;
  if (w < 380) viewer.style.setProperty('--side-w', Math.min(380, Math.max(w, innerWidth * 0.45)) + 'px');
  side.classList.add('editing');
  side.appendChild(el);
  el.classList.remove('pop');
  el.classList.add('in-side');
  el.scrollTop = 0;
  refit();
}
// (Another tab, or the sidebar closed, while editing: Edit is cancelled.)
document.addEventListener('click', ev => {
  if ($('#sheet').classList.contains('in-side') && ev.target.closest('#vSide [data-vtab], #vSideBtn')) closeSheet();
}, true);
function undockSheet() {
  const el = $('#sheet');
  if (!el.classList.contains('in-side')) return;
  el.classList.remove('in-side');
  $('#vSide').classList.remove('editing');
  document.body.insertBefore(el, DOCK.home && DOCK.home.parentNode === document.body ? DOCK.home : null);
  const viewer = $('#viewer');
  if (DOCK.width) viewer.style.setProperty('--side-w', DOCK.width); else viewer.style.removeProperty('--side-w');
  refit();
}

// The top row of the Add and Edit forms: Cancel, the title, and the button
// that saves (which submits the form).
const sheetHead = (title, go) => `<div class="sheet-head"><button type="button" class="tb-btn sheet-x" data-sheet-cancel aria-label="Cancel" title="Cancel"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` +
  `<h2>${title}</h2><button type="submit" class="btn primary sheet-go">${go}</button></div>`;
function openEdit(e) {
  // (Not while its last changes are still being saved.)
  if (SAVING.has(e.k)) { toast('Still saving the last changes to \u201c' + shortTitle(e.f.title || e.k) + '\u201d; a moment\u2026', 2500); return; }
  sheet = { mode: 'edit', entry: e };
  const rating = parseInt(e.f.rating, 10) || 0;
  let h = sheetHead('Edit publication', 'Save');
  h += `<div class="fld-row rate-row"><div class="rate"><span class="lbl">Rating</span><div class="stars-edit" id="starsEdit" data-rating="${rating}">${starButtons(rating)}</div></div>` +
    `<label class="check"><input type="checkbox" id="readBox"${e.f.read === '1' ? ' checked' : ''}> Read</label></div>`;
  // The cite key: changed with the rest (only straight into the .bib).
  const keyOk = !e.ib;
  const keyFld = `<div class="fld"><label for="editKey">Cite key</label><input id="editKey" class="key-fld" type="text" value="${esc(e.k)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"` +
    (keyOk ? '' : ` disabled title="Move it into your library to change its cite key"`) + `></div>`;
  h += `<div class="fields-grid">${keyFld}${fieldsHtml(formFieldNames(e.t, n => rawOf(e, n)), n => rawOf(e, n))}</div>`;
  h += keywordEditor(splitKw(rawOf(e, 'keywords')));
  if (!e.ib && GROUPS.length) {
    h += `<fieldset class="fld grp-fieldset"><legend>Static groups</legend><div class="grp-checks">` +
      GROUPS.map(g => `<label class="check"><input type="checkbox" data-group="${esc(g.name)}"${(e.groups || []).indexOf(g.name) >= 0 ? ' checked' : ''}> ${esc(g.name)}</label>`).join('') +
      `</div></fieldset>`;
  }
  // (A panel over the library, like Add; a phone's fills the screen.)
  showSheet(h, 'Save');
  $('#sheet').classList.add('head-mode', 'compact');
  // (Authors saved as a list in prose: offered as BibTeX has them, to save.)
  $('#sheetBody').querySelectorAll('[data-field="author"], [data-field="editor"]').forEach(el => namesTidy(el, true));
  // (From the reader: in its sidebar, beside the paper; not on a phone.)
  if (!$('#viewer').hidden && !phoneMQ.matches) dockSheet();
  kwsSheet();
  // Fill in, next to the DOI: what Crossref has for the empty fields.
  const doi = $('#fld-doi');
  if (doi) {
    const row = document.createElement('div');
    row.className = 'doi-row';
    doi.replaceWith(row);
    row.append(doi);
    row.insertAdjacentHTML('beforeend', `<button type="button" class="btn" id="editDoiGo" title="Fill in the empty fields from the DOI">Fill in</button>`);
  }
}
// Edit's Fill in: puts what Crossref has into the form's empty fields
// (adding any the form doesn't show), without saving; nothing already
// filled in changes.
async function lookupIntoEdit() {
  const doi = $('#fld-doi').value.trim(), btn = $('#editDoiGo');
  if (!doi) { sheetMsg('Type or paste a DOI first.', true); return; }
  btn.disabled = true;
  sheetMsg('Looking up the DOI\u2026');
  try {
    const r = await callServer('lookupDoi', doi), filled = [];
    Object.keys(r.fields).forEach(n => {
      if (n === 'doi') return;
      let v = r.fields[n];
      if (n === 'month') v = tidyMonth(v);
      let el = $('#sheetBody').querySelector(`[data-field="${n}"]`);
      if (el && el.value.trim()) return;
      if (!el) {
        const grid = $('#sheetBody .fields-grid'), before = grid.querySelector('[data-field="abstract"]');
        const tmp = document.createElement('div');
        tmp.innerHTML = fieldInput(n, '');
        grid.insertBefore(tmp.firstChild, before ? before.closest('.fld') : null);
        el = $('#sheetBody').querySelector(`[data-field="${n}"]`);
      }
      el.value = v;
      el.classList.add('just-filled');
      filled.push((FIELD_LABELS[n] || n));
    });
    const said = filled.map(l => (l === l.toUpperCase() ? l : l.toLowerCase()));
    sheetMsg(filled.length
      ? 'Filled in the ' + (said.length > 1 ? said.slice(0, -1).join(', ') + ' and ' + said[said.length - 1] : said[0]) + ' from ' + (r.source || 'Crossref') + '. Check them, then save.'
      : 'Nothing to fill in: ' + (r.source || 'Crossref') + ' has nothing for the empty fields.');
  } catch (err) {
    sheetMsg(errText(err), true);
  } finally {
    btn.disabled = false;
  }
}

function openAdd(pdf) {
  sheet = { mode: 'add', pdf: null };
  const h = sheetHead('Add a publication', 'Add to library') +
    `<div class="fld"><label for="doiLookup">From a title, DOI or BibTeX</label><div class="doi-row">` +
    `<input id="doiLookup" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="A title (and author), a DOI, ISBN or arXiv ID, or BibTeX" aria-controls="tsList">` +
    `<button type="button" class="btn" id="doiGo">Fill in</button>` +
    (navigator.clipboard && navigator.clipboard.readText ? `<button type="button" class="btn" id="bibPaste" title="Fill in from the DOI or BibTeX entry you copied">Paste</button>` : '') +
    // (A photo of the paper or book: see titlesearch.js.)
    `<button type="button" class="btn photo-go" id="photoGo" title="From a photo of the paper or book" aria-label="From a photo">${ICON.camera}</button>` +
    `<input type="file" id="photoIn" accept="image/*" hidden>` +
    `</div><div class="ts-list" id="tsList" hidden></div></div>` +
    `<div class="fld"><label for="addType">Type</label><select id="addType">${TYPE_CHOICES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>` +
    `<div class="fields-grid" id="addFields"></div>` + keywordEditor([]) +
    `<div class="fld"><label for="addPdf">PDF <span class="opt">(optional)</span></label><div class="add-pdf-row"><input type="file" id="addPdf" accept="application/pdf,.pdf">` +
    // (Its free copy, or the article through your library: see findpdf.js.)
    `<details class="menu" id="addFind"><summary class="btn" title="Its free copy, or the article through your library">${FIND_ICON}<span>Find PDF</span>${ICON.chev}</summary><div class="menu-list" role="menu" id="addFindList"></div></details></div>` +
    `<p class="add-pdf-name" id="addPdfName" hidden></p></div>` +
    `<label class="check"><input type="checkbox" id="addRL">Put it on my reading list</label>`;
  showSheet(h, 'Add to library');
  $('#sheet').classList.add('head-mode', 'compact', 'pop');
  renderAddFields({});
  // (A PDF chosen here is read for its DOI or ISBN too, as one dropped is.)
  $('#addPdf').addEventListener('change', ev => { const f = ev.target.files[0]; if (f && sheet && f !== sheet.pdf) setAddPdf(f); });
  if (pdf) setAddPdf(pdf);
}
function renderAddFields(values) {
  const type = $('#addType').value;
  $('#addFields').innerHTML = fieldsHtml(formFieldNames(type, n => values[n]), n => values[n] || '');
  kwsSheet();
}
function sheetValues() {
  const vals = {};
  $('#sheetBody').querySelectorAll('[data-field]').forEach(el => { vals[el.dataset.field] = el.value.trim(); });
  return vals;
}
function addKeyword(v) {
  v = v.replace(/[;,]+$/, '').trim();
  const box = $('#kwEdit'), input = $('#kwInput');
  if (v && ![...box.querySelectorAll('.kw-chip')].some(c => c.dataset.kw === v)) input.insertAdjacentHTML('beforebegin', kwChip(v));
  input.value = '';
  kwSuggHide(input);
  kwsSheet();
}
function sheetKeywords() {
  const pending = $('#kwInput').value.trim();
  if (pending) addKeyword(pending);
  return [...$('#kwEdit').querySelectorAll('.kw-chip')].map(c => c.dataset.kw);
}

/* ------------------------------------------------------------ BibTeX pasted in */
const looksLikeBibtex = t => /@\s*[A-Za-z]+\s*[{(]/.test(t) && /=/.test(t);
// One BibTeX entry (the first, if there are several): {type, key, fields:
// {name: value as written in the .bib}, more: whether others follow}.
// Braces count as BibTeX counts them; a bare word (a month like jan, or an
// @string name) stays as it is, and parts joined with # are joined.
function parseBibtexEntry(s) {
  const head = /@\s*([A-Za-z]+)\s*([{(])/g;
  let m;
  while ((m = head.exec(s)) && /^(comment|string|preamble)$/i.test(m[1])) { /* skip */ }
  if (!m) return null;
  const close = m[2] === '{' ? '}' : ')', n = s.length;
  let i = head.lastIndex;
  const comma = s.indexOf(',', i);
  if (comma < 0) return null;
  const key = s.slice(i, comma).trim();
  i = comma + 1;
  const fields = {};
  for (;;) {
    while (i < n && /[\s,]/.test(s[i])) i++;
    if (i >= n || s[i] === close) break;
    const nm = /^([A-Za-z][\w\-:.+]*)\s*=\s*/.exec(s.slice(i, i + 300));
    if (!nm) break;
    i += nm[0].length;
    const parts = [];
    for (;;) {
      while (i < n && /\s/.test(s[i])) i++;
      if (s[i] === '{') {
        let d = 0, j = i;
        for (; j < n; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; }
        parts.push(s.slice(i + 1, j));
        i = j + 1;
      } else if (s[i] === '"') {
        let d = 0, j = i + 1;
        for (; j < n; j++) { if (s[j] === '{') d++; else if (s[j] === '}') d--; else if (s[j] === '"' && d === 0) break; }
        parts.push(s.slice(i + 1, j));
        i = j + 1;
      } else {
        const t = /^[\w\-.:+\/]+/.exec(s.slice(i, i + 300));
        if (!t) break;
        parts.push(t[0]);
        i += t[0].length;
      }
      while (i < n && /\s/.test(s[i])) i++;
      if (s[i] === '#') { i++; continue; }
      break;
    }
    fields[nm[1].toLowerCase()] = parts.join('').replace(/\s+/g, ' ').trim();
  }
  return { type: m[1].toLowerCase(), key, fields, more: /@\s*[A-Za-z]+\s*[{(]/.test(s.slice(i)) };
}
// Fields of BibDesk's own, and the dates, which LibLande sets itself.
const BIB_OWN = n => /^bdsk-/.test(n) || ['file', 'local-url', 'date-added', 'date-modified'].indexOf(n) >= 0;
function fillFromBibtex(text) {
  const p = parseBibtexEntry(text);
  if (!p || !Object.keys(p.fields).length) {
    sheetMsg('That doesn\u2019t look like a BibTeX entry. One starts like @article{key, and has fields like title = {\u2026}.', true);
    return;
  }
  const f = {};
  Object.keys(p.fields).forEach(n => { if (!BIB_OWN(n) && p.fields[n]) f[n] = p.fields[n]; });
  const kws = splitKw(f.keywords);
  delete f.keywords;
  const sel = $('#addType');
  if (![...sel.options].some(o => o.value === p.type)) sel.add(new Option(p.type, p.type));
  sel.value = p.type;
  renderAddFields(f);
  // Fields the form has no box for go in too, as they are.
  const shown = new Set([...$('#sheetBody').querySelectorAll('[data-field]')].map(el => el.dataset.field));
  sheet.extra = {};
  Object.keys(f).forEach(n => { if (!shown.has(n)) sheet.extra[n] = f[n]; });
  $('#kwEdit').querySelectorAll('.kw-chip').forEach(c => c.remove());
  kws.forEach(addKeyword);
  $('#doiLookup').value = '';
  const extra = Object.keys(sheet.extra);
  const have = f.doi && ENTRIES.find(x => (x.f.doi || '').toLowerCase() === f.doi.toLowerCase());
  sheetMsg(have ? 'Already in your library: \u201c' + (have.f.title || have.k) + '\u201d. You can still add it.'
    : 'Filled in from the BibTeX' + (p.more ? ' (its first entry)' : '') + '.' +
      (extra.length ? ' Also kept, without a box here: ' + extra.join(', ') + '.' : '') + ' Check the details, then add it.', !!have);
}
// The box: a BibTeX entry, a DOI to look up, or a title to search for
// (see titlesearch.js); Return again on the same title goes into the list.
function fillFromBox() {
  const t = $('#doiLookup').value;
  if (looksLikeBibtex(t)) { tsClose(); fillFromBibtex(t); return; }
  if (tsIsQuery(t)) {
    const first = t.trim() === TS.q && $('#tsList .ts-item');
    if (first) first.focus(); else tsSearch(t);
    return;
  }
  tsClose();
  lookupIntoForm();
}
// Paste: what was copied, read straight from the clipboard. (Safari,
// and a web app added to the Dock, asks first with a Paste bubble, and
// may refuse: then the box is ready for \u2318V, which always works.)
// (Or what was read already, from +'s menu: the clipboard has to be
// asked at the tap itself.)
async function pasteIntoForm(read) {
  let t = '';
  try { t = await (read || navigator.clipboard.readText()); } catch (err) {
    const box = $('#doiLookup');
    box.focus(); box.select();
    sheetMsg(coarseMQ.matches ? 'The browser didn\u2019t let LibLande read what you copied. Touch and hold the box, then choose Paste.'
      : 'The browser didn\u2019t let LibLande read what you copied. Press \u2318V to paste it into the box.');
    return;
  }
  if (!t.trim()) { sheetMsg('Nothing has been copied. Copy a DOI or a BibTeX entry first.', true); return; }
  if (looksLikeBibtex(t)) { fillFromBibtex(t); return; }
  $('#doiLookup').value = t.trim().replace(/\s+/g, ' ');
  fillFromBox();
}

async function lookupIntoForm() {
  if (sheet) sheet.extra = {};
  const doi = $('#doiLookup').value.trim();
  if (!doi) { sheetMsg('Type a title, or paste a DOI or ISBN, first.', true); return; }
  $('#doiGo').disabled = true;
  sheetMsg(/^\s*(isbn|\d{9})/i.test(doi) ? 'Looking up the ISBN\u2026' : 'Looking up the DOI\u2026');
  try {
    const r = await callServer('lookupDoi', doi);
    $('#addType').value = TYPE_CHOICES.some(([v]) => v === r.type) ? r.type : 'misc';
    renderAddFields(r.fields);
    const digits = v => String(v || '').replace(/[^\dXx]/g, '').toUpperCase();
    const have = (r.fields.doi && ENTRIES.find(x => (x.f.doi || '').toLowerCase() === r.fields.doi.toLowerCase())) ||
      (r.fields.isbn && ENTRIES.find(x => String(x.f.isbn || '').split(/[,;\s]+/).map(digits).includes(r.fields.isbn)));
    sheetMsg(have ? 'Already in your library: \u201c' + (have.f.title || have.k) + '\u201d. You can still add it.'
      : 'Filled in from ' + (r.source || 'Crossref') + '. Check the details, then add it.', !!have);
    return true;
  } catch (err) {
    sheetMsg(errText(err), true);
    return false;
  } finally {
    $('#doiGo').disabled = false;
  }
}

async function uploadPdf(file, name, info) {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [info.folderId], mimeType: 'application/pdf' })], { type: 'application/json' }));
  form.append('file', file);
  const r = await fetch('https:\/\/www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: 'Bearer ' + info.token }, body: form });
  if (!r.ok) throw new Error('Google Drive didn\u2019t accept the PDF (error ' + r.status + ').');
  return r.json();
}

// After a save: rebuild (right away when it can), then load the result.
async function afterWrite() {
  try {
    status = await callServer('refreshNow');
    setReading(status.reading);
    if (status.building) await waitForBuild();
    if (status.stamp !== loadedStamp) await update();
  } catch (err) {
    /* The next refresh picks the change up. */
  }
}

function applyLocal(e, set, add, remove) {
  setFields(e, set);
  (DATA.groups || []).forEach(g => {
    if (add.indexOf(g.name) >= 0 && g.keys.indexOf(e.k) < 0) g.keys.push(e.k);
    if (remove.indexOf(g.name) >= 0) g.keys = g.keys.filter(k => k !== e.k);
  });
  init(DATA, true);
}

// A new static group, named right in the sidebar: the + opens a name box
// at the top of the static groups, with a tick box to include the
// publications picked in selection mode (or else the one selected); Return
// or the tick makes it, Esc or the cross cancels. (Publications in the
// LibLande inbox can't go in: they aren't in the .bib yet.)
const NG = { open: false, name: '', with: true, busy: false, error: '', focus: false };
function newGroupItems() {
  const keys = state.picking && state.picked.size ? Array.from(state.picked) : state.selKey ? [state.selKey] : [];
  return keys.map(k => BYKEY.get(k)).filter(e => e && !e.ib);
}
function newGroupRow() {
  const items = newGroupItems();
  const cut = t => (t.length > 34 ? t.slice(0, 33) + '\u2026' : t);
  const withLabel = items.length === 1 ? 'With \u201c' + esc(cut(items[0].f.title || items[0].k)) + '\u201d' : 'With the ' + items.length + ' selected';
  return `<div class="ng-row"><div class="ng-line">${ICON.folder}` +
    `<input id="ngName" type="text" placeholder="New group name" autocomplete="off" spellcheck="false" value="${esc(NG.name)}"${NG.busy ? ' disabled' : ''} aria-label="New static group name">` +
    `<button type="button" class="ng-btn ng-go" data-ng-go title="Create (Return)" aria-label="Create the group"${NG.busy ? ' disabled' : ''}><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>` +
    `<button type="button" class="ng-btn" data-ng-cancel title="Cancel (Esc)" aria-label="Cancel"${NG.busy ? ' disabled' : ''}><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>` +
    (items.length ? `<label class="ng-with"><input type="checkbox" id="ngWith"${NG.with ? ' checked' : ''}${NG.busy ? ' disabled' : ''}> ${withLabel}</label>` : '') +
    `<p class="ng-msg${NG.error ? ' err' : ''}" id="ngError"${NG.error || NG.busy ? '' : ' hidden'}>${esc(NG.error || (NG.busy ? 'Creating\u2026' : ''))}</p></div>`;
}
function openNewGroup() {
  Object.assign(NG, { open: true, name: '', with: true, busy: false, error: '', focus: true });
  renderGroups();
}
function closeNewGroup() {
  if (NG.busy) return;
  NG.open = false;
  renderGroups();
}
async function createNewGroup() {
  if (NG.busy) return;
  const name = NG.name.trim();
  const fail = msg => { NG.error = msg; NG.busy = false; NG.focus = true; renderGroups(); };
  if (!name) return fail('Give the group a name.');
  if (name.length > 120) return fail('That name is too long (120 characters at most).');
  if (GROUPS.some(g => g.name === name)) return fail('There\u2019s already a group called \u201c' + name + '\u201d.');
  const items = NG.with ? newGroupItems() : [], keys = items.map(e => e.k);
  NG.busy = true; NG.error = '';
  renderGroups();
  try {
    const now = bibdeskTime();
    const res = await callServer('createGroup', { name, keys, modified: now, backupName: fileTime() });
    const what = items.length === 1 ? ', with \u201c' + (items[0].f.title || items[0].k) + '\u201d in it' : items.length ? ', with ' + items.length + ' publications in it' : '';
    Object.assign(NG, { open: false, busy: false, name: '' });
    if (res && res.queued) {
      DATA.groups = (DATA.groups || []).concat([{ name, keys: keys.slice() }]);
      init(DATA, true);
      toast('Created \u201c' + name + '\u201d on this device; it goes to Google Drive when you\u2019re back online', 5000);
    } else {
      DATA.groups = (DATA.groups || []).concat([{ name, keys: keys.slice() }]);
      if (res && res.gh) DATA.gh = res.gh;
      if (res && res.stamp) lastBibStamp = res.stamp;
      items.forEach(e => {
        setFields(e, { 'date-modified': now });
        if (res && res.hashes && res.hashes[e.k]) e.h = res.hashes[e.k];
      });
      init(DATA, true);
      toast('Created the static group \u201c' + name + '\u201d' + what, 3000);
      afterWrite();
    }
    if (state.picking && items.length) setPicking(false);
    setGroup('s:' + name);
  } catch (err) {
    fail(errText(err));
  }
}
async function saveEdit() {
  $('#sheetBody').querySelectorAll('[data-field="author"], [data-field="editor"]').forEach(el => namesTidy(el, false));
  const e = sheet.entry, vals = sheetValues(), set = {};
  Object.keys(vals).forEach(n => { if (vals[n] !== rawOf(e, n).trim()) set[n] = vals[n]; });
  const oldKwRaw = rawOf(e, 'keywords'), kws = sheetKeywords();
  if (splitKw(oldKwRaw).join('\n') !== kws.join('\n')) set.keywords = kws.join(/,/.test(oldKwRaw) && !/;/.test(oldKwRaw) ? ', ' : '; ');
  const rating = +$('#starsEdit').dataset.rating, oldRating = parseInt(e.f.rating, 10) || 0;
  if (rating !== oldRating) set.rating = rating || e.f.rating != null ? String(rating) : '';
  const read = $('#readBox').checked;
  if (read !== (e.f.read === '1')) set.read = read ? '1' : '0';
  const add = [], remove = [];
  $('#sheetBody').querySelectorAll('[data-group]').forEach(cb => {
    const was = (e.groups || []).indexOf(cb.dataset.group) >= 0;
    if (cb.checked && !was) add.push(cb.dataset.group);
    if (!cb.checked && was) remove.push(cb.dataset.group);
  });
  const keyBox = $('#editKey'), newKey = keyBox && !keyBox.disabled ? keyBox.value.trim() : e.k, rename = newKey !== e.k;
  if (!Object.keys(set).length && !add.length && !remove.length && !rename) { closeSheet(); toast('No changes to save', 1800); return; }
  if (rename) {
    const why = keyProblem(newKey, e);
    if (why) { sheetMsg(why, true); keyBox.focus(); return; }
  }
  if ('title' in set && !set.title) { sheetMsg('A publication needs a title.', true); return; }
  const bad = Object.keys(set).find(n => !balanced(set[n]));
  if (bad) { sheetMsg('The ' + (FIELD_LABELS[bad] || bad) + ' field has unbalanced braces { }. Check it and try again.', true); return; }
  // The panel closes, and the save goes on with a bar to say so; if it
  // fails, Try again opens the panel again as you left it.
  const snap = { vals, kws, rating, read, groups: [...$('#sheetBody').querySelectorAll('[data-group]')].filter(cb => cb.checked).map(cb => cb.dataset.group), key: newKey };
  const name = '\u201c' + shortTitle(vals.title || e.f.title || e.k) + '\u201d';
  closeSheet();
  SAVING.add(e.k);
  toast('Saving changes to ' + name + '\u2026', 0, null, true);
  let saved = false;
  try {
    const changed = Object.keys(set).length || add.length || remove.length;
    const done = changed ? await inTurn(() => writeEdit(e, set, add, remove)) : '';
    saved = true;
    infoAgain();
    if (!rename) { toast(done, 2500); return; }
    toast('Changing the cite key of ' + name + '\u2026', 0, null, true);
    const old = e.k, res = await inTurn(() => renameCore(e, newKey));
    infoAgain();
    renameSaid(old, newKey, res);
  } catch (err) {
    toast((saved ? 'The other changes to ' + name + ' were saved, but the cite key wasn\u2019t: ' : 'Couldn\u2019t save ' + name + ': ') + errText(err), 12000,
      { label: 'Try again', run: () => { const now = BYKEY.get(e.k) || e; if (saved) snap.vals = null; reopenEdit(now, snap, errText(err)); } });
  } finally {
    SAVING.delete(e.k);
  }
}
// Saves still going on (after their panels closed): by publication. Each
// goes in its turn, after those before it, so it's made from the library
// as they left it (its static groups, the cite keys taken).
const SAVING = new Set();
let saveTurn = Promise.resolve();
const inTurn = fn => { const run = saveTurn.then(fn, fn); saveTurn = run.catch(() => {}); return run; };
const shortTitle = t => { t = String(t).replace(/[{}]/g, ''); return t.length > 60 ? t.slice(0, 57).replace(/\s+\S*$/, '') + '\u2026' : t; };
// (The reader's Citation tab, if it's showing, with what was saved.)
const infoAgain = () => { if (SIDE.tab === 'info' && !$('#viewer').hidden && !$('#vSide').hidden) showInfo(); };
// Edit opened again as it was left (snap: from saveEdit; its fields
// left as they are if they were saved), with why it didn't save.
function reopenEdit(e, snap, why) {
  openEdit(e);
  if (!sheet || sheet.mode !== 'edit') return;
  const body = $('#sheetBody');
  if (snap.vals) Object.keys(snap.vals).forEach(n => { const el = body.querySelector(`[data-field="${CSS.escape(n)}"]`); if (el) el.value = snap.vals[n]; });
  $('#kwEdit').querySelectorAll('.kw-chip').forEach(c => c.remove());
  snap.kws.forEach(addKeyword);
  $('#starsEdit').dataset.rating = snap.rating;
  $('#starsEdit').innerHTML = starButtons(snap.rating);
  $('#readBox').checked = snap.read;
  body.querySelectorAll('[data-group]').forEach(cb => { cb.checked = snap.groups.includes(cb.dataset.group); });
  if ($('#editKey') && !$('#editKey').disabled) $('#editKey').value = snap.key;
  sheetMsg(why, true);
}
// Saves changed fields (and static groups) of a publication: as a pending
// edit, or straight into the .bib (or inbox). before() runs once the save
// has gone through, before the page updates. Returns what to tell you.
async function writeEdit(e, set, add, remove, before) {
  if (set.month) set.month = tidyMonth(set.month);
  const now = bibdeskTime();
  const res = await callServer('saveEntry', {
    where: e.ib ? 'inbox' : 'main', key: e.k, set, groups: { add, remove },
    expectStamp: e.ib ? null : Math.max(typeof DATA.built === 'number' ? DATA.built : 0, lastBibStamp),
    expectHash: e.h || null,
    expectGroupsHash: add.length || remove.length ? DATA.gh || null : null,
    modified: now, backupName: fileTime(),
  });
  if (!e.ib && res && res.stamp) lastBibStamp = res.stamp;
  if (res && res.hash) e.h = res.hash;
  if (res && res.groupsHash && !e.ib) DATA.gh = res.groupsHash;
  if (before) before();
  applyLocal(e, Object.assign({}, set, { 'date-modified': now }), add, remove);
  // (Offline: kept on this device, and saved when it's back online.)
  if (res && res.queued) { e.offline = true; renderDetail(); return 'Saved on this device; it goes to ' + (e.ib ? 'your inbox' : DATA.source) + ' when you\u2019re back online'; }
  afterWrite();
  return e.ib ? 'Saved to your inbox' : 'Saved to ' + DATA.source;
}
// The rating and Read on the details' date line.
// Saves at once, then offers Undo (which puts back what was there).
async function quickSet(e, set, msg, undoing) {
  const meta = detailEl.querySelector('.d-meta') || document.createElement('div');
  if (meta.classList.contains('busy')) return;
  meta.classList.add('busy');
  const before = {};
  Object.keys(set).forEach(n => { before[n] = rawOf(e, n).trim(); });
  toast('Saving\u2026', 0);
  try {
    const done = await writeEdit(e, set, [], []);
    if (undoing) toast('Undone', 2000);
    else toast(msg || done, 6000, { label: 'Undo', run: () => { const now = BYKEY.get(e.k); if (now) quickSet(now, before, null, true); } });
  } catch (err) {
    toast('Couldn\u2019t save: ' + errText(err), 5000);
    renderDetail();
  } finally {
    meta.classList.remove('busy');
  }
}

// A publication as the library shows it, from the fields of a new one.
function newEntry(type, key, vals, now, inbox) {
  const e = { k: key, t: type, f: {} };
  if (inbox) e.ib = 1;
  Object.keys(vals).forEach(n => {
    e.f[n] = AREA_FIELDS.has(n) ? vals[n] : shownValue(vals[n]);
    if (e.f[n] !== vals[n]) (e.r = e.r || {})[n] = vals[n];
  });
  if (vals.author) e.a = parseNamesLite(vals.author);
  if (vals.editor) e.e = parseNamesLite(vals.editor);
  if (vals.url) e.u = [vals.url];
  e.f['date-added'] = e.f['date-modified'] = now;
  return e;
}
async function saveAdd() {
  $('#sheetBody').querySelectorAll('[data-field="author"], [data-field="editor"]').forEach(el => namesTidy(el, false));
  const type = $('#addType').value, vals = sheetValues();
  if (!vals.title) { sheetMsg('A publication needs a title.', true); return; }
  const kws = sheetKeywords();
  if (kws.length) vals.keywords = kws.join('; ');
  // (Fields from a pasted BibTeX entry that the form has no box for.)
  Object.keys(sheet.extra || {}).forEach(n => { if (!vals[n]) vals[n] = sheet.extra[n]; });
  // (A chapter added from its book: linked to it. Another chapter whose
  // book is in the library, found by its title: linked to it too, and its
  // book details it lacks filled in from the book; see chapters.js.)
  if (sheet.chapterOf && BYKEY.has(sheet.chapterOf)) vals.crossref = sheet.chapterOf;
  const bookOf = !vals.crossref && (type === 'incollection' || type === 'inbook') ? lcBookFor(vals) : null;
  if (bookOf) Object.assign(vals, lcFill(vals, bookOf));
  if (vals.month) vals.month = tidyMonth(vals.month);
  Object.keys(vals).forEach(n => { if (!vals[n]) delete vals[n]; });
  // Already in the library? Say so once; a second press adds it anyway.
  const mine = dupKeys({ f: vals, a: vals.author ? parseNamesLite(vals.author) : null, e: vals.editor ? parseNamesLite(vals.editor) : null });
  const draft = { f: vals };
  const same = ENTRIES.find(x => dupKeys(x).some(k => mine.indexOf(k) >= 0) && !differentBooks(draft, x));
  if (same && sheet.dupWarned !== same.k) {
    sheet.dupWarned = same.k;
    sheetMsg('This looks like \u201c' + (same.f.title || same.k) + '\u201d (' + (same.authorsShort || same.k) + (same.f.year ? ', ' + same.f.year : '') + '), already in your ' + (same.ib ? 'inbox' : 'library') + '. Press ' + $('#sheetSave').textContent + ' again to add it anyway.', true);
    return;
  }
  const bad = Object.keys(vals).find(n => !balanced(vals[n]));
  if (bad) { sheetMsg('The ' + (FIELD_LABELS[bad] || bad) + ' field has unbalanced braces { }. Check it and try again.', true); return; }
  let key = makeCiteKey(vals);
  let pdf = $('#addPdf').files[0] || sheet.pdf;
  const toRead = $('#addRL').checked;
  // (A chapter's pages from its book's PDF, unless a PDF was chosen.)
  if (!pdf && chPdfWanted()) {
    const s = sheet;
    $('#sheetSave').disabled = true;
    sheetMsg('Taking the chapter\u2019s pages from the book\u2019s PDF\u2026');
    try { pdf = await chPdfFile(); } catch (err) { if (sheet === s) { $('#sheetSave').disabled = false; sheetMsg('Couldn\u2019t take the pages from the book\u2019s PDF: ' + errText(err), true); } return; }
    if (sheet !== s) return;
    $('#sheetSave').disabled = false;
  }
  if (pdf && isOffline()) { sheetMsg('Adding a publication with its PDF needs a connection. Add it without the PDF now, and attach the PDF when you\u2019re back online.', true); return; }
  // The panel closes, and the adding goes on with a bar to say so; if it
  // fails, Try again opens the panel again as you left it.
  const snap = { type, vals: Object.assign({}, vals), pdf, toRead, dup: sheet.dupWarned }, name = '\u201c' + shortTitle(vals.title) + '\u201d';
  closeSheet();
  try {
    let upload = null, pdfName = null;
    if (pdf) {
      toast('Uploading the PDF for ' + name + '\u2026', 0, null, true);
      const info = await callServer('getInboxUploadInfo');
      pdfName = key + '.pdf';
      upload = await uploadPdf(pdf, pdfName, info);
    }
    toast('Adding ' + name + '\u2026', 0, null, true);
    // (Its cite key made in its turn, after any added before it.)
    const now = bibdeskTime();
    const res = await inTurn(() => { key = makeCiteKey(vals); return callServer('addToMain', { type, key, fields: vals, uploadId: upload && upload.id, prefix: papersPrefix(), now, backupName: fileTime() }); });
    const e = newEntry(type, key, vals, now, false);
    e.h = res.hash;
    if (res && res.queued) e.offline = true;
    if (res.file) e.files = [res.file];
    DATA.entries.push(e);
    init(DATA, true);
    toast('', 1);
    // (Shown, unless you've gone on to something else meanwhile.)
    if (!sheet && $('#viewer').hidden) {
      setGroup('all');
      state.selKey = key;
      renderDetail();
      revealSelected();
      if (phoneMQ.matches) go('detail');
    }
    if (toRead) rlAdd(key);
    if (res && res.queued) { showDone(vals.title, 'Added on this device; it goes to ' + DATA.source + ' when you\u2019re back online'); return; }
    showDone(vals.title, 'Added to ' + DATA.source + (res.file ? ', with its PDF in ' + res.file.p.replace(/[/][^/]*$/, '') : '') +
      (bookOf ? '; linked to its book, \u201c' + shortTitle(bookOf.f.title || bookOf.k) + '\u201d' : ''));
    afterWrite();
    // (A book: its chapters already in the library, offered to link.)
    if (isBook(e)) setTimeout(() => lcOfferFor(e), 1200);
  } catch (err) {
    toast('Couldn\u2019t add ' + name + ': ' + errText(err), 12000, { label: 'Try again', run: () => reopenAdd(snap, errText(err)) });
  }
}
// Add opened again as it was left, with why it didn't add.
function reopenAdd(snap, why) {
  openAdd(snap.pdf || undefined);
  const sel = $('#addType');
  if (![...sel.options].some(o => o.value === snap.type)) sel.add(new Option(snap.type, snap.type));
  sel.value = snap.type;
  const f = Object.assign({}, snap.vals), kws = splitKw(f.keywords || '');
  delete f.keywords;
  renderAddFields(f);
  // (Fields the form has no box for, kept as they were.)
  const shown = new Set([...$('#sheetBody').querySelectorAll('[data-field]')].map(el => el.dataset.field));
  sheet.extra = {};
  Object.keys(f).forEach(n => { if (!shown.has(n)) sheet.extra[n] = f[n]; });
  if (f.crossref && BYKEY.has(f.crossref)) { sheet.chapterOf = f.crossref; delete sheet.extra.crossref; }
  kws.forEach(addKeyword);
  $('#addRL').checked = snap.toRead;
  sheet.dupWarned = snap.dup;
  sheetMsg(why, true);
}

$('#sheetForm').addEventListener('submit', ev => {
  ev.preventDefault();
  if (!sheet || $('#sheetSave').disabled) return;
  if (sheet.mode === 'edit') saveEdit(); else if (sheet.mode === 'forth') saveForth(); else if (sheet.mode === 'join') saveJoin(); else if (sheet.mode === 'export') runExport(); else if (sheet.mode === 'export-save') saveExport(); else if (sheet.mode === 'help' || sheet.mode === 'msreport' || sheet.mode === 'newpapers' || sheet.mode === 'qr') closeSheet(); else if (sheet.mode === 'npfollow') saveFollow(); else if (sheet.mode === 'mscheck') runMsCheck(); else if (sheet.mode === 'msfix') runMsFix(); else if (sheet.mode === 'smart') saveSmart(); else if (sheet.mode === 'bulk') saveBulk(); else if (sheet.mode === 'kwtidy') saveKwTidy(); else if (sheet.mode === 'linkch') saveLinkChapters(); else if (sheet.mode === 'attach') { const a = sheet, mode = ($('#sheetBody').querySelector('[name=attachMode]:checked') || {}).value; closeSheet(); runAttach(a.entry, a.file, mode === 'replace'); } else saveAdd();
});
$('#sheetCancel').addEventListener('click', closeSheet);
$('#sheetBody').addEventListener('click', ev => { const x = ev.target.closest('[data-sheet-cancel]'); if (x && !x.disabled) closeSheet(); });
$('#sheetBody').addEventListener('click', ev => {
  const star = ev.target.closest('[data-star]');
  if (star) {
    const box = $('#starsEdit'), n = +star.dataset.star;
    const r = +box.dataset.rating === n ? 0 : n;
    box.dataset.rating = r;
    box.innerHTML = starButtons(r);
    return;
  }
  const x = ev.target.closest('.kw-chip button');
  if (x) { x.parentElement.remove(); kwsSheet(); return; }
  if (ev.target.closest('#doiGo')) fillFromBox();
  if (ev.target.closest('#bibPaste')) pasteIntoForm();
  if (ev.target.closest('#editDoiGo')) lookupIntoEdit();
});
$('#sheetBody').addEventListener('keydown', ev => {
  if (ev.target.id === 'kwInput') {
    if (kwSuggKey(ev)) return;
    if (ev.key === 'Enter' || ev.key === ',' || ev.key === ';') { ev.preventDefault(); addKeyword(kwSuggOn(ev.target) || ev.target.value); }
    else if (ev.key === 'Backspace' && !ev.target.value) { const chips = $('#kwEdit').querySelectorAll('.kw-chip'); if (chips.length) chips[chips.length - 1].remove(); }
  }
  if (ev.target.id === 'doiLookup' && ev.key === 'Enter') { ev.preventDefault(); fillFromBox(); }
});
// A BibTeX entry pasted into the DOI box fills in the form at once (with
// its line breaks, which a one-line box would drop).
// (And \u2318V in Add, outside a box: into the DOI box, as if pasted
// there.)
document.addEventListener('paste', ev => {
  if (!sheet || sheet.mode !== 'add' || $('#sheet').hidden) return;
  const inBox = ev.target.id === 'doiLookup';
  if (!inBox && ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const t = ev.clipboardData && ev.clipboardData.getData('text');
  if (!t || !t.trim()) return;
  if (looksLikeBibtex(t)) { ev.preventDefault(); tsClose(); fillFromBibtex(t); return; }
  if (inBox) return;
  ev.preventDefault();
  $('#doiLookup').value = t.trim().replace(/\s+/g, ' ');
  fillFromBox();
});
$('#sheetBody').addEventListener('input', ev => {
  if (ev.target.id === 'kwInput') kwSuggest(ev.target, [...$('#kwEdit').querySelectorAll('.kw-chip')].map(c => c.dataset.kw));
});
$('#sheetBody').addEventListener('focusout', ev => {
  if (ev.target.id === 'kwInput') setTimeout(() => { if (document.activeElement !== ev.target) kwSuggHide(ev.target); }, 250);
});
$('#sheetBody').addEventListener('change', ev => {
  if (ev.target.id === 'kwInput' && KEYWORDS.has(ev.target.value.trim())) addKeyword(ev.target.value);
  if (ev.target.id === 'addType') {
    const vals = sheetValues();
    renderAddFields(vals);
  }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#sheet').hidden && !$('#sheetCancel').disabled) closeSheet(); });
$('#addBtn').addEventListener('click', () => {
  // (Not after a long press, which showed its menu.)
  if (AB.long) { AB.long = false; return; }
  openAdd();
});
// On a touch screen, + held: Paste (a BibTeX entry, a DOI or ISBN, or a
// title, from the clipboard) or From a photo (the camera, or a photo
// chosen), each opening Add with that under way. (On a phone, + can be
// in the toolbar's More menu: held there, the same; see addHold.)
const AB = { t: 0, long: false, x: 0, y: 0 };
function closeAddMenu() { const m = $('#addMenu'); if (m) m.remove(); $('#addMore').setAttribute('aria-expanded', 'false'); }
function openAddMenu(btn) {
  closeAddMenu();
  btn = btn || $('#addBtn');
  if ($('#addBtn').hidden) return;
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu link-menu recent-menu add-menu';
  m.id = 'addMenu';
  m.setAttribute('role', 'menu');
  m.setAttribute('aria-label', 'Add a publication');
  // (With a book selected, a chapter of it too, named by its title.)
  const sel = state.selKey && BYKEY.get(state.selKey), book = !state.picking && isBook(sel) && !sel.ib ? sel : null;
  m.innerHTML = `<div class="menu-head">Add a publication</div>` +
    (navigator.clipboard && navigator.clipboard.readText ? `<button type="button" role="menuitem" class="mi" data-add="paste">${ICON.paste}<span class="op-text"><span class="rc-title">Paste</span><span class="rc-sub">A BibTeX entry, DOI or title you copied</span></span></button>` : '') +
    `<button type="button" role="menuitem" class="mi" data-add="photo">${ICON.camera}<span class="op-text"><span class="rc-title">From a photo</span><span class="rc-sub">Take one, or choose one</span></span></button>` +
    (book ? `<button type="button" role="menuitem" class="mi" data-add="chapter">${ICON.addChapter}<span class="op-text"><span class="rc-title">Add a chapter</span><span class="rc-sub">To ${esc(shortTitle(book.f.title || book.k))}</span></span></button>` : '');
  document.body.appendChild(m);
  $('#addMore').setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  m.addEventListener('pointerenter', () => clearTimeout(AH.hide));
  m.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') AH.hide = setTimeout(closeAddMenu, 250); });
  m.addEventListener('keydown', ev => {
    const items = [...m.querySelectorAll('[data-add]')], i = items.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (i > 0) items[i - 1].focus(); }
  });
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-add]');
    if (!b) return;
    closeAddMenu();
    if (b.dataset.add === 'chapter') { if (book) openAddChapter(book); return; }
    if (b.dataset.add === 'paste') {
      // (Asked now, at the tap, as browsers require.)
      let read;
      try { read = navigator.clipboard.readText(); } catch (err) { read = Promise.reject(err); }
      read.catch(() => {});
      openAdd();
      pasteIntoForm(read);
    } else {
      openAdd();
      $('#photoIn').click();
    }
  });
}
// A + held (a finger or Pencil, not a mouse): its menu, under it; then
// AB.long, so the click that can follow the hold doesn't open Add too.
// (shown: what to do once it's held, as the More menu closing first.)
function addHold(btn, shown) {
  btn.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse') return;
    AB.long = false;
    AB.x = ev.clientX; AB.y = ev.clientY;
    clearTimeout(AB.t);
    AB.t = setTimeout(() => {
      AB.long = true;
      const r = btn.getBoundingClientRect();
      if (shown) shown();
      openAddMenu({ getBoundingClientRect: () => r });
    }, 450);
  });
  btn.addEventListener('pointermove', ev => { if (ev.pointerType !== 'mouse' && Math.hypot(ev.clientX - AB.x, ev.clientY - AB.y) > 10) clearTimeout(AB.t); });
  ['pointerup', 'pointercancel'].forEach(n => btn.addEventListener(n, ev => { if (ev.pointerType !== 'mouse') clearTimeout(AB.t); }));
  btn.addEventListener('contextmenu', ev => { if (AB.long || $('#addMenu')) ev.preventDefault(); });
}
addHold($('#addBtn'));
// With a mouse or trackpad, the menu comes when the pointer rests on +,
// and goes once it has left both (as the open papers' list does); or Down
// on + from the keyboard. On a touch screen (an iPad or iPhone), a \u25be
// beside + as well as holding it, as the open papers' button has.
const AH = { t: 0, hide: 0 };
$('#addBtn').addEventListener('pointerenter', ev => {
  if (ev.pointerType !== 'mouse') return;
  clearTimeout(AH.hide);
  if (!$('#addMenu')) { clearTimeout(AH.t); AH.t = setTimeout(() => openAddMenu(), 350); }
});
$('#addBtn').addEventListener('pointerleave', ev => {
  if (ev.pointerType !== 'mouse') return;
  clearTimeout(AH.t);
  AH.hide = setTimeout(closeAddMenu, 250);
});
// (A click on + opens Add, so the menu resting on it brought goes; not the
// click that can follow a hold, which showed the menu.)
$('#addBtn').addEventListener('click', () => { clearTimeout(AH.t); if (!AB.long) closeAddMenu(); }, true);
$('#addBtn').addEventListener('keydown', ev => { if (ev.key === 'ArrowDown') { ev.preventDefault(); openAddMenu(); const first = $('#addMenu [data-add]'); if (first) first.focus(); } });
$('#addMore').addEventListener('click', ev => {
  if ($('#addMenu')) { closeAddMenu(); return; }
  openAddMenu();
  if (ev.detail === 0) { const first = $('#addMenu [data-add]'); if (first) first.focus(); }
});
function addMoreShown() { $('#addMore').hidden = $('#addBtn').hidden || !coarseMQ.matches; }
new MutationObserver(addMoreShown).observe($('#addBtn'), { attributes: true, attributeFilter: ['hidden'] });
coarseMQ.addEventListener('change', addMoreShown);
addMoreShown();
document.addEventListener('pointerdown', ev => { if ($('#addMenu') && !ev.target.closest('#addMenu, #addBtn, #addMore')) closeAddMenu(); }, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#addMenu')) { ev.stopPropagation(); closeAddMenu(); } }, true);
window.addEventListener('resize', closeAddMenu);

// Rebuild and load the library without messages (nothing visible changes).
async function quietRefresh() {
  try {
    status = await callServer('refreshNow');
    setReading(status.reading);
    if (status.building) await waitForBuild();
    if (status.stamp !== loadedStamp) await update(true);
  } catch (err) {
    /* The next refresh or 10-minute check picks it up. */
  }
}


function setFields(e, set) {
  Object.keys(set).forEach(n => {
    const v = set[n];
    if (!v) { delete e.f[n]; if (e.r) delete e.r[n]; }
    else {
      const shown = AREA_FIELDS.has(n) ? v : shownValue(v);
      e.f[n] = shown;
      if (shown !== v) (e.r = e.r || {})[n] = v; else if (e.r) delete e.r[n];
    }
    if (n === 'author') { if (v) e.a = parseNamesLite(v); else delete e.a; }
    if (n === 'editor') { if (v) e.e = parseNamesLite(v); else delete e.e; }
  });
}


// Edits made with no connection, kept on this device until it's back (on
// GitHub Pages: server.js's window.liblandeOutbox), shown as made.
function overlayOffline(data) {
  const kept = window.liblandeOutbox ? window.liblandeOutbox() : [];
  if (!kept.length) return;
  const main = new Map(data.entries.filter(e => !e.ib).map(e => [e.k, e])), inbox = new Map(data.entries.filter(e => e.ib).map(e => [e.k, e]));
  kept.forEach(x => {
    const r = x.args[0] || {};
    // (Added, renamed and new groups first, in the order made.)
    if ((x.name === 'addToMain' || x.name === 'addToInbox') && !main.has(r.key) && !inbox.has(r.key)) {
      const e = newEntry(r.type, r.key, r.fields || {}, r.now, x.name === 'addToInbox');
      e.offline = true;
      data.entries.push(e);
      (x.name === 'addToInbox' ? inbox : main).set(r.key, e);
      return;
    }
    if (x.name === 'renameKey') {
      const e = main.get(r.key), to = String(r.newKey || '').trim();
      if (!e || !to || main.has(to)) return;
      e.k = to; e.offline = true;
      main.delete(r.key); main.set(to, e);
      (data.groups || []).forEach(g => { g.keys = g.keys.map(k => (k === r.key ? to : k)); });
      return;
    }
    if (x.name === 'createGroup') {
      if (!(data.groups || []).some(g => g.name === r.name)) (data.groups = data.groups || []).push({ name: r.name, keys: (r.keys || []).slice() });
      return;
    }
    if (x.name !== 'saveEntry') return;
    const e = (r.where === 'inbox' ? inbox : main).get(r.key);
    if (!e) return;
    e.offline = true;
    setFields(e, Object.assign({}, r.set || {}, r.modified ? { 'date-modified': r.modified } : {}));
    const add = (r.groups && r.groups.add) || [], remove = (r.groups && r.groups.remove) || [];
    (data.groups || []).forEach(g => {
      if (add.indexOf(g.name) >= 0 && g.keys.indexOf(e.k) < 0) g.keys.push(e.k);
      if (remove.indexOf(g.name) >= 0) g.keys = g.keys.filter(k => k !== e.k);
    });
  });
}
// The cloud in the toolbars: offline (struck through), or changes kept
// on this device and waiting to go to Drive: library changes (server.js's
// outbox) and papers whose marks are kept here (JOURNAL). A tap says what
// that means.
async function netBadge() {
  NET.changes = window.liblandeOutbox ? window.liblandeOutbox().length : 0;
  try { NET.papers = ((await JOURNAL.run('readonly', st => st.getAllKeys())) || []).filter(k => !String(k).startsWith('open:')).length; } catch (err) { NET.papers = 0; }
  netRender();
}
// The clouds as things are. The viewer's also says how the open paper's
// saving is going (it took over from a Save button): changes not yet on
// Drive (an arrow; a tap saves them now), saving (it pulses), saved (a
// tick, for a moment).
function netRender() {
  const off = isOffline(), n = NET.changes + NET.papers;
  document.querySelectorAll('[data-net]').forEach(b => {
    const viewer = b.id === 'vNetBadge', st = viewer && !$('#viewer').hidden ? NET.save : '';
    b.hidden = !gs || (!off && !n && !st);
    b.classList.toggle('off', off);
    ['unsaved', 'saving', 'saved'].forEach(c => b.classList.toggle(c, st === c && !off));
    b.querySelector('.net-n').textContent = n ? String(n) : '';
    b.title = st && !off ? saveText(st) : netText();
    b.setAttribute('aria-label', b.title);
  });
}
const saveText = st => st === 'saving' ? 'Saving this paper\u2019s marks to Google Drive\u2026' : st === 'saved' ? 'Saved to Google Drive'
  : 'This paper\u2019s changes aren\u2019t on Google Drive yet. They save on their own; tap to save them now (\u2318S).';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
function netText() {
  const parts = [NET.changes && plural(NET.changes, 'change to your library', 'changes to your library'), NET.papers && 'marks on ' + plural(NET.papers, 'paper', 'papers')].filter(Boolean);
  const waiting = parts.length ? parts.join(' and ') + (NET.changes + NET.papers === 1 && !NET.papers ? ' is' : ' are') + ' kept on this device' : '';
  if (isOffline()) return 'You\u2019re offline. ' + (waiting ? waiting.charAt(0).toUpperCase() + waiting.slice(1) + ', and go to Google Drive when you\u2019re back online.' : 'Changes you make are kept on this device until you\u2019re back online. Papers saved for offline reading open as usual.');
  return waiting ? waiting.charAt(0).toUpperCase() + waiting.slice(1) + ', waiting to go to Google Drive (they go on their own, soon).' : 'Everything is saved to Google Drive.';
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-net]');
  if (!b) return;
  // (The viewer's, with changes to save and Drive there: save them now.)
  if (b.id === 'vNetBadge' && NET.save === 'unsaved' && navigator.onLine) { saveMarkup().then(keptNote); return; }
  toast(b.classList.contains('unsaved') || NET.save === 'saving' ? saveText(NET.save) : netText(), 6000);
});
window.addEventListener('liblande-waiting', netBadge);
setInterval(() => { if (!document.hidden && gs) netBadge(); }, 20000);
// Back online: what was kept on this device has gone to Drive (or couldn't).
window.addEventListener('liblande-outbox', ev => {
  netBadge();
  const d = ev.detail || {}, n = d.saved || 0, failed = d.failed || [];
  let msg = n ? n + ' change' + (n === 1 ? '' : 's') + ' made offline ' + (n === 1 ? 'is' : 'are') + ' now saved to Google Drive.' : '';
  if (failed.length) {
    const who = failed.map(f => { const e = f.key && BYKEY.get(f.key); return e ? '\u201c' + (e.f.title || e.k) + '\u201d' : f.key; }).filter(Boolean);
    msg += (msg ? ' ' : '') + failed.length + ' couldn\u2019t be' + (who.length ? ' (' + who.slice(0, 3).join(', ') + (who.length > 3 ? '\u2026' : '') + ')' : '') + ': ' + failed[0].reason;
  }
  toast(msg, failed.length ? 10000 : 5000);
  afterWrite();
});




/* ------------------------------------------------------------ selecting several */
// Select mode (the toolbar's Select button, or Cmd/Ctrl-click and
// Shift-click on a computer) picks several publications for export or
// copying. Picks are kept by cite key, so they survive searches and groups.
state.picking = false;
state.picked = new Set();
state.anchor = null;
const pickedEntries = () => Array.from(state.picked).map(k => BYKEY.get(k)).filter(Boolean);
// APA order: by first author (or title), then year. Each key is worked out
// once, not in every comparison.
const apaOrder = list => list
  .map(e => [norm((e.a && e.a[0] ? e.a[0][0] + ' ' + e.a[0][1] : e.e && e.e[0] ? e.e[0][0] + ' ' + e.e[0][1] : e.f.title || '') + ' ' + (e.f.year || '')), e])
  .sort((a, b) => cmpStr(a[0], b[0]))
  .map(x => x[1]);

function setPicking(on, seedKey) {
  state.picking = on;
  if (!on) state.picked.clear();
  else if (seedKey) state.picked.add(seedKey);
  state.anchor = null;
  app.classList.toggle('picking', on);
  paint();
  renderPickBar();
  renderDetail();
}
function togglePick(i, range) {
  const e = state.view[i];
  if (!e) return;
  if (range && state.anchor != null && state.view[state.anchor]) {
    const a = Math.min(state.anchor, i), b = Math.max(state.anchor, i);
    for (let j = a; j <= b; j++) state.picked.add(state.view[j].k);
  } else if (state.picked.has(e.k)) {
    state.picked.delete(e.k);
  } else {
    state.picked.add(e.k);
  }
  state.anchor = i;
  if (!phoneMQ.matches) state.selKey = e.k;
  paint();
  renderPickBar();
  renderDetail();
}
function renderPickBar() {
  const btn = $('#selectBtn');
  btn.classList.toggle('on', state.picking);
  btn.setAttribute('aria-pressed', String(state.picking));
  fitToolbar();
  btn.title = state.picking ? 'Done selecting' : 'Select several publications to export or copy';
  const bar = $('#pickBar');
  bar.hidden = !state.picking;
  if (!state.picking) return;
  $('#listwrap').style.setProperty('--pick-bottom', ($('.status').offsetHeight + 8) + 'px');
  const n = state.picked.size;
  bar.querySelector('.pick-count').textContent = n ? n + ' selected' : 'Tap publications to select them';
  $('#pickNone').hidden = !n;
  $('#pickExport').hidden = !n || !gs;
  $('#pickBulk').hidden = $('#pickRL').hidden = !n || !gs;
  $('#pickJoin').hidden = !(gs && n >= 2 && pickedEntries().every(x => !x.ib));
}
const SHOW_REFS = 200;
function selectionHTML() {
  const list = pickedEntries();
  const withPdf = list.filter(e => (e.files || []).some(f => f.id)).length;
  const n = list.length;
  return `<div class="d-inner"><div class="d-kicker"><span class="d-type">Selection</span></div>` +
    `<h1 class="d-title">${n} publication${n === 1 ? '' : 's'} selected</h1>` +
    `<p class="d-venue">${withPdf} of them ${withPdf === 1 ? 'has' : 'have'} a PDF in Google Drive.</p>` +
    `<div class="actions">` + (gs ? `<button type="button" class="btn primary" data-export>${ICON.share}<span>Export\u2026</span></button>` : '') +
    (gs && n >= 2 && list.every(x => !x.ib) ? `<button type="button" class="btn" data-join>${ICON.versions}<span>Join as versions\u2026</span></button>` : '') +
    (gs ? `<button type="button" class="btn" data-bulk>${ICON.tag}<span>Keywords and groups\u2026</span></button>` +
      `<button type="button" class="btn" data-bulk-rl>${ICON.bookmark}<span>Add to reading list</span></button>` : '') +
    (gs && LIBS.list.length && list.some(x => !x.ib) ? `<button type="button" class="btn" data-copy-lib-sel>${ICON.lib}<span>Copy to another library\u2026</span></button>` : '') +
    `<details class="menu"><summary class="btn">${ICON.copy}<span>Copy</span>${ICON.chev}</summary>` +
    `<div class="menu-list" role="menu"><button type="button" role="menuitem" class="mi" data-copy-sel="bibtex">${ICON.bib}<span>BibTeX</span><kbd>${esc(keyHint('copyBib'))}</kbd></button>` +
    `<button type="button" role="menuitem" class="mi" data-copy-sel="apa">${ICON.apa}<span>APA (long)</span><kbd>${esc(keyHint('copyApa'))}</kbd></button>` +
    `<button type="button" role="menuitem" class="mi" data-copy-sel="short">${ICON.intext}<span>APA (short)</span><kbd>${esc(keyHint('copyShort'))}</kbd></button>` +
    `<button type="button" role="menuitem" class="mi" data-copy-sel="qr">${ICON.qr}<span>QR code\u2026</span></button></div></details>` +
    `<button type="button" class="btn" data-pick-clear>Clear selection</button></div>` +
    `<section class="d-sec"><h3>References (APA)</h3><div class="apa-refs">` +
    apaOrder(list).slice(0, SHOW_REFS).map(e => `<p>${apaCitation(e).html}</p>`).join('') +
    (n > SHOW_REFS ? `<p class="d-venue">and ${(n - SHOW_REFS).toLocaleString()} more. Copy and Export include them all.</p>` : '') +
    `</div></section></div>`;
}


/* ---- many publications changed at once: keywords, groups, reading list */
// For the publications selected: keywords taken off all of them (a tap on
// one) or added to all; each static group ticked (all in), unticked (none)
// or half-ticked (some, left as they are). One save to the .bib, one
// backup.
function openBulk() {
  const list = pickedEntries().filter(e => !e.ib), n = list.length;
  if (!n) { toast('Publications in your inbox can’t be changed together. Move them into your library first.', 4000); return; }
  const kws = new Map();
  list.forEach(e => e.kw.forEach(k => kws.set(k, (kws.get(k) || 0) + 1)));
  const rg = readingGroup(), groups = GROUPS.filter(g => g !== rg);
  sheet = { mode: 'bulk', list };
  showSheet(`<h2>Change ${n} publication${n === 1 ? '' : 's'}</h2>` +
    `<div class="fld"><label>Keywords</label>` +
    (kws.size ? `<p class="sheet-note">Tap a keyword to take it off all of them.</p><div class="bulk-kws">` +
      [...kws].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, c]) =>
        `<button type="button" class="chip bulk-kw" data-kw="${esc(k)}" aria-pressed="false">${esc(k)}<span class="bulk-n">${c === n ? 'all' : c + '/' + n}</span></button>`).join('') + `</div>` : '') +
    `<input id="bulkKwAdd" type="text" placeholder="Add keywords to all of them, separated by commas" autocomplete="off"></div>` +
    (groups.length ? `<div class="fld"><label>Static groups</label><div class="bulk-groups">` +
      groups.map(g => {
        const c = list.filter(e => g.items.includes(e)).length, was = c === n ? 'all' : c ? 'some' : 'none';
        return `<label class="check"><input type="checkbox" data-bulk-g="${esc(g.name)}" data-was="${was}"${was === 'all' ? ' checked' : ''}> ${esc(g.name)}${c && c < n ? ` <span class="bulk-n">${c}/${n}</span>` : ''}</label>`;
      }).join('') + `</div></div>` : ''), 'Save');
  $('#sheetBody').querySelectorAll('[data-was="some"]').forEach(b => { b.indeterminate = true; });
}
$('#sheetBody').addEventListener('click', ev => {
  const k = sheet && sheet.mode === 'bulk' && ev.target.closest('.bulk-kw');
  if (k) { const off = k.getAttribute('aria-pressed') !== 'true'; k.setAttribute('aria-pressed', String(off)); k.classList.toggle('off', off); }
});
async function saveBulk() {
  const s = sheet, body = $('#sheetBody');
  const drop = new Set([...body.querySelectorAll('.bulk-kw.off')].map(b => b.dataset.kw));
  const more = $('#bulkKwAdd').value.split(/[,;]/).map(x => x.trim()).filter(Boolean);
  const gAdd = [], gRemove = [];
  body.querySelectorAll('[data-bulk-g]').forEach(b => {
    if (b.indeterminate) return;
    if (b.checked && b.dataset.was !== 'all') gAdd.push(b.dataset.bulkG);
    if (!b.checked && b.dataset.was !== 'none') gRemove.push(b.dataset.bulkG);
  });
  const inGroup = (name, e) => { const g = GROUPS.find(x => x.name === name); return !!g && g.items.includes(e); };
  const todo = s.list.map(e => {
    const raw = rawOf(e, 'keywords'), have = splitKw(raw), next = have.filter(k => !drop.has(k));
    more.forEach(k => { if (next.indexOf(k) < 0) next.push(k); });
    const set = next.join('\u0001') !== have.join('\u0001') ? { keywords: next.join(/,/.test(raw) && !/;/.test(raw) ? ', ' : '; ') } : {};
    return { e, set, add: gAdd.filter(n => !inGroup(n, e)), remove: gRemove.filter(n => inGroup(n, e)) };
  }).filter(x => Object.keys(x.set).length || x.add.length || x.remove.length);
  if (!todo.length) { closeSheet(); return; }
  sheetBusy(true);
  const t0 = Date.now();
  let step = '';
  const tell = () => { if (step && sheet === s) sheetMsg(step + '… (' + Math.round((Date.now() - t0) / 1000) + ' s)'); };
  const clock = setInterval(tell, 1000);
  try {
    const now = bibdeskTime();
    const res = await callServer('saveEntries', { items: todo.map(x => ({ key: x.e.k, set: x.set, groups: { add: x.add, remove: x.remove }, expectHash: x.e.h || null })),
      modified: now, backupName: fileTime(), onStep: t => { step = t; tell(); } });
    if (res.stamp) lastBibStamp = res.stamp;
    if (res.gh) DATA.gh = res.gh;
    let done = 0;
    todo.forEach(x => {
      if (!res.hashes[x.e.k]) return;
      x.e.h = res.hashes[x.e.k];
      if (Object.keys(x.set).length) setFields(x.e, Object.assign({}, x.set, { 'date-modified': now }));
      x.add.forEach(name => {
        let g = (DATA.groups || []).find(y => y.name === name);
        if (!g) { g = { name, keys: [] }; (DATA.groups = DATA.groups || []).push(g); }
        if (g.keys.indexOf(x.e.k) < 0) g.keys.push(x.e.k);
      });
      (DATA.groups || []).forEach(g => { if (x.remove.indexOf(g.name) >= 0) g.keys = g.keys.filter(k => k !== x.e.k); });
      done++;
    });
    init(DATA, true);
    afterWrite();
    closeSheet();
    const skipped = res.skipped || [];
    toast('Changed ' + done + ' publication' + (done === 1 ? '' : 's') + (skipped.length ? '; ' + skipped.length + ' left as they were (changed elsewhere since LibLande read them)' : ''), skipped.length ? 7000 : 4000);
  } catch (err) {
    if (sheet === s) sheetMsg(errText(err), true);
  } finally {
    clearInterval(clock);
    if (sheet === s) sheetBusy(false);
  }
}
function bulkReading() {
  const list = pickedEntries().filter(e => !RL.has(e.k));
  if (!list.length) { toast('They’re all on your reading list already', 2500); return; }
  list.forEach(e => rlOp({ op: 'add', key: e.k, list: 'later' }));
  toast('Added ' + list.length + ' to your reading list, in Later', 3000);
}

/* ------------------------------------------------------------ forthcoming: updates */
/* ---- saved searches: groups that fill themselves */
// Kept with your preferences ({at, list: [{name, q}]}), so your other
// devices have them too.
const SMART = store.get('smart', { at: 0, list: [] });
function smartSave() {
  SMART.at = Date.now();
  store.set('smart', SMART);
  if (gs && SYNC.smart) google.script.run.withFailureHandler(() => {}).savePrefs({ smart: SMART });
  renderGroups();
}
function smartMerge(prefs) {
  const x = SYNC.smart && prefs && prefs.smart;
  if (x && x.at > SMART.at) { SMART.at = x.at; SMART.list = x.list || []; store.set('smart', SMART); }
}
function renderSmartBar() {
  const bar = $('#smartBar'), x = state.group.startsWith('q:') && SMART.list.find(y => y.name === state.group.slice(2));
  bar.hidden = !x;
  if (x) bar.querySelector('.rl-count').innerHTML = `${ICON.search}<code>${esc(x.q)}</code>`;
}
// Saving a search, or changing one: its name and what it searches for.
function openSmart(x) {
  sheet = { mode: 'smart', was: x ? x.name : null };
  showSheet(`<h2>${x ? 'Change the saved search' : 'Save this search'}</h2>` +
    `<p class="sheet-note">A saved search is a group in the sidebar that fills itself: whatever matches, now and later.</p>` +
    `<div class="fld"><label for="smartName">Name</label><input id="smartName" type="text" value="${esc(x ? x.name : state.q.trim())}"></div>` +
    `<div class="fld"><label for="smartQ">Search for</label><input id="smartQ" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(x ? x.q : state.q.trim())}"></div>` +
    `<p class="sheet-note">Words can name a field: <code>author:lee</code> <code>year:2020-2024</code> <code>kw:perception</code> <code>journal:mind</code> <code>type:book</code> <code>has:pdf</code> <code>is:unread</code>; start one with \u2212 to leave it out. Words in quotation marks are found only whole: <code>author:"lande"</code>.</p>`, x ? 'Save' : 'Save search');
  $('#smartName').focus();
}
function saveSmart() {
  const name = $('#smartName').value.trim(), q = $('#smartQ').value.trim(), was = sheet.was;
  if (!name || !q) { sheetMsg('Give it a name and something to search for.', true); return; }
  if (name !== was && SMART.list.some(x => x.name === name)) { sheetMsg('There\u2019s already a saved search called \u201c' + name + '\u201d.', true); return; }
  const i = SMART.list.findIndex(x => x.name === was), item = { name, q };
  if (i >= 0) SMART.list[i] = item; else SMART.list.push(item);
  closeSheet();
  smartSave();
  $('#q').value = ''; state.q = '';
  setGroup('q:' + name);
}
$('#searchSave').addEventListener('click', () => openSmart(null));
$('#smartEdit').addEventListener('click', () => { const x = SMART.list.find(y => y.name === state.group.slice(2)); if (x) openSmart(x); });
$('#smartDel').addEventListener('click', () => {
  const i = SMART.list.findIndex(y => y.name === state.group.slice(2));
  if (i < 0) return;
  const [x] = SMART.list.splice(i, 1);
  smartSave();
  setGroup('all');
  toast('Deleted the saved search \u201c' + x.name + '\u201d', 6000, { label: 'Undo', run: () => { SMART.list.splice(i, 0, x); smartSave(); setGroup('q:' + x.name); } });
});
function renderForthBar() {
  const bar = $('#forthBar');
  bar.hidden = !(gs && state.group === 'forth');
  if (bar.hidden) return;
  const n = groupItems('forth').length;
  bar.querySelector('.rl-count').textContent = n ? n + ' forthcoming or not yet in an issue' : 'Nothing forthcoming';
  $('#forthCheck').hidden = !n;
}
$('#forthCheck').addEventListener('click', () => checkForthcoming());
$('#pickJoin').addEventListener('click', () => openJoin(pickedEntries()));
$('#pickBulk').addEventListener('click', () => openBulk());
$('#pickRL').addEventListener('click', () => bulkReading());
// What Crossref has on a publication: by its DOI, or else by its title
// and first author (only a match of the same title counts).
const CROSSREF = 'https:\/\/api.crossref.org/works';
const plainTitle = t => norm(String(t || '')).replace(/[^a-z0-9]+/g, '');
// Crossref turns away requests that come too fast (429, "too many"):
// then a wait, longer each time, or as long as it asks, and again.
async function crossrefGet(url) {
  for (let n = 0; ; n++) {
    const r = await fetch(url);
    if (r.status !== 429 || n >= 5) return r;
    const asked = parseFloat(r.headers.get('Retry-After'));
    await new Promise(ok => setTimeout(ok, asked > 0 ? Math.min(asked, 30) * 1000 : 1000 * 2 ** n));
  }
}
async function crossrefFor(e) {
  const doi = String(e.f.doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org[/]/i, '').replace(/^doi:\s*/i, '');
  if (/^10\.\S+[/]\S+$/.test(doi)) {
    const r = await crossrefGet(CROSSREF + '/' + doi.split('/').map(encodeURIComponent).join('/'));
    if (r.ok) return (await r.json()).message;
    if (r.status !== 404) throw new Error('Crossref answered ' + r.status);
  }
  if (!e.f.title) return null;
  const who = ((e.a && e.a[0]) || [''])[0];
  const r = await crossrefGet(CROSSREF + '?rows=5&query.bibliographic=' + encodeURIComponent(e.f.title) + (who ? '&query.author=' + encodeURIComponent(who) : ''));
  if (!r.ok) throw new Error('Crossref answered ' + r.status);
  const want = plainTitle(e.f.title);
  return ((await r.json()).message.items || []).find(w => plainTitle((w.title || [])[0]) === want) || null;
}
// The changes Crossref suggests: [{n, from, to, on}], on = ticked to start
// with. Only empty fields are filled, and a "forthcoming" year; another
// year is offered unticked (Crossref's can be the online-first year).
function forthChanges(e, w) {
  const f = e.f, out = [];
  const inIssue = !!(w.volume || w.page);
  const parts = ((inIssue && (w['published-print'] || w.issued)) || w['published-online'] || w.issued || {})['date-parts'];
  const year = parts && parts[0] && parts[0][0] ? String(parts[0][0]) : '';
  const month = parts && parts[0] && parts[0][1] ? MONTH_ABBR[parts[0][1] - 1] : '';
  // (Crossref's text can have HTML's codes, as "&amp;": the characters.)
  const clean = v => { let s = String(v || ''); if (/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/i.test(s)) { const t = document.createElement('textarea'); t.innerHTML = s; s = t.value; } return s.replace(/[{}]/g, '').trim(); };
  const add = (n, to, on) => { to = clean(to); if (to && to !== (f[n] || '')) out.push({ n, from: f[n] || '', to, on }); };
  if (inIssue && year) {
    const forth = !f.year || FORTH_RE.test(f.year);
    if (forth || f.year !== year) add('year', year, forth);
    if (!f.volume) add('volume', w.volume, true);
    if (!f.number) add('number', w.issue, true);
    if (!f.pages && w.page) add('pages', String(w.page).replace(/-/g, '--'), true);
    if (!f.month && month) add('month', month, true);
  }
  if (!f.doi) add('doi', w.DOI, true);
  if (e.t === 'article' && !f.journal) add('journal', (w['container-title'] || [])[0], true);
  return { changes: out, inIssue };
}
async function checkForthcoming() {
  const list = groupItems('forth').slice(0, 60);
  if (!list.length) return;
  const found = [], none = [], failed = [];
  toast('Asking Crossref about ' + list.length + ' publication' + (list.length === 1 ? '' : 's') + '\u2026', 0);
  // (One at a time: Crossref turns away several at once.)
  for (const e of list) {
    try {
      const w = await crossrefFor(e);
      const c = w ? forthChanges(e, w) : null;
      if (c && c.changes.length) found.push({ e, changes: c.changes, inIssue: c.inIssue }); else none.push(e);
    } catch (err) { failed.push(e); }
    toast('Asking Crossref\u2026 (' + (found.length + none.length + failed.length) + ' of ' + list.length + ')', 0);
  }
  toast('', 1);
  found.sort((a, b) => cmpStr(a.e.f.title || a.e.k, b.e.f.title || b.e.k));
  sheet = { mode: 'forth', found };
  const label = n => FIELD_LABELS[n] || n;
  showSheet(`<h2>Updates from Crossref</h2>` +
    (found.length ? `<p class="sheet-note">Tick the changes to save. Only empty fields are filled in; a different year is offered unticked, since Crossref\u2019s can be the year it appeared online.</p>` +
      found.map((x, j) => `<div class="fu-item"><div class="fu-title">${esc(x.e.f.title || x.e.k)} <span class="fu-who">${esc(x.e.authorsShort || '')}${x.inIssue ? '' : ' \u00b7 not in an issue yet'}</span></div>` +
        x.changes.map((c, k) => `<label class="check"><input type="checkbox" data-fu="${j}:${k}"${c.on ? ' checked' : ''}> ${esc(label(c.n))}: ${c.from ? `<s>${esc(c.from)}</s> \u2192 ` : ''}${esc(c.to)}</label>`).join('') + `</div>`).join('')
      : `<p class="sheet-note">Crossref has nothing new on any of them yet.</p>`) +
    (none.length ? `<details class="fu-none"><summary>No update yet (${none.length})</summary>${none.map(e => `<p>${esc(e.f.title || e.k)}</p>`).join('')}</details>` : '') +
    (failed.length ? `<p class="sheet-note">Crossref couldn\u2019t be asked about ${failed.length}. Try again later.</p>` : ''),
    found.length ? 'Save' : 'Close');
  if (!found.length) $('#sheetCancel').hidden = true;
}
async function saveForth() {
  const s = sheet;
  if (!s.found.length) { closeSheet(); return; }
  const todo = s.found.map((x, j) => {
    const set = {};
    x.changes.forEach((c, k) => { const b = $('#sheetBody').querySelector(`[data-fu="${j}:${k}"]`); if (b && b.checked) set[c.n] = c.to; });
    return { e: x.e, set };
  }).filter(x => Object.keys(x.set).length);
  if (!todo.length) { closeSheet(); return; }
  sheetBusy(true);
  let done = 0;
  try {
    // Straight to the .bib: all of them in one save.
    {
      sheetMsg('Saving ' + todo.length + ' update' + (todo.length === 1 ? '' : 's') + ' to ' + DATA.source + '\u2026');
      const now = bibdeskTime();
      // (Each step shows as it starts, with the time so far: a slow one
      // can be seen, and named.)
      const t0 = Date.now();
      let step = '';
      const tell = () => { if (step && sheet === s) sheetMsg(step + '\u2026 (' + Math.round((Date.now() - t0) / 1000) + ' s)'); };
      const clock = setInterval(tell, 1000);
      let res;
      try {
        res = await callServer('saveEntries', { items: todo.map(x => ({ key: x.e.k, set: x.set, expectHash: x.e.h || null })), modified: now, backupName: fileTime(),
          onStep: t => { step = t; tell(); } });
      } finally { clearInterval(clock); }
      if (res.stamp) lastBibStamp = res.stamp;
      todo.forEach(x => {
        if (!res.hashes[x.e.k]) return;
        x.e.h = res.hashes[x.e.k];
        setFields(x.e, Object.assign({}, x.set, { 'date-modified': now }));
        done++;
      });
      init(DATA, true);
      afterWrite();
      closeSheet();
      const skipped = res.skipped || [];
      toast('Updated ' + done + ' publication' + (done === 1 ? '' : 's') +
        (skipped.length ? '; ' + skipped.length + ' left as they were (changed elsewhere since LibLande read them)' : ''), skipped.length ? 7000 : 4000);
      return;
    }
    for (const x of todo) {
      sheetMsg('Saving ' + (++done) + ' of ' + todo.length + '\u2026');
      await writeEdit(x.e, x.set, [], []);
    }
    closeSheet();
    toast('Updated ' + todo.length + ' publication' + (todo.length === 1 ? '' : 's'), 4000);
  } catch (err) {
    sheetMsg((done ? 'Saved ' + (done - 1) + '; then: ' : '') + errText(err), true);
  } finally {
    if (sheet === s) sheetBusy(false);
  }
}

/* ------------------------------------------------------------ cite keys */
// The cite key, changed in place: Return saves, Esc or leaving cancels.
function editKey(e) {
  const btn = detailEl.querySelector('.citekey');
  if (!btn) return;
  const input = document.createElement('input');
  input.className = 'citekey-input';
  input.value = e.k;
  input.setAttribute('aria-label', 'New cite key');
  input.autocapitalize = 'off'; input.spellcheck = false;
  btn.replaceWith(input);
  detailEl.querySelector('[data-rename]').hidden = true;
  input.focus(); input.select();
  let over = false;
  const finish = go => {
    if (over) return;
    over = true;
    if (go && input.value.trim() && input.value.trim() !== e.k) renameEntry(e, input.value.trim()); else renderDetail();
  };
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
  });
  input.addEventListener('blur', () => finish(false));
}
// Why a cite key won't do ('' if it will).
function keyProblem(k, e) {
  if (!k) return 'A publication needs a cite key.';
  if (/[\s,{}()"#%'=\\~]/.test(k)) return 'A cite key can\u2019t have spaces or any of , { } ( ) " # % \' = \\ ~ in it.';
  const other = ENTRIES.find(x => x !== e && x.k.toLowerCase() === k.toLowerCase());
  if (other) return k + ' is already the cite key of \u201c' + (other.f.title || other.k) + '\u201d.';
  return '';
}
async function renameEntry(e, newKey) {
  const old = e.k, why = keyProblem(newKey, e);
  if (why) { toast(why, 5000); renderDetail(); return; }
  toast('Changing the cite key\u2026', 0);
  try {
    renameSaid(old, newKey, await renameCore(e, newKey));
  } catch (err) {
    toast('Couldn\u2019t change the cite key: ' + errText(err), 6000);
    renderDetail();
  }
}
function renameSaid(old, newKey, res) {
  toast('Cite key changed to ' + newKey + (res.queued ? ' on this device; it goes to ' + DATA.source + ' when you\u2019re back online.' : '.') + ' Documents that cite ' + old + ' need the new key.', 7000);
  if (!res.queued) afterWrite();
}
// The new key, in the .bib and here too: the entry, its groups, links to
// it, what was viewed. Throws if it couldn't.
async function renameCore(e, newKey) {
  const old = e.k;
  {
    const res = await callServer('renameKey', { key: old, newKey, expectHash: e.h || null, backupName: fileTime() });
    e.k = newKey; e.h = res.hash;
    if (res.gh) DATA.gh = res.gh;
    (DATA.groups || []).forEach(g => { g.keys = g.keys.map(k => (k === old ? newKey : k)); });
    ENTRIES.forEach(x => ['crossref', 'related'].forEach(n => {
      [x.f, x.r].forEach(o => { if (o && o[n]) o[n] = o[n].split(',').map(k => (k.trim() === old ? newKey : k)).join(','); });
    }));
    RECENT.seen.forEach(x => { if (x[0] === old) x[0] = newKey; });
    store.set('recentSeen', RECENT.seen);
    const pairs = [...NOT_DUPS].map(p => p.split('|').map(k => (k === old ? newKey : k))).map(([a, b]) => pairOf(a, b));
    NOT_DUPS.clear(); pairs.forEach(p => NOT_DUPS.add(p)); store.set('notDups', [...NOT_DUPS]);
    google.script.run.withFailureHandler(() => {}).savePrefs(SYNC.recent ? { recentSeen: RECENT.seen.slice(0, 100), notDups: [...NOT_DUPS] } : { notDups: [...NOT_DUPS] });
    if (res.reading) setReading(res.reading);
    if (state.selKey === old) state.selKey = newKey;
    if (res.queued) e.offline = true;
    init(DATA, true);
    return res;
  }
}

/* ------------------------------------------------------------ versions: joining */
/* ------------------------------------------------------------ chapters */
// A chapter added from its book (Add chapter\u2026 in the book's details): the
// chapter's type, the book's title, editors (or, for a book by one author,
// its author), publisher, place, year, ISBN and series filled in, and the
// link to the book (crossref) made when it's added. You give the title,
// authors and pages.
function openAddChapter(book) {
  openAdd();
  sheet.chapterOf = book.k;
  $('#sheetBody .sheet-head h2').textContent = 'Add a chapter';
  const raw = n => rawOf(book, n), f = { booktitle: raw('title') };
  if (raw('editor')) f.editor = raw('editor'); else if (raw('author')) f.author = raw('author');
  ['publisher', 'address', 'year', 'isbn', 'series', 'volume', 'edition'].forEach(n => { if (raw(n)) f[n] = raw(n); });
  $('#addType').value = 'incollection';
  renderAddFields(f);
  $('#sheetBody .fld').insertAdjacentHTML('beforebegin', `<p class="add-in">${ICON.link}<span>In <b>${esc(book.f.title || book.k)}</b>, linked to it</span></p>`);
  // (Its pages from the book's PDF, if it has one; and its chapters not
  // yet in the library, suggested: see chapters.js.)
  if (readablePdfs(book).length) chPdfSetup(book);
  chSuggest(book);
  const t = $('#sheetBody [data-field="title"]');
  if (t && !coarseMQ.matches) t.focus();
}
// In a book's details: its chapters in the library, in the book's order;
// in a chapter's: its book.
// (With "+ Add chapter" at its head: a book's chapter added, with the
// book's details filled in. A book with none yet has just that.)
function chaptersHTML(e) {
  const list = CHAPTERS.get(e.k) || [], add = gs && !e.ib && isBook(e);
  if (!list.length && !add) return '';
  const btn = add ? `<button type="button" class="ch-add" data-add-chapter title="Add a chapter of this book, with the book\u2019s details filled in">${ICON.addChapter}<span>Add chapter</span></button>` : '';
  if (!list.length) return `<section class="d-sec d-chapters"><h3><span>Chapters</span>${btn}</h3></section>`;
  return `<section class="d-sec d-chapters"><h3><span>Chapters in your library \u00b7 ${list.length}</span>${btn}</h3><ul>` + list.map(c =>
    `<li><button type="button" data-version="${esc(c.k)}"><span class="ch-t">${esc(c.f.title || c.k)}</span>${c.authorsShort ? `<span class="ch-a">${esc(c.authorsShort)}</span>` : ''}</button>` +
    (c.f.pages ? `<span class="ch-pp">pp. ${esc(c.f.pages.replace(/-+/g, '\u2013'))}</span>` : '') + `</li>`).join('') + `</ul></section>`;
}
function inBookHTML(e) {
  const b = CHAPTER_OF.has(e.k) && BYKEY.get(CHAPTER_OF.get(e.k));
  if (!b) return '';
  const who = [b.authorsShort, b.f.publisher].filter(Boolean).join(' \u00b7 ');
  return `<div class="d-inbook">In: <button type="button" data-version="${esc(b.k)}">${esc(b.f.title || b.k)}</button>${who ? ` <span>\u00b7 ${esc(who)}</span>` : ''}</div>`;
}
function versionsHTML(e) {
  const mainK = VERSION_OF.get(e.k), main = mainK ? BYKEY.get(mainK) : (VERSIONS.has(e.k) ? e : null);
  if (!main) return '';
  const family = [main].concat(VERSIONS.get(main.k) || []);
  const line = x => {
    const where = x.venue || (x.f.publisher ? x.f.publisher : '');
    const me = x === e;
    return `<li${me ? ' class="me"' : ''}>` + (me ? `<b>This one</b>` : `<button type="button" data-version="${esc(x.k)}">${esc(x.f.title || x.k)}</button>`) +
      ` <span class="v-where">${esc([x.f.year, where, x.f.edition ? x.f.edition + ' ed.' : ''].filter(Boolean).join(' \u00b7 '))}</span>` +
      (x === main ? ` <span class="pill">Main</span>` : gs && !x.ib ? ` <button type="button" class="v-unjoin" data-unjoin="${esc(x.k)}" title="Show it as a separate publication">Unjoin</button>` : '') + `</li>`;
  };
  return `<section class="d-sec d-versions"><h3>Versions</h3><ul>${family.map(line).join('')}</ul></section>`;
}
// Join: the other publications name the main one in their related field.
// From a selection: a small panel to choose the main version.
function openJoin(list) {
  list = list.filter(Boolean);
  if (list.length < 2) return;
  const first = list.slice().sort((a, b) => a.yearN - b.yearN)[0];
  sheet = { mode: 'join', list };
  showSheet(sheetHead('Join as versions', 'Join') +
    `<p class="join-q">Which is the main version?</p>` +
    `<p class="sheet-note">The others are listed under it, as other versions of the same work: a reprint, a translation, another edition.</p>` +
    `<div class="join-choices">` + list.map(x => `<label class="join-choice"><input type="radio" name="joinMain" value="${esc(x.k)}"${x === first ? ' checked' : ''}>` +
      `<span class="jc-text"><span class="jc-title">${esc(x.f.title || x.k)}</span>` +
      `<span class="jc-meta">${esc([x.authorsShort, x.f.year, x.venue || x.f.publisher, x.f.edition ? x.f.edition + ' ed.' : ''].filter(Boolean).join(' \u00b7 '))}</span></span>` +
      `<span class="jc-main">Main</span></label>`).join('') + `</div>`, 'Join');
  $('#sheet').classList.add('head-mode', 'compact', 'pop', 'join-sheet');
}
// Join `others` under `main`: each names it in its related field (in place
// of any main version it had before). Returns what each had, for Undo.
async function joinUnder(main, others, progress) {
  const before = [];
  let n = 0;
  for (const x of others) {
    if (progress) progress(++n, others.length);
    before.push([x, rawOf(x, 'related').trim()]);
    const keep = relatedKeys(x).filter(k => k !== main.k && k !== VERSION_OF.get(x.k));
    await writeEdit(x, { related: [main.k].concat(keep).join(',') }, [], []);
  }
  init(DATA, true);
  state.selKey = main.k; refresh(false); revealSelected();
  return before;
}
async function saveJoin() {
  const s = sheet, main = BYKEY.get(($('#sheetBody').querySelector('[name=joinMain]:checked') || {}).value);
  if (!main) return;
  const others = s.list.filter(x => x !== main);
  sheetBusy(true);
  try {
    await joinUnder(main, others, (n, of) => sheetMsg(of > 1 ? 'Joining ' + n + ' of ' + of + '\u2026' : 'Joining\u2026'));
    closeSheet();
    setPicking(false);
    toast('Joined ' + others.length + ' version' + (others.length === 1 ? '' : 's') + ' under \u201c' + (main.f.title || main.k) + '\u201d', 4000);
  } catch (err) {
    sheetMsg(errText(err), true);
  } finally {
    if (sheet === s) sheetBusy(false);
  }
}
// Dragged onto a row: joined under it at once (the row dropped on is the
// main version), with Undo.
async function joinByDrag(main, moved) {
  toast('Joining\u2026', 0);
  try {
    const before = await joinUnder(main, [moved]);
    toast('\u201c' + (moved.f.title || moved.k) + '\u201d is now a version of \u201c' + (main.f.title || main.k) + '\u201d', 6000, { label: 'Undo', run: async () => {
      try {
        for (const [x, was] of before) { const now = BYKEY.get(x.k); if (now) await writeEdit(now, { related: was }, [], []); }
        init(DATA, true); refresh(false);
        toast('Undone', 2000);
      } catch (err) { toast('Couldn\u2019t undo: ' + errText(err), 5000); }
    } });
  } catch (err) {
    toast('Couldn\u2019t join them: ' + errText(err), 6000);
  }
}
function unjoin(x) {
  if (!x) return;
  const mainK = VERSION_OF.get(x.k);
  const rest = relatedKeys(x).filter(k => k !== mainK).join(',');
  quickSet(x, { related: rest }, 'Shown as a separate publication');
}
// On a computer: drag a row onto another to join it under that one.
const rowDrag = () => !!gs && !coarseMQ.matches;
const KEY_TYPE = 'application/x-liblande-key';
let dragKey = null;
rowsEl.addEventListener('dragstart', ev => {
  const r = ev.target.closest && ev.target.closest('.row[data-i]');
  const e = r && state.view[+r.dataset.i];
  if (!e || state.picking || e.ib) { ev.preventDefault(); return; }
  dragKey = e.k;
  ev.dataTransfer.setData(KEY_TYPE, e.k);
  ev.dataTransfer.setData('text/plain', e.k);
  // ("move": Safari doesn't drop a "link" drag.)
  ev.dataTransfer.effectAllowed = 'copyMove';
});
rowsEl.addEventListener('dragend', () => { dragKey = null; markJoin(null); libDropOn(null); });
// A row dropped on another library in the sidebar: copied to it; on a
// static group: put in it.
const DROP_ON = '.grp[data-lib]:not(.cur), .sec[data-sec="s"] .grp[data-g^="s:"]';
let libDropEl = null;
function libDropOn(b) {
  if (libDropEl && libDropEl !== b) libDropEl.classList.remove('drop-on');
  libDropEl = b || null;
  if (libDropEl) libDropEl.classList.add('drop-on');
}
const libOver = ev => {
  const b = ev.target.closest && ev.target.closest(DROP_ON);
  if (!dragKey || !b) { libDropOn(null); return; }
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'copy';
  libDropOn(b);
};
$('#groups').addEventListener('dragenter', libOver);
$('#groups').addEventListener('dragover', libOver);
$('#groups').addEventListener('dragleave', ev => { if (libDropEl && !libDropEl.contains(ev.relatedTarget)) libDropOn(null); });
$('#groups').addEventListener('drop', ev => {
  const b = ev.target.closest && ev.target.closest(DROP_ON);
  const key = dragKey || (ev.dataTransfer && ev.dataTransfer.getData(KEY_TYPE));
  libDropOn(null);
  if (!b || !key) return;
  ev.preventDefault();
  dragKey = null;
  // (A selected row brings the rest of the selection with it.)
  const keys = state.picked.has(key) ? [...state.picked] : [key];
  dropOnSide(b, keys);
});
function dropOnSide(b, keys) {
  if (b.dataset.lib) copyToLibrary(keys, LIBS.list.find(l => l.bibId === b.dataset.lib));
  else addToGroup(keys, b.dataset.g.slice(2));
}
// Publications put in a static group by a drop: one save to the .bib (as
// Keywords and groups does). Ones already in it, or in the
// LibLande inbox, are left out.
async function addToGroup(keys, name) {
  const g = (DATA.groups || []).find(x => x.name === name);
  const list = keys.map(k => BYKEY.get(k)).filter(e => e && !e.ib && !(g && g.keys.includes(e.k)));
  const what = n => (n === 1 && keys.length === 1 ? '\u201c' + (BYKEY.get(keys[0]).f.title || keys[0]) + '\u201d' : n + ' publication' + (n === 1 ? '' : 's'));
  if (!list.length) { toast((keys.length === 1 ? 'It\u2019s' : 'They\u2019re') + ' already in ' + name, 2500); return; }
  toast('Putting ' + what(list.length) + ' in ' + name + '\u2026', 0);
  try {
    const res = await callServer('saveEntries', { items: list.map(e => ({ key: e.k, set: {}, groups: { add: [name], remove: [] }, expectHash: e.h || null })),
      modified: bibdeskTime(), backupName: fileTime() });
    if (res.stamp) lastBibStamp = res.stamp;
    if (res.gh) DATA.gh = res.gh;
    let done = 0;
    list.forEach(e => {
      if (!res.hashes[e.k]) return;
      e.h = res.hashes[e.k];
      let grp = (DATA.groups || []).find(y => y.name === name);
      if (!grp) { grp = { name, keys: [] }; (DATA.groups = DATA.groups || []).push(grp); }
      if (!grp.keys.includes(e.k)) grp.keys.push(e.k);
      done++;
    });
    init(DATA, true);
    afterWrite();
    const skipped = (res.skipped || []).length;
    toast(done ? 'Put ' + what(done) + ' in ' + name + (skipped ? '; ' + skipped + ' left out (changed elsewhere since LibLande read them)' : '') : 'Nothing put in ' + name, 5000);
  } catch (err) { toast('Couldn\u2019t put ' + (list.length === 1 ? 'it' : 'them') + ' in ' + name + ': ' + errText(err), 7000); }
}
// With a finger (an iPad): hold a publication, then drag it onto another
// library in the sidebar (which opens, if it's tucked away) to copy it
// there. A finger that moves before the hold is up is scrolling.
const ROW_DRAG = { on: false };
(() => {
  const list = $('#list');
  let h = null;
  const libUnder = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest(DROP_ON); };
  const start = () => {
    h.on = ROW_DRAG.on = true;
    h.keys = state.picked.has(h.e.k) ? [...state.picked] : [h.e.k];
    h.row.classList.add('held');
    h.ghost = document.createElement('div');
    h.ghost.className = 'drag-ghost';
    h.ghost.textContent = h.keys.length > 1 ? h.keys.length + ' publications' : (h.e.f.title || h.e.k);
    document.body.appendChild(h.ghost);
    place(h.x0, h.y0);
    // (The sidebar out, to drop on.)
    if (tabletMQ.matches && !app.classList.contains('side-open')) { app.classList.add('side-open'); h.opened = true; }
    else if (app.classList.contains('side-collapsed')) { app.classList.remove('side-collapsed'); h.uncollapsed = true; }
    if (navigator.vibrate) navigator.vibrate(8);
    const sel = window.getSelection && window.getSelection();
    if (sel) sel.removeAllRanges();
  };
  const place = (x, y) => { h.ghost.style.left = x + 'px'; h.ghost.style.top = y + 'px'; };
  const stop = drop => {
    if (!h) return;
    clearTimeout(h.timer);
    if (h.on) {
      const b = drop && libUnder(drop.x, drop.y);
      h.ghost.remove();
      h.row.classList.remove('held');
      libDropOn(null);
      if (h.opened) setTimeout(closeDrawer, b ? 600 : 0);
      if (h.uncollapsed) app.classList.add('side-collapsed');
      if (b) dropOnSide(b, h.keys);
      // (The tap that ends it doesn't open the publication.)
      h.row.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
      setTimeout(() => { ROW_DRAG.on = false; }, 0);
    }
    h = null;
  };
  list.addEventListener('pointerdown', ev => {
    if (h || ev.pointerType === 'mouse' || !gs || phoneMQ.matches) return;
    const row = ev.target.closest('.row[data-i], .card[data-i]'), e = row && state.view[+row.dataset.i];
    if (!e || e.ib) return;
    h = { row, e, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, on: false };
    h.timer = setTimeout(() => { if (h && !h.on) start(); }, 450);
  });
  list.addEventListener('pointermove', ev => {
    if (!h || ev.pointerId !== h.id) return;
    if (!h.on) { if (Math.hypot(ev.clientX - h.x0, ev.clientY - h.y0) > 8) stop(null); return; }
    place(ev.clientX, ev.clientY);
    libDropOn(libUnder(ev.clientX, ev.clientY));
  });
  list.addEventListener('pointerup', ev => { if (h && ev.pointerId === h.id) stop({ x: ev.clientX, y: ev.clientY }); });
  list.addEventListener('pointercancel', ev => { if (h && ev.pointerId === h.id) stop(null); });
  list.addEventListener('touchmove', ev => { if (h && h.on) ev.preventDefault(); }, { passive: false });
  list.addEventListener('contextmenu', ev => { if (h) ev.preventDefault(); });
})();
let joinEl = null;
function markJoin(r, e) {
  if (joinEl && joinEl !== r) joinEl.classList.remove('join-on');
  joinEl = r || null;
  if (joinEl) joinEl.classList.add('join-on');
  const hint = $('#dropHint');
  hint.hidden = !r;
  if (r) hint.textContent = 'Drop to make it a version of \u201c' + (e.f.title || e.k) + '\u201d (the main one)';
}
// (Safari takes a row as somewhere to drop only if it says so as the drag
// enters it, as well as while it's over it.)
const joinOver = ev => {
  if (!dragKey) return;
  const r = ev.target.closest && ev.target.closest('.row[data-i]');
  const e = r && state.view[+r.dataset.i];
  if (!e || e.k === dragKey || e.ib) { markJoin(null); return; }
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  markJoin(r, e);
};
rowsEl.addEventListener('dragenter', joinOver);
rowsEl.addEventListener('dragover', joinOver);
rowsEl.addEventListener('drop', ev => {
  if (!dragKey) return;
  ev.preventDefault();
  const r = ev.target.closest && ev.target.closest('.row[data-i]'), e = r && state.view[+r.dataset.i], moved = BYKEY.get(dragKey);
  dragKey = null;
  markJoin(null);
  if (!e || !moved || e === moved) return;
  joinByDrag(e, moved);
});

/* ------------------------------------------------------------ export */
function exportDefaultName() {
  const d = new Date();
  return 'LibLande export ' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function openExport() {
  const list = pickedEntries();
  if (!list.length) { toast('Select some publications first', 2000); return; }
  sheet = { mode: 'export' };
  const withPdf = list.filter(e => (e.files || []).some(f => f.id)).length, n = list.length;
  showSheet(`<h2>Export ${n} publication${n === 1 ? '' : 's'}</h2>` +
    `<fieldset class="fld grp-fieldset"><legend>Save to</legend><div class="exp-choices">` +
    `<label class="check"><input type="radio" name="expDest" value="drive" checked> Google Drive (a new folder in LibLande \u203a Exports)</label>` +
    `<label class="check"><input type="radio" name="expDest" value="device"> This device ${coarseMQ.matches ? '(Save to Files)' : '(a .zip file)'}</label>` +
    `</div></fieldset>` +
    `<div class="fld"><label for="expName">Folder name</label><input id="expName" type="text" value="${esc(exportDefaultName())}" autocomplete="off"></div>` +
    `<fieldset class="fld grp-fieldset"><legend>PDFs <span class="opt">(${withPdf} of ${n} have one)</span></legend><div class="exp-choices">` +
    `<label class="check"><input type="radio" name="expPdf" value="asis" checked> With annotations, as they are</label>` +
    `<label class="check"><input type="radio" name="expPdf" value="clean"> Clean copies, with annotations removed</label>` +
    `<label class="check"><input type="radio" name="expPdf" value="none"> No PDFs, just the .bib and .rtf files</label>` +
    `</div></fieldset>`, 'Export');
}

async function driveCopy(id, name, folderId, token) {
  const r = await fetch('https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '/copy?fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  if (!r.ok) throw new Error('Google Drive couldn\u2019t copy it (error ' + r.status + ')');
}

async function runExport() {
  const list = pickedEntries();
  const mode = ($('#sheetBody').querySelector('input[name="expPdf"]:checked') || {}).value || 'asis';
  const dest = ($('#sheetBody').querySelector('input[name="expDest"]:checked') || {}).value || 'drive';
  const name = ($('#expName').value.trim() || exportDefaultName()).replace(/[\\:*?"<>|]+/g, '-').replace(/[/]/g, '-');
  // One PDF per linked file in Drive, named by cite key.
  const pdfs = [];
  if (mode !== 'none') {
    list.forEach(e => (e.files || []).filter(f => f.id).forEach((f, j) => pdfs.push({ e, f, name: e.k + (j ? '-' + (j + 1) : '') + '.pdf' })));
  }
  const bib = '% Exported from LibLande on ' + bibdeskTime() + ': ' + list.length + ' publication' + (list.length === 1 ? '' : 's') + '\n\n' +
    list.map(e => {
      const own = pdfs.filter(p => p.e === e).map(p => ':' + p.name + ':PDF');
      return bibtex(e, own.length ? { file: own.join(';') } : null);
    }).join('\n');
  const refs = apaOrder(list).map(apaCitation);
  const docs = { rtf: apaRtf(refs) };
  if (dest === 'device') { await exportToDevice(name, bib, docs, pdfs, mode); return; }
  sheetBusy(true);
  sheetMsg('Creating the folder\u2026');
  try {
    const res = await callServer('createExport', { name, bib, rtf: docs.rtf });
    const failed = [];
    let done = 0;
    const one = async p => {
      try {
        if (mode === 'asis') {
          await driveCopy(p.f.id, p.name, res.folderId, res.token);
        } else {
          const result = await cleanPdf(await getPdfBytes(p.f));
          await uploadPdf(new File([result.bytes], p.name, { type: 'application/pdf' }), p.name, { folderId: res.folderId, token: res.token });
        }
      } catch (err) {
        failed.push(p.name + ': ' + errText(err));
      }
      done++;
      sheetMsg((mode === 'clean' ? 'Making clean copies: ' : 'Copying PDFs: ') + done + ' of ' + pdfs.length);
    };
    // A few at a time: copies happen inside Drive; clean copies pass through this page.
    const queue = pdfs.slice();
    await Promise.all(Array.from({ length: mode === 'clean' ? 2 : 4 }, async () => { while (queue.length) await one(queue.shift()); }));
    const ok = pdfs.length - failed.length;
    sheetMsg('');
    $('#sheetBody').insertAdjacentHTML('beforeend', `<div class="export-done"><p><b>Exported to LibLande \u203a Exports \u203a ${esc(res.name)}</b>: ` +
      `references.bib, references.rtf` + (pdfs.length ? ` and ${ok} PDF${ok === 1 ? '' : 's'}` + (mode === 'clean' ? ' (clean copies)' : '') : '') + `.</p>` +
      (failed.length ? `<p class="warn">${failed.length} PDF${failed.length === 1 ? '' : 's'} couldn\u2019t be added: ${esc(failed.join('; '))}</p>` : '') +
      `<a class="btn primary" href="${esc(res.url)}" target="_blank" rel="noopener">${ICON.drive}<span>Open the folder in Google Drive</span></a></div>`);
    $('#sheetSave').hidden = true;
    $('#sheetCancel').textContent = 'Close';
    $('#sheetBody').querySelectorAll('input').forEach(i => { i.disabled = true; });
  } catch (err) {
    sheetMsg(errText(err), true);
  } finally {
    sheetBusy(false);
  }
}


// Export to this device: separate files through the share sheet on iPhone
// and iPad, one .zip file elsewhere (or if the share sheet refuses them).
const JSZIP = './vendor/jszip/3.10.2/jszip.min.js';
let jszipReady = null;
function loadJSZip() {
  if (!jszipReady) {
    jszipReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSZIP;
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => reject(new Error('The tool for making .zip files couldn\u2019t load. Check your internet connection and try again.'));
      document.head.appendChild(s);
    });
    jszipReady.catch(() => { jszipReady = null; });
  }
  return jszipReady;
}

async function exportToDevice(name, bib, docs, pdfs, mode) {
  sheetBusy(true);
  sheetMsg('Preparing\u2026');
  try {
    // Every file of the export, kept as separate files.
    const files = [
      new File([bib], 'references.bib', { type: 'text/plain' }),
      new File([docs.rtf], 'references.rtf', { type: 'text/plain' }),
    ];
    const failed = [];
    let done = 0;
    const one = async p => {
      try {
        let bytes = await getPdfBytes(p.f);
        if (mode === 'clean') bytes = (await cleanPdf(bytes)).bytes;
        files.push(new File([bytes], p.name, { type: 'application/pdf' }));
      } catch (err) {
        failed.push(p.name + ': ' + errText(err));
      }
      done++;
      sheetMsg((mode === 'clean' ? 'Making clean copies: ' : 'Getting PDFs: ') + done + ' of ' + pdfs.length);
    };
    const queue = pdfs.slice();
    await Promise.all(Array.from({ length: 2 }, async () => { while (queue.length) await one(queue.shift()); }));
    // iPhone and iPad: the share sheet takes the files as they are (Save to
    // Files puts them in a folder you pick or make). Elsewhere: one .zip.
    const separate = coarseMQ.matches && !!navigator.canShare && navigator.canShare({ files });
    let zipBlob = null;
    if (!separate) {
      sheetMsg('Making the .zip file\u2026');
      zipBlob = await makeZip(name, files);
    }
    const ok = pdfs.length - failed.length;
    const size = separate ? files.reduce((n, f) => n + f.size, 0) : zipBlob.size;
    const what = 'references.bib, references.rtf' + (pdfs.length ? ` and ${ok} PDF${ok === 1 ? '' : 's'}` + (mode === 'clean' ? ' (clean copies)' : '') : '');
    const how = coarseMQ.matches ? 'Tap Save, then choose <b>Save to Files</b>.' : 'Click Save to download it.';
    sheetMsg('');
    $('#sheetBody').querySelectorAll('input').forEach(i => { i.disabled = true; });
    $('#sheetBody').insertAdjacentHTML('beforeend', `<div class="export-done"><p><b>${separate ? files.length + ' files are ready' : esc(name) + '.zip is ready'}</b> ` +
      `(${(size / 1048576).toFixed(1)} MB): ${esc(what)}.</p>` +
      (failed.length ? `<p class="warn">${failed.length} PDF${failed.length === 1 ? '' : 's'} couldn\u2019t be added: ${esc(failed.join('; '))}</p>` : '') +
      `<p>${how}</p></div>`);
    sheet = { mode: 'export-save', name, files: separate ? files : null, zipBlob };
    $('#sheetSave').textContent = 'Save\u2026';
  } catch (err) {
    sheetMsg(errText(err), true);
  } finally {
    sheetBusy(false);
  }
}

async function makeZip(name, files) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const folder = zip.folder(name);
  files.forEach(f => folder.file(f.name, f));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

function saveExport() {
  const s = sheet;
  const finish = () => { $('#sheetSave').hidden = true; $('#sheetCancel').textContent = 'Close'; };
  if (s.zipBlob) {
    openIn(s.zipBlob, s.name + '.zip', 'application/zip', 'Downloading ' + s.name + '.zip.');
    finish();
    return;
  }
  navigator.share({ files: s.files }).then(finish).catch(async err => {
    if (err && err.name === 'AbortError') return;
    // The share sheet wouldn't take the files one by one (too many, or too
    // large): make one .zip file instead, for another tap on Save.
    sheetBusy(true);
    sheetMsg('The share sheet couldn\u2019t take the files one by one, so LibLande is making a .zip file instead\u2026');
    try {
      s.zipBlob = await makeZip(s.name, s.files);
      sheetMsg(s.name + '.zip is ready. Tap Save again, then choose Save to Files.');
    } catch (e) {
      sheetMsg(errText(e), true);
    } finally {
      sheetBusy(false);
    }
  });
}


$('#selectBtn').addEventListener('click', () => setPicking(!state.picking));
$('#pickAll').addEventListener('click', () => { state.view.forEach(e => state.picked.add(e.k)); paint(); renderPickBar(); renderDetail(); });
$('#pickNone').addEventListener('click', () => { state.picked.clear(); paint(); renderPickBar(); renderDetail(); });
$('#pickDone').addEventListener('click', () => setPicking(false));
$('#pickExport').addEventListener('click', openExport);

/* ------------------------------------------------------------ keyboard: type to jump, shortcuts */
// Typing letters while the list has focus jumps to the first publication
// whose sorted column starts with them ("La" -> Lande when sorting by author).
let typeBuf = '', typeTimer = null;
function typeToJump(ch) {
  clearTimeout(typeTimer);
  typeTimer = setTimeout(() => { typeBuf = ''; }, 900);
  typeBuf += ch;
  const want = norm(typeBuf);
  const keyOf = {
    author: e => e.kAuthor, title: e => e.kTitle, venue: e => e.kVenue,
    year: e => String(e.yearN || ''), added: e => e.added,
  }[state.sort] || (e => e.kAuthor);
  const i = state.view.findIndex(e => keyOf(e).startsWith(want));
  if (i >= 0) select(i);
}

// The publications a copy shortcut acts on: the selection while selecting,
// otherwise the one shown.
function copyTargets() {
  if (state.picking && state.picked.size) return pickedEntries();
  const e = state.selKey && BYKEY.get(state.selKey);
  return e ? [e] : [];
}
// APA's form for citing several works at once: (A, 2012; B, 2026), in
// reference-list order.
function apaInTextMany(list) {
  const cites = apaOrder(list).map(apaInText);
  return {
    text: '(' + cites.map(c => c.text.slice(1, -1)).join('; ') + ')',
    html: '(' + cites.map(c => c.html.slice(1, -1)).join('; ') + ')',
  };
}
function copyAs(kind) {
  const list = copyTargets(), n = list.length;
  if (!n) { toast('Select a publication first', 1800); return; }
  const many = n > 1 ? ' for ' + n + ' publications' : '';
  if (kind === 'apa') {
    const refs = apaOrder(list).map(apaCitation);
    copy(refs.map(r => r.text).join('\n\n'), n > 1 ? 'Copied ' + n + ' APA references' : 'Copied APA citation',
      n > 1 ? refs.map(r => '<p>' + r.html + '</p>').join('') : refs[0].html);
  } else if (kind === 'short') {
    const c = n > 1 ? apaInTextMany(list) : apaInText(list[0]);
    copy(c.text, 'Copied APA in-text citation' + many, c.html);
  } else if (kind === 'bibtex') {
    copy(list.map(e => bibtex(e)).join('\n'), 'Copied BibTeX' + many);
  } else if (kind === 'key') {
    copy(list.map(e => e.k).join(','), n > 1 ? 'Copied ' + n + ' cite keys' : 'Copied cite key');
  } else if (kind === 'qr') openQr(list);
}

/* ---- a QR code of references */
// For one publication or several (a selection, as a group's): a QR code
// that, scanned with a phone, opens a page on LibLande's site showing
// them, APA, with Copy and their DOIs. The references are in the link
// itself (deflated, in base64url): nothing is uploaded or kept anywhere.
// A QR code holds about 2,900 characters: some 10 to 15 references.
const QRLIB = './vendor/qrcode-generator/2.0.4/qrcode.js';
let qrReady = null;
function loadQrLib() {
  if (!qrReady) {
    qrReady = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = QRLIB;
      s.onload = () => ok(window.qrcode);
      s.onerror = () => no(new Error('The QR code maker couldn\u2019t load. Check your internet connection and try again.'));
      document.head.appendChild(s);
    });
    qrReady.catch(() => { qrReady = null; });
  }
  return qrReady;
}
// (The page: on LibLande's own site, as this copy is, or the public one.)
const qrPage = () => /\.github\.io$/.test(location.hostname) ? new URL('cite.html', location.href).href.split('#')[0] : 'https:\/\/kevinlande.github.io/liblande/cite.html';
async function qrLink(list) {
  const refs = apaOrder(list).map(e => {
    const doi = String(e.f.doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    return [apaCitation(e).html.replace(/<(?!\/?i>)[^>]*>/g, ''), doi || '', doi ? '' : ((e.u || []).find(u => safeUrl(u)) || '')];
  });
  const bytes = new Uint8Array(await new Response(new Blob([JSON.stringify(refs)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return qrPage() + '#r=' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// The code drawn on a canvas, with a margin; null if the link is too long
// for one.
function qrCanvas(qrcode, link) {
  let qr = null;
  for (const level of ['M', 'L']) {
    try { qr = qrcode(0, level); qr.addData(link, 'Byte'); qr.make(); break; } catch (err) { qr = null; }
  }
  if (!qr) return null;
  const n = qr.getModuleCount(), cell = Math.max(4, Math.floor(512 / (n + 8))), size = (n + 8) * cell;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + 4) * cell, (r + 4) * cell, cell, cell);
  return c;
}
async function openQr(list) {
  if (!list.length) { toast('Select a publication first', 1800); return; }
  const n = list.length, what = n === 1 ? '\u201c' + shortTitle(list[0].f.title || list[0].k) + '\u201d' : n + ' references';
  sheet = { mode: 'qr' };
  showSheet(`<h2>QR code</h2><p class="sheet-note">Making it\u2026</p>`, 'Close');
  $('#sheetCancel').hidden = true;
  const s = sheet;
  try {
    const [qrcode, link] = await Promise.all([loadQrLib(), qrLink(list)]);
    if (sheet !== s) return;
    const c = qrCanvas(qrcode, link);
    if (!c) {
      $('#sheetBody').innerHTML = `<h2>QR code</h2><p class="sheet-note">${n} references are too many for one QR code (it holds about 2,900 characters, some 10 to 15 references). Select fewer, and make one for each part.</p>`;
      return;
    }
    s.link = link; s.canvas = c; s.name = n === 1 ? list[0].k : n + ' references';
    $('#sheetBody').innerHTML = `<h2>QR code</h2><p class="sheet-note">Scan with a phone\u2019s camera to see the ${n === 1 ? 'citation' : 'citations'}.</p>` +
      `<div class="qr-box"></div><div class="qr-acts"><button type="button" class="btn" data-qr-copy>${ICON.copy}<span>Copy link</span></button>` +
      `<button type="button" class="btn" data-qr-save>${ICON.download}<span>Save image</span></button>` +
      `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${ICON.drive}<span>Open the page</span></a></div>`;
    $('#sheetBody .qr-box').appendChild(c);
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'QR code for ' + what);
  } catch (err) {
    if (sheet === s) $('#sheetBody').innerHTML = `<h2>QR code</h2><p class="setup-error">${esc(errText(err))}</p>`;
  }
}
$('#sheetBody').addEventListener('click', ev => {
  if (!sheet || sheet.mode !== 'qr' || !sheet.link) return;
  if (ev.target.closest('[data-qr-copy]')) copy(sheet.link, 'Copied the link');
  if (ev.target.closest('[data-qr-save]')) {
    const name = 'QR code - ' + sheet.name.replace(/[\\/:*?"<>|]/g, '') + '.png';
    sheet.canvas.toBlob(b => { if (b) b.arrayBuffer().then(buf => openIn(new Uint8Array(buf), name, 'image/png', 'Saving ' + name + '.', 'download')); }, 'image/png');
  }
});

/* ---- keyboard shortcuts, the changeable ones yours to set */
// A shortcut is a key (KeyboardEvent.code) with any of Ctrl, Alt, Shift
// and Meta, as "Alt+KeyA". Library ones work in the list; reader ones
// while a paper is open; both, in either (the citations: in the reader,
// the open paper's). Yours are kept with your preferences, so your other
// devices have them too.
const KEY_ACTS = [
  { id: 'copyApa', scope: 'both', def: 'Alt+KeyA', label: 'Copy APA citation (long)' },
  { id: 'copyShort', scope: 'both', def: 'Alt+Shift+KeyA', label: 'Copy APA in-text citation (short)' },
  { id: 'copyBib', scope: 'lib', def: 'Alt+KeyB', label: 'Copy BibTeX' },
  { id: 'copyKey', scope: 'lib', def: 'Alt+KeyK', label: 'Copy cite key' },
  { id: 'edit', scope: 'lib', def: 'Alt+KeyE', label: 'Edit the publication' },
  { id: 'quote', scope: 'pdf', def: 'Alt+KeyC', label: 'Copy the selected passage as a quotation, with its citation' },
  { id: 'closeTab', scope: 'pdf', def: 'Alt+KeyW', label: 'Close the paper’s tab' },
  { id: 'done', scope: 'pdf', def: 'Alt+KeyD', label: 'Done with the paper (marked read, and off your reading list)' },
  { id: 'share', scope: 'pdf', def: 'Alt+KeyM', label: 'Share the paper as it is, with its citation (as for Mail)' },
  { id: 'shareClean', scope: 'pdf', def: 'Alt+Shift+KeyM', label: 'Share a clean copy (no annotations)' },
  { id: 'download', scope: 'pdf', def: 'Alt+KeyS', label: 'Download (save) the paper as it is' },
  { id: 'downloadClean', scope: 'pdf', def: 'Alt+Shift+KeyS', label: 'Download a clean copy (no annotations)' },
  { id: 'markup', scope: 'pdf', def: 'KeyH', label: 'Highlighter' },
  { id: 'lines', scope: 'pdf', def: 'KeyU', label: 'Underline and strike-through' },
  { id: 'pen', scope: 'pdf', def: 'KeyP', label: 'Pen' },
  { id: 'eraser', scope: 'pdf', def: 'KeyE', label: 'Eraser' },
  { id: 'text', scope: 'pdf', def: 'KeyT', label: 'Text box' },
  { id: 'comment', scope: 'pdf', def: 'KeyN', label: 'Note: pin a note to the page' },
  { id: 'select', scope: 'pdf', def: 'KeyV', label: 'Select marks' },
  { id: 'bookmark', scope: 'pdf', def: 'KeyB', label: 'Bookmark the page' },
];
const KEYS = { mine: store.get('keys', {}), at: store.get('keysAt', 0), listen: null };
const keyOf = id => KEYS.mine[id] || KEY_ACTS.find(a => a.id === id).def;
const comboOf = ev => [ev.ctrlKey && 'Ctrl', ev.altKey && 'Alt', ev.shiftKey && 'Shift', ev.metaKey && 'Meta'].filter(Boolean).concat(ev.code).join('+');
const keyIs = (ev, id) => comboOf(ev) === keyOf(id);
// (In the library, or the reader: a shortcut for both is in each.)
const inScope = (a, scope) => a.scope === scope || a.scope === 'both';
const scopesMeet = (a, b) => a.scope === 'both' || b.scope === 'both' || a.scope === b.scope;
const KEY_NAMES = { Minus: '−', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: '\'', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Backquote: '`', Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
function keyLabel(combo) {
  const parts = combo.split('+'), code = parts.pop();
  const key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : KEY_NAMES[code] || code;
  return parts.map(p => ({ Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' })[p]).join('') + key;
}
const keyHint = id => keyLabel(keyOf(id));
function keysSave() {
  KEYS.at = Date.now();
  store.set('keys', KEYS.mine);
  store.set('keysAt', KEYS.at);
  if (gs && SYNC.keys) google.script.run.withFailureHandler(() => {}).savePrefs({ keys: KEYS.mine, keysAt: KEYS.at });
}
function keysMerge(prefs) {
  if (SYNC.keys && prefs && prefs.keysAt > KEYS.at) { KEYS.mine = prefs.keys || {}; KEYS.at = prefs.keysAt; store.set('keys', KEYS.mine); store.set('keysAt', KEYS.at); }
}
// The ones that stay as they are.
const KEYS_FIXED = {
  lib: [['Return', 'Read the PDF'], ['↑ ↓', 'Previous or next publication'], ['Letters', 'Jump to publications starting with them, in the sorted column'],
    ['/ or ⌘F', 'Search'], ['⌘-click, ⇧-click', 'Select several publications'], ['⌘A', 'Select all shown'], ['Esc', 'Stop selecting, or close a window'], ['?', 'This list']],
  pdf: [['⌘F', 'Search in the paper'], ['⌘S', 'Save the marks now'], ['+ −', 'Zoom in or out'], ['Esc', 'Put the tool down; with none on, close the paper']],
};
function openShortcuts() {
  sheet = { mode: 'help' };
  KEYS.listen = null;
  const rows = scope => KEY_ACTS.filter(a => inScope(a, scope)).map(a =>
    `<tr><th><button type="button" class="key-set" data-key-id="${a.id}" title="Change it"><kbd>${esc(keyHint(a.id))}</kbd></button></th><td>${esc(a.label)}${KEYS.mine[a.id] ? ' <span class="key-mine">yours</span>' : ''}</td></tr>`).join('') +
    KEYS_FIXED[scope].map(([k, d]) => `<tr><th><kbd>${esc(k)}</kbd></th><td>${esc(d)}</td></tr>`).join('');
  showSheet(`<h2>Keyboard shortcuts</h2><p class="sheet-note">Click a shortcut in a box to change it, then press the keys you want. With several publications selected, the copy shortcuts copy all of them.</p>` +
    `<h3 class="keys-h">In the library</h3><table class="keys"><tbody>${rows('lib')}</tbody></table>` +
    `<h3 class="keys-h">Reading a paper</h3><table class="keys"><tbody>${rows('pdf')}</tbody></table>` +
    (Object.keys(KEYS.mine).length ? `<p><button type="button" class="btn" data-keys-reset>Back to the usual shortcuts</button></p>` : ''), 'Close');
  $('#sheetCancel').hidden = true;
}
$('#sheetBody').addEventListener('click', ev => {
  if (!sheet || sheet.mode !== 'help') return;
  if (ev.target.closest('[data-keys-reset]')) { KEYS.mine = {}; keysSave(); openShortcuts(); return; }
  const b = ev.target.closest('[data-key-id]');
  if (!b) return;
  $('#sheetBody').querySelectorAll('.key-set.listening').forEach(x => { x.classList.remove('listening'); x.innerHTML = `<kbd>${esc(keyHint(x.dataset.keyId))}</kbd>`; });
  KEYS.listen = b.dataset.keyId;
  b.classList.add('listening');
  b.innerHTML = '<kbd>Press keys…</kbd>';
  sheetMsg('');
});
// While waiting for the new keys: Esc gives up; a combination already in
// use, or the browser's, is refused, with why.
document.addEventListener('keydown', ev => {
  if (!KEYS.listen || !sheet || sheet.mode !== 'help') return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  if (/^(Shift|Alt|Control|Meta|OS)(Left|Right)?$/.test(ev.code) || /^(Shift|Alt|Control|Meta)$/.test(ev.key)) return;
  const id = KEYS.listen, a = KEY_ACTS.find(x => x.id === id);
  if (ev.key === 'Escape') { KEYS.listen = null; openShortcuts(); return; }
  const combo = comboOf(ev);
  let why = '';
  if (ev.metaKey) why = '⌘ shortcuts belong to the browser. Try ⌥ or ⌃ instead.';
  else if (inScope(a, 'lib') && !ev.altKey && !ev.ctrlKey) why = 'In the library, letters on their own jump through the list, so add ⌥ or ⌃.';
  else {
    const other = KEY_ACTS.find(x => x.id !== id && scopesMeet(x, a) && keyOf(x.id) === combo);
    if (other) why = keyLabel(combo) + ' is already for “' + other.label + '”.';
    const fixed = (a.scope === 'both' ? ['lib', 'pdf'] : [a.scope]).some(s => KEYS_FIXED[s].some(([k]) => k === keyLabel(combo))) || ['Escape', 'Enter', 'Tab'].includes(ev.code) || /^Arrow/.test(ev.code);
    if (!why && fixed) why = keyLabel(combo) + ' is already taken.';
  }
  if (why) { sheetMsg(why, true); return; }
  KEYS.listen = null;
  if (combo === a.def) delete KEYS.mine[id]; else KEYS.mine[id] = combo;
  keysSave();
  openShortcuts();
  toast(a.label + ': ' + keyLabel(combo), 2500);
}, true);
// What a reader shortcut does.
function runPdfKey(id) {
  const tog = t => { if (gs) setTool(V.tool === t ? 'read' : t); };
  if (id === 'quote') showQuote().then(sel => { if (sel) quoteCopy(); else toast('Select a passage to quote first', 1800); });
  else if (id === 'closeTab') { if (PTABS.active >= 0) closePaperTab(PTABS.active); }
  else if (id === 'done') readerDone();
  else if (id === 'markup') { if (gs) setTool(V.tool === 'highlight' ? 'read' : 'markup'); }
  else if (id === 'lines') { if (gs) setTool(LINE_TOOLS.has(V.tool) ? 'read' : 'lines'); }
  else if (id === 'bookmark') { if (V.doc) toggleBookmark(V.viewer.currentPageNumber); }
  // (As the Share menu's items: the key press lets the share sheet open.)
  else if (id === 'copyApa' || id === 'copyShort') {
    const e = V.entry;
    if (!e) return;
    if (id === 'copyApa') { const r = apaCitation(e); copy(r.text, 'Copied APA citation', r.html); }
    else { const c = apaInText(e); copy(c.text, 'Copied APA in-text citation', c.html); }
  }
  else if (SHARE_KEYS[id]) { const b = $(`#vShare [data-vshare="${SHARE_KEYS[id]}"]`); if (b && V.file) b.click(); }
  else tog(id);
}

$('#keysBtn').addEventListener('click', openShortcuts);
