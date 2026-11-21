// World — global equity map and indices, crypto, commodities & currencies.
import { $, seg } from '../util.js';
import * as P from '../panels.js';
import * as C from '../charts.js';
import { Heatmap } from '../heatmap.js';
import { openDetail } from '../detail.js';
import { store, shortSym } from '../store.js';
import { panelHTML, segHTML, renderCache, safe } from '../ui.js';

const cache = renderCache();
const ui = { cryptoTf: 'c' };
let cryptoHeat = null;
const CRYPTO_MAX = { c: 6, w: 12, m: 20, ytd: 40 };
const Q = { key: 'quotes' };

const MARKUP = `
<div class="ws-sec" data-section="global">
  <h3 class="section-title">Global markets</h3>
  <section class="grid">
    ${panelHTML({ id: 'pWorldMap', span: 8, title: 'World Equity Map', sub: 'Latest session change of each country’s benchmark index', body: '<div id="worldmap" class="chart-box map-box"></div>',
      note: 'Each country’s main stock index, colored by its most recent trading day.',
      info: 'Countries are colored by the latest session of their benchmark index: green rose, red fell, gray has no data. Markets in Asia and Europe close before the US opens, so on a US morning their colors already reflect a finished day. Click a country to open its index chart.',
      source: Q })}
    ${panelHTML({ id: 'pGlobalList', span: 4, title: 'Indices by Region', sub: 'Sorted by today’s move', bodyId: 'globalList', bodyCls: 'scroll-y', cls: 'fit',
      note: 'A green dot means that market is open right now.', source: Q })}
  </section>
</div>

<div class="ws-sec" data-section="crypto">
  <h3 class="section-title">Crypto</h3>
  <section class="grid">
    ${panelHTML({ id: 'pCryptoMap', span: 8, title: 'Crypto Heatmap', sub: 'Top coins · size = market cap', body: '<div class="heatmap crypto-map" id="cryptomap"></div>',
      controls: segHTML({ id: 'cryptoTf', small: true, value: 'c', label: 'Period', options: [['c', '24H'], ['w', '7D'], ['m', '30D'], ['ytd', 'YTD']] }),
      note: 'The largest cryptocurrencies, sized by total market value. Crypto trades around the clock.',
      source: Q })}
    ${panelHTML({ id: 'pCryptoList', span: 4, title: 'Crypto Board', sub: 'Price · 24h · 7d', bodyId: 'cryptoList', bodyCls: 'scroll-y', cls: 'fit', source: Q })}
  </section>
</div>

<div class="ws-sec" data-section="commod">
  <h3 class="section-title">Commodities &amp; currencies</h3>
  <section class="grid">
    ${panelHTML({ id: 'pCommod', span: 6, title: 'Commodities', sub: 'Front-month futures', bodyId: 'commodities', minH: 300,
      note: 'Futures prices for energy, metals and farm goods, for the nearest delivery month.', source: Q })}
    ${panelHTML({ id: 'pFx', span: 6, title: 'Currencies', sub: 'Dollar and major pairs', bodyId: 'fx', minH: 300,
      note: 'The US dollar against major currencies. A rising dollar index means the dollar is strengthening.', source: Q })}
  </section>
</div>`;

function cryptoItems(S) {
  return S.crypto.map(c => ({
    key: c.s, sym: c.s, label: shortSym(c.s), name: (c.n || '').replace(/ USD$/, ''),
    size: c.mc, price: c.p, perf: { c: c.c, w: c.perf.w, m: c.perf.m, ytd: c.perf.ytd },
  }));
}

export default {
  id: 'world', title: 'World', key: '6', hint: 'WEI', aliases: ['WORLD', 'GLOBAL'], phone: 'more',
  icon: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
  sections: [
    { id: 'global', title: 'Global indices', keywords: ['world map', 'europe', 'asia', 'countries'] },
    { id: 'crypto', title: 'Crypto', hint: 'CRYP', keywords: ['bitcoin', 'ethereum', 'coins'] },
    { id: 'commod', title: 'Commodities & FX', hint: 'GLCO', aliases: ['WCRS', 'FX'], keywords: ['oil', 'gold', 'dollar', 'currencies', 'futures'] },
  ],
  subnav: 'scroll',
  mount(root) {
    root.innerHTML = MARKUP;
    cryptoHeat = new Heatmap($('#cryptomap', root), {
      grouped: false, onClick: it => it && openDetail(it.key), maxFor: tf => CRYPTO_MAX[tf] || 6,
      sparks: () => store.sparks, tfLabels: { c: '24H', w: '7D', m: '30D', ytd: 'YTD' },
    });
    seg($('#cryptoTf', root), v => { ui.cryptoTf = v; cryptoHeat.setOpts({ tf: v }); });
  },
  update(S, ctx) {
    if (ctx.force) cache.reset();
    cache.run('map', S.global.map(g => g.q.c).join(',') + innerWidth, () => C.worldMap($('#worldmap'), S.global, openDetail));
    safe('globalList', () => P.renderGlobalList($('#globalList'), S.global));
    safe('crypto', () => cryptoHeat.update(cryptoItems(S), { tf: ui.cryptoTf }));
    safe('cryptoList', () => P.renderCryptoList($('#cryptoList'), S.crypto, store.sparks));
    safe('commod', () => P.renderQuoteTable($('#commodities'), S.commodities, { grouped: true, sparks: store.sparks }));
    safe('fx', () => P.renderQuoteTable($('#fx'), S.fx, { grouped: true, sparks: store.sparks, max: 1 }));
  },
};
