// LibLande: messages, navigation, and starting up.
// (One of the app's scripts, which share one scope, loaded in order by
// index.html: library, reader, editing, citecheck, start.)
'use strict';
(self.LIBLANDE_PARTS = self.LIBLANDE_PARTS || {})['app/start.js'] = '2026-10-12.03';
// On GitHub Pages, every part of the app must be from the same version: a
// part kept from an older one (the offline copy, served when the network
// was slow) lacks what this page needs. Then the kept copies go, and the
// page opens again, once, from the network (and starting up waits).
// (Here, in the last of the app's scripts, so all of them are in.)
let RELOADING = false;
if (window.LIBLANDE_PAGES && navigator.onLine) {
  const want = (($('#version') || {}).textContent || '').replace('Version ', '');
  const parts = window.LIBLANDE_PARTS || {};
  const old = ['server', 'builder', 'edits', 'build', 'app/library.js', 'app/reader.js', 'app/editing.js', 'app/citecheck.js', 'app/start.js'].filter(k => parts[k] !== want);
  if (want && old.length) {
    let tried = false;
    try { tried = sessionStorage.getItem('liblande.partsFixed') === want; } catch (e) { tried = true; }
    if (!tried) {
      try { sessionStorage.setItem('liblande.partsFixed', want); } catch (e) { /* tried once anyway */ }
      const again = () => location.reload();
      RELOADING = true;
      (window.caches ? caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('liblande-app-') === 0).map(k => caches.delete(k)))) : Promise.resolve()).then(again, again);
    } else {
      console.warn('LibLande: parts from another version: ' + old.join(', '));
    }
  }
}
/* ------------------------------------------------------------ clipboard + toast */
let toastTimer;
// action: {label, run}, a button in the message (such as Undo).
function toast(msg, ms = 1800, action) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  t.classList.toggle('has-action', !!action);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => { t.classList.remove('show'); clearTimeout(toastTimer); action.run(); });
    t.append(b);
  }
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  placeToast();
  clearInterval(placeToast.t);
  placeToast.t = setInterval(() => { if (t.classList.contains('show')) placeToast(); else clearInterval(placeToast.t); }, 400);
}
// A message stays clear of what's along the bottom while reading: the
// markup toolbar (wherever it's been moved), the button it tucks into,
// "Back to page", the "Finished it?" bar. It sits above the highest of
// them that's under it (looked at again while it shows, as they move).
function placeToast() {
  const t = $('#toast');
  if ($('#viewer').hidden) { t.style.bottom = ''; return; }
  t.style.bottom = '';
  const tr = t.getBoundingClientRect(), H = innerHeight;
  let lift = 0;
  document.querySelectorAll('#vPalette, .vp-show, #vBack, #quoteBar').forEach(el => {
    if (!el || el.hidden || !el.offsetParent) return;
    const r = el.getBoundingClientRect();
    if (!r.width || r.top < H * 0.45) return;
    // (Only one that's under the message, side to side.)
    if (r.right < tr.left - 6 || r.left > tr.right + 6) return;
    lift = Math.max(lift, H - r.top + 10);
  });
  if (lift) t.style.bottom = lift + 'px';
}
function copy(text, msg, html) {
  const fallback = () => {
    document.querySelector('.copybox')?.remove();
    const box = document.createElement('div');
    box.className = 'copybox';
    box.innerHTML = `<div><span>Select all and copy</span><button class="btn">Done</button></div><textarea readonly id="copyText"></textarea>`;
    box.querySelector('textarea').value = text;
    box.querySelector('button').onclick = () => box.remove();
    document.body.appendChild(box);
    const ta = box.querySelector('textarea'); ta.focus(); ta.select();
  };
  const plain = () => navigator.clipboard.writeText(text).then(() => toast(msg), fallback);
  // (Formatted text pastes with the colours it's given: without them,
  // Safari gave it the page's own, white in the dark theme, and it came
  // into Word invisible. So black on nothing, as from any printed page;
  // italics and bold as they are.)
  if (html) html = '<div style="color:#000000;background-color:transparent">' + html + '</div>';
  try {
    if (html && window.ClipboardItem && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]).then(() => toast(msg), plain);
    } else {
      plain();
    }
  } catch { fallback(); }
}

