// "State of the economy": a few descriptive lines built by fixed rules from
// the same numbers the tiles show. No forecasts, no advice. Each line names
// the tile (or section) it comes from so the reader can check it.
import { series } from './data.js';
import { fmtVal, period, monthYearOf } from './fmt.js';
import { fedRead } from './fed.js';

const cmp = (a, b, eps) => (a - b > eps ? 'higher than' : b - a > eps ? 'lower than' : 'about the same as');
const fullMonth = s => period(s.latest.date, s.freq, { long: true });

export function summaryLines(D) {
  const out = [];

  // 1. Inflation
  const cpi = series('cpi'), cpce = series('corePce');
  if (cpi?.latest && cpi.yearAgo) {
    const v = cpi.latest.value, goal = v > 2.05 ? 'above' : v < 1.95 ? 'below' : 'at';
    let t = `Inflation (CPI) was <b>${fmtVal('cpi', v)}</b> over the 12 months to ${fullMonth(cpi)}, ${goal} the Fed’s 2% goal and ${cmp(+v.toFixed(1), +cpi.yearAgo.value.toFixed(1), 0.05)} a year earlier (${fmtVal('cpi', cpi.yearAgo.value)}).`;
    if (cpce?.latest) t += ` Core PCE, the Fed’s preferred gauge, was <b>${fmtVal('corePce', cpce.latest.value)}</b> (${period(cpce.latest.date, 'M')}).`;
    out.push({ tag: 'Inflation', key: 'cpi', html: t });
  }

  // 2. Policy rate and what futures price
  const ff = series('fedFunds');
  const tr = ff?.extra?.targetRange;
  if (ff?.latest) {
    let t = tr ? `The Fed’s target range is <b>${tr.low.toFixed(2)}–${tr.high.toFixed(2)}%</b> (effective rate ${fmtVal('fedFunds', ff.latest.value)}).` : `The effective fed funds rate is <b>${fmtVal('fedFunds', ff.latest.value)}</b>.`;
    const r = fedRead(D);
    if (r) t += ' ' + r.sentence;
    out.push({ tag: 'Fed', key: 'fedFunds', section: 'inflation', html: t });
  }

  // 3. Jobs
  const ur = series('unemployment'), pay = series('payrolls');
  if (ur?.latest) {
    let t = `Unemployment was <b>${fmtVal('unemployment', ur.latest.value)}</b> in ${fullMonth(ur)}`;
    if (ur.yearAgo) t += `, ${cmp(ur.latest.value, ur.yearAgo.value, 0.05)} a year earlier (${fmtVal('unemployment', ur.yearAgo.value)} in ${monthYearOf(ur.yearAgo.date)})`;
    t += '.';
    if (pay?.latest) {
      const n = Math.round(pay.latest.value) * 1000;
      t += ` Employers ${n >= 0 ? 'added' : 'cut'} <b>${Math.abs(n).toLocaleString('en-US')}</b> jobs in ${period(pay.latest.date, 'M', { long: true }).split(' ')[0]}`;
      if (pay.extra?.avg3m != null) t += `; the 3-month average is ${(Math.round(pay.extra.avg3m) * 1000).toLocaleString('en-US')}`;
      t += '.';
    }
    out.push({ tag: 'Jobs', key: 'unemployment', html: t });
  }

  // 4. Growth
  const gdp = series('gdp');
  if (gdp?.latest) {
    const v = gdp.latest.value;
    let t = `Real GDP ${v >= 0 ? 'grew' : 'shrank'} at a <b>${fmtVal('gdp', Math.abs(v))}</b> annual rate in ${period(gdp.latest.date, 'Q')}`;
    if (gdp.previous) t += `, ${gdp.latest.value > gdp.previous.value + 0.05 ? 'faster than' : gdp.latest.value < gdp.previous.value - 0.05 ? 'slower than' : 'about the same pace as'} in ${period(gdp.previous.date, 'Q')} (${fmtVal('gdp', gdp.previous.value)})`;
    out.push({ tag: 'Growth', key: 'gdp', html: t + '.' });
  }

  // 5. Readings near the edge of their own history
  const ext = [];
  for (const s of D.series) {
    if (s.meta?.ok === false || s.percentile == null || s.key === 'hySpread') continue;
    if (s.percentile >= 95) ext.push({ s, hi: true });
    else if (s.percentile <= 5) ext.push({ s, hi: false });
  }
  if (ext.length) {
    const parts = ext.slice(0, 3).map(({ s, hi }) => {
      const p = hi ? s.percentile : 100 - s.percentile;
      const share = (p > 99 ? p.toFixed(1) : Math.round(p)) + '%';
      return `${s.title.replace(/ \(.*\)$/, '').toLowerCase().replace(/^(\w)/, c => c.toUpperCase())} at ${fmtVal(s.key, s.latest.value)} is ${hi ? 'higher' : 'lower'} than ${share} of readings since ${s.percentileSince.slice(0, 4)}`;
    });
    out.push({ tag: 'Extremes', key: ext[0].s.key, html: parts.join('; ') + '.' });
  }

  // 6. Recession watch tally, with the yield curve
  const items = [...D.watch.values()];
  if (items.length && D.raw.recessionWatch?.meta?.ok !== false) {
    const by = st => items.filter(i => i.status === st);
    const warn = by('warning'), watch = by('watch'), ok = by('ok'), unk = by('unknown');
    const name = i => SHORT[i.key] || i.label;
    let t = ok.length === items.length ? `All ${items.length} recession-watch rules read <b>ok</b>`
      : `${ok.length} of ${items.length} recession-watch rules read ok` + (watch.length ? `; <b>watch</b>: ${watch.map(name).join(', ')}` : '') + (warn.length ? `; <b>warning</b>: ${warn.map(name).join(', ')}` : '') + (unk.length ? `; no reading: ${unk.map(name).join(', ')}` : '');
    const c = D.watch.get('s10y3m');
    if (c?.latest != null) t += `. The 10-year yield is ${Math.abs(Math.round(c.latest * 100))} bp ${c.latest >= 0 ? 'above' : 'below'} the 3-month bill (${c.latest >= 0 ? 'not inverted' : 'inverted'})`;
    out.push({ tag: 'Recession watch', section: 'watch', html: t + '.' });
  }
  return out;
}

export const SHORT = { s10y3m: '10Y − 3M curve', s10y2y: '10Y − 2Y curve', sahm: 'Sahm rule', claims: 'jobless claims', credit: 'credit spreads', nfci: 'financial conditions', recessionProbability: 'NY Fed probability' };
