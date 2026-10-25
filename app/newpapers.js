// LibLande: New papers: new work that cites yours, by authors you follow, like papers you choose, and in your journals.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, chapters, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/newpapers.js'] = '2026-10-25.03';
/* ------------------------------------------------------------ new papers */
// Found with OpenAlex (citations, authors, journals) and Semantic Scholar
// (papers like your examples), asked from this page: no key, and no email
// sent; they see the DOIs, names and journals looked up. Checked at most
// once a day, while LibLande is open, and with Check now. What you follow
// and what you dismiss go to your other devices with your preferences;
// what was found is kept on this device.
const NP_JOURNALS = [
  ['The Philosophical Review', '0031-8108'], ['Mind & Language', '0268-1064'], ['The British Journal for the Philosophy of Science', '0007-0882'],
  ['The Journal of Philosophy', '0022-362X'], ['Philosophy and Phenomenological Research', '0031-8205'], ['Noûs', '0029-4624'],
  ['Journal of Experimental Psychology: General', '0096-3445'], ['Journal of Vision', '1534-7362'],
];
const NP_KINDS = [['cites', 'Citing you'], ['authors', 'Authors'], ['like', 'Similar'], ['journals', 'Journals']];
const NP = {
  cfg: store.get('npCfg', null), gone: store.get('npGone', {}), items: store.get('npItems', []),
  seen: store.get('npSeen', {}), checked: store.get('npChecked', 0), errors: store.get('npErrors', {}), busy: null, tab: 'top', journal: '', jAdd: false,
};
ICON.refresh = '<svg class="i" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
ICON.sliders = '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>';
ICON.bell = '<svg class="i" viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
const npFetch = (u, o) => (window.LIBLANDE_NP_FETCH || fetch)(u, o);
const NP_OA = 'https:\/\/api.openalex.org', NP_S2 = 'https:\/\/api.semanticscholar.org/recommendations/v1/papers';
const npDoi = d => String(d || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();
const npDay = t => new Date(t).toISOString().slice(0, 10);
const npTitleKey = t => norm(String(t || '').replace(/<[^>]+>/g, '')).replace(/[^a-z0-9]+/g, '');
const DAY = 86400000;

// (Your papers and the examples: null until chosen, meaning a saved search
// called My pubs and a group called Favorites, looked for when needed, as
// saved searches can arrive a moment after the library.)
function npDefaults() {
  return { on: { cites: true, authors: true, like: true, journals: true }, mine: null, authors: null,
    journals: NP_JOURNALS.map(([name, issn]) => ({ name, issn })), like: null, at: 0 };
}
const npCfg = () => NP.cfg || (NP.cfg = npDefaults());
function npPick(cfg, k) {
  if (cfg[k] != null) return cfg[k];
  if (k === 'mine') { const x = SMART.list.find(y => /^my (pubs|papers|publications)/i.test(y.name)); return x ? 'q:' + x.name : ''; }
  const g = GROUPS.find(y => /favou?rites/i.test(y.name));
  return g ? 's:' + g.name : 'toread';
}
function npSave(synced) {
  store.set('npCfg', NP.cfg); store.set('npGone', NP.gone);
  if (synced && gs && SYNC.alerts !== false) google.script.run.withFailureHandler(() => {}).savePrefs({ npCfg: NP.cfg, npGone: NP.gone });
}
function npMerge(prefs) {
  if (!prefs || SYNC.alerts === false) return;
  if (prefs.npCfg && (!NP.cfg || (prefs.npCfg.at || 0) > (NP.cfg.at || 0))) NP.cfg = prefs.npCfg;
  Object.entries(prefs.npGone || {}).forEach(([k, v]) => { if (!NP.gone[k]) NP.gone[k] = v; });
  npSave(false);
}

// Lists to choose from: your papers, and the examples for Similar.
function npSources() {
  return [['toread', 'Reading list'], ['added', 'Added lately (the last 25)']]
    .concat(GROUPS.filter(g => !(gs && g === readingGroup())).map(g => ['s:' + g.name, g.name]))
    .concat(SMART.list.map(x => ['q:' + x.name, x.name + ' (saved search)']));
}
function npList(id) {
  if (!id) return [];
  if (id === 'added') return ENTRIES.filter(e => e.added).sort((a, b) => (b.added > a.added ? 1 : -1)).slice(0, 25);
  return groupItems(id) || [];
}
// You: the name on (more than half) your papers, so you aren't one of the
// authors you follow.
function npMe() {
  const mine = npList(npPick(npCfg(), 'mine')), n = new Map();
  mine.forEach(e => (e.a || []).forEach(a => n.set(nameKey(a), (n.get(nameKey(a)) || 0) + 1)));
  const top = [...n].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > mine.length / 2 ? top[0] : '';
}

async function npOa(path, params) {
  const r = await npFetch(NP_OA + path + '?' + new URLSearchParams(params));
  if (!r.ok) throw new Error('OpenAlex didn’t answer (' + r.status + ')');
  return r.json();
}
// OpenAlex's works for DOIs, 50 at a time (a DOI with , or | can't be
// asked for this way).
async function npByDoi(dois, select) {
  dois = [...new Set(dois.filter(d => d && !/[,|]/.test(d)))];
  const out = [];
  for (let i = 0; i < dois.length; i += 50) out.push(...(await npOa('/works', { filter: 'doi:' + dois.slice(i, i + 50).join('|'), select, 'per-page': 50 })).results);
  return out;
}
// The authors who appear most in your library (not you), found in OpenAlex
// by way of their papers' DOIs, so it's the right person of that name.
async function npSuggestAuthors(n, have) {
  const me = npMe(), skip = new Set((have || []).map(a => a.id)), count = new Map();
  ENTRIES.forEach(e => (e.a || []).forEach(a => {
    const k = nameKey(a);
    if (k === me) return;
    const c = count.get(k) || { n: 0, a, dois: [] };
    c.n++;
    const d = npDoi(e.f.doi);
    if (d) c.dois.push([e.yearN || 0, d]);
    count.set(k, c);
  }));
  const top = [...count.values()].filter(c => c.dois.length).sort((x, y) => y.n - x.n).slice(0, n + skip.size + 4);
  const want = new Map();
  top.forEach(c => c.dois.sort((a, b) => b[0] - a[0]).slice(0, 3).forEach(([, d]) => want.set(d, c)));
  const works = await npByDoi([...want.keys()], 'doi,authorships');
  const votes = new Map();
  works.forEach(w => {
    const c = want.get(npDoi(w.doi));
    if (!c) return;
    const sur = norm(c.a[0]).split(/\s+/).pop();
    (w.authorships || []).forEach(au => {
      const nm = au.author && au.author.id && au.author.display_name;
      if (!nm || !norm(nm).split(/[\s‐-]+/).includes(sur)) return;
      const v = votes.get(c) || new Map(), id = au.author.id.split('/').pop();
      v.set(id, { id, name: nm, n: ((v.get(id) || {}).n || 0) + 1 });
      votes.set(c, v);
    });
  });
  return top.map(c => votes.has(c) ? [...votes.get(c).values()].sort((a, b) => b.n - a.n)[0] : null)
    .filter(x => x && !skip.has(x.id)).slice(0, n).map(x => ({ id: x.id, name: x.name }));
}

// Abstracts: asked for when you open one (not with the lists: hundreds,
// mostly unread), from OpenAlex by DOI, or else Semantic Scholar; kept on
// this device (the last 300). OpenAlex keeps an abstract as each word's
// places: put back in order.
const NP_ABS = new Map(Object.entries(store.get('npAbs', {})));
const NP_OPEN = new Set();
const npPath = s => String(s).split('/').map(encodeURIComponent).join('/');
const npUninvert = inv => {
  if (!inv) return '';
  const words = [];
  for (const [w, at] of Object.entries(inv)) for (const i of at) words[i] = w;
  return words.filter(Boolean).join(' ');
};
async function npAbstract(x) {
  if (NP_ABS.has(x.id)) return NP_ABS.get(x.id);
  let text = '';
  if (x.doi) {
    try {
      // (A DOI's slash kept as it is: the rest of it made safe.)
      const r = await npFetch(NP_OA + '/works/doi:' + npPath(x.doi) + '?select=abstract_inverted_index');
      if (r.ok) text = npUninvert((await r.json()).abstract_inverted_index);
    } catch (err) { /* (tried at Semantic Scholar) */ }
  }
  if (!text) {
    const s2 = x.doi ? 'DOI:' + x.doi : String(x.id).replace(/^s2:/, '');
    if (x.doi || /^s2:/.test(x.id)) {
      const r = await npFetch('https:\/\/api.semanticscholar.org/graph/v1/paper/' + npPath(s2) + '?fields=abstract');
      if (r.ok) text = String((await r.json()).abstract || '');
      else if (r.status !== 404) throw new Error('Semantic Scholar didn\u2019t answer (' + r.status + ')');
    }
  }
  text = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/^abstract[:.\s]+/i, '').trim();
  NP_ABS.delete(x.id);
  NP_ABS.set(x.id, text);
  while (NP_ABS.size > 300) NP_ABS.delete(NP_ABS.keys().next().value);
  store.set('npAbs', Object.fromEntries(NP_ABS));
  return text;
}
// An abstract opened or closed, in its place (the list isn't drawn again).
async function npToggleAbstract(item, x) {
  const btn = item.querySelector('[data-np-abs]'), box = item.querySelector('.np-abs');
  const open = !NP_OPEN.has(x.id);
  if (open) NP_OPEN.add(x.id); else NP_OPEN.delete(x.id);
  btn.setAttribute('aria-expanded', String(open));
  box.hidden = !open;
  if (!open || NP_ABS.has(x.id)) { if (open) box.textContent = NP_ABS.get(x.id) || 'No abstract is to be had for this one.'; return; }
  box.textContent = 'Getting the abstract\u2026';
  box.classList.add('np-abs-wait');
  try {
    const text = await npAbstract(x);
    box.textContent = text || 'No abstract is to be had for this one.';
  } catch (err) {
    box.textContent = 'Couldn\u2019t get the abstract: ' + errText(err);
    NP_OPEN.delete(x.id);
  } finally { box.classList.remove('np-abs-wait'); }
}

