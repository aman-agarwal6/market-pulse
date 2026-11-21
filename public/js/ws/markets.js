// Markets — where the money is moving and how healthy the market is.
// Three sub-sections shown one at a time: Flows | Breadth & movers | Earnings & watchlist.
import { $, seg } from '../util.js';
import * as P from '../panels.js';
import * as C from '../charts.js';
import { openDetail } from '../detail.js';
import { store, lookup, watch, on } from '../store.js';
import { panelHTML, segHTML, renderCache, safe } from '../ui.js';
import { registerCommand } from '../commands.js';
import { go, current } from '../shell.js';

const ui = { secTf: 'c', moverTab: 'losers' };
const cache = renderCache();
const Q = { key: 'quotes' };

const MARKUP = `
<div data-section="flows">
  <section class="grid">
    ${panelHTML({ id: 'pSectors', span: 4, title: 'Sector Performance', sub: 'Cap-weighted, S&amp;P 500 members', bodyId: 'sectorBars', minH: 330,
      controls: segHTML({ id: 'secTf', small: true, value: 'c', label: 'Period', options: [['c', '1D'], ['w', '1W'], ['m', '1M'], ['ytd', 'YTD']] }),
      note: 'How each of the 11 sectors moved, with bigger companies counting for more.',
      info: 'Each bar is one sector of the S&P 500. Bars to the right rose, bars to the left fell. The sector move is weighted by company size, the same way the index is.\n\nThe thin line under each name splits the sector’s stocks into risers (green) and fallers (red), which shows whether a move is broad or driven by a few large companies.\n\nDefensive sectors (Staples, Utilities, Health Care, Real Estate) tend to hold up better when investors are cautious.',
      source: Q })}
    ${panelHTML({ id: 'pRotation', span: 4, title: 'Sector Rotation', sub: 'Relative to S&amp;P · x: 1-month strength · y: 1-week momentum · tails = last 4 weeks', body: '<div id="rrg" class="chart-box"></div>', minH: 330,
      note: 'Which sectors are gaining or losing ground compared with the whole S&amp;P 500.',
      info: 'Each dot is a sector. Further right means it has done better than the S&P 500 over the past month; higher up means that lead (or lag) has been improving over the past week.\n\nTop right: leading and still strengthening. Bottom right: leading but fading. Bottom left: lagging. Top left: lagging but improving. The tail shows the path over the last four weeks.',
      source: Q })}
    ${panelHTML({ id: 'pRisk', span: 4, title: 'Risk-On / Risk-Off', sub: 'Which side of each pair is winning today', bodyId: 'risk', minH: 330,
      note: 'Pairs of assets that show whether investors are leaning toward growth or safety today.',
      info: 'Each row compares a riskier asset with a safer one, for example small companies against large ones, or junk bonds against Treasuries. The bar shows by how much the first beat (right) or trailed (left) the second today.\n\nThe score at the top summarizes all pairs from 0 (every pair favors safety) to 100 (every pair favors risk). It describes today’s behavior only.',
      source: Q })}

    ${panelHTML({ id: 'pAssets', span: 7, title: 'Asset Class Flows', sub: 'ETF proxies · bar = today’s move · volume vs 10-day average shows conviction', bodyId: 'assets', minH: 380,
      note: 'Today’s move in funds that stand in for stocks, bonds, commodities and other asset classes.',
      info: 'Each row is an exchange-traded fund that tracks an asset class. "Vol vs avg" compares today’s trading volume with its 10-day average: well above 1x means unusually heavy trading.\n\n"Signal" combines direction and volume as a rough read of buying or selling pressure. It is not a measurement of money actually entering or leaving the funds.',
      source: Q })}
    <div class="span-5 col-stack">
      ${panelHTML({ id: 'pContrib', title: 'Who’s Moving the S&amp;P', sub: 'Index points contributed today', bodyId: 'contrib', minH: 280,
        note: 'The stocks that added or subtracted the most points from the index today.',
        info: 'The S&P 500 is weighted by company size, so a 1% move in a very large company shifts the index far more than a 1% move in a small one. These bars show each stock’s contribution in index points.',
        source: Q })}
      ${panelHTML({ id: 'pSectorFlow', title: 'Sector Money Flow', sub: '$ traded in rising minus falling stocks, by sector', bodyId: 'sectorFlow', cls: 'grow', minH: 300,
        note: 'Dollars traded in each sector’s rising stocks minus its falling stocks.',
        info: 'For every stock, price × volume gives the dollars traded today. That amount is counted on the inflow side if the stock is up and the outflow side if it is down. "Activity" compares today’s dollar volume with the 10-day average, so it climbs through the trading day.',
        source: Q })}
    </div>

    ${panelHTML({ id: 'pThemes', title: 'Themes &amp; Industries', sub: 'Thematic ETFs · 1D / 1W / 1M', body: '<div class="themes" id="themes"></div>', minH: 160,
      note: 'Funds that follow a theme or industry, such as semiconductors, homebuilders or clean energy.',
      source: Q })}
  </section>
</div>

<div data-section="breadth">
  <section class="grid">
    ${panelHTML({ id: 'pBreadth', span: 6, title: 'Breadth', sub: 'S&amp;P 500 participation, live', bodyId: 'breadthNow', minH: 380,
      note: 'How many stocks are taking part in today’s move, not just the biggest ones.',
      info: 'Breadth counts stocks instead of weighting them by size. It answers "is the whole market moving, or a handful of giants?"\n\nThe rings show the share of S&P 500 stocks trading above their 50-day and 200-day average prices. Historically, below 20% on the 50-day has marked broad selloffs and above 80% broad rallies.',
      source: Q })}
    ${panelHTML({ id: 'pBreadthTrend', span: 6, title: 'Breadth Trend', sub: '1 year · daily closes', bodyId: 'breadthHist', minH: 380,
      note: 'One year of market participation shown alongside the index itself.',
      info: 'The top chart is the S&P 500. Below it: the share of its stocks above their 50-day average, and the advance/decline line, which adds up each day’s risers minus fallers.\n\nWhen the index rises while these lines fall, fewer stocks are carrying the gain. Move across any chart to read all three on the same day.',
      source: { key: 'history', label: 'daily closes' } })}
    ${panelHTML({ id: 'pMovers', span: 7, title: 'Movers', sub: 'S&amp;P 500 members', bodyId: 'movers', minH: 380,
      controls: segHTML({ id: 'moverTab', small: true, value: 'losers', label: 'Movers list', options: [['losers', 'Losers'], ['gainers', 'Gainers'], ['active', 'Most $ traded'], ['unusual', 'Unusual volume']] }),
      note: 'The S&amp;P 500 stocks with the biggest moves or the most trading today.',
      source: Q })}
    ${panelHTML({ id: 'pVol', span: 5, title: 'Volatility', sub: 'Fear priced in options', bodyId: 'vol', minH: 380,
      note: 'How much movement options traders are paying to protect against. Higher means more expected turbulence.',
      info: 'The VIX is built from S&P 500 option prices and reflects the size of moves traders expect over the next 30 days. Its long-run average is roughly 19–20; readings above 30 have occurred during sharp selloffs.\n\nThe curve compares expectations over 9 days, 30 days and 3 months. Normally longer periods price higher. When the short end is above the long end, worry is concentrated in the near term.',
      source: Q })}
  </section>
</div>

<div data-section="earnings">
  <section class="grid">
    ${panelHTML({ id: 'pEarnings', span: 7, title: 'Earnings', sub: 'S&amp;P 500 reports · next 7 days and the market’s reaction to recent ones', bodyId: 'earnings', cls: 'fit',
      note: 'Upcoming company results, and how stocks moved after their latest reports.',
      info: 'Companies report results every three months. BMO means before the market opens, AMC after it closes, and * marks a date Yahoo Finance has estimated rather than confirmed. Larger companies have an amber outline.\n\nThe right column shows how each stock moved on the day of its report and over the following week.',
      source: Q })}
    ${panelHTML({ id: 'pWatch', span: 5, title: 'Watchlist', sub: 'Saved in this browser · ☆ in any chart to add', bodyId: 'watchlist', cls: 'wl-panel', minH: 240,
      controls: '<div class="wl-add"><input id="wlAdd" class="search" placeholder="Add ticker" aria-label="Add ticker to watchlist" autocomplete="off" spellcheck="false"></div>',
      note: 'Tickers you chose to follow. Saved only in this browser.',
      footer: '<div class="wl-quick" id="wlQuick"></div>' })}
  </section>
</div>`;

