// Index-level valuation of today's S&P 500 from the live v7 quotes the server
// already holds for every constituent. Pure: no I/O.
//
// Definitions (all caps are Yahoo `marketCap`, i.e. full, not float-adjusted):
//
//  Company de-duplication
//    Yahoo reports each share class (GOOGL/GOOG, FOXA/FOX, NWSA/NWS) with the
//    WHOLE company's market cap (price x total shares). Summing both classes
//    would count Alphabet twice, so every aggregate below first collapses
//    classes into one company (key = name without "(Class X)"), keeping the
//    class with the most shares outstanding.
//
//  Company earnings (E)
//    E_i = marketCap_i x EPS_i / price_i
//    marketCap / price is the company's total share count (in the quoted
//    class's units), so this is total net income on a per-share basis.
//    EPS is Yahoo `epsTrailingTwelveMonths` (GAAP diluted, last 4 quarters).
//    Loss-makers keep their NEGATIVE E - we never drop them (dropping them
//    would flatter the P/E). Companies whose financial statements are in a
//    different currency than the quote are excluded and counted.
//
//  Index trailing P/E   = sum(marketCap_i) / sum(E_i)      over covered companies
//  Index forward  P/E   = sum(marketCap_i) / sum(Ef_i), Ef_i = marketCap_i x epsForward_i / price_i
//                         (epsForward = consensus EPS for the next fiscal year,
//                          usually analysts' adjusted/operating EPS; fiscal
//                          years differ by company, so this is approximate)
//  Index forward P/E, next 12 months (forwardPENTM)
//                       = sum(marketCap_i) / sum(Entm_i), Entm_i = marketCap_i x EPSntm_i / price_i
//                         EPSntm_i = f x epsCurrentYear_i + (1 - f) x epsForward_i,
//                         f = share of the company's current fiscal year still ahead
//                           = (nextFiscalYearEnd - now) / 365.25 days, clamped to [0, 1].
//                         This time-weighted blend is the usual approximation of
//                         "next twelve months" consensus EPS. Needs the fiscal-year
//                         end from the quoteSummary crawl; coverage is reported.
//                         The equity risk premium uses this when it covers >= 90% of
//                         index cap, otherwise the next-fiscal-year forward yield.
//  Earnings yield       = 1 / P/E  (= sum E / sum cap)
//  Dividend yield (ttm) = sum(marketCap_i x trailingAnnualDividendYield_i) / sum(marketCap_i)
//                         (= trailing 12-month dividends paid / market value)
//  Dividend yield (fwd) = sum(marketCap_i x dividendYield_i / 100) / sum(marketCap_i)
//                         (Yahoo `dividendYield` is the indicated annual rate, in %)
//  Price / book         = sum(marketCap_i) / sum(B_i), B_i = marketCap_i / priceToBook_i;
//                         companies with negative or missing book, or implausible
//                         P/B (< 0.1 or > 500, unit mismatches such as BRK-B), excluded
//  Equity risk premium proxy = forward earnings yield - 10-year Treasury yield (^TNX)
//                         A rough "how much more do stocks earn than bonds" gauge;
//                         it ignores growth and inflation and is NOT a forecast.
//  Top-10 concentration = cap of the 10 largest companies / total cap
//  Sector weight        = sector cap / total cap
//
// Coverage is reported for every ratio as companies used and % of total cap.
import { isNum } from './stats.js';

const num = v => (isNum(v) ? v : null);
export const companyKey = name => String(name || '').replace(/\s*\(Class [A-Z]\)\s*$/i, '').trim();

/** Collapse share classes. Returns [{ key, members:[universe rows], u, q }] (u/q = chosen class). */
export function companies(universe, quotes) {
  const groups = new Map();
  for (const u of universe) {
    const q = quotes.get(u.ys);
    if (!q || !num(q.marketCap) || !num(q.regularMarketPrice)) continue;
    const k = companyKey(u.n);
    const g = groups.get(k) || { key: k, members: [], u: null, q: null };
    g.members.push(u.s);
    if (!g.q || (num(q.sharesOutstanding) || 0) > (num(g.q.sharesOutstanding) || 0)) { g.u = u; g.q = q; }
    groups.set(k, g);
  }
  return [...groups.values()];
}

