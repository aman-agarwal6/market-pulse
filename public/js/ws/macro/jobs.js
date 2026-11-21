// Jobs & growth: unemployment with the Sahm rule, payrolls, jobless claims,
// real GDP, industrial production and consumer sentiment.
import { series, slice, rolling } from './data.js';
import { fmtVal, axisFmt, tipDateFor, period } from './fmt.js';
import { ui, chartPanelHTML, renderLines, badge, seriesBadgeLabel, RECESSION_KEY } from './panel.js';
import { barChart } from './charts.js';
import { SERIES_NOTES, RECESSION, PP } from './notes.js';
import { esc } from '../../ui.js';

const R_SHORT = [['2Y', '2Y'], ['5Y', '5Y'], ['10Y', '10Y']];
const R_CLAIMS = [['1Y', '1Y'], ['2Y', '2Y'], ['5Y', '5Y'], ['Max', 'Max']];
const R_GDP = [['10Y', '10Y'], ['20Y', '20Y'], ['30Y', '30Y'], ['Max', 'Max']];

export const jobsHTML = () => `
<div data-section="jobs">
  <h3 class="section-title">Jobs</h3>
  <section class="grid">
    ${chartPanelHTML({ id: 'pUnemp', span: 6, title: 'Unemployment &amp; the Sahm Rule', range: 'Max', height: 200,
      sub: 'Unemployment rate, % · Sahm rule indicator, percentage points',
      note: 'The share of people who want a job and cannot find one, and a rule of thumb that tracks how fast it is rising.',
      below: '<div class="mchart-box" id="pUnempS-c" style="min-height:140px"></div>',
      info: `${SERIES_NOTES.unemployment}

The lower chart is the Sahm rule: the 3-month average unemployment rate minus its lowest 3-month average over the prior 12 months. Readings of 0.50 percentage point or more (dashed line) have come early in most past recessions; it has also crossed 0.50 at times without a recession. The Recession watch tab counts those episodes in this data.

${RECESSION}` })}
    ${chartPanelHTML({ id: 'pPay', span: 6, title: 'Payroll Job Growth', range: '5Y', ranges: R_SHORT, height: 316,
      sub: 'Monthly change in nonfarm payrolls, thousands · 3-month average',
      note: 'How many jobs employers added or cut each month.',
      info: `${SERIES_NOTES.payrolls}

Bars are each month’s change; bars below zero (red) are months with fewer jobs than the month before. The amber line is the 3-month average, computed here from the monthly figures.

In ranges that include 2020, the bars for the pandemic months are far off the scale and are cut at the chart edge (marked ↕) so the other months stay readable; hover them for the real number.

${RECESSION}` })}
    ${chartPanelHTML({ id: 'pClaims', span: 6, title: 'Initial Jobless Claims', range: '2Y', ranges: R_CLAIMS, height: 250,
      sub: 'New unemployment-benefit claims per week · 4-week average',
      note: 'How many people applied for unemployment benefits for the first time each week.',
      info: `${SERIES_NOTES.claims}

The amber line is the 4-week average computed here from the weekly figures. FRED history in this app is weekly for the last 5 years and monthly before that, so the “Max” view shows month-end values and no 4-week average before then.

${RECESSION}` })}
    ${chartPanelHTML({ id: 'pGdp', span: 6, title: 'Real GDP Growth', range: '20Y', ranges: R_GDP, height: 250,
      sub: 'Quarter-on-quarter change, seasonally adjusted annual rate, %',
      note: 'How fast the whole economy grew each quarter, after inflation.',
      info: `${SERIES_NOTES.gdp}

Bars below zero (red) are quarters when output shrank. The 2020 pandemic quarters are cut at the chart edge (↕) in long ranges; hover for the real values. ${PP}

${RECESSION}` })}
  </section>
  <h3 class="section-title">Activity &amp; confidence</h3>
  <section class="grid">
    ${chartPanelHTML({ id: 'pIndpro', span: 6, title: 'Industrial Production', range: '20Y', height: 230,
      sub: 'Output of factories, mines and utilities · % change vs a year earlier',
      note: 'Whether factory, mining and utility output is higher or lower than a year ago.',
      info: `${SERIES_NOTES.indpro}

${RECESSION}` })}
    ${chartPanelHTML({ id: 'pSent', span: 6, title: 'Consumer Sentiment', range: 'Max', height: 230,
      sub: 'University of Michigan index, 1966 = 100',
      note: 'How confident households say they feel about their finances and the economy.',
      info: `${SERIES_NOTES.sentiment}

${RECESSION}` })}
  </section>
</div>`;

/** Clip limits so one extreme period (2020) does not flatten every other bar. */
function clipFor(vals) {
  const a = vals.map(Math.abs).sort((x, y) => x - y);
  const p90 = a[Math.floor(a.length * 0.9)] || 1;
  const max = a.at(-1) || 1;
  return max > p90 * 4 ? [-p90 * 3, p90 * 3] : null;
}

