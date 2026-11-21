// Shared client state: the latest live snapshot, 30-session sparklines, the
// symbol lookup used by the drawer and news chips, the watchlist and the
// display preferences. Workspaces read from here; app.js writes to it.
import { setCVD } from './util.js';

export const store = {
  S: null,            // latest /api/stream snapshot (null until the first one)
  sparks: {},         // { [yahooSymbol]: number[] } last 30 sessions
  sparksVersion: 0,
  connected: false,
};

// ---------- tiny event bus: 'snapshot', 'sparks', 'prefs', 'watch' ----------
const subs = new Map();
export function on(evt, fn) { if (!subs.has(evt)) subs.set(evt, new Set()); subs.get(evt).add(fn); return () => subs.get(evt).delete(fn); }
export function emit(evt, detail) { for (const fn of subs.get(evt) || []) { try { fn(detail); } catch (e) { console.error(evt, e); } } }

// ---------- symbol lookup ----------
const index = new Map();
const extraQuotes = new Map();
export const shortSym = s => String(s).replace(/\d{3,}-USD$/, '').replace(/-USD$/, '');
export function buildIndex(S) {
  index.clear();
  for (const x of S.stocks) { const q = { ...x, label: x.s }; index.set(x.ys, q); index.set(x.s, q); }
  const addQ = (s, q, label) => { if (q && !index.has(s)) index.set(s, { ...q, label: label || q.s }); };
  for (const g of [S.strip, S.themes, S.assets, S.global, S.commodities, S.fx, S.rates, S.vol]) for (const x of g || []) addQ(x.s, x.q, x.label);
  for (const s of S.sectors || []) if (s.etfQ) addQ(s.etf, s.etfQ, s.etf);
  for (const f of S.futures || []) addQ(f.s, f.q, f.label);
  for (const c of S.crypto || []) addQ(c.s, c, shortSym(c.s));
}
/** lookup(sym) → live quote object (with .label) or null. */
export const lookup = s => index.get(s) || extraQuotes.get(s) || null;

// ---------- watchlist (per browser) ----------
let watchSyms = ['SPY', 'QQQ', 'TLT', 'GLD', 'NVDA', 'BTC-USD'];
try { const raw = localStorage.getItem('mp.watch'); if (raw) watchSyms = JSON.parse(raw); } catch { /* defaults */ }
const saveWatch = () => { try { localStorage.setItem('mp.watch', JSON.stringify(watchSyms)); } catch { /* ignore */ } };
export const watch = {
  list: () => watchSyms,
  has: s => watchSyms.includes(s),
  toggle(s) {
    watchSyms = watchSyms.includes(s) ? watchSyms.filter(x => x !== s) : [...watchSyms, s];
    saveWatch(); emit('watch'); refreshExtra().then(() => emit('watch'));
  },
  add(s) { if (!watchSyms.includes(s)) watch.toggle(s); },
};
/** Quotes for watchlist symbols that are not in the live snapshot. */
export async function refreshExtra() {
  const need = watchSyms.filter(s => !index.has(s));
  await Promise.all(need.map(async s => {
    try {
      const r = await fetch(`/api/quote?s=${encodeURIComponent(s)}`);
      if (r.ok) { const q = await r.json(); extraQuotes.set(s, { ...q, label: shortSym(s) }); }
    } catch { /* keep last */ }
  }));
}

// ---------- display preferences ----------
export const prefs = { cvd: false };
try { prefs.cvd = localStorage.getItem('mp.cvd') === '1'; } catch { /* storage unavailable */ }
setCVD(prefs.cvd);
document.body.classList.toggle('cvd', prefs.cvd);
/** setColorblind(on) — blue/orange palette everywhere; persisted; emits 'prefs'. */
export function setColorblind(on) {
  prefs.cvd = !!on;
  try { localStorage.setItem('mp.cvd', on ? '1' : '0'); } catch { /* ignore */ }
  setCVD(prefs.cvd);
  document.body.classList.toggle('cvd', prefs.cvd);
  emit('prefs', { cvd: prefs.cvd });
}
