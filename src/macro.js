// /api/macro: curated FRED series, NBER recessions, a recession-watch block,
// market-implied Fed path (30-day fed funds futures), next FOMC meetings and
// an economic release calendar (BLS + BEA official ICS feeds).
import { MACRO_SERIES, MACRO_AUX } from './config.js';
import { fredSeries } from './fred.js';
import { politeFetch } from './net.js';
import { readFirstSheet, excelDate } from './xls.js';
import * as yahoo from './yahoo.js';
import { cached, meta, reportResult, reportError } from './store.js';
import {
  round, isNum, yoyMonthly, movingAverage, percentileOf, addYears, indexOnOrBefore, lastPerPeriod, weekKey, monthKey,
} from './stats.js';

const H = 3600000;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
export function applyTransform(s, transform) {
  if (transform === 'yoy') return yoyMonthly(s.dates, s.values);
  if (transform === 'diff') {
    const d = [], v = [];
    for (let i = 1; i < s.values.length; i++) { d.push(s.dates[i]); v.push(s.values[i] - s.values[i - 1]); }
    return { dates: d, values: v };
  }
  return s;
}

/**
 * YoY for the newest raw month when its year-ago base month is missing from the
 * source (e.g. October 2025 CPI was never published). The base is interpolated
 * geometrically between the neighbouring months. Returns null when the newest
 * month already has a proper YoY or no neighbours exist. Pure.
 */
export function yoyWithInterpolatedBase(raw, yoy) {
  const lastRaw = raw.dates[raw.dates.length - 1];
  if (!lastRaw || (yoy.dates.length && yoy.dates[yoy.dates.length - 1] >= lastRaw)) return null;
  const base = `${+lastRaw.slice(0, 4) - 1}-${lastRaw.slice(5, 7)}-01`;
  const shift = (d, k) => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + k, 1)); return x.toISOString().slice(0, 10); };
  const m = new Map(raw.dates.map((d, i) => [d, raw.values[i]]));
  const a = m.get(shift(base, -1)), b = m.get(shift(base, 1));
  if (m.has(base) || !isNum(a) || !isNum(b)) return null;
  const est = Math.sqrt(a * b);
  return { date: lastRaw, value: (raw.values[raw.values.length - 1] / est - 1) * 100, estimated: true,
    method: `${base} is missing in the source; year-ago base interpolated geometrically between ${shift(base, -1)} and ${shift(base, 1)}` };
}

/** Downsample for charts: daily -> weekly before the last 2 years; weekly -> monthly before the last 5 years. */
export function downsample(dates, values, freq) {
  if (!dates.length || (freq !== 'D' && freq !== 'W')) return { dates, values };
  const keepYears = freq === 'D' ? 2 : 5;
  const cut = addYears(dates[dates.length - 1], -keepYears);
  const i = dates.findIndex(d => d >= cut);
  const older = lastPerPeriod(dates.slice(0, i), values.slice(0, i), freq === 'D' ? weekKey : monthKey);
  return { dates: [...older.dates, ...dates.slice(i)], values: [...older.values, ...values.slice(i)] };
}

/** Latest / previous / year-ago / percentile summary of a (transformed) series. */
export function summarizeSeries(dates, values) {
  const n = values.length;
  if (!n) return null;
  const latest = { date: dates[n - 1], value: values[n - 1] };
  const previous = n > 1 ? { date: dates[n - 2], value: values[n - 2] } : null;
  const j = indexOnOrBefore(dates, addYears(latest.date, -1));
  const yearAgo = j >= 0 ? { date: dates[j], value: values[j] } : null;
  return {
    latest, previous,
    change: previous ? latest.value - previous.value : null,
    yearAgo,
    changeFromYearAgo: yearAgo ? latest.value - yearAgo.value : null,
    percentile: percentileOf(values, latest.value),
    percentileSince: dates[0],
    observations: n,
  };
}

