// LibLande for Word: the citations' text, worked out for the whole
// document at once (APA 7th edition), and the References list. No Word in
// here: given the document's citations and the library, it says what each
// citation reads and what the list holds. Uses app/apa.js (apaCitationOf,
// apaInText, origYear), loaded before it.
//
// A citation: { items: [{ k, page }], form: 'paren' | 'narr' | 'year',
// pre: 'see', own: true if its works were put in an order of one's own }.
'use strict';
(function (root) {
  const NAMES = e => (e.a && e.a.length ? e.a : (e.e || []));
  const nameKey = e => NAMES(e).map(n => norm(n[0] + ' ' + (n[1] || ''))).join('|');
  // (Surnames only, as a citation reads: what letters and order go by.)
  const surKey = e => NAMES(e).map(n => norm(n[0])).join('|');
  const baseYear = e => (origYear(e) ? origYear(e) + '/' : '') + (((e.f.year || '').trim()) || 'n.d.');

  // Pages as APA writes them: "7" -> "p. 7", "20-24" -> "pp. 20-24";
  // "para. 3", "chap. 2", "pp. 4-5" kept as typed.
  function pageText(p) {
    p = String(p || '').trim();
    if (!p) return '';
    if (/^\p{L}/u.test(p)) return p.replace(/(\d)\s*-+\s*(\d)/g, '$1\u2013$2');
    const n = p.replace(/\s*-+\s*/g, '\u2013');
    return (/[\u2013,]/.test(n) ? 'pp. ' : 'p. ') + n;
  }
  // What goes before, with APA's comma after "e.g." and "i.e.".
  function preText(pre) {
    pre = String(pre || '').trim();
    if (!pre) return '';
    return /^(e\.g\.|i\.e\.)$/i.test(pre) ? pre + ', ' : pre + ' ';
  }

  // Year letters (2011a, 2011b) for works with the same authors' surnames
  // and year, in the order of their titles; and the authors' short form for each
  // work, with more names where two "et al." forms would read the same.
  // First authors with the same surname: one person if their initials fit
  // together ("E. J." and "E."), different people if they don't ("E." and
  // "A."). Different people get their initials in every citation, as APA
  // asks: (E. J. Green, 2024; A. Green, 2024). Returns, by work, which
  // person its first author is, and the initials it's cited with.
  function people(entries) {
    const initials = n => String((n && n[1]) || '').split(/[\s.\-]+/).filter(Boolean).map(w => w[0].toUpperCase());
    const fits = (a, b) => { const n = Math.min(a.length, b.length); return a.slice(0, n).join() === b.slice(0, n).join(); };
    const bySur = new Map();
    entries.forEach(e => {
      const n = NAMES(e)[0];
      if (!n) return;
      const sur = norm(n[0]);
      if (!bySur.has(sur)) bySur.set(sur, []);
      bySur.get(sur).push({ e, ini: initials(n) });
    });
    const who = new Map(), shown = new Map();
    bySur.forEach((list, sur) => {
      const groups = [];
      // (The fullest initials first, so "E." joins "E. J." rather than
      // starting a person of its own.)
      list.slice().sort((a, b) => b.ini.length - a.ini.length).forEach(x => {
        const g = groups.find(g => fits(g.ini, x.ini));
        if (g) g.items.push(x); else groups.push({ ini: x.ini, items: [x] });
      });
      groups.forEach((g, i) => g.items.forEach(x => {
        who.set(x.e.k, sur + ':' + i);
        if (groups.length > 1 && g.ini.length) shown.set(x.e.k, g.ini.map(c => c + '.').join(' '));
      }));
    });
    return { who, shown };
  }

  function plan(entries) {
    const P0 = people(entries);
    const groups = new Map();
    entries.forEach(e => {
      if (!NAMES(e).length) return;
      // (By the people, as the citations read: "Green, E. J." and "Green,
      // E." in two entries are one author; "Green, A." another.)
      const g = P0.who.get(e.k) + '|' + NAMES(e).slice(1).map(n => norm(n[0])).join('|') + '#' + baseYear(e);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(e);
    });
    const letter = new Map();
    groups.forEach(list => {
      if (list.length < 2) return;
      list.sort((a, b) => cmpStr(norm(a.f.title || ''), norm(b.f.title || '')));
      list.forEach((e, i) => letter.set(e.k, String.fromCharCode(97 + i)));
    });
    // Short forms: one name, two names, or the first and "et al."; where two
    // different author lists come out the same (with the same year), more
    // names until they differ.
    const shortOf = (e, n) => {
      const L = NAMES(e).map(x => x[0]);
      if (L.length === 1) return [L[0]];
      if (L.length === 2) return [L[0], L[1]];
      return n >= L.length ? L : L.slice(0, n).concat(['et al.']);
    };
    const used = new Map();
    entries.forEach(e => { if (NAMES(e).length) used.set(e.k, 1); });
    for (let round = 0; round < 6; round++) {
      const seen = new Map();
      entries.forEach(e => {
        if (!NAMES(e).length) return;
        const s = shortOf(e, used.get(e.k));
        const key = s.join('|') + '#' + baseYear(e);
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key).push(e);
      });
      let changed = false;
      seen.forEach(list => {
        const kinds = new Set(list.map(nameKey));
        if (kinds.size < 2) return;
        list.forEach(e => { if (NAMES(e).length > used.get(e.k)) { used.set(e.k, used.get(e.k) + 1); changed = true; } });
      });
      if (!changed) break;
    }
    const names = new Map();
    entries.forEach(e => { if (NAMES(e).length) names.set(e.k, shortOf(e, used.get(e.k))); });
    return { letter, names, initials: P0.shown };
  }

  // The authors as they read: "Smith & Lee" in parentheses, "Smith and
  // Lee" in a sentence; "Smith, Lee, & Park" with more names written out.
  function who(e, P, narr) {
    let s = P.names.get(e.k);
    if (!s) {
      // (No authors or editors: the title's first words, as apaInText.)
      const t = apaInText(e).text;
      return t.slice(1, t.lastIndexOf(','));
    }
    const amp = narr ? 'and' : '&';
    // (A first author who shares a surname with another: with initials.)
    if (P.initials && P.initials.has(e.k)) s = [P.initials.get(e.k) + ' ' + s[0]].concat(s.slice(1));
    const etal = s[s.length - 1] === 'et al.';
    const L = etal ? s.slice(0, -1) : s;
    if (etal) return L.length === 1 ? L[0] + ' et al.' : L.join(', ') + ', et al.';
    if (L.length === 1) return L[0];
    if (L.length === 2) return L[0] + ' ' + amp + ' ' + L[1];
    return L.slice(0, -1).join(', ') + ', ' + amp + ' ' + L[L.length - 1];
  }
  const yearOf = (e, P) => baseYear(e) + (P.letter.get(e.k) ? (/n\.d\.$/.test(baseYear(e)) ? '-' : '') + P.letter.get(e.k) : '');

  // APA's order for the works in one citation: by authors, then year.
  function order(items, byKey) {
    const key = it => { const e = byKey.get(it.k); return e ? (surKey(e) || norm(e.f.title || '')) + ' ' + baseYear(e) + ' ' + norm(e.f.title || '') : it.k; };
    return items.slice().sort((a, b) => cmpStr(key(a), key(b)));
  }

  // A work's place in the References list: by surnames, then year (with its
  // letter), then initials and title.
  const refKey = (e, P) => (surKey(e) || norm(e.f.title || '')) + ' ' + yearOf(e, P) + ' ' + nameKey(e) + ' ' + norm(e.f.title || '');

  // The words before each work of a citation ("see also" before the second),
  // in its order: each work's own, the citation's (from before works had
  // their own) the first's. None in a sentence (Author (2011)).
  function itemsOf(c, byKey) {
    const items = (c.own ? c.items : order(c.items, byKey)).filter(it => byKey.has(it.k));
    return items.map((it, i) => ({ k: it.k, page: it.page, pre: c.form === 'narr' ? '' : String(it.pre || (i === 0 ? c.pre || '' : '')).trim() }));
  }
  // One citation's text, given the plan.
  function citeText(c, byKey, P) {
    const items = itemsOf(c, byKey);
    if (!items.length) return '(citation not found)';
    // Works by the same authors, next to each other, share their names:
    // (Kahneman, 2003, 2011); not when words come between them.
    const groups = [];
    items.forEach(it => {
      const e = byKey.get(it.k), w = who(e, P, c.form === 'narr');
      const y = yearOf(e, P) + (pageText(it.page) ? ', ' + pageText(it.page) : '');
      const last = groups[groups.length - 1];
      if (last && last.w === w && !it.pre) last.years.push(y); else groups.push({ w, pre: it.pre, years: [y] });
    });
    if (c.form === 'year') return '(' + groups.map(g => preText(g.pre) + g.years.join(', ')).join('; ') + ')';
    if (c.form === 'narr') {
      const parts = groups.map(g => g.w + ' (' + g.years.join(', ') + ')');
      return parts.length === 1 ? parts[0] : parts.length === 2 ? parts.join(' and ')
        : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
    }
    return '(' + groups.map(g => preText(g.pre) + g.w + ', ' + g.years.join(', ')).join('; ') + ')';
  }

  // Everything: each citation's text (by id), the References list (works
  // in APA's order, each {k, text, html}), and the works not found.
  function render(cites, byKey) {
    const keys = [...new Set(Object.values(cites).flatMap(c => c.items.map(it => it.k)))];
    const entries = keys.map(k => byKey.get(k)).filter(Boolean);
    const missing = keys.filter(k => !byKey.has(k));
    const P = plan(entries);
    const texts = {};
    Object.keys(cites).forEach(id => { texts[id] = citeText(cites[id], byKey, P); });
    const refs = entries.slice()
      .sort((a, b) => cmpStr(refKey(a, P), refKey(b, P)))
      .map(e => {
        const y = yearOf(e, P);
        const shown = y === baseYear(e) ? e : Object.assign({}, e, { f: Object.assign({}, e.f, { year: y.replace(/^\d{4}\//, '') }) });
        const r = apaCitationOf(shown);
        return { k: e.k, text: r.text, html: r.html, parts: r.parts };
      });
    return { texts, refs, missing, letters: P.letter };
  }

  // How many citations each work has in the document.
  function counts(cites) {
    const n = new Map();
    Object.values(cites).forEach(c => c.items.forEach(it => n.set(it.k, (n.get(it.k) || 0) + 1)));
    return n;
  }

  /* ---- citations typed by hand, found in a paragraph's text */
  // "(Allen, 2024; see also Kellman, 2002, p. 4)", "(Allen 2024)",
  // "Stanovich (1999)", "Tversky and Kahneman (1974)", "Evans et al.
  // (2016)". Each: { text, at, form, parts: [{ text, pre, names, etal,
  // years: [{ y, letter }], page }] }. Parentheses that don't read as
  // citations (no year, or a name that isn't one) are passed over.
  const YEAR = '(?:\\d{4}[a-z]?|n\\.d\\.(?:-[a-z])?)';
  const PARTICLES = /^(van|von|de|der|den|du|la|le|di|da|del|dos|das|ten|ter)$/;
  function splitYears(s) {
    return s.split(/\s*,\s*/).map(y => { const m = /^(\d{4}|n\.d\.)-?([a-z]?)$/.exec(y); return m ? { y: m[1], letter: m[2] || '' } : null; });
  }
  function namesOf(s) {
    let etal = false;
    s = s.trim().replace(/,?\s+et al\.?$/, () => { etal = true; return ''; });
    const names = s.split(/\s*,\s*&\s*|\s*&\s*|\s*,\s*and\s+|\s+and\s+|\s*,\s*/u).map(n => n.replace(/^(\p{Lu}\.\s*)+/u, '').trim());
    const ok = names.length && names.length <= 6 && names.every(n => n && n.length < 40 && !/\d/.test(n) && n.split(/\s+/).length <= 3 &&
      /\p{Lu}/u.test(n.split(/\s+/).filter(w => !PARTICLES.test(w))[0] || ''));
    return ok ? { names, etal } : null;
  }
  function parsePart(part) {
    const m = new RegExp('^(.*?),?\\s+(' + YEAR + '(?:,\\s*' + YEAR + ')*)(?:,\\s*(.+))?$', 'u').exec(part.trim());
    if (!m) return null;
    // (The words before: lowercase ones ahead of the first name, "see
    // also", "e.g.,", "for a review, see"; "van" or "de" go with the name.)
    const words = m[1].split(/\s+/);
    let i = 0;
    while (i < words.length - 1 && /^[a-z]/.test(words[i])) i++;
    while (i > 0 && PARTICLES.test(words[i - 1])) i--;
    const pre = words.slice(0, i).join(' ').replace(/[,;]$/, ''), who = namesOf(words.slice(i).join(' '));
    const years = splitYears(m[2]);
    if (!who || years.some(y => !y)) return null;
    return { text: part.trim(), pre, names: who.names, etal: who.etal, years, page: (m[3] || '').trim() };
  }
  function findTyped(text) {
    const out = [];
    const paren = /\(([^()]{4,250})\)/g;
    let m;
    while ((m = paren.exec(text))) {
      const parts = m[1].split(/\s*;\s*/).map(parsePart);
      if (parts.length && parts.every(Boolean)) out.push({ text: m[0], at: m.index, form: 'paren', parts });
    }
    const narr = new RegExp('((?:(?:' + PARTICLES.source.slice(2, -2) + ')\\s+)?\\p{Lu}[\\p{L}\'\\u2019-]+(?:\\s+(?:and|&)\\s+\\p{Lu}[\\p{L}\'\\u2019-]+|\\s+et al\\.)?)\\s+\\((' + YEAR + '(?:,\\s*' + YEAR + ')*)(?:,\\s*([^()]{1,40}))?\\)', 'gu');
    while ((m = narr.exec(text))) {
      const start = m.index, end = m.index + m[0].length;
      if (out.some(o => o.form === 'paren' && start < o.at + o.text.length && o.at < end)) continue;
      const who = namesOf(m[1]), years = splitYears(m[2]);
      if (!who || years.some(y => !y)) continue;
      out.push({ text: m[0], at: start, form: 'narr', parts: [{ text: m[0], pre: '', names: who.names, etal: who.etal, years, page: (m[3] || '').trim() }] });
    }
    return out.sort((a, b) => a.at - b.at);
  }
  // The works a typed part could be, for each of its years: by the first
  // author's surname and the year, then the other names (and "et al."),
  // and a year's letter (2011b) as the References would letter them.
  // [{ cands: [entry], pick: entry|null, sure }].
  function matchTyped(part, entries) {
    const sur = n => norm(String(n || '').replace(/[{}\\]/g, '')).replace(/[\u2019']/g, '');
    const want = part.names.map(sur);
    return part.years.map(yr => {
      let cands = entries.filter(e => {
        const L = NAMES(e);
        if (!L.length || sur(L[0][0]) !== want[0]) return false;
        if (((e.f.year || '').trim() || 'n.d.') !== yr.y && !((e.f.year || '').includes(yr.y) && yr.y !== 'n.d.')) return false;
        if (part.etal) return L.length > want.length && want.every((w, i) => sur(L[i][0]) === w);
        if (want.length > 1) return L.length === want.length && want.every((w, i) => sur(L[i][0]) === w);
        return true;
      });
      // (One author named: those with that one author first.)
      if (!part.etal && want.length === 1 && cands.some(e => NAMES(e).length === 1)) cands = cands.filter(e => NAMES(e).length === 1);
      cands.sort((a, b) => cmpStr(norm(a.f.title || ''), norm(b.f.title || '')));
      let pick = cands[0] || null, sure = cands.length === 1;
      if (yr.letter && cands.length > 1) {
        const i = yr.letter.charCodeAt(0) - 97;
        if (cands[i]) { pick = cands[i]; sure = true; }
      }
      return { cands, pick, sure };
    });
  }

  root.LLWord = { render, citeText, plan, pageText, preText, order, counts, findTyped, matchTyped };
})(typeof window !== 'undefined' ? window : globalThis);
