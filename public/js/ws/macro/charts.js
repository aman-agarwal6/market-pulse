// Macro charts. Line charts go through the shared tsChart (one instance per
// container, updated in place). Two shapes tsChart does not draw are here:
// barChart (monthly payrolls, quarterly GDP) and fedPathChart (a step chart of
// futures-implied policy rates against today's target range).
import { tsChart } from '../../ui.js';
import { esc } from '../../util.js';

const charts = new Map();   // element id → tsChart instance

/** line(el, opts) — create or update the tsChart living in el. */
export function line(el, opts) {
  if (!el) return null;
  let c = charts.get(el.id);
  if (c && c.el !== el) { charts.delete(el.id); c = null; }
  const full = { log: false, normalize: null, yDomain: null, zero: false, bands: [], refs: [], legend: undefined, xTicks: null, tipDate: undefined, ...opts };
  if (c) c.update(full);
  else { c = tsChart(el, full); charts.set(el.id, c); }
  return c;
}

const COLORS = { bar: '#3cc8d6', neg: 'var(--down)', line: '#ffb000', ink3: 'var(--ink-3)' };

function frame(el, H) {
  el.classList.add('tsc', 'mchart');
  el.innerHTML = '<div class="tsc-legend" hidden></div><div class="tsc-plot" tabindex="0" role="img"></div><div class="tsc-tip" hidden></div>';
  const plot = el.querySelector('.tsc-plot');
  plot.style.height = H + 'px';
  return { plot, tip: el.querySelector('.tsc-tip'), legend: el.querySelector('.tsc-legend'), W: plot.clientWidth };
}
function placeTip(tip, px, W, top) {
  tip.hidden = false;
  const tw = tip.offsetWidth;
  tip.style.left = Math.max(0, px + 14 + tw > W - 8 ? px - tw - 14 : px + 14) + 'px';
  tip.style.top = top + 'px';
}
function wireHover(plot, n, xAt, show, hide) {
  let cur = null;
  const idxAt = cx => xAt(cx - plot.getBoundingClientRect().left);
  plot.onpointermove = e => { cur = idxAt(e.clientX); show(cur); };
  plot.onpointerdown = e => { cur = idxAt(e.clientX); show(cur); };
  plot.onpointerleave = e => { if (e.pointerType === 'mouse') { cur = null; hide(); } };
  plot.onblur = () => { cur = null; hide(); };
  plot.onkeydown = e => {
    const next = { ArrowLeft: (cur ?? n) - 1, ArrowRight: (cur ?? n - 2) + 1, Home: 0, End: n - 1 }[e.key];
    if (next != null) { e.preventDefault(); cur = Math.max(0, Math.min(n - 1, next)); show(cur); }
    else if (e.key === 'Escape') { cur = null; hide(); }
  };
}

/**
 * barChart(el, { data:[{t:Date,v}], overlay:[{t,v}], overlayLabel, label, height, yFmt, valFmt, tipDate,
 *                bands:[{from,to,label}], refs:[{v,label}], period:'M'|'Q', clipTo })
 * Bars for each period (negative bars in the "down" colour), optional line overlay.
 * clipTo: [lo, hi] clamps the y domain; bars beyond it are drawn to the edge and flagged.
 */
