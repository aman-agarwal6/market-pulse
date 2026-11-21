// Inflation & the Fed: inflation measures against the policy rate and the 2%
// goal, the readings table, the Fed path and real-rate context.
import { panelHTML, segHTML, dataTable, statGridHTML, esc } from '../../ui.js';
import { series } from './data.js';
import { fmtVal, fmtChg, period, ordinal } from './fmt.js';
import { ui, chartPanelHTML, renderLines, badge, RECESSION_KEY } from './panel.js';
import { fedPathHTML, renderFedPath } from './fed.js';
import { PP, RECESSION, BP } from './notes.js';

const MEASURES = { headline: ['cpi', 'pce'], core: ['coreCpi', 'corePce'], all: ['cpi', 'coreCpi', 'pce', 'corePce'] };
const COLORS = { cpi: '#ffb000', coreCpi: '#ffd27a', pce: '#3cc8d6', corePce: '#a48bff', fedFunds: '#e6edf3' };
ui.pick.inflSet ??= 'core';

export const inflationHTML = () => `
<div data-section="inflation">
  <section class="grid">
    ${chartPanelHTML({ id: 'pInfl', span: 8, title: 'Inflation vs the Policy Rate', range: '20Y', height: 300,
      sub: 'Year-over-year inflation · effective fed funds rate · Fed 2% goal',
      note: 'How fast prices are rising, next to the interest rate the Fed sets to slow or support the economy.',
      extraControls: segHTML({ id: 'inflSet', small: true, value: ui.pick.inflSet, label: 'Inflation measures', options: [['headline', 'Headline'], ['core', 'Core'], ['all', 'All four']] }),
      info: `Inflation is the percentage rise in prices compared with the same month a year earlier. “Headline” includes everything; “core” leaves out food and energy, which swing with harvests and oil prices, to show the slower trend.

CPI comes from the Bureau of Labor Statistics; PCE from the Commerce Department. The Fed’s 2% goal is defined with PCE inflation, and core PCE is the gauge it watches most closely.

The white line is the effective fed funds rate. When it is well above inflation, policy is restraining the economy; when below, it is supporting it. ${PP}

${RECESSION}` })}
    ${panelHTML({ id: 'pInflTable', span: 4, title: 'Inflation Readings', sub: '12-month change · latest month published', cls: 'mpanel', minH: 300, body: '<div id="inflTable"></div><div class="infl-policy" id="inflPolicy"></div>',
      note: 'The four main inflation measures side by side.',
      info: `Each row is one measure of consumer price inflation over the latest 12 months. “vs goal” is the gap from the Fed’s 2% goal in percentage points (pp). “Pctl” is the percentile in the measure’s own history: 67th means two-thirds of past readings were lower.

Estimates: October 2025 was never published (government shutdown), so for CPI the newest month cannot be compared with a published year-ago figure. The table shows the last properly computed month; the estimate line underneath fills the year-ago gap by interpolating between September and November 2025.

Under the table: the effective fed funds rate minus core PCE inflation, a rough “real” policy rate. Above zero, the Fed’s rate is higher than underlying inflation. The 10-year breakeven is the average inflation rate bond prices imply for the next ten years.`,
      footer: '<span class="mp-foot" id="pInflTable-f"></span>',
      source: { source: 'FRED', label: 'loading' } })}
  </section>
  <h3 class="section-title">Fed path</h3>
  <section class="grid">
    ${fedPathHTML()}
  </section>
  <section class="grid">
    ${chartPanelHTML({ id: 'pReal', span: 12, title: 'Real Yields &amp; Inflation Expectations', range: 'Max', height: 250,
      ranges: [['5Y', '5Y'], ['10Y', '10Y'], ['Max', 'Since 2003']],
      sub: '10-year Treasury yield = 10-year real (TIPS) yield + 10-year breakeven inflation',
      note: 'What safe 10-year bonds pay after expected inflation, and the inflation rate bond prices imply.',
      info: `A real yield is the interest rate after inflation. The 10-year real yield comes from Treasury Inflation-Protected Securities (TIPS), whose payments rise with CPI.

The gap between the ordinary 10-year Treasury yield and the TIPS yield is “breakeven” inflation: the average yearly inflation at which both bonds would earn the same. It is an approximate market expectation and also contains risk premiums.

Higher real yields mean safe bonds offer a higher return after inflation. Future company earnings are discounted at rates built on these yields, which is why they matter for stock valuations. ${BP}

TIPS data on FRED start in 2003. ${RECESSION}` })}
  </section>
</div>`;

export function renderInflation(D) {
  renderInflChart(D);
  renderInflTable(D);
  renderFedPath(D);
  renderLines(D, 'pReal', {
    lines: [{ key: 'y10', label: '10Y Treasury', color: '#e6edf3', width: 1.4 }, { key: 'real10', label: '10Y real (TIPS)', color: '#ffb000' }, { key: 'breakeven10', label: '10Y breakeven inflation', color: '#3cc8d6' }],
    yKey: 'y10', refs: [{ v: 0, label: '0%' }], height: 250, foot: RECESSION_KEY, alignStart: true,
  });
}

