// Long-Term: pure calculations for the planning tools (no DOM).
//
// simulateDCA mirrors src/stats.js simulateDCA — each scheduled purchase buys
// `amount` at the first trading day on or after its date, using dividend-
// adjusted closes (so dividends are reinvested) — and adds an optional lump
// sum on the first purchase, a daily value path, the money-weighted return
// (XIRR) and the deepest stretch spent below the amount paid in.

/** Index of the first date ≥ d (ISO strings), or -1. */
export function indexOnOrAfter(dates, d) {
  let lo = 0, hi = dates.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid] < d) lo = mid + 1; else hi = mid; }
  return lo < dates.length ? lo : -1;
}

/** Monthly schedule on the start date's day of month (clamped to month end), through `end`. */
export function monthlyDates(start, end) {
  const [y, m, d] = start.split('-').map(Number);
  const out = [];
  for (let k = 0; ; k++) {
    const yy = y + Math.floor((m - 1 + k) / 12), mm = ((m - 1 + k) % 12) + 1;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const s = `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
    if (s > end) break;
    out.push(s);
  }
  return out;
}

/** Annual money-weighted return from dated cash flows [{ t: ms, v }] (outflows negative). */
export function xirr(flows) {
  if (flows.length < 2) return null;
  const t0 = flows[0].t;
  const f = r => flows.reduce((s, c) => s + c.v / Math.pow(1 + r, (c.t - t0) / (365.25 * 864e5)), 0);
  let lo = -0.9999, hi = 10;
  let flo = f(lo), fhi = f(hi);
  if (!isFinite(flo) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * simulateDCA(h, { start, monthly, lump }) → result | { error }
 * h: { dates, t, adj } from data.getHistory.
 */
export function simulateDCA(h, { start, monthly = 0, lump = 0 }) {
  const { dates, t, adj } = h;
  if (!dates.length) return { error: 'No price history.' };
  const i0 = indexOnOrAfter(dates, start);
  if (i0 < 0) return { error: 'The start date is after the last available price.' };
  const last = dates.length - 1;
  const sched = monthlyDates(dates[i0], dates[last]);
  // purchases by day index
  const buyAt = new Map();
  let buys = 0;
  for (const bd of sched) {
    const i = indexOnOrAfter(dates, bd);
    if (i < 0) continue;
    buyAt.set(i, (buyAt.get(i) || 0) + monthly);
    buys++;
  }
  if (lump > 0) buyAt.set(i0, (buyAt.get(i0) || 0) + lump);
  if (!monthly && !lump) return { error: 'Enter a monthly amount or a starting amount.' };

  let units = 0, paid = 0;
  const value = [], contrib = [], flows = [];
  let worst = { pct: 0, i: null }, spellStart = null, worstSpell = null;
  for (let i = i0; i <= last; i++) {
    const add = buyAt.get(i);
    if (add) { units += add / adj[i]; paid += add; flows.push({ t: t[i], v: -add }); }
    const v = units * adj[i];
    value.push(v); contrib.push(paid);
    const gap = paid ? v / paid - 1 : 0;
    if (gap < 0) {
      if (spellStart == null) spellStart = i;
      if (gap < worst.pct) { worst = { pct: gap, i }; worstSpell = { start: spellStart, end: null }; }
    } else if (spellStart != null) {
      if (worstSpell && worstSpell.start === spellStart && worstSpell.end == null) worstSpell.end = i;
      spellStart = null;
    }
  }
  const end = value[value.length - 1];
  flows.push({ t: t[last], v: end });
  const irr = xirr(flows);
  const years = (t[last] - t[i0]) / (365.25 * 864e5);
  const fundCagr = years > 0.5 ? Math.pow(adj[last] / adj[i0], 1 / years) - 1 : null;
  const wIdx = worst.i;
  return {
    startDate: dates[i0], endDate: dates[last], years, buys: buys + (lump > 0 ? 1 : 0),
    invested: paid, value: end, gain: end - paid, gainPct: paid ? (end / paid - 1) * 100 : null,
    irrPct: irr == null ? null : irr * 100, fundCagrPct: fundCagr == null ? null : fundCagr * 100,
    worst: wIdx == null ? null : {
      pct: worst.pct * 100, date: dates[wIdx], value: value[wIdx - i0], paid: contrib[wIdx - i0], gap: value[wIdx - i0] - contrib[wIdx - i0],
      from: dates[worstSpell.start], to: worstSpell.end != null ? dates[worstSpell.end] : null,
      days: ((worstSpell.end != null ? t[worstSpell.end] : t[last]) - t[worstSpell.start]) / 864e5,
    },
    series: { dates: dates.slice(i0), value, contrib },
  };
}

/**
 * project({ age, target, start, monthly, rates:{p10,median,p90} (% per year, real) })
 * Constant-rate paths: contributions at the start of each month, monthly compounding
 * at (1 + r)^(1/12). Returns yearly points by age.
 */
export function project({ age, target, start, monthly, rates }) {
  const years = target - age;
  const out = { ages: [], contrib: [], p10: [], p50: [], p90: [] };
  const g = Object.fromEntries(Object.entries(rates).map(([k, r]) => [k, Math.pow(1 + r / 100, 1 / 12)]));
  const bal = { p10: start, median: start, p90: start };
  let paid = start;
  const push = a => { out.ages.push(a); out.contrib.push(paid); out.p10.push(bal.p10); out.p50.push(bal.median); out.p90.push(bal.p90); };
  push(age);
  for (let y = 1; y <= years; y++) {
    for (let mth = 0; mth < 12; mth++) {
      for (const k of ['p10', 'median', 'p90']) bal[k] = (bal[k] + monthly) * g[k];
      paid += monthly;
    }
    push(age + y);
  }
  return out;
}
