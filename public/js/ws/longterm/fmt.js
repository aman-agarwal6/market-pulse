// Long-Term: number and date formatting shared by every Long-Term module.
// Dates in the payloads are 'YYYY-MM-DD' calendar days; they are read and
// printed in UTC so a date never shifts by a day in US time zones.
import { esc } from '../../util.js';

export { esc };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → Date at 00:00 UTC */
export const day = s => new Date(s + 'T00:00:00Z');
/** Date | ms → 'YYYY-MM-DD' (UTC) */
export const iso = d => new Date(d).toISOString().slice(0, 10);

/** "Oct 9, 2007" */
export function fmtDate(s) {
  if (!s) return '—';
  const d = typeof s === 'string' ? day(s.slice(0, 10)) : new Date(s);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
/** "Oct 2007" */
export function fmtMonth(s) {
  if (!s) return '—';
  const d = typeof s === 'string' ? day(s.slice(0, 10)) : new Date(s);
  return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export const year = s => +String(s).slice(0, 4);

/** Signed percent: +3.2% / −11.6% (true minus sign). */
export function pct(v, d = 1, sign = true) {
  if (v == null || !isFinite(v)) return '—';
  const r = Math.abs(v) < 0.5 * 10 ** -d ? 0 : v;
  const s = Math.abs(r).toFixed(d);
  return (r < 0 ? '−' : sign && r > 0 ? '+' : '') + s + '%';
}
/** Unsigned percent for shares/levels: 74.6% */
export const share = (v, d = 1) => pct(v, d, false);
/** Plain number with fixed decimals and a real minus sign. */
export function num(v, d = 1) {
  if (v == null || !isFinite(v)) return '—';
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return (v < 0 && +Math.abs(v).toFixed(d) !== 0 ? '−' : '') + s;
}
/** Signed number: +1.05 / −0.42 */
export function sgn(v, d = 2) {
  if (v == null || !isFinite(v)) return '—';
  return (v > 0 && +v.toFixed(d) !== 0 ? '+' : '') + num(v, d);
}
/** Percentage points, signed: +1.05 pts */
export const pts = (v, d = 2) => (v == null || !isFinite(v) ? '—' : sgn(v, d) + ' pts');

/** $12,345 · $1.23M for large values when compact */
export function usd(v, { compact = false, d = 0 } = {}) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v), neg = v < 0 ? '−' : '';
  if (compact && a >= 1e12) return neg + '$' + (a / 1e12).toFixed(2) + 'T';
  if (compact && a >= 1e9) return neg + '$' + (a / 1e9).toFixed(1) + 'B';
  if (compact && a >= 1e6) return neg + '$' + (a / 1e6).toFixed(2) + 'M';
  if (compact && a >= 1e4) return neg + '$' + (a / 1e3).toFixed(0) + 'K';
  return neg + '$' + a.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Ordinal for percentiles: 96th, 1st, 22nd */
export function ordinal(n) {
  const v = Math.round(n);
  const s = v % 100 >= 11 && v % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] || 'th';
  return v + s;
}

/** Calendar-day span → "29 d" / "17 mo" / "4.1 yr" */
export function span(days) {
  if (days == null || !isFinite(days)) return '—';
  if (days < 90) return Math.round(days) + ' d';
  const mo = days / 30.4375;
  if (mo < 24) return Math.round(mo) + ' mo';
  return (days / 365.25).toFixed(1) + ' yr';
}
/** Years as words for prose: "1 year", "4.1 years", "8 months" */
export function spanWords(days) {
  if (days == null) return '—';
  if (days < 60) return Math.round(days) + ' days';
  const mo = days / 30.4375;
  if (mo < 24) return Math.round(mo) + ' months';
  return (days / 365.25).toFixed(1) + ' years';
}

/** CSS-class for a signed value (shared .up / .down tokens). */
export const tone = v => (v == null || !isFinite(v) ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '');

/** Standard label for a decline from a record close. */
export const DEPTH_BANDS = [
  { id: 'near', label: 'Within 5% of the record', short: 'Within 5%', from: 0, to: -5 },
  { id: 'pullback', label: 'Pullback', short: 'Pullback', from: -5, to: -10 },
  { id: 'correction', label: 'Correction', short: 'Correction', from: -10, to: -20 },
  { id: 'bear', label: 'Bear market', short: 'Bear market', from: -20, to: -100 },
];
export function depthBand(ddPct) {
  if (ddPct == null) return null;
  return DEPTH_BANDS.find(b => ddPct > b.to || b.id === 'bear') || DEPTH_BANDS[3];
}

/** Percentile (0–100) of v within an array: share of values strictly below + half the ties. */
export function percentileOf(values, v) {
  const a = values.filter(x => x != null && isFinite(x));
  if (!a.length || v == null) return null;
  let below = 0, eq = 0;
  for (const x of a) { if (x < v) below++; else if (x === v) eq++; }
  return ((below + eq / 2) / a.length) * 100;
}
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function summarize(values) {
  const a = values.filter(x => x != null && isFinite(x)).sort((x, y) => x - y);
  return a.length ? { n: a.length, min: a[0], max: a[a.length - 1], median: quantile(a, 0.5), p10: quantile(a, 0.1), p90: quantile(a, 0.9) } : null;
}

/** Read/write a small JSON preference, tolerating blocked storage. */
export function loadPref(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' ? { ...fallback, ...v } : fallback; } catch { return fallback; }
}
export function savePref(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }
