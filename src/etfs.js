// /api/etfs: curated core ETFs with costs, size, yield and risk/return
// computed from Yahoo dividend-adjusted daily closes, plus a correlation
// matrix of monthly total returns.
import * as yahoo from './yahoo.js';
import { ETFS } from './config.js';
import { cached, meta, reportResult, reportError } from './store.js';
import { plain, n, pct, r as rnd, isoDate } from './normalize.js';
import {
  round, isNum, cagr, addYears, indexOnOrBefore, lastPerPeriod, monthKey, periodReturns, annualizedVol, maxDrawdown, correlation,
} from './stats.js';

const H = 3600000;
const EQUITY_ROLES = new Set(['US total market', 'US large cap', 'US growth', 'US value / dividend', 'US small cap', 'International (all ex-US)', 'International developed', 'Emerging markets', 'All-in-one']);

/** Yahoo history -> { dates, close, adj } by exchange-local date. */
export function toDailyAdj(h) {
  const off = h.meta?.gmtoffset ?? -18000;
  const dates = [], close = [], adj = [];
  for (let i = 0; i < h.t.length; i++) {
    const d = new Date((h.t[i] + off) * 1000).toISOString().slice(0, 10);
    if (dates.length && dates[dates.length - 1] === d) { close[close.length - 1] = h.c[i]; adj[adj.length - 1] = h.adj[i]; continue; }
    dates.push(d); close.push(h.c[i]); adj.push(h.adj[i]);
  }
  return { dates, close, adj };
}

/** Fold a live price into a daily series; the adjusted close moves by the same ratio. Pure. */
export function foldLiveAdj(s, price, dateET) {
  if (!isNum(price) || !dateET || !s.dates.length) return s;
  const L = s.dates.length - 1;
  const dates = s.dates.slice(), close = s.close.slice(), adj = s.adj.slice();
  if (dateET === dates[L]) { adj[L] = adj[L] * price / close[L]; close[L] = price; }
  else if (dateET > dates[L]) { dates.push(dateET); adj.push(adj[L] * price / close[L]); close.push(price); }
  return { dates, close, adj };
}

/** Annualized trailing total return over `years` (null if history is shorter). */
export function annualizedTrailing(dates, adj, years) {
  const L = adj.length - 1;
  const j = indexOnOrBefore(dates, addYears(dates[L], -years));
  if (j < 0) return null;
  return cagr(adj[j], adj[L], years);
}

/** Risk/return stats for one fund from daily adjusted closes. Pure. */
export function fundStats(s) {
  const { dates, close, adj } = s;
  const L = adj.length - 1;
  const ret = y => { const v = annualizedTrailing(dates, adj, y); return v == null ? null : round(v * 100, 2); };
  const me = lastPerPeriod(dates, adj, monthKey);
  const mret = periodReturns(me.values);
  const vol = months => (mret.length >= months ? round(annualizedVol(mret.slice(-months), 12) * 100, 2) : null);
  const i10 = Math.max(0, indexOnOrBefore(dates, addYears(dates[L], -10)));
  const dd10 = maxDrawdown(adj.slice(i10));
  const ddAll = maxDrawdown(adj);
  let ath = 0;
  for (let i = 1; i <= L; i++) if (close[i] >= close[ath]) ath = i;
  let athTR = 0;
  for (let i = 1; i <= L; i++) if (adj[i] >= adj[athTR]) athTR = i;
  return {
    firstDate: dates[0], lastDate: dates[L], years: round((Date.parse(dates[L]) - Date.parse(dates[0])) / (365.25 * 864e5), 1),
    totalReturnAnnualizedPct: { y1: ret(1), y3: ret(3), y5: ret(5), y10: ret(10) },
    sinceInceptionAnnualizedPct: round(cagr(adj[0], adj[L], (Date.parse(dates[L]) - Date.parse(dates[0])) / (365.25 * 864e5)) * 100, 2),
    volatilityPct: { y3: vol(36), y10: vol(120) },
    maxDrawdown10y: { pct: round(dd10.depth * 100, 2), peak: dates[i10 + dd10.peak], trough: dates[i10 + dd10.trough], window: dates[i10] === dates[0] ? 'since inception (younger than 10 years)' : 'last 10 years' },
    maxDrawdownAll: { pct: round(ddAll.depth * 100, 2), peak: dates[ddAll.peak], trough: dates[ddAll.trough], window: 'since inception (Yahoo history start)' },
    fromHighPct: round((close[L] / close[ath] - 1) * 100, 2), highDate: dates[ath], high: round(close[ath], 2),
    fromHighTotalReturnPct: round((adj[L] / adj[athTR] - 1) * 100, 2),
  };
}

