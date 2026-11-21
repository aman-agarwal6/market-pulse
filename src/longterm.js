// /api/longterm: long-run S&P 500 history, drawdowns, "what happened next",
// time in the market and valuation history. Heavy inputs load lazily and are
// cached on disk; the live ^GSPC quote is folded in on every request.
import * as yahoo from './yahoo.js';
import { cached, meta, reportResult, reportError } from './store.js';
import { fetchShiller, fetchMultpl, mergeMonthly, realTotalReturn, lastDateWith, SHILLER_URL, MULTPL } from './shiller.js';
import {
  round, isNum, drawdownSeries, drawdownEpisodes, firstCrossings, forwardReturn, summarize, daysBetween,
  lastPerPeriod, minPerPeriod, weekKey, monthKey, rollingAnnualized, mean, median, percentileOf, indexOnOrBefore,
} from './stats.js';

const H = 3600000;
const TTL = { daily: 12 * H, shiller: 24 * H, multpl: 24 * H };
export const THRESHOLDS = [5, 10, 15, 20, 30];
export const HORIZONS = [1, 3, 5, 10];
export const HOLDING_YEARS = [1, 3, 5, 10, 15, 20];

/** Yahoo history -> { dates, close } using the exchange's UTC offset for the calendar date. */
function toDaily(h) {
  const off = h.meta?.gmtoffset ?? -18000;
  const dates = h.t.map(t => new Date((t + off) * 1000).toISOString().slice(0, 10));
  // de-duplicate dates (keep last)
  const d = [], c = [];
  for (let i = 0; i < dates.length; i++) {
    if (d.length && d[d.length - 1] === dates[i]) c[c.length - 1] = h.c[i];
    else { d.push(dates[i]); c.push(h.c[i]); }
  }
  return { dates: d, close: c };
}

async function loadDaily(sym, period1) {
  const res = await cached(`lt-${sym}-daily`, TTL.daily, async () => {
    const h = await yahoo.history(sym, { period1, interval: '1d' });
    if (!h || h.c.length < 1000) throw new Error(`${sym}: short history`);
    return toDaily(h);
  });
  reportResult(`longterm:${sym}`, res, { source: `Yahoo Finance chart ${sym} daily`, asOf: res.data.dates.at(-1), ttlMs: TTL.daily });
  return res;
}

const nyDate = ts => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));

/** Replace/append the latest bar with a live quote. Pure. */
export function foldLive(series, quote) {
  const p = quote?.regularMarketPrice, t = quote?.regularMarketTime;
  if (!isNum(p) || !isNum(t) || !series.dates.length) return { ...series, live: false };
  const d = nyDate(t);
  const dates = series.dates.slice(), close = series.close.slice();
  if (d === dates[dates.length - 1]) close[close.length - 1] = p;
  else if (d > dates[dates.length - 1]) { dates.push(d); close.push(p); }
  else return { ...series, live: false };
  return { dates, close, live: true, liveTime: t };
}

// ---------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------
export function buildCurrent({ dates, close }) {
  const n = close.length;
  let athI = 0;
  for (let i = 1; i < n; i++) if (close[i] >= close[athI]) athI = i;
  const dd = close[n - 1] / close[athI] - 1;
  // low of the current episode
  let lowI = athI;
  for (let i = athI; i < n; i++) if (close[i] < close[lowI]) lowI = i;
  const crossed = THRESHOLDS.filter(t => -dd * 100 >= t - 1e-9);
  const crossedInEpisode = THRESHOLDS.filter(t => -(close[lowI] / close[athI] - 1) * 100 >= t - 1e-9);
  return {
    price: round(close[n - 1], 2), date: dates[n - 1],
    allTimeHigh: round(close[athI], 2), allTimeHighDate: dates[athI],
    drawdownPct: round(dd * 100, 2),
    calendarDaysSinceHigh: daysBetween(dates[athI], dates[n - 1]),
    tradingDaysSinceHigh: n - 1 - athI,
    episodeLow: round(close[lowI], 2), episodeLowDate: dates[lowI], episodeLowPct: round((close[lowI] / close[athI] - 1) * 100, 2),
    thresholdsCrossedNow: crossed,
    deepestThresholdNow: crossed.length ? crossed[crossed.length - 1] : null,
    thresholdsCrossedThisEpisode: crossedInEpisode,
  };
}

