// Today — what is happening now: index strip, futures, regime bar, the S&P 500
// explorer (heatmap / rankings), Fear & Greed and the Market Brief.
import { $, $$, esc, seg, heatColor, fmtPct, fmtPrice, fmtBig, cls, TF_MAX, TF_LABEL } from '../util.js';
import { Heatmap, matchesStock } from '../heatmap.js';
import * as P from '../panels.js';
import * as C from '../charts.js';
import { openDetail } from '../detail.js';
import { store, prefs } from '../store.js';
import { panelHTML, infoButtonHTML, sourceBadgeHTML, renderCache, safe } from '../ui.js';
import { registerCommand } from '../commands.js';
import { go } from '../shell.js';

const ui = { heatTf: 'c', heatMode: 'perf', heatSize: 'mc', heatSector: null, search: '', heatView: 'map', rankSort: 'metric', rankDirection: -1 };
const cache = renderCache();
let heat = null;

// Heatmap color/format per mode. Perf & ext-hours: diverging red-gray-green.
// Rel volume & distance-from-high: single-hue sequential scales.
const seqAmber = d3.interpolateRgb('#262c38', '#ffb000');
const seqRed = t => d3.interpolateRgb('#2b303b', prefs.cvd ? '#e66100' : '#f63538')(t);
function heatColorFor(v, tf) {
  if (v == null || !isFinite(v)) return '#2a2e38';
  if (tf === 'rv') return seqAmber(Math.max(0, Math.min(1, Math.log2(Math.max(v, 0.25) / 0.5) / 3))); // 0.5x .. 4x
  if (tf === 'off') return seqRed(Math.max(0, Math.min(1, -v / 30)));
  return heatColor(v, tf === 'ext' ? 3 : TF_MAX[tf] || 3);
}
function heatFmtFor(v, tf) {
  if (v == null || !isFinite(v)) return '—';
  if (tf === 'rv') return v.toFixed(1) + 'x';
  if (tf === 'off') return v.toFixed(1) + '%';
  return fmtPct(v);
}
const heatTfEff = () => (ui.heatMode === 'perf' ? ui.heatTf : ui.heatMode);

const EXPLORER_INFO = `Each tile is one S&P 500 company, grouped by sector. With "Cap" sizing, bigger tiles are bigger companies, so they move the index more. Color shows the measure you pick: green rose, red fell, and the scale under the map shows what each shade means.

Perf shows price change over the period you choose. Ext hrs shows moves before or after the regular session. Rel vol compares today's trading volume with the 10-day average: high values mean unusual interest. Off high shows how far each stock is below its 52-week high.

Click a sector label to zoom in, or a tile to open the stock's chart. Rankings lists the same stocks as a sortable table.`;