/** Monthly total-return series keyed 'YYYY-MM' for complete months only (current month dropped). */
export function monthlyReturns(s, currentMonth) {
  const me = lastPerPeriod(s.dates, s.adj, monthKey);
  const out = new Map();
  for (let i = 1; i < me.dates.length; i++) {
    const m = me.dates[i].slice(0, 7);
    if (m >= currentMonth) break;
    out.set(m, me.values[i] / me.values[i - 1] - 1);
  }
  return out;
}

/** Correlation matrix over the last `months` complete months. Pure. */
export function correlationMatrix(symbols, monthly, currentMonth, months, minOverlap) {
  const keys = [];
  const [cy, cm] = currentMonth.split('-').map(Number);
  for (let k = months; k >= 1; k--) {
    const d = new Date(Date.UTC(cy, cm - 1 - k, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  const vec = s => keys.map(k => monthly.get(s)?.get(k) ?? null);
  const vs = Object.fromEntries(symbols.map(s => [s, vec(s)]));
  const r = [], nn = [];
  for (const a of symbols) {
    const row = [], nrow = [];
    for (const b of symbols) {
      const c = correlation(vs[a], vs[b]);
      nrow.push(c.n);
      row.push(c.n >= minOverlap ? round(c.r, 2) : null);
    }
    r.push(row); nn.push(nrow);
  }
  return { months, from: keys[0], to: keys[keys.length - 1], minOverlapMonths: minOverlap, symbols, r, n: nn };
}

const nyDate = ts => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));

export function createETFs({ getQuote }) {
  let built = null, building = null;

  async function fundInfo(sym) {
    return cached(`etf-info-${sym}`, 24 * H, async () => {
      const qs = plain(await yahoo.quoteSummary(sym, ['fundProfile', 'summaryDetail', 'defaultKeyStatistics', 'price']));
      if (!qs) throw new Error(`${sym}: no quoteSummary`);
      const fp = qs.fundProfile || {}, d = qs.summaryDetail || {}, k = qs.defaultKeyStatistics || {};
      const er = n(fp.feesExpensesInvestment?.annualReportExpenseRatio);
      return {
        name: qs.price?.longName || qs.price?.shortName || sym, family: fp.family || k.fundFamily || null, category: fp.categoryName || k.category || null,
        expenseRatioPct: er != null ? round(er * 100, 3) : null, aum: n(d.totalAssets) ?? n(k.totalAssets), yieldPct: pct(d.yield ?? k.yield),
        trailingPE: rnd(d.trailingPE), inceptionDate: isoDate(k.fundInceptionDate),
      };
    });
  }
  async function fundHistory(sym) {
    return cached(`etf-hist-${sym}`, 12 * H, async () => {
      const h = await yahoo.history(sym, { range: 'max', interval: '1d' });
      if (!h || h.c.length < 200) throw new Error(`${sym}: short history`);
      return toDailyAdj(h);
    });
  }
  async function liveQuotes(syms) {
    const missing = syms.filter(s => !getQuote(s));
    if (!missing.length) return new Map();
    const res = await cached('etf-quotes', 5 * 60000, async () => Object.fromEntries([...(await yahoo.bgQuotes(missing))]), { disk: false });
    return new Map(Object.entries(res.data));
  }

  async function build() {
    const syms = ETFS.map(e => e.s);
    let extra = new Map();
    try { extra = await liveQuotes(syms); } catch (err) { reportError('etfs:quotes', err); }
    const curMonth = new Date().toISOString().slice(0, 7);
    const monthly = new Map();
    const funds = [];
    for (const e of ETFS) {
      const q = getQuote(e.s) || extra.get(e.s) || null;
      const [info, hist] = await Promise.all([
        fundInfo(e.s).catch(err => ({ error: err.message })),
        fundHistory(e.s).catch(err => ({ error: err.message })),
      ]);
      let stats = null;
      if (hist.data) {
        const s = q?.regularMarketTime ? foldLiveAdj(hist.data, q.regularMarketPrice, nyDate(q.regularMarketTime)) : hist.data;
        stats = fundStats(s);
        monthly.set(e.s, monthlyReturns(s, curMonth));
      }
      funds.push({
        s: e.s, role: e.role, label: e.label,
        quote: q ? { price: n(q.regularMarketPrice), changePct: rnd(q.regularMarketChangePercent), time: n(q.regularMarketTime) } : null,
        name: info.data?.name ?? e.label, family: info.data?.family ?? null, category: info.data?.category ?? null,
        expenseRatioPct: info.data?.expenseRatioPct ?? (q?.netExpenseRatio != null ? round(q.netExpenseRatio, 3) : null),
        aum: info.data?.aum ?? n(q?.netAssets), yieldPct: info.data?.yieldPct ?? null, inceptionDate: info.data?.inceptionDate ?? null,
        // Yahoo reports nonsense P/Es for bond, gold and crypto funds (e.g. SHY 3700), so equity funds only.
        trailingPE: EQUITY_ROLES.has(e.role) ? (info.data?.trailingPE ?? rnd(q?.trailingPE)) : null,
        stats,
        meta: {
          info: meta({ ok: !!info.data && !info.stale, stale: !!info.stale, error: info.error ?? null, fetchedAt: info.t, source: 'Yahoo quoteSummary (fundProfile, summaryDetail)' }),
          history: meta({ ok: !!hist.data && !hist.stale, stale: !!hist.stale, error: hist.error ?? null, fetchedAt: hist.t, source: 'Yahoo daily adjusted closes (range=max)', asOf: stats?.lastDate ?? null }),
        },
      });
    }
    const okHist = funds.filter(f => f.stats).length;
    reportResult('etfs', { t: Date.now(), stale: okHist < funds.length, error: okHist < funds.length ? `${funds.length - okHist} funds without history` : null }, { source: 'Yahoo', asOf: new Date().toISOString(), ttlMs: 30 * 60000 });
    const withData = syms.filter(s => monthly.has(s));
    return {
      generatedAt: new Date().toISOString(),
      meta: meta({ ok: okHist > 0, source: 'Yahoo Finance (quotes, quoteSummary, dividend-adjusted daily closes)', asOf: new Date().toISOString(),
        note: 'totalReturnAnnualizedPct: annualized, dividends reinvested (Yahoo adjusted close), trailing from the latest close. volatilityPct: stdev of monthly total returns x sqrt(12). maxDrawdown uses daily adjusted closes. fromHighPct is price-only from the all-time closing high; fromHighTotalReturnPct includes dividends. Yahoo history may start after a fund\'s true inception.' }),
      groups: [...new Set(ETFS.map(e => e.role))],
      funds,
      correlation: {
        note: 'Pearson correlation of monthly total returns (complete calendar months only). null when the pair overlaps fewer than minOverlapMonths; n = months used.',
        y3: correlationMatrix(withData, monthly, curMonth, 36, 24),
        y10: correlationMatrix(withData, monthly, curMonth, 120, 36),
      },
    };
  }

  async function get() {
    if (built && Date.now() - built.t < 30 * 60000) return built.data;
    if (!building) building = build().then(d => { built = { t: Date.now(), data: d }; return d; }).finally(() => { building = null; });
    if (built) return built.data;
    return building;
  }
  return { get, warm: () => get().catch(err => reportError('etfs', err)) };
}
