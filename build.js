/**
 * LibLande: turn a BibDesk .bib file into the page's library data.
 * A JavaScript port of build.py. Plain JavaScript with no Apps Script calls,
 * so it can also be tested in a browser.
 *
 * buildLibrary_(text, driveIds, opts)
 *   text      contents of the .bib file
 *   driveIds  {path relative to the .bib file's folder: Drive file ID}
 *   opts      {built, source, base64Decode(string) -> array of bytes,
 *              papersPrefix: the papers folder's path from the .bib's folder}
 */

// Bump when the output changes, so existing libraries are rebuilt.
const BUILD_VERSION = 4;

const MONTHS_ = {};
'January February March April May June July August September October November December'
  .split(' ').forEach(m => { MONTHS_[m.slice(0, 3).toLowerCase()] = m; });

/* ------------------------------------------------------------ parsing */

// (Every brace counts, a backslash before it or not, as it does for BibTeX
// and BibDesk: a journal written "Biology \{&} Philosophy" has balanced
// braces. Skipping "\{" once made an edit end the entry too soon.)
function matchBrace_(s, i) {
  let depth = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return n;
}

const isSpace_ = c => c !== undefined && /\s/.test(c);

function parseValue_(s, pos, macros) {
  const parts = [];
  const n = s.length;
  const TOKEN = /[\w\-.:+\/]+/y;
  while (pos < n) {
    while (pos < n && isSpace_(s[pos])) pos++;
    if (pos >= n) break;
    const c = s[pos];
    if (c === '{') {
      const end = matchBrace_(s, pos);
      parts.push(s.slice(pos + 1, end - 1));
      pos = end;
    } else if (c === '"') {
      let j = pos + 1, depth = 0;
      while (j < n && !(s[j] === '"' && depth === 0 && s[j - 1] !== '\\')) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      parts.push(s.slice(pos + 1, j));
      pos = j + 1;
    } else {
      TOKEN.lastIndex = pos;
      const m = TOKEN.exec(s);
      if (!m) break;
      const tok = m[0];
      parts.push(Object.prototype.hasOwnProperty.call(macros, tok.toLowerCase()) ? macros[tok.toLowerCase()] : tok);
      pos = TOKEN.lastIndex;
    }
    while (pos < n && isSpace_(s[pos])) pos++;
    if (pos < n && s[pos] === '#') { pos++; continue; }
    break;
  }
  return [parts.join(''), pos];
}

function parseFields_(s, macros) {
  const fields = {};
  const FIELD = /[\s,]*([\w\-:.+\/]+)\s*=\s*/y;
  let pos = 0;
  for (;;) {
    FIELD.lastIndex = pos;
    const m = FIELD.exec(s);
    if (!m) break;
    const r = parseValue_(s, FIELD.lastIndex, macros);
    fields[m[1].toLowerCase()] = r[0];
    pos = r[1];
  }
  return fields;
}

// A short fingerprint of a piece of text (FNV-1a hash plus length). Edits
// compare an entry's fingerprint from the last build with the file as it
// is now, to tell whether the entry changed in the meantime.
function fingerprint_(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36) + '.' + s.length.toString(36);
}
const groupsComment_ = comments => comments.find(c => c.indexOf('BibDesk Static Groups{') === 0) || '';

function parseBib_(text) {
  const macros = Object.assign({}, MONTHS_);
  const entries = [], comments = [];
  const ENTRY = /@(\w+)\s*\{/g;
  let m;
  while ((m = ENTRY.exec(text))) {
    const bodyStart = ENTRY.lastIndex;
    const end = matchBrace_(text, bodyStart - 1);
    const body = text.slice(bodyStart, end - 1);
    ENTRY.lastIndex = end;
    const typ = m[1].toLowerCase();
    if (typ === 'comment') comments.push(body);
    else if (typ === 'string') Object.assign(macros, parseFields_(body, macros));
    else if (typ !== 'preamble') {
      const comma = body.indexOf(',');
      const key = comma < 0 ? body : body.slice(0, comma);
      const rest = comma < 0 ? '' : body.slice(comma + 1);
      entries.push([typ, key.trim(), parseFields_(rest, macros), m.index, end]);
    }
  }
  return [entries, comments];
}

/* ------------------------------------------------------------ LaTeX -> Unicode */

const ACCENTS_ = { '"': '\u0308', "'": '\u0301', '`': '\u0300', '^': '\u0302', '~': '\u0303',
  '=': '\u0304', '.': '\u0307', u: '\u0306', v: '\u030c', H: '\u030b', c: '\u0327',
  k: '\u0328', r: '\u030a', d: '\u0323', b: '\u0331' };
const SPECIAL_ = { ss: '\u00df', o: '\u00f8', O: '\u00d8', ae: '\u00e6', AE: '\u00c6', oe: '\u0153', OE: '\u0152', aa: '\u00e5', AA: '\u00c5',
  l: '\u0142', L: '\u0141', i: '\u0131', j: '\u0237', dh: '\u00f0', th: '\u00fe', textendash: '\u2013', textemdash: '\u2014',
  ldots: '\u2026', dots: '\u2026', textellipsis: '\u2026', textquoteright: '\u2019', textquoteleft: '\u2018',
  S: '\u00a7', P: '\u00b6', textregistered: '\u00ae', copyright: '\u00a9', textasciitilde: '~', textbar: '|',
  textless: '<', textgreater: '>', textquotedblleft: '\u201c', textquotedblright: '\u201d',
  textquotesingle: "'", textquotedbl: '"', mathsemicolon: ';', textdegree: '\u00b0', textbullet: '\u2022', alpha: '\u03b1', beta: '\u03b2', gamma: '\u03b3', delta: '\u03b4',
  lambda: '\u03bb', mu: '\u03bc', pi: '\u03c0', sigma: '\u03c3', times: '\u00d7', pm: '\u00b1', leq: '\u2264', geq: '\u2265',
  neq: '\u2260', approx: '\u2248', rightarrow: '\u2192', to: '\u2192', infty: '\u221e' };
const SPECIAL_RE_ = new RegExp('\\\\(' + Object.keys(SPECIAL_).sort((a, b) => b.length - a.length).join('|') +
  ')(?![A-Za-z])(?:\\s*\\{\\})?\\s?', 'g');
const SYM_ACCENT_RE_ = /\\(['"`^~=.])\s*(?:\{\s*(\\?\p{L})\s*\}|(\\?\p{L}))/gu;
const LET_ACCENT_RE_ = /\\([uvHckrdb])(?:\s*\{\s*(\\?[A-Za-z])\s*\}|\s+(\\?[A-Za-z]))/g;
const FORMAT_CMD_RE_ = /\\(?:emph|textit|textbf|textsc|textrm|textsf|texttt|textup|textnormal|textsl|mathrm|mathit|mathbf|text|mbox|url|href\{[^}]*\})\s*(?=\{)/g;
const FORMAT_DECL_RE_ = /\\(?:em|it|bf|sc|rm|sl|sf|tt|normalfont|itshape|bfseries|upshape|scshape|small|footnotesize)(?![A-Za-z])\s*/g;

function accent_(m, acc, a, b) {
  let base = a || b;
  base = base === '\\i' ? 'i' : base === '\\j' ? 'j' : base.replace(/^\\/, '');
  return (base + ACCENTS_[acc]).normalize('NFC');
}

function latexToUnicode_(s) {
  if (!/[\\{\-~$`]/.test(s)) return s;
  s = s.split('\\{').join('\x01').split('\\}').join('\x02');
  s = s.replace(SYM_ACCENT_RE_, accent_);
  s = s.replace(LET_ACCENT_RE_, accent_);
  s = s.replace(SPECIAL_RE_, (m, name) => SPECIAL_[name]);
  s = s.replace(FORMAT_CMD_RE_, '');
  s = s.replace(FORMAT_DECL_RE_, '');
  [['\\&', '&'], ['\\%', '%'], ['\\$', '$'], ['\\#', '#'], ['\\_', '_'], ['\\ ', ' '],
    ['\\,', ' '], ['\\/', ''], ['\\-', '']].forEach(p => { s = s.split(p[0]).join(p[1]); });
  s = s.split('$').join('');
  s = s.split('---').join('\u2014').split('--').join('\u2013');
  s = s.split('``').join('\u201c').split("''").join('\u201d');
  s = s.split('~').join('\u00a0');
  s = s.replace(/\\([A-Za-z]+)\s?/g, '$1');
  s = s.replace(/[{}]/g, '');
  s = s.split('\x01').join('{').split('\x02').join('}');
  return s.normalize('NFC');
}

function clean_(s, keepParagraphs) {
  s = s.trim();
  if (keepParagraphs) return s.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).join('\n\n');
  return s.replace(/\s+/g, ' ');
}

/* ------------------------------------------------------------ names */

function splitTop_(s, sep) {
  const out = [];
  let depth = 0, start = 0, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0) {
      sep.lastIndex = i;
      const m = sep.exec(s);
      if (m && sep.lastIndex > i) {
        out.push(s.slice(start, i));
        start = i = sep.lastIndex;
        continue;
      }
    }
    i++;
  }
  out.push(s.slice(start));
  return out.map(p => p.trim()).filter(Boolean);
}

const isLower_ = c => !!c && c === c.toLowerCase() && c !== c.toUpperCase();

function parseNames_(raw) {
  return splitTop_(clean_(raw), /\s+and\s+/iy).map(name => {
    const parts = splitTop_(name, /,/y);
    let last, first;
    if (parts.length >= 2) {
      last = parts[0]; first = parts[parts.length - 1];
    } else {
      const words = splitTop_(name, /\s+/y);
      if (words.length === 1) {
        last = words[0]; first = '';
      } else {
        let k = words.length - 1;
        for (let j = 1; j < words.length - 1; j++) {
          if (isLower_(words[j][0])) { k = j; break; }
        }
        last = words.slice(k).join(' '); first = words.slice(0, k).join(' ');
      }
    }
    return [latexToUnicode_(last), latexToUnicode_(first)];
  });
}

/* ------------------------------------------------------------ BibDesk files */

// A bdsk-file-N field is a base64 binary property list; its top-level
// dictionary holds the file's relativePath.
function plistRelativePath_(bytes) {
  const n = bytes.length;
  if (n < 40) return null;
  const u8 = i => bytes[i] & 0xff;
  const uint = (off, size) => { let v = 0; for (let k = 0; k < size; k++) v = v * 256 + u8(off + k); return v; };
  const t = n - 32;
  const offSize = u8(t + 6), refSize = u8(t + 7);
  const top = uint(t + 16, 8), tableOff = uint(t + 24, 8);
  const objOffset = idx => uint(tableOff + idx * offSize, offSize);
  const lenAt = off => {
    const info = u8(off) & 0x0f;
    if (info !== 0x0f) return [info, off + 1];
    const size = 1 << (u8(off + 1) & 0x0f);
    return [uint(off + 2, size), off + 2 + size];
  };
  const readString = idx => {
    const off = objOffset(idx), type = u8(off) >> 4;
    const [len, start] = lenAt(off);
    let s = '';
    if (type === 0x5) for (let k = 0; k < len; k++) s += String.fromCharCode(u8(start + k));
    else if (type === 0x6) for (let k = 0; k < len; k++) s += String.fromCharCode(uint(start + 2 * k, 2));
    else return null;
    return s;
  };
  const off = objOffset(top);
  if (u8(off) >> 4 !== 0xd) return null;
  const [count, start] = lenAt(off);
  for (let k = 0; k < count; k++) {
    if (readString(uint(start + k * refSize, refSize)) === 'relativePath') {
      return readString(uint(start + (count + k) * refSize, refSize));
    }
  }
  return null;
}

// Split on `sep` where it isn't escaped with a backslash.
function splitUnescaped_(s, sep) {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { cur += c + s[i + 1]; i++; continue; }
    if (c === sep) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

// A JabRef/Zotero `file` field: "description:path:type" items separated
// by semicolons, with ":" and ";" escaped by backslashes.
function fileFieldPaths_(value) {
  return splitUnescaped_(value.replace(/[{}]/g, ''), ';').map(item => {
    const bits = splitUnescaped_(item, ':');
    const path = bits.length >= 3 ? bits.slice(1, -1).join(':') : bits[0];
    return path.replace(/\\(.)/g, '$1');
  }).filter(Boolean);
}

// Linked files: {paths, strict}. BibDesk's bdsk-file-N fields are used when
// present (strict: listed even if not found in Drive). Otherwise the
// `file` and `local-url` fields are used, keeping only files found in Drive.
function linkedFiles_(fields, base64Decode) {
  const bdsk = Object.keys(fields).filter(f => /^bdsk-file-\d+$/.test(f)).sort().map(k => {
    try {
      const rel = plistRelativePath_(base64Decode(fields[k].replace(/\s+/g, '')));
      return rel ? rel.normalize('NFC') : null;
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
  if (bdsk.length) return { paths: bdsk, strict: true };
  let other = fields.file ? fileFieldPaths_(fields.file) : [];
  if (fields['local-url']) {
    let u = fields['local-url'].replace(/[{}]/g, '').trim();
    try { u = decodeURIComponent(u); } catch (e) { /* keep as is */ }
    other.push(u.replace(/^file:\/+(localhost\/)?/i, '/'));
  }
  return { paths: other.map(p => p.normalize('NFC')), strict: false };
}

const xmlText_ = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function staticGroups_(comments) {
  const groups = [];
  const prefix = 'BibDesk Static Groups{';
  comments.filter(c => c.indexOf(prefix) === 0).forEach(c => {
    (c.match(/<dict>[\s\S]*?<\/dict>/g) || []).forEach(d => {
      const name = /<key>group name<\/key>\s*<string>([\s\S]*?)<\/string>/.exec(d);
      const keys = /<key>keys<\/key>\s*<string>([\s\S]*?)<\/string>/.exec(d);
      groups.push({
        name: name ? xmlText_(name[1]) : 'Untitled',
        keys: keys ? xmlText_(keys[1]).split(',').map(k => k.trim()).filter(Boolean) : [],
      });
    });
  });
  return groups;
}

/* ------------------------------------------------------------ build */

function buildLibrary_(text, driveIds, opts) {
  const parsed = parseBib_(text);

  // Drive files by path (relative to the .bib's folder) and by file name,
  // for links whose saved path doesn't match (null: name not unique).
  const ids = {}, byName = {};
  Object.keys(driveIds).forEach(k => {
    const path = k.normalize('NFC'), id = driveIds[k];
    ids[path] = id;
    const name = path.split('/').pop();
    byName[name] = name in byName ? null : id;
  });
  // Windows paths (from a JabRef/Zotero file field) use backslashes; BibDesk
  // names can contain backslashes themselves, so only split those on "/".
  const baseName = p => (p.indexOf('/') < 0 && p.indexOf('\\') >= 0 ? p.split('\\') : p.split('/')).pop();
  const find = p => ids[p] || byName[baseName(p)] || null;

  // Whether a path points inside the papers folder, so a missing file is
  // worth flagging. papersPrefix is the papers folder's path from the .bib's
  // folder ('' for the same folder, null when unrelated).
  const prefix = opts.papersPrefix === undefined ? '' : opts.papersPrefix;
  const inPapers = p => prefix === null ? false
    : prefix === '' ? p.indexOf('../') !== 0 && p.indexOf('/') !== 0
    : p.indexOf(prefix + '/') === 0;

  const stats = { files: 0, ids: 0, missing: 0 };
  const entries = parsed[0].map(([typ, key, fields, start, end]) => {
    const disp = {}, rawKept = {};
    let hasRaw = false;
    Object.keys(fields).forEach(name => {
      if (name.indexOf('bdsk-') === 0 || name === 'file' || name === 'local-url') return;
      const raw = clean_(fields[name], name === 'abstract' || name === 'annote' || name === 'note');
      const shown = latexToUnicode_(raw);
      disp[name] = shown;
      if (shown !== raw) { rawKept[name] = raw; hasRaw = true; }
    });
    const e = { k: key, t: typ, f: disp, h: fingerprint_(text.slice(start, end)) };
    if (hasRaw) e.r = rawKept;
    if ('author' in fields) e.a = parseNames_(fields.author);
    if ('editor' in fields) e.e = parseNames_(fields.editor);

    const linked = linkedFiles_(fields, opts.base64Decode);
    const files = [];
    linked.paths.forEach(p => {
      const id = find(p);
      if (!id && !linked.strict) return;
      stats.files++;
      const item = { n: baseName(p), p: p };
      if (id) { item.id = id; stats.ids++; }
      else if (inPapers(p)) { item.x = 1; stats.missing++; }
      files.push(item);
    });
    if (files.length) e.files = files;

    const urls = Object.keys(fields).filter(k => /^bdsk-url-\d+$/.test(k)).sort().map(k => fields[k].trim());
    if (fields.url && fields.url.trim() && urls.indexOf(fields.url.trim()) < 0) urls.push(fields.url.trim());
    if (urls.length) e.u = urls;
    return e;
  });

  return {
    data: { built: opts.built, source: opts.source, groups: staticGroups_(parsed[1]), gh: fingerprint_(groupsComment_(parsed[1])), entries: entries },
    stats: stats,
  };
}

/* ------------------------------------------------------------ editing */
// Targeted edits to a .bib file's text. Only the edited entry (and, for
// group changes, BibDesk's static-groups comment) changes; every other byte
// is left exactly as it was.

// A field value must keep its braces balanced, or the file stops parsing.
function checkValue_(name, value) {
  if (!/^[A-Za-z][\w\-:.+]*$/.test(name)) throw new Error('\u201c' + name + '\u201d isn\u2019t a valid field name.');
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '{') depth++;
    else if (value[i] === '}' && --depth < 0) break;
  }
  if (depth !== 0) throw new Error('The ' + name + ' field has unbalanced braces { }. Check it and try again.');
}

// Each field of the entry whose fields run from `from` to `to`:
// {name, start, valueStart, valueEnd}, as offsets into `text`.
function fieldSpans_(text, from, to) {
  const FIELD = /[\s,]*([\w\-:.+\/]+)\s*=\s*/y;
  const spans = [];
  let pos = from;
  for (;;) {
    FIELD.lastIndex = pos;
    const m = FIELD.exec(text);
    if (!m || FIELD.lastIndex > to) break;
    const valueStart = FIELD.lastIndex;
    const r = parseValue_(text, valueStart, {});
    let valueEnd = r[1];
    while (valueEnd > valueStart && /\s/.test(text[valueEnd - 1])) valueEnd--;
    if (valueEnd > to) break;
    spans.push({ name: m[1].toLowerCase(), start: m.index + m[0].indexOf(m[1]), valueStart, valueEnd });
    pos = r[1];
  }
  return spans;
}

// Where the entry with cite key `key` is: {start, end, type, fieldsStart,
// fieldsEnd, fields}. Refuses a missing or duplicated key.
function locateEntry_(text, key) {
  const ENTRY = /@(\w+)\s*\{/g;
  let m, found = null;
  while ((m = ENTRY.exec(text))) {
    const bodyStart = ENTRY.lastIndex;
    const end = matchBrace_(text, bodyStart - 1);
    ENTRY.lastIndex = end;
    const type = m[1].toLowerCase();
    if (type === 'comment' || type === 'string' || type === 'preamble') continue;
    const comma = text.indexOf(',', bodyStart);
    if (comma < 0 || comma > end || text.slice(bodyStart, comma).trim() !== key) continue;
    if (found) throw new Error('The cite key ' + key + ' appears more than once in the file, so LibLande won\u2019t edit it.');
    found = { start: m.index, end, type, fieldsStart: comma + 1, fieldsEnd: end - 1 };
  }
  if (!found) throw new Error('LibLande couldn\u2019t find ' + key + ' in the file. It may have been renamed or deleted in BibDesk; tap Refresh.');
  // The entry must end where the next one (or the end of the file) begins:
  // otherwise its braces were read wrong, and an edit would break the file.
  const next = text.slice(found.end, found.end + 4000).match(/^\s*(\S)/);
  if (next && next[1] !== '@' && next[1] !== '%') {
    throw new Error('LibLande couldn\u2019t tell where ' + key + ' ends in the file, so it won\u2019t edit it. Edit it in BibDesk instead.');
  }
  found.fields = fieldSpans_(text, found.fieldsStart, found.fieldsEnd);
  return found;
}

// Set fields of one entry. `set` maps field names to new values; '' removes
// the field. New fields go in alphabetical order before BibDesk's own
// bdsk- fields, the way BibDesk writes them.
function editEntry_(text, key, set) {
  const entry = locateEntry_(text, key);
  const names = Object.keys(set);
  const removing = n => names.indexOf(n) >= 0 && (set[n] === '' || set[n] == null);
  const edits = [];
  names.forEach(name => {
    const value = set[name] == null ? '' : String(set[name]);
    if (value !== '') checkValue_(name, value);
    const f = entry.fields.find(x => x.name === name);
    if (f && value === '') {
      // Remove the whole line, including its comma.
      let s = f.start, e = f.valueEnd;
      const lineStart = text.lastIndexOf('\n', s - 1) + 1;
      const ownLine = /^[ \t]*$/.test(text.slice(lineStart, s));
      if (ownLine) s = lineStart;
      let j = e;
      while (j < entry.end && /[ \t]/.test(text[j])) j++;
      if (text[j] === ',') e = j + 1;
      if (ownLine) {
        let k = e;
        while (k < entry.end && /[ \t]/.test(text[k])) k++;
        if (text[k] === '\r') k++;
        if (text[k] === '\n') e = k + 1;
      }
      edits.push({ pos: s, len: e - s, ins: '', name });
    } else if (f) {
      edits.push({ pos: f.valueStart, len: f.valueEnd - f.valueStart, ins: '{' + value + '}', name });
    } else if (value !== '') {
      const keep = entry.fields.filter(x => !removing(x.name));
      // bdsk- fields keep their order among themselves (bdsk-file-2 after
      // bdsk-file-1); other new fields go before them.
      const after = name.indexOf('bdsk-') === 0
        ? keep.find(x => x.name.indexOf('bdsk-') === 0 && x.name > name)
        : keep.find(x => x.name.indexOf('bdsk-') !== 0 && x.name > name) || keep.find(x => x.name.indexOf('bdsk-') === 0);
      if (after) {
        const lineStart = text.lastIndexOf('\n', after.start - 1) + 1;
        const indent = text.slice(lineStart, after.start);
        if (/^[ \t]*$/.test(indent)) edits.push({ pos: lineStart, len: 0, ins: indent + name + ' = {' + value + '},\n', name });
        else edits.push({ pos: after.start, len: 0, ins: name + ' = {' + value + '}, ', name });
      } else {
        const last = keep[keep.length - 1];
        if (last) edits.push({ pos: last.valueEnd, len: 0, ins: ',\n\t' + name + ' = {' + value + '}', name });
        else edits.push({ pos: entry.fieldsStart, len: 0, ins: '\n\t' + name + ' = {' + value + '}', name });
      }
    }
  });
  edits.sort((a, b) => b.pos - a.pos || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  let out = text;
  edits.forEach(ed => { out = out.slice(0, ed.pos) + ed.ins + out.slice(ed.pos + ed.len); });
  return out;
}

// Add `key` to the static groups in `add` and remove it from those in
// `remove`, inside BibDesk's "BibDesk Static Groups" comment.
function editGroups_(text, key, add, remove) {
  add = add || []; remove = remove || [];
  if (!add.length && !remove.length) return text;
  const at = text.indexOf('@comment{BibDesk Static Groups{');
  if (at < 0) throw new Error('This .bib file has no BibDesk static groups.');
  const end = matchBrace_(text, at + '@comment'.length);
  const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const todo = new Set(add.concat(remove));
  const block = text.slice(at, end).replace(/<dict>[\s\S]*?<\/dict>/g, d => {
    const nm = /<key>group name<\/key>\s*<string>([\s\S]*?)<\/string>/.exec(d);
    if (!nm || !todo.has(xmlText_(nm[1]))) return d;
    const name = xmlText_(nm[1]);
    todo.delete(name);
    const km = /(<key>keys<\/key>\s*<string>)([\s\S]*?)(<\/string>)/.exec(d);
    let keys = km ? xmlText_(km[2]).split(',').map(k => k.trim()).filter(Boolean) : [];
    if (add.indexOf(name) >= 0 && keys.indexOf(key) < 0) keys.push(key);
    if (remove.indexOf(name) >= 0) keys = keys.filter(k => k !== key);
    const str = xml(keys.join(','));
    if (km) return d.replace(km[0], () => km[1] + str + km[3]);
    const empty = /<key>keys<\/key>\s*<string\/>/.exec(d);
    if (empty) return d.replace(empty[0], () => '<key>keys</key>\n\t\t<string>' + str + '</string>');
    throw new Error('LibLande couldn\u2019t update the group \u201c' + name + '\u201d.');
  });
  if (todo.size) throw new Error('There\u2019s no static group named \u201c' + Array.from(todo)[0] + '\u201d.');
  return text.slice(0, at) + block + text.slice(end);
}

// A new entry in BibDesk's layout: one field per line, alphabetical, with
// bdsk- fields last.
function bibEntryText_(type, key, fields) {
  const names = Object.keys(fields).filter(n => fields[n] != null && String(fields[n]) !== '').sort((a, b) => {
    const ba = a.indexOf('bdsk-') === 0 ? 1 : 0, bb = b.indexOf('bdsk-') === 0 ? 1 : 0;
    return ba - bb || (a < b ? -1 : a > b ? 1 : 0);
  });
  names.forEach(n => checkValue_(n, String(fields[n])));
  if (!/^[^\s,{}()"#%'=]+$/.test(key)) throw new Error('\u201c' + key + '\u201d can\u2019t be used as a cite key.');
  return '@' + type + '{' + key + ',\n' + names.map(n => '\t' + n + ' = {' + fields[n] + '}').join(',\n') + '}\n';
}

/* ------------------------------------------------------------ pending edits */

// Merge a new pending edit into the list: one edit per entry, later field
// values win, and adding then removing a group (or the reverse) cancels out.
// The entry's fingerprint from the first edit is kept, since the file itself
// hasn't changed in between.
function mergeEdit_(list, next) {
  const old = list.find(x => x.key === next.key);
  if (!old) { list.push(next); return list; }
  Object.assign(old.set, next.set);
  const add = new Set(old.groups.add), remove = new Set(old.groups.remove);
  next.groups.add.forEach(g => { if (remove.has(g)) remove.delete(g); else add.add(g); });
  next.groups.remove.forEach(g => { if (add.has(g)) add.delete(g); else remove.add(g); });
  old.groups = { add: Array.from(add), remove: Array.from(remove) };
  old.modified = next.modified;
  if (!old.expectGroupsHash) old.expectGroupsHash = next.expectGroupsHash;
  delete old.conflict;
  return list;
}

// Apply pending edits to the text of a .bib file. An edit whose entry (or,
// for group changes, the group list) was changed since the edit was made is
// skipped, not forced. Returns {edited, applied, skipped}; throws if the
// result doesn't check out, so nothing gets written.
// groupsHash: the group list's fingerprint to check edits against, when
// groups were just added to `text` (edits were made before those).
function applyEdits_(text, edits, groupsHash) {
  const before = parseBib_(text);
  const groupsNow = groupsHash || fingerprint_(groupsComment_(before[1]));
  let edited = text;
  const applied = [], skipped = [];
  edits.forEach(ed => {
    try {
      const loc = locateEntry_(edited, ed.key);
      if (ed.expectHash && fingerprint_(edited.slice(loc.start, loc.end)) !== ed.expectHash) {
        throw new Error('It was changed (perhaps in BibDesk) after this edit was made.');
      }
      const changingGroups = ed.groups.add.length + ed.groups.remove.length > 0;
      if (changingGroups && ed.expectGroupsHash && groupsNow !== ed.expectGroupsHash) {
        throw new Error('The static groups were changed (perhaps in BibDesk) after this edit was made.');
      }
      // No date for reading-list changes: BibDesk doesn't date group membership.
      let next = editEntry_(edited, ed.key, Object.assign({}, ed.set, ed.modified ? { 'date-modified': ed.modified } : {}));
      if (changingGroups) next = editGroups_(next, ed.key, ed.groups.add, ed.groups.remove);
      edited = next;
      applied.push(ed);
    } catch (err) {
      skipped.push({ key: ed.key, reason: String((err && err.message) || err) });
    }
  });
  if (applied.length) {
    const after = parseBib_(edited);
    if (after[0].length !== before[0].length) throw new Error('Applying the edits would have changed the number of entries, so nothing was saved.');
    const fields = new Map(after[0].map(x => [x[1], x[2]]));
    const groups = staticGroups_(after[1]);
    applied.forEach(ed => {
      const f = fields.get(ed.key) || {};
      Object.keys(ed.set).forEach(n => {
        const want = ed.set[n] == null ? '' : String(ed.set[n]);
        if ((f[n] === undefined ? '' : f[n]) !== want) throw new Error('The ' + n + ' field of ' + ed.key + ' didn\u2019t come out as expected, so nothing was saved.');
      });
      ed.groups.add.concat(ed.groups.remove).forEach(name => {
        const g = groups.find(x => x.name === name);
        if (!g || (g.keys.indexOf(ed.key) >= 0) !== (ed.groups.add.indexOf(name) >= 0)) {
          throw new Error('The group \u201c' + name + '\u201d didn\u2019t come out as expected, so nothing was saved.');
        }
      });
    });
  }
  return { edited: edited, applied: applied, skipped: skipped };
}

/* ------------------------------------------------------------ filing PDFs */

// The folder and file name BibDesk's AutoFile gives a PDF with the format
// "%A1/%Y - %T, %n2%e": first author's surname (without "van", "de" and
// the like) and initial as the folder, then year and title. The caller adds
// the two-digit number that makes the name unique, and reuses an existing
// folder whose name differs only in accents.
function autoFileName_(fields) {
  const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const safe = s => clean_(s).replace(/:/g, '').replace(/\//g, '-').replace(/\s+/g, ' ').trim();
  const people = parseNames_(fields.author || fields.editor || '');
  let folder = 'Anonymous';
  if (people.length && people[0][0]) {
    const words = people[0][0].split(/\s+/);
    while (words.length > 1 && isLower_(words[0][0])) words.shift();
    const initial = (plain(people[0][1] || '').match(/\p{L}/u) || [''])[0].toUpperCase();
    folder = safe(words.join(' ')) + (initial ? '.' + initial : '');
  }
  let title = safe(latexToUnicode_(fields.title || '')) || 'Untitled';
  if (title.length > 200) title = title.slice(0, 200).replace(/\s+\S*$/, '');
  const year = safe(latexToUnicode_(fields.year || '')) || 'n.d.';
  return { folder: folder, base: year + ' - ' + title };
}

// A bdsk-file-N value that holds only the path, relative to the .bib's
// folder, as a binary property list. BibDesk finds the file from the path
// and adds its own bookmark when it next saves.
function bdskFileBytes_(relPath) {
  const out = [];
  const push = (v, size) => { for (let k = size - 1; k >= 0; k--) out.push(Math.floor(v / Math.pow(256, k)) % 256); };
  const str = s => {
    const ascii = /^[\x00-\x7f]*$/.test(s);
    const n = s.length;
    const marker = ascii ? 0x50 : 0x60;
    if (n < 15) out.push(marker | n);
    else if (n < 256) { out.push(marker | 0x0f, 0x10); push(n, 1); }
    else { out.push(marker | 0x0f, 0x11); push(n, 2); }
    for (let i = 0; i < n; i++) {
      const c = s.charCodeAt(i);
      if (ascii) out.push(c); else push(c, 2);
    }
  };
  out.push(0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30); // "bplist00"
  const offsets = [out.length];
  out.push(0xd1, 0x01, 0x02);
  offsets.push(out.length);
  str('relativePath');
  offsets.push(out.length);
  str(relPath);
  const tableOffset = out.length;
  const offSize = tableOffset < 256 ? 1 : 2;
  offsets.forEach(o => push(o, offSize));
  push(0, 6);
  out.push(offSize, 1);
  push(offsets.length, 8);
  push(0, 8);
  push(tableOffset, 8);
  return out;
}

// Insert a new entry after the last entry in the file (so before BibDesk's
// groups comment at the end).
function appendEntry_(text, entryText) {
  const ENTRY = /@(\w+)\s*\{/g;
  let m, lastEnd = -1;
  while ((m = ENTRY.exec(text))) {
    const end = matchBrace_(text, ENTRY.lastIndex - 1);
    ENTRY.lastIndex = Math.max(end, ENTRY.lastIndex);
    const type = m[1].toLowerCase();
    if (type !== 'comment' && type !== 'string' && type !== 'preamble') lastEnd = end;
  }
  const body = entryText.replace(/\s+$/, '');
  if (lastEnd < 0) return text.replace(/\s*$/, '\n\n') + body + '\n';
  return text.slice(0, lastEnd) + '\n\n' + body + text.slice(lastEnd);
}

// Make sure the file has a static group called `name` (adding BibDesk's
// "Static Groups" comment if the file has no static groups at all).
function ensureStaticGroup_(text, name) {
  const xml = v => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dict = '\t<dict>\n\t\t<key>group name</key>\n\t\t<string>' + xml(name) + '</string>\n\t\t<key>keys</key>\n\t\t<string></string>\n\t</dict>\n';
  const at = text.indexOf('@comment{BibDesk Static Groups{');
  if (at < 0) {
    return text.replace(/\s*$/, '\n\n') + '@comment{BibDesk Static Groups{\n<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE plist PUBLIC "-' + '/' + '/Apple' + '/' + '/DTD PLIST 1.0' + '/' + '/EN" "http:' + '/' + '/www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
      '<plist version="1.0">\n<array>\n' + dict + '</array>\n</plist>\n}}\n';
  }
  const end = matchBrace_(text, at + '@comment'.length);
  const block = text.slice(at, end);
  if (staticGroups_([block.slice('@comment{'.length, -1)]).some(g => g.name === name)) return text;
  const close = block.lastIndexOf('</array>');
  if (close < 0) throw new Error('LibLande couldn' + '\u2019' + 't read your static groups.');
  return text.slice(0, at) + block.slice(0, close) + dict + block.slice(close) + text.slice(end);
}

// A new cite key for an entry: the entry itself, the static groups that
// list it, and other entries' crossref, xdata and related fields that
// name it. (LaTeX documents that cite the old key aren't LibLande's to
// change.)
const KEY_LINK_FIELDS_ = ['crossref', 'xdata', 'related'];
function renameKey_(text, oldKey, newKey) {
  newKey = String(newKey || '').trim();
  if (!newKey) throw new Error('Type the new cite key.');
  if (!/^[^\s,{}()"'#%~\\=]+$/.test(newKey)) {
    throw new Error('A cite key can\u2019t have spaces, commas, braces, quotation marks, or any of ( ) # % ~ \\ =.');
  }
  const entries = parseBib_(text)[0];
  const clash = entries.find(e => e[1] !== oldKey && e[1].toLowerCase() === newKey.toLowerCase());
  if (clash) throw new Error('There\u2019s already a publication with the cite key ' + clash[1] + '.');
  const loc = locateEntry_(text, oldKey);
  const head = text.slice(loc.start, loc.fieldsStart);
  const at = head.lastIndexOf(oldKey);
  let out = text.slice(0, loc.start) + head.slice(0, at) + newKey + head.slice(at + oldKey.length) + text.slice(loc.fieldsStart);
  parseBib_(out)[0].forEach(e => {
    const set = {};
    KEY_LINK_FIELDS_.forEach(n => {
      if (e[2][n] == null) return;
      const parts = e[2][n].split(',');
      if (parts.some(p => p.trim() === oldKey)) set[n] = parts.map(p => (p.trim() === oldKey ? p.replace(oldKey, newKey) : p)).join(',');
    });
    if (Object.keys(set).length) out = editEntry_(out, e[1], set);
  });
  const g = out.indexOf('@comment{BibDesk Static Groups{');
  if (g >= 0) {
    const end = matchBrace_(out, g + '@comment'.length);
    const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const comment = out.slice(g, end).replace(/(<key>keys<\/key>\s*<string>)([\s\S]*?)(<\/string>)/g,
      (m, a, list, b) => a + list.split(',').map(k => (k.trim() === xml(oldKey) ? k.replace(xml(oldKey), xml(newKey)) : k)).join(',') + b);
    out = out.slice(0, g) + comment + out.slice(end);
  }
  return out;
}
// The rename came out right: the same entries under the new name, and
// every group and link that had the old key now has the new one.
function checkRename_(before, after, oldKey, newKey) {
  const fail = () => { throw new Error('The new cite key didn\u2019t come out as expected, so LibLande didn\u2019t save it.'); };
  const a = parseBib_(before), b = parseBib_(after);
  if (a[0].length !== b[0].length || b[0].some(e => e[1] === oldKey) || b[0].filter(e => e[1] === newKey).length !== 1) fail();
  const ga = staticGroups_(a[1]), gb = staticGroups_(b[1]);
  if (ga.length !== gb.length) fail();
  ga.forEach((g, i) => {
    const want = g.keys.map(k => (k === oldKey ? newKey : k)).join(',');
    if (gb[i].name !== g.name || gb[i].keys.join(',') !== want) fail();
  });
  return b;
}

;if (self.document) (self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {}).build = '2026-10-04.02';