const MARKUP = `
<section class="strip" id="strip" aria-label="Major markets"></section>
<section class="futures" id="futures" aria-label="Index futures"></section>
<section class="regime" id="regime" aria-label="Market regime"></section>
<section class="grid" data-section="explorer">
  <section class="panel span-8 heat-panel hero" id="pExplorer" aria-labelledby="pExplorer-t">
    <header class="panel-head">
      <div class="panel-titles">
        <h2 id="pExplorer-t"><span>S&amp;P 500 explorer</span>${infoButtonHTML(EXPLORER_INFO, 'S&P 500 explorer')}</h2>
        <p class="sub" id="heatSub">Tile size shows market cap. Color shows price change.</p>
        <p class="panel-note">Each tile is a company in the S&amp;P 500. Green tiles rose, red tiles fell.</p>
      </div>
      <div class="seg view-switch" id="heatView" role="group" aria-label="Explorer view">
        <button type="button" data-v="map" class="on" aria-pressed="true">Heatmap</button>
        <button type="button" data-v="list" aria-pressed="false">Rankings</button>
      </div>
    </header>
    <div class="explorer-tools">
      <div class="explorer-scope">
        <select id="heatSector" aria-label="Filter by sector"><option value="">All sectors</option></select>
        <input type="search" class="search" id="heatSearch" placeholder="Find ticker or company" aria-label="Find ticker or company" autocomplete="off" spellcheck="false">
        <span id="heatCount" role="status"></span>
      </div>
      <div class="controls">
        <div class="seg" id="heatMode" role="group" aria-label="What the color shows">
          <button type="button" data-v="perf" class="on" aria-pressed="true">Perf</button><button type="button" data-v="ext" title="Pre-market / after-hours change">Ext hrs</button><button type="button" data-v="rv" title="Today's volume vs 10-day average">Rel vol</button><button type="button" data-v="off" title="Distance from 52-week high">Off high</button>
        </div>
        <div class="seg" id="heatTf" role="group" aria-label="Period">
          <button type="button" data-v="c" class="on" aria-pressed="true">1D</button><button type="button" data-v="w">1W</button><button type="button" data-v="m">1M</button><button type="button" data-v="q">3M</button><button type="button" data-v="ytd">YTD</button><button type="button" data-v="y">1Y</button>
        </div>
        <div class="seg" id="heatSize" role="group" aria-label="Tile size">
          <button type="button" data-v="mc" class="on" aria-pressed="true">Cap</button><button type="button" data-v="eq">Equal</button>
        </div>
      </div>
    </div>
    <div class="heatmap" id="heatmap"></div>
    <div id="heatList" hidden>
      <table class="rank-table" aria-label="Stock rankings">
        <thead><tr>
          <th scope="col"><button type="button" data-sort="label">Ticker</button></th>
          <th scope="col"><button type="button" data-sort="price">Price</button></th>
          <th scope="col" class="rank-cap"><button type="button" data-sort="size">Market cap</button></th>
          <th scope="col" aria-sort="descending"><button type="button" data-sort="metric" id="rankMetric">1D change</button></th>
        </tr></thead>
        <tbody id="rankRows"></tbody>
      </table>
    </div>
    <p class="explorer-empty" id="heatEmpty" hidden></p>
    <footer class="panel-foot heat-foot">
      <div class="legend-scale" id="heatLegend"></div>
      ${sourceBadgeHTML({ key: 'quotes' })}
    </footer>
  </section>

  <div class="span-4 col-stack fit">
    ${panelHTML({ id: 'pFear', title: 'Fear &amp; Greed', sub: 'Composite of 7 live market signals', bodyId: 'fear', minH: 300,
      note: 'A 0–100 summary of how cautious (low) or eager (high) investors are acting.',
      info: 'Built here from 7 market signals, including price momentum, how many stocks are rising, volatility and demand for safe assets such as bonds and gold. Below 25 reads as "extreme fear", above 75 as "extreme greed".\n\nIt describes the current mood, not where prices go next. Extreme readings have come before rebounds and before further declines.',
      source: { source: 'Computed from Yahoo Finance', key: 'quotes' } })}
    ${panelHTML({ id: 'pBrief', title: 'Market Brief', sub: 'Auto-generated from live data', cls: 'brief-panel', body: '<div class="brief" id="brief"></div>',
      note: 'Plain-English notes on the most notable things in today’s data.',
      info: 'Each note comes from a fixed rule applied to the live data (for example "the S&P 500 had its worst day since…"), not from a person or an AI. The tag on the right says which area the note is about, and the colored rail shows whether it is a sign of strength (green), weakness (red) or worth watching (amber).',
      source: { source: 'Rules on live data', key: 'quotes' } })}
  </div>
</section>`;

// ---------------------------------------------------------------------------
function heatItems(S) {
  return S.stocks.map(x => ({
    key: x.ys, sym: x.ys, label: x.s, name: x.n, group: x.sec, sub: x.ind, size: x.mc, price: x.p,
    perf: { c: x.c, ...x.perf, ext: x.ext?.c ?? null, rv: x.av && x.v != null ? x.v / x.av : null, off: x.h52 ? (x.p / x.h52 - 1) * 100 : null },
    extra: `<div class="tt-row"><span>Volume</span><b>${x.v ? (x.v / 1e6).toFixed(1) + 'M' : '—'}${x.av ? ` · ${(x.v / x.av).toFixed(1)}x avg` : ''}</b></div>`,
  }));
}