/* ------------------------------------------------------------ navigation */
function go(view) {
  app.dataset.view = view;
  if (view === 'list') { requestAnimationFrame(() => { sizeList(); revealSelected(); }); }
  renderDetail();
}
$('#back').addEventListener('click', () => go(app.dataset.view === 'detail' ? 'list' : 'groups'));
function closeDrawer() { app.classList.remove('side-open'); }
$('#sideToggle').addEventListener('click', () => {
  if (phoneMQ.matches) go('groups');
  else if (tabletMQ.matches) app.classList.toggle('side-open');
  else { app.classList.toggle('side-collapsed'); store.set('sideCollapsed', app.classList.contains('side-collapsed')); }
});
$('#sideClose').addEventListener('click', closeDrawer);
// The LibLande icon at the top of the sidebar closes it too.
$('.side-head .app-icon').addEventListener('click', () => {
  if (phoneMQ.matches) go('list');
  else if (tabletMQ.matches) closeDrawer();
  else { app.classList.add('side-collapsed'); store.set('sideCollapsed', true); }
});
$('#scrim').addEventListener('click', closeDrawer);
const onLayout = () => {
  if (!ENTRIES.length) return;
  if (!phoneMQ.matches) { app.dataset.view = 'list'; if (!state.selKey && state.view[0]) state.selKey = state.view[0].k; }
  if (!tabletMQ.matches) closeDrawer();
  sizeList(); revealSelected(); renderDetail();
};
phoneMQ.addEventListener('change', onLayout);
phoneMQ.addEventListener('change', renderTabs);
tabletMQ.addEventListener('change', onLayout);
coarseMQ.addEventListener('change', onLayout);
window.addEventListener('resize', () => requestAnimationFrame(paint));

/* splitter */
(() => {
  const sp = $('#splitter'), wrap = $('#listwrap');
  let startY, startH;
  sp.addEventListener('pointerdown', ev => {
    startY = ev.clientY; startH = wrap.getBoundingClientRect().height;
    sp.setPointerCapture(ev.pointerId);
  });
  sp.addEventListener('pointermove', ev => {
    if (startY == null) return;
    const max = $('#main').getBoundingClientRect().height - 160;
    const h = Math.max(120, Math.min(max, startH + ev.clientY - startY));
    app.style.setProperty('--list-h', h + 'px');
    paint();
  });
  const end = () => {
    if (startY == null) return;
    startY = null;
    store.set('listH', Math.round(wrap.getBoundingClientRect().height));
  };
  sp.addEventListener('pointerup', end);
  sp.addEventListener('pointercancel', end);
})();

/* keyboard */
document.addEventListener('keydown', ev => {
  if (!$('#viewer').hidden) {
    const typing = /^(input|textarea|select)$/i.test(ev.target.tagName || '') || ev.target.isContentEditable;
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 's') { ev.preventDefault(); saveMarkup().then(keptNote); return; }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'f') { ev.preventDefault(); openFind(); return; }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'g') { ev.preventDefault(); runFind('again', ev.shiftKey); return; }
    // Esc with the Quote bar up: just the bar goes (and the selection),
    // even from its page field; not the paper.
    if (ev.key === 'Escape' && QUOTE.el && !QUOTE.el.hidden) { ev.preventDefault(); quoteDismiss(); return; }
    // (Your shortcuts first: see KEY_ACTS.)
    const mine = !typing && KEY_ACTS.find(a => a.scope === 'pdf' && keyIs(ev, a.id));
    if (mine) { ev.preventDefault(); runPdfKey(mine.id); return; }
    if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    // Escape: a tool that's on is put down (back to reading); with none on,
    // the paper is closed. (A selected mark, or an open panel, goes first.)
    if (ev.key === 'Escape' && !V.selected && $('#vComment').hidden && $('#vpPanel').hidden) {
      if (V.tool !== 'read') { ev.preventDefault(); setTool('read'); } else closeReader();
    }
    else if (ev.key === 'Escape' && !$('#vpPanel').hidden) hidePanel();
    else if ((ev.key === '+' || ev.key === '=') && V.doc) V.viewer.increaseScale();
    else if (ev.key === '-' && V.doc) V.viewer.decreaseScale();
    return;
  }
  const tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (!$('#sheet').hidden) return;
  if (ev.key === 'Escape' && state.picking) { setPicking(false); return; }
  if (ev.key === 'a' && (ev.metaKey || ev.ctrlKey) && state.view.length) {
    ev.preventDefault();
    if (!state.picking) setPicking(true);
    state.view.forEach(e => state.picked.add(e.k));
    paint(); renderPickBar(); renderDetail();
    return;
  }
  if ((ev.key === 'f' && (ev.metaKey || ev.ctrlKey)) || ev.key === '/') { ev.preventDefault(); openSearch(true); return; }
  // Your shortcuts (by physical key, since Option changes the letter typed).
  const mine = KEY_ACTS.find(a => a.scope === 'lib' && keyIs(ev, a.id));
  if (mine) {
    ev.preventDefault();
    if (mine.id === 'edit') { const e = state.selKey && BYKEY.get(state.selKey); if (e && gs) openEdit(e); }
    else copyAs({ copyApa: 'apa', copyShort: 'short', copyBib: 'bibtex', copyKey: 'key' }[mine.id]);
    return;
  }
  if (ev.key === '?' && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); openShortcuts(); return; }
  const inList = !document.activeElement || document.activeElement === document.body || $('#listwrap').contains(document.activeElement);
  if (ev.key === 'Enter' && inList && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
    const e = state.selKey && BYKEY.get(state.selKey);
    const f = e && (e.files || []).find(x => x.id);
    if (f && gs) { ev.preventDefault(); openPaper(e, f); }
    return;
  }
  // Type to jump: letters, digits and spaces while the list has focus.
  if (inList && !ev.metaKey && !ev.ctrlKey && !ev.altKey && ev.key.length === 1 &&
      /[\p{L}\p{N}'.\- ]/u.test(ev.key) && (ev.key !== ' ' || typeBuf)) {
    ev.preventDefault();
    typeToJump(ev.key);
    return;
  }
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    if (!state.view.length) return;
    ev.preventDefault();
    const i = state.view.findIndex(e => e.k === state.selKey);
    select(Math.max(0, Math.min(state.view.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1))));
  }
});

