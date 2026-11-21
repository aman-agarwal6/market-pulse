// Macro — the US economy and interest rates for a long-term investor.
// Sections (one shown at a time): Overview · Inflation & the Fed · Jobs & growth ·
// Rates & credit · Recession watch · Calendar. Economic data comes from one
// cached /api/macro fetch (ws/macro/data.js); the live yield curve and yields
// come from the snapshot (macro-rates.js). Only the visible section renders.
import { renderCache, safe } from './../ui.js';
import { registerCommand } from '../commands.js';
import { go, current } from '../shell.js';
import { ratesHTML, renderRates } from './macro-rates.js';
import { loadMacro, getMacro, isFresh, series } from './macro/data.js';
import { ui, wireRanges } from './macro/panel.js';
import { overviewHTML, renderOverview, renderGlance, renderDetail, TILE_KEYS } from './macro/overview.js';
import { inflationHTML, renderInflation, renderInflChart } from './macro/inflation.js';
import { jobsHTML, renderJobs } from './macro/jobs.js';
import { creditHTML, renderCredit } from './macro/credit.js';
import { watchHTML, renderWatch } from './macro/watch.js';
import { calendarHTML, renderCalendar } from './macro/calendar.js';
import { setPanelState } from '../ui.js';

const cache = renderCache();
const RENDER = { overview: renderOverview, inflation: renderInflation, jobs: renderJobs, rates: renderCredit, watch: renderWatch, calendar: renderCalendar };
let root = null;
let section = null;
let loadError = null;

const MARKUP = () => `
${overviewHTML()}
${inflationHTML()}
${jobsHTML()}
<div data-section="rates">
  ${ratesHTML()}
  ${creditHTML()}
</div>
${watchHTML()}
${calendarHTML()}`;

/** Render the visible section from /api/macro (skipped when nothing changed). */
function renderMacro(force = false) {
  const D = getMacro();
  if (!root || !section) return;
  if (!D) { showLoadState(); return; }
  if (force) cache.reset();
  const sig = `${D.generatedAt}|${innerWidth}`;
  cache.run('sec:' + section, sig, () => RENDER[section]?.(D));
}

function showLoadState() {
  const panels = root.querySelectorAll(`[data-section="${section}"] .mpanel:not(#pCurve):not(#pRates)`);
  for (const p of panels) {
    if (loadError) setPanelState(p, 'error', { title: 'Could not load economic data', message: loadError, retry: () => { loadError = null; ensureData(true); } });
    else if (p.dataset.state !== 'loading') setPanelState(p, 'loading', { chart: true, rows: 3 });
  }
}

function ensureData(force = false) {
  if (!force && isFresh()) return;
  const had = !!getMacro();
  loadMacro({ force }).then(() => {
    loadError = null;
    if (!had) restoreBodies();
    renderMacro(true);
  }).catch(e => {
    console.error('macro', e);
    if (!getMacro()) { loadError = e.message || 'The server did not answer.'; showLoadState(); }
  });
}

// Panels were swapped for skeletons while the first load ran: put their markup back.
function restoreBodies() {
  const tmp = document.createElement('div');
  tmp.innerHTML = MARKUP();
  for (const p of root.querySelectorAll('.mpanel[data-state]:not(#pCurve):not(#pRates)')) {
    const fresh = tmp.querySelector('#' + CSS.escape(p.id));
    if (fresh) { p.querySelector('.panel-body').replaceWith(fresh.querySelector('.panel-body')); delete p.dataset.state; }
  }
}

function selectTile(key, { scroll = false } = {}) {
  if (!series(key)) return;
  ui.pick.overview = key;
  const D = getMacro();
  if (!D) return;
  safe('glance', () => renderGlance(D));
  safe('detail', () => renderDetail(D));
  if (scroll && innerWidth <= 1200) document.getElementById('pDetail')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function wire(r) {
  wireRanges(r, id => {
    const D = getMacro();
    if (!D) return;
    if (id === 'pDetail') safe('detail', () => renderDetail(D));
    else if (id === 'pInfl') safe('infl', () => renderInflChart(D));
    else safe(id, () => RENDER[section](D));   // the section's other charts are cheap to redraw
  });
  r.addEventListener('click', e => {
    const t = e.target.closest('.mtile[data-mkey]');
    if (t) { selectTile(t.dataset.mkey, { scroll: true }); return; }
    const l = e.target.closest('.eco-sum-l');
    if (l) {
      if (l.dataset.msec) go('macro', l.dataset.msec);
      else if (l.dataset.mkey) { selectTile(l.dataset.mkey); document.getElementById('pDetail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      return;
    }
    const sb = e.target.closest('#inflSet button, #spreadPick button');
    if (sb) {
      const seg = sb.closest('.seg');
      for (const x of seg.querySelectorAll('button')) { const on = x === sb; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }
      const D = getMacro();
      if (seg.id === 'inflSet') { ui.pick.inflSet = sb.dataset.v; if (D) safe('infl', () => renderInflChart(D)); }
      else { ui.pick.spread = sb.dataset.v; if (D) safe('credit', () => renderCredit(D)); }
    }
  });
  r.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.mtile[data-mkey]')) { e.preventDefault(); selectTile(e.target.dataset.mkey); }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.matches('.mtile[data-mkey]')) {
      const all = [...r.querySelectorAll('.mtile[data-mkey]')];
      const i = all.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : -1);
      if (all[i]) { e.preventDefault(); all[i].focus(); }
    }
  });
}

