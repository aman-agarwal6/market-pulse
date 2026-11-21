import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mean, stdev, quantile, median, percentileOf, rankPct, summarize, cagr, periodReturns, annualizedVol, correlation, beta,
  drawdownSeries, maxDrawdown, drawdownEpisodes, firstCrossings, addYears, indexOnOrAfter, indexOnOrBefore, forwardReturn,
  trailingReturn, lastPerPeriod, minPerPeriod, weekKey, monthKey, daysBetween, rollingAnnualized, yoyMonthly, movingAverage, simulateDCA,
} from '../src/stats.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('mean / stdev / quantile / median', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.equal(mean([]), null);
  close(stdev([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7)); // sample stdev
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  close(quantile([10, 20, 30, 40, 50], 0.1), 14); // h = 0.4 -> 10 + 0.4*10
  assert.equal(median([5, 1, 3, null, NaN]), 3);
});

test('percentileOf counts ties as half', () => {
  assert.equal(percentileOf([1, 2, 3, 4], 3), 62.5); // 2 below + 0.5 -> 2.5/4
  assert.equal(percentileOf([1, 2, 3, 4], 0), 0);
  assert.equal(percentileOf([1, 2, 3, 4], 9), 100);
});

test('rankPct: 0..100, ties averaged, nulls kept', () => {
  assert.deepEqual(rankPct([10, 30, 20]), [0, 100, 50]);
  assert.deepEqual(rankPct([1, 1, 3]), [25, 25, 100]);
  assert.deepEqual(rankPct([null, 5, 7]), [null, 0, 100]);
  assert.deepEqual(rankPct([null, 4]), [null, 50]);
});

test('summarize', () => {
  const s = summarize([0.1, -0.2, 0.3, null]);
  assert.equal(s.count, 3);
  close(s.mean, 0.2 / 3);
  assert.equal(s.median, 0.1);
  assert.equal(s.min, -0.2);
  assert.equal(s.max, 0.3);
  close(s.pctPositive, 200 / 3);
});

test('cagr, returns, vol', () => {
  close(cagr(100, 121, 2), 0.1);
  assert.equal(cagr(0, 10, 1), null);
  assert.deepEqual(periodReturns([100, 110, 99]).map(x => Math.round(x * 1e6) / 1e6), [0.1, -0.1]);
  close(annualizedVol([0.01, -0.01, 0.01, -0.01], 252), stdev([0.01, -0.01, 0.01, -0.01]) * Math.sqrt(252));
});

test('correlation and beta', () => {
  assert.equal(correlation([1, 2, 3, 4], [2, 4, 6, 8]).r, 1);
  close(correlation([1, 2, 3, 4], [4, 3, 2, 1]).r, -1);
  assert.equal(correlation([1, 2, null, 4], [1, 2, 3, 4]).n, 3);
  const m = Array.from({ length: 30 }, (_, i) => (i % 5) / 100 - 0.02);
  close(beta(m.map(x => 2 * x), m), 2);
});

test('drawdownSeries and maxDrawdown', () => {
  const v = [100, 120, 90, 130, 65, 140];
  const dd = drawdownSeries(v);
  close(dd[2], -0.25);
  close(dd[4], -0.5);
  assert.equal(dd[5], 0);
  assert.deepEqual(maxDrawdown(v), { depth: -0.5, peak: 3, trough: 4 });
});

test('drawdownEpisodes: peak -> trough -> recovery, ongoing last', () => {
  //            0    1    2   3    4    5   6    7    8
  const v = [100, 120, 108, 96, 125, 130, 91, 100, 104];
  const eps = drawdownEpisodes(v, 0.10);
  assert.equal(eps.length, 2);
  // 120 -> 96 (-20%), recovered at index 4 (125 >= 120)
  assert.deepEqual({ ...eps[0], depth: Math.round(eps[0].depth * 1e6) / 1e6 }, { peak: 1, trough: 3, recovery: 4, depth: -0.2 });
  // 130 -> 91 (-30%), not recovered
  assert.equal(eps[1].peak, 5);
  assert.equal(eps[1].trough, 6);
  assert.equal(eps[1].recovery, null);
  close(eps[1].depth, -0.3);
  // a 10% threshold excludes a 5% dip
  assert.equal(drawdownEpisodes([100, 95, 101], 0.10).length, 0);
  assert.equal(drawdownEpisodes([100, 95, 101], 0.05).length, 1);
});

test('firstCrossings: one event per episode per threshold', () => {
  const v = [100, 94, 89, 92, 85, 101, 95, 110];
  const c = firstCrossings(v, [0.05, 0.10, 0.15]);
  assert.deepEqual(c[0.05].map(x => x.i), [1, 6]); // 100 -> 94 (-6%), then 101 -> 95 (-5.9%)
  assert.deepEqual(c[0.10].map(x => x.i), [2]);    // 89 = -11%
  assert.deepEqual(c[0.15].map(x => x.i), [4]);    // 85 = -15%
  assert.equal(c[0.05][1].peak, 5);
});

