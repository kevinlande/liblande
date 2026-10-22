// LibLande: the library: data, the reading list, groups, search, the list and the details.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/library.js'] = '2026-10-22.01';
const $ = s => document.querySelector(s);
// The version, as the page gives it (index.html, the loading screen): the
// one place the app's scripts take it from.
const APP_VERSION = ((document.getElementById('version') || {}).textContent || '').replace('Version ', '');
const app = $('#app'), listEl = $('#list'), rowsEl = $('#rows'), detailEl = $('#detail');
const phoneMQ = matchMedia('(max-width: 699px)');
const tabletMQ = matchMedia('(max-width: 1099px)');
const coarseMQ = matchMedia('(pointer: coarse)');

const ICON = {
  history: '<svg class="i" viewBox="0 0 24 24"><path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8"/><path d="M3.5 3.8v4.4h4.4"/><path d="M12 8v4.2l2.8 1.8"/></svg>',
  doc: '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  clock: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  check: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  pencil: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  inbox: '<svg class="i" viewBox="0 0 24 24"><path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/></svg>',
  lib: '<svg class="i" viewBox="0 0 24 24"><path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16.5 4.8l3.8-1 3 15.4-3.8 1z" transform="translate(-2.5 0.4)"/></svg>',
  folder: '<svg class="i" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  tag: '<svg class="i" viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>',
  type: '<svg class="i" viewBox="0 0 24 24"><path d="M5 5h14M5 12h14M5 19h9"/></svg>',
  chev: '<svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  up: '<svg class="i" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  copy: '<svg class="i" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  link: '<svg class="i" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  forth: '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M12 13v3l2 1"/></svg>',
  versions: '<svg class="i" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>',
  read: '<svg class="i" viewBox="0 0 24 24"><path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/></svg>',
  share: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  eraser: '<svg class="i" viewBox="0 0 24 24"><path d="M9 20h11"/><path d="M4.7 14.3l8.6-8.6a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H8l-3.3-3.3a1 1 0 0 1 0-1.4z"/><path d="M9.3 9.7l5 5"/></svg>',
  download: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>',
  drive: '<svg class="i" viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  clip: '<svg class="i" viewBox="0 0 24 24"><path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  bookmark: '<svg class="i" viewBox="0 0 24 24"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/></svg>',
  search: '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  citecheck: '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 14.5l2.3 2.3 4.7-4.8"/></svg>',
  alert: '<svg class="i" viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/></svg>',
  quote: '<svg class="i" viewBox="0 0 24 24"><path d="M5 17c2.5-.4 4-2.2 4-5V7H5v5h3"/><path d="M14 17c2.5-.4 4-2.2 4-5V7h-4v5h3"/></svg>',
};
const TYPE_NAMES = { article: 'Journal article', incollection: 'Book chapter', inbook: 'Book section', book: 'Book',
  inproceedings: 'Conference paper', conference: 'Conference paper', proceedings: 'Proceedings', phdthesis: 'PhD thesis',
  mastersthesis: 'Master\u2019s thesis', techreport: 'Report', unpublished: 'Unpublished', misc: 'Other' };
const FIELD_ORDER = ['author', 'editor', 'title', 'year', 'month', 'journal', 'booktitle', 'volume', 'number', 'pages',
  'publisher', 'address', 'edition', 'series', 'chapter', 'school', 'institution', 'doi', 'isbn', 'issn', 'url', 'keywords'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\u2010-\u2015]/g, '-');
const store = {
  get(k, d) { try { const v = localStorage.getItem('landelib.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('landelib.' + k, JSON.stringify(v)); } catch {} },
};
const safeUrl = u => /^https?:[/][/]/i.test(u) ? u : null;

let DATA, ENTRIES = [], BYKEY = new Map(), KEYWORDS = new Map(), TYPES = new Map(), GROUPS = [], KW_SORTED = [];
const COLLATE = new Intl.Collator(undefined, { sensitivity: 'base' });
const state = {
  group: store.get('group', 'all'),
  q: '', scope: store.get('scope', 'all'),
  sort: store.get('sort', 'added'), dir: store.get('dir', -1),
  selKey: null, view: [], kwOpen: store.get('kwFolded', false) ? store.get('kwOpen', false) : (store.set('kwFolded', true), store.set('kwOpen', false), false), typeOpen: store.get('typeOpen', false),
  kwFilter: '',
};

/* ------------------------------------------------------------ appearance */
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeSet === (t || 'auto'))));
  barColour();
}
// The strip behind the status bar (theme-color, on GitHub Pages) in the
// top bars' colour, light or dark.
// (Safari 26 reads the strip pinned across the top, .status-cap, rather
// than theme-color. It finds the strip once, so it stays the same element
// (a new one in its place brings the haze back), and it reads its colour
// again when the page scrolls: on a change of theme, the page is scrolled
// by a pixel and back.)
function barColour() {
  requestAnimationFrame(() => {
    const panel = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#f7f9f8';
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = panel;
    if (!document.querySelector('.status-cap')) return;
    const room = document.createElement('div');
    room.style.cssText = 'height:2px';
    document.body.append(room);
    window.scrollTo(0, 1);
    requestAnimationFrame(() => requestAnimationFrame(() => { window.scrollTo(0, 0); room.remove(); }));
  });
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', barColour); } catch (err) { /* older Safari */ }
applyTheme(store.get('theme', 'auto'));
// Themes (colours and type), chosen in Settings; each has light and dark.
const THEMES = [
  { id: 'liblande', name: 'LibLande', note: 'Green, on warm grey', light: ['#edf1ef', '#ffffff', '#1f6b5c', '#1b2321'], dark: ['#1a1f1e', '#131716', '#62b8a1', '#e2e8e5'] },
  { id: 'apple', name: 'Apple', note: 'System blue and glass, like iOS and macOS', light: ['#f2f2f7', '#ffffff', '#007aff', '#1d1d1f'], dark: ['#121214', '#1c1c1e', '#0a84ff', '#f5f5f7'] },
  { id: 'graphite', name: 'Graphite', note: 'Quiet greys, like the Mac\u2019s graphite', light: ['#f0f0f0', '#ffffff', '#5f5f64', '#1f1f1f'], dark: ['#171717', '#1e1e1e', '#b0b0b5', '#ececec'] },
  { id: 'sepia', name: 'Sepia', note: 'Warm paper, for long reading', light: ['#f1e7d4', '#fbf6ec', '#9a5a22', '#3b2e22'], dark: ['#191511', '#1f1a15', '#d9a066', '#eadfcf'] },
];
function applyStyle(id) {
  if (id && id !== 'liblande') document.documentElement.setAttribute('data-style', id);
  else document.documentElement.removeAttribute('data-style');
  document.querySelectorAll('[data-style-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.styleSet === (id || 'liblande'))));
  barColour();
}
applyStyle(store.get('style', 'liblande'));
function renderThemePicks() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (document.documentElement.getAttribute('data-theme') !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const cur = document.documentElement.getAttribute('data-style') || 'liblande';
  $('#themePicks').innerHTML = THEMES.map(t => {
    const [side, page, accent, ink] = dark ? t.dark : t.light;
    return `<button type="button" class="theme-pick" role="radio" data-style-set="${t.id}" aria-checked="${t.id === cur}">` +
      `<span class="tp-mini" style="--tp-accent:${accent}"><i style="background:${side}"></i><b style="background:${page};color:${ink}"></b></span>` +
      `<span class="tp-name">${t.name}</span><span class="tp-note">${t.note}</span></button>`;
  }).join('');
}
$('#themePicks').addEventListener('click', ev => {
  const b = ev.target.closest('[data-style-set]');
  if (b) applyStyle(b.dataset.styleSet);
});
$('#themeSeg').addEventListener('click', ev => {
  const b = ev.target.closest('[data-theme-set]');
  if (!b) return;
  store.set('theme', b.dataset.themeSet);
  applyTheme(b.dataset.themeSet);
  // On GitHub Pages, Safari colours the strip behind the status bar only as
  // the page opens: the page opens again at once (unless marks are
  // unsaved), and the theme is saved with your account as it does
  // (themeToSave), the account's older one not winning meanwhile.
  if (window.LIBLANDE_PAGES && !(V.dirty || V.bmDirty || V.drawing || V.saving)) {
    store.set('themeToSave', b.dataset.themeSet);
    location.reload();
    return;
  }
  if (window.google && google.script && google.script.run) google.script.run.withFailureHandler(() => {}).savePrefs({ theme: b.dataset.themeSet });
});

/* ------------------------------------------------------------ data prep */
function lastNames(names) {
  if (!names || !names.length) return '';
  const l = names.map(n => n[0]);
  if (l.length === 1) return l[0];
  if (l.length === 2) return l[0] + ' & ' + l[1];
  if (l.length === 3) return l[0] + ', ' + l[1] + ' & ' + l[2];
  return l[0] + ' et al.';
}
const fullName = n => n[1] ? n[1] + ' ' + n[0] : n[0];
// "Abbott, L. & Dayan, P.": surnames with first initials, for the list.
function initialOf(first) {
  const w = String(first || '').trim().split(/\s+/)[0] || '';
  const parts = w.split('-').map(p => (p.match(/\p{L}/u) || [''])[0].toUpperCase()).filter(Boolean);
  return parts.length ? parts.join('.-') + '.' : '';
}
// "Dayan, P.": what a click on an author's name searches for, so it finds
// Peter Dayan, P. Dayan and Peter S. Dayan alike.
const nameKey = n => n[0] + (initialOf(n[1]) ? ', ' + initialOf(n[1]) : '');
function namesWithInitials(names) {
  if (!names || !names.length) return '';
  const l = names.map(n => n[0] + (initialOf(n[1]) ? ', ' + initialOf(n[1]) : ''));
  if (l.length === 1) return l[0];
  if (l.length === 2) return l[0] + ' & ' + l[1];
  if (l.length === 3) return l[0] + ', ' + l[1] + ' & ' + l[2];
  return l[0] + ' et al.';
}
const splitKw = s => (s || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
const driveUrl = f => f.id
  ? 'https:\/\/drive.google.com/file/d/' + encodeURIComponent(f.id) + '/view'
  : 'https:\/\/drive.google.com/drive/search?q=' + encodeURIComponent('"' + f.n.replace(/\.[^.]+$/, '').replace(/[\s,]+\d*\s*$/, '') + '"');

function prep(e) {
  const f = e.f;
  e.groups = null;
  e.kw = splitKw(f.keywords);
  e.authorsShort = lastNames(e.a && e.a.length ? e.a : e.e);
  e.authorsInit = namesWithInitials(e.a && e.a.length ? e.a : e.e);
  e.venue = f.journal || f.booktitle || (e.t === 'phdthesis' ? f.school : '') || f.publisher || f.howpublished || f.institution || '';
  e.yearN = parseInt(f.year, 10) || 0;
  e.added = (f['date-added'] || '').slice(0, 16);
  e.rating = parseInt(f.rating, 10) || 0;
  e.sAll = e.sAuthor = e.sTitle = e.sKw = undefined;
  e.apaRef = null;
  e.kAuthor = norm((e.a && e.a[0] ? e.a[0][0] + ' ' + e.a[0][1] : e.e && e.e[0] ? e.e[0][0] : '~'));
  e.kTitle = norm(f.title || '').replace(/^(the|a|an)\s+/, '').replace(/^[^a-z0-9]+/, '');
  e.kVenue = norm(e.venue || '~');
}

// The text searched in each field, made the first time it's needed (or
// in spare moments after loading) rather than for every publication up
// front.
function searchText(e, field) {
  if (e.sAll === undefined) {
    const f = e.f, people = [...(e.a || []), ...(e.e || [])];
    const names = people.map(fullName).join(' ') + ' | ' + people.map(nameKey).join(' | ');
    e.sAuthor = norm(names);
    e.sTitle = norm((f.title || '') + ' ' + (f.shorttitle || ''));
    e.sKw = norm(e.kw.join(' | '));
    e.sAll = norm([e.k, names, ...Object.values(f), ...(e.files || []).map(x => x.n)].join(' | '));
  }
  return e[field];
}
let warmToken = 0;
function warmSearch() {
  const my = ++warmToken, list = ENTRIES;
  let i = 0;
  const idle = window.requestIdleCallback || (fn => setTimeout(() => fn({ timeRemaining: () => 8 }), 50));
  const step = dl => {
    if (my !== warmToken) return;
    while (i < list.length && dl.timeRemaining() > 2) searchText(list[i++], 'sAll');
    if (i < list.length) idle(step);
  };
  idle(step);
}

const builtText = d => typeof d.built === 'number'
  ? new Date(d.built).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  : d.built;
function init(data, again) {
  DATA = data;
  overlayOffline(data);
  ENTRIES = data.entries;
  BYKEY = new Map(); KEYWORDS = new Map(); TYPES = new Map();
  CASE_SETS = null;
  for (const e of ENTRIES) {
    prep(e);
    BYKEY.set(e.k, e);
    for (const k of e.kw) { if (!KEYWORDS.has(k)) KEYWORDS.set(k, []); KEYWORDS.get(k).push(e); }
    if (!TYPES.has(e.t)) TYPES.set(e.t, []);
    TYPES.get(e.t).push(e);
  }
  findDups();
  findVersions();
  GROUPS = data.groups.map(g => ({ name: g.name, items: g.keys.map(k => BYKEY.get(k)).filter(Boolean) }));
  KW_SORTED = [...KEYWORDS.keys()].sort(COLLATE.compare).map(k => [k, norm(k)]);
  warmSearch();
  for (const g of GROUPS) for (const e of g.items) (e.groups ||= []).push(g.name);

  const nFiles = ENTRIES.reduce((n, e) => n + (e.files ? e.files.length : 0), 0);
  const nIds = ENTRIES.reduce((n, e) => n + (e.files ? e.files.filter(f => f.id).length : 0), 0);
  $('#sideFoot').innerHTML = `${ENTRIES.length.toLocaleString()} publications \u00b7 ${nFiles.toLocaleString()} linked files<br>` +
    (nIds ? `${nIds.toLocaleString()} open directly in Google Drive` : 'Files open through Google Drive search') +
    `<br>${esc(data.source)} as of ${esc(builtText(data))}` +
    `<br>LibLande version ${esc(APP_VERSION)}`;

  if (!groupItems(state.group)) state.group = 'all';
  sweepCovers();
  npAuto();
  if (again) { renderGroups(); refresh(false); return; }
  $('#scope').value = state.scope;
  $('#sortSel').value = state.sort;
  const lh = store.get('listH', null);
  if (lh) app.style.setProperty('--list-h', lh + 'px');
  if (store.get('sideCollapsed', false) && !tabletMQ.matches) app.classList.add('side-collapsed');
  app.dataset.view = 'list';
  renderGroups();
  refresh(true);
  renderPaperTabs();
  $('#loading').hidden = true;
}

/* ------------------------------------------------------------ reading list */
// Kept in LibLande/reading-list.json. Up next is a short
// list (about five) of what you mean to read soon; Later holds the rest.
const UP_NEXT = 5;
let READING = { items: [], done: [], seeded: true };
let RL = new Map();

function readingOrder() {
  const by = l => READING.items.filter(x => (x.list === 'next') === l).sort((a, b) => a.added - b.added);
  return by(true).concat(by(false));
}
let readingJSON = '';
// What's waiting to go to Drive, and the open paper's saving (netRender).
const NET = { changes: 0, papers: 0, save: '' };
// Reading-list changes waiting to be saved, and those on their way.
const RL_QUEUE = { ops: [], sending: [], push: [], pull: [], timer: 0, busy: null };
function setReading(d) {
  if (d) {
    const json = JSON.stringify(d);
    if (json === readingJSON) return;
    readingJSON = json;
    READING = d;
    // (The list as saved, from the server: changes made here that haven't
    // reached it yet, still waiting or on their way, are made again on top,
    // so they don't flicker back. Saving one after another is fine.)
    RL_QUEUE.sending.concat(RL_QUEUE.ops).forEach(readingLocal);
  } else {
    readingJSON = JSON.stringify(READING);
  }
  RL = new Map(READING.items.map(x => [x.key, x]));
  if (!ENTRIES.length) return;
  if (V.entry && !$('#viewer').hidden) syncReaderRL();
  fetchAheadSoon();
  // Only the parts that show the reading list: the To read count, the
  // list's tags, and the reading-list line on the open publication.
  renderTabs();
  if (state.group === 'toread') refresh(false); else paint();
  const e = state.selKey && BYKEY.get(state.selKey), bar = detailEl.querySelector('.rl-bar');
  if (e && bar) bar.outerHTML = readingHTML(e) || '<div class="rl-bar" hidden></div>';
  const add = e && detailEl.querySelector('.actions [data-rl="add"]');
  if (add) add.hidden = RL.has(e.k);
  else if (e && !bar) renderDetail();
  renderRLBar();
}
function waited(x, short) {
  const days = Math.max(0, Math.floor((Date.now() - x.added) / 86400000));
  if (short) return days < 14 ? days + ' d' : Math.floor(days / 7) + ' wk';
  if (days === 0) return 'since today';
  return days < 14 ? days + ' day' + (days === 1 ? '' : 's') : Math.floor(days / 7) + ' weeks';
}
const staleRL = x => Date.now() - x.added > 56 * 86400000;
function rlTag(e) {
  const x = RL.get(e.k);
  return (x && x.list === 'next' ? '<span class="rl-tag next">Up next</span>' : '') + (x ? progressTag(e) : '');
}
// How far into each paper you've read: the pages read (each long enough
// on screen: see noteProgress), as a share of its pages ({key: {p, at,
// pages: "1-5,8", n: pages up to its references, base: an older count, from
// before pages were kept}; reset: true once pressed to start again). Kept
// with your preferences (the 300 read most lately), for every device.
const PROGRESS = store.get('progress', {});
// What's shared with your other devices (through your preferences): each
// can be kept to this device instead, in Settings.
const SYNC = Object.assign({ progress: true, position: true, cite: true, smart: true, keys: true, recent: true, alerts: true }, store.get('sync', {}));
// Where you are in each paper ({file id: {page, at, dev}}), for opening it
// there on another device; dev tells this device's from the others'.
const POS = store.get('positions', {});
const DEVICE = store.get('deviceId', null) || (() => { const d = Math.random().toString(36).slice(2, 10); store.set('deviceId', d); return d; })();
function notePosition(page) {
  if (!V.file || !page) return;
  POS[V.file.id] = { page, at: Date.now(), dev: DEVICE };
  clearTimeout(notePosition.t);
  notePosition.t = setTimeout(savePositions, 8000);
}
function savePositions() {
  clearTimeout(notePosition.t);
  notePosition.t = 0;
  const keep = Object.entries(POS).sort((a, b) => b[1].at - a[1].at).slice(0, 150);
  Object.keys(POS).forEach(k => { if (!keep.some(x => x[0] === k)) delete POS[k]; });
  store.set('positions', POS);
  if (gs && SYNC.position) google.script.run.withFailureHandler(() => {}).savePrefs({ positions: POS });
  if (ENTRIES.length) renderRLBar();
}
function positionsMerge(prefs) {
  if (!SYNC.position) return;
  Object.entries((prefs && prefs.positions) || {}).forEach(([k, v]) => { if (!POS[k] || POS[k].at < v.at) POS[k] = v; });
  store.set('positions', POS);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && notePosition.t) savePositions(); });
// The page to open a paper at, if the latest place in it was on another
// device.
const elsewhere = fileId => { const x = SYNC.position && POS[fileId]; return x && x.dev !== DEVICE && x.page > 1 ? x : null; };
// A paper ends where its references start: reaching that page is 100%
// (the pages before it count towards it), so a paper read through doesn't
// stall at 85% for its reference list. Found once per PDF (endPage) and
// remembered; without one (a scan, say), the whole PDF counts.
// A page counts as read once it's been the page you're on long enough to
// read it: by its words, 4 seconds for a page with little text (a figure,
// say) up to 20 for a full one; 10 for a page of a scan, with no text.
// Scrolling past, or jumping to the end, doesn't count; nor does time with
// LibLande out of sight. Reading 90% of the pages (to where the references
// start) is reading it through: a table or two skimmed past doesn't hold
// it back.
const DWELL = { key: null, page: 0, t0: 0, acc: new Map(), need: new Map(), timer: 0 };
const pagesOf = str => { const out = new Set(); String(str || '').split(',').forEach(r => { const [a, b] = r.split('-').map(Number); if (a) for (let n = a; n <= (b || a) && n - a < 5000; n++) out.add(n); }); return out; };
const rangesOf = set => {
  const ns = [...set].sort((a, b) => a - b), out = [];
  for (let i = 0; i < ns.length; i++) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++; out.push(i === j ? String(ns[i]) : ns[i] + '-' + ns[j]); i = j; }
  return out.join(',');
};
const progressOf = x => {
  const n = x.n || 0, read = n ? [...pagesOf(x.pages)].filter(q => q <= n).length : 0;
  return Math.max(x.base || 0, n ? Math.min(100, Math.round(read / Math.max(1, n * 0.9) * 100)) : 0);
};
function noteProgress(page, total) {
  dwellFlush();
  const e = V.entry;
  if (!e || !total) return;
  if (DWELL.key !== e.k) { DWELL.key = e.k; DWELL.acc = new Map(); DWELL.need = new Map(); }
  DWELL.page = page; DWELL.total = total; DWELL.t0 = Date.now();
  dwellNeed(page);
  clearInterval(DWELL.timer);
  DWELL.timer = setInterval(dwellTick, 1000);
}
// (The time since last looked, to the page you're on, if LibLande was in
// sight with the paper open.)
function dwellFlush() {
  const now = Date.now();
  if (DWELL.page && DWELL.t0 && V.entry && V.entry.k === DWELL.key && !document.hidden && !$('#viewer').hidden) {
    DWELL.acc.set(DWELL.page, (DWELL.acc.get(DWELL.page) || 0) + Math.min(now - DWELL.t0, 5000));
  }
  DWELL.t0 = now;
}
function dwellTick() {
  if (!V.entry || V.entry.k !== DWELL.key) { clearInterval(DWELL.timer); return; }
  dwellFlush();
  const pg = DWELL.page;
  // (Tests can make the times shorter.)
  if ((DWELL.acc.get(pg) || 0) >= (DWELL.need.get(pg) || 10000) * (window.LIBLANDE_DWELL_SCALE || 1)) countPage(V.entry, pg);
}
// How long a page needs: by its words (looked at once).
async function dwellNeed(page) {
  if (DWELL.need.has(page) || !V.doc) return;
  DWELL.need.set(page, 10000);
  try {
    const tc = await (await V.doc.getPage(page)).getTextContent();
    const words = tc.items.reduce((k, it) => k + (it.str ? it.str.split(/\s+/).filter(Boolean).length : 0), 0);
    DWELL.need.set(page, words < 15 ? 10000 : Math.max(4000, Math.min(20000, words * 30)));
  } catch (err) { /* (the usual 10 s) */ }
}
function countPage(e, page) {
  const end = V.endPage && V.endPage <= DWELL.total ? V.endPage : DWELL.total;
  const old = PROGRESS[e.k], x = old && !old.reset ? Object.assign({}, old) : { p: 0 };
  // (An older count, from before pages were kept: kept as the least.)
  if (old && !old.reset && old.pages == null && old.p) x.base = old.p;
  const pages = pagesOf(x.pages);
  if (pages.has(page)) return;
  pages.add(page);
  x.pages = rangesOf(pages); x.n = end; x.at = Date.now(); delete x.reset;
  x.p = progressOf(x);
  PROGRESS[e.k] = x;
  if (x.p >= 100 && !(old && old.p >= 100)) syncReaderRL();
  clearTimeout(noteProgress.t);
  noteProgress.t = setTimeout(() => { noteProgress.t = 0; saveProgress(); }, 4000);
}
document.addEventListener('visibilitychange', () => { if (DWELL.timer) dwellFlush(); });
// (Back to the library with progress not yet saved: saved now, so the
// list shows it.)
new MutationObserver(() => {
  if (!$('#viewer').hidden || !noteProgress.t) return;
  clearTimeout(noteProgress.t);
  noteProgress.t = 0;
  saveProgress();
}).observe($('#viewer'), { attributes: true, attributeFilter: ['hidden'] });
// The page a paper's reference list starts on (0: none found): from the
// PDF's outline, or else a line on its own reading References,
// Bibliography, Works Cited or the like, in the second half of the PDF
// (so a mention earlier on doesn't count). Spaced-out capitals
// ("R E F E R E N C E S") count too.
const REF_HEAD = /^(?:[\dIVX]+\.?\s*)?(?:references?|bibliography|works cited|literature cited|reference list|cited works|references and notes|notes and references)\s*:?$/i;
const refHeading = line => {
  let t = String(line || '').replace(/\s+/g, ' ').trim();
  if (/^(?:[A-Z] )+[A-Z]$/.test(t)) t = t.replace(/ /g, '');
  return t.length < 40 && REF_HEAD.test(t);
};
const END_PAGES = store.get('endPages', {});
async function findEndPage(doc) {
  const n = doc.numPages;
  if (n < 3) return 0;
  // The outline, if the PDF has one.
  try {
    const flat = [], walk = list => (list || []).forEach(it => { flat.push(it); walk(it.items); });
    walk(await doc.getOutline());
    for (const it of flat) {
      if (!refHeading(it.title)) continue;
      let dest = it.dest;
      if (typeof dest === 'string') dest = await doc.getDestination(dest);
      if (Array.isArray(dest) && dest[0]) {
        const at = (typeof dest[0] === 'object' ? await doc.getPageIndex(dest[0]) : dest[0]) + 1;
        if (at > 1) return at;
      }
    }
  } catch (err) { /* the text, then */ }
  for (let i = Math.max(2, Math.floor(n / 2) + 1); i <= n; i++) {
    let items;
    try { items = (await (await doc.getPage(i)).getTextContent()).items; } catch (err) { continue; }
    let line = '';
    for (const it of items) {
      line += it.str || '';
      if (it.hasEOL) { if (refHeading(line)) return i; line = ''; }
    }
    if (refHeading(line)) return i;
  }
  return 0;
}
// Once the paper is open: its end page (remembered for each PDF), then the
// page you're on counted again against it.
async function endPageFor(doc, file) {
  if (!file || !file.id) return;
  let at = END_PAGES[file.id];
  if (at == null) {
    // (After the pages are drawn: the reading comes first.)
    await new Promise(r => setTimeout(r, 2500));
    if (doc !== V.doc) return;
    at = await findEndPage(doc);
    // (Closed meanwhile: looked for again next time.)
    if (doc !== V.doc) return;
    const keys = Object.keys(END_PAGES);
    if (keys.length > 800) keys.slice(0, keys.length - 800).forEach(k => delete END_PAGES[k]);
    END_PAGES[file.id] = at;
    store.set('endPages', END_PAGES);
  }
  if (doc !== V.doc) return;
  V.endPage = at || 0;
  if (V.viewer) noteProgress(V.viewer.currentPageNumber, V.viewer.pagesCount);
}
function saveProgress() {
  const keep = Object.entries(PROGRESS).sort((a, b) => b[1].at - a[1].at).slice(0, 300);
  Object.keys(PROGRESS).forEach(k => { if (!keep.some(x => x[0] === k)) delete PROGRESS[k]; });
  store.set('progress', PROGRESS);
  if (gs && SYNC.progress) google.script.run.withFailureHandler(() => {}).savePrefs({ progress: PROGRESS });
  if (ENTRIES.length) paint();
}
// From another device: the further read, unless one was reset (pressing
// the badge), when the later of the two counts, so a reset isn't undone by
// a device that hasn't heard of it.
function progressMerge(prefs) {
  if (!SYNC.progress) return;
  Object.entries((prefs && prefs.progress) || {}).forEach(([k, v]) => {
    const mine = PROGRESS[k];
    if (!mine) { PROGRESS[k] = v; return; }
    if (mine.reset || v.reset) { if ((v.at || 0) > (mine.at || 0)) PROGRESS[k] = v; return; }
    // (Both counting pages: the pages read on either.)
    if (mine.pages != null && v.pages != null) {
      const x = Object.assign({}, mine, { pages: rangesOf(new Set([...pagesOf(mine.pages), ...pagesOf(v.pages)])), n: Math.max(mine.n || 0, v.n || 0), base: Math.max(mine.base || 0, v.base || 0), at: Math.max(mine.at || 0, v.at || 0) });
      x.p = progressOf(x);
      PROGRESS[k] = x;
    } else if (mine.p < v.p) PROGRESS[k] = v;
  });
  store.set('progress', PROGRESS);
}
const progressText = e => { const x = PROGRESS[e.k]; return !x || !x.p ? '' : x.p >= 100 ? 'read through' : x.p + '% read'; };
// The badge: pressed, the count starts again (with Undo).
const progressTag = e => progressText(e) ? `<button type="button" class="rl-prog" data-prog-reset="${esc(e.k)}" style="--p:${PROGRESS[e.k].p}%" title="How far you\u2019ve read: press to start the count again">${progressText(e)}</button>` : '';
function progressReset(k) {
  const was = PROGRESS[k];
  if (!was || !was.p) return;
  PROGRESS[k] = { p: 0, at: Date.now(), reset: true };
  saveProgress();
  renderDetail();
  syncReaderRL();
  const e = BYKEY.get(k);
  toast('Reading progress reset' + (e ? ' for \u201c' + (e.f.title || k) + '\u201d' : ''), 6000, { label: 'Undo', run: () => {
    PROGRESS[k] = Object.assign({}, was, { at: Date.now() });
    saveProgress(); renderDetail(); syncReaderRL();
  } });
}
// (Pressed in the list, it doesn't open or select the publication.)
document.addEventListener('click', ev => {
  const b = ev.target.closest && ev.target.closest('[data-prog-reset]');
  if (!b) return;
  ev.stopPropagation();
  ev.preventDefault();
  progressReset(b.dataset.progReset);
}, true);

