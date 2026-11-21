// Shared building blocks for Macro panels: a chart panel with a range
// selector, a renderer that turns series keys into a tsChart (recession
// shading, reference lines, consistent formats), and the source badge text.
import { panelHTML, segHTML, setSourceBadge, emptyStateHTML, esc } from '../../ui.js';
import { series, slice, RANGES } from './data.js';
import { fmtVal, axisFmt, spec, tipDateFor, period } from './fmt.js';
import { line } from './charts.js';

/** UI state shared by the macro sections (ranges per panel, selections). */
export const ui = { range: {}, pick: {} };

/** rangeSeg(id, value, options) → segmented control whose clicks set ui.range[id]. */
export const rangeSeg = (id, value, options = RANGES) => {
  ui.range[id] ??= value;
  return segHTML({ id: id + '-rng', small: true, value: ui.range[id], label: 'Time range', options });
};

/**
 * chartPanelHTML({ id, span, title, sub, note, info, range, ranges, extraControls, height, below, source })
 * A panel with a chart container (#id-c), an optional block under it (#id-x) and a FRED badge.
 */
export function chartPanelHTML({ id, span = 6, title, sub = '', note, info, range = '10Y', ranges = RANGES, extraControls = '', height = 240, below = '', cls = '', source = 'FRED' }) {
  return panelHTML({
    id, span, title, sub, note, info, cls: 'mpanel ' + cls,
    controls: extraControls + (ranges ? rangeSeg(id, range, ranges) : ''),
    body: `<div class="mchart-box" id="${id}-c" style="min-height:${height + 24}px"></div>${below ? `<div class="mp-below" id="${id}-x">${below}</div>` : ''}`,
    footer: `<span class="mp-foot" id="${id}-f"></span>`,
    source: { source, label: 'loading' },
  });
}

/** Update a panel's badge: label text (data dates), stale / failed state. */
export function badge(panelId, { label, source, stale = false, error = null }) {
  const p = document.getElementById(panelId);
  const b = p?.querySelector('.panel-foot .src');
  if (!b) return;
  if (source) b.dataset.src = source;
  b.dataset.srcLabel = label || '';
  setSourceBadge(b, { error, stale });
}

/** "CPIAUCSL Sep 2026 · DFF Nov 19, 2026" style label for the series used in a panel. */
export function seriesBadgeLabel(list) {
  const parts = [];
  for (const s of list) if (s?.latest) parts.push(`${s.id} ${period(s.latest.date, s.freq)}`);
  return parts.join(' · ');
}

/** Footer note listing series that failed to load. */
function failedNote(keys) {
  const bad = keys.map(k => series(k, { allowFailed: true })).filter(s => s && s.meta?.ok === false);
  return bad.length ? `<span class="mp-warn">Not available: ${bad.map(s => esc(s.title) + (s.meta.error ? ` (${esc(s.meta.error)})` : '')).join('; ')}</span>` : '';
}

/**
 * renderLines(D, panelId, { lines:[{ key, label, color, dash, width, area, data }], refs, height, yKey,
 *   bands(extra), recessions = true, range, tipFreq, foot })
 * Draws the chart in #panelId-c. Each line takes its data from the series key
 * unless `data` is given. Returns the series objects used.
 */
export function renderLines(D, panelId, o) {
  const el = document.getElementById(panelId + '-c');
  if (!el) return [];
  const range = o.range ?? ui.range[panelId] ?? 'Max';
  const used = [];
  const lines = [];
  for (const l of o.lines) {
    const s = l.key ? series(l.key) : null;
    if (l.key && !s) continue;
    if (s) used.push(s);
    const pts = l.data || s.points;
    lines.push({
      id: l.key || l.id, label: l.label || s?.title, color: l.color, dash: l.dash, width: l.width ?? 1.6, area: l.area,
      fmt: l.fmt || (v => fmtVal(l.fmtKey || l.key || o.yKey, v)),
      data: slice(pts, range),
    });
  }
  if (o.alignStart && lines.length > 1) {
    // Start every line where the shortest one starts (e.g. TIPS data begin in 2003).
    const start = Math.max(...lines.map(l => +(l.data.find(p => p.v != null)?.t || 0)));
    for (const l of lines) l.data = l.data.filter(p => +p.t >= start);
  }
  const yKey = o.yKey || o.lines[0].key;
  // Reference lines are named in the panel foot, not on the plot, where their
  // labels would collide with the latest data point at the right edge.
  const refList = o.refs ?? spec(o.yKey || o.lines[0].key).refs;
  const refKeys = refList.filter(r => r.label && r.v !== 0 || (r.v === 0 && r.label && r.label.length > 2))
    .map(r => `<span class="mp-key"><i class="mp-key-ref"></i>${esc(r.label)}</span>`).join('');
  const foot = document.getElementById(panelId + '-f');
  if (foot) foot.innerHTML = (o.foot || '') + refKeys + failedNote(o.lines.map(l => l.key).filter(Boolean));
  if (!lines.length) {
    el.innerHTML = emptyStateHTML({ icon: 'chart', title: 'Data not available', message: 'The source for this chart did not load. It will retry on the next refresh.' });
    badge(panelId, { label: 'unavailable', error: 'not available' });
    return used;
  }
  if (el.querySelector('.state')) el.innerHTML = '';
  const refs = refList.map(r => ({ v: r.v, color: r.color || 'var(--ink-3)' }));
  const bands = [...(o.recessions === false ? [] : D.recessionBands), ...(o.bands || [])];
  line(el, {
    series: lines, height: o.height || 240, refs, bands,
    yFmt: o.yFmt || axisFmt(yKey), tipDate: tipDateFor(o.tipFreq || used[0]?.freq || 'M'),
    legend: o.legend ?? lines.length > 1, zero: !!o.zero, yDomain: o.yDomain || null,
    ariaLabel: o.aria || lines.map(l => l.label).join(', ') + ' chart, ' + (range === 'Max' ? 'full history' : 'last ' + range),
    empty: 'No data in this range.',
  });
  badge(panelId, { label: seriesBadgeLabel(used), stale: used.some(s => s.meta?.stale) });
  return used;
}

/** Wire every range selector under root (delegated). onChange(panelId, value). */
export function wireRanges(root, onChange) {
  root.addEventListener('click', e => {
    const b = e.target.closest('.seg[id$="-rng"] button');
    if (!b) return;
    const segEl = b.closest('.seg');
    for (const x of segEl.querySelectorAll('button')) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }
    const id = segEl.id.slice(0, -4);
    ui.range[id] = b.dataset.v;
    onChange(id, b.dataset.v);
  });
}

/** Recession shading legend chip for panel feet. */
export const RECESSION_KEY = '<span class="mp-key"><i class="mp-key-rec"></i>NBER recession</span>';
