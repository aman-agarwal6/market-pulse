import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeValuation, companies, companyKey } from '../src/valuation.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Three companies, one dual-class. Prices 100 so shares = cap / 100.
const universe = [
  { s: 'AAA', ys: 'AAA', n: 'Alpha Inc.', sec: 'Tech', ind: 'Software' },
  { s: 'BBB', ys: 'BBB', n: 'Beta Corp (Class A)', sec: 'Tech', ind: 'Hardware' },
  { s: 'BBC', ys: 'BBC', n: 'Beta Corp (Class C)', sec: 'Tech', ind: 'Hardware' },
  { s: 'LOSS', ys: 'LOSS', n: 'Loser Co', sec: 'Energy', ind: 'Oil' },
];
const q = (mc, eps, epsF, extra = {}) => ({ marketCap: mc, regularMarketPrice: 100, epsTrailingTwelveMonths: eps, epsForward: epsF, currency: 'USD', financialCurrency: 'USD', ...extra });
const quotes = new Map([
  ['AAA', q(1000, 5, 6, { trailingAnnualDividendYield: 0.02, dividendYield: 2.2, priceToBook: 4, sharesOutstanding: 10 })],
  // Both classes report the WHOLE company cap (2000); B has more own shares.
  ['BBB', q(2000, 4, 5, { trailingAnnualDividendYield: 0.01, dividendYield: 1, priceToBook: 2, sharesOutstanding: 12 })],
  ['BBC', q(2000, 4, 5, { trailingAnnualDividendYield: 0.01, dividendYield: 1, priceToBook: 2, sharesOutstanding: 8 })],
  ['LOSS', q(1000, -2, 1, { trailingAnnualDividendYield: 0, dividendYield: 0, priceToBook: 0.0001, sharesOutstanding: 10 })],
]);

test('companyKey strips share-class suffix', () => {
  assert.equal(companyKey('Alphabet Inc. (Class A)'), 'Alphabet Inc.');
  assert.equal(companyKey('Home Depot (The)'), 'Home Depot (The)');
});

test('companies() collapses share classes, keeps the larger class', () => {
  const list = companies(universe, quotes);
  assert.equal(list.length, 3);
  const beta = list.find(c => c.key === 'Beta Corp');
  assert.deepEqual(beta.members, ['BBB', 'BBC']);
  assert.equal(beta.u.s, 'BBB');
});

test('index P/E = total cap / total earnings, loss-makers included', () => {
  const v = computeValuation(universe, quotes, 4.0, ['Tech', 'Energy']);
  // caps: 1000 + 2000 + 1000 = 4000
  // earnings: AAA 5*10 = 50, Beta 4*20 = 80, LOSS -2*10 = -20 -> 110
  assert.equal(v.index.marketCap, 4000);
  close(v.index.trailingPE, 4000 / 110);
  assert.equal(v.index.trailingPECoverage.lossMakers, 1);
  // forward: 6*10 + 5*20 + 1*10 = 170
  close(v.index.forwardPE, 4000 / 170);
  close(v.index.forwardEarningsYieldPct, 170 / 4000 * 100);
  // ERP = forward earnings yield - 10y yield (no NTM data -> next-FY basis)
  close(v.index.equityRiskPremiumPct, 170 / 4000 * 100 - 4.0);
  assert.match(v.index.equityRiskPremiumBasis, /next-fiscal-year/);
  // dividend yield = (1000*0.02 + 2000*0.01 + 0) / 4000
  close(v.index.dividendYieldPct, 40 / 4000 * 100);
  // P/B excludes LOSS (implausible 0.0001): (1000 + 2000) / (250 + 1000)
  close(v.index.priceToBook, 3000 / 1250);
  assert.equal(v.index.priceToBookCoverage.companies, 2);
  // top-10 concentration with 3 companies = 100%
  close(v.index.top10.capPct, 100);
  assert.equal(v.index.top10.names[0].n, 'Beta Corp');
  close(v.index.top10.names[0].weightPct, 50);
});

test('sector aggregates and weights', () => {
  const v = computeValuation(universe, quotes, 4.0, ['Tech', 'Energy']);
  const tech = v.sectors.find(s => s.sector === 'Tech');
  close(tech.weightPct, 75);
  close(tech.trailingPE, 3000 / 130);
  const energy = v.sectors.find(s => s.sector === 'Energy');
  assert.equal(energy.trailingPE, null); // negative total earnings -> no meaningful P/E
});

test('next-12-month forward P/E blends current and next fiscal year', () => {
  const now = 1_700_000_000;
  const yr = 365.25 * 86400;
  const qs = new Map([...quotes].map(([k, v]) => [k, { ...v, epsCurrentYear: v.epsTrailingTwelveMonths }]));
  // Every company: a quarter of the current fiscal year left -> EPSntm = 0.25*CY + 0.75*NY
  const v = computeValuation(universe, qs, 4.0, ['Tech', 'Energy'], { fyEnd: () => now + 0.25 * yr, nowSec: now });
  const ntm = 0.25 * 110 + 0.75 * 170;
  close(v.index.forwardPENTM, 4000 / ntm, 1e-6);
  assert.equal(v.index.forwardPENTMCoverage.capPct, 100);
  assert.match(v.index.equityRiskPremiumBasis, /next-12-month/);
});
