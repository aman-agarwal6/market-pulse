// Fed path: what 30-day fed funds futures imply for the average policy rate in
// each coming month, against today's effective rate and target range.
import { panelHTML, dataTable, esc } from '../../ui.js';
import { fedPathChart, fmtBp, fmtMoves, r2 } from './charts.js';
import { badge } from './panel.js';
import { BP } from './notes.js';

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLong = ym => MONTH[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
const monthShort = ym => MONTH[+ym.slice(5, 7) - 1].slice(0, 3) + ' ' + ym.slice(0, 4);
const dayLong = d => `${MONTH[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}`;
const half = r => { const w = Math.floor(r), h = r - w >= 0.5; return w === 0 ? (h ? '½ of a' : '0') : w + (h ? '½' : ''); };

/** fedRead(D) → { sentence, months, last, next } or null when futures are unavailable. */
export function fedRead(D) {
  const fp = D.raw.fedPath;
  if (!fp || fp.meta?.ok === false) return null;
  const valid = (fp.months || []).filter(m => m.impliedRatePct != null && m.moves25bpPriced != null);
  if (!valid.length) return null;
  const last = valid.at(-1);
  const n = last.moves25bpPriced;
  const r = Math.round(Math.abs(n) * 2) / 2;
  const what = r === 0 ? 'roughly no change in the policy rate'
    : `roughly ${half(r)} quarter-point ${n > 0 ? 'hike' : 'cut'}${r > 1 ? 's' : ''}`;
  return {
    last, next: D.raw.fomc?.next || null, valid,
    sentence: `Fed funds futures price ${what} by ${monthLong(last.month)} (an average of ${r2(last.impliedRatePct)}% for that month, ${fmtBp(last.changeVsEffectiveBp)} vs today’s effective rate).`,
  };
}

const INFO = `Fed funds futures are contracts traders use to bet on, or protect against, changes in the Fed’s policy rate. Each contract settles on the average effective fed funds rate over one calendar month, so 100 minus its price is the market’s expected average rate for that month.

The amber steps show those implied monthly averages. The shaded band is the Fed’s current target range and the dashed line is today’s effective rate. Triangles mark scheduled FOMC (Federal Open Market Committee) decision days; filled ones come with new economic projections.

“25 bp moves priced” divides the gap from today’s effective rate by 0.25: +1 means the average for that month is a full quarter point higher, −1 a quarter point lower.

Months are averages, not per-meeting odds: a decision late in a month only affects the days after it, so that month only partly reflects it. Prices include risk premiums and change every day; this shows what is priced now, not what the Fed will do. ${BP}`;

export const fedPathHTML = () => `
${panelHTML({ id: 'pFedPath', span: 8, title: 'Fed Path', sub: 'Policy rate implied by 30-day fed funds futures · monthly averages', cls: 'mpanel',
  note: 'Where futures prices put the Fed’s policy rate, month by month, compared with today.',
  info: INFO,
  body: '<div class="fp-read" id="fpRead"></div><div class="mchart-box" id="pFedPath-c" style="min-height:300px"></div><p class="mp-caveat">Each step is the futures-implied <b>average</b> rate for a calendar month, not a probability for a single meeting. Quotes may be delayed.</p>',
  footer: '<span class="mp-foot" id="pFedPath-f"></span>',
  source: { source: 'CBOT fed funds futures via Yahoo', label: 'loading' } })}
${panelHTML({ id: 'pFedTable', span: 4, title: 'Futures by Month', sub: 'Implied average effective rate · change vs today', cls: 'mpanel fit', bodyId: 'fedTable', bodyCls: 'scroll-y',
  note: 'The numbers behind the steps, one futures contract per month.',
  info: 'Each row is one 30-day fed funds futures contract. “Implied” is 100 minus the contract price: the expected average effective rate for that calendar month. “vs eff.” is the gap from today’s effective rate in basis points (bp, 0.01 percentage point). “Moves” expresses that gap in quarter-point (25 bp) steps. ◆ marks a month with a scheduled FOMC decision.',
  source: { source: 'CBOT via Yahoo', label: 'loading' } })}`;

let table = null;
export function renderFedPath(D) {
  const fp = D.raw.fedPath;
  const read = document.getElementById('fpRead');
  if (!fp || fp.meta?.ok === false) {
    read.innerHTML = '';
    document.getElementById('pFedPath-c').innerHTML = `<div class="state state-error">${'<div class="state-t">Futures quotes are not available</div>'}<p class="state-m">${esc(fp?.meta?.error || 'The futures feed did not load.')} The rest of this page is unaffected.</p></div>`;
    badge('pFedPath', { label: 'unavailable', error: 'not available' });
    document.getElementById('fedTable').innerHTML = '';
    badge('pFedTable', { label: 'unavailable', error: 'not available' });
    return;
  }
  const r = fedRead(D);
  const next = D.raw.fomc?.meta?.ok === false ? null : D.raw.fomc?.next;
  const nextRow = next && fp.months.find(m => m.month === next.end.slice(0, 7));
  const days = next ? Math.round((Date.parse(next.end + 'T19:00:00Z') - Date.now()) / 86400e3) : null;
  read.innerHTML = `
    <div class="fp-now">
      <div><span>Target range</span><b>${fp.targetRange ? `${fp.targetRange.low.toFixed(2)}–${fp.targetRange.high.toFixed(2)}%` : '—'}</b></div>
      <div><span>Effective rate</span><b>${fp.effectiveRatePct?.toFixed(2) ?? '—'}%</b></div>
      ${next ? `<div><span>Next FOMC decision</span><b>${dayLong(next.end).replace(/, \d{4}$/, '')}</b><em>${days > 1 ? `in ${days} days` : days === 1 ? 'tomorrow' : days === 0 ? 'today' : ''} · 2:00 pm ET${next.sep ? ' · with projections' : ''}</em></div>` : ''}
      ${nextRow?.impliedRatePct != null ? `<div><span>${monthShort(nextRow.month)} implied avg</span><b>${r2(nextRow.impliedRatePct)}%</b><em>${fmtBp(nextRow.changeVsEffectiveBp)} vs effective</em></div>` : ''}
    </div>
    ${r ? `<p class="fp-line">${esc(r.sentence)}</p>` : '<p class="fp-line">No complete futures quotes to summarise.</p>'}`;
  fedPathChart(document.getElementById('pFedPath-c'), {
    months: fp.months, effective: fp.effectiveRatePct, range: fp.targetRange,
    meetings: D.raw.fomc?.meta?.ok === false ? [] : D.raw.fomc?.upcoming || [], height: 270,
  });
  const qt = fp.months.map(m => m.quoteTime).filter(Boolean).sort().at(-1);
  const qLabel = qt ? 'quotes to ' + new Date(qt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ET' : '';
  badge('pFedPath', { label: qLabel + (fp.targetRange ? ` · target range ${fp.targetRange.date}` : ''), stale: !!fp.meta?.stale });
  badge('pFedTable', { label: qLabel, stale: !!fp.meta?.stale });
  const bad = fp.months.filter(m => m.impliedRatePct == null);
  document.getElementById('pFedPath-f').innerHTML = bad.length ? `<span class="mp-warn">No usable quote for ${bad.map(m => monthShort(m.month)).join(', ')}${bad[0].reason ? ` (${esc(bad[0].reason)})` : ''}.</span>` : '';

  const meetMonths = new Set((D.raw.fomc?.upcoming || []).map(m => m.end.slice(0, 7)));
  const rows = fp.months.map(m => ({ ...m, fomc: meetMonths.has(m.month) }));
  const cols = [
    { key: 'month', label: 'Month', sortable: false, fmt: (v, row) => `${monthShort(v)}${row.fomc ? ' <span class="fp-dia" title="Scheduled FOMC decision this month">◆</span>' : ''}` },
    { key: 'impliedRatePct', label: 'Implied', type: 'num', sortable: false, fmt: v => v == null ? '—' : v.toFixed(3) + '%' },
    { key: 'changeVsEffectiveBp', label: 'vs eff.', type: 'num', sortable: false, fmt: v => fmtBp(v) },
    { key: 'moves25bpPriced', label: 'Moves', type: 'num', sortable: false, title: 'Quarter-point (25 bp) moves priced vs today’s effective rate', fmt: v => fmtMoves(v) },
  ];
  if (!table || !document.getElementById('fedTable').contains(table.el.firstElementChild)) table = dataTable(document.getElementById('fedTable'), { columns: cols, rows, label: 'Fed funds futures by month' });
  else table.update(rows);
}
