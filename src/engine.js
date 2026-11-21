// Turns raw quotes + history into the dashboard snapshot: heatmap data,
// sector rotation, breadth, risk-on/off, fear & greed and the market brief.
import {
  STRIP, SECTORS, THEMES, ASSETS, RISK_PAIRS, GLOBAL, CRYPTO, COMMODITIES, FX, RATES, VOL, FUTURES,
} from './config.js';
import { classCaps } from './shareclass.js';

const isCrypto = s => /-USD$/.test(s);
const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

const dayKeyFmt = new Map();
function dayKey(ts, tz = 'America/New_York') {
  let f = dayKeyFmt.get(tz);
  if (!f) {
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); }
    catch { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }); }
    dayKeyFmt.set(tz, f);
  }
  return f.format(new Date(ts * 1000));
}

/** Prior closes (excluding the live session) for a symbol. */
function priorCloses(h, q) {
  if (!h || !h.c.length) return null;
  let n = h.c.length;
  const qt = q?.regularMarketTime;
  if (qt && dayKey(h.t[n - 1], h.tz) === dayKey(qt, h.tz)) n -= 1;
  return { c: h.c.slice(0, n), t: h.t.slice(0, n), tz: h.tz };
}

export function perfFor(sym, q, hist) {
  const price = num(q?.regularMarketPrice);
  const P = priorCloses(hist.get(sym), q);
  if (!price || !P || P.c.length < 2) return { w: null, m: null, q: null, ytd: null, y: null };
  const c = P.c;
  const back = n => (c.length >= n ? price / c[c.length - n] * 100 - 100 : null);
  const crypto = isCrypto(sym);
  // YTD: last close of the previous calendar year.
  const yr = new Date().getFullYear();
  let ytdBase = null;
  for (let i = c.length - 1; i >= 0; i--) {
    if (+dayKey(P.t[i], P.tz).slice(0, 4) < yr) { ytdBase = c[i]; break; }
  }
  return {
    w: round(back(crypto ? 7 : 5)),
    m: round(back(crypto ? 30 : 21)),
    q: round(back(crypto ? 90 : 63)),
    ytd: ytdBase ? round(price / ytdBase * 100 - 100) : null,
    y: round(price / c[0] * 100 - 100),
  };
}

function extHours(q) {
  const st = q.marketState;
  if ((st === 'PRE' || st === 'PREPRE') && num(q.preMarketChangePercent) != null) return { c: round(q.preMarketChangePercent), p: num(q.preMarketPrice), k: 'pre' };
  if ((st === 'POST' || st === 'POSTPOST' || st === 'CLOSED') && num(q.postMarketChangePercent) != null) return { c: round(q.postMarketChangePercent), p: num(q.postMarketPrice), k: 'post' };
  return null;
}

export function compactQuote(sym, q, hist) {
  if (!q) return null;
  return {
    ext: extHours(q),
    s: sym,
    n: q.shortName || q.longName || sym,
    p: num(q.regularMarketPrice),
    c: round(num(q.regularMarketChangePercent)),
    ch: num(q.regularMarketChange),
    prev: num(q.regularMarketPreviousClose),
    hi: num(q.regularMarketDayHigh),
    lo: num(q.regularMarketDayLow),
    v: num(q.regularMarketVolume),
    av: num(q.averageDailyVolume10Day) || num(q.averageDailyVolume3Month),
    mc: num(q.marketCap),
    h52: num(q.fiftyTwoWeekHigh),
    l52: num(q.fiftyTwoWeekLow),
    ma50: num(q.fiftyDayAverage),
    ma200: num(q.twoHundredDayAverage),
    st: q.marketState,
    t: q.regularMarketTime,
    perf: perfFor(sym, q, hist),
  };
}

// ---------------------------------------------------------------------------
// History-derived series (computed when daily history refreshes)
// ---------------------------------------------------------------------------
export function computeHistoryStats(universe, hist, hist2) {
  // % of S&P members above their 50-day average, and cumulative A/D line.
  const above = new Map(), total = new Map(), adv = new Map(), dec = new Map();
  for (const u of universe) {
    const h = hist.get(u.ys);
    if (!h || h.c.length < 60) continue;
    const c = h.c;
    let sum = 0;
    for (let i = 0; i < c.length; i++) {
      sum += c[i];
      if (i >= 50) sum -= c[i - 50];
      const k = dayKey(h.t[i], h.tz);
      if (i > 0) {
        if (c[i] > c[i - 1]) adv.set(k, (adv.get(k) || 0) + 1);
        else if (c[i] < c[i - 1]) dec.set(k, (dec.get(k) || 0) + 1);
      }
      if (i >= 49) {
        total.set(k, (total.get(k) || 0) + 1);
        if (c[i] > sum / 50) above.set(k, (above.get(k) || 0) + 1);
      }
    }
  }
  const spx = hist.get('^GSPC');
  const keys = spx ? spx.t.map(t => dayKey(t, spx.tz)) : [...total.keys()].sort();
  const pct50 = [], adLine = [];
  let cum = 0;
  keys.forEach((k, i) => {
    const tot = total.get(k);
    if (tot > 300) pct50.push({ d: k, v: round(above.get(k) / tot * 100, 1) });
    if (i > 0) { cum += (adv.get(k) || 0) - (dec.get(k) || 0); adLine.push({ d: k, v: cum }); }
  });
  const spxLine = spx ? spx.c.map((v, i) => ({ d: keys[i], v: round(v, 2) })) : [];
  const fearHist = fearHistory(hist2?.size ? hist2 : hist, new Map(pct50.map(p => [p.d, p.v])));
  return { pct50, adLine, spxLine, fearHist };
}