/* ------------------------------------------------------------ load */
// With the server (pages/server.js, standing in for google.script.run):
// the library from Google Drive. Without one (the local tests): fetch
// library.json next to the page.
const gs = window.google && google.script && google.script.run;
const callServer = (name, ...args) => new Promise((resolve, reject) => {
  const runner = gs.withSuccessHandler(resolve).withFailureHandler(reject);
  if (typeof runner[name] !== 'function') {
    reject(new Error('LibLande can\u2019t do this (' + name + '). Close it and open it again to get the latest version.'));
    return;
  }
  runner[name](...args);
});
const errText = err => ((err && err.message) || String(err)).replace(/^(Exception|Error): /, '');
let status = null, statusReq = null, STYLE_WAS = null;
let showSetup = () => {};

// Builds run in the background on Google's side (a big library takes a
// minute or more). Poll until the build finishes, reporting progress.
async function waitForBuild(progress) {
  const start = Date.now();
  while (status && status.configured && status.building) {
    const secs = Math.round((Date.now() - start) / 1000);
    if (secs > 10 * 60) throw new Error('The build is taking longer than expected. LibLande will keep trying in the background; check again in a few minutes.');
    if (progress) progress(secs);
    await new Promise(r => setTimeout(r, 4000));
    status = await callServer('getStatus');
  }
  if (status && status.error) throw new Error('LibLande couldn\u2019t build your library: ' + status.error);
  if (status && status.configured && status.stamp == null) throw new Error('The build didn\u2019t finish. LibLande tries again every 10 minutes; tap Refresh to try now.');
  return status;
}

// Loading-screen progress, with elapsed time, so a slow step is visible.
const t0 = Date.now();
function stage(msg) {
  const el = $('#loading > span');
  if (el && !$('#loading').hidden) el.textContent = msg + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)';
}
const showError = err => {
  $('#loading').innerHTML = `<b>The library didn\u2019t load</b><span>${esc(errText(err))}</span><small>Version ${esc(APP_VERSION)}</small>`;
};

function gunzipJSON(bytes) {
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(JSON.parse);
}
const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

// Download library.json.gz from Google Drive. If that fails, the server is
// asked for it as base64 (getLibrary).
async function download() {
  // The status (from getStatus) says where the library is, with a token;
  // only without them (or if the token has run out) is the server asked.
  const fromStatus = status && status.libraryId && status.token ? { id: status.libraryId, stamp: status.stamp, token: status.token } : null;
  // (A library just built on this device is at hand.)
  const built = window.LIBLANDE_BUILT;
  if (built && status && built.id === status.libraryId && built.stamp === status.stamp) return { stamp: built.stamp, gz: built.gz };
  const get = info => fetch('https:\/\/www.googleapis.com/drive/v3/files/' + encodeURIComponent(info.id) + '?alt=media',
    { headers: { Authorization: 'Bearer ' + info.token } });
  try {
    let info = fromStatus, r = null;
    if (info) { stage('Downloading the library from Google Drive'); r = await get(info); }
    if (!r || r.status === 401 || r.status === 403) {
      stage('Finding the library in Google Drive');
      info = await callServer('getLibraryInfo');
      stage('Downloading the library from Google Drive');
      r = await get(info);
    }
    if (!r.ok) throw new Error('Drive answered ' + r.status);
    return { stamp: info.stamp, gz: new Uint8Array(await r.arrayBuffer()) };
  } catch (e) {
    console.warn('Direct Drive download failed; trying again another way.', e);
    stage('Downloading the library again');
    const r = await callServer('getLibrary');
    return { stamp: r.stamp, gz: b64ToBytes(r.library) };
  }
}

