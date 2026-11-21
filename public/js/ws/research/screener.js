// Research › Screener (EQS): filter rail + results table over the S&P 500,
// from /api/fundamentals. Filters are range inputs with a small distribution
// histogram you can drag across; active filters show as removable chips.
// State persists in localStorage and is mirrored in the URL (?preset=… or
// ?f=…), so a screen can be bookmarked or linked.
import { esc, seg } from '../../util.js';
import { panelHTML, segHTML, dataTable, setPanelState, setSourceBadge } from '../../ui.js';
import { api, fmt, isNum, DEF, loadPref, savePref, replaceHash, todayET } from './shared.js';

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
const pos = v => (isNum(v) && v > 0 ? v : null);      // multiples: negative = not meaningful
const fac = k => (r, scope) => r.factors?.[scope]?.[k] ?? null;
const offHigh = r => (isNum(r.price) && r.high52 > 0 ? (r.price / r.high52 - 1) * 100 : null);

const GROUPS = [
  { id: 'size', title: 'Size & sector' },
  { id: 'val', title: 'Valuation' },
  { id: 'qual', title: 'Quality' },
  { id: 'grow', title: 'Growth' },
  { id: 'div', title: 'Dividends' },
  { id: 'perf', title: 'Performance & risk' },
  { id: 'anl', title: 'Analyst opinion' },
  { id: 'fac', title: 'Factor scores' },
];
// unit: what the numbers are in ('%' = percent, '$B' = billions of dollars, '' = plain ratio)
const FILTERS = [
  { k: 'mcap', g: 'size', label: 'Market cap', unit: '$B', log: true, get: r => (r.marketCap ? r.marketCap / 1e9 : null), def: DEF.marketCap },
  { k: 'pe', g: 'val', label: 'P/E', get: r => pos(r.pe), def: DEF.pe },
  { k: 'fpe', g: 'val', label: 'Forward P/E', get: r => pos(r.fpe), def: DEF.fpe },
  { k: 'peg', g: 'val', label: 'PEG', get: r => pos(r.peg), def: DEF.peg },
  { k: 'pb', g: 'val', label: 'Price / book', get: r => pos(r.pb), def: DEF.pb },
  { k: 'ps', g: 'val', label: 'Price / sales', get: r => pos(r.priceToSales), def: DEF.ps },
  { k: 'ev', g: 'val', label: 'EV / EBITDA', get: r => pos(r.evToEbitda), def: DEF.evEbitda },
  { k: 'fcfy', g: 'val', label: 'FCF yield', unit: '%', get: r => r.fcfYieldPct, def: DEF.fcfYield },
  { k: 'ey', g: 'val', label: 'Earnings yield', unit: '%', get: r => r.earningsYieldPct, def: DEF.earningsYield },
  { k: 'roe', g: 'qual', label: 'ROE', unit: '%', get: r => r.roePct, def: DEF.roe },
  { k: 'gm', g: 'qual', label: 'Gross margin', unit: '%', get: r => r.grossMarginPct, def: DEF.grossMargin },
  { k: 'om', g: 'qual', label: 'Operating margin', unit: '%', get: r => r.operatingMarginPct, def: DEF.opMargin },
  { k: 'nm', g: 'qual', label: 'Net margin', unit: '%', get: r => r.profitMarginPct, def: DEF.netMargin },
  { k: 'de', g: 'qual', label: 'Debt / equity', get: r => r.debtToEquity, def: DEF.de },
  { k: 'rg', g: 'grow', label: 'Revenue growth', unit: '%', get: r => r.revenueGrowthPct, def: DEF.revGrowth },
  { k: 'eg', g: 'grow', label: 'Earnings growth', unit: '%', get: r => r.earningsGrowthPct, def: DEF.epsGrowth },
  { k: 'fg', g: 'grow', label: 'Forward EPS growth', unit: '%', get: r => r.epsFwdGrowthPct, def: DEF.fwdGrowth },
  { k: 'dy', g: 'div', label: 'Dividend yield', unit: '%', get: r => r.divYieldPct, def: DEF.divYield },
  { k: 'pay', g: 'div', label: 'Payout ratio', unit: '%', get: r => r.payoutRatioPct, def: DEF.payout },
  { k: 'r1y', g: 'perf', label: '1-year return', unit: '%', get: r => r.perf?.y, def: DEF.r1y },
  { k: 'ma200', g: 'perf', label: 'vs 200-day avg', unit: '%', get: r => r.vsMa200Pct, def: DEF.ma200 },
  { k: 'pos52', g: 'perf', label: '52-week position', unit: '', dom: [0, 100], get: r => r.pos52Pct, def: DEF.pos52 },
  { k: 'off', g: 'perf', label: 'Below 52-week high', unit: '%', get: offHigh, def: DEF.offHigh },
  { k: 'vol', g: 'perf', label: 'Volatility (1Y)', unit: '%', get: r => r.vol1yPct, def: DEF.vol },
  { k: 'beta', g: 'perf', label: 'Beta (1Y)', get: r => r.beta1y, def: DEF.beta },
  { k: 'rating', g: 'anl', label: 'Rating (1–5)', dom: [1, 5], get: r => r.ratingScore, def: DEF.rating },
  { k: 'up', g: 'anl', label: 'Target vs price', unit: '%', get: r => r.upsidePct, def: DEF.upside },
  { k: 'nan', g: 'anl', label: 'Analysts', get: r => r.analysts, def: DEF.analysts },
  { k: 'fv', g: 'fac', label: 'Value', dom: [0, 100], get: fac('value'), def: DEF.fValue },
  { k: 'fq', g: 'fac', label: 'Quality', dom: [0, 100], get: fac('quality'), def: DEF.fQuality },
  { k: 'fgr', g: 'fac', label: 'Growth', dom: [0, 100], get: fac('growth'), def: DEF.fGrowth },
  { k: 'fm', g: 'fac', label: 'Momentum', dom: [0, 100], get: fac('momentum'), def: DEF.fMomentum },
  { k: 'flv', g: 'fac', label: 'Low volatility', dom: [0, 100], get: fac('lowVol'), def: DEF.fLowVol },
];
const FBY = Object.fromEntries(FILTERS.map(f => [f.k, f]));
const MCAP_BUCKETS = [['mega', 'Mega', [200, null], '$200B and up'], ['large', 'Large', [10, 200], '$10B – $200B'], ['mid', 'Mid', [2, 10], '$2B – $10B'], ['small', 'Small', [null, 2], 'below $2B']];

