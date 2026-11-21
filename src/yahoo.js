// Minimal Yahoo Finance client (no API key). Handles cookie + crumb auth,
// batching and light retry logic.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const Q1 = 'https://query1.finance.yahoo.com';
const Q2 = 'https://query2.finance.yahoo.com';

let cookie = '';
let crumb = '';
let authPromise = null;

async function authenticate() {
  const res = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  cookie = set.map(s => s.split(';')[0]).join('; ');
  const r2 = await fetch(`${Q2}/v1/test/getcrumb`, { headers: { 'User-Agent': UA, cookie } });
  crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.includes('<')) throw new Error(`crumb failed (${r2.status})`);
}

async function ensureAuth(force = false) {
  if (crumb && !force) return;
  if (!authPromise) authPromise = authenticate().finally(() => { authPromise = null; });
  await authPromise;
}

async function getJSON(url, { auth = false, retries = 2, notFoundOK = false } = {}) {
  let lastStatus = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (auth) await ensureAuth();
      const full = auth ? `${url}${url.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(crumb)}` : url;
      const res = await fetch(full, {
        headers: { 'User-Agent': UA, Accept: 'application/json', ...(auth ? { cookie } : {}) },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 401 || res.status === 403) {
        await ensureAuth(true);
        continue;
      }
      if (res.status === 429) {
        lastStatus = 429;
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (res.status === 404 && notFoundOK) return null;
      if (!res.ok) { const e = new Error(`HTTP ${res.status} ${url.slice(0, 120)}`); e.status = res.status; throw e; }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(600 * (attempt + 1));
    }
  }
  const e = new Error(`request failed${lastStatus ? ` (HTTP ${lastStatus})` : ''}: ` + url.slice(0, 120));
  e.status = lastStatus;
  throw e;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await fn(items[idx]); } catch (e) { results[idx] = null; console.warn('[yahoo]', e.message); }
    }
  });
  await Promise.all(workers);
  return results;
}

/** Live quotes for any number of symbols. Returns Map(symbol -> quote). */
export async function quotes(symbols) {
  const out = new Map();
  const batches = chunk(symbols, 180);
  const res = await pool(batches, 3, b =>
    getJSON(`${Q1}/v7/finance/quote?symbols=${encodeURIComponent(b.join(','))}`, { auth: true }));
  for (const j of res) {
    for (const q of j?.quoteResponse?.result || []) out.set(q.symbol, q);
  }
  return out;
}

/** Close history (spark) for many symbols. Returns Map(symbol -> {t:[], c:[]}). */
export async function spark(symbols, range = '1y', interval = '1d') {
  const out = new Map();
  const batches = chunk(symbols, 20);
  const res = await pool(batches, 4, b =>
    getJSON(`${Q1}/v7/finance/spark?symbols=${encodeURIComponent(b.join(','))}&range=${range}&interval=${interval}`));
  for (const j of res) {
    for (const r of j?.spark?.result || []) {
      const resp = r.response?.[0];
      if (!resp) continue;
      const t = resp.timestamp || [];
      const c = resp.indicators?.quote?.[0]?.close || [];
      const ts = [], cs = [];
      for (let k = 0; k < t.length; k++) {
        if (c[k] != null && isFinite(c[k])) { ts.push(t[k]); cs.push(c[k]); }
      }
      out.set(r.symbol, { t: ts, c: cs, prevClose: resp.meta?.chartPreviousClose ?? resp.meta?.previousClose, tz: resp.meta?.exchangeTimezoneName });
    }
  }
  return out;
}

/** OHLCV chart for one symbol. */
export async function chart(symbol, range = '6mo', interval = '1d') {
  const j = await getJSON(`${Q1}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`);
  const r = j?.chart?.result?.[0];
  if (!r) return { meta: {}, bars: [] };
  const t = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const bars = [];
  for (let i = 0; i < t.length; i++) {
    if (q.open?.[i] == null || q.close?.[i] == null) continue;
    bars.push({ time: t[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] || 0 });
  }
  return { meta: r.meta, bars };
}

