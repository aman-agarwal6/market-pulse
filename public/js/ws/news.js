// News — live market headlines.
import { $ } from '../util.js';
import * as P from '../panels.js';
import { lookup } from '../store.js';
import { panelHTML, renderCache } from '../ui.js';

const cache = renderCache();

export default {
  id: 'news', title: 'News', key: '7', hint: 'TOP', aliases: ['N', 'NEWS', 'HEADLINES'], phone: 'more',
  icon: '<rect x="4" y="4.5" width="16" height="15" rx="1.5"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
  mount(root) {
    root.innerHTML = `<section class="grid">${panelHTML({ id: 'pNews', title: 'Live News', sub: 'Yahoo Finance · tickers show live moves', body: '<div class="news" id="newsList"></div>', minH: 400,
      note: 'The latest market headlines. Ticker tags show how each mentioned stock is moving today.',
      source: { key: 'news' } })}</section>`;
  },
  update(S, ctx) {
    if (ctx.force) cache.reset();
    cache.run('news', S.news.map(n => n.id).join(',') + Math.floor(Date.now() / 60000), () => { $('#newsList').innerHTML = P.newsHTML(S.news, lookup); });
  },
};
