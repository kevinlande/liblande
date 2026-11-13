// LibLande: APA (7th edition): references, in-text citations, sentence case for titles, and APA's order.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, apa, csl, marks, reader, save, contents, bookmarks, pdflib, editing, cite, notes, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
// It's also loaded on its own by the Word add-in (word/index.html), which
// supplies what it uses from the rest: ENTRIES, esc, safeUrl, norm, cmpStr.
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/apa.js'] = '2026-11-13.12';
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
  // (A republished work: when it first came out, at the end.)
  const orig = origYear(e);
  if (orig) add((out.length && !/\s$/.test(out[out.length - 1].t) ? ' ' : '') + '(Original work published ' + orig + ')');

  const text = out.map(s => s.t).join('').replace(/\s+/g, ' ').trim();
  const html = out.map(s => s.i ? '<i>' + esc(s.t) + '</i>' : esc(s.t)).join('').replace(/\s+/g, ' ').trim();
  return { text, html, parts: out };
}

// An APA (7th edition) parenthetical in-text citation: (Author, Year),
// (A & B, Year), or (A et al., Year). Without authors, editors stand in (as
// in the reference list); without either, the first words of the title do,
// in quotation marks for an article or chapter and in italics otherwise.
// A republished work's original year (its origdate), if it isn't the year
// of the one in hand.
function origYear(e) {
  const o = (/\d{4}/.exec(e.f.origdate || '') || [''])[0];
  return o && o !== (/\d{4}/.exec(e.f.year || '') || [''])[0] ? o : '';
}
function apaInText(e) {
  // (Republished: both years, the original first, as 1900/1953.)
  const year = (origYear(e) ? origYear(e) + '/' : '') + ((e.f.year || '').trim() || 'n.d.');
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

// APA order: by first author (or title), then year. Each key is worked out
// once, not in every comparison.
const apaOrder = list => list
  .map(e => [norm((e.a && e.a[0] ? e.a[0][0] + ' ' + e.a[0][1] : e.e && e.e[0] ? e.e[0][0] + ' ' + e.e[0][1] : e.f.title || '') + ' ' + (e.f.year || '')), e])
  .sort((a, b) => cmpStr(a[0], b[0]))
  .map(x => x[1]);

// APA's form for citing several works at once: (A, 2012; B, 2026), in
// reference-list order.
function apaInTextMany(list) {
  const cites = apaOrder(list).map(apaInText);
  return {
    text: '(' + cites.map(c => c.text.slice(1, -1)).join('; ') + ')',
    html: '(' + cites.map(c => c.html.slice(1, -1)).join('; ') + ')',
  };
}
