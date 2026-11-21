// Per-series display rules: units, precision, how changes are expressed,
// when a direction may be coloured, reference lines and short labels.
// Precision follows how the source publishes each figure (BLS/BEA monthly
// rates to 0.1, Treasury and FRED daily rates to 0.01).
import { parseDay } from './data.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const minus = s => s.replace(/^-/, '−');

/* kind:
     pct1   1 decimal %, change in percentage points (pp)
     rate2  2 decimal %, change in basis points (bp)
     bp     spread stored in percentage points, shown in bp
     kjobs  thousands of jobs per month, signed
     claims weekly count, shown in thousands
     pp2    2 decimal percentage points (Sahm rule)
     idx1   index level, 1 decimal
     idx2   index level, 2 decimals (NFCI)
   tone: 'upGood' | 'upBad' | null. Only set where a rise has one clear meaning
   for the economy; inflation, yields and money growth stay uncoloured. */
export const SPEC = {
  cpi:          { kind: 'pct1', short: 'CPI', tone: null, refs: [{ v: 2, label: 'Fed 2% goal' }] },
  coreCpi:      { kind: 'pct1', short: 'Core CPI', tone: null, refs: [{ v: 2, label: 'Fed 2% goal' }] },
  pce:          { kind: 'pct1', short: 'PCE', tone: null, refs: [{ v: 2, label: 'Fed 2% goal' }] },
  corePce:      { kind: 'pct1', short: 'Core PCE', tone: null, refs: [{ v: 2, label: 'Fed 2% goal (core PCE is its preferred gauge)' }] },
  breakeven10:  { kind: 'rate2', short: '10Y breakeven', tone: null, refs: [{ v: 2, label: '2%' }] },
  unemployment: { kind: 'pct1', short: 'Unemployment', tone: 'upBad', refs: [] },
  payrolls:     { kind: 'kjobs', short: 'Payrolls', tone: 'upGood', refs: [{ v: 0, label: '0' }] },
  claims:       { kind: 'claims', short: 'Jobless claims', tone: 'upBad', refs: [] },
  sahm:         { kind: 'pp2', short: 'Sahm rule', tone: 'upBad', refs: [{ v: 0.5, label: '0.50 trigger' }] },
  gdp:          { kind: 'pct1', short: 'Real GDP', tone: 'upGood', refs: [{ v: 0, label: '0' }] },
  indpro:       { kind: 'pct1', short: 'Industrial prod.', tone: 'upGood', refs: [{ v: 0, label: '0' }] },
  sentiment:    { kind: 'idx1', short: 'Sentiment', tone: 'upGood', refs: [] },
  fedFunds:     { kind: 'rate2', short: 'Fed funds', tone: null, refs: [] },
  y2:           { kind: 'rate2', short: '2Y Treasury', tone: null, refs: [] },
  y10:          { kind: 'rate2', short: '10Y Treasury', tone: null, refs: [] },
  real10:       { kind: 'rate2', short: '10Y real', tone: null, refs: [{ v: 0, label: '0' }] },
  s10y2y:       { kind: 'bp', short: '10Y − 2Y', tone: null, refs: [{ v: 0, label: 'inverted below 0' }] },
  s10y3m:       { kind: 'bp', short: '10Y − 3M', tone: null, refs: [{ v: 0, label: 'inverted below 0' }] },
  mortgage30:   { kind: 'rate2', short: '30Y mortgage', tone: null, refs: [] },
  hySpread:     { kind: 'bp', short: 'High-yield spread', tone: 'upBad', refs: [] },
  baaSpread:    { kind: 'bp', short: 'Baa spread', tone: 'upBad', refs: [] },
  nfci:         { kind: 'idx3', short: 'NFCI', tone: 'upBad', refs: [{ v: 0, label: 'average conditions' }] },
  m2:           { kind: 'pct1', short: 'M2 money', tone: null, refs: [{ v: 0, label: '0' }] },
};
export const spec = key => SPEC[key] || { kind: 'idx2', tone: null, refs: [] };

