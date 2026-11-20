// Market Pulse — client entry point. Connects to the live SSE stream and
// renders every panel.
import { $, $$, esc, seg, debounce, heatColor, fmtPct, fmtPrice, fmtBig, cls, setCVD, TF_MAX, TF_LABEL } from './util.js';
import { Heatmap, matchesStock } from './heatmap.js';
import * as P from './panels.js';
import * as C from './charts.js';
import { initDetail, openDetail, refreshDetail } from './detail.js';

let S = null;
let sparks = {};
let sparksVersion = 0;
const ui = {
  heatTf: 'c', heatMode: 'perf', heatSize: 'mc', heatSector: null, search: '',
  heatView: 'map', rankSort: 'metric', rankDirection: -1,
  secTf: 'c', moverTab: 'losers', cryptoTf: 'c',
  cvd: false,
};
try { ui.cvd = localStorage.getItem('mp.cvd') === '1'; } catch { /* storage unavailable */ }
setCVD(ui.cvd);
document.body.classList.toggle('cvd', ui.cvd);
$('#cvdToggle').classList.toggle('on', ui.cvd);

// ---------------------------------------------------------------------------
// Symbol lookup (for drawer + news ticker chips)
// ---------------------------------------------------------------------------
let index = new Map();
function buildIndex() {
  index = new Map();
  for (const x of S.stocks) {
    const q = { ...x, label: x.s };
    index.set(x.ys, q); index.set(x.s, q);
  }
  const addQ = (s, q, label) => { if (q && !index.has(s)) index.set(s, { ...q, label: label || q.s }); };
  for (const g of [S.strip, S.themes, S.assets, S.global, S.commodities, S.fx, S.rates, S.vol]) for (const x of g) addQ(x.s, x.q, x.label);
  for (const s of S.sectors) if (s.etfQ) addQ(s.etf, s.etfQ, s.etf);
  for (const f of S.futures || []) addQ(f.s, f.q, f.label);
  for (const c of S.crypto) addQ(c.s, c, c.s.replace(/\d{3,}-USD$/, '').replace(/-USD$/, ''));
}
// ---------------------------------------------------------------------------
// Watchlist (per-browser convenience, stored in localStorage)
// ---------------------------------------------------------------------------
let watchSyms = ['SPY', 'QQQ', 'TLT', 'GLD', 'NVDA', 'BTC-USD'];
try { const raw = localStorage.getItem('mp.watch'); if (raw) watchSyms = JSON.parse(raw); } catch { /* defaults */ }
const extraQuotes = new Map();
function saveWatch() { try { localStorage.setItem('mp.watch', JSON.stringify(watchSyms)); } catch { /* ignore */ } }
const watchApi = {
  has: s => watchSyms.includes(s),
  toggle: s => {
    watchSyms = watchSyms.includes(s) ? watchSyms.filter(x => x !== s) : [...watchSyms, s];
    saveWatch(); refreshExtra().then(renderWatch); renderWatch();
  },
};
async function refreshExtra() {
  const need = watchSyms.filter(s => !index.has(s));
  await Promise.all(need.map(async s => {
    try {
      const r = await fetch(`/api/quote?s=${encodeURIComponent(s)}`);
      if (r.ok) { const q = await r.json(); extraQuotes.set(s, { ...q, label: s.replace(/\d{3,}-USD$/, '').replace(/-USD$/, '') }); }
    } catch { /* keep last */ }
  }));
}
setInterval(() => refreshExtra().then(renderWatch), 30000);
function renderWatch() { if (S) P.renderWatchlist($('#watchlist'), watchSyms, lookup, sparks); P.renderWatchQuick($('#wlQuick'), watchSyms); }

const lookup = s => index.get(s) || extraQuotes.get(s) || null;

