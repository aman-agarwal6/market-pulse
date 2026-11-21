/* =============================================================================
   MARKET PULSE — workspace shell
   =============================================================================
   The app is a set of workspaces (Today, Long-Term, Markets, …) behind one
   hash router. The hash is the single source of truth for desktop tabs, the
   phone tab bar, the command bar, keyboard shortcuts and back/forward:

       #/<workspace>            e.g. #/today
       #/<workspace>/<section>  e.g. #/markets/breadth, #/world/crypto
       #/<ws>/<section>?k=v     optional parameters, e.g. #/longterm/dca?s=VOO

   ADDING OR BUILDING A WORKSPACE
   1. One module per workspace: public/js/ws/<id>.js, default-exporting
        {
          id: 'longterm', title: 'Long-Term', key: '2',   // key = number shortcut
          hint: 'LT', aliases: ['LONG'],                   // command-bar mnemonics (optional)
          phone: 'main' | 'more',                          // bottom bar slot or the More sheet
          icon: '<path …/>',                               // 24×24 stroke icon for the phone bar
          sections: [{ id, title, hint?, aliases?, keywords? }],
          subnav: 'tabs' | 'scroll',                       // one section at a time, or jump links
          mount(root, ctx) {},  // once, on first show: write markup, wire listeners
          show(ctx) {},         // every time it becomes visible (optional)
          hide() {},            // when another workspace takes over (optional)
          update(S, ctx) {},    // live data: called on every snapshot WHILE VISIBLE,
                                //   and right after show with ctx.force = true
          route(ctx) {},        // every route change into this workspace, including
                                //   section / parameter changes (optional)
        }
      ctx = { force, section, params (URLSearchParams), root, go, store }. Hidden workspaces receive no
      updates; when ctx.force is true, redraw everything (charts that measure
      their container were skipped while hidden). With subnav 'tabs', wrap each
      section in <div data-section="id"> and render only ctx.section.
      With 'scroll', give each section block data-section="id"; the shell
      scrolls to it and highlights the sub-nav as you scroll.
   2. Register it once, in ws/index.js (the order there is the tab order).
   3. Styles go in public/css/ws-<id>.css, scoped under #ws-<id>. Shared
      primitives live in css/ui.css and css/style.css: do not edit those for a
      single workspace.
   4. Commands: import { registerCommand } from '../commands.js' at the top of
      your module, e.g.
        registerCommand({ id: 'dca', title: 'DCA simulator', hint: 'DCA', arg: 'ticker',
          group: 'Go to', keywords: ['dollar cost averaging'], run: t => go('longterm', 'dca', { params: { s: t } }) });

   BUILDING PANELS — use the helpers in ui.js, do not hand-roll them:
     panelHTML / panel     header (title, sub, ⓘ explainer, Notes caption), controls, body, footer
     statTileHTML / statGridHTML   label, value, delta, sparkline, percentile bar
     dataTable             sortable, sticky header, keyboard rows, CSV export
     segHTML + seg         segmented control
     skeletonHTML / emptyStateHTML / errorStateHTML / setPanelState
     sourceBadgeHTML / setSourceBadge / refreshSourceBadges   "Yahoo Finance · as of 16:00 ET"
     fetchJSON / loadPanel deduped, time-limited fetch; standard load → render | empty | error
     tsChart               multi-series time series, log scale, shaded bands, crosshair
     renderCache / safe    skip unchanged renders; isolate renderer errors
   Formatting (fmtPrice, fmtPct, fmtBig, cls, heatColor, sparkSVG) is in util.js.
   Any element with data-sym="<yahoo symbol>" opens the chart drawer on click.
   Copy: plain English, describe what the data shows, never what to buy or sell.
   ========================================================================== */
import { store } from './store.js';
import { refreshSourceBadges, esc } from './ui.js';
import { hideTip } from './util.js';

const KEY = 'mp.ws';
const SEC_KEY = 'mp.wsSec';
const html = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Old single-page anchors (bookmarks, README links) → their new homes.
const LEGACY = {
  overview: ['today'], heatmap: ['today'], flows: ['markets', 'flows'], breadth: ['markets', 'breadth'],
  earnings: ['markets', 'earnings'], watchlist: ['markets', 'earnings'], global: ['world', 'global'],
  rates: ['macro', 'rates'], crypto: ['world', 'crypto'], commod: ['world', 'commod'], news: ['news'],
};
// Phone tab ids from the previous layout (mp.tab) → workspaces.
const OLD_TAB = { market: 'today', flows: 'markets', stocks: 'markets', world: 'world', news: 'news' };

