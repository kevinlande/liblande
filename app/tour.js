// LibLande: Features (everything LibLande does, in one list) and the tour (played through the app itself).
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/tour.js'] = '2026-10-23.02';
/* -------------------------------------------------------------- features */
// What LibLande does, by area: each feature, what it's for, where to find
// it, and its icon (see featIcon). Shown from the sidebar's foot (Features), with a box to find
// one, and the tour (Take the tour) from its top. Keep it up to date as
// features come and go.
const FEATURES = [
  { area: 'Your library', items: [
    ['Your BibDesk library, anywhere', 'Your .bib file and its PDFs on Google Drive, on any computer, iPad or iPhone. Changes go back into the .bib, so BibDesk opens it as before.', '', 'path:M7.5 18.5h9.8a3.7 3.7 0 0 0 .6-7.35A5.6 5.6 0 0 0 7.2 9.6a4.45 4.45 0 0 0 .3 8.9z'],
    ['Works offline', 'The library and the papers you\u2019ve read are kept on the device. Marks and edits made offline go to Google Drive when you\u2019re back online.', 'The cloud in the toolbar shows what\u2019s waiting', '#netBadge'],
    ['Check for changes', 'Look at Google Drive now for changes made in BibDesk or on another device (LibLande also looks when it opens). On an iPhone or iPad, pull down on the list.', 'The circling arrow in the toolbar', '#refreshBtn'],
    ['Search', 'Find publications by any words in them; choose which fields to search; save a search as a group.', '\u2318F or /, or the magnifier', '#searchBtn'],
    ['Sort and columns', 'Sort by any column, either way; choose the columns; drag the line between the list and the details to make room. The reading list keeps its own sort and columns, and starts in its own order; there, Length (the PDF\u2019s pages) can be a column and a sort.', 'The sort menu at the foot of the list; the column headings', 'path:M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3'],
    ['Lists in the sidebar', 'Library, Recently viewed (tap its number to choose how many), Inbox, Possible duplicates and Forthcoming; your saved searches and static groups; keywords and publication types.', 'The sidebar (the button at the top left)', '#sideToggle'],
    ['Arrange the sidebar', 'Drag lists to put them in the order you want, within each section.', 'Drag a list in the sidebar', '#vpGrip'],
    ['Static groups', 'Make a group with +, and drag publications onto it (or hold one and drag, on an iPad).', 'Static groups in the sidebar', 'ICON:folder'],
    ['Several libraries', 'Make a new library (a folder with its .bib and a folder for its papers), switch between them, and drag publications from one to another to copy them with their PDFs.', 'Libraries in the sidebar; + beside it', 'ICON:lib'],
    ['Select several', 'Choose several publications to give them keywords and groups at once, add them to your reading list, join versions, export them, or copy their citations.', 'Select in the toolbar, or \u2318-click and \u21e7-click', '#selectBtn'],
    ['Export', 'The selected publications as a .bib and .rtf of citations, with their PDFs as they are, as clean copies, or none; to Google Drive or this device.', 'Select several, then Export', 'path:M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'],
    ['Appearance', 'Light, dark, or as the device is.', 'The foot of the sidebar', 'path:M12 3.5a8.5 8.5 0 1 0 0 17zM12 3.5a8.5 8.5 0 0 1 0 17'],
    ['Keyboard shortcuts', 'Shortcuts for most things, and you can change them.', 'Keyboard shortcuts at the foot of the sidebar, or ?', 'path:M3.5 7h17v10h-17zM7 10.5h.01M10 10.5h.01M13 10.5h.01M16 10.5h.01M8 14h8'],
  ] },
  { area: 'Adding and editing', items: [
    ['Add a publication', 'Search by title (and author; title: and author: say which is which) and choose from what\u2019s found, or give a DOI, ISBN or arXiv ID (the details are looked up), or paste a BibTeX entry.', '+ in the toolbar', '#addBtn'],
    ['Find a PDF', 'Its free copy (open access, found through OpenAlex and Unpaywall\u2019s data), or the article through your library\u2019s proxy, opened in a new tab: save the PDF, then drop it on the publication.', 'Find PDF in the details; library proxies in Settings', 'path:M7 3.5h7l4 4V13M14 3.5v4h4M7 3.5a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h4M16.5 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18.7 19.2l2 2'],
    ['Attach a PDF', 'Drop a PDF on a publication, or use Attach. A book\u2019s PDF is read for its ISBN, to fill in its details. With several, they go round as a carousel beside the details (\u2039 \u203a, a swipe, or the arrow keys).', 'The details pane', 'ICON:clip'],
    ['Edit the details', 'Every field: authors, title, venue, keywords, notes, the cite key, a rating. Or click the title, or a piece of the citation line, to change it in place. From the reader, Edit opens in its sidebar, beside the paper.', 'Edit, in the details pane, or in the reader\u2019s Citation tab', 'ICON:pencil'],
    ['Suggested keywords', 'Keywords suggested from those of the publications most like it, and new ones from OpenAlex; tap one to add it. In Add, Edit and the details.', 'Under the keywords', 'ICON:tag'],
    ['Book covers', 'Covers for your books, from Open Library.', 'Settings (the gear in the sidebar)', 'path:M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6zM6 3.5v17M9.5 8h6M9.5 11h4'],
    ['Copy a citation', 'APA, APA in text, BibTeX or the cite key, one publication or several; in the reader, the open paper\u2019s.', 'Copy, in the details pane; or the shortcuts (\u2325A for APA, \u21e7\u2325A in text, in the library or the reader)', 'ICON:quote'],
    ['Possible duplicates', 'Publications that look like the same one, to join as versions of one (the main one shown, the others under it) or to mark as different.', 'Possible duplicates in the sidebar', 'ICON:copy'],
    ['Forthcoming', 'Papers listed as forthcoming, checked for whether they\u2019ve been published since.', 'Forthcoming in the sidebar', 'ICON:forth'],
    ['Reading list', 'Papers to read: up next, later, or done; one list for each library. Each shows how far you\u2019ve read (press it to start the count again).', 'The bookmark in the details pane or the reader; the Queue tab', '#vRL'],
  ] },
  { area: 'Reading papers', items: [
    ['Papers in tabs', 'Several papers open at once; going back to the library keeps them open. With many open, a count at each end of the tabs lists those out of sight, to go to or close. In the library, the open-papers button goes back to them; rest the pointer on it, or on an iPad or iPhone tap the \u25be beside it (or hold the button), to list them, each with a picture of its first page, and go straight to one, or close one with its \u00d7.', 'The tabs along the top of the reader', 'path:M3.5 9h17v10.5h-17zM3.5 9V6a1 1 0 0 1 1-1H10l1.5 4M11.5 9V6a1 1 0 0 1 1-1H18l1.5 4'],
    ['Recently closed', 'Open again a paper you closed lately.', 'The page with an arrow, beside the title', '#vRecentBtn'],
    ['Search in the paper', 'Every match highlighted; Return for the next one.', '\u2318F, or the magnifier', '#vFindBtn'],
    ['Zoom and fit', 'Pinch, double-tap, or + and \u2212. Tap the percentage to go round the whole page, the page\u2019s width, and actual size.', 'The reader\u2019s toolbar', 'path:M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.2-4.2M11 8.5v5M8.5 11h5'],
    ['Dark pages', 'Light text on dark pages, for reading at night.', 'The moon in the reader\u2019s toolbar', '#vDarkBtn'],
    ['Split screen', 'A second view of the paper below, to scroll on its own (to the references, say).', 'The split box in the reader\u2019s toolbar', '#vSplitBtn'],
    ['Links inside the paper', 'Go to a reference or figure, or look at it in a panel without losing your place; Back to page n brings you back.', 'Tap a link', '#vBackGo'],
    ['Where you left off', 'Each paper opens where you were, on this device or another.', '', 'ICON:history'],
    ['Quote a passage', 'Select a passage and copy it as an APA quotation with its printed page number and citation; a long one as a block quotation.', 'Quote, beside the text you select; or \u2325C', 'ICON:quote'],
    ['Copy a region', 'Drag a box to copy its text or a picture of it, or share it.', 'The box tool in the markup toolbar', '#vPalette [data-tool="select"]'],
    ['Share a copy', 'The PDF as it is, or a clean copy without your marks, to Mail or any app (with its citation, as a message\u2019s text), or downloaded; or open it in Google Drive.', 'The share button in the reader\u2019s toolbar (\u2325M, or \u2325S to download; with \u21e7, clean), or Share in the details', '#vShare summary'],
    ['Email a paper', 'Share it and choose Mail (or your mail app): a new message with the PDF attached, as it is or clean, and its full APA citation as the text.', 'Share \u203a Share, in the reader or the details', '#vShare summary'],
  ] },
  { area: 'Marking up', items: [
    ['Highlight', 'Drag over the words. Lines join into one block, it keeps to the column you\u2019re in, and a highlight can be made longer by dragging from it. Choose its colour. Hold the highlighter for freehand highlighting, over anything.', 'The highlighter (H); hold it for the other kind', '#vpMarkup'],
    ['Underline and strike through', 'Real underlines and strike-throughs, as other apps show them.', 'U; hold the button for the other kind', '#vpLines'],
    ['Pen, text boxes and notes', 'Draw, write on the page, or pin a note to it.', 'P, T and N', '#vPalette [data-tool="pen"]'],
    ['Comments', 'A comment on any highlight, shown when you tap it.', 'Tap a highlight', '#vPalette [data-tool="comment"]'],
    ['Eraser', 'Rub out marks, or just part of a highlight.', 'E', '#vPalette [data-tool="eraser"]'],
    ['Undo and redo', 'Step back and forward through your changes.', 'The arrows in the markup toolbar', '#vpUndo'],
    ['A toolbar that moves', 'Drag the markup toolbar anywhere, or tuck it away.', 'Its grip, and the arrow at its end', '#vpGrip'],
    ['Saved as you go', 'Marks are saved into the PDF on Google Drive, so other apps (and BibDesk) show them. Changed elsewhere meanwhile? Combine puts your marks into the newer version.', '', 'path:M7.5 18.5h9.8a3.7 3.7 0 0 0 .6-7.35A5.6 5.6 0 0 0 7.2 9.6a4.45 4.45 0 0 0 .3 8.9zM9.4 13.6l1.9 1.9 3.4-3.6'],
    ['Your highlights, gathered', 'Every highlight and note in a paper, by colour; copy them with the citation, or add them to the publication\u2019s notes. Each highlight or underline has Copy and Quote at its top right: its words, or a quotation with the page and citation.', 'Marks, in the reader\u2019s sidebar', '#vSide [data-vtab="marks"]'],
    ['Bookmarks', 'Mark pages to come back to.', 'Tap a page\u2019s top right corner twice, or B', '#vSide [data-vtab="bookmarks"]'],
  ] },
  { area: 'Pages and outlines', items: [
    ['Make a scan searchable', 'Reads a scanned PDF (OCR, on your device) and adds its words as hidden text, so you can search, select and highlight them.', 'The notice on a scan, or Search in it', '#vOcr'],
    ['Rotate pages', 'Turn one page, or all of them; saved into the PDF.', 'Pages, in the reader\u2019s sidebar', 'path:M19.5 9.5A8 8 0 1 0 18 16.5M20 4.5v5h-5'],
    ['Split two-page scans', 'A scan of an open book, two pages to each, cut at the fold into single pages; one page or all at once.', 'Pages, in the reader\u2019s sidebar', '#vCut'],
    ['Outline', 'The paper\u2019s table of contents, to jump to a chapter or section. A book without one gets one made from its printed Contents.', 'Outline, in the reader\u2019s sidebar', '#vSide [data-vtab="outline"]'],
    ['Edit or make an outline', 'Change titles, drag to indent, add the page you\u2019re on, delete; or make one from the Contents or the headings. Saved into the PDF.', 'Edit and Make\u2026 in the Outline tab', 'ICON:pencil'],
  ] },
  { area: 'Citing and keeping up', items: [
    ['Cite Check', 'Checks a manuscript (a Google Doc or a file) against your library: citations without references, references never cited, and details that differ; and can fix the References in the Google Doc.', 'Cite Check, under Tools in the sidebar', 'ICON:citecheck'],
    ['Tidy keywords', 'Keywords written more than one way (or misspelt) made one, those used once kept, removed or changed, and keywords publications probably should have added; nothing changes until you apply it.', 'Tidy keywords, under Tools in the sidebar', 'ICON:tag'],
    ['New papers', 'New work that cites yours, by authors you follow, like papers you choose, and in your journals, with a Top 15; checked once a day. Open any one\u2019s abstract to see what it\u2019s about.', 'New papers, under Tools in the sidebar', 'ICON:bell'],
  ] },
  { area: 'On every device', items: [
    ['iPad and iPhone', 'Made for touch and the Apple Pencil too: write with the Pencil, scroll with a finger.', '', 'path:M6.5 3h11a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3zM11 18h2'],
    ['Your settings everywhere', 'Preferences, groups\u2019 order and your place in each paper follow you from device to device.', '', '#settingsBtn'],
    ['Install it', 'Add LibLande to your Dock or Home Screen, to open it like an app.', 'Safari\u2019s Share menu: Add to Dock, or Add to Home Screen', 'path:M4.5 4.5h15v15h-15zM12 8v8M8 12h8'],
  ] },
];
// A feature's icon: the one on its button in LibLande (copied from the
// page: "#id" or another selector), one of the app's own (ICON:name), or
// drawn here (path:...), so each looks as it does in the app.
function featIcon(spec) {
  if (!spec) return '';
  if (spec.startsWith('ICON:')) return ICON[spec.slice(5)] || '';
  if (spec.startsWith('path:')) return `<svg class="i" viewBox="0 0 24 24"><path d="${spec.slice(5)}"/></svg>`;
  const el = document.querySelector(spec), svg = el && (el.matches('svg') ? el : el.querySelector('svg'));
  if (!svg) return '';
  const c = svg.cloneNode(true);
  c.removeAttribute('id');
  c.setAttribute('class', 'i');
  return c.outerHTML;
}
function openFeatures() {
  sheet = { mode: 'help', features: true };
  const n = FEATURES.reduce((k, a) => k + a.items.length, 0);
  showSheet(`<h2>What LibLande does</h2>` +
    `<div class="feat-top"><input type="search" class="feat-find" id="featFind" placeholder="Find a feature (${n})" aria-label="Find a feature" autocomplete="off"><button type="button" class="btn primary" data-tour-start>Take the tour</button></div>` +
    FEATURES.map(a => `<section class="feat-area"><h3>${esc(a.area)}</h3><ul>` + a.items.map(([name, what, where, icon]) =>
      `<li><span class="feat-ic" aria-hidden="true">${featIcon(icon)}</span><div><b>${esc(name)}</b> <span class="feat-what">${esc(what)}</span>${where ? `<span class="feat-where">${esc(where)}</span>` : ''}</div></li>`).join('') + `</ul></section>`).join('') +
    `<p class="feat-none" hidden>No feature matches.</p>`, 'Close');
  $('#sheetCancel').hidden = true;
}
$('#sheetBody').addEventListener('input', ev => {
  if (!sheet || !sheet.features || ev.target.id !== 'featFind') return;
  const words = ev.target.value.toLowerCase().split(/\s+/).filter(Boolean);
  let any = false;
  $('#sheetBody').querySelectorAll('.feat-area').forEach(sec => {
    let shown = 0;
    sec.querySelectorAll('li').forEach(li => { const ok = words.every(w => li.textContent.toLowerCase().includes(w)); li.hidden = !ok; if (ok) shown++; });
    sec.hidden = !shown;
    if (shown) any = true;
  });
  $('#sheetBody .feat-none').hidden = any;
});
$('#sheetBody').addEventListener('click', ev => {
  if (!sheet || !sheet.features || !ev.target.closest('[data-tour-start]')) return;
  closeSheet();
  startTour();
});
$('#featuresBtn').addEventListener('click', () => { if (phoneMQ.matches) closeSidebarIfOverlay(); openFeatures(); });
$('#tourBtn').addEventListener('click', () => { if (phoneMQ.matches) closeSidebarIfOverlay(); startTour(); });
// (On a phone the sidebar is a screen of its own, and on an iPad a drawer
// over the list: put away, to show the rest.)
function closeSidebarIfOverlay() {
  if (phoneMQ.matches) { if (app.dataset.view === 'groups') go('list'); }
  else if (tabletMQ.matches) closeDrawer();
}