const scrollToPanel = id => setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
registerCommand({ id: 'macro:fed', title: 'Fed path (fed funds futures)', hint: 'FED', aliases: ['WIRP', 'FOMC'], group: 'Go to', kind: 'Panel',
  keywords: ['fed funds futures', 'rate hikes', 'rate cuts', 'policy rate', 'fomc'], run: () => { go('macro', 'inflation'); scrollToPanel('pFedPath'); } });
registerCommand({ id: 'macro:series', title: 'Economic indicator', hint: 'ECO', arg: 'indicator', group: 'Go to', kind: 'Indicator',
  keywords: ['cpi', 'unemployment', 'gdp', 'payrolls'], run: a => {
    const q = (a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = TILE_KEYS.find(k => k.toLowerCase() === q) || TILE_KEYS.find(k => series(k)?.id.toLowerCase() === q) || TILE_KEYS.find(k => k.toLowerCase().startsWith(q));
    go('macro', 'overview', key ? { params: { s: key } } : {});
  } });
registerCommand({ id: 'macro:prob', title: 'NY Fed recession probability', group: 'Go to', kind: 'Panel', keywords: ['recession', 'probability', 'new york fed'],
  run: () => { go('macro', 'watch'); scrollToPanel('pProb'); } });

export default {
  id: 'macro', title: 'Macro', key: '5', aliases: ['MACRO', 'BONDS'], phone: 'more',
  icon: '<path d="M4 18c3-1 4-9 8-9s4 5 8 3"/><path d="M4 21h16"/>',
  sections: [
    { id: 'overview', title: 'Overview', hint: 'ECO', aliases: ['ECON', 'ECONOMY', 'ECST'], keywords: ['economy', 'state of the economy', 'at a glance', 'indicators', 'inflation', 'jobs', 'gdp'] },
    { id: 'inflation', title: 'Inflation & the Fed', hint: 'INFL', aliases: ['CPI', 'PCE'], keywords: ['inflation', 'cpi', 'pce', 'fed', 'fed funds', 'real yield', 'breakeven', 'fed path'] },
    { id: 'jobs', title: 'Jobs & growth', hint: 'JOBS', aliases: ['NFP', 'GDP'], keywords: ['unemployment', 'payrolls', 'jobless claims', 'sahm', 'gdp', 'industrial production', 'sentiment'] },
    { id: 'rates', title: 'Rates & credit', hint: 'GC', aliases: ['YCRV', 'RATES'], keywords: ['yield curve', 'treasury', 'bonds', 'spreads', 'inversion', 'credit', 'mortgage', 'nfci'] },
    { id: 'watch', title: 'Recession watch', hint: 'RECW', aliases: ['RECESSION'], keywords: ['recession', 'sahm', 'inversion', 'ny fed probability', 'warning signs'] },
    { id: 'calendar', title: 'Calendar', hint: 'ECAL', aliases: ['CAL'], keywords: ['economic calendar', 'releases', 'fomc meetings', 'cpi date', 'jobs report date'] },
  ],
  subnav: 'tabs',
  mount(r) {
    root = r;
    r.innerHTML = MARKUP();
    wire(r);
  },
  show() { ensureData(); },
  route(ctx) {
    // Old links: #/macro/economy → Overview.
    if (/^#\/macro\/economy\b/.test(location.hash)) { go('macro', 'overview', { replace: true }); return; }
    section = ctx.section;
    const s = ctx.params?.get('s');
    if (s && series(s) && s !== ui.pick.overview) {
      ui.pick.overview = s;
      cache.reset();
      if (section === 'overview' && getMacro()) selectTile(s);
    }
  },
  update(S, ctx) {
    section = ctx.section || section;
    if (ctx.force) cache.reset();
    if (section === 'rates') renderRates(S, ctx.force);
    if (!isFresh()) ensureData();
    renderMacro(ctx.force);
  },
};
