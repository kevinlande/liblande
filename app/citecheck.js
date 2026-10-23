// LibLande: Cite Check: a manuscript's citations against its references and the library.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/citecheck.js'] = '2026-10-23.06';
/* ------------------------------------------------------------ manuscript check */
// A manuscript's citations checked: a Google Doc, or a Word file from Google
// Drive or this device, read (never changed). Each APA author-date citation
// in the text is matched to the References section and to the library, and
// each reference to a citation. MS.last keeps the last report, to show again.
const MS = { last: null };
const MS_YEAR = String.raw`(?:\d{4}[a-z]?|n\.\s?d\.|in press|forthcoming)`;
const MS_PART = String.raw`(?:van|von|de|der|den|du|da|di|del|della|des|la|le|ten|ter)`;
const MS_NAME = String.raw`(?:${MS_PART}\s+)*\p{Lu}[\p{L}\p{M}'’\-‐-―]*(?:\s+${MS_PART}\s+\p{Lu}[\p{L}\p{M}'’\-‐-―]*)?`;
const MS_YEAR_ONLY = new RegExp('^' + MS_YEAR + '$', 'iu');
const MS_REFS_HEAD = /^\s*(?:[\dIVX]+\.?\s*)?(references|reference list|bibliography|works cited|literature cited)\s*:?\s*$/i;
const MS_AFTER_REFS = /^\s*(?:[\dIVX]+\.?\s*)?(appendix|appendices|footnotes|endnotes|notes|tables?|figures?|figure captions|supplementary materials?)\b[^.]{0,60}$/i;
// Words that can stand before "(2020)" without being an author.
const MS_NOT_NAME = /^(?:In|See|The|This|That|These|Those|Table|Tables|Figure|Fig\.|Section|Chapter|Part|Experiment|Study|Studies|Appendix|Note|Since|Until|Before|After|During|From|Published|Accepted|Received|Revised|Year|Edition|Spring|Summer|Fall|Autumn|Winter|January|February|March|April|May|June|July|August|September|October|November|December)$/;
const MS_LEAD = /^(?:(?:e\.g\.|i\.e\.|cf\.|see also|see|but see|also|and|for (?:a |an )?(?:review|discussion|overview|summary)s?(?: of [^,]+)?,? see|reviewed in|as reviewed in|as in|in)[,:]?\s+)+/i;