/** Daily Fear & Greed history from the 6 signals that have daily history. */
function fearHistory(hist, pct50) {
  const series = sym => {
    const h = hist.get(sym);
    if (!h) return null;
    return { keys: h.t.map(t => dayKey(t, h.tz)), c: h.c, map: new Map(h.t.map((t, i) => [dayKey(t, h.tz), h.c[i]])) };
  };
  const spx = series('^GSPC'), vix = series('^VIX'), v3 = series('^VIX3M'), spy = series('SPY'), tlt = series('TLT'), hyg = series('HYG'), lqd = series('LQD');
  if (!spx) return [];
  const idx = s => (s ? new Map(s.keys.map((k, i) => [k, i])) : new Map());
  const iSpy = idx(spy), iTlt = idx(tlt), iHyg = idx(hyg), iLqd = idx(lqd);
  const ret20 = (s, im, k) => { const i = im.get(k); return i != null && i >= 20 ? s.c[i] / s.c[i - 20] : null; };
  const out = [];
  for (let i = 125; i < spx.c.length; i++) {
    const k = spx.keys[i];
    const sc = [];
    const vx = vix?.map.get(k), vx3 = v3?.map.get(k);
    if (vx) sc.push(lin(vx, 40, 12));
    if (vx && vx3) sc.push(lin(vx / vx3, 1.15, 0.82));
    let ma = 0; for (let j = i - 125; j < i; j++) ma += spx.c[j]; ma /= 125;
    sc.push(lin((spx.c[i] / ma - 1) * 100, -8, 8));
    if (pct50.has(k)) sc.push(lin(pct50.get(k), 15, 85));
    const a = ret20(spy, iSpy, k), b = ret20(tlt, iTlt, k);
    if (a && b) sc.push(lin((a - b) * 100, -8, 8));
    const c = ret20(hyg, iHyg, k), d = ret20(lqd, iLqd, k);
    if (c && d) sc.push(lin((c - d) * 100, -2.5, 2.5));
    if (sc.length >= 4) out.push({ d: k, v: Math.round(sc.reduce((x, y) => x + y, 0) / sc.length) });
  }
  return out;
}