const PRESETS = [
  { id: 'large-profitable', name: 'Large and profitable', f: { mcap: [50, null], nm: [15, null], roe: [15, null] }, cols: 'quality', sort: ['mcap', -1] },
  { id: 'dividend', name: 'Dividend payers', f: { dy: [3, null], pay: [null, 80] }, cols: 'overview', sort: ['dy', -1] },
  { id: 'growers', name: 'Fast growers', f: { rg: [20, null], fg: [15, null] }, cols: 'quality', sort: ['rg', -1] },
  { id: 'low-vol', name: 'Low volatility', f: { vol: [null, 20], beta: [null, 0.8] }, cols: 'perf', sort: ['vol', 1] },
  { id: 'below-high', name: 'Furthest below 52-week high', f: { off: [null, -30] }, cols: 'perf', sort: ['off', 1] },
  { id: 'low-pe', name: 'Low P/E', f: { pe: [0, 15] }, cols: 'valuation', sort: ['pe', 1] },
];

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------
const SEC_SHORT = { 'Information Technology': 'Info Tech', 'Communication Services': 'Comm Services', 'Consumer Discretionary': 'Cons Discretionary', 'Consumer Staples': 'Cons Staples' };
const TODAY = todayET();
const tone = v =>(v > 0 ? 'up' : v < 0 ? 'down' : '');
const numCol = (key, label, value, f, extra = {}) => ({ key, label, type: 'num', value, fmt: v => f(v), ...extra });
// Multiples sort on positive values only; negative ones read "NM" and sort last.
const NM = '<span class="rs-nm" title="Not meaningful: the earnings (or book value) behind this ratio are negative">NM</span>';
const multCol = (key, label, raw, title, d = 1) => ({ key, label, type: 'num', title, value: r => pos(raw(r)),
  fmt: (v, r) => (v == null && isNum(raw(r)) && raw(r) <= 0 ? NM : fmt.mult(v, d)) });
const facCell = v => (v == null ? '<span class="rs-dim">—</span>' : `<span class="rs-fc"><i style="width:${v}%"></i></span><b class="rs-fcv">${Math.round(v)}</b>`);
const posCell = v => (v == null ? '—' : `<span class="rs-p52" title="${fmt.num(v, 0)} of 100"><i style="left:${Math.max(0, Math.min(100, v))}%"></i></span><b class="rs-fcv">${fmt.num(v, 0)}</b>`);

