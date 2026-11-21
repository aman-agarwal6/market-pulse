// Recession watch: each indicator's reading against its stated rule, the NY Fed
// model's probability, and a track record computed from the same histories.
// These are rules of thumb applied mechanically, not forecasts.
import { panelHTML, dataTable, esc } from '../../ui.js';
import { series, parseDay } from './data.js';
import { fmtVal, period, ordinal, monthYearOf, etStamp } from './fmt.js';
import { chartPanelHTML, renderLines, badge, RECESSION_KEY } from './panel.js';
import { BP, RECESSION } from './notes.js';

const STATUS = { ok: ['ok', 'OK'], watch: ['watch', 'Watch'], warning: ['warning', 'Warning'], unknown: ['unknown', 'No reading'] };
const chip = st => { const [c, t] = STATUS[st] || STATUS.unknown; return `<span class="mchip ${c}">${t}</span>`; };
const bpS = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v * 100)) + ' bp';
const ym = d => d.toISOString().slice(0, 7);
const monthsBetween = (a, b) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();

const WHAT = {
  s10y3m: 'The 10-year Treasury yield minus the 3-month bill yield. Below zero, the yield curve is inverted.',
  s10y2y: 'The 10-year minus the 2-year Treasury yield, the most quoted version of the curve.',
  sahm: 'How far the 3-month average unemployment rate has risen above its low of the past year.',
  claims: 'New weekly claims for unemployment benefits, 4-week average, compared with a year earlier.',
  credit: 'The extra yield companies pay over Treasuries. Wider spreads mean lenders see more risk.',
  nfci: 'Chicago Fed index of risk, credit and leverage in markets. Above zero is tighter than average.',
  recessionProbability: 'The New York Fed’s model turns the 10Y − 3M spread into a probability of recession 12 months later.',
};

export const watchHTML = () => `
<div data-section="watch">
  <p class="mw-lede"><b>Historical rules of thumb, not predictions.</b> Each row applies a fixed published rule to the latest reading and reports the result. These rules have flagged most past recessions, have also flagged some that did not happen, and say nothing about timing or about markets.</p>
  <section class="grid">
    ${panelHTML({ id: 'pWatch', title: 'Recession Watch', sub: 'Latest reading · the exact rule · status from applying it', cls: 'mpanel', bodyId: 'watchTable', minH: 360,
      note: 'Indicators that have often moved before or early in past US recessions, checked against their rules.',
      info: `Each row is one indicator. “Rule” is the exact test used for the status, applied mechanically to the latest data: OK means the rule is not triggered, Watch and Warning mean it is at the stated thresholds, and No reading means the data was missing.

The last column says what each indicator is and the limits of its track record. The counts there are computed on this page from the same histories, using NBER recession dates.

A yield curve inversion means short-term Treasury yields are above long-term ones. ${BP}`,
      footer: '<span class="mp-foot" id="pWatch-f"></span>',
      source: { source: 'FRED · NY Fed', label: 'loading' } })}
  </section>
  <section class="grid">
    ${chartPanelHTML({ id: 'pProb', span: 8, title: 'NY Fed Recession Probability', range: 'Max', height: 260,
      ranges: [['10Y', '10Y'], ['20Y', '20Y'], ['Max', 'Since 1960']],
      sub: 'Model probability of a US recession 12 months ahead, %, plotted at the month it refers to',
      note: 'The chance of a recession a year later implied by the yield curve, according to the New York Fed’s model.',
      info: `The New York Fed publishes a simple model that turns the gap between the 10-year and 3-month Treasury yields into a probability that the US is in recession 12 months later.

Each point is plotted at the month the probability refers to, which is why the line runs about a year past today (the lightly shaded area). Dashed lines mark 30% and 50%, the watch and warning levels used in the table above.

The model uses only the yield curve. It has risen before most past recessions, and it has also stayed high for long periods without one. ${RECESSION}` })}
    ${panelHTML({ id: 'pTrack', span: 4, title: 'Track Record in This Data', sub: 'Episodes computed from the series histories · NBER dates', cls: 'mpanel fit', bodyId: 'trackRec', bodyCls: 'scroll-y',
      note: 'Each time a rule was triggered, and whether a recession followed.',
      info: `Sahm rule: a new episode starts when the indicator reaches 0.50 after at least 12 months below it. It counts as “recession” if an NBER recession was under way or began within 12 months.