export function renderInflChart(D) {
  const keys = MEASURES[ui.pick.inflSet] || MEASURES.core;
  renderLines(D, 'pInfl', {
    lines: [...keys.map(k => ({ key: k, label: series(k)?.title.replace(' inflation', '') || k, color: COLORS[k] })),
      { key: 'fedFunds', label: 'Fed funds (effective)', color: COLORS.fedFunds, width: 1.2, dash: '4 3' }],
    yKey: 'cpi', refs: [{ v: 2, label: 'Fed 2% goal', color: 'var(--ink-3)' }], height: 300, tipFreq: 'M',
    foot: RECESSION_KEY,
  });
}

let tbl = null;
function renderInflTable(D) {
  const rows = ['cpi', 'coreCpi', 'pce', 'corePce'].map(k => series(k)).filter(s => s?.latest).map(s => ({
    key: s.key, name: s.title.replace(' inflation', ''), date: s.latest.date, freq: s.freq, v: s.latest.value,
    prev: s.change, ya: s.yearAgo?.value, yaDate: s.yearAgo?.date, gap: s.latest.value - 2, pct: s.percentile, est: s.latestEstimate,
  }));
  const el = document.getElementById('inflTable');
  if (!rows.length) { el.innerHTML = '<p class="mp-muted">Inflation data did not load.</p>'; badge('pInflTable', { label: 'unavailable', error: 'not available' }); return; }
  const cols = [
    { key: 'name', label: 'Measure', sortable: false, fmt: (v, r) => `<b class="it-name"><i style="background:${COLORS[r.key]}"></i>${esc(v)}</b><small class="it-d">${esc(period(r.date, r.freq))}</small>` },
    { key: 'v', label: 'Latest', type: 'num', sortable: false, fmt: (v, r) => fmtVal(r.key, v) },
    { key: 'prev', label: 'm/m', type: 'num', sortable: false, title: 'Change vs the previous month’s 12-month rate, percentage points', fmt: (v, r) => fmtChg(r.key, v).replace(' pp', '') },
    { key: 'ya', label: 'Yr ago', type: 'num', sortable: false, title: '12-month rate a year earlier', fmt: (v, r) => fmtVal(r.key, v) },
    { key: 'gap', label: 'vs goal', type: 'num', sortable: false, title: 'Gap from the Fed’s 2% goal, percentage points', fmt: (v, r) => fmtChg(r.key, v).replace(' pp', '') },
    { key: 'pct', label: 'Pctl', type: 'num', sortable: false, title: 'Percentile in its own history', fmt: v => ordinal(v) },
  ];
  if (!tbl) tbl = dataTable(el, { columns: cols, rows, label: 'Inflation readings' });
  else tbl.update(rows);
  const est = rows.filter(r => r.est?.value != null);
  document.getElementById('pInflTable-f').innerHTML = (est.length ? `<span class="mp-est">Estimates for ${esc(period(est[0].est.date, 'M'))}: ${est.map(r => `${esc(r.name)} <b>${fmtVal(r.key, r.est.value)}</b>`).join(' · ')} (year-ago base interpolated, see ⓘ)</span>` : '') +
    '<span class="mp-muted">Changes and gaps in percentage points.</span>';
  const months = [...new Set(rows.map(r => period(r.date, 'M')))].join(' / ');
  renderPolicy();
  badge('pInflTable', { label: 'BLS CPI · BEA PCE · ' + months, stale: rows.some(r => series(r.key).meta?.stale) });
}

function renderPolicy() {
  const ff = series('fedFunds'), cp = series('corePce'), be = series('breakeven10');
  const el = document.getElementById('inflPolicy');
  const tiles = [];
  if (ff?.latest) tiles.push({ label: 'Fed funds', value: fmtVal('fedFunds', ff.latest.value), sub: esc(period(ff.latest.date, 'D')) });
  if (ff?.latest && cp?.latest) {
    const gap = Math.round((ff.latest.value - cp.latest.value) * 10) / 10;
    tiles.push({ label: 'Less core PCE', value: (gap > 0 ? '+' : gap < 0 ? '−' : '') + Math.abs(gap).toFixed(1) + ' pp', sub: `${fmtVal('fedFunds', ff.latest.value)} − ${fmtVal('corePce', cp.latest.value)} (${esc(period(cp.latest.date, 'M'))})` });
  }
  if (be?.latest) tiles.push({ label: '10Y breakeven', value: fmtVal('breakeven10', be.latest.value), sub: 'market-implied, ' + esc(period(be.latest.date, 'D').replace(/, \d{4}$/, '')) });
  el.innerHTML = tiles.length ? `<h4>Policy rate vs inflation</h4>${statGridHTML(tiles, { min: 110 })}` : '';
}