// The change made here at once, so the page updates before it's saved.
function readingLocal(req) {
  const d = READING, find = k => d.items.find(x => x.key === k), now = Date.now();
  if (req.op === 'seed') {
    if (!d.seeded) (req.keys || []).forEach(k => { if (!find(k)) d.items.push({ key: k, list: 'later', added: now }); });
    d.seeded = true;
  } else if (req.op === 'add') {
    const x = find(req.key);
    if (x) x.list = req.list || x.list; else d.items.push({ key: req.key, list: req.list || 'next', added: now });
  } else if (req.op === 'move') {
    const x = find(req.key);
    if (x) x.list = req.list;
  } else if (req.op === 'remove' || req.op === 'done') {
    d.items = d.items.filter(x => x.key !== req.key);
    if (req.op === 'done') { d.done = d.done.filter(x => x.key !== req.key); d.done.unshift({ key: req.key, at: now }); }
  }
}
// Changes show at once and are saved together, a moment after the
// last one, so a run of them is one save of the .bib.
function rlOp(req, message) {
  readingLocal(req);
  setReading();
  if (message) toast(message, 2200);
  RL_QUEUE.ops.push(req);
  scheduleReadingSave();
  if (req.op === 'done') markRead(req.key);
}
// Done with a paper on the list: it's marked Read too (its read field, as
// BibDesk has it), unless it already is.
function markRead(key) {
  const e = BYKEY.get(key);
  if (!e || e.f.read === '1') return;
  writeEdit(e, { read: '1' }, [], []).then(() => { if (state.selKey === e.k) renderDetail(); if (V.entry && V.entry.k === e.k) syncReaderRL(); })
    .catch(err => toast('Couldn\u2019t mark it as read: ' + errText(err), 5000));
}
function scheduleReadingSave(now) {
  clearTimeout(RL_QUEUE.timer);
  RL_QUEUE.timer = setTimeout(flushReading, now ? 0 : 1500);
}
async function flushReading() {
  if (RL_QUEUE.busy) { await RL_QUEUE.busy; }
  if (!RL_QUEUE.ops.length && !RL_QUEUE.push.length && !RL_QUEUE.pull.length) return;
  const req = { ops: RL_QUEUE.ops.splice(0), push: RL_QUEUE.push.splice(0), pull: RL_QUEUE.pull.splice(0), backupName: fileTime() };
  RL_QUEUE.sending = req.ops;
  RL_QUEUE.busy = callServer('readingOps', req).then(res => {
    RL_QUEUE.sending = [];
    if (res.gh) {
      DATA.gh = res.gh;
      const g = (DATA.groups || []).find(x => x.name === res.group);
      if (g) { g.keys = res.groupKeys; init(DATA, true); }
    }
    setReading(res.reading);
  }).catch(err => {
    toast('Couldn\u2019t save your reading list: ' + errText(err), 6000);
  }).finally(() => { RL_QUEUE.busy = null; RL_QUEUE.sending = []; });
  return RL_QUEUE.busy;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') scheduleReadingSave(true); });
const upNextCount = () => READING.items.filter(x => x.list === 'next').length;
function rlAdd(key) {
  const list = upNextCount() < UP_NEXT ? 'next' : 'later';
  return rlOp({ op: 'add', key, list }, list === 'next' ? 'Added to Up next' : 'Added to your reading list (Up next is full, so it\u2019s in Later)');
}
function rlMove(key, list) {
  const note = list === 'next' && upNextCount() >= UP_NEXT ? 'Up next now has more than ' + UP_NEXT + ': worth moving one to Later' : null;
  return rlOp({ op: 'move', key, list }, note);
}
const rlDone = key => rlOp({ op: 'done', key }, 'Marked as read and taken off your list');
const rlRemove = key => rlOp({ op: 'remove', key }, 'Taken off your reading list');

// The reading-list line on a publication's page.
function readingHTML(e) {
  if (!gs || e.ib && false) return '';
  const x = RL.get(e.k);
  // Not on the list: the Reading list button is in the row of actions.
  if (!x) return `<div class="rl-bar" hidden></div>`;
  // (How long it's been on the list, and how far through it you are.)
  const how = waited(x) === 'since today' ? 'Today' : waited(x);
  return `<div class="rl-bar on"><span class="rl-where${staleRL(x) ? ' stale' : ''}" title="On your reading list ${how === 'Today' ? 'since today' : 'for ' + how}">${ICON.bookmark}${how}${progressText(e) ? ' \u00b7 ' + progressTag(e) : ''}</span>` +
    // (Icons, their names as tips: Up next, Later, Done, and off the list.)
    `<div class="rl-acts"><div class="seg rl-seg" role="radiogroup" aria-label="Reading list">${rlBtn('next', 'Up next', 'radio', x.list === 'next')}${rlBtn('later', 'Later', 'radio', x.list !== 'next')}</div>` +
    `${rlBtn('done', 'Done: mark it read, and take it off the list', 'btn')}${rlBtn('remove', 'Take it off the reading list', 'btn')}</div></div>`;
}
const rlBtn = (act, name, kind, on) => `<button type="button" ${kind === 'radio' ? `role="radio" aria-checked="${on}"` : 'class="btn rl-ic"'} data-rl="${act}" title="${name}" aria-label="${name}">` +
  `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${RL_ICONS[{ next: 'next', later: 'later', done: 'check', remove: 'minus' }[act]]}</svg></button>`;
function readingClick(e, act) {
  if (act === 'add') rlAdd(e.k);
  else if (act === 'next' || act === 'later') rlMove(e.k, act);
  else if (act === 'done') rlDone(e.k);
  else if (act === 'remove') rlRemove(e.k);
}

// The bar above the list in "To read": the counts.
function renderRLBar() {
  const bar = $('#rlBar');
  bar.hidden = !(gs && state.group === 'toread');
  if (bar.hidden) return;
  const n = upNextCount(), all = READING.items.length;
  bar.querySelector('.rl-count').textContent = all ? n + ' up next \u00b7 ' + (all - n) + ' later' : 'Nothing to read yet';
  // An older copy (Drive couldn't be reached): when it's from.
  let old = bar.querySelector('.rl-stale');
  if (READING.staleAt) {
    if (!old) { old = document.createElement('span'); old.className = 'rl-stale'; bar.querySelector('.rl-count').after(old); }
    const d = new Date(READING.staleAt), today = d.toDateString() === new Date().toDateString();
    old.textContent = 'Your list as of ' + (today ? '' : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ') + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    old.title = 'Google Drive couldn\u2019t be reached, so this is the list as LibLande last had it. It updates once Drive can be reached.';
  } else if (old) old.remove();
  // Continue reading: the paper on the list you were in last (past its
  // first page, not yet read through), a tap from where you left it.
  let card = bar.querySelector('.rl-continue');
  const c = continueCandidate();
  if (!c) { if (card) card.remove(); return; }
  if (!card) { card = document.createElement('button'); card.type = 'button'; card.className = 'rl-continue'; bar.prepend(card); }
  card.dataset.key = c.e.k; card.dataset.file = c.f.id; card.dataset.page = c.page;
  const prog = progressText(c.e);
  card.innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>` +
    `<span class="rl-c-text"><span class="rl-c-head">Continue reading</span><span class="rl-c-title">${esc(c.e.f.title || c.e.k)}</span></span>` +
    `<span class="rl-c-meta">p. ${c.page}${prog ? ' \u00b7 ' + esc(prog) : ''}</span>`;
  card.title = 'Open \u201c' + (c.e.f.title || c.e.k) + '\u201d at page ' + c.page;
}
// The paper to continue: of those on the list, the one whose place in it
// was noted last (on any device), past page 1 and not yet read through.
function continueCandidate() {
  const byFile = new Map();
  READING.items.forEach(x => { const e = BYKEY.get(x.key); (e && e.files || []).forEach(f => { if (f.id) byFile.set(f.id, [e, f]); }); });
  let best = null;
  Object.entries(POS).forEach(([id, p]) => {
    const hit = byFile.get(id);
    if (!hit || !p || p.page < 2 || (best && best.at >= p.at)) return;
    const pr = PROGRESS[hit[0].k];
    if (pr && pr.p >= 100) return;
    best = { e: hit[0], f: hit[1], page: p.page, at: p.at };
  });
  return best;
}
$('#rlBar').addEventListener('click', ev => {
  const card = ev.target.closest('.rl-continue');
  if (!card) return;
  const e = BYKEY.get(card.dataset.key), f = e && (e.files || []).find(x => x.id === card.dataset.file), page = +card.dataset.page;
  if (!e || !f) return;
  openPaper(e, f);
  // (Once it's open, at the page: unless it's already further on.)
  const t0 = Date.now();
  const go = () => {
    if (V.file && V.file.id === f.id && V.viewer && V.viewer.pagesCount) {
      setTimeout(() => { if (V.file && V.file.id === f.id && V.viewer.currentPageNumber < page) V.viewer.currentPageNumber = Math.min(page, V.viewer.pagesCount); }, 120);
      return;
    }
    if (Date.now() - t0 < 20000) setTimeout(go, 150);
  };
  go();
});

// Reader toolbar: the bookmark (filled while the paper's on your reading
// list) opens a short menu: Up next or Later, Done (read, and off the
// list), take it off; or, off the list, add it, and mark it read or unread.
function syncReaderRL() {
  const m = $('#vRLMenu'), b = $('#vRL');
  m.hidden = !gs || !V.entry;
  if (m.hidden) { m.open = false; return; }
  const e = BYKEY.get(V.entry.k) || V.entry, x = RL.get(e.k), read = e.f.read === '1';
  b.classList.toggle('on', !!x);
  // (Read through, and still on the list or unread: done with it?)
  const ready = PROGRESS[e.k] && PROGRESS[e.k].p >= 100 && (!!x || !read);
  b.classList.toggle('ready', !!ready);
  b.title = ready ? 'You\u2019ve read to the end: mark it ' + (x ? 'done' : 'read') + '?'
    : x ? 'On your reading list, in ' + (x.list === 'next' ? 'Up next' : 'Later') : read ? 'Reading list (you\u2019ve read this one)' : 'Reading list';
  const item = (act, icon, label, checked) => `<button type="button" role="${checked == null ? 'menuitem' : 'menuitemradio'}" data-vrl="${act}"${checked == null ? '' : ` aria-checked="${checked}"`}>` +
    (icon ? `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${RL_ICONS[icon]}</svg>` : '<svg class="i blank" viewBox="0 0 24 24" aria-hidden="true"></svg>') + `<span>${label}</span></button>`;
  const kbd = `<kbd>${esc(keyHint('done'))}</kbd>`;
  const suggest = h => (ready ? h.replace('<button type="button"', '<button type="button" class="suggest"') : h);
  $('#vRLList').innerHTML = x
    ? item('next', '', 'Up next', x.list === 'next') + item('later', '', 'Later', x.list !== 'next') + '<hr>' +
      suggest(item('done', 'check', 'Done <span class="faint">(mark read, off the list)</span>').replace('</button>', kbd + '</button>')) + item('remove', 'minus', 'Take off the reading list')
    : item('add', 'plus', 'Add to reading list') + '<hr>' +
      (read ? item('unread', 'circle', 'Mark as unread') : suggest(item('read', 'check', 'Mark as read').replace('</button>', kbd + '</button>')));
}
// The menu's icons: a bookmark with + or −, a circled check, a circle.
const RL_ICONS = {
  plus: '<path class="bm" d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/><path class="mark" d="M12 7.5v6M9 10.5h6"/>',
  minus: '<path class="bm" d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/><path class="mark" d="M9 10.5h6"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path class="mark" d="M8.2 12.3l2.6 2.6 5-5.4"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  next: '<path d="M6 5h12"/><path class="mark" d="M12 19.5V9M7.5 13.5L12 9l4.5 4.5"/>',
  later: '<circle cx="12" cy="12" r="8.5"/><path class="mark" d="M12 7.5V12l3 2"/>',
};
// What was just done, at the bookmark: its icon (filled), growing in and
// fading; the bookmark pops when the paper goes on or off the list.
function rlBurst(icon, pop) {
  const m = $('#vRLMenu');
  if (m.hidden) return;
  // (On the bookmark itself: a closed menu shows nothing else.)
  const el = document.createElement('span');
  el.className = 'vrl-burst' + (icon === 'circle' ? '' : ' filled');
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${RL_ICONS[icon]}</svg>`;
  $('#vRL').appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => el.remove(), 1200);
  if (pop) {
    const b = $('#vRL');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    setTimeout(() => b.classList.remove('pop'), 500);
  }
}
// Done from the viewer (the menu, or its shortcut): on the list, done with
// it (and so read); off it, read.
function readerDone() {
  if (!V.entry) return;
  const e = BYKEY.get(V.entry.k) || V.entry;
  if (RL.has(e.k)) { rlDone(e.k); rlBurst('check', true); }
  else if (e.f.read !== '1') { rlBurst('check'); quickSet(e, { read: '1' }, 'Marked as read').then(syncReaderRL); }
}
$('#vRLList').addEventListener('click', ev => {
  const b = ev.target.closest('[data-vrl]');
  if (!b || !V.entry) return;
  const e = BYKEY.get(V.entry.k) || V.entry, act = b.dataset.vrl;
  $('#vRLMenu').open = false;
  if (act === 'next' || act === 'later') { if (RL.get(e.k).list !== act) rlMove(e.k, act); }
  else if (act === 'done' || act === 'read') readerDone();
  else if (act === 'remove') { rlRemove(e.k); rlBurst('minus', true); }
  else if (act === 'add') { rlAdd(e.k); rlBurst('plus', true); }
  else if (act === 'unread') { rlBurst('circle'); quickSet(e, { read: '0' }, 'Marked as unread').then(syncReaderRL); }
  syncReaderRL();
});
// (Kept on screen: the bookmark is at the toolbar's far end.)
$('#vRLMenu').addEventListener('toggle', () => {
  const list = $('#vRLList');
  list.style.transform = '';
  if (!$('#vRLMenu').open) return;
  syncReaderRL();
  const r = list.getBoundingClientRect(), W = document.documentElement.clientWidth;
  const dx = r.right > W - 8 ? W - 8 - r.right : r.left < 8 ? 8 - r.left : 0;
  if (dx) list.style.transform = 'translateX(' + Math.round(dx) + 'px)';
});

// The first time, fill the list from BibDesk's "Reading List" static group.
// Once per visit: papers on the reading list that aren't in the BibDesk
// group yet go into it, and finished ones come out of it.
let readingChecked = false;
function seedReading() {
  if (!gs || !ENTRIES.length || readingChecked) return;
  readingChecked = true;
  const g = readingGroup(), inGroup = new Set(g ? g.items.map(e => e.k) : []);
  const listed = new Set(READING.items.map(x => x.key));
  RL_QUEUE.push = READING.items.map(x => x.key).filter(k => BYKEY.has(k) && !inGroup.has(k));
  RL_QUEUE.pull = (READING.done || []).map(x => x.key).filter(k => inGroup.has(k) && !listed.has(k));
  if (RL_QUEUE.push.length || RL_QUEUE.pull.length) scheduleReadingSave();
}

/* ------------------------------------------------------------ attaching PDFs */
// With direct saving on, a PDF dropped on a publication (or chosen with
// Attach PDF) is uploaded, filed in the papers folder the way BibDesk's
// AutoFile would, and linked in the .bib.
const isPdf = f => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));

// The papers folder, as a path from the .bib's folder: the one most linked
// PDFs are in ("Papers" for Papers/Author.X/file.pdf).
function papersPrefix() {
  const count = new Map();
  ENTRIES.forEach(e => (e.files || []).forEach(f => {
    const parts = String(f.p || '').split('/');
    if (parts.length < 3) return;
    const pre = parts.slice(0, -2).join('/');
    if (pre.split('/').indexOf('..') < 0) count.set(pre, (count.get(pre) || 0) + 1);
  }));
  let best = 'Papers', most = 0;
  count.forEach((n, pre) => { if (n > most) { best = pre; most = n; } });
  return best;
}

function attachFile(e, file) {
  if (!gs || !e) return;
  if (!isPdf(file)) { toast('Only PDFs can be attached, and \u201c' + (file && file.name) + '\u201d isn\u2019t one.', 4000); return; }
  if (e.ib) { toast('This publication is in your LibLande inbox. Move it into your library first.', 5000); return; }
  if (e.files && e.files.length) {
    sheet = { mode: 'attach', entry: e, file };
    showSheet(`<h2>Attach a PDF</h2><p class="sheet-note">\u201c${esc(e.f.title || e.k)}\u201d already has ` +
      `${e.files.length === 1 ? 'a PDF' : e.files.length + ' files'}: ${esc(e.files[0].n)}.</p>` +
      `<div class="attach-choice"><label class="check"><input type="radio" name="attachMode" value="add" checked> Add ${esc(file.name)} as another file</label>` +
      `<label class="check"><input type="radio" name="attachMode" value="replace"> Replace ${esc(e.files[0].n)} (it goes to the Google Drive trash)</label></div>`, 'Attach');
    return;
  }
  runAttach(e, file, false);
}

async function runAttach(e, file, replace) {
  toast('Uploading ' + file.name + '\u2026', 0);
  try {
    const info = await callServer('getInboxUploadInfo');
    const up = await uploadPdf(file, e.k + '.pdf', info);
    toast('Filing it in your papers folder\u2026', 0);
    const old = replace && e.files && e.files[0];
    const now = bibdeskTime();
    const res = await callServer('attachPdf', {
      key: e.k, uploadId: up.id, replace: !!replace, replaceId: old && old.id ? old.id : null,
      expectHash: e.h || null, prefix: papersPrefix(), modified: now, backupName: fileTime(),
    });
    e.h = res.hash;
    e.files = res.replaced ? [res.file].concat(e.files.slice(1)) : (e.files || []).concat([res.file]);
    setFields(e, { 'date-modified': now });
    init(DATA, true);
    toast('', 1);
    showDone(e.f.title || e.k, 'PDF filed as ' + res.file.p);
    afterWrite();
  } catch (err) {
    toast('Couldn\u2019t attach the PDF: ' + errText(err), 6000);
  }
}

$('#attachInput').addEventListener('change', ev => {
  const file = ev.target.files[0], e = state.selKey && BYKEY.get(state.selKey);
  ev.target.value = '';
  if (file && e) attachFile(e, file);
});

