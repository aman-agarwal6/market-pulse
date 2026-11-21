// Pure numeric helpers: no I/O, no globals. Every function here is covered by
// test/stats.test.js. Conventions:
//  - returns are fractions (0.10 = +10%) unless a name says "pct"
//  - dates are 'YYYY-MM-DD' strings; series are parallel arrays
//  - functions return null rather than NaN when an answer is undefined

export const isNum = v => typeof v === 'number' && Number.isFinite(v);
export const round = (v, d = 2) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

export function mean(a) {
  const v = a.filter(isNum);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** Sample standard deviation (n - 1). */
export function stdev(a) {
  const v = a.filter(isNum);
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

/** Quantile with linear interpolation between order statistics (Excel PERCENTILE.INC / R type 7). */
export function quantile(a, p) {
  const v = a.filter(isNum).sort((x, y) => x - y);
  if (!v.length) return null;
  const h = (v.length - 1) * p;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return v[lo] + (v[hi] - v[lo]) * (h - lo);
}

export const median = a => quantile(a, 0.5);

/**
 * Percentile of x within a history: share of observations below x, counting
 * ties as half (mid-rank). 0 = lowest ever, 100 = highest ever.
 */
export function percentileOf(history, x) {
  const v = history.filter(isNum);
  if (!v.length || !isNum(x)) return null;
  let below = 0, equal = 0;
  for (const h of v) { if (h < x) below++; else if (h === x) equal++; }
  return (below + 0.5 * equal) / v.length * 100;
}

/**
 * Cross-sectional percentile ranks (0..100, higher value -> higher rank).
 * Ties get the average rank. Nulls stay null. A single value ranks 50.
 */
export function rankPct(values) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => isNum(v)).sort((a, b) => a[0] - b[0]);
  const out = values.map(() => null);
  const n = idx.length;
  if (!n) return out;
  if (n === 1) { out[idx[0][1]] = 50; return out; }
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2; // average 0-based rank
    for (let k = i; k <= j; k++) out[idx[k][1]] = r / (n - 1) * 100;
    i = j + 1;
  }
  return out;
}

/** Summary used by the forward-return study. Inputs are fractions. */
export function summarize(a) {
  const v = a.filter(isNum);
  if (!v.length) return { count: 0, median: null, mean: null, min: null, max: null, pctPositive: null };
  return {
    count: v.length,
    median: median(v),
    mean: mean(v),
    min: Math.min(...v),
    max: Math.max(...v),
    pctPositive: v.filter(x => x > 0).length / v.length * 100,
  };
}

/** Compound annual growth rate from start to end value over `years`. */
export function cagr(start, end, years) {
  if (!isNum(start) || !isNum(end) || start <= 0 || end <= 0 || !(years > 0)) return null;
  return (end / start) ** (1 / years) - 1;
}

/** Simple period returns: r[i] = v[i] / v[i-1] - 1 (length n - 1). */
export function periodReturns(v) {
  const out = [];
  for (let i = 1; i < v.length; i++) out.push(isNum(v[i]) && isNum(v[i - 1]) && v[i - 1] > 0 ? v[i] / v[i - 1] - 1 : null);
  return out;
}

/** Annualized volatility: sample stdev of period returns x sqrt(periods per year). */
export function annualizedVol(returns, periodsPerYear) {
  const s = stdev(returns);
  return s == null ? null : s * Math.sqrt(periodsPerYear);
}

