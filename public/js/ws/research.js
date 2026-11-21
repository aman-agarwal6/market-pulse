// Research — screener, company page and compare tool, one at a time.
// Build here and in css/ws-research.css. Placeholder panels keep stable ids
// (p<Name> panel, rs<Name> body); replace their bodies when data exists.
import { panelHTML, emptyStateHTML } from '../ui.js';

const slot = (id, span, title, sub, note, message, ic, minH = 260, extra = {}) => panelHTML({
  id: 'p' + id, span, title, sub, note, bodyId: 'rs' + id, minH,
  body: emptyStateHTML({ icon: ic, title: 'No data loaded', message }), ...extra,
});

const MARKUP = `
<div data-section="screener">
  <section class="grid">
    ${slot('ScreenFilters', 3, 'Filters', 'Sector · size · valuation · performance',
      'Narrow the list down to companies that match what you are looking for.',
      'Filters by sector, company size, valuation and recent performance.', 'search', 520)}
    ${slot('ScreenResults', 9, 'Screener Results', 'S&amp;P 500 members matching the filters',
      'Companies that pass every filter, in a sortable table.',
      'Shows matching companies with price, size, valuation and returns. Select a row to open the company.', 'table', 520)}
  </section>
</div>

<div data-section="company">
  <section class="grid">
    ${slot('CoProfile', 12, 'Company', 'Profile · key numbers',
      'What the company does and the numbers most often used to describe it.',
      'Shows what the company does, its size, sector and the key numbers investors look at first.', 'search', 140)}
    ${slot('CoChart', 8, 'Price History', 'Total return against the S&amp;P 500',
      'How the stock has done compared with the overall market.',
      'Charts the stock against the S&amp;P 500 over periods from one month to ten years.', 'chart', 340)}
    ${slot('CoStats', 4, 'Fundamentals', 'Valuation · profitability · dividends',
      'How the company’s valuation and profits compare with its sector.',
      'Lists valuation, margins, growth and dividend measures next to the sector median.', 'table', 340)}
  </section>
</div>

<div data-section="compare">
  <section class="grid">
    ${slot('CmpChart', 8, 'Compare', 'Growth of 100 · up to 6 tickers',
      'Several stocks or funds on one chart, all starting from the same value.',
      'Charts each ticker\u2019s growth from the same starting value, so different prices compare fairly.', 'chart', 380)}
    ${slot('CmpTable', 4, 'Side by Side', 'Returns · risk · costs',
      'The same numbers for each ticker in one table.',
      'Shows returns, volatility, largest decline and fees for each ticker you add.', 'table', 380)}
  </section>
</div>`;

export default {
  id: 'research', title: 'Research', key: '4', aliases: ['RESEARCH'], phone: 'main',
  icon: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  sections: [
    { id: 'screener', title: 'Screener', hint: 'EQS', keywords: ['screen', 'filter', 'find stocks'] },
    { id: 'company', title: 'Company', hint: 'DES', keywords: ['profile', 'fundamentals', 'company page'] },
    { id: 'compare', title: 'Compare', hint: 'COMP', keywords: ['versus', 'vs', 'side by side'] },
  ],
  subnav: 'tabs',
  mount(root) { root.innerHTML = MARKUP; },
  // show(ctx) {}, hide() {}, update(S, ctx) {}, route(ctx) {} — see shell.js
};