// Drag and drop: a PDF dropped on a row or on the publication's page is
// attached to it; one dropped elsewhere on the list starts a new
// publication; one dropped on the Add form becomes its PDF.
const hasFiles = ev => !!ev.dataTransfer && Array.from(ev.dataTransfer.types || []).indexOf('Files') >= 0;
function dropTarget(ev) {
  if (!gs || !ENTRIES.length || !$('#viewer').hidden) return null;
  const t = ev.target && ev.target.closest ? ev.target : null;
  if (!t) return null;
  if (!$('#sheet').hidden) return sheet && sheet.mode === 'add' && t.closest('#sheetForm') ? { kind: 'form', el: $('#sheetForm') } : null;
  if (!$('#setup').hidden) return null;
  const r = t.closest('#rows [data-i]');
  if (r && state.view[+r.dataset.i]) return { kind: 'entry', el: r, e: state.view[+r.dataset.i] };
  if (t.closest('#detail') && !state.picking && state.selKey && BYKEY.get(state.selKey)) {
    return { kind: 'entry', el: detailEl, e: BYKEY.get(state.selKey) };
  }
  if (t.closest('#listwrap')) return { kind: 'new', el: $('#listwrap') };
  return null;
}
let dropEl = null;
function markDrop(t) {
  if (dropEl && (!t || dropEl !== t.el)) dropEl.classList.remove('drop-on');
  dropEl = t ? t.el : null;
  if (dropEl) dropEl.classList.add('drop-on');
  const hint = $('#dropHint');
  hint.hidden = !t;
  if (t) {
    hint.textContent = t.kind === 'new' ? 'Drop to add a new publication'
      : t.kind === 'form' ? 'Drop to use this PDF'
      : 'Attach to \u201c' + (t.e.f.title || t.e.k) + '\u201d';
  }
}
document.addEventListener('dragover', ev => {
  if (!hasFiles(ev)) return;
  ev.preventDefault();
  const t = dropTarget(ev);
  ev.dataTransfer.dropEffect = t ? 'copy' : 'none';
  markDrop(t);
});
document.addEventListener('dragleave', ev => { if (!ev.relatedTarget) markDrop(null); });
document.addEventListener('drop', ev => {
  if (!hasFiles(ev)) return;
  ev.preventDefault();
  const t = dropTarget(ev);
  markDrop(null);
  const files = Array.from(ev.dataTransfer.files || []);
  if (!t || !files.length) return;
  const file = files.find(isPdf);
  if (!file) { toast('That isn\u2019t a PDF.', 3000); return; }
  if (files.length > 1) toast('Using ' + file.name + ' (drop one PDF at a time).', 3000);
  if (t.kind === 'form') { setAddPdf(file); return; }
  if (t.kind === 'new') { openAdd(file); return; }
  if (state.selKey !== t.e.k) { state.selKey = t.e.k; paint(); renderDetail(); }
  attachFile(t.e, file);
});

// A PDF for the Add form: shown by name, and its DOI (if its first pages
// have one) or, for a book, its ISBN (on the copyright page, in the first
// ten pages or the last two) looked up to fill in the details.
async function setAddPdf(file) {
  if (!sheet || sheet.mode !== 'add') return;
  sheet.pdf = file;
  try { const dt = new DataTransfer(); dt.items.add(file); $('#addPdf').files = dt.files; } catch (err) { /* shown below instead */ }
  const note = $('#addPdfName');
  note.hidden = false;
  note.textContent = 'PDF: ' + file.name;
  if ($('#doiLookup').value.trim()) return;
  sheetMsg('Looking for a DOI or ISBN in the PDF\u2026');
  let id = null;
  try { id = await idFromPdf(file); } catch (err) { id = null; }
  if (!sheet || sheet.mode !== 'add' || sheet.pdf !== file) return;
  if (!id) { sheetMsg('There\u2019s no DOI or ISBN in the PDF\u2019s first pages. Paste one, or fill in the details yourself.'); return; }
  $('#doiLookup').value = id.doi || 'ISBN ' + id.isbn;
  lookupIntoForm();
}
// A valid ISBN in some text (its check digit right), 13 digits preferred.
function isbnIn(text) {
  const found = [];
  for (const m of String(text).matchAll(/ISBN(?:-1[03])?[:\s]*((?:97[89][-\s\u2010\u2011]?)?(?:\d[-\s\u2010\u2011]?){9}[\dXx])/gi)) {
    const d = m[1].replace(/[^\dXx]/g, '').toUpperCase();
    let ok = false;
    if (d.length === 10) { let t = 0; for (let i = 0; i < 10; i++) t += (10 - i) * (d[i] === 'X' ? 10 : +d[i]); ok = t % 11 === 0; }
    if (d.length === 13 && /^\d+$/.test(d)) { let t = 0; for (let i = 0; i < 13; i++) t += +d[i] * (i % 2 ? 3 : 1); ok = t % 10 === 0; }
    if (ok) found.push(d);
  }
  return found.find(d => d.length === 13) || found[0] || '';
}
// {doi} from the first two pages, or else {isbn} from the first ten (or
// the last two); null if neither.
async function idFromPdf(file) {
  const lib = await loadPdfJs();
  const pdf = await openPdf(lib, { data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const textOf = async p => (await (await pdf.getPage(p)).getTextContent()).items.map(i => i.str).join(' ');
    for (let p = 1; p <= Math.min(2, pdf.numPages); p++) {
      const m = /\b(10\.\d{4,9}[/][^\s"<>]+)/.exec(await textOf(p));
      if (m) return { doi: m[1].replace(/[.,;:)\]]+$/, '') };
    }
    const pages = [];
    for (let p = 1; p <= Math.min(10, pdf.numPages); p++) pages.push(p);
    for (let p = Math.max(11, pdf.numPages - 1); p <= pdf.numPages; p++) pages.push(p);
    for (const p of pages) { const isbn = isbnIn(await textOf(p)); if (isbn) return { isbn }; }
    return null;
  } finally {
    closePdf(pdf);
  }
}

/* ------------------------------------------------------------ groups */
// Possible duplicates: the same DOI or the same title, each with the same
// first author's surname (ignoring case, accents and punctuation). (Chapters
// of one book can share the book's DOI.)
let DUPS = new Map();
// Pairs you've said aren't the same ("key1|key2", in order), kept with
// your preferences so every device knows.
const pairOf = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const NOT_DUPS = new Set(store.get('notDups', []));
function notDupsMerge(prefs) {
  const before = NOT_DUPS.size;
  (prefs && prefs.notDups || []).forEach(p => NOT_DUPS.add(p));
  if (NOT_DUPS.size === before) return false;
  store.set('notDups', [...NOT_DUPS]);
  return true;
}
// This publication isn't the same as the ones it was matched with.
function notDuplicates(e) {
  (DUPS.get(e.k) || []).forEach(x => NOT_DUPS.add(pairOf(e.k, x.k)));
  store.set('notDups', [...NOT_DUPS]);
  if (window.google && google.script && google.script.run) google.script.run.withFailureHandler(() => {}).savePrefs({ notDups: [...NOT_DUPS] });
  findDups();
  renderGroups();
  refresh(false);
  renderDetail();
  toast('Not shown as possible duplicates any more', 2500);
}
function dupKeys(e) {
  const out = [], f = e.f || {};
  const doi = norm(f.doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org[/]/, '').replace(/^doi:\s*/, '');
  const t = norm(f.title || '').replace(/[^a-z0-9]+/g, '');
  const who = norm(((e.a && e.a[0]) || (e.e && e.e[0]) || [''])[0]).replace(/[^a-z0-9]+/g, '');
  if (doi) out.push('d:' + doi + '|' + who);
  if (t.length >= 10) out.push('t:' + t + '|' + who);
  return out;
}
// Chapters in different books (or different volumes of one) aren't the
// same publication, even with the same title and author: a reprint, say.
const bookOf = e => norm((e.f && e.f.booktitle) || '').replace(/[^a-z0-9]+/g, '');
const volOf = e => norm((e.f && e.f.volume) || '').replace(/[^a-z0-9]+/g, '');
function differentBooks(a, b) {
  const ba = bookOf(a), bb = bookOf(b);
  if (!ba || !bb) return false;
  if (ba !== bb) return true;
  const va = volOf(a), vb = volOf(b);
  return !!(va && vb && va !== vb);
}
function findDups() {
  const by = new Map();
  ENTRIES.forEach(e => { delete e.dup; delete e.dupSet; dupKeys(e).forEach(k => { if (!by.has(k)) by.set(k, []); by.get(k).push(e); }); });
  DUPS = new Map();
  for (const list of by.values()) {
    if (list.length < 2) continue;
    list.forEach(e => {
      const same = list.filter(x => x !== e && !differentBooks(e, x) && !NOT_DUPS.has(pairOf(e.k, x.k)));
      if (!same.length) return;
      const others = DUPS.get(e.k) || [];
      same.forEach(x => { if (others.indexOf(x) < 0) others.push(x); });
      DUPS.set(e.k, others);
    });
  }
  // Each set together in the list: named after its first member.
  for (const [k, others] of DUPS) {
    const e = BYKEY.get(k);
    e.dup = true;
    e.dupSet = e.dupSet || others.map(x => x.dupSet).find(Boolean) || k;
    others.forEach(x => { x.dupSet = x.dupSet || e.dupSet; });
  }
}
/* ------------------------------------------------------------ forthcoming */
// Forthcoming publications, and recent articles not yet in an issue: a
// group that fills itself. An entry leaves it once it's complete.
const FORTH_RE = /forthcoming|in press|accepted|to appear|online first|early view/i;
const THIS_YEAR = new Date().getFullYear();
function isForthcoming(e) {
  if (e.ib) return false;
  const f = e.f;
  if (FORTH_RE.test(f.year || '') || (!f.year && FORTH_RE.test(f.note || ''))) return true;
  if (e.t !== 'article') return false;
  const y = parseInt(f.year, 10);
  return y >= THIS_YEAR - 2 && (!f.volume || !f.pages);
}

/* ------------------------------------------------------------ versions */
// Versions of one work (an article and its reprint in a collection, two
// editions of a book): a later version names the main one in its
// "related" field (BibLaTeX's), so the link is kept in the .bib. Each
// version is shown under its main one.
let VERSION_OF = new Map(), VERSIONS = new Map();
const relatedKeys = e => String((e.r && e.r.related) || e.f.related || '').split(',').map(k => k.trim()).filter(Boolean);
function findVersions() {
  VERSION_OF = new Map(); VERSIONS = new Map();
  const mainOf = e => relatedKeys(e).map(k => BYKEY.get(k)).find(x => x && x !== e);
  // Up a chain of versions to the first. (Versions that name each other
  // in a loop: the one whose key sorts first is the main one.)
  const rootOf = e => {
    const path = [e];
    let m = mainOf(e);
    while (m && path.indexOf(m) < 0) { path.push(m); m = mainOf(m); }
    if (!m) return path[path.length - 1];
    return path.slice(path.indexOf(m)).reduce((a, b) => (cmpStr(a.k, b.k) <= 0 ? a : b));
  };
  for (const e of ENTRIES) {
    if (!relatedKeys(e).length) continue;
    const m = rootOf(e);
    if (m === e) continue;
    VERSION_OF.set(e.k, m.k);
    if (!VERSIONS.has(m.k)) VERSIONS.set(m.k, []);
    VERSIONS.get(m.k).push(e);
  }
  for (const list of VERSIONS.values()) list.sort((a, b) => a.yearN - b.yearN || cmpStr(a.k, b.k));
}
// The list with each version just under its main one (when both are in
// it); NESTED: the versions shown so.
let NESTED = new Set();
function nestVersions(v) {
  NESTED = new Set();
  if (!VERSION_OF.size) return v;
  const inView = new Set(v.map(e => e.k)), out = [];
  for (const e of v) {
    const main = VERSION_OF.get(e.k);
    if (main && inView.has(main)) continue;
    out.push(e);
    for (const c of VERSIONS.get(e.k) || []) if (inView.has(c.k)) { out.push(c); NESTED.add(c.k); }
  }
  return out;
}

// The duplicates group keeps each set together.
const dupOrder = () => ENTRIES.filter(e => e.dup).sort((a, b) => cmpStr(a.dupSet, b.dupSet) || a.yearN - b.yearN || cmpStr(a.k, b.k));
function groupItems(id) {
  if (id === 'all') return ENTRIES;
  if (id === 'dups') return dupOrder();
  if (id === 'forth') return ENTRIES.filter(isForthcoming);
  if (id === 'recent') return RECENT.seen.map(x => BYKEY.get(x[0])).filter(Boolean).slice(0, recentShow());
  if (id === 'inbox') return ENTRIES.filter(e => e.ib);
  if (id === 'toread') return readingOrder().map(x => BYKEY.get(x.key)).filter(Boolean);
  const [kind, name] = [id.slice(0, 2), id.slice(2)];
  if (kind === 's:') { const g = GROUPS.find(g => g.name === name); return g && g.items; }
  if (kind === 'q:') { const x = SMART.list.find(x => x.name === name); const f = x && searchFilter(x.q, 'sAll'); return x ? (f ? ENTRIES.filter(f) : ENTRIES.slice()) : null; }
  if (kind === 'k:') return KEYWORDS.get(name);
  if (kind === 't:') return TYPES.get(name);
  return null;
}
function groupName(id) {
  if (id === 'all') return 'Library';
  if (id === 'inbox') return 'Inbox';
  if (id === 'dups') return 'Possible duplicates';
  if (id === 'forth') return 'Forthcoming';
  if (id === 'recent') return 'Recently viewed';
  if (id === 'toread') return 'Reading list';
  if (id.startsWith('t:')) return TYPE_NAMES[id.slice(2)] || id.slice(2);
  return id.slice(2);
}
function grpBtn(id, label, count, icon) {
  // (Recently viewed's count: click it to choose how many.)
  const ct = id === 'recent' ? ' recent-ct" title="How many to show: click to change' : '';
  return `<button class="grp${state.group === id ? ' on' : ''}" data-g="${esc(id)}">${icon}<span class="nm">${esc(label)}</span><span class="ct${ct}">${count.toLocaleString()}</span></button>`;
}
// Recently viewed's count, made a box to type how many to show in (Enter
// or leaving it keeps it; Esc doesn't).
function editRecentCount(b) {
  const row = document.createElement('div');
  row.className = 'grp recent-edit' + (b.classList.contains('on') ? ' on' : '');
  row.innerHTML = b.innerHTML.replace(/<span class="ct[^"]*"[^>]*>[^<]*<\/span>/, '') +
    `<input class="ct-in" type="number" inputmode="numeric" min="1" max="${RECENT_KEEP}" value="${recentShow()}" aria-label="How many recently viewed to show">`;
  b.replaceWith(row);
  const inp = row.querySelector('input');
  inp.focus(); inp.select();
  let done = false;
  const finish = keep => {
    if (done) return;
    done = true;
    const n = Math.round(+inp.value);
    if (keep && n >= 1) store.set('recentShow', Math.min(RECENT_KEEP, n));
    renderGroups();
    if (state.group === 'recent') refresh(false);
  };
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); } });
  inp.addEventListener('blur', () => finish(true));
}
// The checker's row: how much is left to fix in the manuscript checked last.
const msToolLast = () => (MS.recent && MS.recent[0]) || null;
const msToolTitle = () => { const x = msToolLast(); return ' title="' + esc('Check a manuscript\u2019s citations' + (x ? ' \u2014 ' + x.name + ': ' + (x.todo ? x.todo + ' to fix' : 'all in order') : '')) + '"'; };
// (Only for a check in the last two weeks: an old one's count is stale.)
const msToolCount = () => {
  const x = msToolLast();
  if (!x || Date.now() - (x.at || 0) > 14 * 86400000) return '';
  return x.todo ? '<span class="ct ms-todo-ct">' + x.todo + '</span>' : '<span class="ct ms-ok-ct">' + ICON.check + '</span>';
};
// Your libraries (each a .bib with its papers folder): the one open, and
// the others used here, to switch to (a click) or copy publications to
// (drag them onto one, or Copy to another library). From the status.
const LIBS = { current: null, list: [], all: [], phase: '', pending: null, unfold: false };
function setLibraries(st) {
  if (!st || !st.bibId) return;
  LIBS.current = { bibId: st.bibId, papersId: st.papersId || '', name: st.bibName || '' };
  LIBS.list = (st.libraries || []).filter(l => l.bibId && l.bibId !== st.bibId);
  // (All of them, in their steady order; the one open among them.)
  LIBS.all = (st.allLibraries || []).filter(l => l.bibId).map(l => (l.bibId === st.bibId ? Object.assign({}, l, LIBS.current) : l));
  if (!LIBS.all.some(l => l.bibId === st.bibId)) LIBS.all.unshift(LIBS.current);
  if (ENTRIES.length) renderGroups();
}
// How many publications each library has: the open one's counted, the
// others' as last seen (here or on another device, with your preferences).
const LIB_COUNTS = store.get('libCounts', {});
let libCountsTimer = 0;
function noteLibCount(bibId, n) {
  if (!bibId || (LIB_COUNTS[bibId] && LIB_COUNTS[bibId].n === n)) return;
  LIB_COUNTS[bibId] = { n, at: Date.now() };
  store.set('libCounts', LIB_COUNTS);
  clearTimeout(libCountsTimer);
  libCountsTimer = setTimeout(() => { if (gs) google.script.run.withFailureHandler(() => {}).savePrefs({ libCounts: LIB_COUNTS }); }, 3000);
}
function libCountsMerge(prefs) {
  Object.entries((prefs && prefs.libCounts) || {}).forEach(([k, v]) => { if (v && (!LIB_COUNTS[k] || LIB_COUNTS[k].at < v.at)) LIB_COUNTS[k] = v; });
  store.set('libCounts', LIB_COUNTS);
}
const libName = l => String((l && l.name) || 'Library').replace(/\.bib$/i, '');
// The Libraries section: each library, with its count; the open one is
// the whole library (a click shows it all), with its own lists below it.
function librariesHTML() {
  if (!gs || !LIBS.current) return '';
  const inboxCount = ENTRIES.filter(e => e.ib).length;
  // (Not while switching: the library loaded may not be the one ticked yet.)
  if (!LIBS.phase) noteLibCount(LIBS.current.bibId, ENTRIES.length);
  // (While another loads, it's the one ticked, with its count as last seen.)
  const curId = LIBS.phase === 'loading' && LIBS.pending ? LIBS.pending.bibId : LIBS.current.bibId;
  const row = l => {
    const cur = l.bibId === curId, n = cur && !LIBS.phase ? ENTRIES.length : (LIB_COUNTS[l.bibId] || {}).n;
    return `<button type="button" class="grp lib-row${cur ? ' cur' : ''}${cur && state.group === 'all' ? ' on' : ''}" data-lib="${esc(l.bibId)}" data-papers="${esc(l.papersId || '')}"${cur ? ' data-g="all"' : ''}` +
      ` title="${cur ? esc(libName(l)) + ': the library open now' : 'Switch to ' + esc(libName(l)) + ' (or drop publications here to copy them to it)'}">` +
      `${ICON.lib}<span class="nm">${esc(libName(l))}</span><span class="ct">${n != null ? n.toLocaleString() : ''}</span></button>`;
  };
  const sub = `<div class="lib-sub${LIBS.phase === 'folding' ? ' folded' : LIBS.phase === 'loading' ? ' lib-wait' : ''}">` +
    (RECENT.seen.length || state.group === 'recent' ? grpBtn('recent', 'Recently viewed', groupItems('recent').length, ICON.history) : '') +
    (inboxCount || state.group === 'inbox' ? grpBtn('inbox', 'Inbox', inboxCount, ICON.inbox) : '') +
    (DUPS.size || state.group === 'dups' ? grpBtn('dups', 'Possible duplicates', DUPS.size, ICON.copy) : '') +
    ((n => (n || state.group === 'forth' ? grpBtn('forth', 'Forthcoming', n, ICON.forth) : ''))(ENTRIES.filter(isForthcoming).length)) + `</div>`;
  return `<div class="sec" data-sec="libs"><div class="sec-row"><div class="sec-h">Libraries</div>` +
    `<button type="button" class="sec-add" data-new-lib title="New library" aria-label="New library"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>` +
    LIBS.all.map(l => row(l) + (l.bibId === curId ? sub : '')).join('') + `</div>`;
}
// Publications copied to another library: their entries, and their PDFs
// into its papers folder (edits.js's copyToLibrary). A copy, as when
// dragging between BibDesk files: they stay here too.
async function copyToLibrary(keys, lib) {
  const list = keys.map(k => BYKEY.get(k)).filter(e => e && !e.ib);
  if (!list.length || !lib) return;
  const what = list.length === 1 ? '\u201c' + (list[0].f.title || list[0].k) + '\u201d' : list.length + ' publications';
  toast('Copying ' + what + ' to ' + libName(lib) + '\u2026', 0);
  try {
    const r = await callServer('copyToLibrary', { bibId: lib.bibId, papersId: lib.papersId || '', now: bibdeskTime(), backupName: fileTime(),
      items: list.map(e => ({ key: e.k, fileIds: (e.files || []).map(f => f.id).filter(Boolean) })) });
    const n = r.copied.length, there = r.skipped.filter(x => x.reason === 'already there').length;
    if (n && LIB_COUNTS[lib.bibId]) { noteLibCount(lib.bibId, LIB_COUNTS[lib.bibId].n + n); renderGroups(); }
    toast(n ? 'Copied ' + (n === 1 && list.length === 1 ? what : n + ' publication' + (n === 1 ? '' : 's')) + ' to ' + libName(lib) +
      (r.files ? ', with ' + r.files + ' PDF' + (r.files === 1 ? '' : 's') : '') + (there ? '; ' + there + ' already there' : '')
      : (there ? (list.length === 1 ? 'It\u2019s' : 'They\u2019re') + ' already in ' + libName(lib) : 'Nothing copied'), 5000);
  } catch (err) { toast('Couldn\u2019t copy to ' + libName(lib) + ': ' + errText(err), 7000); }
}
// Which library to copy to: a short list of the others.
function openCopyTo(keys) {
  if (!LIBS.list.length) { toast('You have no other library yet. Make one with + beside Libraries in the sidebar.', 4000); return; }
  sheet = { mode: 'help', copyKeys: keys };
  showSheet(`<h2>Copy to another library</h2><p class="sheet-note">${keys.length === 1 ? 'The publication' : keys.length + ' publications'}, with ${keys.length === 1 ? 'its PDFs' : 'their PDFs'}, copied to the library you choose. ${keys.length === 1 ? 'It stays' : 'They stay'} here too.</p>` +
    `<div class="copy-libs">${LIBS.list.map(l => `<button type="button" class="set-lib" data-copy-to="${esc(l.bibId)}">${ICON.lib}<span>${esc(libName(l))}</span></button>`).join('')}</div>`, 'Cancel');
  $('#sheetCancel').hidden = true;
}
$('#sheetBody').addEventListener('click', ev => {
  const b = ev.target.closest('[data-copy-to]');
  if (!b || !sheet || !sheet.copyKeys) return;
  const keys = sheet.copyKeys, lib = LIBS.list.find(l => l.bibId === b.dataset.copyTo);
  closeSheet();
  copyToLibrary(keys, lib);
});
// Switching libraries: the open one's lists fold up into it, then
// unfold under the one chosen (ticked at once), their counts hidden until
// it has loaded. (A new one, not yet in the list: they unfold when it's
// open.)
function foldLibSub(target) {
  LIBS.phase = 'folding';
  LIBS.pending = target || null;
  const sub = $('#groups .lib-sub');
  if (sub && !sub.classList.contains('folded')) {
    sub.style.height = sub.scrollHeight + 'px';
    void sub.offsetHeight;
    sub.classList.add('folded');
    sub.style.height = '';
  }
  if (target) setTimeout(() => { if (LIBS.phase === 'folding' && LIBS.pending === target) { LIBS.phase = 'loading'; LIBS.unfold = true; renderGroups(); } }, sub ? 320 : 0);
}
function unfoldLibSub(root, from) {
  if (!LIBS.unfold && from == null) return;
  LIBS.unfold = false;
  const sub = root.querySelector('.lib-sub');
  if (!sub || sub.classList.contains('folded')) return;
  // (Its height when open, measured, then grown to from where it was.)
  const to = sub.getBoundingClientRect().height;
  sub.classList.add('moving');
  sub.style.height = (from == null ? 0 : from) + 'px';
  sub.style.opacity = from == null ? '0' : '';
  void sub.offsetHeight;
  sub.style.height = to + 'px';
  sub.style.opacity = '';
  const done = () => { if (sub.isConnected) { sub.style.height = ''; sub.classList.remove('moving'); } };
  sub.addEventListener('transitionend', ev => { if (ev.propertyName === 'height') done(); });
  setTimeout(done, 500);
}
// (Done: the counts in. Already unfolded under the new one, unless it
// failed and it's back under the old one, or the new one is new.)
function endLibSwitch() {
  const moved = LIBS.phase === 'loading' && LIBS.pending && LIBS.current && LIBS.pending.bibId === LIBS.current.bibId;
  LIBS.unfold = !moved;
  LIBS.phase = '';
  LIBS.pending = null;
  renderGroups();
}
function renderGroups() {
  const inboxCount = ENTRIES.filter(e => e.ib).length;
  // (Signed in: the Libraries section, the open one's lists under it.
  // Otherwise, the one library as before.)
  const libs = librariesHTML();
  let h = (libs || `<div class="sec" data-sec="lib"><div class="sec-h">Library</div>${grpBtn('all', 'Library', ENTRIES.length, ICON.lib)}` +
    (RECENT.seen.length || state.group === 'recent' ? grpBtn('recent', 'Recently viewed', groupItems('recent').length, ICON.history) : '') +
    (inboxCount || state.group === 'inbox' ? grpBtn('inbox', 'Inbox', inboxCount, ICON.inbox) : '') +
    (DUPS.size || state.group === 'dups' ? grpBtn('dups', 'Possible duplicates', DUPS.size, ICON.copy) : '') +
    ((n => (n || state.group === 'forth' ? grpBtn('forth', 'Forthcoming', n, ICON.forth) : ''))(ENTRIES.filter(isForthcoming).length)) +
    `</div>`) +
    // (Tools: not lists, so no count.)
    `<div class="sec" data-sec="tools"><div class="sec-h">Tools</div><button type="button" class="grp" data-tool="mscheck" aria-label="Cite Check: check a manuscript\u2019s citations"${msToolTitle()}>${ICON.citecheck}<span class="nm">Cite Check</span>${msToolCount()}</button>` +
      (gs ? `<button type="button" class="grp" data-tool="newpapers" aria-label="New papers" title="New papers that cite yours, by authors you follow, like ones you choose, and in your journals">${ICON.bell}<span class="nm">New papers</span>${npToolCount()}</button>` +
        `<button type="button" class="grp" data-tool="kwtidy" aria-label="Tidy keywords" title="Keywords written more than one way, used once, or probably missing">${ICON.tag}<span class="nm">Tidy keywords</span></button>` : '') + `</div>`;
  // (Saved searches just above the static groups.)
  if (SMART.list.length) h += `<div class="sec" data-sec="q"><div class="sec-h">Saved searches</div>` + SMART.list.map(x => grpBtn('q:' + x.name, x.name, groupItems('q:' + x.name).length, ICON.search)).join('') + `</div>`;
  if (GROUPS.some(g => !(gs && g === readingGroup())) || gs) {
    h += `<div class="sec" data-sec="s"><div class="sec-row"><div class="sec-h">Static groups</div>` +
      (gs ? `<button type="button" class="sec-add" data-new-group title="New static group" aria-label="New static group"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>` : '') + `</div>`;
    if (NG.open) h += newGroupRow();
    for (const g of GROUPS) if (!(gs && g === readingGroup())) h += grpBtn('s:' + g.name, g.name, g.items.length, ICON.folder);
    h += `</div>`;
  }
  h += `<div class="sec"><button class="sec-h" data-toggle="kwOpen" aria-expanded="${state.kwOpen}">${ICON.chev}Keywords</button>`;
  if (state.kwOpen) {
    h += `<input class="kwfilter" id="kwfilter" type="search" placeholder="Filter ${KEYWORDS.size} keywords" value="${esc(state.kwFilter)}" aria-label="Filter keywords">`;
    const f = norm(state.kwFilter);
    for (const [k, n] of KW_SORTED) if (!f || n.includes(f)) h += grpBtn('k:' + k, k, KEYWORDS.get(k).length, '<i class="gi-tag"></i>');
  }
  h += `</div><div class="sec"><button class="sec-h" data-toggle="typeOpen" aria-expanded="${state.typeOpen}">${ICON.chev}Publication types</button>`;
  if (state.typeOpen) {
    for (const [t, items] of [...TYPES].sort((a, b) => b[1].length - a[1].length)) h += grpBtn('t:' + t, TYPE_NAMES[t] || t, items.length, ICON.type);
  }
  h += `</div>`;
  const g = $('#groups');
  const hadFocus = document.activeElement && document.activeElement.id === 'kwfilter';
  const hadName = document.activeElement && document.activeElement.id === 'ngName';
  // (Drawn again in the middle of the lists' unfolding: it carries on from there.)
  const was = g.querySelector('.lib-sub.moving'), from = was ? was.getBoundingClientRect().height : null;
  g.innerHTML = h;
  applySideOrder(g);
  unfoldLibSub(g, from);
  if (hadFocus) { const k = $('#kwfilter'); k.focus(); k.setSelectionRange(k.value.length, k.value.length); }
  if (hadName || NG.focus) { const n = $('#ngName'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } NG.focus = false; }
}
// The sidebar in the order you like: in Library, Saved searches, Tools and
// Static groups, drag an item up or down (on a phone or iPad, hold it a
// moment first, so a plain swipe still scrolls). The order goes to your
// other devices with your preferences; your .bib's groups aren't changed.
// (New items go at the end of their section.)
const SIDE_ORDER = Object.assign({ at: 0 }, store.get('sideOrder', {}));
const sideId = b => (b.dataset.lib ? 'lib:' + b.dataset.lib : b.dataset.g || 'tool:' + b.dataset.tool);
function applySideOrder(root) {
  root.querySelectorAll('.sec[data-sec]').forEach(sec => {
    const want = SIDE_ORDER[sec.dataset.sec];
    if (!want) return;
    const at = id => { const i = want.indexOf(id); return i < 0 ? want.length : i; };
    [...sec.children].filter(b => b.matches('.grp')).map((b, i) => [b, i])
      .sort((x, y) => at(sideId(x[0])) - at(sideId(y[0])) || x[1] - y[1]).forEach(([b]) => sec.appendChild(b));
    // (The open library's lists stay under it.)
    const cur = sec.querySelector(':scope > .grp.cur'), sub = sec.querySelector(':scope > .lib-sub');
    if (cur && sub) cur.after(sub);
  });
}
function sideOrderMerge(prefs) {
  const x = prefs && prefs.sideOrder;
  if (!x || (x.at || 0) <= SIDE_ORDER.at) return;
  Object.keys(SIDE_ORDER).forEach(k => delete SIDE_ORDER[k]);
  Object.assign(SIDE_ORDER, x);
  store.set('sideOrder', SIDE_ORDER);
}
let sideDragged = false;
(() => {
  const g = $('#groups');
  let d = null;
  const items = () => [...d.sec.children].filter(x => x.matches('.grp'));
  const start = () => {
    d.on = true;
    d.top0 = d.b.getBoundingClientRect().top;
    d.b.classList.add('dragging');
    d.sec.classList.add('sorting');
    try { d.b.setPointerCapture(d.id); } catch (e) { /* the pointer's gone */ }
    if (navigator.vibrate) navigator.vibrate(8);
    const sel = window.getSelection && window.getSelection();
    if (sel) sel.removeAllRanges();
  };
  const move = y => {
    const sibs = items().filter(x => x !== d.b);
    // (In front of the first item whose middle is below the pointer.)
    const before = sibs.find(x => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
    if (before) { if (d.b.nextElementSibling !== before) d.sec.insertBefore(d.b, before); }
    else if (sibs.length && sibs[sibs.length - 1].nextElementSibling !== d.b) sibs[sibs.length - 1].after(d.b);
    d.b.style.transform = '';
    d.b.style.transform = 'translateY(' + (y - d.y0 + d.top0 - d.b.getBoundingClientRect().top) + 'px)';
  };
  const stop = keep => {
    if (!d) return;
    clearTimeout(d.timer);
    if (d.on) {
      d.b.classList.remove('dragging');
      d.b.style.transform = '';
      d.sec.classList.remove('sorting');
      if (keep) {
        SIDE_ORDER[d.sec.dataset.sec] = items().map(sideId);
        SIDE_ORDER.at = Date.now();
        store.set('sideOrder', SIDE_ORDER);
        if (gs) google.script.run.withFailureHandler(() => {}).savePrefs({ sideOrder: SIDE_ORDER });
        if (d.sec.querySelector(':scope > .lib-sub')) applySideOrder(g);
      } else applySideOrder(g);
      // (The click that ends a drag doesn't open the item.)
      sideDragged = true;
      setTimeout(() => { sideDragged = false; }, 0);
    }
    d = null;
  };
  g.addEventListener('pointerdown', ev => {
    if (d || (ev.pointerType === 'mouse' && ev.button !== 0) || ev.target.closest('input')) return;
    const b = ev.target.closest('.sec[data-sec] > .grp');
    if (!b) return;
    d = { b, sec: b.parentElement, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, touch: ev.pointerType !== 'mouse', on: false };
    if (d.touch) d.timer = setTimeout(() => { if (d && !d.on) start(); }, 350);
  });
  g.addEventListener('pointermove', ev => {
    if (!d || ev.pointerId !== d.id) return;
    if (!d.on) {
      const far = Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0);
      // (A finger that moves before the hold is scrolling.)
      if (d.touch) { if (far > 8) stop(false); return; }
      if (Math.abs(ev.clientY - d.y0) < 5) return;
      start();
    }
    move(ev.clientY);
  });
  g.addEventListener('pointerup', ev => { if (d && ev.pointerId === d.id) stop(true); });
  g.addEventListener('pointercancel', ev => { if (d && ev.pointerId === d.id) stop(false); });
  // (While dragging with a finger, the sidebar doesn't scroll, and the hold
  // doesn't bring up a menu.)
  g.addEventListener('touchmove', ev => { if (d && d.on) ev.preventDefault(); }, { passive: false });
  g.addEventListener('contextmenu', ev => { if (d) ev.preventDefault(); });
  g.addEventListener('click', ev => { if (sideDragged) { ev.stopPropagation(); ev.preventDefault(); } }, true);
})();
$('#groups').addEventListener('click', ev => {
  if (ev.target.closest('[data-new-group]')) { NG.open ? closeNewGroup() : openNewGroup(); return; }
  if (ev.target.closest('[data-ng-go]')) { createNewGroup(); return; }
  if (ev.target.closest('[data-ng-cancel]')) { closeNewGroup(); return; }
  if (ev.target.closest('.ng-row')) return;
  const t = ev.target.closest('[data-toggle]');
  if (t) { const k = t.dataset.toggle; state[k] = !state[k]; store.set(k, state[k]); renderGroups(); return; }
  if (ev.target.closest('.recent-edit')) return;
  const rc = ev.target.closest('.grp[data-g="recent"] .recent-ct');
  if (rc) { editRecentCount(rc.closest('.grp')); return; }
  if (ev.target.closest('[data-new-lib]')) { closeDrawer(); openNewLibrary(); return; }
  const lb = ev.target.closest('[data-lib]');
  if (lb && !lb.classList.contains('cur')) { closeDrawer(); const l = LIBS.list.find(x => x.bibId === lb.dataset.lib); if (l) switchLibraryTo(l); return; }
  if (ev.target.closest('[data-tool="mscheck"]')) { closeDrawer(); openMsCheck(); return; }
  if (ev.target.closest('[data-tool="newpapers"]')) { closeDrawer(); openNewPapers(); return; }
  if (ev.target.closest('[data-tool="kwtidy"]')) { closeDrawer(); openKwTidy(); return; }
  const b = ev.target.closest('.grp');
  if (!b) return;
  setGroup(b.dataset.g);
});
$('#groups').addEventListener('input', ev => {
  if (ev.target.id === 'kwfilter') { state.kwFilter = ev.target.value; renderGroups(); }
  if (ev.target.id === 'ngName') { NG.name = ev.target.value; NG.error = ''; const e = $('#ngError'); if (e) e.hidden = true; }
});
$('#groups').addEventListener('change', ev => { if (ev.target.id === 'ngWith') NG.with = ev.target.checked; });
$('#groups').addEventListener('keydown', ev => {
  if (ev.target.id !== 'ngName') return;
  if (ev.key === 'Enter') { ev.preventDefault(); createNewGroup(); }
  else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeNewGroup(); }
});
// The reading list's BibDesk static group ("\u2605 Reading List").
const readingGroup = () => GROUPS.find(g => g.name === '\u2605 Reading List') || GROUPS.find(g => /reading list/i.test(g.name)) || null;
// Tabs across the top: Library (always first), the reading list, and any
// group, keyword or type opened from the sidebar (these can be closed).
// The ones after Library scroll sideways when there are many.
let TABS = store.get('tabs', []);
const tabCloseable = id => id !== 'all' && id !== 'toread';
function renderTabs() {
  if (!ENTRIES.length) return;
  TABS = TABS.filter(id => id !== 'all' && id !== 'recent' && groupItems(id));
  const rb = $('#recentBtn');
  rb.classList.toggle('on', state.group === 'recent');
  rb.setAttribute('aria-pressed', String(state.group === 'recent'));
  if (gs && TABS.indexOf('toread') < 0) TABS.unshift('toread');
  if (!gs) TABS = TABS.filter(id => id !== 'toread');
  store.set('tabs', TABS);
  const on = id => state.group === id;
  const count = id => (groupItems(id) || []).length.toLocaleString();
  const lib = $('#tabs .tab.pinned');
  lib.setAttribute('aria-selected', String(on('all')));
  lib.querySelector('.ct').textContent = count('all');
  const box = $('#tabScroll'), keep = box.scrollLeft;
  // On a phone the reading list's tab is just "Queue", to save room.
  const short = id => (id === 'toread' && phoneMQ.matches ? 'Queue' : groupName(id));
  box.innerHTML = TABS.map(id => `<button type="button" class="tab" role="tab" data-tab="${esc(id)}" aria-selected="${on(id)}" title="${esc(groupName(id))}">` +
    `<span class="nm">${esc(short(id))}</span><span class="ct">${count(id)}</span>` +
    (tabCloseable(id) ? `<span class="tab-x" data-close="${esc(id)}" role="button" aria-label="Close ${esc(groupName(id))}" title="Close">${ICON.x}</span>` : '') +
    `</button>`).join('');
  box.scrollLeft = keep;
  const cur = box.querySelector('.tab[aria-selected="true"]');
  if (cur) {
    const b = box.getBoundingClientRect(), r = cur.getBoundingClientRect();
    if (r.left < b.left) box.scrollLeft -= b.left - r.left + 8;
    else if (r.right > b.right) box.scrollLeft += r.right - b.right + 8;
  }
  fitToolbar();
  foldTabs();
}
// Lists whose tabs are out of sight at an end of the strip: a button over
// that end says how many, and a tap lists them (as the open papers' tabs).
const LIB_OUT = { left: [], right: [] };
function foldTabs() {
  const box = $('#tabScroll'), L = $('#tabLeft'), Rb = $('#tabRight'), b = box.getBoundingClientRect();
  LIB_OUT.left = []; LIB_OUT.right = [];
  const room = box.scrollWidth - box.clientWidth;
  if (room > 1) {
    const atStart = box.scrollLeft < 2, atEnd = box.scrollLeft > room - 2;
    box.querySelectorAll('.tab').forEach(t => {
      const r = t.getBoundingClientRect();
      if (!atStart && r.left < b.left + 24) LIB_OUT.left.push(t.dataset.tab);
      else if (!atEnd && r.right > b.right - 24) LIB_OUT.right.push(t.dataset.tab);
    });
  }
  const chev = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const set = (el, ids, side) => {
    el.hidden = !ids.length;
    if (!ids.length) return;
    el.innerHTML = side === 'left' ? chev('M15 6l-6 6 6 6') + `<b>${ids.length}</b>` : `<b>${ids.length}</b>` + chev('M9 6l6 6-6 6');
    el.title = ids.length + ' more open list' + (ids.length > 1 ? 's' : '') + ' to the ' + side + ': ' + ids.map(groupName).join(', ');
    el.setAttribute('aria-label', el.title);
  };
  set(L, LIB_OUT.left, 'left'); set(Rb, LIB_OUT.right, 'right');
}
$('#tabScroll').addEventListener('scroll', () => requestAnimationFrame(foldTabs), { passive: true });
function libTabsMenu(side) {
  const was = $('#tabsMenu');
  closeTabsMenu();
  if (was && was.dataset.side === 'lib-' + side) return;
  const ids = LIB_OUT[side];
  if (!ids.length) return;
  const btn = side === 'left' ? $('#tabLeft') : $('#tabRight');
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu link-menu recent-menu';
  m.id = 'tabsMenu';
  m.dataset.side = 'lib-' + side;
  m.setAttribute('role', 'menu');
  m.innerHTML = '<div class="menu-head">Open lists ' + (side === 'left' ? 'to the left' : 'to the right') + '</div>' + ids.map(id =>
    `<button type="button" role="menuitem" data-tl="${esc(id)}"><span class="rc-title">${esc(groupName(id))}</span><span class="rc-sub">${(groupItems(id) || []).length.toLocaleString()} publications</span></button>`).join('');
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  const x = side === 'left' ? r.left : r.right - m.offsetWidth;
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, x)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-tl]');
    if (!b) return;
    closeTabsMenu();
    setGroup(b.dataset.tl);
  });
}
$('#tabLeft').addEventListener('click', ev => { ev.stopPropagation(); libTabsMenu('left'); });
$('#tabRight').addEventListener('click', ev => { ev.stopPropagation(); libTabsMenu('right'); });
// On a phone, the toolbar folds Select, then Add, into the More menu until
// the tabs fit.
function fitToolbar() {
  const tb = $('#tabs').closest('.toolbar'), box = $('#tabScroll');
  tb.classList.remove('fold-rec', 'fold-sel', 'fold-add');
  if (!phoneMQ.matches) return;
  const over = () => box.scrollWidth > box.clientWidth + 1;
  if (!over()) return;
  // Recently viewed goes first, then Select, then Add. While selecting,
  // Select stays (to finish).
  tb.classList.add('fold-rec');
  if (!over()) return;
  if (state.picking) { if (!$('#addBtn').hidden) tb.classList.add('fold-sel', 'fold-add'); return; }
  tb.classList.add('fold-sel');
  if (over() && !$('#addBtn').hidden) tb.classList.add('fold-add');
}
window.addEventListener('resize', () => requestAnimationFrame(() => { if (ENTRIES.length) renderTabs(); else fitToolbar(); }));
function closeTab(id) {
  const i = TABS.indexOf(id);
  if (i < 0) return;
  TABS.splice(i, 1);
  store.set('tabs', TABS);
  if (state.group === id) setGroup(TABS[Math.max(0, i - 1)] && i > 0 ? TABS[i - 1] : 'all');
  else renderTabs();
}
$('#tabs').addEventListener('click', ev => {
  const x = ev.target.closest('[data-close]');
  if (x) { ev.stopPropagation(); closeTab(x.dataset.close); return; }
  const t = ev.target.closest('[data-tab]');
  if (!t) return;
  // The tab already showing: back to the top of its list.
  if (t.dataset.tab === state.group) listEl.scrollTo({ top: 0, behavior: 'smooth' });
  else setGroup(t.dataset.tab);
});
// Middle-click closes a tab, as in a browser.
$('#tabs').addEventListener('auxclick', ev => {
  const t = ev.target.closest('[data-tab]');
  if (ev.button === 1 && t && tabCloseable(t.dataset.tab)) { ev.preventDefault(); closeTab(t.dataset.tab); }
});
function setGroup(id) {
  state.group = id; store.set('group', id);
  // (Recently viewed has its own button, highlighted, instead of a tab.)
  if (id !== 'all' && id !== 'recent' && TABS.indexOf(id) < 0) { TABS.push(id); store.set('tabs', TABS); }
  document.querySelectorAll('.grp.on').forEach(b => b.classList.remove('on'));
  const b = document.querySelector(`.grp[data-g="${CSS.escape(id)}"]`);
  if (b) b.classList.add('on');
  closeDrawer();
  if (phoneMQ.matches) go('list');
  listEl.scrollTop = 0;
  refresh(true);
}

