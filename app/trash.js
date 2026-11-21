// LibLande: the Trash: what's deleted in LibLande (publications, Inbox items, replaced PDFs), kept 45 days to put back.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, related, marksindex, inbox, trash, citecard, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/trash.js'] = '2026-11-20.08';
/* ------------------------------------------------------------ the Trash */
// Kept in Drive (LibLande/trash.json, the files in LibLande/Trash: see
// pages/edits.js), the same on every device. A publication moved to the
// Trash leaves the .bib (its entry kept as it was written), its groups and
// the reading list, and its PDFs go to LibLande/Trash; Restore puts it all
// back. After 45 days it's deleted for good: its files to Drive's own
// trash (30 days more there). Shown at the foot of the sidebar's Library.
const TRASH = { items: {}, kept: new Map(), cache: new Map(), loadedAt: 0 };
const TR_PRE = 'tr:', TR_DAYS = 45;
const trList = () => Object.values(TRASH.items).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
const trLeft = x => Math.max(0, Math.ceil((x.deletedAt + TR_DAYS * 86400000 - Date.now()) / 86400000));
const TR_KINDS = { pub: 'Publication', inbox: 'Inbox item', pdf: 'Replaced PDF' };
function trSet(d) {
  if (!d || !d.items) return;
  TRASH.items = d.items;
  TRASH.cache.clear();
  if (!ENTRIES.length) return;
  renderGroups();
  if (state.group === 'trash') refresh(false);
}
function trLoad(force) {
  if (!gs || (!force && Date.now() - TRASH.loadedAt < 5 * 60 * 1000)) return Promise.resolve();
  TRASH.loadedAt = Date.now();
  return Promise.resolve().then(() => callServer('getTrash')).then(trSet, () => {});
}
// Each as a row of the list (its key starts tr:).
function trEntry(x) {
  const was = TRASH.cache.get(x.id);
  if (was) return was;
  const who = String(x.who || '').split(/\s*(?:&|,| and )\s*/).filter(Boolean).map(n => [n.replace(/ et al\.?$/, ''), '']);
  const e = { k: TR_PRE + x.id, t: 'misc', trash: x, a: who, e: [], u: [],
    f: { title: x.title || '(untitled)', year: x.year ? String(x.year) : '', journal: TR_KINDS[x.kind] || '', 'date-added': new Date(x.deletedAt || Date.now()).toISOString().replace('T', ' ').slice(0, 19) },
    files: null };
  prep(e);
  TRASH.cache.set(x.id, e);
  return e;
}
const trEntries = () => trList().map(trEntry);
const trByKey = k => { if (!String(k || '').startsWith(TR_PRE)) return null; const x = TRASH.items[k.slice(TR_PRE.length)]; return x ? trEntry(x) : null; };