/** Recession periods from a 0/1 monthly series. */
export function recessionPeriods(dates, values) {
  const out = [];
  let start = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === 1 && start == null) start = dates[i];
    if (values[i] !== 1 && start != null) { out.push({ start, end: dates[i - 1], ongoing: false }); start = null; }
  }
  if (start != null) out.push({ start, end: dates[dates.length - 1], ongoing: true });
  return out;
}

/** Monthly averages of a daily series. */
export function monthlyAverage(dates, values) {
  const d = [], v = [], cnt = [];
  for (let i = 0; i < dates.length; i++) {
    const k = dates[i].slice(0, 7) + '-01';
    if (d.length && d[d.length - 1] === k) { v[v.length - 1] += values[i]; cnt[cnt.length - 1]++; }
    else { d.push(k); v.push(values[i]); cnt.push(1); }
  }
  return { dates: d, values: v.map((x, i) => x / cnt[i]) };
}

/** Inversion episodes (monthly average < 0). */
export function inversionEpisodes(mDates, mValues) {
  const out = [];
  let s = null, deepest = 0;
  for (let i = 0; i < mValues.length; i++) {
    if (mValues[i] < 0) {
      if (s == null) { s = i; deepest = mValues[i]; } else deepest = Math.min(deepest, mValues[i]);
    } else if (s != null) {
      out.push({ start: mDates[s], end: mDates[i - 1], months: i - s, deepest, ongoing: false }); s = null;
    }
  }
  if (s != null) out.push({ start: mDates[s], end: null, months: mValues.length - s, deepest, ongoing: true });
  return out;
}

/** Days in the current run of consecutive negative daily values (null if latest >= 0). */
export function currentNegativeRun(dates, values) {
  let i = values.length - 1;
  if (i < 0 || values[i] >= 0) return null;
  while (i > 0 && values[i - 1] < 0) i--;
  return { start: dates[i], observations: values.length - i };
}

const MONTH_IDX = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');

/** Parse the Fed's FOMC calendar page into scheduled meetings. */
export function parseFOMC(html) {
  const out = [];
  const heads = [...html.matchAll(/>(\d{4}) FOMC Meetings</g)];
  heads.forEach((h, k) => {
    const year = +h[1];
    const section = html.slice(h.index, k + 1 < heads.length ? heads[k + 1].index : html.length);
    const re = /fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g;
    let m;
    while ((m = re.exec(section))) {
      const monthTxt = m[1].trim(), dayTxt = m[2].trim();
      if (/\(|unscheduled|notation|conference call/i.test(dayTxt)) continue; // only regularly scheduled meetings
      const months = monthTxt.split('/').map(x => MONTH_IDX[x.trim().slice(0, 3).toLowerCase()]);
      const dm = dayTxt.match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?(\*)?/);
      if (!dm || months.some(x => !x)) continue;
      const d1 = +dm[1], d2 = dm[2] ? +dm[2] : d1;
      const m1 = months[0], m2 = months[months.length - 1];
      const y2 = m2 < m1 ? year + 1 : year;
      out.push({ start: `${year}-${pad(m1)}-${pad(d1)}`, end: `${y2}-${pad(m2)}-${pad(d2)}`, sep: !!dm[3] });
    }
  });
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}

const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function utcToET(y, mo, d, h, mi) {
  const parts = Object.fromEntries(etFmt.formatToParts(new Date(Date.UTC(y, mo - 1, d, h, mi))).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, timeET: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
}

/** Parse an ICS calendar into [{ title, date (ET), timeET }]. */
export function parseICS(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const sum = block.match(/\nSUMMARY[^:]*:(.*)/)?.[1]?.trim();
    const dt = block.match(/\nDTSTART([^:]*):(\d{8})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
    if (!sum || !dt) continue;
    const y = +dt[2].slice(0, 4), mo = +dt[2].slice(4, 6), d = +dt[2].slice(6, 8);
    let date = `${y}-${pad(mo)}-${pad(d)}`, timeET = dt[3] ? `${dt[3]}:${dt[4]}` : null;
    if (dt[6] === 'Z') ({ date, timeET } = utcToET(y, mo, d, +dt[3], +dt[4]));
    out.push({ title: sum.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' '), date, timeET });
  }
  return out;
}

