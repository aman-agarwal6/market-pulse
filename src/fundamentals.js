// /api/fundamentals: one screener row per S&P 500 member.
//  - v7 quote fields the server already holds (refreshed every 15-45 s)
//  - 1-year daily history already held (momentum, volatility, beta)
//  - quoteSummary enrichment (margins, ROE, growth, leverage, FCF, analyst
//    targets) from a gentle background crawl: through the background gate
//    (<= 2 in flight, spaced, global back-off on 429), one symbol at a time,
//    saved to disk every 20 symbols, entries reused for 24 h, resumable.
import * as yahoo from './yahoo.js';
import { perfFor } from './engine.js';
import { factorRanks } from './factors.js';
import { readDisk, writeDisk, report } from './store.js';
import { n, pct, r as rnd, isoDate } from './normalize.js';
import { round, isNum, stdev, beta, periodReturns } from './stats.js';

const H = 3600000;
const CRAWL_KEY = 'fundamentals-crawl';
const CRAWL_MAX_AGE = 24 * H;
const CRAWL_VERSION = 3; // bump when extractEnrichment() gains fields so old entries are refetched
const BUILD_TTL = 15 * 60000;
const MODULES = ['financialData', 'defaultKeyStatistics', 'summaryDetail'];
const sleep = ms => new Promise(res => setTimeout(res, ms));

/** quoteSummary -> compact enrichment record (fractions kept as fractions). */
export function extractEnrichment(qs) {
  const f = qs?.financialData || {}, k = qs?.defaultKeyStatistics || {}, d = qs?.summaryDetail || {};
  return {
    // Yahoo reports gross margin as exactly 0 for banks/insurers (no "gross profit" line): treat as missing.
    grossMargins: n(f.grossMargins) === 0 ? null : n(f.grossMargins), operatingMargins: n(f.operatingMargins), profitMargins: n(f.profitMargins), ebitdaMargins: n(f.ebitdaMargins),
    returnOnEquity: n(f.returnOnEquity), returnOnAssets: n(f.returnOnAssets),
    revenueGrowth: n(f.revenueGrowth), earningsGrowth: n(f.earningsGrowth),
    // Yahoo reports debt/equity in percent (84.3 = 0.843x).
    debtToEquity: n(f.debtToEquity) != null ? n(f.debtToEquity) / 100 : null,
    totalDebt: n(f.totalDebt), totalCash: n(f.totalCash), totalRevenue: n(f.totalRevenue), ebitda: n(f.ebitda),
    // financialData.freeCashflow is Yahoo's "levered" FCF estimate (after interest and other
    // adjustments) and can be far below reported FCF (MSFT 3.0B vs 60.0B). Kept under its own
    // name; FCF yield uses the reported trailing FCF from fundamentals-timeseries instead.
    leveredFreeCashflow: n(f.freeCashflow), operatingCashflow: n(f.operatingCashflow),
    currentRatio: n(f.currentRatio), quickRatio: n(f.quickRatio),
    targetMeanPrice: n(f.targetMeanPrice), targetLowPrice: n(f.targetLowPrice), targetHighPrice: n(f.targetHighPrice), targetMedianPrice: n(f.targetMedianPrice),
    numberOfAnalystOpinions: n(f.numberOfAnalystOpinions), recommendationMean: n(f.recommendationMean), recommendationKey: f.recommendationKey || null,
    financialCurrency: f.financialCurrency || null,
    beta: n(k.beta) ?? n(d.beta), enterpriseValue: n(k.enterpriseValue), enterpriseToEbitda: n(k.enterpriseToEbitda), enterpriseToRevenue: n(k.enterpriseToRevenue),
    pegRatio: n(k.pegRatio) ?? n(k.trailingPegRatio), shortPercentOfFloat: n(k.shortPercentOfFloat), heldPercentInstitutions: n(k.heldPercentInstitutions), heldPercentInsiders: n(k.heldPercentInsiders),
    payoutRatio: n(d.payoutRatio), priceToSales: n(d.priceToSalesTrailing12Months), fiveYearAvgDividendYield: n(d.fiveYearAvgDividendYield),
    lastFiscalYearEnd: n(k.lastFiscalYearEnd), nextFiscalYearEnd: n(k.nextFiscalYearEnd), mostRecentQuarter: n(k.mostRecentQuarter),
  };
}

const dayKey = t => new Date(t * 1000).toISOString().slice(0, 10);