// ---------------------------------------------------------------------------
// Background requests (research / long-term datasets).
// These go through a separate gate so they can never crowd out the live
// quote loop: at most 2 in flight, >=350 ms apart, and a shared cool-down
// that doubles (1 -> 16 min) whenever Yahoo answers 429.
// ---------------------------------------------------------------------------
const gate = { active: 0, queue: [], last: 0, cooldownUntil: 0, cooldownMs: 60000, throttled: 0 };
const GATE_LIMIT = 2, GATE_SPACING = 350;

function pump() {
  if (gate.active >= GATE_LIMIT || !gate.queue.length) return;
  const now = Date.now();
  const wait = Math.max(gate.cooldownUntil - now, gate.last + GATE_SPACING - now, 0);
  if (wait > 0) {
    if (!gate.timer) gate.timer = setTimeout(() => { gate.timer = null; pump(); }, wait);
    return;
  }
  const job = gate.queue.shift();
  gate.active++; gate.last = Date.now();
  job.run().then(job.resolve, job.reject).finally(() => { gate.active--; pump(); });
  pump();
}

/** Queue a Yahoo JSON request behind the background gate. */
export function bgJSON(url, opts = {}) {
  // Testing hook (see src/net.js): MP_FAIL_HOSTS=yahoo fails background Yahoo requests only.
  if ((process.env.MP_FAIL_HOSTS || '').split(',').some(h => h && url.includes(h.trim()))) return Promise.reject(new Error('simulated failure (MP_FAIL_HOSTS)'));
  // Interactive requests (a user opened a page) go to the front of the queue and fail
  // fast during a 429 cool-down so callers can fall back to their cache instead of hanging.
  const { interactive = false, ...rest } = opts;
  opts = rest;
  if (interactive && gate.cooldownUntil > Date.now()) {
    const e = new Error(`Yahoo is rate-limiting background requests; retry after ${new Date(gate.cooldownUntil).toISOString()}`);
    e.status = 503;
    return Promise.reject(e);
  }
  return new Promise((resolve, reject) => {
    gate.queue[interactive ? 'unshift' : 'push']({
      resolve, reject,
      run: async () => {
        try {
          const j = await getJSON(url, { retries: 1, ...opts });
          gate.cooldownMs = 60000;
          return j;
        } catch (err) {
          if (err.status === 429) {
            gate.throttled++;
            gate.cooldownUntil = Date.now() + gate.cooldownMs;
            console.warn(`[yahoo] 429 on background request, pausing ${gate.cooldownMs / 1000}s`);
            gate.cooldownMs = Math.min(gate.cooldownMs * 2, 16 * 60000);
          }
          throw err;
        }
      },
    });
    pump();
  });
}

export function gateStatus() {
  return { queued: gate.queue.length, active: gate.active, coolingDown: gate.cooldownUntil > Date.now(), cooldownUntil: gate.cooldownUntil || null, throttled429: gate.throttled };
}

const okNum = v => (typeof v === 'number' && isFinite(v) ? v : null);

/**
 * Daily/weekly/monthly closes with dividend-adjusted closes and dividend events.
 * Accepts either a range ('max', '10y', ...) or explicit period1/period2 (unix s).
 * Bars with a null close are dropped. Returns
 *   { meta, t:[unix s], c:[raw close], adj:[adj close], v:[volume], div:[{t, amount}] }
 */
