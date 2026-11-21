// Shared UI primitives. Every workspace builds its panels from these so the
// app reads as one system. See the conventions block at the top of shell.js
// for how they fit together. Styles live in css/ui.css.
//
// String helpers (…HTML) return markup for templates. Arguments named title,
// sub, note, controls, body, footer, message are trusted HTML written by us;
// escape any data you interpolate with esc(). Text that comes from data
// (labels, symbols) is escaped by the helper where noted.
import { esc, fmtPct, cls, arrow, sparkSVG } from './util.js';

export { tsChart, SERIES_COLORS } from './tschart.js';
export { seg, esc } from './util.js';

/** Parse one HTML string into its first element. */
export function htmlToEl(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
/**
 * panelHTML({ id, title, sub, note, info, controls, body, bodyId, footer, source, span, cls, minH })
 *  id       required, unique on the page; header gets id-t for aria-labelledby
 *  title    short, Title Case; shown as the amber panel label
 *  sub      one line of technical context (what is measured, units)
 *  note     one plain-English line for a non-specialist; hidden when Notes is off
 *  info     longer "How to read this" text for the ⓘ popover (plain text, \n\n = new paragraph)
 *  controls HTML placed top-right (segHTML, buttons)
 *  body     initial body HTML (defaults to a skeleton so the panel has height)
 *  bodyId   id for the body element when renderers target it directly
 *  bodyCls  extra classes on the body element (e.g. 'scroll-y')
 *  footer   extra footer HTML (left side)
 *  source   sourceBadgeHTML options, rendered at the footer's right
 *  span     grid columns out of 12 (default 12); stacks to 12 below 1200px
 *  minH     min-height of the body in px, so refreshes never shift the layout
 */
export function panelHTML({ id, title, sub = '', note = '', info = '', controls = '', body, bodyId = '', bodyCls = '', footer = '', source = null, span = 12, cls: extra = '', minH = 0 }) {
  const foot = footer || source ? `<footer class="panel-foot"><div class="panel-foot-l">${footer}</div>${source ? sourceBadgeHTML(source) : ''}</footer>` : '';
  return `<section class="panel span-${span} ${extra}" id="${id}" aria-labelledby="${id}-t">
  <header class="panel-head">
    <div class="panel-titles">
      <h2 id="${id}-t"><span>${title}</span>${info ? infoButtonHTML(info, title) : ''}</h2>
      ${sub ? `<p class="sub">${sub}</p>` : ''}
      ${note ? `<p class="panel-note">${note}</p>` : ''}
    </div>
    ${controls ? `<div class="panel-controls">${controls}</div>` : ''}
  </header>
  <div class="panel-body${bodyCls ? ' ' + bodyCls : ''}"${bodyId ? ` id="${bodyId}"` : ''}${minH ? ` style="min-height:${minH}px"` : ''}>${body ?? skeletonHTML()}</div>
  ${foot}
</section>`;
}
/** Same as panelHTML but returns an element. */
export const panel = opts => htmlToEl(panelHTML(opts));

const bodyOf = target => (target.classList.contains('panel') ? target.querySelector('.panel-body') : target);

/**
 * setPanelState(panelOrBody, 'loading' | 'empty' | 'error' | 'ready', { title, message, retry, rows, chart })
 * Swaps the body for a skeleton / empty state / error state. 'ready' only
 * clears the flag; render your content after it. The body keeps its height.
 */
export function setPanelState(target, state, opts = {}) {
  const body = bodyOf(target);
  const pnl = body.closest('.panel');
  if (pnl) pnl.dataset.state = state;
  if (state === 'ready') return body;
  if (state === 'loading') body.innerHTML = skeletonHTML(opts);
  else if (state === 'empty') body.innerHTML = emptyStateHTML(opts);
  else if (state === 'error') {
    body.innerHTML = errorStateHTML(opts);
    if (opts.retry) body.querySelector('[data-retry]')?.addEventListener('click', opts.retry, { once: true });
  }
  return body;
}

/** skeletonHTML({ rows = 4, chart = false, height }) — neutral placeholder bars. */
export function skeletonHTML({ rows = 4, chart = false, height = 0 } = {}) {
  const lines = Array.from({ length: rows }, (_, i) => `<i style="width:${[92, 78, 85, 64, 88, 72][i % 6]}%"></i>`).join('');
  return `<div class="skel" aria-hidden="true"${height ? ` style="min-height:${height}px"` : ''}>${chart ? '<b class="skel-chart"></b>' : ''}${lines}</div><span class="sr-only">Loading</span>`;
}

const ICONS = {
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  chart: '<path d="M4 19h16"/><path d="M5 15l4-4 3 3 6-7"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 10h16M10 10v9"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  calc: '<rect x="6" y="3.5" width="12" height="17" rx="1.5"/><path d="M9 7.5h6M9 12h.5M12 12h.5M15 12h.5M9 15.5h.5M12 15.5h.5M15 15.5h.5"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.4 3.5 5 3.5 8s-1.1 5.6-3.5 8c-2.4-2.4-3.5-5-3.5-8s1.1-5.6 3.5-8z"/>',
};
export const icon = (name, size = 20) => `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name] || ICONS.grid}</svg>`;

/** emptyStateHTML({ title, message, icon = 'grid', action: { label, cmd } | { label, href } }) */
export function emptyStateHTML({ title = 'Nothing to show', message = '', icon: ic = 'grid', action = null } = {}) {
  const act = action ? (action.href ? `<a class="btn" href="${esc(action.href)}">${esc(action.label)}</a>`
    : `<button type="button" class="btn" data-cmd="${esc(action.cmd || '')}">${esc(action.label)}</button>`) : '';
  return `<div class="state state-empty">${icon(ic, 22)}<div class="state-t">${title}</div>${message ? `<p class="state-m">${message}</p>` : ''}${act}</div>`;
}

/** errorStateHTML({ title, message, retry }) — when retry is passed to setPanelState a Retry button appears. */
export function errorStateHTML({ title = 'Could not load this data', message = '', retry = null } = {}) {
  return `<div class="state state-error" role="alert">${icon('alert', 22)}<div class="state-t">${title}</div>${message ? `<p class="state-m">${message}</p>` : ''}${retry ? '<button type="button" class="btn" data-retry>Retry</button>' : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------
/**
 * statTileHTML({ label, value, delta, deltaLabel, tone, spark, sparkBase, pct, pctLabel, sub, sym, title })
 *  value      preformatted string (use fmtPrice / fmtPct)
 *  delta      number = percent change (formatted + colored), or a preformatted string
 *  tone       override delta color: 'up' | 'down' | 'flat' | 'warn'; 'invert' flips (VIX up = bad)
 *  spark      array of numbers for a sparkline; sparkBase draws a dashed reference
 *  sparkColor sparkline color (any CSS color, e.g. 'var(--ink-2)'). Default: up/down color by
 *             direction, which is wrong when rising is bad (unemployment), so pass one there
 *  pct        0..100 percentile, drawn as a bar with a marker; pctLabel explains it
 *  sym        makes the tile open the chart drawer
 */
export function statTileHTML({ label, value, delta = null, deltaLabel = '', tone = null, spark = null, sparkBase = null, sparkColor = null, pct = null, pctLabel = '', sub = '', sym = '', title = '' }) {
  let dHTML = '';
  if (delta != null && delta !== '') {
    const num = typeof delta === 'number';
    let k = tone && tone !== 'invert' ? tone : num ? cls(delta) : 'flat';
    if (tone === 'invert' && num) k = delta > 0 ? 'down' : delta < 0 ? 'up' : 'flat';
    dHTML = `<div class="stat-d ${k}">${num ? `${arrow(delta)} ${fmtPct(delta)}` : delta}${deltaLabel ? ` <span>${esc(deltaLabel)}</span>` : ''}</div>`;
  }
  const sp = spark && spark.length > 1 ? `<div class="stat-spark">${sparkSVG(spark, { w: 160, h: 24, base: sparkBase, ...(sparkColor ? { color: sparkColor } : {}) })}</div>` : '';
  const pb = pct != null && isFinite(pct) ? `<div class="pbar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${esc(pctLabel || 'Percentile')}"><i style="left:${Math.max(0, Math.min(100, pct))}%"></i></div>${pctLabel ? `<div class="pbar-l">${esc(pctLabel)}</div>` : ''}` : '';
  return `<div class="stat${sym ? ' is-link' : ''}"${sym ? ` data-sym="${esc(sym)}" tabindex="0" role="button"` : ''}${title ? ` title="${esc(title)}"` : ''}>
    <div class="stat-k">${esc(label)}</div><div class="stat-v">${value ?? '—'}</div>${dHTML}${sp}${pb}${sub ? `<div class="stat-s">${sub}</div>` : ''}</div>`;
}
/** statGridHTML(tiles, { min = 140 }) — responsive auto-fill row of stat tiles. */
export const statGridHTML = (tiles, { min = 140 } = {}) => `<div class="stats" style="--stat-min:${min}px">${tiles.map(statTileHTML).join('')}</div>`;

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------
/**
 * segHTML({ id, options: [[value, label, title?], …], value, small, label })
 * Wire it with seg(el, onChange) from util.js (re-exported here).
 */
export function segHTML({ id, options, value, small = false, label = '' }) {
  return `<div class="seg${small ? ' small' : ''}" id="${id}" role="group"${label ? ` aria-label="${esc(label)}"` : ''}>${options.map(([v, l, t]) =>
    `<button type="button" data-v="${esc(v)}"${v === value ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}${t ? ` title="${esc(t)}"` : ''}>${l}</button>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// "How to read this" explainer + Notes toggle
// ---------------------------------------------------------------------------
/** infoButtonHTML(text, label) — ⓘ button; the popover is wired globally by initUI(). */
export function infoButtonHTML(text, label = '') {
  const plain = String(label).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  return `<button type="button" class="info-btn" aria-label="How to read ${esc(plain)}" aria-expanded="false" data-explain="${esc(text)}" data-explain-title="${esc(plain)}">i</button>`;
}

let pop = null, popFor = null, popY = 0;
function closeExplain(restore = true) {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  popFor?.setAttribute('aria-expanded', 'false');
  if (restore) popFor?.focus({ preventScroll: true });
  popFor = null;
}
function openExplain(btn) {
  if (popFor === btn) { closeExplain(); return; }
  if (!pop) {
    pop = htmlToEl('<div class="explain" role="dialog" aria-modal="false" hidden><div class="explain-h"><b></b><button type="button" class="explain-x" aria-label="Close">✕</button></div><div class="explain-b"></div></div>');
    document.body.appendChild(pop);
    pop.querySelector('.explain-x').addEventListener('click', () => closeExplain());
  }
  closeExplain(false);
  popFor = btn;
  popY = scrollY;
  btn.setAttribute('aria-expanded', 'true');
  pop.querySelector('b').textContent = 'How to read: ' + (btn.dataset.explainTitle || '');
  pop.querySelector('.explain-b').innerHTML = btn.dataset.explain.split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join('');
  pop.setAttribute('aria-label', 'How to read ' + (btn.dataset.explainTitle || ''));
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = Math.min(360, innerWidth - 24);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(12, Math.min(r.left - 12, innerWidth - w - 12)) + 'px';
  const below = r.bottom + 8;
  pop.style.top = (below + pop.offsetHeight > innerHeight - 12 ? Math.max(12, r.top - pop.offsetHeight - 8) : below) + 'px';
  pop.querySelector('.explain-x').focus({ preventScroll: true });
}

const NOTES_KEY = 'mp.notes';
export function notesOn() { return !document.documentElement.classList.contains('notes-off'); }
/** setNotes(on) — show/hide every .panel-note; persisted; fires window 'mp:notes'. */
export function setNotes(on) {
  document.documentElement.classList.toggle('notes-off', !on);
  try { localStorage.setItem(NOTES_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent('mp:notes', { detail: on }));
}

/** Call once at startup: wires every ⓘ button and restores the Notes preference. */
export function initUI() {
  let on = true;
  try { on = localStorage.getItem(NOTES_KEY) !== '0'; } catch { /* default on */ }
  document.documentElement.classList.toggle('notes-off', !on);
  document.addEventListener('click', e => {
    const b = e.target.closest('.info-btn');
    if (b) { e.preventDefault(); e.stopPropagation(); openExplain(b); return; }
    if (pop && !pop.hidden && !e.target.closest('.explain')) closeExplain(false);
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop && !pop.hidden) { e.stopPropagation(); closeExplain(); } }, true);
  window.addEventListener('scroll', () => { if (Math.abs(scrollY - popY) > 80) closeExplain(false); }, { passive: true });
  window.addEventListener('mp:route', () => closeExplain(false));
}

// ---------------------------------------------------------------------------
// Source / as-of badge
// ---------------------------------------------------------------------------
// key = a field of snapshot.status (quotes, history, intraday, news, curve):
// those badges refresh automatically on every snapshot. For data you fetch
// yourself, call setSourceBadge(el, { asOf, error }) after each load.
export const STALE_AFTER = { quotes: 3 * 60e3, intraday: 15 * 60e3, news: 60 * 60e3, history: 4 * 86400e3, curve: 5 * 86400e3 };
const etHM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const etMD = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
const etDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
/** fmtAsOf(ms) → "16:00 ET" today, "Nov 19 16:00 ET" otherwise. */
export function fmtAsOf(t) {
  if (!t) return '';
  const d = new Date(t);
  return (etDay.format(d) === etDay.format(new Date()) ? '' : etMD.format(d) + ' ') + etHM.format(d) + ' ET';
}

/**
 * sourceBadgeHTML({ source = 'Yahoo Finance', key, asOf, staleAfter, label, dateOnly })
 *  dateOnly 'month' | 'day' — for data with no time of day: shows "data to Sep 2026" or
 *           "data to Sep 30, 2026" instead of "as of 16:00 ET". asOf may then also be a
 *           'YYYY-MM' or 'YYYY-MM-DD' string. Pass staleAfter if lateness should show.
 */
export function sourceBadgeHTML({ source = 'Yahoo Finance', key = '', asOf = null, staleAfter = 0, label = '', dateOnly = '' } = {}) {
  return `<span class="src" data-src="${esc(source)}"${key ? ` data-src-key="${esc(key)}"` : ''}${staleAfter ? ` data-stale-after="${staleAfter}"` : ''}${label ? ` data-src-label="${esc(label)}"` : ''}${dateOnly ? ` data-date-only="${esc(dateOnly)}"` : ''}>${badgeText(source, asOf, label, dateOnly)}</span>`;
}
const utcMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' });
const utcDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
/** Dates without a time: 'YYYY-MM' / 'YYYY-MM-DD' strings are calendar dates (read as UTC, no day shift). */
function toCalendarDate(t) {
  if (typeof t === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(t)) return new Date(t.length === 7 ? t + '-01T00:00:00Z' : t + 'T00:00:00Z');
  return t instanceof Date ? t : new Date(t);
}
function badgeText(source, asOf, label, dateOnly = '') {
  let when = '';
  if (asOf) {
    const d = dateOnly ? toCalendarDate(asOf) : null;
    when = d && !isNaN(d) ? ' · data to ' + (dateOnly === 'day' ? utcDay : utcMonth).format(d) : !dateOnly ? ' · as of ' + fmtAsOf(asOf) : '';
  }
  return `<i class="src-dot" aria-hidden="true"></i>${esc(source)}${label ? ' · ' + esc(label) : ''}${when}`;
}
/** setSourceBadge(el, { asOf, error, stale }) — el is the .src element (or a panel containing one). */
export function setSourceBadge(el, { asOf = null, error = null, stale = null } = {}) {
  const b = el?.classList?.contains('src') ? el : el?.querySelector('.src');
  if (!b) return;
  const key = b.dataset.srcKey;
  const dateOnly = b.dataset.dateOnly || '';
  const lim = +b.dataset.staleAfter || (dateOnly ? 0 : STALE_AFTER[key]) || 0;
  const t = asOf && dateOnly ? +toCalendarDate(asOf) : asOf;
  const isStale = stale ?? (!!t && !!lim && Date.now() - t > lim);
  b.classList.toggle('is-stale', !error && isStale);
  b.classList.toggle('is-error', !!error);
  if (error) b.innerHTML = `<i class="src-dot" aria-hidden="true"></i>${esc(b.dataset.src)} · failed to load${typeof error === 'string' ? ': ' + esc(error) : ''}`;
  else b.innerHTML = badgeText(b.dataset.src, asOf, b.dataset.srcLabel, dateOnly) + (isStale ? ' · stale' : '');
  b.title = error ? 'The last request for this data failed.' : isStale ? 'This data has not refreshed recently.' : '';
}
/** refreshSourceBadges(root, status) — updates every keyed badge under root from snapshot.status. */
export function refreshSourceBadges(root, status) {
  if (!root || !status) return;
  for (const b of root.querySelectorAll('.src[data-src-key]')) setSourceBadge(b, { asOf: status[b.dataset.srcKey] || null });
}

// ---------------------------------------------------------------------------
// fetchJSON: in-flight dedupe, optional short cache, timeout, readable errors
// ---------------------------------------------------------------------------
export class FetchError extends Error {
  constructor(message, { status = 0, url = '', cause } = {}) { super(message, { cause }); this.name = 'FetchError'; this.status = status; this.url = url; }
}
const inflight = new Map();
const cache = new Map();
/**
 * fetchJSON(url, { timeout = 15000, ttl = 0 }) → Promise<data>
 * Identical concurrent requests share one fetch. ttl (ms) reuses a recent
 * success. Rejects with FetchError whose .message is safe to show users.
 */
export function fetchJSON(url, { timeout = 15000, ttl = 0 } = {}) {
  const hit = cache.get(url);
  if (ttl && hit && Date.now() - hit.t < ttl) return Promise.resolve(hit.v);
  if (inflight.has(url)) return inflight.get(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const p = fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } })
    .then(async r => {
      if (!r.ok) {
        let msg = '';
        try { const j = await r.json(); msg = j.error || j.message || ''; } catch { /* not JSON */ }
        throw new FetchError(msg || `The server answered ${r.status}`, { status: r.status, url });
      }
      return r.json();
    })
    .catch(e => {
      if (e instanceof FetchError) throw e;
      throw new FetchError(e.name === 'AbortError' ? 'The request timed out' : 'Could not reach the server', { url, cause: e });
    })
    .then(v => { cache.set(url, { t: Date.now(), v }); return v; })
    .finally(() => { clearTimeout(timer); inflight.delete(url); });
  inflight.set(url, p);
  return p;
}

/**
 * loadPanel(panelEl, load, render, { isEmpty, empty, source }) — the standard
 * fetch-and-render cycle: skeleton → render(body, data) | empty | error + Retry.
 * load() returns a promise (usually fetchJSON). Returns the data or null.
 */
export async function loadPanel(panelEl, load, render, { isEmpty = d => d == null || (Array.isArray(d) && !d.length), empty = {}, asOf = d => d?.asOf ?? Date.now() } = {}) {
  const body = panelEl.querySelector('.panel-body');
  if (!body.dataset.loaded) setPanelState(panelEl, 'loading', { chart: true });
  try {
    const data = await load();
    if (isEmpty(data)) setPanelState(panelEl, 'empty', empty);
    else { setPanelState(panelEl, 'ready'); render(body, data); body.dataset.loaded = '1'; }
    setSourceBadge(panelEl, { asOf: asOf(data) });
    return data;
  } catch (e) {
    console.error(panelEl.id, e);
    setPanelState(panelEl, 'error', { message: esc(e.message), retry: () => loadPanel(panelEl, load, render, { isEmpty, empty, asOf }) });
    setSourceBadge(panelEl, { error: true });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sortable data table
// ---------------------------------------------------------------------------
/**
 * dataTable(container, { columns, rows, rowKey, sort, dir, sym, onRowClick, csv, maxHeight, empty, label })
 *  columns: [{ key, label, type: 'text' | 'num', value: row => sortValue, fmt: (v, row) => html,
 *              tone: (v, row) => 'up' | 'down' | '', title, sortable = true, hideBelow: 'sm' | 'md' }]
 *  sym:     row => ticker; the row then opens the chart drawer (click, Enter)
 *  csv:     filename; adds an "Export CSV" button under the table
 *  rowClass: row => 'cls …'          extra classes on a row (e.g. highlight the current one)
 *  rowAttrs: row => ({ 'data-x': 1 }) extra attributes on a row (values are escaped)
 *  onSort:   ({ key, dir }) => {}     called after the user re-sorts (dir 1 = ascending)
 * Returns { update(rows), sortBy(key, dir), getSort() → { key, dir }, exportCSV(), el }.
 * Numbers are right-aligned tabular mono; the header sticks inside maxHeight.
 */
export function dataTable(container, opts) {
  const o = { rows: [], dir: -1, empty: 'No rows to show.', maxHeight: 0, label: '', ...opts };
  const cols = o.columns.map(c => ({ type: 'text', sortable: true, value: r => r[c.key], ...c }));
  let rows = o.rows, sortKey = o.sort ?? null, dir = o.dir;
  container.innerHTML = `<div class="dt-wrap"${o.maxHeight ? ` style="max-height:${o.maxHeight}px"` : ''}><table class="dt"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>
    <thead><tr>${cols.map(c => `<th scope="col" class="${c.type === 'num' ? 'n' : ''}${c.hideBelow ? ' hide-' + c.hideBelow : ''}" data-k="${esc(c.key)}"${c.title ? ` title="${esc(c.title)}"` : ''}>${c.sortable ? `<button type="button">${esc(c.label)}</button>` : esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody></tbody></table></div>${o.csv ? '<div class="dt-tools"><button type="button" class="btn-link" data-csv>Export CSV</button></div>' : ''}`;
  const tbody = container.querySelector('tbody');
  const thead = container.querySelector('thead');

  const sorted = () => {
    if (!sortKey) return rows;
    const c = cols.find(x => x.key === sortKey);
    return [...rows].sort((a, b) => {
      const av = c.value(a), bv = c.value(b);
      if (av == null || bv == null || (typeof av === 'number' && !isFinite(av))) return (av == null) - (bv == null);
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
    });
  };
  function paintHead() {
    for (const th of thead.querySelectorAll('th')) {
      if (th.dataset.k === sortKey) th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
    }
  }
  function render() {
    const list = sorted();
    const html = list.length ? list.map((r, i) => {
      const s = o.sym?.(r);
      const klass = [s ? 'click' : '', o.rowClass?.(r) || ''].filter(Boolean).join(' ');
      const extra = Object.entries(o.rowAttrs?.(r) || {}).filter(([k, v]) => v != null && v !== false && !/^(class|tabindex|data-i|data-sym)$/i.test(k))
        .map(([k, v]) => ` ${esc(k)}="${esc(v === true ? '' : v)}"`).join('');
      return `<tr tabindex="0" data-i="${rows.indexOf(r)}"${s ? ` data-sym="${esc(s)}"` : ''}${klass ? ` class="${esc(klass)}"` : ''}${extra}>${cols.map(c => {
        const v = c.value(r);
        const t = c.tone?.(v, r) || '';
        return `<td class="${c.type === 'num' ? 'n' : ''}${t ? ' ' + t : ''}${c.hideBelow ? ' hide-' + c.hideBelow : ''}">${c.fmt ? c.fmt(v, r) : esc(v ?? '—')}</td>`;
      }).join('')}</tr>`;
    }).join('') : `<tr class="dt-empty"><td colspan="${cols.length}">${esc(o.empty)}</td></tr>`;
    if (html === tbody._html) return;
    const focusI = tbody.contains(document.activeElement) ? document.activeElement.closest('tr')?.dataset.i : null;
    tbody.innerHTML = html;
    tbody._html = html;
    if (focusI != null) tbody.querySelector(`tr[data-i="${focusI}"]`)?.focus({ preventScroll: true });
    paintHead();
  }
  thead.addEventListener('click', e => {
    const th = e.target.closest('th');
    const c = th && cols.find(x => x.key === th.dataset.k);
    if (!c?.sortable) return;
    dir = sortKey === c.key ? -dir : c.type === 'text' ? 1 : -1;
    sortKey = c.key;
    tbody._html = null;
    render();
    o.onSort?.({ key: sortKey, dir });
  });
  tbody.addEventListener('keydown', e => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tr.click(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling)?.focus(); }
  });
  if (o.onRowClick) tbody.addEventListener('click', e => { const tr = e.target.closest('tr[data-i]'); if (tr) o.onRowClick(rows[+tr.dataset.i], e); });
  function exportCSV() {
    const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const text = [cols.map(c => q(c.label)).join(','), ...sorted().map(r => cols.map(c => q(c.value(r))).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = o.csv.endsWith('.csv') ? o.csv : o.csv + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  container.querySelector('[data-csv]')?.addEventListener('click', exportCSV);
  render();
  return {
    el: container,
    update(next) { rows = next || []; render(); },
    sortBy(key, d = -1) { sortKey = key; dir = d; tbody._html = null; render(); },
    getSort: () => ({ key: sortKey, dir }),
    exportCSV,
  };
}

// ---------------------------------------------------------------------------
// Render helpers for workspace modules
// ---------------------------------------------------------------------------
/**
 * renderCache() → { run(key, sig, fn), reset() }
 * run() calls fn only when sig changed since the last call (and isolates
 * errors). Call reset() when ctx.force is true (workspace shown / resized /
 * palette changed) so measured charts redraw at their real size.
 */
export function renderCache() {
  const sigs = new Map();
  return {
    run(key, sig, fn) {
      if (sig !== undefined && sigs.get(key) === sig) return;
      sigs.set(key, sig);
      try { fn(); } catch (e) { console.error(key, e); }
    },
    reset() { sigs.clear(); },
  };
}
/** safe(name, fn) — run a renderer, log instead of throwing. */
export function safe(name, fn) { try { return fn(); } catch (e) { console.error(name, e); } }
