// Parsers for external sources, using small inline fixtures shaped like the real files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShillerCSV, parseMultplTable, mergeMonthly, realTotalReturn } from '../src/shiller.js';
import { parseFredCSV } from '../src/fred.js';
import { parseICS, parseFOMC, parseNYFed } from '../src/macro.js';
import { plain } from '../src/normalize.js';
import { excelDate } from '../src/xls.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('parseShillerCSV treats zeros as missing', () => {
  const csv = 'Date,SP500,Dividend,Earnings,Consumer Price Index,Long Interest Rate,Real Price,Real Dividend,Real Earnings,PE10\n'
    + '1881-01-01,6.19,0.27,0.49,9.42,3.7,150.9,6.58,11.94,18.47\n'
    + '2026-09-01,7669.41,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0\n';
  const r = parseShillerCSV(csv);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { date: '1881-01-01', price: 6.19, div: 0.27, earn: 0.49, cpi: 9.42, rate: 3.7, cape: 18.47 });
  assert.deepEqual(r[1], { date: '2026-09-01', price: 7669.41, div: null, earn: null, cpi: null, rate: null, cape: null });
});

test('parseMultplTable reads dates, values and estimate marks', () => {
  const html = `<table><tr><th>Date</th><th>Value</th></tr>
    <tr class="odd"><td>Nov 20, 2026</td><td>
    <abbr title="Estimate">†</abbr>
    23.55</td></tr>
    <tr class="even"><td>Nov 1, 2026</td><td>&#x2002;39.82</td></tr>
    <tr class="odd"><td>Oct 31, 2026</td><td>&#x2002;1.06%</td></tr></table>`;
  assert.deepEqual(parseMultplTable(html), [
    { date: '2026-10-31', value: 1.06, estimate: false },
    { date: '2026-11-01', value: 39.82, estimate: false },
    { date: '2026-11-20', value: 23.55, estimate: true },
  ]);
});

test('mergeMonthly extends Shiller with multpl and checks overlap', () => {
  const sh = [
    { date: '2023-07-01', cape: 30 }, { date: '2023-08-01', cape: 31 }, { date: '2023-09-01', cape: 32 },
    { date: '2023-10-01', cape: null },
  ];
  const mu = [
    { date: '2023-07-01', value: 30.1, estimate: false }, { date: '2023-08-01', value: 31, estimate: false },
    { date: '2023-09-01', value: 31.5, estimate: false }, { date: '2023-10-01', value: 29, estimate: false },
    { date: '2023-10-15', value: 28, estimate: true },
  ];
  const m = mergeMonthly(sh, 'cape', mu, 1);
  assert.deepEqual(m.dates, ['2023-07-01', '2023-08-01', '2023-09-01', '2023-10-01']);
  assert.deepEqual(m.values, [30, 31, 31.5, 29]);   // last Shiller month replaced by multpl, then extended
  assert.deepEqual(m.ext, [false, false, true, true]);
  assert.equal(m.lastShillerDate, '2023-09-01');
  assert.equal(m.overlap.months, 3);
  close(m.overlap.maxAbsDiff, 0.5);
  assert.deepEqual(m.latest, { date: '2023-10-15', value: 28, estimate: true });
});

test('realTotalReturn reinvests D/12 and deflates by CPI', () => {
  const rows = [
    { date: '2000-01-01', price: 100, div: 12, cpi: 100 },
    { date: '2000-02-01', price: 100, div: 12, cpi: 100 },  // +1% dividend
    { date: '2000-03-01', price: 110, div: 12, cpi: 110 },  // price +10% + 1% div, CPI +10%
    { date: '2000-04-01', price: 120, div: null, cpi: 120 }, // stops: no dividend data
  ];
  const r = realTotalReturn(rows);
  assert.deepEqual(r.dates, ['2000-01-01', '2000-02-01', '2000-03-01']);
  close(r.values[1], 1.01);
  close(r.values[2], 1.01 * (111 / 100) / 1.1);
});