/** Pearson correlation over pairs where both values are numbers. Returns { r, n }. */
export function correlation(a, b) {
  const xs = [], ys = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (isNum(a[i]) && isNum(b[i])) { xs.push(a[i]); ys.push(b[i]); }
  const n = xs.length;
  if (n < 3) return { r: null, n };
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (!sxx || !syy) return { r: null, n };
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

/** OLS beta of asset returns on market returns (pairwise complete). */
export function beta(asset, market) {
  const xs = [], ys = [];
  for (let i = 0; i < Math.min(asset.length, market.length); i++) if (isNum(asset[i]) && isNum(market[i])) { ys.push(asset[i]); xs.push(market[i]); }
  if (xs.length < 20) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  return sxx ? sxy / sxx : null;
}

// ---------------------------------------------------------------------------
// Drawdowns
// ---------------------------------------------------------------------------

/** Running drawdown from the prior high: dd[i] = v[i] / max(v[0..i]) - 1 (<= 0). */
export function drawdownSeries(v) {
  const dd = new Array(v.length);
  let peak = -Infinity;
  for (let i = 0; i < v.length; i++) {
    if (v[i] > peak) peak = v[i];
    dd[i] = v[i] / peak - 1;
  }
  return dd;
}

/** Largest peak-to-trough decline. Returns { depth (<=0), peak, trough } indices. */
export function maxDrawdown(v) {
  let peak = 0, best = { depth: 0, peak: 0, trough: 0 };
  for (let i = 1; i < v.length; i++) {
    if (v[i] > v[peak]) peak = i;
    const d = v[i] / v[peak] - 1;
    if (d < best.depth) best = { depth: d, peak, trough: i };
  }
  return best;
}

/**
 * Split a close series into episodes between all-time highs. An episode starts
 * at a closing high, its trough is the lowest close before the index closes
 * at/above that high again (the recovery). Only episodes at least `minDepth`
 * deep (fraction, e.g. 0.10) are returned. The last one may be ongoing.
 * Returns [{ peak, trough, recovery|null, depth }] with array indices.
 */
export function drawdownEpisodes(v, minDepth = 0.10) {
  const out = [];
  let peak = 0, trough = 0;
  const close = (recovery) => {
    const depth = v[trough] / v[peak] - 1;
    if (-depth >= minDepth - 1e-12) out.push({ peak, trough, recovery, depth });
  };
  for (let i = 1; i < v.length; i++) {
    if (v[i] >= v[peak]) {
      if (trough !== peak) close(i);
      peak = i; trough = i;
    } else if (v[i] < v[trough]) trough = i;
  }
  if (trough !== peak) close(null);
  return out;
}

/**
 * For each threshold (fraction), the first index in each episode where the
 * close is at least that far below the episode's starting high. One event per
 * episode per threshold. Returns { [threshold]: [{ i, peak }] }.
 */
export function firstCrossings(v, thresholds) {
  const out = Object.fromEntries(thresholds.map(t => [t, []]));
  let peak = 0;
  let crossed = new Set();
  for (let i = 1; i < v.length; i++) {
    if (v[i] >= v[peak]) { peak = i; crossed = new Set(); continue; }
    const dd = v[i] / v[peak] - 1;
    for (const t of thresholds) {
      if (!crossed.has(t) && -dd >= t - 1e-12) { crossed.add(t); out[t].push({ i, peak }); }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dates and calendar-based lookups
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' plus N calendar years (Feb 29 -> Feb 28). */
export function addYears(date, n) {
  const y = +date.slice(0, 4) + n;
  let md = date.slice(5);
  if (md === '02-29') md = '02-28';
  return `${String(y).padStart(4, '0')}-${md}`;
}

/** First index whose date is >= target (dates sorted ascending), or -1. */
export function indexOnOrAfter(dates, target) {
  let lo = 0, hi = dates.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid] < target) lo = mid + 1; else hi = mid; }
  return lo < dates.length ? lo : -1;
}

/** Last index whose date is <= target, or -1. */
export function indexOnOrBefore(dates, target) {
  let lo = 0, hi = dates.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid] <= target) lo = mid + 1; else hi = mid; }
  return lo - 1;
}

/**
 * Price return from index i to the first close on/after the same calendar
 * date `years` later. null if the series does not reach that far.
 */
export function forwardReturn(dates, v, i, years) {
  const j = indexOnOrAfter(dates, addYears(dates[i], years));
  return j < 0 ? null : v[j] / v[i] - 1;
}

/** Trailing return over `years`: last value vs last close on/before the date `years` earlier. */
export function trailingReturn(dates, v, years, endIndex = v.length - 1) {
  if (endIndex < 0) return null;
  const j = indexOnOrBefore(dates, addYears(dates[endIndex], -years));
  // j < 0 means the series starts after the window start: not enough history.
  return j < 0 ? null : v[endIndex] / v[j] - 1;
}