/* ------------------------------------------------------------ filter + sort */
// A search, as a test of a publication (null for none). Words are looked
// for in the field chosen (all of them, say); a word can name its own,
// and start with - to leave out what has it:
//   author:lee  title:"mental imagery"  kw:perception  journal:mind
//   year:2020  year:2020-2024  year:>2019  year:forthcoming
//   type:article  group:favorites  has:pdf  has:doi  is:read  is:unread  rating:4
// In quotation marks (straight or curly, as iPhones type them), words are
// found only whole and together: "lande" is Lande, not Landes. Otherwise a
// name is found from the start of a word, and other words anywhere.
const SEARCH_FIELDS = { author: 'author', a: 'author', au: 'author', title: 'title', t: 'title', ti: 'title', kw: 'kw', k: 'kw', keyword: 'kw',
  journal: 'venue', j: 'venue', venue: 'venue', in: 'venue', year: 'year', y: 'year', type: 'type', group: 'group', g: 'group', has: 'has', is: 'is',
  rating: 'rating', key: 'key' };
function searchFilter(q, field) {
  const tests = [], re = /(-)?(?:([a-z]+):)?(?:["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]?|(\S+))/gi;
  // Words as a test of text: whole (quoted), from a word's start, or anywhere.
  const edge = '[^\\p{L}\\p{N}]', reOf = (v, whole) => new RegExp('(^|' + edge + ')' + v.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&') + (whole ? '(?=$|' + edge + ')' : ''), 'u');
  let m;
  while ((m = re.exec(q || ''))) {
    let name = m[2] && SEARCH_FIELDS[m[2].toLowerCase()];
    const raw = m[3] || m[4], v = norm(raw), whole = m[3] !== undefined;
    const has = whole ? (() => { const w = reOf(v, true); return x => w.test(x); })() : x => x.includes(v);
    let test;
    if (!name) {
      const t = norm((m[2] ? m[2] + ':' : '') + raw), w = whole && reOf(t, true);
      test = w ? e => w.test(searchText(e, field)) : e => searchText(e, field).includes(t);
    }
    else if (name === 'year') {
      const r = /^(\d{4})?\s*-\s*(\d{4})?$/.exec(v), gt = /^>=?(\d{4})$/.exec(v), lt = /^<=?(\d{4})$/.exec(v);
      if (FORTH_RE.test(v) || v === 'forth') test = e => FORTH_RE.test(e.f.year || '');
      else if (r) test = e => e.yearN && (!r[1] || e.yearN >= +r[1]) && (!r[2] || e.yearN <= +r[2]);
      else if (gt) test = e => e.yearN > +gt[1] - (v[1] === '=' ? 1 : 0);
      else if (lt) test = e => e.yearN && e.yearN < +lt[1] + (v[1] === '=' ? 1 : 0);
      else test = e => String(e.f.year || '').startsWith(raw);
    }
    // A name from the start of a word: lande is Lande, not Flanders.
    else if (name === 'author') { const w = reOf(v, whole); test = e => w.test(searchText(e, 'sAuthor')); }
    else if (name === 'title') test = e => has(searchText(e, 'sTitle'));
    else if (name === 'kw') test = e => e.kw.some(k => has(norm(k)));
    else if (name === 'venue') test = e => has(norm(e.venue));
    else if (name === 'type') test = e => e.t === v || norm(TYPE_NAMES[e.t] || '').includes(v);
    else if (name === 'group') test = e => (e.groups || []).some(g => has(norm(g)));
    else if (name === 'key') test = e => whole ? norm(e.k) === v : norm(e.k).includes(v);
    else if (name === 'rating') test = e => e.rating >= (parseInt(v, 10) || 0);
    else if (name === 'has') test = v === 'pdf' || v === 'file' ? e => readablePdfs(e).length || (e.files || []).length > 0 : v === 'doi' ? e => !!e.f.doi : v === 'notes' ? e => !!(e.f.annote || '').trim() : e => !!(e.f[v] || '').toString().trim();
    else if (name === 'is') test = v === 'read' ? e => e.f.read === '1' : v === 'unread' ? e => e.f.read !== '1' : v === 'inbox' ? e => !!e.ib : () => true;
    tests.push(m[1] ? e => !test(e) : test);
  }
  return tests.length ? e => tests.every(t => t(e)) : null;
}
// The sort keys are already folded to plain lower case (norm), so a plain
// comparison is enough, and much quicker than localeCompare.
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// A publication's length in pages: from its page range ("327--345": 19;
// "1--5, 9--12": 9; "327--45" as 327--345), or a book's (or thesis's)
// count; or else its PDF's pages, if it's been opened (0: not known).
const WHOLE_WORKS = new Set(['book', 'phdthesis', 'mastersthesis', 'techreport', 'manual', 'booklet', 'proceedings', 'unpublished', 'misc']);
function pageCount(e) {
  const src = String(e.f.pagetotal || e.f.pages || '').replace(/[{}]/g, '');
  if (e.lenOf === src && e.len != null) return e.len;
  let n = 0;
  const parts = src.split(/[,;]/).filter(p => p.trim());
  for (const part of parts) {
    const m = /^\s*(\d+)\s*(?:[-\u2013\u2014]+\s*(\d+))?\s*$/.exec(part);
    if (!m) { n = 0; break; }
    if (m[2]) {
      let a = +m[1], b = +m[2];
      if (b < a && m[2].length < m[1].length) b = +(m[1].slice(0, m[1].length - m[2].length) + m[2]);
      n += b >= a ? b - a + 1 : 0;
    } else n += parts.length === 1 && (e.f.pagetotal || WHOLE_WORKS.has(e.t)) ? +m[1] : 1;
  }
  if (!n && PROGRESS[e.k] && PROGRESS[e.k].n) n = PROGRESS[e.k].n;
  e.lenOf = src; e.len = n;
  return n;
}
const SORTS = {
  length: Object.assign((a, b) => pageCount(a) - pageCount(b) || cmpStr(a.kAuthor, b.kAuthor), { blank: e => (pageCount(e) ? 0 : 1) }),
  author: (a, b) => cmpStr(a.kAuthor, b.kAuthor) || a.yearN - b.yearN || cmpStr(a.kTitle, b.kTitle),
  year: (a, b) => a.yearN - b.yearN || cmpStr(a.kAuthor, b.kAuthor),
  title: (a, b) => cmpStr(a.kTitle, b.kTitle),
  venue: (a, b) => cmpStr(a.kVenue, b.kVenue) || a.yearN - b.yearN,
  added: (a, b) => cmpStr(a.added, b.added),
  rating: (a, b) => a.rating - b.rating || cmpStr(a.kAuthor, b.kAuthor),
  file: (a, b) => (a.files ? 1 : 0) - (b.files ? 1 : 0) || cmpStr(a.kAuthor, b.kAuthor),
};
// The reading list keeps its own sort, and columns, apart from the other
// tabs (both remembered): at first, its own order (Up next, then Later).
const sortCtx = () => (state.group === 'toread' ? 'rl.' : '');
let SORT_CTX = '';
function syncSortCtx() {
  if (SORT_CTX === sortCtx()) return;
  SORT_CTX = sortCtx();
  state.sort = store.get(SORT_CTX + 'sort', SORT_CTX ? 'list' : 'added');
  state.dir = store.get(SORT_CTX + 'dir', SORT_CTX ? 1 : -1);
  applyColumns();
}
function refresh(resetSel) {
  syncSortCtx();
  const base = groupItems(state.group) || ENTRIES;
  const field = { all: 'sAll', author: 'sAuthor', title: 'sTitle', kw: 'sKw' }[state.scope] || 'sAll';
  const match = searchFilter(state.q, field), toks = match ? [1] : [];
  let v = match ? base.filter(match) : base.slice();
  // (In the reading list: Added is when it went on the list; and its own
  // order, as is or turned round.)
  const rl = state.group === 'toread', rlAt = e => { const x = RL.get(e.k); return x ? x.added : 0; };
  const cmp = rl && state.sort === 'added' ? (a, b) => rlAt(a) - rlAt(b) : SORTS[state.sort] || colSort(state.sort, v) || SORTS.added;
  if (rl && state.sort === 'list') { if (state.dir < 0) v.reverse(); }
  else if (state.group !== 'dups' && state.group !== 'recent') v.sort(cmp.blank ? (a, b) => cmp.blank(a) - cmp.blank(b) || state.dir * cmp(a, b) : state.dir > 0 ? cmp : (a, b) => cmp(b, a));
  if (state.group !== 'toread' && state.group !== 'dups' && state.group !== 'recent') v = nestVersions(v); else NESTED = new Set();
  state.view = v;
  renderRLBar();
  renderForthBar();
  renderSmartBar();
  $('#searchSave').hidden = !match;
  renderTabs();

  $('#statusL').textContent = toks.length
    ? `${v.length.toLocaleString()} of ${base.length.toLocaleString()} publications match`
    : `${base.length.toLocaleString()} publications`;
  const nf = v.filter(e => e.files).length;
  $('#statusR').textContent = `${nf.toLocaleString()} with files`;
  renderSortUI();

  if (resetSel || !v.some(e => e.k === state.selKey)) {
    state.selKey = (!phoneMQ.matches && v.length) ? v[0].k : null;
    if (resetSel) listEl.scrollTop = 0;
  }
  sizeList();
  renderDetail();
}
function renderSortUI() {
  document.querySelectorAll('#colhead button[data-sort]').forEach(b => {
    const on = b.dataset.sort === state.sort;
    b.classList.toggle('on', on);
    b.querySelector('.arr')?.remove();
    if (on && b.dataset.sort !== 'file') b.insertAdjacentHTML('beforeend', `<i class="arr">${state.dir > 0 ? ICON.up : ICON.down}</i>`);
    b.setAttribute('aria-sort', on ? (state.dir > 0 ? 'ascending' : 'descending') : 'none');
  });
  const listOpt = $('#sortSel').querySelector('[value="list"]');
  listOpt.hidden = state.group !== 'toread';
  $('#sortSel').value = state.sort === 'list' && state.group === 'toread' ? 'list' : state.sort in SORTS && state.sort !== 'file' ? state.sort : 'added';
  $('#sortDir').innerHTML = state.dir > 0 ? ICON.up : ICON.down;
  $('#sortDir').title = state.dir > 0 ? 'Ascending' : 'Descending';
}
function setSort(key, dir) {
  if (dir == null) dir = key === state.sort ? -state.dir : (key === 'added' || key === 'year' || key === 'rating' || key === 'file' ? -1 : 1);
  state.sort = key; state.dir = dir;
  store.set(sortCtx() + 'sort', key); store.set(sortCtx() + 'dir', dir);
  refresh(false);
  revealSelected();
}
$('#colhead').addEventListener('click', ev => {
  const m = ev.target.closest('#colMenuBtn');
  if (m) { if ($('#colMenu')) closeColMenu(); else { const r = m.getBoundingClientRect(); openColMenu(r.right, r.bottom); } return; }
  if (ev.target.closest('.col-grip') || colDragged) return;
  const b = ev.target.closest('button');
  if (b) setSort(b.dataset.sort);
});

/* ------------------------------------------------------------ columns */
// Which columns the list shows: Title always, the rest chosen in the menu
// at the end of the headings (or a right-click or long press on them),
// remembered on this device separately for wide and narrower screens.
// Besides the usual ones there are a few more, and any BibTeX field can be
// added as a column. Author, Year and the rest can be resized by dragging
// the grips in the headings; Title takes what's left.
const fieldText = (e, name) => String(e.f[name] == null ? '' : e.f[name]).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
const COLS = {
  author: { name: 'Author', w: 'minmax(100px, 20%)' },
  year: { name: 'Year', w: '52px', cls: 'c-year', cell: e => e.f.year || '' },
  title: { name: 'Title' },
  venue: { name: 'Journal / Book', w: 'minmax(80px, 20%)', cls: 'c-venue', cell: e => e.venue },
  added: { name: 'Added', w: '86px' },
  modified: { name: 'Modified', w: '86px', cls: 'c-added', cell: e => (e.f['date-modified'] || '').slice(0, 10) },
  rating: { name: 'Rating', w: '72px', cls: 'c-x', cell: e => e.rating ? '\u2605'.repeat(e.rating) : '' },
  type: { name: 'Type', w: '110px', cls: 'c-x', cell: e => TYPE_NAMES[e.t] || e.t },
  key: { name: 'Cite key', w: '140px', cls: 'c-key', cell: e => e.k },
  keywords: { name: 'Keywords', w: 'minmax(100px, 18%)', cls: 'c-x', cell: e => e.kw.join(', ') },
  length: { name: 'Length', w: '72px', cls: 'c-x c-len', cell: e => { const n = pageCount(e); return n ? n + (n === 1 ? ' p.' : ' pp.') : ''; } },
};
const COL_ORDER = Object.keys(COLS);
const COL_DEFAULT = { wide: ['author', 'year', 'title', 'venue', 'added'], narrow: ['author', 'year', 'title', 'venue'] };
const COL_MIN = { year: 36 };
const fieldLabel = f => f.replace(/[-_]/g, ' ').replace(/^./, c => c.toUpperCase());
function colDef(k) {
  if (COLS[k]) return COLS[k];
  if (!/^f:[\w.-]+$/.test(k)) return null;
  const f = k.slice(2);
  return { name: fieldLabel(f), w: 'minmax(80px, 16%)', cls: 'c-x', cell: e => fieldText(e, f) };
}
function colSort(k, list) {
  const d = colDef(k);
  if (!d || !d.cell) return null;
  // Each value is worked out once, not at every comparison.
  const keys = new Map((list || []).map(e => [e, norm(d.cell(e))]));
  const val = e => (keys.has(e) ? keys.get(e) : norm(d.cell(e)));
  const cmp = (a, b) => cmpStr(val(a), val(b)) || cmpStr(a.kAuthor, b.kAuthor);
  // Publications without a value go last, whichever way it's sorted.
  cmp.blank = e => (val(e) ? 0 : 1);
  return cmp;
}
const colLayout = () => tabletMQ.matches ? 'narrow' : 'wide';
// (The reading list's own, if chosen; at first, as the other tabs have them.)
function chosenCols() {
  let c = store.get('columns.' + sortCtx() + colLayout(), null);
  if (!Array.isArray(c) && sortCtx()) c = store.get('columns.' + colLayout(), null);
  if (!Array.isArray(c) || c.indexOf('title') < 0) c = COL_DEFAULT[colLayout()];
  c = c.filter(k => colDef(k));
  // The usual ones in their usual order, then fields in the order added.
  return COL_ORDER.filter(k => c.indexOf(k) >= 0).concat(c.filter(k => !COLS[k]));
}
let COL_LIST = chosenCols();
let colWidths = store.get('colWidths', {});
let colDragged = false;
function applyColumns() {
  COL_LIST = chosenCols();
  const w = colWidths;
  const tracks = [tabletMQ.matches ? '34px' : '30px'].concat(COL_LIST.map(k => k === 'title' ? 'minmax(0, 1fr)' : w[k] ? w[k] + 'px' : colDef(k).w), ['26px']);
  $('#listwrap').style.setProperty('--cols', tracks.join(' '));
  const head = $('#colhead'), file = head.querySelector('[data-sort="file"]').outerHTML, t = COL_LIST.indexOf('title');
  head.innerHTML = file + COL_LIST.map((k, i) => {
    const name = esc(colDef(k).name);
    if (k === 'title') return `<button data-sort="title"><span>${name}</span></button>`;
    const grip = `<i class="col-grip" data-col="${esc(k)}" data-dir="${i < t ? 1 : -1}" title="Drag to resize; double-click to reset"></i>`;
    return i < t ? `<button data-sort="${esc(k)}"><span>${name}</span>${grip}</button>` : `<button data-sort="${esc(k)}">${grip}<span>${name}</span></button>`;
  }).join('') + `<button type="button" class="col-menu-btn" id="colMenuBtn" aria-label="Choose columns" title="Choose columns" aria-haspopup="dialog"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/></svg></button>`;
  renderSortUI();
}
function setCols(list) {
  store.set('columns.' + sortCtx() + colLayout(), list);
  applyColumns();
  if (ENTRIES.length) paint();
}
applyColumns();
tabletMQ.addEventListener('change', () => { applyColumns(); if (ENTRIES.length) paint(); });
// The menu: tick columns on and off, add a field, or go back to the usual.
function openColMenu(x, y) {
  closeColMenu();
  const list = chosenCols(), on = new Set(list);
  const fields = new Set();
  for (const e of ENTRIES) for (const f in e.f) fields.add(f);
  const box = document.createElement('div');
  box.className = 'col-menu';
  box.id = 'colMenu';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Columns');
  const row = (k, name, disabled) => `<label class="${disabled ? 'off' : ''}"><input type="checkbox" data-col-toggle="${esc(k)}"${on.has(k) ? ' checked' : ''}${disabled ? ' disabled' : ''}>${esc(name)}</label>`;
  box.innerHTML = `<h4>Columns</h4>` + COL_ORDER.map(k => row(k, COLS[k].name, k === 'title')).join('') +
    list.filter(k => !COLS[k]).map(k => row(k, colDef(k).name)).join('') +
    `<h4>Add a field</h4><div class="col-add"><input type="text" id="colAddName" list="colFieldList" placeholder="Field, e.g. publisher" autocomplete="off" autocapitalize="off" spellcheck="false">` +
    `<button type="button" class="btn" id="colAddBtn">Add</button></div>` +
    `<datalist id="colFieldList">${Array.from(fields).sort().map(f => `<option value="${esc(f)}">`).join('')}</datalist>` +
    `<button type="button" class="linkish" id="colReset">Back to the usual columns</button>`;
  document.body.appendChild(box);
  const w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w + 20)) + 'px';
  box.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y + 6)) + 'px';
  box.addEventListener('change', ev => {
    const c = ev.target.closest('[data-col-toggle]');
    if (!c) return;
    const k = c.dataset.colToggle, now = chosenCols();
    setCols(c.checked ? now.concat(now.indexOf(k) < 0 ? [k] : []) : now.filter(x => x !== k));
  });
  const add = () => {
    const f = $('#colAddName').value.trim().toLowerCase();
    if (!f) return;
    if (!/^[\w.-]+$/.test(f)) { toast('A field name is letters, digits, dots, hyphens or underscores.', 3000); return; }
    const k = { year: 'year', title: 'title', keywords: 'keywords', 'date-modified': 'modified', rating: 'rating' }[f] || 'f:' + f;
    const now = chosenCols();
    if (now.indexOf(k) < 0) setCols(now.concat([k]));
    openColMenu(x, y);
  };
  box.querySelector('#colAddBtn').addEventListener('click', add);
  box.querySelector('#colAddName').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
  box.querySelector('#colReset').addEventListener('click', () => { store.set('columns.' + colLayout(), null); applyColumns(); if (ENTRIES.length) paint(); openColMenu(x, y); });
}
function closeColMenu() { const m = $('#colMenu'); if (m) m.remove(); }
document.addEventListener('pointerdown', ev => { if ($('#colMenu') && !ev.target.closest('#colMenu, #colMenuBtn')) closeColMenu(); }, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#colMenu')) { ev.stopPropagation(); closeColMenu(); } }, true);
(() => {
  const head = $('#colhead');
  head.addEventListener('contextmenu', ev => { ev.preventDefault(); openColMenu(ev.clientX, ev.clientY); });
  // A long press on the headings (touch screens).
  let t = 0, at = null;
  head.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse' || ev.target.closest('.col-grip')) return;
    const x = ev.clientX, y = ev.clientY;
    at = [x, y];
    t = setTimeout(() => { colDragged = true; openColMenu(x, y); setTimeout(() => { colDragged = false; }, 400); }, 550);
  });
  head.addEventListener('pointermove', ev => { if (at && Math.hypot(ev.clientX - at[0], ev.clientY - at[1]) > 8) clearTimeout(t); });
  ['pointerup', 'pointercancel'].forEach(n => head.addEventListener(n, () => { clearTimeout(t); at = null; }));
})();
(() => {
  const head = $('#colhead');
  let drag = null;
  head.addEventListener('pointerdown', ev => {
    const grip = ev.target.closest('.col-grip');
    if (!grip) return;
    ev.preventDefault();
    ev.stopPropagation();
    const col = grip.dataset.col;
    const cell = head.querySelector(`[data-sort="${CSS.escape(col)}"]`);
    // Room the fixed columns may take, leaving Title at least 120px.
    const others = COL_LIST.filter(k => k !== col && k !== 'title')
      .map(k => head.querySelector(`[data-sort="${CSS.escape(k)}"]`)).filter(b => b && b.offsetParent)
      .reduce((n, b) => n + b.getBoundingClientRect().width, 0) + 26;
    drag = { grip, col, dir: +grip.dataset.dir, x: ev.clientX, w: cell.getBoundingClientRect().width,
      max: head.getBoundingClientRect().width - others - 34 - 120 };
    colDragged = false;
    grip.classList.add('dragging');
    document.body.classList.add('col-resizing');
    grip.setPointerCapture(ev.pointerId);
  });
  head.addEventListener('pointermove', ev => {
    if (!drag) return;
    const dx = (ev.clientX - drag.x) * drag.dir;
    if (Math.abs(dx) > 2) colDragged = true;
    colWidths = Object.assign({}, colWidths, { [drag.col]: Math.round(Math.max(COL_MIN[drag.col] || 50, Math.min(drag.max, drag.w + dx))) });
    applyColumns();
  });
  const end = () => {
    if (!drag) return;
    drag.grip.classList.remove('dragging');
    document.body.classList.remove('col-resizing');
    drag = null;
    store.set('colWidths', colWidths);
    // Swallow the click that follows a drag, so it doesn't re-sort.
    setTimeout(() => { colDragged = false; }, 0);
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
  head.addEventListener('dblclick', ev => {
    const grip = ev.target.closest('.col-grip');
    if (!grip) return;
    ev.stopPropagation();
    const next = Object.assign({}, colWidths);
    delete next[grip.dataset.col];
    colWidths = next;
    store.set('colWidths', colWidths);
    applyColumns();
  });
})();
$('#sortSel').addEventListener('change', ev => setSort(ev.target.value, ev.target.value === 'added' || ev.target.value === 'year' || ev.target.value === 'rating' ? -1 : 1));
$('#sortDir').addEventListener('click', () => setSort(state.sort, -state.dir));

let qTimer;
$('#q').addEventListener('input', ev => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.q = ev.target.value; refresh(false); listEl.scrollTop = 0; paint(); }, 90);
});
$('#q').addEventListener('keydown', ev => {
  if (ev.key === 'Escape') { ev.target.value = ''; state.q = ''; refresh(false); revealSelected(); closeSearch(); return; }
  if (ev.key === 'ArrowDown' || ev.key === 'Enter') { ev.preventDefault(); listEl.focus(); if (!state.selKey && state.view[0]) select(0); }
});
// The search field opens from its icon (or the keyboard) and closes when
// it's empty and you leave it; with a search in it, it stays open.
function openSearch(focus) {
  $('.toolbar').classList.add('searching');
  $('#searchBtn').setAttribute('aria-expanded', 'true');
  if (focus) { $('#q').focus(); $('#q').select(); }
}
function closeSearch() {
  if ($('#q').value) return;
  const had = $('.search').contains(document.activeElement);
  $('.toolbar').classList.remove('searching');
  $('#searchBtn').setAttribute('aria-expanded', 'false');
  if (had) $('#searchBtn').focus();
}
$('#searchBtn').addEventListener('click', () => openSearch(true));
// The cross clears the search and closes the field.
$('#searchX').addEventListener('click', ev => {
  ev.preventDefault();
  if ($('#q').value || state.q) { $('#q').value = ''; state.q = ''; refresh(false); revealSelected(); }
  closeSearch();
});
$('.search').addEventListener('focusout', () => setTimeout(() => { if (!$('.search').contains(document.activeElement)) closeSearch(); }, 150));
$('#scope').addEventListener('change', ev => { state.scope = ev.target.value; store.set('scope', state.scope); refresh(false); });