Yield curve: an inversion episode is 3 or more consecutive months with the monthly average spread below zero (the same rule the table uses). It counts as followed by a recession if one began within 24 months of the inversion starting; the lead is the number of months in between.

These are counts of past episodes, a small sample. They describe history, not odds for today.`,
      source: { source: 'Computed from FRED + NBER', label: 'loading' } })}
  </section>
</div>`;

function readingOf(i) {
  const d = i.date ? `<small>${esc(period(i.date, i.key === 'sahm' ? 'M' : 'D'))}</small>` : '';
  switch (i.key) {
    case 's10y3m': case 's10y2y': {
      const last = i.lastInversion;
      const cur = i.currentInversion;
      const sub = cur ? `Inverted since ${monthYearOf(cur.start)}` : last ? `Last inverted ${monthYearOf(last.start)}–${monthYearOf(last.end)} (${last.months} mo, low ${bpS(last.deepest)})` : 'No inversion in the data';
      return `<b>${bpS(i.latest)}</b>${d}<small>${esc(sub)}</small>`;
    }
    case 'sahm': return `<b>${i.latest == null ? '—' : i.latest.toFixed(2) + ' pp'}</b>${d}<small>Trigger at ${i.threshold?.toFixed(2)} pp</small>`;
    case 'claims': return `<b>${fmtVal('claims', i.latest)}</b><small>4-week avg · ${esc(period(i.date, 'W'))}</small><small>${i.changePct == null ? '' : (i.changePct > 0 ? '+' : '−') + Math.abs(i.changePct).toFixed(1) + '%'} vs ${fmtVal('claims', i.yearAgo)} a year earlier</small>`;
    case 'credit': return `<b>Baa ${bpS(i.baa?.value)}</b><small>${ordinal(i.baa?.percentile)} percentile since ${esc(i.baa?.since?.slice(0, 4) || '')}</small><small>High-yield ${bpS(i.highYield?.value)} · ${ordinal(i.highYield?.percentile)} pctl since ${esc(monthYearOf(i.highYield?.since))}</small>`;
    case 'nfci': return `<b>${i.latest == null ? '—' : fmtVal('nfci', i.latest)}</b>${i.date ? `<small>Week of ${esc(period(i.date, 'D'))}</small>` : ''}`;
    case 'recessionProbability': return `<b>${i.latest == null ? '—' : i.latest.toFixed(1) + '%'}</b><small>for ${esc(monthYearOf(i.forMonth))}</small><small>from the ${esc(monthYearOf(i.basedOnSpreadMonth))} spread, ${i.spreadUsed?.toFixed(2)} pp</small>`;
    default: return `<b>${esc(String(i.latest ?? '—'))}</b>`;
  }
}

/** Monthly mean of a daily/weekly series → [{ t (month start), v }]. */
function monthly(points) {
  const m = new Map();
  for (const p of points) {
    if (p.v == null) continue;
    const k = ym(p.t);
    const a = m.get(k) || [0, 0];
    a[0] += p.v; a[1]++;
    m.set(k, a);
  }
  return [...m].map(([k, [s, n]]) => ({ t: parseDay(k + '-01'), v: s / n }));
}
function inversions(key, recs) {
  const s = series(key);
  if (!s) return null;
  const mo = monthly(s.points);
  const eps = [];
  let run = [];
  const flush = () => { if (run.length >= 3) eps.push(run); run = []; };
  for (let i = 0; i < mo.length; i++) {
    const p = mo[i];
    const gap = run.length && monthsBetween(run.at(-1).t, p.t) > 1;
    if (gap) flush();
    if (p.v < 0) run.push(p); else flush();
  }
  flush();
  return { from: mo[0]?.t, eps: eps.map(r => {
    const start = r[0].t;
    const during = recs.find(b => start >= b.from && start <= b.to);
    const rec = during || recs.find(b => b.from >= start && monthsBetween(start, b.from) <= 24);
    return { start, end: r.at(-1).t, months: r.length, rec, during: !!during, lead: rec && !during ? monthsBetween(start, rec.from) : null,
      recent: monthsBetween(start, new Date()) < 24 };
  }) };
}
function sahmEpisodes(recs) {
  const s = series('sahm');
  if (!s) return null;
  const eps = [];
  let lastHit = null;
  for (const p of s.points) {
    if (p.v == null || p.v < 0.5) continue;
    if (!lastHit || monthsBetween(lastHit, p.t) > 12) eps.push({ start: p.t, v: p.v });
    lastHit = p.t;
  }
  return { from: s.points[0]?.t, eps: eps.map(e => {
    const rec = recs.find(b => (e.start >= b.from && e.start <= b.to) || (b.from >= e.start && monthsBetween(e.start, b.from) <= 12));
    return { ...e, rec, recent: monthsBetween(e.start, new Date()) < 12 };
  }) };
}
const yr = d => d.getUTCFullYear();
const mY = d => d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' });

