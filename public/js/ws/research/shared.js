// Research workspace: data access, formatting, definitions and small UI parts
// shared by the screener, company page and compare tool.
import { fetchJSON, esc } from '../../ui.js';
import { fmtBig, fmtPrice, fmtPct, debounce } from '../../util.js';

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Data (fetchJSON dedupes in-flight requests; ttl reuses recent answers)
// ---------------------------------------------------------------------------
export const api = {
  fundamentals: (fresh = false) => fetchJSON('/api/fundamentals', { ttl: fresh ? 0 : 5 * 60e3, timeout: 30000 }),
  company: s => fetchJSON('/api/company?s=' + enc(s), { ttl: 10 * 60e3, timeout: 25000 }),
  history: (s, range, interval = '1d') => fetchJSON(`/api/history?s=${enc(s)}&range=${range}&interval=${interval}`, { ttl: 30 * 60e3, timeout: 30000 }),
  quote: s => fetchJSON('/api/quote?s=' + enc(s), { ttl: 15e3, timeout: 10000 }),
  search: q => fetchJSON('/api/search?q=' + enc(q), { ttl: 60e3, timeout: 8000 }),
  news: q => fetchJSON('/api/news?q=' + enc(q), { ttl: 5 * 60e3, timeout: 12000 }),
  etfs: () => fetchJSON('/api/etfs', { ttl: 30 * 60e3, timeout: 30000 }),
};

// Lookup tables built once per /api/fundamentals payload.
const idx = new WeakMap();
export function fundIndex(F) {
  if (!F) return null;
  let x = idx.get(F);
  if (x) return x;
  const by = new Map(), sectors = new Map();
  for (const r of F.rows) {
    by.set(r.ys, r); by.set(r.s, r);
    if (!sectors.has(r.sec)) sectors.set(r.sec, []);
    sectors.get(r.sec).push(r);
  }
  x = { by, sectors, stats: new Map() };
  idx.set(F, x);
  return x;
}
export const fundRow = (F, s) => fundIndex(F)?.by.get(s) || null;

/**
 * Where value v sits among the sector's non-null values of get(row).
 * Returns { pct (0-100, ties count half), median, n } or null.
 */
export function sectorPosition(F, sector, key, get, v) {
  const ix = fundIndex(F);
  if (!ix || v == null || !isFinite(v)) return null;
  const ck = sector + '|' + key;
  let vals = ix.stats.get(ck);
  if (!vals) {
    vals = (ix.sectors.get(sector) || []).map(get).filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
    ix.stats.set(ck, vals);
  }
  if (vals.length < 5) return null;
  let below = 0, equal = 0;
  for (const x of vals) { if (x < v) below++; else if (x === v) equal++; }
  const m = vals.length >> 1;
  const median = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  return { pct: ((below + equal / 2) / vals.length) * 100, median, n: vals.length };
}

// ---------------------------------------------------------------------------
// Formatting. Every number in this workspace goes through one of these so
// precision and units stay consistent: P/E-type ratios 1 dp, yields 2 dp,
// margins / returns 1 dp, prices 2 dp, money abbreviated (B / T).
// ---------------------------------------------------------------------------
const DASH = '—';
export const isNum = v => v != null && typeof v === 'number' && isFinite(v);
export const fmt = {
  num: (v, d = 1) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : DASH),
  int: v => (isNum(v) ? Math.round(v).toLocaleString('en-US') : DASH),
  pct: (v, d = 1) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : DASH),
  spct: (v, d = 1) => fmtPct(v, d),
  /** P/E-style multiple: negative or missing earnings are "NM" (not meaningful). */
  mult: (v, d = 1) => (v == null ? DASH : !isFinite(v) ? DASH : v <= 0 ? '<span class="rs-nm" title="Not meaningful: earnings are negative">NM</span>' : v >= 1000 ? '>999' : fmt.num(v, d)),
  ratio: (v, d = 2) => fmt.num(v, d),
  price: v => fmtPrice(v),
  money: (v, cur = 'USD') => (isNum(v) ? (cur === 'USD' || !cur ? fmtBig(v, '$') : fmtBig(v) + ' ' + esc(cur)) : DASH),
  /** Money with explicit sign for statements (net income can be negative). */
  smoney: (v, cur = 'USD') => (isNum(v) ? (v < 0 ? '−' : '') + fmt.money(Math.abs(v), cur) : DASH),
  date: d => {
    if (!d) return DASH;
    const t = typeof d === 'number' ? new Date(d * 1000) : new Date(d + (String(d).length === 10 ? 'T12:00:00Z' : ''));
    return isNaN(t) ? DASH : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  },
  monthYear: d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
};
/** Unix seconds + exchange gmtoffset → 'YYYY-MM-DD' (exchange-local calendar day). */
export const dayOf = (t, off = 0) => new Date((t + off) * 1000).toISOString().slice(0, 10);
/** Today's date in US Eastern time, 'YYYY-MM-DD' (Yahoo's calendar dates are Eastern). */
export const todayET = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
export const asOfMs =meta => (meta?.asOf ? Date.parse(meta.asOf) : null);

