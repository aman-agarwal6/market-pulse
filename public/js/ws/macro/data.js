// Macro data layer: one /api/macro fetch shared by every section, cached for
// the server's own build interval, plus small helpers to slice histories and
// turn NBER recession periods into chart bands.
import { fetchJSON } from '../../ui.js';

const URL = '/api/macro';
const TTL = 10 * 60e3;          // the server rebuilds /api/macro every 10 minutes

let D = null;                   // indexed payload
let loadedAt = 0;
let pending = null;

const parseDay = s => {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d || 1));
};
export { parseDay };

/** getMacro() → the last loaded payload (indexed) or null. */
export const getMacro = () => D;
export const isFresh = () => !!D && Date.now() - loadedAt < TTL;

/** loadMacro({ force }) → Promise<indexed payload>. Deduped; cached for TTL. */
export function loadMacro({ force = false } = {}) {
  if (!force && isFresh()) return Promise.resolve(D);
  if (pending) return pending;
  pending = fetchJSON(URL, { timeout: 45000 })
    .then(j => { D = indexPayload(j); loadedAt = Date.now(); return D; })
    .finally(() => { pending = null; });
  return pending;
}

function indexPayload(j) {
  const byKey = new Map();
  for (const s of j.series || []) {
    const h = s.history || { dates: [], values: [] };
    s.points = h.dates.map((d, i) => ({ t: parseDay(d), v: h.values[i] }));
    byKey.set(s.key, s);
  }
  const now = parseDay(new Date().toISOString());
  const rec = (j.recessions?.periods || []).map(p => {
    const from = parseDay(p.start);
    // The trough month is part of the recession: shade through its last day.
    const endM = p.ongoing || !p.end ? now : parseDay(p.end);
    const to = p.ongoing || !p.end ? now : new Date(Date.UTC(endM.getUTCFullYear(), endM.getUTCMonth() + 1, 0));
    return { from, to, label: `NBER recession · ${monthYear(p.start)} – ${p.ongoing ? 'ongoing' : monthYear(p.end)}` };
  });
  const watch = new Map((j.recessionWatch?.items || []).map(i => [i.key, i]));
  return { raw: j, series: j.series || [], byKey, recessionBands: j.recessions?.meta?.ok === false ? [] : rec, watch, generatedAt: j.generatedAt };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthYear(s) { const d = parseDay(s); return d ? MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : '—'; }

/** series(key) → series object or null (also null when its meta.ok is false). */
export function series(key, { allowFailed = false } = {}) {
  const s = D?.byKey.get(key) || null;
  if (!s) return null;
  if (!allowFailed && s.meta && s.meta.ok === false) return null;
  return s;
}
/** okSeries(key) — true when the series exists and has a latest value. */
export const okSeries = key => { const s = series(key); return !!(s && s.latest && s.latest.value != null); };

export const RANGES = [['5Y', '5Y', 'Last 5 years'], ['10Y', '10Y', 'Last 10 years'], ['20Y', '20Y', 'Last 20 years'], ['Max', 'Max', 'Full history']];
const RANGE_YEARS = { '1Y': 1, '2Y': 2, '3Y': 3, '5Y': 5, '10Y': 10, '20Y': 20, '30Y': 30 };

/** cutoff(range) → Date (or null for Max) relative to today. */
export function cutoff(range) {
  const y = RANGE_YEARS[range];
  if (!y) return null;
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear() - y, n.getUTCMonth(), n.getUTCDate()));
}
/** slice(points, range) → points on/after the range start. */
export function slice(points, range) {
  const c = cutoff(range);
  if (!c) return points;
  let i = 0;
  while (i < points.length && points[i].t < c) i++;
  return points.slice(Math.max(0, i - 1));
}

/** Evenly thin a series for sparklines (keeps the last point). */
export function thin(values, n = 90) {
  if (values.length <= n) return values;
  const step = values.length / n;
  const out = [];
  for (let i = 0; i < n - 1; i++) out.push(values[Math.floor(i * step)]);
  out.push(values.at(-1));
  return out;
}

/** Rolling mean over `n` consecutive points, only where the points are evenly spaced (maxGapDays). */
export function rolling(points, n, maxGapDays) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i < n - 1) { out.push({ t: points[i].t, v: null }); continue; }
    const win = points.slice(i - n + 1, i + 1);
    const spaced = win.every((p, k) => k === 0 || (p.t - win[k - 1].t) / 86400e3 <= maxGapDays);
    const ok = spaced && win.every(p => p.v != null);
    out.push({ t: points[i].t, v: ok ? win.reduce((a, p) => a + p.v, 0) / n : null });
  }
  return out;
}

/** Runs where value < 0, as bands { from, to }. Points must be sorted. */
export function negativeRuns(points, label) {
  const out = [];
  let start = null, last = null;
  for (const p of points) {
    if (p.v == null) continue;
    if (p.v < 0) { if (!start) start = p.t; last = p.t; }
    else if (start) { out.push({ from: start, to: p.t, label }); start = null; }
  }
  if (start) out.push({ from: start, to: last, label: label + ' (ongoing)' });
  return out;
}