function trackSummary(t, kind) {
  if (!t) return '';
  const done = t.eps.filter(e => !(e.recent && !e.rec));
  const hit = done.filter(e => e.rec).length;
  const pend = t.eps.length - done.length;
  if (kind === 'sahm') return `Since ${yr(t.from)} in this data: ${t.eps.length} episodes at 0.50 or more; ${hit} came during a recession or in the 12 months before one began${done.length - hit ? `, ${done.length - hit} did not` : ''}${pend ? ` (${pend} too recent to judge)` : ''}.`;
  const leads = done.filter(e => e.lead != null).map(e => e.lead);
  const dur = done.filter(e => e.during).length;
  return `Since ${yr(t.from)} in this data: ${t.eps.length} inversions of 3+ months; ${hit - dur} ${hit - dur === 1 ? 'was' : 'were'} followed by a recession within 24 months${leads.length ? ` (lead ${Math.min(...leads)}–${Math.max(...leads)} months)` : ''}${dur ? `, ${dur} began during one already under way` : ''}${done.length - hit ? `, ${done.length - hit} ${done.length - hit === 1 ? 'was' : 'were'} not` : ''}${pend ? `, ${pend} too recent to judge` : ''}.`;
}

let tbl = null;
export function renderWatch(D) {
  const rw = D.raw.recessionWatch;
  const el = document.getElementById('watchTable');
  if (!rw || rw.meta?.ok === false) {
    el.innerHTML = `<div class="state state-error"><div class="state-t">Recession-watch data is not available</div><p class="state-m">${esc(rw?.meta?.error || '')}</p></div>`;
    badge('pWatch', { label: 'unavailable', error: 'not available' });
    return;
  }
  const recs = D.recessionBands;
  const t3m = inversions('s10y3m', recs), t2y = inversions('s10y2y', recs), tS = sahmEpisodes(recs);
  const prob = D.watch.get('recessionProbability');
  const probPeak = (() => {
    const h = prob?.history;
    if (!h?.dates?.length) return '';
    let best = null;
    h.dates.forEach((d, i) => { if (d >= '2021-01-01' && h.values[i] != null && (!best || h.values[i] > best.v)) best = { d, v: h.values[i] }; });
    const lastRec = recs.at(-1);
    return best && best.v >= 30 ? `Since 2021 it peaked at ${best.v.toFixed(1)}% (for ${monthYearOf(best.d)}); the latest NBER recession in this data ended ${lastRec ? mY(lastRec.to) : '—'}.` : '';
  })();
  const LIMITS = {
    s10y3m: trackSummary(t3m, 'curve') + ' The curve has often turned positive again before a recession began.',
    s10y2y: trackSummary(t2y, 'curve') + ' Lead times vary widely, so an inversion says little about timing.',
    sahm: trackSummary(tS, 'sahm') + ' It is based on the unemployment rate, which can rise for reasons other than layoffs, such as more people looking for work.',
    claims: 'Only people who file for benefits are counted, and weekly counts swing with holidays and storms. The 10% and 20% thresholds are a simple rule of thumb, not an official signal.',
    credit: 'Spreads usually widen as stress appears rather than long before it, so they describe current conditions more than they anticipate them. The high-yield history here is only 3 years; the status uses the Baa spread since 1986.',
    nfci: 'Designed to describe financial conditions now, not to predict. It is revised as its underlying data arrive.',
    recessionProbability: 'Uses only the 10Y − 3M spread, so it inherits the curve’s false alarms. ' + probPeak,
  };
  const rows = rw.items.map(i => ({ ...i, what: WHAT[i.key] || '', limits: LIMITS[i.key] || '' }));
  const cols = [
    { key: 'label', label: 'Indicator', sortable: false, fmt: (v, r) => `<b class="mw-name">${esc(v)}</b><span class="mw-what">${esc(r.what)}</span>` },
    { key: 'latest', label: 'Reading', type: 'num', sortable: false, fmt: (v, r) => `<div class="mw-read">${readingOf(r)}</div>` },
    { key: 'rule', label: 'Rule', sortable: false, fmt: v => `<span class="mw-rule">${esc(v)}</span>` },
    { key: 'status', label: 'Status', sortable: false, fmt: v => chip(v) },
    { key: 'limits', label: 'Track record & limits', sortable: false, fmt: v => `<span class="mw-lim">${esc(v)}</span>` },
  ];
  if (!tbl) tbl = dataTable(el, { columns: cols, rows, label: 'Recession watch indicators' });
  else tbl.update(rows);
  const asOf = rw.meta?.asOf;
  document.getElementById('pWatch-f').innerHTML = `<span class="mp-muted">${esc(rw.meta?.note || '')}</span>`;
  badge('pWatch', { label: `rules applied ${etStamp(D.generatedAt)}`, stale: !!rw.meta?.stale });

  // NY Fed probability chart (plotted at the target month)
  const h = prob?.history;
  if (prob && h?.dates?.length && prob.meta?.ok !== false) {
    const data = h.dates.map((d, i) => ({ t: parseDay(d), v: h.values[i] }));
    const today = new Date();
    const future = data.at(-1).t > today ? [{ from: today, to: data.at(-1).t, label: 'Target month still ahead', color: 'rgba(255,176,0,.06)' }] : [];
    renderLines(D, 'pProb', {
      lines: [{ id: 'prob', label: 'Recession probability 12 months ahead', color: '#ffb000', data, fmt: v => v.toFixed(1) + '%', area: true }],
      refs: [{ v: 30, label: '30% watch', color: 'var(--ink-3)' }, { v: 50, label: '50% warning', color: 'var(--ink-3)' }],
      yFmt: v => v + '%', yDomain: [0, 100], bands: future, height: 260, legend: false, tipFreq: 'M',
      foot: RECESSION_KEY + '<span class="mp-key"><i class="mp-key-fut"></i>Months still ahead</span>',
    });
    badge('pProb', { label: `latest for ${monthYearOf(prob.forMonth)} · from ${monthYearOf(prob.basedOnSpreadMonth)} data`, source: 'Federal Reserve Bank of New York', stale: !!prob.meta?.stale });
  } else {
    document.getElementById('pProb-c').innerHTML = '<div class="state state-error"><div class="state-t">NY Fed model data is not available</div></div>';
    badge('pProb', { label: 'unavailable', error: 'not available', source: 'Federal Reserve Bank of New York' });
  }

  // Track record list
  const epRow = (when, detail, rec) => `<li><span class="tr-when">${when}</span><span class="tr-d">${detail}</span>${rec === true ? '<span class="tr-r yes">Recession</span>' : rec === false ? '<span class="tr-r no">None</span>' : '<span class="tr-r pend">Too recent</span>'}</li>`;
  const curveList = (t, name) => !t ? '' : `<h4>${name} inversions <small>${t.eps.length}</small></h4><ul class="tr-list">${t.eps.slice().reverse().map(e =>
    epRow(`${mY(e.start)}`, `${e.months} months inverted${e.during ? ' · during a recession' : e.lead != null ? ` · recession ${e.lead} mo later` : ''}`, e.rec ? true : e.recent ? null : false)).join('')}</ul>`;
  const sahmList = !tS ? '' : `<h4>Sahm rule at 0.50+ <small>${tS.eps.length}</small></h4><ul class="tr-list">${tS.eps.slice().reverse().map(e =>
    epRow(mY(e.start), `first reading ${e.v.toFixed(2)} pp`, e.rec ? true : e.recent ? null : false)).join('')}</ul>`;
  document.getElementById('trackRec').innerHTML = sahmList + curveList(t3m, '10Y − 3M') + curveList(t2y, '10Y − 2Y');
  badge('pTrack', { label: `NBER dates to ${monthYearOf(D.raw.recessions?.meta?.asOf)}` });
}