/** Keep the last observation of each period. key(date) -> period id. */
export function lastPerPeriod(dates, v, key) {
  const d = [], out = [];
  for (let i = 0; i < dates.length; i++) {
    const k = key(dates[i]);
    if (d.length && key(d[d.length - 1]) === k) { d[d.length - 1] = dates[i]; out[out.length - 1] = v[i]; }
    else { d.push(dates[i]); out.push(v[i]); }
  }
  return { dates: d, values: out };
}

export const monthKey = date => date.slice(0, 7);

/** ISO-like week id: the date of that week's Monday. */
export function weekKey(date) {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * 864e5).toISOString().slice(0, 10);
}

/** Minimum of v within each period, dated at the period's last observation. */
export function minPerPeriod(dates, v, key) {
  const d = [], out = [];
  for (let i = 0; i < dates.length; i++) {
    const k = key(dates[i]);
    if (d.length && key(d[d.length - 1]) === k) { d[d.length - 1] = dates[i]; out[out.length - 1] = Math.min(out[out.length - 1], v[i]); }
    else { d.push(dates[i]); out.push(v[i]); }
  }
  return { dates: d, values: out };
}

/** Calendar days between two 'YYYY-MM-DD' dates. */
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

/**
 * Rolling N-year annualized returns on a monthly series (one value per month,
 * consecutive months). Window i..i+12N. Returns stats over all windows.
 */
export function rollingAnnualized(dates, v, years) {
  const n = Math.round(years * 12);
  const rets = [], starts = [];
  for (let i = 0; i + n < v.length; i++) {
    const r = cagr(v[i], v[i + n], years);
    if (r != null) { rets.push(r); starts.push(dates[i]); }
  }
  if (!rets.length) return { years, windows: 0 };
  let wi = 0, bi = 0;
  rets.forEach((r, i) => { if (r < rets[wi]) wi = i; if (r > rets[bi]) bi = i; });
  return {
    years,
    windows: rets.length,
    pctPositive: rets.filter(r => r > 0).length / rets.length * 100,
    worst: rets[wi], worstStart: starts[wi],
    p10: quantile(rets, 0.10),
    median: quantile(rets, 0.5),
    p90: quantile(rets, 0.90),
    best: rets[bi], bestStart: starts[bi],
    firstStart: starts[0], lastStart: starts[starts.length - 1],
  };
}

/**
 * Year-over-year % change for a monthly series keyed by date: value vs the
 * observation dated exactly 12 months earlier (same YYYY-MM). Returns arrays.
 */
export function yoyMonthly(dates, v) {
  const byMonth = new Map(dates.map((d, i) => [d.slice(0, 7), v[i]]));
  const outD = [], outV = [];
  for (let i = 0; i < dates.length; i++) {
    const prevKey = `${+dates[i].slice(0, 4) - 1}-${dates[i].slice(5, 7)}`;
    const p = byMonth.get(prevKey);
    if (isNum(p) && p !== 0 && isNum(v[i])) { outD.push(dates[i]); outV.push((v[i] / p - 1) * 100); }
  }
  return { dates: outD, values: outV };
}

/** Trailing moving average over `n` observations (first n-1 dropped). */
export function movingAverage(dates, v, n) {
  const outD = [], outV = [];
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= n) s -= v[i - n];
    if (i >= n - 1) { outD.push(dates[i]); outV.push(s / n); }
  }
  return { dates: outD, values: outV };
}

/**
 * Dollar-cost averaging: invest `amount` at each date in buyDates (on the
 * first close on/after it) and value the holdings at the final close.
 * prices should be dividend-adjusted closes for total return.
 */
export function simulateDCA(dates, prices, buyDates, amount) {
  let units = 0, invested = 0, buys = 0;
  for (const bd of buyDates) {
    const i = indexOnOrAfter(dates, bd);
    if (i < 0) continue;
    units += amount / prices[i]; invested += amount; buys++;
  }
  const value = units * prices[prices.length - 1];
  return { buys, invested, units, value, gain: value - invested, returnPct: invested ? (value / invested - 1) * 100 : null };
}