/** Momentum / volatility / beta from 1-year daily closes. Pure. */
export function riskStats(h, mkt) {
  if (!h || h.c.length < 130) return { r12_1Pct: null, r6_1Pct: null, vol1yPct: null, beta1y: null };
  const c = h.c, L = c.length;
  const r12_1 = c[L - 22] / c[0] - 1;
  const r6_1 = L >= 127 ? c[L - 22] / c[L - 127] - 1 : null;
  const rets = periodReturns(c);
  const vol = stdev(rets) * Math.sqrt(252);
  let b = null;
  if (mkt && mkt.c.length > 130) {
    const mm = new Map(mkt.t.map((t, i) => [dayKey(t), mkt.c[i]]));
    const a = [], m = [];
    for (let i = 1; i < L; i++) {
      const m0 = mm.get(dayKey(h.t[i - 1])), m1 = mm.get(dayKey(h.t[i]));
      if (m0 && m1) { a.push(c[i] / c[i - 1] - 1); m.push(m1 / m0 - 1); }
    }
    b = beta(a, m);
  }
  return { r12_1Pct: round(r12_1 * 100, 2), r6_1Pct: r6_1 == null ? null : round(r6_1 * 100, 2), vol1yPct: round(vol * 100, 2), beta1y: round(b, 3) };
}

/** Numeric score from Yahoo's averageAnalystRating string ("2.2 - Buy" -> 2.2; 1 = strong buy, 5 = strong sell). */
export const ratingScore = s => { const m = /^\s*([\d.]+)/.exec(s || ''); return m ? +m[1] : null; };

/** Build one screener row. Pure given its inputs. */
export function buildRow(u, q, hist, mkt, e, nowSec) {
  const price = n(q.regularMarketPrice);
  const mc = n(q.marketCap);
  const eps = n(q.epsTrailingTwelveMonths), epsF = n(q.epsForward);
  const sameCcy = !q.financialCurrency || q.financialCurrency === q.currency;
  const h52 = n(q.fiftyTwoWeekHigh), l52 = n(q.fiftyTwoWeekLow);
  const ma50 = n(q.fiftyDayAverage), ma200 = n(q.twoHundredDayAverage);
  const av = n(q.averageDailyVolume3Month);
  const fpe = n(q.forwardPE);
  const epsFwdGrowth = sameCcy && eps > 0 && isNum(epsF) ? (epsF / eps - 1) * 100 : null;
  const nexts = [n(q.earningsTimestamp), n(q.earningsTimestampStart)].filter(t => t && t > nowSec - 6 * 3600).sort((a, b) => a - b);
  const perf = perfFor(u.ys, q, hist);
  const risk = riskStats(hist.get(u.ys), mkt);
  // FCF yield = reported ttm free cash flow / market cap. Not meaningful for banks and
  // insurers (deposits and float flow through operating cash flow), so null for Financials.
  const fcfYield = e && isNum(e.fcfTTM) && mc && u.sec !== 'Financials' && (!e.financialCurrency || e.financialCurrency === q.currency) ? e.fcfTTM / mc * 100 : null;
  return {
    s: u.s, ys: u.ys, n: u.n, sec: u.sec, ind: u.ind,
    price, chgPct: rnd(q.regularMarketChangePercent), marketCap: mc, currency: q.currency || null,
    perf: { d: rnd(q.regularMarketChangePercent), w: perf.w, m: perf.m, q: perf.q, ytd: perf.ytd, y: perf.y },
    high52: h52, low52: l52, pos52Pct: h52 && l52 && h52 > l52 && price ? round((price - l52) / (h52 - l52) * 100, 1) : null,
    vsMa50Pct: ma50 && price ? round((price / ma50 - 1) * 100, 2) : null,
    vsMa200Pct: ma200 && price ? round((price / ma200 - 1) * 100, 2) : null,
    relVolume: av && n(q.regularMarketVolume) != null ? round(q.regularMarketVolume / av, 2) : null,
    pe: rnd(q.trailingPE), fpe: rnd(fpe),
    peg: fpe > 0 && epsFwdGrowth > 0 ? round(fpe / epsFwdGrowth, 2) : null,
    pb: n(q.priceToBook) >= 0.1 && n(q.priceToBook) <= 500 ? rnd(q.priceToBook) : null,
    eps, epsFwd: epsF, epsFwdGrowthPct: round(epsFwdGrowth, 1),
    earningsYieldPct: sameCcy && isNum(eps) && price ? round(eps / price * 100, 2) : null,
    fwdEarningsYieldPct: sameCcy && isNum(epsF) && price ? round(epsF / price * 100, 2) : null,
    divYieldPct: n(q.trailingAnnualDividendYield) != null ? round(q.trailingAnnualDividendYield * 100, 2) : null,
    fwdDivYieldPct: rnd(q.dividendYield),
    rating: q.averageAnalystRating || null, ratingScore: ratingScore(q.averageAnalystRating),
    nextEarnings: nexts.length ? isoDate(nexts[0]) : null,
    nextEarningsEstimated: nexts.length ? !!q.isEarningsDateEstimate && nexts[0] === n(q.earningsTimestampStart) : null,
    ...risk,
    // quoteSummary enrichment (null until crawled)
    grossMarginPct: e && e.grossMargins !== 0 ? pct(e.grossMargins) : null, // 0 = "not applicable" (banks) in Yahoo data
    operatingMarginPct: e ? pct(e.operatingMargins) : null,
    profitMarginPct: e ? pct(e.profitMargins) : null,
    roePct: e ? pct(e.returnOnEquity) : null,
    roaPct: e ? pct(e.returnOnAssets) : null,
    revenueGrowthPct: e ? pct(e.revenueGrowth) : null,
    earningsGrowthPct: e ? pct(e.earningsGrowth) : null,
    debtToEquity: e ? rnd(e.debtToEquity, 3) : null,
    freeCashflowTTM: e?.fcfTTM ?? null, freeCashflowTTMDate: e?.fcfTTMDate ?? null,
    leveredFreeCashflow: e?.leveredFreeCashflow ?? null,
    fcfYieldPct: round(fcfYield, 2),
    betaYahoo: e ? rnd(e.beta, 3) : null,
    evToEbitda: e ? rnd(e.enterpriseToEbitda) : null,
    priceToSales: e ? rnd(e.priceToSales) : null,
    payoutRatioPct: e ? pct(e.payoutRatio) : null,
    targetMean: e?.targetMeanPrice ?? null, targetLow: e?.targetLowPrice ?? null, targetHigh: e?.targetHighPrice ?? null,
    upsidePct: e?.targetMeanPrice && price ? round((e.targetMeanPrice / price - 1) * 100, 1) : null,
    analysts: e?.numberOfAnalystOpinions ?? null,
    enrichedAt: e?.fetchedAt ? new Date(e.fetchedAt).toISOString() : null,
  };
}