test('date helpers', () => {
  assert.equal(addYears('2020-02-29', 1), '2021-02-28');
  assert.equal(addYears('2020-03-15', -10), '2010-03-15');
  const d = ['2020-01-02', '2020-01-03', '2020-01-06'];
  assert.equal(indexOnOrAfter(d, '2020-01-04'), 2);
  assert.equal(indexOnOrAfter(d, '2020-01-07'), -1);
  assert.equal(indexOnOrBefore(d, '2020-01-05'), 1);
  assert.equal(indexOnOrBefore(d, '2019-12-31'), -1);
  assert.equal(weekKey('2024-01-03'), '2024-01-01'); // Wednesday -> Monday
  assert.equal(weekKey('2024-01-07'), '2024-01-01'); // Sunday belongs to the same week
  assert.equal(monthKey('2024-01-31'), '2024-01');
  assert.equal(daysBetween('2024-01-01', '2024-03-01'), 60);
});

test('forwardReturn / trailingReturn use calendar years', () => {
  const dates = ['2000-01-03', '2000-06-01', '2001-01-02', '2001-01-05', '2002-01-03'];
  const v = [100, 90, 110, 120, 150];
  close(forwardReturn(dates, v, 0, 1), 0.2);    // first close on/after 2001-01-03 is 2001-01-05 (120)
  close(forwardReturn(dates, v, 0, 2), 0.5);
  assert.equal(forwardReturn(dates, v, 0, 3), null);
});

test('trailingReturn picks the last close on/before the start date', () => {
  const dates = ['2000-01-03', '2000-06-01', '2001-01-02', '2001-01-05', '2002-01-03'];
  const v = [100, 90, 110, 120, 150];
  close(trailingReturn(dates, v, 1), 150 / 110 - 1); // 2001-01-03 -> 2001-01-02
  assert.equal(trailingReturn(dates, v, 5), null);
});

test('lastPerPeriod / minPerPeriod', () => {
  const d = ['2024-01-02', '2024-01-31', '2024-02-01', '2024-02-29'];
  assert.deepEqual(lastPerPeriod(d, [1, 2, 3, 4], monthKey), { dates: ['2024-01-31', '2024-02-29'], values: [2, 4] });
  assert.deepEqual(minPerPeriod(d, [5, 2, 3, 4], monthKey), { dates: ['2024-01-31', '2024-02-29'], values: [2, 3] });
});

test('rollingAnnualized on a monthly series', () => {
  // 25 months doubling every 12 months -> every 1y window = +100%, 2y window = +100%/yr
  const dates = Array.from({ length: 25 }, (_, i) => `20${String(10 + Math.floor(i / 12)).padStart(2, '0')}-${String((i % 12) + 1).padStart(2, '0')}-01`);
  const v = dates.map((_, i) => 2 ** (i / 12));
  const r1 = rollingAnnualized(dates, v, 1);
  assert.equal(r1.windows, 13);
  close(r1.median, 1);
  assert.equal(r1.pctPositive, 100);
  const r2 = rollingAnnualized(dates, v, 2);
  assert.equal(r2.windows, 1);
  close(r2.worst, 1);
  // one bad window
  const w = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 50, 120];
  const d2 = w.map((_, i) => `2000-${String(i + 1).padStart(2, '0')}-01`);
  const r = rollingAnnualized(d2, w, 1);
  assert.equal(r.windows, 2);
  close(r.worst, -0.5);
  assert.equal(r.worstStart, '2000-01-01');
  close(r.best, 0.2);
  assert.equal(r.pctPositive, 50);
});

test('yoyMonthly matches same month a year earlier only', () => {
  const d = ['2023-01-01', '2023-02-01', '2024-01-01', '2024-03-01'];
  const r = yoyMonthly(d, [100, 101, 103, 104]);
  assert.deepEqual(r.dates, ['2024-01-01']);
  close(r.values[0], 3);
});

test('movingAverage', () => {
  const r = movingAverage(['a', 'b', 'c', 'd'], [1, 2, 3, 6], 2);
  assert.deepEqual(r, { dates: ['b', 'c', 'd'], values: [1.5, 2.5, 4.5] });
});

test('simulateDCA', () => {
  const dates = ['2020-01-02', '2020-02-03', '2020-03-02'];
  const prices = [10, 5, 20];
  const r = simulateDCA(dates, prices, ['2020-01-01', '2020-02-01'], 100);
  // 10 units + 20 units = 30 units x 20 = 600 on 200 invested
  assert.equal(r.buys, 2);
  assert.equal(r.invested, 200);
  close(r.value, 600);
  close(r.returnPct, 200);
});
