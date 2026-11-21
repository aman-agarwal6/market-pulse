// Long-run monthly S&P data.
//  1. Robert Shiller's monthly dataset as republished by the open
//     "datasets/s-and-p-500" GitHub repo (price, dividends, earnings, CPI,
//     long rate, CAPE back to 1871). Prices there are updated monthly, but
//     dividends/earnings/CAPE stop when Shiller's upstream sheet stops.
//  2. multpl.com monthly tables (Shiller PE and S&P 500 P/E), which follow the
//     same methodology and are current; used only to extend the series past
//     the dataset's last CAPE / earnings month. Overlap is checked.
import { politeFetch } from './net.js';
import { isNum } from './stats.js';

export const SHILLER_URL = 'https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv';
export const MULTPL = {
  cape: 'https://www.multpl.com/shiller-pe/table/by-month',
  pe: 'https://www.multpl.com/s-p-500-pe-ratio/table/by-month',
};

const pos = v => (isNum(v) && v > 0 ? v : null);

/** Parse the datasets/s-and-p-500 CSV. Zeros in that file mean "not available". */
export function parseShillerCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',').map(s => s.trim());
  const col = name => head.indexOf(name);
  const iD = col('Date'), iP = col('SP500'), iDiv = col('Dividend'), iE = col('Earnings'), iC = col('Consumer Price Index'),
    iR = col('Long Interest Rate'), iPE10 = col('PE10');
  if ([iD, iP, iDiv, iE, iC, iR, iPE10].some(i => i < 0)) throw new Error('unexpected Shiller CSV header: ' + lines[0]);
  return lines.slice(1).map(l => {
    const c = l.split(',');
    return {
      date: c[iD].slice(0, 10),
      price: pos(+c[iP]), div: pos(+c[iDiv]), earn: isNum(+c[iE]) && +c[iE] !== 0 ? +c[iE] : null,
      cpi: pos(+c[iC]), rate: pos(+c[iR]), cape: pos(+c[iPE10]),
    };
  }).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.price);
}

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** Parse a multpl "table/by-month" page. Returns ascending [{ date, value, estimate }]. */
export function parseMultplTable(html) {
  const out = [];
  const re = /<tr[^>]*>\s*<td>\s*([A-Z][a-z]{2}) (\d{1,2}), (\d{4})\s*<\/td>\s*<td>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(html))) {
    const cell = m[4];
    const estimate = /title="Estimate"|†/.test(cell);
    const num = parseFloat(cell.replace(/<[^>]+>/g, '').replace(/&#x2002;|&nbsp;|†|%|,/g, '').trim());
    if (!MONTHS[m[1]] || !isNum(num)) continue;
    out.push({ date: `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, '0')}`, value: num, estimate });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function fetchShiller() {
  const rows = parseShillerCSV(await politeFetch(SHILLER_URL));
  if (rows.length < 1500) throw new Error(`Shiller dataset too short (${rows.length} rows)`);
  return rows;
}

export async function fetchMultpl(which) {
  const rows = parseMultplTable(await politeFetch(MULTPL[which]));
  if (rows.length < 1000) throw new Error(`multpl ${which} table too short (${rows.length} rows)`);
  return rows;
}

/** Last date where field is non-null. */
export const lastDateWith = (rows, field) => {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i][field] != null) return rows[i].date;
  return null;
};

/**
 * Monthly valuation series: Shiller values where present, extended with
 * multpl month-start values afterwards (multpl also replaces the last
 * `preferExtLast` Shiller months when it has them). The intra-month latest multpl row (if
 * any) is returned separately as `latest`.
 * Returns { dates, values, ext: [bool per point: from multpl], lastShillerDate,
 *           overlap: { months, maxAbsDiff, meanAbsDiff }, latest }.
 */
export function mergeMonthly(shillerRows, field, multplRows, preferExtLast = 3) {
  const dates = [], values = [], ext = [], estimated = [];
  for (const r of shillerRows) if (r[field] != null) { dates.push(r.date); values.push(r[field]); ext.push(false); estimated.push(false); }
  const lastShiller = dates[dates.length - 1] || null;
  const monthStarts = (multplRows || []).filter(r => r.date.endsWith('-01'));
  // Overlap check over the last 60 Shiller months.
  const byDate = new Map(monthStarts.map(r => [r.date, r.value]));
  const diffs = [];
  for (let i = Math.max(0, dates.length - 60); i < dates.length; i++) {
    const m = byDate.get(dates[i]);
    if (isNum(m)) diffs.push(Math.abs(m - values[i]));
  }
  // The dataset's last few months are often preliminary (partial-month prices); when
  // multpl has those months, its later revision replaces them.
  for (let i = Math.max(0, dates.length - preferExtLast); i < dates.length; i++) {
    const m = monthStarts.find(r => r.date === dates[i]);
    if (m) { values[i] = m.value; ext[i] = true; estimated[i] = !!m.estimate; }
  }
  for (const r of monthStarts) {
    if (lastShiller && r.date <= lastShiller) continue;
    dates.push(r.date); values.push(r.value); ext.push(true); estimated.push(!!r.estimate);
  }
  const last = multplRows?.length ? multplRows[multplRows.length - 1] : null;
  const latest = last && !last.date.endsWith('-01') && (!dates.length || last.date > dates[dates.length - 1]) ? last : null;
  return {
    dates, values, ext, estimated, lastShillerDate: lastShiller, latest,
    overlap: { months: diffs.length, maxAbsDiff: diffs.length ? Math.max(...diffs) : null, meanAbsDiff: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null },
  };
}

/**
 * Real total-return index from Shiller monthly data (dividends reinvested,
 * deflated by CPI), the same construction as Shiller's "real total return
 * price": TR[t] = TR[t-1] * (P[t] + D[t]/12) / P[t-1], real = TR / CPI.
 * D is Shiller's annualized (trailing 12-month) dividend, so D/12 is the
 * month's dividend. Stops at the last month with both D and CPI.
 * Returns { dates, values } (values rebased to 1 at the first month).
 */
export function realTotalReturn(rows) {
  const dates = [], values = [];
  let tr = 1, prev = null;
  for (const r of rows) {
    if (!r.price || !r.div || !r.cpi) break;
    if (prev) tr *= (r.price + r.div / 12) / prev.price;
    dates.push(r.date); values.push(tr / r.cpi);
    prev = r;
  }
  const base = values[0];
  return { dates, values: values.map(v => v / base) };
}
