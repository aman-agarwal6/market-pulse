// Company page panels for ETFs and mutual funds: fund facts, top holdings,
// sector weights, asset allocation and Yahoo-reported returns.
import { esc } from '../../util.js';
import { panelHTML, statGridHTML } from '../../ui.js';
import { fmt, isNum, asOfMs, FUND_SECTOR } from './shared.js';
import { periodChart } from './charts.js';

const src = (c, label = '') => ({ source: 'Yahoo Finance', asOf: asOfMs(c.co.meta), label });

export function fundFacts(c) {
  const f = c.co.fund;
  if (!f) return null;
  const equity = (c.co.holdings?.assetAllocation?.stockPct ?? 0) >= 50;
  const tiles = [
    { label: 'Expense ratio', value: fmt.pct(f.expenseRatioPct, 2), sub: isNum(f.expenseRatioPct) ? `$${fmt.num(f.expenseRatioPct * 100, 0)} a year per $10,000` : '', title: 'The yearly fee, taken out of the fund’s assets.' },
    { label: 'Fund size', value: fmt.money(f.aum, c.cur), title: 'Total assets under management.' },
    { label: 'Yield', value: fmt.pct(f.yieldPct, 2), title: 'Income paid out over the last 12 months as a percentage of the price (dividends for stock funds, interest for bond funds).' },
    { label: 'Category', value: `<span class="rs-tv">${esc(f.category || '—')}</span>`, title: 'Morningstar-style category reported by Yahoo.' },
    { label: 'Fund family', value: `<span class="rs-tv">${esc(f.family || '—')}</span>` },
    { label: 'Inception', value: f.inceptionDate ? fmt.date(f.inceptionDate) : '—', title: 'Date the fund started.' },
    { label: 'Turnover', value: fmt.pct(f.turnoverPct, 0), title: 'Share of the portfolio replaced in a year. Index funds are usually low.' },
    { label: 'Beta (3Y)', value: fmt.num(f.beta3y, 2), title: 'How much the fund moved with the S&P 500 over three years. 1 = in step.' },
    equity && isNum(f.trailingPE) ? { label: 'P/E of holdings', value: fmt.num(f.trailingPE, 1), title: 'Weighted price / earnings of the stocks the fund owns.' } : null,
  ].filter(Boolean);
  return {
    w: 4,
    html: span => panelHTML({ id: 'pCoFund', span, title: 'Fund Facts', sub: esc(f.legalType || 'Fund'), cls: 'rs-keystats',
      note: 'What the fund costs, how big it is and what kind of fund it is.',
      info: 'The expense ratio is the yearly fee as a percentage of what you hold: 0.03% means $3 a year on $10,000. It comes out of the fund automatically, so it lowers your return by that amount every year.\n\nYield is the income the fund paid over the last year as a percentage of its price. Turnover shows how much of the portfolio is bought and sold in a year; index funds that simply track a list tend to be low. Beta compares the fund’s moves with the S&P 500.',
      body: statGridHTML(tiles, { min: 128 }), source: src(c) }),
  };
}

export function holdings(c, openCompany) {
  const top = c.co.holdings?.top || [];
  if (!top.length) return null;
  const max = Math.max(...top.map(h => h.weightPct || 0));
  const sum = top.reduce((a, h) => a + (h.weightPct || 0), 0);
  return {
    w: 4,
    html: span => panelHTML({ id: 'pCoHold', span, title: 'Top Holdings', sub: `Largest ${top.length} positions · ${fmt.pct(sum, 1)} of the fund`,
      note: 'The biggest investments inside the fund. Click one to open its page.',
      info: 'A fund owns many securities; these are its largest by weight (the share of the fund’s money in each). A high combined weight in the top ten means the fund’s returns depend heavily on a few companies.',
      body: `<ol class="rs-hold">${top.map(h => `<li><button type="button" data-co="${esc(h.s)}" title="Open ${esc(h.s)}"><b class="rs-sym">${esc(h.s)}</b><span class="rs-nmc">${esc(h.n)}</span>
        <span class="rs-hbar"><i style="width:${((h.weightPct || 0) / max) * 100}%"></i></span><span class="mono">${fmt.pct(h.weightPct, 2)}</span></button></li>`).join('')}</ol>`,
      source: src(c) }),
    after(root) { root.querySelector('#pCoHold').addEventListener('click', e => { const b = e.target.closest('[data-co]'); if (b) openCompany(b.dataset.co); }); },
  };
}

