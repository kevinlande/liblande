// LibLande: the Inbox: works you're considering, kept apart from your library until you add them (or let them go).
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, related, marksindex, inbox, trash, citecard, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/inbox.js'] = '2026-11-20.03';
/* ------------------------------------------------------------ the Inbox */
// Works you came across (cited in a paper you're reading, say) and want to
// look at before deciding to keep them: their details, where you found
// them, and their PDF if you get one, kept in LibLande/inbox.json and
// LibLande/Inbox/Papers in Drive, never in the .bib. Add to library puts
// one in (with its PDF); Remove lets it go, and LibLande remembers you
// passed on it. Shown in the library in the Reading list's tab (its arrow
// switches between the two), and in the reader's new tab.
// An item: { id, at (last changed), added, title, people ["Family, Given"],
// year, venue, doi, type, abs, url, from {k, title, page} or {src},
// pdf {id, n} }; one let go: { id, at, gone: 1, passed: 1 (or added: 1),
// title, doi }. Each device keeps its copy, and changes go to Drive item
// by item, the latest change to each kept, so two devices can both add.
const INBOX = { items: store.get('inbox', {}), pending: store.get('inboxPending', {}), busy: null, timer: 0, loadedAt: 0, cache: new Map() };
const IB_PRE = 'ib:';
// Faint once untouched this long.
const IB_STALE = 45 * 86400000;
const ibLive = () => Object.values(INBOX.items).filter(x => !x.gone);
const ibDoi = d => String(d || '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '');
// (An item's id: its DOI, or else its title and first author.)
function ibIdOf(c) {
  const d = ibDoi(c.doi);
  if (d) return 'doi:' + d;
  return 't:' + plainTitle(c.title).slice(0, 80) + '|' + norm(tsFamily((c.people || [])[0]));
}
// One in the Inbox (or let go) for a candidate, by DOI or title.
function ibFind(c) {
  if (!c) return null;
  const byId = INBOX.items[ibIdOf(c)];
  if (byId) return byId;
  const t = plainTitle(c.title), d = ibDoi(c.doi);
  return Object.values(INBOX.items).find(x => (d && ibDoi(x.doi) === d) || (t && plainTitle(x.title) === t && (!c.year || !x.year || String(c.year) === String(x.year)))) || null;
}
const ibHas = c => { const x = ibFind(c); return x && !x.gone ? x : null; };
const ibPassed = c => { const x = ibFind(c); return x && x.gone && x.passed ? x : null; };
function ibStore() { store.set('inbox', INBOX.items); store.set('inboxPending', INBOX.pending); }

/* ---- kept in Drive */
// (Changes: kept here at once, sent a moment later; while offline, kept to
// send when back.)
function ibPut(x) {
  x.at = Math.max(Date.now(), (INBOX.items[x.id] && INBOX.items[x.id].at || 0) + 1);
  INBOX.items[x.id] = x;
  INBOX.pending[x.id] = x;
  INBOX.cache.delete(x.id);
  ibStore();
  ibSendSoon();
  ibChanged();
}
function ibSendSoon() { clearTimeout(INBOX.timer); INBOX.timer = setTimeout(ibSend, 600); }
async function ibSend() {
  if (!gs || INBOX.busy || isOffline()) return;
  const items = INBOX.pending;
  if (!Object.keys(items).length) return;
  INBOX.pending = {};
  ibStore();
  INBOX.busy = callServer('putInbox', { items }).then(r => { if (ibMerge(r)) ibChanged(); }, () => {
    // (Not sent: kept, unless changed again meanwhile.)
    Object.entries(items).forEach(([id, x]) => { if (!INBOX.pending[id] || INBOX.pending[id].at < x.at) INBOX.pending[id] = x; });
    ibStore();
  }).finally(() => { INBOX.busy = null; });
  await INBOX.busy;
}
window.addEventListener('online', ibSendSoon);
window.addEventListener('liblande-reach', ev => { if (ev.detail && ev.detail.ok) ibSendSoon(); });
// What Drive has, merged in: each item kept at its latest change.
function ibMerge(r) {
  let changed = false;
  Object.entries((r && r.items) || {}).forEach(([id, x]) => {
    const mine = INBOX.items[id];
    if (!x || (mine && (mine.at || 0) >= (x.at || 0))) return;
    INBOX.items[id] = x;
    INBOX.cache.delete(id);
    changed = true;
  });
  if (changed) ibStore();
  return changed;
}
// Read from Drive on opening (and again after a while away): then what's
// waiting here is sent.
function ibLoad(force) {
  if (!gs || (!force && Date.now() - INBOX.loadedAt < 60 * 1000)) return Promise.resolve();
  INBOX.loadedAt = Date.now();
  return Promise.resolve().then(() => callServer('getInbox')).then(r => { if (ibMerge(r)) ibChanged(); }, () => {}).then(ibSendSoon);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ENTRIES.length) ibLoad(); });