export const workspaces = [];
const byId = new Map();
const mounted = new Set();
const lastSection = (() => { try { return JSON.parse(localStorage.getItem(SEC_KEY) || '{}'); } catch { return {}; } })();
const savedScroll = {};
let cur = null;          // active workspace definition
let curSection = null;
let curParams = new URLSearchParams();
let pendingScroll = null;   // section link opened before data arrived: re-aim once panels have their real height
let main = null, tabsEl = null;
const routeSubs = new Set();

export function registerWorkspace(def) {
  if (byId.has(def.id)) throw new Error('Duplicate workspace ' + def.id);
  def.sections ||= [];
  def.subnav ||= 'scroll';
  workspaces.push(def);
  byId.set(def.id, def);
}
export const getWorkspace = id => byId.get(id);
export const current = () => ({ ws: cur?.id || null, section: curSection });
/** onRoute(fn) — fn({ ws, section, prev }) after every route change. */
export function onRoute(fn) { routeSubs.add(fn); return () => routeSubs.delete(fn); }
export const rootOf = id => document.getElementById('ws-' + id);

/** go(ws, section?, { replace, params }) — navigate (adds a history entry unless replace). */
export function go(ws, section = null, { replace = false, params = null } = {}) {
  if (!byId.has(ws)) return;
  const qs = params ? new URLSearchParams(params).toString() : '';
  const hash = '#/' + ws + (section ? '/' + section : '') + (qs ? '?' + qs : '');
  if (location.hash === hash) { apply(); return; }
  if (replace) { history.replaceState(history.state, '', hash); apply(); }
  else location.hash = hash;
}

function parse(h) {
  const m = /^#\/([\w-]+)(?:\/([\w-]+))?\/?(?:\?(.*))?$/.exec(h || '');
  if (m && byId.has(m[1])) return { ws: m[1], section: m[2] || null, params: new URLSearchParams(m[3] || '') };
  const l = LEGACY[(h || '').slice(1)];
  return l ? { ws: l[0], section: l[1] || null, legacy: true } : null;
}

function initialWs() {
  let id = null;
  try { id = localStorage.getItem(KEY) || OLD_TAB[localStorage.getItem('mp.tab')] || null; } catch { /* storage unavailable */ }
  return byId.has(id) ? id : workspaces[0].id;
}

const ctxFor = (def, force) => ({ force, section: def === cur ? curSection : null, params: def === cur ? curParams : new URLSearchParams(), root: rootOf(def.id), go, store });

function ensureMounted(def) {
  if (mounted.has(def.id)) return;
  mounted.add(def.id);
  const root = rootOf(def.id);
  if (def.sections.length > 1) root.appendChild(subnavEl(def));
  const body = document.createElement('div');
  body.className = 'ws-body';
  root.appendChild(body);
  try { def.mount(body, ctxFor(def, true)); } catch (e) { console.error('mount ' + def.id, e); }
}

function subnavEl(def) {
  const nav = document.createElement('nav');
  nav.className = 'subnav';
  nav.setAttribute('aria-label', def.title + ' sections');
  nav.innerHTML = `<div class="subnav-in">${def.sections.map(s =>
    `<a href="#/${def.id}/${s.id}" data-sec="${s.id}">${esc(s.title)}${s.hint ? `<kbd>${esc(s.hint)}</kbd>` : ''}</a>`).join('')}</div>`;
  nav.addEventListener('click', e => {
    const a = e.target.closest('a[data-sec]');
    if (!a) return;
    e.preventDefault();
    go(def.id, a.dataset.sec);
  });
  return nav;
}

// Never call scrollIntoView on the sticky sub-nav: the browser would scroll the
// PAGE to clear scroll-padding-top, which moves the sticky nav with it, forever.
// Only the nav's own horizontal scroller is adjusted, and only on change.
function paintSubnav(def, active) {
  const nav = rootOf(def.id).querySelector('.subnav');
  if (!nav || nav.dataset.active === active) return;
  nav.dataset.active = active;
  let onEl = null;
  for (const a of nav.querySelectorAll('a')) {
    const on = a.dataset.sec === active;
    a.classList.toggle('on', on);
    if (on) { onEl = a; a.setAttribute('aria-current', def.subnav === 'tabs' ? 'page' : 'location'); } else a.removeAttribute('aria-current');
  }
  const strip = nav.querySelector('.subnav-in');
  if (onEl && strip && strip.scrollWidth > strip.clientWidth) {
    const l = onEl.offsetLeft - strip.offsetLeft, r = l + onEl.offsetWidth;
    if (l < strip.scrollLeft) strip.scrollLeft = l - 12;
    else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 12;
  }
}

