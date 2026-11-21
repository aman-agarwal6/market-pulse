// Long-Term — the long-run lens for an index-fund investor. Four scroll
// sections, each in its own module under ws/longterm/:
//   conditions.js  where the market stands, scorecard, valuation
//   history.js     drawdowns, decline overlay, what happened next, time in market
//   planning.js    DCA simulator, compounding projector
//   etfs.js        core ETF table, correlation matrix, risk vs return
// Data comes from /api/longterm, /api/valuation, /api/etfs, /api/history and
// /api/macro (ws/longterm/data.js fetches each once). Sections load when they
// come near the viewport, so opening the workspace costs only what you see.
import { registerCommand } from '../commands.js';
import { go } from '../shell.js';
import * as Cond from './longterm/conditions.js';
import * as Hist from './longterm/history.js';
import * as Plan from './longterm/planning.js';
import * as Etf from './longterm/etfs.js';

const SECTIONS = { conditions: Cond, history: Hist, planning: Plan, etfs: Etf };
let io = null;
let liveTimer = 0;
let visible = false;

function lazyLoad(root) {
  io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const mod = SECTIONS[e.target.dataset.section];
      io.unobserve(e.target);
      io._pending?.delete(e.target);
      mod?.load();
    }
  }, { rootMargin: '600px 0px' });
  const pending = new Set(root.querySelectorAll('[data-section]'));
  for (const el of pending) io.observe(el);
  // Fallback for browsers that throttle observers (background tabs, embedded panes).
  let t = 0;
  addEventListener('scroll', () => {
    if (t || !pending.size || root.closest('.ws')?.hidden) return;
    t = setTimeout(() => {
      t = 0;
      for (const el of pending) {
        const r = el.getBoundingClientRect();
        if (r.height && r.top < innerHeight + 600 && r.bottom > -600) { pending.delete(el); io.unobserve(el); SECTIONS[el.dataset.section]?.load(); }
      }
    }, 150);
  }, { passive: true });
  io._pending = pending;
}

registerCommand({ id: 'longterm:dca', title: 'DCA simulator', hint: 'DCA', arg: 'ticker', group: 'Go to', kind: 'Tool',
  keywords: ['dollar cost averaging', 'monthly investing', 'simulate'],
  run: t => go('longterm', 'planning', t ? { params: { s: t } } : {}) });
registerCommand({ id: 'longterm:dd', title: 'S&P 500 drawdown history', hint: 'DDH', group: 'Go to', kind: 'Panel',
  keywords: ['drawdowns', 'bear markets', 'corrections', 'declines', 'crash'], run: () => go('longterm', 'history') });
registerCommand({ id: 'longterm:cape', title: 'Market valuation (CAPE, P/E)', hint: 'CAPE', group: 'Go to', kind: 'Panel',
  keywords: ['shiller', 'pe ratio', 'expensive', 'valuation', 'scorecard'], run: () => go('longterm', 'conditions') });
registerCommand({ id: 'longterm:etfs', title: 'Core ETFs', hint: 'ETF', group: 'Go to', kind: 'Panel',
  keywords: ['index funds', 'expense ratio', 'correlation'], run: () => go('longterm', 'etfs') });

export default {
  id: 'longterm', title: 'Long-Term', key: '2', aliases: ['LONG', 'LT'], phone: 'main',
  icon: '<path d="M4 19h16"/><path d="M5 16l4-5 3 3 7-8"/><path d="M15 6h4v4"/>',
  sections: [
    { id: 'conditions', title: 'Conditions', keywords: ['scorecard', 'valuation', 'pe', 'cape', 'expensive', 'correction'] },
    { id: 'history', title: 'History', keywords: ['drawdowns', 'bear markets', 'recoveries', 'what happened next', 'time in market'] },
    { id: 'planning', title: 'Planning', keywords: ['dca', 'dollar cost averaging', 'compounding', 'savings', 'projection'] },
    { id: 'etfs', title: 'Core ETFs', keywords: ['index funds', 'correlation', 'voo', 'vti', 'expense ratio'] },
  ],
  subnav: 'scroll',
  mount(root) {
    root.innerHTML = Cond.MARKUP + Hist.MARKUP + Plan.MARKUP + Etf.MARKUP;
    root.classList.add('lt');
    Cond.wire(root); Hist.wire(root); Plan.wire(root); Etf.wire(root);
    lazyLoad(root);
  },
  show(ctx) {
    visible = true;
    // The first section is what you see on arrival: start it without waiting for the observer.
    if (!ctx?.section || ctx.section === 'conditions') Cond.load();
    clearInterval(liveTimer);
    liveTimer = setInterval(() => { if (visible) Cond.refreshLive(); }, 5 * 60e3);
  },
  hide() { visible = false; clearInterval(liveTimer); },
  route(ctx) {
    // A deep link into a section loads it at once (the observer may not fire before the scroll).
    if (ctx.section === 'planning') Plan.applyParams(ctx.params);
    if (ctx.section && SECTIONS[ctx.section]) SECTIONS[ctx.section].load();
  },
  update(S, ctx) {
    Cond.live(S);
    if (ctx.force) { Cond.redraw(); Hist.redraw(); Plan.redraw(); }
  },
};
