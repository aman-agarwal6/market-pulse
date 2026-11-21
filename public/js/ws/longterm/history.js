// Long-Term › History: drawdown history (price + underwater + table), the
// decline overlay, "what happened next" after similar declines, and time in
// the market (rolling-window returns by holding period).
import { panelHTML, segHTML, seg, dataTable, setPanelState, setSourceBadge, emptyStateHTML } from '../../ui.js';
import { getLongterm, getHistory } from './data.js';
import { drawdownChart, overlayChart, stripPlot, drawRangeCells, autoSize } from './charts.js';
import { esc, fmtDate, fmtMonth, pct, share, span, spanWords, year, tone } from './fmt.js';

const st = { lt: null, gspc: null, dd: null, ddTable: null, ddRange: 'all', ddPick: null, ov: null, ovSel: new Map(), ovX: 252,
  wnThr: null, wnEra: 'all', strip: null, wnTable: null, timSeries: 'price', timSize: null };

const OV_DEFAULT = ['2020-02-19', '2022-01-03', '2018-09-20', '2007-10-09', '2000-03-24', '2025-02-19'];
const OV_COLORS = ['#3cc8d6', '#a48bff', '#e6edf3', '#ff8fb1', '#8bd450', '#6aa6ff', '#e3a06a', '#c9d27c', '#d58bd9', '#7fd6b4', '#b0b8c4', '#f5d76e'];