/* ------------------------------------------------------------ virtual list */
const rowH = () => phoneMQ.matches ? 108 : coarseMQ.matches ? 40 : 26;
// Where each row sits. Wide screens: one height for all. Phone cards: as
// tall as the title needs (one line or two), measured once per list.
const CARD_H = [88, 108];
let CARDS = { view: null, w: 0, picking: false, tops: null };
function cardTops() {
  const v = state.view, w = listEl.clientWidth;
  if (CARDS.view === v && CARDS.w === w && CARDS.picking === state.picking && CARDS.tops) return CARDS.tops;
  const c = cardTops.ctx || (cardTops.ctx = document.createElement('canvas').getContext('2d'));
  c.font = '600 15.5px ' + (getComputedStyle(document.body).getPropertyValue('--serif').trim() || 'serif');
  // A little under the real width, so a title that might wrap gets two lines.
  const room = (w - 32 - (state.picking ? 32 : 0)) * 0.93;
  const tops = new Float64Array(v.length + 1);
  for (let i = 0; i < v.length; i++) tops[i + 1] = tops[i] + CARD_H[c.measureText(v[i].f.title || '(untitled)').width > room ? 1 : 0];
  CARDS = { view: v, w, picking: state.picking, tops };
  return tops;
}
const rowTop = i => (phoneMQ.matches ? cardTops()[i] : i * rowH());
const rowHt = i => (phoneMQ.matches ? cardTops()[i + 1] - cardTops()[i] : rowH());
const listHeight = () => (phoneMQ.matches ? cardTops()[state.view.length] : state.view.length * rowH());
// The row at a height in the list.
function rowAt(y) {
  const n = state.view.length;
  if (!phoneMQ.matches) return Math.max(0, Math.min(n - 1, Math.floor(y / rowH())));
  const t = cardTops();
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t[m] <= y) lo = m; else hi = m - 1; }
  return lo;
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { CARDS.tops = null; if (ENTRIES.length) sizeList(); });
function sizeList() { rowsEl.style.height = listHeight() + 'px'; paint(); libRailSoon(); }
function paint() {
  const h = rowH(), v = state.view;
  if (!v.length) {
    rowsEl.style.height = 'auto';
    rowsEl.innerHTML = `<div class="empty">${state.q ? 'No publications match \u201c' + esc(state.q) + '\u201d.' : 'This group is empty.'}</div>`;
    return;
  }
  const top = listEl.scrollTop, vh = listEl.clientHeight || 600;
  const s = Math.max(0, rowAt(top) - 6), e = Math.min(v.length, rowAt(top + vh) + 7);
  painted = { view: v, s, e };
  const phone = phoneMQ.matches;
  let out = '';
  for (let i = s; i < e; i++) out += phone ? cardHTML(v[i], i, rowTop(i), rowHt(i)) : rowHTML(v[i], i, rowTop(i), h);
  rowsEl.innerHTML = out;
}
// Papers saved on this device (sw.js keeps them), by file id: marked in
// the list, and the others faded while offline.
let SAVED = new Set();
const savedHere = e => readablePdfs(e).some(f => SAVED.has(f.id));
async function refreshSaved() {
  if (!window.LIBLANDE_PAGES || !window.caches) return;
  try {
    const keys = await (await caches.open('liblande-papers')).keys();
    const ids = new Set(keys.map(r => (/\/files\/([^/?]+)\?alt=media/.exec(r.url) || [])[1]).filter(Boolean).map(decodeURIComponent));
    if ([...ids].join() !== [...SAVED].join()) { SAVED = ids; if (ENTRIES.length) paint(); }
  } catch (err) { /* none kept */ }
}
const refreshSavedSoon = (ms = 2500) => { clearTimeout(refreshSaved.t); refreshSaved.t = setTimeout(refreshSaved, ms); };
// Offline: as the browser says (navigator.onLine), or, as a computer can
// say it's online with no way out (a VPN or another connection still up),
// as a tiny request to Google finds: at the start, on coming back to the
// front, and then every two minutes (every 15 seconds while offline).
const REACH = { ok: true, t: 0 };
const isOffline = () => !navigator.onLine || !REACH.ok;
async function reachCheck() {
  clearTimeout(REACH.t);
  let ok = navigator.onLine;
  if (ok && !(window.LIBLANDE_TEST && !window.LIBLANDE_REACH)) {
    const ctl = new AbortController(), give = setTimeout(() => ctl.abort(), 6000);
    try { await (window.LIBLANDE_REACH || fetch)('https:\/\/www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store', signal: ctl.signal }); }
    catch (err) { ok = false; }
    clearTimeout(give);
  }
  if (ok !== REACH.ok) { REACH.ok = ok; showOnline(); }
  if (!document.hidden) REACH.t = setTimeout(reachCheck, ok ? 120000 : 15000);
}
const showOnline = () => { document.body.classList.toggle('is-offline', isOffline()); setTimeout(() => netBadge(), 0); };
window.addEventListener('online', () => { showOnline(); reachCheck(); });
window.addEventListener('offline', showOnline);
document.addEventListener('visibilitychange', () => { if (!document.hidden) reachCheck(); });
showOnline();
reachCheck();
const pickBox = e => `<span class="pickbox${state.picked.has(e.k) ? ' on' : ''}" aria-hidden="true">${state.picked.has(e.k) ? ICON.check : ''}</span>`;
function rowHTML(e, i, top, h) {
  const f = e.files && e.files[0], n = readablePdfs(e).length;
  // The file icon opens the PDF in the reader (a menu when there are
  // several); without a server (the local tests), or for a file not found in Drive, it
  // links to Google Drive.
  const file = state.picking ? pickBox(e) : n
    ? `<button type="button" class="fileicon${savedHere(e) ? ' saved' : ''}" data-open-pdf="${i}" title="${n > 1 ? 'Read one of its ' + n + ' PDFs' : 'Read ' + esc(f.n)}${savedHere(e) ? ' (saved on this device: opens offline)' : ''}" aria-label="Read the PDF">${ICON.doc}</button>`
    : f ? `<a class="fileicon" href="${esc(driveUrl(f))}" target="_blank" rel="noopener" title="Open ${esc(f.n)}" aria-label="Open linked file">${ICON.doc}</a>`
    : '';
  return `<div class="row${e.k === state.selKey ? ' sel' : ''}${state.picked.has(e.k) ? ' picked' : ''}${i % 2 ? ' odd' : ''}${NESTED.has(e.k) ? ' child' : ''}" data-i="${i}"` +
    `${rowDrag() ? ' draggable="true"' : ''} style="top:${top}px;height:${h}px">` +
    `<span class="c-file">${file}</span>` + COL_LIST.map(k => colCell(k, e)).join('') + `</div>`;
}
function colCell(k, e) {
  if (k === 'title') return `<span class="c-title">${rlTag(e)}${esc(e.f.title || '(untitled)')}</span>`;
  if (k === 'author') return `<span class="c-author" title="${esc(e.authorsInit)}">${esc(e.authorsInit)}</span>`;
  if (k === 'added') return addedCell(e);
  const d = colDef(k), v = d ? d.cell(e) : '';
  return `<span class="${d && d.cls || 'c-x'}" title="${esc(v)}">${esc(v)}</span>`;
}
function addedCell(e) {
  const x = state.group === 'toread' && RL.get(e.k);
  if (!x) return `<span class="c-added">${esc(e.added.slice(0, 10))}</span>`;
  return `<span class="c-added${staleRL(x) ? ' stale' : ''}" title="On your reading list ${esc(waited(x))}">${esc(waited(x, true))}</span>`;
}
function cardWait(e) {
  const x = state.group === 'toread' && RL.get(e.k);
  return x ? ` <span class="${staleRL(x) ? 'stale' : ''}">\u00b7 ${esc(waited(x, true))}</span>` : '';
}
function cardHTML(e, i, top, h) {
  return `<div class="card${e.k === state.selKey && !state.picking ? ' sel' : ''}${state.picked.has(e.k) ? ' picked' : ''}${h < CARD_H[1] ? ' one' : ''}${NESTED.has(e.k) ? ' child' : ''}" data-i="${i}" style="top:${top}px;height:${h}px">` +
    (state.picking ? pickBox(e) : '') + `<div class="t">${esc(e.f.title || '(untitled)')}</div>` +
    `<div class="m"><span>${esc(e.authorsInit)}${e.f.year ? ' \u00b7 ' + esc(e.f.year) : ''}${rlTag(e)}${cardWait(e)}</span></div>` +
    `<div class="m"><span class="v">${esc(e.venue)}</span>${!e.files ? '' : readablePdfs(e).length && !state.picking
      ? `<button type="button" class="pdf${savedHere(e) ? ' saved' : ''}" data-open-pdf="${i}" aria-label="Read the PDF${savedHere(e) ? ' (saved on this device)' : ''}">PDF${readablePdfs(e).length > 1 ? ' \u00b7 ' + readablePdfs(e).length : ''}</button>`
      : '<span class="pdf">PDF</span>'}</div></div>`;
}
// The PDFs of a publication that can be opened in the reader.
const readablePdfs = e => (gs ? (e.files || []).filter(fl => fl.id) : []);
// Open a publication's PDF from the list: at once when it has one, from a
// small menu when it has several.
function openPdfFromList(btn) {
  const e = state.view[+btn.dataset.openPdf];
  const files = e ? readablePdfs(e) : [];
  closePdfMenu();
  if (!files.length) return;
  if (files.length === 1) { openPaper(e, files[0]); return; }
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu';
  m.id = 'pdfMenu';
  m.setAttribute('role', 'menu');
  m.innerHTML = files.map((fl, j) => `<button type="button" role="menuitem" data-pdf-j="${j}" title="${esc(fl.p)}"><span class="fname">${esc(fl.n.replace(/\.pdf$/i, ''))}</span></button>`).join('');
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
  m.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-pdf-j]');
    if (!b) return;
    closePdfMenu();
    openPaper(e, files[+b.dataset.pdfJ]);
  });
}
function closePdfMenu() { const m = $('#pdfMenu'); if (m) m.remove(); }
// On a phone, Select and Add can be in the toolbar's More menu (fitToolbar).
function closeMoreMenu() { const m = $('#moreMenu'); if (m) m.remove(); $('#moreBtn').setAttribute('aria-expanded', 'false'); }
$('#moreBtn').addEventListener('click', () => {
  if ($('#moreMenu')) { closeMoreMenu(); return; }
  // The same icons as the toolbar buttons they stand in for.
  const tb = $('#moreBtn').closest('.toolbar'), items = [];
  if (tb.classList.contains('fold-rec')) items.push(['recent', 'Recently viewed', $('#recentBtn').querySelector('svg').outerHTML]);
  if (tb.classList.contains('fold-sel') && !state.picking) items.push(['select', 'Select several', $('#selectBtn').querySelector('svg').outerHTML]);
  if (tb.classList.contains('fold-add') && !$('#addBtn').hidden) items.push(['add', 'Add a publication', $('#addBtn').querySelector('svg').outerHTML]);
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu icon-menu';
  m.id = 'moreMenu';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map(([k, label, icon]) => `<button type="button" role="menuitem" data-more="${k}" aria-label="${label}" title="${label}">${icon}</button>`).join('');
  document.body.appendChild(m);
  const r = $('#moreBtn').getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  $('#moreBtn').setAttribute('aria-expanded', 'true');
  m.addEventListener('click', ev => {
    const b = ev.target.closest('[data-more]');
    if (!b) return;
    closeMoreMenu();
    $({ add: '#addBtn', select: '#selectBtn', recent: '#recentBtn' }[b.dataset.more]).click();
  });
});
document.addEventListener('pointerdown', ev => { if ($('#moreMenu') && !ev.target.closest('#moreMenu, #moreBtn')) closeMoreMenu(); }, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#moreMenu')) { ev.stopPropagation(); closeMoreMenu(); } }, true);
document.addEventListener('pointerdown', ev => { if ($('#pdfMenu') && !ev.target.closest('#pdfMenu, [data-open-pdf]')) closePdfMenu(); }, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#pdfMenu')) { ev.stopPropagation(); closePdfMenu(); } }, true);
// Scrolling: at most one redraw a frame, and none while the same rows
// (with their six-row margins) are still the ones in view.
let painted = null, paintQueued = false;
listEl.addEventListener('scroll', () => {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    const v = state.view, top = listEl.scrollTop, vh = listEl.clientHeight || 600;
    // Rows actually on screen, plus two rows either side.
    const s = Math.max(0, rowAt(top) - 2), e = Math.min(v.length, rowAt(top + vh) + 3);
    if (painted && painted.view === v && painted.s <= s && painted.e >= e) return;
    paint();
  });
}, { passive: true });
rowsEl.addEventListener('click', ev => {
  const b = ev.target.closest('[data-open-pdf]');
  if (!b) return;
  ev.stopPropagation();
  ev.preventDefault();
  openPdfFromList(b);
}, true);
listEl.addEventListener('scroll', closePdfMenu, { passive: true });
// Shift-, Cmd- and Ctrl-clicks pick publications; they shouldn't also
// select the text in between (the browser's own shift-click).
rowsEl.addEventListener('mousedown', ev => {
  if (!(ev.shiftKey || ev.metaKey || ev.ctrlKey) || ev.target.closest('a')) return;
  ev.preventDefault();
  const sel = getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
});
rowsEl.addEventListener('click', ev => {
  if (ev.target.closest('a')) return;
  const r = ev.target.closest('[data-i]');
  if (!r) return;
  const modified = ev.metaKey || ev.ctrlKey || ev.shiftKey;
  if (state.picking || modified) {
    if (!state.picking) {
      setPicking(true, state.selKey);
      // Shift-click: everything from the publication already selected.
      const at = state.view.findIndex(x => x.k === state.selKey);
      if (at >= 0) state.anchor = at;
    }
    togglePick(+r.dataset.i, ev.shiftKey);
    return;
  }
  select(+r.dataset.i);
  if (phoneMQ.matches) go('detail');
});
function select(i) {
  const e = state.view[i];
  if (!e) return;
  state.selKey = e.k;
  paint();
  revealSelected();
  renderDetail();
}
function revealSelected() {
  const i = state.view.findIndex(e => e.k === state.selKey);
  if (i < 0) return;
  const h = rowHt(i), top = rowTop(i), st = listEl.scrollTop, vh = listEl.clientHeight;
  if (top < st) listEl.scrollTop = top;
  else if (top + h > st + vh) listEl.scrollTop = top + h - vh;
  paint();
}