/* ------------------------------------------------------------------ tour */
// The tour: a spotlight on one part of LibLande at a time, with what it's
// for, going through the library and then a paper (the one you have open,
// or else the first with a PDF, opened for it and closed again after).
// Back and Next (or the arrow keys), Play to go on by itself, Esc to stop.
// Nothing is changed: it only opens the sidebar, the details and a paper.
const TOUR = { on: false, i: 0, steps: [], playing: false, timer: 0, opened: null, wasReader: false, wasSide: null, el: null, follow: 0 };
const showLibSide = () => {
  if (phoneMQ.matches) go('groups');
  else if (tabletMQ.matches) app.classList.add('side-open');
  else if (app.classList.contains('side-collapsed')) $('#sideToggle').click();
};
const toLibrary = async () => { if (!$('#viewer').hidden) { $('#vClose').click(); await tourWait(400); } };
const tourWait = ms => new Promise(r => setTimeout(r, ms));
// To a paper: the one open, or the first in the list with a PDF.
async function toReader() {
  if (!$('#viewer').hidden && V.doc) return true;
  if (PTABS.list.length) { showViewer(); }
  else {
    const read = $('#rows [aria-label="Read the PDF"], #rows [title="Read the PDF"]');
    if (!read) return false;
    read.click();
    TOUR.opened = true;
  }
  for (let k = 0; k < 60 && !(V.doc && !$('#viewer').hidden && $('#vPages .page')); k++) await tourWait(200);
  await tourWait(500);
  return !!V.doc;
}
const readerSide = async (tab) => { if (!sideOpen()) toggleSide(true); showSideTab(tab); await tourWait(500); };
const TOUR_STEPS = [
  { title: 'Welcome to LibLande', text: 'A quick look round: your library first, then reading and marking up a paper. Use Next and Back (or the arrow keys), or Play to go on by itself.' },
  { lib: true, sel: '#groups', title: 'Your lists', text: 'Your whole library, and the lists in it: recently viewed, possible duplicates, forthcoming; your saved searches and static groups; keywords and publication types. Drag them into the order you like.', before: async () => { await toLibrary(); showLibSide(); await tourWait(300); } },
  { lib: true, sel: '#groups .sec[data-sec="libs"]', title: 'Libraries', text: 'Several libraries, each its own .bib and folder of papers. Switch with a tap, make a new one with +, and drag publications onto another to copy them there.' },
  { lib: true, sel: '#groups .sec[data-sec="tools"]', title: 'Tools', text: 'Cite Check checks a manuscript\u2019s citations against your library (and can fix a Google Doc\u2019s References). New papers finds new work that cites yours, by authors you follow, and in your journals. Tidy keywords makes keywords written more than one way into one, and finds ones publications are probably missing.' },
  { lib: true, sel: '#groups .sec[data-sec="s"]', title: 'Static groups', text: 'Your own groups. Make one with +, and drag publications onto it.' },
  { lib: true, sel: '.side-foot', title: 'Settings and help', text: 'Light or dark, the keyboard shortcuts (yours to change), this tour, and the full list of features.', after: () => closeSidebarIfOverlay() },
  { lib: true, sel: '#tabs', title: 'Open lists', text: 'The lists you\u2019ve opened, as tabs; and the reading list (Queue) of papers to read next.', before: async () => { closeSidebarIfOverlay(); await tourWait(350); } },
  { lib: true, sel: '#readerPair', title: 'Your open papers', text: 'Back to the papers you have open. Rest the pointer on it (on an iPad or iPhone, tap \u25be or hold it) to list them, each with a picture of its first page, and go straight to one, or close one with its \u00d7.' },
  { lib: true, sel: '#selectBtn', title: 'Select several', text: 'Give several publications keywords and groups at once, add them to your reading list, join versions of one, or export them with their PDFs.' },
  { lib: true, sel: '#addBtn', title: 'Add a publication', text: 'Search by title and choose from what\u2019s found, or give a DOI, ISBN or arXiv ID, which LibLande looks up, or paste a BibTeX entry. Drop a PDF on a publication to attach it.' },
  { lib: true, sel: '#refreshBtn', title: 'Reload the library', text: 'Check Google Drive for changes now: made in BibDesk, or on another device. (LibLande also looks by itself when it opens; on an iPhone or iPad, pull down on the list.)' },
  { lib: true, sel: '#searchBtn', title: 'Search', text: 'Find publications by any words in them (\u2318F or /), choose which fields to search, and save a search as a group.' },
  { lib: true, sel: '#list', title: 'The publications', text: 'Sort by any column (the menu at the foot), choose the columns, and type letters to jump. The reading list keeps its own sort and columns, with Length (the PDF\u2019s pages) there too. Return opens the PDF.' },
  { lib: true, sel: '#detail', title: 'The details', text: 'Everything about the publication: read its PDF, copy a citation (APA or BibTeX), add it to your reading list, rate it, or Edit it. Click the title, or a piece of the citation line, to change it there and then.', before: async () => {
    if (phoneMQ.matches) return 'skip';
    if (!state.selKey) { const r = $('#rows .row'); if (r) r.click(); await tourWait(400); }
  } },
  { lib: true, sel: '#detail .chips', title: 'Keywords', text: 'Tap a keyword to see everything with it, or + Keyword to add one. Suggested keywords, from the publications most like it, are a tap away; Add and Edit suggest them too, with new ones from OpenAlex.', before: async () => {
    if (phoneMQ.matches) return 'skip';
    const c = $('#detail .chips');
    if (c) { c.scrollIntoView({ block: 'center' }); await tourWait(300); }
  } },
  { sel: '#vTop', title: 'Reading a paper', text: 'Papers open in tabs (with more than one open; with many, a count at each end lists the rest, to go to or close). Library goes back to your library and keeps them open.', before: async () => (await toReader()) ? null : 'skip-reader' },
  { sel: '#vRecentBtn', title: 'Recently closed', text: 'The papers you\u2019ve closed lately, to open again with a tap.' },
  { sel: '#vFindBtn', title: 'Search in the paper', text: 'Every match highlighted; Return for the next. A scan can be made searchable first.' },
  { sel: '#vDarkBtn', title: 'Dark pages', text: 'Light text on dark pages, for reading at night.' },
  { sel: '#vSplitBtn', title: 'Split screen', text: 'A second view of the paper below, to keep the references (say) in sight while you read.' },
  { sel: '#vZoomLevel', title: 'Fit to the screen', text: 'Tap the percentage to go round: the whole page, the page\u2019s width, and actual size. Or zoom with \u2212 and +, or pinch.' },
  { sel: '#vShare', title: 'Share a copy', text: 'Send the PDF to Mail or any app, as it is or as a clean copy without your marks. Share sends its citation too (in Mail, the message\u2019s text); Download saves it. Clean, at each one\u2019s end, leaves out your marks. Shortcuts: \u2325M to share and \u2325S to download, with \u21e7 for clean.' },
  { sel: '#vRLMenu', title: 'Reading list', text: 'Add the paper to your reading list, or mark it up next, later, or done.' },
  { sel: '#vPalette', title: 'Marking up', text: 'Highlight (H), underline or strike through (U), draw (P), write on the page (T), pin a note (N), or rub out (E). Highlights join from line to line; tap one to comment on it. It\u2019s all saved into the PDF as you go.' },
  { sel: '#vpMarkup', title: 'Two kinds of each', text: 'The tools with a small triangle have two kinds: hold the highlighter (or right-click it) to switch between highlighting text and highlighting freehand; hold underline to switch to strike-through.' },
  { sel: '#vSide', title: 'Pages', text: 'Thumbnails of every page. Turn a page, or all of them; split a scan of two book pages into two.', before: () => readerSide('pages') },
  { sel: '#vSide', title: 'Your marks', text: 'Every highlight and note in the paper, by colour, to go to, copy with the citation, or add to the publication\u2019s notes. Copy and Quote, at a highlight\u2019s top right, copy its words or quote it with the page.', before: () => readerSide('marks') },
  { sel: '#vSide', title: 'Bookmarks', text: 'Pages you\u2019ve marked to come back to: tap a page\u2019s top right corner twice (or press B).', before: () => readerSide('bookmarks') },
  { sel: '#vSide', title: 'Outline', text: 'The table of contents, to jump to a chapter. A book without one gets one made from its printed Contents; Edit it, or Make one from the headings.', before: () => readerSide('outline') },
  { sel: '#vSideBody .v-ole-make, #vSideBody .v-ol-make', title: 'Make an outline', text: 'Make the outline afresh: from the printed Contents (the page you\u2019re on, or the one LibLande finds), from the headings, or empty to fill in yourself. Check it, then Save it into the PDF.', before: () => readerSide('outline') },
  { sel: '#vSide', title: 'The citation', text: 'The paper\u2019s details while you read: copy its citation in one click (the icon at its corner), or Edit it, there in the sidebar, beside the paper.', before: () => readerSide('info') },
  { title: 'That\u2019s the tour', text: 'Everything LibLande does is listed in Features, at the foot of the sidebar, with a box to find one. Take the tour again from there whenever you like.' },
];
function startTour() {
  if (TOUR.on) return;
  Object.assign(TOUR, { on: true, i: 0, steps: TOUR_STEPS, playing: false, opened: null, wasReader: !$('#viewer').hidden, wasSide: sideOpen(), wasTab: SIDE.tab,
    wasView: app.dataset.view, wasCollapsed: app.classList.contains('side-collapsed') });
  const el = document.createElement('div');
  el.className = 'tour';
  el.id = 'tour';
  el.innerHTML = `<div class="tour-dim"></div><div class="tour-spot"></div><div class="tour-card" role="dialog" aria-live="polite" aria-label="Tour">` +
    `<div class="tour-count"></div><h3 class="tour-title"></h3><p class="tour-text"></p><div class="tour-bar"><i></i></div>` +
    `<div class="tour-acts"><button type="button" class="btn" data-tour="back">Back</button><button type="button" class="btn" data-tour="play"></button><span></span>` +
    `<button type="button" class="btn primary" data-tour="next">Next</button></div>` +
    `<button type="button" class="tour-x" data-tour="end" aria-label="End the tour" title="End the tour (Esc)"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
  document.body.appendChild(el);
  TOUR.el = el;
  tourPlayLabel();
  el.addEventListener('click', ev => {
    const b = ev.target.closest('[data-tour]');
    if (!b) return;
    const a = b.dataset.tour;
    if (a === 'next') tourGo(TOUR.i + 1, 1);
    else if (a === 'back') tourGo(TOUR.i - 1, -1);
    else if (a === 'play') tourPlay(!TOUR.playing);
    else endTour();
  });
  // (Kept in place as things move: the sidebar sliding in, the page laid out.)
  TOUR.follow = setInterval(tourPlace, 250);
  window.addEventListener('resize', tourPlace);
  tourGo(0, 1);
}
// A step: what it needs done first, then the spotlight on it. A step whose
// part isn't there (not shown on this screen) is passed over.
async function tourGo(i, dir) {
  if (!TOUR.on) return;
  clearTimeout(TOUR.timer);
  const steps = TOUR.steps;
  if (i < 0) i = 0;
  if (i >= steps.length) { endTour(); return; }
  const prev = steps[TOUR.i];
  if (prev && prev.after && i !== TOUR.i) prev.after();
  TOUR.i = i;
  const s = steps[i];
  TOUR.el.classList.add('moving');
  // (The library's steps in the library: a paper open, or opening, as
  // after Safari reloads the page, is put aside.)
  if (s.lib) await toLibrary();
  let r = s.before ? await s.before() : null;
  if (!TOUR.on) return;
  // (No paper to open: past the reader's steps.)
  if (r === 'skip-reader') { const end = steps.length - 1; TOUR.i = end; return tourGo(end, 1); }
  const target = s.sel ? document.querySelector(s.sel) : null;
  // (On the screen, and not covered by something else, as the library by
  // a paper.)
  const shown = el => {
    if (!el) return false;
    const b = el.getBoundingClientRect();
    if (!(b.width > 4 && b.height > 4 && b.bottom > 0 && b.right > 0 && b.top < innerHeight && b.left < innerWidth) || el.closest('[hidden]')) return false;
    const x = Math.min(innerWidth - 2, Math.max(1, b.left + Math.min(b.width / 2, 40))), y = Math.min(innerHeight - 2, Math.max(1, b.top + Math.min(b.height / 2, 30)));
    TOUR.el.style.visibility = 'hidden';
    const hit = document.elementFromPoint(x, y);
    TOUR.el.style.visibility = '';
    return !!hit && (el.contains(hit) || hit.contains(el));
  };
  if (r === 'skip' || (s.sel && !shown(target))) { tourGo(i + dir, dir); return; }
  TOUR.target = target;
  const card = TOUR.el.querySelector('.tour-card');
  card.querySelector('.tour-count').textContent = (i + 1) + ' of ' + steps.length;
  card.querySelector('.tour-title').textContent = s.title;
  card.querySelector('.tour-text').textContent = s.text;
  card.querySelector('[data-tour="back"]').disabled = i === 0;
  card.querySelector('[data-tour="next"]').textContent = i === steps.length - 1 ? 'Done' : 'Next';
  TOUR.el.classList.remove('moving');
  tourPlace();
  if (TOUR.playing) tourTimer();
}
function tourPlace() {
  if (!TOUR.on) return;
  const spot = TOUR.el.querySelector('.tour-spot'), card = TOUR.el.querySelector('.tour-card'), dim = TOUR.el.querySelector('.tour-dim');
  // (The page dimmed all round the spotlight: a hole cut in the dimming.)
  const hole = (l, t, r, b) => { dim.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)`; };
  // (Drawn afresh meanwhile, as the sidebar's lists are: found again.)
  if (TOUR.target && !TOUR.target.isConnected) { const s = TOUR.steps[TOUR.i]; TOUR.target = (s && s.sel && document.querySelector(s.sel)) || null; }
  const t = TOUR.target && TOUR.target.isConnected ? TOUR.target : null;
  TOUR.el.classList.toggle('centred', !t);
  const W = innerWidth, H = innerHeight, cw = card.offsetWidth, ch = card.offsetHeight, gap = 12;
  if (!t) {
    Object.assign(spot.style, { left: W / 2 + 'px', top: H / 2 + 'px', width: '0px', height: '0px' });
    hole(W / 2, H / 2, W / 2, H / 2);
    Object.assign(card.style, { left: Math.max(8, (W - cw) / 2) + 'px', top: Math.max(8, (H - ch) / 2) + 'px' });
    return;
  }
  const b = t.getBoundingClientRect(), pad = 6;
  const r = { left: Math.max(4, b.left - pad), top: Math.max(4, b.top - pad), right: Math.min(W - 4, b.right + pad), bottom: Math.min(H - 4, b.bottom + pad) };
  Object.assign(spot.style, { left: r.left + 'px', top: r.top + 'px', width: (r.right - r.left) + 'px', height: (r.bottom - r.top) + 'px' });
  hole(r.left, r.top, r.right, r.bottom);
  // The card: below the spotlight, or above, or beside it, or else over
  // its lower part; never off the screen.
  let x, y;
  if (H - r.bottom >= ch + gap * 2) { y = r.bottom + gap; x = b.left + b.width / 2 - cw / 2; }
  else if (r.top >= ch + gap * 2) { y = r.top - ch - gap; x = b.left + b.width / 2 - cw / 2; }
  else if (W - r.right >= cw + gap * 2) { x = r.right + gap; y = b.top + b.height / 2 - ch / 2; }
  else if (r.left >= cw + gap * 2) { x = r.left - cw - gap; y = b.top + b.height / 2 - ch / 2; }
  else { x = (W - cw) / 2; y = H - ch - 24; }
  Object.assign(card.style, { left: Math.max(8, Math.min(W - cw - 8, x)) + 'px', top: Math.max(8, Math.min(H - ch - 8, y)) + 'px' });
}
// Play: on to the next step when there's been time to read this one.
function tourPlay(on) {
  TOUR.playing = on;
  TOUR.el.classList.toggle('playing', on);
  clearTimeout(TOUR.timer);
  if (on) tourTimer();
  tourPlayLabel();
}
function tourPlayLabel() {
  const b = TOUR.el && TOUR.el.querySelector('[data-tour="play"]');
  if (b) b.innerHTML = TOUR.playing
    ? '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg><span>Pause</span>'
    : '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg><span>Play</span>';
}
function tourTimer() {
  const s = TOUR.steps[TOUR.i], ms = Math.max(4500, Math.min(11000, 2500 + (s.text.length + s.title.length) * 45));
  const bar = TOUR.el.querySelector('.tour-bar i');
  bar.style.transition = 'none'; bar.style.width = '0';
  requestAnimationFrame(() => { bar.style.transition = `width ${ms}ms linear`; bar.style.width = '100%'; });
  TOUR.timer = setTimeout(() => { if (TOUR.on && TOUR.playing) tourGo(TOUR.i + 1, 1); }, ms);
}
// The end: everything as it was (the paper it opened closed again, the
// sidebars as they were).
async function endTour() {
  if (!TOUR.on) return;
  TOUR.on = false;
  clearTimeout(TOUR.timer);
  clearInterval(TOUR.follow);
  window.removeEventListener('resize', tourPlace);
  if (TOUR.el) TOUR.el.remove();
  TOUR.el = null;
  if (!$('#viewer').hidden) {
    if (sideOpen() !== TOUR.wasSide) toggleSide(TOUR.wasSide);
    if (TOUR.wasSide && TOUR.wasTab && SIDE.tab !== TOUR.wasTab) showSideTab(TOUR.wasTab);
  }
  if (TOUR.opened && V.file) {
    const i = PTABS.list.findIndex(t => t.fileId === V.file.id);
    if (i >= 0) closePaperTab(i);
  } else if (!TOUR.wasReader && !$('#viewer').hidden) $('#vClose').click();
  // (The library's sidebar as it was.)
  if (phoneMQ.matches) { if (TOUR.wasView && app.dataset.view !== TOUR.wasView) go(TOUR.wasView); }
  else if (tabletMQ.matches) closeDrawer();
  else if (TOUR.wasCollapsed && !app.classList.contains('side-collapsed')) $('#sideToggle').click();
}
// The keys: arrows, space (play or pause) and Esc, before anything else
// sees them.
document.addEventListener('keydown', ev => {
  if (!TOUR.on) return;
  const k = ev.key;
  if (k === 'Escape') endTour();
  else if (k === 'ArrowRight' || k === 'Enter') tourGo(TOUR.i + 1, 1);
  else if (k === 'ArrowLeft') tourGo(TOUR.i - 1, -1);
  else if (k === ' ') tourPlay(!TOUR.playing);
  else return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
}, true);