function columnLib(scope) {
  const sc = scope === 'sector' ? 'vs sector' : 'vs S&P 500';
  return {
    sym: { key: 'sym', label: 'Ticker', value: r => r.s, fmt: v => `<b class="rs-sym">${esc(v)}</b>` },
    name: { key: 'name', label: 'Company', value: r => r.n, fmt: v => `<span class="rs-nmc" title="${esc(v)}">${esc(v)}</span>` },
    sec: { key: 'sec', label: 'Sector', value: r => r.sec, fmt: v => `<span class="rs-secc" title="${esc(v)}">${esc(SEC_SHORT[v] || v)}</span>` },
    price: numCol('price', 'Price', r => r.price, fmt.price),
    chg: numCol('chg', '1D', r => r.chgPct, v => fmt.spct(v, 2), { tone, title: 'Price change on the latest trading day' }),
    mcap: numCol('mcap', 'Mkt cap', r => r.marketCap, v => fmt.money(v), { title: DEF.marketCap }),
    pe: multCol('pe', 'P/E', r => r.pe ?? (r.eps < 0 ? -1 : null), DEF.pe),
    fpe: multCol('fpe', 'Fwd P/E', r => r.fpe, DEF.fpe),
    peg: multCol('peg', 'PEG', r => r.peg, DEF.peg, 2),
    pb: multCol('pb', 'P/B', r => r.pb, DEF.pb),
    ps: multCol('ps', 'P/S', r => r.priceToSales, DEF.ps),
    ev: multCol('ev', 'EV/EBITDA', r => r.evToEbitda, DEF.evEbitda),
    ey: numCol('ey', 'Earn yld', r => r.earningsYieldPct, v => fmt.pct(v, 2), { title: DEF.earningsYield }),
    fcfy: numCol('fcfy', 'FCF yld', r => r.fcfYieldPct, v => fmt.pct(v, 2), { title: DEF.fcfYield }),
    dy: numCol('dy', 'Div yld', r => r.divYieldPct, v => fmt.pct(v, 2), { title: DEF.divYield }),
    pay: numCol('pay', 'Payout', r => r.payoutRatioPct, v => fmt.pct(v, 0), { title: DEF.payout }),
    gm: numCol('gm', 'Gross m.', r => r.grossMarginPct, v => fmt.pct(v), { title: DEF.grossMargin }),
    om: numCol('om', 'Oper. m.', r => r.operatingMarginPct, v => fmt.pct(v), { title: DEF.opMargin }),
    nm: numCol('nm', 'Net m.', r => r.profitMarginPct, v => fmt.pct(v), { title: DEF.netMargin }),
    roe: numCol('roe', 'ROE', r => r.roePct, v => fmt.pct(v), { title: DEF.roe }),
    roa: numCol('roa', 'ROA', r => r.roaPct, v => fmt.pct(v), { title: DEF.roa }),
    de: numCol('de', 'Debt/Eq', r => r.debtToEquity, v => fmt.num(v, 2), { title: DEF.de }),
    rg: numCol('rg', 'Rev gr.', r => r.revenueGrowthPct, v => fmt.spct(v), { title: DEF.revGrowth }),
    eg: numCol('eg', 'Earn gr.', r => r.earningsGrowthPct, v => fmt.spct(v), { title: DEF.epsGrowth }),
    fg: numCol('fg', 'Fwd EPS gr.', r => r.epsFwdGrowthPct, v => fmt.spct(v), { title: DEF.fwdGrowth }),
    w: numCol('w', '1W', r => r.perf?.w, v => fmt.spct(v), { tone }),
    m: numCol('m', '1M', r => r.perf?.m, v => fmt.spct(v), { tone }),
    q: numCol('q', '3M', r => r.perf?.q, v => fmt.spct(v), { tone }),
    ytd: numCol('ytd', 'YTD', r => r.perf?.ytd, v => fmt.spct(v), { tone, title: DEF.ytd }),
    r1y: numCol('r1y', '1Y', r => r.perf?.y, v => fmt.spct(v), { tone, title: DEF.r1y }),
    ma200: numCol('ma200', 'vs 200d', r => r.vsMa200Pct, v => fmt.spct(v), { tone, title: DEF.ma200 }),
    pos52: { key: 'pos52', label: '52W pos.', type: 'num', value: r => r.pos52Pct, fmt: posCell, title: DEF.pos52 },
    off: numCol('off', 'Off high', offHigh, v => fmt.pct(v), { title: DEF.offHigh }),
    vol: numCol('vol', 'Vol 1Y', r => r.vol1yPct, v => fmt.pct(v), { title: DEF.vol }),
    beta: numCol('beta', 'Beta', r => r.beta1y, v => fmt.num(v, 2), { title: DEF.beta }),
    rating: { key: 'rating', label: 'Rating', type: 'num', value: r => r.ratingScore, title: DEF.rating,
      fmt: (v, r) => (v == null ? '—' : `<span class="rs-rt">${esc((r.rating || '').replace(/^[\d.]+\s*-\s*/, ''))}</span> ${fmt.num(v, 1)}`) },
    nan: numCol('nan', 'Analysts', r => r.analysts, fmt.int, { title: DEF.analysts }),
    tlo: numCol('tlo', 'Target low', r => r.targetLow, fmt.price, { title: 'Lowest analyst price target' }),
    tgt: numCol('tgt', 'Target mean', r => r.targetMean, fmt.price, { title: 'Average analyst price target' }),
    thi: numCol('thi', 'Target high', r => r.targetHigh, fmt.price, { title: 'Highest analyst price target' }),
    up: numCol('up', 'Target vs price', r => r.upsidePct, v => fmt.spct(v), { title: DEF.upside }),
    earn: { key: 'earn', label: 'Next earnings', type: 'num', value: r => (r.nextEarnings ? Date.parse(r.nextEarnings) : null),
      fmt: (v, r) => (!r.nextEarnings ? '—' : r.nextEarnings < TODAY ? `<span class="rs-dim" title="This date has passed; Yahoo has not published the next one yet">${fmt.date(r.nextEarnings)}</span>`
        : fmt.date(r.nextEarnings) + (r.nextEarningsEstimated ? '<sup title="Estimated date">*</sup>' : '')), title: 'Next scheduled earnings report (* = date estimated by Yahoo)' },
    fv: { key: 'fv', label: 'Value', type: 'num', value: r => fac('value')(r, scope), fmt: facCell, title: DEF.fValue + ' Ranked ' + sc + '.' },
    fq: { key: 'fq', label: 'Quality', type: 'num', value: r => fac('quality')(r, scope), fmt: facCell, title: DEF.fQuality + ' Ranked ' + sc + '.' },
    fgr: { key: 'fgr', label: 'Growth', type: 'num', value: r => fac('growth')(r, scope), fmt: facCell, title: DEF.fGrowth + ' Ranked ' + sc + '.' },
    fm: { key: 'fm', label: 'Momentum', type: 'num', value: r => fac('momentum')(r, scope), fmt: facCell, title: DEF.fMomentum + ' Ranked ' + sc + '.' },
    flv: { key: 'flv', label: 'Low vol', type: 'num', value: r => fac('lowVol')(r, scope), fmt: facCell, title: DEF.fLowVol + ' Ranked ' + sc + '.' },
  };
}
const COLSETS = [
  ['overview', 'Overview', ['sym', 'name', 'sec', 'price', 'chg', 'mcap', 'pe', 'fpe', 'dy', 'ytd', 'r1y']],
  ['valuation', 'Valuation', ['sym', 'name', 'sec', 'mcap', 'pe', 'fpe', 'peg', 'pb', 'ps', 'ev', 'ey', 'fcfy', 'dy']],
  ['quality', 'Quality & growth', ['sym', 'name', 'sec', 'mcap', 'gm', 'om', 'nm', 'roe', 'roa', 'de', 'rg', 'eg', 'fg']],
  ['perf', 'Performance', ['sym', 'name', 'price', 'chg', 'w', 'm', 'ytd', 'r1y', 'off', 'pos52', 'ma200', 'vol', 'beta']],
  ['analyst', 'Analyst', ['sym', 'name', 'price', 'rating', 'nan', 'tlo', 'tgt', 'thi', 'up', 'earn']],
  ['factors', 'Factors', ['sym', 'name', 'sec', 'mcap', 'fv', 'fq', 'fgr', 'fm', 'flv']],
];
const COLSET = Object.fromEntries(COLSETS.map(c => [c[0], c]));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const DEFAULT = { f: {}, sec: [], q: '', cols: 'overview', sort: ['mcap', -1], scope: 'index' };
let st = structuredClone(DEFAULT);
let F = null;               // /api/fundamentals payload
let rows = [];              // all rows, by market cap
let hist = {};              // k → histogram model
let table = null, tableCols = null;
let el = {}, mounted = false, visible = false, pollT = 0, raf = 0, urlT = 0;