/* ------------------------------------------------------------ detail */
// Where it was published, as labelled pieces: each piece of the citation
// (journal, volume, issue, pages, date...) with a small bracket under it
// and what it is, so there's nothing to decode.
// The fields each type's citation line can show, in order (for the +).
const CITE_FIELDS = {
  article: ['journal', 'volume', 'number', 'pages'],
  incollection: ['editor', 'booktitle', 'pages', 'address', 'publisher'],
  book: ['edition', 'editor', 'address', 'publisher'],
  phdthesis: ['school'],
  techreport: ['number', 'institution'],
  misc: ['howpublished', 'publisher', 'note'],
};
const citeFields = t => (CITE_FIELDS[{ inbook: 'incollection', inproceedings: 'incollection', conference: 'incollection', proceedings: 'book', mastersthesis: 'phdthesis' }[t] || t] || CITE_FIELDS.misc).concat(['month', 'year']);
const CITE_LABELS = { number: 'No.', volume: 'Vol.', address: 'Place', month: 'Month', howpublished: 'Published' };
function venueHTML(e) {
  // Close to APA: Journal, 11(1): 91\u2013101 (Jan 1999). Each piece is
  // labelled underneath; the punctuation is plain text between them. With
  // a library that can be changed, a click on a piece edits it, and the +
  // adds one.
  const f = e.f;
  const seg = (n, text, label, cls) => (text ? `<span class="cs${cls ? ' ' + cls : ''}" data-l="${label}"${n ? ` data-f="${n}"` : ''}>${text}</span>` : '');
  const eds = e.e && e.e.length ? e.e.map(fullName).join(', ') : '';
  const edsLabel = e.e && e.e.length > 1 ? 'Editors' : 'Editor';
  const pub = join2(seg('address', f.address && esc(f.address), 'Place'), seg('publisher', f.publisher && esc(f.publisher), 'Publisher'), ': ');
  const pagesLabel = /[\u2013-]/.test(f.pages || '') ? 'Pages' : 'Page';
  const join = (parts, sep) => parts.filter(Boolean).join(sep);
  let s = '';
  switch (e.t) {
    case 'article': {
      s = seg('journal', f.journal && `<i>${esc(f.journal)}</i>`, 'Journal', 'cs-wide');
      let vn = seg('volume', f.volume && `<i>${esc(f.volume)}</i>`, 'Vol.');
      // (The brackets in the number's own box, so a one-digit number sits
      // close to them: "43(4)", not "43( 4 )".)
      if (f.number) vn += f.volume ? seg('number', '(' + esc(f.number) + ')', 'No.') : 'no. ' + seg('number', esc(f.number), 'No.');
      s = join([s, vn], ', ');
      if (f.pages) s += (vn ? ': ' : s ? ', ' : '') + seg('pages', esc(f.pages), pagesLabel);
      break;
    }
    case 'incollection': case 'inbook': case 'inproceedings': case 'conference': {
      const book = seg('booktitle', f.booktitle && `<i>${esc(f.booktitle)}</i>`, e.t === 'inproceedings' || e.t === 'conference' ? 'Proceedings' : 'Book', 'cs-wide');
      s = 'In ' + join([eds && seg('editor', esc(eds), edsLabel) + (e.e.length > 1 ? ' (Eds.)' : ' (Ed.)'), book], ', ');
      if (!eds && !book) s = '';
      if (f.pages) s += (s ? ' ' : '') + '(' + (pagesLabel === 'Pages' ? 'pp. ' : 'p. ') + seg('pages', esc(f.pages), pagesLabel) + ')';
      s = join([s, pub], '. ');
      break;
    }
    case 'book': case 'proceedings':
      s = join([f.edition && '(' + seg('edition', esc(f.edition), 'Edition') + ' ed.)', eds && !e.a && seg('editor', esc(eds), edsLabel) + ' (Eds.)', pub], '. ');
      break;
    case 'phdthesis': case 'mastersthesis':
      s = '[' + join([seg(null, e.t === 'phdthesis' ? 'Doctoral dissertation' : 'Master\u2019s thesis', 'Degree'), seg('school', f.school && esc(f.school), 'School')], ', ') + ']';
      break;
    case 'techreport':
      s = join([f.number && '(Report No. ' + seg('number', esc(f.number), 'Report no.') + ')', seg('institution', f.institution && esc(f.institution), 'Institution')], '. ');
      break;
    default:
      s = join([seg('howpublished', f.howpublished && esc(f.howpublished), 'Published'), seg('publisher', f.publisher && esc(f.publisher), 'Publisher'), seg('note', f.note && esc(f.note), 'Note')], '. ');
  }
  const date = join2(seg('month', f.month && esc(tidyMonth(f.month)), 'Month'), seg('year', f.year && esc(f.year), 'Year'), ' ');
  // The end of the line (the date, or else the last piece, with the full
  // stop and the +) stays together, so none of it goes to a line alone.
  // (The + is drawn by CSS, so copying the line doesn't take it.)
  let tail;
  if (date) { s += s ? ' ' : ''; tail = s.length; s += '(' + date + ')'; }
  else tail = Math.max(0, s.lastIndexOf('<span class="cs'));
  const add = gs && (e.f.doi || citeFields(e.t).some(n => !e.f[n]))
    ? `<button type="button" class="cs-add" data-cite-add aria-label="Add to the citation" title="Add to the citation"></button>` : '';
  return s || add ? s.slice(0, tail) + `<span class="cs-end">${s.slice(tail)}${s ? '.' : ''}${add}</span>` : '';
}
// A month as a three-letter abbreviation (Jan, Feb...), from a name,
// abbreviation or number in any case; anything else (Spring) as it is.
const MONTH_ABBR = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const MONTH_NAMES = 'january february march april may june july august september october november december'.split(' ');
function tidyMonth(v) {
  const t = String(v || '').trim(), low = t.toLowerCase().replace(/[{}.]/g, '');
  if (/^\d{1,2}$/.test(low) && +low >= 1 && +low <= 12) return MONTH_ABBR[+low - 1];
  const i = low.length >= 3 ? MONTH_NAMES.findIndex(m => m.startsWith(low)) : -1;
  return i >= 0 ? MONTH_ABBR[i] : t;
}
const join2 = (a, b, sep) => (a && b ? a + sep + b : a || b);
// Editing a piece of the citation in place: the field as it is in the .bib
// (so 91--101, not 91\u2013101). Return or leaving the box saves; Esc cancels.
// The title, changed in place: a box as big as it, in its type; Return
// or a click elsewhere saves it (with Undo), Esc leaves it as it was.
function editTitle(h1) {
  const e = BYKEY.get(state.selKey);
  if (!e || h1.classList.contains('editing')) return;
  const old = rawOf(e, 'title').trim();
  const box = document.createElement('textarea');
  box.className = 'd-title-input';
  box.rows = 1;
  box.value = old;
  box.setAttribute('aria-label', 'Title');
  box.spellcheck = true;
  const fit = () => { box.style.height = 'auto'; box.style.height = box.scrollHeight + 'px'; };
  h1.classList.add('editing');
  h1.replaceChildren(box);
  fit();
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
  let done = false;
  const finish = save => {
    if (done) return;
    done = true;
    const v = box.value.replace(/\s*\n\s*/g, ' ').trim();
    if (!save || v === old) { renderDetail(); return; }
    if (!v) { toast('A publication needs a title, so it wasn\u2019t changed.', 3500); renderDetail(); return; }
    if (!balanced(v)) { toast('That has unbalanced braces { }, so it wasn\u2019t saved.', 4000); renderDetail(); return; }
    h1.classList.remove('editing');
    h1.textContent = shownValue(v);
    quickSet(e, { title: v }, 'Changed the title');
  };
  box.addEventListener('input', fit);
  box.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
  });
  box.addEventListener('blur', () => finish(true));
}
function editCite(span) {
  const e = BYKEY.get(state.selKey), n = span.dataset.f;
  if (!e || !n) return;
  const old = rawOf(e, n).trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cs-input';
  input.value = old;
  input.setAttribute('aria-label', FIELD_LABELS[n] || n);
  input.autocomplete = 'off';
  const fit = () => { input.style.width = Math.max(3, Math.min(60, input.value.length + 1)) + 'ch'; };
  span.classList.add('editing');
  span.replaceChildren(input);
  fit();
  input.focus();
  input.select();
  let done = false;
  const finish = save => {
    if (done) return;
    done = true;
    const v = n === 'month' ? tidyMonth(input.value) : input.value.trim();
    if (!save || v === old) { renderDetail(); return; }
    if (!balanced(v)) { toast('That has unbalanced braces { }, so it wasn\u2019t saved.', 4000); renderDetail(); return; }
    span.classList.remove('editing');
    span.textContent = shownValue(v);
    quickSet(e, { [n]: v });
  };
  input.addEventListener('input', fit);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}
