// Overview: "State of the economy" lines, the economy-at-a-glance tiles
// grouped by theme, and a detail chart for the selected tile.
import { panelHTML, segHTML, esc } from '../../ui.js';
import { sparkSVG } from '../../util.js';
import { series, slice, thin, RANGES } from './data.js';
import { SPEC, spec, fmtVal, fmtChg, toneOf, period, periodShort, pctPhrase, FREQ_WORD, monthYearOf, ordinal } from './fmt.js';
import { ui, renderLines, badge, RECESSION_KEY } from './panel.js';
import { summaryLines } from './summary.js';
import { SERIES_NOTES, RECESSION, PERCENTILE } from './notes.js';

export const GROUPS = [
  { id: 'Inflation', title: 'Inflation', keys: ['cpi', 'coreCpi', 'pce', 'corePce', 'breakeven10'] },
  { id: 'Jobs', title: 'Jobs', keys: ['unemployment', 'payrolls', 'claims', 'sahm'] },
  { id: 'Growth', title: 'Growth', keys: ['gdp', 'indpro', 'sentiment'] },
  { id: 'Rates', title: 'Policy & rates', keys: ['fedFunds', 'y2', 'y10', 'real10', 's10y2y', 's10y3m', 'mortgage30'] },
  { id: 'Credit', title: 'Credit & financial conditions', keys: ['hySpread', 'baaSpread', 'nfci', 'm2'] },
];
const LABEL = {
  cpi: 'CPI', coreCpi: 'Core CPI', pce: 'PCE', corePce: 'Core PCE', breakeven10: '10Y breakeven',
  unemployment: 'Unemployment', payrolls: 'Payrolls', claims: 'Jobless claims', sahm: 'Sahm rule',
  gdp: 'Real GDP', indpro: 'Industrial prod.', sentiment: 'UMich sentiment',
  fedFunds: 'Fed funds', y2: '2Y Treasury', y10: '10Y Treasury', real10: '10Y real yield', s10y2y: '10Y − 2Y', s10y3m: '10Y − 3M', mortgage30: '30Y mortgage',
  hySpread: 'High-yield spread', baaSpread: 'Baa spread', nfci: 'Fin. conditions', m2: 'M2 money',
};
ui.pick.overview ??= 'cpi';

const SUMMARY_INFO = `Each line is produced by a fixed rule from the figures on this page (for example “compare the latest CPI reading with 2% and with the reading 12 months earlier”). Nothing here is written by a person or an AI, and none of it is a forecast.

Click a line to open the indicator it comes from. Monthly and quarterly figures describe a period that ended weeks ago: that is when the government publishes them.`;

const GLANCE_INFO = `Each tile is one indicator. The big number is the latest reading and the small date beside the label is the period it covers, not when it was published.

Under it: the change since the previous reading and since about a year earlier. Changes in rates are in percentage points (pp) or basis points (bp, 0.01 pp). Green and red appear only where a rise has one clear meaning for the economy, for example more jobless claims (red) or more jobs (green); inflation, interest rates and money growth are left uncoloured.

The line is the last five years. The bar shows the percentile: where today’s reading sits in the indicator’s own history, with ticks at the 25th and 75th. ${PERCENTILE}

Tiles marked “est.” show an estimate for a newer month where the source has a gap (October 2025 was never published because of the government shutdown); the method is in the indicator’s detail view.`;

export const overviewHTML = () => `
<div data-section="overview">
  <section class="grid">
    ${panelHTML({ id: 'pEcoSummary', title: 'State of the Economy', sub: 'Rule-generated from the readings below', cls: 'mpanel', bodyId: 'ecoSummary', minH: 96,
      note: 'The main readings in one place, described in plain words.', info: SUMMARY_INFO,
      source: { source: 'Rules on FRED, BLS, BEA, NY Fed and CBOT data', label: 'loading' } })}
  </section>
  <section class="grid eco-main">
    ${panelHTML({ id: 'pGlance', span: 7, title: 'Economy at a Glance', sub: 'Latest reading · change · 5-year line · percentile in its own history', cls: 'mpanel', bodyId: 'glance', minH: 600,
      note: 'Every indicator on one screen. Select a tile to see its full history.', info: GLANCE_INFO,
      source: { source: 'FRED', label: 'loading' } })}
    ${panelHTML({ id: 'pDetail', span: 5, title: '<span id="mdTitle">Indicator</span>', sub: '<span id="mdSub"></span>', cls: 'mpanel md-panel',
      note: 'The selected indicator over time, with recessions shaded.', info: 'Select a tile.',
      controls: segHTML({ id: 'pDetail-rng', small: true, value: ui.range.pDetail ??= '20Y', label: 'Time range', options: RANGES }),
      body: '<div class="md-head" id="mdHead"></div><div class="mchart-box" id="pDetail-c" style="min-height:284px"></div><div class="md-text" id="mdText"></div>',
      footer: `<span class="mp-foot" id="pDetail-f"></span>`,
      source: { source: 'FRED', label: 'loading' } })}
  </section>
</div>`;

