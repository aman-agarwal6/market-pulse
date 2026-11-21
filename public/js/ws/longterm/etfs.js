// Long-Term › Core ETFs: building-block funds table, correlation matrix and
// a risk-vs-return scatter.
import { panelHTML, segHTML, seg, dataTable, setPanelState, setSourceBadge, emptyStateHTML } from '../../ui.js';
import { go } from '../../shell.js';
import { getEtfs } from './data.js';
import { corrMatrix, scatter } from './charts.js';
import { esc, fmtDate, fmtMonth, pct, share, num, usd, tone } from './fmt.js';

const st = { data: null, table: null, corr: null, corrWin: 'y3', sc: null, scWin: 'y10' };

// Broad asset classes for colour (the 12 roles are too many to colour apart).
const CLASS = {
  'US total market': 'us', 'US large cap': 'us', 'US growth': 'us', 'US value / dividend': 'us', 'US small cap': 'us',
  'International (all ex-US)': 'intl', 'International developed': 'intl', 'Emerging markets': 'intl',
  Bonds: 'bond', 'Real assets': 'real', Crypto: 'real', 'All-in-one': 'mix',
};
const CLASS_COLOR = { us: '#ffb000', intl: '#3cc8d6', bond: '#a48bff', real: '#ff8fb1', mix: '#e6edf3' };
const CLASS_LABEL = { us: 'US stocks', intl: 'International stocks', bond: 'Bonds', real: 'Real assets & crypto', mix: 'All-in-one' };

