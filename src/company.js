// /api/company?s=SYM: research page data for any Yahoo symbol (stock or ETF).
// quoteSummary + fundamentals-timeseries, normalized to plain numbers.
// Every section is null when Yahoo has nothing for it. Cached 6 h (memory + disk).
import * as yahoo from './yahoo.js';
import { cached, trimMemory, meta } from './store.js';
import { plain, n, pct, r as rnd, isoDate } from './normalize.js';
import { round, isNum } from './stats.js';
import { companyKey } from './shareclass.js';

const H = 3600000;
const TTL = 6 * H;
const STOCK_MODULES = ['quoteType', 'price', 'assetProfile', 'summaryDetail', 'financialData', 'defaultKeyStatistics', 'recommendationTrend',
  'earningsHistory', 'earningsTrend', 'calendarEvents', 'majorHoldersBreakdown'];
const FUND_MODULES = ['fundProfile', 'topHoldings', 'fundPerformance'];
const TS_BASE = ['TotalRevenue', 'GrossProfit', 'OperatingIncome', 'NetIncome', 'DilutedEPS', 'FreeCashFlow', 'OperatingCashFlow', 'CapitalExpenditure', 'DilutedAverageShares'];
const TS_TYPES = [...TS_BASE.map(b => 'annual' + b), ...TS_BASE.map(b => 'quarterly' + b), 'trailingFreeCashFlow'];

/** Align timeseries into parallel arrays for one frequency. Pure. */
export function alignFinancials(ts, prefix) {
  const get = b => ts[prefix + b] || [];
  const dates = [...new Set(TS_BASE.flatMap(b => get(b).map(x => x.date)))].sort();
  if (!dates.length) return null;
  const col = b => { const m = new Map(get(b).map(x => [x.date, x.value])); return dates.map(d => m.get(d) ?? null); };
  const ocf = col('OperatingCashFlow'), capex = col('CapitalExpenditure');
  // Prefer Yahoo's FreeCashFlow line; otherwise operating cash flow + capex (capex is negative).
  const fcf = col('FreeCashFlow').map((v, i) => v ?? (isNum(ocf[i]) && isNum(capex[i]) ? ocf[i] + capex[i] : null));
  return {
    dates,
    revenue: col('TotalRevenue'), grossProfit: col('GrossProfit'), operatingIncome: col('OperatingIncome'), netIncome: col('NetIncome'),
    eps: col('DilutedEPS'), freeCashFlow: fcf, operatingCashFlow: ocf, capex, sharesDiluted: col('DilutedAverageShares'),
  };
}

