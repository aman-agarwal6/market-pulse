// Shared helpers: formatting, color scales, tooltip, sparklines.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Formatting ----------
export function fmtPrice(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 8;
  return v.toLocaleString('en-US', { minimumFractionDigits: a >= 100000 ? 0 : d, maximumFractionDigits: a >= 100000 ? 0 : d });
}
export function fmtPct(v, d = 2, sign = true) {
  if (v == null || !isFinite(v)) return '—';
  return (sign && v > 0 ? '+' : '') + v.toFixed(d) + '%';
}
export function fmtChg(v, d = 2) {
  if (v == null || !isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function fmtBig(v, prefix = '') {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return prefix + (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return prefix + (v / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return prefix + (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return prefix + (v / 1e3).toFixed(1) + 'K';
  return prefix + v.toFixed(0);
}
export const cls = v => (v == null ? 'flat' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
export const arrow = v => (v == null ? '' : v > 0 ? '▲' : v < 0 ? '▼' : '■');

export function timeAgo(sec) {
  const d = Date.now() / 1000 - sec;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}

// ---------- Color: diverging red ← gray → green (finviz-style) ----------
const PAL = {
  normal: ['#f63538', '#bf4045', '#8b444e', '#414554', '#35764e', '#2f9e4f', '#30cc5a'],
  cvd: ['#e66100', '#b5591f', '#7d5137', '#414554', '#2f5e8f', '#2b75c7', '#3d9bff'],
};
let palette = PAL.normal;
export function setCVD(on) { palette = on ? PAL.cvd : PAL.normal; }
export function getPalette() { return palette; }

/** Returns a color for value v where ±max saturates. */
export function heatColor(v, max = 3) {
  if (v == null || !isFinite(v)) return '#2a2e38';
  const t = Math.max(-1, Math.min(1, v / max));
  const pos = (t + 1) * 3; // 0..6
  const i = Math.min(5, Math.floor(pos));
  return d3.interpolateRgb(palette[i], palette[i + 1])(pos - i);
}
export function upColor() { return palette[6]; }
export function downColor() { return palette[0]; }

// Scale per timeframe (how big a move saturates the color)
export const TF_MAX = { c: 3, w: 6, m: 10, q: 15, ytd: 25, y: 35 };
export const TF_LABEL = { c: '1D', w: '1W', m: '1M', q: '3M', ytd: 'YTD', y: '1Y' };

// ---------- Tooltip ----------
const tt = () => document.getElementById('tooltip');
export function showTip(html, ev) {
  const el = tt();
  el.innerHTML = html;
  el.classList.add('show');
  moveTip(ev);
}
export function moveTip(ev) {
  const el = tt();
  const pad = 16;
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}
export function hideTip() { tt().classList.remove('show'); }

// ---------- Sparkline (inline SVG string) ----------
export function sparkSVG(values, { w = 120, h = 26, color, fill = true, base = null } = {}) {
  if (!values || values.length < 2) return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"></svg>`;
  const v = values.filter(x => x != null && isFinite(x));
  if (v.length < 2) return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"></svg>`;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (base != null) { lo = Math.min(lo, base); hi = Math.max(hi, base); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const x = i => (i / (v.length - 1)) * w;
  const y = val => h - 2 - ((val - lo) / (hi - lo)) * (h - 4);
  const pts = v.map((val, i) => `${x(i).toFixed(1)},${y(val).toFixed(1)}`).join(' ');
  const c = color || (v.at(-1) >= (base ?? v[0]) ? upColor() : downColor());
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  const area = fill ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${c};stop-opacity:.28"/><stop offset="1" style="stop-color:${c};stop-opacity:0"/></linearGradient></defs><polygon points="0,${h} ${pts} ${w},${h}" fill="url(#${id})"/>` : '';
  const baseLine = base != null ? `<line x1="0" x2="${w}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}" stroke="#3a4250" stroke-width="1" stroke-dasharray="2 2"/>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="${w}" height="${h}">${area}${baseLine}<polyline points="${pts}" fill="none" style="stroke:${c}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

export function pill(v, max = 3, d = 2) {
  return `<span class="pill" style="background:${heatColor(v, max)}">${fmtPct(v, d)}</span>`;
}

/** Segmented control wiring: marks the pressed button (.on + aria-pressed) and calls onChange(value). */
export function seg(el, onChange) {
  el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.classList.contains('on'))));
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    onChange(b.dataset.v);
  });
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