const visible = (ctx, sec) => ctx.section === sec;

function renderBreadthHist(S) {
  const h = S.breadth.history;
  if (!h) { $('#breadthHist').innerHTML = '<div class="empty">Waiting for history…</div>'; return; }
  const fmtD = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  const spx = h.spxLine.slice(-250);
  const start = spx[0]?.d;
  C.smallMultiples($('#breadthHist'), [
    { title: 'S&P 500', data: spx, fmt: v => v.toLocaleString('en-US', { maximumFractionDigits: 0 }), tick: d => d3.format('~s')(d), h: 96, color: '#e6edf3' },
    { title: '% of S&P 500 above 50-day average', data: h.pct50.filter(p => !start || p.d >= start), fmt: v => v.toFixed(0) + '%', tick: d => d + '%', h: 112, domain: [0, 100], color: '#3cc8d6',
      refs: [{ v: 80, l: 'overbought 80%', c: '#5d6b79' }, { v: 20, l: 'oversold 20%', c: '#5d6b79' }] },
    { title: 'Advance / decline line (cumulative)', data: h.adLine.filter(p => !start || p.d >= start), fmt: v => v.toLocaleString('en-US'), tick: d => d3.format('~s')(d), h: 112, color: '#ffb000' },
  ], { xFmt: fmtD });
}

