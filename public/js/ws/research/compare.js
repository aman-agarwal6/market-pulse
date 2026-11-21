// Research › Compare (COMP): up to 6 tickers on one growth-of-100 chart from
// a common start, drawdowns beneath, a statistics table and calendar-year
// returns. All maths use Yahoo's dividend-adjusted closes (/api/history adj),
// so returns include reinvested dividends.
import { esc, seg, heatColor } from '../../util.js';
import { panelHTML, segHTML, tsChart, dataTable, setSourceBadge, SERIES_COLORS, emptyStateHTML } from '../../ui.js';
import { api, fmt, dayOf, tickerSearch, loadPref, savePref, replaceHash } from './shared.js';

const MAX = 6;
const RANGES = [['1y', '1Y', 1], ['3y', '3Y', 3], ['5y', '5Y', 5], ['10y', '10Y', 10], ['max', 'Max', Infinity]];
const DEFAULT = { syms: ['SPY', 'QQQ'], range: '5y', log: false };
let st = { ...DEFAULT, ...loadPref('compare', {}) };
let root = null, el = {}, visible = false;
let main = null, dd = null, statsTable = null;
const data = new Map();        // sym → { name, type, dates[], v[] } | { error }
let F = null;

const DAY = 86400e3;
const ms = d => Date.parse(d + 'T00:00:00Z');

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
async function fetchSym(s) {
  if (data.has(s) && !data.get(s).error) return data.get(s);
  try {
    const h = await api.history(s, 'max', '1d');
    const dates = [], v = [];
    h.t.forEach((t, i) => { const x = h.adj[i] ?? null; if (x != null && x > 0) { const d = dayOf(t, h.gmtoffset); if (dates.at(-1) === d) v[v.length - 1] = x; else { dates.push(d); v.push(x); } } });
    const rec = { name: h.name || s, type: h.type, dates, v, asOf: Date.parse(h.meta?.asOf) || null };
    if (!dates.length) throw new Error('No price history');
    data.set(s, rec);
    return rec;
  } catch (e) {
    const rec = { error: e.status === 404 ? 'Symbol not found' : e.message };
    data.set(s, rec);
    return rec;
  }
}

