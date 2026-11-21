import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGroup, factorRanks } from '../src/factors.js';

const row = (sec, o) => ({ sec, earningsYieldPct: null, fwdEarningsYieldPct: null, fcfYieldPct: null, roePct: null, operatingMarginPct: null, grossMarginPct: null, debtToEquity: null,
  revenueGrowthPct: null, earningsGrowthPct: null, epsFwdGrowthPct: null, r12_1Pct: null, r6_1Pct: null, vol1yPct: null, beta1y: null, ...o });

test('value: average of input ranks, re-ranked; needs 2 inputs', () => {
  const rows = [
    row('A', { earningsYieldPct: 1, fwdEarningsYieldPct: 2 }),  // ranks 0, 0   -> 0
    row('A', { earningsYieldPct: 5, fwdEarningsYieldPct: 6 }),  // ranks 50, 50 -> 50
    row('A', { earningsYieldPct: 9, fwdEarningsYieldPct: 10 }), // ranks 100, 100 -> 100
    row('A', { earningsYieldPct: 20 }),                         // only 1 input -> null
  ];
  // With the 4th row present, earningsYield ranks are 0, 33.3, 66.7, 100.
  const s = scoreGroup(rows);
  assert.deepEqual(s.map(x => x.value), [0, 50, 100, null]);
});

test('low volatility rewards low vol and low beta', () => {
  const rows = [row('A', { vol1yPct: 40, beta1y: 1.5 }), row('A', { vol1yPct: 15, beta1y: 0.5 }), row('A', { vol1yPct: 25, beta1y: 1 })];
  assert.deepEqual(scoreGroup(rows).map(x => x.lowVol), [0, 100, 50]);
});

test('quality skips negative-equity leverage input', () => {
  const rows = [
    row('A', { roePct: 10, operatingMarginPct: 10, debtToEquity: 2 }),
    row('A', { roePct: 20, operatingMarginPct: 20, debtToEquity: 0.5 }),
    row('A', { roePct: 30, operatingMarginPct: 30, debtToEquity: -1 }), // negative D/E ignored
  ];
  const s = scoreGroup(rows);
  assert.deepEqual(s.map(x => x.quality), [0, 50, 100]);
});

test('sector ranks are computed within each sector', () => {
  const rows = [
    row('A', { r12_1Pct: 10 }), row('A', { r12_1Pct: 20 }),
    row('B', { r12_1Pct: 30 }), row('B', { r12_1Pct: 40 }),
  ];
  const r = factorRanks(rows);
  assert.deepEqual(r.map(x => x.index.momentum), [0, 33, 67, 100]);
  assert.deepEqual(r.map(x => x.sector.momentum), [0, 100, 0, 100]);
});
