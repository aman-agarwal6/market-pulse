// Research — screener (EQS), company page (DES) and compare tool (COMP), one
// at a time. Each section lives in its own module under ws/research/; this
// file wires them to the shell and registers the command-bar mnemonics.
import { registerCommand } from '../commands.js';
import { go } from '../shell.js';
import * as screener from './research/screener.js';
import * as company from './research/company.js';
import * as compare from './research/compare.js';

const openCompany = s => go('research', 'company', { params: { s } });
const sectionRoot = id => document.querySelector(`#ws-research [data-section="${id}"]`);
const mounted = new Set();
let active = null;

function ensure(section) {
  if (mounted.has(section)) return;
  mounted.add(section);
  const el = sectionRoot(section);
  if (section === 'screener') screener.mount(el, { openCompany });
  else if (section === 'company') company.mount(el, { go, open: openCompany });
  else if (section === 'compare') compare.mount(el);
}

// ---------------------------------------------------------------------------
// Commands. DES and COMP take an optional argument: alone they open the
// section, with tickers they open them. app.js skips the duplicate section
// entries for DES / COMP because these commands own those mnemonics.
// ---------------------------------------------------------------------------
registerCommand({ id: 'research:des', title: 'Company page', hint: 'DES', aliases: ['DESC'], arg: 'ticker', argOptional: true, example: 'AAPL', group: 'Go to', kind: 'Research',
  keywords: ['company', 'profile', 'fundamentals', 'description', 'financials'], run: t => (t ? openCompany(t) : go('research', 'company')) });
registerCommand({ id: 'research:comp', title: 'Compare tickers', hint: 'COMP', aliases: ['COMPARE', 'VS'], arg: 'tickers', argOptional: true, example: 'SPY QQQ', group: 'Go to', kind: 'Research',
  keywords: ['compare', 'versus', 'total return', 'side by side'],
  run: t => {
    const syms = String(t || '').split(/[\s,]+/).filter(Boolean).slice(0, 6);
    go('research', 'compare', syms.length ? { params: { s: syms.join(',') } } : {});
  } });
for (const p of screener.presets()) {
  registerCommand({ id: 'research:eqs:' + p.id, title: `Screen: ${p.name}`, sub: p.criteria, group: 'Go to', kind: 'Screen',
    keywords: ['screener', 'screen', 'filter', ...p.name.toLowerCase().split(/\s+/)], run: () => go('research', 'screener', { params: { preset: p.id } }) });
}

export default {
  id: 'research', title: 'Research', key: '4', aliases: ['RESEARCH'], phone: 'main',
  icon: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  sections: [
    { id: 'screener', title: 'Screener', hint: 'EQS', keywords: ['screen', 'filter', 'find stocks', 'equity screener'] },
    { id: 'company', title: 'Company', hint: 'DES', keywords: ['profile', 'fundamentals', 'company page', 'etf page'] },
    { id: 'compare', title: 'Compare', hint: 'COMP', keywords: ['versus', 'vs', 'side by side', 'total return'] },
  ],
  subnav: 'tabs',
  mount(root) {
    root.innerHTML = '<div data-section="screener" class="rs-sec"></div><div data-section="company" class="rs-sec"></div><div data-section="compare" class="rs-sec"></div>';
  },
  route(ctx) {
    const sec = ctx.section || 'screener';
    if (active && active !== sec) (active === 'screener' ? screener : active === 'compare' ? compare : null)?.hide?.();
    active = sec;
    ensure(sec);
    if (sec === 'screener') screener.route(ctx.params);
    else if (sec === 'company') company.route(ctx.params);
    else if (sec === 'compare') compare.route(ctx.params);
  },
  hide() {
    if (active === 'screener') screener.hide();
    if (active === 'compare') compare.hide();
    active = null;
  },
  update(S, ctx) {
    if (ctx.section === 'company') company.live();
  },
};