test('parseFredCSV skips missing values', () => {
  const r = parseFredCSV('observation_date,DGS10\n2026-11-18,5.07\n2026-11-19,.\n2026-11-20,\n2026-11-21,5.04\n');
  assert.deepEqual(r, { dates: ['2026-11-18', '2026-11-21'], values: [5.07, 5.04] });
  assert.throws(() => parseFredCSV('<html>blocked</html>'));
});

test('parseICS handles local-ET and UTC times and escaped commas', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=US-Eastern:20261210T083000\r\nSUMMARY:Consumer Price Index\r\nEND:VEVENT\r\n'
    + 'BEGIN:VEVENT\r\nSUMMARY:Personal Income and Outlays\\, October 2026\r\nDTSTART;VALUE=DATE-TIME:20261125T133000Z\r\nEND:VEVENT\r\n'
    + 'BEGIN:VEVENT\r\nSUMMARY:GDP (Advance Estimate)\\, 4th Quarter and\r\n  Year 2026\r\nDTSTART;VALUE=DATE-TIME:20270128T133000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
  assert.deepEqual(parseICS(ics), [
    { title: 'Consumer Price Index', date: '2026-12-10', timeET: '08:30' },
    { title: 'Personal Income and Outlays, October 2026', date: '2026-11-25', timeET: '08:30' },
    { title: 'GDP (Advance Estimate), 4th Quarter and Year 2026', date: '2027-01-28', timeET: '08:30' },
  ]);
});

test('parseFOMC: scheduled meetings, cross-month dates, SEP flag, skips notation votes', () => {
  const html = `<h4><a id="1">2026 FOMC Meetings</a></h4>
    <div class="fomc-meeting__month col"><strong>January</strong></div><div class="fomc-meeting__date col">27-28</div>
    <div class="fomc-meeting__month col"><strong>Apr/May</strong></div><div class="fomc-meeting__date col">30-1</div>
    <div class="fomc-meeting__month col"><strong>August</strong></div><div class="fomc-meeting__date col">22 (notation vote)</div>
    <div class="fomc-meeting__month col"><strong>December</strong></div><div class="fomc-meeting__date col">8-9*</div>
    <h4><a id="2">2027 FOMC Meetings</a></h4>
    <div class="fomc-meeting__month col"><strong>Dec/Jan</strong></div><div class="fomc-meeting__date col">31-1</div>`;
  assert.deepEqual(parseFOMC(html), [
    { start: '2026-01-27', end: '2026-01-28', sep: false },
    { start: '2026-04-30', end: '2026-05-01', sep: false },
    { start: '2026-12-08', end: '2026-12-09', sep: true },
    { start: '2027-12-31', end: '2028-01-01', sep: false },
  ]);
});

test('parseNYFed: probability in % dated by target month', () => {
  const rows = [
    ['Date', '10 Year Treasury Yield', '3 Month Treasury Yield', '3 Month Treasury Yield (Bond Equivalent Basis)', 'Spread', 'Rec_prob', 'NBER_Rec'],
    [46326, 5.13, 4.05, 4.15, 0.98, 0.265, 0],
    [46691, null, null, null, null, 0.124],
    ...Array.from({ length: 100 }, (_, i) => [20000 + i * 30, 4, 3, 3, 1, 0.2, 0]),
  ];
  const r = parseNYFed(rows);
  assert.equal(r.prob.dates[0], '2026-10-31');
  close(r.prob.values[1], 12.4);
  assert.equal(r.spread.dates.length, 101);
});

test('excelDate converts 1900-system serials', () => {
  assert.equal(excelDate(46326), '2026-10-31');
  assert.equal(excelDate(25569), '1970-01-01');
});

test('plain() unwraps {raw, fmt} recursively', () => {
  assert.deepEqual(plain({ a: { raw: 1.5, fmt: '1.50' }, b: [{ raw: 2, fmt: '2' }], c: {}, d: 'x', e: { f: { raw: null, fmt: null } } }),
    { a: 1.5, b: [2], c: null, d: 'x', e: { f: null } });
});
