// Research › Company (DES): one page per symbol from /api/company, with a
// layout per type. Stocks get the full set of panels; ETFs and funds get fund
// facts, holdings and returns; indexes and crypto get the quote and chart.
// No symbol → a landing page with search and starting points.
import { esc, seg, fmtPrice } from '../../util.js';
import { panelHTML, segHTML, tsChart, errorStateHTML, skeletonHTML, setSourceBadge, fmtAsOf, SERIES_COLORS, dataTable } from '../../ui.js';
import { newsHTML } from '../../panels.js';
import { lookup, watch, on } from '../../store.js';
import { api, fmt, isNum, dayOf, asOfMs, TYPE_LABEL, fundRow, rowsHTML, todayET, pushRecent, recentList, loadPref, savePref, tickerSearch } from './shared.js';
import * as S from './company-stock.js';
import * as Fd from './company-fund.js';

let root = null, nav = null;
let cur = null;           // { sym, co, fr, F, q, ... } for the page on screen
let reqId = 0;
let chart = null;
let F = null;
const RANGES = [['1mo', '1M', '1d'], ['6mo', '6M', '1d'], ['ytd', 'YTD', '1d'], ['1y', '1Y', '1d'], ['5y', '5Y', '1d'], ['10y', '10Y', '1wk'], ['max', 'Max', '1wk']];
const chartPref = loadPref('coChart', { range: '1y', vs: false });
const BENCH = '^SP500TR';

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
const STATE_TXT = { REGULAR: 'Live', PRE: 'Pre-market', POST: 'After hours', POSTPOST: 'At close', PREPRE: 'At close', CLOSED: 'At close' };
function priceHTML(c) {
  const live = lookup(c.sym);
  const q = { ...(c.q || {}), ...(live ? { p: live.p, c: live.c, ch: live.ch, st: live.st, t: live.t, ext: live.ext } : {}) };
  const p = q.p ?? c.co.quote?.price;
  const pct = q.c ?? c.co.quote?.changePct;
  const ch = q.ch ?? (isNum(p) && isNum(pct) ? p - p / (1 + pct / 100) : null);
  const k = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const st = q.st || c.co.quote?.marketState;
  const t = q.t || c.co.quote?.time;
  const ext = q.ext && isNum(q.ext.p) ? ` · ${q.ext.k === 'pre' ? 'Pre-market' : 'After hours'} <b class="mono">${fmtPrice(q.ext.p)}</b> <span class="${q.ext.c > 0 ? 'up' : q.ext.c < 0 ? 'down' : 'flat'}">${fmt.spct(q.ext.c, 2)}</span>` : '';
  c.price = p;
  // Outside the regular session the big number is the last regular close; extended trading follows it.
  const when = st === 'REGULAR' || c.type === 'crypto' ? `<i class="rs-live"></i>${c.type === 'crypto' ? '24h market' : 'Market open'}${t ? ' · ' + fmtAsOf(t * 1000) : ''}` : STATE_TXT[st] ? 'At close' : 'Last price';
  return `<div class="rs-px-v mono">${fmtPrice(p)}<small>${esc(c.cur || '')}</small></div>
    <div class="rs-px-c mono ${k}">${isNum(ch) ? (ch > 0 ? '+' : ch < 0 ? '−' : '') + fmtPrice(Math.abs(ch)) : ''} (${fmt.spct(pct, 2)})</div>
    <div class="rs-px-t">${when}${ext}</div>`;
}