const FUT_CODES = 'FGHJKMNQUVXZ';
/** Fed funds futures symbols for the current month and the next `n - 1`. */
export function fedFuturesSymbols(now = new Date(), n = 13) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
    out.push({ month: d.toISOString().slice(0, 7), symbol: `ZQ${FUT_CODES[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}.CBT` });
  }
  return out;
}

/**
 * Market-implied average fed funds rate per month: 100 - futures price.
 * Contracts settle on the month's AVERAGE effective rate, so a month with a
 * meeting late in the month only partly reflects that meeting's decision.
 */
export function impliedFedPath(contracts, quotes, effr, nowSec) {
  const rows = [];
  for (const c of contracts) {
    const q = quotes.get(c.symbol);
    const p = q?.regularMarketPrice;
    const fresh = isNum(q?.regularMarketTime) && nowSec - q.regularMarketTime < 7 * 86400;
    if (!isNum(p) || p < 85 || p > 100.5 || !fresh) { rows.push({ month: c.month, symbol: c.symbol, impliedRatePct: null, reason: !q ? 'no quote' : !fresh ? 'stale quote' : 'bad price' }); continue; }
    const r = 100 - p;
    rows.push({
      month: c.month, symbol: c.symbol, price: p, impliedRatePct: round(r, 3),
      changeVsEffectiveBp: isNum(effr) ? round((r - effr) * 100, 1) : null,
      // (implied - effective) / 0.25: +1 = one 25 bp hike priced in, -1 = one cut.
      moves25bpPriced: isNum(effr) ? round((r - effr) / 0.25, 2) : null,
      volume: q.regularMarketVolume ?? null, quoteTime: new Date(q.regularMarketTime * 1000).toISOString(),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------
const NYFED_URL = 'https://www.newyorkfed.org/medialibrary/media/research/capital_markets/allmonth.xls';

/** NY Fed yield-curve recession probability (12 months ahead). */
export function parseNYFed(rows) {
  const head = (rows[0] || []).map(x => String(x ?? '').trim());
  const iD = head.indexOf('Date'), iS = head.indexOf('Spread'), iP = head.indexOf('Rec_prob');
  if (iD < 0 || iS < 0 || iP < 0) throw new Error('NY Fed sheet header changed: ' + head.join('|'));
  const prob = { dates: [], values: [] }, spread = { dates: [], values: [] };
  for (const r of rows.slice(1)) {
    if (!r || !isNum(r[iD])) continue;
    const d = excelDate(r[iD]);
    if (isNum(r[iP])) { prob.dates.push(d); prob.values.push(r[iP] * 100); }
    if (isNum(r[iS])) { spread.dates.push(d); spread.values.push(r[iS]); }
  }
  if (prob.dates.length < 100) throw new Error('NY Fed sheet: too few rows');
  return { prob, spread };
}

async function nyFed() {
  const res = await cached('nyfed-recprob', 24 * H, async () => parseNYFed(readFirstSheet(await politeFetch(NYFED_URL, { binary: true }))));
  reportResult('macro:nyfed', res, { source: NYFED_URL, asOf: res.data.spread.dates.at(-1), ttlMs: 24 * H });
  return res;
}

async function fomc() {
  const url = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
  const res = await cached('fomc-calendar', 24 * H, async () => {
    const list = parseFOMC(await politeFetch(url));
    if (list.length < 8) throw new Error('FOMC calendar: too few meetings parsed');
    return list;
  });
  reportResult('macro:fomc', res, { source: url, asOf: res.data.at(-1)?.end, ttlMs: 24 * H });
  return res;
}

const CAL_FEEDS = [
  { key: 'bls', url: 'https://www.bls.gov/schedule/news_release/bls.ics', source: 'BLS release schedule (ICS)',
    pick: t => /^(Employment Situation|Consumer Price Index|Producer Price Index|Job Openings and Labor Turnover Survey|Employment Cost Index)$/.test(t) },
  { key: 'bea', url: 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics', source: 'BEA release schedule (ICS)',
    pick: t => /^(GDP|Gross Domestic Product) \(|^Personal Income and Outlays,/.test(t) },
];

async function calendarFeed(f) {
  const res = await cached(`cal-${f.key}`, 24 * H, async () => {
    const ev = parseICS(await politeFetch(f.url));
    if (ev.length < 20) throw new Error(`${f.key} calendar: too few events`);
    return ev;
  });
  reportResult(`macro:calendar-${f.key}`, res, { source: f.url, asOf: res.data.map(e => e.date).sort().at(-1), ttlMs: 24 * H });
  return res;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export function createMacro() {
  let built = null; // { t, data }
  let building = null;

  async function safe(name, fn) {
    try { return await fn(); } catch (err) { reportError(name, err); return { error: err.message || String(err) }; }
  }

  async function build() {
    const all = [...MACRO_SERIES, ...MACRO_AUX];
    const raw = {};
    // FRED requests are serialized per host by politeFetch.
    await Promise.all(all.map(async cfg => { raw[cfg.key] = await safe(`fred:${cfg.id}`, () => fredSeries(cfg.id, cfg.freq)); }));
    const [ny, fomcR, ...cals] = await Promise.all([safe('macro:nyfed', nyFed), safe('macro:fomc', fomc), ...CAL_FEEDS.map(f => safe(`macro:calendar-${f.key}`, () => calendarFeed(f)))]);

    const fredMeta = (r, id) => meta({ ok: !!r?.data && !r.stale, stale: !!r?.stale, error: r?.error ?? null, fetchedAt: r?.t, source: `FRED ${id} (https://fred.stlouisfed.org/series/${id})`, asOf: r?.data?.dates?.at(-1) ?? null });
    const series = MACRO_SERIES.map(cfg => {
      const r = raw[cfg.key];
      const card = { key: cfg.key, id: cfg.id, group: cfg.group, title: cfg.title, what: cfg.what, why: cfg.why, unit: cfg.unit, freq: cfg.freq, transform: cfg.transform, higherIsHotter: cfg.higherIsHotter, meta: fredMeta(r, cfg.id) };
      if (!r?.data) return { ...card, latest: null, history: null };
      const t = applyTransform(r.data, cfg.transform);
      const sum = summarizeSeries(t.dates, t.values);
      if (!sum) return { ...card, latest: null, history: null };
      card.meta.asOf = sum.latest.date;
      const dp = cfg.key === 'claims' || cfg.key === 'payrolls' ? 0 : 3;
      const rv = v => round(v, dp);
      const ds = downsample(t.dates, t.values, cfg.freq);
      const out = {
        ...card,
        latest: { date: sum.latest.date, value: rv(sum.latest.value) },
        previous: sum.previous ? { date: sum.previous.date, value: rv(sum.previous.value) } : null,
        change: rv(sum.change),
        yearAgo: sum.yearAgo ? { date: sum.yearAgo.date, value: rv(sum.yearAgo.value) } : null,
        changeFromYearAgo: rv(sum.changeFromYearAgo),
        percentile: round(sum.percentile, 1), percentileSince: sum.percentileSince,
        history: { note: cfg.freq === 'D' ? 'daily for the last 2 years, weekly (last value) before' : cfg.freq === 'W' ? 'weekly for the last 5 years, monthly (last value) before' : 'full history', dates: ds.dates, values: ds.values.map(rv) },
      };
      if (cfg.transform === 'yoy') {
        const est = yoyWithInterpolatedBase(r.data, t);
        if (est) out.latestEstimate = { date: est.date, value: rv(est.value), estimated: true, method: est.method, note: '`latest` is the newest month with a published year-ago base; this estimate covers the newer month.' };
        out.latestRaw = { date: r.data.dates.at(-1), index: r.data.values.at(-1) };
      }
      if (cfg.key === 'payrolls') {
        const ma = movingAverage(t.dates, t.values, 3);
        out.extra = { avg3m: rv(ma.values.at(-1)) };
      }
      if (cfg.key === 'claims') {
        const ma = movingAverage(t.dates, t.values, 4);
        const j = indexOnOrBefore(ma.dates, addYears(ma.dates.at(-1), -1));
        out.extra = { avg4w: rv(ma.values.at(-1)), avg4wDate: ma.dates.at(-1), avg4wYearAgo: j >= 0 ? rv(ma.values[j]) : null, avg4wYearAgoDate: j >= 0 ? ma.dates[j] : null };
      }
      if (cfg.key === 'fedFunds') {
        const lo = raw.fedTargetLow?.data, hi = raw.fedTargetHigh?.data;
        out.extra = lo && hi ? { targetRange: { low: lo.values.at(-1), high: hi.values.at(-1), date: hi.dates.at(-1) }, targetRangeMeta: fredMeta(raw.fedTargetHigh, 'DFEDTARL / DFEDTARU') } : { targetRange: null };
      }
      if (cfg.key === 'hySpread') out.meta.note = 'FRED only distributes the last ~3 years of ICE BofA index data, so the percentile covers that window only.';
      return out;
    });
    const byKey = Object.fromEntries(series.map(s => [s.key, s]));

    // NBER recessions
    const rec = raw.usrec?.data;
    const recessions = rec
      ? { meta: fredMeta(raw.usrec, 'USREC'), note: 'NBER-dated US recessions (monthly; peak month through trough month).', periods: recessionPeriods(rec.dates, rec.values) }
      : { meta: fredMeta(raw.usrec, 'USREC'), periods: [] };

    // Recession watch
    const watch = [];
    const curve = (key, label) => {
      const r = raw[key]?.data;
      if (!r) return;
      const m = monthlyAverage(r.dates, r.values);
      const eps = inversionEpisodes(m.dates, m.values);
      const last = eps.at(-1) || null;
      const run = currentNegativeRun(r.dates, r.values);
      const latest = r.values.at(-1);
      let monthsSinceEnded = null;
      if (last && !last.ongoing) monthsSinceEnded = (+m.dates.at(-1).slice(0, 4) - +last.end.slice(0, 4)) * 12 + (+m.dates.at(-1).slice(5, 7) - +last.end.slice(5, 7));
      const status = latest < 0 ? 'warning' : last && !last.ongoing && last.months >= 3 && monthsSinceEnded <= 12 ? 'watch' : 'ok';
      watch.push({
        key, label, meta: byKey[key].meta, latest: round(latest, 2), date: r.dates.at(-1), inverted: latest < 0,
        currentInversion: run ? { start: run.start, tradingDays: run.observations } : null,
        lastInversion: last ? { start: last.start, end: last.end, months: last.months, deepest: round(last.deepest, 2), ongoing: last.ongoing } : null,
        monthsSinceInversionEnded: monthsSinceEnded,
        status, rule: 'warning: spread below 0 today; watch: a 3+ month inversion (monthly average) ended within the last 12 months; else ok',
      });
    };
    curve('s10y3m', '10-year minus 3-month Treasury spread');
    curve('s10y2y', '10-year minus 2-year Treasury spread');
    if (byKey.sahm?.latest) {
      const v = byKey.sahm.latest.value;
      watch.push({ key: 'sahm', label: 'Sahm rule (real-time)', meta: byKey.sahm.meta, latest: v, date: byKey.sahm.latest.date, threshold: 0.5, triggered: v >= 0.5,
        status: v >= 0.5 ? 'warning' : v >= 0.3 ? 'watch' : 'ok', rule: 'warning: >= 0.50; watch: >= 0.30; else ok' });
    }
    if (byKey.claims?.extra?.avg4wYearAgo) {
      const x = byKey.claims.extra;
      const ch = (x.avg4w / x.avg4wYearAgo - 1) * 100;
      watch.push({ key: 'claims', label: 'Initial jobless claims, 4-week average vs a year ago', meta: byKey.claims.meta, latest: x.avg4w, date: x.avg4wDate, yearAgo: x.avg4wYearAgo, yearAgoDate: x.avg4wYearAgoDate, changePct: round(ch, 1),
        status: ch >= 20 ? 'warning' : ch >= 10 ? 'watch' : 'ok', rule: 'warning: 4-week average up >= 20% on a year ago; watch: >= 10%; else ok' });
    }
    if (byKey.baaSpread?.latest || byKey.hySpread?.latest) {
      const b = byKey.baaSpread, h = byKey.hySpread;
      const p = b?.percentile;
      watch.push({ key: 'credit', label: 'Credit spreads', meta: b?.meta || h?.meta,
        highYield: h?.latest ? { value: h.latest.value, date: h.latest.date, percentile: h.percentile, since: h.percentileSince } : null,
        baa: b?.latest ? { value: b.latest.value, date: b.latest.date, percentile: b.percentile, since: b.percentileSince } : null,
        status: p == null ? 'unknown' : p >= 80 ? 'warning' : p >= 60 ? 'watch' : 'ok', rule: 'Based on the Baa-Treasury spread percentile since 1986 (long history): warning >= 80th, watch >= 60th, else ok' });
    }
    if (byKey.nfci?.latest) {
      const v = byKey.nfci.latest.value;
      watch.push({ key: 'nfci', label: 'Chicago Fed financial conditions', meta: byKey.nfci.meta, latest: v, date: byKey.nfci.latest.date, status: v > 0.25 ? 'warning' : v > 0 ? 'watch' : 'ok', rule: 'positive = tighter than average. warning: > 0.25; watch: > 0; else ok' });
    }
    let recProb = null;
    if (ny?.data) {
      const { prob, spread } = ny.data;
      const v = prob.values.at(-1);
      recProb = {
        key: 'recessionProbability', label: 'NY Fed probability of a US recession 12 months ahead',
        meta: meta({ ok: !ny.stale, stale: ny.stale, error: ny.error, fetchedAt: ny.t, source: `Federal Reserve Bank of New York yield-curve model (${NYFED_URL})`, asOf: spread.dates.at(-1) }),
        latest: round(v, 1), forMonth: prob.dates.at(-1), basedOnSpreadMonth: spread.dates.at(-1), spreadUsed: round(spread.values.at(-1), 3),
        history: { note: 'probability (%) dated by the month it refers to (12 months after the spread it uses)', dates: prob.dates, values: prob.values.map(x => round(x, 1)) },
        status: v >= 50 ? 'warning' : v >= 30 ? 'watch' : 'ok', rule: 'warning: >= 50%; watch: >= 30%; else ok',
      };
      watch.push(recProb);
    } else {
      watch.push({ key: 'recessionProbability', meta: meta({ ok: false, error: ny?.error, source: NYFED_URL }), status: 'unknown' });
    }

    // Fed path
    let fedPath;
    try {
      const contracts = fedFuturesSymbols(new Date(), 13);
      const res = await cached('fed-futures', 10 * 60000, async () => {
        const q = await yahoo.bgQuotes(contracts.map(c => c.symbol));
        return Object.fromEntries([...q].map(([k, v]) => [k, { regularMarketPrice: v.regularMarketPrice, regularMarketTime: v.regularMarketTime, regularMarketVolume: v.regularMarketVolume }]));
      }, { disk: true });
      const qm = new Map(Object.entries(res.data));
      const effr = byKey.fedFunds?.latest?.value ?? null;
      const rows = impliedFedPath(contracts, qm, effr, Math.floor(Date.now() / 1000));
      const okRows = rows.filter(r => r.impliedRatePct != null).length;
      reportResult('macro:fedFutures', res, { source: 'Yahoo Finance ZQ*.CBT', asOf: new Date(res.t).toISOString(), ttlMs: 10 * 60000 });
      fedPath = {
        meta: meta({ ok: okRows >= 6, stale: res.stale, error: res.error, fetchedAt: res.t, source: 'CBOT 30-day fed funds futures via Yahoo Finance (ZQ{month}{yy}.CBT)', asOf: new Date(res.t).toISOString(),
          note: 'Implied rate = 100 - futures price = expected AVERAGE effective fed funds rate for that calendar month. Quotes may be delayed.' }),
        effectiveRatePct: effr, targetRange: byKey.fedFunds?.extra?.targetRange ?? null,
        months: rows,
      };
    } catch (err) {
      reportError('macro:fedFutures', err);
      fedPath = { meta: meta({ ok: false, error: err.message, source: 'Yahoo Finance ZQ*.CBT' }), months: [] };
    }

    // FOMC + calendar
    const today = new Date().toISOString().slice(0, 10);
    let fomcBlock;
    if (fomcR?.data) {
      const upcoming = fomcR.data.filter(m => m.end >= today);
      fomcBlock = {
        meta: meta({ ok: !fomcR.stale, stale: fomcR.stale, error: fomcR.error, fetchedAt: fomcR.t, source: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', asOf: today, note: 'Regularly scheduled meetings only. sep = meeting with a Summary of Economic Projections. Decisions are announced on the last day at 2:00 pm ET.' }),
        next: upcoming[0] || null,
        upcoming: upcoming.slice(0, 8),
      };
    } else fomcBlock = { meta: meta({ ok: false, error: fomcR?.error, source: 'federalreserve.gov' }), next: null, upcoming: [] };

    const horizon = new Date(Date.now() + 120 * 864e5).toISOString().slice(0, 10); // next ~4 months
    const events = [];
    const calMetas = {};
    CAL_FEEDS.forEach((f, k) => {
      const r = cals[k];
      calMetas[f.key] = meta({ ok: !!r?.data && !r.stale, stale: !!r?.stale, error: r?.error ?? null, fetchedAt: r?.t, source: f.url, asOf: r?.data ? r.data.map(e => e.date).sort().at(-1) : null, note: r?.data ? `feed covers through ${r.data.map(e => e.date).sort().at(-1)}` : undefined });
      if (!r?.data) return;
      for (const e of r.data) if (e.date >= today && e.date <= horizon && f.pick(e.title)) events.push({ ...e, source: f.key.toUpperCase() });
    });
    for (const m of fomcBlock.upcoming) if (m.end <= horizon) events.push({ title: `FOMC rate decision${m.sep ? ' + economic projections' : ''}`, date: m.end, timeET: '14:00', source: 'FED' });
    events.sort((a, b) => (a.date + (a.timeET || '')).localeCompare(b.date + (b.timeET || '')));

    return {
      generatedAt: new Date().toISOString(),
      series,
      recessions,
      recessionWatch: { meta: meta({ ok: watch.some(w => w.status !== 'unknown'), source: 'derived from FRED + NY Fed', asOf: today, note: 'Status flags apply the stated rule mechanically. They describe data, not a forecast or advice.' }), items: watch },
      fedPath,
      fomc: fomcBlock,
      calendar: { meta: { ...calMetas, fomc: fomcBlock.meta }, note: 'Major scheduled US releases (CPI, PPI, jobs report, JOLTS, ECI, GDP, PCE) and FOMC decisions over the next 120 days. Times are US Eastern. If a feed does not yet cover the whole window its last date is shown in meta.', events },
    };
  }

  async function get() {
    if (built && Date.now() - built.t < 10 * 60000) return built.data;
    if (!building) building = build().then(d => { built = { t: Date.now(), data: d }; return d; }).finally(() => { building = null; });
    if (built) return built.data; // serve the previous build while refreshing
    return building;
  }

  return { get, warm: () => get().catch(err => reportError('macro', err)) };
}
