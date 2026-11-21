// Calendar: upcoming US data releases and FOMC decisions, grouped by week,
// with what each release is and where each feed's coverage ends.
import { panelHTML, esc } from '../../ui.js';
import { series } from './data.js';
import { fmtVal, period, etStamp } from './fmt.js';
import { badge } from './panel.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utc = s => new Date(s + 'T00:00:00Z');
const dLabel = d => `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
const etToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

/** What each release is, in a few words, and which tile holds its last reading. */
const KINDS = [
  { re: /^FOMC/, kind: 'fed', what: 'Fed policy decision and statement at 2:00 pm ET; press conference at 2:30 pm.', key: 'fedFunds' },
  { re: /Consumer Price Index/, kind: 'infl', short: 'CPI', what: 'Consumer price inflation for the previous month.', key: 'cpi' },
  { re: /Producer Price Index/, kind: 'infl', short: 'PPI', what: 'Prices businesses receive: an early look at price pressures in the supply chain.' },
  { re: /Employment Situation/, kind: 'jobs', short: 'Jobs report', what: 'Payrolls, the unemployment rate and wages for the previous month.', key: 'unemployment', key2: 'payrolls' },
  { re: /Job Openings/, kind: 'jobs', short: 'JOLTS', what: 'Job openings, hires and quits, about two months back.' },
  { re: /Employment Cost Index/, kind: 'jobs', short: 'ECI', what: 'Quarterly growth in wages and benefits, the Fed’s preferred labour-cost gauge.' },
  { re: /GDP/, kind: 'growth', what: 'Size and growth of the economy; each quarter is estimated three times as more data arrive.', key: 'gdp' },
  { re: /Personal Income and Outlays/, kind: 'infl', what: 'Income, spending and PCE inflation, the measure the Fed’s 2% goal uses.', key: 'corePce' },
];
const kindOf = e => KINDS.find(k => k.re.test(e.title)) || { kind: 'other', what: '' };

function shortTitle(t) {
  let m = /GDP \((\w+) Estimate\).*?(\d)(?:st|nd|rd|th) Quarter(?: and Year)? (\d{4})/.exec(t);
  if (m) return `GDP, Q${m[2]} ${m[3]} · ${m[1].toLowerCase()} estimate`;
  m = /Personal Income and Outlays, (\w+) (\d{4})/.exec(t);
  if (m) return `Personal income & outlays (PCE), ${m[1].slice(0, 3)} ${m[2]}`;
  if (/^FOMC rate decision \+ economic projections/.test(t)) return 'FOMC rate decision + economic projections';
  return t;
}

export const calendarHTML = () => `
<div data-section="calendar">
  <section class="grid">
    ${panelHTML({ id: 'pCal', span: 8, title: 'Economic Calendar', sub: 'Major scheduled US releases and Fed decisions · times US Eastern', cls: 'mpanel', bodyId: 'calList', minH: 420,
      note: 'When the next big economic numbers come out.',
      info: `Each row is a scheduled release from the agency that publishes it: the Bureau of Labor Statistics (BLS: CPI, PPI, the jobs report, JOLTS, ECI), the Bureau of Economic Analysis (BEA: GDP, personal income and PCE inflation) and the Federal Reserve (FOMC decisions).

Most releases come out at 8:30 am ET, before US markets open. “Last” shows the most recent reading of the related indicator on this page, so you can see what the next release will update.

Each feed only lists dates its agency has already published; where a feed ends, a marker shows that later releases are not listed yet. FOMC dates are regularly scheduled meetings only.`,
      footer: '<span class="mp-foot" id="pCal-f"></span>',
      source: { source: 'BLS · BEA · Federal Reserve', label: 'loading' } })}
    <div class="span-4 col-stack">
      ${panelHTML({ id: 'pFomc', title: 'FOMC Meetings', sub: 'Regularly scheduled · decision on the second day', cls: 'mpanel', bodyId: 'fomcList', minH: 200,
        note: 'When the Fed’s rate-setting committee meets.',
        info: 'The Federal Open Market Committee (FOMC) sets the Fed’s policy rate. It holds eight scheduled two-day meetings a year and announces its decision at 2:00 pm ET on the second day. Meetings marked SEP also publish the Summary of Economic Projections: committee members’ forecasts for growth, unemployment, inflation and the policy rate. Unscheduled meetings are possible and would not appear here.',
        source: { source: 'federalreserve.gov', label: 'loading' } })}
      ${panelHTML({ id: 'pCov', title: 'Coverage', sub: 'How far ahead each source publishes', cls: 'mpanel', bodyId: 'covList',
        note: 'Agencies post their schedules in batches, so later dates fill in over time.',
        source: { source: 'Calendar feeds', label: 'loading' } })}
    </div>
  </section>