function headerHTML(c) {
  const id = c.co.identity, t = c.type;
  const meta = [id.exchange, c.fr?.sec || c.co.profile?.sector, c.fr?.ind || c.co.profile?.industry, t === 'fund' ? c.co.fund?.category : null].filter(Boolean).map(esc).join(' · ');
  const ks = c.co.keyStats;
  const q = c.q || {};
  const facts = [];
  const mc = ks?.marketCap ?? c.co.quote?.marketCap;
  if (t === 'fund' && isNum(c.co.fund?.aum)) facts.push(['Fund size', fmt.money(c.co.fund.aum, c.cur)]);
  else if (isNum(mc)) facts.push([t === 'crypto' ? 'Market value' : 'Market cap', fmt.money(mc, c.cur)]);
  if (t === 'fund' && isNum(c.co.fund?.expenseRatioPct)) facts.push(['Expense ratio', fmt.pct(c.co.fund.expenseRatioPct, 2)]);
  const lo = ks?.low52 ?? q.l52, hi = ks?.high52 ?? q.h52;
  if (isNum(lo) && isNum(hi) && hi > lo) {
    const pp = Math.max(0, Math.min(100, ((c.price - lo) / (hi - lo)) * 100));
    facts.push(['52-week range', `<span class="rs-r52"><span class="mono">${fmtPrice(lo)}</span><span class="rs-r52-b" title="${Math.round(pp)}% of the way from the 52-week low to the high"><i style="left:${pp}%"></i></span><span class="mono">${fmtPrice(hi)}</span></span>`]);
  }
  // Yahoo sometimes keeps a report date that has already passed until it publishes the next one: never show a past date as "next".
  const today = todayET();
  const cands = [[c.co.earnings?.next?.date, c.co.earnings?.next?.estimated], [c.fr?.nextEarnings, c.fr?.nextEarningsEstimated]].filter(([d]) => d && d >= today);
  if (t === 'stock' && cands.length) { const [d, est] = cands.sort((a, b) => a[0].localeCompare(b[0]))[0]; facts.push(['Next earnings', `${fmt.date(d)}${est ? ' <small class="rs-dim">(estimated)</small>' : ''}`]); }
  else if (t === 'stock' && (c.co.earnings?.next?.date || c.fr?.nextEarnings)) facts.push(['Next earnings', '<span class="rs-dim" title="The last known report date has passed and Yahoo has not published the next one yet">not yet announced</span>']);
  const pf = q.perf || {};
  const perf = [['w', '1W'], ['m', '1M'], ['ytd', 'YTD'], ['y', '1Y']].filter(([k]) => isNum(pf[k]));
  if (perf.length) facts.push(['Price change', `<span class="rs-perf">${perf.map(([k, l]) => `<span><small>${l}</small><b class="mono ${pf[k] > 0 ? 'up' : pf[k] < 0 ? 'down' : 'flat'}">${fmt.spct(pf[k])}</b></span>`).join('')}</span>`]);
  const watched = watch.has(c.sym);
  const acts = [
    `<button type="button" class="btn rs-star${watched ? ' on' : ''}" id="rsStar" aria-pressed="${watched}" title="${watched ? 'Remove from' : 'Add to'} watchlist"><span aria-hidden="true">${watched ? '★' : '☆'}</span>${watched ? 'On watchlist' : 'Watchlist'}</button>`,
    t !== 'index' || c.sym !== '^GSPC' ? `<a class="btn" href="#/research/compare?s=${encodeURIComponent(c.sym + ',' + (t === 'fund' || t === 'stock' ? 'SPY' : '^GSPC'))}" title="Compare total return with the S&P 500">Compare</a>` : '',
    `<button type="button" class="btn" data-sym="${esc(c.sym)}" title="Candlestick chart with volume and moving averages">Quick chart</button>`,
    t === 'fund' ? `<button type="button" class="btn rs-dca" id="rsDca" title="See what investing a fixed amount every month would have grown to">Simulate DCA</button>` : '',
  ].join('');
  return panelHTML({ id: 'pCoProfile', span: 12, cls: 'rs-head', title: 'Security', sub: '',
    note: t === 'stock' ? 'The company’s current price and the basic facts about it.' : t === 'fund' ? 'The fund’s current price and the basic facts about it.' : 'The current level and recent moves.',
    info: `Price is the latest trade, delayed up to 15 minutes; outside market hours it shows the last close, with pre-market or after-hours trading when there is any. Change is against the previous close.\n\nMarket cap is share price × number of shares. The 52-week range shows the lowest and highest price over the past year, with today’s price marked. ${t === 'stock' ? 'Next earnings is the date the company is expected to report quarterly results; “estimated” means the company has not confirmed it yet.' : ''}`,
    body: `<div class="rs-head-g">
      <div class="rs-id"><div class="rs-id-t"><h1 class="rs-tk mono">${esc(c.sym)}</h1><span class="rs-type">${esc(TYPE_LABEL[id.type] || id.type || '')}</span></div>
        <div class="rs-id-n">${esc(id.name || c.sym)}</div><div class="rs-id-m">${meta}</div></div>
      <div class="rs-px" id="rsPx">${priceHTML(c)}</div>
      <div class="rs-acts">${acts}</div></div>
      ${facts.length ? `<dl class="rs-hfacts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}`,
    source: { source: 'Yahoo Finance', label: c.co.quote?.live ? 'live quote' : 'quote', asOf: (c.co.quote?.time || 0) * 1000 || asOfMs(c.co.meta) } });
}