// A copy of the last download, kept in this browser (IndexedDB) so the page
// opens instantly; it's replaced whenever Drive has a newer one.
const cache = {
  db() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('landelib', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('lib');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },
  async get() {
    try {
      const db = await this.db();
      const v = await new Promise(resolve => {
        const q = db.transaction('lib').objectStore('lib').get('current');
        q.onsuccess = () => resolve(q.result || null);
        q.onerror = () => resolve(null);
      });
      db.close();
      if (v && !v.gz && v.library) v.gz = b64ToBytes(v.library); /* older format */
      return v && v.gz ? v : null;
    } catch { return null; }
  },
  async put(v) {
    try {
      const db = await this.db();
      const tx = db.transaction('lib', 'readwrite');
      tx.objectStore('lib').put({ stamp: v.stamp, gz: v.gz }, 'current');
      tx.oncomplete = tx.onerror = tx.onabort = () => db.close();
    } catch {}
  },
};

let loadedStamp = null;
async function show(lib, again) {
  stage('Opening the library');
  const d = await gunzipJSON(lib.gz);
  loadedStamp = lib.stamp;
  init(d, again);
  return d;
}
async function update(quiet) {
  if (!quiet) toast('Downloading the updated library\u2026', 0);
  const lib = await download();
  const d = await show(lib, true);
  cache.put(lib);
  fetchAheadSoon();
  if (!quiet) toast('Library updated: ' + d.source + ' as of ' + builtText(d), 3000);
}