const unitTxt = (u, v) => (u === '$B' ? '$' + v + 'B' : u === '%' ? v + '%' : String(v));
const nfmt = v => String(+(+v).toFixed(Math.abs(v) >= 100 ? 0 : 2));
function rangeTxt(def, [lo, hi]) {
  const u = def.unit || '';
  if (lo != null && hi != null) return `${unitTxt(u, nfmt(lo))} – ${unitTxt(u, nfmt(hi))}`;
  if (lo != null) return '≥ ' + unitTxt(u, nfmt(lo));
  return '≤ ' + unitTxt(u, nfmt(hi));
}
const activeKeys = () => Object.keys(st.f).filter(k => FBY[k] && (st.f[k][0] != null || st.f[k][1] != null));
const criteriaTxt = f => Object.entries(f).map(([k, r]) => `${FBY[k].label} ${rangeTxt(FBY[k], r)}`).join(' · ');

function matchPreset() {
  if (st.sec.length || st.q) return null;
  const ak = activeKeys();
  return PRESETS.find(p => {
    const pk = Object.keys(p.f);
    return pk.length === ak.length && pk.every(k => st.f[k] && st.f[k][0] === p.f[k][0] && st.f[k][1] === p.f[k][1]);
  }) || null;
}

// URL <-> state
function encode() {
  const p = new URLSearchParams();
  const pre = matchPreset();
  if (pre) p.set('preset', pre.id);
  else {
    const f = activeKeys().map(k => `${k}:${st.f[k][0] ?? ''}~${st.f[k][1] ?? ''}`).join(';');
    if (f) p.set('f', f);
    if (st.sec.length) p.set('sec', st.sec.join(','));
    if (st.q) p.set('q', st.q);
  }
  const base = pre || DEFAULT;
  if (base.cols !== st.cols) p.set('cols', st.cols);
  if (st.sort[0] && (base.sort[0] !== st.sort[0] || base.sort[1] !== st.sort[1])) p.set('sort', st.sort[0] + ':' + (st.sort[1] === 1 ? 'asc' : 'desc'));
  if (st.scope !== 'index') p.set('scope', st.scope);
  return p.toString();
}
function decode(p) {
  const next = structuredClone(DEFAULT);
  const pre = PRESETS.find(x => x.id === p.get('preset'));
  if (pre) { next.f = structuredClone(pre.f); next.cols = pre.cols; next.sort = [...pre.sort]; }
  for (const part of (p.get('f') || '').split(';')) {
    const m = /^(\w+):(-?[\d.]*)~(-?[\d.]*)$/.exec(part);
    if (m && FBY[m[1]]) next.f[m[1]] = [m[2] === '' ? null : +m[2], m[3] === '' ? null : +m[3]];
  }
  if (p.get('sec')) next.sec = p.get('sec').split(',').filter(Boolean);
  if (p.get('q')) next.q = p.get('q');
  if (COLSET[p.get('cols')]) next.cols = p.get('cols');
  const so = /^(\w+):(asc|desc)$/.exec(p.get('sort') || '');
  if (so) next.sort = [so[1], so[2] === 'asc' ? 1 : -1];
  if (p.get('scope') === 'sector') next.scope = 'sector';
  return next;
}
const hasState = p => ['preset', 'f', 'sec', 'q', 'cols', 'sort', 'scope'].some(k => p.has(k));