// ---------------------------------------------------------------------------
// Price chart
// ---------------------------------------------------------------------------
function chartItem(c) {
  const canVs = !['^GSPC', '^SP500TR', 'SPY', 'VOO', 'IVV'].includes(c.sym);
  return {
    w: c.type === 'index' || c.type === 'crypto' ? 12 : 8,
    html: span => panelHTML({ id: 'pCoChart', span, title: 'Price History', sub: '<span id="rsChSub">Price</span>', cls: 'rs-chart',
      controls: `${canVs ? `<button type="button" class="rs-tgl" id="rsVs" aria-pressed="${chartPref.vs}" title="Show growth of 100 for this symbol and the S&P 500, both including dividends">vs S&amp;P 500</button>` : ''}
        ${segHTML({ id: 'rsRange', small: true, value: chartPref.range, label: 'Chart range', options: RANGES.map(([v, l]) => [v, l]) })}`,
      note: 'How the price has moved over the period you choose.',
      info: `The line shows the closing price, adjusted for stock splits so old prices are comparable. For 10 years and longer, each point is a weekly close.\n\n“vs S&P 500” switches to growth of 100: both lines start at 100 on the first common day, and both include reinvested dividends (the S&P 500 line is the total-return index, ^SP500TR). A line at 150 means 100 invested at the start would be worth 150. Moving above the other line means it did better over that stretch.`,
      body: '<div id="rsChart" class="rs-chart-box"></div>', footer: '<span id="rsChFoot" class="rs-chfoot"></span>',
      source: { source: 'Yahoo Finance', label: 'daily closes' } }),
    after(rootEl) {
      seg(rootEl.querySelector('#rsRange'), v => { chartPref.range = v; savePref('coChart', chartPref); loadChart(); });
      rootEl.querySelector('#rsVs')?.addEventListener('click', e => {
        chartPref.vs = !chartPref.vs;
        e.currentTarget.setAttribute('aria-pressed', String(chartPref.vs));
        savePref('coChart', chartPref);
        loadChart();
      });
      loadChart();
    },
  };
}