// ---------------------------------------------------------------------------
// Heatmaps
// ---------------------------------------------------------------------------
// Color/format per heatmap mode. Perf & ext-hours: diverging red-gray-green.
// Rel volume & distance-from-high: single-hue sequential scales.
const seqAmber = d3.interpolateRgb('#262c38', '#ffb000');
const seqRed = t => d3.interpolateRgb('#2b303b', getPaletteEnd())(t);
function getPaletteEnd() { return ui.cvd ? '#e66100' : '#f63538'; }
function heatColorFor(v, tf) {
  if (v == null || !isFinite(v)) return '#2a2e38';
  if (tf === 'rv') return seqAmber(Math.max(0, Math.min(1, Math.log2(Math.max(v, 0.25) / 0.5) / 3))); // 0.5x .. 4x
  if (tf === 'off') return seqRed(Math.max(0, Math.min(1, -v / 30)));
  return heatColor(v, tf === 'ext' ? 3 : TF_MAX[tf] || 3);
}
function heatFmtFor(v, tf) {
  if (v == null || !isFinite(v)) return '—';
  if (tf === 'rv') return v.toFixed(1) + 'x';
  if (tf === 'off') return v.toFixed(1) + '%';
  return fmtPct(v);
}
const heatTfEff = () => (ui.heatMode === 'perf' ? ui.heatTf : ui.heatMode);
const heat = new Heatmap($('#heatmap'), {
  grouped: true,
  onClick: it => it && openDetail(it.key),
  onSector: selectSector,
  sparks: () => sparks,
  colorFor: heatColorFor,
  fmtFor: heatFmtFor,
});
const CRYPTO_MAX = { c: 6, w: 12, m: 20, ytd: 40 };
const cryptoHeat = new Heatmap($('#cryptomap'), {
  grouped: false,
  onClick: it => it && openDetail(it.key),
  maxFor: tf => CRYPTO_MAX[tf] || 6,
  sparks: () => sparks,
  tfLabels: { c: '24H', w: '7D', m: '30D', ytd: 'YTD' },
});

function heatItems() {
  return S.stocks.map(x => ({
    key: x.ys, sym: x.ys, label: x.s, name: x.n, group: x.sec, sub: x.ind, size: x.mc, price: x.p,
    perf: { c: x.c, ...x.perf, ext: x.ext?.c ?? null, rv: x.av && x.v != null ? x.v / x.av : null, off: x.h52 ? (x.p / x.h52 - 1) * 100 : null },
    extra: `<div class="tt-row"><span>Volume</span><b>${x.v ? (x.v / 1e6).toFixed(1) + 'M' : '—'}${x.av ? ` · ${(x.v / x.av).toFixed(1)}x avg` : ''}</b></div>`,
  }));
}
function cryptoItems() {
  return S.crypto.map(c => ({
    key: c.s, sym: c.s, label: c.s.replace(/\d{3,}-USD$/, '').replace(/-USD$/, ''), name: (c.n || '').replace(/ USD$/, ''),
    size: c.mc, price: c.p, perf: { c: c.c, w: c.perf.w, m: c.perf.m, ytd: c.perf.ytd },
  }));
}

function renderHeatLegend() {
  const tf = heatTfEff();
  if (tf === 'rv') {
    $('#heatLegend').innerHTML = [0.5, 0.75, 1, 1.5, 2, 3, 4].map(v => `<span style="background:${heatColorFor(v, 'rv')}">${v}x</span>`).join('');
    return;
  }
  if (tf === 'off') {
    $('#heatLegend').innerHTML = [0, -5, -10, -15, -20, -25, -30].map(v => `<span style="background:${heatColorFor(v, 'off')}">${v}%</span>`).join('');
    return;
  }
  const max = tf === 'ext' ? 3 : TF_MAX[tf];
  const steps = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map(t => t * max);
  $('#heatLegend').innerHTML = steps.map(v => `<span style="background:${heatColor(v, max)}">${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}%</span>`).join('');
}
function renderSectorFilter() {
  const select = $('#heatSector');
  const sectors = [...(S?.sectors || [])].sort((a, b) => a.name.localeCompare(b.name));
  const options = '<option value="">All sectors</option>' + sectors.map(s =>
    `<option value="${esc(s.name)}">${esc(s.name)} · ${TF_LABEL[ui.heatTf]} ${fmtPct(s[ui.heatTf], 1)}</option>`
  ).join('');
  if (select._options !== options) {
    select.innerHTML = options;
    select._options = options;
  }
  select.value = ui.heatSector || '';
}

function selectSector(name) {
  ui.heatSector = name || null;
  $('#heatSector').value = name || '';
  refreshExplorer();
}
$('#heatSector').addEventListener('change', e => selectSector(e.target.value));