export async function history(symbol, { range = null, period1 = null, period2 = null, interval = '1d', interactive = false } = {}) {
  // range=max silently downgrades daily/weekly bars to MONTHLY on Yahoo, so ask for
  // an explicit period starting 1900 instead (Yahoo clips it to the first trade).
  if (range === 'max') { range = null; period1 = period1 ?? -2208988800; }
  const span = range ? `range=${range}` : `period1=${period1 ?? -2208988800}&period2=${period2 ?? Math.floor(Date.now() / 1000)}`;
  const j = await bgJSON(`${Q1}/v8/finance/chart/${encodeURIComponent(symbol)}?${span}&interval=${interval}&events=div%2Csplit&includePrePost=false`, { notFoundOK: true, interactive });
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const t = r.timestamp || [];
  const close = r.indicators?.quote?.[0]?.close || [];
  const vol = r.indicators?.quote?.[0]?.volume || [];
  const adjc = r.indicators?.adjclose?.[0]?.adjclose || [];
  const out = { meta: r.meta || {}, t: [], c: [], adj: [], v: [], div: [] };
  for (let i = 0; i < t.length; i++) {
    const c = okNum(close[i]);
    if (c == null || c <= 0) continue;
    out.t.push(t[i]); out.c.push(c);
    const a = okNum(adjc[i]);
    out.adj.push(a != null && a > 0 ? a : c);
    out.v.push(okNum(vol[i]) ?? 0);
  }
  const divs = r.events?.dividends || {};
  for (const k of Object.keys(divs)) { const d = divs[k]; if (okNum(d.amount)) out.div.push({ t: d.date, amount: d.amount }); }
  out.div.sort((a, b) => a.t - b.t);
  return out;
}

/** quoteSummary (v10) modules for one symbol. Returns the raw result object or null. */
export async function quoteSummary(symbol, modules, { interactive = false } = {}) {
  const j = await bgJSON(`${Q1}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join('%2C')}&formatted=false`, { auth: true, notFoundOK: true, interactive });
  return j?.quoteSummary?.result?.[0] || null;
}

/**
 * fundamentals-timeseries: returns { type -> [{ date:'YYYY-MM-DD', value }] } sorted by date.
 * Types look like 'annualTotalRevenue', 'quarterlyNetIncome', 'trailingFreeCashFlow'.
 */
export async function timeseries(symbol, types, period1 = 1262304000, { interactive = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const j = await bgJSON(`${Q1}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${types.join('%2C')}&period1=${period1}&period2=${now}&merge=false&padTimeSeries=false`, { auth: true, notFoundOK: true, interactive });
  const out = {};
  for (const r of j?.timeseries?.result || []) {
    const type = r.meta?.type?.[0];
    if (!type) continue;
    out[type] = (r[type] || []).filter(Boolean).map(x => ({ date: x.asOfDate, value: okNum(x.reportedValue?.raw) })).filter(x => x.value != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  return out;
}

/** Quotes for a small set of symbols through the background gate (research pages). */
export async function bgQuotes(symbols) {
  const out = new Map();
  for (const b of chunk(symbols, 150)) {
    const j = await bgJSON(`${Q1}/v7/finance/quote?symbols=${encodeURIComponent(b.join(','))}`, { auth: true });
    for (const q of j?.quoteResponse?.result || []) out.set(q.symbol, q);
  }
  return out;
}

/** News search. */
export async function news(query, count = 10) {
  const j = await getJSON(`${Q1}/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0&enableFuzzyQuery=false`);
  return (j?.news || []).map(n => ({
    id: n.uuid,
    title: n.title,
    publisher: n.publisher,
    link: n.link,
    time: n.providerPublishTime,
    tickers: n.relatedTickers || [],
    thumb: n.thumbnail?.resolutions?.find(r => r.tag === '140x140')?.url || n.thumbnail?.resolutions?.[0]?.url || null,
  }));
}

/** Symbol search (autocomplete). */
export async function search(query, count = 8) {
  const j = await getJSON(`${Q1}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${count}&newsCount=0&enableFuzzyQuery=false`);
  return (j?.quotes || []).filter(q => q.symbol).map(q => ({ s: q.symbol, n: q.shortname || q.longname || q.symbol, type: q.quoteType, exch: q.exchDisp }));
}

export async function treasuryCurve(year) {
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('treasury ' + res.status);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map(h => h.replace(/"/g, ''));
  return lines.slice(1).map(l => {
    const cells = l.split(',');
    const row = { date: cells[0] };
    header.slice(1).forEach((h, i) => { const v = parseFloat(cells[i + 1]); if (isFinite(v)) row[h] = v; });
    return row;
  });
}

export const util = { chunk, pool, sleep, UA };
