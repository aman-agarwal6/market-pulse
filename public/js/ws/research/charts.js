// Small d3 charts for the Research workspace: period bar charts (revenue,
// net income, cash flow, EPS) and period line charts (margins). They measure
// their container, redraw on resize (ResizeObserver) and skip drawing while
// hidden, so switching tabs or workspaces never leaves them at width 0.
import { esc } from '../../ui.js';

const COLORS = { pos: 'var(--cyan)', neg: 'var(--down)', last: 'var(--amber)' };

/**
 * periodChart(el, { kind: 'bar' | 'line', labels, titles, series: [{ label, values, color }], fmt, height, empty })
 * Bars: first series only; negative bars hang below the zero line in red; the
 * latest period is drawn in amber. Lines: one per series with a dot and value
 * at every period.
 */
export function periodChart(el, opts) {
  let o = opts;
  let lastW = 0;
  el.classList.add('rs-pc');
  const draw = () => {
    const W = el.clientWidth;
    if (!W) return;
    lastW = W;
    const H = o.height || 132;
    const n = o.labels.length;
    const all = o.series.flatMap(s => s.values).filter(v => v != null && isFinite(v));
    if (!n || !all.length) { el.innerHTML = `<div class="rs-pc-empty">${esc(o.empty || 'Not reported')}</div>`; return; }
    const m = { t: 16, r: 6, b: 20, l: 6 };
    const x = d3.scaleBand(d3.range(n), [m.l, W - m.r]).paddingInner(o.kind === 'bar' ? 0.32 : 0).paddingOuter(o.kind === 'bar' ? 0.16 : 0.5);
    let lo = Math.min(0, d3.min(all)), hi = Math.max(0, d3.max(all));
    if (o.kind === 'line') { lo = Math.min(lo, d3.min(all)); hi = Math.max(hi, d3.max(all)); }
    if (lo === hi) hi = lo + 1;
    // Leave room for the value labels above positive and below negative bars.
    const y = d3.scaleLinear([lo, hi], [H - m.b - (lo < 0 ? 12 : 0), m.t]);
    const parts = [];
    parts.push(`<line class="rs-pc-zero" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`);
    const bw = x.bandwidth();
    o.labels.forEach((l, i) => {
      parts.push(`<text class="rs-pc-x" x="${x(i) + bw / 2}" y="${H - 5}" text-anchor="middle">${esc(l)}<title>${esc(o.titles?.[i] || l)}</title></text>`);
    });
    if (o.kind === 'bar') {
      const s = o.series[0];
      s.values.forEach((v, i) => {
        const cx = x(i) + bw / 2;
        if (v == null || !isFinite(v)) { parts.push(`<text class="rs-pc-na" x="${cx}" y="${y(0) - 4}" text-anchor="middle">n/a</text>`); return; }
        const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        const c = v < 0 ? COLORS.neg : i === n - 1 ? COLORS.last : COLORS.pos;
        parts.push(`<rect x="${x(i)}" y="${y0}" width="${bw}" height="${Math.max(1, y1 - y0)}" rx="1.5" fill="${c}" fill-opacity="${i === n - 1 || v < 0 ? 0.9 : 0.55}"><title>${esc((o.titles?.[i] || o.labels[i]) + ': ' + o.fmt(v))}</title></rect>`);
        const ly = v < 0 ? y1 + 11 : y0 - 4;
        parts.push(`<text class="rs-pc-v${v < 0 ? ' neg' : ''}" x="${cx}" y="${ly}" text-anchor="middle">${esc(o.fmt(v))}</text>`);
      });
    } else {
      o.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => (v == null || !isFinite(v) ? null : [x(i) + bw / 2, y(v), v]));
        const line = d3.line().defined(p => p).x(p => p[0]).y(p => p[1]);
        parts.push(`<path d="${line(pts)}" fill="none" stroke="${s.color}" stroke-width="1.6"/>`);
        pts.forEach((p, i) => {
          if (!p) return;
          // Values sit in the legend above the chart and in each dot's tooltip.
          parts.push(`<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${s.color}" stroke="var(--panel)" stroke-width="1.2"><title>${esc(s.label + ', ' + (o.titles?.[i] || o.labels[i]) + ': ' + o.fmt(p[2]))}</title></circle>`);
        });
      });
    }
    el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(o.aria || '')}">${parts.join('')}</svg>`;
  };
  const ro = new ResizeObserver(() => { if (el.clientWidth && el.clientWidth !== lastW) draw(); });
  ro.observe(el);
  draw();
  return { update(next) { o = { ...o, ...next }; draw(); }, destroy() { ro.disconnect(); } };
}