// Shown again wherever it shows: the tab's count, the list, the reader's
// start page and bar.
function ibChanged() {
  if (!ENTRIES.length) return;
  if (state.group === 'inbox') refresh(false); else renderTabs();
  if (!$('#viewer').hidden && $('#viewer').classList.contains('start')) renderStart();
  ibBar();
}

/* ---- as rows in the library */
// Each item as a publication-like entry (not in the library: its key
// starts ib:), for the list's rows and columns, searching and sorting.
function ibEntry(x) {
  const was = INBOX.cache.get(x.id);
  if (was && was.inbox === x) return was;
  const people = (x.people || []).map(p => { const [fam, giv] = String(p).split(','); return [String(fam || '').trim(), String(giv || '').trim()]; }).filter(p => p[0]);
  const t = x.type === 'book' ? 'book' : x.type === 'chapter' || x.type === 'incollection' ? 'incollection' : 'article';
  const venueField = t === 'book' ? 'publisher' : t === 'incollection' ? 'booktitle' : 'journal';
  const e = {
    k: IB_PRE + x.id, t, inbox: x, a: people, e: [], u: x.url ? [x.url] : [],
    f: { title: x.title || '', year: x.year ? String(x.year) : '', [venueField]: x.venue || '', doi: x.doi || '', abstract: x.abs || '',
      'date-added': new Date(x.added || x.at || Date.now()).toISOString().replace('T', ' ').slice(0, 19) },
    files: x.pdf && x.pdf.id ? [{ id: x.pdf.id, n: x.pdf.n || 'PDF', p: 'LibLande/Inbox/Papers/' + (x.pdf.n || 'PDF') }] : null,
  };
  prep(e);
  INBOX.cache.set(x.id, e);
  return e;
}
const ibEntries = () => ibLive().sort((a, b) => (b.added || 0) - (a.added || 0)).map(ibEntry);
const ibByKey = k => { if (!String(k || '').startsWith(IB_PRE)) return null; const x = INBOX.items[k.slice(IB_PRE.length)]; return x && !x.gone ? ibEntry(x) : null; };
const ibStale = x => Date.now() - Math.max(x.added || 0, x.touched || 0) > IB_STALE;

/* ---- adding */
// A work into the Inbox, from a citation's card, Related or Cited here:
// its details (and where it was found: the paper open in the reader, at
// the page you're on).
function ibAdd(c, from) {
  if (!gs || !c || !c.title) return null;
  const have = ibHas(c);
  if (have) { toast('Already in your Inbox', 2200, { label: 'Show', run: () => ibShow(have.id) }); return have; }
  const id = ibIdOf(c), was = INBOX.items[id];
  const x = {
    id, added: Date.now(), title: String(c.title).replace(/[{}]/g, ''), people: (c.people || []).slice(0, 30), year: c.year ? String(c.year) : '',
    venue: c.venue || '', doi: ibDoi(c.doi), type: c.type || '', abs: c.absText || c.abs || '', url: c.url || '',
    from: from || ibFrom(),
  };
  if (was && was.pdf) x.pdf = was.pdf;
  ibPut(x);
  toast('Added to your Inbox', 2600, { label: 'Show', run: () => ibShow(id) });
  return x;
}
// Where it was found: the paper open in the reader, and the page.
function ibFrom() {
  if ($('#viewer').hidden || !V.entry || !V.doc) return null;
  const e = V.entry, label = V.pageLabels && V.pageLabels[V.viewer.currentPageNumber - 1];
  return { k: e.k, title: [e.authorsShort || '', e.f && e.f.year || ''].filter(Boolean).join(' '), page: String(label || V.viewer.currentPageNumber) };
}
const ibFromText = x => !x.from ? '' : x.from.src ? x.from.src : (x.from.title || 'a paper') + (x.from.page ? ', p. ' + x.from.page : '');