export function buildEpisodes({ dates, close }, minDepth = 0.10) {
  const eps = drawdownEpisodes(close, minDepth).map(e => ({
    peakDate: dates[e.peak], peak: round(close[e.peak], 2),
    troughDate: dates[e.trough], trough: round(close[e.trough], 2),
    depthPct: round(e.depth * 100, 2),
    tradingDaysPeakToTrough: e.trough - e.peak,
    calendarDaysPeakToTrough: daysBetween(dates[e.peak], dates[e.trough]),
    recoveryDate: e.recovery != null ? dates[e.recovery] : null,
    tradingDaysTroughToRecovery: e.recovery != null ? e.recovery - e.trough : null,
    calendarDaysTroughToRecovery: e.recovery != null ? daysBetween(dates[e.trough], dates[e.recovery]) : null,
    calendarDaysPeakToRecovery: e.recovery != null ? daysBetween(dates[e.peak], dates[e.recovery]) : null,
    ongoing: e.recovery == null,
    pre1950: dates[e.peak] < '1950-01-01',
  }));
  return eps;
}

export function countsByDecade({ dates, close }) {
  const all = drawdownEpisodes(close, 0.05);
  const out = new Map();
  for (const e of all) {
    const dec = dates[e.peak].slice(0, 3) + '0s';
    const r = out.get(dec) || { decade: dec, ge5: 0, ge10: 0, ge20: 0 };
    const d = -e.depth;
    if (d >= 0.05) r.ge5++;
    if (d >= 0.10) r.ge10++;
    if (d >= 0.20) r.ge20++;
    out.set(dec, r);
  }
  return [...out.values()];
}

export function buildWhatNext({ dates, close }) {
  const ths = THRESHOLDS.map(t => t / 100);
  const cr = firstCrossings(close, ths);
  return THRESHOLDS.map((tp, k) => {
    const events = cr[ths[k]].map(({ i, peak }) => {
      const fwd = {};
      for (const y of HORIZONS) { const r = forwardReturn(dates, close, i, y); fwd[y] = r == null ? null : round(r * 100, 2); }
      return { date: dates[i], close: round(close[i], 2), peakDate: dates[peak], fwd };
    });
    const summ = filter => Object.fromEntries(HORIZONS.map(y => {
      const s = summarize(events.filter(filter).map(e => e.fwd[y]).filter(isNum));
      return [y, { count: s.count, median: round(s.median, 2), mean: round(s.mean, 2), min: round(s.min, 2), max: round(s.max, 2), pctPositive: round(s.pctPositive, 1) }];
    }));
    return { thresholdPct: tp, events, summary: { all: summ(() => true), since1950: summ(e => e.date >= '1950-01-01') } };
  });
}

function rollingTable(dates, values) {
  return HOLDING_YEARS.map(y => {
    const r = rollingAnnualized(dates, values, y);
    if (!r.windows) return { years: y, windows: 0 };
    const p = v => round(v * 100, 2);
    return { years: y, windows: r.windows, pctPositive: round(r.pctPositive, 1), worstPct: p(r.worst), worstStart: r.worstStart, p10Pct: p(r.p10), medianPct: p(r.median), p90Pct: p(r.p90), bestPct: p(r.best), bestStart: r.bestStart };
  });
}

export function buildChart(spx, tr) {
  const dd = drawdownSeries(spx.close);
  const w = lastPerPeriod(spx.dates, spx.close, weekKey);
  const u = minPerPeriod(spx.dates, dd, weekKey);
  const out = { freq: 'weekly (last close of each week; underwater = worst daily close that week)', dates: w.dates, close: w.values.map(v => round(v, 2)), underwaterPct: u.values.map(v => round(v * 100, 2)) };
  if (tr) {
    const t = lastPerPeriod(tr.dates, tr.close, weekKey);
    out.totalReturn = { note: '^SP500TR, dividends reinvested, weekly', dates: t.dates, close: t.values.map(v => round(v, 2)) };
  }
  return out;
}

