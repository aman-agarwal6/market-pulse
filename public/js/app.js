// Market Pulse — client entry point. Connects to the live SSE stream and
// renders every panel.
import { $, $$, esc, seg, debounce, heatColor, fmtPct, cls, setCVD, TF_MAX } from './util.js';
import { Heatmap } from './heatmap.js';
import * as P from './panels.js';
import * as C from './charts.js';
import { initDetail, openDetail, refreshDetail } from './detail.js';

let S = null;
let sparks = {};
let sparksVersion = 0;
const ui = {
  heatTf: 'c', heatMode: 'perf', heatSize: 'mc', heatSector: null, search: '',
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
  onSector: name => { ui.heatSector = name; heat.setOpts({ sector: name }); renderSectorFilter(); },
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
    perf: { c: x.c, ...x.perf, ext: x.ext?.c ?? null, rv: x.av ? x.v / x.av : null, off: x.h52 ? (x.p / x.h52 - 1) * 100 : null },
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
  const secs = [...S.sectors].sort((a, b) => b.mc - a.mc);
  const tf = ui.heatTf;
  $('#heatSectorFilter').innerHTML = `<button data-sec="" class="${!ui.heatSector ? 'on' : ''}">All</button>` + secs.map(s => {
    const v = s[tf === 'c' ? 'c' : tf];
    return `<button data-sec="${esc(s.name)}" class="${ui.heatSector === s.name ? 'on' : ''}">${esc(s.short)}<span class="num ${cls(v)}">${fmtPct(v, 1)}</span></button>`;
  }).join('');
}
$('#heatSectorFilter').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  ui.heatSector = b.dataset.sec || null;
  heat.setOpts({ sector: ui.heatSector });
  renderSectorFilter();
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
  safe('heat', () => heat.update(heatItems(), { tf: heatTfEff(), size: ui.heatSize, sector: ui.heatSector, search: ui.search }));
  safe('heatSub', renderHeatSub);
  safe('legend', renderHeatLegend);
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
    const age = Math.round((Date.now() - S.ts) / 1000);
    const el = $('#updated');
    el.textContent = connected ? `updated ${age}s ago` : 'reconnecting…';
    el.classList.toggle('stale', !connected || age > 120);
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
seg($('#heatTf'), v => { ui.heatTf = v; heat.setOpts({ tf: heatTfEff() }); renderHeatLegend(); renderSectorFilter(); });
seg($('#heatMode'), v => {
  ui.heatMode = v;
  $('#heatTf').classList.toggle('dim', v !== 'perf');
  heat.setOpts({ tf: heatTfEff() });
  renderHeatLegend(); renderHeatSub();
});
function renderHeatSub() {
  const m = ui.heatMode;
  const hasExt = S?.stocks.some(x => x.ext);
  const touch = matchMedia('(hover: none)').matches;
  const txt = {
    perf: touch
      ? 'Size = market cap · color = performance · tap a tile to open its chart, tap a sector name to zoom'
      : 'Size = market cap · color = performance · hover for detail, click a tile to open its chart, click a sector name to zoom',
    ext: hasExt ? 'Color = pre-market / after-hours change vs the regular-session close' : 'No extended-hours trading right now — pre-market runs 4:00–9:30 ET, after-hours 16:00–20:00 ET',
    rv: "Color = today's volume vs the 10-day average · bright amber = unusual activity (where the money is concentrating)",
    off: 'Color = distance from the 52-week high · shows how much damage each stock has taken',
  }[m];
  $('#heatSub').textContent = txt;
}
seg($('#heatSize'), v => { ui.heatSize = v; heat.setOpts({ size: v }); });
$('#heatSearch').addEventListener('input', debounce(e => { ui.search = e.target.value; heat.setOpts({ search: ui.search }); }, 120));
$('#heatSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const q = e.target.value.trim().toUpperCase();
    const hit = S?.stocks.find(x => x.s === q) || S?.stocks.find(x => x.s.startsWith(q));
    if (hit) openDetail(hit.ys);
  }
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