function tileHTML(s, selected) {
  const sp = spec(s.key);
  const L = s.latest;
  const recent = slice(s.points, '5Y').map(p => p.v).filter(v => v != null);
  const base = sp.refs[0]?.v ?? null;
  const spark = recent.length > 1 ? sparkSVG(thin(recent, 90), { w: 160, h: 26, color: selected ? 'var(--amber)' : 'var(--ink-3)', base }) : '';
  const prev = s.previous && s.change != null
    ? `<span class="${toneOf(s.key, s.change)}">${fmtChg(s.key, s.change)}</span> <em>vs ${esc(periodShort(s.previous.date, s.freq, L.date))}</em>` : '';
  const ya = s.yearAgo && s.changeFromYearAgo != null
    ? `<span class="${toneOf(s.key, s.changeFromYearAgo)}">${fmtChg(s.key, s.changeFromYearAgo)}</span> <em>vs ${esc(periodShort(s.yearAgo.date, s.freq, L.date === s.yearAgo.date ? '' : L.date))}</em>` : '';
  const p = s.percentile;
  const pb = p != null ? `<div class="pbar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}" aria-label="${esc(pctPhrase(s))}"><i style="left:${Math.max(0, Math.min(100, p))}%"></i></div><div class="pbar-l">${esc(pctPhrase(s))}${s.key === 'hySpread' ? ' (3-yr history)' : ''}</div>` : '';
  let extra = '';
  if (s.latestEstimate?.value != null) extra = `<div class="mtile-x est" title="${esc(s.latestEstimate.method || '')}">${esc(period(s.latestEstimate.date, s.freq))} est. <b>${fmtVal(s.key, s.latestEstimate.value)}</b></div>`;
  else if (s.key === 'payrolls' && s.extra?.avg3m != null) extra = `<div class="mtile-x">3-month avg <b>${fmtVal('payrolls', s.extra.avg3m)}</b></div>`;
  else if (s.key === 'claims' && s.extra?.avg4w != null) extra = `<div class="mtile-x">4-week avg <b>${fmtVal('claims', s.extra.avg4w)}</b></div>`;
  else if (s.key === 'fedFunds' && s.extra?.targetRange) extra = `<div class="mtile-x">Target <b>${s.extra.targetRange.low.toFixed(2)}–${s.extra.targetRange.high.toFixed(2)}%</b></div>`;
  return `<div class="stat mtile${selected ? ' sel' : ''}" role="button" tabindex="0" data-mkey="${s.key}" aria-pressed="${selected}" title="${esc(s.title)} · ${esc(s.unit)}${s.meta?.stale ? ' · stale copy' : ''}">
    <div class="stat-k">${esc(LABEL[s.key] || s.title)}</div>
    <div class="mtile-vr"><span class="stat-v">${fmtVal(s.key, L.value)}</span><span class="mtile-d">${esc(period(L.date, s.freq).replace(/, \d{4}$/, ''))}</span></div>
    <div class="mtile-c">${prev ? `<div>${prev}</div>` : ''}${ya ? `<div>${ya}</div>` : ''}</div>
    <div class="stat-spark">${spark}</div>${pb}${extra}</div>`;
}
function failedTileHTML(key) {
  const s = series(key, { allowFailed: true });
  return `<div class="stat mtile off" title="${esc(s?.meta?.error || 'Not available')}"><div class="mtile-h"><span class="stat-k">${esc(LABEL[key] || key)}</span></div><div class="stat-v">—</div><div class="mtile-c"><div><em>Not available${s?.meta?.error ? ': ' + esc(s.meta.error) : ''}</em></div></div></div>`;
}

