// Rates & credit, long history: yield-curve spreads with inversions shaded,
// credit spreads, mortgage rate vs the 10-year, financial conditions and money growth.
import { segHTML } from '../../ui.js';
import { series, negativeRuns } from './data.js';
import { ui, chartPanelHTML, renderLines, RECESSION_KEY } from './panel.js';
import { SERIES_NOTES, RECESSION, BP } from './notes.js';

ui.pick.spread ??= 's10y3m';
const INVERSION = 'rgba(255,77,94,.13)';

export const creditHTML = () => `
  <h3 class="section-title">Yield-curve history</h3>
  <section class="grid">
    ${chartPanelHTML({ id: 'pSpreads', span: 12, title: 'Yield-Curve Spreads Since the 1970s', range: 'Max', height: 280,
      ranges: [['10Y', '10Y'], ['20Y', '20Y'], ['30Y', '30Y'], ['Max', 'Max']],
      sub: 'Long minus short Treasury yields, basis points · inversions shaded red, recessions grey',
      note: 'Whether long-term rates are above short-term rates, over 50 years, with recessions marked.',
      extraControls: segHTML({ id: 'spreadPick', small: true, value: ui.pick.spread, label: 'Inversions shown for', options: [['s10y3m', 'Shade 10Y−3M'], ['s10y2y', 'Shade 10Y−2Y']] }),
      info: `Both lines are the 10-year Treasury yield minus a shorter one: the 3-month bill (amber) and the 2-year note (cyan), in basis points. ${BP}

Below zero the yield curve is “inverted”: short-term loans to the government pay more than long-term ones, which has usually happened when markets expected interest rates to fall. Red shading marks the days the selected spread was below zero; grey shading marks NBER recessions.

Inversions have come before most US recessions since the 1970s, with lead times from several months to about two years. Not every inversion was followed by a recession, and the curve has often turned positive again before a recession began. The Recession watch tab counts these episodes in this data.` })}
  </section>
  <h3 class="section-title">Credit &amp; financial conditions</h3>
  <section class="grid">
    ${chartPanelHTML({ id: 'pCredit', span: 6, title: 'Corporate Credit Spreads', range: 'Max', height: 240,
      ranges: [['5Y', '5Y'], ['10Y', '10Y'], ['20Y', '20Y'], ['Max', 'Since 1986']],
      sub: 'Extra yield over Treasuries, basis points · Baa since 1986, high-yield last 3 years only',
      note: 'How much more companies pay to borrow than the US government. Wider gaps mean lenders are more worried.',
      info: `${SERIES_NOTES.baaSpread}

${SERIES_NOTES.hySpread}

Spreads have widened sharply in recessions and market crashes (2001, 2008, 2020) and narrowed in calm periods. ${BP}

${RECESSION}` })}
    ${chartPanelHTML({ id: 'pNfci', span: 6, title: 'Financial Conditions', range: 'Max', height: 240,
      sub: 'Chicago Fed National Financial Conditions Index · 0 = average since 1971',
      note: 'One number for how easy or hard it is to borrow and take risk in US markets.',
      info: `${SERIES_NOTES.nfci}

${RECESSION}` })}
    ${chartPanelHTML({ id: 'pMort', span: 6, title: 'Mortgage Rate vs the 10-Year', range: 'Max', height: 230,
      sub: '30-year fixed mortgage (Freddie Mac survey) · 10-year Treasury yield, %',
      note: 'What a new home loan costs, next to the government bond rate it usually follows.',
      info: `${SERIES_NOTES.mortgage30}

${SERIES_NOTES.y10}

${RECESSION}` })}
    ${chartPanelHTML({ id: 'pM2', span: 6, title: 'Money Supply Growth', range: 'Max', height: 230,
      sub: 'M2 · % change vs a year earlier',
      note: 'How fast the amount of money in bank accounts and money funds is growing.',
      info: `${SERIES_NOTES.m2}

${RECESSION}` })}
  </section>`;

export function renderCredit(D) {
  const pick = ui.pick.spread;
  const sp = series(pick);
  const inv = sp ? negativeRuns(sp.points, `${pick === 's10y3m' ? '10Y−3M' : '10Y−2Y'} inverted`).map(b => ({ ...b, color: INVERSION })) : [];
  renderLines(D, 'pSpreads', {
    lines: [{ key: 's10y3m', label: '10Y − 3M', color: '#ffb000', width: pick === 's10y3m' ? 1.7 : 1.1 }, { key: 's10y2y', label: '10Y − 2Y', color: '#3cc8d6', width: pick === 's10y2y' ? 1.7 : 1.1 }],
    yKey: 's10y3m', refs: [{ v: 0, label: '0 = flat curve', color: 'var(--ink-3)' }], bands: inv, height: 280,
    foot: RECESSION_KEY + `<span class="mp-key"><i class="mp-key-inv"></i>${pick === 's10y3m' ? '10Y−3M' : '10Y−2Y'} below zero</span>`,
  });
  renderLines(D, 'pCredit', {
    lines: [{ key: 'baaSpread', label: 'Baa − 10Y Treasury', color: '#ffb000' }, { key: 'hySpread', label: 'High-yield OAS (since 2023)', color: '#ff8fb1' }],
    yKey: 'baaSpread', refs: [], height: 240, foot: RECESSION_KEY,
  });
  renderLines(D, 'pNfci', { lines: [{ key: 'nfci', label: 'NFCI', color: '#3cc8d6' }], height: 240, refs: [{ v: 0, label: 'average', color: 'var(--ink-3)' }], foot: RECESSION_KEY + '<span class="mp-muted">Above 0 = tighter than average</span>' });
  renderLines(D, 'pMort', {
    lines: [{ key: 'mortgage30', label: '30Y mortgage', color: '#ffb000' }, { key: 'y10', label: '10Y Treasury', color: '#e6edf3', width: 1.2 }],
    yKey: 'mortgage30', height: 230, foot: RECESSION_KEY, alignStart: true,
  });
  renderLines(D, 'pM2', { lines: [{ key: 'm2', label: 'M2, y/y', color: '#a48bff' }], height: 230, foot: RECESSION_KEY });
}