// An OpenAlex work as an item.
function npFromOa(w, why) {
  const src = w.primary_location && w.primary_location.source;
  const doi = npDoi(w.doi);
  return {
    id: doi ? 'doi:' + doi : w.id, doi, title: String(w.title || '').replace(/<[^>]+>/g, ''),
    authors: (w.authorships || []).map(a => a.author && a.author.display_name).filter(Boolean),
    venue: src ? src.display_name : '', date: w.publication_date || '', url: doi ? 'https:\/\/doi.org/' + doi : w.id, why,
  };
}
async function npOaWorks(filter, why, extra) {
  const d = await npOa('/works', Object.assign({ filter, select: 'id,doi,title,publication_date,authorships,primary_location,type', sort: 'publication_date:desc', 'per-page': 200 }, extra || {}));
  return d.results.map(w => npFromOa(w, why(w)));
}

// Checking: each kind asked for in turn (one failing doesn't stop the
// others), what's already in the library or dismissed left out, and the
// rest merged with what was found before.
function npCheck() {
  if (NP.busy) return NP.busy;
  NP.busy = (async () => {
    const cfg = npCfg(), since = npDay(Date.now() - 45 * DAY), found = [], errors = {};
    if (cfg.authors == null) {
      try { cfg.authors = await npSuggestAuthors(12); cfg.at = Date.now(); npSave(true); } catch (err) { errors.authors = errText(err); }
    }
    const run = async (kind, f) => { if (!cfg.on[kind]) return; try { found.push(...await f()); } catch (err) { errors[kind] = errText(err); } };
    await run('cites', async () => {
      const mine = await npByDoi(npList(npPick(cfg, 'mine')).map(e => npDoi(e.f.doi)), 'id,doi,title');
      if (!mine.length) return [];
      const name = new Map(mine.map(w => [w.id, String(w.title || '').replace(/<[^>]+>/g, '')]));
      return npOaWorks('cites:' + [...name.keys()].map(id => id.split('/').pop()).join('|') + ',from_publication_date:' + since,
        w => { const r = (w.referenced_works || []).filter(x => name.has(x)).slice(0, 2); return r.length ? r.map(x => ({ k: 'cites', t: 'Cites your \u201c' + name.get(x) + '\u201d' })) : [{ k: 'cites', t: 'Cites your work' }]; },
        { select: 'id,doi,title,publication_date,authorships,primary_location,type,referenced_works', 'per-page': 100 });
    });
    await run('authors', async () => {
      const ids = (cfg.authors || []).map(a => a.id), out = [];
      for (let i = 0; i < ids.length; i += 50) {
        const set = new Set(ids.slice(i, i + 50));
        out.push(...await npOaWorks('authorships.author.id:' + [...set].join('|') + ',from_publication_date:' + since, w =>
          (w.authorships || []).filter(a => a.author && a.author.id && set.has(a.author.id.split('/').pop())).map(a => ({ k: 'authors', t: 'By ' + a.author.display_name }))));
      }
      return out;
    });
    await run('journals', async () => {
      const issns = (cfg.journals || []).map(j => j.issn).filter(Boolean);
      if (!issns.length) return [];
      return npOaWorks('primary_location.source.issn:' + issns.join('|') + ',type:article,from_publication_date:' + since,
        w => [{ k: 'journals', t: 'New in ' + ((w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || 'your journals') }]);
    });
    await run('like', async () => {
      const ex = npList(npPick(cfg, 'like')).filter(e => npDoi(e.f.doi)).slice(-40).slice(0, 25);
      if (!ex.length) return [];
      const r = await npFetch(NP_S2 + '?fields=title,externalIds,authors,venue,publicationDate,year&limit=40', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positivePaperIds: ex.map(e => 'DOI:' + npDoi(e.f.doi)) }),
      });
      if (!r.ok) throw new Error('Semantic Scholar didn’t answer (' + r.status + ')');
      const what = npSources().find(s => s[0] === npPick(cfg, 'like'));
      return ((await r.json()).recommendedPapers || []).map(p => {
        const doi = npDoi(p.externalIds && p.externalIds.DOI);
        return { id: doi ? 'doi:' + doi : 's2:' + p.paperId, doi, title: p.title || '', authors: (p.authors || []).map(a => a.name), venue: p.venue || '',
          date: p.publicationDate || (p.year ? String(p.year) : ''), url: doi ? 'https:\/\/doi.org/' + doi : 'https:\/\/www.semanticscholar.org/paper/' + p.paperId,
          why: [{ k: 'like', t: 'Like papers in ' + (what ? what[1] : 'your examples') }] };
      }).filter(x => x.date >= npDay(Date.now() - 120 * DAY));
    });
    // Merged with what was found before: one item a paper, with every reason.
    const by = new Map(NP.items.map(x => [x.id, x]));
    found.forEach(x => {
      if (!x.title) return;
      const old = by.get(x.id);
      if (!old) { by.set(x.id, Object.assign(x, { found: Date.now() })); return; }
      x.why.forEach(w => { if (!old.why.some(o => o.k === w.k && o.t === w.t)) old.why.push(w); });
    });
    const keep = npDay(Date.now() - 120 * DAY);
    NP.items = [...by.values()].filter(x => !NP.gone[x.id] && (x.date || '9') >= keep).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    NP.checked = Date.now();
    NP.errors = errors;
    store.set('npItems', NP.items); store.set('npChecked', NP.checked); store.set('npErrors', NP.errors);
  })().finally(() => {
    NP.busy = null;
    renderGroups();
    if (sheet && sheet.mode === 'newpapers') npRender();
  });
  return NP.busy;
}
// Once a day, a little after LibLande opens.
let npAutoSet = false;
function npAuto() {
  if (npAutoSet) return;
  npAutoSet = true;
  setTimeout(() => {
    if (!gs || !navigator.onLine || (window.LIBLANDE_TEST && !window.LIBLANDE_NP_FETCH)) return;
    if (Date.now() - NP.checked > 20 * 3600000) npCheck().catch(() => {});
  }, window.LIBLANDE_TEST ? 0 : 20000);
}