if (RELOADING) {
  /* (Opening again, with every part from this version.) */
} else if (!gs) {
  fetch('library.json')
    .then(r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.json(); })
    .then(d => init(d))
    .catch(showError);
} else {
  (async () => {
    stage('Checking this browser for a saved copy');
    const cached = await Promise.race([cache.get(), new Promise(r => setTimeout(() => r(null), 3000))]);
    if (cached) {
      // A saved copy means LibLande is set up: show Add and Settings now,
      // not after Google Drive answers (how adding works is remembered from
      // last time until then).
      $('#settingsBtn').hidden = false; $('#addBtn').hidden = false;
      await show(cached, false);
      // The reading list as last known, too, until Drive answers (it says
      // when it's from; offline, it's all there is).
      const known = window.liblandeKnownLists && window.liblandeKnownLists();
      if (known && known.reading && known.at) setReading(Object.assign({}, known.reading, { staleAt: known.at }));
    }
    stage(gs ? 'Checking Google Drive' : 'Loading');
    statusReq = callServer('getStatus');
    statusReq.catch(() => { statusReq = null; });
    status = await statusReq;
    if (status.token) tokenCache = { token: status.token, at: Date.now() };
    // The theme saved with your account wins over this browser's copy.
    const saved = status.prefs && status.prefs.theme, toSave = store.get('themeToSave', null);
    if (toSave) {
      // (Chosen just before the page opened again: saved with your account now.)
      google.script.run.withSuccessHandler(() => store.set('themeToSave', null)).withFailureHandler(() => {}).savePrefs({ theme: toSave });
    } else if (saved && saved !== store.get('theme', 'auto')) { store.set('theme', saved); applyTheme(saved); }
    const look = status.prefs && status.prefs.style;
    if (look && look !== store.get('style', 'liblande') && $('#setup').hidden) { store.set('style', look); applyStyle(look); }
    // And what you looked at lately.
    if (status.prefs) {
      recentMerge(status.prefs);
      msMerge(status.prefs);
      smartMerge(status.prefs);
      keysMerge(status.prefs);
      progressMerge(status.prefs);
      positionsMerge(status.prefs);
      if (notDupsMerge(status.prefs) && ENTRIES.length) { findDups(); refresh(false); }
      if (ENTRIES.length) renderGroups();
    }
    // So is where the markup toolbar was left, on this kind of device.
    const place = status.prefs && status.prefs['palette.' + deviceKind()];
    if (place) {
      store.set('palettePos', place.pos || null);
      if (place.snap) store.set('paletteSnap', place.snap);
      if (place.pencil && matchMedia('(pointer: coarse)').matches) { store.set('pencil', true); V.pencil = true; $('#viewer').classList.add('pencil'); }
      if (!$('#viewer').hidden) placePalette();
    }
    // And how the tools were set.
    if (status.prefs && status.prefs.tools) applyToolPrefs(status.prefs.tools);
    if (!status.configured) { $('#settingsBtn').hidden = $('#addBtn').hidden = true; showSetup(status, false); return; }
    setReading(status.reading);
    $('#settingsBtn').hidden = false; $('#addBtn').hidden = false;
    if (status.stamp == null && !status.building) status = await callServer('refreshNow');
    if (status.building) {
      if (ENTRIES.length) toast('Updating your library\u2026', 0);
      await waitForBuild(secs => stage('Building your library. A large library takes a minute or two'));
    }
    if (status.stamp !== loadedStamp) {
      if (ENTRIES.length) { await update(); return; }
      const lib = await download();
      await show(lib, false);
      cache.put(lib);
    }
  })().then(seedReading).then(() => { setTimeout(uploadKept, 3000); fetchAheadSoon(20000); refreshSaved(); }).catch(err => {
    if (ENTRIES.length) toast('Couldn\u2019t check for updates: ' + errText(err), 5000);
    else showError(err);
  });

  // Refresh: look at the .bib now (rebuilding the library if it changed),
  // then load the library if it's newer than the copy on this page.
  const btn = $('#refreshBtn');
  btn.hidden = false;
  btn.addEventListener('click', () => {
    if (btn.classList.contains('busy')) return;
    btn.classList.add('busy');
    $('#pull').classList.add('busy');
    toast('Checking Google Drive for changes\u2026', 0);
    callServer('refreshNow')
      .then(async st => {
        status = st;
        if (!st.configured) { toast('', 1); showSetup(st, false); return null; }
        setReading(st.reading);
        if (st.building) {
          await waitForBuild(secs => toast('Rebuilding your library\u2026 (' + secs + ' s)', 0));
        }
        return status.stamp !== loadedStamp ? update() : toast('Already up to date', 2200);
      })
      .catch(err => toast('Refresh failed: ' + errText(err), 5000))
      .finally(() => { btn.classList.remove('busy'); $('#pull').classList.remove('busy'); });
  });

  // Swipe a row of the reading list, as in Mail: right for Up next (Later,
  // if it's there already), left for Done. (Only there: in the library most
  // rows had little or nothing to swipe for, and it felt finicky.) The row
  // follows the finger (or, on a computer, two fingers on the trackpad),
  // the action behind it. A long swipe (past 40% of the row) does it; a
  // short one leaves the row open with the action as a button, until a
  // tap or a scroll elsewhere.
  (() => {
    const list = $('#list'), REVEAL = 56, OPEN = 104;
    const FULL = row => Math.max(150, row.clientWidth * 0.4);
    let sw = null, opened = null, quiet = 0, ignoring = false;
    const acts = e => {
      const x = gs && !e.ib && state.group === 'toread' && RL.get(e.k);
      if (!x) return {};
      return {
        right: x.list === 'next' ? { id: 'later', label: 'Later', icon: 'plus' } : { id: 'next', label: 'Up next', icon: 'plus' },
        left: { id: 'done', label: 'Done', icon: 'check' },
      };
    };
    const bgFor = (row, a) => {
      const bg = document.createElement('div');
      // (A short row, as on a computer: the icon beside the label.)
      bg.className = 'swipe-bg' + (row.offsetHeight < 44 ? ' flat' : '');
      bg.style.top = row.style.top; bg.style.height = row.style.height;
      const side = (d, x) => x ? `<button type="button" class="swipe-act ${d}" data-swipe="${d}" tabindex="-1"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${RL_ICONS[x.icon]}</svg>${esc(x.label)}</button>` : '';
      bg.innerHTML = side('right', a.right) + side('left', a.left);
      row.before(bg);
      return bg;
    };
    const run = (act, e) => {
      if (act.id === 'next' || act.id === 'later') rlMove(e.k, act.id);
      else if (act.id === 'done') rlDone(e.k);
    };
    const settle = (row, bg, x) => {
      row.style.transition = 'transform .32s cubic-bezier(.32, .72, 0, 1)';
      row.style.transform = x ? `translateX(${x}px)` : '';
      if (!x) setTimeout(() => { if (row.style.transform) return; row.style.transition = row.style.background = ''; bg.remove(); }, 340);
    };
    const close = () => {
      if (!opened) return;
      const o = opened;
      opened = null;
      o.bg.classList.remove('open');
      settle(o.row, o.bg, 0);
    };
    // Where the row is drawn for a swipe this far: with resistance past the
    // line, and barely at all the way with no action.
    const follow = dx => {
      const full = FULL(sw.row), none = (dx > 0 && !sw.a.right) || (dx < 0 && !sw.a.left);
      let x = none ? dx / 6 : Math.abs(dx) > full ? Math.sign(dx) * (full + (Math.abs(dx) - full) * 0.4) : dx;
      sw.dx = none ? 0 : dx;
      sw.row.style.transform = `translateX(${x}px)`;
      sw.bg.classList.toggle('to-right', dx > 0);
      sw.bg.classList.toggle('shown', Math.abs(sw.dx) >= REVEAL);
      sw.bg.classList.toggle('full', Math.abs(sw.dx) >= full);
    };
    const begin = (row, wheel) => {
      const e = row && state.view[+row.dataset.i];
      if (!e) return false;
      const a = acts(e);
      if (!a.left && !a.right) return false;
      if (opened && opened.row !== row) close();
      // (An open row swiped again: from where it is.)
      const from = opened && opened.row === row ? opened.x : 0;
      const bg = opened && opened.row === row ? opened.bg : bgFor(row, a);
      opened = null;
      bg.classList.remove('open');
      sw = { row, e, a, bg, dx: from, base: from, on: true, wheel, acc: from, peak: 0, fall: 0, last: 0 };
      row.style.transition = '';
      row.style.background = 'var(--bg)';
      return true;
    };
    const release = () => {
      if (!sw) return;
      const { row, bg, dx, e, a } = sw;
      sw = null;
      list._swiped = true;
      setTimeout(() => { list._swiped = false; }, 400);
      const act = dx > 0 ? a.right : dx < 0 ? a.left : null;
      if (act && Math.abs(dx) >= FULL(row)) { bg.classList.add('full'); settle(row, bg, 0); run(act, e); return; }
      if (act && Math.abs(dx) >= REVEAL) {
        const x = Math.sign(dx) * OPEN;
        bg.classList.add('open', 'shown');
        bg.classList.remove('full');
        bg.classList.toggle('to-right', dx > 0);
        opened = { row, bg, e, act, x };
        settle(row, bg, x);
        return;
      }
      settle(row, bg, 0);
    };
    // The open row's button: the action; anything else closes it.
    list.addEventListener('click', ev => {
      const b = ev.target.closest('.swipe-bg.open [data-swipe]');
      if (b && opened) { ev.stopPropagation(); const o = opened; close(); run(o.act, o.e); return; }
      if (list._swiped) { ev.stopPropagation(); ev.preventDefault(); list._swiped = false; return; }
      if (opened && !ev.target.closest('.swipe-bg')) { ev.stopPropagation(); ev.preventDefault(); close(); }
    }, true);
    list.addEventListener('scroll', () => { if (opened) close(); }, { passive: true });
    document.addEventListener('pointerdown', ev => { if (opened && !list.contains(ev.target)) close(); }, true);

    // Touch.
    let t0 = null;
    list.addEventListener('touchstart', ev => {
      t0 = null;
      if (ev.touches.length !== 1 || state.picking || sw) return;
      const row = ev.target.closest('#list .row, #list .card');
      if (!row) return;
      t0 = { row, x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    }, { passive: true });
    list.addEventListener('touchmove', ev => {
      if (!t0 && !(sw && !sw.wheel)) return;
      const t = ev.touches[0];
      if (!sw) {
        const dx = t.clientX - t0.x, dy = t.clientY - t0.y;
        // (A scroll, not a swipe: let it be.)
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { t0 = null; return; }
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (!begin(t0.row, false)) { t0 = null; return; }
        sw.x0 = t.clientX;
      }
      ev.preventDefault();
      follow(sw.base + t.clientX - sw.x0);
    }, { passive: false });
    list.addEventListener('touchend', () => { t0 = null; if (sw && !sw.wheel) release(); });
    list.addEventListener('touchcancel', () => { t0 = null; if (sw && !sw.wheel) { sw.dx = 0; release(); } });

    // A trackpad: a two-finger swipe sideways comes as sideways scrolling.
    // The row follows it; when the fingers lift (the scrolling then coasts
    // on, ever slower, which isn't counted) or stop, it's let go.
    list.addEventListener('wheel', ev => {
      const sideways = Math.abs(ev.deltaX) > Math.abs(ev.deltaY);
      if (ignoring) {
        if (sideways) ev.preventDefault();
        clearTimeout(quiet);
        quiet = setTimeout(() => { ignoring = false; }, 180);
        return;
      }
      // (Sideways scrolling over the list is never the list's: it doesn't
      // scroll that way, nor go back a page.)
      if (sideways) ev.preventDefault();
      if (!sw) {
        if (!sideways || state.picking || Math.abs(ev.deltaX) < 3) { if (opened && !sideways) close(); return; }
        if (!begin(ev.target.closest('#list .row, #list .card'), true)) return;
      } else if (!sw.wheel) return;
      ev.preventDefault();
      const d = -ev.deltaX * (ev.deltaMode === 1 ? 16 : 1), m = Math.abs(d);
      // Lifted: the deltas fall away steadily from their peak (momentum).
      sw.fall = m < sw.last ? sw.fall + 1 : 0;
      sw.last = m;
      sw.peak = Math.max(sw.peak, m);
      if (sw.peak > 6 && sw.fall >= 3 && m < sw.peak * 0.6) {
        release();
        ignoring = true;
        clearTimeout(quiet);
        quiet = setTimeout(() => { ignoring = false; }, 180);
        return;
      }
      sw.acc += d;
      follow(sw.acc);
      clearTimeout(quiet);
      quiet = setTimeout(() => { if (sw && sw.wheel) release(); }, 160);
    }, { passive: false });
  })();

  // Pull to refresh: drag the top of the list down and let go.
  (() => {
    const list = $('#list'), pull = $('#pull'), FAR = 70;
    let y0 = null, d = 0;
    const show = () => {
      const k = Math.min(1, d / FAR);
      pull.style.opacity = String(k);
      pull.style.transform = `translateY(${Math.min(d, FAR) * .7 - 40}px) rotate(${k * 270}deg)`;
      pull.classList.toggle('armed', d >= FAR);
    };
    const reset = () => { y0 = null; d = 0; pull.classList.remove('armed'); pull.style.opacity = ''; pull.style.transform = ''; };
    list.addEventListener('touchstart', ev => {
      y0 = list.scrollTop <= 0 && ev.touches.length === 1 && !btn.classList.contains('busy') ? ev.touches[0].clientY : null;
      d = 0;
    }, { passive: true });
    list.addEventListener('touchmove', ev => {
      if (y0 == null) return;
      if (list.scrollTop > 0) { reset(); return; }
      d = Math.max(0, ev.touches[0].clientY - y0);
      show();
    }, { passive: true });
    const end = () => {
      if (y0 == null) return;
      const go = d >= FAR;
      reset();
      if (go) btn.click();
    };
    list.addEventListener('touchend', end);
    list.addEventListener('touchcancel', reset);
  })();

  // Setup: choose the .bib file and papers folder.
  const setupMsg = (msg, kind) => {
    const e = $('#setupError'), s = $('#setupStatus');
    e.hidden = !(kind === 'error' && msg);
    e.textContent = kind === 'error' ? msg || '' : '';
    s.hidden = !(kind === 'status' && msg);
    s.textContent = kind === 'status' ? msg : '';
  };
  // Setup (first time): the links and Build my library. Settings (once set
  // up): changes take effect only on Save; Cancel (or Esc) leaves things as
  // they were. New links rebuild the library.
  showSetup = (st, canCancel) => {
    const configured = !!(st && st.configured) && canCancel;
    $('#loading').hidden = true;
    $('#setup').hidden = false;
    $('#setup').classList.toggle('head-mode', configured);
    // (Settings: a panel over the library; the first setup fills the screen.)
    $('#setup').classList.toggle('pop', configured);
    $('#setHead').hidden = !configured;
    $('#setupTitle').hidden = configured;
    $('#setupIntro').hidden = configured;
    $('#setupEdit').hidden = !configured;
    $('#linkFields').hidden = configured;
    $('#bibLink').value = $('#papersLink').value = '';
    if (configured) {
      // The theme previews as you choose; Save keeps it, Cancel puts it back.
      STYLE_WAS = store.get('style', 'liblande');
      renderThemePicks();
      $('#darkPagesBox').checked = !!store.get('darkPages', false);
      $('#setup').querySelectorAll('[data-sync]').forEach(b => { b.checked = SYNC[b.dataset.sync] !== false; });
      $('#curBib').textContent = st.bibName || '';
      $('#curPapers').textContent = st.papersName || '';
      $('#changeLinks').hidden = false;
    }
    setupMsg(st && st.problem, 'error');
    $('#setup').scrollTop = 0;
    if (!configured) $('#bibLink').focus();
  };
  const closeSettings = () => {
    if ($('#setSave').disabled) return;
    if (STYLE_WAS != null) { applyStyle(STYLE_WAS); STYLE_WAS = null; }
    $('#setup').hidden = true;
  };
  // (These take effect at once, on this device.)
  $('#darkPagesBox').addEventListener('change', ev => setDarkPages(ev.target.checked));
  $('#setup').querySelectorAll('[data-sync]').forEach(b => b.addEventListener('change', () => {
    SYNC[b.dataset.sync] = b.checked;
    store.set('sync', SYNC);
  }));
  $('#quotesGo').addEventListener('click', () => { closeSettings(); openQuotes(); });
  $('#changeLinks').addEventListener('click', () => {
    $('#linkFields').hidden = false;
    $('#changeLinks').hidden = true;
    $('#bibLink').focus();
  });
  $('#setClose').addEventListener('click', closeSettings);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#setup').hidden && !$('#setHead').hidden) { ev.preventDefault(); closeSettings(); } });
  // With a saved copy, Settings shows before Google Drive has answered: wait
  // for the answer (or ask again, if it failed) rather than show the
  // first-time setup.
  $('#settingsBtn').addEventListener('click', async () => {
    closeDrawer();
    if (!status) {
      toast('Opening Settings\u2026', 0);
      try {
        status = await (statusReq || (statusReq = callServer('getStatus')));
        toast('', 1);
      } catch (err) {
        statusReq = null;
        toast('Couldn\u2019t open Settings: ' + errText(err), 5000);
        return;
      }
    }
    showSetup(status, true);
  });
  // Save in Settings: the switch and the tick box, then any new links.
  const saveSettingsPage = async () => {
    const save = $('#setSave'), close = $('#setClose');
    const bibLink = $('#bibLink').value.trim(), papersLink = $('#papersLink').value.trim();
    if (!$('#linkFields').hidden && !bibLink && papersLink) { setupMsg('Paste the link to your .bib file too (even if it\u2019s the same one).', 'error'); return; }
    save.disabled = close.disabled = true;
    setupMsg('', 'error');
    const notes = [];
    try {
      if (bibLink) {
        setupMsg('Reading your .bib file and finding your papers. A large library takes a minute or two.', 'status');
        status = await callServer('saveSettings', bibLink, papersLink);
        await waitForBuild(secs => setupMsg('Reading your .bib file and finding your papers. A large library takes a minute or two. (' + secs + ' s)', 'status'));
        setupMsg('Downloading your library\u2026', 'status');
        const lib = await download();
        await show(lib, ENTRIES.length > 0);
        cache.put(lib);
        notes.push('library ready: ' + ENTRIES.length.toLocaleString() + ' publications');
      }
      const look = document.documentElement.getAttribute('data-style') || 'liblande';
      if (look !== store.get('style', 'liblande')) {
        store.set('style', look);
        if (window.google && google.script && google.script.run) google.script.run.withFailureHandler(() => {}).savePrefs({ style: look });
      }
      STYLE_WAS = null;
      setupMsg('', 'status');
      $('#setup').hidden = true;
      toast('Settings saved', 2000);
    } catch (err) {
      setupMsg(errText(err), 'error');
    } finally {
      save.disabled = close.disabled = false;
    }
  };
  $('#setupForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!$('#setHead').hidden) { saveSettingsPage(); return; }
    const go = $('#setupGo'), cancel = { disabled: false };
    if (go.disabled) return;
    const bibLink = $('#bibLink').value.trim(), papersLink = $('#papersLink').value.trim();
    if (!bibLink) { setupMsg('Paste the link to your .bib file first.', 'error'); return; }
    go.disabled = cancel.disabled = true;
    setupMsg('Reading your .bib file and finding your papers. A large library takes a minute or two.', 'status');
    try {
      status = await callServer('saveSettings', bibLink, papersLink);
      await waitForBuild(secs => setupMsg('Reading your .bib file and finding your papers. A large library takes a minute or two. (' + secs + ' s)', 'status'));
      setupMsg('Downloading your library\u2026', 'status');
      const lib = await download();
      await show(lib, ENTRIES.length > 0);
      cache.put(lib);
      $('#setup').hidden = true;
      $('#settingsBtn').hidden = false; $('#addBtn').hidden = false;
      $('#bibLink').value = $('#papersLink').value = '';
      toast('Library ready: ' + ENTRIES.length.toLocaleString() + ' publications', 3000);
    } catch (err) {
      setupMsg(errText(err), 'error');
    } finally {
      go.disabled = cancel.disabled = false;
    }
  });
}
// For the test suite (_test/suite.html) only: a few of the reader's
// insides, when the test page asks for them.
if (window.LIBLANDE_TEST) window.LL = { V, BM, JOURNAL, LOCAL, AUTO, saveMarkup, setTool, setReading, renderRLBar, netBadge, placeToast, POS, MARK, PDFJS, pdfJsFix, findEndPage, refHeading, combineMarks, makeZip, MARK_ERASER: () => MARK.eraserSize,
  lib: () => ({ ENTRIES, BYKEY, DATA, VERSION_OF, VERSIONS, NESTED, state }), init, refresh, openEdit, isForthcoming, forthChanges, parseBibtexEntry,
  oldLineMarks, convertOldLines, fetchAhead, PTABS, renderPaperTabs, openPdf, loadPdfJs, addStreamIteration, msCheck, msCites, msRef, msDocx, MS, msVisible };