function renderWatch() {
  if (!$('#watchlist')) return;
  P.renderWatchlist($('#watchlist'), watch.list(), lookup, store.sparks);
  P.renderWatchQuick($('#wlQuick'), watch.list());
}

function wire(root) {
  seg($('#secTf', root), v => { ui.secTf = v; if (store.S) P.renderSectorBars($('#sectorBars'), store.S.sectors, v); });
  seg($('#moverTab', root), v => { ui.moverTab = v; if (store.S) P.renderMovers($('#movers'), store.S.movers, v); });
  $('#wlQuick', root).addEventListener('click', e => {
    const b = e.target.closest('[data-add]');
    if (b) { e.stopPropagation(); watch.add(b.dataset.add); }
  });
  $('#watchlist', root).addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { e.stopPropagation(); watch.toggle(rm.dataset.rm); }
  });
  $('#wlAdd', root).addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim().toUpperCase();
    if (!v) return;
    let sym = v;
    if (!lookup(v)) {
      try { const r = await (await fetch(`/api/search?q=${encodeURIComponent(v)}`)).json(); if (r[0]) sym = r.find(x => x.s.toUpperCase() === v)?.s || r[0].s; } catch { /* use raw */ }
    }
    watch.add(sym);
    e.target.value = '';
  });
  on('watch', () => { if (current().ws === 'markets' && current().section === 'earnings') renderWatch(); });
}

registerCommand({ id: 'markets:watch', title: 'Open watchlist', hint: 'W', aliases: ['WATCH', 'WL'], group: 'Actions', kind: 'Panel', keywords: ['watchlist', 'saved', 'favorites'],
  run: () => { go('markets', 'earnings'); setTimeout(() => $('#wlAdd')?.focus({ preventScroll: true }), 60); } });