// What's shown: not dismissed, and not in the library (by DOI or title).
function npVisible() {
  const dois = new Set(), titles = new Set();
  ENTRIES.forEach(e => { const d = npDoi(e.f.doi); if (d) dois.add(d); titles.add(npTitleKey(e.f.title)); });
  return NP.items.filter(x => !NP.gone[x.id] && !(x.doi && dois.has(x.doi)) && !titles.has(npTitleKey(x.title)));
}
const npUnseen = () => npVisible().filter(x => !NP.seen[x.id]).length;
const npToolCount = () => { const n = gs ? npUnseen() : 0; return n ? '<span class="ct np-ct">' + n + '</span>' : ''; };

/* ---------- the panel */
function openNewPapers() {
  // (What's new since last time is marked, then counts as seen.)
  sheet = { mode: 'newpapers', fresh: new Set(npVisible().filter(x => !NP.seen[x.id]).map(x => x.id)) };
  showSheet('<div id="npBody"></div>', 'Done');
  $('#sheetCancel').hidden = true;
  npRender();
  const now = Date.now();
  npVisible().forEach(x => { NP.seen[x.id] = NP.seen[x.id] || now; });
  Object.keys(NP.seen).forEach(k => { if (now - NP.seen[k] > 200 * DAY) delete NP.seen[k]; });
  store.set('npSeen', NP.seen);
  renderGroups();
  if (!NP.checked && !NP.busy) npCheck().catch(() => {});
}
const npJournalList = (jn, all) => [['', 'All journals', all]].concat([...jn].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v, n]) => [v, v, n]));
const npAuthors = a => !a.length ? '' : a.length > 3 ? a.slice(0, 2).join(', ') + ' et al.' : a.join(', ');
function npRender() {
  const box = $('#npBody');
  if (!box || !sheet || sheet.mode !== 'newpapers') return;
  const all = npVisible(), tab = NP.tab;
  const of = k => all.filter(x => x.why.some(w => w.k === k));
  // (All: what cites you first, then authors you follow, similar papers and
  // your journals; the newest first in each.)
  const rank = x => Math.min(...x.why.map(w => NP_KINDS.findIndex(k => k[0] === w.k)));
  const byRank = all.slice().sort((a, b) => rank(a) - rank(b) || (b.date || '').localeCompare(a.date || ''));
  // (Top 15: by how much each reason counts, more for more reasons, then the newest.)
  const WEIGHT = { cites: 100, authors: 40, like: 25, journals: 10 };
  const score = x => x.why.reduce((n, w) => n + (WEIGHT[w.k] || 0), 0);
  const list = tab === 'all' ? byRank : tab === 'top' ? all.slice().sort((a, b) => score(b) - score(a) || (b.date || '').localeCompare(a.date || '')).slice(0, 15) : of(tab);
  const errs = Object.entries(NP.errors || {});
  const dateText = d => { if (!d) return ''; const t = new Date(d + (d.length === 10 ? 'T12:00' : '')); return isNaN(t) ? d : t.toLocaleDateString([], { month: 'short', day: 'numeric', year: t.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
  // (Journals: one at a time, or all of them.)
  const jn = new Map();
  if (tab === 'journals') list.forEach(x => { if (x.venue) jn.set(x.venue, (jn.get(x.venue) || 0) + 1); });
  if (NP.journal && !jn.has(NP.journal)) NP.journal = '';
  const shown = tab === 'journals' && NP.journal ? list.filter(x => x.venue === NP.journal) : list;
  const touch = matchMedia('(pointer: coarse)').matches;
  box.innerHTML = `<div class="np-pull" aria-hidden="true">${ICON.refresh}</div>` +
    `<div class="np-head"><h2>New papers</h2>` +
    `<button type="button" class="tb-btn${NP.busy ? ' spinning' : ''}" data-np-check${NP.busy ? ' disabled' : ''} title="Check for new papers now" aria-label="Check for new papers now">${ICON.refresh}</button>` +
    `<button type="button" class="tb-btn" data-np-follow title="Choose what to follow" aria-label="Choose what to follow">${ICON.sliders}</button></div>` +
    `<p class="sheet-note np-status">${NP.busy ? 'Checking\u2026' : (NP.checked ? 'Checked ' + msAgo(NP.checked) : 'Not checked yet') + (touch ? ' \u00b7 pull down to check again' : '')}</p>` +
    (errs.length ? `<p class="np-err">${errs.map(([k, m]) => esc((NP_KINDS.find(x => x[0] === k) || [k, k])[1] + ': ' + m)).join('<br>')}</p>` : '') +
    `<div class="np-tabs" role="tablist">` + [['top', 'Top 15', Math.min(15, all.length)], ['all', 'All', all.length]].concat(NP_KINDS.map(([k, l]) => [k, l, of(k).length])).map(([k, l, n]) =>
      `<button type="button" role="tab" class="np-tab" data-np-tab="${k}" aria-selected="${tab === k}">${l}<span class="ct">${n}</span></button>`).join('') + `</div>` +
    (tab === 'journals' ? `<div class="np-jrow">` +
      (jn.size > 1 ? `<button type="button" class="tb-btn" data-np-step="-1" aria-label="The journal before" title="The journal before">${ICON.chev}</button>` : '') +
      `<div class="np-tabs np-journals">` + (jn.size > 1 ? npJournalList(jn, list.length) : [...jn].map(([v, n]) => [v, v, n])).map(([v, l, n]) =>
      `<button type="button" class="np-tab" data-np-j="${esc(v)}" aria-selected="${NP.journal === v}">${esc(l.replace(/^The /, ''))}<span class="ct">${n}</span></button>`).join('') + `</div>` +
      (jn.size > 1 ? `<button type="button" class="tb-btn np-next" data-np-step="1" aria-label="The next journal" title="The next journal">${ICON.chev}</button>` : '') +
      `<button type="button" class="tb-btn np-jadd${NP.jAdd ? ' on' : ''}" data-np-jadd aria-expanded="${NP.jAdd}" aria-label="Follow another journal" title="Follow another journal">${ICON.plus}</button></div>` +
      (NP.jAdd ? `<div class="npf-find np-jfind"><input type="search" data-npf-find="journals" placeholder="Follow a journal: type its name" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="npf-hits" data-npf-hits="journals"></div></div>` : '') : '') +
    (shown.length ? `<div class="np-list">` + shown.map(x => { const cites = x.why.some(w => w.k === 'cites'); return '' +
      `<div class="np-item${sheet.fresh.has(x.id) ? ' fresh' : ''}${cites ? ' cites' : ''}" data-np="${esc(x.id)}">` +
      (cites ? `<div class="np-badge">${ICON.quote}Cites you</div>` : '') +
      `<div class="np-why">${x.why.map(w => esc(w.t)).join(' \u00b7 ')}</div>` +
      `<a class="np-title" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` +
      `<div class="np-meta">${esc(npAuthors(x.authors))}${x.venue ? ' · <i>' + esc(x.venue) + '</i>' : ''}${x.date ? ' · ' + esc(dateText(x.date)) : ''}</div>` +
      // (Its abstract, opened and closed in place.)
      `<button type="button" class="np-abs-btn" data-np-abs aria-expanded="${NP_OPEN.has(x.id)}">${ICON.chev}<span>Abstract</span></button>` +
      `<div class="np-abs"${NP_OPEN.has(x.id) ? '' : ' hidden'}>${NP_OPEN.has(x.id) ? esc(NP_ABS.get(x.id) || 'No abstract is to be had for this one.') : ''}</div>` +
      `<div class="np-acts">${x.doi && gs ? `<button type="button" class="btn" data-np-add>${ICON.plus}<span>Add…</span></button><button type="button" class="btn" data-np-rl>${ICON.bookmark}<span>Reading list…</span></button>` : ''}` +
      `<button type="button" class="btn np-gone" data-np-gone>${ICON.x}<span>Dismiss</span></button></div></div>`; }).join('') + `</div>`
      : `<p class="ms-dim np-none">${NP.busy ? 'Looking…' : NP.checked ? 'Nothing new here. LibLande looks again tomorrow, or now with Check now.' : 'LibLande looks for new papers once a day.'}</p>`);
}
// (The journal chosen, scrolled into view in its row.)
function npShowJournal() {
  const b = $('#npBody') && $('#npBody').querySelector('[data-np-j][aria-selected="true"]'), row = b && b.parentElement;
  if (b) row.scrollLeft = b.offsetLeft - row.offsetLeft - (row.clientWidth - b.offsetWidth) / 2;
}
function npAdd(id, rl) {
  const x = NP.items.find(y => y.id === id);
  if (!x || !x.doi) return;
  openAdd();
  // (Back to New papers once it's added, or not.)
  sheet.npBack = true;
  $('#doiLookup').value = x.doi;
  $('#doiGo').click();
  if (rl) $('#addRL').checked = true;
}
$('#sheetBody').addEventListener('click', ev => {
  if (!sheet || sheet.mode !== 'newpapers') return;
  const t = ev.target.closest('[data-np-tab]');
  if (t) { NP.tab = t.dataset.npTab; npRender(); return; }
  if (ev.target.closest('[data-np-jadd]')) { NP.jAdd = !NP.jAdd; npRender(); if (NP.jAdd) $('#npBody [data-npf-find]').focus(); return; }
  // A journal chosen from the search: followed, and looked in at once.
  const pick = ev.target.closest('[data-npf-pick]');
  if (pick) {
    const r = sheet.hits[+pick.dataset.npfPick.split(':')[1]], c = npCfg();
    if (!c.journals.some(x => x.issn === r.issn_l)) { c.journals.push({ name: r.display_name, issn: r.issn_l }); c.on.journals = true; c.at = Date.now(); npSave(true); }
    NP.jAdd = false; NP.journal = r.display_name;
    toast('Following ' + r.display_name, 2500);
    npCheck().catch(() => {}); npRender();
    return;
  }
  const j = ev.target.closest('[data-np-j]');
  if (j) { NP.journal = j.dataset.npJ; npRender(); npShowJournal(); return; }
  const step = ev.target.closest('[data-np-step]');
  if (step) {
    const vs = [...$('#npBody').querySelectorAll('[data-np-j]')].map(b => b.dataset.npJ);
    NP.journal = vs[(vs.indexOf(NP.journal) + +step.dataset.npStep + vs.length) % vs.length];
    npRender(); npShowJournal();
    return;
  }
  if (ev.target.closest('[data-np-check]')) { npCheck().catch(() => {}); npRender(); return; }
  if (ev.target.closest('[data-np-follow]')) { openFollow(); return; }
  const item = ev.target.closest('[data-np]');
  if (!item) return;
  const id = item.dataset.np;
  if (ev.target.closest('[data-np-abs]')) { const x = NP.items.find(y => y.id === id); if (x) npToggleAbstract(item, x); return; }
  if (ev.target.closest('[data-np-add]')) { npAdd(id, false); return; }
  if (ev.target.closest('[data-np-rl]')) { npAdd(id, true); return; }
  if (ev.target.closest('[data-np-gone]')) {
    NP.gone[id] = Date.now();
    Object.keys(NP.gone).forEach(k => { if (Date.now() - NP.gone[k] > 200 * DAY) delete NP.gone[k]; });
    npSave(true);
    item.classList.add('going');
    setTimeout(() => { npRender(); renderGroups(); }, 180);
  }
});

// Pull down (on a phone or iPad) to check again: the list follows the
// finger, and past the mark, letting go checks.
(() => {
  let y0 = null, pull = 0, scroller = null;
  const body = () => $('#npBody');
  const scrollerOf = el => { for (let p = el; p && p !== document.body; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p; return document.scrollingElement; };
  const set = d => {
    const b = body();
    if (!b) return;
    pull = d;
    b.style.transform = d ? 'translateY(' + d + 'px)' : '';
    b.classList.toggle('pulling', d > 0);
    b.classList.toggle('ready', d > 64);
    const ic = b.querySelector('.np-pull');
    if (ic) ic.style.transform = 'rotate(' + Math.round(d * 4) + 'deg)';
  };
  $('#sheet').addEventListener('touchstart', ev => {
    if (!sheet || sheet.mode !== 'newpapers' || NP.busy || ev.touches.length > 1 || !body()) return;
    scroller = scrollerOf(body());
    y0 = scroller.scrollTop <= 0 ? ev.touches[0].clientY : null;
  }, { passive: true });
  $('#sheet').addEventListener('touchmove', ev => {
    if (y0 == null) return;
    const d = ev.touches[0].clientY - y0;
    if (d <= 0 || scroller.scrollTop > 0) { if (pull) set(0); return; }
    ev.preventDefault();
    set(Math.min(90, d * 0.5));
  }, { passive: false });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    const go = pull > 64, b = body();
    if (b) { b.classList.add('settling'); setTimeout(() => b.classList.remove('settling'), 250); }
    set(0);
    if (go) { npCheck().catch(() => {}); npRender(); }
  };
  $('#sheet').addEventListener('touchend', end);
  $('#sheet').addEventListener('touchcancel', end);
})();

/* ---------- what to follow */
function openFollow() {
  const c = npCfg();
  sheet = { mode: 'npfollow', cfg: JSON.parse(JSON.stringify(Object.assign({}, c, { authors: c.authors || [], mine: npPick(c, 'mine'), like: npPick(c, 'like') }))) };
  showSheet('<div id="npfBody"></div>', 'Save');
  sheet.npBack = true;
  npfRender();
}
function npfRender() {
  const box = $('#npfBody'), c = sheet && sheet.cfg;
  if (!box || !c) return;
  const opts = sel => npSources().map(([v, l]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const mine = npList(c.mine), withDoi = mine.filter(e => npDoi(e.f.doi)).length;
  const sw = k => `<span class="switch"><input type="checkbox" role="switch" data-npf-on="${k}"${c.on[k] ? ' checked' : ''}><span aria-hidden="true"></span></span>`;
  const chip = (kind, i, label, title) => `<span class="np-chip" title="${esc(title || label)}">${esc(label)}<button type="button" data-npf-del="${kind}:${i}" aria-label="Stop following ${esc(label)}">${ICON.x}</button></span>`;
  box.innerHTML = `<h2>What to follow</h2>` +
    `<p class="sheet-note">LibLande asks OpenAlex and Semantic Scholar from this device. They see the DOIs, names and journals it asks about, never your email or your .bib file.</p>` +
    `<section class="npf-sec"><div class="npf-head"><span class="set-name">Papers that cite yours</span>${sw('cites')}</div>` +
    `<label class="npf-row">Your papers <select data-npf-sel="mine"><option value="">None chosen</option>${opts(c.mine)}</select></label>` +
    `<p class="hint">${mine.length ? mine.length + ' publication' + (mine.length === 1 ? '' : 's') + (withDoi < mine.length ? ', ' + withDoi + ' with a DOI (only those can be followed)' : '') : 'Choose the list or saved search that has your own papers.'}</p></section>` +
    `<section class="npf-sec"><div class="npf-head"><span class="set-name">Authors you follow</span>${sw('authors')}</div>` +
    `<div class="np-chips">${c.authors.map((a, i) => chip('authors', i, a.name)).join('') || '<span class="hint">None yet.</span>'}</div>` +
    `<div class="npf-find"><input type="search" data-npf-find="authors" placeholder="Add an author…" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="npf-hits" data-npf-hits="authors"></div></div>` +
    `<button type="button" class="linkish" data-npf-suggest>Suggest more from your library</button></section>` +
    `<section class="npf-sec"><div class="npf-head"><span class="set-name">Papers like these</span>${sw('like')}</div>` +
    `<label class="npf-row">Examples <select data-npf-sel="like">${opts(c.like)}</select></label>` +
    `<p class="hint">Semantic Scholar suggests new papers like those (up to 25 with DOIs).</p></section>` +
    `<section class="npf-sec"><div class="npf-head"><span class="set-name">New in your journals</span>${sw('journals')}</div>` +
    `<div class="np-chips">${c.journals.map((j, i) => chip('journals', i, j.name, j.name + ' (' + j.issn + ')')).join('') || '<span class="hint">None yet.</span>'}</div>` +
    `<div class="npf-find"><input type="search" data-npf-find="journals" placeholder="Add a journal…" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="npf-hits" data-npf-hits="journals"></div></div></section>`;
}
async function npfSearch(kind, q) {
  const hits = $(`[data-npf-hits="${kind}"]`);
  if (!hits) return;
  if (q.length < 3) { hits.innerHTML = ''; return; }
  try {
    const d = kind === 'authors'
      ? await npOa('/authors', { search: q, select: 'id,display_name,works_count,last_known_institutions', 'per-page': 6 })
      : await npOa('/sources', { search: q, select: 'id,display_name,issn_l,works_count,type', 'per-page': 6 });
    if (!sheet || !/^(npfollow|newpapers)$/.test(sheet.mode) || !hits.isConnected) return;
    const rows = d.results.filter(r => kind === 'authors' || r.issn_l);
    sheet.hits = rows;
    hits.innerHTML = rows.length ? rows.map((r, i) => `<button type="button" data-npf-pick="${kind}:${i}"><b>${esc(r.display_name)}</b><span>${esc(kind === 'authors'
      ? [((r.last_known_institutions || [])[0] || {}).display_name, r.works_count + ' works'].filter(Boolean).join(' · ')
      : [r.issn_l, r.works_count + ' works'].join(' · '))}</span></button>`).join('') : '<p class="hint">Nothing found.</p>';
  } catch (err) { if (hits.isConnected) hits.innerHTML = `<p class="hint">${esc(errText(err))}</p>`; }
}
let npfTimer = 0;
$('#sheetBody').addEventListener('input', ev => {
  const f = ev.target.closest('[data-npf-find]');
  if (!f || !sheet || !/^(npfollow|newpapers)$/.test(sheet.mode)) return;
  clearTimeout(npfTimer);
  npfTimer = setTimeout(() => npfSearch(f.dataset.npfFind, f.value.trim()), 300);
});
$('#sheetBody').addEventListener('change', ev => {
  if (!sheet || sheet.mode !== 'npfollow') return;
  const on = ev.target.closest('[data-npf-on]'), sel = ev.target.closest('[data-npf-sel]');
  if (on) sheet.cfg.on[on.dataset.npfOn] = on.checked;
  if (sel) { sheet.cfg[sel.dataset.npfSel] = sel.value; npfRender(); }
});
$('#sheetBody').addEventListener('click', async ev => {
  if (!sheet || sheet.mode !== 'npfollow') return;
  const c = sheet.cfg, del = ev.target.closest('[data-npf-del]'), pick = ev.target.closest('[data-npf-pick]');
  if (del) { const [k, i] = del.dataset.npfDel.split(':'); c[k].splice(+i, 1); npfRender(); return; }
  if (pick) {
    const [k, i] = pick.dataset.npfPick.split(':'), r = sheet.hits[+i];
    if (k === 'authors' && !c.authors.some(a => a.id === r.id.split('/').pop())) c.authors.push({ id: r.id.split('/').pop(), name: r.display_name });
    if (k === 'journals' && !c.journals.some(j => j.issn === r.issn_l)) c.journals.push({ name: r.display_name, issn: r.issn_l });
    npfRender();
    return;
  }
  const sug = ev.target.closest('[data-npf-suggest]');
  if (sug) {
    sug.disabled = true; sug.textContent = 'Looking…';
    try {
      const more = await npSuggestAuthors(6, c.authors);
      if (sheet && sheet.cfg === c) { c.authors.push(...more); npfRender(); if (!more.length) sheetMsg('No more to suggest.'); }
    } catch (err) { sheetMsg(errText(err), true); sug.disabled = false; sug.textContent = 'Suggest more from your library'; }
  }
});
function saveFollow() {
  NP.cfg = Object.assign(sheet.cfg, { at: Date.now() });
  npSave(true);
  closeSheet();
  npCheck().catch(() => {});
}
