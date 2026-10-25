// LibLande: Search by title, in Add a publication: candidates from Crossref, OpenAlex and Open Library, one chosen to fill in the form.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/titlesearch.js'] = '2026-10-25.01';
/* ------------------------------------------------------------ title search */
// A title (with an author or a year, if you like) typed in Add's lookup
// box, instead of a DOI: candidates from Crossref (articles, chapters, and
// books with DOIs), OpenAlex (preprints too, and works without DOIs) and
// Open Library (books), merged, the best matches first, those already in
// the library marked. One chosen fills in the form: through the DOI lookup
// if it has a DOI, as typing the DOI would, or else from what the search
// found. Searched when you pause typing (or press Return); each search
// kept for a while, so going back to one asks no one again. "title:" and
// "author:" say which words are which (as "author: nanay title: imagery"),
// and then only those with that author (and most of those title words)
// are offered.
const TS = { seq: 0, t: 0, q: '', ctl: null, list: [], cache: new Map() };
const TS_MAX = 8, TS_PAUSE = 800;
const TS_CR = 'https:\/\/api.crossref.org/works', TS_OL = 'https:\/\/openlibrary.org/search.json';
// Not a title: a DOI, ISBN, arXiv ID, link or BibTeX entry.
function tsIsQuery(t) {
  t = String(t || '').trim();
  if (t.length < 4 || looksLikeBibtex(t)) return false;
  if (/^(doi:|https?:\/\/|www\.|arxiv:|isbn)/i.test(t) || /\b10\.\d{4,9}\/\S/.test(t)) return false;
  if (/^[\d\s-]{9,17}[\dXx]$/.test(t) || /^\d{4}\.\d{4,5}(v\d+)?$/.test(t) || /^[a-z-]+(\.[A-Z]{2})?\/\d{7}$/i.test(t)) return false;
  const p = tsParse(t);
  return /[a-z\u00c0-\uffff]{3}/i.test(norm(p.free + ' ' + p.title + ' ' + p.author));
}
// What was typed: { free, title, author }, the words after "title:" and
// "author:" (either first, either or both), and the rest.
function tsParse(q) {
  const out = { free: '', title: '', author: '' };
  const parts = String(q || '').split(/\b(title|author)\s*:/i);
  out.free = parts[0];
  for (let i = 1; i < parts.length; i += 2) out[parts[i].toLowerCase()] += ' ' + parts[i + 1];
  Object.keys(out).forEach(k => { out[k] = out[k].replace(/\s+/g, ' ').trim(); });
  return out;
}
const tsWords = s => norm(String(s || '').replace(/<[^>]+>/g, ' ')).split(/[^a-z0-9]+/).filter(w => w.length > 1);
// (Text from these can have HTML's codes and tags, as "&amp;" and <i>.)
const tsDecode = v => {
  let s = String(v == null ? '' : v);
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/i.test(s)) { const t = document.createElement('textarea'); t.innerHTML = s; s = t.value; }
  return s;
};
const tsClean = v => tsDecode(v).replace(/<[^>]+>/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
// A book review, by its title: the book's title in italics ("G. Evans,
// <i>The Varieties of Reference</i>"), "... by Gareth Evans" at the end,
// "Reviewed by", or its number of pages ("418 pp.").
// (Reviews with just the book's title are found in tsMerge.)
const tsReview = t => /<i>.+<\/i>/i.test(tsDecode(t)) && !/^\s*<i>[^<]*<\/i>\s*$/i.test(tsDecode(t)) ||
  /[.,]?\s+(by|By|BY)\s+(\p{Lu}[\p{L}.'-]*\s+){1,3}\p{Lu}[\p{L}'-]+\.?\s*$/u.test(tsClean(t)) || /\b(reviewed by|review of|book review)\b|\d+\s*pp\b/i.test(tsClean(t));
// ("Gareth Evans" as BibTeX has it: Evans, Gareth.)
const tsPerson = n => {
  const w = tsClean(n).split(' ').filter(Boolean);
  if (w.length < 2) return w[0] || '';
  const sfx = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w[w.length - 1]) ? w.pop() : '';
  const last = w.pop();
  return last + ', ' + w.join(' ') + (sfx ? ', ' + sfx : '');
};
const tsFamily = p => String(p || '').split(',')[0].trim();
const TS_KINDS = { article: 'Article', incollection: 'Chapter', book: 'Book', inproceedings: 'Proceedings', phdthesis: 'Thesis', techreport: 'Report', unpublished: 'Preprint', misc: 'Other' };

// Each source: its candidates, as { src, doi, title, people (as BibTeX
// has them), year, venue, type, fields (to fill in without a DOI) }.
async function tsCrossref(q, signal) {
  const p = tsParse(q), words = [p.free, p.title].filter(Boolean).join(' ');
  const types = { 'journal-article': 'article', 'book-chapter': 'incollection', 'book-section': 'incollection', 'book-part': 'incollection',
    'book': 'book', 'monograph': 'book', 'edited-book': 'book', 'reference-book': 'book', 'proceedings-article': 'inproceedings',
    'dissertation': 'phdthesis', 'report': 'techreport', 'posted-content': 'unpublished', 'reference-entry': 'incollection' };
  const r = await npFetch(TS_CR + '?rows=12' + (words ? '&query.bibliographic=' + encodeURIComponent(words) : '') + (p.author ? '&query.author=' + encodeURIComponent(p.author) : '') +
    '&select=DOI,title,subtitle,author,editor,issued,type,container-title,publisher', { signal });
  if (!r.ok) throw new Error('Crossref answered ' + r.status);
  return ((await r.json()).message.items || []).filter(w => types[w.type] && (w.title || [])[0] && w.DOI).map(w => {
    const p = list => (list || []).map(a => a.family ? (a.given ? a.family + ', ' + a.given : a.family) : a.name || '').map(tsClean).filter(Boolean);
    const year = ((w.issued || {})['date-parts'] || [[]])[0][0];
    const authors = p(w.author);
    return { src: 'Crossref', doi: w.DOI, title: tsClean(w.title[0] + ((w.subtitle || [])[0] ? ': ' + w.subtitle[0] : '')), review: types[w.type] === 'article' && tsReview(w.title[0]),
      people: authors.length ? authors : p(w.editor), eds: !authors.length && !!(w.editor || []).length,
      year: year ? String(year) : '', venue: tsClean((w['container-title'] || [])[0] || (types[w.type] === 'book' ? w.publisher : '')), type: types[w.type] };
  });
}
async function tsOpenAlex(q, signal) {
  const types = { article: 'article', 'book-chapter': 'incollection', book: 'book', preprint: 'unpublished', dissertation: 'phdthesis', report: 'techreport', review: 'article', letter: 'article', editorial: 'article' };
  // (Title and author as filters; commas would end them.)
  const p = tsParse(q), flt = [p.title && 'title.search:' + p.title, p.author && 'raw_author_name.search:' + p.author].filter(Boolean).map(f => f.replace(/,/g, ' '));
  const r = await npFetch(NP_OA + '/works?per_page=12' + (p.free ? '&search=' + encodeURIComponent(p.free) : '') + (flt.length ? '&filter=' + encodeURIComponent(flt.join(',')) : '') +
    '&select=id,doi,display_name,publication_year,type,authorships,primary_location,biblio', { signal });
  if (!r.ok) throw new Error('OpenAlex answered ' + r.status);
  return ((await r.json()).results || []).filter(w => w.display_name).map(w => {
    const src = (w.primary_location || {}).source || {};
    let type = types[w.type] || 'misc';
    if (type === 'article' && src.type === 'repository') type = 'unpublished';
    if (type === 'article' && src.type === 'conference') type = 'inproceedings';
    const people = (w.authorships || []).map(a => tsPerson((a.author || {}).display_name)).filter(Boolean);
    const venue = tsClean(src.display_name || ''), b = w.biblio || {};
    const f = { title: tsClean(w.display_name), author: people.join(' and '), year: w.publication_year ? String(w.publication_year) : '',
      url: (w.primary_location || {}).landing_page_url || '' };
    if (type === 'article') Object.assign(f, { journal: venue, volume: b.volume || '', number: b.issue || '', pages: [b.first_page, b.last_page].filter(Boolean).join('--') });
    else if (type === 'incollection' || type === 'inproceedings') f.booktitle = venue;
    else if (type === 'book') f.publisher = (src.host_organization_name || '');
    else if (type === 'unpublished' && venue) f.note = venue;
    return { src: 'OpenAlex', doi: npDoi(w.doi), title: f.title, review: type === 'article' && tsReview(w.display_name), people, year: f.year, venue, type, fields: f };
  });
}
// (Open Library: a work, with its edition that best matches.)
async function tsOpenLibrary(q, signal) {
  const p = tsParse(q), ask = [['q', p.free], ['title', p.title], ['author', p.author]].filter(([, v]) => v).map(([k, v]) => '&' + k + '=' + encodeURIComponent(v)).join('');
  const r = await npFetch(TS_OL + '?limit=8' + ask +
    '&fields=key,title,subtitle,author_name,first_publish_year,editions,editions.publisher,editions.isbn,editions.publish_place,editions.publish_date', { signal });
  if (!r.ok) throw new Error('Open Library answered ' + r.status);
  return ((await r.json()).docs || []).filter(d => d.title).map(d => {
    const ed = ((d.editions || {}).docs || [])[0] || {};
    const people = (d.author_name || []).map(tsPerson).filter(Boolean);
    const isbns = (ed.isbn || []).map(i => String(i).replace(/[^\dXx]/g, ''));
    const edYear = (/\d{4}/.exec((ed.publish_date || [])[0] || '') || [''])[0];
    const f = { title: tsClean(d.title + (d.subtitle ? ': ' + d.subtitle : '')), author: people.join(' and '),
      year: d.first_publish_year ? String(d.first_publish_year) : edYear, publisher: tsClean((ed.publisher || [])[0] || ''),
      address: tsClean((ed.publish_place || [])[0] || ''), isbn: isbns.find(i => i.length === 13) || isbns[0] || '' };
    return { src: 'Open Library', doi: '', title: f.title, people, year: f.year, venue: f.publisher, type: 'book', fields: f };
  });
}
const TS_SOURCES = [['Crossref', tsCrossref], ['OpenAlex', tsOpenAlex], ['Open Library', tsOpenLibrary]];

// Merged: one for each DOI, or else each title by the same first author
// (the one with a DOI kept, or else Open Library's, whose books are
// better than OpenAlex's); scored by how much of what you typed is in its
// title, authors and year, and how much of its title you typed. A book
// review (an article with a book's title, or seen to be one) is marked,
// and put below.
function tsMerge(q, found) {
  const p = tsParse(q), qw = new Set(tsWords([p.free, p.title, p.author].join(' '))), tqw = tsWords(p.title), aqw = tsWords(p.author), out = [], byDoi = new Map(), byTitle = new Map();
  const tkey = c => plainTitle(c.title) + '|' + norm(tsFamily(c.people[0]));
  TS_SOURCES.forEach(([name], si) => (found[name] || []).forEach((c, i) => {
    const d = (c.doi || '').toLowerCase(), k = tkey(c);
    const same = (d && byDoi.get(d)) || byTitle.get(k);
    const pri = x => x.doi ? 2 : x.src === 'Open Library' ? 1 : 0;
    if (same) {
      if (pri(c) > pri(same)) Object.assign(same, c, { rank: same.rank, people: c.people.length ? c.people : same.people, venue: c.venue || same.venue });
      same.rank = Math.min(same.rank, i + si * 0.3);
    } else {
      const x = Object.assign({}, c, { rank: i + si * 0.3 });
      out.push(x);
      if (d) byDoi.set(d, x);
      byTitle.set(k, x);
    }
  }));
  const books = new Set(out.filter(c => c.type === 'book').map(c => plainTitle(c.title)));
  out.forEach(c => {
    if (c.type === 'article' && books.has(plainTitle(c.title))) c.review = true;
    const tw = tsWords(c.title), all = new Set(tw.concat(tsWords(c.people.map(tsFamily).join(' ')), [c.year]));
    const hit = [...qw].filter(w => all.has(w)).length;
    c.score = (qw.size ? 2 * hit / qw.size : 0) + (tw.length ? tw.filter(w => qw.has(w)).length / tw.length : 0) - c.rank * 0.02 - (c.review ? 0.6 : 0);
    // (With "author:", one of its names must be among the authors; with
    // "title:", most of its words in the title.)
    const names = new Set(tsWords(c.people.join(' ')));
    c.off = (aqw.length && !aqw.some(w => names.has(w))) || (tqw.length && tqw.filter(w => tw.includes(w)).length < tqw.length / 2);
    c.have = tsHave(c);
  });
  return out.filter(c => !c.off).sort((a, b) => b.score - a.score).slice(0, TS_MAX);
}
// Already in the library: the same DOI, or the same title (and year, if
// both have one).
function tsHave(c) {
  const d = (c.doi || '').toLowerCase(), t = plainTitle(c.title);
  return ENTRIES.find(e => (d && String(e.f.doi || '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '') === d) ||
    (t && plainTitle(e.f.title) === t && (!c.year || !/^\d{4}$/.test(e.f.year || '') || e.f.year === c.year))) || null;
}

async function tsSearch(q) {
  clearTimeout(TS.t);
  q = String(q || '').trim();
  if (!tsIsQuery(q)) { tsClose(); return; }
  if (q === TS.q && TS.list.length && $('#tsList') && !$('#tsList').hidden) return;
  const seq = ++TS.seq;
  if (TS.ctl) TS.ctl.abort();
  TS.q = q;
  const hit = TS.cache.get(q);
  if (hit && Date.now() - hit.at < 30 * 60000) { TS.list = hit.list; tsRender(false, hit.failed); return; }
  const ctl = TS.ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const found = {}, failed = [];
  TS.list = [];
  tsRender(true);
  // (Each shown as it answers; one that doesn't answer in time is passed
  // over.)
  await Promise.all(TS_SOURCES.map(async ([name, get]) => {
    try {
      found[name] = await Promise.race([get(q, ctl && ctl.signal), new Promise((ok, no) => setTimeout(() => no(new Error('no answer')), 12000))]);
    } catch (err) { if (!(ctl && ctl.signal.aborted)) failed.push(name); }
    if (seq !== TS.seq) return;
    TS.list = tsMerge(q, found);
    tsRender(Object.keys(found).length + failed.length < TS_SOURCES.length, failed);
  }));
  if (seq !== TS.seq) return;
  if (failed.length < TS_SOURCES.length) TS.cache.set(q, { at: Date.now(), list: TS.list, failed });
  if (TS.cache.size > 30) TS.cache.delete(TS.cache.keys().next().value);
}
function tsRender(more, failed) {
  const box = $('#tsList');
  if (!box) return;
  failed = failed || [];
  const names = c => {
    const n = c.people.map(tsFamily);
    const s = n.length > 3 ? n[0] + ' et al.' : n.length > 1 ? n.slice(0, -1).join(', ') + ' & ' + n[n.length - 1] : n[0] || '';
    return s && c.eds ? s + (n.length > 1 ? ' (Eds.)' : ' (Ed.)') : s;
  };
  const note = more ? (TS.list.length ? 'Searching for more\u2026' : 'Searching\u2026')
    : !TS.list.length ? (failed.length === TS_SOURCES.length ? 'The search didn\u2019t work just now (' + (navigator.onLine ? 'no answer from ' + failed.join(', ') : 'you\u2019re offline') + '). Try again, or paste a DOI.'
      : 'Nothing found. Try fewer words, or add an author\u2019s name.')
    : failed.length ? 'Not searched just now: ' + failed.join(', ') + '.' : '';
  box.innerHTML = TS.list.map((c, i) => `<button type="button" class="ts-item" data-ts="${i}">` +
    `<span class="ts-title">${esc(c.title)}</span>` +
    `<span class="ts-meta">${[names(c), c.year, c.venue && c.venue !== c.title ? '<i>' + esc(c.venue) + '</i>' : ''].filter(Boolean).map(s => s.startsWith('<i>') ? s : esc(s)).join(' \u00b7 ')}</span>` +
    `<span class="ts-tags"><span class="ts-kind">${c.review ? 'Book review' : TS_KINDS[c.type] || 'Other'}</span>${c.doi ? '' : '<span class="ts-kind">No DOI</span>'}${c.have ? '<span class="ts-have">In your library</span>' : ''}</span>` +
    `</button>`).join('') + (note ? `<p class="ts-note${more ? ' busy' : ''}">${esc(note)}</p>` : '');
  box.hidden = false;
}
function tsClose() {
  clearTimeout(TS.t);
  TS.seq++;
  if (TS.ctl) { TS.ctl.abort(); TS.ctl = null; }
  TS.q = '';
  TS.list = [];
  const box = $('#tsList');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}
// One chosen: through the DOI lookup if it has a DOI (Crossref's details,
// abstract and all), or else from what the search found.
function tsChoose(c) {
  tsClose();
  if (c.doi) { $('#doiLookup').value = c.doi; lookupIntoForm(); return; }
  sheet.extra = {};
  const sel = $('#addType');
  sel.value = TYPE_CHOICES.some(([v]) => v === c.type) ? c.type : 'misc';
  const f = {};
  Object.keys(c.fields).forEach(n => { if (c.fields[n]) f[n] = c.fields[n]; });
  renderAddFields(f);
  $('#doiLookup').value = '';
  sheetMsg(c.have ? 'Already in your library: \u201c' + (c.have.f.title || c.have.k) + '\u201d. You can still add it.'
    : 'Filled in from ' + c.src + '. Check the details, then add it.', !!c.have);
}

// In the box: searched on a pause in typing (or Return, in fillFromBox);
// Down goes into the list, Up and Down move in it, Esc closes it.
$('#sheetBody').addEventListener('input', ev => {
  if (ev.target.id !== 'doiLookup' || !sheet || sheet.mode !== 'add') return;
  clearTimeout(TS.t);
  const q = ev.target.value;
  if (!tsIsQuery(q)) { tsClose(); return; }
  if (tsWords(q).length < 2) return;
  TS.t = setTimeout(() => tsSearch(q), TS_PAUSE);
});
$('#sheetBody').addEventListener('click', ev => {
  const b = ev.target.closest('#tsList [data-ts]');
  if (b && TS.list[+b.dataset.ts]) tsChoose(TS.list[+b.dataset.ts]);
});
$('#sheetBody').addEventListener('keydown', ev => {
  const box = $('#tsList');
  if (!box || box.hidden) return;
  const items = [...box.querySelectorAll('.ts-item')], at = items.indexOf(document.activeElement);
  if (ev.key === 'Escape' && (at >= 0 || ev.target.id === 'doiLookup')) {
    ev.preventDefault(); ev.stopPropagation();
    tsClose();
    $('#doiLookup').focus();
  } else if (ev.key === 'ArrowDown' && (at >= 0 || ev.target.id === 'doiLookup') && items.length) {
    ev.preventDefault();
    items[Math.min(at + 1, items.length - 1)].focus();
  } else if (ev.key === 'ArrowUp' && at >= 0) {
    ev.preventDefault();
    if (at === 0) $('#doiLookup').focus(); else items[at - 1].focus();
  }
});

/* ------------------------------------------------------------ from a photo */
// A photo of a paper's first page or a book's cover (or its copyright
// page), taken or chosen with the camera button: its words read (with
// Tesseract, as OCR reads scans), and a DOI or ISBN in them looked up; or
// else its title (the biggest words) and the names under it put in the
// box and searched for, to choose from.
const PHOTO = { seq: 0 };
// Big enough for Tesseract to read a page's small print, small enough
// for a phone.
const PHOTO_MAX = 2400;
async function photoCanvas(file) {
  // (The way the camera held it, from the photo's own note of that.)
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const scale = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close && img.close();
  return c;
}
// Tesseract's lines: { text, h (its letters' height), y, conf }.
function photoLines(data) {
  const out = [];
  for (const b of (data && data.blocks) || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const words = (l.words || []).filter(w => w.confidence >= 40 && (w.text || '').trim());
    if (!words.length) continue;
    // (The middle height of its words: one tall capital doesn't make a
    // line big.)
    const hs = words.map(w => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
    out.push({ text: words.map(w => w.text.normalize('NFKC').trim()).join(' '), h: hs[hs.length >> 1], y: l.bbox.y0, y1: l.bbox.y1, conf: l.confidence });
  }
  return out;
}
// A DOI in the photo's words (Tesseract can put spaces about its slash,
// or break it over two lines).
function photoDoi(text) {
  const m = /\b(10\.\d{4,9})\s*\/\s*([^\s"<>]+(?:-\s+[^\s"<>]+)?)/.exec(String(text).replace(/\s*\n\s*/g, ' '));
  return m ? (m[1] + '/' + m[2].replace(/-\s+/, '-')).replace(/[.,;:)\]]+$/, '') : '';
}
// What to search for: the title and the authors' surnames. The title:
// the biggest line (not a heading such as Abstract, a journal's name, a
// link or a date), with the lines next to it nearly as big (a photo's
// letter heights are rough, so a title's lines can differ); stopped at a
// line of names, which are its authors (or else the line under it, if
// that's names).
const PHOTO_HEAD = /^(abstract|introduction|keywords?|categories|contents|references|bibliography|summary|preface|foreword|acknowledg\w*|chapter\s+\w+|part\s+\w+|article|original article|research article|open access|review)$/i;
function photoNames(text) {
  const t = String(text).replace(/[\d*†‡§¹²³⁴⁵⁶⁷⁸⁹|]+/g, ' ').replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, '').trim();
  const names = t.split(/\s*(?:,|;|\band\b|&)\s*/).map(x => x.trim()).filter(Boolean);
  // (The first a whole name; the others capitalized words, as one can be
  // cut short where a letter couldn't be read.)
  return names.length && /^(\p{Lu}[\p{L}.'’-]*\s+){1,3}\p{Lu}[\p{L}'’-]+$/u.test(names[0]) &&
    names.every(n => /^\p{Lu}[\p{L}.'’-]*(\s+\p{Lu}[\p{L}.'’-]*){0,3}$/u.test(n)) ? names : null;
}
function photoQuery(lines) {
  const words = s => (s.match(/\p{L}{2,}/gu) || []);
  // (Not a smudge read as letters: a line has a real word in it.)
  const fit = lines.filter(l => words(l.text).some(w => w.length >= 4) && l.conf >= 45 &&
    !PHOTO_HEAD.test(words(l.text).join(' ')) &&
    !/\b(doi|https?|www\.|vol\.?|issn|isbn|journal|received|accepted|copyright)\b|©/i.test(l.text));
  if (!fit.length) return '';
  const top = Math.max(...fit.map(l => l.h));
  const at = fit.findIndex(l => l.h === top);
  const near = (a, b) => b.y - a.y1 < top * 1.6;
  const big = l => l.h >= top * 0.75 && !photoNames(l.text);
  let first = at, last = at;
  while (first > 0 && big(fit[first - 1]) && near(fit[first - 1], fit[first]) && last - first < 3) first--;
  while (last + 1 < fit.length && big(fit[last + 1]) && near(fit[last], fit[last + 1]) && last - first < 3) last++;
  const title = fit.slice(first, last + 1);
  const t = title.map(l => l.text).join(' ').replace(/-\s+(?=\p{Ll})/gu, '').replace(/[^\p{L}\p{N}'’:,&\s-]/gu, ' ');
  // The authors: a line of names just under the title (or the next one,
  // past a subtitle or affiliation).
  let who = '';
  for (let i = last + 1; i < Math.min(fit.length, last + 3); i++) {
    if (fit[i].y - fit[last].y1 > top * 5 || fit[i].text.length > 160) break;
    const n = photoNames(fit[i].text);
    if (n) { who = n.filter(x => /\s/.test(x)).slice(0, 3).map(x => x.split(/\s+/).pop()).join(' '); break; }
  }
  return (t.replace(/\s+/g, ' ').trim().split(' ').slice(0, 18).join(' ') + (who ? ' ' + who : '')).trim();
}
// The searches to try: the title as photoQuery reads it; the other
// runs of lines in big letters (a heading can be bigger than the title);
// and the photo's opening words, as a reference would have them.
function photoAsks(lines, q) {
  const words = s => (s.match(/\p{L}{2,}/gu) || []);
  const ok = lines.filter(l => l.conf >= 50 && words(l.text).some(w => w.length >= 4));
  const runs = [];
  ok.forEach((l, i) => {
    const last = runs[runs.length - 1], prev = ok[i - 1];
    if (last && prev && Math.abs(l.h - prev.h) <= prev.h * 0.25 && l.y - prev.y1 < prev.h * 1.6 && last.lines.length < 3) last.lines.push(l);
    else runs.push({ lines: [l] });
  });
  const said = r => r.lines.map(l => l.text).join(' ').replace(/[^\p{L}\p{N}'’:,&\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const big = runs.map(r => ({ text: said(r), h: Math.max(...r.lines.map(l => l.h)) }))
    .filter(r => words(r.text).length >= 4 && !PHOTO_HEAD.test(r.text)).sort((a, b) => b.h - a.h).slice(0, 3).map(r => r.text.split(' ').slice(0, 24).join(' '));
  const opening = ok.map(l => l.text).join(' ').replace(/[^\p{L}\p{N}'’:,&\s-]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 40).join(' ');
  return [...new Set([q, ...big, opening].filter(x => x && tsIsQuery(x)))].slice(0, 4);
}
// What the sources find for each, scored by how much of its title is in
// the photo's words (a title wholly there, and its author's name, is
// almost surely the one), best first; only those mostly there.
async function photoFind(asks, text) {
  const seen = new Set(tsWords(text));
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const found = [];
  await Promise.all(asks.flatMap(q => TS_SOURCES.map(async ([, get]) => {
    try { found.push(...await Promise.race([get(q, ctl && ctl.signal), new Promise((ok, no) => setTimeout(() => no(new Error('no answer')), 12000))])); } catch (err) { /* passed over */ }
  })));
  if (ctl) ctl.abort();
  const out = [], byKey = new Map();
  for (const c of found) {
    const tw = tsWords(c.title).filter(w => w.length >= 3);
    if (tw.length < 2) continue;
    const cover = tw.filter(w => seen.has(w)).length / tw.length;
    const named = c.people.slice(0, 3).some(p => tsWords(tsFamily(p)).some(w => w.length >= 3 && seen.has(w)));
    const score = cover + (named ? 0.3 : 0) + Math.min(tw.length, 12) / 60 - (c.review ? 0.6 : 0);
    if (cover < 0.8 || (!named && tw.length < 5)) continue;
    const k = (c.doi || '').toLowerCase() || plainTitle(c.title) + '|' + norm(tsFamily(c.people[0]));
    const same = byKey.get(k);
    // (One for each; Crossref's, with a DOI, kept over the others.)
    if (same) { if (!same.doi && c.doi) Object.assign(same, c, { score: same.score }); continue; }
    const x = Object.assign({}, c, { score });
    byKey.set(k, x);
    out.push(x);
  }
  out.forEach(c => { c.have = tsHave(c); });
  return out.sort((a, b) => b.score - a.score).slice(0, TS_MAX);
}
async function fromPhoto(file) {
  if (!sheet || sheet.mode !== 'add' || !file) return;
  const seq = ++PHOTO.seq, s = sheet;
  const btn = $('#photoGo');
  if (btn) btn.disabled = true;
  tsClose();
  sheetMsg('Scanning text\u2026');
  try {
    const c = await photoCanvas(file);
    const worker = await ocrWorker();
    let data;
    try { ({ data } = await worker.recognize(c, {}, { text: true, blocks: true })); } finally { c.width = c.height = 0; ocrWorkerDone(); }
    if (seq !== PHOTO.seq || sheet !== s) return;
    const lines = photoLines(data), text = lines.map(l => l.text).join('\n');
    // A DOI or ISBN: looked up (and if that doesn't work, the title
    // searched for instead).
    const doi = photoDoi(text), isbn = doi ? '' : isbnIn(text);
    if (doi || isbn) {
      $('#doiLookup').value = doi || 'ISBN ' + isbn;
      if (await lookupIntoForm()) return;
      if (seq !== PHOTO.seq || sheet !== s) return;
    }
    const q = photoQuery(lines);
    const asks = photoAsks(lines, q);
    if (!asks.length) { $('#doiLookup').value = ''; sheetMsg('No title could be read in the photo. Try a closer, sharper photo of the title, or type it.', true); return; }
    // What the photo's words can be searched for, each asked of the
    // sources; the best found is the one whose title is in the photo.
    sheetMsg('Finding matches\u2026');
    const best = await photoFind(asks, text);
    if (seq !== PHOTO.seq || sheet !== s) return;
    if (best.length) {
      const c = best[0], who = tsFamily(c.people[0] || '');
      $('#doiLookup').value = TS.q = c.title + (who ? ' ' + who : '');
      TS.list = best;
      TS.cache.set(TS.q, { at: Date.now(), list: best, failed: [] });
      tsRender(false);
      sheetMsg('Found from the photo. Choose it, or fix the words in the box to search again.');
      return;
    }
    if (!q || !tsIsQuery(q)) { $('#doiLookup').value = ''; sheetMsg('Nothing found for the photo. Try a closer, sharper photo of the title, or type it.', true); return; }
    $('#doiLookup').value = q;
    sheetMsg('Read from the photo. Choose a match, or fix the words in the box.');
    tsSearch(q);
  } catch (err) {
    if (seq === PHOTO.seq && sheet === s) sheetMsg(errText(err), true);
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
}
$('#sheetBody').addEventListener('click', ev => {
  if (ev.target.closest('#photoGo')) { const i = $('#photoIn'); i.value = ''; i.click(); }
});
$('#sheetBody').addEventListener('change', ev => {
  if (ev.target.id === 'photoIn' && ev.target.files[0]) fromPhoto(ev.target.files[0]);
});