registerCommand({ id: 'markets:watchadd', title: 'Add to watchlist', hint: 'ADD', group: 'Actions', arg: 'ticker', keywords: ['watchlist'],
  run: t => { if (t) { watch.add(t); go('markets', 'earnings'); } } });
registerCommand({ id: 'markets:most', title: 'Most active stocks', hint: 'MOST', group: 'Go to', kind: 'Panel', keywords: ['movers', 'most traded', 'active', 'volume'],
  run: () => { go('markets', 'breadth'); setTimeout(() => { $('#moverTab [data-v="active"]')?.click(); document.getElementById('pMovers')?.scrollIntoView({ block: 'center' }); }, 60); } });
registerCommand({ id: 'markets:gainers', title: 'Top gainers today', group: 'Go to', kind: 'Panel', keywords: ['movers', 'winners', 'up'],
  run: () => { go('markets', 'breadth'); setTimeout(() => $('#moverTab [data-v="gainers"]')?.click()); } });
registerCommand({ id: 'markets:vix', title: 'Volatility (VIX)', group: 'Go to', kind: 'Panel', keywords: ['vix', 'fear', 'options'],
  run: () => { go('markets', 'breadth'); setTimeout(() => document.getElementById('pVol')?.scrollIntoView({ block: 'center' })); } });

export default {
  id: 'markets', title: 'Markets', key: '3', aliases: ['MARKETS', 'FLOWS'], phone: 'main',
  icon: '<path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"/>',
  sections: [
    { id: 'flows', title: 'Flows', hint: 'FLOW', keywords: ['sectors', 'rotation', 'risk', 'asset class', 'contributors', 'themes', 'money flow'] },
    { id: 'breadth', title: 'Breadth & movers', hint: 'BRDH', keywords: ['breadth', 'movers', 'gainers', 'losers', 'volatility', 'vix', 'most active'] },
    { id: 'earnings', title: 'Earnings & watchlist', hint: 'EARN', keywords: ['earnings', 'calendar', 'reports', 'watchlist'] },
  ],
  subnav: 'tabs',
  mount(root) { root.innerHTML = MARKUP; wire(root); },
  update(S, ctx) {
    if (ctx.force) cache.reset();
    const W = innerWidth;
    if (visible(ctx, 'flows')) {
      safe('sectors', () => P.renderSectorBars($('#sectorBars'), S.sectors, ui.secTf));
      cache.run('rrg', JSON.stringify(S.sectors.map(s => [s.rrg, s.c])) + W, () => C.rrgChart($('#rrg'), S.sectors, openDetail));
      safe('risk', () => P.renderRisk($('#risk'), S.risk, S.riskScore));
      safe('assets', () => P.renderAssets($('#assets'), S.assets));
      safe('contrib', () => P.renderContrib($('#contrib'), S.contributors, S.strip.find(x => x.s === '^GSPC')?.q));
      safe('sectorFlow', () => P.renderSectorFlow($('#sectorFlow'), S.stocks, S.sectors));
      safe('themes', () => P.renderThemes($('#themes'), S.themes));
    }
    if (visible(ctx, 'breadth')) {
      safe('breadth', () => { P.renderBreadthNow($('#breadthNow'), S.breadth); C.distChart($('#distChart'), S.breadth.dist); });
      cache.run('breadthHist', (S.breadth.history?.pct50?.length || 0) + ':' + store.sparksVersion + ':' + W, () => renderBreadthHist(S));
      safe('movers', () => P.renderMovers($('#movers'), S.movers, ui.moverTab));
      safe('vol', () => { const pts = P.renderVol($('#vol'), S.vol); C.termChart($('#termChart'), pts); });
    }
    if (visible(ctx, 'earnings')) {
      safe('earnings', () => P.renderEarnings($('#earnings'), S.earnings));
      safe('watch', renderWatch);
    }
  },
};
