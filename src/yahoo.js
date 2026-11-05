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

async function getJSON(url, { auth = false, retries = 2 } = {}) {
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
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 120)}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(600 * (attempt + 1));
    }
  }
  throw new Error('request failed: ' + url.slice(0, 120));
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