export function renderJobs(D) {
  // Unemployment + Sahm
  const range = ui.range.pUnemp;
  // Both charts share one time axis: start where the Sahm series starts (Dec 1959).
  const sahmStart = series('sahm')?.points[0]?.t;
  const ur = series('unemployment');
  const urData = ur && sahmStart ? ur.points.filter(p => p.t >= sahmStart) : undefined;
  renderLines(D, 'pUnemp', { lines: [{ key: 'unemployment', label: 'Unemployment rate', color: '#ffb000', data: urData }], height: 200, legend: true, foot: RECESSION_KEY + '<span class="mp-key"><i class="mp-key-ref"></i>Sahm rule 0.50 trigger</span>' });
  renderLines(D, 'pUnempS', { range, lines: [{ key: 'sahm', label: 'Sahm rule', color: '#3cc8d6' }], height: 120, legend: true, refs: [{ v: 0.5, label: '0.50' }] });
  badge('pUnemp', { label: seriesBadgeLabel([series('unemployment'), series('sahm')]) });

  // Payrolls (bars + 3-month average)
  const pay = series('payrolls');
  const payEl = document.getElementById('pPay-c');
  if (pay) {
    const avg = rolling(pay.points, 3, 32);
    const r = ui.range.pPay;
    const data = slice(pay.points, r).filter(p => p.v != null);
    barChart(payEl, {
      data, overlay: slice(avg, r), overlayLabel: '3-month average', barLabel: 'Monthly change', period: 'M',
      height: 290, yFmt: axisFmt('payrolls'), valFmt: v => fmtVal('payrolls', v), tipDate: tipDateFor('M'),
      bands: D.recessionBands, clipTo: clipFor(data.map(d => d.v)), label: 'Monthly payroll changes',
    });
    const last3 = avg.at(-1)?.v;
    document.getElementById('pPay-f').innerHTML = RECESSION_KEY + (pay.extra?.avg3m != null && last3 != null && Math.round(last3) !== Math.round(pay.extra.avg3m) ? `<span class="mp-warn">3-month average differs from the source (${fmtVal('payrolls', pay.extra.avg3m)})</span>` : '');
    badge('pPay', { label: seriesBadgeLabel([pay]), stale: !!pay.meta?.stale });
  } else { payEl.innerHTML = '<p class="mp-muted">Payroll data did not load.</p>'; badge('pPay', { label: 'unavailable', error: 'not available' }); }

  // Claims + 4-week average (weekly part of the history only)
  const cl = series('claims');
  if (cl) {
    const avg = rolling(cl.points, 4, 8);
    renderLines(D, 'pClaims', {
      lines: [{ key: 'claims', label: 'Weekly claims', color: '#56606c', width: 1.1 }, { id: 'avg4w', fmtKey: 'claims', label: '4-week average', color: '#ffb000', data: avg, width: 1.8 }],
      yKey: 'claims', tipFreq: 'W', height: 250, refs: [], foot: RECESSION_KEY +
        (cl.extra?.avg4wYearAgo != null ? `<span class="mp-muted">4-week average ${fmtVal('claims', cl.extra.avg4w)} vs ${fmtVal('claims', cl.extra.avg4wYearAgo)} a year earlier (${esc(period(cl.extra.avg4wYearAgoDate, 'W'))})</span>` : ''),
    });
  } else renderLines(D, 'pClaims', { lines: [{ key: 'claims' }] });

  // GDP bars
  const gdp = series('gdp');
  const gEl = document.getElementById('pGdp-c');
  if (gdp) {
    const data = slice(gdp.points, ui.range.pGdp).filter(p => p.v != null);
    barChart(gEl, {
      data, barLabel: 'Real GDP growth', period: 'Q', height: 250, yFmt: axisFmt('gdp'), valFmt: v => fmtVal('gdp', v), tipDate: tipDateFor('Q'),
      bands: D.recessionBands, clipTo: clipFor(data.map(d => d.v)), label: 'Quarterly real GDP growth, annualized',
    });
    document.getElementById('pGdp-f').innerHTML = RECESSION_KEY;
    badge('pGdp', { label: seriesBadgeLabel([gdp]), stale: !!gdp.meta?.stale });
  } else { gEl.innerHTML = '<p class="mp-muted">GDP data did not load.</p>'; badge('pGdp', { label: 'unavailable', error: 'not available' }); }

  renderLines(D, 'pIndpro', { lines: [{ key: 'indpro', label: 'Industrial production, y/y', color: '#3cc8d6' }], height: 230, foot: RECESSION_KEY });
  renderLines(D, 'pSent', { lines: [{ key: 'sentiment', label: 'Consumer sentiment', color: '#a48bff' }], height: 230, refs: [], foot: RECESSION_KEY });
}
