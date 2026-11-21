// Command bar: one input that finds tickers (S&P 500 locally + /api/search)
// and app commands (destinations, settings, actions). Keyboard-first:
// "/" or Ctrl+K focuses it, ↑/↓ move, Enter runs, Esc clears/closes.
//
// registerCommand({
//   id: 'dca',                       // unique
//   title: 'DCA simulator',          // what the row says
//   hint: 'DCA',                     // terminal-style mnemonic: shown on the row, typed to match exactly
//   aliases: ['DOLLARCOST'],         // more exact-match words (optional)
//   keywords: ['dollar cost averaging', 'monthly investing'],   // fuzzy search words (optional)
//   group: 'Go to' | 'Actions' | 'Settings',   // default 'Actions'
//   kind: 'Tool',                    // small label on the left (optional)
//   arg: 'ticker',                   // the command takes text after the mnemonic: "DCA VOO"
//   state: () => 'On',               // optional right-hand status (settings)
//   run: (arg) => {},                // arg = text after the mnemonic ('' when none)
// })
// Typing "DCA VOO" runs run('VOO'). Typing just "DCA" and Enter fills "DCA "
// so the user can add the argument.
import { esc, debounce, fmtPct, cls } from './util.js';
import { fetchJSON } from './ui.js';
import { store, lookup } from './store.js';

const registry = new Map();
export function registerCommand(cmd) {
  if (!cmd?.id || typeof cmd.run !== 'function') throw new Error('registerCommand needs id and run');
  registry.set(cmd.id, { group: 'Actions', aliases: [], keywords: [], ...cmd });
}
export const getCommands = () => [...registry.values()];
/** Commands that have a mnemonic, for the shortcuts sheet. */
export const commandHints = () => getCommands().filter(c => c.hint).sort((a, b) => a.hint.localeCompare(b.hint));
/** runCommand(id, arg) — run a registered command programmatically. */
export function runCommand(id, arg = '') { registry.get(id)?.run(arg); }

const GROUP_ORDER = ['Tickers', 'Go to', 'Actions', 'Settings', 'Recent'];
const TYPE_LABEL = { EQUITY: 'Stock', ETF: 'ETF', INDEX: 'Index', CRYPTOCURRENCY: 'Crypto', FUTURE: 'Future', CURRENCY: 'FX', MUTUALFUND: 'Fund', OPTION: 'Option' };

function scoreCommand(c, q) {
  const Q = q.toUpperCase();
  const words = [c.hint, ...c.aliases].filter(Boolean).map(s => s.toUpperCase());
  const [first, ...rest] = Q.split(/\s+/);
  if (c.arg) {
    if (words.includes(first)) return { score: rest.length ? 130 : 105, arg: q.slice(first.length).trim() };
    if (rest.length) return null;
  }
  if (words.includes(Q)) return { score: 110 };
  const t = c.title.toLowerCase(), ql = q.toLowerCase();
  if (t.startsWith(ql)) return { score: 72 };
  const hay = [t, ...c.keywords.map(k => k.toLowerCase())];
  const toks = ql.split(/\s+/).filter(Boolean);
  if (toks.every(tok => hay.some(h => h.split(/[\s›/&,-]+/).some(w => w.startsWith(tok))))) return { score: 58 };
  if (words.some(w => w.startsWith(Q)) && Q.length >= 2) return { score: 50 };
  if (hay.some(h => h.includes(ql)) && ql.length >= 3) return { score: 32 };
  return null;
}

let input, list, wrap;
let items = [];     // flattened visible rows
let sel = 0;
let remote = [];    // last /api/search result for the current query
let openDetailFn = () => {};
const RECENT_KEY = 'mp.recent';
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
function pushRecent(s, n) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([{ s, n }, ...recent().filter(x => x.s !== s)].slice(0, 5))); } catch { /* ignore */ }
}

function tickerRow(x, score) {
  const q = lookup(x.s);
  return { group: 'Tickers', kind: TYPE_LABEL[x.type] || x.type || 'Ticker', title: x.s, sub: x.n || '', score,
    right: q?.c != null ? `<span class="${cls(q.c)}">${fmtPct(q.c)}</span>` : esc(x.exch || ''), run: () => { pushRecent(x.s, x.n); openDetailFn(x.s); } };
}

function compute() {
  const q = input.value.trim();
  const rows = [];
  if (!q) {
    for (const r of recent()) rows.push({ group: 'Recent', kind: 'Ticker', title: r.s, sub: r.n || '', score: 1, run: () => openDetailFn(r.s) });
    for (const c of getCommands()) if (c.group === 'Go to' && c.kind === 'Workspace' || c.group === 'Settings') rows.push(cmdRow(c, { score: 0 }));
  } else {
    for (const c of getCommands()) { const m = scoreCommand(c, q); if (m) rows.push(cmdRow(c, m)); }
    const argCmd = rows.some(r => r.score >= 130);
    if (!argCmd && !/\s/.test(q)) {
      const Q = q.toUpperCase();
      const local = (store.S?.stocks || []).filter(x => x.s.startsWith(Q) || (Q.length > 2 && x.n.toUpperCase().includes(Q)))
        .sort((a, b) => (b.s === Q) - (a.s === Q) || (b.s.startsWith(Q)) - (a.s.startsWith(Q)) || b.mc - a.mc).slice(0, 4);
      const seen = new Set();
      for (const x of local) { seen.add(x.ys); rows.push(tickerRow({ s: x.ys, n: x.n, type: 'EQUITY', exch: 'S&P 500' }, x.s === Q ? 100 : 56)); }
      remote.forEach((x, i) => { if (!seen.has(x.s)) { seen.add(x.s); rows.push(tickerRow(x, x.s.toUpperCase() === Q ? 100 : 48 - i)); } });
    }
  }
  // Group order follows each group's best match; rows keep score order inside a group.
  const best = {};
  for (const r of rows) best[r.group] = Math.max(best[r.group] ?? -1, r.score);
  const groups = Object.keys(best).sort((a, b) => q ? best[b] - best[a] || GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b) : GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  items = groups.flatMap(g => rows.filter(r => r.group === g).sort((a, b) => b.score - a.score).slice(0, g === 'Tickers' ? 7 : 8));
  sel = 0;
  render();
}