/** Per-symbol sparkline (last ~30 closes) used in tooltips and tiles. */
export function computeSparks(symbols, hist) {
  const out = {};
  for (const s of symbols) {
    const h = hist.get(s);
    if (h && h.c.length) out[s] = h.c.slice(-30).map(v => round(v, v < 1 ? 6 : 2));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const lin = (v, lo, hi) => clamp((v - lo) / (hi - lo) * 100);

export function buildSnapshot(state) {
  const { universe, quotes, hist, intraday, curve, histStats } = state;
  const M = {};
  const getM = s => {
    if (!(s in M)) M[s] = compactQuote(s, quotes.get(s), hist);
    return M[s];
  };

  // ---- Stocks --------------------------------------------------------------
  const stocks = [];
  // Per-ticker caps that do not double count multi-class companies (see src/shareclass.js).
  const caps = classCaps(universe, quotes);
  for (const u of universe) {
    const q = quotes.get(u.ys);
    const cq = compactQuote(u.ys, q, hist);
    if (!cq || cq.p == null) continue;
    const mc = caps.get(u.ys)?.mc ?? cq.mc;
    stocks.push({ ...cq, mc, s: u.s, ys: u.ys, n: u.n, sec: u.sec, ind: u.ind, et: num(q.earningsTimestamp), ets: num(q.earningsTimestampStart), eest: !!q.isEarningsDateEstimate });
  }
  const totalMc = stocks.reduce((a, x) => a + (x.mc || 0), 0);
  const spx = getM('^GSPC');
  const spxPrev = spx?.prev || 0;

  // ---- Sector aggregates -----------------------------------------------------
  const spy = getM('SPY');
  const sectors = SECTORS.map(sec => {
    const members = stocks.filter(x => x.sec === sec.name);
    const mc = members.reduce((a, x) => a + (x.mc || 0), 0);
    const w = (field, sub) => {
      let s = 0, wt = 0;
      for (const x of members) {
        const v = sub ? x.perf[field] : x[field];
        if (v == null || !x.mc) continue;
        s += v * x.mc; wt += x.mc;
      }
      return wt ? round(s / wt) : null;
    };
    const etf = getM(sec.etf);
    return {
      ...sec,
      count: members.length,
      mc,
      weight: totalMc ? round(mc / totalMc * 100, 1) : null,
      c: w('c'), w: w('w', true), m: w('m', true), q: w('q', true), ytd: w('ytd', true),
      adv: members.filter(x => x.c > 0).length,
      dec: members.filter(x => x.c < 0).length,
      etfQ: etf,
      rrg: rrgTrail(sec.etf, 'SPY', quotes, hist),
    };
  });

  // ---- Breadth ---------------------------------------------------------------
  const bins = [-Infinity, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3, 5, 7, 10, Infinity];
  const hist2 = new Array(bins.length - 1).fill(0);
  let adv = 0, dec = 0, unch = 0, upVol = 0, dnVol = 0, a50 = 0, a200 = 0, nh = 0, nl = 0, nearH = 0, nearL = 0;
  const reversals = [];
  for (const x of stocks) {
    if (x.c > 0) { adv++; upVol += x.v || 0; }
    else if (x.c < 0) { dec++; dnVol += x.v || 0; }
    else unch++;
    if (x.ma50 && x.p > x.ma50) a50++;
    if (x.ma200 && x.p > x.ma200) a200++;
    const touchedHigh = x.h52 && (x.hi ?? x.p) >= x.h52 * 0.999;
    if (touchedHigh) nh++;
    if (x.l52 && (x.lo ?? x.p) <= x.l52 * 1.001) nl++;
    if (x.h52 && x.p >= x.h52 * 0.98) nearH++;
    if (x.l52 && x.p <= x.l52 * 1.02) nearL++;
    // Hit a 52-week high today, then gave back 2%+ from the high (bearish reversal)
    if (touchedHigh && x.hi && x.p < x.hi * 0.98) reversals.push({ s: x.s, ys: x.ys, c: x.c, off: round((x.p / x.hi - 1) * 100) });
    for (let b = 0; b < bins.length - 1; b++) {
      if (x.c >= bins[b] && x.c < bins[b + 1]) { hist2[b]++; break; }
    }
  }
  const n = stocks.length || 1;
  const breadth = {
    n: stocks.length, adv, dec, unch, upVol, dnVol,
    above50: round(a50 / n * 100, 1), above200: round(a200 / n * 100, 1),
    newHigh: nh, newLow: nl, nearHigh: nearH, nearLow: nearL,
    reversals: reversals.sort((a, b) => a.off - b.off),
    dist: hist2.map((count, i) => ({ lo: bins[i], hi: bins[i + 1], count })),
    eqWeight: round(stocks.reduce((a, x) => a + (x.c || 0), 0) / n),
    history: histStats,
  };

  // ---- Index point contributors ----------------------------------------------
  const contrib = stocks
    .filter(x => x.mc && x.c != null)
    .map(x => ({ s: x.s, n: x.n, sec: x.sec, c: x.c, pts: round(x.mc / totalMc * (x.c / 100) * spxPrev, 2) }))
    .sort((a, b) => a.pts - b.pts);
  const contributors = { down: contrib.slice(0, 10), up: contrib.slice(-10).reverse() };

  // ---- Movers ------------------------------------------------------------------
  const byC = [...stocks].filter(x => x.c != null).sort((a, b) => b.c - a.c);
  const pick = x => ({ s: x.s, ys: x.ys, n: x.n, p: x.p, c: x.c, v: x.v, av: x.av, sec: x.sec, rv: x.av ? round(x.v / x.av, 2) : null, dv: x.p * (x.v || 0) });
  const movers = {
    gainers: byC.slice(0, 12).map(pick),
    losers: byC.slice(-12).reverse().map(pick),
    active: [...stocks].sort((a, b) => b.p * (b.v || 0) - a.p * (a.v || 0)).slice(0, 12).map(pick),
    unusual: [...stocks].filter(x => x.av > 0).sort((a, b) => b.v / b.av - a.v / a.av).slice(0, 12).map(pick),
  };

  // ---- Macro groups --------------------------------------------------------------
  const withLabel = list => list.map(x => ({ ...x, q: getM(x.s) })).filter(x => x.q);
  const strip = withLabel(STRIP).map(x => ({ ...x, spark: intraday.get(x.s) || null }));
  const themes = withLabel(THEMES);
  const assets = withLabel(ASSETS).map(x => ({ ...x, rv: x.q.av ? round(x.q.v / x.q.av, 2) : null }));
  const global = withLabel(GLOBAL);
  const crypto = CRYPTO.map(getM).filter(Boolean);
  const commodities = withLabel(COMMODITIES);
  const fx = withLabel(FX);
  const rates = withLabel(RATES);
  const vol = withLabel(VOL);
  const futures = withLabel(FUTURES);

  // ---- Earnings (S&P members) ---------------------------------------------------
  const now = Date.now() / 1000;
  const upcoming = [], recent = [];
  for (const x of stocks) {
    const nxt = [x.et, x.ets].filter(t => t && t > now - 6 * 3600 && t < now + 8 * 86400).sort((a, b) => a - b)[0];
    if (nxt) upcoming.push({ s: x.s, ys: x.ys, n: x.n, sec: x.sec, mc: x.mc, t: nxt, est: x.eest && nxt === x.ets, c: x.c });
    if (x.et && x.et <= now && x.et > now - 4 * 86400) recent.push({ s: x.s, ys: x.ys, n: x.n, sec: x.sec, mc: x.mc, t: x.et, c: x.c, w: x.perf.w });
  }
  const earnings = {
    upcoming: upcoming.sort((a, b) => a.t - b.t || b.mc - a.mc).slice(0, 60),
    recent: recent.sort((a, b) => b.mc - a.mc).slice(0, 30),
  };

  // ---- Risk on / off -------------------------------------------------------------
  const relPct = (a, b) => (a == null || b == null ? null : round(((1 + a / 100) / (1 + b / 100) - 1) * 100));
  const risk = RISK_PAIRS.map(p => {
    const A = getM(p.a), B = getM(p.b);
    if (!A || !B) return null;
    return { ...p, d: relPct(A.c, B.c), w: relPct(A.perf.w, B.perf.w), m: relPct(A.perf.m, B.perf.m), ac: A.c, bc: B.c };
  }).filter(Boolean);
  const riskScore = risk.length ? round(risk.filter(r => r.d > 0).length / risk.length * 100, 0) : null;

  // ---- Fear & Greed -----------------------------------------------------------------
  const fear = fearGreed({ getM, breadth, hist, quotes });
  const fh = histStats?.fearHist || [];
  if (fh.length) {
    const today = spx?.t ? dayKey(spx.t) : null;
    const past = fh.at(-1)?.d === today ? fh.slice(0, -1) : fh;
    const at = n => past[past.length - n] || null;
    fear.history = past.slice(-250);
    fear.compare = { prev: at(1), week: at(5), month: at(21), year: past[Math.max(0, past.length - 250)] || null };
  }
  const context = histContext(getM, state.hist2?.size ? state.hist2 : hist, quotes);

  // ---- Yield curve -------------------------------------------------------------------
  const yields = curve ? { ...curve } : null;
  const t10 = getM('^TNX'), t3m = getM('^IRX');
  if (yields && t10) {
    yields.live = { '3 Mo': t3m?.p, '5 Yr': getM('^FVX')?.p, '10 Yr': t10.p, '30 Yr': getM('^TYX')?.p };
  }

  const snapshot = {
    ts: Date.now(),
    market: {
      state: spx?.st || 'UNKNOWN',
      time: spx?.t,
    },
    strip,
    stocks: stocks.map(x => ({
      s: x.s, ys: x.ys, n: x.n, sec: x.sec, ind: x.ind, p: x.p, c: x.c, ch: x.ch, mc: x.mc, v: x.v, av: x.av,
      h52: x.h52, l52: x.l52, ma50: x.ma50, ma200: x.ma200, hi: x.hi, lo: x.lo, prev: x.prev, perf: x.perf, ext: x.ext,
    })),
    futures,
    earnings,
    context,
    sectors,
    breadth,
    contributors,
    movers,
    themes,
    assets,
    risk,
    riskScore,
    fear,
    global,
    crypto,
    commodities,
    fx,
    rates,
    vol,
    yields,
    news: state.news || [],
    status: state.status,
  };
  snapshot.brief = marketBrief(snapshot, getM);
  return snapshot;
}

/** Simplified relative-rotation trail: x = 1M rel. strength vs SPY, y = 1W rel. momentum. */
function rrgTrail(sym, bench, quotes, hist) {
  const q = quotes.get(sym), qb = quotes.get(bench);
  const A = priorCloses(hist.get(sym), q), B = priorCloses(hist.get(bench), qb);
  if (!A || !B || !q?.regularMarketPrice || !qb?.regularMarketPrice) return [];
  const bm = new Map(B.t.map((t, i) => [dayKey(t, B.tz), B.c[i]]));
  const a = [], b = [];
  A.t.forEach((t, i) => { const k = dayKey(t, A.tz); if (bm.has(k)) { a.push(A.c[i]); b.push(bm.get(k)); } });
  a.push(q.regularMarketPrice); b.push(qb.regularMarketPrice);
  const rel = (i, nn) => (i - nn < 0 ? null : ((a[i] / a[i - nn]) / (b[i] / b[i - nn]) - 1) * 100);
  const out = [];
  for (let k = 4; k >= 0; k--) {
    const i = a.length - 1 - k * 5;
    const x = rel(i, 21), y = rel(i, 5);
    if (x != null && y != null) out.push({ x: round(x), y: round(y) });
  }
  return out;
}

function closesWithLive(sym, quotes, hist) {
  const q = quotes.get(sym);
  const P = priorCloses(hist.get(sym), q);
  if (!P) return null;
  const c = [...P.c];
  if (q?.regularMarketPrice) c.push(q.regularMarketPrice);
  return c;
}

function fearGreed({ getM, breadth, hist, quotes }) {
  const comps = [];
  const vix = getM('^VIX'), vix3m = getM('^VIX3M');
  if (vix?.p) {
    comps.push({ key: 'vix', label: 'Volatility (VIX)', value: round(vix.p), score: round(lin(vix.p, 40, 12), 0), fmt: vix.p.toFixed(1),
      hint: 'VIX 12 = calm, 40+ = panic' });
  }
  if (vix?.p && vix3m?.p) {
    const ratio = vix.p / vix3m.p;
    comps.push({ key: 'term', label: 'VIX term structure', value: round(ratio, 3), score: round(lin(ratio, 1.15, 0.82), 0), fmt: ratio.toFixed(2) + 'x',
      hint: 'VIX / VIX3M above 1.0 means near-term panic' });
  }
  const spxC = closesWithLive('^GSPC', quotes, hist);
  if (spxC && spxC.length > 126) {
    const ma = spxC.slice(-126, -1).reduce((a, b) => a + b, 0) / 125;
    const dev = (spxC[spxC.length - 1] / ma - 1) * 100;
    comps.push({ key: 'mom', label: 'Momentum (S&P vs 125d avg)', value: round(dev), score: round(lin(dev, -8, 8), 0), fmt: (dev >= 0 ? '+' : '') + dev.toFixed(1) + '%',
      hint: 'How far the S&P is above/below its 125-day average' });
  }
  if (breadth.above50 != null) {
    comps.push({ key: 'breadth', label: 'Breadth (% above 50d avg)', value: breadth.above50, score: round(lin(breadth.above50, 15, 85), 0), fmt: breadth.above50.toFixed(0) + '%',
      hint: 'Share of S&P 500 stocks above their 50-day average' });
  }
  if (breadth.nearHigh + breadth.nearLow > 0) {
    const r = breadth.nearHigh / (breadth.nearHigh + breadth.nearLow) * 100;
    comps.push({ key: 'hilo', label: 'Near 52-wk highs vs lows', value: round(r), score: round(r, 0), fmt: `${breadth.nearHigh} / ${breadth.nearLow}`,
      hint: 'S&P stocks within 2% of their 52-week high vs within 2% of their low' });
  }
  const rel20 = (a, b) => {
    const A = closesWithLive(a, quotes, hist), B = closesWithLive(b, quotes, hist);
    if (!A || !B || A.length < 22 || B.length < 22) return null;
    return ((A.at(-1) / A.at(-21)) - (B.at(-1) / B.at(-21))) * 100;
  };
  const sh = rel20('SPY', 'TLT');
  if (sh != null) comps.push({ key: 'haven', label: 'Safe-haven demand (stocks vs bonds, 20d)', value: round(sh), score: round(lin(sh, -8, 8), 0), fmt: (sh >= 0 ? '+' : '') + sh.toFixed(1) + '%',
    hint: 'SPY 20-day return minus TLT 20-day return' });
  const jb = rel20('HYG', 'LQD');
  if (jb != null) comps.push({ key: 'junk', label: 'Junk bond demand (HYG vs LQD, 20d)', value: round(jb), score: round(lin(jb, -2.5, 2.5), 0), fmt: (jb >= 0 ? '+' : '') + jb.toFixed(2) + '%',
    hint: 'High-yield vs investment-grade 20-day return' });

  const score = comps.length ? Math.round(comps.reduce((a, c) => a + c.score, 0) / comps.length) : null;
  const label = score == null ? '—' : score < 25 ? 'Extreme Fear' : score < 45 ? 'Fear' : score <= 55 ? 'Neutral' : score <= 75 ? 'Greed' : 'Extreme Greed';
  return { score, label, comps };
}

// ---------------------------------------------------------------------------
// Historical context: "worst day since...", "VIX highest since..."
// ---------------------------------------------------------------------------
function histContext(getM, hist, quotes) {
  const out = {};
  const fmtD = k => new Date(k + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const dayMove = (sym, label) => {
    const q = quotes.get(sym), m = getM(sym);
    const P = priorCloses(hist.get(sym), q);
    if (!P || !m?.c || P.c.length < 30) return null;
    const rets = [];
    for (let i = 1; i < P.c.length; i++) rets.push({ d: dayKey(P.t[i], P.tz), r: (P.c[i] / P.c[i - 1] - 1) * 100 });
    const today = m.c;
    for (let i = rets.length - 1; i >= 0; i--) {
      if (today < 0 ? rets[i].r <= today : rets[i].r >= today) {
        return { sym, label, c: today, since: fmtD(rets[i].d), sinceMove: round(rets[i].r), days: rets.length - i };
      }
    }
    return { sym, label, c: today, since: null, days: rets.length };
  };
  out.spx = dayMove('^GSPC', 'S&P 500');
  out.ndx = dayMove('^NDX', 'Nasdaq 100');
  const vq = quotes.get('^VIX'), vm = getM('^VIX');
  const VP = priorCloses(hist.get('^VIX'), vq);
  if (VP && vm?.p) {
    let since = null, days = VP.c.length;
    for (let i = VP.c.length - 1; i >= 0; i--) if (VP.c[i] >= vm.p) { since = fmtD(dayKey(VP.t[i], VP.tz)); days = VP.c.length - i; break; }
    out.vix = { p: vm.p, since, days, max: round(Math.max(...VP.c)) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule-based plain-English market brief
// ---------------------------------------------------------------------------
const pct = (v, d = 1) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + '%');

function marketBrief(S, getM) {
  const out = [];
  const add = (tone, title, text, tag) => out.push({ tone, title, text, tag });
  const spx = getM('^GSPC'), ndx = getM('^NDX'), rut = getM('^RUT'), dji = getM('^DJI');
  const vix = getM('^VIX'), vix3m = getM('^VIX3M');

  // 1. Headline move
  if (spx?.c != null) {
    const c = spx.c;
    const mood = c <= -3 ? 'Severe selloff' : c <= -1.5 ? 'Sharp decline' : c <= -0.5 ? 'Stocks lower' : c < 0.5 ? 'Flat, choppy session' : c < 1.5 ? 'Stocks higher' : c < 3 ? 'Strong rally' : 'Explosive rally';
    const dd = spx.h52 ? (spx.p / spx.h52 - 1) * 100 : null;
    let ddTxt = '';
    if (dd != null) {
      ddTxt = dd <= -20 ? ` The S&P is ${Math.abs(dd).toFixed(1)}% below its 52-week high — bear-market territory.`
        : dd <= -10 ? ` The S&P is ${Math.abs(dd).toFixed(1)}% off its high — in correction.`
        : dd <= -5 ? ` The S&P is ${Math.abs(dd).toFixed(1)}% off its high — a pullback.`
        : ` The S&P is ${Math.abs(dd).toFixed(1)}% from its 52-week high.`;
    }
    add(c < -0.5 ? 'bad' : c > 0.5 ? 'good' : 'neutral', mood,
      `S&P 500 ${pct(c, 2)}, Nasdaq 100 ${pct(ndx?.c, 2)}, Dow ${pct(dji?.c, 2)}, Russell 2000 ${pct(rut?.c, 2)}.${ddTxt}`, 'Indices');
    const ctx = S.context || {};
    const parts = [];
    for (const k of ['spx', 'ndx']) {
      const x = ctx[k];
      if (!x || Math.abs(x.c) < 1 || x.days < 15) continue;
      const word = x.c < 0 ? 'worst' : 'best';
      parts.push(x.since ? `${x.label}: ${word} day since ${x.since} (${pct(x.sinceMove)} that day).` : `${x.label}: ${word} day in over a year.`);
    }
    if (ctx.vix && ctx.vix.days >= 15 && ctx.vix.p > 20) parts.push(ctx.vix.since ? `VIX is at its highest close since ${ctx.vix.since}.` : `VIX is at its highest level in over a year.`);
    if (parts.length) add(c < 0 ? 'bad' : 'good', 'Historical context', parts.join(' '), 'History');
  }

  // 2. Breadth
  const b = S.breadth;
  if (b.n) {
    const dpct = b.dec / b.n * 100, apct = b.adv / b.n * 100;
    const volRatio = b.dnVol ? b.upVol / b.dnVol : null;
    let t = `${b.dec} of ${b.n} S&P stocks are down (${dpct.toFixed(0)}%), ${b.adv} up.`;
    if (volRatio != null) t += ` Up/down volume ratio ${volRatio.toFixed(2)}.`;
    t += ` Equal-weight average move ${pct(b.eqWeight)}.`;
    if (dpct >= 90) add('bad', 'Breadth washout', t + ' A 90%+ downside day signals indiscriminate selling — often seen near capitulation.', 'Breadth');
    else if (apct >= 90) add('good', 'Breadth thrust', t + ' A 90%+ upside day signals broad buying.', 'Breadth');
    else if (dpct >= 70) add('bad', 'Broad-based selling', t, 'Breadth');
    else if (apct >= 70) add('good', 'Broad participation', t, 'Breadth');
    else add('neutral', 'Mixed breadth', t, 'Breadth');
    if (b.reversals?.length >= 10) {
      add('warn', 'Failed breakouts', `${b.reversals.length} S&P stocks hit fresh 52-week highs today and then reversed lower (e.g. ${b.reversals.slice(0, 5).map(r => `${r.s} ${pct(r.off)} off the high`).join(', ')}). Rallies being sold into is a classic distribution sign.`, 'Breadth');
    }
    if (b.nearLow > 20 || b.nearHigh > 20) {
      add(b.nearLow > b.nearHigh ? 'bad' : 'good', 'Highs vs lows', `${b.nearHigh} S&P stocks are within 2% of a 52-week high and ${b.nearLow} within 2% of a low (${b.newHigh} touched a new high intraday, ${b.newLow} a new low). ${b.above50.toFixed(0)}% trade above their 50-day average, ${b.above200.toFixed(0)}% above their 200-day.`, 'Breadth');
    }
  }

  // 3. Concentration — who's moving the index
  const cd = S.contributors.down.slice(0, 5), cu = S.contributors.up.slice(0, 5);
  if (spx?.ch && Math.abs(spx.ch) > 1) {
    const lead = spx.ch < 0 ? cd : cu;
    const pts = lead.reduce((a, x) => a + x.pts, 0);
    const share = Math.abs(pts / spx.ch * 100);
    add(spx.ch < 0 ? 'bad' : 'good', spx.ch < 0 ? 'Mega-caps driving the drop' : 'Mega-caps driving the gain',
      `${lead.map(x => `${x.s} ${pct(x.c)}`).join(', ')} account for ≈${Math.abs(pts).toFixed(0)} index points — about ${share.toFixed(0)}% of the S&P's ${spx.ch.toFixed(0)}-point move.`, 'Concentration');
  }

  // 4. Sector rotation
  const sec = S.sectors.filter(s => s.c != null).sort((a, b2) => b2.c - a.c);
  if (sec.length) {
    const best = sec.slice(0, 2), worst = sec.slice(-2).reverse();
    const def = S.sectors.filter(s => s.type === 'defensive' && s.c != null);
    const cyc = S.sectors.filter(s => s.type === 'cyclical' && s.c != null);
    const avg = arr => arr.reduce((a, x) => a + x.c * x.mc, 0) / (arr.reduce((a, x) => a + x.mc, 0) || 1);
    const gap = avg(def) - avg(cyc);
    let t = `Leading: ${best.map(s => `${s.short} ${pct(s.c)}`).join(', ')}. Lagging: ${worst.map(s => `${s.short} ${pct(s.c)}`).join(', ')}.`;
    if (gap > 1) add('bad', 'Rotation into defensives', t + ` Defensive sectors are beating cyclicals by ${gap.toFixed(1)} pts — money is hiding in staples, utilities, health care and real estate.`, 'Sectors');
    else if (gap < -1) add('good', 'Rotation into cyclicals', t + ` Cyclicals are beating defensives by ${Math.abs(gap).toFixed(1)} pts — investors are reaching for growth.`, 'Sectors');
    else add('neutral', 'Sector moves', t, 'Sectors');
  }
  const th = S.themes.filter(x => x.q.c != null).sort((a, b2) => a.q.c - b2.q.c);
  if (th.length) {
    const w = th[0], bst = th[th.length - 1];
    add(w.q.c < -3 ? 'bad' : 'neutral', 'Theme hot spots', `Hardest hit: ${th.slice(0, 3).map(x => `${x.label} ${pct(x.q.c)}`).join(', ')}. Holding up best: ${th.slice(-3).reverse().map(x => `${x.label} ${pct(x.q.c)}`).join(', ')}.`, 'Themes');
    void w; void bst;
  }

  // 5. Volatility
  if (vix?.p) {
    let t = `VIX at ${vix.p.toFixed(1)} (${pct(vix.c)}).`;
    let tone = vix.p > 30 ? 'bad' : vix.p > 20 ? 'warn' : 'good';
    if (vix3m?.p && vix.p > vix3m.p) t += ` It's above the 3-month VIX (${vix3m.p.toFixed(1)}) — an inverted vol curve means traders are paying up for immediate protection.`;
    else if (vix3m?.p) t += ` Vol curve is in normal contango (VIX3M ${vix3m.p.toFixed(1)}).`;
    add(tone, vix.p > 30 ? 'Panic-level volatility' : vix.p > 20 ? 'Elevated volatility' : 'Calm volatility', t, 'Volatility');
  }

  // 6. Safe havens & where money is flowing
  const tlt = getM('TLT'), gld = getM('GC=F'), dxy = getM('DX-Y.NYB'), jpy = getM('JPY=X'), tnx = getM('^TNX'), chf = getM('CHF=X');
  if (tlt && gld && dxy) {
    const bps = tnx?.ch != null ? tnx.ch * 100 : null;
    const parts = [`Long Treasuries (TLT) ${pct(tlt.c)}`, `gold ${pct(gld.c)}`, `dollar ${pct(dxy.c)}`];
    if (jpy) parts.push(`USD/JPY ${pct(jpy.c)}${jpy.c < -0.3 ? ' (yen strengthening)' : ''}`);
    if (chf && chf.c < -0.3) parts.push(`Swiss franc firming`);
    let t = parts.join(', ') + '.';
    if (bps != null) t += ` 10-year yield ${bps >= 0 ? '+' : ''}${bps.toFixed(0)} bps to ${tnx.p.toFixed(2)}%.`;
    const havenBid = (tlt.c > 0) + (gld.c > 0) + (jpy?.c < 0) + (chf?.c < 0);
    add(havenBid >= 3 ? 'warn' : 'neutral', havenBid >= 3 ? 'Flight to safety' : 'Safe havens', t, 'Flows');
  }
  const assets = S.assets.filter(a => a.q.c != null);
  if (assets.length) {
    const inflow = [...assets].sort((a, b2) => b2.q.c * (b2.rv || 1) - a.q.c * (a.rv || 1));
    const top = inflow.slice(0, 3), bot = inflow.slice(-3).reverse();
    add('neutral', 'Where the money is moving', `Strongest bid: ${top.map(a => `${a.label} ${pct(a.q.c)}`).join(', ')}. Heaviest selling: ${bot.map(a => `${a.label} ${pct(a.q.c)}${a.rv ? ` on ${a.rv.toFixed(1)}x volume` : ''}`).join(', ')}.`, 'Flows');
  }

  // 7. Credit
  const hyg = getM('HYG'), lqd = getM('LQD');
  if (hyg && lqd) {
    const spread = hyg.c - lqd.c;
    if (spread < -0.4) add('bad', 'Credit stress', `High-yield bonds (HYG ${pct(hyg.c, 2)}) are lagging investment-grade (LQD ${pct(lqd.c, 2)}). Credit markets are pricing more default risk — watch this; equity selloffs get dangerous when credit cracks.`, 'Credit');
    else add('neutral', 'Credit holding', `HYG ${pct(hyg.c, 2)} vs LQD ${pct(lqd.c, 2)} — no major stress signal from junk bonds yet.`, 'Credit');
  }

  // 8. Risk appetite
  if (S.riskScore != null) {
    const off = S.risk.filter(r => r.d < 0).map(r => r.off);
    add(S.riskScore < 35 ? 'bad' : S.riskScore > 65 ? 'good' : 'neutral', `Risk appetite ${S.riskScore}/100`,
      S.riskScore < 35 ? `${S.risk.filter(r => r.d < 0).length} of ${S.risk.length} risk gauges are flashing risk-off — winners today: ${[...new Set(off)].slice(0, 5).join(', ')}.`
        : `${S.risk.filter(r => r.d > 0).length} of ${S.risk.length} risk gauges point risk-on.`, 'Risk');
  }

  // 9. Global & crypto & commodities
  const gl = S.global.filter(g => g.q.c != null);
  if (gl.length) {
    const down = gl.filter(g => g.q.c < 0).length;
    const worst = [...gl].sort((a, b2) => a.q.c - b2.q.c).slice(0, 3);
    const best = [...gl].sort((a, b2) => b2.q.c - a.q.c).slice(0, 2);
    add(down > gl.length * 0.65 ? 'bad' : 'neutral', down > gl.length * 0.65 ? 'Global selloff' : 'Global markets',
      `${down} of ${gl.length} world indices are down in their latest session. Weakest: ${worst.map(g => `${g.label} ${pct(g.q.c)}`).join(', ')}. Strongest: ${best.map(g => `${g.label} ${pct(g.q.c)}`).join(', ')}.`, 'Global');
  }
  const btc = getM('BTC-USD'), eth = getM('ETH-USD');
  if (btc) add(btc.c < -3 ? 'bad' : btc.c > 3 ? 'good' : 'neutral', 'Crypto', `Bitcoin ${pct(btc.c)} at $${Math.round(btc.p).toLocaleString('en-US')}, Ether ${pct(eth?.c)} (24h). ${btc.c < -3 ? 'Crypto is trading as a high-beta risk asset, not a haven.' : ''}`, 'Crypto');
  const oil = getM('CL=F'), copper = getM('HG=F');
  if (oil && copper) {
    add(oil.c > 2 ? 'warn' : 'neutral', 'Commodities', `WTI crude ${pct(oil.c)} at $${oil.p.toFixed(2)}, copper ${pct(copper.c)}, gold ${pct(gld?.c)}.${oil.c > 2 ? ' Rising oil during an equity selloff adds stagflation pressure.' : ''}${copper.c < -1.5 ? ' Falling copper signals growth worries.' : ''}`, 'Commodities');
  }

  // Earnings this week
  const upE = (S.earnings?.upcoming || []).filter(e => e.mc > 1e11).slice(0, 6);
  if (upE.length) add('neutral', 'Big earnings ahead', upE.map(e => `${e.s} ${new Date(e.t * 1000).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' })}`).join(', ') + '.', 'Earnings');

  // 10. Unusual volume
  const un = S.movers.unusual.slice(0, 4);
  if (un.length && un[0].rv > 2) {
    add('neutral', 'Unusual volume', un.map(x => `${x.s} ${pct(x.c)} (${x.rv.toFixed(1)}x avg)`).join(', ') + '.', 'Volume');
  }

  return out;
}
