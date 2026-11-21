// Market Pulse — local live market dashboard server.
// Run: node server.js   then open http://localhost:3000
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as yahoo from './src/yahoo.js';
import { loadUniverse } from './src/universe.js';
import { macroSymbols, intradaySymbols, SECTORS } from './src/config.js';
import { buildSnapshot, computeHistoryStats, computeSparks, compactQuote } from './src/engine.js';
import { allStatus, meta as sectionMeta } from './src/store.js';
import { computeValuation } from './src/valuation.js';
import { createLongTerm } from './src/longterm.js';
import { createFundamentals } from './src/fundamentals.js';
import { createCompany } from './src/company.js';
import { createETFs } from './src/etfs.js';
import { createMacro } from './src/macro.js';
import { getHistory, HISTORY_RANGES, HISTORY_INTERVALS } from './src/history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
// Listens on this PC only by default; set HOST to change the bind address.
const HOST = process.env.HOST || '127.0.0.1';
// Optional: set SITE_PASSWORD to ask visitors for a password (any username works).
const SITE_PASSWORD = process.env.SITE_PASSWORD || '';
const PUBLIC = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');

const VENDOR = {
  '/vendor/d3.min.js': 'node_modules/d3/dist/d3.min.js',
  '/vendor/lightweight-charts.js': 'node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js',
  '/vendor/topojson-client.min.js': 'node_modules/topojson-client/dist/topojson-client.min.js',
  '/vendor/countries-50m.json': 'node_modules/world-atlas/countries-50m.json',
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  universe: [],
  quotes: new Map(),
  hist: new Map(),
  hist2: new Map(), // 2-year daily history for the few series used by Fear & Greed history and worst-day-since context
  intraday: new Map(),
  curve: null,
  histStats: null,
  sparks: {},
  sparksVersion: 0,
  news: [],
  status: { quotes: null, history: null, intraday: null, news: null, curve: null, errors: [] },
};
let snapshot = null;
let snapshotJSON = '';
const clients = new Set();
const bootedAt = Date.now();

// ---------------------------------------------------------------------------
// Research / long-term services (lazy; see src/*.js)
// ---------------------------------------------------------------------------
const getState = () => state;
const getQuote = sym => state.quotes.get(sym) || null;

/** Valuation of today's S&P 500 from the live constituent quotes (formulas in src/valuation.js). */
let valuationCache = null;
function getValuation() {
  if (valuationCache && valuationCache.v === state.status.quotes) return valuationCache.data;
  if (!state.status.quotes) return { meta: sectionMeta({ ok: false, source: 'Yahoo v7 quotes', error: 'quotes not loaded yet' }) };
  const tnx = state.quotes.get('^TNX')?.regularMarketPrice;
  const v = computeValuation(state.universe, state.quotes, tnx, SECTORS.map(s => s.name), { fyEnd: ys => fundamentals.enrichment(ys)?.nextFiscalYearEnd ?? null });
  const data = {
    meta: sectionMeta({ ok: true, source: 'Yahoo v7 quotes for every S&P 500 constituent (live) + ^TNX', asOf: new Date(state.status.quotes).toISOString(),
      note: 'Cap-weighted aggregates: sum of market caps / sum of earnings (loss-makers included). Full (not float-adjusted) caps, so weights differ slightly from S&P\'s official ones. Formulas: src/valuation.js.' }),
    ...v,
  };
  valuationCache = { v: state.status.quotes, data };
  return data;
}

const longterm = createLongTerm({ getQuote, getValuation });
const fundamentals = createFundamentals({ getState });
const company = createCompany({ getState, getEnrichment: ys => fundamentals.enrichment(ys) });
const etfs = createETFs({ getQuote });
const macro = createMacro();

function logErr(where, err) {
  const msg = `${new Date().toLocaleTimeString()} ${where}: ${err.message || err}`;
  console.warn('[warn]', msg);
  state.status.errors = [msg, ...state.status.errors].slice(0, 5);
}