/* ---- an item's page */
function trDetailHTML(e) {
  const x = e.trash, left = trLeft(x);
  const files = (x.files || []).length, groups = (x.groups || []).length;
  const kept = x.kind === 'pub' ? [files ? (files === 1 ? 'its PDF' : 'its ' + files + ' PDFs') : '', /(^|[\s,])annote\s*=/i.test(x.entry || '') ? 'your notes on it' : '', groups ? 'its place in ' + (groups === 1 ? 'a group (' + x.groups[0] + ')' : groups + ' groups') : '', x.rl ? 'its place on your reading list' : ''].filter(Boolean)
    : x.kind === 'inbox' ? [files ? 'its PDF' : '', 'where you found it'].filter(Boolean) : [];
  const when = new Date(x.deletedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const back = x.kind === 'pub' ? 'Back into your library' + (groups ? (x.rl ? ', its groups and reading list' : ', its group' + (groups > 1 ? 's' : '')) : x.rl ? ' and reading list' : '') + (files ? ', with its PDF' : '')
    : x.kind === 'inbox' ? 'Back into your Inbox' : 'Back with \u201c' + esc(shortTitle(x.title || '')) + '\u201d, as another PDF';
  return `<div class="d-inner ib-page tr-page"><div class="ib-main"><div class="d-kicker"><span class="d-type">${esc(TR_KINDS[x.kind] || 'Deleted')}</span><span class="pill tr-pill">${ICON.trash}Trash</span></div>` +
    `<h1 class="d-title">${esc(x.title || '(untitled)')}</h1>` +
    ((x.who || x.year) ? `<p class="ib-people">${esc([x.who, x.year].filter(Boolean).join(' \u00b7 '))}</p>` : '') +
    `<div class="ib-from tr-when">${ICON.trash}<span>Deleted ${esc(when)}${x.dev ? ', on your ' + esc(x.dev) : ''}.` +
    (kept.length ? ` Kept with it: ${esc(kept.join(', '))}.` : '') + `</span></div>` +
    `<p class="tr-left${left <= 3 ? ' soon' : ''}">Deleted for good ${left ? 'in ' + left + ' day' + (left === 1 ? '' : 's') : 'when LibLande next opens'}.</p>` +
    `</div><div class="ib-side"><button type="button" class="btn primary" data-tr="restore">${UNDO_ICON}<span>Restore</span></button>` +
    `<p class="ib-state">${back}</p><button type="button" class="btn quiet danger" data-tr="delete">${ICON.trash}<span>Delete now\u2026</span></button>` +
    `<button type="button" class="btn quiet danger" data-tr="empty">Empty Trash\u2026</button></div></div>`;
}
detailEl.addEventListener('click', ev => {
  const e = trByKey(state.selKey);
  const b = e && ev.target.closest('[data-tr]');
  if (!b) return;
  if (b.dataset.tr === 'restore') trRestore(e.trash.id);
  else if (b.dataset.tr === 'delete') trAsk('delete', [e.trash.id]);
  else if (b.dataset.tr === 'empty') trAsk('empty', Object.keys(TRASH.items));
});

/* ---- moving a publication to the Trash */
// Asked first, saying what goes with it.
function trAskPub(list) {
  if (!gs || !list.length) return;
  if (sheet) { toast('Save or cancel what\u2019s open first.', 3000); return; }
  if (isOffline()) { toast('Moving to the Trash needs a connection.', 3500); return; }
  if (list.some(e => e.ib || e.inbox || e.trash || !BYKEY.get(e.k))) { toast('Only publications in your library can go to the Trash from here.', 3500); return; }
  const one = list.length === 1 ? list[0] : null;
  let body;
  if (one) {
    const pdfs = readablePdfs(one).length, groups = (one.groups || []).filter(g => !/reading list/i.test(g));
    const items = [pdfs ? (pdfs === 1 ? 'its PDF, with your highlights and notes in it' : 'its ' + pdfs + ' PDFs, with your highlights and notes in them') : '',
      String(one.f.annote || '').trim() ? 'your notes on it' : '',
      groups.length ? 'its place in ' + (groups.length === 1 ? 'a group (' + groups[0] + ')' : groups.length + ' groups (' + groups.slice(0, 3).join(', ') + (groups.length > 3 ? '\u2026' : '') + ')') : '',
      RL.has(one.k) ? 'its place on your reading list' : ''].filter(Boolean);
    body = `<h2>Move to the Trash?</h2>` +
      `<p class="sheet-note"><b>${esc(shortTitle(one.f.title || one.k))}</b> (${esc([one.authorsShort, one.f.year].filter(Boolean).join(' '))}) is taken out of your library (${esc(DATA.source || 'your .bib')}).${items.length ? ' With it go:' : ''}</p>` +
      (items.length ? `<ul class="tr-list">${items.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '');
  } else {
    body = `<h2>Move ${list.length} to the Trash?</h2><p class="sheet-note">These ${list.length} publications are taken out of your library (${esc(DATA.source || 'your .bib')}), with their PDFs, notes, groups and places on your reading list.</p>`;
  }
  body += `<p class="sheet-note tr-note">They stay in the Trash for ${TR_DAYS} days: Restore puts them back as they were. Then they\u2019re deleted for good.</p>`;
  showSheet(body.replace('They stay', one ? 'It stays' : 'They stay').replace('Restore puts them back as they were. Then they\u2019re', one ? 'Restore puts it back as it was. Then it\u2019s' : 'Restore puts them back as they were. Then they\u2019re'), 'Move to Trash');
  sheet = { mode: 'trash', keys: list.map(e => e.k) };
  $('#sheetSave').classList.add('danger');
}
async function trRunPub(keys) {
  closeSheet();
  const done = [];
  for (const k of keys) {
    const e = BYKEY.get(k);
    if (!e) continue;
    toast('Moving \u201c' + shortTitle(e.f.title || k) + '\u201d to the Trash\u2026', 0, null, true);
    try {
      // (Not a PDF another publication links too, as a duplicate does: it stays.)
      const shared = id => ENTRIES.some(x => x !== e && (x.files || []).some(g => g.id === id));
      const res = await callServer('trashEntry', { key: k, expectHash: e.h || null, files: readablePdfs(e).filter(f => !shared(f.id)).map(f => ({ id: f.id, n: f.n, p: f.p })),
        title: String(e.f.title || '').replace(/[{}]/g, ''), who: e.authorsShort || '', year: e.f.year || '', dev: DEVICE_NAME, backupName: fileTime() });
      TRASH.kept.set(res.item.id, e);
      DATA.entries = DATA.entries.filter(x => x.k !== k);
      if (res.reading) setReading(res.reading);
      if (res.trash) trSet(res.trash); else trLoad(true);
      done.push(res.item);
    } catch (err) { toast('Couldn\u2019t move \u201c' + shortTitle(e.f.title || k) + '\u201d to the Trash: ' + errText(err), 8000); return finish(); }
  }
  finish();
  function finish() {
    if (!done.length) return;
    if (done.some(x => x.key === state.selKey)) state.selKey = null;
    init(DATA, true);
    afterWrite();
    const what = done.length === 1 ? '\u201c' + shortTitle(done[0].title || done[0].key) + '\u201d' : done.length + ' publications';
    toast('Moved ' + what + ' to the Trash', 8000, { label: 'Undo', run: async () => { for (const x of done) await trRestore(x.id, true); } });
  }
}

/* ---- Restore, Delete now, Empty */
async function trRestore(id, quiet, newKey) {
  const x = TRASH.items[id];
  if (!x) return;
  if (isOffline()) { toast('Restoring needs a connection.', 3500); return; }
  toast('Restoring \u201c' + shortTitle(x.title || '') + '\u201d\u2026', 0, null, true);
  try {
    if (x.kind === 'pub') {
      const res = await callServer('restoreEntry', { id, newKey: newKey || null, backupName: fileTime() });
      const kept = TRASH.kept.get(id);
      if (kept) {
        if (res.key !== kept.k) kept.k = res.key;
        kept.h = res.hash;
        DATA.entries.push(kept);
        TRASH.kept.delete(id);
        init(DATA, true);
      }
      if (res.reading) setReading(res.reading);
      if (res.trash) trSet(res.trash); else trLoad(true);
      afterWrite();
      if (res.stuck) toast('Restored, but its PDF couldn\u2019t go back to its folder: it\u2019s in the Trash, to restore as a PDF.', 8000);
      // (From another session: in the list once the library's built again.)
      toast(quiet ? '' : 'Restored \u201c' + shortTitle(x.title || '') + '\u201d' + (kept ? '' : ': it\u2019s back in your library once it\u2019s updated'), quiet ? 1 : 4000);
    } else if (x.kind === 'inbox') {
      const res = await callServer('untrashThing', { id });
      trSet(res.trash);
      if (x.inbox) ibPut(Object.assign({}, x.inbox, { gone: undefined, passed: undefined, touched: Date.now() }));
      toast(quiet ? '' : 'Back in your Inbox', quiet ? 1 : 3000);
    } else if (x.kind === 'pdf') {
      const e = BYKEY.get(x.key), f = (x.files || [])[0];
      if (!e || !f) throw new Error('its publication isn\u2019t in your library now');
      const res = await callServer('attachPdf', { key: e.k, uploadId: f.id, replace: false, replaceId: null, avoid: unseenFolders(), expectHash: e.h || null, prefix: papersPrefix(), modified: bibdeskTime(), backupName: fileTime() });
      e.h = res.hash;
      e.files = (e.files || []).concat([res.file]);
      init(DATA, true);
      // (Its note let go: tried again if it fails, so it isn't deleted later while linked.)
      for (let i = 0; i < 3; i++) { try { trSet(await callServer('forgetTrash', { ids: [id] })); break; } catch (err) { await new Promise(r => setTimeout(r, 1500)); } }
      afterWrite();
      toast('Back with \u201c' + shortTitle(e.f.title || e.k) + '\u201d, as another PDF', 4000);
    }
  } catch (err) {
    if (x.kind === 'pub' && /has a publication with the cite key .* now/.test(errText(err))) { trAskKey(id, errText(err)); return; }
    toast('Couldn\u2019t restore it: ' + errText(err), 8000);
  }
}
// Its key used since (in BibDesk, say): put back under another.
function trAskKey(id, why) {
  const x = TRASH.items[id];
  if (!x || sheet) { toast(why, 6000); return; }
  showSheet(`<h2>Restore under another cite key</h2><p class="sheet-note">${esc(why)}</p><div class="fld"><label for="trKey">Cite key</label><input id="trKey" type="text" autocomplete="off" spellcheck="false" value="${esc(x.key + 'b')}"></div>`, 'Restore');
  sheet = { mode: 'trashkey', id };
  setTimeout(() => { const i = $('#trKey'); if (i) { i.focus(); i.select(); } }, 50);
}
function trAsk(what, ids) {
  if (!ids.length || sheet) return;
  const one = ids.length === 1 && TRASH.items[ids[0]];
  showSheet(what === 'empty'
    ? `<h2>Empty the Trash?</h2><p class="sheet-note">${ids.length === 1 ? 'The one thing' : 'All ' + ids.length + ' things'} in it ${ids.length === 1 ? 'is' : 'are'} deleted for good. LibLande can\u2019t undo this (its files go to Google Drive\u2019s trash, for 30 days).</p>`
    : `<h2>Delete for good?</h2><p class="sheet-note"><b>${esc(shortTitle(one ? one.title || '' : ''))}</b> is deleted for good. LibLande can\u2019t undo this (its files go to Google Drive\u2019s trash, for 30 days).</p>`, what === 'empty' ? 'Empty Trash' : 'Delete');
  sheet = { mode: 'trashdel', ids, all: what === 'empty' };
  $('#sheetSave').classList.add('danger');
}
async function trDelete(ids, all) {
  closeSheet();
  if (isOffline()) { toast('Deleting needs a connection.', 3500); return; }
  toast('Deleting\u2026', 0, null, true);
  try {
    // (Only what was shown and asked about.)
    trSet(await callServer('deleteFromTrash', { ids }));
    ids.forEach(id => TRASH.kept.delete(id));
    toast(all ? 'The Trash is empty' : 'Deleted', 2500);
  } catch (err) { toast('Couldn\u2019t delete it: ' + errText(err), 6000); }
}
// The sheet's button, for these.
function trSheetSave() {
  const s = sheet;
  if (s.mode === 'trash') trRunPub(s.keys);
  else if (s.mode === 'trashdel') trDelete(s.ids, s.all);
  else if (s.mode === 'trashkey') {
    const k = String(($('#trKey') || {}).value || '').trim();
    if (!/^[^\s,{}()"#%'=\\~]+$/.test(k)) { sheetMsg('A cite key can\u2019t have spaces or , { } ( ) " # % \' = \\ ~ in it.', true); return; }
    closeSheet();
    trRestore(s.id, false, k);
  }
}
// (Empty Trash, in the list's footer.)
$('#statusR').addEventListener('click', ev => { if (ev.target.closest('[data-tr-empty]')) trAsk('empty', Object.keys(TRASH.items)); });
