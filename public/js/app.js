// Market Pulse — client entry point. Connects to the live SSE stream, keeps
// the shared store current, renders the always-visible chrome (tape, index
// readout, market state, clock) and asks the shell to render the active
// workspace. Workspace code lives in js/ws/; conventions are in shell.js.
import { $, esc, debounce, fmtPct, fmtPrice, cls } from './util.js';
import * as P from './panels.js';
import { store, emit, on, buildIndex, refreshExtra, lookup, watch, prefs, setColorblind } from './store.js';
import { initDetail, openDetail, refreshDetail } from './detail.js';
import { initUI, notesOn, setNotes } from './ui.js';
import { initShell, renderActive, workspaces, go, toggleSheet } from './shell.js';
import { initCommandBar, registerCommand, findByHint } from './commands.js';
import './ws/index.js';

// ---------------------------------------------------------------------------
// Commands that belong to the app rather than one workspace
// ---------------------------------------------------------------------------
for (const w of workspaces) {
  registerCommand({ id: 'ws:' + w.id, title: w.title, hint: w.hint, aliases: w.aliases || [], key: w.key, group: 'Go to', kind: 'Workspace',
    keywords: w.sections.flatMap(s => [s.title, ...(s.keywords || [])]), run: () => go(w.id) });
  if (w.sections.length > 1) for (const s of w.sections) {
    // One entry per mnemonic: if a workspace already registered a command with
    // this section's hint (e.g. DES <ticker>), that command also covers the bare
    // mnemonic: it takes the section's aliases and its argument becomes optional.
    const owner = s.hint && findByHint(s.hint);
    if (owner) {
      owner.aliases = [...new Set([...owner.aliases, ...(s.aliases || [])])];
      owner.keywords = [...new Set([...owner.keywords, s.title, ...(s.keywords || [])])];
      if (owner.arg) {
        owner.argOptional = true;
        const run = owner.run;
        owner.run = a => (a ? run(a) : go(w.id, s.id)); // bare mnemonic = the section, exactly
      }
      continue;
    }
    registerCommand({ id: `sec:${w.id}:${s.id}`, title: `${w.title} › ${s.title}`, hint: s.hint, aliases: s.aliases || [], group: 'Go to', kind: 'Section',
      keywords: s.keywords || [], run: () => go(w.id, s.id) });
  }
}
registerCommand({ id: 'chart', title: 'Open chart', hint: 'GP', aliases: ['CHART', 'G'], arg: 'ticker', group: 'Actions', kind: 'Chart', keywords: ['graph', 'price'],
  run: t => { if (t) openDetail(t); } });
registerCommand({ id: 'set:cvd', title: 'Colorblind-friendly palette', group: 'Settings', keywords: ['color', 'blue', 'orange', 'accessibility', 'cvd'],
  state: () => (prefs.cvd ? 'On' : 'Off'), run: () => setColorblind(!prefs.cvd) });
registerCommand({ id: 'set:notes', title: 'Plain-English notes under panel titles', group: 'Settings', keywords: ['explain', 'captions', 'help', 'beginner'],
  state: () => (notesOn() ? 'On' : 'Off'), run: () => setNotes(!notesOn()) });
registerCommand({ id: 'help:keys', title: 'Keyboard shortcuts', hint: '?', aliases: ['HELP', 'KEYS'], group: 'Settings', kind: 'Help', keywords: ['shortcuts', 'mnemonics', 'help'],
  run: () => toggleSheet(true) });

// ---------------------------------------------------------------------------
// Chrome: index readout, tape, market state, clock, freshness
// ---------------------------------------------------------------------------
const READOUT = [['^GSPC', 'S&P 500', 'SPX'], ['^NDX', 'Nasdaq 100', 'NDX'], ['^VIX', 'VIX volatility index', 'VIX'], ['^TNX', '10-year Treasury yield', '10Y']];
function renderReadout(S) {
  $('#readout').innerHTML = READOUT.map(([s, name, short]) => {
    const x = S.strip.find(r => r.s === s);
    if (!x) return '';
    const q = x.q, isY = x.kind === 'yield';
    const chg = isY ? `${q.ch >= 0 ? '+' : ''}${(q.ch * 100).toFixed(1)}bp` : fmtPct(q.c);
    const tone = s === '^VIX' ? (q.c > 0 ? 'down' : q.c < 0 ? 'up' : 'flat') : isY ? 'flat' : cls(q.c);
    return `<button type="button" class="ro" data-sym="${esc(s)}" title="${esc(name)} · open chart"><b>${short}</b><span>${isY ? q.p.toFixed(2) + '%' : fmtPrice(q.p)}</span><span class="${tone}">${chg}</span></button>`;
  }).join('');
}

const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function tickClock() {
  $('#clockET').textContent = etFmt.format(new Date());
  const S = store.S;
  if (!S) return;
  const last = S.status?.quotes;
  const age = last ? Math.max(0, Math.floor((Date.now() - last) / 1000)) : null;
  const el = $('#updated');
  const elapsed = age < 60 ? age + 's' : age < 3600 ? Math.floor(age / 60) + 'm' : Math.floor(age / 3600) + 'h';
  el.textContent = !store.connected ? 'Reconnecting…' : last ? `Updated ${elapsed} ago` : 'Waiting for quotes';
  el.classList.toggle('stale', !store.connected || !last || age > 120);
}
setInterval(tickClock, 1000);
tickClock();