// A surname as matched (no accents, case or punctuation), and a year.
const msKey = s => norm(s).replace(/[^a-z]/g, '');
function msYear(y) {
  const t = norm(y).replace(/\s+/g, ' ').trim();
  const yk = /^n\. ?d\.$/.test(t) ? 'nd' : /in press|forthcoming/.test(t) ? 'forth' : t;
  const m = /^(\d{4})([a-z]?)$/.exec(yk);
  return m ? { yk, base: m[1], suf: m[2] } : { yk, base: yk, suf: '' };
}
// "Smith & Lee", "Smith et al.", "Smith, Lee, and Park": the surnames.
function msNames(seg) {
  let s = seg.replace(/['’]s?$/u, '').replace(/\s+/g, ' ').trim().replace(/,$/, '');
  const etal = /\s+et al\.?$/i.test(s);
  if (etal) s = s.replace(/\s+et al\.?$/i, '');
  const names = s.split(/\s*,\s*(?:&|and)?\s*|\s+(?:&|and)\s+/).map(x => x.trim()).filter(Boolean);
  return { names, keys: names.map(msKey), etal };
}

// The manuscript split: the text, and the entries under the last heading
// such as References (to an appendix or the end).
function msSplit(paras) {
  let h = -1;
  paras.forEach((p, i) => { if (MS_REFS_HEAD.test(p)) h = i; });
  if (h < 0) return { body: paras, refs: null };
  let end = paras.length;
  for (let i = h + 1; i < paras.length; i++) if (MS_AFTER_REFS.test(paras[i])) { end = i; break; }
  return { body: paras.slice(0, h).concat(paras.slice(end)), refs: paras.slice(h + 1, end).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 15) };
}

// The APA citations in a text: in parentheses, (Smith, 2020; see also Lee &
// Park, 2019a, p. 4), and in its sentences, Smith and Lee (2020) or Smith
// et al.'s (2021). One for each year cited, with the sentence it's in
// (ctx: before, the citation, after).
function msCites(text) {
  const out = [];
  // (A sentence ends at a new paragraph, or at . ! or ? before a capital,
  // but not after "et al.", "p.", "e.g." and the like.)
  const ABBR = /(?:^|[\s(])(?:al|p|pp|e\.g|i\.e|cf|vs|etc|ed|eds|vol|no|ch|chap|sec|fig|ibid|approx|ca|[A-Z])$/i;
  const ends = i => text[i] === '\n' || (/[.!?]/.test(text[i]) && /^\s+["“‘(]?\p{Lu}/u.test(text.slice(i + 1, i + 6)) && !(text[i] === '.' && ABBR.test(text.slice(Math.max(0, i - 8), i))));
  const ctx = (s, e) => {
    let b = s, a = e;
    const lo = Math.max(0, s - 160), hi = Math.min(text.length, e + 140);
    while (b > lo && !ends(b - 1)) b--;
    while (a < hi && !ends(a) && !(a === text.length - 1)) a++;
    if (a < hi && text[a] !== '\n') a++;
    return { b: (b > lo ? '' : '\u2026') + text.slice(b, s).trimStart(), m: text.slice(s, e), a: text.slice(e, a).trimEnd() + (a < hi ? '' : '\u2026') };
  };
  const yearsRe = new RegExp(String.raw`^(.+?),?\s+(${MS_YEAR}(?:\s*,\s*${MS_YEAR})*)(?=\s*(?:,|$))`, 'iu');
  const onlyYears = new RegExp(String.raw`^\s*${MS_YEAR}(?:\s*[,;]\s*${MS_YEAR})*\s*(?:,.*)?$`, 'iu');
  const tail = new RegExp(String.raw`(${MS_NAME}(?:\s+et al\.?)?|${MS_NAME}\s+(?:and|&)\s+${MS_NAME}|(?:${MS_NAME},\s+)+${MS_NAME},?\s+(?:and|&)\s+${MS_NAME})(?:['’]s?)?\s*$`, 'u');
  const add = (who, year, said, at, where) => out.push(Object.assign({ who: who.replace(/['’]s?$/u, '').trim(), year, said, at, ctx: where }, msNames(who), msYear(year)));
  const paren = /\(([^()]{1,500})\)/g;
  let m;
  while ((m = paren.exec(text))) {
    const inner = m[1], at = m.index;
    if (!/\d{4}|n\.\s?d\.|in press|forthcoming/i.test(inner)) continue;
    if (onlyYears.test(inner)) {
      const from = Math.max(0, at - 160), t = tail.exec(text.slice(from, at));
      if (!t || MS_NOT_NAME.test(t[1])) continue;
      const where = ctx(from + t.index, at + m[0].length);
      inner.split(/[,;]/).map(s => s.trim()).filter(s => MS_YEAR_ONLY.test(s)).forEach(y => add(t[1], y, t[1].trim() + ' (' + inner + ')', at, where));
      continue;
    }
    for (let part of inner.split(';')) {
      part = part.trim().replace(MS_LEAD, '');
      const p = yearsRe.exec(part);
      if (!p) continue;
      const who = p[1].trim().replace(/,$/, '');
      if (!/^(?:\p{Lu}|(?:van|von|de|der|den|du|da|di|del|la|le)\s)/u.test(who) || !/^[\p{L}\p{M}'’\-‐-―.,&\s]+$/u.test(who) || who.length > 150) continue;
      const where = ctx(at, at + m[0].length);
      p[2].split(',').map(s => s.trim()).forEach(y => add(who, y, part.replace(/\s+/g, ' '), at, where));
    }
  }
  return out;
}

// A reference-list entry: its authors' surnames, year, title and DOI.
function msRef(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  const doi = ((/\b10\.\d{4,9}\/[^\s<>"]+/.exec(s) || [''])[0]).replace(/[.,;]+$/, '');
  const m = new RegExp(String.raw`^(.*?)\s*\(\s*(${MS_YEAR})(?:\s*,[^)]*)?\)\s*\.?\s*(.*)$`, 'iu').exec(s);
  if (!m) return Object.assign({ raw: s, names: [], keys: [], title: '', doi, unread: true }, msYear(''));
  const who = m[1].replace(/\s*\((?:Eds?|Trans)\.\)\s*\.?$/i, '').replace(/[,\s]+$/, '');
  const toks = who.split(/\s*,\s*(?:&|and)?\s*|\s+(?:&|and)\s+/).map(x => x.replace(/^[.\s]+/, '').trim()).filter(Boolean);
  const initials = t => /^(?:\p{Lu}(?:\.|$)[\s\-‐]*)+$/u.test(t) || /^(?:Jr|Sr|II|III|IV)\.?$/.test(t);
  const names = toks.some(initials) ? toks.filter(t => !initials(t))
    : toks.length > 1 && toks.length % 2 === 0 ? toks.filter((t, i) => i % 2 === 0) : [who];
  const title = ((/^(.+?[.?!])(?:\s|$)/.exec(m[3]) || [, m[3]])[1] || '').replace(/\.$/, '');
  // (The authors as BibTeX has them, "Smith, J. and Lee, K.", for adding.)
  const authors = [];
  toks.forEach(t => { if (!initials(t)) authors.push(t); else if (authors.length) authors[authors.length - 1] += ', ' + t; });
  return Object.assign({ raw: s, names, keys: names.map(msKey), title, doi, authors: authors.join(' and ') }, msYear(m[2]));
}

// How alike two titles are: the same, one the start of the other, or most
// words shared.
function msTitleLike(a, b) {
  const x = plainTitle(a), y = plainTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (Math.min(x.length, y.length) >= 20 && (x.startsWith(y) || y.startsWith(x))) return 0.9;
  const w = s => new Set(norm(s).split(/[^a-z0-9]+/).filter(t => t.length > 3));
  const A = w(a), B = w(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  A.forEach(t => { if (B.has(t)) n++; });
  return n / Math.max(A.size, B.size);
}
function msLev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

// The library by first author's (or editor's) surname.
function msLibrary() {
  const by = new Map();
  for (const e of ENTRIES) {
    const ns = e.a && e.a.length ? e.a : (e.e || []);
    if (!ns.length) continue;
    const k = msKey(ns[0][0]);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  return by;
}
const msLibYear = e => { const y = String(e.f.year || ''); return FORTH_RE.test(y) ? 'forth' : (/\d{4}/.exec(y) || ['nd'])[0]; };
const msLibKeys = e => (e.a && e.a.length ? e.a : (e.e || [])).map(n => msKey(n[0]));
// The publication in the library a citation or reference is to: by DOI,
// then first author and year (and second author, and title, to choose),
// then first author and title (a year that differs is noted).
function msFind(lib, x) {
  if (x.doi) {
    const d = norm(x.doi);
    const hit = ENTRIES.find(e => e.f.doi && norm(e.f.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, '') === d);
    if (hit) return { e: hit };
  }
  if (!x.keys || !x.keys.length) return null;
  const all = lib.get(x.keys[0]) || [];
  let c = all.filter(e => msLibYear(e) === x.base);
  if (x.keys.length >= 2 && !x.etal) { const two = c.filter(e => msLibKeys(e)[1] === x.keys[1]); if (two.length || x.title) c = two; }
  if (x.title && c.length > 1) {
    const best = c.map(e => [e, msTitleLike(e.f.title, x.title)]).sort((a, b) => b[1] - a[1]);
    if (best[0][1] > 0.5) c = [best[0][0]];
  }
  if (c.length) return { e: c[0], many: c.length > 1 ? c.length : 0 };
  if (x.title) {
    const best = all.map(e => [e, msTitleLike(e.f.title, x.title)]).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 0.75) return { e: best[0], yearDiffers: msLibYear(best[0]) };
  }
  // "In press" in the manuscript, a year in the library: published since
  // (only when one recent publication by the same author, or two, fits).
  if (x.base === 'forth') {
    let p = all.filter(e => /^\d{4}$/.test(msLibYear(e)) && +msLibYear(e) >= THIS_YEAR - 3);
    if (x.keys.length >= 2 && !x.etal) p = p.filter(e => msLibKeys(e)[1] === x.keys[1]);
    if (p.length === 1) return { e: p[0], yearDiffers: msLibYear(p[0]) };
  }
  return null;
}
// A publication now has a year where the manuscript has "in press".
const msPublished = (x, found) => x.base === 'forth' && found && /^\d{4}$/.test(msLibYear(found.e));

// The check itself. paras: the manuscript's paragraphs; notes: its
// footnotes and endnotes (cited from too).
function msCheck(paras, notes) {
  const { body, refs } = msSplit(paras);
  const cites = msCites(body.concat(notes || []).join('\n'));
  const lib = msLibrary();
  const R = (refs || []).map(msRef);
  // The works cited: one for each first author (and second, when two are
  // named), and year.
  const works = new Map();
  for (const c of cites) {
    const id = c.keys[0] + (c.keys.length === 2 && !c.etal ? '+' + c.keys[1] : '') + (c.etal ? '+' : '') + '|' + c.yk;
    if (!works.has(id)) works.set(id, Object.assign({}, c, { id, n: 0, refs: [], ctxs: [] }));
    const w = works.get(id);
    w.n++;
    if (c.ctx) w.ctxs.push(c.ctx);
  }
  const W = [...works.values()];
  const named = (r, i) => r.keys[i] ? r.names[i] : '';
  const flags = [];
  for (const w of W) {
    let c = R.filter(r => r.keys[0] === w.keys[0] && r.base === w.base);
    if (w.keys.length >= 2 && !w.etal) c = c.filter(r => r.keys[1] === w.keys[1]);
    if (w.suf) { const s = c.filter(r => r.suf === w.suf); if (s.length) c = s; }
    w.refs = c;
    w.lib = msFind(lib, c.length === 1 ? Object.assign({}, c[0], { etal: w.etal }) : w);
    // (Its in-text citation and reference both brought up to date.)
    if (msPublished(w, w.lib)) {
      const y = msLibYear(w.lib.e);
      flags.push({ w, pub: w.lib.e, msg: 'published since, in ' + y, short: 'Published since, in ' + y });
      if (c.length === 1) c[0].pubShown = true;
    }
    if (c.length > 1) flags.push({ w, msg: 'matches ' + c.length + ' references (' + c.map(r => r.yk).join(', ') + '): give the year its letter' });
    if (c.length !== 1) continue;
    const r = c[0], n = r.keys.length;
    // (short: the same without the names, for beside the corrected citation.)
    if (w.etal && n < 3) flags.push({ w, msg: '“et al.” is for three or more authors; this work has ' + n + ': ' + (n === 2 ? named(r, 0) + ' & ' + named(r, 1) : named(r, 0)), short: '“et al.” is for three or more authors; this work has ' + n });
    else if (!w.etal && w.keys.length === 1 && n === 2) flags.push({ w, msg: 'two authors: cite both, ' + named(r, 0) + ' & ' + named(r, 1), short: 'Two authors: cite both' });
    else if (!w.etal && w.keys.length === 1 && n >= 3) flags.push({ w, msg: 'three or more authors: ' + named(r, 0) + ' et al. (APA 7)', short: 'Three or more authors: “et al.” (APA 7)' });
    if (!w.suf && r.suf) flags.push({ w, msg: 'the reference is ' + r.yk + ': cite it with the letter' });
  }
  // References: cited or not, in the library or not.
  for (const r of R) {
    r.cited = W.some(w => w.refs.includes(r));
    r.lib = r.unread ? null : msFind(lib, r);
    if (r.lib && msPublished(r, r.lib)) { if (!r.pubShown) flags.push({ r, pub: r.lib.e, msg: 'published since, in ' + msLibYear(r.lib.e) + ': its reference brought up to date' }); }
    else if (r.lib && r.lib.yearDiffers) flags.push({ r, msg: 'your library has ' + r.lib.yearDiffers + ' for “' + (r.lib.e.f.title || r.lib.e.k) + '”' });
  }
  // A citation with no reference: perhaps a misspelling of one.
  const missing = refs ? W.filter(w => !w.refs.length) : [];
  for (const w of missing) {
    const near = R.find(r => r.base === w.base && r.keys[0] && r.keys[0] !== w.keys[0] && msLev(r.keys[0], w.keys[0]) <= 2);
    if (near) w.near = near.names[0];
  }
  // (Each finding's id, to dismiss it by.)
  const rid = r => plainTitle(r.raw).slice(0, 80);
  flags.forEach(f => { f.id = 'f:' + (f.w ? f.w.id : rid(f.r)) + ':' + (f.short || f.msg); });
  R.forEach(r => { r.id = rid(r); });
  return { cites: cites.length, works: W, refs: refs ? R : null, missing, uncited: R.filter(r => !r.cited && !r.unread), unread: R.filter(r => r.unread),
    notInLib: R.filter(r => !r.unread && !r.lib), noLib: refs ? [] : W.filter(w => !w.lib), flags, ok: W.filter(w => w.refs.length === 1 && w.lib) };
}

/* ---------- reading the manuscript */
// A Word file's paragraphs (and its footnotes' and endnotes'), as text;
// deleted tracked changes and field codes (Zotero's, say) left out.
async function msDocx(bytes, name) {
  let zip;
  try { zip = await (await loadJSZip()).loadAsync(bytes); } catch (err) { throw new Error('LibLande couldn’t open ' + name + ' as a Word file (.docx).'); }
  const W = 'http:\/\/schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paras = async path => {
    const f = zip.file(path);
    if (!f) return [];
    const d = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
    return [...d.getElementsByTagNameNS(W, 'p')].map(p => {
      let s = '';
      const walk = n => {
        for (const c of n.childNodes) {
          if (c.nodeType !== 1) continue;
          const l = c.localName;
          if (l === 't') s += c.textContent;
          else if (l === 'tab') s += '\t';
          else if (l === 'br' || l === 'cr') s += '\n';
          else if (l === 'del' || l === 'delText' || l === 'instrText' || l === 'p') continue;
          else walk(c);
        }
      };
      walk(p);
      return s;
    });
  };
  const body = await paras('word/document.xml');
  if (!zip.file('word/document.xml')) throw new Error(name + ' isn’t a Word document.');
  return { name, paras: body, notes: (await paras('word/footnotes.xml')).concat(await paras('word/endnotes.xml')) };
}
async function msFromFile(file) {
  if (/\.docx$/i.test(file.name)) return msDocx(new Uint8Array(await file.arrayBuffer()), file.name);
  if (/\.(txt|md|text)$/i.test(file.name)) return { name: file.name, paras: (await file.text()).split(/\r?\n/) };
  if (/\.doc$/i.test(file.name)) throw new Error('An older Word file (.doc) can’t be read from this device. Save it as .docx (in Word: File › Save As), or put it in Google Drive and paste its link.');
  throw new Error('Choose a Word file (.docx), or paste the link to a Google Doc.');
}
// A file's id from its Google Docs or Drive link (or the id itself).
function msDriveId(link) {
  const s = String(link || '').trim();
  const m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{20,})/.exec(s) || /^([A-Za-z0-9_-]{25,})$/.exec(s);
  return m ? m[1] : null;
}
async function msFromDrive(link) {
  const id = msDriveId(link);
  if (!id) throw new Error('That doesn’t look like a link to a Google Doc or a file in Google Drive.');
  const api = MS_API + encodeURIComponent(id);
  const m = await (await msGet(api + '?fields=name,mimeType&supportsAllDrives=true')).json();
  const text = async fid => (await (await msGet(MS_API + encodeURIComponent(fid) + '/export?mimeType=text%2Fplain')).text()).split(/\r?\n/);
  const out = d => Object.assign(d, { id, kind: m.mimeType === 'application/vnd.google-apps.document' ? 'gdoc' : 'word' });
  if (m.mimeType === 'application/vnd.google-apps.document') return out({ name: m.name, paras: await text(id) });
  if (/wordprocessingml/.test(m.mimeType) || /\.docx$/i.test(m.name)) {
    return out(await msDocx(new Uint8Array(await (await msGet(api + '?alt=media&supportsAllDrives=true')).arrayBuffer()), m.name));
  }
  if (/^text\//.test(m.mimeType)) return out({ name: m.name, paras: (await (await msGet(api + '?alt=media')).text()).split(/\r?\n/) });
  if (/msword|rtf|opendocument\.text/.test(m.mimeType) || /\.(doc|rtf|odt)$/i.test(m.name)) {
    // An older Word file: Google converts a copy to a Google Doc, which is
    // read, then deleted.
    const copy = await (await msGet(api + '/copy?fields=id&supportsAllDrives=true', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: m.name + ' (LibLande’s temporary copy)', mimeType: 'application/vnd.google-apps.document' }) })).json();
    try { return out({ name: m.name, paras: await text(copy.id) }); } finally { msGet(MS_API + encodeURIComponent(copy.id), { method: 'DELETE' }).catch(() => {}); }
  }
  throw new Error('LibLande reads Google Docs and Word files; ' + m.name + ' is neither.');
}
const MS_API = 'https:\/\/www.googleapis.com/drive/v3/files/';
async function msGet(url, opts = {}) {
  const go = async token => fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {}) }));
  let r = await go(await driveToken());
  if (r.status === 401) r = await go(await driveToken(true));
  if (r.status === 404) throw new Error('Google Drive can’t find that file (or it isn’t shared with your account).');
  if (!r.ok) throw new Error('Google Drive didn’t send the file (error ' + r.status + ').');
  return r;
}
// Your Google Docs and Word files in Drive, the ones you edited last first
// (or those whose names have q in them).
async function msDriveList(q) {
  const types = ['application/vnd.google-apps.document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
  let query = '(' + types.map(t => "mimeType = '" + t + "'").join(' or ') + ') and trashed = false';
  if (q) query += " and name contains '" + q.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const r = await msGet(MS_API.slice(0, -1) + '?q=' + encodeURIComponent(query) + '&orderBy=' + encodeURIComponent(q ? 'modifiedTime desc' : 'modifiedByMeTime desc') +
    '&pageSize=12&fields=' + encodeURIComponent('files(id,name,mimeType,modifiedTime)'));
  return ((await r.json()).files || []).map(f => ({ id: f.id, name: f.name, kind: f.mimeType === 'application/vnd.google-apps.document' ? 'gdoc' : 'word', at: Date.parse(f.modifiedTime) }));
}
const msOpenUrl = x => x.kind === 'gdoc' ? 'https:\/\/docs.google.com/document/d/' + encodeURIComponent(x.id) + '/edit' : 'https:\/\/drive.google.com/file/d/' + encodeURIComponent(x.id) + '/view';

/* ---------- remembered: recent manuscripts, dismissed findings */
// The manuscripts checked lately, newest first ({id, name, kind, at, todo};
// id is null for a file from the device), and the findings dismissed in
// each ({manuscript: {at, ids}}). Kept with your preferences, so your
// other devices have them too.
MS.recent = store.get('msRecent', []);
MS.hidden = store.get('msHidden', {});
const msDoc = x => x.id || 'file:' + x.name;
function msSave() {
  store.set('msRecent', MS.recent);
  store.set('msHidden', MS.hidden);
  if (gs && SYNC.cite) google.script.run.withFailureHandler(() => {}).savePrefs({ msRecent: MS.recent, msHidden: MS.hidden });
}
function msMerge(prefs) {
  if (!prefs || !SYNC.cite) return;
  const m = new Map();
  [...MS.recent, ...(prefs.msRecent || [])].forEach(x => { const k = msDoc(x); if (!m.has(k) || m.get(k).at < x.at) m.set(k, x); });
  MS.recent = [...m.values()].sort((a, b) => b.at - a.at).slice(0, 12);
  Object.entries(prefs.msHidden || {}).forEach(([k, v]) => { if (!MS.hidden[k] || MS.hidden[k].at < v.at) MS.hidden[k] = v; });
  store.set('msRecent', MS.recent);
  store.set('msHidden', MS.hidden);
}
// What's left to fix in a report, without what was dismissed.
function msVisible(rep) {
  const hid = new Set((MS.hidden[msDoc(rep)] || {}).ids || []);
  const keep = id => !hid.has(id);
  return {
    missing: rep.missing.filter(w => keep('m:' + w.id)), uncited: rep.uncited.filter(r => keep('u:' + r.id)), flags: rep.flags.filter(f => keep(f.id)),
    noLib: rep.noLib.filter(w => keep('n:' + w.id)), notInLib: rep.notInLib.filter(r => keep('l:' + r.id)), hidden: hid.size,
  };
}
const msTodo = rep => { const v = msVisible(rep); return v.missing.length + v.uncited.length + v.flags.length; };
function msRemember(rep) {
  const x = { id: rep.id || null, name: rep.name, kind: rep.kind || 'file', at: Date.now(), todo: msTodo(rep) };
  MS.recent = [x, ...MS.recent.filter(y => msDoc(y) !== msDoc(x))].slice(0, 12);
  msSave();
  renderGroups();
}

/* ---------- the panels */
const msAgo = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : s < 86400 * 6 ? Math.round(s / 86400) + ' d ago' : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const msFileRow = (x, sub) => `<button type="button" class="ms-file" data-ms-open="${esc(x.id)}" data-ms-kind="${x.kind}"><span class="ms-k ms-k-${x.kind}">${ICON.doc}</span>` +
  `<span class="ms-fname">${esc(x.name)}</span><span class="ms-fsub">${sub}</span></button>`;
function openMsCheck() {
  sheet = { mode: 'mscheck' };
  const recent = MS.recent.filter(x => x.id);
  showSheet(`<h2>Cite Check</h2>` +
    `<p class="sheet-note">LibLande reads the manuscript, without changing it: every citation should have its reference, and every reference a citation.</p>` +
    (gs && recent.length ? `<div class="ms-group"><div class="ms-gh">${ICON.history}Checked lately</div>` +
      recent.map(x => msFileRow(x, msAgo(x.at) + (x.todo ? ` · <b class="ms-todo">${x.todo} to fix</b>` : ' · all in order'))).join('') + `</div>` : '') +
    (gs ? `<div class="ms-group"><div class="ms-gh">${ICON.folder}In your Google Drive</div>` +
      `<div class="ms-link">${ICON.search}<input id="msFind" type="search" placeholder="Search by name, or paste a link" autocapitalize="off" autocorrect="off" spellcheck="false"></div>` +
      `<div id="msDrive" class="ms-drive"><p class="ms-dim">Loading…</p></div></div>` : '') +
    `<div class="ms-group"><div class="ms-gh">${ICON.doc}On this device</div>` +
    `<label class="btn ms-pick">${ICON.doc}<span id="msFileName">Choose a Word file (.docx)…</span>` +
    `<input id="msFile" type="file" accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden></label></div>` +
    (MS.last ? `<p><button type="button" class="linkish" data-ms-last>Show the last report (${esc(MS.last.name)})</button></p>` : ''), 'Check');
  $('#msFile').addEventListener('change', ev => {
    const f = ev.target.files[0];
    $('#msFileName').textContent = f ? f.name : 'Choose a Word file (.docx)…';
    if (f) runMsCheck();
  });
  if (!gs) { $('#sheetSave').hidden = true; return; }
  // The Drive list: the latest first, then as you type (a link pasted is
  // checked with Check).
  const list = async q => {
    const s = sheet, box = $('#msDrive');
    try {
      const files = await msDriveList(q);
      if (sheet !== s || !box.isConnected) return;
      box.innerHTML = files.length ? files.map(f => msFileRow(f, 'edited ' + msAgo(f.at))).join('') : `<p class="ms-dim">${q ? 'No Google Doc or Word file has “' + esc(q) + '” in its name.' : 'No Google Docs or Word files.'}</p>`;
    } catch (err) { if (box.isConnected) box.innerHTML = `<p class="ms-dim">${esc(errText(err))}</p>`; }
  };
  list('');
  let timer = 0;
  $('#msFind').addEventListener('input', ev => {
    const v = ev.target.value.trim();
    clearTimeout(timer);
    if (msDriveId(v) && /[/=]/.test(v)) return;
    timer = setTimeout(() => list(v), 300);
  });
}
// src: {id, kind} for a file in Drive; otherwise the link typed or the
// file chosen.
async function runMsCheck(src) {
  const s = sheet;
  const link = !src && $('#msFind') ? $('#msFind').value.trim() : '', file = !src && $('#msFile') && $('#msFile').files[0];
  if (!src && !file && !msDriveId(link)) { sheetMsg(gs ? 'Choose a manuscript, or paste its link.' : 'Choose a Word file.', true); return; }
  sheetBusy(true);
  sheetMsg('Reading the manuscript…');
  try {
    const doc = file ? await msFromFile(file) : await msFromDrive(src ? src.id : link);
    if (sheet !== s) return;
    const rep = Object.assign(msCheck(doc.paras, doc.notes), { name: doc.name, id: doc.id || null, kind: doc.kind || 'file', src: { paras: doc.paras, notes: doc.notes } });
    MS.last = rep;
    msRemember(rep);
    showMsReport(rep);
  } catch (err) {
    if (sheet === s) sheetMsg(errText(err), true);
  } finally {
    if (sheet === s) sheetBusy(false);
  }
}
// An in-text citation from a reference's surnames and year: (A, 2020),
// (A & B, 2020), (A et al., 2020).
const msInText = (names, year) => '(' + (names.length === 1 ? names[0] : names.length === 2 ? names[0] + ' & ' + names[1] : names[0] + ' et al.') + ', ' + year + ')';
// The References section the manuscript should have: every work cited, in
// APA style from the library where it's there, otherwise as the manuscript
// has it, in alphabetical order. Works cited with neither are counted.
function msReferences(rep) {
  const seen = new Set(), items = [];
  let left = 0;
  for (const w of rep.works) {
    if (w.lib) { if (!seen.has(w.lib.e.k)) { seen.add(w.lib.e.k); const r = apaCitation(w.lib.e); items.push({ text: r.text, html: r.html }); } }
    else if (w.refs.length === 1) { if (!seen.has(w.refs[0].raw)) { seen.add(w.refs[0].raw); items.push({ text: w.refs[0].raw, html: esc(w.refs[0].raw) }); } }
    else left++;
  }
  items.sort((a, b) => norm(a.text).localeCompare(norm(b.text)));
  return { items, left };
}
// The Add panel's title, authors and year, filled in.
function msFill(title, authors, year) {
  const set = (id, v) => { const el = $(id); if (el && v) el.value = v; };
  set('#fld-title', title);
  set('#fld-author', authors);
  if (/^\d{4}$/.test(year || '')) set('#fld-year', year);
}
// Back to a report from another panel: checked again on the same text, so
// a publication just added counts.
function msReturn(rep) {
  const again = rep.src ? Object.assign(msCheck(rep.src.paras, rep.src.notes), { name: rep.name, id: rep.id, kind: rep.kind, src: rep.src }) : rep;
  MS.last = again;
  msRemember(again);
  showMsReport(again);
}
function showMsReport(rep) {
  sheet = { mode: 'msreport', rep };
  const v = msVisible(rep);
  // (Each finding: what the text says and where, the reference in full,
  // and its buttons.)
  const ib = (attr, icon, label) => `<button type="button" class="ms-ib" ${attr} aria-label="${esc(label)}" title="${esc(label)}">${icon}</button>`;
  const cite = w => `<span class="ms-cite">${esc(w.who + ', ' + w.year)}</span>` + (w.n > 1 ? `<span class="ms-n">×${w.n}</span>` : '');
  const full = (e, raw) => `<div class="apa-refs ms-ref"><p>${e ? apaCitation(e).html : esc(raw)}</p></div>`;
  const ctx = c => `<div class="ms-ctx">${esc(c.b)}<mark>${esc(c.m)}</mark>${esc(c.a)}</div>`;
  const where = w => !w.ctxs || !w.ctxs.length ? '' : ctx(w.ctxs[0]) +
    (w.ctxs.length > 1 ? `<details class="ms-more"><summary>${w.ctxs.length - 1} more place${w.ctxs.length === 2 ? '' : 's'}</summary>${w.ctxs.slice(1).map(ctx).join('')}</details>` : '');
  const item = (head, body, acts) => `<li class="ms-item"><div class="ms-main">${head ? `<div class="ms-head">${head}</div>` : ''}${body}</div>` +
    (acts ? `<div class="ms-acts">${acts}</div>` : '') + `</li>`;
  const acts = [];
  const act = x => { acts.push(x); return acts.length - 1; };
  const hide = id => ib(`data-ms-hide="${act({ id })}"`, ICON.x, 'Dismiss: it’s fine as it is');
  const libActs = e => ib(`data-ms-ref="${act({ e })}"`, ICON.copy, 'Copy the APA reference') + ib(`data-ms-show="${esc(e.k)}"`, ICON.lib, 'Show in the library');
  const citeAct = text => ib(`data-ms-cite="${act({ text })}"`, ICON.quote, 'Copy the in-text citation ' + text);
  const sec = (key, icon, title, list, open) => list.length ? `<details class="ms-sec ms-${key}"${open ? ' open' : ''}><summary>${icon}<span>${esc(title)}</span><span class="ms-ct">${list.length}</span>${ICON.chev}</summary>` +
    `<ul class="ms-list">${list.join('')}</ul></details>` : '';

  const missing = v.missing.map(w => item(cite(w) + (w.near ? `<span class="ms-hint">perhaps ${esc(w.near)}?</span>` : ''),
    where(w) + (w.lib ? full(w.lib.e) : `<div class="ms-dim">Not in your library either.</div>`),
    (w.lib ? libActs(w.lib.e) : gs ? ib(`data-ms-addw="${act({ w })}"`, ICON.plus, 'Add to your library') : '') + hide('m:' + w.id)));
  const uncited = v.uncited.map(r => {
    const e = r.lib && r.lib.e, intext = e ? apaInText(e).text : msInText(r.names, r.yk === 'forth' ? 'in press' : r.yk === 'nd' ? 'n.d.' : r.yk);
    return item('', full(e, r.raw), citeAct(intext) + (e ? libActs(e) : '') + hide('u:' + r.id));
  });
  const flags = v.flags.map(f => {
    const e = f.pub || (f.w && f.w.lib && f.w.lib.e), fix = e && (f.short || f.pub) ? apaInText(e).text : '', said = fix && f.short ? f.short : f.msg;
    return item(f.w ? cite(f.w) : '', (f.w ? where(f.w) : '') + `<div class="ms-msg">${esc(said.charAt(0).toUpperCase() + said.slice(1))}${fix && f.w ? `: <span class="ms-fix">${esc(fix)}</span>` : '.'}</div>` +
      (f.pub ? full(f.pub) : f.r ? full(f.r.lib && f.r.lib.e, f.r.raw) : ''),
      (fix ? citeAct(fix) : '') + (f.pub ? libActs(f.pub) : '') + hide(f.id));
  });
  const noLib = v.noLib.map(w => item(cite(w), where(w) + `<div class="ms-dim">Not in your library.</div>`, (gs ? ib(`data-ms-addw="${act({ w })}"`, ICON.plus, 'Add to your library') : '') + hide('n:' + w.id)));
  const notInLib = v.notInLib.map(r => item('', full(null, r.raw), (gs ? ib(`data-ms-add="${rep.refs.indexOf(r)}"`, ICON.plus, 'Add to your library') : '') + hide('l:' + r.id)));
  const unread = rep.unread.map(r => item('', `<div class="ms-raw">${esc(r.raw)}</div>`, ''));
  const ok = rep.ok.map(w => item(cite(w), full(w.lib.e), libActs(w.lib.e)));
  sheet.acts = acts;

  const W = rep.works.length, N = rep.refs ? rep.refs.length : 0, R = msReferences(rep);
  const fine = rep.refs && !v.missing.length && !v.uncited.length && !v.flags.length;
  const stat = (icon, n, what) => `<span class="ms-stat">${icon}<b>${n}</b> ${what}</span>`;
  showSheet(`<div class="ms-title"><h2>${esc(rep.name)}</h2>` +
      (rep.id ? `<a class="ms-ib" href="${esc(msOpenUrl(rep))}" target="_blank" rel="noopener" aria-label="Open the manuscript" title="Open the manuscript">${ICON.drive}</a>` +
        ib('data-ms-recheck', ICON.history, 'Check it again') : '') + `</div>` +
    `<div class="ms-stats">${stat(ICON.quote, rep.cites, rep.cites === 1 ? 'citation' : 'citations')}${stat(ICON.read, W, W === 1 ? 'work cited' : 'works cited')}` +
      (rep.refs ? stat(ICON.type, N, N === 1 ? 'reference' : 'references') : '') + `</div>` +
    (rep.refs ? '' : `<p class="ms-note">${ICON.alert}<span>No References section was found (a heading such as “References”), so the citations are checked against your library only.</span></p>`) +
    (fine ? `<p class="ms-note ms-good">${ICON.check}<span>Every citation has its reference, and every reference is cited.</span></p>` : '') +
    `<div class="actions ms-top">` +
      (R.items.length ? `<button type="button" class="btn primary" data-ms-allrefs title="Every work cited, in APA style, in order; references never cited are left out">${ICON.copy}<span>Copy References (${R.items.length})</span></button>` : '') +
      (v.missing.some(w => w.lib) ? `<button type="button" class="btn" data-ms-missing>${ICON.copy}<span>Copy missing (${v.missing.filter(w => w.lib).length})</span></button>` : '') +
      (rep.kind === 'gdoc' && rep.id && rep.refs && gs && msFixes(rep).length ? `<button type="button" class="btn" data-ms-fix title="Add missing references, bring old ones up to date, take out ones never cited: in the Google Doc itself">${ICON.pencil}<span>Fix in the document\u2026</span></button>` : '') +
      `<button type="button" class="btn" data-ms-again>${ICON.doc}<span>Check another</span></button></div>` +
    (R.left ? `<p class="ms-note">${ICON.alert}<span>${R.left} cited work${R.left === 1 ? ' is' : 's are'} in neither the References nor your library, so Copy References leaves ${R.left === 1 ? 'it' : 'them'} out.</span></p>` : '') +
    sec('bad', ICON.alert, 'Cited, but missing from the References', missing, true) +
    sec('bad', ICON.quote, 'In the References, but never cited', uncited, true) +
    sec('warn', ICON.pencil, 'Worth a look', flags, true) +
    sec('warn', ICON.lib, 'Cited, but not in your library', noLib, true) +
    sec('warn', ICON.lib, 'References not in your library', notInLib, !v.missing.length && !v.uncited.length) +
    sec('warn', ICON.doc, 'References LibLande couldn’t read', unread, false) +
    sec('good', ICON.check, 'All in order', ok, false) +
    (v.hidden ? `<p class="ms-note">${ICON.x}<span>${v.hidden} finding${v.hidden === 1 ? '' : 's'} dismissed. <button type="button" class="linkish" data-ms-unhide>Show ${v.hidden === 1 ? 'it' : 'them'} again</button></span></p>` : ''), 'Done');
  $('#sheetCancel').hidden = true;
}
$('#sheetBody').addEventListener('click', ev => {
  if (!sheet) return;
  if (ev.target.closest('[data-ms-last]') && MS.last) { showMsReport(MS.last); return; }
  if (ev.target.closest('[data-ms-again]')) { openMsCheck(); return; }
  const open = ev.target.closest('[data-ms-open]');
  if (open && sheet.mode === 'mscheck') { if (!$('#sheetSave').disabled) runMsCheck({ id: open.dataset.msOpen, kind: open.dataset.msKind }); return; }
  if (sheet.mode !== 'msreport') return;
  const rep = sheet.rep, A = sheet.acts || [];
  if (ev.target.closest('[data-ms-recheck]')) { openMsCheck(); runMsCheck({ id: rep.id, kind: rep.kind }); return; }
  if (ev.target.closest('[data-ms-fix]')) { openMsFix(rep); return; }
  const show = ev.target.closest('[data-ms-show]');
  if (show) { closeSheet(); showTwin(show.dataset.msShow); return; }
  const one = ev.target.closest('[data-ms-ref]');
  if (one) { const r = apaCitation(A[+one.dataset.msRef].e); copy(r.text, 'Copied the APA reference', r.html); return; }
  const c = ev.target.closest('[data-ms-cite]');
  if (c) { const t = A[+c.dataset.msCite].text; copy(t, 'Copied ' + t); return; }
  // (Dismissed or brought back: remembered for this manuscript.)
  const h = ev.target.closest('[data-ms-hide]');
  if (h) {
    const k = msDoc(rep), cur = (MS.hidden[k] || {}).ids || [];
    MS.hidden[k] = { at: Date.now(), ids: [...new Set([...cur, A[+h.dataset.msHide].id])] };
    msRemember(rep);
    const top = $('#sheet').scrollTop;
    showMsReport(rep);
    $('#sheet').scrollTop = top;
    return;
  }
  if (ev.target.closest('[data-ms-unhide]')) { MS.hidden[msDoc(rep)] = { at: Date.now(), ids: [] }; msRemember(rep); showMsReport(rep); return; }
  // (Pasted into Word or a Google Doc with APA's hanging indent.)
  const refsCopy = list => copy(list.map(r => r.text).join('\n\n'), 'Copied ' + list.length + ' APA reference' + (list.length === 1 ? '' : 's'),
    list.map(r => '<p style="margin:0 0 0 0.5in;text-indent:-0.5in">' + r.html + '</p>').join(''));
  if (ev.target.closest('[data-ms-allrefs]')) { refsCopy(msReferences(rep).items); return; }
  if (ev.target.closest('[data-ms-missing]')) { refsCopy(apaOrder(msVisible(rep).missing.filter(w => w.lib).map(w => w.lib.e)).map(apaCitation)); return; }
  const add = ev.target.closest('[data-ms-add]');
  if (add) {
    // The Add panel, with the reference's DOI looked up, or its title and
    // year filled in.
    const r = rep.refs[+add.dataset.msAdd];
    openAdd();
    sheet.msBack = rep;
    if (r.doi) { $('#doiLookup').value = r.doi; lookupIntoForm(); return; }
    msFill(r.title, r.authors, r.base);
    // (And searched for by its title and first author: candidates to
    // choose from, as typing them would give.)
    if (r.title) { $('#doiLookup').value = r.title + (r.names && r.names[0] ? ' ' + r.names[0] : ''); tsSearch($('#doiLookup').value); }
    return;
  }
  // (A citation with nothing else to go on: its authors and year.)
  const addw = ev.target.closest('[data-ms-addw]');
  if (addw) {
    const w = A[+addw.dataset.msAddw].w;
    openAdd();
    sheet.msBack = rep;
    msFill('', w.names.join(' and '), w.base);
  }
});

/* ---------- fixing a Google Doc's References */
// For a Google Doc, Cite Check can change its References section itself:
// add the references missing (works cited that are in your library, in
// APA style, in alphabetical order), bring old ones up to date (published
// since, or a different year in your library), and take out ones never
// cited (only those ticked). Its citations in the text are left as they
// are. Done with Google Docs' API, in one batch; the Doc's version history
// has what it was before. (Word files: reported only.)
const DOCS_API = 'https:\/\/docs.googleapis.com/v1/documents/';
async function docsCall(path, opts = {}) {
  const go = async token => fetch(DOCS_API + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, opts.headers || {}) }));
  let r = await go(await driveToken());
  if (r.status === 401) r = await go(await driveToken(true));
  if (r.ok) return r.json();
  let msg = '';
  try { msg = ((await r.json()).error || {}).message || ''; } catch (e) { /* none */ }
  if (r.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
    const link = (/https:\/\/console\.(?:developers|cloud)\.google\.com\/\S+/.exec(msg) || [''])[0].replace(/[.,]+$/, '');
    throw new Error('Google Docs’ API isn’t turned on for LibLande yet. In the Google Cloud console, for the project LibLande signs in with, turn on the “Google Docs API”' + (link ? ' (' + link + ')' : '') + ', then try again.');
  }
  if (r.status === 403) throw new Error('Google Docs didn’t allow the change: perhaps you can only view or comment on this document.');
  throw new Error('Google Docs didn’t make the change (error ' + r.status + (msg ? ': ' + msg : '') + ').');
}
// A reference's text and its italic stretches, from LibLande's APA HTML.
function msRuns(html) {
  const box = document.createElement('div');
  box.innerHTML = html;
  let text = '';
  const italics = [];
  const walk = (n, it) => n.childNodes.forEach(c => {
    if (c.nodeType === 3) { if (it && c.data) italics.push([text.length, text.length + c.data.length]); text += c.data; }
    else walk(c, it || /^(I|EM)$/.test(c.nodeName));
  });
  walk(box, false);
  return { text, italics };
}
const msSquash = t => norm(String(t || '')).replace(/[^a-z0-9]+/g, '');
// The changes that could be made, from a report.
function msFixes(rep) {
  const v = msVisible(rep), out = [];
  v.missing.filter(w => w.lib).forEach(w => { if (!out.some(x => x.kind === 'add' && x.e === w.lib.e)) out.push({ kind: 'add', e: w.lib.e, on: true }); });
  v.flags.forEach(f => {
    const r = f.r || (f.pub && f.w && f.w.refs.length === 1 ? f.w.refs[0] : null), e = f.pub || (f.r && f.r.lib && f.r.lib.e);
    if (r && e && !out.some(x => x.r === r)) out.push({ kind: 'update', r, e, on: true });
  });
  v.uncited.forEach(r => out.push({ kind: 'remove', r, on: false }));
  return out;
}
function openMsFix(rep) {
  const fixes = msFixes(rep);
  sheet = { mode: 'msfix', rep, fixes, msBack: rep };
  const row = (x, i) => `<label class="msf-row"><input type="checkbox" data-msf="${i}"${x.on ? ' checked' : ''}>` +
    `<span><b>${{ add: 'Add', update: 'Bring up to date', remove: 'Take out' }[x.kind]}</b> ` +
    (x.kind === 'remove' ? esc(x.r.raw) : apaCitation(x.e).html) + (x.kind === 'update' ? `<span class="ms-dim"> (was: ${esc(x.r.raw)})</span>` : '') + `</span></label>`;
  const part = (kind, title) => { const ix = fixes.map((x, i) => [x, i]).filter(([x]) => x.kind === kind); return ix.length ? `<h3 class="msf-h">${title}</h3>` + ix.map(([x, i]) => row(x, i)).join('') : ''; };
  showSheet(`<h2>Fix the References</h2>` +
    `<p class="sheet-note">In “${esc(rep.name)}” itself, in one go. Its citations in the text stay as they are. To undo, use the document’s version history (File › Version history).</p>` +
    (fixes.length ? part('add', 'Missing from the References') + part('update', 'Out of date') + part('remove', 'Never cited')
      : `<p class="ms-dim">Nothing in the References for LibLande to change.</p>`), fixes.length ? 'Make the changes' : 'Close');
}
$('#sheetBody').addEventListener('change', ev => {
  const c = ev.target.closest('[data-msf]');
  if (c && sheet && sheet.mode === 'msfix') sheet.fixes[+c.dataset.msf].on = c.checked;
});
// The Doc's paragraphs, with where each starts and ends.
function msDocParas(doc) {
  return ((doc.body && doc.body.content) || []).filter(el => el.paragraph).map(el => ({
    start: el.startIndex, end: el.endIndex,
    text: (el.paragraph.elements || []).map(x => (x.textRun && x.textRun.content) || '').join('').replace(/\n$/, ''),
    heading: /^(HEADING_|TITLE)/.test((el.paragraph.paragraphStyle || {}).namedStyleType || ''),
  }));
}
// The requests for the changes chosen: made from the end of the Doc
// backwards, so each one's place is still right when it's made.
function msFixRequests(doc, fixes) {
  const paras = msDocParas(doc);
  const h = paras.map((p, i) => [p, i]).filter(([p]) => MS_REFS_HEAD.test(p.text)).pop();
  if (!h) throw new Error('LibLande couldn’t find the References heading in the document.');
  let end = paras.length;
  for (let i = h[1] + 1; i < paras.length; i++) if (paras[i].heading || MS_AFTER_REFS.test(paras[i].text)) { end = i; break; }
  const refs = paras.slice(h[1] + 1, end).filter(p => p.text.trim().length > 15);
  const last = paras[paras.length - 1];
  const find = r => { const k = msSquash(r.raw); return refs.find(p => msSquash(p.text) === k) || refs.find(p => k.length > 40 && msSquash(p.text).startsWith(k.slice(0, 40))); };
  const ops = [], missed = [];
  const styled = (at, run) => [{ updateTextStyle: { range: { startIndex: at, endIndex: at + run.text.length }, textStyle: { italic: false }, fields: 'italic' } }]
    .concat(run.italics.map(([a, b]) => ({ updateTextStyle: { range: { startIndex: at + a, endIndex: at + b }, textStyle: { italic: true }, fields: 'italic' } })));
  const gone = new Set();
  fixes.filter(x => x.on && x.kind === 'remove').forEach(x => {
    const p = find(x.r);
    if (!p) { missed.push(x); return; }
    gone.add(p);
    const tail = p === last;
    ops.push({ at: p.start, rank: 0, reqs: [{ deleteContentRange: { range: { startIndex: tail ? p.start - 1 : p.start, endIndex: tail ? p.end - 1 : p.end } } }] });
  });
  fixes.filter(x => x.on && x.kind === 'update').forEach(x => {
    const p = find(x.r);
    if (!p || gone.has(p)) { if (!p) missed.push(x); return; }
    const run = msRuns(apaCitation(x.e).html);
    ops.push({ at: p.start, rank: 0, reqs: [{ deleteContentRange: { range: { startIndex: p.start, endIndex: p.end - 1 } } }, { insertText: { location: { index: p.start }, text: run.text } }].concat(styled(p.start, run)) });
  });
  // (A new one goes before the first that follows it in the alphabet, or
  // after the last; after the heading if there are none.)
  const kept = refs.filter(p => !gone.has(p));
  fixes.filter(x => x.on && x.kind === 'add').forEach(x => {
    const run = msRuns(apaCitation(x.e).html), key = norm(run.text);
    const next = kept.find(p => norm(p.text).localeCompare(key) > 0);
    if (next) { ops.push({ at: next.start, rank: 1, key, reqs: [{ insertText: { location: { index: next.start }, text: run.text + '\n' } }].concat(styled(next.start, run)) }); return; }
    const after = kept.length ? kept[kept.length - 1] : h[0];
    ops.push({ at: after.end - 1, rank: 1, key, reqs: [{ insertText: { location: { index: after.end - 1 }, text: '\n' + run.text } }].concat(styled(after.end, run))
      .concat(after === h[0] ? [{ updateParagraphStyle: { range: { startIndex: after.end, endIndex: after.end + run.text.length }, paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, fields: 'namedStyleType' } }] : []) });
  });
  // (Last in the Doc first; at one place, changes before additions, and
  // additions in reverse, so they end up in alphabetical order.)
  ops.sort((a, b) => b.at - a.at || a.rank - b.rank || (b.key || '').localeCompare(a.key || ''));
  return { requests: ops.flatMap(o => o.reqs), missed };
}
async function runMsFix() {
  const s = sheet, rep = s.rep;
  if (!s.fixes.some(x => x.on)) { closeSheet(); return; }
  sheetBusy(true);
  sheetMsg('Reading the document…');
  try {
    const doc = await docsCall(encodeURIComponent(rep.id));
    const { requests, missed } = msFixRequests(doc, s.fixes);
    if (sheet !== s) return;
    if (requests.length) {
      sheetMsg('Making the changes…');
      await docsCall(encodeURIComponent(rep.id) + ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests, writeControl: { requiredRevisionId: doc.revisionId } }) });
    }
    const made = s.fixes.filter(x => x.on).length - missed.length;
    s.msBack = null;
    closeSheet();
    toast('Made ' + made + ' change' + (made === 1 ? '' : 's') + ' to the References' + (missed.length ? '; ' + missed.length + ' reference' + (missed.length === 1 ? '' : 's') + ' not found as written, left as ' + (missed.length === 1 ? 'it was' : 'they were') : ''), 6000);
    // (Checked again, to show the document as it is now.)
    openMsCheck();
    runMsCheck({ id: rep.id, kind: rep.kind });
  } catch (err) {
    if (sheet === s) sheetMsg(/requiredRevisionId|revision/i.test(errText(err)) ? 'The document changed while LibLande was reading it. Try again.' : errText(err), true);
  } finally {
    if (sheet === s) sheetBusy(false);
  }
}