/** Aggregate valuation for a list of companies (from companies()). */
export function aggregate(list, totalCapAll, { fyEnd = () => null, nowSec = Date.now() / 1000 } = {}) {
  let cap = 0;
  const acc = { pe: [0, 0, 0, 0], fpe: [0, 0, 0, 0], ntm: [0, 0, 0, 0], dy: [0, 0, 0], fdy: [0, 0, 0], pb: [0, 0, 0, 0] };
  // acc.x = [sum cap used, sum denominator, companies used, losers (pe only)]
  let fxExcluded = 0, bothT = 0, bothF = 0;
  for (const { q, u } of list) {
    const mc = q.marketCap, price = q.regularMarketPrice;
    cap += mc;
    const sameCcy = !q.financialCurrency || !q.currency || q.financialCurrency === q.currency;
    if (!sameCcy) { fxExcluded++; continue; }
    const shares = mc / price;
    if (num(q.epsTrailingTwelveMonths) != null) {
      const e = q.epsTrailingTwelveMonths * shares;
      acc.pe[0] += mc; acc.pe[1] += e; acc.pe[2]++; if (e < 0) acc.pe[3]++;
    }
    if (num(q.epsForward) != null) {
      const e = q.epsForward * shares;
      acc.fpe[0] += mc; acc.fpe[1] += e; acc.fpe[2]++; if (e < 0) acc.fpe[3]++;
    }
    const fy = u ? num(fyEnd(u.ys)) : null;
    if (fy != null && fy > nowSec && num(q.epsCurrentYear) != null && num(q.epsForward) != null) {
      const f = Math.min(1, Math.max(0, (fy - nowSec) / (365.25 * 86400)));
      const e = (f * q.epsCurrentYear + (1 - f) * q.epsForward) * shares;
      acc.ntm[0] += mc; acc.ntm[1] += e; acc.ntm[2]++; if (e < 0) acc.ntm[3]++;
    }
    if (num(q.epsTrailingTwelveMonths) != null && num(q.epsForward) != null) {
      bothT += q.epsTrailingTwelveMonths * shares; bothF += q.epsForward * shares;
    }
    if (num(q.trailingAnnualDividendYield) != null && q.trailingAnnualDividendYield >= 0 && q.trailingAnnualDividendYield < 0.5) {
      acc.dy[0] += mc; acc.dy[1] += mc * q.trailingAnnualDividendYield; acc.dy[2]++;
    }
    if (num(q.dividendYield) != null && q.dividendYield >= 0 && q.dividendYield < 50) {
      acc.fdy[0] += mc; acc.fdy[1] += mc * q.dividendYield / 100; acc.fdy[2]++;
    }
    if (num(q.priceToBook) != null && q.priceToBook >= 0.1 && q.priceToBook <= 500) {
      acc.pb[0] += mc; acc.pb[1] += mc / q.priceToBook; acc.pb[2]++;
    }
  }
  const cov = a => ({ companies: a[2], capPct: cap ? a[0] / cap * 100 : null });
  const ratio = (a) => (a[1] > 0 ? a[0] / a[1] : null);
  return {
    companies: list.length,
    marketCap: cap,
    weightPct: totalCapAll ? cap / totalCapAll * 100 : null,
    trailingPE: ratio(acc.pe), trailingPECoverage: { ...cov(acc.pe), lossMakers: acc.pe[3] },
    trailingEarnings: acc.pe[1],
    forwardPE: ratio(acc.fpe), forwardPECoverage: { ...cov(acc.fpe), negative: acc.fpe[3] },
    forwardEarnings: acc.fpe[1],
    forwardPENTM: ratio(acc.ntm), forwardPENTMCoverage: { ...cov(acc.ntm), negative: acc.ntm[3] },
    earningsYieldPct: acc.pe[0] ? acc.pe[1] / acc.pe[0] * 100 : null,
    forwardEarningsYieldPct: acc.fpe[0] ? acc.fpe[1] / acc.fpe[0] * 100 : null,
    forwardEarningsYieldNTMPct: acc.ntm[0] ? acc.ntm[1] / acc.ntm[0] * 100 : null,
    // Next-FY consensus vs trailing GAAP earnings for companies that have both. Mixes
    // accounting bases (consensus is usually adjusted EPS) and a 1-2 year horizon:
    // indicative only, not a growth forecast.
    forwardVsTrailingEarningsPct: bothT > 0 ? (bothF / bothT - 1) * 100 : null,
    dividendYieldPct: acc.dy[0] ? acc.dy[1] / acc.dy[0] * 100 : null, dividendYieldCoverage: cov(acc.dy),
    forwardDividendYieldPct: acc.fdy[0] ? acc.fdy[1] / acc.fdy[0] * 100 : null,
    priceToBook: ratio(acc.pb), priceToBookCoverage: cov(acc.pb),
    excludedCurrencyMismatch: fxExcluded,
  };
}

/**
 * Full valuation block. tenYearYieldPct: ^TNX price (already in percent).
 * sectors: list of GICS sector names to report.
 */
export function computeValuation(universe, quotes, tenYearYieldPct, sectorNames, opts = {}) {
  const list = companies(universe, quotes);
  const total = list.reduce((a, c) => a + c.q.marketCap, 0);
  const index = aggregate(list, total, opts);
  const sorted = [...list].sort((a, b) => b.q.marketCap - a.q.marketCap);
  const top10 = sorted.slice(0, 10);
  const top10Cap = top10.reduce((a, c) => a + c.q.marketCap, 0);
  const useNTM = index.forwardPENTMCoverage.capPct >= 90 && index.forwardEarningsYieldNTMPct != null;
  const fy = useNTM ? index.forwardEarningsYieldNTMPct : index.forwardEarningsYieldPct;
  const erp = fy != null && isNum(tenYearYieldPct) ? fy - tenYearYieldPct : null;
  const sectors = (sectorNames || [...new Set(list.map(c => c.u.sec))]).map(name => {
    const members = list.filter(c => c.u.sec === name);
    const a = aggregate(members, total, opts);
    return { sector: name, ...a };
  });
  return {
    index: {
      ...index,
      tenYearYieldPct: isNum(tenYearYieldPct) ? tenYearYieldPct : null,
      equityRiskPremiumPct: erp,
      equityRiskPremiumBasis: useNTM ? 'next-12-month forward earnings yield - 10y yield' : 'next-fiscal-year forward earnings yield - 10y yield',
      top10: {
        capPct: total ? top10Cap / total * 100 : null,
        names: top10.map(c => ({ s: c.u.s, classes: c.members, n: c.key, weightPct: c.q.marketCap / total * 100 })),
      },
      shareClassesMerged: list.filter(c => c.members.length > 1).map(c => c.members),
    },
    sectors,
  };
}
