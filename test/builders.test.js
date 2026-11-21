// Payload builders (pure parts of longterm / macro / etfs / company / fundamentals).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldLive, buildCurrent, buildEpisodes, buildWhatNext } from '../src/longterm.js';
import {
  applyTransform, downsample, summarizeSeries, recessionPeriods, monthlyAverage, inversionEpisodes, currentNegativeRun,
  fedFuturesSymbols, impliedFedPath, yoyWithInterpolatedBase,
} from '../src/macro.js';
import { foldLiveAdj, annualizedTrailing, fundStats, monthlyReturns, correlationMatrix } from '../src/etfs.js';
import { alignFinancials } from '../src/company.js';
import { riskStats, ratingScore } from '../src/fundamentals.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Synthetic index: rises to 200 in 2001, falls 30%, recovers in 2005.
const days = ['2000-01-03', '2001-01-02', '2001-06-01', '2002-01-02', '2003-01-02', '2005-01-03', '2006-01-03', '2011-01-03', '2012-01-03'];
const px = [100, 200, 180, 140, 150, 210, 220, 300, 330];

test('foldLive replaces today or appends a new day', () => {
  const s = { dates: ['2026-11-19', '2026-11-20'], close: [10, 11] };
  const sameDay = Date.parse('2026-11-20T20:00:00Z') / 1000;
  assert.deepEqual(foldLive(s, { regularMarketPrice: 12, regularMarketTime: sameDay }).close, [10, 12]);
  const nextDay = Date.parse('2026-11-23T15:00:00Z') / 1000;
  const f = foldLive(s, { regularMarketPrice: 13, regularMarketTime: nextDay });
  assert.deepEqual(f.dates, ['2026-11-19', '2026-11-20', '2026-11-23']);
  assert.equal(foldLive(s, null).live, false);
});