/** fmtVal(key, v, { sign, unit }) → display string. */
export function fmtVal(key, v, { sign = false, unit = true } = {}) {
  if (v == null || !isFinite(v)) return '—';
  const k = spec(key).kind;
  let s;
  switch (k) {
    case 'pct1': s = v.toFixed(1) + (unit ? '%' : ''); break;
    case 'rate2': s = v.toFixed(2) + (unit ? '%' : ''); break;
    case 'bp': s = Math.round(v * 100) + (unit ? ' bp' : ''); break;
    case 'kjobs': s = Math.round(v).toLocaleString('en-US') + (unit ? 'K' : ''); sign = true; break;
    case 'claims': s = (v / 1000).toFixed(Number.isInteger(v / 1000) ? 0 : 1) + (unit ? 'K' : ''); break;
    case 'pp2': s = v.toFixed(2) + (unit ? ' pp' : ''); break;
    case 'idx1': s = v.toFixed(1); break;
    case 'idx3': s = v.toFixed(3); break;
    default: s = v.toFixed(2);
  }
  if (sign && v > 0 && !s.startsWith('+')) s = '+' + s;
  return minus(s);
}
/** Axis tick format (compact, no unit). */
export function axisFmt(key) {
  const k = spec(key).kind;
  if (k === 'bp') return v => minus(String(Math.round(v * 100)));
  if (k === 'claims') return v => (v / 1000).toFixed(0) + 'K';
  if (k === 'kjobs') return v => minus(Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'M' : Math.round(v) + 'K');
  if (k === 'pct1' || k === 'rate2') return v => minus(+v.toFixed(2) + '%');
  return v => minus(String(+v.toFixed(2)));
}
/** Rounded change in the series' change unit: { n, dec, unit }. */
function chgParts(key, d) {
  const k = spec(key).kind;
  const r = (x, p) => Math.round(x * 10 ** p) / 10 ** p;
  if (k === 'pct1') return { n: r(d, 1), dec: 1, unit: ' pp' };
  if (k === 'rate2' || k === 'bp') return { n: Math.round(d * 100), dec: 0, unit: ' bp' };
  if (k === 'kjobs') return { n: Math.round(d), dec: 0, unit: 'K', sep: true };
  if (k === 'claims') { const n = r(d / 1000, 1); return { n, dec: Number.isInteger(n) ? 0 : 1, unit: 'K' }; }
  if (k === 'pp2') return { n: r(d, 2), dec: 2, unit: ' pp' };
  if (k === 'idx1') return { n: r(d, 1), dec: 1, unit: '' };
  if (k === 'idx3') return { n: r(d, 3), dec: 3, unit: '' };
  return { n: r(d, 2), dec: 2, unit: '' };
}
/** fmtChg(key, d) → "+0.4 pp", "−3 bp", "+105K", "0.0 pp". */
export function fmtChg(key, d) {
  if (d == null || !isFinite(d)) return '—';
  const { n, dec, unit, sep } = chgParts(key, d);
  const abs = sep ? Math.abs(n).toLocaleString('en-US') : Math.abs(n).toFixed(dec);
  return (n > 0 ? '+' : n < 0 ? '−' : '') + abs + unit;
}
/** Tone class for a change: 'up' (better) | 'down' (worse) | 'flat'. Uncoloured series and zero changes → 'flat'. */
export function toneOf(key, d) {
  const t = spec(key).tone;
  if (!t || d == null || !isFinite(d)) return 'flat';
  const { n } = chgParts(key, d);
  if (n === 0) return 'flat';
  return (n > 0) === (t === 'upGood') ? 'up' : 'down';
}

// ---- Dates ----
/** Reference-period label for a series date: "Sep 2026", "Q3 2026", "Nov 14, 2026". */
export function period(s, freq, { long = false } = {}) {
  const d = parseDay(s);
  if (!d) return '—';
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (freq === 'Q') return `Q${Math.floor(m / 3) + 1} ${y}`;
  if (freq === 'M') return (long ? MONTH[m] : MON[m]) + ' ' + y;
  return `${MON[m]} ${d.getUTCDate()}, ${y}`;
}
/** Short label for comparisons: "Aug", "Sep ’25", "Q2", "Nov 18". */
export function periodShort(s, freq, refDate) {
  const d = parseDay(s), r = parseDay(refDate);
  if (!d) return '—';
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const sameYear = r && r.getUTCFullYear() === y;
  const yy = '’' + String(y).slice(2);
  if (freq === 'Q') return `Q${Math.floor(m / 3) + 1}${sameYear ? '' : ' ' + yy}`;
  if (freq === 'M') return MON[m] + (sameYear ? '' : ' ' + yy);
  return `${MON[m]} ${d.getUTCDate()}${sameYear ? '' : ' ' + yy}`;
}
export const FREQ_WORD = { D: 'daily', W: 'weekly', M: 'monthly', Q: 'quarterly' };
export const monthName = i => MONTH[i];
export const monShort = i => MON[i];
export function yearOf(s) { return s ? s.slice(0, 4) : ''; }
export function monthYearOf(s) { const d = parseDay(s); return d ? MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : ''; }

/** Tooltip date formatter for a frequency. */
export function tipDateFor(freq) {
  if (freq === 'Q') return d => `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (freq === 'M') return d => MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  if (freq === 'W') return d => 'Week ending ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  return d => MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

/** Percentile phrase for a series: "Higher than 67% of monthly readings since 1948". */
export function pctPhrase(s) {
  if (s?.percentile == null) return '';
  const p = s.percentile;
  const n = p < 1 ? 'less than 1%' : p > 99 && p < 100 ? 'more than 99%' : Math.round(p) + '%';
  const since = s.key === 'hySpread' ? monthYearOf(s.percentileSince) : yearOf(s.percentileSince);
  return `Higher than ${n} of readings since ${since}`;
}
/** Compact percentile for tables: "67th". */
export function ordinal(p) {
  if (p == null) return '—';
  const n = Math.round(p);
  const suf = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + suf;
}

/** ISO timestamp → "Nov 20, 19:26 ET" (US Eastern). */
export function etStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ET';
}