export const MARKUP = `
<div class="ws-sec" data-section="history">
  <h3 class="section-title">History of declines and recoveries</h3>
  <section class="grid">
    ${panelHTML({ id: 'pDrawdowns', span: 12, title: 'Drawdown History',
      sub: 'S&amp;P 500 weekly closes since 1928 · every decline of 10% or more from a record close',
      controls: segHTML({ id: 'ltDdRange', small: true, value: 'all', label: 'Chart range', options: [['all', 'Since 1928'], ['1950', 'Since 1950'], ['2000', 'Since 2000']] }),
      note: 'Every time the S&amp;P 500 fell 10% or more from a record, how deep it went and how long it took to get back.',
      info: 'A drawdown is how far the index is below its highest close so far. The lower chart (the "underwater" chart) shows it week by week: at 0% the index is at a record; at −20% it is a fifth below its last record.\n\nAn episode runs from a record close to the next close at or above it. A fall that happens while the index is still below an older record belongs to that bigger episode, so the 2011 drop sits inside 2007–13. Depth uses closing prices only, without dividends.\n\nThe table lists each episode: when it peaked, when it bottomed, how deep it went, how long the fall took and how long the climb back took. Move over a row (or the chart) to highlight it; click to keep it highlighted.',
      body: '<div class="lt-dd-grid"><div id="ltDdChart"></div><div id="ltDdTable" class="lt-dd-table"></div></div>', minH: 420,
      source: { source: 'Yahoo Finance ^GSPC', label: 'price only' } })}

    ${panelHTML({ id: 'pOverlay', span: 12, title: 'This Decline vs Past Ones',
      sub: '% below the peak (y) against trading days since the peak (x) · daily closes',
      controls: segHTML({ id: 'ltOvX', small: true, value: '252', label: 'Time shown', options: [['126', '6M'], ['252', '1Y'], ['504', '2Y'], ['1260', '5Y']] }),
      note: 'The current decline drawn over earlier ones, all starting from their own record close.',
      info: 'Each line starts at a record close (0%) and follows the index day by day afterwards. The bold amber line is the current decline. Lines end when the index got back to its old record.\n\nThis lines declines up by how long they have lasted, so you can see how today compares at the same stage. Declines that start alike have often ended very differently — a few weeks in, 2018 and 2007 looked similar.\n\nPick which past declines to show with the buttons on the right.',
      body: '<div class="lt-ov-grid"><div><div id="ltOvChart"></div><p class="lt-fine" id="ltOvNote"></p></div><div class="lt-ov-side"><div class="lt-sub-h"><span>Past declines of 10%+</span></div><div id="ltOvChips" class="lt-chips" role="group" aria-label="Past declines to show"></div></div></div>', minH: 380,
      source: { source: 'Yahoo Finance ^GSPC', label: 'daily, price only' } })}

    ${panelHTML({ id: 'pNext', span: 12, title: 'What Happened Next',
      sub: 'S&amp;P 500 price return after it first closed a given % below a record',
      controls: `${segHTML({ id: 'ltWnThr', small: true, value: '10', label: 'Decline threshold', options: [5, 10, 15, 20, 30].map(v => [String(v), v + '%', `First close ${v}% or more below a record`]) })}
        ${segHTML({ id: 'ltWnEra', small: true, value: 'all', label: 'Period', options: [['all', 'Since 1928'], ['1950', 'Since 1950']] })}`,
      note: 'After past declines of this size, where the index stood one, three, five and ten years later.',
      info: 'An event is the first day in each episode that the S&P 500 closed at least the chosen percentage below its record. Each episode counts once per threshold, so a deeper fall is not counted again on every bad day.\n\nFor each event we measure the price change to the same date 1, 3, 5 and 10 years later. These are price returns: dividends are not included, so an investor who reinvested dividends would have done better than shown. Events too recent for a horizon are left out of that horizon.\n\nThe samples are small — a few dozen events at most, and fewer than ten for the deepest thresholds — and each reflects its own era. They describe what followed in the past, not what will follow now.',
      body: '<div class="lt-wn-grid"><div><div id="ltWnSummary"></div><div class="lt-sub-h lt-strip-h"><span>Every past event</span><span class="lt-legend"><i class="lt-lg-dot pos"></i>up <i class="lt-lg-dot neg"></i>down <i class="lt-lg-med"></i>median</span></div><div id="ltWnStrip"></div></div><div><div class="lt-sub-h"><span>Events</span><span class="lt-muted" id="ltWnCount"></span></div><div id="ltWnTable"></div></div></div>', minH: 420,
      source: { source: 'Yahoo Finance ^GSPC', label: 'price only, no dividends' } })}

    ${panelHTML({ id: 'pTime', span: 12, title: 'Time in the Market',
      sub: 'Annualized return over every rolling holding period, starting each month',
      controls: segHTML({ id: 'ltTimSeg', small: true, value: 'price', label: 'Return series', options: [['price', 'Price · since 1950'], ['totalReturn', 'Total return · since 1988'], ['realTotalReturn', 'Real total return · since 1871']] }),
      note: 'How the spread of outcomes changed with the length of time invested in the S&amp;P 500.',
      info: 'Each row takes every possible holding period of that length — starting at the end of every month in the record — and shows how those periods turned out, as an average yearly (annualized) return.\n\nThe bar runs from the worst period to the best. The box covers the middle 80% of outcomes (10th to 90th percentile) and the tick is the median, the middle outcome. "Ended positive" is the share of periods that finished above where they started.\n\nPrice return leaves out dividends. Total return reinvests them. Real total return also subtracts inflation, so it measures growth in buying power; it comes from Robert Shiller’s monthly data, which uses monthly average prices and currently ends in June 2023. Overlapping periods share most of their months, so these are far fewer independent observations than the counts suggest.',
      bodyId: 'ltTime', minH: 300, source: { source: 'Yahoo Finance · Shiller' } })}
  </section>
</div>`;

// ---------------------------------------------------------------------------
// Episodes
// ---------------------------------------------------------------------------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function labelEpisodes(eps) {
  const base = e => { const a = year(e.peakDate), b = year(e.troughDate); return a === b ? String(a) : `${a}–${String(b).slice(2)}`; };
  const counts = {};
  for (const e of eps) counts[base(e)] = (counts[base(e)] || 0) + 1;
  for (const e of eps) {
    const b = base(e);
    e.label = e.ongoing ? 'Now' : counts[b] > 1 ? `${MON[+e.peakDate.slice(5, 7) - 1]} ${year(e.peakDate)}` : b;
    if (e.ongoing) e.longLabel = `Current (from ${fmtMonth(e.peakDate)})`;
  }
  return eps;
}