// ---------------------------------------------------------------------------
// Refresh jobs
// ---------------------------------------------------------------------------
async function refreshQuotes() {
  const syms = [...state.universe.map(u => u.ys), ...macroSymbols()];
  const q = await yahoo.quotes([...new Set(syms)]);
  if (q.size < 50) throw new Error(`only ${q.size} quotes returned`);
  for (const [k, v] of q) state.quotes.set(k, v);
  state.status.quotes = Date.now();
}

async function refreshHistory() {
  const syms = [...state.universe.map(u => u.ys), ...macroSymbols()];
  const h = await yahoo.spark([...new Set(syms)], '1y', '1d');
  if (h.size < 50) throw new Error(`only ${h.size} histories returned`);
  for (const [k, v] of h) state.hist.set(k, v);
  const h2 = await yahoo.spark(['^GSPC', '^NDX', '^VIX', '^VIX3M', 'SPY', 'TLT', 'HYG', 'LQD'], '2y', '1d').catch(() => new Map());
  for (const [k, v] of h2) state.hist2.set(k, v);
  state.histStats = computeHistoryStats(state.universe, state.hist, state.hist2);
  state.sparks = computeSparks([...state.hist.keys()], state.hist);
  state.sparksVersion = Date.now();
  state.status.history = Date.now();
}

async function refreshIntraday() {
  const h = await yahoo.spark(intradaySymbols(), '1d', '5m');
  for (const [k, v] of h) state.intraday.set(k, v.c.map(x => Math.round(x * 1000) / 1000));
  state.status.intraday = Date.now();
}

async function refreshNews() {
  const queries = ['stock market', 'Wall Street stocks', 'Federal Reserve', 'Treasury yields', 'oil prices', 'bitcoin', 'earnings'];
  const results = await yahoo.util.pool(queries, 3, q => yahoo.news(q, 10));
  const seen = new Set();
  const all = [];
  for (const list of results) for (const n of list || []) {
    if (!n.title || seen.has(n.id)) continue;
    seen.add(n.id); all.push(n);
  }
  all.sort((a, b) => b.time - a.time);
  state.news = all.slice(0, 40);
  state.status.news = Date.now();
}

async function refreshCurve() {
  const yr = new Date().getFullYear();
  const [cur, prev] = await Promise.all([yahoo.treasuryCurve(yr), yahoo.treasuryCurve(yr - 1).catch(() => [])]);
  const rows = [...cur, ...prev].filter(r => r['10 Yr']);
  const parse = d => { const [m, dd, y] = d.split('/'); return new Date(+y, +m - 1, +dd); };
  rows.sort((a, b) => parse(b.date) - parse(a.date));
  if (!rows.length) throw new Error('empty treasury curve');
  const latest = rows[0];
  const ld = parse(latest.date);
  const near = days => rows.find(r => (ld - parse(r.date)) / 864e5 >= days) || rows.at(-1);
  const tenors = ['1 Mo', '3 Mo', '6 Mo', '1 Yr', '2 Yr', '3 Yr', '5 Yr', '7 Yr', '10 Yr', '20 Yr', '30 Yr'];
  const pickRow = r => ({ date: r.date, y: tenors.map(t => r[t] ?? null) });
  const series = rows.slice(0, 260).reverse().map(r => ({ d: r.date, s2s10: r['10 Yr'] - r['2 Yr'], s3m10: r['10 Yr'] - r['3 Mo'], y10: r['10 Yr'], y2: r['2 Yr'] }));
  state.curve = { tenors, latest: pickRow(latest), week: pickRow(near(7)), month: pickRow(near(30)), year: pickRow(near(365)), series };
  state.status.curve = Date.now();
}