export const MARKUP = `
<div class="ws-sec" data-section="etfs">
  <h3 class="section-title">Core ETFs</h3>
  <section class="grid">
    ${panelHTML({ id: 'pEtfs', span: 12, title: 'Building-Block Funds',
      sub: '28 widely held index ETFs grouped by role · annualized total return with dividends reinvested',
      note: 'Broad index funds side by side: what they cost, what they pay out and how they have behaved.',
      info: 'An ETF (exchange-traded fund) is a basket of investments that trades like a single stock. Index ETFs simply hold everything in an index, such as the S&P 500 or the whole world stock market.\n\nExpense ratio is the yearly fee as a share of what you hold (0.03% = $3 a year per $10,000). Yield is the income paid out over the past year. Returns are annualized total returns: dividends reinvested, per year, to the latest close. Volatility is how much monthly returns swung (standard deviation, annualized); worst drawdown is the deepest fall from a high, here within the last 10 years (or since the fund began, if younger). "From high" is how far the price is below its all-time closing high.\n\nP/E is shown for stock funds only. Select a fund to open its full page, or "DCA" to simulate monthly investing in it.',
      bodyId: 'ltEtfTable', minH: 520, source: { source: 'Yahoo Finance', label: 'adjusted daily closes' } })}

    ${panelHTML({ id: 'pCorr', span: 7, title: 'Correlation Matrix',
      sub: 'Monthly total returns · complete calendar months',
      controls: segHTML({ id: 'ltCorrWin', small: true, value: 'y3', label: 'Window', options: [['y3', '3Y'], ['y10', '10Y']] }),
      note: 'How closely each pair of funds has moved together, month by month.',
      info: 'Correlation runs from −1 to +1. At +1 two funds rose and fell together every month; near 0 their monthly moves were unrelated; below 0 one tended to rise when the other fell.\n\nDiversification comes from holding things that do not all move together. Funds that track nearly the same stocks (VOO, IVV, SPY, VTI) sit at about 1.00 with each other, so owning several of them changes little. Bonds, gold and international stocks have had lower correlations with US stocks, though correlations shift over time and often rise during sell-offs.\n\nCells are empty (·) where two funds share too few months of history, such as the bitcoin fund over 10 years.',
      body: '<div id="ltCorrRead" class="lt-read"></div><div id="ltCorr"></div><div class="lt-corr-legend" id="ltCorrLegend"></div>', minH: 640, source: { source: 'Yahoo Finance', label: 'monthly total returns' } })}

    ${panelHTML({ id: 'pRisk', span: 5, title: 'Risk vs Return',
      sub: 'Annualized total return against volatility, same window',
      controls: segHTML({ id: 'ltScWin', small: true, value: 'y10', label: 'Window', options: [['y3', '3Y'], ['y10', '10Y']] }),
      note: 'Each dot is a fund: higher has returned more, further right has swung more along the way.',
      info: 'The vertical position is the fund’s annualized total return over the window; the horizontal position is its volatility over the same window (how widely monthly returns varied, annualized).\n\nOver long periods, riskier assets have usually — not always — earned more, and the dots often lie roughly along a rising line. A single window can look very different: a stretch of rising interest rates, for example, hurt long-term bonds, so they show high swings and low returns over the last 10 years.\n\nFunds younger than the window are left out.',
      body: '<div id="ltScatter"></div><div class="lt-sc-legend" id="ltScLegend"></div>', minH: 640, source: { source: 'Yahoo Finance', label: 'adjusted closes' } })}
  </section>
</div>`;

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
function renderTable() {
  const d = st.data;
  const el = document.getElementById('ltEtfTable');
  const order = new Map(d.groups.map((g, i) => [g, i]));
  const rows = d.funds.map((f, i) => ({ ...f, gi: (order.get(f.role) ?? 99) * 100 + i, ok: f.meta?.history?.ok !== false }));
  const tr = k => r => r.stats?.totalReturnAnnualizedPct?.[k] ?? null;
  const retCol = (k, label) => ({ key: 'r' + k, label, type: 'num', value: tr(k), fmt: v => v == null ? '<span class="lt-muted">—</span>' : pct(v, 1), tone: v => tone(v), title: `Annualized total return, ${label.toLowerCase()}` });
  const cols = [
    { key: 'role', label: 'Role', value: r => r.gi, fmt: (v, r) => `<span class="lt-role">${esc(r.role)}</span>`, title: 'Sort by role to restore the grouping' },
    { key: 's', label: 'Fund', value: r => r.s, fmt: (v, r) => `<span class="lt-fund"><b>${esc(r.s)}</b><span>${esc(r.label || r.name || '')}</span></span>` },
    { key: 'er', label: 'Fee', type: 'num', value: r => r.expenseRatioPct, fmt: v => v == null ? '—' : share(v, v < 0.1 ? 2 : 2), title: 'Expense ratio, per year' },
    { key: 'y', label: 'Yield', type: 'num', value: r => r.yieldPct, fmt: v => v == null ? '—' : share(v, 2), title: 'Trailing 12-month distribution yield' },
    { key: 'aum', label: 'Size', type: 'num', value: r => r.aum, fmt: v => usd(v, { compact: true }), title: 'Assets under management', hideBelow: 'md' },
    retCol('y1', '1Y'), retCol('y3', '3Y'), retCol('y5', '5Y'), retCol('y10', '10Y'),
    { key: 'vol', label: 'Vol', type: 'num', value: r => r.stats?.volatilityPct?.y10 ?? r.stats?.volatilityPct?.y3 ?? null,
      fmt: (v, r) => v == null ? '—' : num(v, 1) + (r.stats?.volatilityPct?.y10 == null ? '<sup title="3-year (fund is younger than 10 years)">3y</sup>' : ''), title: 'Volatility of monthly total returns, 10 years (annualized)' },
    { key: 'mdd', label: 'Worst fall', type: 'num', value: r => r.stats?.maxDrawdown10y?.pct ?? null,
      fmt: (v, r) => { const m = r.stats?.maxDrawdown10y; return v == null ? '—' : `<span title="${esc(fmtDate(m.peak))} to ${esc(fmtDate(m.trough))} · ${esc(m.window)}">${pct(v, 1)}</span>`; }, title: 'Deepest fall from a high, last 10 years (or since inception)' },
    { key: 'fh', label: 'From high', type: 'num', value: r => r.stats?.fromHighPct ?? null, fmt: (v, r) => v == null ? '—' : `<span title="All-time closing high ${esc(fmtDate(r.stats.highDate))}; with dividends ${esc(pct(r.stats.fromHighTotalReturnPct, 1))}">${pct(v, 1)}</span>`, title: 'Price below the all-time closing high' },
    { key: 'pe', label: 'P/E', type: 'num', value: r => r.trailingPE ?? null, fmt: v => v == null ? '<span class="lt-muted">—</span>' : num(v, 1), title: 'Trailing P/E of the holdings (stock funds only)', hideBelow: 'md' },
    { key: 'act', label: '', sortable: false, value: () => '', fmt: (v, r) => `<button type="button" class="lt-mini" data-dca="${esc(r.s)}" title="Simulate monthly investing in ${esc(r.s)}">DCA</button>` },
  ];
  st.table = dataTable(el, { columns: cols, rows, sort: 'role', dir: 1, label: 'Core ETFs', csv: 'core-etfs',
    onRowClick: (r, e) => {
      const b = e.target.closest('[data-dca]');
      if (b) { go('longterm', 'planning', { params: { s: b.dataset.dca } }); return; }
      go('research', 'company', { params: { s: r.s } });
    } });
  el.querySelector('thead').addEventListener('click', () => decorate(el));
  decorate(el);
  const bad = d.funds.filter(f => f.meta?.history?.ok === false || f.meta?.info?.ok === false).map(f => f.s);
  const l = document.querySelector('#pEtfs .panel-foot-l');
  if (l) l.innerHTML = `<span class="lt-fine">Returns to ${fmtDate(d.funds.find(f => f.stats?.lastDate)?.stats.lastDate)}. Yahoo history can start after a fund’s launch; a dash means the fund is too young for that period.${bad.length ? ` Partial data: ${esc(bad.join(', '))}.` : ''} Select a row for the fund’s page.</span>`;
}
function decorate(el) {
  const th = el.querySelector('th[aria-sort]');
  const grouped = !th || th.dataset.k === 'role';
  el.querySelector('.dt-wrap').classList.toggle('lt-grouped', grouped);
  let prev = null;
  for (const tr of el.querySelectorAll('tbody tr[data-i]')) {
    const role = tr.querySelector('.lt-role')?.textContent;
    tr.classList.toggle('g-first', grouped && role !== prev);
    prev = role;
  }
}