function paintTabs() {
  html.dataset.ws = cur.id;
  for (const a of tabsEl.querySelectorAll('[data-ws]')) {
    const on = a.dataset.ws === cur.id;
    a.setAttribute('aria-current', on ? 'page' : 'false');
  }
}

function chromeOffset() {
  const nav = rootOf(cur.id).querySelector('.subnav');
  return (parseFloat(getComputedStyle(html).getPropertyValue('--chrome-h')) || 0) + (nav ? nav.offsetHeight : 0) + 8;
}
function scrollToSection(def, id, instant = false) {
  const el = rootOf(def.id).querySelector(`[data-section="${CSS.escape(id)}"]`);
  if (!el) return;
  const top = el.getBoundingClientRect().top + scrollY - chromeOffset();
  // Instant when arriving from another workspace (nothing to animate from) or with reduced motion.
  scrollTo({ top: Math.max(0, top), behavior: instant || reduceMotion.matches || document.hidden ? 'instant' : 'smooth' });
}

function apply() {
  const r = parse(location.hash);
  if (!r) { go(initialWs(), null, { replace: true }); return; }
  if (r.legacy) history.replaceState(history.state, '', '#/' + r.ws + (r.section ? '/' + r.section : ''));
  const def = byId.get(r.ws);
  let section = def.sections.some(s => s.id === r.section) ? r.section : null;
  if (def.subnav === 'tabs' && !section) section = def.sections.some(s => s.id === lastSection[def.id]) ? lastSection[def.id] : def.sections[0]?.id || null;
  const prev = cur;
  const wsChanged = prev !== def;
  const secChanged = section !== curSection;

  hideTip();
  if (wsChanged && prev) {
    savedScroll[prev.id] = scrollY;
    try { prev.hide?.(); } catch (e) { console.error(e); }
    rootOf(prev.id).hidden = true;
  }
  cur = def;
  curSection = section;
  curParams = r.params || new URLSearchParams();
  ensureMounted(def);
  const root = rootOf(def.id);
  root.hidden = false;
  try { localStorage.setItem(KEY, def.id); } catch { /* ignore */ }
  if (def.subnav === 'tabs' && section) {
    for (const el of root.querySelectorAll('[data-section]')) el.hidden = el.dataset.section !== section;
    lastSection[def.id] = section;
    try { localStorage.setItem(SEC_KEY, JSON.stringify(lastSection)); } catch { /* ignore */ }
  }
  paintTabs();
  paintSubnav(def, section || def.sections[0]?.id);
  document.title = def.title + ' · Market Pulse';

  if (wsChanged) { try { def.show?.(ctxFor(def, true)); } catch (e) { console.error(e); } }
  try { def.route?.(ctxFor(def, false)); } catch (e) { console.error(e); }
  if (wsChanged || (def.subnav === 'tabs' && secChanged)) renderWs(def, true);

  // Scroll: sections in scroll mode jump; switching workspace restores where you were.
  if (def.subnav === 'scroll' && section) { scrollToSection(def, section, wsChanged); pendingScroll = store.S ? null : { def, section }; }
  else if (wsChanged) scrollTo({ top: savedScroll[def.id] || 0, behavior: 'instant' });
  else if (secChanged) { const nav = root.querySelector('.subnav'); if (nav && scrollY > root.offsetTop) scrollTo({ top: root.offsetTop - 4, behavior: 'instant' }); }

  const detail = { ws: def.id, section, prev: prev?.id || null };
  for (const fn of routeSubs) { try { fn(detail); } catch (e) { console.error(e); } }
  window.dispatchEvent(new CustomEvent('mp:route', { detail }));
}

function renderWs(def, force) {
  if (!store.S || !def.update) return;
  try { def.update(store.S, ctxFor(def, force)); } catch (e) { console.error('update ' + def.id, e); }
  refreshSourceBadges(rootOf(def.id), store.S.status);
}
/** renderActive({ force }) — app.js calls this on every snapshot / resize / palette change. */
export function renderActive({ force = false } = {}) {
  if (!cur) return;
  renderWs(cur, force);
  if (pendingScroll && store.S) {
    const p = pendingScroll;
    pendingScroll = null;
    if (p.def === cur && p.section === curSection) scrollToSection(cur, curSection, true);
  }
}