function valuationSeries(name, merged, livePrice, spx, maxLagMonths = 6) {
  const { dates, values } = merged;
  if (!dates.length) return null;
  const since = (from) => values.filter((_, i) => dates[i] >= from);
  const lastDate = dates[dates.length - 1], lastVal = values[values.length - 1];
  // Current value: newest published point (multpl intra-month row if any), scaled by the
  // S&P 500's move from that date to the live price. Earnings are held constant over the gap.
  const ref = merged.latest ? { date: merged.latest.date, value: merged.latest.value, src: 'multpl' } : { date: lastDate, value: lastVal, src: merged.ext.at(-1) ? 'multpl' : 'shiller' };
  let current = null;
  const lagMonths = spx.dates.length ? Math.round(daysBetween(ref.date, spx.dates.at(-1)) / 30.44) : null;
  const i = indexOnOrBefore(spx.dates, ref.date);
  if (i >= 0 && isNum(livePrice) && lagMonths != null && lagMonths <= maxLagMonths) {
    // A month-start point (YYYY-MM-01) is based on that month's average price; we use the
    // close on that date as the reference, which is the best available approximation.
    const scale = livePrice / spx.close[i];
    current = {
      value: round(ref.value * scale, 2), estimated: true,
      method: `${ref.src} value for ${ref.date} (${ref.value}) x S&P 500 change since then (${round((scale - 1) * 100, 2)}%); earnings held constant`,
      referenceDate: ref.date, referenceValue: ref.value,
    };
  } else {
    current = { value: null, estimated: true, method: `not estimated: latest ${name} data point (${ref.date}) is ${lagMonths} months old (> ${maxLagMonths})` };
  }
  const hist = values;
  return {
    dates, values: values.map(v => round(v, 2)),
    extendedFrom: merged.ext.indexOf(true) >= 0 ? dates[merged.ext.indexOf(true)] : null,
    estimatedPoints: merged.estimated?.some(Boolean) ? dates.filter((_, k) => merged.estimated[k]) : [],
    overlapCheck: { months: merged.overlap.months, maxAbsDiff: round(merged.overlap.maxAbsDiff, 3), meanAbsDiff: round(merged.overlap.meanAbsDiff, 3) },
    firstDate: dates[0], lastDate,
    stats: {
      all: { from: dates[0], mean: round(mean(hist), 2), median: round(median(hist), 2) },
      since1950: { from: '1950-01-01', mean: round(mean(since('1950-01-01')), 2), median: round(median(since('1950-01-01')), 2) },
    },
    current: current && current.value != null ? {
      ...current,
      percentileAll: round(percentileOf(hist, current.value), 1),
      percentileSince1950: round(percentileOf(since('1950-01-01'), current.value), 1),
    } : current,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export function createLongTerm({ getQuote, getValuation }) {
  let inputs = null;     // { spx, tr, shiller, cape, pe, metas }
  let loading = null;
  let staticCache = null; // { key, data }
  let liveCache = null;   // { key, data }

  async function load() {
    const metas = {};
    const settle = async (name, fn, info) => {
      try {
        const r = await fn();
        metas[name] = meta({ ok: !r.stale, stale: r.stale, error: r.error, fetchedAt: r.t, ...info(r) });
        return r.data;
      } catch (err) {
        reportError(`longterm:${name}`, err, { source: info({ data: null }).source });
        metas[name] = meta({ ok: false, error: err.message, source: info({ data: null }).source });
        return null;
      }
    };
    const spx = await settle('gspc', () => loadDaily('^GSPC', -1400000000), r => ({ source: 'Yahoo Finance ^GSPC daily closes (pre-1957 values are the S&P 90 Composite)', asOf: r.data?.dates?.at(-1) ?? null }));
    const tr = await settle('sp500tr', () => loadDaily('^SP500TR', 560000000), r => ({ source: 'Yahoo Finance ^SP500TR daily (S&P 500 total return index)', asOf: r.data?.dates?.at(-1) ?? null }));
    const shiller = await settle('shiller', async () => {
      const r = await cached('lt-shiller', TTL.shiller, fetchShiller);
      reportResult('longterm:shiller', r, { source: SHILLER_URL, asOf: lastDateWith(r.data, 'price'), ttlMs: TTL.shiller });
      return r;
    }, r => ({
      source: `Shiller monthly data via github.com/datasets/s-and-p-500 (${SHILLER_URL})`,
      asOf: r.data ? lastDateWith(r.data, 'price') : null,
      note: r.data ? `Last price ${lastDateWith(r.data, 'price')}, dividends ${lastDateWith(r.data, 'div')}, earnings ${lastDateWith(r.data, 'earn')}, CPI ${lastDateWith(r.data, 'cpi')}, CAPE ${lastDateWith(r.data, 'cape')}. Prices are monthly averages of daily closes.` : undefined,
    }));
    const cape = await settle('multplCape', async () => {
      const r = await cached('lt-multpl-cape', TTL.multpl, () => fetchMultpl('cape'));
      reportResult('longterm:multplCape', r, { source: MULTPL.cape, asOf: r.data.at(-1)?.date, ttlMs: TTL.multpl });
      return r;
    }, r => ({ source: `multpl.com Shiller PE by month (${MULTPL.cape})`, asOf: r.data?.at(-1)?.date ?? null }));
    const pe = await settle('multplPE', async () => {
      const r = await cached('lt-multpl-pe', TTL.multpl, () => fetchMultpl('pe'));
      reportResult('longterm:multplPE', r, { source: MULTPL.pe, asOf: r.data.at(-1)?.date, ttlMs: TTL.multpl });
      return r;
    }, r => ({ source: `multpl.com S&P 500 P/E by month (${MULTPL.pe}); rows marked estimate use estimated earnings`, asOf: r.data?.at(-1)?.date ?? null }));
    inputs = { spx, tr, shiller, cape, pe, metas, loadedAt: Date.now() };
    staticCache = null;
    return inputs;
  }

  /** Load once; reload in the background when the daily cache is older than its TTL. */
  async function ensure() {
    // Full reload every 6 h; retry after 5 min if any input failed last time.
    const incomplete = inputs && ['spx', 'tr', 'shiller', 'cape', 'pe'].some(k => !inputs[k]);
    if (inputs && Date.now() - inputs.loadedAt < (incomplete ? 5 * 60000 : 6 * H)) return inputs;
    if (!loading) loading = load().finally(() => { loading = null; });
    if (inputs) return inputs; // serve current while refreshing
    return loading;
  }

  function buildStatic(inp) {
    const key = inp.loadedAt;
    if (staticCache?.key === key) return staticCache.data;
    const out = {};
    if (inp.shiller) {
      const rtr = realTotalReturn(inp.shiller);
      out.realTotal = { dates: rtr.dates, values: rtr.values };
    }
    staticCache = { key, data: out };
    return out;
  }

  async function get() {
    const inp = await ensure();
    const q = getQuote('^GSPC');
    const liveKey = `${inp.loadedAt}|${q?.regularMarketPrice}|${q?.regularMarketTime}`;
    if (liveCache?.key === liveKey && Date.now() - liveCache.t < 15000) return liveCache.data;
    const st = buildStatic(inp);
    const payload = { generatedAt: new Date().toISOString(), sources: inp.metas };

    if (inp.spx) {
      const spx = foldLive(inp.spx, q);
      payload.sources.live = meta({ ok: spx.live, source: 'live ^GSPC quote held by the server (15-45 s refresh)', asOf: spx.live ? new Date(spx.liveTime * 1000).toISOString() : null });
      const m = meta({ ok: true, source: 'Yahoo ^GSPC daily closes + live quote', asOf: spx.dates.at(-1) });
      payload.current = { meta: m, ...buildCurrent(spx) };
      payload.drawdowns = {
        meta: { ...m, note: 'Episode = from an all-time closing high to the next close at/above it. Depth uses daily closes (price only, no dividends). Pre-1950 episodes are included and flagged.' },
        minDepthPct: 10,
        episodes: buildEpisodes(spx, 0.10),
        countsByDecade: countsByDecade(spx),
        countsNote: 'Episodes counted by the decade of their starting high; a 25% decline counts in ge5, ge10 and ge20.',
      };
      payload.chart = { meta: m, ...buildChart(spx, inp.tr) };
      payload.whatNext = {
        meta: { ...m, note: 'Each event = first close at least X% below the prior all-time high within an episode. Forward returns are S&P 500 PRICE returns (no dividends) from that close to the first close on/after the same date N years later. Events whose horizon has not elapsed have null for that horizon and are excluded from the summary.' },
        horizonsYears: HORIZONS,
        thresholds: buildWhatNext(spx),
        current: { drawdownPct: payload.current.drawdownPct, thresholdsCrossedNow: payload.current.thresholdsCrossedNow, thresholdsCrossedThisEpisode: payload.current.thresholdsCrossedThisEpisode },
      };
      // Time in market: price since 1950, month-end closes.
      const me = lastPerPeriod(spx.dates, spx.close, monthKey);
      const i0 = me.dates.findIndex(d => d >= '1950-01-01');
      const pd = me.dates.slice(i0), pv = me.values.slice(i0);
      payload.timeInMarket = {
        price: {
          meta: m,
          label: 'S&P 500 price index only (no dividends, not inflation-adjusted), month-end closes, rolling windows starting every month',
          from: pd[0], to: pd.at(-1), windows: rollingTable(pd, pv),
        },
      };
      if (inp.tr) {
        const tm = lastPerPeriod(inp.tr.dates, inp.tr.close, monthKey);
        payload.timeInMarket.totalReturn = {
          meta: inp.metas.sp500tr,
          label: 'S&P 500 total return (dividends reinvested), nominal, month-end closes of ^SP500TR',
          from: tm.dates[0], to: tm.dates.at(-1), windows: rollingTable(tm.dates, tm.values),
        };
      }
    } else {
      payload.current = { meta: inp.metas.gspc };
    }
    if (st.realTotal) {
      (payload.timeInMarket ||= {}).realTotalReturn = {
        meta: inp.metas.shiller,
        label: 'Inflation-adjusted total return (dividends reinvested, deflated by CPI), Shiller monthly data. Prices are monthly averages, not month-end closes.',
        from: st.realTotal.dates[0], to: st.realTotal.dates.at(-1), windows: rollingTable(st.realTotal.dates, st.realTotal.values),
      };
    }
    // Valuation history
    if (inp.shiller) {
      const livePrice = inp.spx ? foldLive(inp.spx, q).close.at(-1) : null;
      const spxForScale = inp.spx ? foldLive(inp.spx, q) : { dates: [], close: [] };
      const capeM = mergeMonthly(inp.shiller, 'cape', inp.cape);
      const peRows = inp.shiller.map(r => ({ date: r.date, pe: r.earn && r.earn > 0 ? r.price / r.earn : null }));
      const peM = mergeMonthly(peRows, 'pe', inp.pe);
      payload.valuationHistory = {
        meta: meta({
          ok: true, source: 'Shiller data (datasets/s-and-p-500) extended with multpl.com', asOf: capeM.dates.at(-1),
          note: `CAPE = real price / 10-year average real earnings. Shiller dataset CAPE ends ${capeM.lastShillerDate}; months from ${capeM.ext.indexOf(true) >= 0 ? capeM.dates[capeM.ext.indexOf(true)] : 'n/a'} on come from multpl.com (same methodology; it also replaces the dataset's last 3 possibly-preliminary months; overlap check included). Trailing P/E = monthly price / trailing 12-month reported earnings (Shiller ends ${peM.lastShillerDate}; multpl after). current.value is an estimate.${inp.cape ? '' : ' multpl.com unavailable: series stop at the Shiller dataset and no current estimate is made when it is older than 6 months.'}`,
        }),
        cape: valuationSeries('CAPE', capeM, livePrice, spxForScale),
        trailingPE: valuationSeries('P/E', peM, livePrice, spxForScale),
      };
    }
    // Today's valuation from live constituent quotes
    try {
      const v = getValuation();
      payload.valuationToday = v;
    } catch (err) {
      payload.valuationToday = { meta: meta({ ok: false, error: err.message, source: 'Yahoo v7 quotes' }) };
    }
    liveCache = { key: liveKey, t: Date.now(), data: payload };
    return payload;
  }

  return { get, ensure, inputs: () => inputs };
}