function stockSections(qs, ts, q) {
  const p = qs.price || {}, a = qs.assetProfile || {}, d = qs.summaryDetail || {}, f = qs.financialData || {}, k = qs.defaultKeyStatistics || {};
  const price = n(p.regularMarketPrice) ?? n(f.currentPrice);
  // Reported trailing-12-month FCF (operating cash flow - capex). Yahoo's financialData.freeCashflow
  // is a different "levered" estimate that can be far lower, so it is reported separately.
  const fcfTTM = ts?.trailingFreeCashFlow?.at(-1) || null;
  const profile = qs.assetProfile ? {
    description: a.longBusinessSummary || null, sector: a.sectorDisp || a.sector || null, industry: a.industryDisp || a.industry || null,
    employees: n(a.fullTimeEmployees), website: a.website || null,
    hq: [a.city, a.state, a.country].filter(Boolean).join(', ') || null,
    officers: (a.companyOfficers || []).slice(0, 5).map(o => ({ name: o.name, title: o.title })),
  } : null;
  const keyStats = {
    marketCap: n(p.marketCap) ?? n(d.marketCap), enterpriseValue: n(k.enterpriseValue), sharesOutstanding: n(k.sharesOutstanding), floatShares: n(k.floatShares),
    beta: n(k.beta) ?? n(d.beta), high52: n(d.fiftyTwoWeekHigh), low52: n(d.fiftyTwoWeekLow), avgVolume3m: n(d.averageVolume),
    shortPctFloat: pct(k.shortPercentOfFloat), allTimeHigh: n(d.allTimeHigh) ?? null,
  };
  const valuation = {
    trailingPE: rnd(d.trailingPE), forwardPE: rnd(d.forwardPE ?? k.forwardPE), pegRatio: rnd(k.pegRatio ?? k.trailingPegRatio),
    priceToSales: rnd(d.priceToSalesTrailing12Months), priceToBook: n(k.priceToBook) >= 0.1 && n(k.priceToBook) <= 500 ? rnd(k.priceToBook) : null,
    evToRevenue: rnd(k.enterpriseToRevenue), evToEbitda: rnd(k.enterpriseToEbitda),
    earningsYieldPct: isNum(n(k.trailingEps)) && price ? round(n(k.trailingEps) / price * 100, 2) : null,
    fcfYieldPct: fcfTTM && keyStats.marketCap && (!f.financialCurrency || f.financialCurrency === p.currency) ? round(fcfTTM.value / keyStats.marketCap * 100, 2) : null,
    fcfYieldNote: 'reported trailing-12-month free cash flow / market cap; not meaningful for banks and insurers',
  };
  const profitability = qs.financialData ? {
    grossMarginPct: n(f.grossMargins) === 0 ? null : pct(f.grossMargins), operatingMarginPct: pct(f.operatingMargins), profitMarginPct: pct(f.profitMargins), ebitdaMarginPct: pct(f.ebitdaMargins),
    roePct: pct(f.returnOnEquity), roaPct: pct(f.returnOnAssets), revenueGrowthPct: pct(f.revenueGrowth), earningsGrowthPct: pct(f.earningsGrowth),
    note: 'Margins and returns are trailing 12 months; growth is the most recent quarter vs the same quarter a year earlier.',
  } : null;
  const balanceSheet = qs.financialData ? {
    totalCash: n(f.totalCash), totalDebt: n(f.totalDebt), netDebt: isNum(n(f.totalDebt)) && isNum(n(f.totalCash)) ? n(f.totalDebt) - n(f.totalCash) : null,
    debtToEquity: n(f.debtToEquity) != null ? round(n(f.debtToEquity) / 100, 3) : null,
    currentRatio: rnd(f.currentRatio), quickRatio: rnd(f.quickRatio),
    operatingCashflow: n(f.operatingCashflow), freeCashflowTTM: fcfTTM?.value ?? null, freeCashflowTTMDate: fcfTTM?.date ?? null,
    leveredFreeCashflow: n(f.freeCashflow), totalRevenue: n(f.totalRevenue), ebitda: n(f.ebitda),
    currency: f.financialCurrency || null,
  } : null;
  const trend = (qs.recommendationTrend?.trend || []).map(t => ({ period: t.period, strongBuy: t.strongBuy, buy: t.buy, hold: t.hold, sell: t.sell, strongSell: t.strongSell }));
  const analyst = qs.financialData ? {
    recommendationMean: rnd(f.recommendationMean), recommendationKey: f.recommendationKey || null, averageAnalystRating: q?.averageAnalystRating || null,
    analysts: n(f.numberOfAnalystOpinions),
    targetLow: n(f.targetLowPrice), targetMean: rnd(f.targetMeanPrice), targetMedian: n(f.targetMedianPrice), targetHigh: n(f.targetHighPrice),
    upsidePct: n(f.targetMeanPrice) && price ? round((n(f.targetMeanPrice) / price - 1) * 100, 1) : null,
    trend, trendNote: 'period 0m = this month, -1m = last month, ...',
  } : null;
  const ce = qs.calendarEvents || {};
  const ed = (ce.earnings?.earningsDate || []).map(n).filter(Boolean);
  const earnings = {
    history: (qs.earningsHistory?.history || []).map(h => ({
      quarter: isoDate(h.quarter), period: h.period, epsEstimate: rnd(h.epsEstimate, 4), epsActual: rnd(h.epsActual, 4), surprisePct: pct(h.surprisePercent),
    })).sort((x, y) => (x.quarter < y.quarter ? -1 : 1)),
    next: ed.length ? {
      date: isoDate(ed[0]), dateEnd: ed[1] ? isoDate(ed[1]) : null, estimated: !!ce.earnings?.isEarningsDateEstimate,
      epsAvg: rnd(ce.earnings?.earningsAverage, 4), epsLow: rnd(ce.earnings?.earningsLow, 4), epsHigh: rnd(ce.earnings?.earningsHigh, 4),
      revenueAvg: n(ce.earnings?.revenueAverage), revenueLow: n(ce.earnings?.revenueLow), revenueHigh: n(ce.earnings?.revenueHigh),
    } : null,
    estimates: (qs.earningsTrend?.trend || []).filter(t => /^[0+-]?\d+[qy]$/.test(t.period || '')).map(t => ({
      period: t.period, endDate: t.endDate || null, epsAvg: rnd(t.earningsEstimate?.avg, 4), epsLow: rnd(t.earningsEstimate?.low, 4), epsHigh: rnd(t.earningsEstimate?.high, 4),
      epsYearAgo: rnd(t.earningsEstimate?.yearAgoEps, 4), epsGrowthPct: pct(t.earningsEstimate?.growth ?? t.growth), analysts: n(t.earningsEstimate?.numberOfAnalysts),
      revenueAvg: n(t.revenueEstimate?.avg), revenueGrowthPct: pct(t.revenueEstimate?.growth),
    })),
  };
  const dividends = {
    rate: n(d.dividendRate), yieldPct: pct(d.dividendYield), trailingRate: n(d.trailingAnnualDividendRate), trailingYieldPct: pct(d.trailingAnnualDividendYield),
    payoutRatioPct: pct(d.payoutRatio), fiveYearAvgYieldPct: n(d.fiveYearAvgDividendYield),
    exDate: isoDate(ce.exDividendDate ?? d.exDividendDate), payDate: isoDate(ce.dividendDate),
  };
  if (Object.values(dividends).every(v => v == null || v === 0)) Object.keys(dividends).forEach(x => { if (dividends[x] === 0) dividends[x] = null; });
  const m = qs.majorHoldersBreakdown;
  const ownership = m ? { insidersPct: pct(m.insidersPercentHeld), institutionsPct: pct(m.institutionsPercentHeld), institutionsFloatPct: pct(m.institutionsFloatPercentHeld), institutionsCount: n(m.institutionsCount) } : null;
  const financials = ts ? { annual: alignFinancials(ts, 'annual'), quarterly: alignFinancials(ts, 'quarterly'), currency: f.financialCurrency || null,
    note: 'Fiscal periods by period-end date. eps = diluted EPS. freeCashFlow = Yahoo FreeCashFlow line, else operating cash flow + capex. Yahoo provides ~4 fiscal years and ~5 quarters.' } : null;
  return { profile, keyStats, valuation, profitability, balanceSheet, financials, analyst, earnings, dividends, ownership };
}