function persist() {
  savePref('screener', st);
  clearTimeout(urlT);
  urlT = setTimeout(() => { if (visible) replaceHash('#/research/screener' + (encode() ? '?' + encode() : '')); }, 250);
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------
const RAIL_INFO = `Each row narrows the list to companies whose value falls inside the range you set. Type a minimum, a maximum or both, or drag across the small chart: it shows how all 500 companies are spread on that measure, so you can see what is typical before you choose.

A company with no value for a measure (for example P/E for a company that lost money, or free cash flow yield for a bank) is left out while that filter is on.

P/E: price ÷ last-year earnings per share. Free cash flow yield: cash left after investment ÷ market value. ROE: profit ÷ shareholders’ equity. Factor scores rank each company 0–100 on a trait, within the whole index or within its sector.`;
const RES_INFO = `One row per company that passes every active filter. Click a column heading to sort, click a row to open the company page. Column sets switch between groups of measures; hover a heading for its definition.

Presets are starting points with their exact criteria shown; they describe what a list contains, not what to do with it. Factor scores are drawn as bars from 0 to 100, where 50 is the middle of the group.

Fundamentals come from Yahoo Finance and are refreshed by the server in the background; prices in this table are as of the last rebuild (at most 15 minutes old).`;

function railHTML() {
  const groups = GROUPS.map(g => {
    const fs = FILTERS.filter(f => f.g === g.id);
    let extra = '';
    if (g.id === 'size') {
      extra = `<div class="rs-buckets" role="group" aria-label="Company size">${MCAP_BUCKETS.map(([id, l, , t]) => `<button type="button" data-bucket="${id}" title="${esc(t)}">${l}</button>`).join('')}</div>`;
    }
    if (g.id === 'fac') {
      extra = `<div class="rs-scope"><span>Rank within</span>${segHTML({ id: 'rsScopeRail', small: true, value: st.scope, label: 'Rank factor scores within', options: [['index', 'S&amp;P 500'], ['sector', 'Sector']] })}</div>`;
    }
    const rowsH = fs.map(f => `<div class="rs-flt" data-k="${f.k}">
        <div class="rs-flt-h"><label for="rsf-${f.k}" title="${esc(f.def)}">${esc(f.label)}</label>
          <span class="rs-flt-in"><input id="rsf-${f.k}" data-k="${f.k}" data-b="0" inputmode="decimal" placeholder="min" aria-label="${esc(f.label)} minimum"><i>–</i><input data-k="${f.k}" data-b="1" inputmode="decimal" placeholder="max" aria-label="${esc(f.label)} maximum"><em>${f.unit === '$B' ? '$B' : f.unit || ''}</em></span></div>
        <svg class="rs-hist" data-k="${f.k}" viewBox="0 0 160 16" preserveAspectRatio="none" aria-hidden="true"></svg>
      </div>`).join('');
    const sec = g.id === 'size' ? '<div class="rs-secs" id="rsSecs" role="group" aria-label="Sectors"></div>' : '';
    return `<details class="rs-fg" data-g="${g.id}"${['size', 'val'].includes(g.id) ? ' open' : ''}>
      <summary><span>${g.title}</span><b class="rs-fg-n" data-gn="${g.id}"></b></summary>
      <div class="rs-fg-b">${extra}${g.id === 'size' ? rowsH + sec : rowsH}</div></details>`;
  }).join('');
  return `<div class="rs-cov" id="rsCov" hidden></div>${groups}`;
}

const MARKUP = `
<section class="grid rs-scr">
  ${panelHTML({ id: 'pScreenFilters', span: 3, cls: 'rs-rail', title: 'Filters', sub: 'Ranges · drag across a chart or type', bodyId: 'rsRail', minH: 400,
    controls: '<button type="button" class="btn-link" id="rsReset2">Clear all</button>',
    note: 'Narrow the list to companies inside the ranges you choose.', info: RAIL_INFO,
    source: { label: 'S&P 500 fundamentals' } })}
  ${panelHTML({ id: 'pScreenResults', span: 9, cls: 'rs-res', title: 'Screener Results', sub: 'S&amp;P 500 members passing every filter · click a row for the company page', bodyId: 'rsResBody', minH: 520,
    controls: `<input type="search" class="search rs-q" id="rsQ" placeholder="Find ticker or name" aria-label="Find ticker or company name" autocomplete="off" spellcheck="false">
      <span id="rsScopeWrap" hidden>${segHTML({ id: 'rsScopeRes', small: true, value: 'index', label: 'Rank factor scores within', options: [['index', 'vs S&amp;P 500'], ['sector', 'vs sector']] })}</span>
      ${segHTML({ id: 'rsCols', small: true, value: 'overview', label: 'Column set', options: COLSETS.map(([v, l]) => [v, l]) })}`,
    note: 'Companies that pass every filter. Presets are starting points, with their criteria shown.', info: RES_INFO,
    body: `<div class="rs-presets" id="rsPresets" role="group" aria-label="Preset screens"></div>
      <div class="rs-active"><div class="rs-count" id="rsCount" role="status"></div><div class="rs-chips" id="rsChips"></div><button type="button" class="btn-link" id="rsReset" hidden>Reset</button></div>
      <div class="rs-table" id="rsTable"></div>
      <div class="rs-tfoot"><span id="rsMore" class="rs-dim"></span><button type="button" class="btn-link" id="rsCsv">Export CSV (all matching rows)</button></div>`,
    source: { label: 'S&P 500 fundamentals' } })}
</section>`;

// ---------------------------------------------------------------------------
// Histograms
// ---------------------------------------------------------------------------
const BINS = 32;
function quantile(sorted, q) { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i); return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo); }
function buildHist(def) {
  const vals = rows.map(r => def.get(r, st.scope)).filter(isNum).sort((a, b) => a - b);
  if (vals.length < 5) return null;
  let lo = def.dom?.[0] ?? quantile(vals, 0.02), hi = def.dom?.[1] ?? quantile(vals, 0.98);
  if (def.log) { lo = Math.log10(Math.max(vals[0], 0.1)); hi = Math.log10(quantile(vals, 0.995)); }
  if (hi <= lo) hi = lo + 1;
  const tf = v => (def.log ? Math.log10(Math.max(v, 1e-6)) : v);
  const counts = new Array(BINS).fill(0);
  for (const v of vals) counts[Math.max(0, Math.min(BINS - 1, Math.floor(((tf(v) - lo) / (hi - lo)) * BINS)))]++;
  const at = f => (def.log ? 10 ** (lo + f * (hi - lo)) : lo + f * (hi - lo));
  const binMid = i => at((i + 0.5) / BINS);
  return { lo, hi, counts, n: vals.length, median: quantile(vals, 0.5), p10: quantile(vals, 0.1), p90: quantile(vals, 0.9), at, binMid, tf };
}
function niceRound(def, v) {
  if (def.dom && def.dom[1] - def.dom[0] <= 5) return Math.round(v * 10) / 10;
  if (def.dom) return Math.round(v);
  const a = Math.abs(v);
  const step = a >= 100 ? 5 : a >= 20 ? 1 : a >= 5 ? 0.5 : a >= 1 ? 0.1 : 0.05;
  return Math.round(v / step) * step;
}
function paintHist(k) {
  const svg = el.rail.querySelector(`.rs-hist[data-k="${k}"]`);
  const h = hist[k];
  if (!svg) return;
  if (!h) { svg.innerHTML = ''; return; }
  const max = Math.max(...h.counts);
  const [lo, hi] = st.f[k] || [null, null];
  const active = lo != null || hi != null;
  const w = 160 / BINS;
  const mx = ((h.tf(h.median) - h.lo) / (h.hi - h.lo)) * 160;
  svg.innerHTML = h.counts.map((c, i) => {
    const v = h.binMid(i);
    const on = active && (lo == null || v >= lo) && (hi == null || v <= hi);
    const ht = c ? Math.max(1.5, (Math.sqrt(c) / Math.sqrt(max)) * 15) : 0;
    return `<rect x="${(i * w + 0.4).toFixed(2)}" y="${(16 - ht).toFixed(2)}" width="${(w - 0.8).toFixed(2)}" height="${ht.toFixed(2)}"${on ? ' class="on"' : ''}/>`;
  }).join('') + `<line class="md" x1="${mx}" x2="${mx}" y1="0" y2="16"/>`;
  const def = FBY[k];
  svg.parentElement.title = `${def.label}: median ${unitTxt(def.unit, nfmt(h.median))}; middle 80% of companies ${unitTxt(def.unit, nfmt(h.p10))} to ${unitTxt(def.unit, nfmt(h.p90))} (${h.n} with data). Drag across the chart to set a range.`;
}
function rebuildHists(only = null) {
  for (const def of FILTERS) if (!only || only(def)) { hist[def.k] = buildHist(def); paintHist(def.k); }
}