// ---------------------------------------------------------------------------
// Drawdown history
// ---------------------------------------------------------------------------
const RANGE_FROM = { all: null, 1950: '1950-01-01', 2000: '2000-01-01' };
function renderDrawdowns() {
  const lt = st.lt;
  const pnl = document.getElementById('pDrawdowns');
  if (!lt.chart?.meta?.ok || !lt.drawdowns?.meta?.ok) { setPanelState(pnl, 'empty', { title: 'Drawdown history unavailable', message: esc(lt.chart?.meta?.error || lt.drawdowns?.meta?.error || '') }); return; }
  const eps = lt.drawdowns.episodes;
  const from = RANGE_FROM[st.ddRange];
  const chartOpts = { dates: lt.chart.dates, close: lt.chart.close, uw: lt.chart.underwaterPct, episodes: eps, from,
    onHover: i => paintDdRow(i ?? st.ddPick, false), onPick: i => pick(i) };
  if (!st.dd) st.dd = drawdownChart(document.getElementById('ltDdChart'), chartOpts);
  else st.dd.update(chartOpts);
  const rows = eps.map((e, i) => ({ ...e, i })).filter(e => !from || (e.recoveryDate || '9999') >= from);
  const cols = [
    { key: 'label', label: 'Episode', fmt: (v, r) => `<b class="${r.ongoing ? 'lt-now-t' : ''}">${esc(r.ongoing ? 'Current' : r.label)}</b>`, value: r => r.peakDate, title: 'Labelled by the years of the peak and the low' },
    { key: 'peakDate', label: 'Peak', fmt: v => fmtDate(v) },
    { key: 'troughDate', label: 'Low', title: 'Lowest close of the episode (so far, for the current one)', fmt: (v, r) => fmtDate(v) + (r.ongoing ? '<small class="lt-muted"> so far</small>' : '') },
    { key: 'depthPct', label: 'Depth', type: 'num', title: 'Fall from the record close to the lowest close (sorts deepest first)', fmt: (v, r) => `<span class="lt-depth-c">${pct(r.depthPct, 1)}</span>`, value: r => -r.depthPct },
    { key: 'calendarDaysPeakToTrough', label: 'Fall', type: 'num', title: 'Time from the peak to the low', fmt: v => span(v) },
    { key: 'calendarDaysTroughToRecovery', label: 'Recovery', type: 'num', title: 'Time from the low back to the old record', fmt: (v, r) => r.ongoing ? '<span class="lt-muted">ongoing</span>' : span(v) },
    { key: 'calendarDaysPeakToRecovery', label: 'Total', type: 'num', title: 'Peak to recovery', fmt: (v, r) => r.ongoing ? '<span class="lt-muted">—</span>' : span(v), hideBelow: 'md' },
  ];
  cols.forEach(c => { c.tone = (v, r) => (r.ongoing ? 'lt-now' : '') + (r.pre1950 ? ' lt-pre' : ''); });
  const el = document.getElementById('ltDdTable');
  if (!st.ddTable) {
    st.ddTable = dataTable(el, { columns: cols, rows, sort: 'peakDate', dir: -1, maxHeight: 400, label: 'S&P 500 declines of 10% or more', onRowClick: r => pick(r.i) });
    // Own CSV (signed depth and full fields): the table sorts depth by its magnitude.
    el.insertAdjacentHTML('beforeend', '<div class="dt-tools"><button type="button" class="btn-link" data-ddcsv>Export CSV</button></div>');
    el.querySelector('[data-ddcsv]').addEventListener('click', exportDrawdowns);
    const tb = el.querySelector('tbody');
    tb.addEventListener('mouseover', e => { const tr = e.target.closest('tr[data-i]'); if (tr) { const r = rowsNow()[+tr.dataset.i]; st.dd.highlight(r?.i ?? null); } });
    tb.addEventListener('mouseleave', () => st.dd.highlight(st.ddPick));
    tb.addEventListener('focusin', e => { const tr = e.target.closest('tr[data-i]'); if (tr) st.dd.highlight(rowsNow()[+tr.dataset.i]?.i ?? null); });
  } else st.ddTable.update(rows);
  st.ddRows = rows;
  const pre = rows.filter(r => r.pre1950).length;
  setFootNote(pnl, `${rows.length} episodes${pre ? `, ${pre} of them before 1950 (S&amp;P 90 composite)` : ''}. Times are calendar time. Weekly chart; the underwater line uses each week’s lowest close.`);
  paintDdRow(st.ddPick, false);
}
const rowsNow = () => st.ddRows || [];
function exportDrawdowns() {
  const head = ['Episode', 'Peak date', 'Peak close', 'Low date', 'Low close', 'Depth %', 'Peak to low (calendar days)', 'Low to recovery (calendar days)', 'Recovery date', 'Ongoing'];
  const q = v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lines = [head.join(','), ...rowsNow().slice().sort((a, b) => b.peakDate.localeCompare(a.peakDate)).map(r => [r.ongoing ? 'Current' : r.label, r.peakDate, r.peak, r.troughDate, r.trough, r.depthPct, r.calendarDaysPeakToTrough, r.calendarDaysTroughToRecovery ?? '', r.recoveryDate ?? '', r.ongoing ? 'yes' : 'no'].map(q).join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = 'sp500-drawdowns.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function pick(i) {
  st.ddPick = st.ddPick === i ? null : i;
  st.dd.highlight(st.ddPick);
  paintDdRow(st.ddPick, true);
}
function paintDdRow(epIdx, scroll) {
  const tb = document.querySelector('#ltDdTable tbody');
  if (!tb) return;
  for (const tr of tb.querySelectorAll('tr[data-i]')) {
    const r = rowsNow()[+tr.dataset.i];
    const on = r && r.i === epIdx;
    tr.classList.toggle('lt-hl', !!on);
    if (on && scroll) tr.scrollIntoView({ block: 'nearest' });
  }
}
function setFootNote(pnl, html) { const l = pnl.querySelector('.panel-foot-l'); if (l) l.innerHTML = `<span class="lt-fine">${html}</span>`; }

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------
let paths = null;
function episodePaths() {
  if (paths) return paths;
  const g = st.gspc, eps = st.lt.drawdowns.episodes;
  const idx = new Map(g.dates.map((d, i) => [d, i]));
  paths = eps.map(e => {
    let i0 = idx.get(e.peakDate);
    if (i0 == null) i0 = g.dates.findIndex(d => d >= e.peakDate);
    if (i0 < 0) return null;
    const peak = g.c[i0];
    const end = e.recoveryDate ? (idx.get(e.recoveryDate) ?? g.dates.findIndex(d => d >= e.recoveryDate)) : g.c.length - 1;
    const stop = Math.min(end, i0 + 1260);
    const days = [], p = [];
    for (let i = i0; i <= stop; i++) { days.push(i - i0); p.push((g.c[i] / peak - 1) * 100); }
    return { days, pct: p };
  });
  return paths;
}
function renderOverlay() {
  const pnl = document.getElementById('pOverlay');
  if (!st.gspc) { setPanelState(pnl, 'error', { title: 'Daily S&P 500 history did not load', retry: () => loadHistoryData() }); return; }
  const eps = st.lt.drawdowns.episodes;
  const P = episodePaths();
  const cur = eps.findIndex(e => e.ongoing);
  if (!st.ovSel.size && !st._ovInit) {
    st._ovInit = true;
    for (const d of OV_DEFAULT) { const i = eps.findIndex(e => e.peakDate === d); if (i >= 0) toggleOv(i, true); }
  }
  const series = [];
  for (const [i, color] of st.ovSel) if (P[i]) series.push({ id: 'e' + i, label: eps[i].label, color, days: P[i].days, pct: P[i].pct });
  if (cur >= 0 && P[cur]) series.push({ id: 'now', label: 'Now', color: '#ffb000', bold: true, days: P[cur].days, pct: P[cur].pct });
  const opts = { series, xMax: st.ovX, height: 360 };
  if (!st.ov) st.ov = overlayChart(document.getElementById('ltOvChart'), opts); else st.ov.update(opts);
  // chips
  const chips = eps.map((e, i) => ({ e, i })).filter(x => !x.e.ongoing).reverse();
  document.getElementById('ltOvChips').innerHTML = chips.map(({ e, i }) => {
    const c = st.ovSel.get(i);
    return `<button type="button" class="lt-chip${c ? ' on' : ''}" data-ep="${i}" aria-pressed="${!!c}" title="Peak ${fmtDate(e.peakDate)} · low ${fmtDate(e.troughDate)}"><i style="${c ? `background:${c}` : ''}"></i><span>${esc(e.label)}</span><b>${pct(e.depthPct, 0)}</b></button>`;
  }).join('');
  // note: compare at the current day count
  const note = document.getElementById('ltOvNote');
  if (cur >= 0 && P[cur]) {
    const d = P[cur].days.at(-1), now = P[cur].pct.at(-1);
    const shown = [...st.ovSel.keys()].filter(i => P[i]);
    const at = shown.map(i => { const k = P[i].days.indexOf(d); return k >= 0 ? P[i].pct[k] : null; });
    const recovered = at.filter(v => v == null).length;
    const deeper = at.filter(v => v != null && v < now).length;
    note.innerHTML = shown.length ? `The current decline is ${d} trading days old, at ${pct(now, 1)}. At the same point, ${deeper} of the ${shown.length} past declines shown were deeper${recovered ? ` and ${recovered} had already recovered` : ''}. Price only; peaks are closing highs.` : '';
  } else note.textContent = 'The S&P 500 is at or near a record, so there is no current decline to compare.';
}
function toggleOv(i, on) {
  if (on) { const used = new Set(st.ovSel.values()); st.ovSel.set(i, OV_COLORS.find(c => !used.has(c)) || OV_COLORS[i % OV_COLORS.length]); }
  else st.ovSel.delete(i);
}

// ---------------------------------------------------------------------------
// What happened next
// ---------------------------------------------------------------------------
function renderNext() {
  const wn = st.lt.whatNext;
  const pnl = document.getElementById('pNext');
  if (!wn?.meta?.ok) { setPanelState(pnl, 'empty', { title: 'Study unavailable', message: esc(wn?.meta?.error || '') }); return; }
  const t = wn.thresholds.find(x => x.thresholdPct === st.wnThr) || wn.thresholds[1];
  const era = st.wnEra === '1950' ? 'since1950' : 'all';
  const sum = t.summary[era];
  const events = t.events.filter(e => st.wnEra !== '1950' || e.date >= '1950-01-01');
  const H = wn.horizonsYears;
  const curPeak = st.lt.current?.allTimeHighDate;
  const hl = h => h === 1 ? '1 year' : h + ' years';
  document.getElementById('ltWnSummary').innerHTML = `<table class="lt-wn-sum"><thead><tr><th>Later</th><th class="n">Events</th><th class="n">Median</th><th class="n">Range (worst to best)</th><th class="n">Ended higher</th></tr></thead><tbody>${H.map(h => {
    const s = sum?.[h];
    return s ? `<tr><td>${hl(h)}</td><td class="n">${s.count}</td><td class="n ${tone(s.median)}"><b>${pct(s.median, 1)}</b></td><td class="n"><span class="${tone(s.min)}">${pct(s.min, 0)}</span> <span class="lt-muted">to</span> <span class="${tone(s.max)}">${pct(s.max, 0)}</span></td><td class="n">${s.count ? `${Math.round(s.pctPositive * s.count / 100)} of ${s.count}` : '—'} <span class="lt-muted">(${share(s.pctPositive, 0)})</span></td></tr>`
      : `<tr><td>${hl(h)}</td><td class="n">0</td><td class="n" colspan="3"><span class="lt-muted">no completed events</span></td></tr>`;
  }).join('')}</tbody></table>
  <p class="lt-fine">Cumulative price change from the day the index first closed ${t.thresholdPct}% below its record, dividends not included. ${events.length} events${st.wnEra === '1950' ? ' since 1950' : ' since 1928'}, each from a different episode — a small sample that describes the past, not a forecast.</p>`;
  const rows = H.map(h => ({ key: h, label: h + 'y', values: events.filter(e => e.fwd[h] != null).map(e => ({ v: e.fwd[h], date: e.date, peakDate: e.peakDate })), median: sum?.[h]?.median ?? null }));
  if (!st.strip) st.strip = stripPlot(document.getElementById('ltWnStrip'), { rows }); else st.strip.update({ rows });
  const tableRows = events.map(e => ({ ...e, now: e.peakDate === curPeak && Object.values(e.fwd).every(v => v == null) && st.lt.current.drawdownPct < 0 }));
  const cols = [
    { key: 'date', label: 'Crossed', title: `First close ${t.thresholdPct}% below the record`, fmt: (v, r) => fmtDate(v) + (r.now ? ' <span class="lt-now-t">now</span>' : '') },
    { key: 'peakDate', label: 'Record', fmt: v => fmtMonth(v), hideBelow: 'sm' },
    ...H.map(h => ({ key: 'f' + h, label: h + 'y', type: 'num', value: r => r.fwd[h], fmt: v => v == null ? '<span class="lt-muted">—</span>' : `<span class="${tone(v)}">${pct(v, 0)}</span>` })),
  ];
  cols.forEach(c => { c.tone = (v, r) => r.now ? 'lt-now' : ''; });
  const el = document.getElementById('ltWnTable');
  if (!st.wnTable) st.wnTable = dataTable(el, { columns: cols, rows: tableRows, sort: 'date', dir: -1, maxHeight: 300, label: 'Events', csv: 'sp500-what-happened-next' });
  else { st.wnTable = dataTable(el, { columns: cols, rows: tableRows, sort: 'date', dir: -1, maxHeight: 300, label: 'Events', csv: 'sp500-what-happened-next' }); }
  document.getElementById('ltWnCount').textContent = `${events.length} · ${t.thresholdPct}% threshold`;
}

// ---------------------------------------------------------------------------
// Time in the market
// ---------------------------------------------------------------------------
function renderTime() {
  const el = document.getElementById('ltTime');
  const tim = st.lt.timeInMarket;
  const s = tim?.[st.timSeries];
  if (!s?.meta?.ok || !s.windows?.length) { el.innerHTML = emptyStateHTML({ title: 'This series is unavailable', message: esc(s?.meta?.error || '') }); return; }
  const w = s.windows;
  const yrs = n => n === 1 ? '1 year' : n + ' years';
  const cell = (v, d = 1) => `<td class="n ${tone(v)}">${pct(v, d)}</td>`;
  el.innerHTML = `<table class="lt-tim">
    <thead><tr><th>Held for</th><th class="n">Periods</th><th class="n">Ended positive</th><th class="lt-tim-rc">Range of annualized returns</th><th class="n">Worst</th><th class="n">10th pct</th><th class="n">Median</th><th class="n">90th pct</th><th class="n">Best</th></tr></thead>
    <tbody>${w.map(r => `<tr><td><b>${yrs(r.years)}</b></td><td class="n lt-muted">${r.windows.toLocaleString('en-US')}</td>
      <td class="n"><span class="lt-pos-bar"><i style="width:${r.pctPositive}%"></i></span>${share(r.pctPositive, 1)}</td>
      <td class="lt-tim-rc" data-range></td>
      <td class="n ${tone(r.worstPct)}" title="Worst period started ${fmtMonth(r.worstStart)}">${pct(r.worstPct, 1)}<small class="lt-muted"> ${year(r.worstStart)}</small></td>
      ${cell(r.p10Pct)}<td class="n ${tone(r.medianPct)}"><b>${pct(r.medianPct, 1)}</b></td>${cell(r.p90Pct)}
      <td class="n ${tone(r.bestPct)}" title="Best period started ${fmtMonth(r.bestStart)}">${pct(r.bestPct, 1)}<small class="lt-muted"> ${year(r.bestStart)}</small></td></tr>`).join('')}
      <tr class="lt-tim-axis"><td colspan="3"></td><td class="lt-tim-rc" data-range-axis></td><td colspan="5"></td></tr>
    </tbody></table>
    <p class="lt-fine">${esc(s.label)}. ${fmtMonth(s.from)} to ${fmtMonth(s.to)}${st.timSeries === 'realTotalReturn' ? ' — Shiller’s dividend data currently ends here' : ''}. Small year next to worst and best = the year that period started. Returns are per year, compounded.</p>`;
  const draw = () => drawRangeCells(el, w, { clip: [-45, 60] });
  st.timSize?.destroy();
  st.timSize = autoSize(el.querySelector('.lt-tim-rc[data-range]'), draw);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export function wire(root) {
  seg(root.querySelector('#ltDdRange'), v => { st.ddRange = v; renderDrawdowns(); });
  seg(root.querySelector('#ltOvX'), v => { st.ovX = +v; renderOverlay(); });
  seg(root.querySelector('#ltWnThr'), v => { st.wnThr = +v; renderNext(); });
  seg(root.querySelector('#ltWnEra'), v => { st.wnEra = v; renderNext(); });
  seg(root.querySelector('#ltTimSeg'), v => { st.timSeries = v; renderTime(); });
  root.querySelector('#ltOvChips').addEventListener('click', e => {
    const b = e.target.closest('[data-ep]');
    if (!b) return;
    const i = +b.dataset.ep;
    toggleOv(i, !st.ovSel.has(i));
    renderOverlay();
    root.querySelector(`#ltOvChips [data-ep="${i}"]`)?.focus({ preventScroll: true });
  });
}

let ltLoading = null;
async function loadHistoryData() {
  const pnl = document.getElementById('pOverlay');
  try { st.gspc = await getHistory('^GSPC'); setPanelState(pnl, 'ready'); restoreOverlayBody(); renderOverlay(); setSourceBadge(pnl, { asOf: Date.parse(st.gspc.meta?.asOf) || Date.now() }); }
  catch (e) { setPanelState(pnl, 'error', { message: esc(e.message), retry: () => loadHistoryData() }); setSourceBadge(pnl, { error: true }); }
}
function restoreOverlayBody() {
  if (document.getElementById('ltOvChart')) return;
  document.querySelector('#pOverlay .panel-body').innerHTML = '<div class="lt-ov-grid"><div><div id="ltOvChart"></div><p class="lt-fine" id="ltOvNote"></p></div><div class="lt-ov-side"><div class="lt-sub-h"><span>Past declines of 10%+</span></div><div id="ltOvChips" class="lt-chips" role="group" aria-label="Past declines to show"></div></div></div>';
  st.ov = null;
}

export function load() {
  if (ltLoading) return ltLoading;
  ltLoading = (async () => {
    let lt;
    try { lt = await getLongterm(); } catch (e) {
      ltLoading = null;
      for (const id of ['pDrawdowns', 'pOverlay', 'pNext', 'pTime']) { const p = document.getElementById(id); setPanelState(p, 'error', { message: esc(e.message), retry: () => load() }); setSourceBadge(p, { error: true }); }
      return;
    }
    st.lt = lt;
    labelEpisodes(lt.drawdowns?.episodes || []);
    if (st.wnThr == null) {
      const crossed = lt.current?.thresholdsCrossedThisEpisode || [];
      st.wnThr = crossed.length ? Math.max(...crossed) : 10;
      const b = document.querySelector(`#ltWnThr [data-v="${st.wnThr}"]`);
      if (b) { for (const x of document.querySelectorAll('#ltWnThr button')) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); } }
    }
    const asOf = Date.parse(lt.generatedAt);
    renderDrawdowns(); setSourceBadge(document.getElementById('pDrawdowns'), { asOf });
    renderNext(); setSourceBadge(document.getElementById('pNext'), { asOf });
    renderTime(); setSourceBadge(document.getElementById('pTime'), { asOf });
    await loadHistoryData();
  })();
  return ltLoading;
}
export function redraw() { st.dd?.redraw(); st.ov?.redraw(); }
export { spanWords };