function fundSections(qs) {
  const fp = qs.fundProfile || {}, th = qs.topHoldings || {}, perf = qs.fundPerformance || {}, d = qs.summaryDetail || {}, k = qs.defaultKeyStatistics || {};
  const er = n(fp.feesExpensesInvestment?.annualReportExpenseRatio);
  const tr = perf.trailingReturns || {};
  return {
    fund: {
      family: fp.family || k.fundFamily || null, category: fp.categoryName || k.category || null, legalType: fp.legalType || k.legalType || null,
      expenseRatioPct: er != null ? round(er * 100, 3) : null,
      aum: n(d.totalAssets) ?? n(k.totalAssets), yieldPct: pct(d.yield ?? k.yield), trailingPE: rnd(d.trailingPE),
      inceptionDate: isoDate(k.fundInceptionDate), turnoverPct: pct(fp.feesExpensesInvestment?.annualHoldingsTurnover), beta3y: rnd(k.beta3Year),
      description: qs.assetProfile?.longBusinessSummary || null,
    },
    holdings: qs.topHoldings ? {
      top: (th.holdings || []).map(h => ({ s: h.symbol || null, n: h.holdingName, weightPct: pct(h.holdingPercent) })),
      sectorWeights: (th.sectorWeightings || []).flatMap(o => Object.entries(o).map(([sector, w]) => ({ sector, weightPct: pct(w) }))).filter(x => x.weightPct != null),
      assetAllocation: { stockPct: pct(th.stockPosition), bondPct: pct(th.bondPosition), cashPct: pct(th.cashPosition), otherPct: pct(th.otherPosition), preferredPct: pct(th.preferredPosition), convertiblePct: pct(th.convertiblePosition) },
      // Yahoo's equityHoldings ratios are reciprocals mislabelled as priceTo* (VOO "P/E" 0.043) and its
      // bondHoldings duration/maturity are implausible (TLT duration 3.6 years), so neither is passed on.
      // Use fund.trailingPE for the fund P/E.
    } : null,
    performance: qs.fundPerformance ? {
      note: 'As reported by Yahoo (fund performance module; annualized for 3y+). Yahoo\'s own fields are sometimes inconsistent - /api/etfs computes returns from adjusted closes instead.',
      asOf: isoDate(tr.asOfDate),
      trailingPct: { ytd: pct(tr.ytd), m1: pct(tr.oneMonth), m3: pct(tr.threeMonth), y1: pct(tr.oneYear), y3: pct(tr.threeYear), y5: pct(tr.fiveYear), y10: pct(tr.tenYear) },
      annual: (perf.annualTotalReturns?.returns || []).map(x => ({ year: x.year, returnPct: pct(x.annualValue) })).filter(x => x.returnPct != null),
    } : null,
  };
}

/** Peers from the S&P 500 universe: same GICS sub-industry, nearest by market cap; topped up from the sector. */
export function pickPeers(sym, universe, quotes, max = 8) {
  const me = universe.find(u => u.ys === sym || u.s === sym);
  if (!me) return null;
  const myCap = quotes.get(me.ys)?.marketCap;
  const byDist = list => list.map(u => ({ u, mc: quotes.get(u.ys)?.marketCap }))
    .filter(x => x.mc && x.u.ys !== me.ys && companyKey(x.u.n) !== companyKey(me.n))
    .sort((a, b) => Math.abs(Math.log(a.mc / myCap)) - Math.abs(Math.log(b.mc / myCap)));
  const same = byDist(universe.filter(u => u.ind === me.ind)).map(x => ({ ...x, same: true }));
  const peers = same.slice(0, max);
  if (peers.length < 4) peers.push(...byDist(universe.filter(u => u.sec === me.sec && u.ind !== me.ind)).slice(0, max - peers.length).map(x => ({ ...x, same: false })));
  return { me, peers };
}