export const TYPE_LABEL = { EQUITY: 'Stock', ETF: 'ETF', INDEX: 'Index', CRYPTOCURRENCY: 'Crypto', MUTUALFUND: 'Mutual fund', FUTURE: 'Future', CURRENCY: 'Currency' };

/** Display form of a Yahoo symbol: ^GSPC → GSPC is ambiguous, so keep the caret; BTC-USD stays. */
export const dispSym = s => String(s || '');

// ---------------------------------------------------------------------------
// Plain-English definitions (used for column titles, filter labels and the
// "How to read this" explainers). One sentence each, no advice.
// ---------------------------------------------------------------------------
export const DEF = {
  marketCap: 'Market capitalization: share price × number of shares, the market value of the whole company.',
  pe: 'Price / earnings (trailing 12 months): how many dollars investors pay for each dollar of the company’s profit over the last year. NM means the company lost money, so the ratio is not meaningful.',
  fpe: 'Forward P/E: price divided by analysts’ average profit-per-share estimate for the next fiscal year.',
  peg: 'PEG: forward P/E divided by the expected percentage growth in earnings per share. It puts a high or low P/E next to how fast profits are expected to grow. Only shown when both are positive.',
  pb: 'Price / book: market value divided by the accounting value of the company’s assets minus its debts.',
  ps: 'Price / sales: market value divided by the last 12 months of revenue.',
  evEbitda: 'EV / EBITDA: enterprise value (market cap plus debt minus cash) divided by earnings before interest, taxes, depreciation and amortization. Used to compare companies with different amounts of debt.',
  fcfYield: 'Free cash flow yield: the cash a company generated in the last 12 months after paying for its investments (operating cash flow minus capital spending), as a percentage of its market value. Not shown for banks and insurers, where it is not meaningful.',
  earningsYield: 'Earnings yield: last-12-month earnings per share divided by the price, the P/E turned upside down. Negative for companies that lost money.',
  divYield: 'Dividend yield: the dividends paid per share over a year as a percentage of the share price.',
  payout: 'Payout ratio: the share of profits paid out as dividends.',
  roe: 'Return on equity (ROE): profit over the last 12 months as a percentage of shareholders’ equity. Very large values often come from small or negative equity after share buybacks.',
  roa: 'Return on assets: profit as a percentage of everything the company owns.',
  grossMargin: 'Gross margin: revenue minus the direct cost of what was sold, as a percentage of revenue. Not reported for banks.',
  opMargin: 'Operating margin: profit from the main business before interest and taxes, as a percentage of revenue.',
  netMargin: 'Net margin: final profit as a percentage of revenue.',
  de: 'Debt / equity: total debt divided by shareholders’ equity (as a ratio: 0.5 means debt is half of equity).',
  revGrowth: 'Revenue growth: the latest quarter’s revenue compared with the same quarter a year earlier.',
  epsGrowth: 'Earnings growth: the latest quarter’s earnings compared with the same quarter a year earlier.',
  fwdGrowth: 'Forward EPS growth: analysts’ next-fiscal-year earnings-per-share estimate compared with the last 12 months.',
  r1y: 'Price change over the last 12 months (dividends not included).',
  ytd: 'Price change since the last close of the previous year.',
  ma200: 'How far the price is above (+) or below (−) its average closing price over the last 200 trading days.',
  pos52: 'Where the price sits between its lowest (0) and highest (100) price of the last 52 weeks.',
  offHigh: 'How far the price is below its highest price of the last 52 weeks.',
  vol: 'Volatility: how much the price has swung day to day over the last year, annualized. About 15–20% is typical for a large, steady company; above 40% is a bumpy ride.',
  beta: 'Beta: how much the stock tended to move when the S&P 500 moved over the last year. 1 = in step with the index, 0.5 = half as much, 2 = twice as much.',
  rating: 'Analysts’ average rating on a 1–5 scale (1 = strong buy, 3 = hold, 5 = strong sell), as compiled by Yahoo Finance. It is other people’s opinion.',
  upside: 'The gap between analysts’ average price target and today’s price. Price targets are opinions and are often wrong.',
  analysts: 'Number of analysts whose price targets are included.',
  factor: 'Factor scores rank every company from 0 to 100 on one trait, within the whole S&P 500 or within its own sector. 100 means the most of that trait (for example the cheapest for Value, the steadiest for Low volatility); 50 is the middle. A score describes, it does not predict.',
  fValue: 'Value score: cheapness, from earnings yield, forward earnings yield and free cash flow yield. High = cheaper than most.',
  fQuality: 'Quality score: profitability and balance-sheet strength, from ROE, operating margin, gross margin and low debt.',
  fGrowth: 'Growth score: from recent revenue growth, recent earnings growth and expected next-year earnings growth.',
  fMomentum: 'Momentum score: price change over the last 12 and 6 months, skipping the most recent month.',
  fLowVol: 'Low-volatility score: from 1-year volatility and beta. High = steadier than most.',
};