export function createFundamentals({ getState }) {
  let crawl = new Map(); // ys -> enrichment + fetchedAt
  let loaded = false;
  const cs = { running: false, startedAt: null, finishedAt: null, done: 0, total: 0, failures: 0, consecutiveFailures: 0, lastError: null, nextRun: null };
  let built = null;

  async function loadCrawl() {
    if (loaded) return;
    loaded = true;
    const d = await readDisk(CRAWL_KEY);
    if (d?.data) crawl = new Map(Object.entries(d.data));
  }
  const saveCrawl = () => writeDisk(CRAWL_KEY, Object.fromEntries(crawl)).catch(err => console.warn('[fundamentals] save failed', err.message));

  function publishStatus() {
    const fresh = [...crawl.values()].filter(e => Date.now() - e.fetchedAt < CRAWL_MAX_AGE).length;
    report('fundamentals:crawl', {
      source: 'Yahoo quoteSummary v10 (financialData, defaultKeyStatistics, summaryDetail)',
      ok: cs.consecutiveFailures < 5, error: cs.lastError, asOf: cs.finishedAt ? new Date(cs.finishedAt).toISOString() : null,
      fetchedAt: cs.finishedAt, nextRefresh: cs.nextRun, coverage: crawl.size, fresh, ...cs,
    });
  }

  /** One crawl pass over members with missing/stale entries. */
  async function runCrawl() {
    if (cs.running) return;
    await loadCrawl();
    const { universe } = getState();
    const stale = e => !e || e.v !== CRAWL_VERSION || Date.now() - e.fetchedAt > CRAWL_MAX_AGE;
    const todo = universe.map(u => u.ys).filter(ys => stale(crawl.get(ys)));
    Object.assign(cs, { running: true, startedAt: Date.now(), done: 0, total: todo.length, failures: 0, consecutiveFailures: 0, lastError: null });
    publishStatus();
    try {
      for (let i = 0; i < todo.length; i++) {
        const ys = todo[i];
        try {
          const qs = await yahoo.quoteSummary(ys, MODULES);
          if (qs) {
            const rec = { ...extractEnrichment(qs), fetchedAt: Date.now(), v: CRAWL_VERSION };
            // Reported trailing-12-month free cash flow (operating cash flow - capex).
            try {
              const ts = await yahoo.timeseries(ys, ['trailingFreeCashFlow'], Math.floor(Date.now() / 1000) - 2 * 365 * 86400);
              const last = ts.trailingFreeCashFlow?.at(-1);
              if (last) { rec.fcfTTM = last.value; rec.fcfTTMDate = last.date; }
            } catch { /* keep the record without reported FCF */ }
            crawl.set(ys, rec); cs.consecutiveFailures = 0;
          } else { cs.failures++; }
        } catch (err) {
          cs.failures++; cs.consecutiveFailures++; cs.lastError = err.message;
          if (cs.consecutiveFailures >= 5) {
            // Something is wrong (throttling, auth): save progress and stop; the next pass resumes.
            console.warn('[fundamentals] crawl paused after 5 consecutive failures:', err.message);
            break;
          }
        }
        cs.done = i + 1;
        if ((i + 1) % 20 === 0) { await saveCrawl(); publishStatus(); await sleep(1500); }
      }
    } finally {
      await saveCrawl();
      cs.running = false; cs.finishedAt = Date.now();
      built = null;
      publishStatus();
    }
  }

  /** Background schedule: first pass after `delayMs`, then re-check every 6 h (30 min after a failed pass). */
  function schedule(delayMs) {
    const next = ms => { cs.nextRun = Date.now() + ms; publishStatus(); setTimeout(tick, ms); };
    const tick = async () => {
      try { await runCrawl(); } catch (err) { cs.lastError = err.message; }
      next(cs.consecutiveFailures >= 5 ? 30 * 60000 : 6 * H);
    };
    loadCrawl().then(publishStatus);
    next(delayMs);
  }

  async function get() {
    await loadCrawl();
    if (built && Date.now() - built.t < BUILD_TTL) return built.data;
    const { universe, quotes, hist, status } = getState();
    const mkt = hist.get('^GSPC');
    const nowSec = Math.floor(Date.now() / 1000);
    const rows = [];
    for (const u of universe) {
      const q = quotes.get(u.ys);
      if (!q || !isNum(q.regularMarketPrice)) continue;
      rows.push(buildRow(u, q, hist, mkt, crawl.get(u.ys) || null, nowSec));
    }
    const ranks = factorRanks(rows);
    rows.forEach((r, i) => { r.factors = ranks[i]; });
    const enriched = rows.filter(r => r.enrichedAt).length;
    const data = {
      generatedAt: new Date().toISOString(),
      meta: {
        quotes: { ok: !!status.quotes, source: 'Yahoo v7 quote (live, refreshed by the server every 15-45 s)', asOf: status.quotes ? new Date(status.quotes).toISOString() : null },
        history: { ok: !!status.history, source: 'Yahoo 1-year daily closes (momentum, volatility, beta)', asOf: status.history ? new Date(status.history).toISOString() : null },
        enrichment: { ok: enriched > 0, source: 'Yahoo quoteSummary v10 background crawl (24 h cache)', coverage: enriched, of: rows.length, crawling: cs.running, crawlProgress: cs.running ? `${cs.done}/${cs.total}` : null, lastError: cs.lastError },
      },
      notes: {
        rebuild: 'Rows are rebuilt at most every 15 minutes; price fields are as of that build.',
        pe: 'pe/fpe are Yahoo trailingPE/forwardPE (pe is missing for loss-makers). earningsYieldPct = ttm EPS / price (negative for loss-makers).',
        peg: 'peg = forward P/E / implied next-FY EPS growth % (epsForward / ttm EPS - 1); only when both are positive.',
        perf: 'perf.d/w/m/q/ytd/y in %, from the 1-year daily history and the live price.',
        pos52Pct: '(price - 52w low) / (52w high - 52w low) x 100.',
        relVolume: "today's volume / 3-month average daily volume.",
        risk: 'vol1yPct = stdev of daily returns x sqrt(252); beta1y = OLS slope of daily returns on the S&P 500 (^GSPC), both over the 1-year history. r12_1Pct = first close of the 1-year history to the close 21 trading days ago; r6_1Pct = 126 to 21 trading days ago.',
        enrichment: 'grossMarginPct ... analysts come from quoteSummary (ttm margins, most-recent-quarter y/y growth, debtToEquity as a ratio). fcfYieldPct = reported trailing-12-month free cash flow (operating cash flow - capex, fundamentals-timeseries) / market cap; null for Financials. leveredFreeCashflow is Yahoo\'s separate "levered FCF" estimate, often much lower.',
        factors: 'factors.index / factors.sector: 0-100 percentile scores (100 = most value / quality / growth / momentum / low volatility). See src/factors.js for the exact inputs.',
        marketCap: 'Yahoo market cap. For dual-class companies (GOOGL/GOOG, FOXA/FOX, NWSA/NWS) each class row shows the WHOLE company cap.',
      },
      count: rows.length,
      rows,
    };
    built = { t: Date.now(), data };
    return data;
  }

  return { get, schedule, runCrawl, enrichment: ys => crawl.get(ys) || null, crawlStatus: () => ({ ...cs, coverage: crawl.size }) };
}
