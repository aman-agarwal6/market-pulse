// Long-Term — the long-run lens for an index-fund investor: conditions,
// history of declines and recoveries, planning tools and core ETFs.
// Build here and in css/ws-longterm.css. Each placeholder below is a real
// panel (stable ids: p<Name> for the panel, lt<Name> for its body) with an
// empty state: replace the body when its data exists.
import { panelHTML, emptyStateHTML } from '../ui.js';

const slot = (id, span, title, sub, note, message, ic = 'chart', minH = 240) => panelHTML({
  id: 'p' + id, span, title, sub, note, bodyId: 'lt' + id, minH,
  body: emptyStateHTML({ icon: ic, title: 'No data loaded', message }),
});

const MARKUP = `
<div class="ws-sec" data-section="conditions">
  <h3 class="section-title">Long-term conditions</h3>
  <section class="grid">
    ${slot('Scorecard', 8, 'Conditions Scorecard', 'Valuation · trend · rates · breadth, each against its own history',
      'Where today’s market stands on a few long-run measures, compared with the past.',
      'Each measure is placed on its historical range, so you can see whether today is typical or unusual.', 'grid', 280)}
    ${slot('Valuation', 4, 'Valuation', 'Price relative to earnings, against history',
      'How expensive stocks are compared with the profits behind them.',
      'Shows the market’s price-to-earnings level against its long-run range.', 'chart', 280)}
  </section>
</div>

<div class="ws-sec" data-section="history">
  <h3 class="section-title">History</h3>
  <section class="grid">
    ${slot('Drawdowns', 8, 'Drawdown History', 'S&amp;P 500 declines from a prior high',
      'Every major fall in the S&amp;P 500, and how long each took to recover.',
      'Charts each decline from a previous peak, shaded by depth, with the time taken to get back to the old high.', 'chart', 320)}
    ${slot('NextStudy', 4, 'What Happened Next', 'Returns after similar conditions',
      'What the market did in the months after past moments like today.',
      'Lists past dates with similar readings and the returns that followed over 1, 3 and 5 years.', 'table', 320)}
    ${slot('TimeInMarket', 12, 'Time in the Market', 'Range of returns by holding period',
      'How the spread of outcomes narrows the longer an investment is held.',
      'Shows the best, worst and typical yearly return for holding periods from 1 to 20 years.', 'chart', 260)}
  </section>
</div>

<div class="ws-sec" data-section="planning">
  <h3 class="section-title">Planning tools</h3>
  <section class="grid">
    ${slot('Dca', 6, 'DCA Simulator', 'Investing a fixed amount on a schedule',
      'What regular investing into a fund would have grown to, using its real price history.',
      'Pick a fund, an amount and a start date to see the value over time against the total paid in.', 'calc', 320)}
    ${slot('Compound', 6, 'Compounding Projector', 'Illustration, not a forecast',
      'How savings could grow at different yearly returns.',
      'Set a starting amount, a monthly addition and a range of returns to see how the total builds up.', 'calc', 320)}
  </section>
</div>

<div class="ws-sec" data-section="etfs">
  <h3 class="section-title">Core ETFs</h3>
  <section class="grid">
    ${slot('Etfs', 8, 'Core ETF Table', 'Broad index funds · returns · costs',
      'Widely held index funds side by side: what they track, what they cost and how they have done.',
      'Lists broad US, international and bond index funds with returns over several periods and yearly fees.', 'table', 300)}
    ${slot('Correlation', 4, 'Correlation', 'How closely funds move together',
      'Whether two funds tend to rise and fall at the same time.',
      'A grid of how closely daily returns have moved together. Lower numbers mean more diversification.', 'grid', 300)}
  </section>
</div>`;

export default {
  id: 'longterm', title: 'Long-Term', key: '2', aliases: ['LONG', 'LT'], phone: 'main',
  icon: '<path d="M4 19h16"/><path d="M5 16l4-5 3 3 7-8"/><path d="M15 6h4v4"/>',
  sections: [
    { id: 'conditions', title: 'Conditions', keywords: ['scorecard', 'valuation', 'pe', 'expensive'] },
    { id: 'history', title: 'History', keywords: ['drawdowns', 'bear markets', 'recoveries', 'what happened next', 'time in market'] },
    { id: 'planning', title: 'Planning', keywords: ['dca', 'dollar cost averaging', 'compounding', 'savings'] },
    { id: 'etfs', title: 'Core ETFs', keywords: ['index funds', 'correlation', 'voo', 'vti'] },
  ],
  subnav: 'scroll',
  mount(root) { root.innerHTML = MARKUP; },
  // show(ctx) {}, hide() {}, update(S, ctx) {}, route(ctx) {} — see shell.js
};
