import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classCaps, companyKey } from '../src/shareclass.js';
import { computeValuation } from '../src/valuation.js';
import { buildSnapshot } from '../src/engine.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Alphabet-like: both classes report the whole company cap (3000); class shares
// 5 and 4.5 at ~300 -> 1500 + 1350 = 2850 (an unlisted class makes up the rest).
const universe = [
  { s: 'AAA', ys: 'AAA', n: 'Alpha Inc. (Class A)', sec: 'Comm', ind: 'Media' },
  { s: 'AAC', ys: 'AAC', n: 'Alpha Inc. (Class C)', sec: 'Comm', ind: 'Media' },
  { s: 'ONE', ys: 'ONE', n: 'Solo Corp', sec: 'Tech', ind: 'Software' },
];
const q = (o) => ({ currency: 'USD', financialCurrency: 'USD', regularMarketChangePercent: 0, regularMarketPreviousClose: o.regularMarketPrice, ...o });
const quotes = () => new Map([
  ['AAA', q({ marketCap: 3000, regularMarketPrice: 300, sharesOutstanding: 5, epsTrailingTwelveMonths: 15 })],
  ['AAC', q({ marketCap: 2990, regularMarketPrice: 300, sharesOutstanding: 4.5, epsTrailingTwelveMonths: 15 })],
  ['ONE', q({ marketCap: 1000, regularMarketPrice: 100, sharesOutstanding: 10, epsTrailingTwelveMonths: 5 })],
]);

test('companyKey', () => {
  assert.equal(companyKey('Fox Corporation (Class B)'), 'Fox Corporation');
});

test('class-shares: each class gets its own shares x price', () => {
  const c = classCaps(universe, quotes());
  assert.equal(c.get('AAA').mc, 1500);
  assert.equal(c.get('AAC').mc, 1350);
  assert.equal(c.get('AAA').method, 'class-shares');
  assert.equal(c.get('AAA').companyCap, 3000);
  assert.deepEqual(c.get('AAC').classes, ['AAA', 'AAC']);
  assert.equal(c.get('ONE').mc, 1000);
  assert.equal(c.get('ONE').method, 'yahoo');
});

test('split: untrustworthy class shares -> company cap split so classes sum to one company', () => {
  const qs = quotes();
  qs.get('AAC').sharesOutstanding = 40; // sum would be 13.5x the company cap
  const c = classCaps(universe, qs);
  assert.equal(c.get('AAA').method, 'split');
  close(c.get('AAA').mc + c.get('AAC').mc, 3000);
  close(c.get('AAA').mc / c.get('AAC').mc, 1500 / 12000);
  delete qs.get('AAA').sharesOutstanding; // missing shares -> equal split
  const e = classCaps(universe, qs);
  close(e.get('AAA').mc, 1500);
  close(e.get('AAC').mc, 1500);
});

test('valuation and dashboard use the same caps (no double counting)', () => {
  const qs = quotes();
  const v = computeValuation(universe, qs, 4, ['Comm', 'Tech']);
  assert.equal(v.index.marketCap, 2850 + 1000);
  // earnings: Alpha 2850 x 15/300 = 142.5, Solo 50
  close(v.index.trailingPE, 3850 / 192.5);
  close(v.sectors.find(s => s.sector === 'Comm').weightPct, 2850 / 3850 * 100);

  qs.set('^GSPC', { regularMarketPrice: 990, regularMarketPreviousClose: 1000, regularMarketChange: -10, regularMarketChangePercent: -1 });
  qs.get('AAA').regularMarketChangePercent = -2;
  qs.get('AAC').regularMarketChangePercent = -2;
  qs.get('ONE').regularMarketChangePercent = 1;
  const snap = buildSnapshot({ universe, quotes: qs, hist: new Map(), intraday: new Map(), curve: null, histStats: null, news: [], status: {} });
  const byS = Object.fromEntries(snap.stocks.map(x => [x.s, x.mc]));
  assert.deepEqual(byS, { AAA: 1500, AAC: 1350, ONE: 1000 });
  const total = 3850;
  const all = [...snap.contributors.down, ...snap.contributors.up];
  const pts = Object.fromEntries(all.map(x => [x.s, x.pts]));
  close(pts.AAA, Math.round(1500 / total * -0.02 * 1000 * 100) / 100);
  close(pts.ONE, Math.round(1000 / total * 0.01 * 1000 * 100) / 100);
});