/* ---- the switch: Reading list or Inbox */
const rlWhich = () => (store.get('rlWhich', 'toread') === 'inbox' ? 'inbox' : 'toread');
function rlSwitchMenu(btn, onPick) {
  const was = $('#tabsMenu');
  closeTabsMenu();
  if (was && was.dataset.side === 'rlswitch') return;
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu link-menu recent-menu rl-switch';
  m.id = 'tabsMenu';
  m.dataset.side = 'rlswitch';
  m.setAttribute('role', 'menu');
  const n = id => (groupItems(id) || []).length.toLocaleString();
  const item = (id, icon, name, sub) => `<button type="button" role="menuitemradio" aria-checked="${rlWhich() === id}" data-rlw="${id}">${icon}` +
    `<span class="op-text"><span class="rc-title">${name}</span><span class="rc-sub">${sub}</span></span><span class="lm-ct">${n(id)}</span></button>`;
  m.innerHTML = item('toread', ICON.bookmark, 'Reading list', 'In your library, to read') + item('inbox', ICON.inbox, 'Inbox', 'Not in your library yet, to decide on');
  m.querySelectorAll('[aria-checked="true"] .lm-ct').forEach(c => c.insertAdjacentHTML('beforebegin', '<span class="rlw-tick" aria-hidden="true">\u2713</span>'));
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  // (Opened by resting the pointer on the tab: kept while the pointer's on it.)
  m.addEventListener('pointerenter', () => clearTimeout(RLH.hide));
  m.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse' && RLH.hov) RLH.hide = setTimeout(rlMenuClose, 250); });
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-rlw]');
    if (!b) return;
    closeTabsMenu();
    store.set('rlWhich', b.dataset.rlw);
    onPick(b.dataset.rlw);
  });
}

// Resting the pointer on the tab (as on the Reader button) brings the
// menu down; leaving it, and the menu, puts it away.
const RLH = { t: 0, hide: 0, hov: false, on: false };
const rlMenuOpen = () => { const m = $('#tabsMenu'); return !!(m && m.dataset.side === 'rlswitch'); };
function rlMenuClose() { RLH.hov = false; if (rlMenuOpen()) closeTabsMenu(); }
$('#tabScroll').addEventListener('pointerover', ev => {
  if (ev.pointerType !== 'mouse') return;
  const tab = ev.target.closest('.rl-slot');
  if (!tab || (ev.relatedTarget && tab.contains(ev.relatedTarget))) return;
  RLH.on = true;
  clearTimeout(RLH.hide);
  if (rlMenuOpen()) return;
  clearTimeout(RLH.t);
  RLH.t = setTimeout(() => {
    const now = $('#tabScroll .rl-slot');
    if (!now || !RLH.on || rlMenuOpen()) return;
    rlSwitchMenu(now, id => setGroup(id));
    RLH.hov = true;
  }, 350);
});
$('#tabScroll').addEventListener('pointerout', ev => {
  if (ev.pointerType !== 'mouse') return;
  const tab = ev.target.closest('.rl-slot');
  if (!tab || (ev.relatedTarget && tab.contains(ev.relatedTarget))) return;
  RLH.on = false;
  clearTimeout(RLH.t);
  if (RLH.hov) RLH.hide = setTimeout(rlMenuClose, 250);
});