function matchingItems(query = ui.search) {
  const list = ui.heatView === 'list';
  const q = query.trim().toUpperCase();
  return heat.items.filter(it =>
    (!ui.heatSector || it.group === ui.heatSector) &&
    (list || ui.heatSize === 'eq' || heat.sizeOf(it) > 0) && matchesStock(it, q));
}

function renderRankings(items) {
  const tf = heatTfEff();
  const key = ui.rankSort;
  const value = it => key === 'metric' ? it.perf[tf] : it[key];
  items.sort((a, b) => {
    const av = value(a), bv = value(b);
    if (av == null || bv == null) return Number(av == null) - Number(bv == null) || a.label.localeCompare(b.label);
    const diff = key === 'label' ? av.localeCompare(bv) : av - bv;
    return diff * ui.rankDirection || a.label.localeCompare(b.label);
  });
  $('#rankMetric').textContent = TF_LABEL[tf] ? TF_LABEL[tf] + ' change' :
    { ext: 'Ext. change', rv: 'Rel. volume', off: 'Off high' }[tf];
  for (const b of $$('#heatList [data-sort]')) {
    const th = b.closest('th');
    if (b.dataset.sort === key) th.setAttribute('aria-sort', ui.rankDirection === 1 ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  }
  const rows = $('#rankRows');
  const html = items.map(it => {
    const v = it.perf[tf];
    return `<tr><td><button data-sym="${esc(it.key)}"><b>${esc(it.label)}</b><small>${esc(it.name)}</small></button></td>
      <td>${fmtPrice(it.price)}</td><td class="rank-cap">${fmtBig(it.size, '$')}</td>
      <td><span class="rank-value ${tf === 'rv' ? 'flat' : cls(v)}">${heatFmtFor(v, tf)}</span></td></tr>`;
  }).join('');
  if (html !== rows._html) {
    const focused = rows.contains(document.activeElement) && document.activeElement.dataset.sym;
    rows.innerHTML = html;
    rows._html = html;
    if (focused) rows.querySelector(`[data-sym="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  }
}

function refreshExplorer(live = false) {
  const list = ui.heatView === 'list';
  const opts = { tf: heatTfEff(), size: ui.heatSize, sector: ui.heatSector, search: ui.search };
  $('#heatSize').hidden = list;
  $('#heatTf').hidden = ui.heatMode !== 'perf';
  $('#heatmap').hidden = list;
  if (live) heat.update(heatItems(), opts);
  else heat.setOpts(opts);
  const matches = matchingItems();
  const n = matches.length;
  $('#heatList').hidden = !list || !n;
  $('#heatmap').hidden = list || !n;
  $('#heatLegend').parentElement.hidden = list || !n;
  const empty = $('#heatEmpty');
  empty.hidden = !!n;
  empty.textContent = !heat.items.length ? 'Waiting for stock quotes. The explorer updates automatically.' :
    ui.search.trim() ? 'No matching stocks. Try another ticker or company name.' :
    list ? 'No stock quotes available for this sector.' : 'No tiles available. Try another sector, equal sizing or rankings.';
  const count = n + (ui.search.trim() ? (n === 1 ? ' match' : ' matches') : (n === 1 ? ' stock' : ' stocks'));
  if ($('#heatCount').textContent !== count) $('#heatCount').textContent = count;
  if (list) renderRankings(matches);
  renderHeatSub();
  renderHeatLegend();
}

$('#heatList thead').addEventListener('click', e => {
  const key = e.target.closest('[data-sort]')?.dataset.sort;
  if (!key) return;
  ui.rankDirection = ui.rankSort === key ? -ui.rankDirection : key === 'label' ? 1 : -1;
  ui.rankSort = key;
  renderRankings(matchingItems());
});

// ---------------------------------------------------------------------------
// Render orchestration
// ---------------------------------------------------------------------------
const sigs = {};
function once(key, sig, fn) {
  if (sigs[key] === sig) return;
  sigs[key] = sig;
  try { fn(); } catch (e) { console.error(key, e); }
}
const safe = (name, fn) => { try { fn(); } catch (e) { console.error(name, e); } };

function renderAll() {
  if (!S) return;
  buildIndex();
  safe('strip', () => P.renderStrip($('#strip'), S.strip));
  safe('tape', () => P.renderTape($('#tapeInner'), S.stocks));
  safe('regime', () => P.renderRegime($('#regime'), S));
  safe('futures', () => P.renderFutures($('#futures'), S.futures || [], S.market.state));
  safe('heat', () => refreshExplorer(true));
  safe('secfilter', renderSectorFilter);
  safe('fear', () => C.fearGauge($('#fear'), S.fear));
  safe('brief', () => P.renderBrief($('#brief'), S.brief));
  safe('sectors', () => P.renderSectorBars($('#sectorBars'), S.sectors, ui.secTf));
  once('rrg', JSON.stringify(S.sectors.map(s => [s.rrg, s.c])) + innerWidth + ui.cvd, () => C.rrgChart($('#rrg'), S.sectors, openDetail));
  safe('risk', () => P.renderRisk($('#risk'), S.risk, S.riskScore));
  safe('assets', () => P.renderAssets($('#assets'), S.assets));
  safe('contrib', () => P.renderContrib($('#contrib'), S.contributors, S.strip.find(x => x.s === '^GSPC')?.q));
  safe('sectorFlow', () => P.renderSectorFlow($('#sectorFlow'), S.stocks, S.sectors));
  safe('themes', () => P.renderThemes($('#themes'), S.themes));
  safe('breadth', () => { P.renderBreadthNow($('#breadthNow'), S.breadth); C.distChart($('#distChart'), S.breadth.dist); });
  once('breadthHist', (S.breadth.history?.pct50?.length || 0) + ':' + sparksVersion + ':' + innerWidth, renderBreadthHist);
  safe('movers', () => P.renderMovers($('#movers'), S.movers, ui.moverTab));
  safe('earnings', () => P.renderEarnings($('#earnings'), S.earnings));
  safe('watch', renderWatch);
  safe('vol', () => { const pts = P.renderVol($('#vol'), S.vol); C.termChart($('#termChart'), pts); });
  once('map', S.global.map(g => g.q.c).join(',') + innerWidth + ui.cvd, () => C.worldMap($('#worldmap'), S.global, openDetail));
  safe('globalList', () => P.renderGlobalList($('#globalList'), S.global));
  once('curve', JSON.stringify([S.yields?.latest?.date, S.yields?.live]) + innerWidth + ':' + $('#curve').clientHeight, () => C.yieldCurve($('#curve'), S.yields));
  safe('rates', () => P.renderRateTiles($('#rateTiles'), S.rates, S.yields));
  once('spreads', (S.yields?.latest?.date || '') + innerWidth + ui.cvd, () => C.spreadChart($('#spreadChart'), S.yields?.series));
  safe('crypto', () => cryptoHeat.update(cryptoItems(), { tf: ui.cryptoTf }));
  safe('cryptoList', () => P.renderCryptoList($('#cryptoList'), S.crypto, sparks));
  safe('commod', () => P.renderQuoteTable($('#commodities'), S.commodities, { grouped: true, sparks }));
  safe('fx', () => P.renderQuoteTable($('#fx'), S.fx, { grouped: true, sparks, max: 1 }));
  once('news', S.news.map(n => n.id).join(',') + Math.floor(Date.now() / 60000), () => { $('#newsList').innerHTML = P.newsHTML(S.news, lookup); });
  safe('detail', refreshDetail);
  renderStatus();
}

function renderBreadthHist() {
  const h = S.breadth.history;
  if (!h) { $('#breadthHist').innerHTML = '<div class="empty">Waiting for history…</div>'; return; }
  const fmtD = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  const spx = h.spxLine.slice(-250);
  const start = spx[0]?.d;
  C.smallMultiples($('#breadthHist'), [
    { title: 'S&P 500', data: spx, fmt: v => v.toLocaleString('en-US', { maximumFractionDigits: 0 }), tick: d => d3.format('~s')(d), h: 96, color: '#e6edf3' },
    { title: '% of S&P 500 above 50-day average', data: h.pct50.filter(p => !start || p.d >= start), fmt: v => v.toFixed(0) + '%', tick: d => d + '%', h: 112, domain: [0, 100], color: '#3cc8d6',
      refs: [{ v: 80, l: 'overbought 80%', c: '#5d6b79' }, { v: 20, l: 'oversold 20%', c: '#5d6b79' }] },
    { title: 'Advance / decline line (cumulative)', data: h.adLine.filter(p => !start || p.d >= start), fmt: v => v.toLocaleString('en-US'), tick: d => d3.format('~s')(d), h: 112, color: '#ffb000' },
  ], { xFmt: fmtD });
}

// ---------------------------------------------------------------------------
// Header: clock, market state, freshness
// ---------------------------------------------------------------------------
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function tickClock() {
  $('#clockET').textContent = etFmt.format(new Date());
  if (S) {
    const last = S.status?.quotes;
    const age = last ? Math.max(0, Math.floor((Date.now() - last) / 1000)) : null;
    const el = $('#updated');
    const elapsed = age < 60 ? age + 's' : age < 3600 ? Math.floor(age / 60) + 'm' : Math.floor(age / 3600) + 'h';
    el.textContent = !connected ? 'Reconnecting…' : last ? `Quotes fetched ${elapsed} ago` : 'Waiting for quotes';
    el.classList.toggle('stale', !connected || !last || age > 120);
  }
}
setInterval(tickClock, 1000);
tickClock();

function renderStatus() {
  const st = S.market.state;
  const el = $('#mktState');
  const map = { REGULAR: ['open', 'US market open'], PRE: ['ext', 'Pre-market'], POST: ['ext', 'After hours'], POSTPOST: ['', 'US market closed'], PREPRE: ['', 'US market closed'], CLOSED: ['', 'US market closed'] };
  const [klass, txt] = map[st] || ['', st || '—'];
  el.className = 'mkt-state ' + klass;
  el.querySelector('.txt').textContent = txt;
  const errs = S.status?.errors || [];
  $('#statusLine').textContent = errs.length ? ` · Last data warning: ${errs[0]}` : '';
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
seg($('#heatView'), v => {
  ui.heatView = v;
  for (const b of $$('#heatView button')) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  refreshExplorer();
});
seg($('#heatTf'), v => { ui.heatTf = v; refreshExplorer(); renderSectorFilter(); });
seg($('#heatMode'), v => { ui.heatMode = v; refreshExplorer(); });
function renderHeatSub() {
  const metric = { perf: 'price change', ext: 'extended-hours change', rv: 'volume relative to the 10-day average', off: 'distance from the 52-week high' }[ui.heatMode];
  $('#heatSub').textContent = ui.heatView === 'list'
    ? 'Select a column to sort or a ticker to open its chart.'
    : (ui.heatSize === 'eq' ? 'Tiles have equal weight.' : 'Tile size shows market cap.') + ' Color shows ' + metric + '.';
}
seg($('#heatSize'), v => { ui.heatSize = v; refreshExplorer(); });
$('#heatSearch').addEventListener('input', e => { ui.search = e.target.value; refreshExplorer(); });
$('#heatSearch').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.value.trim()) return;
  const matches = matchingItems(e.target.value);
  const q = e.target.value.trim().toUpperCase();
  const hit = matches.find(it => it.label === q) || matches[0];
  if (hit) openDetail(hit.key);
});
seg($('#secTf'), v => { ui.secTf = v; P.renderSectorBars($('#sectorBars'), S.sectors, v); });
seg($('#moverTab'), v => { ui.moverTab = v; P.renderMovers($('#movers'), S.movers, v); });
seg($('#cryptoTf'), v => { ui.cryptoTf = v; cryptoHeat.setOpts({ tf: v }); });
$('#cvdToggle').addEventListener('click', () => {
  ui.cvd = !ui.cvd;
  try { localStorage.setItem('mp.cvd', ui.cvd ? '1' : '0'); } catch { /* ignore */ }
  setCVD(ui.cvd);
  document.body.classList.toggle('cvd', ui.cvd);
  $('#cvdToggle').classList.toggle('on', ui.cvd);
  renderAll();
});

// Watchlist add / remove
$('#wlQuick').addEventListener('click', e => {
  const b = e.target.closest('[data-add]');
  if (b) { e.stopPropagation(); if (!watchApi.has(b.dataset.add)) watchApi.toggle(b.dataset.add); }
});
$('#watchlist').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { e.stopPropagation(); watchApi.toggle(rm.dataset.rm); }
});
$('#wlAdd').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  const v = e.target.value.trim().toUpperCase();
  if (!v) return;
  let sym = v;
  if (!lookup(v)) {
    try { const r = await (await fetch(`/api/search?q=${encodeURIComponent(v)}`)).json(); if (r[0]) sym = r.find(x => x.s.toUpperCase() === v)?.s || r[0].s; } catch { /* use raw */ }
  }
  if (!watchApi.has(sym)) watchApi.toggle(sym);
  e.target.value = '';
});

// Global search (any Yahoo symbol: stocks, ETFs, funds, futures, FX, crypto)
const gs = $('#gsearch'), gsRes = $('#gsResults');
let gsItems = [], gsSel = 0;
function gsRender() {
  gsRes.innerHTML = gsItems.map((x, i) => {
    const q = lookup(x.s);
    return `<div class="gs-item ${i === gsSel ? 'sel' : ''}" data-gs="${esc(x.s)}"><b>${esc(x.s)}</b><span>${esc(x.n)}</span><small>${q?.c != null ? `<span class="${cls(q.c)}">${fmtPct(q.c)}</span>` : esc(x.type || '')} ${esc(x.exch || '')}</small></div>`;
  }).join('');
  gsRes.classList.toggle('show', gsItems.length > 0);
}
const gsSearch = debounce(async q => {
  if (!q) { gsItems = []; gsRender(); return; }
  const local = (S?.stocks || []).filter(x => x.s.startsWith(q.toUpperCase())).slice(0, 3).map(x => ({ s: x.ys, n: x.n, type: 'S&P 500' }));
  try {
    const r = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json();
    const seen = new Set(local.map(x => x.s));
    if (document.activeElement !== gs || gs.value.trim() !== q) return; // user already picked / moved on
    gsItems = [...local, ...(Array.isArray(r) ? r : []).filter(x => !seen.has(x.s))].slice(0, 8);
  } catch { gsItems = local; }
  gsSel = 0; gsRender();
}, 180);
gs.addEventListener('input', e => gsSearch(e.target.value.trim()));
gs.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { gsSel = Math.min(gsItems.length - 1, gsSel + 1); gsRender(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { gsSel = Math.max(0, gsSel - 1); gsRender(); e.preventDefault(); }
  else if (e.key === 'Enter') {
    const pick = gsItems[gsSel]?.s || gs.value.trim().toUpperCase();
    if (pick) { openDetail(pick); gs.value = ''; gsItems = []; gsRender(); gs.blur(); }
  } else if (e.key === 'Escape') { gsItems = []; gsRender(); gs.blur(); }
});
gsRes.addEventListener('mousedown', e => {
  const it = e.target.closest('[data-gs]');
  if (it) { e.preventDefault(); openDetail(it.dataset.gs); gs.value = ''; gsItems = []; gsRender(); gs.blur(); }
});
gs.addEventListener('blur', () => setTimeout(() => gsRes.classList.remove('show'), 150));
document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); gs.focus(); }
});

// Any element with data-sym opens the detail drawer.
document.addEventListener('click', e => {
  if (e.target.closest('#drawer') || e.target.closest('.heatmap')) return;
  const el = e.target.closest('[data-sym]');
  if (el && !e.target.closest('a')) openDetail(el.dataset.sym);
});

const redrawAll = () => { for (const k of Object.keys(sigs)) delete sigs[k]; renderAll(); };
// Width only: phone browsers fire resize when the address bar slides in and out while scrolling.
let lastW = innerWidth;
window.addEventListener('resize', debounce(() => { if (innerWidth !== lastW) { lastW = innerWidth; redrawAll(); } }, 250));
// Phone tabs (tabs.js): a panel that just became visible needs its charts drawn at real size.
window.addEventListener('mp:layout', redrawAll);

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
let connected = false;
async function loadSparks(v) {
  if (v === sparksVersion) return;
  try {
    const r = await fetch('/api/sparks');
    const j = await r.json();
    sparks = j.sparks || {};
    sparksVersion = j.v;
    renderAll();
  } catch { /* retry next snapshot */ }
}

function onSnapshot(data) {
  S = data;
  const boot = $('#boot');
  if (boot && !boot.classList.contains('hide')) {
    boot.classList.add('hide');
    setTimeout(() => boot.remove(), 450);
  }
  renderAll();
  if (S.sparksVersion && S.sparksVersion !== sparksVersion) loadSparks(S.sparksVersion);
}

function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('snapshot', ev => { connected = true; onSnapshot(JSON.parse(ev.data)); });
  es.onopen = () => { connected = true; };
  es.onerror = () => { connected = false; };
}

initDetail(lookup, watchApi);
refreshExtra();
connect();