function renderHeatLegend() {
  const tf = heatTfEff();
  const el = $('#heatLegend');
  if (tf === 'rv') { el.innerHTML = [0.5, 0.75, 1, 1.5, 2, 3, 4].map(v => `<span style="background:${heatColorFor(v, 'rv')}">${v}x</span>`).join(''); return; }
  if (tf === 'off') { el.innerHTML = [0, -5, -10, -15, -20, -25, -30].map(v => `<span style="background:${heatColorFor(v, 'off')}">${v}%</span>`).join(''); return; }
  const max = tf === 'ext' ? 3 : TF_MAX[tf];
  const steps = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map(t => t * max);
  el.innerHTML = steps.map(v => `<span style="background:${heatColor(v, max)}">${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}%</span>`).join('');
}

function renderSectorFilter() {
  const select = $('#heatSector');
  const sectors = [...(store.S?.sectors || [])].sort((a, b) => a.name.localeCompare(b.name));
  const options = '<option value="">All sectors</option>' + sectors.map(s =>
    `<option value="${esc(s.name)}">${esc(s.name)} · ${TF_LABEL[ui.heatTf]} ${fmtPct(s[ui.heatTf], 1)}</option>`).join('');
  if (select._options !== options) { select.innerHTML = options; select._options = options; }
  select.value = ui.heatSector || '';
}

function selectSector(name) {
  ui.heatSector = name || null;
  $('#heatSector').value = name || '';
  refreshExplorer();
}

function matchingItems(query = ui.search) {
  const list = ui.heatView === 'list';
  const q = query.trim().toUpperCase();
  return heat.items.filter(it => (!ui.heatSector || it.group === ui.heatSector) &&
    (list || ui.heatSize === 'eq' || heat.sizeOf(it) > 0) && matchesStock(it, q));
}

