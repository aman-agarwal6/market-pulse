// Phone layout (767px and below): a bottom bar with up to 5 slots —
// the workspaces marked phone: 'main', then "More" (a sheet listing the
// workspaces marked phone: 'more'). It only navigates through the shell's
// hash router, so desktop tabs, phone tabs and back/forward share one state.
// html.m-on and html[data-ws] are set before first paint by the inline
// script in index.html.
import { workspaces, go, onRoute, current } from './shell.js';
import { closeDetail } from './detail.js';
import { hideTip, esc } from './util.js';

const root = document.documentElement;
const nav = document.getElementById('m-tabs');
const sheet = document.getElementById('moreSheet');
const drawer = document.getElementById('drawer');
const mq = matchMedia('(max-width: 767px)');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const on = () => root.classList.contains('m-on');

const mainWs = workspaces.filter(w => w.phone !== 'more').slice(0, 4);
const moreWs = workspaces.filter(w => !mainWs.includes(w));
const MORE_ICON = '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>';
const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

nav.innerHTML = mainWs.map(w => `<button type="button" role="tab" data-m="${w.id}" aria-controls="ws-${w.id}" aria-selected="false" tabindex="-1">${svg(w.icon)}<span>${esc(w.title)}</span></button>`).join('') +
  `<button type="button" role="tab" data-m="more" aria-haspopup="dialog" aria-expanded="false" aria-selected="false" tabindex="-1">${svg(MORE_ICON)}<span>More</span></button>`;
sheet.querySelector('.msheet-list').innerHTML = moreWs.map(w =>
  `<button type="button" data-ws="${w.id}">${svg(w.icon)}<span><b>${esc(w.title)}</b><small>${esc(w.sections.map(s => s.title).join(' · ') || ' ')}</small></span></button>`).join('');
const tabs = [...nav.querySelectorAll('[role="tab"]')];
const moreBtn = nav.querySelector('[data-m="more"]');

function paint() {
  const ws = current().ws;
  const slot = mainWs.some(w => w.id === ws) ? ws : 'more';
  for (const b of tabs) {
    const sel = b.dataset.m === slot;
    b.setAttribute('aria-selected', String(sel));
    b.tabIndex = sel ? 0 : -1;
  }
  // The More slot takes the icon and name of the "more" workspace you are on.
  const m = moreWs.find(w => w.id === ws);
  moreBtn.innerHTML = m ? `${svg(m.icon)}<span>${esc(m.title)}<i class="caret" aria-hidden="true"></i></span>` : `${svg(MORE_ICON)}<span>More</span>`;
  moreBtn.setAttribute('aria-label', m ? `More: ${m.title}` : 'More');
  for (const b of sheet.querySelectorAll('[data-ws]')) b.setAttribute('aria-current', String(b.dataset.ws === ws));
}

// ---------- More sheet ----------
function openSheet() {
  sheet.hidden = false;
  void sheet.offsetWidth; // commit the closed position so the slide-up transition runs
  sheet.classList.add('open');
  moreBtn.setAttribute('aria-expanded', 'true');
  if (on() && !history.state?.mpMore) { try { history.pushState({ ...history.state, mpMore: 1 }, ''); } catch { /* ignore */ } }
  (sheet.querySelector('[aria-current="true"]') || sheet.querySelector('[data-ws]'))?.focus();
}
function closeSheet({ fromPop = false, restore = true } = {}) {
  if (sheet.hidden) return;
  sheet.classList.remove('open');
  moreBtn.setAttribute('aria-expanded', 'false');
  setTimeout(() => { sheet.hidden = true; }, reduceMotion.matches ? 0 : 180);
  if (!fromPop && history.state?.mpMore) { try { history.back(); } catch { /* ignore */ } }
  if (restore) moreBtn.focus({ preventScroll: true });
}
sheet.addEventListener('click', e => {
  const b = e.target.closest('[data-ws]');
  if (b) {
    const id = b.dataset.ws;
    // Leave the sheet's history entry first, then navigate (so Back returns to the previous workspace).
    if (history.state?.mpMore) {
      sheet.classList.remove('open'); sheet.hidden = true; moreBtn.setAttribute('aria-expanded', 'false');
      addEventListener('popstate', () => go(id), { once: true });
      history.back();
    } else { closeSheet({ restore: false }); go(id); }
    return;
  }
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
});
sheet.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); } });

// ---------- Tab bar ----------
nav.addEventListener('click', e => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  if (drawer.classList.contains('open')) closeDetail();
  if (b.dataset.m === 'more') { sheet.hidden ? openSheet() : closeSheet(); return; }
  if (b.dataset.m === current().ws) { scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); return; } // tap the active tab again: back to top
  go(b.dataset.m);
});
// Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern).
nav.addEventListener('keydown', e => {
  const i = tabs.indexOf(document.activeElement);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (next == null || i < 0) return;
  e.preventDefault();
  const b = tabs[(next + tabs.length) % tabs.length];
  b.focus();
  if (b.dataset.m !== 'more') go(b.dataset.m);
});

// The back gesture closes the stock sheet instead of leaving the workspace.
new MutationObserver(() => {
  if (!on()) return;
  const open = drawer.classList.contains('open');
  if (open && !history.state?.mpSheet) { try { history.pushState({ ...history.state, mpSheet: 1 }, ''); } catch { /* ignore */ } }
  else if (!open && history.state?.mpSheet) { try { history.back(); } catch { /* ignore */ } }
}).observe(drawer, { attributes: true, attributeFilter: ['class'] });
addEventListener('popstate', () => {
  if (drawer.classList.contains('open') && !history.state?.mpSheet) closeDetail();
  if (!sheet.hidden && !history.state?.mpMore) closeSheet({ fromPop: true, restore: false });
});

// Hover tooltips have no "mouse leave" on touch screens; clear them when the page moves.
addEventListener('scroll', () => { if (on()) hideTip(); }, { passive: true });

function apply() {
  root.classList.toggle('m-on', mq.matches);
  for (const w of workspaces) document.getElementById('ws-' + w.id)?.setAttribute('role', mq.matches && mainWs.includes(w) ? 'tabpanel' : 'region');
  if (!mq.matches) closeSheet({ restore: false });
  paint();
}
mq.addEventListener('change', apply);
onRoute(paint);
apply();