</div>`;

function lastReading(k) {
  if (!k?.key) return '';
  if (k.key === 'fedFunds') {
    const tr = series('fedFunds')?.extra?.targetRange;
    return tr ? `Target ${tr.low.toFixed(2)}–${tr.high.toFixed(2)}%` : '';
  }
  const s = series(k.key);
  if (!s?.latest) return '';
  let t = `${s.key === 'corePce' ? 'Core PCE' : s.key === 'unemployment' ? 'Unemployment' : s.key === 'gdp' ? 'GDP' : 'CPI'} ${fmtVal(s.key, s.latest.value)} (${period(s.latest.date, s.freq).replace(/ \d{4}$/, '')})`;
  if (k.key2) { const p = series(k.key2); if (p?.latest) t += ` · payrolls ${fmtVal(k.key2, p.latest.value)}`; }
  return t;
}

export function renderCalendar(D) {
  const cal = D.raw.calendar;
  const el = document.getElementById('calList');
  const meta = cal?.meta || {};
  const today = etToday();
  const events = (cal?.events || []).filter(e => e.date >= today).sort((a, b) => (a.date + a.timeET).localeCompare(b.date + b.timeET));
  if (!events.length) {
    el.innerHTML = '<div class="state"><div class="state-t">No upcoming releases listed</div><p class="state-m">The calendar feeds did not return any dates in the next 120 days.</p></div>';
  } else {
    // Feed coverage cut-offs inside the window, shown where they fall.
    const cuts = [['bls', 'BLS', 'CPI, PPI, jobs report, JOLTS and ECI dates'], ['bea', 'BEA', 'GDP and personal income dates']]
      .map(([k, name, what]) => ({ name, what, end: meta[k]?.ok === false ? today : meta[k]?.asOf, ok: meta[k]?.ok !== false }))
      .filter(c => c.end && c.end < events.at(-1).date);
    const items = [...events.map(e => ({ k: e.date + "T" + (e.timeET || "00:00"), e })), ...cuts.map(c => ({ k: c.end + "T99", c }))].sort((x, y) => x.k.localeCompare(y.k));
    const weekOf = s => { const d = utc(s); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    const thisMon = weekOf(today);
    let html = "", open = null;
    const close = () => { if (open) html += "</ul></div>"; open = null; };
    for (const it of items) {
      if (it.c) { close(); html += cutRow(it.c); continue; }
      const e = it.e;
      const wk = weekOf(e.date);
      if (wk !== open) {
        close();
        const w = utc(wk);
        const nWk = Math.round((w - utc(thisMon)) / (7 * 86400e3));
        const rel = nWk === 0 ? "This week" : nWk === 1 ? "Next week" : "";
        html += `<div class="cal-wk"><h4>Week of ${MON[w.getUTCMonth()]} ${w.getUTCDate()}${rel ? ` <small>${rel}</small>` : ""}</h4><ul>`;
        open = wk;
      }
      const k = kindOf(e);
      const d = utc(e.date);
      const days = Math.round((d - utc(today)) / 86400e3);
      const last = lastReading(k);
      html += `<li class="cal-ev k-${k.kind}">
          <span class="cal-d"><b>${dLabel(d)}</b><small>${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</small></span>
          <span class="cal-t">${esc(e.timeET || "—")}<small>ET</small></span>
          <span class="cal-m"><b title="${esc(e.title)}">${esc(shortTitle(e.title))}</b><small>${esc(k.what)}</small></span>
          <span class="cal-l">${last ? `<small>Last</small>${esc(last)}` : ""}</span>
          <span class="cal-s">${esc(e.source)}</span></li>`;
    }
    close();
    el.innerHTML = html;
  }
  const n = events.length;
  document.getElementById('pCal-f').innerHTML = `<span class="mp-muted">${n} releases in the next 120 days. ${esc(cal?.note?.split('. ')[0] || '')}.</span>`;
  const fails = ['bls', 'bea', 'fomc'].filter(k => meta[k]?.ok === false);
  badge('pCal', { label: fails.length ? `${fails.map(f => f.toUpperCase()).join(', ')} feed unavailable` : 'schedules fetched ' + etStamp(meta.bls?.fetchedAt), stale: ['bls', 'bea', 'fomc'].some(k => meta[k]?.stale), error: fails.length === 3 ? 'all feeds failed' : null });

  // FOMC list
  const fomc = D.raw.fomc;
  const fl = document.getElementById('fomcList');
  if (!fomc || fomc.meta?.ok === false) { fl.innerHTML = '<p class="mp-muted">The Fed calendar did not load.</p>'; badge('pFomc', { label: 'unavailable', error: 'not available' }); }
  else {
    fl.innerHTML = `<ul class="fomc-list">${(fomc.upcoming || []).map((m, i) => {
      const s = utc(m.start), e = utc(m.end);
      const days = Math.round((e - utc(today)) / 86400e3);
      return `<li${i === 0 ? ' class="next"' : ''}><span class="fm-d">${MON[s.getUTCMonth()]} ${s.getUTCDate()}–${s.getUTCMonth() === e.getUTCMonth() ? '' : MON[e.getUTCMonth()] + ' '}${e.getUTCDate()}, ${e.getUTCFullYear()}</span>${m.sep ? '<span class="fm-sep" title="Summary of Economic Projections">SEP</span>' : '<span></span>'}<span class="fm-in">${i === 0 ? 'Next · ' : ''}${days >= 0 ? `in ${days} days` : 'held'}</span></li>`;
    }).join('')}</ul>`;
    badge('pFomc', { label: 'fetched ' + etStamp(fomc.meta?.fetchedAt), stale: !!fomc.meta?.stale });
  }

  // Coverage
  const cov = [['bls', 'Bureau of Labor Statistics', 'CPI, PPI, jobs report, JOLTS, ECI'], ['bea', 'Bureau of Economic Analysis', 'GDP, personal income & PCE'], ['fomc', 'Federal Reserve', 'FOMC decisions (scheduled meetings)']];
  document.getElementById('covList').innerHTML = `<ul class="cov-list">${cov.map(([k, name, what]) => {
    const m = meta[k];
    const end = k === 'fomc' ? (fomc?.upcoming?.at(-1)?.end || null) : m?.asOf;
    return `<li class="${m?.ok === false ? 'bad' : ''}"><b>${name}</b><small>${what}</small><span>${m?.ok === false ? 'Feed unavailable' : end ? 'Listed through ' + fmtLong(end) : '—'}${m?.stale ? ' · cached copy' : ''}</span></li>`;
  }).join('')}</ul>`;
  badge('pCov', { label: 'as listed by each agency' });
}
const fmtLong = s => { const d = utc(s); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const cutRow = c => `<div class="cal-cut"><span>${esc(c.name)} schedule published only through ${fmtLong(c.end)}</span><small>Later ${esc(c.what)} are not listed yet.</small></div>`;
