// LibLande: Find a PDF: a publication's free copy, or the article through your library's proxy, opened in a new tab.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, newpapers, ocr, split, outline, findpdf, titlesearch, keywords, tour, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/findpdf.js'] = '2026-10-19.04';
/* ------------------------------------------------------------ find a PDF */
// For a publication: its free copy, found through OpenAlex (which carries
// Unpaywall's open-access data, and needs no email), or the article
// through a library proxy (as EZproxy), opened in a new tab. LibLande can't
// fetch either itself (sites don't let a web page read their PDFs, and the
// proxy needs your library sign-in, in your browser): you save the PDF and
// drop it on the publication (or Attach it). See docs/pdf-helper.md for a
// helper that could fetch free copies straight into Drive.
// Proxies: { name, typed, prefix }, the prefix being the start of a link
// that, with an article's address after it, opens it through the proxy.
// Kept with your settings, so every device has them.
const PROXIES = store.get('proxies', { at: 0, list: [] });
function proxiesSave() {
  PROXIES.at = Date.now();
  store.set('proxies', PROXIES);
  clearTimeout(proxiesSave.t);
  proxiesSave.t = setTimeout(() => { if (gs) google.script.run.withFailureHandler(() => {}).savePrefs({ proxies: PROXIES }); }, 1500);
}
function proxiesMerge(prefs) {
  const x = prefs && prefs.proxies;
  if (!x || (x.at || 0) <= PROXIES.at) return;
  PROXIES.at = x.at;
  PROXIES.list = Array.isArray(x.list) ? x.list : [];
  store.set('proxies', PROXIES);
}
// A proxy's address as typed: its name ("ezproxy.library.yorku.ca"), or its
// whole login link ("https://.../login?url="), or a link with {url} where
// the article's address goes.
function proxyPrefix(typed) {
  let t = String(typed || '').trim();
  if (!t) return '';
  if (!/^https?:\/\//i.test(t)) t = 'https:\/\/' + t;
  if (/\{url\}/.test(t)) return t;
  try {
    const u = new URL(t);
    if (/[?&]url=/i.test(u.search)) return t.replace(/([?&]url=).*$/i, '$1');
    if (/[?&]qurl=/i.test(u.search)) return t.replace(/([?&]qurl=).*$/i, '$1');
    return u.origin + '/login?url=';
  } catch (err) { return ''; }
}
const proxyLink = (p, target) => /\{url\}/.test(p.prefix) ? p.prefix.replace('{url}', encodeURIComponent(target)) : p.prefix + target;
const proxyName = p => p.name || (() => { try { return new URL(p.prefix).hostname.replace(/^(ezproxy|proxy|login|www)\d*\./, ''); } catch (err) { return 'your library'; } })();
// What to open: the DOI's link, or else the publication's own link.
const findTarget = e => {
  const doi = String(e.f.doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  return doi ? 'https:\/\/doi.org/' + doi : (e.u || []).find(u => safeUrl(u)) || '';
};
// The choices, for the details (as a menu's items).
function findPdfItems(e) {
  if (!findTarget(e)) return '';
  const doi = String(e.f.doi || '').trim();
  return (doi ? `<button type="button" role="menuitem" data-find-pdf="oa">${FIND_ICON}<span>Free copy (open access)</span></button>` : '') +
    PROXIES.list.map((p, i) => `<button type="button" role="menuitem" data-find-pdf="p:${i}">${ICON.lib}<span>Through ${esc(proxyName(p))}</span></button>`).join('');
}
const FIND_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V13"/><path d="M14 3.5v4h4"/><path d="M7 3.5a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h4"/><circle cx="16.5" cy="17" r="3"/><path d="M18.7 19.2l2 2"/></svg>';

// (after: what to say once it's open; by default, to drop the PDF on the
// publication.)
async function findPdf(e, how, after) {
  after = after || (what => afterFind(e, what));
  if (how === 'setup') { openProxySettings(); return; }
  const target = findTarget(e);
  if (!target) return;
  if (how.startsWith('p:')) {
    const p = PROXIES.list[+how.slice(2)];
    if (!p || !p.prefix) return;
    window.open(proxyLink(p, target), '_blank', 'noopener');
    after('It\u2019s open through ' + proxyName(p) + ' (sign in there if asked).');
    return;
  }
  // The free copy: the tab opened now (a browser allows one only straight
  // after a click), and sent there once it's found.
  const w = window.open('', '_blank');
  try { if (w) { w.document.title = 'Finding a free copy\u2026'; w.document.body.style.font = '15px -apple-system, system-ui, sans-serif'; w.document.body.textContent = 'Finding a free copy\u2026'; } } catch (err) { /* (another site's) */ }
  let url = '', page = false;
  try {
    const doi = target.replace(/^https:\/\/doi\.org\//, '');
    const r = await npFetch(NP_OA + '/works/doi:' + npPath(doi) + '?select=best_oa_location,locations,open_access');
    if (r.ok) {
      const w2 = await r.json(), locs = [w2.best_oa_location].concat((w2.locations || []).filter(l => l && l.is_oa)).filter(Boolean);
      const pdf = locs.find(l => safeUrl(l.pdf_url || ''));
      if (pdf) url = pdf.pdf_url;
      else {
        url = (locs.find(l => safeUrl(l.landing_page_url || '')) || {}).landing_page_url || (w2.open_access && w2.open_access.oa_url) || '';
        page = !!url;
      }
    } else if (r.status !== 404) throw new Error('OpenAlex didn\u2019t answer (' + r.status + ')');
  } catch (err) {
    if (w) w.close();
    toast('Couldn\u2019t look for a free copy: ' + errText(err), 5000);
    return;
  }
  if (!url || !safeUrl(url)) {
    if (w) w.close();
    const p = PROXIES.list[0];
    toast('No free copy of it is known.' + (p ? '' : ' A library proxy can open it through your library.'), 6000,
      p ? { label: 'Through ' + proxyName(p), run: () => findPdf(e, 'p:0') } : { label: 'Set up a proxy', run: openProxySettings });
    return;
  }
  if (w) { try { w.opener = null; } catch (err) { /* (gone) */ } w.location.href = url; } else window.open(url, '_blank', 'noopener');
  after(page ? 'Its free copy\u2019s page is open (the PDF is a link there).' : 'Its free copy is open.');
}
// In Add a publication: beside the file chooser, for the DOI (or link)
// filled in so far; then the PDF saved is chosen there (or dropped on the
// panel).
function addFindEntry() {
  const v = n => { const el = $('#sheetBody').querySelector(`[data-field="${n}"]`); return el ? el.value.trim() : ''; };
  const typed = ($('#doiLookup') && $('#doiLookup').value.trim()) || '';
  const doi = v('doi') || (/^(https?:\/\/(dx\.)?doi\.org\/)?10\.\d{4,}\//i.test(typed) ? typed : '');
  return { k: '', f: { doi }, u: [v('url')].filter(Boolean), ib: true };
}
$('#sheetBody').addEventListener('toggle', ev => {
  if (!sheet || sheet.mode !== 'add' || ev.target.id !== 'addFind' || !ev.target.open) return;
  const items = findPdfItems(addFindEntry());
  $('#addFindList').innerHTML = items || `<p class="menu-note">Fill in its DOI (or its link) first${PROXIES.list.length ? '' : '; a library proxy can be added in Settings'}.</p>`;
}, true);
$('#sheetBody').addEventListener('click', ev => {
  const b = sheet && sheet.mode === 'add' && ev.target.closest('#addFindList [data-find-pdf]');
  if (!b) return;
  $('#addFind').open = false;
  findPdf(addFindEntry(), b.dataset.findPdf, what => toast(what + ' Save the PDF, then choose it here (or drop it on this panel).', 10000,
    { label: 'Choose file\u2026', run: () => { const f = $('#addPdf'); if (f) f.click(); } }));
});
// Then: save the PDF, and drop it on the publication (or Attach it).
function afterFind(e, what) {
  toast(what + ' Save the PDF, then drop it on the publication, or Attach it.', 10000,
    gs && !e.ib ? { label: 'Attach\u2026', run: () => { if (state.selKey !== e.k) return; $('#attachInput').click(); } } : null);
}

// Settings: the proxies, each a name and an address, with the link an
// article would open through (to check it).
function renderProxies() {
  const box = $('#proxyList');
  if (!box) return;
  box.innerHTML = PROXIES.list.map((p, i) => `<div class="proxy-row" data-proxy="${i}">` +
    `<input type="text" class="proxy-name" value="${esc(p.name || '')}" placeholder="Its name, as York University Libraries" aria-label="The proxy\u2019s name" autocomplete="off">` +
    `<input type="text" class="proxy-addr" value="${esc(p.typed || '')}" placeholder="ezproxy.library.yorku.ca" aria-label="The proxy\u2019s address" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">` +
    `<button type="button" class="tb-btn" data-proxy-del aria-label="Remove this proxy" title="Remove">${ICON.x}</button>` +
    `<span class="hint proxy-eg">${p.prefix ? 'An article opens as ' + esc(proxyLink(p, 'https:\/\/doi.org/10.\u2026')) : 'Type its address, as ezproxy.library.yorku.ca.'}</span></div>`).join('');
}
function openProxySettings() {
  const b = $('#settingsBtn');
  if (!b || b.hidden) { toast('Library proxies are in Settings, once your library is set up.', 3500); return; }
  b.click();
  setTimeout(() => {
    const sec = $('#proxySec');
    if (!sec) return;
    sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (!PROXIES.list.length) { PROXIES.list.push({ name: '', typed: '', prefix: '' }); renderProxies(); }
    const a = sec.querySelector('.proxy-row:last-child .proxy-addr');
    if (a) a.focus();
  }, 350);
}
$('#proxyAdd').addEventListener('click', () => {
  PROXIES.list.push({ name: '', typed: '', prefix: '' });
  renderProxies();
  const a = $('#proxyList .proxy-row:last-child .proxy-addr');
  if (a) a.focus();
});
$('#proxyList').addEventListener('input', ev => {
  const row = ev.target.closest('[data-proxy]'), p = row && PROXIES.list[+row.dataset.proxy];
  if (!p) return;
  if (ev.target.matches('.proxy-name')) p.name = ev.target.value.trim();
  if (ev.target.matches('.proxy-addr')) { p.typed = ev.target.value.trim(); p.prefix = proxyPrefix(p.typed); }
  row.querySelector('.proxy-eg').textContent = p.prefix ? 'An article opens as ' + proxyLink(p, 'https:\/\/doi.org/10.\u2026') : 'Type its address, as ezproxy.library.yorku.ca.';
  proxiesSave();
  renderDetail();
});
$('#proxyList').addEventListener('click', ev => {
  const row = ev.target.closest('[data-proxy]');
  if (!row || !ev.target.closest('[data-proxy-del]')) return;
  PROXIES.list.splice(+row.dataset.proxy, 1);
  proxiesSave();
  renderProxies();
  renderDetail();
});
// (Proxies with no address aren't kept when Settings closes.)
function proxiesTidy() {
  const n = PROXIES.list.length;
  PROXIES.list = PROXIES.list.filter(p => p.prefix);
  if (PROXIES.list.length !== n) { proxiesSave(); renderDetail(); }
}
