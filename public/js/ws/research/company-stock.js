// Company page panels for stocks: key statistics, about, financials, valuation
// in sector context, factor profile, analyst opinion, earnings, dividends,
// ownership and peers. Each builder returns a panel item for rowsHTML
// ({ w, html(span), after(root) }) or null when Yahoo has no data for it.
import { esc, fmtBig } from '../../util.js';
import { panelHTML, statGridHTML, segHTML, seg, dataTable } from '../../ui.js';
import { fmt, isNum, DEF, FACTORS, sectorPosition, asOfMs, todayET } from './shared.js';
import { periodChart } from './charts.js';

const src = (c, label = '') => ({ source: 'Yahoo Finance', asOf: asOfMs(c.co.meta), label });
const srcF = c => ({ source: 'Yahoo Finance', asOf: c.F ? Date.parse(c.F.generatedAt) : null, label: 'computed' });
const pos = v => (isNum(v) && v > 0 ? v : null);
const isFinancial = c => c.fr?.sec === 'Financials' || (!c.fr && /financial/i.test(c.co.profile?.sector || ''));

// ---------------------------------------------------------------------------
// Key statistics
// ---------------------------------------------------------------------------
export function keyStats(c) {
  const ks = c.co.keyStats, v = c.co.valuation || {}, dv = c.co.dividends || {};
  if (!ks && !c.co.valuation) return null;
  const cur = c.cur;
  const price = c.price;
  const lo = ks?.low52, hi = ks?.high52;
  const p52 = isNum(lo) && isNum(hi) && hi > lo && isNum(price) ? Math.max(0, Math.min(100, ((price - lo) / (hi - lo)) * 100)) : null;
  const eps = c.fr?.eps ?? c.q?.eps;
  const tiles = [
    { label: 'Market cap', value: fmt.money(ks?.marketCap ?? c.co.quote?.marketCap, cur), title: DEF.marketCap },
    { label: 'Enterprise value', value: fmt.money(ks?.enterpriseValue, cur), title: 'Market cap plus debt minus cash: roughly what it would cost to buy the whole business.' },
    { label: 'P/E (ttm)', value: v.trailingPE == null && isNum(eps) && eps < 0 ? '<span class="rs-nm" title="Not meaningful: the company lost money over the last 12 months">NM</span>' : fmt.mult(v.trailingPE), title: DEF.pe },
    { label: 'Forward P/E', value: fmt.mult(v.forwardPE), title: DEF.fpe },
    { label: 'EPS (ttm)', value: fmt.num(eps, 2), title: 'Diluted earnings per share over the last 12 months.' },
    { label: 'Dividend yield', value: isNum(dv.yieldPct) ? fmt.pct(dv.yieldPct, 2) : 'None', title: DEF.divYield },
    { label: 'Beta (Yahoo)', value: fmt.num(ks?.beta, 2), title: 'Yahoo’s beta, from 5 years of monthly returns against the S&P 500. 1 = moves in step with the index.' },
    { label: '52-week range', value: isNum(lo) ? `${fmt.price(lo)} – ${fmt.price(hi)}` : '—', pct: p52, pctLabel: p52 != null ? `${Math.round(p52)}% of the way from low to high` : '', title: DEF.pos52 },
    { label: 'Avg volume (3M)', value: fmtBig(ks?.avgVolume3m), title: 'Average number of shares traded per day over the last three months.' },
    { label: 'Shares out', value: fmtBig(ks?.sharesOutstanding), title: 'Number of shares in existence.' },
    { label: 'Short interest', value: fmt.pct(ks?.shortPctFloat, 1), title: 'Shares sold short as a percentage of shares available to trade. Higher means more investors are betting on a fall.' },  ];
  return {
    w: 4,
    html: span => panelHTML({ id: 'pCoStats', span, title: 'Key Statistics', sub: 'Trailing 12 months unless stated', cls: 'rs-keystats',
      note: 'The numbers most often used to describe the company at a glance.',
      info: `Market cap is the market value of the whole company. P/E (price ÷ earnings per share) shows how many dollars investors pay for one dollar of yearly profit; NM means the company lost money. Forward P/E uses analysts’ estimate of next year’s earnings instead.\n\nBeta measures how much the stock has moved with the S&P 500. The 52-week bar shows where today’s price sits between the lowest and highest price of the past year. Hover any tile for its definition.`,
      body: statGridHTML(tiles, { min: 128 }), source: src(c) }),
  };
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------
export function about(c, desc = c.co.profile?.description) {
  const p = c.co.profile || {};
  if (!desc && !p.employees && !p.hq) return null;
  const site = /^https?:\/\//i.test(p.website || '') ? p.website : null;
  const facts = [
    p.sector || c.fr ? ['Sector', esc(c.fr?.sec || p.sector)] : null,
    c.fr?.ind || p.industry ? ['Industry', esc(c.fr?.ind || p.industry)] : null,
    isNum(p.employees) ? ['Employees', fmt.int(p.employees)] : null,
    p.hq ? ['Headquarters', esc(p.hq)] : null,
    site ? ['Website', `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(site.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</a>`] : null,
  ].filter(Boolean);
  const officers = (p.officers || []).slice(0, 5);
  const fund = c.type === 'fund';
  const side = facts.length || officers.length;
  return {
    w: 12,
    html: span => panelHTML({ id: 'pCoAbout', span, title: fund ? 'Objective' : 'About', sub: fund ? 'What the fund aims to do, from its prospectus summary' : 'Business description · company facts', cls: 'rs-about',
      note: fund ? 'What the fund invests in and how, as summarized by Yahoo Finance.' : 'What the company does, in its own words as summarized by Yahoo Finance.',
      info: fund ? 'This is the fund’s stated objective and strategy as published by Yahoo Finance. An index fund simply aims to match a published list of securities; an active fund tries to beat one.'
        : 'The description is the company profile published by Yahoo Finance. Sector and industry use the GICS classification for S&P 500 members (the standard used by index providers) and Yahoo’s own classification otherwise. Officers are the senior executives Yahoo lists.',
      body: `<div class="rs-about-g${side ? '' : ' solo'}">
        <div>${desc ? `<p class="rs-desc" id="rsDesc">${esc(desc)}</p><button type="button" class="btn-link rs-more" id="rsDescMore" hidden aria-expanded="false" aria-controls="rsDesc">Show more</button>` : ''}</div>
        ${side ? `<div class="rs-facts-list"><dl>${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
          ${officers.length ? `<div class="rs-off"><h3>Officers</h3><ul>${officers.map(o => `<li><b>${esc(o.name.replace(/\s+/g, ' '))}</b><span>${esc(o.title)}</span></li>`).join('')}</ul></div>` : ''}</div>` : ''}
      </div>`, source: src(c) }),
    after(root) {
      const d = root.querySelector('#rsDesc'), b = root.querySelector('#rsDescMore');
      if (!d || !b) return;
      requestAnimationFrame(() => { b.hidden = d.scrollHeight <= d.clientHeight + 2; });
      b.addEventListener('click', () => {
        const open = d.classList.toggle('open');
        b.textContent = open ? 'Show less' : 'Show more';
        b.setAttribute('aria-expanded', String(open));
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Financials
// ---------------------------------------------------------------------------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function periods(fin, mode) {
  const p = fin?.[mode];
  if (!p?.dates?.length) return null;
  const keep = p.dates.map((_, i) => p.revenue?.[i] != null || p.netIncome?.[i] != null);
  const pick = arr => (arr || []).filter((_, i) => keep[i]);
  const dates = pick(p.dates);
  if (!dates.length) return null;
  const lab = d => (mode === 'annual' ? 'FY' + d.slice(0, 4) : `${MON[+d.slice(5, 7) - 1]} ’${d.slice(2, 4)}`);
  const out = { dates, labels: dates.map(lab), titles: dates.map(d => (mode === 'annual' ? 'Fiscal year ended ' : 'Quarter ended ') + fmt.date(d)) };
  for (const k of ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'eps', 'freeCashFlow']) out[k] = pick(p[k]);
  const ratio = (a, b) => out[a].map((v, i) => (isNum(v) && isNum(out[b][i]) && out[b][i] > 0 ? (v / out[b][i]) * 100 : null));
  out.gm = ratio('grossProfit', 'revenue'); out.om = ratio('operatingIncome', 'revenue'); out.nm = ratio('netIncome', 'revenue');
  return out;
}
function change(vals, mode) {
  const n = vals.length, back = mode === 'annual' ? 1 : 4;
  const a = vals[n - 1], b = vals[n - 1 - back];
  if (!isNum(a) || !isNum(b) || b <= 0 || a <= 0) return '';
  const g = (a / b - 1) * 100;
  return `<span class="${g > 0 ? 'up' : g < 0 ? 'down' : 'flat'}">${fmt.spct(g)}</span> <small>${mode === 'annual' ? 'vs prior year' : 'vs year-ago quarter'}</small>`;
}

export function financials(c) {
  const fin = c.co.financials;
  if (!periods(fin, 'annual') && !periods(fin, 'quarterly')) return null;
  const fcfHidden = isFinancial(c);
  let mode = periods(fin, 'annual') ? 'annual' : 'quarterly';
  const cur = fin.currency || c.cur;
  const money = v => fmt.smoney(v, cur);
  const charts = [];
  const render = root => {
    const body = root.querySelector('#rsFinBody');
    for (const ch of charts) ch.destroy();
    charts.length = 0;
    const p = periods(fin, mode);
    if (!p) { body.innerHTML = '<div class="rs-pc-empty">Yahoo has no ' + mode + ' statements for this company.</div>'; return; }
    const hasGM = p.gm.some(isNum), hasOM = p.om.some(isNum);
    const blocks = [
      { k: 'revenue', t: 'Revenue', vals: p.revenue, f: money },
      { k: 'netIncome', t: 'Net income', vals: p.netIncome, f: money },
      fcfHidden ? { k: 'fcf', t: 'Free cash flow', note: 'Not shown for financial companies: their cash flows mostly reflect lending, deposits and insurance float rather than spending on the business, so “free cash flow” is not meaningful.' }
        : { k: 'freeCashFlow', t: 'Free cash flow', vals: p.freeCashFlow, f: money },
      { k: 'eps', t: 'EPS (diluted)', vals: p.eps, f: v => fmt.num(v, 2) },
      { k: 'margins', t: 'Margins', wide: true, line: true, series: [
        hasGM && { label: 'Gross', color: 'var(--violet)', values: p.gm },
        hasOM && { label: 'Operating', color: 'var(--cyan)', values: p.om },
        { label: 'Net', color: 'var(--amber)', values: p.nm }].filter(Boolean) },
    ];
    body.innerHTML = `<div class="rs-fin">${blocks.map(b => `<div class="rs-fin-c${b.wide ? ' wide' : ''}">
      <div class="rs-fin-h"><b>${b.t}</b>${b.vals ? `<span class="mono">${b.f(b.vals.at(-1))}</span>${change(b.vals, mode)}` : ''}
        ${b.series ? `<span class="rs-leg">${b.series.map(s => `<i style="background:${s.color}"></i>${s.label} <span class="mono">${fmt.pct(s.values.at(-1))}</span>`).join('')}</span>` : ''}</div>
      ${b.note ? `<p class="rs-fin-note">${b.note}</p>` : `<div class="rs-fin-ch" data-k="${b.k}"></div>`}
      ${b.series && !hasGM && !hasOM ? '<p class="rs-fin-note">This company does not report gross profit or operating income (common for banks), so only net margin is shown.</p>' : ''}</div>`).join('')}</div>`;
    for (const b of blocks) {
      const host = body.querySelector(`.rs-fin-ch[data-k="${b.k}"]`);
      if (!host) continue;
      charts.push(periodChart(host, b.line
        ? { kind: 'line', labels: p.labels, titles: p.titles, series: b.series, fmt: v => fmt.pct(v), height: 132, aria: 'Margins by period' }
        : { kind: 'bar', labels: p.labels, titles: p.titles, series: [{ values: b.vals }], fmt: b.f, height: 132, aria: b.t + ' by period' }));
    }
  };
  return {
    w: 7,
    html: span => panelHTML({ id: 'pCoFin', span, title: 'Financials', sub: `Income and cash-flow statements · ${esc(cur || 'USD')} · latest period in amber`, bodyId: 'rsFinBody', minH: 330,
      controls: segHTML({ id: 'rsFinMode', small: true, value: mode, label: 'Statement period', options: [['annual', 'Annual'], ['quarterly', 'Quarterly']] }),
      note: 'How much the company sells, how much it keeps as profit and how much cash it generates.',
      info: `Revenue is everything the company sold. Net income is what is left after all costs, interest and taxes; red bars are losses. Free cash flow is the cash generated by the business minus what it spent on equipment, buildings and software; it shows whether profits turn into actual cash. EPS (earnings per share) is net income divided by the number of shares.\n\nMargins show each profit level as a percentage of revenue: gross (after the direct cost of goods), operating (after running the business) and net (after everything). Quarterly figures can be seasonal, so they are compared with the same quarter a year earlier. Yahoo provides about four years and five quarters.`,
      source: src(c, 'statements') }),
    after(root) {
      seg(root.querySelector('#rsFinMode'), v => { mode = v; render(root); });
      render(root);
    },
  };
}

// ---------------------------------------------------------------------------
// Valuation and profitability in sector context
// ---------------------------------------------------------------------------
const CTX = [
  ['Valuation', [
    ['pe', 'P/E (ttm)', r => r.pe ?? (r.eps < 0 ? -1 : null), co => co.valuation?.trailingPE ?? (co.valuation?.earningsYieldPct < 0 ? -1 : null), DEF.pe, 'mult'],
    ['fpe', 'Forward P/E', r => r.fpe, co => co.valuation?.forwardPE, DEF.fpe, 'mult'],
    ['peg', 'PEG', r => r.peg, co => co.valuation?.pegRatio, DEF.peg, 'mult2'],
    ['pb', 'Price / book', r => r.pb, co => co.valuation?.priceToBook, DEF.pb, 'mult'],
    ['ps', 'Price / sales', r => r.priceToSales, co => co.valuation?.priceToSales, DEF.ps, 'mult'],
    ['ev', 'EV / EBITDA', r => r.evToEbitda, co => co.valuation?.evToEbitda, DEF.evEbitda, 'mult'],
    ['ey', 'Earnings yield', r => r.earningsYieldPct, co => co.valuation?.earningsYieldPct, DEF.earningsYield, 'pct2'],
    ['fcfy', 'FCF yield', r => r.fcfYieldPct, co => co.valuation?.fcfYieldPct, DEF.fcfYield, 'pct2', true],
    ['dy', 'Dividend yield', r => r.divYieldPct, co => co.dividends?.yieldPct, DEF.divYield, 'pct2'],
  ]],
  ['Profitability & balance sheet', [
    ['gm', 'Gross margin', r => r.grossMarginPct, co => co.profitability?.grossMarginPct, DEF.grossMargin, 'pct'],
    ['om', 'Operating margin', r => r.operatingMarginPct, co => co.profitability?.operatingMarginPct, DEF.opMargin, 'pct'],
    ['nm', 'Net margin', r => r.profitMarginPct, co => co.profitability?.profitMarginPct, DEF.netMargin, 'pct'],
    ['roe', 'ROE', r => r.roePct, co => co.profitability?.roePct, DEF.roe, 'pct'],
    ['roa', 'ROA', r => r.roaPct, co => co.profitability?.roaPct, DEF.roa, 'pct'],
    ['de', 'Debt / equity', r => r.debtToEquity, co => co.balanceSheet?.debtToEquity, DEF.de, 'num2'],
  ]],
  ['Growth', [
    ['rg', 'Revenue growth', r => r.revenueGrowthPct, co => co.profitability?.revenueGrowthPct, DEF.revGrowth, 'spct'],
    ['eg', 'Earnings growth', r => r.earningsGrowthPct, co => co.profitability?.earningsGrowthPct, DEF.epsGrowth, 'spct'],
    ['fg', 'Forward EPS growth', r => r.epsFwdGrowthPct, () => null, DEF.fwdGrowth, 'spct'],
  ]],
];
const FMTS = { mult: v => fmt.mult(v), mult2: v => fmt.mult(v, 2), pct: v => fmt.pct(v), pct2: v => fmt.pct(v, 2), num2: v => fmt.num(v, 2), spct: v => fmt.spct(v) };
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

export function context(c) {
  const fin = isFinancial(c);
  const rowsH = CTX.map(([g, ms]) => {
    const body = ms.map(([k, label, fget, cget, def, f, noFin]) => {
      if (noFin && fin) return '';
      let raw = c.fr ? fget(c.fr) : cget(c.co);
      if (raw == null && c.fr) raw = cget(c.co);
      const isMult = f.startsWith('mult');
      const v = isMult ? pos(raw) : raw;
      if (!isNum(raw)) return '';   // not reported for this company (e.g. gross margin for a bank)
      const vTxt = v == null && isMult && isNum(raw) && raw <= 0 ? '<span class="rs-nm" title="Not meaningful: negative earnings or book value">NM</span>' : FMTS[f](v);
      const getter = isMult ? r => pos(fget(r)) : fget;
      const sp = c.fr ? sectorPosition(c.F, c.fr.sec, k, getter, v) : null;
      if (!c.fr) return `<tr><th scope="row" title="${esc(def)}">${label}</th><td class="n">${vTxt}</td></tr>`;
      return `<tr><th scope="row" title="${esc(def)}">${label}</th><td class="n">${vTxt}</td><td class="n rs-dim">${sp ? FMTS[f](sp.median) : '—'}</td>
        <td class="rs-ctx-bar">${sp ? `<div class="pbar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(sp.pct)}" aria-label="${esc(label)}: higher than ${Math.round(sp.pct)}% of the sector"><i style="left:${sp.pct}%"></i></div>` : ''}</td>
        <td class="n rs-ctx-p" title="${sp ? `Higher than ${Math.round(sp.pct)}% of ${sp.n} ${esc(c.fr.sec)} companies with data` : ''}">${sp ? ordinal(Math.round(sp.pct)) : ''}</td></tr>`;
    }).join('');
    return body ? `<tbody><tr class="rs-ctx-g"><th colspan="${c.fr ? 5 : 2}">${g}</th></tr>${body}</tbody>` : '';
  }).join('');
  const secName = c.fr?.sec;
  return {
    w: 5,
    html: span => panelHTML({ id: 'pCoCtx', span, title: 'Valuation & Profitability', sub: secName ? `Against ${esc(secName)} (${c.F ? fundCount(c) : ''} S&amp;P 500 companies) · position = percentile in sector` : 'Sector comparison is available for S&amp;P 500 members only', cls: 'rs-ctx',
      note: 'Each measure next to the typical company in the same sector.',
      info: `“Sector median” is the middle value among S&P 500 companies in the same sector. The bar and the percentile show where this company sits: 80th means its value is higher than 80% of the sector; the tick marks are the 25th and 75th percentiles.\n\nHigher is not better or worse by itself. A high P/E means investors pay more per dollar of current profit than for most peers, often because they expect faster growth; a high margin means the company keeps more of each dollar of sales.\n\nEarnings yield is profit per share ÷ price (P/E upside down). FCF yield is free cash flow ÷ market value. ROE is profit ÷ shareholders’ equity. NM = not meaningful (negative earnings or book value).`,
      body: `<table class="rs-ctx-t${c.fr ? '' : ' solo'}"><thead><tr><th scope="col">Measure</th><th scope="col" class="n">${esc(c.sym)}</th>${c.fr ? '<th scope="col" class="n">Sector median</th><th scope="col">Position in sector</th><th scope="col" class="n">Pctile</th>' : ''}</tr></thead>${rowsH}</table>`,
      source: c.fr ? srcF(c) : src(c) }),
  };
}
const fundCount = c => c.F.rows.filter(r => r.sec === c.fr.sec).length;

// ---------------------------------------------------------------------------
// Factor profile
// ---------------------------------------------------------------------------
export function factors(c) {
  const f = c.fr?.factors;
  if (!f) return null;
  const bar = (v, k) => (v == null ? '<span class="rs-dim">—</span>' : `<span class="rs-fb ${k}"><i style="width:${v}%"></i></span><b class="mono">${Math.round(v)}</b>`);
  return {
    w: 3,
    html: span => panelHTML({ id: 'pCoFactors', span, title: 'Factor Profile', sub: '0–100 percentile · S&amp;P 500 and sector', cls: 'rs-factors',
      note: 'Where the company ranks on five common investing traits.',
      info: `${DEF.factor}\n\nValue: how cheap the shares are relative to earnings and cash flow. Quality: how profitable the company is and how little debt it carries. Growth: how fast sales and earnings are growing. Momentum: how much the price has risen over the past year. Low volatility: how steady the price has been.\n\nThe amber bar ranks the company against the whole S&P 500, the cyan bar against its own sector only. A company can be expensive for the index but cheap for its sector.`,
      body: `<div class="rs-fp-leg"><span><i class="ix"></i>vs S&amp;P 500</span><span><i class="sx"></i>vs ${esc(c.fr.sec)}</span></div>
        <div class="rs-fp">${FACTORS.map(([k, l, d]) => `<div class="rs-fp-r" title="${esc(d)}"><span class="rs-fp-l">${l}</span>
          <div class="rs-fp-b">${bar(f.index?.[k], 'ix')}${bar(f.sector?.[k], 'sx')}</div></div>`).join('')}</div>`,
      source: srcF(c) }),
  };
}

// ---------------------------------------------------------------------------
// Analyst opinion
// ---------------------------------------------------------------------------
const REC = [['strongBuy', 'Strong buy'], ['buy', 'Buy'], ['hold', 'Hold'], ['sell', 'Sell'], ['strongSell', 'Strong sell']];
const PERIOD = { '0m': 'This month', '-1m': '1 month ago', '-2m': '2 months ago', '-3m': '3 months ago' };
export function analyst(c) {
  const a = c.co.analyst;
  if (!a || (!a.analysts && !a.trend?.length && !isNum(a.targetMean))) return null;
  const price = c.price;
  const trend = (a.trend || []).filter(t => REC.some(([k]) => t[k] > 0));
  const dist = trend.length ? `<div class="rs-rec">${trend.map(t => {
    const tot = REC.reduce((s, [k]) => s + (t[k] || 0), 0);
    return `<div class="rs-rec-r"><span class="rs-rec-l">${PERIOD[t.period] || esc(t.period)}</span><div class="rs-rec-b" role="img" aria-label="${esc(REC.map(([k, l]) => `${t[k] || 0} ${l}`).join(', '))}">${REC.map(([k, l], i) =>
      t[k] ? `<i class="r${i}" style="flex:${t[k]}" title="${l}: ${t[k]} of ${tot}">${t[k] / tot > 0.07 ? t[k] : ''}</i>` : '').join('')}</div><span class="rs-rec-n mono">${tot}</span></div>`;
  }).join('')}<div class="rs-rec-leg">${REC.map(([, l], i) => `<span><i class="r${i}"></i>${l}</span>`).join('')}</div></div>` : '';
  let tgt = '';
  if (isNum(a.targetLow) && isNum(a.targetHigh) && isNum(price)) {
    const lo = Math.min(a.targetLow, price), hi = Math.max(a.targetHigh, price);
    const pad = (hi - lo) * 0.06 || 1;
    const X = v => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
    const mk = (v, cl, l) => `<span class="rs-tg-m ${cl}" style="left:${X(v)}%"><em>${l}</em><b class="mono">${fmt.price(v)}</b></span>`;
    tgt = `<div class="rs-tg"><div class="rs-tg-h">Price targets, 12 months <span class="rs-dim">(${fmt.int(a.analysts)} analysts)</span></div>
      <div class="rs-tg-track"><span class="rs-tg-rng" style="left:${X(a.targetLow)}%;width:${X(a.targetHigh) - X(a.targetLow)}%"></span>
        ${isNum(a.targetMean) ? `<span class="rs-tg-tick" style="left:${X(a.targetMean)}%" title="Mean target ${fmt.price(a.targetMean)}"></span>` : ''}
        <span class="rs-tg-px" style="left:${X(price)}%" title="Current price ${fmt.price(price)}"></span></div>
      <div class="rs-tg-lab">${mk(a.targetLow, 'lo', 'Low')}${isNum(a.targetMean) ? mk(a.targetMean, 'mean', 'Mean') : ''}${mk(a.targetHigh, 'hi', 'High')}</div>
      <p class="rs-tg-s">Current price <b class="mono">${fmt.price(price)}</b>. The mean target is <b class="mono">${fmt.spct((a.targetMean / price - 1) * 100)}</b> from it${isNum(a.targetMedian) ? `; the median is ${fmt.price(a.targetMedian)}` : ''}.</p></div>`;
  }
  const label = (a.averageAnalystRating || '').replace(/^[\d.]+\s*-\s*/, '') || (a.recommendationKey || '').replace(/_/g, ' ');
  return {
    w: 4,
    html: span => panelHTML({ id: 'pCoAnalyst', span, title: 'Analyst Opinion', sub: 'Ratings and price targets from Wall Street analysts · their views, not this app’s', cls: 'rs-analyst',
      note: 'What analysts at banks and research firms say about the stock. These are opinions and are often wrong.',
      info: `Analysts who cover a company publish a rating (strong buy to strong sell) and a 12-month price target. Yahoo Finance collects them; this panel shows the spread of those opinions over the last four months and the range of targets.\n\nThe average rating runs from 1 (strong buy) to 5 (strong sell). Ratings lean positive in general: “hold” is often the most negative rating analysts give. Price targets are forecasts and frequently miss by a wide margin. Market Pulse does not make recommendations.`,
      body: `<div class="rs-an-sum">${isNum(a.recommendationMean) ? `<div><span class="rs-dim">Average rating</span><b class="mono">${fmt.num(a.recommendationMean, 2)}</b><span>${esc(label)}</span><small>1 = strong buy · 5 = strong sell</small></div>` : ''}${a.analysts ? `<div><span class="rs-dim">Analysts</span><b class="mono">${fmt.int(a.analysts)}</b></div>` : ''}</div>${dist}${tgt}`,
      source: src(c, 'analyst opinion') }),
  };
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------
const EST = { '0q': 'This quarter', '+1q': 'Next quarter', '0y': 'This fiscal year', '+1y': 'Next fiscal year' };
export function earnings(c) {
  const e = c.co.earnings;
  if (!e || (!e.history?.length && !e.next && !e.estimates?.length)) return null;
  const hist = (e.history || []).filter(h => isNum(h.epsActual) || isNum(h.epsEstimate));
  const past = e.next?.date && e.next.date < todayET();
  // A past "next" date means Yahoo has not published the following report date yet; its estimates are for the quarter just reported.
  const n = past ? null : e.next;
  const next = past ? `<div class="rs-next"><div><span class="rs-dim">Next report</span><b class="rs-dim">Not yet announced</b><small>last report was scheduled for ${fmt.date(e.next.date)}</small></div></div>` : n?.date ?`<div class="rs-next"><div><span class="rs-dim">Next report</span><b>${fmt.date(n.date)}</b>${n.estimated ? '<small>date estimated by Yahoo</small>' : '<small>confirmed date</small>'}</div>
    ${isNum(n.epsAvg) ? `<div><span class="rs-dim">EPS estimate</span><b class="mono">${fmt.num(n.epsAvg, 2)}</b>${isNum(n.epsLow) ? `<small>range ${fmt.num(n.epsLow, 2)} – ${fmt.num(n.epsHigh, 2)}</small>` : ''}</div>` : ''}
    ${isNum(n.revenueAvg) ? `<div><span class="rs-dim">Revenue estimate</span><b class="mono">${fmt.money(n.revenueAvg, c.cur)}</b>${isNum(n.revenueLow) ? `<small>range ${fmt.money(n.revenueLow, c.cur)} – ${fmt.money(n.revenueHigh, c.cur)}</small>` : ''}</div>` : ''}</div>` : '';
  const histH = hist.length ? `<table class="rs-mini"><caption>Last ${hist.length} quarters · EPS estimate vs reported</caption><thead><tr><th>Quarter ended</th><th class="n">Estimate</th><th class="n">Actual</th><th class="n">Surprise</th></tr></thead><tbody>${hist.map(h =>
    `<tr><td>${fmt.date(h.quarter)}</td><td class="n">${fmt.num(h.epsEstimate, 2)}</td><td class="n">${fmt.num(h.epsActual, 2)}</td><td class="n ${h.surprisePct > 0 ? 'up' : h.surprisePct < 0 ? 'down' : ''}">${fmt.spct(h.surprisePct)}</td></tr>`).join('')}</tbody></table>` : '';
  const ests = (e.estimates || []).filter(x => isNum(x.epsAvg));
  const estH = ests.length ? `<table class="rs-mini"><caption>Analyst estimates (consensus)</caption><thead><tr><th>Period</th><th class="n">EPS est.</th><th class="n">vs year ago</th><th class="n">Revenue est.</th><th class="n">Analysts</th></tr></thead><tbody>${ests.map(x =>
    `<tr><td title="Period ending ${fmt.date(x.endDate)}">${EST[x.period] || esc(x.period)} <small class="rs-dim">${x.endDate ? fmt.monthYear(x.endDate) : ''}</small></td><td class="n">${fmt.num(x.epsAvg, 2)}</td><td class="n">${fmt.spct(x.epsGrowthPct)}</td><td class="n">${fmt.money(x.revenueAvg, c.cur)}</td><td class="n">${fmt.int(x.analysts)}</td></tr>`).join('')}</tbody></table>` : '';
  return {
    w: 5,
    html: span => panelHTML({ id: 'pCoEarn', span, title: 'Earnings', sub: 'Reported vs expected EPS · next report and consensus', cls: 'rs-earn',
      note: 'How recent results compared with what analysts expected, and what they expect next.',
      info: `Every quarter the company reports its earnings per share (EPS). Before that, analysts publish estimates; the “surprise” is how far the actual figure landed above (+) or below (−) the average estimate.\n\nEstimates here are Yahoo’s consensus, usually on an adjusted basis that leaves out one-off items, so they can differ from the diluted EPS in the Financials panel. “vs year ago” compares the estimate with the same period one year earlier.`,
      body: next + histH + estH, source: src(c, 'estimates') }),
  };
}

// ---------------------------------------------------------------------------
// Dividends and ownership
// ---------------------------------------------------------------------------
export function dividends(c) {
  const d = c.co.dividends;
  if (!d) return null;
  const pays = isNum(d.rate) && d.rate > 0 || isNum(d.trailingRate) && d.trailingRate > 0;
  const tiles = pays ? [
    { label: 'Annual dividend', value: fmt.num(d.rate ?? d.trailingRate, 2), sub: 'per share, indicated' },
    { label: 'Yield', value: fmt.pct(d.yieldPct ?? d.trailingYieldPct, 2), sub: isNum(d.trailingYieldPct) ? `trailing ${fmt.pct(d.trailingYieldPct, 2)}` : '' },
    { label: 'Payout ratio', value: fmt.pct(d.payoutRatioPct, 1), title: DEF.payout },
    { label: '5-year avg yield', value: fmt.pct(d.fiveYearAvgYieldPct, 2) },
    { label: 'Ex-dividend date', value: d.exDate ? fmt.date(d.exDate) : '—', title: 'You must own the shares before this date to receive the next dividend.' },
    { label: 'Pay date', value: d.payDate ? fmt.date(d.payDate) : '—' },
  ] : null;
  return {
    html: span => panelHTML({ id: 'pCoDiv', span, title: 'Dividends', sub: 'Cash paid to shareholders',
      note: 'The cash the company pays out to shareholders each year.',
      info: `${DEF.divYield} The indicated annual dividend is the latest regular payment multiplied by the number of payments per year; the trailing figure is what was actually paid over the last 12 months.\n\n${DEF.payout} The ex-dividend date is the cut-off: shares bought on or after it do not receive the next payment.`,
      body: tiles ? statGridHTML(tiles, { min: 120 }) : '<p class="rs-none">The company does not pay a regular dividend.</p>', source: src(c) }),
  };
}
export function ownership(c) {
  const o = c.co.ownership, ks = c.co.keyStats || {};
  if (!o) return null;
  const tiles = [
    { label: 'Institutions', value: fmt.pct(o.institutionsPct, 1), sub: isNum(o.institutionsCount) ? fmt.int(o.institutionsCount) + ' holders' : '', title: 'Share of all shares held by funds, pension plans, banks and other institutions.' },
    { label: 'Insiders', value: fmt.pct(o.insidersPct, 2), title: 'Share held by executives, directors and large founding shareholders.' },
    { label: 'Float', value: fmtBig(ks.floatShares), sub: 'shares available to trade' },
    { label: 'Short interest', value: fmt.pct(ks.shortPctFloat, 1), sub: '% of float' },
  ];
  return {
    html: span => panelHTML({ id: 'pCoOwn', span, title: 'Ownership', sub: 'Who holds the shares',
      note: 'How much of the company is held by large institutions and by its own insiders.',
      info: 'Institutions are investment firms, pension funds and index funds; a high share is normal for large US companies because index funds own a slice of every member. Insiders are the company’s executives and directors. The float is the number of shares the public can trade.',
      body: statGridHTML(tiles, { min: 120 }), source: src(c) }),
  };
}

// ---------------------------------------------------------------------------
// Peers
// ---------------------------------------------------------------------------
export function peers(c, openCompany) {
  const p = c.co.peers;
  if (!p?.list?.length) return null;
  const subj = { ...(p.subject || {}), self: true };
  const all = [subj, ...p.list];
  const same = p.list.every(x => x.sameSubIndustry);
  const mult = (key, label, get, title, d = 1) => ({ key, label, type: 'num', title, value: r => pos(get(r)), fmt: (v, r) => (v == null && isNum(get(r)) && get(r) <= 0 ? '<span class="rs-nm">NM</span>' : fmt.mult(v, d)) });
  const cols = [
    { key: 's', label: 'Ticker', value: r => r.s, fmt: (v, r) => `<b class="rs-sym${r.self ? ' is-self' : ''}">${esc(v)}</b>` },
    { key: 'n', label: 'Company', value: r => r.n, fmt: v => `<span class="rs-nmc" title="${esc(v)}">${esc(v)}</span>` },
    { key: 'mc', label: 'Mkt cap', type: 'num', value: r => r.marketCap, fmt: v => fmt.money(v), title: DEF.marketCap },
    mult('pe', 'P/E', r => r.pe, DEF.pe), mult('fpe', 'Fwd P/E', r => r.fpe, DEF.fpe), mult('ps', 'P/S', r => r.priceToSales, DEF.ps),
    mult('ev', 'EV/EBITDA', r => r.evToEbitda, DEF.evEbitda), mult('pb', 'P/B', r => r.pb, DEF.pb),
    { key: 'dy', label: 'Div yld', type: 'num', value: r => r.divYieldPct, fmt: v => fmt.pct(v, 2), title: DEF.divYield },
    { key: 'gm', label: 'Gross m.', type: 'num', value: r => r.grossMarginPct, fmt: v => fmt.pct(v), title: DEF.grossMargin },
    { key: 'om', label: 'Oper. m.', type: 'num', value: r => r.operatingMarginPct, fmt: v => fmt.pct(v), title: DEF.opMargin },
    { key: 'rg', label: 'Rev gr.', type: 'num', value: r => r.revenueGrowthPct, fmt: v => fmt.spct(v), title: DEF.revGrowth },
    { key: 'roe', label: 'ROE', type: 'num', value: r => r.roePct, fmt: v => fmt.pct(v), title: DEF.roe },
    { key: 'y', label: '1Y', type: 'num', value: r => r.perf1yPct, fmt: v => fmt.spct(v), tone: v => (v > 0 ? 'up' : v < 0 ? 'down' : ''), title: DEF.r1y },
  ];
  return {
    w: 8,
    html: span => panelHTML({ id: 'pCoPeers', span, title: 'Peers', sub: `${same ? 'Same GICS sub-industry' : 'Same sub-industry, topped up from the sector'}: ${esc(subj.subIndustry || c.fr?.ind || '')} · nearest by market cap`, cls: 'rs-peers', bodyId: 'rsPeers',
      note: 'Similar S&amp;P 500 companies side by side, so each number has a point of comparison. Click a row to open that company.',
      info: `Peers are S&P 500 companies in the same GICS sub-industry (the most detailed level of the standard industry classification), closest in size. If there are fewer than four, companies from the same sector fill the list.\n\nComparing a company with its peers is often more useful than comparing it with the whole market: software companies, banks and utilities have very different typical margins and valuations. The highlighted row is ${c.sym}. NM = not meaningful (negative earnings).`,
      source: src(c) }),
    after(root) {
      const host = root.querySelector('#rsPeers');
      dataTable(host, { columns: cols, rows: all, sort: 'mc', dir: -1, label: 'Peer comparison', onRowClick: r => { if (!r.self) openCompany(r.ys || r.s); } });
    },
  };
}
