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

  // Pages as APA writes them: "7" -> "p. 7", "20-24" -> "pp. 20–24";
  // "para. 3", "chap. 2", "pp. 4–5" kept as typed.
  function pageText(p) {
    p = String(p || '').trim();
    if (!p) return '';
    if (/^\p{L}/u.test(p)) return p.replace(/(\d)\s*-+\s*(\d)/g, '$1–$2');
    const n = p.replace(/\s*-+\s*/g, '–');
    return (/[–,]/.test(n) ? 'pp. ' : 'p. ') + n;
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
  function plan(entries) {
    const groups = new Map();
    entries.forEach(e => {
      if (!NAMES(e).length) return;
      // (By surnames, as the citations read: "Green, E. J." and "Green, E."
      // in two entries are one author to a reader.)
      const g = surKey(e) + '#' + baseYear(e);
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
    return { letter, names };
  }

  // The authors as they read: "Smith & Lee" in parentheses, "Smith and
  // Lee" in a sentence; "Smith, Lee, & Park" with more names written out.
  function who(e, P, narr) {
    const s = P.names.get(e.k);
    if (!s) {
      // (No authors or editors: the title's first words, as apaInText.)
      const t = apaInText(e).text;
      return t.slice(1, t.lastIndexOf(','));
    }
    const amp = narr ? 'and' : '&';
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

  // One citation's text, given the plan.
  function citeText(c, byKey, P) {
    const items = (c.own ? c.items : order(c.items, byKey)).filter(it => byKey.has(it.k));
    if (!items.length) return '(citation not found)';
    // Works by the same authors, next to each other, share their names:
    // (Kahneman, 2003, 2011).
    const groups = [];
    items.forEach(it => {
      const e = byKey.get(it.k), w = who(e, P, c.form === 'narr');
      const y = yearOf(e, P) + (pageText(it.page) ? ', ' + pageText(it.page) : '');
      const last = groups[groups.length - 1];
      if (last && last.w === w) last.years.push(y); else groups.push({ w, years: [y] });
    });
    if (c.form === 'year') return '(' + groups.map(g => g.years.join(', ')).join('; ') + ')';
    if (c.form === 'narr') {
      const parts = groups.map(g => g.w + ' (' + g.years.join(', ') + ')');
      return parts.length === 1 ? parts[0] : parts.length === 2 ? parts.join(' and ')
        : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
    }
    return '(' + preText(c.pre) + groups.map(g => g.w + ', ' + g.years.join(', ')).join('; ') + ')';
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
        return { k: e.k, text: r.text, html: r.html };
      });
    return { texts, refs, missing, letters: P.letter };
  }

  // How many citations each work has in the document.
  function counts(cites) {
    const n = new Map();
    Object.values(cites).forEach(c => c.items.forEach(it => n.set(it.k, (n.get(it.k) || 0) + 1)));
    return n;
  }

  root.LLWord = { render, citeText, plan, pageText, preText, order, counts };
})(typeof window !== 'undefined' ? window : globalThis);