function renderStatus(S) {
  const map = { REGULAR: ['open', 'Market open'], PRE: ['ext', 'Pre-market'], POST: ['ext', 'After hours'], POSTPOST: ['', 'Market closed'], PREPRE: ['', 'Market closed'], CLOSED: ['', 'Market closed'] };
  const [klass, txt] = map[S.market.state] || ['', S.market.state || '—'];
  const el = $('#mktState');
  el.className = 'mkt-state ' + klass;
  el.querySelector('.txt').textContent = txt;
  el.title = 'US stock market: ' + txt.toLowerCase();
  const errs = S.status?.errors || [];
  $('#statusLine').textContent = errs.length ? ` · Last data warning: ${errs[0]}` : '';
}

function renderChrome() {
  const S = store.S;
  try { P.renderTape($('#tapeInner'), S.stocks); } catch (e) { console.error('tape', e); }
  try { renderReadout(S); } catch (e) { console.error('readout', e); }
  renderStatus(S);
}

// ---------------------------------------------------------------------------
// View menu (palette, notes, shortcuts)
// ---------------------------------------------------------------------------
const viewBtn = $('#viewBtn'), viewMenu = $('#viewMenu');
function paintView() {
  for (const b of viewMenu.querySelectorAll('[data-pref]')) b.setAttribute('aria-checked', String(b.dataset.pref === 'cvd' ? prefs.cvd : notesOn()));
}
function setViewOpen(open) {
  viewMenu.hidden = !open;
  viewBtn.setAttribute('aria-expanded', String(open));
  if (open) { paintView(); viewMenu.querySelector('[role^="menuitem"]').focus(); }
}
viewBtn.addEventListener('click', () => setViewOpen(viewMenu.hidden));
viewMenu.addEventListener('click', e => {
  const b = e.target.closest('[role^="menuitem"]');
  if (!b) return;
  if (b.dataset.pref === 'cvd') setColorblind(!prefs.cvd);
  else if (b.dataset.pref === 'notes') setNotes(!notesOn());
  else if (b.dataset.act === 'keys') { setViewOpen(false); toggleSheet(true); return; }
  paintView();
});
viewMenu.addEventListener('keydown', e => {
  const items = [...viewMenu.querySelectorAll('[role^="menuitem"]')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
  else if (e.key === 'Escape') { e.stopPropagation(); setViewOpen(false); viewBtn.focus(); }
  else if (e.key === 'Tab') setViewOpen(false);
});
document.addEventListener('click', e => { if (!viewMenu.hidden && !e.target.closest('.view')) setViewOpen(false); });
addEventListener('mp:notes', paintView);

// ---------------------------------------------------------------------------
// Global behaviour
// ---------------------------------------------------------------------------
// Any element with data-sym opens the detail drawer.
document.addEventListener('click', e => {
  if (e.target.closest('#drawer') || e.target.closest('.heatmap') || e.target.closest('.cmd')) return;
  const el = e.target.closest('[data-sym]');
  if (el && !e.target.closest('a')) openDetail(el.dataset.sym);
});
// Keyboard: role=button tiles with data-sym open on Enter / Space.
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-sym][role="button"], .tick[data-sym], .vtile[data-sym], .theme[data-sym]')) { e.preventDefault(); openDetail(e.target.dataset.sym); }
});

on('prefs', () => { paintView(); if (store.S) renderChrome(); renderActive({ force: true }); });
on('watch', () => refreshDetail());

// Width only: phone browsers fire resize when the address bar slides in and out while scrolling.
let lastW = innerWidth;
addEventListener('resize', debounce(() => { if (innerWidth !== lastW) { lastW = innerWidth; renderActive({ force: true }); } }, 250));

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
async function loadSparks(v) {
  if (v === store.sparksVersion) return;
  try {
    const j = await (await fetch('/api/sparks')).json();
    store.sparks = j.sparks || {};
    store.sparksVersion = j.v;
    emit('sparks');
    renderActive();
  } catch { /* retry next snapshot */ }
}

let first = true;
function onSnapshot(S) {
  store.S = S;
  buildIndex(S);
  if (first) {
    first = false;
    const boot = $('#boot');
    boot?.classList.add('hide');
    setTimeout(() => boot?.remove(), 450);
    renderActive({ force: true });
  } else renderActive();
  renderChrome();
  try { refreshDetail(); } catch (e) { console.error('detail', e); }
  emit('snapshot', S);
  if (S.sparksVersion && S.sparksVersion !== store.sparksVersion) loadSparks(S.sparksVersion);
}

function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('snapshot', ev => { store.connected = true; onSnapshot(JSON.parse(ev.data)); });
  es.onopen = () => { store.connected = true; };
  es.onerror = () => { store.connected = false; };
}

setInterval(() => refreshExtra().then(() => emit('watch')), 30000);

initUI();
initDetail(lookup, watch);
initShell();
initCommandBar({ openDetail, openCompany: s => go('research', 'company', { params: { s } }) });
refreshExtra().then(() => emit('watch'));
connect();