export function barChart(el, o) {
  if (!el) return;
  const H = o.height || 240;
  const { plot, tip, legend, W } = frame(el, H);
  if (!W) return;
  const data = o.data.filter(d => d.v != null);
  if (!data.length) { plot.innerHTML = '<div class="tsc-empty">No data for this range.</div>'; return; }
  const ov = (o.overlay || []).filter(d => d.v != null && d.t >= data[0].t);
  const m = { t: 10, r: 12, b: 22, l: 44 };
  const span = o.period === 'Q' ? 91 * 86400e3 : 30.4 * 86400e3;
  const x = d3.scaleUtc([data[0].t, new Date(+data.at(-1).t + span)], [m.l, W - m.r]);
  let [lo, hi] = d3.extent([...data, ...ov].map(d => d.v));
  lo = Math.min(lo, 0); hi = Math.max(hi, 0);
  if (o.clipTo) { lo = Math.max(lo, o.clipTo[0]); hi = Math.min(hi, o.clipTo[1]); }
  const y = d3.scaleLinear([lo, hi], [H - m.b, m.t]).nice(5);
  const [ylo, yhi] = y.domain();
  const clamp = v => Math.max(ylo, Math.min(yhi, v));
  const bw = Math.max(1, (x(new Date(+data[0].t + span)) - x(data[0].t)) * 0.72);
  const svg = d3.create('svg').attr('width', W).attr('height', H).attr('class', 'tsc-svg').attr('aria-hidden', 'true');
  const gb = svg.append('g');
  for (const b of o.bands || []) {
    const x0 = x(Math.max(b.from, x.domain()[0])), x1 = x(Math.min(b.to, x.domain()[1]));
    if (x1 > x0) gb.append('rect').attr('x', x0).attr('width', x1 - x0).attr('y', m.t).attr('height', H - m.b - m.t).attr('fill', b.color || 'var(--band)');
  }
  const yTicks = y.ticks(Math.max(3, Math.round(H / 55)));
  svg.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yTicks).tickSize(-(W - m.l - m.r)).tickFormat(''));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yTicks).tickFormat(o.yFmt).tickSizeOuter(0));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(W / 110))).tickSizeOuter(0));
  const g = svg.append('g');
  data.forEach(d => {
    const v = clamp(d.v), cut = v !== d.v;
    const x0 = x(d.t) + (x(new Date(+d.t + span)) - x(d.t) - bw) / 2;
    g.append('rect').attr('x', x0).attr('width', bw).attr('y', Math.min(y(v), y(0))).attr('height', Math.max(0.5, Math.abs(y(v) - y(0))))
      .attr('fill', d.v < 0 ? COLORS.neg : COLORS.bar).attr('opacity', d.v < 0 ? 0.8 : 0.62);
    if (cut) g.append('text').attr('class', 'mchart-cut').attr('x', x0 + bw / 2).attr('y', d.v < 0 ? H - m.b - 3 : m.t + 9).attr('text-anchor', 'middle').text('↕');
  });
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--ink-4)');
  for (const r of o.refs || []) {
    if (r.v === 0) continue;
    svg.append('line').attr('class', 'tsc-ref').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(r.v)).attr('y2', y(r.v)).attr('stroke', 'var(--ink-4)');
  }
  const mid = d => new Date(+d.t + span / 2);
  if (ov.length) {
    svg.append('path').attr('class', 'tsc-line').attr('d', d3.line().defined(d => d.v != null).x(d => x(mid(d))).y(d => y(clamp(d.v)))(ov))
      .attr('stroke', COLORS.line).attr('stroke-width', 1.8);
  }
  const xh = svg.append('line').attr('class', 'mchart-xh').attr('y1', m.t).attr('y2', H - m.b).style('display', 'none');
  plot.replaceChildren(svg.node());
  plot.setAttribute('aria-label', o.label || 'Bar chart');
  // legend
  legend.hidden = false;
  const lastOv = ov.at(-1);
  const renderLegend = d => {
    const ovAt = d ? ov.find(p => +p.t === +d.t) : lastOv;
    legend.innerHTML = `<span><i style="background:${COLORS.bar};opacity:.75"></i>${esc(o.barLabel || 'Value')}<b>${o.valFmt((d || data.at(-1)).v)}</b></span>` +
      (ov.length ? `<span><i style="background:${COLORS.line}"></i>${esc(o.overlayLabel || '')}<b>${ovAt ? o.valFmt(ovAt.v) : '—'}</b></span>` : '');
  };
  renderLegend(null);
  const show = i => {
    const d = data[i];
    if (!d) return;
    const px = x(mid(d));
    xh.style('display', null).attr('x1', px).attr('x2', px);
    const ovAt = ov.find(p => +p.t === +d.t);
    const band = (o.bands || []).find(b => d.t >= b.from && d.t <= b.to);
    tip.innerHTML = `<div class="tsc-tip-d">${esc(o.tipDate(d.t))}</div>
      <div class="tsc-tip-r"><i style="background:${d.v < 0 ? 'var(--down)' : COLORS.bar}"></i><span>${esc(o.barLabel || 'Value')}</span><b>${o.valFmt(d.v)}</b></div>
      ${ovAt ? `<div class="tsc-tip-r"><i style="background:${COLORS.line}"></i><span>${esc(o.overlayLabel)}</span><b>${o.valFmt(ovAt.v)}</b></div>` : ''}
      ${clamp(d.v) !== d.v ? '<div class="tsc-tip-b">Bar cut off at the chart edge</div>' : ''}
      ${band ? `<div class="tsc-tip-b">${esc(band.label)}</div>` : ''}`;
    placeTip(tip, px, W, legend.offsetHeight + m.t);
    renderLegend(d);
  };
  const hide = () => { tip.hidden = true; xh.style('display', 'none'); renderLegend(null); };
  const bis = d3.bisector(d => mid(d)).center;
  wireHover(plot, data.length, px => bis(data, x.invert(px)), show, hide);
}