export function createCompany({ getState, getEnrichment }) {
  async function build(sym) {
    let qs = await yahoo.quoteSummary(sym, [...STOCK_MODULES, ...FUND_MODULES], { interactive: true });
    if (!qs) throw Object.assign(new Error('symbol not found'), { status: 404 });
    qs = plain(qs);
    const type = qs.quoteType?.quoteType || qs.price?.quoteType || null;
    const isFund = type === 'ETF' || type === 'MUTUALFUND';
    let ts = null, tsErr = null;
    if (!isFund && type === 'EQUITY') {
      try { ts = await yahoo.timeseries(sym, TS_TYPES, 1262304000, { interactive: true }); } catch (err) { tsErr = err.message; }
    }
    const p = qs.price || {};
    return {
      fetchedAt: Date.now(), tsErr,
      identity: {
        symbol: sym, name: p.longName || p.shortName || qs.quoteType?.longName || sym, type, exchange: p.exchangeName || null, currency: p.currency || null,
      },
      quoteFallback: { price: n(p.regularMarketPrice), changePct: pct(p.regularMarketChangePercent), marketCap: n(p.marketCap), time: n(p.regularMarketTime), marketState: p.marketState || null },
      sections: isFund ? fundSections(qs) : type === 'EQUITY' ? stockSections(qs, ts, null) : {},
    };
  }

  async function get(sym) {
    const res = await cached(`company-${sym}`, TTL, () => build(sym));
    trimMemory('company-', 150);
    const d = res.data;
    if (!d) return null;
    const { universe, quotes, hist } = getState();
    const lq = quotes.get(sym);
    const live = lq ? { price: n(lq.regularMarketPrice), changePct: rnd(lq.regularMarketChangePercent), marketCap: n(lq.marketCap), time: n(lq.regularMarketTime), marketState: lq.marketState || null, averageAnalystRating: lq.averageAnalystRating || null } : { ...d.quoteFallback, cached: true };
    const out = {
      identity: d.identity,
      meta: meta({ ok: !res.stale, stale: res.stale, error: res.error, fetchedAt: res.t, source: 'Yahoo quoteSummary v10' + (d.identity.type === 'EQUITY' ? ' + fundamentals-timeseries' : ''), asOf: new Date(res.t).toISOString(), note: 'Cached 6 hours; quote block is live when the server tracks the symbol.' }),
      quote: { ...live, live: !!lq },
      ...d.sections,
    };
    if (d.tsErr && out.financials == null) out.financialsError = d.tsErr;
    if (out.analyst && live.averageAnalystRating) out.analyst.averageAnalystRating = live.averageAnalystRating;
    if (d.identity.type === 'EQUITY') {
      const pk = pickPeers(sym, universe, quotes);
      if (pk) {
        const row = (u, same) => {
          const q = quotes.get(u.ys) || {};
          const e = getEnrichment(u.ys);
          const h = hist.get(u.ys);
          const y1 = h && h.c.length && n(q.regularMarketPrice) ? round((q.regularMarketPrice / h.c[0] - 1) * 100, 1) : null;
          return {
            s: u.s, ys: u.ys, n: u.n, sameSubIndustry: same, subIndustry: u.ind, price: n(q.regularMarketPrice), marketCap: n(q.marketCap),
            pe: rnd(q.trailingPE), fpe: rnd(q.forwardPE), pb: n(q.priceToBook) >= 0.1 && n(q.priceToBook) <= 500 ? rnd(q.priceToBook) : null,
            priceToSales: e ? rnd(e.priceToSales) : null, evToEbitda: e ? rnd(e.enterpriseToEbitda) : null,
            divYieldPct: n(q.trailingAnnualDividendYield) != null ? round(q.trailingAnnualDividendYield * 100, 2) : null,
            grossMarginPct: e && e.grossMargins !== 0 ? pct(e.grossMargins) : null,
            operatingMarginPct: e ? pct(e.operatingMargins) : null, revenueGrowthPct: e ? pct(e.revenueGrowth) : null, roePct: e ? pct(e.returnOnEquity) : null,
            perf1yPct: y1,
          };
        };
        out.peers = { note: 'S&P 500 members in the same GICS sub-industry, nearest by market cap (topped up from the same sector if fewer than 4). priceToSales / evToEbitda / margins need the background crawl.', subject: row(pk.me, true), list: pk.peers.map(x => row(x.u, x.same)) };
      } else out.peers = null;
    }
    return out;
  }
  return { get };
}