function cmdRow(c, m) {
  const arg = m.arg ?? '';
  const needsArg = c.arg && !arg;
  return {
    group: c.group, kind: c.kind || (c.group === 'Settings' ? 'Setting' : 'Action'),
    title: c.arg && arg ? `${c.title}: ${arg.toUpperCase()}` : c.title,
    sub: needsArg ? `Type ${c.hint} then a ${c.arg}` : c.sub || '',
    hint: c.hint ? c.hint + (c.arg ? ' ‹' + c.arg + '›' : '') : '', key: c.key || '',
    right: c.state ? esc(c.state()) : '', score: m.score,
    run: needsArg ? () => { input.value = c.hint + ' '; compute(); return 'keep'; } : () => c.run(arg.toUpperCase()),
  };
}

function render() {
  let g = null, html = '';
  items.forEach((r, i) => {
    if (r.group !== g) { if (g) html += '</div>'; g = r.group; html += `<div class="cmd-g" role="group" aria-label="${esc(g)}"><div class="cmd-gh" aria-hidden="true">${esc(g)}</div>`; }
    html += `<div class="cmd-item${i === sel ? ' sel' : ''}" role="option" id="cmd-o${i}" aria-selected="${i === sel}" data-i="${i}">
      <span class="cmd-kind">${esc(r.kind)}</span>
      <span class="cmd-main"><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
      <span class="cmd-right">${r.right || ''}${r.hint ? `<kbd>${esc(r.hint)}</kbd>` : ''}${r.key ? `<kbd class="k">${esc(r.key)}</kbd>` : ''}</span></div>`;
  });
  if (g) html += '</div>';
  const q = input.value.trim();
  if (!items.length && q) html = `<div class="cmd-none">Press Enter to open a chart for <b>${esc(q.toUpperCase())}</b></div>`;
  list.innerHTML = html + `<div class="cmd-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span><span class="cmd-foot-r">Try <kbd>GP AAPL</kbd> <kbd>WEI</kbd> <kbd>MOST</kbd></span></div>`;
  setOpen(document.activeElement === input);
  input.setAttribute('aria-activedescendant', items.length ? 'cmd-o' + sel : '');
  list.querySelector('.cmd-item.sel')?.scrollIntoView({ block: 'nearest' });
}

function setOpen(on) {
  wrap.classList.toggle('open', on);
  input.setAttribute('aria-expanded', String(on));
}

function pick(i) {
  const r = items[i];
  const q = input.value.trim();
  if (!r) { if (q) { openDetailFn(q.toUpperCase()); pushRecent(q.toUpperCase(), ''); } close(); return; }
  if (r.run() === 'keep') return;
  close();
}
function close() { input.value = ''; remote = []; items = []; setOpen(false); input.blur(); }

const searchRemote = debounce(async q => {
  try {
    const r = await fetchJSON(`/api/search?q=${encodeURIComponent(q)}`, { timeout: 8000, ttl: 60000 });
    if (input.value.trim() !== q) return; // moved on
    remote = Array.isArray(r) ? r.slice(0, 7) : [];
    compute();
  } catch { /* local results only */ }
}, 160);

/** initCommandBar({ openDetail }) — wires #cmdInput / #cmdList. */
export function initCommandBar({ openDetail }) {
  openDetailFn = openDetail;
  input = document.getElementById('cmdInput');
  list = document.getElementById('cmdList');
  wrap = input.closest('.cmd');
  input.addEventListener('input', () => {
    const q = input.value.trim();
    remote = [];
    compute();
    if (q && !/\s/.test(q) && q.length <= 24) searchRemote(q);
  });
  input.addEventListener('focus', () => { compute(); input.select(); });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) setOpen(false); }, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
    } else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (input.value) { input.value = ''; compute(); } else close(); }
  });
  list.addEventListener('mousedown', e => {
    const it = e.target.closest('[data-i]');
    e.preventDefault();
    if (it) pick(+it.dataset.i);
  });
  list.addEventListener('mousemove', e => {
    const it = e.target.closest('[data-i]');
    if (it && +it.dataset.i !== sel) { sel = +it.dataset.i; for (const el of list.querySelectorAll('.cmd-item')) { const on = +el.dataset.i === sel; el.classList.toggle('sel', on); el.setAttribute('aria-selected', on); } input.setAttribute('aria-activedescendant', 'cmd-o' + sel); }
  });
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); input.focus(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); input.focus(); }
  });
  // Any button with data-cmd="<id>" runs that command (empty states use this).
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cmd]');
    if (b && b.dataset.cmd) { e.preventDefault(); runCommand(b.dataset.cmd, b.dataset.arg || ''); }
  });
}