// Scroll-spy for 'scroll' workspaces: highlight the section under the sub-nav.
let spyRaf = 0;
addEventListener('scroll', () => {
  if (!cur || cur.subnav !== 'scroll' || cur.sections.length < 2) return;
  cancelAnimationFrame(spyRaf);
  spyRaf = requestAnimationFrame(() => {
    const off = chromeOffset() + 24;
    let active = cur.sections[0].id;
    for (const s of cur.sections) {
      const el = rootOf(cur.id).querySelector(`[data-section="${s.id}"]`);
      if (el && el.getBoundingClientRect().top <= off) active = s.id;
    }
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) active = cur.sections.at(-1).id;
    paintSubnav(cur, active);
  });
}, { passive: true });

// ---------------------------------------------------------------------------
// Chrome: workspace tabs, sticky offsets, shortcuts, view menu, shortcut sheet
// ---------------------------------------------------------------------------
function buildTabs() {
  tabsEl = document.getElementById('wsTabs');
  tabsEl.innerHTML = workspaces.map(w =>
    `<a class="ws-tab" href="#/${w.id}" data-ws="${w.id}" aria-current="false"><kbd aria-hidden="true">${w.key}</kbd><span>${esc(w.title)}</span></a>`).join('');
  tabsEl.addEventListener('click', e => {
    const a = e.target.closest('[data-ws]');
    if (!a) return;
    e.preventDefault();
    if (cur?.id === a.dataset.ws) { scrollTo({ top: 0, behavior: reduceMotion.matches ? 'instant' : 'smooth' }); return; }
    go(a.dataset.ws);
  });
}

function measureChrome() {
  const top = document.getElementById('topbar');
  const tape = document.getElementById('taperow');
  const tapeSticky = getComputedStyle(tape).position === 'sticky';
  html.style.setProperty('--top-h', top.offsetHeight + 'px');
  html.style.setProperty('--chrome-h', top.offsetHeight + (tapeSticky ? tape.offsetHeight : 0) + 'px');
}

const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function initShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(document.activeElement)) return;
    if (document.querySelector('.drawer.open')) return;
    if (/^[1-9]$/.test(e.key)) {
      const w = workspaces.find(x => x.key === e.key);
      if (w) { e.preventDefault(); go(w.id); }
    } else if (e.key === '?') { e.preventDefault(); toggleSheet(); }
  });
}

// Keyboard shortcuts sheet (also reachable from the View menu and the command bar).
let sheet = null, sheetReturn = null;
export function toggleSheet(force) {
  if (!sheet) {
    sheet = document.getElementById('keysheet');
    sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) toggleSheet(false); });
    sheet.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); toggleSheet(false); } });
  }
  const open = force ?? sheet.hidden;
  if (open) {
    sheetReturn = document.activeElement;
    import('./commands.js').then(({ commandHints }) => {
      sheet.querySelector('#ksMnemonics').innerHTML = commandHints().map(c => `<div><kbd>${esc(c.hint)}${c.arg ? ' <i>' + esc(c.argOptional ? `[${c.arg}]` : `‹${c.arg}›`) + '</i>' : ''}</kbd><span>${esc(c.title)}</span></div>`).join('');
    });
    sheet.querySelector('#ksWs').innerHTML = workspaces.map(w => `<div><kbd>${w.key}</kbd><span>${esc(w.title)}</span></div>`).join('');
    sheet.hidden = false;
    sheet.querySelector('[data-close]').focus();
  } else {
    sheet.hidden = true;
    sheetReturn?.focus?.({ preventScroll: true });
  }
}

export function initShell() {
  main = document.getElementById('wsRoot');
  const foot = main.querySelector('.foot');
  for (const w of workspaces) {
    const s = document.createElement('section');
    s.className = 'ws';
    s.id = 'ws-' + w.id;
    s.dataset.ws = w.id;
    s.hidden = true;
    s.setAttribute('aria-label', w.title);
    main.insertBefore(s, foot);
  }
  buildTabs();
  measureChrome();
  new ResizeObserver(measureChrome).observe(document.getElementById('topbar'));
  matchMedia('(max-width: 767px)').addEventListener('change', measureChrome);
  initShortcuts();
  addEventListener('hashchange', apply);
  apply();
}