export function renderOverview(D) {
  // Summary
  const lines = summaryLines(D);
  document.getElementById('ecoSummary').innerHTML = lines.length ? `<ul class="eco-sum">${lines.map(l =>
    `<li><button type="button" class="eco-sum-l" ${l.key ? `data-mkey="${l.key}"` : ''}${l.section ? ` data-msec="${l.section}"` : ''}><span class="eco-tag">${esc(l.tag)}</span><span class="eco-txt">${l.html}</span></button></li>`).join('')}</ul>` : '<p class="mp-muted">Not enough data loaded to summarise.</p>';
  const gen = D.generatedAt ? new Date(D.generatedAt) : null;
  badge('pEcoSummary', { label: gen ? 'built ' + gen.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ET' : '' });
  renderGlance(D);
  renderDetail(D);
}

export function renderGlance(D) {
  const pick = ui.pick.overview;
  document.getElementById('glance').innerHTML = GROUPS.map(g => `
    <div class="mgroup">
      <h3 class="mgroup-t">${esc(g.title)}</h3>
      <div class="mtiles">${g.keys.map(k => { const s = series(k); return s?.latest ? tileHTML(s, k === pick) : failedTileHTML(k); }).join('')}</div>
    </div>`).join('');
  const stale = D.series.filter(s => s.meta?.stale).length;
  const failed = D.series.filter(s => s.meta?.ok === false).length;
  badge('pGlance', { label: `${D.series.length - failed} of ${D.series.length} series${failed ? `, ${failed} unavailable` : ''} · each tile dated to its own reference period`, stale: stale > 0 });
}

export function renderDetail(D) {
  const key = ui.pick.overview;
  const s = series(key) || series('cpi');
  if (!s) return;
  const sp = spec(s.key);
  document.getElementById('mdTitle').textContent = s.title;
  document.getElementById('mdSub').textContent = `${s.id} · ${s.unit} · ${FREQ_WORD[s.freq]}${s.transform === 'yoy' ? ', change vs a year earlier' : s.transform === 'diff' ? ', change vs the month before' : ''}`;
  const L = s.latest;
  const cell = (k, v, sub = '') => `<div><span>${k}</span><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  document.getElementById('mdHead').innerHTML = `
    <div class="md-now"><div class="md-v">${fmtVal(s.key, L.value)}</div><div class="md-d">${esc(period(L.date, s.freq))}</div></div>
    <div class="md-cells">
      ${s.previous ? cell('Previous', fmtVal(s.key, s.previous.value), esc(period(s.previous.date, s.freq))) : ''}
      ${s.yearAgo ? cell('A year earlier', fmtVal(s.key, s.yearAgo.value), esc(period(s.yearAgo.date, s.freq))) : ''}
      ${s.percentile != null ? cell('Percentile', ordinal(s.percentile), 'since ' + esc(s.key === 'hySpread' ? monthYearOf(s.percentileSince) : s.percentileSince.slice(0, 4))) : ''}
      ${s.latestEstimate?.value != null ? cell('Estimate', fmtVal(s.key, s.latestEstimate.value), esc(period(s.latestEstimate.date, s.freq))) : ''}
    </div>`;
  const est = s.latestEstimate;
  document.getElementById('mdText').innerHTML = `
    <div><h4>What it is</h4><p>${esc(s.what)}</p></div>
    <div><h4>Why it matters</h4><p>${esc(s.why)}</p></div>
    ${est ? `<div class="md-est"><h4>About the estimate</h4><p>${esc(period(est.date, s.freq))} estimate: <b>${fmtVal(s.key, est.value)}</b>. ${esc(isoMonths(cap(est.method)))}. The main figure above stays on ${esc(period(L.date, s.freq))}, the newest month with a published year-ago base.</p></div>` : ''}`;
  // info explainer for this series
  const info = [s.what + ' ' + s.why, SERIES_NOTES[s.key] || '', RECESSION, est ? 'Estimate for ' + period(est.date, s.freq) + ': ' + isoMonths(cap(est.method)) + '.' : '', s.history?.note && s.history.note !== 'full history' ? 'History: ' + s.history.note + '.' : '']
    .filter(Boolean).join('\n\n');
  const btn = document.querySelector('#pDetail .info-btn');
  if (btn) { btn.dataset.explain = info; btn.dataset.explainTitle = s.title; btn.setAttribute('aria-label', 'How to read ' + s.title); }
  renderLines(D, 'pDetail', {
    lines: [{ key: s.key, label: s.title, color: '#ffb000', area: false, width: 1.6 }],
    refs: sp.refs, height: 260, legend: false, recessions: true, foot: RECESSION_KEY,
  });
  badge('pDetail', { label: `${s.id} · ${period(L.date, s.freq)}`, stale: !!s.meta?.stale });
}
const isoMonths = t => t.replace(/(\d{4})-(\d{2})-01/g, (m, y, mo) => monthYearOf(`${y}-${mo}-01`));
const cap = t => t ? t[0].toUpperCase() + t.slice(1) : '';

/** Keys that can be selected (for commands / params). */
export const TILE_KEYS = Object.keys(SPEC);
