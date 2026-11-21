// Slide-in detail drawer: TradingView lightweight-chart with 50/200 moving
// averages, full quote stats, watchlist star and related headlines.
import { $, fmtPrice, fmtPct, fmtChg, fmtBig, cls, upColor, downColor } from './util.js';
import { newsHTML } from './panels.js';

let chart, mainSeries, volSeries, ma50Series, ma200Series;
let current = null;
let full = null; // full quote from /api/quote
let range = '6M';
let lookupFn = () => null;
let watch = { has: () => false, toggle: () => {} };
let reqId = 0;

export function initDetail(lookup, watchApi) {
  lookupFn = lookup;
  if (watchApi) watch = watchApi;
  $('#dClose').addEventListener('click', closeDetail);
  $('#scrim').addEventListener('click', closeDetail);
  $('#dStar').addEventListener('click', () => { if (current) { watch.toggle(current); renderStar(); } });
  // "Full page" (markup in index.html): the Research workspace's company page for this symbol.
  $('#dFull').addEventListener('click', () => {
    if (!current) return;
    const s = current;
    closeDetail();
    location.hash = '#/research/company?s=' + encodeURIComponent(s);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });
  $('#dRange').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    range = b.dataset.v;
    $('#dRange').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    loadChart();
  });
}

function ensureChart() {
  if (chart) return;
  const LW = window.LightweightCharts;
  chart = LW.createChart($('#dChart'), {
    autoSize: true,
    layout: { background: { type: 'solid', color: '#080b10' }, textColor: '#8b97a4', fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 11, panes: { separatorColor: '#19202b' } },
    grid: { vertLines: { color: '#11161e' }, horzLines: { color: '#11161e' } },
    rightPriceScale: { borderColor: '#19202b' },
    timeScale: { borderColor: '#19202b', timeVisible: true, secondsVisible: false },
    crosshair: { mode: 0, vertLine: { color: '#46505c', labelBackgroundColor: '#232c3a' }, horzLine: { color: '#46505c', labelBackgroundColor: '#232c3a' } },
  });
}

function resetSeries(kind) {
  const LW = window.LightweightCharts;
  for (const s of [mainSeries, volSeries, ma50Series, ma200Series]) if (s) chart.removeSeries(s);
  mainSeries = volSeries = ma50Series = ma200Series = null;
  if (kind === 'area') {
    mainSeries = chart.addSeries(LW.AreaSeries, { lineColor: '#ffb000', lineWidth: 2, topColor: 'rgba(255,176,0,.25)', bottomColor: 'rgba(255,176,0,0)' });
  } else {
    mainSeries = chart.addSeries(LW.CandlestickSeries, { upColor: upColor(), downColor: downColor(), borderVisible: false, wickUpColor: upColor(), wickDownColor: downColor() });
    ma50Series = chart.addSeries(LW.LineSeries, { color: '#3cc8d6', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    ma200Series = chart.addSeries(LW.LineSeries, { color: '#c08cff', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  }
  // Volume in its own pane (its own axis, its own plot area).
  volSeries = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1);
  try { chart.panes()[1]?.setHeight(70); } catch { /* older API */ }
}

function sma(bars, n) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= n) sum -= bars[i - n].close;
    if (i >= n - 1) out.push({ time: bars[i].time, value: sum / n });
  }
  return out;
}

export async function openDetail(sym) {
  if (!sym) return;
  current = sym;
  full = null;
  $('#drawer').classList.add('open');
  $('#scrim').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  renderHeader();
  renderStar();
  loadChart();
  loadNews();
  try {
    const r = await fetch(`/api/quote?s=${encodeURIComponent(sym)}`);
    if (r.ok && current === sym) { full = await r.json(); renderHeader(); }
  } catch { /* stats from snapshot only */ }
}

export function closeDetail() {
  $('#drawer').classList.remove('open');
  $('#scrim').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  current = null;
}

export function refreshDetail() { if (current) renderHeader(); }