function wireHistDrag(svg) {
  let start = null, k = null;
  const frac = e => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  const setFrom = (a, b) => {
    const h = hist[k], def = FBY[k];
    if (!h) return;
    const f0 = Math.min(a, b), f1 = Math.max(a, b);
    const lo = f0 <= 0.01 ? null : niceRound(def, h.at(f0));
    const hi = f1 >= 0.99 ? null : niceRound(def, h.at(f1));
    if (lo == null && hi == null) delete st.f[k]; else st.f[k] = [lo, hi];
    syncInputs(k);
    paintHist(k);
    schedule();
  };
  svg.addEventListener('pointerdown', e => {
    k = svg.dataset.k;
    if (!hist[k]) return;
    start = frac(e);
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', e => { if (start != null && Math.abs(frac(e) - start) > 0.015) setFrom(start, frac(e)); });
  const end = () => { start = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function passes(r) {
  if (st.sec.length && !st.sec.includes(r.sec)) return false;
  if (st.q) {
    const Q = st.q.toUpperCase();
    if (!r.s.includes(Q) && !r.n.toUpperCase().includes(Q)) return false;
  }
  for (const k of activeKeys()) {
    const v = FBY[k].get(r, st.scope);
    const [lo, hi] = st.f[k];
    if (!isNum(v) || (lo != null && v < lo) || (hi != null && v > hi)) return false;
  }
  return true;
}

function ensureTable() {
  const set = COLSET[st.cols] || COLSET.overview;
  const sig = st.cols + ':' + st.scope;
  if (table && tableCols === sig) return;
  const lib = columnLib(st.scope);
  const cols = set[2].map(k => lib[k]);
  if (!cols.some(c => c.key === st.sort[0])) st.sort = [['mcap', 'r1y', 'price'].find(k => cols.some(c => c.key === k)), -1];
  table = dataTable(el.table, {
    columns: cols, rows: [], sort: st.sort[0], dir: st.sort[1], label: 'Screener results',
    empty: 'No company passes every filter. Remove a filter or widen a range.',
    onRowClick: r => goCompany(r.ys),
  });
  tableCols = sig;
  curCols = cols;
  const wrap = el.table.querySelector('.dt-wrap');
  wrap.addEventListener('scroll', () => {
    if (limit < list.length && wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 300) { limit += PAGE; paintRows(); }
  }, { passive: true });
}
let goCompany = () => {};

// The table only holds the first `limit` rows of the sorted result and grows
// as you scroll, so a keystroke never re-lays-out 500 rows. Sorting happens
// here on the full result with the same rules as dataTable (nulls last).
const PAGE = 100;
let list = [], limit = PAGE, curCols = [];
function sortList() {
  const c = curCols.find(x => x.key === st.sort[0]);
  if (!c) return;
  const dir = st.sort[1];
  list.sort((a, b) => {
    const av = c.value(a), bv = c.value(b);
    if (av == null || bv == null || (typeof av === 'number' && !isFinite(av))) return (av == null) - (bv == null);
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
  });
}
function paintRows() {
  table.update(list.slice(0, limit));
  el.more.textContent = list.length > limit ? `Showing ${limit} of ${list.length} · scroll the table for more` : '';
}
function exportCSV() {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [curCols.map(c => q(c.label)).join(','), ...list.map(r => curCols.map(c => q(c.value(r))).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = `sp500-screen-${st.cols}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function apply() {
  if (!F) return;
  ensureTable();
  list = rows.filter(passes);
  sortList();
  limit = PAGE;
  const wrap = el.table.querySelector('.dt-wrap');
  if (wrap) wrap.scrollTop = 0;
  paintRows();
  el.count.innerHTML = `<b>${list.length}</b> of ${rows.length} companies`;
  const chips = [];
  if (st.sec.length) chips.push(`<button type="button" class="rs-chip" data-rm="sec" title="Remove filter">Sector: ${esc(st.sec.map(s => SEC_SHORT[s] || s).join(', '))}<i aria-hidden="true">×</i></button>`);
  for (const k of activeKeys()) chips.push(`<button type="button" class="rs-chip" data-rm="${k}" title="Remove filter"${FBY[k].g === 'fac' ? ` data-scope="${st.scope}"` : ''}>${esc(FBY[k].label)}${FBY[k].g === 'fac' ? ` <small>${st.scope === 'sector' ? 'in sector' : 'in S&amp;P'}</small>` : ''} <b>${esc(rangeTxt(FBY[k], st.f[k]))}</b><i aria-hidden="true">×</i></button>`);
  if (st.q) chips.push(`<button type="button" class="rs-chip" data-rm="q" title="Clear search">Name contains <b>${esc(st.q)}</b><i aria-hidden="true">×</i></button>`);
  el.chips.innerHTML = chips.join('') || '<span class="rs-dim">No filters: showing every S&amp;P 500 member.</span>';
  el.reset.hidden = !chips.length;
  // Rail state
  for (const r of el.rail.querySelectorAll('.rs-flt')) r.classList.toggle('on', activeKeys().includes(r.dataset.k));
  for (const g of GROUPS) {
    const n = activeKeys().filter(k => FBY[k].g === g.id).length + (g.id === 'size' && st.sec.length ? 1 : 0);
    const b = el.rail.querySelector(`[data-gn="${g.id}"]`);
    if (b) b.textContent = n ? n : '';
  }
  const mc = st.f.mcap;
  for (const b of el.rail.querySelectorAll('[data-bucket]')) {
    const bk = MCAP_BUCKETS.find(x => x[0] === b.dataset.bucket)[2];
    b.setAttribute('aria-pressed', String(!!mc && mc[0] === bk[0] && mc[1] === bk[1]));
  }
  for (const b of el.rail.querySelectorAll('[data-sec]')) b.setAttribute('aria-pressed', String(st.sec.includes(b.dataset.sec)));
  const pre = matchPreset();
  for (const b of el.presets.querySelectorAll('[data-preset]')) b.setAttribute('aria-pressed', String(pre?.id === b.dataset.preset));
  el.scopeWrap.hidden = st.cols !== 'factors';
  persist();
}
function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); }

function syncInputs(only = null) {
  for (const inp of el.rail.querySelectorAll('input[data-k]')) {
    if (only && inp.dataset.k !== only) continue;
    if (inp === document.activeElement && !only) continue;
    const v = st.f[inp.dataset.k]?.[+inp.dataset.b];
    inp.value = v == null ? '' : nfmt(v);
  }
  if (el.q !== document.activeElement) el.q.value = st.q;
  setSeg(el.cols, st.cols);
  setSeg(document.getElementById('rsScopeRail'), st.scope);
  setSeg(document.getElementById('rsScopeRes'), st.scope);
}
function setSeg(segEl, v) {
  if (!segEl) return;
  for (const b of segEl.querySelectorAll('button')) { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
}

function renderSectors() {
  const counts = {};
  for (const r of rows) counts[r.sec] = (counts[r.sec] || 0) + 1;
  el.secs.innerHTML = Object.keys(counts).sort().map(s => `<button type="button" data-sec="${esc(s)}" aria-pressed="false" title="${esc(s)}"><span>${esc(SEC_SHORT[s] || s)}</span><i>${counts[s]}</i></button>`).join('');
}
function renderPresets() {
  el.presets.innerHTML = PRESETS.map(p => `<button type="button" class="rs-preset" data-preset="${p.id}" aria-pressed="false"><b>${esc(p.name)}</b><span>${esc(criteriaTxt(p.f))}</span></button>`).join('');
}
function renderCoverage() {
  const e = F.meta?.enrichment;
  const incomplete = e && (e.coverage < e.of || e.crawling);
  el.cov.hidden = !incomplete;
  if (incomplete) el.cov.innerHTML = `<b>Fundamentals loaded for ${e.coverage} of ${e.of} companies.</b> The server is still collecting margins, growth, cash flow and analyst data${e.crawlProgress ? ` (${esc(String(e.crawlProgress))})` : ''}; filters on those measures leave out companies not loaded yet. This list refreshes on its own.`;
  clearTimeout(pollT);
  if (incomplete && visible) pollT = setTimeout(() => load(true), 90e3);
}

async function load(fresh = false) {
  const panelRes = document.getElementById('pScreenResults');
  const panelRail = document.getElementById('pScreenFilters');
  if (!F) { el.table.innerHTML = '<div class="skel" aria-hidden="true"><b class="skel-chart"></b><i></i><i></i><i></i></div>'; }
  try {
    const data = await api.fundamentals(fresh);
    F = data;
    rows = [...F.rows].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    const asOf = Date.parse(F.meta?.quotes?.asOf || F.generatedAt) || null;
    setSourceBadge(panelRes, { asOf });
    setSourceBadge(panelRail, { asOf });
    renderSectors();
    renderCoverage();
    rebuildHists();
    table = null;
    syncInputs();
    apply();
  } catch (e) {
    console.error('screener', e);
    if (!F) setPanelState(el.table, 'error', { message: esc(e.message), retry: () => load(true) });
    setSourceBadge(panelRes, { error: true });
  }
}

function wire() {
  el.rail.addEventListener('input', e => {
    const inp = e.target.closest('input[data-k]');
    if (!inp) return;
    const k = inp.dataset.k, b = +inp.dataset.b;
    const raw = inp.value.replace(/[%$,\sBb]/g, '');
    const v = raw === '' || raw === '-' ? null : parseFloat(raw);
    if (raw !== '' && raw !== '-' && !isFinite(v)) return;
    const cur = st.f[k] ? [...st.f[k]] : [null, null];
    cur[b] = v;
    if (cur[0] == null && cur[1] == null) delete st.f[k]; else st.f[k] = cur;
    paintHist(k);
    schedule();
  });
  el.rail.addEventListener('keydown', e => {
    const inp = e.target.closest('input[data-k]');
    if (inp && e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  el.rail.addEventListener('click', e => {
    const bk = e.target.closest('[data-bucket]');
    if (bk) {
      const r = MCAP_BUCKETS.find(x => x[0] === bk.dataset.bucket)[2];
      const on = st.f.mcap && st.f.mcap[0] === r[0] && st.f.mcap[1] === r[1];
      if (on) delete st.f.mcap; else st.f.mcap = [...r];
      syncInputs('mcap'); paintHist('mcap'); schedule();
      return;
    }
    const sb = e.target.closest('[data-sec]');
    if (sb) {
      const s = sb.dataset.sec;
      st.sec = st.sec.includes(s) ? st.sec.filter(x => x !== s) : [...st.sec, s];
      schedule();
    }
  });
  for (const svg of el.rail.querySelectorAll('.rs-hist')) wireHistDrag(svg);
  const onScope = v => {
    st.scope = v;
    rebuildHists(d => d.g === 'fac');
    syncInputs();
    schedule();
  };
  seg(document.getElementById('rsScopeRail'), onScope);
  seg(document.getElementById('rsScopeRes'), onScope);
  seg(el.cols, v => { st.cols = v; schedule(); });
  el.q.addEventListener('input', () => { st.q = el.q.value.trim(); schedule(); });
  el.chips.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const k = b.dataset.rm;
    if (k === 'sec') st.sec = [];
    else if (k === 'q') st.q = '';
    else { delete st.f[k]; paintHist(k); }
    syncInputs();
    schedule();
  });
  const reset = () => { st = { ...structuredClone(DEFAULT), cols: st.cols, scope: st.scope }; syncInputs(); rebuildHists(); schedule(); };
  el.reset.addEventListener('click', reset);
  document.getElementById('rsReset2').addEventListener('click', reset);
  el.presets.addEventListener('click', e => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const p = PRESETS.find(x => x.id === b.dataset.preset);
    if (matchPreset()?.id === p.id) { reset(); return; }
    st = { ...structuredClone(DEFAULT), f: structuredClone(p.f), cols: p.cols, sort: [...p.sort], scope: st.scope };
    // Open the rail groups the preset uses, so its criteria are visible there too.
    for (const k of Object.keys(p.f)) el.rail.querySelector(`.rs-fg[data-g="${FBY[k].g}"]`)?.setAttribute('open', '');
    syncInputs(); rebuildHists(d => d.g === 'fac'); for (const d of FILTERS) paintHist(d.k);
    schedule();
  });
  // Sorting: own the state (so it persists and survives column-set switches),
  // then let the table sort.
  el.table.addEventListener('click', e => {
    const th = e.target.closest('thead th');
    if (!th || !table) return;
    e.stopPropagation();
    const k = th.dataset.k;
    const col = columnLib(st.scope)[k];
    const dir = st.sort[0] === k ? -st.sort[1] : col?.type === 'num' ? -1 : 1;
    st.sort = [k, dir];
    sortList();
    limit = PAGE;
    table.sortBy(k, dir);
    paintRows();
    persist();
  }, true);
}

export function mount(root, { openCompany }) {
  goCompany = openCompany;
  root.innerHTML = MARKUP;
  el = {
    rail: root.querySelector('#rsRail'), table: root.querySelector('#rsTable'), count: root.querySelector('#rsCount'),
    chips: root.querySelector('#rsChips'), reset: root.querySelector('#rsReset'), presets: root.querySelector('#rsPresets'),
    q: root.querySelector('#rsQ'), cols: root.querySelector('#rsCols'), scopeWrap: root.querySelector('#rsScopeWrap'),
    more: root.querySelector('#rsMore'),
  };
  root.querySelector('#rsCsv').addEventListener('click', exportCSV);
  el.rail.innerHTML = railHTML();
  el.secs = el.rail.querySelector('#rsSecs');
  el.cov = el.rail.querySelector('#rsCov');
  renderPresets();
  const saved = loadPref('screener', null);
  if (saved) st = { ...structuredClone(DEFAULT), ...saved };
  wire();
  syncInputs();
  mounted = true;
}

/** route(params) — called whenever #/research/screener is shown or its parameters change. */
export function route(params) {
  visible = true;
  if (hasState(params)) {
    const next = decode(params);
    const cur = { f: st.f, sec: st.sec, q: st.q, cols: st.cols, sort: st.sort, scope: st.scope };
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      st = next;
      table = null;
      if (F) { rebuildHists(d => d.g === 'fac'); for (const d of FILTERS) paintHist(d.k); }
      syncInputs();
    }
  }
  if (!F) load();
  else { renderCoverage(); apply(); }
}
export function hide() { visible = false; clearTimeout(pollT); }

/** Presets for the command bar. */
export const presets = () => PRESETS.map(p => ({ id: p.id, name: p.name, criteria: criteriaTxt(p.f) }));