export function sectors(c) {
  const sw = (c.co.holdings?.sectorWeights || []).filter(s => s.weightPct > 0).sort((a, b) => b.weightPct - a.weightPct);
  if (!sw.length) return null;
  const max = sw[0].weightPct;
  return {
    w: 4,
    html: span => panelHTML({ id: 'pCoSect', span, title: 'Sector Weights', sub: 'Share of stock holdings by sector (Yahoo sector names)',
      note: 'Which parts of the economy the fund’s stock holdings are spread across.',
      info: 'Each bar is the share of the fund’s stock holdings in one sector. A fund heavy in one sector rises and falls more with that industry. Yahoo uses its own sector names here, which differ slightly from the GICS sectors used elsewhere in Market Pulse.',
      body: `<div class="rs-bars">${sw.map(s => `<div class="rs-bar-r"><span>${esc(FUND_SECTOR[s.sector] || s.sector.replace(/_/g, ' '))}</span><span class="rs-hbar"><i style="width:${(s.weightPct / max) * 100}%"></i></span><b class="mono">${fmt.pct(s.weightPct, 1)}</b></div>`).join('')}</div>`,
      source: src(c) }),
  };
}

const ALLOC = [['stockPct', 'Stocks', 'var(--amber)'], ['bondPct', 'Bonds', 'var(--cyan)'], ['cashPct', 'Cash', 'var(--ink-2)'], ['preferredPct', 'Preferred', 'var(--violet)'], ['convertiblePct', 'Convertible', 'var(--s5)'], ['otherPct', 'Other', 'var(--ink-4)']];
export function allocation(c) {
  const a = c.co.holdings?.assetAllocation;
  if (!a) return null;
  const parts = ALLOC.map(([k, l, col]) => [l, a[k], col]).filter(([, v]) => isNum(v) && v > 0.005);
  if (!parts.length) return null;
  return {
    w: 4,
    html: span => panelHTML({ id: 'pCoAlloc', span, title: 'Asset Allocation', sub: 'Share of the fund by asset type',
      note: 'How the fund’s money is split between stocks, bonds and cash.',
      info: 'Stocks are shares in companies; bonds are loans to governments or companies that pay interest; cash covers money held for trading and payouts. Stock funds are usually near 100% stocks; a bond fund near 100% bonds. A mix of the two typically swings less than an all-stock fund.',
      body: `<div class="rs-alloc"><div class="rs-alloc-b">${parts.map(([l, v, col]) => `<i style="flex:${v};background:${col}" title="${l} ${fmt.pct(v, 2)}"></i>`).join('')}</div>
        <ul>${parts.map(([l, v, col]) => `<li><i style="background:${col}"></i><span>${l}</span><b class="mono">${fmt.pct(v, 2)}</b></li>`).join('')}</ul></div>`,
      source: src(c) }),
  };
}

const TRAIL = [['ytd', 'YTD'], ['m1', '1 month'], ['m3', '3 months'], ['y1', '1 year'], ['y3', '3 years', true], ['y5', '5 years', true], ['y10', '10 years', true]];
export function returns(c) {
  const p = c.co.performance;
  if (!p || (!p.trailingPct && !p.annual?.length)) return null;
  const tr = p.trailingPct || {};
  const ann = [...(p.annual || [])].filter(x => isNum(x.returnPct)).sort((a, b) => a.year.localeCompare(b.year)).slice(-12);
  return {
    w: 12,
    html: span => panelHTML({ id: 'pCoRet', span, title: 'Returns', sub: `As reported by Yahoo Finance${p.asOf ? ' · as of ' + fmt.date(p.asOf) : ''} · 3 years and longer are yearly averages`, cls: 'rs-ret',
      note: 'How the fund has done over different periods, using the figures Yahoo Finance publishes.',
      info: `These are Yahoo Finance’s own reported figures. Returns over 3, 5 and 10 years are annualized: the average yearly return that would compound to the total. They normally include reinvested distributions, but Yahoo’s numbers are sometimes inconsistent; the Compare tool computes returns directly from dividend-adjusted prices if you want to check one.\n\nThe bars are calendar-year returns. Past returns describe what happened; they do not predict the next year.`,
      body: `<div class="rs-ret-g"><div class="rs-ret-t">${TRAIL.filter(([k]) => isNum(tr[k])).map(([k, l, a]) => `<div><span>${l}${a ? '<small> /yr</small>' : ''}</span><b class="mono ${tr[k] > 0 ? 'up' : tr[k] < 0 ? 'down' : ''}">${fmt.spct(tr[k])}</b></div>`).join('')}</div>
        ${ann.length ? `<div class="rs-ret-c"><div class="rs-fin-h"><b>Calendar-year returns</b><span class="rs-dim">${ann[0].year}–${ann.at(-1).year}</span></div><div id="rsRetChart"></div></div>` : ''}</div>`,
      source: src(c, 'Yahoo-reported') }),
    after(root) {
      const host = root.querySelector('#rsRetChart');
      if (!host) return;
      c.charts.push(periodChart(host, { kind: 'bar', labels: ann.map(x => '’' + x.year.slice(2)), titles: ann.map(x => x.year), series: [{ values: ann.map(x => x.returnPct) }], fmt: v => fmt.spct(v), height: 128, aria: 'Calendar-year returns' }));
    },
  };
}