async function loadChart() {
  const c = cur;
  if (!c) return;
  const host = root.querySelector('#rsChart');
  const panel = root.querySelector('#pCoChart');
  if (!host) return;
  const [range, label, interval] = RANGES.find(r => r[0] === chartPref.range) || RANGES[3];
  const vs = chartPref.vs && !!root.querySelector('#rsVs');
  const id = ++reqId;
  host.classList.add('is-loading');
  try {
    const [h, b] = await Promise.all([api.history(c.sym, range, interval), vs ? api.history(BENCH, range, interval) : null]);
    if (id !== reqId || c !== cur) return;
    const pts = (hh, key) => hh.t.map((t, i) => ({ t: dayOf(t, hh.gmtoffset), v: hh[key][i] })).filter(p => p.v != null);
    let series, yFmt, refs = [], sub, foot, yDomain;
    const ret = arr => (arr.length > 1 ? (arr.at(-1).v / arr[0].v - 1) * 100 : null);
    if (vs && b) {
      const a = pts(h, 'adj'), s = pts(b, 'adj');
      const start = a[0] && s[0] ? (a[0].t > s[0].t ? a[0].t : s[0].t) : null;
      const rebase = arr => { const x = arr.filter(p => p.t >= start); const base = x[0]?.v; return x.map(p => ({ t: p.t, v: (p.v / base) * 100 })); };
      const A = rebase(a), B = rebase(s);
      series = [{ id: 'a', label: c.sym, data: A, color: SERIES_COLORS[0], width: 1.8 }, { id: 'b', label: 'S&P 500 TR', data: B, color: SERIES_COLORS[1], width: 1.4 }];
      yFmt = v => fmt.num(v, 0);
      refs = [{ v: 100, label: 'start = 100' }];
      yDomain = growthDomain([A, B]);
      sub = `Growth of 100 · dividends reinvested · from ${fmt.date(start)}${interval === '1wk' ? ' · weekly' : ''}`;
      foot = `${label}: <b>${esc(c.sym)}</b> <span class="${cls(ret(A))}">${fmt.spct(ret(A))}</span> · <b>S&amp;P 500 TR</b> <span class="${cls(ret(B))}">${fmt.spct(ret(B))}</span> <span class="rs-dim">(total return)</span>`;
    } else {
      const a = pts(h, 'c');
      series = [{ id: 'a', label: c.sym, data: a, color: SERIES_COLORS[0], area: true, width: 1.6 }];
      yFmt = v => (Math.abs(v) >= 1000 ? fmt.num(v, 0) : fmt.num(v, 2));
      sub = `Price, split-adjusted${interval === '1wk' ? ' · weekly closes' : ' · daily closes'}${h.currency ? ' · ' + esc(h.currency) : ''}`;
      foot = a.length ? `${label}: <span class="${cls(ret(a))}">${fmt.spct(ret(a))}</span> <span class="rs-dim">price change from ${fmt.date(a[0].t)}</span>` : '';
    }
    const opts = { series, height: c.type === 'index' || c.type === 'crypto' ? 360 : 300, yFmt, refs, legend: series.length > 1, ariaLabel: `${c.sym} ${sub}`, empty: 'No price history for this range.', log: false, yDomain: vs && b ? yDomain : undefined };
    if (chart && host.classList.contains('tsc')) chart.update(opts); else chart = tsChart(host, opts);
    root.querySelector('#rsChSub').innerHTML = sub;
    root.querySelector('#rsChFoot').innerHTML = foot;
    setSourceBadge(panel, { asOf: asOfMs(h.meta) });
  } catch (e) {
    if (id !== reqId) return;
    chart?.destroy(); chart = null;
    host.innerHTML = errorStateHTML({ message: esc(e.message), retry: true });
    host.querySelector('[data-retry]')?.addEventListener('click', loadChart, { once: true });
    setSourceBadge(panel, { error: true });
  } finally { host.classList.remove('is-loading'); }
}
const cls = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
/** y range for growth-of-100 lines: a little padding, never below zero, rounded to a step. */
export function growthDomain(seriesList) {
  const vals = seriesList.flat().map(p => p.v).filter(isNum);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const step = d3.tickStep(lo, hi, 5);
  return [Math.max(0, Math.floor((lo - (hi - lo) * 0.04) / step) * step), Math.ceil((hi + (hi - lo) * 0.04) / step) * step];
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------
function newsItem(c) {
  return {
    w: 12,
    html: span => panelHTML({ id: 'pCoNews', span, title: 'Recent News', sub: `Headlines mentioning ${esc(c.sym)}`, bodyId: 'rsNews', minH: 120,
      note: 'Recent headlines about this company or fund. Links open the publisher’s site.',
      info: 'Headlines are collected by Yahoo Finance from many publishers. A headline describes one event or opinion; it is rarely the whole story. Ticker chips show other symbols the article mentions with today’s move.',
      body: skeletonHTML({ rows: 3 }), source: { source: 'Yahoo Finance', label: 'news' } }),
    async after(rootEl) {
      const host = rootEl.querySelector('#rsNews');
      try {
        const items = await api.news(c.sym);
        if (c !== cur) return;
        const list = (Array.isArray(items) ? items : []).slice(0, 9);
        host.innerHTML = list.length ? `<div class="news rs-news">${newsHTML(list, t => lookup(t))}</div>` : '<p class="rs-none">No recent headlines.</p>';
        setSourceBadge(rootEl.querySelector('#pCoNews'), { asOf: Date.now() });
      } catch (e) {
        if (c !== cur) return;
        host.innerHTML = `<p class="rs-none">Headlines are unavailable right now (${esc(e.message)}).</p>`;
        setSourceBadge(rootEl.querySelector('#pCoNews'), { error: true });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Page assembly
// ---------------------------------------------------------------------------
const typeOf = co => {
  const t = co.identity?.type;
  if (t === 'ETF' || t === 'MUTUALFUND' || co.fund) return 'fund';
  if (t === 'INDEX') return 'index';
  if (t === 'CRYPTOCURRENCY') return 'crypto';
  if (t === 'EQUITY') return 'stock';
  return 'other';
};

function render(c) {
  c.charts = [];
  const open = s => openCompany(s);
  let rows;
  if (c.type === 'stock') {
    rows = [
      [chartItem(c), S.keyStats(c)],
      [S.about(c)],
      [S.financials(c), S.context(c)],
      [S.factors(c), S.analyst(c), S.earnings(c)],
      [S.peers(c, open)],
      [S.dividends(c), S.ownership(c)],
      [newsItem(c)],
    ];
  } else if (c.type === 'fund') {
    rows = [
      [chartItem(c), Fd.fundFacts(c)],
      [S.about(c, c.co.fund?.description)],
      [Fd.holdings(c, open), Fd.sectors(c), Fd.allocation(c)],
      [Fd.returns(c)],
      [newsItem(c)],
    ];
  } else {
    rows = [[chartItem(c)]];
  }
  const items = rows.flat().filter(Boolean);
  root.innerHTML = `<section class="grid">${headerHTML(c)}</section>${rowsHTML(rows)}`;
  for (const it of items) { try { it.after?.(root); } catch (e) { console.error('company panel', e); } }
  // Stack items hold their own panels' after hooks
  wireHeader(c);
}

function wireHeader(c) {
  root.querySelector('#rsStar')?.addEventListener('click', () => watch.toggle(c.sym));
  root.querySelector('#rsDca')?.addEventListener('click', () => nav('longterm', 'planning', { params: { s: c.sym } }));
}
function paintStar() {
  const b = root?.querySelector('#rsStar');
  if (!b || !cur) return;
  const on = watch.has(cur.sym);
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  b.title = (on ? 'Remove from' : 'Add to') + ' watchlist';
  b.innerHTML = `<span aria-hidden="true">${on ? '★' : '☆'}</span>${on ? 'On watchlist' : 'Watchlist'}`;
}

async function load(sym) {
  const id = ++reqId;
  chart = null;
  cur = null;
  if (scrollY > root.offsetTop) scrollTo({ top: Math.max(0, root.offsetTop - 60), behavior: 'instant' });
  root.innerHTML = `<section class="grid">${panelHTML({ id: 'pCoProfile', span: 12, title: 'Security', sub: esc(sym), body: skeletonHTML({ rows: 2 }), minH: 90 })}</section>
    <section class="grid">${panelHTML({ id: 'pCoLoad1', span: 8, title: 'Price History', body: skeletonHTML({ chart: true, rows: 1 }), minH: 300 })}${panelHTML({ id: 'pCoLoad2', span: 4, title: 'Key Statistics', body: skeletonHTML({ rows: 8 }), minH: 300 })}</section>`;
  try {
    const [co, fund, q] = await Promise.all([api.company(sym), F ? F : api.fundamentals().catch(() => null), api.quote(sym).catch(() => null)]);
    if (id !== reqId) return;
    F = fund;
    const c = { sym: co.identity?.symbol || sym, co, F, q, cur: co.identity?.currency || 'USD' };
    c.fr = fundRow(F, c.sym);
    c.type = typeOf(co);
    c.price = q?.p ?? co.quote?.price;
    cur = c;
    pushRecent(c.sym, co.identity?.name || '', co.identity?.type || '');
    document.title = `${c.sym} · Research · Market Pulse`;
    render(c);
  } catch (e) {
    if (id !== reqId) return;
    console.error('company', e);
    const notFound = e.status === 404;
    root.innerHTML = `<section class="grid">${panelHTML({ id: 'pCoProfile', span: 12, title: 'Security', sub: esc(sym),
      body: errorStateHTML({ title: notFound ? `No data for ${esc(sym)}` : 'Could not load this page', message: notFound ? 'Yahoo Finance does not recognise this symbol. Check the spelling, or search by company name below.' : esc(e.message), retry: !notFound }) })}</section>`;
    root.querySelector('[data-retry]')?.addEventListener('click', () => load(sym), { once: true });
    landing(true);
  }
}

// ---------------------------------------------------------------------------
// Landing: search + starting points
// ---------------------------------------------------------------------------
const EXAMPLES = [['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['JPM', 'JPMorgan Chase'], ['KO', 'Coca-Cola'], ['VOO', 'S&P 500 ETF'], ['VTI', 'Total market ETF'], ['BND', 'Bond ETF'], ['^GSPC', 'S&P 500 index'], ['BTC-USD', 'Bitcoin']];
async function landing(append = false) {
  if (!append) { cur = null; chart = null; document.title = 'Company · Research · Market Pulse'; }
  const rec = recentList();
  const html = `<section class="grid">${panelHTML({ id: 'pCoFind', span: 12, cls: 'rs-find', title: 'Find a Company or Fund', sub: 'Any Yahoo Finance symbol: stocks, ETFs, mutual funds, indexes, crypto',
    note: 'Type a ticker or a company name to open its page.',
    info: 'A ticker is the short code a security trades under (AAPL for Apple, VOO for Vanguard’s S&P 500 fund). You can also type part of a name. S&P 500 members appear first; other matches come from Yahoo Finance search. Indexes start with ^ (^GSPC is the S&P 500), crypto ends in -USD.',
    body: `<div class="rs-find-b"><input class="rs-find-in" id="rsFindIn" placeholder="Ticker or company name, e.g. AAPL or Coca-Cola" aria-label="Find a company or fund">
      <div class="rs-find-ex"><span class="rs-dim">Try</span>${EXAMPLES.map(([s, n]) => `<a class="rs-chip-l" href="#/research/company?s=${encodeURIComponent(s)}" title="${esc(n)}"><b>${esc(s)}</b><span>${esc(n)}</span></a>`).join('')}</div>
      ${rec.length ? `<div class="rs-find-ex"><span class="rs-dim">Recent</span>${rec.map(x => `<a class="rs-chip-l" href="#/research/company?s=${encodeURIComponent(x.s)}" title="${esc(x.n)}"><b>${esc(x.s)}</b><span>${esc(x.n)}</span></a>`).join('')}</div>` : ''}</div>`,
    source: { source: 'Yahoo Finance', label: 'search' } })}</section>
    <section class="grid">
      ${panelHTML({ id: 'pCoLargest', span: 7, title: 'Largest S&P 500 Companies', sub: 'By market value · click a row for the company page', bodyId: 'rsLargest', minH: 380,
        note: 'The biggest companies in the US stock market, a common place to start reading companies.',
        info: 'The S&P 500 is weighted by size, so these few companies make up a large share of the index and of any fund that tracks it. If you own an S&P 500 index fund you already own a slice of each of them.',
        source: { source: 'Yahoo Finance', label: 'S&P 500 fundamentals' } })}
      ${panelHTML({ id: 'pCoCore', span: 5, title: 'Core ETFs', sub: 'Widely held index funds by role', bodyId: 'rsCore', minH: 380,
        note: 'Broad, low-cost funds that many long-term investors build portfolios from.',
        info: 'An ETF (exchange-traded fund) holds a basket of securities and trades like a single stock. Index ETFs follow a published list, such as the S&P 500 or the whole US bond market, so their costs are low. The expense ratio is the yearly fee as a share of what you hold.',
        source: { source: 'Yahoo Finance', label: 'fund data' } })}
    </section>`;
  if (append) root.insertAdjacentHTML('beforeend', html); else root.innerHTML = html;
  tickerSearch(root.querySelector('#rsFindIn'), { local: () => F?.rows || [], onPick: s => openCompany(s) });
  if (!append) setTimeout(() => root.querySelector('#rsFindIn')?.focus({ preventScroll: true }), 30);
  const largest = root.querySelector('#rsLargest');
  const core = root.querySelector('#rsCore');
  try {
    F = F || await api.fundamentals();
    const seen = new Set();
    const top = [...F.rows].sort((a, b) => b.marketCap - a.marketCap).filter(r => { const k = r.n.replace(/\s*\(Class [A-Z]\)$/, ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
    dataTable(largest, { label: 'Largest S&P 500 companies', rows: top, onRowClick: r => openCompany(r.ys), columns: [
      { key: 's', label: 'Ticker', value: r => r.s, fmt: v => `<b class="rs-sym">${esc(v)}</b>` },
      { key: 'n', label: 'Company', value: r => r.n, fmt: v => `<span class="rs-nmc">${esc(v)}</span>` },
      { key: 'sec', label: 'Sector', value: r => r.sec, fmt: v => `<span class="rs-secc">${esc(v)}</span>` },
      { key: 'mc', label: 'Mkt cap', type: 'num', value: r => r.marketCap, fmt: v => fmt.money(v) },
      { key: 'p', label: 'Price', type: 'num', value: r => r.price, fmt: v => fmt.price(v) },
      { key: 'y', label: '1Y', type: 'num', value: r => r.perf?.y, fmt: v => fmt.spct(v), tone: v => cls(v) },
    ] });
    setSourceBadge(root.querySelector('#pCoLargest'), { asOf: Date.parse(F.generatedAt) });
  } catch (e) { largest.innerHTML = errorStateHTML({ message: esc(e.message) }); }
  try {
    const E = await api.etfs();
    const pickS = ['VTI', 'VOO', 'QQQ', 'SCHD', 'IWM', 'VXUS', 'VWO', 'BND', 'TLT', 'GLD', 'VT'];
    const funds = pickS.map(s => E.funds.find(f => f.s === s)).filter(Boolean);
    dataTable(core, { label: 'Core ETFs', rows: funds, onRowClick: r => openCompany(r.s), columns: [
      { key: 's', label: 'Ticker', value: r => r.s, fmt: v => `<b class="rs-sym">${esc(v)}</b>` },
      { key: 'role', label: 'Role', value: r => r.role, fmt: v => `<span class="rs-nmc">${esc(v)}</span>` },
      { key: 'er', label: 'Fee', type: 'num', value: r => r.expenseRatioPct, fmt: v => fmt.pct(v, 2), title: 'Expense ratio: yearly fee as a percentage of what you hold' },
      { key: 'p', label: 'Price', type: 'num', value: r => r.quote?.price, fmt: v => fmt.price(v) },
      { key: 'r5', label: '5Y /yr', type: 'num', value: r => r.stats?.totalReturnAnnualizedPct?.y5, fmt: v => fmt.spct(v), tone: v => cls(v), title: 'Annualized total return over 5 years, dividends reinvested' },
    ] });
    setSourceBadge(root.querySelector('#pCoCore'), { asOf: Date.parse(E.generatedAt) });
  } catch (e) { core.innerHTML = errorStateHTML({ message: esc(e.message) }); }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
let openCompany = () => {};
export function mount(el, { go, open }) {
  root = el;
  nav = go;
  openCompany = open;
  on('watch', paintStar);
}
let lastSym = undefined;
export function route(params) {
  const s = (params.get('s') || '').trim().toUpperCase();
  if (s === lastSym && (cur || !s)) return;
  lastSym = s;
  if (s) load(s); else landing();
}
/** Live price in the header while the page is visible. */
export function live() {
  if (!cur || !lookup(cur.sym)) return;
  const px = root.querySelector('#rsPx');
  if (px) px.innerHTML = priceHTML(cur);
}
export function invalidate() { lastSym = undefined; }
