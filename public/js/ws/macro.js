// Macro — bonds, rates & credit (existing, in macro-rates.js) and the economy
// section. Build economy panels in this file and css/ws-macro.css.
import { panelHTML, emptyStateHTML } from '../ui.js';
import { ratesHTML, renderRates } from './macro-rates.js';

const economyHTML = () => `
<div class="ws-sec" data-section="economy">
  <h3 class="section-title">Economy</h3>
  <section class="grid" id="ecoGrid">
    ${panelHTML({ id: 'pEconomy', title: 'Economy', sub: 'Inflation · jobs · growth · Federal Reserve policy', bodyId: 'economy', minH: 260,
      note: 'The main measures of how the US economy is doing.',
      body: emptyStateHTML({ icon: 'chart', title: 'No economic data loaded', message: 'This section shows inflation, employment, growth and interest-rate policy, each compared with its own history.' }) })}
  </section>
</div>`;

export default {
  id: 'macro', title: 'Macro', key: '5', aliases: ['MACRO', 'RATES', 'BONDS'], phone: 'more',
  icon: '<path d="M4 18c3-1 4-9 8-9s4 5 8 3"/><path d="M4 21h16"/>',
  sections: [
    { id: 'rates', title: 'Rates & credit', hint: 'GC', aliases: ['YCRV'], keywords: ['yield curve', 'treasury', 'bonds', 'spreads', 'inversion'] },
    { id: 'economy', title: 'Economy', hint: 'ECO', keywords: ['inflation', 'cpi', 'jobs', 'unemployment', 'gdp', 'fed'] },
  ],
  subnav: 'scroll',
  mount(root) { root.innerHTML = ratesHTML() + economyHTML(); },
  update(S, ctx) {
    renderRates(S, ctx.force);
  },
};