function rebuild() {
  try {
    snapshot = buildSnapshot(state);
    snapshot.sparksVersion = state.sparksVersion;
    snapshotJSON = JSON.stringify(snapshot);
    const msg = `event: snapshot\ndata: ${snapshotJSON}\n\n`;
    for (const res of clients) res.write(msg);
  } catch (err) {
    logErr('snapshot', err);
  }
}

function usMarketOpen() {
  const s = state.quotes.get('^GSPC')?.marketState;
  return s === 'REGULAR' || s === 'PRE' || s === 'POST';
}

function loop(name, fn, intervalFn) {
  let running = false;
  const tick = async () => {
    if (!running) {
      running = true;
      try { await fn(); rebuild(); } catch (err) { logErr(name, err); }
      running = false;
    }
    setTimeout(tick, intervalFn());
  };
  return tick;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function sendJSON(res, code, obj) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body);
}

/** JSON for the research endpoints: gzip when the client accepts it and the body is large. */
function sendBigJSON(req, res, obj) {
  const body = JSON.stringify(obj);
  if (body.length < 20000 || !/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return sendJSON(res, 200, body);
  zlib.gzip(body, { level: 6 }, (err, buf) => {
    if (err) return sendJSON(res, 200, body);
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    res.end(buf);
  });
}

const chartCache = new Map();
// [yahoo range, interval, visible window in days (null = all)]. Daily ranges fetch
// extra history so the 50/200-day moving averages are complete on screen.
const RANGES = {
  '1D': ['1d', '5m', null], '5D': ['5d', '15m', null], '1M': ['1mo', '60m', null], '6M': ['2y', '1d', 183],
  'YTD': ['2y', '1d', 'ytd'], '1Y': ['2y', '1d', 366], '5Y': ['10y', '1wk', 5 * 366],
};

async function handleAPI(req, res, url) {
  const p = url.pathname;
  if (p === '/api/snapshot') {
    if (!snapshotJSON) return sendJSON(res, 503, { loading: true });
    return sendJSON(res, 200, snapshotJSON);
  }
  if (p === '/api/sparks') return sendJSON(res, 200, { v: state.sparksVersion, sparks: state.sparks });
  if (p === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    if (snapshotJSON) res.write(`event: snapshot\ndata: ${snapshotJSON}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clients.delete(res); clearInterval(ping); });
    return;
  }
  if (p === '/api/chart') {
    const sym = url.searchParams.get('s');
    const r = RANGES[url.searchParams.get('r')] || RANGES['6M'];
    if (!sym || !/^[\w^.=\-]{1,20}$/.test(sym)) return sendJSON(res, 400, { error: 'bad symbol' });
    const key = `${sym}|${r[0]}|${r[1]}|${r[2]}`;
    const hit = chartCache.get(key);
    if (hit && Date.now() - hit.t < 30000) return sendJSON(res, 200, hit.data);
    try {
      const data = await yahoo.chart(sym, r[0], r[1]);
      if (r[2] === 'ytd') data.visibleFrom = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);
      else if (r[2]) data.visibleFrom = Math.floor(Date.now() / 1000 - r[2] * 86400);
      chartCache.set(key, { t: Date.now(), data });
      if (chartCache.size > 300) chartCache.delete(chartCache.keys().next().value);
      return sendJSON(res, 200, data);
    } catch (err) { return sendJSON(res, 502, { error: err.message }); }
  }
  if (p === '/api/quote') {
    const sym = url.searchParams.get('s');
    if (!sym || !/^[\w^.=\-]{1,20}$/.test(sym)) return sendJSON(res, 400, { error: 'bad symbol' });
    try {
      const q = (await yahoo.quotes([sym])).get(sym);
      if (!q) return sendJSON(res, 404, { error: 'not found' });
      const c = compactQuote(sym, q, state.hist);
      return sendJSON(res, 200, {
        ...c,
        n: q.longName || q.shortName || sym,
        type: q.quoteType, exch: q.fullExchangeName, cur: q.currency,
        pe: q.trailingPE ?? null, fpe: q.forwardPE ?? null, eps: q.epsTrailingTwelveMonths ?? null,
        dy: q.dividendYield ?? null, rating: q.averageAnalystRating ?? null, pb: q.priceToBook ?? null,
        earn: q.earningsTimestamp ?? null, earnNext: q.earningsTimestampStart ?? null, earnEst: !!q.isEarningsDateEstimate,
        delay: q.exchangeDataDelayedBy ?? 0,
      });
    } catch (err) { return sendJSON(res, 502, { error: err.message }); }
  }
  if (p === '/api/search') {
    const q = (url.searchParams.get('q') || '').slice(0, 30);
    if (!q) return sendJSON(res, 200, []);
    try { return sendJSON(res, 200, await yahoo.search(q, 8)); }
    catch (err) { return sendJSON(res, 502, { error: err.message }); }
  }
  if (p === '/api/news') {
    const q = (url.searchParams.get('q') || '').slice(0, 40);
    if (!q) return sendJSON(res, 400, { error: 'missing q' });
    try { return sendJSON(res, 200, await yahoo.news(q, 12)); }
    catch (err) { return sendJSON(res, 502, { error: err.message }); }
  }
  const route = ROUTES[p];
  if (route) {
    try {
      const out = await route(url);
      if (out && out.__status) return sendJSON(res, out.__status, out.body);
      return sendBigJSON(req, res, out);
    } catch (err) {
      if (err.status !== 404) logErr(p, err);
      return sendJSON(res, err.status === 404 ? 404 : err.status === 503 ? 503 : 502, { error: err.message || 'upstream error' });
    }
  }
  sendJSON(res, 404, { error: 'not found' });
}

// ---------------------------------------------------------------------------
// Research / long-term / macro routes. Every query parameter is whitelisted.
// ---------------------------------------------------------------------------
const SYM_RE = /^[\w^.=\-]{1,20}$/;
const bad = msg => ({ __status: 400, body: { error: msg } });
const symParam = url => {
  const s = (url.searchParams.get('s') || '').trim().toUpperCase();
  return SYM_RE.test(s) ? s : null;
};

const ROUTES = {
  '/api/longterm': () => longterm.get(),
  '/api/valuation': () => getValuation(),
  '/api/fundamentals': () => fundamentals.get(),
  '/api/company': url => {
    const s = symParam(url);
    return s ? company.get(s) : bad('bad symbol');
  },
  '/api/history': url => {
    const s = symParam(url);
    const range = url.searchParams.get('range') || '5y';
    const interval = url.searchParams.get('interval') || '1d';
    if (!s) return bad('bad symbol');
    if (!HISTORY_RANGES.includes(range)) return bad(`range must be one of ${HISTORY_RANGES.join(', ')}`);
    if (!HISTORY_INTERVALS.includes(interval)) return bad(`interval must be one of ${HISTORY_INTERVALS.join(', ')}`);
    return getHistory(s, range, interval);
  },
  '/api/etfs': () => etfs.get(),
  '/api/macro': () => macro.get(),
  '/api/status': () => statusPayload(),
};

function statusPayload() {
  const iso = t => (t ? new Date(t).toISOString() : null);
  const live = [
    ['quotes', 'Yahoo v7 quotes (S&P 500 + macro symbols)', usMarketOpen() ? 15000 : 45000],
    ['history', 'Yahoo 1-year daily spark history', 20 * 60000],
    ['intraday', 'Yahoo 5-minute intraday sparks', 60000],
    ['news', 'Yahoo news search', 3 * 60000],
    ['curve', 'US Treasury daily yield curve', 3 * 3600000],
  ].map(([k, source, every]) => ({
    name: `dashboard:${k}`, source, ok: !!state.status[k], asOf: iso(state.status[k]), fetchedAt: state.status[k] || null,
    nextRefresh: state.status[k] ? state.status[k] + every : null, error: null,
  }));
  return {
    now: new Date().toISOString(),
    uptimeSec: Math.round((Date.now() - bootedAt) / 1000),
    recentErrors: state.status.errors,
    yahooBackgroundGate: yahoo.gateStatus(),
    fundamentalsCrawl: fundamentals.crawlStatus(),
    datasets: [...live, ...allStatus()].map(d => ({ ...d, fetchedAt: iso(d.fetchedAt), nextRefresh: iso(d.nextRefresh), updated: iso(d.updated), lastErrorAt: iso(d.lastErrorAt), startedAt: iso(d.startedAt), finishedAt: iso(d.finishedAt), nextRun: iso(d.nextRun) })),
  };
}

async function serveStatic(req, res, url) {
  let rel = VENDOR[url.pathname];
  let file;
  if (rel) file = path.join(__dirname, rel);
  else {
    const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  }
  if (!existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': rel ? 'max-age=86400' : 'no-cache' });
  createReadStream(file).pipe(res);
}

function passwordOK(req) {
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
  const want = Buffer.from(SITE_PASSWORD);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // Simple health check; stays open even when a password is set.
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (SITE_PASSWORD && !passwordOK(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Market Pulse", charset="UTF-8"', 'Content-Type': 'text/plain' });
    return res.end('Password required');
  }
  try {
    if (url.pathname.startsWith('/api/')) return await handleAPI(req, res, url);
    return await serveStatic(req, res, url);
  } catch (err) {
    logErr('http', err);
    if (!res.headersSent) sendJSON(res, 500, { error: 'server error' });
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main() {
  await fs.mkdir(DATA, { recursive: true });
  state.universe = await loadUniverse(DATA);
  console.log(`[boot] ${state.universe.length} S&P 500 constituents loaded`);

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${PORT} is already in use. Market Pulse may already be running in another window;\n  close it, or start on another port (for example: set PORT=3005, then start again).\n`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(PORT, HOST, () => {
    console.log(`\n  MARKET PULSE running  →  http://localhost:${PORT}${HOST === '127.0.0.1' ? '' : `  (listening on ${HOST})`}${SITE_PASSWORD ? '  [password on]' : ''}\n`);
  });

  // First pass: quotes first so the page fills fast, then the rest.
  await refreshQuotes().catch(e => logErr('quotes', e));
  rebuild();
  await Promise.all([
    refreshHistory().catch(e => logErr('history', e)),
    refreshIntraday().catch(e => logErr('intraday', e)),
    refreshNews().catch(e => logErr('news', e)),
    refreshCurve().catch(e => logErr('curve', e)),
  ]);
  rebuild();
  console.log('[boot] all data loaded');

  setTimeout(loop('quotes', refreshQuotes, () => (usMarketOpen() ? 15000 : 45000)), usMarketOpen() ? 15000 : 45000);
  setTimeout(loop('intraday', refreshIntraday, () => 60000), 60000);
  setTimeout(loop('history', refreshHistory, () => 20 * 60000), 20 * 60000);
  setTimeout(loop('news', refreshNews, () => 3 * 60000), 3 * 60000);
  setTimeout(loop('curve', refreshCurve, () => 3 * 3600000), 3 * 3600000);

  // Heavy research datasets: warm in the background, one after another, after the
  // dashboard is fully up. All of them are disk-cached, so later boots are quick.
  // Set NO_BACKGROUND=1 to skip warming (endpoints still load lazily on request).
  if (!process.env.NO_BACKGROUND) {
    const later = (ms, fn) => setTimeout(() => fn().catch(e => logErr('warm', e)), ms);
    later(20000, () => longterm.ensure());
    later(45000, () => macro.warm());
    later(90000, () => etfs.warm());
    fundamentals.schedule(150000);
    setInterval(() => longterm.ensure().catch(e => logErr('longterm', e)), 6 * 3600000).unref();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