function renderRankings(items) {
  const tf = heatTfEff();
  const key = ui.rankSort;
  const value = it => key === 'metric' ? it.perf[tf] : it[key];
  items.sort((a, b) => {
    const av = value(a), bv = value(b);
    if (av == null || bv == null) return Number(av == null) - Number(bv == null) || a.label.localeCompare(b.label);
    const diff = key === 'label' ? av.localeCompare(bv) : av - bv;
    return diff * ui.rankDirection || a.label.localeCompare(b.label);
  });
  $('#rankMetric').textContent = TF_LABEL[tf] ? TF_LABEL[tf] + ' change' : { ext: 'Ext. change', rv: 'Rel. volume', off: 'Off high' }[tf];
  for (const b of $$('#heatList [data-sort]')) {
    const th = b.closest('th');
    if (b.dataset.sort === key) th.setAttribute('aria-sort', ui.rankDirection === 1 ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  }
  const rows = $('#rankRows');
  const html = items.map(it => {
    const v = it.perf[tf];
    return `<tr><td><button type="button" data-sym="${esc(it.key)}"><b>${esc(it.label)}</b><small>${esc(it.name)}</small></button></td>
      <td>${fmtPrice(it.price)}</td><td class="rank-cap">${fmtBig(it.size, '$')}</td>
      <td><span class="rank-value ${tf === 'rv' ? 'flat' : cls(v)}">${heatFmtFor(v, tf)}</span></td></tr>`;
  }).join('');
  if (html !== rows._html) {
    const focused = rows.contains(document.activeElement) && document.activeElement.dataset.sym;
    rows.innerHTML = html;
    rows._html = html;
    if (focused) rows.querySelector(`[data-sym="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  }
}

function renderHeatSub() {
  const metric = { perf: 'price change', ext: 'extended-hours change', rv: 'volume relative to the 10-day average', off: 'distance from the 52-week high' }[ui.heatMode];
  $('#heatSub').textContent = ui.heatView === 'list'
    ? 'Select a column to sort or a ticker to open its chart.'
    : (ui.heatSize === 'eq' ? 'Tiles have equal weight.' : 'Tile size shows market cap.') + ' Color shows ' + metric + '.';
}

function refreshExplorer(live = false) {
  if (!heat) return;
  const list = ui.heatView === 'list';
  const opts = { tf: heatTfEff(), size: ui.heatSize, sector: ui.heatSector, search: ui.search };
  $('#heatSize').hidden = list;
  $('#heatTf').hidden = ui.heatMode !== 'perf';
  $('#heatmap').hidden = list;
  if (live && store.S) heat.update(heatItems(store.S), opts);
  else heat.setOpts(opts);
  const matches = matchingItems();
  const n = matches.length;
  $('#heatList').hidden = !list || !n;
  $('#heatmap').hidden = list || !n;
  $('#heatLegend').hidden = list || !n;
  const empty = $('#heatEmpty');
  empty.hidden = !!n;
  empty.textContent = !heat.items.length ? 'Waiting for stock quotes. The explorer updates automatically.' :
    ui.search.trim() ? 'No matching stocks. Try another ticker or company name.' :
    list ? 'No stock quotes available for this sector.' : 'No tiles available. Try another sector, equal sizing or rankings.';
  const count = n + (ui.search.trim() ? (n === 1 ? ' match' : ' matches') : (n === 1 ? ' stock' : ' stocks'));
  if ($('#heatCount').textContent !== count) $('#heatCount').textContent = count;
  if (list) renderRankings(matches);
  renderHeatSub();
  renderHeatLegend();
}

function wire(root) {
  heat = new Heatmap($('#heatmap', root), {
    grouped: true, onClick: it => it && openDetail(it.key), onSector: selectSector,
    sparks: () => store.sparks, colorFor: heatColorFor, fmtFor: heatFmtFor,
  });
  $('#heatSector', root).addEventListener('change', e => selectSector(e.target.value));
  $('#heatList thead', root).addEventListener('click', e => {
    const key = e.target.closest('[data-sort]')?.dataset.sort;
    if (!key) return;
    ui.rankDirection = ui.rankSort === key ? -ui.rankDirection : key === 'label' ? 1 : -1;
    ui.rankSort = key;
    renderRankings(matchingItems());
  });
  seg($('#heatView', root), v => { ui.heatView = v; refreshExplorer(); });
  seg($('#heatTf', root), v => { ui.heatTf = v; refreshExplorer(); renderSectorFilter(); });
  seg($('#heatMode', root), v => { ui.heatMode = v; refreshExplorer(); });
  seg($('#heatSize', root), v => { ui.heatSize = v; refreshExplorer(); });
  $('#heatSearch', root).addEventListener('input', e => { ui.search = e.target.value; refreshExplorer(); });
  $('#heatSearch', root).addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const matches = matchingItems(e.target.value);
    const q = e.target.value.trim().toUpperCase();
    const hit = matches.find(it => it.label === q) || matches[0];
    if (hit) openDetail(hit.key);
  });
}

registerCommand({ id: 'today:imap', title: 'S&P 500 heatmap', hint: 'IMAP', group: 'Go to', kind: 'Panel', keywords: ['explorer', 'treemap', 'map'], run: () => { go('today', 'explorer'); } });
registerCommand({ id: 'today:rank', title: 'S&P 500 rankings', group: 'Go to', kind: 'Panel', keywords: ['explorer', 'table', 'sort', 'list'], run: () => { go('today', 'explorer'); setTimeout(() => $('#heatView [data-v="list"]')?.click()); } });

export default {
  id: 'today', title: 'Today', key: '1', aliases: ['TODAY', 'MKT'], phone: 'main',
  icon: '<rect x="3.5" y="3.5" width="9" height="10" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="11.5" width="6" height="9" rx="1"/><rect x="3.5" y="15.5" width="9" height="5" rx="1"/>',
  sections: [{ id: 'explorer', title: 'S&P 500 explorer', hint: 'IMAP' }],
  subnav: 'scroll',
  mount(root) { root.innerHTML = MARKUP; wire(root); },
  update(S, ctx) {
    if (ctx.force) cache.reset();
    safe('strip', () => P.renderStrip($('#strip'), S.strip));
    safe('regime', () => P.renderRegime($('#regime'), S));
    safe('futures', () => P.renderFutures($('#futures'), S.futures || [], S.market.state));
    safe('heat', () => refreshExplorer(true));
    safe('secfilter', renderSectorFilter);
    cache.run('fear', ctx.force ? undefined : JSON.stringify(S.fear), () => C.fearGauge($('#fear'), S.fear));
    safe('brief', () => P.renderBrief($('#brief'), S.brief));
  },
};