/* ---- an item's page in the library */
function ibDetailHTML(e) {
  const x = e.inbox, people = e.a.map(fullName);
  const venue = [x.venue ? `<i>${esc(x.venue)}</i>` : '', esc(x.year || '')].filter(Boolean).join(', ');
  const link = x.doi ? 'https:\/\/doi.org/' + x.doi : safeUrl(x.url) ? x.url : '';
  const from = x.from ? `<div class="ib-from">${IB_NOTE_ICON}<span>Found in ` +
    (x.from.k && BYKEY.get(x.from.k) ? `<button type="button" class="linkish" data-ib="from">${esc(ibFromText(x))}</button>` : esc(ibFromText(x))) +
    ` \u00b7 ${esc(ago(Math.round((x.added || x.at) / 1000)))}</span></div>` : '';
  const pdf = e.files && e.files[0];
  const finds = findPdfItems(e);
  let side = pdf
    ? `<button type="button" class="btn primary" data-ib="read">${ICON.read}<span>Read</span></button><p class="ib-state">PDF in your Inbox</p>`
    : `<details class="menu ib-find"${finds ? '' : ' hidden'}><summary class="btn primary">${FIND_ICON}<span>Find PDF</span>${ICON.chev}</summary><div class="menu-list" role="menu">${finds}</div></details>` +
      `<button type="button" class="btn${finds ? '' : ' primary'}" data-ib="attach">${ICON.plus}<span>Attach a PDF\u2026</span></button><p class="ib-state">Or drop its PDF here.</p>`;
  side += `<button type="button" class="btn" data-ib="add">${ICON.plus}<span>Add to library</span></button>` +
    `<button type="button" class="btn quiet" data-ib="remove">${ICON.trash}<span>Remove</span></button>`;
  return `<div class="d-inner ib-page"><div class="ib-main"><div class="d-kicker"><span class="d-type">${esc(TYPE_NAMES[e.t] || 'Publication')}</span><span class="pill ib-pill">${ICON.inbox}Inbox</span></div>` +
    `<h1 class="d-title">${esc(x.title || '(untitled)')}</h1>` +
    (people.length ? `<p class="ib-people">${esc(people.join(', '))}</p>` : '') +
    (venue ? `<p class="ib-venue">${venue}</p>` : '') +
    (link ? `<p class="ib-link"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(x.doi ? 'doi.org/' + x.doi : link.replace(/^https?:\/\//, ''))}</a></p>` : '') +
    from + (x.abs ? `<section class="d-sec"><h3>Abstract</h3><p class="d-abstract">${esc(x.abs)}</p></section>` : '') +
    `</div><div class="ib-side">${side}</div></div>`;
}
const IB_NOTE_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/></svg>';
detailEl.addEventListener('click', ev => {
  const e = ibByKey(state.selKey);
  if (!e) return;
  const fp = ev.target.closest('[data-find-pdf]');
  if (fp) { const d = fp.closest('details'); if (d) d.open = false; findPdf(e, fp.dataset.findPdf); return; }
  const b = ev.target.closest('[data-ib]');
  if (b) ibAct(e, b.dataset.ib);
});
function ibAct(e, act) {
  const x = e.inbox;
  if (act === 'read') { if (e.files) { x.touched = Date.now(); openPaper(e, e.files[0]); } }
  else if (act === 'attach') { IB_ATTACH.x = x; $('#ibAttachInput').click(); }
  else if (act === 'add') ibToLibrary(x);
  else if (act === 'remove') ibRemove(x);
  else if (act === 'from' && x.from && BYKEY.get(x.from.k)) relOpen(BYKEY.get(x.from.k));
}
// A PDF for it: uploaded to LibLande/Inbox/Papers (where Add files it
// from, when it's added).
const IB_ATTACH = { x: null };
async function ibAttach(x, file) {
  if (!isPdf(file)) { toast('Only a PDF can go with it, and \u201c' + (file && file.name) + '\u201d isn\u2019t one.', 4000); return; }
  if (isOffline()) { toast('Attaching a PDF needs a connection.', 4000); return; }
  toast('Uploading ' + file.name + '\u2026', 0, null, true);
  try {
    const info = await callServer('getInboxUploadInfo');
    const name = (tsFamily((x.people || [])[0]) || 'Inbox') + (x.year ? ' ' + x.year : '') + ' - ' + String(x.title || '').slice(0, 60).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf';
    const up = await uploadPdf(file, name, info);
    const now = INBOX.items[x.id];
    if (!now || now.gone) { toast('', 1); return; }
    ibPut(Object.assign({}, now, { pdf: { id: up.id, n: name }, touched: Date.now() }));
    // (The one it replaces: let go.)
    if (now.pdf && now.pdf.id && now.pdf.id !== up.id) callServer('trashInboxFile', { id: now.pdf.id }).catch(() => {});
    toast('PDF attached', 2200, { label: 'Read', run: () => { const e = ibByKey(IB_PRE + x.id); if (e && e.files) openPaper(e, e.files[0]); } });
  } catch (err) { toast('Couldn\u2019t attach the PDF: ' + errText(err), 6000); }
}
$('#ibAttachInput').addEventListener('change', ev => {
  const file = ev.target.files[0], x = IB_ATTACH.x;
  ev.target.value = '';
  IB_ATTACH.x = null;
  if (file && x) ibAttach(x, file);
});
// Let go (with Undo for a moment): its PDF to Drive's trash, and LibLande
// remembers you passed on it.
function ibRemove(x, quiet) {
  const before = Object.assign({}, x);
  ibPut({ id: x.id, gone: 1, passed: 1, title: x.title, doi: x.doi, year: x.year, people: (x.people || []).slice(0, 1), passedAt: Date.now() });
  if (!$('#viewer').hidden && V.entry && V.entry.k === IB_PRE + x.id) ibBar();
  // (Into the Trash, with its PDF, to put back for 45 days. Offline: let
  // go here, its PDF left in LibLande/Inbox/Papers.)
  const sent = !isOffline() ? callServer('trashThing', { kind: 'inbox', item: { title: x.title || '', who: (x.people || []).map(tsFamily).slice(0, 2).join(' & ') + ((x.people || []).length > 2 ? ' et al.' : ''), year: x.year || '', inbox: before },
    files: x.pdf && x.pdf.id ? [x.pdf] : [] }).then(r => { trSet(r.trash); return r.item; }, () => null) : Promise.resolve(null);
  if (quiet) return;
  toast('Removed \u201c' + shortTitle(x.title || '') + '\u201d from your Inbox (in the Trash for 45 days)', 6000, { label: 'Undo', run: async () => {
    const item = await sent;
    if (item) trRestore(item.id, true); else ibPut(Object.assign(before, { touched: Date.now() }));
  } });
}
// Into the library: Add, filled in from it (its DOI, or its details), with
// its PDF; once added, it leaves the Inbox.
function ibToLibrary(x) {
  if (!gs || $('#addBtn').hidden) return;
  if (sheet) { toast('Save or cancel ' + (sheet.mode === 'edit' ? 'Edit' : 'what\u2019s open') + ' first.', 4000); return; }
  relAddFrom(x.doi ? { doi: x.doi } : { title: x.title, people: x.people || [] });
  if (!sheet) return;
  sheet.inboxId = x.id;
  if (x.pdf && x.pdf.id) { sheet.inboxPdf = x.pdf; ibAddPdfNote(); }
}
// (In Add: its PDF from the Inbox, said so.)
function ibAddPdfNote() {
  const note = $('#addPdfName');
  if (note && sheet && sheet.inboxPdf && !$('#addPdf').files[0] && !sheet.pdf) { note.hidden = false; note.textContent = 'With its PDF from your Inbox: ' + sheet.inboxPdf.n; }
}
// Added: out of the Inbox (its PDF went with it).
function ibAdded(id) {
  const x = INBOX.items[id];
  if (!x || x.gone) return;
  ibPut({ id, gone: 1, added: 1, title: x.title, doi: x.doi, year: x.year, people: (x.people || []).slice(0, 1) });
}
// Shown in the library, in the Inbox.
function ibShow(id) {
  if (!$('#viewer').hidden) closeReader();
  store.set('rlWhich', 'inbox');
  if (state.group !== 'inbox') setGroup('inbox');
  state.selKey = IB_PRE + id;
  refresh(false);
  revealSelected();
  if (phoneMQ.matches) go('detail');
}