// The +: the citation fields this type has room for that are empty.
function closeCiteMenu() { const m = $('#citeMenu'); if (m) m.remove(); }
function openCiteMenu(btn) {
  if ($('#citeMenu')) { closeCiteMenu(); return; }
  const e = BYKEY.get(state.selKey);
  if (!e) return;
  const m = document.createElement('div');
  m.className = 'menu-list pdf-menu';
  m.id = 'citeMenu';
  m.setAttribute('role', 'menu');
  m.innerHTML = (e.f.doi ? `<button type="button" role="menuitem" data-cite-doi>Fill in from the DOI</button>` : '') + citeFields(e.t).filter(n => !e.f[n]).map(n => `<button type="button" role="menuitem" data-cite-new="${n}">${esc(FIELD_LABELS[n] || CITE_LABELS[n] || n)}</button>`).join('');
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + 'px';
  m.style.top = (r.bottom + m.offsetHeight + 12 > window.innerHeight ? Math.max(8, r.top - m.offsetHeight - 6) : r.bottom + 6) + 'px';
  m.addEventListener('click', ev => {
    if (ev.target.closest('[data-cite-doi]')) { closeCiteMenu(); fillFromDoi(e); return; }
    const b = ev.target.closest('[data-cite-new]');
    if (!b) return;
    closeCiteMenu();
    const n = b.dataset.citeNew;
    const span = document.createElement('span');
    span.className = 'cs cs-new';
    span.dataset.f = n;
    span.dataset.l = CITE_LABELS[n] || FIELD_LABELS[n] || n;
    btn.before(span, ' ');
    editCite(span);
  });
}
document.addEventListener('pointerdown', ev => { if ($('#citeMenu') && !ev.target.closest('#citeMenu, [data-cite-add]')) closeCiteMenu(); }, true);
// Fill in from the DOI: whatever Crossref has that this publication is
// missing. It never changes a field that already has something in it.
async function fillFromDoi(e) {
  toast('Looking up the DOI\u2026', 0);
  let r;
  try { r = await callServer('lookupDoi', e.f.doi); } catch (err) { toast(errText(err), 5000); return; }
  const now = BYKEY.get(e.k) || e, set = {};
  Object.keys(r.fields).forEach(n => {
    if (n === 'doi' || n === 'title' || n === 'author' || rawOf(now, n).trim()) return;
    if (balanced(r.fields[n])) set[n] = r.fields[n];
  });
  const names = Object.keys(set);
  if (!names.length) { toast('Nothing to fill in: ' + (r.source || 'Crossref') + ' has nothing this entry is missing.', 3500); return; }
  const list = names.map(n => { const l = FIELD_LABELS[n] || n; return l === l.toUpperCase() ? l : l.toLowerCase(); });
  const said = list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0];
  quickSet(now, set, 'Filled in the ' + said + ' from the DOI');
}
// Possible duplicates: show the other one (in the duplicates list, if it
// isn't in the current one).
function showTwin(key) {
  if (!state.view.some(x => x.k === key)) {
    state.group = 'dups'; store.set('group', 'dups');
    if (TABS.indexOf('dups') < 0) { TABS.push('dups'); store.set('tabs', TABS); }
    state.q = ''; $('#q').value = '';
    renderGroups();
    refresh(true);
  }
  state.selKey = key;
  paint(); renderDetail(); revealSelected();
}
// Notes, written in place: \u2318/Ctrl-Return or leaving the box keeps
// them; Esc doesn't.
function editNotes(box) {
  const e = BYKEY.get(state.selKey);
  if (!e) return;
  const old = rawOf(e, 'annote').trim();
  const ta = document.createElement('textarea');
  ta.className = 'notes-edit';
  ta.value = old;
  ta.setAttribute('aria-label', 'Notes');
  const hint = document.createElement('div');
  hint.className = 'notes-hint';
  hint.textContent = (/Mac|iP/.test(navigator.platform) ? '\u2318' : 'Ctrl-') + 'Return or click away to save \u00b7 Esc to cancel';
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight + 2, 96) + 'px'; };
  box.replaceWith(ta);
  ta.after(hint);
  grow();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  let done = false;
  const finish = save => {
    if (done) return;
    done = true;
    const v = ta.value.trim();
    if (!save || v === old) { renderDetail(); return; }
    if (!balanced(v)) { toast('Those notes have unbalanced braces { }, so they weren\u2019t saved.', 4000); renderDetail(); return; }
    quickSet(e, { annote: v }, v ? 'Saved your notes' : 'Removed your notes');
  };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
  });
  ta.addEventListener('blur', () => finish(true));
}
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#citeMenu')) { ev.stopPropagation(); closeCiteMenu(); } }, true);
/* ---- recently viewed */
// A publication counts as viewed once its details have been showing for
// 3 seconds after you chose it (not one shown on its own, like the first
// in the list), or when you open its PDF. Papers closed in the reader are
// kept too, to reopen. Both are kept on this device and with your account.
// (Kept small: up to 100 on a computer, 50 on an iPhone or iPad; as many
// shown as you choose, by clicking the count in the sidebar, on this
// device.)
const RECENT_KEEP = matchMedia('(pointer: coarse)').matches ? 50 : 100;
const recentShow = () => Math.max(1, Math.min(RECENT_KEEP, +store.get('recentShow', RECENT_KEEP) || RECENT_KEEP));
const RECENT = { seen: store.get('recentSeen', []).slice(0, RECENT_KEEP), closed: store.get('recentClosed', []), watch: null, timer: 0, saveT: 0, input: 0 };
['pointerdown', 'keydown'].forEach(t => window.addEventListener(t, () => { RECENT.input = Date.now(); }, true));
function recentSave() {
  store.set('recentSeen', RECENT.seen);
  store.set('recentClosed', RECENT.closed);
  clearTimeout(RECENT.saveT);
  RECENT.saveT = setTimeout(() => {
    if (!gs || !window.google || !google.script || !google.script.run) return;
    if (SYNC.recent) google.script.run.withFailureHandler(() => {}).savePrefs({ recentSeen: RECENT.seen.slice(0, 100), recentClosed: RECENT.closed.slice(0, 20) });
  }, 4000);
}
const nowSec = () => Math.round(Date.now() / 1000);
function noteSeen(k) {
  RECENT.seen = [[k, nowSec()], ...RECENT.seen.filter(x => x[0] !== k)].slice(0, RECENT_KEEP);
  recentSave();
  if (ENTRIES.length) renderGroups();
}
function noteClosed(k, fileId) {
  if (!k || !fileId) return;
  RECENT.closed = [[k, fileId, nowSec()], ...RECENT.closed.filter(x => x[1] !== fileId)].slice(0, 30);
  recentSave();
}
// Lists from your account join this device's: the latest of each wins.
function recentMerge(prefs) {
  if (!SYNC.recent) return;
  const join = (a, b, key, when) => {
    const m = new Map();
    [...(a || []), ...(b || [])].forEach(x => { const k = key(x); if (!m.has(k) || when(m.get(k)) < when(x)) m.set(k, x); });
    return [...m.values()].sort((x, y) => when(y) - when(x));
  };
  RECENT.seen = join(RECENT.seen, prefs.recentSeen, x => x[0], x => x[1]).slice(0, RECENT_KEEP);
  RECENT.closed = join(RECENT.closed, prefs.recentClosed, x => x[1], x => x[2]).slice(0, 30);
  store.set('recentSeen', RECENT.seen);
  store.set('recentClosed', RECENT.closed);
}
function watchSeen(k) {
  if (k === RECENT.watch) return;
  RECENT.watch = k;
  clearTimeout(RECENT.timer);
  // Only a publication you chose (just after a click, tap or key).
  if (!k || Date.now() - RECENT.input > 1500) return;
  RECENT.timer = setTimeout(() => {
    if (state.selKey !== k || !$('#viewer').hidden || document.hidden) return;
    if (phoneMQ.matches && app.dataset.view !== 'detail') return;
    noteSeen(k);
  }, 3000);
}
const ago = t => {
  const s = nowSec() - t;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
// Wide enough for the details' two columns. (Drawn again when the pane
// grows or shrinks past it, unless something in it is being edited.)
const detailWide = () => detailEl.clientWidth >= 700;
new ResizeObserver(() => {
  if (!detailEl.querySelector('.d-inner') || detailEl.querySelector('.editing, [contenteditable="true"], textarea, input:focus')) return;
  if (!!detailEl.dataset.wide !== detailWide()) { const top = detailEl.scrollTop; renderDetail(); detailEl.scrollTop = top; }
}).observe(detailEl);
function renderDetail() {
  if (state.picking && state.picked.size && !phoneMQ.matches) { detailEl.innerHTML = selectionHTML(); return; }
  const e = state.selKey && BYKEY.get(state.selKey);
  watchSeen(e && !state.picking ? e.k : null);
  if (phoneMQ.matches) $('#backLabel').textContent = app.dataset.view === 'detail' ? groupName(state.group) : 'Groups';
  if (!e) {
    detailEl.innerHTML = state.view.length ? `<div class="d-empty"><b>No publication selected</b><span>Choose one from the list to see its details and files.</span></div>` : '';
    return;
  }
  const f = e.f;
  // A wide pane has two columns: the abstract comes straight after the
  // citation, then the keywords, with the PDF, the buttons and rating beside it.
  // A narrow one has one, with the buttons and then the abstract.
  // (A book's cover: for a book, or a chapter with no PDF here, its book's.)
  const hasPdf = gs && (e.files || []).some(fl => fl.id);
  const cover = e.t === 'book' || !hasPdf ? coverFor(e) : null;
  // (With no picture for the side, it has Edit and the buttons, named, in a column.)
  const wide = detailWide(), stack = wide && !(hasPdf || cover);
  let h = '';
  h += `<div class="d-kicker"><span class="d-type">${esc(TYPE_NAMES[e.t] || e.t)}</span>` +
    `<button class="citekey" data-copy="key" title="Copy cite key"><span class="ck">${esc(e.k)}</span>${ICON.copy}</button>` +
    (gs && !e.ib ? `<button type="button" class="citekey-edit" data-rename title="Change the cite key" aria-label="Change the cite key">${ICON.pencil}</button>` : '') +
    (e.ib ? `<span class="pill">Inbox</span>` : '') +
    (e.offline ? `<span class="pill pend" title="Changed while offline: it goes to Google Drive when you\u2019re back online">On this device</span>` : '') +
    (gs && !wide ? `<button type="button" class="btn d-edit" data-edit>${ICON.pencil}<span>Edit</span></button>` : '') + `</div>`;
  // (Click it to change it: see editTitle.)
  h += `<h1 class="d-title"${gs ? ' data-title-edit title="Click to edit the title"' : ''}>${esc(f.title || '(untitled)')}</h1>`;
  const people = e.a && e.a.length ? e.a : e.e || [];
  if (people.length) {
    h += `<div class="d-authors">` + people.map((n, j) =>
      // (Each name with its comma, so the comma isn't spaced off from it.)
      `<span class="d-au"><button data-author="${esc(nameKey(n))}" title="Find publications by ${esc(nameKey(n))}">${esc(fullName(n))}</button>${j < people.length - 1 ? ',' : ''}</span>`).join(' ') +
      (!e.a && e.e ? ' <span class="d-venue">(Eds.)</span>' : '') + `</div>`;
  }
  const v = venueHTML(e);
  if (v) h += `<div class="d-venue d-cite">${v}</div>`;
  const rl = readingHTML(e);

  const btns = [];
  // PDFs: with one, Read PDF, Share and Drive buttons; with several, each
  // of them is a menu listing the files.
  const files = e.files || [];
  const readable = gs ? files.map((fl, j) => [fl, j]).filter(([fl]) => fl.id) : [];
  const fname = fl => esc(fl.n.replace(/\.pdf$/i, ''));
  const items = j => shareItems(k => `data-share="${j}" data-how="${k}"`);
  const menu = (cls, summary, title, items) => `<details class="menu ${cls}"><summary class="btn${cls.indexOf('act-read') >= 0 ? ' primary' : ''}" title="${title}">${summary}${ICON.chev}</summary>` +
    `<div class="menu-list" role="menu">${items}</div></details>`;
  if (readable.length === 1) {
    const [fl, j] = readable[0];
    btns.push(`<button type="button" class="btn primary act-read" data-read="${j}" title="${esc(fl.p)}">${ICON.read}<span>View</span></button>`);
    btns.push(menu('', `${ICON.share}<span class="share-word">Share</span>`, 'Share a copy to another app',
      items(j)));
  } else if (readable.length > 1) {
    btns.push(menu('act-read', `${ICON.read}<span>View</span>`, 'Choose a PDF to view',
      readable.map(([fl, j]) => `<button type="button" role="menuitem" data-read="${j}" title="${esc(fl.p)}"><span class="fname">${fname(fl)}</span></button>`).join('')));
    btns.push(menu('', `${ICON.share}<span class="share-word">Share</span>`, 'Share a copy to another app',
      readable.map(([fl, j]) => `<div class="menu-head">${fname(fl)}</div>` +
        items(j)).join('')));
  }
  // Less used: Google Drive, Attach, the DOI and other links, in a "More"
  // menu at the end.
  const more = [];
  if (readable.length) {
    files.forEach(fl => more.push(`<a role="menuitem" href="${esc(driveUrl(fl))}" target="_blank" rel="noopener" title="${esc(fl.p)}">${ICON.drive}<span>${files.length === 1 ? 'Open in Google Drive' : (fl.id ? '' : 'Find: ') + fname(fl)}</span></a>`));
  } else {
    // Not openable here (not found in Drive, or the page isn't running in
    // a server): links to Google Drive.
    files.forEach((fl, j) => {
      const num = files.length > 1 ? ' ' + (j + 1) : '';
      btns.push(`<a class="btn${j === 0 ? ' primary act-read' : ''}" href="${esc(driveUrl(fl))}" target="_blank" rel="noopener" title="${esc(fl.p)}">${ICON.doc}<span>${fl.id ? 'Open PDF' : 'Find in Drive'}${num}</span></a>`);
    });
  }
  if (gs && !e.ib) {
    // (With no PDF yet, attaching one is the main thing to do: a button.)
    if (e.files) more.push(`<button type="button" role="menuitem" data-attach title="Attach a PDF (or drop one here)">${ICON.clip}<span>Attach a PDF\u2026</span></button>`);
    else btns.push(`<button type="button" class="btn primary act-read" data-attach title="Attach a PDF (or drop one here)">${ICON.clip}<span>Attach</span></button>`);
  }
  // Find a PDF (see findpdf.js): with none yet, a button beside Attach;
  // with one, in More (a better copy, say).
  const finds = findPdfItems(e);
  if (finds && !readable.length && !(e.files && e.files.some(fl => fl.id))) btns.push(menu('act-find', `${FIND_ICON}<span>Find PDF</span>`, 'Its free copy, or the article through your library', finds));
  else if (finds) more.push(`<div class="menu-head">Find a PDF</div>` + finds);
  if (gs) btns.push(`<button type="button" class="btn" data-rl="add"${RL.has(e.k) ? ' hidden' : ''} title="Add to reading list" aria-label="Add to reading list">${ICON.bookmark}<span>Reading list</span></button>`);
  if (f.doi) more.push(`<a role="menuitem" href="https:\/\/doi.org/${esc(f.doi.replace(/^https?:\/\/(dx\.)?doi\.org[/]/i, ''))}" target="_blank" rel="noopener" title="Open the DOI link">${ICON.link}<span>DOI</span></a>`);
  const doiish = u => /doi\.org[/]/i.test(u);
  (e.u || []).filter(u => safeUrl(u) && !(f.doi && doiish(u))).slice(0, 3).forEach(u => {
    let host = u; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch {}
    more.push(`<a role="menuitem" href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}">${ICON.link}<span>${esc(host)}</span></a>`);
  });
  // Copy: straight after View (or whatever opens the paper).
  const view = btns.findIndex(b => b.indexOf('act-read') >= 0);
  btns.splice(view + 1, 0, `<details class="menu"><summary class="btn" title="Copy the citation">${ICON.copy}<span>Copy</span>${ICON.chev}</summary>` +
    `<div class="menu-list" role="menu"><button type="button" role="menuitem" data-copy="bibtex">BibTeX<kbd>${esc(keyHint('copyBib'))}</kbd></button>` +
    `<button type="button" role="menuitem" data-copy="apa">APA (long)<kbd>${esc(keyHint('copyApa'))}</kbd></button>` +
    `<button type="button" role="menuitem" data-copy="apa-short">APA (short)<kbd>${esc(keyHint('copyShort'))}</kbd></button></div></details>`);
  if (gs && !e.ib && LIBS.list.length) more.push(`<button type="button" role="menuitem" data-copy-lib="${esc(e.k)}">${ICON.lib}<span>Copy to another library\u2026</span></button>`);
  if (more.length) btns.push(`<details class="menu act-more"><summary class="btn" title="More: ${more.length > 1 ? 'Google Drive, Attach, links' : 'more'}" aria-label="More">` +
    `<svg class="i dots" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>${wide ? '<span>More</span>' : ''}</summary>` +
    `<div class="menu-list" role="menu">${more.join('')}</div></details>`);
  const acts = `<div class="actions">${btns.join('')}</div>`;
  // Thumbnails: in line in a narrow pane, at the top of the side column in a wide one.
  // A book's first PDF shows its cover; with no PDF, the cover is shown on its own.
  const first = hasPdf ? e.files.findIndex(fl => fl.id) : -1;
  let thumbs = hasPdf ? e.files.map((fl, j) => fl.id
    ? `<button type="button" class="thumb" data-read="${j}" title="Read ${esc(fl.n)}">${j === first && cover ? coverBox(cover) : thumbBox(fl.id)}<span class="thumb-name">${esc(fl.n)}</span></button>`
    : '').join('') : '';
  if (!hasPdf && cover && wide) thumbs = `<div class="thumb cover-only">${coverBox(cover)}</div>`;
  let notices = '';
  const twins = DUPS.get(e.k);
  if (twins) {
    notices += `<div class="dup-note">${ICON.copy}<span>Possibly the same as ` + twins.map(x =>
      `<button type="button" data-twin="${esc(x.k)}">${esc(x.authorsShort || x.k)}${x.f.year ? ' (' + esc(x.f.year) + ')' : ''}${x.ib ? ' in your inbox' : ''}</button>`).join(', ') +
      `. <button type="button" class="dup-no" data-notdup title="Stop showing ${twins.length === 1 ? 'these two' : 'these'} as possible duplicates">Not the same</button></span></div>`;
  }
  const missing = (e.files || []).filter(x => x.x);
  if (missing.length) notices += `<div class="warn">The linked file ${esc(missing[0].p)} wasn\u2019t found in your papers folder on Google Drive.</div>`;

  const meta = [];
  // Rating and Read: set here with a click (a click on the current rating
  // clears it), or just shown when the library can't be changed.
  if (gs) {
    meta.push(`<span class="stars q-stars" role="group" aria-label="Rating">` + [1, 2, 3, 4, 5].map(i =>
      `<button type="button" data-qstar="${i}" aria-label="${i} star${i > 1 ? 's' : ''}" title="${i === e.rating ? 'Clear the rating' : 'Rate ' + i + ' of 5'}">${i <= e.rating ? '\u2605' : '\u2606'}</button>`).join('') + `</span>`);
    meta.push(`<label class="q-read"><input type="checkbox" data-qread${f.read === '1' ? ' checked' : ''}> Read</label>`);
  } else {
    if (e.rating) meta.push(`<span class="stars" title="Rating ${e.rating} of 5">${'\u2605'.repeat(e.rating)}${'\u2606'.repeat(Math.max(0, 5 - e.rating))}</span>`);
    if (f.read === '1') meta.push(`<span class="pill">Read</span>`);
  }
  if (e.added) meta.push(`<span>Added ${esc(e.added.slice(0, 10))}</span>`);
  const metaH = meta.length ? `<div class="d-meta">${meta.join('')}</div>` : '';

  if (e.ib) {
    notices += `<p class="inbox-note">Added in LibLande and waiting in your inbox. To move it into ${esc(DATA.source)}, open ` +
      `LibLande \u203a Inbox \u203a LibLande inbox.bib in BibDesk and drag it into your library. Once it\u2019s there, it leaves the inbox.</p>`;
  }
  const kwAdd = gs ? `<span class="kw-add-wrap"><button type="button" class="chip kw-add" data-kw-add title="Add a keyword">+ Keyword</button></span>` : '';
  let chips = '';
  if (e.kw.length || (e.groups && e.groups.length) || kwAdd) {
    chips = `<div class="chips">` +
      (e.groups || []).map(g => `<button class="chip grp-chip" data-goto="${esc('s:' + g)}">${esc(g)}</button>`).join('') +
      e.kw.map(k => `<button class="chip" data-goto="${esc('k:' + k)}">${esc(k)}</button>`).join('') + kwAdd + `</div>` + kwsDetailRow(e);
  }
  const vers = versionsHTML(e);
  let abs = '', body = '';
  if (f.abstract) abs = `<section class="d-sec"><h3>Abstract</h3><p class="d-abstract">${esc(f.abstract)}</p></section>`;
  // Notes: click to write or change them, right here.
  if (gs) body += `<section class="d-sec d-notes"><h3>Notes</h3><div class="d-abstract notes-body${f.annote ? '' : ' notes-empty'}" data-notes>${f.annote ? esc(f.annote) : 'Add notes\u2026'}</div></section>`;
  else if (f.annote) body += `<section class="d-sec"><h3>Notes</h3><p class="d-abstract">${esc(f.annote)}</p></section>`;

  const skip = new Set(['abstract', 'annote', 'keywords', 'date-added', 'read', 'rating']);
  // (Related: shown as Versions, when it names publications in the library.)
  if (VERSION_OF.has(e.k) || relatedKeys(e).every(k => BYKEY.has(k))) skip.add('related');
  const keys = Object.keys(f).filter(k => !skip.has(k)).sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a), ib = FIELD_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const fields = `<details class="d-sec"${store.get('fieldsOpen', false) ? ' open' : ''} id="fieldsBox"><summary>All fields</summary><table class="fields"><tbody>` +
    keys.map(k => `<tr><th>${esc(k)}</th><td>${safeUrl(f[k]) ? `<a href="${esc(f[k])}" target="_blank" rel="noopener">${esc(f[k])}</a>` : esc(f[k])}</td></tr>`).join('') +
    (e.files || []).map((x, j) => `<tr><th>file ${j + 1}</th><td>${esc(x.p)}</td></tr>`).join('') +
    `</tbody></table></details>`;
  if (wide) {
    h = `<div class="d-two"><div class="d-inner">${h}${notices}${abs}${chips}${body}${vers}${fields}</div>` +
      // (Edit in the top corner, wherever the details are shown.)
      `<aside class="d-side${stack ? ' d-stack' : ''}">${gs ? `<button type="button" class="btn d-edit" data-edit>${ICON.pencil}<span>Edit</span></button>` : ''}` +
      `${thumbs ? `<div class="thumbs t-side" aria-label="PDFs">${thumbs}</div>` : ''}${acts}${rl}${metaH}</aside></div>`;
  } else {
    // (Rating and Read, looked at less than the abstract, after it.)
    h = `<div class="d-inner">${h}${rl}${acts}${thumbs ? `<div class="thumbs t-inline">${thumbs}</div>` : ''}${notices}${abs}${chips}${body}${metaH}${vers}${fields}</div>`;
  }
  detailEl.innerHTML = h;
  detailEl.dataset.wide = wide ? '1' : '';
  detailEl.scrollTop = 0;
  $('#fieldsBox').addEventListener('toggle', ev => store.set('fieldsOpen', ev.target.open));
  loadThumbs();
}

// Book covers, from Open Library: found by ISBN, or else by title (which
// must match) and author, and kept on this device (a miss is tried again
// after a month). Chapters share their book's.
const COVERS = store.get('covers', {}), COVER_WAIT = new Set();
const coverBox = url => `<span class="thumb-img cover"><img src="${esc(url)}" alt="Cover" loading="lazy"></span>`;
const mainTitle = t => norm(t).replace(/[{}\\]/g, '').split(/[:.?!]/)[0].replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
function coverAsk(e) {
  const f = e.f, book = e.t === 'book' || e.t === 'collection' || e.t === 'proceedings';
  const title = book ? f.title : (e.t === 'incollection' || e.t === 'inbook') ? f.booktitle : '';
  if (!title || !mainTitle(title)) return null;
  const who = (book ? (e.a && e.a.length ? e.a : e.e) : e.e) || [];
  const isbn = (f.isbn || '').split(/[,;\s]+/).map(x => x.replace(/[^0-9Xx]/g, '')).find(x => x.length === 10 || x.length === 13) || '';
  return { key: isbn || mainTitle(title) + '|' + (who[0] ? norm(who[0][0]) : ''), isbn, title: mainTitle(title), who: who[0] ? norm(who[0][0]).split(/\s+/).pop() : '' };
}
const coversOn = () => store.get('coversOn', true);
function coverFor(e) {
  const q = coversOn() && coverAsk(e);
  if (!q) return null;
  const c = COVERS[q.key];
  if (c && (c.id || Date.now() - c.at < 30 * 86400000)) return c.id ? 'https:\/\/covers.openlibrary.org/b/id/' + c.id + '-M.jpg' : null;
  findCover(q);
  return null;
}
// (True once Open Library has answered; false if it couldn't be asked.)
async function findCover(q) {
  if (COVER_WAIT.has(q.key) || !navigator.onLine || (window.LIBLANDE_TEST && !window.LIBLANDE_COVERS_LIVE)) return false;
  COVER_WAIT.add(q.key);
  try {
    const ask = async p => {
      const r = await fetch('https:\/\/openlibrary.org/search.json?' + new URLSearchParams({ ...p, limit: 5, fields: 'title,cover_i' }));
      if (!r.ok) throw new Error('Open Library: ' + r.status);
      return (await r.json()).docs || [];
    };
    const fits = d => d.cover_i && mainTitle(d.title) === q.title;
    let hit = q.isbn ? (await ask({ isbn: q.isbn })).find(d => d.cover_i) : null;
    if (!hit) hit = (await ask(q.who ? { title: q.title, author: q.who } : { title: q.title })).find(fits);
    // (By title alone only for a title long enough not to be another book's.)
    if (!hit && q.who && q.title.split(' ').length >= 3) hit = (await ask({ title: q.title })).find(fits);
    COVERS[q.key] = { id: hit ? hit.cover_i : 0, at: Date.now() };
    store.set('covers', COVERS);
    const e = hit && state.selKey && BYKEY.get(state.selKey), now = e && coverAsk(e);
    if (now && now.key === q.key && !detailEl.querySelector('.editing, [contenteditable="true"], textarea, input:focus')) {
      const top = detailEl.scrollTop; renderDetail(); detailEl.scrollTop = top;
    }
    return true;
  } catch { return false; } finally { COVER_WAIT.delete(q.key); }
}
// Every book's cover (and every edited volume's), looked up in the
// background once the library's open, so it's there when the book is
// opened, offline too. One every second and a half, paused while LibLande
// is out of sight or offline, and a minute's wait if Open Library doesn't
// answer. (Once on each device; then only new books, and misses a month on.)
let coverSweep = false;
function sweepCovers() {
  if (coverSweep || !coversOn() || (window.LIBLANDE_TEST && !window.LIBLANDE_COVERS_LIVE)) return;
  const seen = new Set(), todo = [];
  ENTRIES.forEach(e => {
    const q = coverAsk(e);
    if (!q || seen.has(q.key)) return;
    seen.add(q.key);
    const c = COVERS[q.key];
    if (!(c && (c.id || Date.now() - c.at < 30 * 86400000))) todo.push(q);
  });
  if (!todo.length) return;
  coverSweep = true;
  const next = async () => {
    if (!todo.length || !coversOn()) { coverSweep = false; return; }
    if (document.hidden || !navigator.onLine) { setTimeout(next, 30000); return; }
    const q = todo.shift(), c = COVERS[q.key];
    if (c && (c.id || Date.now() - c.at < 30 * 86400000)) { next(); return; }
    if (await findCover(q)) setTimeout(next, 1500);
    else { todo.push(q); setTimeout(next, 60000); }
  };
  setTimeout(next, 15000);
}

// Thumbnails come from Google Drive (getThumbnails)
// and are kept for this visit. A PDF Drive hasn't made one for yet shows
// an icon, and is asked about again a minute later.
const THUMBS = new Map(), THUMB_WAIT = new Set();
function thumbBox(id) {
  const url = THUMBS.get(id);
  if (!THUMBS.has(id)) return `<span class="thumb-img loading" data-thumb="${esc(id)}"></span>`;
  return `<span class="thumb-img" data-thumb="${esc(id)}">${url ? `<img src="${esc(url)}" alt="">` : ICON.doc}</span>`;
}
function loadThumbs() {
  const ids = [...new Set([...detailEl.querySelectorAll('[data-thumb]')].map(el => el.dataset.thumb))]
    .filter(id => !THUMBS.has(id) && !THUMB_WAIT.has(id));
  if (!ids.length) return;
  ids.forEach(id => THUMB_WAIT.add(id));
  callServer('getThumbnails', ids).catch(() => ({})).then(map => {
    ids.forEach(id => {
      THUMB_WAIT.delete(id);
      const url = (map && map[id]) || null;
      THUMBS.set(id, url);
      if (!url) setTimeout(() => { if (THUMBS.get(id) === null) THUMBS.delete(id); }, 60 * 1000);
      detailEl.querySelectorAll(`[data-thumb="${CSS.escape(id)}"]`).forEach(el => { el.outerHTML = thumbBox(id); });
    });
  });
}

