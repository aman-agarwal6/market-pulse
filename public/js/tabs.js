// Phone layout (767px and below): a bottom tab bar that shows one group of
// panels at a time. Wider screens keep the full single-page dashboard.
// The tab is chosen before first paint by the inline script in index.html.
import { closeDetail } from './detail.js';
import { hideTip } from './util.js';

const KEY = 'mp.tab';
const IDS = ['market', 'flows', 'stocks', 'world', 'news'];
const root = document.documentElement;
const nav = document.getElementById('m-tabs');
const tabs = [...nav.querySelectorAll('[role="tab"]')];
const panels = [...document.querySelectorAll('.tp')];
const topbar = document.querySelector('.topbar');
const drawer = document.getElementById('drawer');
const mq = matchMedia('(max-width: 767px)');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const load = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const save = v => { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } };

let cur = IDS.includes(load()) ? load() : 'market';
const scrollY = {};
const on = () => root.classList.contains('m-on');

// Charts drawn while their panel was hidden have no width; app.js redraws on this.
const announce = () => window.dispatchEvent(new CustomEvent('mp:layout'));

function paint() {
  for (const b of tabs) {
    const sel = b.dataset.m === cur;
    b.setAttribute('aria-selected', String(sel));
    b.tabIndex = sel ? 0 : -1;
  }
}

function setTab(t, { focus = false } = {}) {
  if (!IDS.includes(t)) t = 'market';
  if (drawer.classList.contains('open')) closeDetail();
  hideTip();
  if (t !== cur) { scrollY[cur] = window.scrollY; cur = t; save(t); }
  root.setAttribute('data-mt', cur);
  paint();
  if (focus) tabs.find(b => b.dataset.m === cur)?.focus();
  // Synchronous on purpose: reading sizes forces layout, so the new panel already measures correctly.
  // 'instant': the page sets scroll-behavior: smooth, which would otherwise animate the jump.
  announce();
  window.scrollTo({ top: scrollY[cur] || 0, behavior: 'instant' });
}

function measure() {
  if (on()) root.style.setProperty('--m-top-h', topbar.offsetHeight + 'px');
}

const search = document.getElementById('gsearch');
const searchHint = search.placeholder;

function apply() {
  search.placeholder = mq.matches ? 'Search any ticker…' : searchHint; // the "/" shortcut needs a keyboard
  if (mq.matches) {
    root.classList.add('m-on');
    root.setAttribute('data-mt', cur);
    for (const p of panels) p.setAttribute('role', 'tabpanel');
    paint();
    measure();
  } else {
    root.classList.remove('m-on');
    root.removeAttribute('data-mt');
    for (const p of panels) p.removeAttribute('role');
  }
  announce();
}

nav.addEventListener('click', e => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  if (b.dataset.m === cur && !drawer.classList.contains('open')) {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); // tap the active tab again: back to top
    return;
  }
  setTab(b.dataset.m);
});

// Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern, automatic activation).
nav.addEventListener('keydown', e => {
  const i = IDS.indexOf(cur);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: IDS.length - 1 }[e.key];
  if (next == null) return;
  e.preventDefault();
  setTab(IDS[(next + IDS.length) % IDS.length], { focus: true });
});

// The back gesture closes the stock drawer instead of leaving the site.
new MutationObserver(() => {
  if (!on()) return;
  const open = drawer.classList.contains('open');
  if (open && !history.state?.mpSheet) { try { history.pushState({ mpSheet: 1 }, ''); } catch { /* ignore */ } }
  else if (!open && history.state?.mpSheet) { try { history.back(); } catch { /* ignore */ } }
}).observe(drawer, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('popstate', () => { if (drawer.classList.contains('open')) closeDetail(); });

// World tab jump chips: scroll below the sticky header and chip row (no hash change, so Back keeps working as expected).
const jump = document.querySelector('.m-jump');
jump?.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  const target = a && document.querySelector(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  const top = target.getBoundingClientRect().top + window.scrollY - topbar.offsetHeight - jump.offsetHeight - 8;
  window.scrollTo({ top, behavior: reduceMotion.matches ? 'instant' : 'smooth' });
});

// Hover tooltips have no "mouse leave" on touch screens; clear them when the page moves.
window.addEventListener('scroll', () => { if (on()) hideTip(); }, { passive: true });

mq.addEventListener('change', apply);
new ResizeObserver(measure).observe(topbar);
apply();
