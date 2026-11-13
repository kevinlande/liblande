// LibLande: Features (everything LibLande does, in one list) and the tour (played through the app itself).
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/tour.js'] = '2026-11-12.17';
/* -------------------------------------------------------------- features */
// What LibLande does, by area: each feature, what it's for, where to find
// it, its icon (see featIcon), and other words it's found by (as "tag"
// for keywords). Shown from the sidebar's foot (Features), with a box to find
// one, and the tour (Take the tour) from its top. Keep it up to date as
// features come and go.
const FEATURES = [
  { area: 'Getting started', items: [
    ['Your BibDesk library, anywhere', 'Your .bib and its PDFs on Google Drive, on any computer, iPad or iPhone. Changes go back into the .bib, so BibDesk opens it as before.', 'Sign in with Google, then choose your .bib in Google\u2019s picker', 'path:M7.5 18.5h9.8a3.7 3.7 0 0 0 .6-7.35A5.6 5.6 0 0 0 7.2 9.6a4.45 4.45 0 0 0 .3 8.9z', 'setup sign in bibtex drive import'],
    ['Limited access', 'Give LibLande only your library: the .bib, its folders and its PDFs, chosen in Google\u2019s picker. The rest of your Google Drive stays out of reach, and Google shows no warning. Or full access, which finds every PDF itself.', 'Chosen at the first sign-in; Settings \u203a Library \u203a Google account', 'path:M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13v9.5h-13zM12 14v2.5', 'drive.file permission privacy picker unverified warning'],
    ['Your earlier LibLande folder', 'Used full access before? With limited access, give LibLande its earlier LibLande folder, and your settings, reading list and preferences come back.', 'Settings \u203a Library \u203a Google account \u203a LibLande folder', 'path:M3.5 6.5h6l2 2h9v10h-17zM9 14l2 2 4-4', 'limited access adopt reading list settings missing second folder'],
    ['Add papers', 'With limited access: PDFs (and author folders) BibDesk added since are counted, and LibLande offers to add them; choose them in Google\u2019s picker and they\u2019re linked.', 'Settings \u203a Library \u203a Add papers; the message when the library opens', 'path:M5.5 3.5h9l4 4v13h-13zM14.5 3.5v4h4M12 10.5v6M9 13.5h6', 'limited access link pdfs new folder grant'],
    ['From Zotero, or from nothing', 'Bring in a Zotero library: its BibTeX export, with its files, becomes a new library in your Google Drive, each PDF filed and linked as BibDesk would. Or start with an empty one.', 'At setup; later, Settings \u203a Library \u203a Import from Zotero', 'path:M5 5.5h14L5 18.5h14', 'zotero import export new empty start'],
    ['Sign out', 'Sign out of one device: its Google sign-in, settings, saved library and offline papers are forgotten there. Nothing in Google Drive changes, and other devices stay signed in.', 'Settings \u203a Library \u203a Google account', 'path:M14 4.5h4.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10', 'log out logout account switch account'],
    ['Install it', 'Add LibLande to your Dock or Home Screen, to open it like an app.', 'Safari\u2019s Share menu: Add to Dock, or Add to Home Screen', 'path:M4.5 4.5h15v15h-15zM12 8v8M8 12h8', 'app web app home screen'],
    ['iPad and iPhone', 'Made for touch and the Apple Pencil: write with the Pencil, scroll with a finger.', '', 'path:M6.5 3h11a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3zM11 18h2', 'pencil touch mobile'],
    ['Works offline', 'The library and the papers you\u2019ve read stay on the device. Marks and edits made offline go to Google Drive when you\u2019re back online.', 'The cloud in the toolbar shows what\u2019s waiting', '#netBadge', 'offline sync'],
    ['Saved as you go', 'Marks are saved into the PDF on Google Drive, so other apps show them: two minutes after your last change (five for a big PDF), and when you leave the paper. Changed elsewhere meanwhile? Combine merges your marks in.', '', 'path:M7.5 18.5h9.8a3.7 3.7 0 0 0 .6-7.35A5.6 5.6 0 0 0 7.2 9.6a4.45 4.45 0 0 0 .3 8.9zM9.4 13.6l1.9 1.9 3.4-3.6', 'save autosave conflict'],
    ['Backups', 'A copy of the .bib before each change (the last 10, then daily for two weeks, weekly for three months); a PDF\u2019s copy before its first save each day, kept 60 days.', 'Settings \u203a Library; the copies in Drive, LibLande \u203a Backups', 'path:M4.5 7.5h15v12h-15zM3.5 4.5h17v3h-17zM10 11h4', 'restore history'],
    ['Check for changes', 'Pick up changes made in BibDesk or on another device. LibLande also looks when it opens.', 'The circling arrow in the toolbar; on an iPad or iPhone, pull down on the list', '#refreshBtn', 'reload refresh sync'],
    ['Your settings everywhere', 'Preferences, groups\u2019 order, your place in each paper and your reading progress follow you from device to device; choose which.', 'Settings \u203a Sync', '#settingsBtn', 'sync devices'],
  ] },
  { area: 'Finding and organising', items: [
    ['Search', 'Find publications by any words in them; choose which fields to search; save a search as a group.', '\u2318F or /, or the magnifier', '#searchBtn', 'find filter smart group saved search'],
    ['Sort and columns', 'Sort by any column, either way; choose the columns; drag the line between the list and the details to make room. The reading list keeps its own sort and columns.', 'The sort menu at the foot of the list; the column headings', 'path:M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3', 'order columns'],
    ['Groups in the sidebar', 'Library, Recently viewed, Inbox (papers added in LibLande, to move into your library in BibDesk), Possible duplicates, Forthcoming; your saved searches, static groups, keywords and publication types. Drag to reorder; fold a section by its heading.', 'The sidebar (the button at the top left)', '#sideToggle', 'lists collections smart groups inbox fold arrange'],
    ['Groups as tabs', 'Each group you open stays as a tab along the toolbar; close one with its \u00d7. On an iPhone, one button lists them.', 'The tabs in the toolbar', '#tabs', 'tabs lists'],
    ['Static groups', 'Make a group with +, and drag publications onto it (on an iPad, hold one and drag).', 'Static groups in the sidebar', 'ICON:folder', 'collection folder group'],
    ['Several libraries', 'Add an existing library (a BibDesk .bib or a Zotero export) or make a new one, switch between them, and drag publications onto another to copy them with their PDFs.', 'Libraries in the sidebar; + beside it; Settings \u203a Library', 'ICON:lib', 'library switch copy add'],
    ['Select several', 'Give several publications keywords and groups at once, add them to your reading list, join versions, share them, or copy their citations; their PDFs show beside them.', 'Select in the toolbar, or \u2318-click and \u21e7-click', '#selectBtn', 'multiple batch bulk'],
    ['Share', 'The selected publications as a .bib and an .rtf of citations, with their PDFs as they are, clean, or none; to Google Drive, this device, or another app (Mail, Messages, AirDrop), with the references in the message.', 'Select several, then Share', 'path:M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2', 'export bibtex rtf zip share airdrop mail'],
    ['Reading list', 'Papers to read: up next, later, or done; one list for each library. Each shows how far you\u2019ve read (tap the figure to start counting again).', 'The Reading list tab; the bookmark in the details or the reader', '#vRL', 'queue to read progress'],
    ['Possible duplicates', 'Publications that look like the same one, to join as versions of one or mark as different.', 'Possible duplicates in the sidebar', 'ICON:copy', 'duplicate merge versions'],
  ] },
  { area: 'Adding and editing', items: [
    ['Add a publication', 'Search by title and author, or give a DOI, ISBN or arXiv ID, or paste BibTeX; or take a photo of a paper\u2019s first page or a book\u2019s cover, its DOI or ISBN looked up.', '+ in the toolbar; on an iPad or iPhone, hold + to paste or take a photo', '#addBtn', 'import new doi isbn arxiv photo camera bibtex'],
    ['Adding from the web', 'One click on a paper\u2019s page opens Add, filled in, with Find PDF ready: a Safari button (Safari 27 or later), or a bookmark for other browsers.', 'Settings \u203a Extensions', 'ICON:link', 'browser extension bookmarklet import'],
    ['Find a PDF', 'Its free copy (via OpenAlex and Unpaywall), or the article through your library\u2019s proxy, in a new tab; save it, then drop it on the publication. Paywalled articles need a proxy.', 'Find PDF in the details; proxies in Settings \u203a Library', 'path:M7 3.5h7l4 4V13M14 3.5v4h4M7 3.5a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h4M16.5 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18.7 19.2l2 2', 'download open access proxy ezproxy'],
    ['Attach a PDF', 'Drop a PDF on a publication, or use Attach. A book\u2019s PDF is read for its ISBN. Several PDFs form a carousel beside the details.', 'The details pane', 'ICON:clip', 'file attachment link'],
    ['Edit the details', 'Every field, from authors to rating; or click the title or a piece of the citation line to change it in place. In the reader, Edit opens beside the paper.', 'Edit, in the details or the reader\u2019s Citation tab', 'ICON:pencil', 'fields cite key rating'],
    ['Suggested keywords', 'Keywords from the publications most like it, and new ones from OpenAlex; tap one to add it.', 'Under the keywords, in Add, Edit and the details', 'ICON:tag', 'tags'],
    ['Original year', 'For a reprint or translation, the year it first came out (origdate), beside the year: APA then cites (Freud, 1900/1953).', 'Beside Year in Add and Edit (books and chapters)', 'ICON:clock', 'reprint translation origdate'],
    ['Books and their chapters', 'A chapter names its book (crossref) and shows under it: the \u25b8 beside a book opens its chapters. Add chapter fills in the book\u2019s details, suggests chapters not yet here, and finds the chapter\u2019s pages in the book\u2019s PDF. Drag a chapter onto its book to link it.', 'Add chapter in a book\u2019s details; the \u25b8 beside a book', 'ICON:lib', 'crossref incollection chapter book'],
    ['Link chapters to books', 'Links chapters already here to their books, adding a book where several chapters share one. You check the matches first; Undo reverses it.', 'Tools \u203a Link chapters', '[data-tool="linkch"]', 'crossref'],
  ] },
  { area: 'Reading', items: [
    ['Papers in tabs', 'Several papers open at once; going back to the library keeps them open. Reader, in the library\u2019s toolbar, goes back to them; its \u25be lists them, with a picture of each first page.', 'Reader, in the library\u2019s toolbar; the tabs along the top of the reader', 'path:M3.5 9h17v10.5h-17zM3.5 9V6a1 1 0 0 1 1-1H10l1.5 4M11.5 9V6a1 1 0 0 1 1-1H18l1.5 4', 'tabs open'],
    ['A start page', 'With no paper open, the reader lists the papers you closed lately, those read lately on your other devices (where you got to there), and your reading list. + opens a new tab to it.', 'Reader, with no paper open; + beside the paper tabs', '#vNewTab', 'new tab empty start safari recently closed reopen history'],
    ['Search in the paper', 'Every match highlighted; Return for the next.', '\u2318F, or the magnifier', '#vFindBtn', 'find text'],
    ['Zoom and fit', 'Pinch, double-tap, or + and \u2212. Click or tap the percentage to fit the whole page, the page\u2019s width, or actual size.', 'The reader\u2019s toolbar', 'path:M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.2-4.2M11 8.5v5M8.5 11h5', 'size width fit'],
    ['Page tones', 'Light, sepia, dark or dark sepia pages, and a Warmth slider; the PDF isn\u2019t changed. A tap on the moon switches between your last two.', 'The moon in the reader\u2019s toolbar: rest the pointer on it (on an iPad or iPhone, hold it)', '#vDarkBtn', 'dark mode night sepia warmth'],
    ['Split screen', 'A second view of the paper below, to scroll on its own (to the references, say).', 'The split button in the reader\u2019s toolbar', '#vSplitBtn', 'two views'],
    ['Links inside the paper', 'Go to a reference or figure, or look at it in a panel without losing your place; Back to page n brings you back.', 'Click or tap a link', '#vBackGo', 'references figures'],
    ['Where you left off', 'Each paper opens where you were. If you got further on another device, a button offers to go there; Back to page returns.', 'The button at the foot of the reader', 'ICON:history', 'position resume sync'],
    ['Share a copy', 'The PDF as it is or clean (without your marks), to Mail or any app with its citation as the message, or downloaded; or opened in Google Drive.', 'The share button in the reader (\u2325M, or \u2325S to download; add \u21e7 for clean); Share in the details', '#vShare summary', 'email mail send download clean'],
  ] },
  { area: 'Marking up', items: [
    ['Highlight', 'Drag over the words; lines join into one block within the column. Drag from a highlight to lengthen it. Choose its colour. Hold the highlighter for freehand.', 'The highlighter (H) in the markup toolbar', '#vpMarkup', 'annotate mark color'],
    ['Underline and strike through', 'Real underlines and strike-throughs, as other apps show them.', 'The underline button (U); hold it for strike-through', '#vpLines', 'annotate'],
    ['Pen, text boxes and sticky notes', 'Draw, write on the page, or pin a sticky note to it.', 'Pen (P), Text box (T) and Sticky note (N) in the markup toolbar', '#vPalette [data-tool="pen"]', 'draw ink text box sticky note pin'],
    ['Comments', 'A comment on any highlight, shown when you click or tap it.', 'Click or tap a highlight', '#vPalette [data-tool="comment"]', 'annotation'],
    ['Eraser', 'Rub out marks, or just part of a highlight.', 'The eraser (E) in the markup toolbar', '#vPalette [data-tool="eraser"]', 'delete remove'],
    ['Undo and redo', 'Step back and forward through your changes.', 'The arrows in the markup toolbar', '#vpUndo'],
    ['Copy a region', 'Drag a box to copy its text or a picture of it, or share it.', 'Select marks (V) in the markup toolbar', '#vPalette [data-tool="select"]', 'screenshot snapshot figure'],
    ['A toolbar that moves', 'Drag the markup toolbar anywhere, or tuck it away.', 'Its grip, and the arrow at its end', '#vpGrip', 'palette'],
    ['Annotations', 'Every highlight and note in a paper, by colour: go to one, copy them with the citation, or add them to your notes. Copy and Quote sit at each highlight\u2019s top right.', 'Annotations, in the reader\u2019s sidebar', '#vSide [data-vtab="marks"]', 'highlights marks export'],
  ] },
  { area: 'Notes', items: [
    ['Notes', 'Your notes on a publication, formatted as you type and kept in the .bib as Markdown, with the PDF\u2019s highlights by page. Beside the paper as you read; Add to notes quotes a selected passage with its page, and p. 331 in your notes goes to that page. Pop out (\u2325\u21e7N) for a large editor.', 'Details \u203a Notes; the reader\u2019s Notes tab (\u2325N)', '#vNotesBtn', 'annote markdown writing'],
  ] },
  { area: 'Pages and outlines', items: [
    ['Outline', 'The paper\u2019s table of contents, to jump to a chapter. Edit it, or make one from the printed Contents or the headings; saved into the PDF.', 'Outline, in the reader\u2019s sidebar', '#vSide [data-vtab="outline"]', 'table of contents toc chapters'],
    ['Bookmarks', 'Mark pages to come back to.', 'Click or tap a page\u2019s top right corner twice, or B; Bookmarks in the reader\u2019s sidebar', '#vSide [data-vtab="bookmarks"]'],
    ['Make a scan searchable', 'Reads a scanned PDF on your device (OCR) and adds its words as hidden text, to search, select and highlight.', 'The notice on a scan, or Search in it', '#vOcr', 'ocr text recognition'],
    ['Rotate pages', 'Turn one page, or all of them; saved into the PDF.', 'Pages, in the reader\u2019s sidebar', 'path:M19.5 9.5A8 8 0 1 0 18 16.5M20 4.5v5h-5'],
    ['Split two-page scans', 'A scan of an open book, two pages to each, cut into single pages; one or all at once.', 'Pages, in the reader\u2019s sidebar', '#vCut'],
  ] },
  { area: 'Citing and writing', items: [
    ['Copy a citation', 'APA, APA in text, BibTeX or the cite key, for one publication or several.', 'Copy, in the details; \u2325A for APA, \u21e7\u2325A in text', 'ICON:quote', 'reference bibtex cite key'],
    ['Quote a passage', 'Select a passage and copy it as a quotation with its printed page and citation; a long one as a block quotation.', 'Quote, beside the text you select; or \u2325C', 'ICON:quote', 'quotation'],
    ['Citation styles', 'Any of Zotero\u2019s 10,000 styles for Copy, Quote, the QR code, Share and Cite Check; APA by default. Kept for offline use, and with your account. The Copy menu\u2019s Style row changes it for one copy.', 'Settings \u203a Citing', 'ICON:quote', 'csl chicago mla harvard style'],
    ['LibLande in Word', 'A panel in Word for Mac: search your library, the document\u2019s works or a group; insert and edit citations; find a work that isn\u2019t in your library online, and add and cite it in one go; keep a References list in APA, Chicago, MLA or Harvard; quote your notes and highlights; and link typed or Zotero citations.', 'Install once: Settings \u203a Extensions \u203a Word', '#settingsBtn', 'microsoft word add-in plugin cite while you write zotero online add book'],
    ['Cite Check', 'Checks a manuscript (a Google Doc or a file) against your library: citations without references, references never cited, details that differ. Fixes the References in a Google Doc.', 'Tools \u203a Cite Check', 'ICON:citecheck', 'manuscript references bibliography check'],
    ['QR code of references', 'A QR code that shows the reference (or up to about 15) on a phone, to copy or open by DOI. Save it for a slide or handout.', 'Copy \u203a QR code\u2026', 'path:M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2', 'slides talk'],
    ['Copy for AI', 'A prompt for Claude: outline this paper, weighing your highlights and notes, with its text and citation. Copied, not sent.', 'The reader\u2019s Annotations tab; Copy \u203a For AI in the details', 'ICON:ai', 'claude summary ai'],
  ] },
  { area: 'Keeping up', items: [
    ['New papers', 'New work citing yours, by authors you follow, like papers you choose, and in your journals; checked daily, with a Top 15. Follow some authors or journals first.', 'Tools \u203a New papers', 'ICON:bell', 'alerts follow recommendations'],
    ['Forthcoming', 'Papers listed as forthcoming, checked for whether they\u2019ve been published since.', 'Forthcoming in the sidebar', 'ICON:forth', 'in press'],
    ['Tidy keywords', 'Merge spellings of the same keyword, deal with one-offs, and add likely missing ones. Nothing changes until you apply.', 'Tools \u203a Tidy keywords', 'ICON:tag', 'tags clean up merge'],
  ] },
  { area: 'Appearance', items: [
    ['Light or dark', 'Light, dark, or as the device is.', 'Settings \u203a Appearance, or the foot of the sidebar', 'path:M12 3.5a8.5 8.5 0 1 0 0 17zM12 3.5a8.5 8.5 0 0 1 0 17', 'dark mode theme'],
    ['Themes and glass', 'Four themes (LibLande, Apple, Graphite, Sepia), each solid or glass: translucent bars, sidebar, menus and panels. Kept with your account.', 'Settings \u203a Appearance', 'ICON:copy', 'theme colours translucent'],
    ['Book covers', 'Covers for your books, from Open Library.', 'Settings \u203a Library', 'path:M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6zM6 3.5v17M9.5 8h6M9.5 11h4'],
    ['Keyboard shortcuts', 'Shortcuts for most things, and you can change them.', 'Keyboard shortcuts at the foot of the sidebar, or ?', 'path:M3.5 7h17v10h-17zM7 10.5h.01M10 10.5h.01M13 10.5h.01M16 10.5h.01M8 14h8', 'keys hotkeys'],
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
    FEATURES.map(a => `<section class="feat-area"><h3>${esc(a.area)}</h3><ul>` + a.items.map(([name, what, where, icon, words]) =>
      `<li data-words="${esc(words || '')}"><span class="feat-ic" aria-hidden="true">${featIcon(icon)}</span><div><b>${esc(name)}</b> <span class="feat-what">${esc(what)}</span>${where ? `<span class="feat-where">${esc(where)}</span>` : ''}</div></li>`).join('') + `</ul></section>`).join('') +
    `<p class="feat-none" hidden>No feature matches.</p>`, 'Close');
  $('#sheetCancel').hidden = true;
}
$('#sheetBody').addEventListener('input', ev => {
  if (!sheet || !sheet.features || ev.target.id !== 'featFind') return;
  const words = ev.target.value.toLowerCase().split(/\s+/).filter(Boolean);
  let any = false;
  $('#sheetBody').querySelectorAll('.feat-area').forEach(sec => {
    let shown = 0;
    sec.querySelectorAll('li').forEach(li => { const hay = (li.textContent + ' ' + (li.dataset.words || '')).toLowerCase(), ok = words.every(w => hay.includes(w)); li.hidden = !ok; if (ok) shown++; });
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
const TOUR = { on: false, i: 0, steps: [], passed: new Set(), playing: false, timer: 0, opened: null, wasReader: false, wasSide: null, el: null, follow: 0 };
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
  { title: 'Welcome to LibLande', text: 'A quick look round: your library, then reading and marking up a paper. Next and Back (or the arrow keys), or Play to go on by itself.' },
  { lib: true, sel: '#list', title: 'The publications', text: 'Sort by any column, choose the columns, and type letters to jump. Return or a double-click opens the PDF.', before: async () => { closeSidebarIfOverlay(); await tourWait(300); } },
  { lib: true, sel: '#searchBtn', title: 'Search', text: 'Find publications by any words in them (\u2318F or /), choose the fields, and save a search as a group.' },
  { lib: true, sel: '#addBtn', title: 'Add a publication', text: 'A title, DOI, ISBN or arXiv ID, BibTeX, or a photo of the paper. Drop a PDF on a publication to attach it; Find PDF looks for a free copy.' },
  { lib: true, sel: '#detail', title: 'The details', text: 'Read the PDF, copy a citation, add it to your reading list, rate it, or Edit it. Click or tap a keyword to see everything with it; suggested ones are a tap away.', before: async () => {
    if (phoneMQ.matches) return 'skip';
    if (!state.selKey) { const r = $('#rows .row'); if (r) r.click(); await tourWait(400); }
  } },
  { lib: true, sel: '#groups', title: 'Your groups', text: 'Your library and its groups: saved searches, static groups, keywords and types; drag to reorder. Libraries switches between libraries; Tools has Cite Check, New papers and Tidy keywords.', before: async () => { showLibSide(); await tourWait(300); } },
  { lib: true, sel: '#settingsBtn', title: 'Settings', text: 'Library, Appearance, Citing, Sync and Extensions. Library adds, makes and switches libraries, adds papers with limited access, and signs this device out; LibLande in Word installs from Extensions. Help, this tour and Features are at the foot of the sidebar.', before: async () => { showLibSide(); await tourWait(200); }, after: () => closeSidebarIfOverlay() },
  { lib: true, sel: '#tabs', title: 'Tabs and the reading list', text: 'Groups you open stay as tabs. The Reading list holds papers to read next, later, or done.', before: async () => { closeSidebarIfOverlay(); await tourWait(350); } },
  { lib: true, sel: '#selectBtn', title: 'Select several', text: 'Give several publications keywords and groups at once, add them to your reading list, or share them with their PDFs.' },
  { lib: true, sel: '#refreshBtn', title: 'Saving and syncing', text: 'Changes go into your .bib on Google Drive. Check for changes picks up BibDesk\u2019s and your other devices\u2019; a cloud shows what\u2019s waiting while you\u2019re offline.' },
  { sel: '#vTop', title: 'Reading a paper', text: 'Papers open in tabs; + opens a new one, at a start page of papers closed lately, read on your other devices, or on your reading list. Library goes back and keeps them open; Reader, in the library, returns to them.', before: async () => (await toReader()) ? null : 'skip-reader' },
  { sel: '#vPalette', title: 'Marking up', text: 'Highlight (H), underline or strike through (U), draw (P), text box (T), sticky note (N), eraser (E). Hold a tool with a small triangle for its second kind. All saved into the PDF.' },
  { sel: '#vSide', title: 'Annotations', text: 'Every highlight and note in the paper, by colour: go to one, copy them with the citation, or add them to your notes.', before: () => readerSide('marks') },
  { sel: '#vSide', title: 'Your notes', text: 'Your notes on the paper, beside it (\u2325N), the same as in its details.', before: () => readerSide('notes') },
  { sel: '#vSide', title: 'Quote and cite', text: 'Select a passage: Quote (\u2325C) copies it with its page and citation; Add to notes quotes it in your notes. The Citation tab copies the paper\u2019s citation.', before: () => readerSide('info') },
  { sel: '#vTools, .v-tools', title: 'Reading view', text: 'Search (\u2318F), light or dark pages, split screen, and the zoom: click or tap the percentage to fit the page or its width.' },
  { sel: '#vSide', title: 'Outline, pages and bookmarks', text: 'Jump by chapter; edit the outline, or make one from the Contents. Pages turns or splits pages; Bookmarks lists pages you\u2019ve marked.', before: () => readerSide('outline') },
  { sel: '#vShare', title: 'Share', text: 'Send the PDF to Mail or any app with its citation, or download it. Clean leaves out your marks.' },
  { title: 'That\u2019s the tour', text: 'Start by adding a paper with + (or drop a PDF on it), and open one with Read. To cite in Word (and add works found online as you write), install the add-in from Settings \u203a Extensions. Everything else is in Features, at the foot of the sidebar.' },
];
function startTour() {
  if (TOUR.on) return;
  Object.assign(TOUR, { on: true, i: 0, steps: TOUR_STEPS, passed: new Set(), playing: false, opened: null, wasReader: !$('#viewer').hidden, wasSide: sideOpen(), wasTab: SIDE.tab,
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
  if (r === 'skip' || (s.sel && !shown(target))) { TOUR.passed.add(i); tourGo(i + dir, dir); return; }
  TOUR.passed.delete(i);
  TOUR.target = target;
  const card = TOUR.el.querySelector('.tour-card');
  // (Counting only the steps shown here: those passed over, as the
  // details' on a phone, left out.)
  const before = [...TOUR.passed].filter(x => x < i).length;
  card.querySelector('.tour-count').textContent = (i + 1 - before) + ' of ' + (steps.length - TOUR.passed.size);
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
    // (The paper it opened closed; back in the library, unless you were
    // reading, rather than on the reader's start page.)
    if (i >= 0) closePaperTab(i).then(() => { if (!TOUR.wasReader && !$('#viewer').hidden) $('#vClose').click(); });
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
