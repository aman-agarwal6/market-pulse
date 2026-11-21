// Long-Term: data access. Every endpoint is fetched once per page load and
// shared by all panels (a failed fetch is forgotten so Retry refetches).
// Derived series that several panels need are computed here once.
import { fetchJSON } from '../../ui.js';
import { iso, percentileOf } from './fmt.js';

const memo = new Map();
function once(key, fn) {
  if (!memo.has(key)) memo.set(key, fn().catch(e => { memo.delete(key); throw e; }));
  return memo.get(key);
}
export const forget = key => memo.delete(key);

export const getLongterm = () => once('longterm', () => fetchJSON('/api/longterm', { timeout: 45000 }));
export const getValuation = () => once('valuation', () => fetchJSON('/api/valuation', { timeout: 30000 }));
export const getEtfs = () => once('etfs', () => fetchJSON('/api/etfs', { timeout: 45000 }));
export const getMacro = () => once('macro', () => fetchJSON('/api/macro', { timeout: 45000 }));
/** Daily history (range=max) parsed into parallel arrays with ISO dates. */
export const getHistory = sym => once('hist:' + sym, () =>
  fetchJSON(`/api/history?s=${encodeURIComponent(sym)}&range=max&interval=1d`, { timeout: 45000 }).then(parseHistory));
/** Valuation is live (recomputed on each quote refresh): allow a re-fetch every few minutes. */
export function refreshValuation() {
  const hit = memo.get('valuation');
  if (hit && Date.now() - (hit._t || 0) < 5 * 60e3) return hit;
  memo.delete('valuation');
  const p = getValuation();
  p._t = Date.now();
  return p;
}

function parseHistory(h) {
  const off = (h.gmtoffset || 0) * 1000;
  const dates = [], t = [], c = [], adj = [];
  for (let i = 0; i < h.t.length; i++) {
    const a = h.adj[i] ?? h.c[i];
    if (a == null || !isFinite(a) || a <= 0) continue;
    const ds = iso(h.t[i] * 1000 + off);
    if (dates.length && ds === dates[dates.length - 1]) { c[c.length - 1] = h.c[i]; adj[adj.length - 1] = a; continue; }
    dates.push(ds); t.push(Date.parse(ds + 'T00:00:00Z')); c.push(h.c[i]); adj.push(a);
  }
  return { s: h.s, name: h.name, type: h.type, currency: h.currency, dates, t, c, adj, meta: h.meta };
}

/** Search for tickers (command-bar endpoint). */
export const search = q => fetchJSON(`/api/search?q=${encodeURIComponent(q)}`, { timeout: 8000, ttl: 60000 });

// ---------------------------------------------------------------------------
// Derived: S&P 500 vs its 200-day average, from daily closes (memoised).
// ---------------------------------------------------------------------------
let trendCache = null;
export function trendHistory(h) {
  if (trendCache?.src === h) return trendCache.v;
  const out = [], dates = [];
  let sum = 0;
  for (let i = 0; i < h.c.length; i++) {
    sum += h.c[i];
    if (i >= 200) sum -= h.c[i - 200];
    if (i >= 199) { out.push((h.c[i] / (sum / 200) - 1) * 100); dates.push(h.dates[i]); }
  }
  trendCache = { src: h, v: { dates, values: out } };
  return trendCache.v;
}

/** Earnings yield (1 / trailing P/E, %) minus the 10-year Treasury yield, monthly. */
export function erpHistory(peHist, y10Hist) {
  if (!peHist?.dates || !y10Hist?.dates) return null;
  const yd = y10Hist.dates, yv = y10Hist.values;
  const out = [], dates = [];
  let j = 0;
  for (let i = 0; i < peHist.dates.length; i++) {
    const d = peHist.dates[i], pe = peHist.values[i];
    if (d < yd[0] || pe == null || pe <= 0) continue;
    while (j + 1 < yd.length && yd[j + 1] <= d) j++;
    if (yv[j] == null) continue;
    out.push(100 / pe - yv[j]);
    dates.push(d);
  }
  return { dates, values: out };
}

/** Find a macro series by key. */
export const macroSeries = (macro, key) => macro?.series?.find(s => s.key === key) || null;

export { percentileOf };