/* ---- in the reader */
// An Inbox paper open: a bar to say so, with Add to library and Remove;
// your notes and the reading list aren't for it.
function ibBar() {
  const bar = $('#vIbBar');
  if (!bar) return;
  const x = V.entry && V.entry.inbox && !$('#viewer').classList.contains('start') ? INBOX.items[V.entry.inbox.id] : null;
  const live = x && !x.gone;
  bar.hidden = !x;
  $('#viewer').classList.toggle('ib-paper', !!x);
  if (!x) return;
  bar.innerHTML = live
    ? `${ICON.inbox}<span class="ib-bar-t">In your <b>Inbox</b>, not your library</span><span class="sp"></span>` +
      `<button type="button" class="btn primary" data-ibbar="add">${ICON.plus}<span>Add to library</span></button><button type="button" class="btn quiet" data-ibbar="remove">Remove</button>`
    : `${ICON.inbox}<span class="ib-bar-t">${x.added ? 'Added to your library' : 'Removed from your Inbox'}</span>`;
}
$('#vIbBar').addEventListener('click', ev => {
  const b = ev.target.closest('[data-ibbar]'), x = V.entry && V.entry.inbox && INBOX.items[V.entry.inbox.id];
  if (!b || !x || x.gone) return;
  if (b.dataset.ibbar === 'add') ibToLibrary(x); else ibRemove(x);
});
