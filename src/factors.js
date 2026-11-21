// Transparent factor percentile ranks for the S&P 500 screener. Pure.
//
// Every input is percentile-ranked 0-100 (mid-rank for ties) across the group
// (whole index, or one GICS sector). A factor score is the AVERAGE of its
// available input ranks, re-ranked 0-100 within the same group so 100 = the
// most of that trait in the group. A stock needs at least `min` inputs for a
// score; otherwise the score is null.
//
//  value     earnings yield (ttm EPS / price), forward earnings yield
//            (next-FY EPS / price), free-cash-flow yield (reported ttm FCF /
//            market cap; not used for Financials)                             min 2
//  quality   return on equity, operating margin, gross margin,
//            low leverage (minus debt/equity; companies with negative equity
//            have no D/E and are skipped for that input)                      min 2
//  growth    revenue growth (latest quarter y/y), earnings growth (latest
//            quarter y/y), implied next-FY EPS growth (epsForward / ttm EPS
//            - 1, only when ttm EPS > 0)                                      min 2
//  momentum  12-1 month return (first close of the 1-year history to the
//            close 21 trading days ago), 6-1 month return                    min 1
//  lowVol    minus annualized volatility of daily returns (1 year),
//            minus beta vs the S&P 500 (1 year, daily)                       min 1
import { rankPct, mean, isNum } from './stats.js';

export const FACTORS = {
  value: { min: 2, inputs: [r => r.earningsYieldPct, r => r.fwdEarningsYieldPct, r => r.fcfYieldPct] },
  quality: { min: 2, inputs: [r => r.roePct, r => r.operatingMarginPct, r => r.grossMarginPct, r => (isNum(r.debtToEquity) && r.debtToEquity >= 0 ? -r.debtToEquity : null)] },
  growth: { min: 2, inputs: [r => r.revenueGrowthPct, r => r.earningsGrowthPct, r => r.epsFwdGrowthPct] },
  momentum: { min: 1, inputs: [r => r.r12_1Pct, r => r.r6_1Pct] },
  lowVol: { min: 1, inputs: [r => (isNum(r.vol1yPct) ? -r.vol1yPct : null), r => (isNum(r.beta1y) ? -r.beta1y : null)] },
};

/** Factor scores for one group of rows. inputs(row) -> flat object of input fields. */
export function scoreGroup(rows) {
  const out = rows.map(() => ({}));
  for (const [name, f] of Object.entries(FACTORS)) {
    const inputRanks = f.inputs.map(get => rankPct(rows.map(r => { const v = get(r); return isNum(v) ? v : null; })));
    const raw = rows.map((_, i) => {
      const rs = inputRanks.map(col => col[i]).filter(isNum);
      return rs.length >= f.min ? mean(rs) : null;
    });
    const final = rankPct(raw);
    final.forEach((v, i) => { out[i][name] = v == null ? null : Math.round(v); });
  }
  return out;
}

/** Index-wide and within-sector scores. rows need `sec` and the input fields. */
export function factorRanks(rows) {
  const index = scoreGroup(rows);
  const sector = rows.map(() => null);
  const bySec = new Map();
  rows.forEach((r, i) => { const a = bySec.get(r.sec) || []; a.push(i); bySec.set(r.sec, a); });
  for (const idxs of bySec.values()) {
    const s = scoreGroup(idxs.map(i => rows[i]));
    idxs.forEach((i, k) => { sector[i] = s[k]; });
  }
  return rows.map((_, i) => ({ index: index[i], sector: sector[i] }));
}