export const FACTORS = [
  ['value', 'Value', DEF.fValue], ['quality', 'Quality', DEF.fQuality], ['growth', 'Growth', DEF.fGrowth],
  ['momentum', 'Momentum', DEF.fMomentum], ['lowVol', 'Low volatility', DEF.fLowVol],
];

// Yahoo fund sector ids → readable names
export const FUND_SECTOR = {
  realestate: 'Real estate', consumer_cyclical: 'Consumer cyclical', basic_materials: 'Basic materials', consumer_defensive: 'Consumer defensive',
  technology: 'Technology', communication_services: 'Communication services', financial_services: 'Financial services', utilities: 'Utilities',
  industrials: 'Industrials', energy: 'Energy', healthcare: 'Health care',
};

// ---------------------------------------------------------------------------
// Grid layout: rows of optional panels. Missing panels (null) are dropped and
// the survivors share the 12 columns by weight, so no row has a hole.
// ---------------------------------------------------------------------------
export function rowsHTML(rows) {
  return rows.map(row => {
    const items = row.filter(Boolean);
    if (!items.length) return '';
    const total = items.reduce((a, x) => a + (x.w || 1), 0);
    let left = 12;
    const spans = items.map((x, i) => {
      const s = i === items.length - 1 ? left : Math.max(3, Math.round((12 * (x.w || 1)) / total));
      left -= s;
      return s;
    });
    return `<section class="grid">${items.map((x, i) => x.html(spans[i])).join('')}</section>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Recently viewed (company page) — this browser only
// ---------------------------------------------------------------------------
const RECENT_KEY = 'mp.research.recent';
export function recentList() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } }
export function pushRecent(s, n, type) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([{ s, n, type }, ...recentList().filter(x => x.s !== s)].slice(0, 8))); } catch { /* storage unavailable */ }
}
export function loadPref(key, fallback) { try { const v = JSON.parse(localStorage.getItem('mp.research.' + key)); return v ?? fallback; } catch { return fallback; } }
export function savePref(key, v) { try { localStorage.setItem('mp.research.' + key, JSON.stringify(v)); } catch { /* ignore */ } }

/** Replace the current hash without a history entry or a route event. */
export function replaceHash(hash) {
  if (location.hash !== hash) history.replaceState(history.state, '', hash);
}

// ---------------------------------------------------------------------------
// Ticker search: an input with a suggestion list (S&P 500 locally + /api/search)
// tickerSearch(input, { onPick(sym, name, type), local: () => rows })
// ---------------------------------------------------------------------------
export function tickerSearch(input, { onPick, local = () => [], limit = 8 }) {
  const wrap = document.createElement('div');
  wrap.className = 'rs-ts';
  input.replaceWith(wrap);
  wrap.appendChild(input);
  const pop = document.createElement('div');
  pop.className = 'rs-ts-pop';
  pop.setAttribute('role', 'listbox');
  pop.id = (input.id || 'ts' + Math.random().toString(36).slice(2, 7)) + '-list';
  pop.hidden = true;
  wrap.appendChild(pop);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', pop.id);
  input.setAttribute('aria-expanded', 'false');
  input.autocomplete = 'off';
  input.spellcheck = false;
  let items = [], sel = 0, remote = [];

  function compute() {
    const q = input.value.trim();
    const Q = q.toUpperCase();
    if (!q) { items = []; paint(); return; }
    const loc = local().filter(r => r.s.startsWith(Q) || r.ys.startsWith(Q) || (Q.length > 1 && r.n.toUpperCase().includes(Q)))
      .sort((a, b) => (b.s === Q) - (a.s === Q) || b.s.startsWith(Q) - a.s.startsWith(Q) || b.marketCap - a.marketCap).slice(0, 5)
      .map(r => ({ s: r.ys, n: r.n, type: 'EQUITY', x: 'S&P 500' }));
    const seen = new Set(loc.map(x => x.s));
    const rem = remote.filter(x => !seen.has(x.s) && x.type !== 'FUTURE' && x.type !== 'OPTION').map(x => ({ s: x.s, n: x.n, type: x.type, x: x.exch }));
    items = [...loc, ...rem].slice(0, limit);
    if (!items.length && /^[\w^.=-]{1,20}$/.test(Q)) items.push({ s: Q, n: 'Open ' + Q, type: '', x: '', raw: true });
    sel = 0;
    paint();
  }
  function paint() {
    const open = !!items.length && document.activeElement === input;
    pop.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    pop.innerHTML = items.map((x, i) => `<div class="rs-ts-i${i === sel ? ' sel' : ''}" role="option" id="${pop.id}-${i}" aria-selected="${i === sel}" data-i="${i}">
      <b>${esc(x.s)}</b><span>${esc(x.n || '')}</span><small>${esc(x.raw ? '' : TYPE_LABEL[x.type] || x.type || '')}</small></div>`).join('');
    input.setAttribute('aria-activedescendant', open ? `${pop.id}-${sel}` : '');
  }
  function pick(i) {
    const x = items[i];
    const q = input.value.trim().toUpperCase();
    if (!x && !q) return;
    input.value = '';
    items = []; remote = [];
    paint();
    onPick(x ? x.s : q, x && !x.raw ? x.n : '', x?.type || '');
  }
  const searchRemote = debounce(async q => {
    try {
      const r = await api.search(q);
      if (input.value.trim() !== q) return;
      remote = Array.isArray(r) ? r : [];
      compute();
    } catch { /* local suggestions only */ }
  }, 180);
  input.addEventListener('input', () => {
    remote = [];
    compute();
    const q = input.value.trim();
    if (q && q.length <= 24) searchRemote(q);
  });
  input.addEventListener('focus', compute);
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) { pop.hidden = true; input.setAttribute('aria-expanded', 'false'); } }, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter') { e.preventDefault(); pick(items.length ? sel : -1); }
    else if (e.key === 'Escape') { e.stopPropagation(); if (input.value) { input.value = ''; compute(); } else input.blur(); }
  });
  pop.addEventListener('mousedown', e => {
    e.preventDefault();
    const it = e.target.closest('[data-i]');
    if (it) pick(+it.dataset.i);
  });
  return { el: wrap, focus: () => input.focus() };
}

/** A small "ticker" link that opens the company page (not the drawer). */
export const coLink = (s, label = s) => `<a class="rs-co" href="#/research/company?s=${enc(s)}">${esc(label)}</a>`;