function renderStar() {
  const on = current && watch.has(current);
  const b = $('#dStar');
  b.classList.toggle('on', !!on);
  b.textContent = on ? '★' : '☆';
  b.title = on ? 'Remove from watchlist' : 'Add to watchlist';
}

function display(sym) { return sym.replace(/\d{3,}-USD$/, '').replace(/-USD$/, '').replace(/^\^/, ''); }

function renderHeader() {
  const live = lookupFn(current);
  const q = { ...(full || {}), ...(live || {}) }; // live snapshot wins for price
  if (full) for (const k of ['pe', 'fpe', 'eps', 'dy', 'rating', 'earn', 'earnNext', 'earnEst', 'exch', 'type']) q[k] = full[k];
  $('#dSym').textContent = live?.label || display(current);
  $('#dName').textContent = [full?.n || q.n, q.sec, q.ind || q.exch].filter(Boolean).join(' · ');
  const isYield = ['^TNX', '^TYX', '^FVX', '^IRX'].includes(current);
  $('#dPrice').innerHTML = q.p != null ? `<span class="p">${isYield ? q.p.toFixed(3) + '%' : fmtPrice(q.p)}</span>
    <span class="c ${cls(q.c)}">${fmtChg(q.ch)} (${fmtPct(q.c)})</span>
    ${q.ext ? `<span class="c ${cls(q.ext.c)}" style="font-size:12px">${q.ext.k === 'pre' ? 'Pre-mkt' : 'After hrs'} ${fmtPct(q.ext.c)}</span>` : ''}
    <span class="t">${q.st === 'REGULAR' ? '● live' : q.st ? 'market closed' : ''}</span>` : '<span class="t">Loading…</span>';
  const stat = (k, v, klass = '') => `<div><div class="k">${k}</div><div class="v ${klass}">${v}</div></div>`;
  const pf = q.perf || {};
  const pctFrom = (a, b) => (a && b ? (a / b - 1) * 100 : null);
  const date = t => (t ? new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  let html = '';
  if (q.h52 && q.l52 && q.p) {
    const pos = Math.max(0, Math.min(100, (q.p - q.l52) / (q.h52 - q.l52) * 100));
    html += `<div class="range52"><div class="k">52-week range · ${fmtPct(pctFrom(q.p, q.h52), 1)} from high</div><div class="bar"><i style="left:${pos}%"></i></div><div class="ends"><span>${fmtPrice(q.l52)}</span><span>${fmtPrice(q.h52)}</span></div></div>`;
  }
  html += stat('Day range', q.lo != null ? `${fmtPrice(q.lo)} – ${fmtPrice(q.hi)}` : '—');
  html += stat('Prev close', fmtPrice(q.prev));
  html += stat('Market cap', fmtBig(q.mc, '$'));
  html += stat('Volume', fmtBig(q.v));
  html += stat('Vol vs 10d avg', q.av ? (q.v / q.av).toFixed(2) + 'x' : '—', q.av && q.v / q.av > 1.5 ? 'up' : '');
  html += stat('vs 50-day avg', fmtPct(pctFrom(q.p, q.ma50), 1), cls(pctFrom(q.p, q.ma50)));
  html += stat('vs 200-day avg', fmtPct(pctFrom(q.p, q.ma200), 1), cls(pctFrom(q.p, q.ma200)));
  html += stat('1 week', fmtPct(pf.w, 1), cls(pf.w));
  html += stat('1 month', fmtPct(pf.m, 1), cls(pf.m));
  html += stat('3 months', fmtPct(pf.q, 1), cls(pf.q));
  html += stat('YTD', fmtPct(pf.ytd, 1), cls(pf.ytd));
  html += stat('1 year', fmtPct(pf.y, 1), cls(pf.y));
  if (q.type === 'EQUITY') {
    html += stat('P/E (ttm)', q.pe != null ? q.pe.toFixed(1) : '—');
    html += stat('Forward P/E', q.fpe != null ? q.fpe.toFixed(1) : '—');
    html += stat('Dividend yield', q.dy != null ? q.dy.toFixed(2) + '%' : '—');
    html += stat('Analyst rating', q.rating ? q.rating.replace(/^[\d.]+ - /, '') + ` (${q.rating.split(' ')[0]})` : '—');
    const now = Date.now() / 1000;
    const next = [q.earn, q.earnNext].filter(t => t && t > now - 86400).sort((a, b) => a - b)[0];
    const last = q.earn && q.earn <= now ? q.earn : null;
    html += stat('Next earnings', next ? date(next) + (q.earnEst && next === q.earnNext ? '*' : '') : '—');
    html += stat('Last earnings', last ? date(last) : '—');
  }
  $('#dStats').innerHTML = html;
}

async function loadChart() {
  ensureChart();
  const id = ++reqId;
  const sym = current;
  const el = $('#dChart');
  let ld = el.querySelector('.loading');
  if (!ld) { ld = document.createElement('div'); ld.className = 'loading'; el.appendChild(ld); }
  ld.textContent = 'Loading chart…';
  ld.style.display = 'flex';
  try {
    const res = await fetch(`/api/chart?s=${encodeURIComponent(sym)}&r=${range}`);
    const data = await res.json();
    if (id !== reqId) return;
    const intraday = ['1D', '5D', '1M'].includes(range);
    const off = intraday ? (data.meta?.gmtoffset || 0) : 0;
    const seen = new Set();
    const bars = (data.bars || []).map(b => ({ ...b, time: b.time + off })).filter(b => (seen.has(b.time) ? false : (seen.add(b.time), true)));
    if (!bars.length) { ld.textContent = 'No chart data'; return; }
    const area = range === '1D' || range === '5D';
    resetSeries(area ? 'area' : 'candle');
    if (area) mainSeries.setData(bars.map(b => ({ time: b.time, value: b.close })));
    else {
      mainSeries.setData(bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
      if (!intraday) { ma50Series.setData(sma(bars, 50)); ma200Series.setData(sma(bars, 200)); }
    }
    const up = upColor(), dn = downColor();
    volSeries.setData(bars.map(b => ({ time: b.time, value: b.volume, color: (b.close >= b.open ? up : dn) + '88' })));
    if (range === '1D' && data.meta?.chartPreviousClose) {
      mainSeries.createPriceLine({ price: data.meta.chartPreviousClose, color: '#66727f', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'prev close' });
    }
    if (data.visibleFrom) {
      const from = bars.find(b => b.time >= data.visibleFrom)?.time ?? bars[0].time;
      chart.timeScale().setVisibleRange({ from, to: bars.at(-1).time });
    } else chart.timeScale().fitContent();
    let lg = el.parentElement.querySelector('.d-legend');
    if (!lg) { lg = document.createElement('div'); lg.className = 'd-legend'; el.after(lg); }
    const unit = range === '5Y' ? 'week' : 'day';
    lg.innerHTML = !area && !intraday ? `<span><i style="background:#3cc8d6"></i>50-${unit} avg</span><span><i style="background:#c08cff"></i>200-${unit} avg</span><span>volume in lower pane</span>` : '<span>volume in lower pane</span>';
    ld.style.display = 'none';
  } catch (e) {
    if (id === reqId) ld.textContent = 'Chart unavailable: ' + e.message;
  }
}

async function loadNews() {
  const q = lookupFn(current) || {};
  const term = /-USD$/.test(current) ? (q.n || display(current)).replace(/ USD$/, '') : current.startsWith('^') || current.includes('=') ? (q.n || current) : current;
  $('#dNews').innerHTML = '<div class="empty">Loading…</div>';
  try {
    const res = await fetch(`/api/news?q=${encodeURIComponent(term)}`);
    const items = await res.json();
    $('#dNews').innerHTML = newsHTML(Array.isArray(items) ? items : [], t => lookupFn(t));
  } catch {
    $('#dNews').innerHTML = '<div class="empty">News unavailable.</div>';
  }
}