// ---------------------------------------------------------------------------
// Correlation
// ---------------------------------------------------------------------------
function renderCorr() {
  const c = st.data.correlation?.[st.corrWin];
  const el = document.getElementById('ltCorr');
  if (!c?.symbols?.length) { el.innerHTML = emptyStateHTML({ title: 'Correlations unavailable' }); return; }
  const roleOf = new Map(st.data.funds.map(f => [f.s, f.role]));
  const opts = { symbols: c.symbols, r: c.r, n: c.n, minOverlap: c.minOverlapMonths, groupOf: s => roleOf.get(s) };
  if (!st.corr) st.corr = corrMatrix(el, opts); else st.corr.update(opts);
  const idx = new Map(c.symbols.map((s, i) => [s, i]));
  const r = (a, b) => c.r[idx.get(a)]?.[idx.get(b)];
  const f2 = v => v == null ? 'n/a' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  const pair = (b, name) => `${name} (${b}) <b>${f2(r('VTI', b))}</b>`;
  document.getElementById('ltCorrRead').innerHTML = `<p>Over ${c.months / 12} years (${fmtMonth(c.from + '-01')} to ${fmtMonth(c.to + '-01')}), the S&amp;P 500 funds and the total US market fund moved almost as one (VOO–VTI <b>${f2(r('VTI', 'VOO'))}</b>). Against the total US market fund (VTI): ${pair('VXUS', 'international stocks')}, ${pair('BND', 'US bonds')}, ${pair('TLT', 'long Treasuries')}, ${pair('GLD', 'gold')}. Lower numbers mean the funds have tended to move more independently, which is what spreading money across them relies on.</p>`;
  document.getElementById('ltCorrLegend').innerHTML = `<span>−0.5</span><span class="lt-grad"></span><span>+1.0</span><span class="lt-muted">· empty = fewer than ${c.minOverlapMonths} months in common</span>`;
}

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------
function renderScatter() {
  const k = st.scWin;
  const points = st.data.funds.map(f => ({ s: f.s, label: f.label, group: f.role, x: f.stats?.volatilityPct?.[k] ?? null, y: f.stats?.totalReturnAnnualizedPct?.[k] ?? null, color: CLASS_COLOR[CLASS[f.role] || 'mix'] }));
  const opts = { points, xLabel: `Volatility, ${k === 'y3' ? '3' : '10'}y`, yLabel: `Annualized return, ${k === 'y3' ? '3' : '10'}y`, height: 540 };
  const el = document.getElementById('ltScatter');
  if (!st.sc) st.sc = scatter(el, opts); else st.sc.update(opts);
  const left = points.filter(p => p.x == null || p.y == null).map(p => p.s);
  document.getElementById('ltScLegend').innerHTML = Object.entries(CLASS_LABEL).map(([key, l]) => `<span><i style="background:${CLASS_COLOR[key]}"></i>${l}</span>`).join('') + (left.length ? `<span class="lt-muted">Not shown (too young): ${esc(left.join(', '))}</span>` : '');
}

// ---------------------------------------------------------------------------
const saved = {};
export function wire(root) {
  for (const id of ['pEtfs', 'pCorr', 'pRisk']) saved[id] = root.querySelector('#' + id + ' .panel-body').innerHTML;
  seg(root.querySelector('#ltCorrWin'), v => { st.corrWin = v; if (st.data) renderCorr(); });
  seg(root.querySelector('#ltScWin'), v => { st.scWin = v; if (st.data) renderScatter(); });
}

let loading = null;
function retry() {
  for (const id of ['pEtfs', 'pCorr', 'pRisk']) document.querySelector('#' + id + ' .panel-body').innerHTML = saved[id];
  st.table = st.corr = st.sc = null;
  load();
}
export function load() {
  if (loading) return loading;
  const ids = ['pEtfs', 'pCorr', 'pRisk'];
  setPanelState(document.getElementById('pEtfs'), 'loading', { rows: 10 });
  loading = getEtfs().then(d => {
    st.data = d;
    if (!d.meta?.ok && !d.funds?.length) throw new Error(d.meta?.error || 'ETF data unavailable');
    setPanelState(document.getElementById('pEtfs'), 'ready');
    renderTable(); renderCorr(); renderScatter();
    for (const id of ids) setSourceBadge(document.getElementById(id), { asOf: Date.parse(d.meta?.asOf || d.generatedAt) });
  }).catch(e => {
    loading = null;
    for (const id of ids) { const p = document.getElementById(id); setPanelState(p, 'error', { message: esc(e.message), retry: retry }); setSourceBadge(p, { error: true }); }
  });
  return loading;
}
