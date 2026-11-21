// Macro › Rates & credit, live part: the Treasury yield curve and today's
// yields and curve spreads from the live snapshot (store.S). The long-history
// panels below them come from /api/macro (ws/macro/credit.js).
import { $ } from '../util.js';
import * as C from '../charts.js';
import { panelHTML, statGridHTML, renderCache, safe } from '../ui.js';
import { line } from './macro/charts.js';
import { BP } from './macro/notes.js';

const cache = renderCache();

export const ratesHTML = () => `
  <section class="grid">
    ${panelHTML({ id: 'pCurve', span: 6, title: 'Treasury Yield Curve', sub: 'US Treasury daily par yields, % · latest close vs a week, a month and a year ago', body: '<div id="curve" class="chart-box"></div>', cls: 'fit mpanel',
      note: 'Interest rates on US government debt, from 1-month bills to 30-year bonds.',
      info: `Each point is the yield on a US Treasury of that maturity, from 1 month to 30 years. Normally longer loans pay more, so the curve slopes upward. The fainter lines show the curve a week, a month and a year ago, so you can see how it has shifted; white rings are live Yahoo Finance quotes during the trading day. The 3-month ring usually sits a little below the line because Yahoo quotes that bill as a discount rate, which runs slightly lower than the par yield the curve uses.

When short-term yields are above long-term ones the curve is “inverted”. Inversions have come before most US recessions since the 1960s, but the delay has ranged from months to about two years, and not every inversion was followed by one.

Hover a maturity to compare the four dates. ${BP}`,
      source: { source: 'U.S. Treasury', key: 'curve' } })}
    ${panelHTML({ id: 'pRates', span: 6, title: 'Rates &amp; Spreads Today', sub: 'Live Treasury yields · curve spreads at the latest Treasury close', body: '<div id="rateTiles"></div><div id="spreadChart" class="chart-box"></div>', minH: 420, cls: 'mpanel',
      note: 'Key yields right now, and the gaps between long and short rates over the past year.',
      info: `The first four tiles are live yields from Yahoo Finance (CBOE yield indexes), with the change since yesterday’s close and over about a month. The 2-year and the two spreads use the U.S. Treasury’s official daily close.

“10Y − 2Y” and “10Y − 3M” are the gaps between long and short yields. Below zero means the curve is inverted. The chart tracks both over the past year; the Yield-curve history panel below goes back to the 1970s.

${BP}`,
      source: { source: 'Yahoo Finance · U.S. Treasury', key: 'quotes' } })}
  </section>`;

const bp = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0) + ' bp';
const usDate = s => { const [m, d, y] = s.split('/'); return new Date(Date.UTC(+y, +m - 1, +d)); };
const shortD = s => { const d = usDate(s); return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }); };

function renderRateTiles(el, rates, yc) {
  const tiles = (rates || []).map(r => {
    const q = r.q;
    // perf.m is the % change of the yield level; convert to a change in basis points.
    const m1 = q.perf?.m != null ? (q.p - q.p / (1 + q.perf.m / 100)) * 100 : null;
    return { label: r.label, value: q.p.toFixed(2) + '%', delta: bp(q.ch * 100), deltaLabel: 'today', tone: 'flat', sub: m1 != null ? `1 month: ${bp(m1)}` : '', sym: r.s };
  });
  if (yc?.latest) {
    const T = yc.tenors, L = yc.latest.y;
    const y2 = L[T.indexOf('2 Yr')], y10 = L[T.indexOf('10 Yr')], y3m = L[T.indexOf('3 Mo')];
    const W = yc.week?.y || [];
    const w2 = W[T.indexOf('2 Yr')];
    const d = shortD(yc.latest.date);
    if (y2 != null) tiles.push({ label: '2Y Treasury', value: y2.toFixed(2) + '%', delta: w2 != null ? bp((y2 - w2) * 100) : '', deltaLabel: 'vs 1 wk', tone: 'flat', sub: `Treasury close ${d}` });
    for (const [label, a, b] of [['10Y − 2Y', y10, y2], ['10Y − 3M', y10, y3m]]) {
      if (a == null || b == null) continue;
      const s = Math.round((a - b) * 100);
      tiles.push({ label, value: (s > 0 ? '+' : s < 0 ? '−' : '') + Math.abs(s) + ' bp', delta: s < 0 ? 'Inverted' : 'Not inverted', tone: s < 0 ? 'warn' : 'flat', sub: `Treasury close ${d}` });
    }
  }
  const live = tiles.filter(t => t.sym), close = tiles.filter(t => !t.sym);
  el.innerHTML = statGridHTML(live, { min: 118 }) + (close.length ? `<div class="rt-close">${statGridHTML(close, { min: 118 })}</div>` : '');
}

function renderSpreadYear(el, rows) {
  if (!el) return;
  if (!rows?.length) { el.innerHTML = '<div class="empty">Waiting for Treasury data…</div>'; return; }
  const pts = k => rows.map(r => ({ t: usDate(r.d), v: r[k] == null ? null : r[k] * 100 }));
  const f = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)) + ' bp';
  line(el, {
    series: [{ id: 'a', label: '10Y − 2Y', color: '#3cc8d6', data: pts('s2s10'), fmt: f }, { id: 'b', label: '10Y − 3M', color: '#ffb000', data: pts('s3m10'), fmt: f }],
    height: 190, refs: [{ v: 0, label: 'inverted below 0', color: 'var(--ink-3)' }], legend: true,
    yFmt: v => (v < 0 ? '−' : '') + Math.abs(Math.round(v)), ariaLabel: 'Curve spreads over the past year, basis points',
  });
}

export function renderRates(S, force) {
  if (force) cache.reset();
  cache.run('curve', JSON.stringify([S.yields?.latest?.date, S.yields?.live]) + innerWidth + ':' + ($('#curve')?.clientHeight || 0), () => C.yieldCurve($('#curve'), S.yields));
  safe('rates', () => renderRateTiles($('#rateTiles'), S.rates, S.yields));
  cache.run('spreads', (S.yields?.latest?.date || '') + innerWidth, () => renderSpreadYear($('#spreadChart'), S.yields?.series));
}
