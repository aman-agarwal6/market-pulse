// Macro › Bonds, rates & credit (existing panels, moved from the single page).
// Kept separate from macro.js so the economy section can be built there
// without touching this code.
import { $ } from '../util.js';
import * as P from '../panels.js';
import * as C from '../charts.js';
import { panelHTML, renderCache, safe } from '../ui.js';

const cache = renderCache();

export const ratesHTML = () => `
<div class="ws-sec" data-section="rates">
  <h3 class="section-title">Bonds, rates &amp; credit</h3>
  <section class="grid">
    ${panelHTML({ id: 'pCurve', span: 6, title: 'Treasury Yield Curve', sub: 'US Treasury daily par yields · today vs history', body: '<div id="curve" class="chart-box"></div>', cls: 'fit',
      note: 'Interest rates on US government debt, from 1-month bills to 30-year bonds.',
      info: 'Each point is the yield on a US Treasury of that maturity. Normally longer loans pay more, so the curve slopes upward. The faded lines show the curve a week, a month and a year ago, so you can see how it has shifted.\n\nWhen short-term yields are above long-term ones the curve is "inverted". Inversions have come before most US recessions since the 1960s, but the delay has ranged from months to about two years, and not every inversion was followed by one.',
      source: { source: 'U.S. Treasury', key: 'curve' } })}
    ${panelHTML({ id: 'pRates', span: 6, title: 'Rates &amp; Spreads', sub: 'Live yields · curve inversion signals', body: '<div id="rateTiles"></div><div id="spreadChart" class="chart-box"></div>', minH: 420,
      note: 'Key yields today, and the gaps between long and short rates over time.',
      info: 'The tiles show live Treasury yields; a basis point (bp) is 0.01 percentage point. "10Y − 2Y" and "10Y − 3M" are the gaps between long and short rates: below zero means the curve is inverted.\n\nThe chart tracks those gaps over time, so you can see when the curve inverted and when it turned positive again.',
      source: { source: 'Yahoo Finance · U.S. Treasury', key: 'quotes' } })}
  </section>
</div>`;

export function renderRates(S, force) {
  if (force) cache.reset();
  cache.run('curve', JSON.stringify([S.yields?.latest?.date, S.yields?.live]) + innerWidth + ':' + ($('#curve')?.clientHeight || 0), () => C.yieldCurve($('#curve'), S.yields));
  safe('rates', () => P.renderRateTiles($('#rateTiles'), S.rates, S.yields));
  cache.run('spreads', (S.yields?.latest?.date || '') + innerWidth, () => C.spreadChart($('#spreadChart'), S.yields?.series));
}
