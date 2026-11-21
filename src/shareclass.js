// Market cap per S&P 500 ticker without double counting multi-class companies.
// Pure; used by engine.js (dashboard), valuation.js and fundamentals.js so they
// never disagree.
//
// Problem: Yahoo's `marketCap` on EVERY share class is the whole company's cap
// (GOOGL 3.26T and GOOG 3.25T are both "Alphabet"), so summing tickers counts
// Alphabet, Fox and News Corp twice.
//
// Rule, for companies with 2+ listed classes in the universe:
//  1. 'class-shares': classCap = that class's own sharesOutstanding x its price.
//     Used when every class has sharesOutstanding and the sum of class caps
//     lands between 50% and 105% of Yahoo's company cap (the sum can be lower
//     because unlisted classes, e.g. Alphabet Class B, are not in the index).
//  2. 'split': otherwise the company cap (largest class marketCap) is split
//     across the classes so they sum to exactly one company, in proportion to
//     sharesOutstanding x price where available, else equally.
// Single-class companies keep Yahoo's marketCap ('yahoo').
import { isNum } from './stats.js';

export const companyKey = name => String(name || '').replace(/\s*\(Class [A-Z]\)\s*$/i, '').trim();

/**
 * universe: [{ ys, n }], quotes: Map ys -> v7 quote.
 * Returns Map ys -> { mc, companyKey, companyCap, classes: [ys], method }.
 * companyCap = Yahoo's whole-company cap (use it for company-level yields such as FCF / cap).
 */
export function classCaps(universe, quotes) {
  const groups = new Map();
  for (const u of universe) {
    const q = quotes.get(u.ys);
    if (!q || !isNum(q.marketCap) || q.marketCap <= 0) continue;
    const k = companyKey(u.n);
    const g = groups.get(k) || [];
    g.push({ ys: u.ys, q });
    groups.set(k, g);
  }
  const out = new Map();
  for (const [key, members] of groups) {
    const classes = members.map(m => m.ys);
    const companyCap = Math.max(...members.map(m => m.q.marketCap));
    if (members.length === 1) {
      out.set(classes[0], { mc: members[0].q.marketCap, companyKey: key, companyCap, classes, method: 'yahoo' });
      continue;
    }
    const own = members.map(m => (isNum(m.q.sharesOutstanding) && m.q.sharesOutstanding > 0 && isNum(m.q.regularMarketPrice) && m.q.regularMarketPrice > 0
      ? m.q.sharesOutstanding * m.q.regularMarketPrice : null));
    const sum = own.every(isNum) ? own.reduce((a, b) => a + b, 0) : null;
    if (sum != null && sum >= 0.5 * companyCap && sum <= 1.05 * companyCap) {
      members.forEach((m, i) => out.set(m.ys, { mc: own[i], companyKey: key, companyCap, classes, method: 'class-shares' }));
    } else {
      const wts = own.every(isNum) && sum > 0 ? own.map(v => v / sum) : members.map(() => 1 / members.length);
      members.forEach((m, i) => out.set(m.ys, { mc: companyCap * wts[i], companyKey: key, companyCap, classes, method: 'split' }));
    }
  }
  return out;
}