// A short "Done" card after adding something; tap or wait to dismiss.
function showDone(sub, where) {
  const el = $('#donePop');
  el.querySelector('.done-sub').textContent = sub || '';
  el.querySelector('.done-where').textContent = where || '';
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 1900);
}
$('#donePop').addEventListener('click', () => { $('#donePop').hidden = true; });
detailEl.addEventListener('change', ev => {
  const e = BYKEY.get(state.selKey);
  // (Read doesn't take it off the reading list: a paper can be on it to read again. Done marks it read.)
  if (e && ev.target.matches('[data-qread]')) quickSet(e, { read: ev.target.checked ? '1' : '0' });
});
detailEl.addEventListener('input', ev => {
  if (!ev.target.classList.contains('kw-add-input')) return;
  const e = BYKEY.get(state.selKey);
  kwSuggest(ev.target, e ? splitKw(rawOf(e, 'keywords')) : []);
});
detailEl.addEventListener('keydown', ev => {
  const inp = ev.target;
  if (!inp.classList.contains('kw-add-input')) return;
  if (kwSuggKey(ev)) return;
  if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeKwAdd(inp); return; }
  if (ev.key === 'Enter' || ev.key === ',' || ev.key === ';') {
    ev.preventDefault();
    const e = BYKEY.get(state.selKey);
    if (e) addDetailKeyword(e, kwSuggOn(inp) || inp.value, inp);
  }
});
// Leaving the box: what's typed is added; an empty box closes.
detailEl.addEventListener('focusout', ev => {
  const inp = ev.target;
  if (!inp.classList.contains('kw-add-input')) return;
  setTimeout(() => {
    if (!inp.isConnected || inp.disabled || document.activeElement === inp) return;
    const e = BYKEY.get(state.selKey);
    if (e && inp.value.trim()) addDetailKeyword(e, inp.value, inp);
    else closeKwAdd(inp);
  }, 250);
});
detailEl.addEventListener('click', ev => {
  if (ev.target.closest('[data-export]')) { openExport(); return; }
  if (ev.target.closest('[data-join]')) { openJoin(pickedEntries()); return; }
  if (ev.target.closest('[data-bulk]')) { openBulk(); return; }
  if (ev.target.closest('[data-bulk-rl]')) { bulkReading(); return; }
  if (ev.target.closest('[data-copy-lib-sel]')) { openCopyTo(pickedEntries().filter(e => !e.ib).map(e => e.k)); return; }
  const cl = ev.target.closest('[data-copy-lib]');
  if (cl) { const d = cl.closest('details'); if (d) d.open = false; openCopyTo([cl.dataset.copyLib]); return; }
  if (ev.target.closest('[data-pick-clear]')) { state.picked.clear(); paint(); renderPickBar(); renderDetail(); return; }
  const cs = ev.target.closest('[data-copy-sel]');
  if (cs) { cs.closest('details').open = false; copyAs(cs.dataset.copySel); return; }
  const c = ev.target.closest('[data-copy]');
  const e = BYKEY.get(state.selKey);
  if (e && ev.target.closest('[data-edit]')) { openEdit(e); return; }
  const ka = ev.target.closest('[data-kw-add]');
  if (gs && e && ka) { openKwAdd(ka); return; }
  if (e && ev.target.closest('[data-notdup]')) { notDuplicates(e); return; }
  if (gs && e && ev.target.closest('[data-rename]')) { editKey(e); return; }
  const vgo = ev.target.closest('[data-version]');
  if (vgo) { showTwin(vgo.dataset.version); return; }
  const un = ev.target.closest('[data-unjoin]');
  if (gs && un) { unjoin(BYKEY.get(un.dataset.unjoin)); return; }
  const twin = ev.target.closest('[data-twin]');
  if (twin) { showTwin(twin.dataset.twin); return; }
  const notes = ev.target.closest('[data-notes]');
  if (gs && e && notes && getSelection().isCollapsed) { editNotes(notes); return; }
  const tt = ev.target.closest('[data-title-edit]');
  if (gs && e && tt && !ev.target.closest('.d-title-input') && getSelection().isCollapsed) { editTitle(tt); return; }
  if (gs && e && ev.target.closest('[data-cite-add]')) { openCiteMenu(ev.target.closest('[data-cite-add]')); return; }
  const piece = ev.target.closest('.d-cite .cs[data-f]');
  // (Not at the end of selecting some of the line.)
  if (gs && e && piece && !piece.classList.contains('editing') && getSelection().isCollapsed) { editCite(piece); return; }
  const qs = ev.target.closest('[data-qstar]');
  if (e && qs) {
    const n = +qs.dataset.qstar, rating = n === e.rating ? 0 : n;
    quickSet(e, { rating: rating || e.f.rating != null ? String(rating) : '' });
    return;
  }
  if (e && ev.target.closest('[data-attach]')) { $('#attachInput').click(); return; }
  const fp = ev.target.closest('[data-find-pdf]');
  if (e && fp) { const d = fp.closest('details'); if (d) d.open = false; findPdf(e, fp.dataset.findPdf); return; }
  const rl = ev.target.closest('[data-rl]');
  if (e && rl) { readingClick(e, rl.dataset.rl); return; }
  const rd = ev.target.closest('[data-read]'), sh = ev.target.closest('[data-share]');
  if (e && rd) { const m = rd.closest('details'); if (m) m.open = false; openPaper(e, e.files[+rd.dataset.read]); return; }
  if (e && sh) {
    sh.closest('details').open = false;
    const how = sh.dataset.how;
    prepareShare(e.files[+sh.dataset.share], how[1] === '1', how[0] === 'd' ? 'download' : mailOf(e), sh.closest('details').querySelector('summary'));
    return;
  }
  if (c && e) {
    const kind = c.dataset.copy;
    const menu = c.closest('details');
    if (menu) menu.open = false;
    if (kind === 'apa') { const cite = apaCitation(e); copy(cite.text, 'Copied APA citation', cite.html); }
    else if (kind === 'apa-short') { const cite = apaInText(e); copy(cite.text, 'Copied APA in-text citation', cite.html); }
    else copy(kind === 'key' ? e.k : bibtex(e), kind === 'key' ? 'Copied cite key' : 'Copied BibTeX');
    return;
  }
  const a = ev.target.closest('[data-author]');
  if (a) {
    state.scope = 'author'; $('#scope').value = 'author'; store.set('scope', 'author');
    // Surname and first initial, in quotation marks, so it's searched for
    // as it is.
    const q = '"' + a.dataset.author.replace(/"/g, '') + '"';
    $('#q').value = q; state.q = q;
    openSearch(false);
    state.group = 'all'; store.set('group', 'all'); renderGroups();
    if (phoneMQ.matches) go('list');
    refresh(false); revealSelected();
    return;
  }
  const g = ev.target.closest('[data-goto]');
  if (g) {
    const id = g.dataset.goto;
    if (id.startsWith('k:') && !state.kwOpen) { state.kwOpen = true; store.set('kwOpen', true); }
    state.kwFilter = ''; renderGroups();
    const keep = state.selKey;
    setGroup(id);
    if (state.view.some(x => x.k === keep)) { state.selKey = keep; renderDetail(); revealSelected(); }
    document.querySelector('.grp.on')?.scrollIntoView({ block: 'nearest' });
  }
});
// Sentence case for APA titles. A capitalized word is lowered unless it
// looks like a name: braced in the .bib ({Darwin}), an acronym or
// mixed-case word (DNA, fMRI), an adjective like "Bayesian", or a word the
// library itself treats as a name (an author's surname, or a capitalized
// word inside titles already in sentence case). Words the library also
// writes in lowercase ("field", "young") count as ordinary words.
const PROPER_BUILTIN = new Set(('English French German Spanish Italian Latin Greek Chinese Japanese Korean ' +
  'Russian Arabic Hebrew American British European African Asian Canadian Indian Gestalt God Bayes ' +
  'Markov Turing Hebb Euclid Newton Internet Mandarin Christian Jewish Muslim Buddhist Renaissance ' +
  'Victorian Enlightenment').split(' '));
let CASE_SETS = null;
function caseSets() {
  if (CASE_SETS) return CASE_SETS;
  const lower = new Set(), proper = new Set();
  const words = t => t.split(/[\s\u2010-\u2015\/-]+/)
    .map(w => w.replace(/^[^\p{L}]+|[^\p{L}'\u2019]+$/gu, '').replace(/['\u2019]s$/u, ''))
    .filter(Boolean);
  for (const e of ENTRIES) {
    for (const n of [...(e.a || []), ...(e.e || [])]) {
      n[0].split(/\s+/).forEach(w => { if (/^\p{Lu}/u.test(w)) proper.add(w.replace(/[^\p{L}'\u2019-]/gu, '')); });
    }
    for (const t of [e.f.title, e.f.booktitle]) {
      if (!t) continue;
      const ws = words(t);
      ws.forEach(w => { if (/^\p{Ll}/u.test(w)) lower.add(w); });
      // In a title already in sentence case, capitals mid-title are names.
      const mid = ws.slice(1);
      const caps = mid.filter(w => /^\p{Lu}\p{Ll}/u.test(w));
      if (mid.length >= 4 && caps.length / mid.length <= 0.3) {
        t.split(/[:?!\u2014]/).forEach(part => words(part).slice(1).forEach(w => { if (/^\p{Lu}\p{Ll}/u.test(w)) proper.add(w); }));
      }
    }
  }
  CASE_SETS = { lower, proper };
  return CASE_SETS;
}

// `raw` is the title as written in the .bib. Words in their own braces keep
// their capitals; braces around the whole title are ignored, since many
// tools add them to every title.
function sentenceCase(display, raw) {
  if (!display) return display;
  const kept = new Set();
  if (raw) {
    let body = raw.trim();
    const wrapped = t => {
      if (t[0] !== '{' || t[t.length - 1] !== '}') return false;
      let depth = 0;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === '\\') { i++; continue; }
        if (t[i] === '{') depth++;
        else if (t[i] === '}' && --depth === 0 && i < t.length - 1) return false;
      }
      return true;
    };
    while (wrapped(body)) body = body.slice(1, -1).trim();
    let depth = 0, cur = '';
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === '\\') { if (depth > 0) cur += ch + (body[i + 1] || ''); i++; continue; }
      if (ch === '{') { if (depth === 0) cur = ''; depth++; continue; }
      if (ch === '}') {
        if (--depth === 0) {
          cur.split(/\s+/).forEach(w => {
            const clean = w.replace(/\\[A-Za-z]+|[\\{}]/g, '').replace(/^[^\p{L}]+|[^\p{L}'\u2019]+$/gu, '');
            if (clean && /\p{Lu}/u.test(clean)) kept.add(clean);
          });
        }
        continue;
      }
      if (depth > 0) cur += ch;
    }
  }
  const { lower, proper } = caseSets();
  let start = true, afterPeriod = false;
  return display.split(/(\s+|[-\u2010\u2011\u2013])/).map(tok => {
    if (!tok || /^\s+$/.test(tok) || /^[-\u2010\u2011\u2013]$/.test(tok)) return tok;
    let out = tok;
    const m = /^([^\p{L}]*)(\p{L}[\p{L}'\u2019]*)([\s\S]*)$/u.exec(tok);
    if (m) {
      const [, pre, word, post] = m;
      const base = word.replace(/['\u2019]s$/u, '');
      let w = word;
      if (start) w = word[0].toUpperCase() + word.slice(1);
      else if (afterPeriod || !/^\p{Lu}/u.test(word)) w = word;
      else if (kept.has(word) || kept.has(base) || /\p{Lu}/u.test(word.slice(1))) w = word;
      else if (word === 'I' || (word.length === 1 && post[0] === '.') || /\d$/.test(pre)) w = word;
      else if (PROPER_BUILTIN.has(base) || /\p{Ll}(ian|ean)$/u.test(base)) w = word;
      else if (lower.has(base.toLowerCase())) w = word.toLowerCase();
      else if (proper.has(base)) w = word;
      else w = word.toLowerCase();
      out = pre + w + post;
    }
    const last = tok.trim().slice(-1);
    start = /[:?!\u2014]/.test(last);
    afterPeriod = last === '.';
    return out;
  }).join('');
}

// An APA (7th edition) reference for an entry, as plain text and as HTML
// with the italics APA calls for.
// A publication's APA reference is kept until the publication changes
// (prep clears it).
// The Share menu's items (in the details and the reader): Share, to the
// share sheet with its citation, and Download, straight to Downloads; each
// a row whose name does it as is, and whose end, "Clean", without the
// annotations. attr: the item's data, by its key (s0, s1, d0, d1); keys:
// with the shortcuts shown (the reader's; filled in by shareKeyHints).
const SHARE_KEYS = { share: 's0', shareClean: 's1', download: 'd0', downloadClean: 'd1' };
function shareItems(attr, keys) {
  const id = k => Object.keys(SHARE_KEYS).find(x => SHARE_KEYS[x] === k);
  const row = (k, icon, label, clean) => `<div class="mi-row"><button type="button" role="menuitem" class="mi" ${attr(k + '0')}>${icon}<span>${label}</span>` +
    (keys ? `<kbd data-key-hint="${id(k + '0')}"></kbd>` : '') + `</button>` +
    `<button type="button" role="menuitem" class="mi-side" ${attr(k + '1')} title="${clean}" aria-label="${clean}"${keys ? ` data-key-title="${id(k + '1')}"` : ''}>${ICON.eraser}<span>Clean</span></button></div>`;
  return row('s', ICON.share, 'Share\u2026', 'Share a clean copy (no annotations)') + row('d', ICON.download, 'Download', 'Download a clean copy (no annotations)');
}
function apaCitation(e) {
  return e.apaRef || (e.apaRef = apaCitationOf(e));
}
function apaCitationOf(e) {
  const f = e.f, out = [];
  const add = (t, italic) => { if (t) out.push({ t: String(t), i: !!italic }); };
  const end = s => /[.?!]$/.test(s) ? s : s + '.';
  const initials = first => first.split(/\s+/).filter(Boolean).map(w => w.split('-').map(part => {
    const m = /\p{L}/u.exec(part);
    return m ? m[0].toUpperCase() + '.' : '';
  }).filter(Boolean).join('-')).join(' ');
  const inverted = n => n[1] ? n[0] + ', ' + initials(n[1]) : n[0];
  const direct = n => n[1] ? initials(n[1]) + ' ' + n[0] : n[0];
  const authorList = ns => ns.length > 20 ? ns.slice(0, 19).join(', ') + ', . . . ' + ns[ns.length - 1]
    : ns.length === 1 ? ns[0] : ns.slice(0, -1).join(', ') + ', & ' + ns[ns.length - 1];
  const editorList = ns => ns.length <= 2 ? ns.join(' & ') : ns.slice(0, -1).join(', ') + ', & ' + ns[ns.length - 1];
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  const t = e.t, eds = e.e || [], edLabel = eds.length > 1 ? 'Eds.' : 'Ed.';
  const title = sentenceCase((f.title || '').trim(), e.r && e.r.title);
  const booktitle = sentenceCase((f.booktitle || '').trim(), e.r && e.r.booktitle);
  const year = (f.year || '').trim() || 'n.d.';
  const pages = (f.pages || '').trim();
  const doi = f.doi ? 'https:\/\/doi.org/' + f.doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org[/]/i, '').replace(/^doi:\s*/i, '') : '';
  const url = (e.u || []).find(u => safeUrl(u) && !/doi\.org[/]/i.test(u)) || (safeUrl(f.url || '') ? f.url : '');
  const inPart = ['incollection', 'inbook', 'inproceedings', 'conference'].includes(t);
  const standalone = !inPart && t !== 'article';

  let who = '';
  if (e.a && e.a.length) who = end(authorList(e.a.map(inverted)));
  else if (eds.length && (t === 'book' || t === 'proceedings')) who = authorList(eds.map(inverted)) + ' (' + edLabel + ').';

  const addTitle = () => {
    if (!title) return;
    if (!standalone) { add(end(title) + ' '); return; }
    let note = '';
    if (t === 'book' && f.edition) {
      const n = parseInt(f.edition, 10);
      note = ' (' + (n ? ordinal(n) : f.edition.trim()) + ' ed.)';
    } else if (t === 'techreport' && f.number) note = ' (Report No. ' + f.number.trim() + ')';
    else if (t === 'phdthesis') note = ' [Doctoral dissertation' + (f.school ? ', ' + f.school.trim() : '') + ']';
    else if (t === 'mastersthesis') note = ' [Master\u2019s thesis' + (f.school ? ', ' + f.school.trim() : '') + ']';
    else if (t === 'unpublished') note = ' [Unpublished manuscript]';
    add(title, true);
    add((note || !/[.?!]$/.test(title) ? note + '.' : '') + ' ');
  };

  if (who) { add(who + ' '); add('(' + year + '). '); addTitle(); }
  else { addTitle(); add('(' + year + '). '); }

  if (t === 'article') {
    if (f.journal) {
      add(f.journal.trim(), true);
      if (f.volume) { add(', '); add(f.volume.trim(), true); }
      if (f.number) add('(' + f.number.trim() + ')');
      if (pages) add(', ' + pages);
      add('. ');
    }
  } else if (inPart) {
    if (booktitle) {
      add('In ' + (eds.length ? editorList(eds.map(direct)) + ' (' + edLabel + '), ' : ''));
      add(booktitle, true);
      add((pages ? ' (' + (/[\u2013-]/.test(pages) ? 'pp. ' : 'p. ') + pages + ')' : '') + '. ');
    }
    if (f.publisher) add(end(f.publisher.trim()) + ' ');
  } else if (t === 'techreport') {
    if (f.institution) add(end(f.institution.trim()) + ' ');
  } else if (t === 'book' || t === 'proceedings') {
    if (f.publisher) add(end(f.publisher.trim()) + ' ');
  } else if (t !== 'phdthesis' && t !== 'mastersthesis') {
    const src = (f.howpublished || f.publisher || '').trim();
    if (src && !safeUrl(src)) add(end(src) + ' ');
  }

  if (doi) add(doi);
  else if (url && t !== 'article') add(url);

  const text = out.map(s => s.t).join('').replace(/\s+/g, ' ').trim();
  const html = out.map(s => s.i ? '<i>' + esc(s.t) + '</i>' : esc(s.t)).join('').replace(/\s+/g, ' ').trim();
  return { text, html, parts: out };
}

// A reference list as RTF, which Word, Pages, TextEdit and Google Docs open
// with italics and APA's hanging indent. `refs` are apaCitation results.
function rtfText(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (c < 128) out += ch;
    else if (c < 0x10000) out += '\\u' + (c > 32767 ? c - 65536 : c) + '?';
    else {
      const hi = Math.floor((c - 0x10000) / 0x400) + 0xd800, lo = (c - 0x10000) % 0x400 + 0xdc00;
      out += '\\u' + (hi - 65536) + '?\\u' + (lo - 65536) + '?';
    }
  }
  return out;
}
function apaRtf(refs) {
  // Double-spaced, with a 0.5-inch hanging indent, under a bold centred heading.
  const para = r => '{\\pard\\li720\\fi-720\\sl480\\slmult1 ' +
    r.parts.map(p => p.i ? '{\\i ' + rtfText(p.t) + '}' : rtfText(p.t)).join('').replace(/\s+/g, ' ').trim() + '\\par}\n';
  return '{\\rtf1\\ansi\\ansicpg1252\\deff0\n{\\fonttbl{\\f0\\froman Times New Roman;}}\n\\f0\\fs24\n' +
    '{\\pard\\qc\\sl480\\slmult1 {\\b References}\\par}\n' + refs.map(para).join('') + '}\n';
}

// A menu opens where it's seen whole: leftwards at the right edge, upwards
// when there's more room above than below in what holds it (the details
// pane, say), and scrolling within itself if it fits neither way.
function placeMenu(d) {
  const list = d.querySelector('.menu-list');
  if (!list) return;
  d.classList.remove('right', 'up');
  list.style.maxHeight = list.style.overflowY = '';
  let clip = d.parentElement;
  while (clip && clip !== document.body && !/(auto|scroll|hidden|clip)/.test(getComputedStyle(clip).overflowY)) clip = clip.parentElement;
  // (A fixed menu, or one in a strip too short to hold it, goes by the window.)
  let c = clip && clip !== document.body && getComputedStyle(list).position !== 'fixed' ? clip.getBoundingClientRect() : null;
  if (!c || c.height < 200) c = { top: 0, bottom: window.innerHeight, right: window.innerWidth };
  const top = Math.max(c.top, 0) + 8, bottom = Math.min(c.bottom, window.innerHeight) - 8, right = Math.min(c.right, window.innerWidth) - 8;
  if (list.getBoundingClientRect().right > right) d.classList.add('right');
  const scrolls = clip && clip !== document.body && clip.scrollHeight > clip.clientHeight;
  let s = d.getBoundingClientRect();
  // (Its button out of sight, opened from the keyboard say: brought into view.)
  if (scrolls && (s.bottom > bottom || s.top < top)) { clip.scrollTop += s.bottom > bottom ? s.bottom - bottom : s.top - top; s = d.getBoundingClientRect(); }
  let h = list.scrollHeight + 4, below = bottom - s.bottom, above = s.top - top;
  // (Room neither way, in a pane that scrolls: it scrolls to make room below.)
  if (h > below && h > above && scrolls) {
    const by = Math.min(h - below, clip.scrollHeight - clip.clientHeight - clip.scrollTop, Math.max(0, s.top - top));
    if (by > 0) { clip.scrollTop += by; s = d.getBoundingClientRect(); below = bottom - s.bottom; above = s.top - top; }
  }
  if (h > below && above > below) d.classList.add('up');
  const room = d.classList.contains('up') ? above : below;
  if (h > room) { list.style.maxHeight = Math.max(80, room - 4) + 'px'; list.style.overflowY = 'auto'; }
}
document.addEventListener('toggle', ev => {
  const d = ev.target;
  if (d && d.classList && d.classList.contains('menu') && d.open) placeMenu(d);
}, true);
document.addEventListener('click', ev => {
  document.querySelectorAll('details.menu[open]').forEach(d => { if (!d.contains(ev.target)) d.open = false; });
  // (An item chosen: its menu closes, once the item has done its work.)
  const item = ev.target.closest && ev.target.closest('details.menu[open] .menu-list [role^="menuitem"]');
  if (item) { const d = item.closest('details.menu'); setTimeout(() => { d.open = false; }, 0); }
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') document.querySelectorAll('details.menu[open]').forEach(d => { d.open = false; });
});

// An APA (7th edition) parenthetical in-text citation: (Author, Year),
// (A & B, Year), or (A et al., Year). Without authors, editors stand in (as
// in the reference list); without either, the first words of the title do,
// in quotation marks for an article or chapter and in italics otherwise.
function apaInText(e) {
  const year = (e.f.year || '').trim() || 'n.d.';
  const names = e.a && e.a.length ? e.a : (e.e || []);
  if (names.length) {
    const L = names.map(n => n[0]);
    const who = L.length === 1 ? L[0] : L.length === 2 ? L[0] + ' & ' + L[1] : L[0] + ' et al.';
    const text = '(' + who + ', ' + year + ')';
    return { text, html: esc(text) };
  }
  const words = (e.f.title || 'Untitled').trim().split(/\s+/);
  const short = words.slice(0, 4).join(' ').replace(/[:.,;]+$/, '');
  const part = ['article', 'incollection', 'inbook', 'inproceedings', 'conference'].includes(e.t);
  if (part) {
    const text = '(\u201c' + short + ',\u201d ' + year + ')';
    return { text, html: esc(text) };
  }
  return { text: '(' + short + ', ' + year + ')', html: '(<i>' + esc(short) + '</i>, ' + esc(year) + ')' };
}

function bibtex(e, extra) {
  const vals = Object.assign({}, e.f, e.r || {}, extra || {});
  const keys = Object.keys(vals).sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a), ib = FIELD_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return `@${e.t}{${e.k},\n` + keys.map(k => `\t${k} = {${vals[k]}}`).join(',\n') + `}\n`;
}