/**
 * fedPathChart(el, { months:[{month:'2026-12', impliedRatePct, …}], effective, range:{low,high}, meetings:[{end, sep}], height })
 * Each month is a flat step at its implied average rate.
 */
export function fedPathChart(el, o) {
  if (!el) return;
  const H = o.height || 260;
  const { plot, tip, legend, W } = frame(el, H);
  if (!W) return;
  const mStart = s => { const [y, m] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)); };
  const mEnd = s => { const [y, m] = s.split('-').map(Number); return new Date(Date.UTC(y, m, 1)); };
  const months = o.months.map(p => ({ ...p, from: mStart(p.month), to: mEnd(p.month) }));
  const valid = months.filter(p => p.impliedRatePct != null);
  if (!valid.length) { plot.innerHTML = '<div class="tsc-empty">No usable futures quotes right now.</div>'; return; }
  const m = { t: 26, r: 64, b: 22, l: 44 };
  const x = d3.scaleUtc([months[0].from, months.at(-1).to], [m.l, W - m.r]);
  const vals = [...valid.map(p => p.impliedRatePct), o.effective, o.range?.low, o.range?.high].filter(v => v != null);
  const y = d3.scaleLinear([d3.min(vals) - 0.12, d3.max(vals) + 0.12], [H - m.b, m.t]).nice(6);
  const svg = d3.create('svg').attr('width', W).attr('height', H).attr('class', 'tsc-svg').attr('aria-hidden', 'true');
  const yTicks = y.ticks(Math.max(3, Math.round(H / 50)));
  svg.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yTicks).tickSize(-(W - m.l - m.r)).tickFormat(''));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yTicks).tickFormat(v => v.toFixed(2) + '%').tickSizeOuter(0));
  const mon = d3.utcFormat('%b');
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(d3.utcMonth.every(W < 560 ? 2 : 1)).tickFormat(d => d.getUTCMonth() === 0 ? d3.utcFormat('%Y')(d) : mon(d)).tickSizeOuter(0));
  // target range band + effective rate
  if (o.range) {
    svg.append('rect').attr('class', 'fp-range').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y(o.range.high)).attr('height', Math.max(1, y(o.range.low) - y(o.range.high)));
    svg.append('text').attr('class', 'fp-lab').attr('x', W - m.r + 6).attr('y', (y(o.range.high) + y(o.range.low)) / 2 - 2).text('Target');
    svg.append('text').attr('class', 'fp-lab').attr('x', W - m.r + 6).attr('y', (y(o.range.high) + y(o.range.low)) / 2 + 9).text(`${o.range.low.toFixed(2)}–${o.range.high.toFixed(2)}`);
  }
  if (o.effective != null) {
    svg.append('line').attr('class', 'fp-eff').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(o.effective)).attr('y2', y(o.effective));
  }
  // FOMC decision days
  const gm = svg.append('g');
  for (const mt of o.meetings || []) {
    const d = new Date(Date.UTC(+mt.end.slice(0, 4), +mt.end.slice(5, 7) - 1, +mt.end.slice(8, 10)));
    if (d < x.domain()[0] || d > x.domain()[1]) continue;
    const px = x(d);
    gm.append('line').attr('class', 'fp-mt').attr('x1', px).attr('x2', px).attr('y1', 14).attr('y2', H - m.b);
    gm.append('path').attr('class', 'fp-mt-dot' + (mt.sep ? ' sep' : '')).attr('d', `M${px - 4},4h8l-4,6z`);
  }
  // steps
  const g = svg.append('g');
  // draw as step segments joined vertically (gaps where a month has no quote)
  let seg = [];
  const segs = [];
  for (const p of months) {
    if (p.impliedRatePct == null) { if (seg.length) segs.push(seg); seg = []; continue; }
    seg.push([p.from, p.impliedRatePct], [p.to, p.impliedRatePct]);
  }
  if (seg.length) segs.push(seg);
  const base = y(o.effective ?? y.domain()[0]);
  for (const s of segs) g.append('path').attr('class', 'fp-area').attr('d', d3.area().x(d => x(d[0])).y0(base).y1(d => y(d[1]))(s));
  for (const s of segs) g.append('path').attr('class', 'fp-step').attr('d', d3.line().x(d => x(d[0])).y(d => y(d[1]))(s));
  // value labels (thinned when crowded)
  const slot = (x(months[0].to) - x(months[0].from));
  const every = slot < 30 ? 3 : slot < 40 ? 2 : 1;
  valid.forEach((p, i) => {
    if (i % every && i !== valid.length - 1) return;
    g.append('text').attr('class', 'fp-v').attr('x', (x(p.from) + x(p.to)) / 2).attr('y', y(p.impliedRatePct) - 5).attr('text-anchor', 'middle').text(r2(p.impliedRatePct));
  });
  const hl = svg.append('rect').attr('class', 'fp-hl').attr('y', m.t).attr('height', H - m.b - m.t).style('display', 'none');
  plot.replaceChildren(svg.node());
  plot.setAttribute('aria-label', 'Futures-implied average fed funds rate by month, ' + valid.map(p => `${p.month} ${r2(p.impliedRatePct)}%`).join(', '));
  legend.hidden = false;
  legend.innerHTML = `<span><i style="background:var(--amber)"></i>Implied monthly average</span><span><i class="fp-key-eff"></i>Effective rate today<b>${o.effective?.toFixed(2) ?? '—'}%</b></span><span><i class="fp-key-range"></i>Target range</span><span><i class="fp-key-mt"></i>FOMC decision</span>`;
  const meetIn = p => (o.meetings || []).filter(mt => mt.end.slice(0, 7) === p.month);
  const show = i => {
    const p = months[i];
    if (!p) return;
    hl.style('display', null).attr('x', x(p.from)).attr('width', x(p.to) - x(p.from));
    const mt = meetIn(p);
    tip.innerHTML = `<div class="tsc-tip-d">${esc(d3.utcFormat('%B %Y')(p.from))} · ${esc(p.symbol || '')}</div>` + (p.impliedRatePct == null
      ? `<div class="tsc-tip-b">No usable quote${p.reason ? ': ' + esc(p.reason) : ''}</div>`
      : `<div class="tsc-tip-r"><i style="background:var(--amber)"></i><span>Implied average</span><b>${p.impliedRatePct.toFixed(3)}%</b></div>
         <div class="tsc-tip-r"><i></i><span>vs effective today</span><b>${fmtBp(p.changeVsEffectiveBp)}</b></div>
         <div class="tsc-tip-r"><i></i><span>25 bp moves priced</span><b>${fmtMoves(p.moves25bpPriced)}</b></div>`) +
      (mt.length ? `<div class="tsc-tip-b">FOMC decision ${mt.map(z => esc(d3.utcFormat('%b %-d')(new Date(z.end + 'T12:00:00Z'))) + (z.sep ? ' (with projections)' : '')).join(', ')}</div>` : '');
    placeTip(tip, (x(p.from) + x(p.to)) / 2, W, legend.offsetHeight + m.t);
  };
  const hide = () => { tip.hidden = true; hl.style('display', 'none'); };
  wireHover(plot, months.length, px => { const t = x.invert(px); const i = months.findIndex(p => t >= p.from && t < p.to); return i < 0 ? (t < months[0].from ? 0 : months.length - 1) : i; }, show, hide);
}
export const fmtBp = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(Math.abs(v) % 1 ? 1 : 0) + ' bp';
export const fmtMoves = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
/** Round half up to 2 decimals (4.045 → "4.05"; plain toFixed gives 4.04 from the float). */
export const r2 = v => (Math.round(v * 100 + 1e-7) / 100).toFixed(2);