test('buildCurrent: ATH, drawdown, thresholds crossed', () => {
  const c = buildCurrent({ dates: ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-06'], close: [100, 120, 90, 102] });
  assert.equal(c.allTimeHigh, 120);
  assert.equal(c.allTimeHighDate, '2020-01-02');
  assert.equal(c.drawdownPct, -15);
  assert.deepEqual(c.thresholdsCrossedNow, [5, 10, 15]);
  assert.deepEqual(c.thresholdsCrossedThisEpisode, [5, 10, 15, 20]); // low 90 = -25%
  assert.equal(c.episodeLowPct, -25);
  assert.equal(c.tradingDaysSinceHigh, 2);
  assert.equal(c.calendarDaysSinceHigh, 4);
});

test('buildEpisodes reports depth, durations and recovery', () => {
  const e = buildEpisodes({ dates: days, close: px }, 0.10);
  assert.equal(e.length, 1);
  assert.equal(e[0].peakDate, '2001-01-02');
  assert.equal(e[0].troughDate, '2002-01-02');
  assert.equal(e[0].depthPct, -30);
  assert.equal(e[0].tradingDaysPeakToTrough, 2);
  assert.equal(e[0].recoveryDate, '2005-01-03');
  assert.equal(e[0].calendarDaysTroughToRecovery, 1097);
  assert.equal(e[0].ongoing, false);
  assert.equal(e[0].pre1950, false);
});

test('buildWhatNext: first crossing per threshold with forward returns', () => {
  const w = buildWhatNext({ dates: days, close: px });
  const t10 = w.find(x => x.thresholdPct === 10);
  // 180 / 200 = exactly -10% -> the crossing is 2001-06-01
  assert.equal(t10.events.length, 1);
  assert.equal(t10.events[0].date, '2001-06-01');
  assert.equal(t10.events[0].peakDate, '2001-01-02');
  // +1y: first close on/after 2002-06-01 is 2003-01-02 (150) -> 150/180 - 1
  assert.equal(t10.events[0].fwd[1], -16.67);
  // +10y: first close on/after 2011-06-01 is 2012-01-03 (330)
  assert.equal(t10.events[0].fwd[10], 83.33);
  assert.equal(t10.summary.all[1].count, 1);
  assert.equal(t10.summary.all[1].pctPositive, 0);
  const t20 = w.find(x => x.thresholdPct === 20);
  assert.equal(t20.events[0].date, '2002-01-02'); // 140 = -30%
  assert.equal(w.find(x => x.thresholdPct === 30).events.length, 1);
  // 2005 recovery then no new 5% decline
  assert.equal(w.find(x => x.thresholdPct === 5).events.length, 1);
});

test('macro transforms and summaries', () => {
  const s = { dates: ['2024-01-01', '2024-02-01', '2025-01-01', '2025-02-01'], values: [100, 102, 103, 104.04] };
  const y = applyTransform(s, 'yoy');
  assert.deepEqual(y.dates, ['2025-01-01', '2025-02-01']);
  close(y.values[1], 2);
  const d = applyTransform(s, 'diff');
  assert.deepEqual(d.values.map(v => Math.round(v * 100) / 100), [2, 1, 1.04]);
  const sum = summarizeSeries(s.dates, s.values);
  assert.equal(sum.latest.value, 104.04);
  assert.equal(sum.previous.value, 103);
  assert.equal(sum.yearAgo.date, '2024-02-01');
  close(sum.changeFromYearAgo, 2.04);
  assert.equal(sum.percentile, 87.5);
});

test('yoyWithInterpolatedBase fills a missing year-ago month', () => {
  const raw = { dates: ['2025-09-01', '2025-11-01', '2026-10-01'], values: [100, 121, 121] };
  const est = yoyWithInterpolatedBase(raw, { dates: [], values: [] });
  close(est.value, 10); // base sqrt(100*121) = 110
  assert.equal(est.estimated, true);
  assert.equal(yoyWithInterpolatedBase(raw, { dates: ['2026-10-01'], values: [1] }), null);
});

test('downsample keeps recent daily data, weekly before', () => {
  const dates = [], values = [];
  for (let t = Date.UTC(2020, 0, 6); t <= Date.UTC(2026, 0, 30); t += 864e5) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    dates.push(d.toISOString().slice(0, 10)); values.push(1);
  }
  const ds = downsample(dates, values, 'D');
  const cut = ds.dates.findIndex(d => d >= '2024-01-30');
  assert.ok(cut > 0 && cut < 230); // ~4 years of weekly points
  assert.equal(ds.dates.length - cut, dates.length - dates.findIndex(d => d >= '2024-01-30'));
});

test('recessionPeriods, monthly averages, inversion episodes', () => {
  assert.deepEqual(recessionPeriods(['a', 'b', 'c', 'd', 'e'], [0, 1, 1, 0, 1]), [
    { start: 'b', end: 'c', ongoing: false }, { start: 'e', end: 'e', ongoing: true },
  ]);
  assert.deepEqual(monthlyAverage(['2024-01-02', '2024-01-03', '2024-02-01'], [1, 3, 5]), { dates: ['2024-01-01', '2024-02-01'], values: [2, 5] });
  const ep = inversionEpisodes(['m1', 'm2', 'm3', 'm4', 'm5'], [0.2, -0.1, -0.5, 0.1, -0.2]);
  assert.deepEqual(ep, [
    { start: 'm2', end: 'm3', months: 2, deepest: -0.5, ongoing: false },
    { start: 'm5', end: null, months: 1, deepest: -0.2, ongoing: true },
  ]);
  assert.deepEqual(currentNegativeRun(['a', 'b', 'c'], [0.1, -0.1, -0.2]), { start: 'b', observations: 2 });
  assert.equal(currentNegativeRun(['a'], [0.1]), null);
});

test('fed funds futures symbols and implied path', () => {
  const syms = fedFuturesSymbols(new Date(Date.UTC(2026, 10, 20)), 3);
  assert.deepEqual(syms.map(s => s.symbol), ['ZQX26.CBT', 'ZQZ26.CBT', 'ZQF27.CBT']);
  const now = 1_795_200_000;
  const q = new Map([
    ['ZQX26.CBT', { regularMarketPrice: 96.12, regularMarketTime: now - 60 }],
    ['ZQZ26.CBT', { regularMarketPrice: 95.87, regularMarketTime: now - 60 }],
    ['ZQF27.CBT', { regularMarketPrice: 95.5, regularMarketTime: now - 30 * 86400 }], // stale
  ]);
  const p = impliedFedPath(syms, q, 3.88, now);
  close(p[0].impliedRatePct, 3.88);
  close(p[1].impliedRatePct, 4.13);
  close(p[1].moves25bpPriced, 1);
  assert.equal(p[2].impliedRatePct, null);
  assert.equal(p[2].reason, 'stale quote');
});

test('ETF helpers: live fold, trailing CAGR, stats, correlation', () => {
  const s = { dates: ['2020-01-02', '2021-01-04', '2022-01-03'], close: [100, 110, 100], adj: [90, 105, 100] };
  const f = foldLiveAdj(s, 120, '2022-01-04');
  assert.deepEqual(f.close, [100, 110, 100, 120]);
  close(f.adj[3], 120);
  close(annualizedTrailing(s.dates, s.adj, 1), 100 / 90 - 1); // 2021-01-03 -> 2020-01-02 close
  const st = fundStats(s);
  assert.equal(st.maxDrawdownAll.pct, -4.76);
  assert.equal(st.fromHighPct, -9.09);
  const monthly = new Map([
    ['A', new Map([['2026-08', 0.01], ['2026-09', 0.02], ['2026-10', 0.03]])],
    ['B', new Map([['2026-08', 0.02], ['2026-09', 0.04], ['2026-10', 0.06]])],
  ]);
  const cm = correlationMatrix(['A', 'B'], monthly, '2026-11', 3, 3);
  assert.equal(cm.from, '2026-08');
  assert.deepEqual(cm.r, [[1, 1], [1, 1]]);
  assert.equal(correlationMatrix(['A', 'B'], monthly, '2026-11', 3, 4).r[0][1], null);
  const mr = monthlyReturns({ dates: ['2026-09-30', '2026-10-30', '2026-11-20'], adj: [100, 110, 99] }, '2026-11');
  assert.deepEqual([...mr.keys()], ['2026-10']);
});

test('alignFinancials joins series by date and derives FCF', () => {
  const ts = {
    annualTotalRevenue: [{ date: '2024-12-31', value: 100 }, { date: '2025-12-31', value: 120 }],
    annualOperatingCashFlow: [{ date: '2025-12-31', value: 30 }],
    annualCapitalExpenditure: [{ date: '2025-12-31', value: -10 }],
    annualFreeCashFlow: [{ date: '2024-12-31', value: 15 }],
  };
  const a = alignFinancials(ts, 'annual');
  assert.deepEqual(a.dates, ['2024-12-31', '2025-12-31']);
  assert.deepEqual(a.revenue, [100, 120]);
  assert.deepEqual(a.freeCashFlow, [15, 20]);
  assert.equal(alignFinancials({}, 'annual'), null);
});

test('riskStats: momentum windows and beta', () => {
  const n = 252;
  const t = Array.from({ length: n }, (_, i) => 1_700_000_000 + i * 86400);
  const mkt = { t, c: t.map((_, i) => 100 * (1 + 0.01 * Math.sin(i))) };
  const h = { t, c: mkt.c.map(x => x) };
  const r = riskStats(h, mkt);
  close(r.beta1y, 1, 1e-6);
  close(r.r12_1Pct, Math.round((h.c[n - 22] / h.c[0] - 1) * 1e4) / 100);
  assert.equal(riskStats({ t: [1], c: [1] }, mkt).beta1y, null);
  assert.equal(ratingScore('2.2 - Buy'), 2.2);
  assert.equal(ratingScore(null), null);
});