// ---------------------------------------------------------------------------
// Maths
// ---------------------------------------------------------------------------
function window_(recs, years) {
  const firsts = recs.map(r => r.dates[0]).sort();
  const lasts = recs.map(r => r.dates.at(-1)).sort();
  const end = lasts[0];
  let start = firsts.at(-1);
  if (isFinite(years)) {
    const d = new Date(ms(end));
    d.setUTCFullYear(d.getUTCFullYear() - years);
    const ws = d.toISOString().slice(0, 10);
    if (ws > start) start = ws;
  }
  return { start, end, limitedBy: firsts.at(-1) >= start ? recs.find(r => r.dates[0] === firsts.at(-1)) : null };
}
function slice(rec, start, end) {
  // From the last close on or before `start` (so the window starts from a real price) to `end`.
  let i0 = rec.dates.findIndex(d => d >= start);
  if (i0 > 0 && rec.dates[i0] > start) i0 -= 1;
  if (i0 < 0) i0 = 0;
  let i1 = rec.dates.length - 1;
  while (i1 > i0 && rec.dates[i1] > end) i1--;
  return { dates: rec.dates.slice(i0, i1 + 1), v: rec.v.slice(i0, i1 + 1) };
}
function stats(x) {
  const n = x.v.length;
  const first = x.v[0], last = x.v[n - 1];
  const years = (ms(x.dates[n - 1]) - ms(x.dates[0])) / (365.25 * DAY);
  const total = (last / first - 1) * 100;
  const cagr = years >= 0.9 ? ((last / first) ** (1 / years) - 1) * 100 : null;
  let sum = 0, sq = 0, m = 0;
  for (let i = 1; i < n; i++) { const r = x.v[i] / x.v[i - 1] - 1; sum += r; sq += r * r; m++; }
  const mean = sum / m;
  const sd = Math.sqrt(Math.max(0, sq / m - mean * mean) * (m / (m - 1)));
  const ppy = years > 0 ? m / years : 252;
  const vol = m > 10 ? sd * Math.sqrt(ppy) * 100 : null;
  let peak = first, peakD = x.dates[0], worst = 0, wPeak = null, wTrough = null;
  const ddS = [];
  for (let i = 0; i < n; i++) {
    if (x.v[i] > peak) { peak = x.v[i]; peakD = x.dates[i]; }
    const d = (x.v[i] / peak - 1) * 100;
    ddS.push(d);
    if (d < worst) { worst = d; wPeak = peakD; wTrough = x.dates[i]; }
  }
  // Calendar years: each year's last close vs the previous year's last close.
  const years_ = new Map();
  for (let i = 0; i < n; i++) years_.set(x.dates[i].slice(0, 4), i);
  const cal = [];
  let prevI = null;
  for (const [y, i] of years_) {
    const startI = prevI ?? 0;
    const partialStart = prevI == null && x.dates[0].slice(5) > '01-07';
    const ytd = i === n - 1 && x.dates[i].slice(5) < '12-24';
    if (i > startI) cal.push({ y, r: (x.v[i] / x.v[startI] - 1) * 100, partial: partialStart || ytd, ytd, from: x.dates[startI] });
    prevI = i;
  }
  const full = cal.filter(c => !c.partial);
  const best = full.length ? full.reduce((a, b) => (b.r > a.r ? b : a)) : null;
  const worstY = full.length ? full.reduce((a, b) => (b.r < a.r ? b : a)) : null;
  return { total, cagr, vol, worst, wPeak, wTrough, cal, best, worstY, dd: ddS, years };
}
// Weekly (Mon–Sun buckets, last close in each) so markets that close at
// different hours or trade on weekends (crypto) still line up.
function weekly(x) {
  const m = new Map();
  for (let i = 0; i < x.dates.length; i++) m.set(Math.floor((ms(x.dates[i]) / DAY + 3) / 7), x.v[i]);
  return m;
}
function correlation(a, b) {
  const wa = weekly(a), wb = weekly(b);
  const keys = [...wa.keys()].filter(k => wb.has(k)).sort((p, q) => p - q);
  const ra = [], rb = [];
  for (let i = 1; i < keys.length; i++) { ra.push(wa.get(keys[i]) / wa.get(keys[i - 1]) - 1); rb.push(wb.get(keys[i]) / wb.get(keys[i - 1]) - 1); }
  if (ra.length < 20) return null;
  const ma = ra.reduce((s, v) => s + v, 0) / ra.length, mb = rb.reduce((s, v) => s + v, 0) / rb.length;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < ra.length; i++) { c += (ra[i] - ma) * (rb[i] - mb); va += (ra[i] - ma) ** 2; vb += (rb[i] - mb) ** 2; }
  return va && vb ? c / Math.sqrt(va * vb) : null;
}
function downsample(dates, v, mode, target = 1200) {
  const n = dates.length;
  if (n <= target * 1.4) return dates.map((t, i) => ({ t, v: v[i] }));
  const k = Math.ceil(n / target), out = [];
  for (let i = 0; i < n; i += k) {
    const j1 = Math.min(n, i + k);
    let bi = j1 - 1;
    if (mode === 'min') for (let j = i; j < j1; j++) if (v[j] < v[bi]) bi = j;
    out.push({ t: dates[bi], v: v[bi] });
  }
  if (out.at(-1).t !== dates[n - 1]) out.push({ t: dates[n - 1], v: v[n - 1] });
  return out;
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------
const MARKUP = `
<section class="grid">
  ${panelHTML({ id: 'pCmpChart', span: 12, cls: 'rs-cmp', title: 'Compare', sub: '<span id="rsCmpSub">Growth of 100 · dividends reinvested</span>',
    controls: `<button type="button" class="rs-tgl" id="rsCmpLog" aria-pressed="false" title="Logarithmic scale: equal percentage moves look the same size">Log scale</button>
      ${segHTML({ id: 'rsCmpRange', small: true, value: st.range, label: 'Comparison range', options: RANGES.map(([v, l]) => [v, l]) })}`,
    note: 'Several stocks or funds on one chart, all starting from 100 on the same day, so different prices compare fairly.',
    info: `Every line starts at 100 on the common start date: the first day all the tickers have prices for (or the start of the range you pick, if later). A line at 180 means 100 invested at the start, with dividends reinvested, would now be worth 180.\n\nThe log scale makes equal percentage moves look the same size, which helps over long periods: a fall from 200 to 100 and a fall from 100 to 50 are both −50%.\n\nAdd up to six tickers with the box on the left. The first ticker is the reference for the correlation column below.`,
    body: `<div class="rs-cmp-bar"><div class="rs-cmp-chips" id="rsCmpChips"></div><input class="search rs-cmp-add" id="rsCmpAdd" placeholder="Add ticker" aria-label="Add a ticker to compare"></div>
      <div id="rsCmpChart" class="rs-chart-box"></div>`,
    footer: '<span class="rs-chfoot" id="rsCmpFoot"></span>', source: { source: 'Yahoo Finance', label: 'dividend-adjusted daily closes' } })}
  ${panelHTML({ id: 'pCmpDD', span: 12, title: 'Drawdown', sub: 'Decline from the previous peak, %',
    note: 'How far each one fell from its previous high at every point, and how long it took to get back.',
    info: 'A drawdown is the fall from the highest value reached so far. 0% means at a new high; −30% means 30% below the previous peak. Deep and long drawdowns are what make an investment hard to hold. Measured on dividend-adjusted prices within the selected range.',
    body: '<div id="rsCmpDD" class="rs-chart-box"></div>', source: { source: 'Yahoo Finance', label: 'computed' } })}
</section>
<section class="grid">
  ${panelHTML({ id: 'pCmpTable', span: 12, title: 'Side by Side', sub: '<span id="rsCmpTSub">Statistics over the selected range · dividends reinvested</span>', bodyId: 'rsCmpTable', minH: 120,
    note: 'Return and risk for each ticker over exactly the same dates.',
    info: `Total return is the gain from the start to the latest close, with dividends reinvested. Annualized return is the steady yearly rate that would give the same total. Volatility is how much returns swing (standard deviation of daily returns, annualized); higher means a bumpier ride.\n\nWorst drawdown is the largest fall from a peak. Best and worst year use complete calendar years only. Correlation with the first ticker uses weekly returns: 1 means they moved together, 0 no relation, negative means they tended to move in opposite directions.`,
    source: { source: 'Yahoo Finance', label: 'computed' } })}
  ${panelHTML({ id: 'pCmpYears', span: 12, title: 'Calendar-Year Returns', sub: 'Total return per calendar year, %', bodyId: 'rsCmpYears', minH: 100,
    note: 'Each year’s return, so you can see the good and bad years behind the averages.',
    info: 'Each cell is the return from the last close of the previous year to the last close of that year, dividends reinvested. Cells marked * cover part of a year only: the first year of the range, or the current year to date. Colors run from red (negative) to green (positive).',
    source: { source: 'Yahoo Finance', label: 'computed' } })}
</section>`;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function chipsHTML() {
  return st.syms.map((s, i) => {
    const d = data.get(s);
    return `<span class="rs-cchip${d?.error ? ' err' : ''}"><i style="background:${SERIES_COLORS[i % 6]}"></i><b class="mono">${esc(s)}</b>${d?.error ? `<small>${esc(d.error)}</small>` : d?.name ? `<small title="${esc(d.name)}">${esc(d.name)}</small>` : '<small>loading…</small>'}<button type="button" data-rm="${esc(s)}" aria-label="Remove ${esc(s)}">×</button></span>`;
  }).join('') + (st.syms.length < MAX ? '' : '<span class="rs-dim">Six tickers at most</span>');
}

let renderId = 0;
async function render() {
  const id = ++renderId;
  el.chips.innerHTML = chipsHTML();
  el.add.parentElement.hidden = st.syms.length >= MAX;
  el.log.setAttribute('aria-pressed', String(st.log));
  persist();
  if (!st.syms.length) {
    main?.destroy(); dd?.destroy(); main = dd = null;
    el.chart.innerHTML = emptyStateHTML({ icon: 'chart', title: 'Nothing to compare', message: 'Add a ticker above, for example VOO, QQQ or BND.' });
    el.dd.innerHTML = ''; el.table.innerHTML = ''; el.years.innerHTML = ''; el.foot.innerHTML = '';
    return;
  }
  el.chart.classList.add('is-loading');
  const recs = await Promise.all(st.syms.map(fetchSym));
  if (id !== renderId) return;
  el.chart.classList.remove('is-loading');
  el.chips.innerHTML = chipsHTML();
  const ok = st.syms.map((s, i) => ({ s, i, r: recs[i] })).filter(x => !x.r.error);
  if (!ok.length) { el.chart.innerHTML = emptyStateHTML({ icon: 'alert', title: 'No data', message: 'None of these symbols returned price history.' }); main = null; return; }
  const years = RANGES.find(r => r[0] === st.range)[2];
  const w = window_(ok.map(x => x.r), years);
  const sl = ok.map(x => ({ ...x, x: slice(x.r, w.start, w.end) }));
  for (const y of sl) y.st = stats(y.x);
  const ref = sl[0];
  for (const y of sl) y.corr = y === ref ? 1 : correlation(ref.x, y.x);

  // Charts
  const series = sl.map(y => {
    const base = y.x.v[0];
    return { id: y.s, label: y.s, color: SERIES_COLORS[y.i % 6], width: y.i === 0 ? 1.9 : 1.5, data: downsample(y.x.dates, y.x.v.map(v => (v / base) * 100), 'last') };
  });
  const ddSeries = sl.map(y => ({ id: y.s, label: y.s, color: SERIES_COLORS[y.i % 6], width: 1.3, data: downsample(y.x.dates, y.st.dd, 'min') }));
  // One shared time range for both charts so their x axes line up exactly.
  const tAll = [...series, ...ddSeries].flatMap(s => s.data.map(p => +new Date(p.t ?? p[0])));
  const xDomain = [new Date(Math.min(...tAll)), new Date(Math.max(...tAll))];
  const vals = series.flatMap(s => s.data.map(p => p.v));
  const lo = Math.min(...vals), hi = Math.max(...vals), step = d3.tickStep(lo, hi, 5);
  const yDomain = st.log ? undefined : [Math.max(0, Math.floor((lo - (hi - lo) * 0.04) / step) * step), Math.ceil((hi + (hi - lo) * 0.04) / step) * step];
  const mainOpts = { series, xDomain, height: 340, log: st.log, yDomain, yFmt: v => fmt.num(v, v < 10 ? 1 : 0), refs: [{ v: 100, label: '100 = start' }], legend: true, ariaLabel: 'Growth of 100 comparison' };
  const ddMin = Math.min(-1, ...sl.map(y => y.st.worst));
  const ddOpts = { series: ddSeries, xDomain, height: 170, yFmt: v => fmt.num(v, 0) + '%', yDomain: [ddMin * 1.06, 0], legend: false, ariaLabel: 'Drawdown comparison' };
  if (main && el.chart.classList.contains('tsc')) main.update(mainOpts); else main = tsChart(el.chart, mainOpts);
  if (dd && el.dd.classList.contains('tsc')) dd.update(ddOpts); else dd = tsChart(el.dd, ddOpts);

  const limited = isFinite(years) && w.limitedBy ? ` · ${esc(ok.find(x => x.r === w.limitedBy)?.s || '')} history starts ${fmt.date(w.start)}` : '';
  el.sub.innerHTML = `Growth of 100 · dividends reinvested · common start <b>${fmt.date(sl[0].x.dates[0])}</b> to ${fmt.date(w.end)}${limited}`;
  el.tsub.innerHTML = `${fmt.date(sl[0].x.dates[0])} to ${fmt.date(w.end)} (${fmt.num(sl[0].st.years, 1)} years) · dividends reinvested`;
  const hasIndex = ok.some(x => x.r.type === 'INDEX' && !/TR$/.test(x.s));
  el.foot.innerHTML = `Common start date: the first day every ticker has a price${isFinite(years) ? ', or the start of the range if later' : ''}. Returns use dividend-adjusted closes, so they include reinvested dividends${hasIndex ? '; price indexes such as ^GSPC have no dividends in their data (use ^SP500TR for the S&amp;P 500 with dividends)' : ''}.`;

  // Stats table
  const tone = v => (v > 0 ? 'up' : v < 0 ? 'down' : '');
  const rows = sl.map(y => ({ s: y.s, i: y.i, name: y.r.name, ...y.st, corr: y.corr }));
  statsTable = dataTable(el.table, { rows, label: 'Comparison statistics', csv: 'compare', columns: [
    { key: 's', label: 'Ticker', value: r => r.s, fmt: (v, r) => `<span class="rs-cdot" style="background:${SERIES_COLORS[r.i % 6]}"></span><b class="rs-sym">${esc(v)}</b>` },
    { key: 'name', label: 'Name', value: r => r.name, fmt: v => `<span class="rs-nmc" title="${esc(v)}">${esc(v)}</span>` },
    { key: 'total', label: 'Total return', type: 'num', value: r => r.total, fmt: v => fmt.spct(v), tone },
    { key: 'cagr', label: 'Annualized', type: 'num', value: r => r.cagr, fmt: v => fmt.spct(v), tone, title: 'Average yearly return that compounds to the total (shown for 1 year or longer)' },
    { key: 'vol', label: 'Volatility', type: 'num', value: r => r.vol, fmt: v => fmt.pct(v), title: 'Standard deviation of daily returns, annualized' },
    { key: 'worst', label: 'Worst drawdown', type: 'num', value: r => r.worst, fmt: (v, r) => `<span title="${r.wPeak ? `Peak ${fmt.date(r.wPeak)}, low ${fmt.date(r.wTrough)}` : ''}">${fmt.pct(v)}</span>`, title: 'Largest fall from a previous peak within the range' },
    { key: 'best', label: 'Best year', type: 'num', value: r => r.best?.r ?? null, fmt: (v, r) => (r.best ? `${fmt.spct(v)} <small class="rs-dim">${r.best.y}</small>` : '<span class="rs-dim" title="No complete calendar year in the range">—</span>'), title: 'Best complete calendar year in the range' },
    { key: 'worstY', label: 'Worst year', type: 'num', value: r => r.worstY?.r ?? null, fmt: (v, r) => (r.worstY ? `${fmt.spct(v)} <small class="rs-dim">${r.worstY.y}</small>` : '<span class="rs-dim" title="No complete calendar year in the range">—</span>'), title: 'Worst complete calendar year in the range' },
    { key: 'corr', label: `Corr. with ${sl[0].s}`, type: 'num', value: r => r.corr, fmt: (v, r) => (r.i === sl[0].i ? '<span class="rs-dim">ref.</span>' : v == null ? '—' : fmt.num(v, 2)), title: 'Correlation of weekly returns with the first ticker' },
  ] });

  // Calendar-year grid
  const yearsAll = [...new Set(sl.flatMap(y => y.st.cal.map(c => c.y)))].sort();
  el.years.innerHTML = `<div class="rs-yg-wrap"><table class="rs-yg"><thead><tr><th scope="col">Ticker</th>${yearsAll.map(y => `<th scope="col" class="n">${y}</th>`).join('')}</tr></thead><tbody>${sl.map(y => {
    const by = new Map(y.st.cal.map(c => [c.y, c]));
    return `<tr><th scope="row"><span class="rs-cdot" style="background:${SERIES_COLORS[y.i % 6]}"></span>${esc(y.s)}</th>${yearsAll.map(yr => {
      const c = by.get(yr);
      if (!c) return '<td class="n rs-dim">·</td>';
      return `<td class="n" style="background:color-mix(in srgb, ${heatColor(c.r, 35)} 62%, transparent)" title="${esc(y.s)} ${yr}: ${fmt.spct(c.r)}${c.partial ? (c.ytd ? ' (year to date)' : ' (from ' + fmt.date(c.from) + ')') : ''}">${fmt.spct(c.r)}${c.partial ? '<sup>*</sup>' : ''}</td>`;
    }).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;

  const asOf = Math.max(...ok.map(x => x.r.asOf || 0)) || null;
  for (const p of ['#pCmpChart', '#pCmpDD', '#pCmpTable', '#pCmpYears']) setSourceBadge(root.querySelector(p), { asOf });
}

function persist() {
  savePref('compare', st);
  if (!visible) return;
  const p = new URLSearchParams({ s: st.syms.join(',') });
  if (st.range !== DEFAULT.range) p.set('r', st.range);
  if (st.log) p.set('log', '1');
  replaceHash('#/research/compare?' + p.toString().replace(/%2C/g, ',').replace(/%5E/g, '%5E'));
}

function add(s) {
  s = String(s || '').trim().toUpperCase();
  if (!s || st.syms.includes(s) || st.syms.length >= MAX) return;
  if (data.get(s)?.error) data.delete(s);
  st.syms = [...st.syms, s];
  render();
}

export function mount(el_) {
  root = el_;
  root.innerHTML = MARKUP;
  el = {
    chips: root.querySelector('#rsCmpChips'), add: root.querySelector('#rsCmpAdd'), chart: root.querySelector('#rsCmpChart'), dd: root.querySelector('#rsCmpDD'),
    table: root.querySelector('#rsCmpTable'), years: root.querySelector('#rsCmpYears'), sub: root.querySelector('#rsCmpSub'), tsub: root.querySelector('#rsCmpTSub'),
    foot: root.querySelector('#rsCmpFoot'), log: root.querySelector('#rsCmpLog'),
  };
  tickerSearch(el.add, { local: () => F?.rows || [], onPick: s => add(s) });
  el.add = root.querySelector('#rsCmpAdd');
  el.chips.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    st.syms = st.syms.filter(x => x !== b.dataset.rm);
    render();
  });
  seg(root.querySelector('#rsCmpRange'), v => { st.range = v; render(); });
  el.log.addEventListener('click', () => { st.log = !st.log; render(); });
  api.fundamentals().then(x => { F = x; }).catch(() => {});
}

export function route(params) {
  visible = true;
  const s = params.get('s');
  let changed = false;
  if (s != null) {
    const syms = [...new Set(s.split(/[\s,]+/).map(x => x.trim().toUpperCase()).filter(x => /^[\w^.=-]{1,20}$/.test(x)))].slice(0, MAX);
    if (syms.join() !== st.syms.join()) { st.syms = syms; changed = true; }
  }
  if (s != null) {
    // A link carries the whole view: no r = the default range, no log = linear.
    const r = RANGES.some(x => x[0] === params.get('r')) ? params.get('r') : DEFAULT.range;
    const lg = params.get('log') === '1';
    if (r !== st.range || lg !== st.log) { st.range = r; st.log = lg; changed = true; }
  }
  for (const b of root.querySelectorAll('#rsCmpRange button')) { const on = b.dataset.v === st.range; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  if (changed || !main) render(); else persist();
}
export function hide() { visible = false; }
