// Long-Term: custom d3 charts that tsChart (ui.js) does not cover — the
// price + underwater pair, the decline overlay, strip plots, the projection
// fan, the correlation matrix and the risk/return scatter. Each chart sizes
// itself from its container (ResizeObserver), skips drawing while hidden and
// redraws when it becomes visible again. Colours come from CSS tokens.
import { showTip, moveTip, hideTip } from '../../util.js';
import { esc, fmtDate, pct, num, usd } from './fmt.js';

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const parseDay = d3.utcParse('%Y-%m-%d');

/** Calls draw(width) now (if visible) and whenever the width changes. */
export function autoSize(el, draw) {
  let w = 0, raf = 0;
  const run = () => { const W = el.clientWidth; if (W && W !== w) { w = W; draw(W); } };
  const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); });
  ro.observe(el);
  run();
  return { redraw() { const W = el.clientWidth; if (W) { w = W; draw(W); } }, destroy() { ro.disconnect(); } };
}

function tipEl(el) {
  let t = el.querySelector(':scope > .tsc-tip');
  if (!t) { t = document.createElement('div'); t.className = 'tsc-tip'; t.hidden = true; el.appendChild(t); }
  return t;
}
function placeTip(tip, el, px, py, W) {
  tip.hidden = false;
  const tw = tip.offsetWidth;
  tip.style.left = Math.max(0, px + 14 + tw > W ? px - tw - 14 : px + 14) + 'px';
  tip.style.top = Math.max(0, py) + 'px';
}
const tipRow = (color, label, value) => `<div class="tsc-tip-r"><i style="background:${color}"></i><span>${esc(label)}</span><b>${value}</b></div>`;

// ---------------------------------------------------------------------------
// Drawdown history: S&P 500 price (log) over its underwater curve.
// ---------------------------------------------------------------------------
/**
 * drawdownChart(el, { dates, close, uw, episodes, from, onEpisode })
 * dates: ISO weekly dates; close; uw = % below the prior record (≤ 0).
 * episodes: [{ peakDate, troughDate, recoveryDate|null, depthPct }].
 * Returns { update(opts), highlight(i|null) }.
 */
export function drawdownChart(el, initial) {
  let o = { ...initial };
  let hi = null;
  let ctx = null;
  el.classList.add('lt-dd');
  el.innerHTML = '<div class="lt-dd-plot" role="img"></div>';
  const plot = el.firstChild;
  const tip = tipEl(el);
  let pts = [];

  function prep() {
    pts = [];
    for (let i = 0; i < o.dates.length; i++) if (!o.from || o.dates[i] >= o.from) pts.push({ t: parseDay(o.dates[i]), d: o.dates[i], c: o.close[i], u: o.uw[i] });
  }

  function draw(W) {
    if (!pts.length) return;
    const H1 = o.h1 || 230, gap = 26, H2 = o.h2 || 120, axisH = 20;
    const H = H1 + gap + H2 + axisH;
    const m = { l: 50, r: 14, t: 8 };
    const x = d3.scaleUtc([pts[0].t, pts[pts.length - 1].t], [m.l, W - m.r]);
    const cExt = d3.extent(pts, p => p.c);
    const y1 = d3.scaleLog([cExt[0] * 0.9, cExt[1] * 1.1], [m.t + H1, m.t]);
    const uMin = Math.min(-25, d3.min(pts, p => p.u));
    const top2 = m.t + H1 + gap;
    const y2 = d3.scaleLinear([uMin * 1.04, 0], [top2 + H2, top2]);
    ctx = { x, y1, y2, W, H, m, top2, H1, H2 };

    const s = d3.create('svg').attr('width', W).attr('height', H).attr('class', 'tsc-svg').attr('aria-hidden', 'true');
    // Episode bands (≥ 10% declines) on both panes
    const eps = (o.episodes || []).map((e, i) => ({ ...e, i, a: parseDay(e.peakDate), b: e.recoveryDate ? parseDay(e.recoveryDate) : pts[pts.length - 1].t }))
      .filter(e => e.b >= pts[0].t);
    const gB = s.append('g');
    for (const e of eps) {
      const xa = Math.max(m.l, x(e.a)), xb = Math.min(W - m.r, x(e.b));
      if (xb <= xa) continue;
      const on = hi === e.i;
      for (const [yy, hh] of [[m.t, H1], [top2, H2]]) {
        gB.append('rect').attr('x', xa).attr('width', Math.max(1, xb - xa)).attr('y', yy).attr('height', hh)
          .attr('class', on ? 'lt-band on' : e.ongoing ? 'lt-band now' : 'lt-band');
      }
    }
    // Grid + axes, top pane
    const t1 = y1.ticks(6).filter(v => [1, 2, 5].includes(+String(v).replace(/[^1-9]/g, '')[0]));
    s.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y1).tickValues(t1).tickSize(-(W - m.l - m.r)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y1).tickValues(t1).tickFormat(d3.format('~s')).tickSizeOuter(0));
    // Bottom pane
    const t2 = y2.ticks(5);
    s.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y2).tickValues(t2).tickSize(-(W - m.l - m.r)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y2).tickValues(t2).tickFormat(v => (v === 0 ? '0' : '−' + Math.abs(v)) + '%').tickSizeOuter(0));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${top2 + H2})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 90))).tickSizeOuter(0));
    for (const v of [-10, -20]) {
      if (y2(v) > top2 + H2) continue;
      s.append('line').attr('class', 'tsc-ref').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y2(v)).attr('y2', y2(v)).attr('stroke', 'var(--ink-4)');
      s.append('text').attr('class', 'tsc-ref-l').attr('x', W - m.r - 2).attr('y', y2(v) - 3).attr('text-anchor', 'end').text(v === -10 ? '−10% correction' : '−20% bear market');
    }
    // Pane titles
    s.append('text').attr('class', 'lt-pane-t').attr('x', m.l + 6).attr('y', m.t + 12).text('S&P 500 price, log scale');
    s.append('text').attr('class', 'lt-pane-t').attr('x', m.l + 6).attr('y', top2 + H2 - 6).text('% below prior record close');
    // Series
    s.append('path').attr('class', 'tsc-line').attr('stroke', 'var(--ink)').attr('stroke-width', 1.2).attr('opacity', 0.9)
      .attr('d', d3.line().x(p => x(p.t)).y(p => y1(p.c))(pts));
    s.append('path').attr('class', 'lt-uw-area').attr('d', d3.area().x(p => x(p.t)).y0(y2(0)).y1(p => y2(p.u))(pts));
    s.append('path').attr('class', 'tsc-line lt-uw-line').attr('stroke-width', 1).attr('d', d3.line().x(p => x(p.t)).y(p => y2(p.u))(pts));
    // Highlighted episode: peak / trough markers + label
    const h = eps.find(e => e.i === hi);
    if (h) {
      const tp = parseDay(h.troughDate);
      const near = pts[d3.bisector(p => p.t).center(pts, tp)];
      if (near) {
        const tx = x(tp), ty = y2(h.depthPct);
        s.append('circle').attr('cx', tx).attr('cy', ty).attr('r', 3.5).attr('class', 'lt-mark');
        const lbl = pct(h.depthPct, 1);
        const left = tx > W - 90;
        s.append('text').attr('class', 'lt-mark-l').attr('x', tx + (left ? -7 : 7)).attr('y', Math.min(ty + 4, top2 + H2 - 4)).attr('text-anchor', left ? 'end' : 'start').text(lbl);
        const pk = parseDay(h.peakDate);
        const pi = pts[d3.bisector(p => p.t).center(pts, pk)];
        if (pi) s.append('circle').attr('cx', x(pk)).attr('cy', y1(pi.c)).attr('r', 3).attr('class', 'lt-mark');
      }
    }
    const xh = s.append('g').attr('class', 'tsc-xh').style('display', 'none');
    xh.append('line').attr('y1', m.t).attr('y2', top2 + H2);
    xh.append('circle').attr('class', 'c1').attr('r', 3).attr('fill', 'var(--ink)');
    xh.append('circle').attr('class', 'c2').attr('r', 3).attr('fill', 'var(--down)');
    plot.replaceChildren(s.node());
    plot.style.height = H + 'px';
    plot.setAttribute('aria-label', o.ariaLabel || 'S&P 500 price and drawdown chart');
    ctx.eps = eps;
  }

  function hover(clientX) {
    if (!ctx || !pts.length) return;
    const r = plot.getBoundingClientRect();
    const t = ctx.x.invert(clientX - r.left);
    const p = pts[d3.bisector(q => q.t).center(pts, t)];
    if (!p) return;
    const px = ctx.x(p.t);
    const xh = d3.select(plot).select('.tsc-xh').style('display', null);
    xh.select('line').attr('x1', px).attr('x2', px);
    xh.select('.c1').attr('cx', px).attr('cy', ctx.y1(p.c));
    xh.select('.c2').attr('cx', px).attr('cy', ctx.y2(p.u));
    const ep = ctx.eps.find(e => p.t >= e.a && p.t <= e.b);
    tip.innerHTML = `<div class="tsc-tip-d">Week of ${fmtDate(p.d)}</div>${tipRow('var(--ink)', 'S&P 500', num(p.c, p.c < 100 ? 2 : 0))}${tipRow('var(--down)', 'Below record', p.u === 0 ? 'at record' : pct(p.u, 1))}` +
      (ep ? `<div class="tsc-tip-b">${ep.ongoing ? 'Current decline' : 'Decline'} from ${fmtDate(ep.peakDate)} · ${pct(ep.depthPct, 1)}</div>` : '');
    placeTip(tip, el, px, ctx.m.t + 18, ctx.W);
    o.onHover?.(ep ? ep.i : null);
  }
  plot.addEventListener('pointermove', e => hover(e.clientX));
  plot.addEventListener('pointerleave', () => { tip.hidden = true; d3.select(plot).select('.tsc-xh').style('display', 'none'); o.onHover?.(null); });
  plot.addEventListener('click', e => { if (!ctx) return; const r = plot.getBoundingClientRect(); const t = ctx.x.invert(e.clientX - r.left); const ep = ctx.eps.find(q => t >= q.a && t <= q.b); o.onPick?.(ep ? ep.i : null); });

  prep();
  const sz = autoSize(plot, draw);
  return {
    update(next) { o = { ...o, ...next }; prep(); sz.redraw(); },
    highlight(i) { if (hi === i) return; hi = i; sz.redraw(); },
    redraw: () => sz.redraw(),
  };
}

// ---------------------------------------------------------------------------
// Decline overlay: % from the peak (y) against trading days since the peak (x).
// ---------------------------------------------------------------------------
/** overlayChart(el, { series:[{ id, label, color, bold, days:[], pct:[] }], xMax, height }) */
export function overlayChart(el, initial) {
  let o = { ...initial };
  el.classList.add('lt-ov');
  el.innerHTML = '<div class="lt-ov-plot" role="img"></div>';
  const plot = el.firstChild;
  const tip = tipEl(el);
  let ctx = null;

  function draw(W) {
    const H = o.height || 340;
    const m = { l: 44, r: 96, t: 10, b: 24 };
    const ser = o.series.map(s => {
      const n = s.days.findIndex(d => d > o.xMax);
      const end = n < 0 ? s.days.length : n;
      return { ...s, d: s.days.slice(0, end), p: s.pct.slice(0, end) };
    }).filter(s => s.d.length);
    if (!ser.length) { plot.innerHTML = '<div class="tsc-empty" style="height:' + H + 'px">Pick at least one decline to compare.</div>'; ctx = null; return; }
    const lo = d3.min(ser, s => d3.min(s.p));
    const hiV = d3.max(ser, s => d3.max(s.p));
    const x = d3.scaleLinear([0, o.xMax], [m.l, W - m.r]);
    const y = d3.scaleLinear([Math.min(-12, lo * 1.05), Math.max(2, hiV + 2)], [H - m.b, m.t]).nice();
    ctx = { x, y, ser, W, H, m };
    const s = d3.create('svg').attr('width', W).attr('height', H).attr('class', 'tsc-svg').attr('aria-hidden', 'true');
    s.append('defs').html(`<clipPath id="ovclip"><rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H - m.b}"/></clipPath>`);
    s.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(v => (v < 0 ? '−' + Math.abs(v) : v > 0 ? '+' + v : '0') + '%').tickSizeOuter(0));
    const xt = o.xMax <= 130 ? d3.range(0, o.xMax + 1, 21) : o.xMax <= 260 ? d3.range(0, o.xMax + 1, 63) : o.xMax <= 520 ? d3.range(0, o.xMax + 1, 126) : d3.range(0, o.xMax + 1, 252);
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(xt).tickFormat(v => v === 0 ? 'peak' : v % 252 === 0 ? (v / 252) + 'y' : v % 21 === 0 ? Math.round(v / 21) + 'm' : v).tickSizeOuter(0));
    s.append('line').attr('class', 'lt-zero').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
    for (const v of [-10, -20]) if (y(v) < H - m.b) s.append('line').attr('class', 'tsc-ref').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', 'var(--ink-4)');
    const g = s.append('g').attr('clip-path', 'url(#ovclip)');
    const order = [...ser].sort((a, b) => (a.bold ? 1 : 0) - (b.bold ? 1 : 0));
    for (const sr of order) {
      const path = d3.line().x((_, i) => x(sr.d[i])).y((_, i) => y(sr.p[i]))(sr.d);
      g.append('path').attr('class', 'tsc-line').attr('d', path).attr('stroke', sr.color).attr('stroke-width', sr.bold ? 2.6 : 1.3).attr('opacity', sr.bold ? 1 : 0.85);
    }
    // End labels (nudged apart)
    const labels = ser.map(sr => ({ sr, x: x(sr.d[sr.d.length - 1]), y: y(sr.p[sr.p.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 12) labels[i].y = labels[i - 1].y + 12;
    for (const l of labels) {
      const right = l.sr.d[l.sr.d.length - 1] >= o.xMax * 0.97;
      const lx = right ? W - m.r + 6 : l.x + 6;
      s.append('circle').attr('cx', l.x).attr('cy', y(l.sr.p[l.sr.p.length - 1])).attr('r', l.sr.bold ? 3.5 : 2.2).attr('fill', l.sr.color).attr('stroke', 'var(--panel)').attr('stroke-width', 1.2);
      s.append('text').attr('class', 'lt-ov-l' + (l.sr.bold ? ' b' : '')).attr('x', lx).attr('y', l.y + 3.5).attr('fill', l.sr.color).text(l.sr.label);
    }
    const xh = s.append('g').attr('class', 'tsc-xh').style('display', 'none');
    xh.append('line').attr('y1', m.t).attr('y2', H - m.b);
    plot.replaceChildren(s.node());
    plot.style.height = H + 'px';
    plot.setAttribute('aria-label', 'Overlay of S&P 500 declines: percent below the peak by trading days since the peak');
  }
  plot.addEventListener('pointermove', e => {
    if (!ctx) return;
    const r = plot.getBoundingClientRect();
    const dd = Math.round(Math.max(0, Math.min(o.xMax, ctx.x.invert(e.clientX - r.left))));
    const px = ctx.x(dd);
    d3.select(plot).select('.tsc-xh').style('display', null).select('line').attr('x1', px).attr('x2', px);
    const rows = ctx.ser.map(sr => {
      const i = d3.bisectLeft(sr.d, dd);
      return i < sr.d.length && Math.abs(sr.d[i] - dd) <= 3 ? [sr, sr.p[i]] : null;
    }).filter(Boolean).sort((a, b) => a[1] - b[1]);
    tip.innerHTML = `<div class="tsc-tip-d">${dd} trading days after the peak (≈${(dd / 21).toFixed(1)} mo)</div>` +
      (rows.length ? rows.map(([sr, v]) => tipRow(sr.color, sr.label, pct(v, 1))).join('') : '<div class="tsc-tip-b">No selected decline lasted this long</div>');
    placeTip(tip, el, px, ctx.m.t, ctx.W - ctx.m.r + 80);
  });
  plot.addEventListener('pointerleave', () => { tip.hidden = true; d3.select(plot).select('.tsc-xh').style('display', 'none'); });
  const sz = autoSize(plot, draw);
  return { update(next) { o = { ...o, ...next }; sz.redraw(); }, redraw: () => sz.redraw() };
}

// ---------------------------------------------------------------------------
// Strip plot: one row per horizon, a dot per past event.
// ---------------------------------------------------------------------------
/** stripPlot(el, { rows:[{ key, label, values:[{ v, date, peakDate }], median }] }) */
export function stripPlot(el, initial) {
  let o = { ...initial };
  el.classList.add('lt-strip');
  function draw(W) {
    const rowH = 38, m = { l: 34, r: 10, t: 6, b: 18 };
    const H = m.t + o.rows.length * rowH + m.b;
    const all = o.rows.flatMap(r => r.values.map(v => v.v));
    if (!all.length) { el.innerHTML = '<div class="tsc-empty" style="height:120px">No completed events at this threshold yet.</div>'; return; }
    const lo = Math.min(0, d3.min(all)), hiV = Math.max(0, d3.max(all));
    // Symmetric-log feel: a sqrt-signed scale keeps both small and very large returns readable.
    const f = v => Math.sign(v) * Math.sqrt(Math.abs(v));
    const x = d3.scaleLinear([f(lo) * 1.04, f(hiV) * 1.04], [m.l, W - m.r]);
    const X = v => x(f(v));
    const s = d3.create('svg').attr('width', W).attr('height', H).attr('class', 'tsc-svg').attr('aria-hidden', 'true');
    const ticks = [-75, -50, -25, -10, 0, 10, 25, 50, 100, 200, 300, 400].filter(v => v >= lo * 1.02 && v <= hiV * 1.02);
    for (const v of ticks) {
      s.append('line').attr('class', v === 0 ? 'lt-zero' : 'lt-strip-grid').attr('x1', X(v)).attr('x2', X(v)).attr('y1', m.t).attr('y2', H - m.b);
      s.append('text').attr('class', 'lt-strip-tick').attr('x', X(v)).attr('y', H - 5).attr('text-anchor', 'middle').text(v > 0 ? '+' + v + '%' : v < 0 ? '−' + Math.abs(v) + '%' : '0');
    }
    o.rows.forEach((r, ri) => {
      const cy = m.t + ri * rowH + rowH / 2;
      s.append('text').attr('class', 'lt-strip-row').attr('x', 0).attr('y', cy + 4).text(r.label);
      s.append('line').attr('class', 'lt-strip-base').attr('x1', m.l).attr('x2', W - m.r).attr('y1', cy).attr('y2', cy);
      // simple deterministic jitter so close dots don't hide each other
      const sorted = [...r.values].sort((a, b) => a.v - b.v);
      let lastX = -99, lane = 0;
      for (const v of sorted) {
        const px = X(v.v);
        lane = px - lastX < 5 ? (lane + 1) % 3 : 0;
        lastX = px;
        const cyj = cy + [0, -6, 6][lane];
        s.append('circle').attr('cx', px).attr('cy', cyj).attr('r', 3.6).attr('class', 'lt-dot ' + (v.v >= 0 ? 'pos' : 'neg'))
          .attr('data-tip', `<div class="tt-ind">${esc(r.label)} after</div><div class="tt-row"><span>Event</span><b>${fmtDate(v.date)}</b></div><div class="tt-row"><span>Peak</span><b>${fmtDate(v.peakDate)}</b></div><div class="tt-row"><span>Price return</span><b>${pct(v.v, 1)}</b></div>`);
      }
      if (r.median != null) {
        s.append('line').attr('class', 'lt-strip-med').attr('x1', X(r.median)).attr('x2', X(r.median)).attr('y1', cy - 12).attr('y2', cy + 12);
      }
    });
    el.replaceChildren(s.node());
  }
  el.addEventListener('pointerover', e => { const t = e.target.closest('[data-tip]'); if (t) showTip(t.dataset.tip, e); });
  el.addEventListener('pointermove', e => { if (e.target.closest('[data-tip]')) moveTip(e); });
  el.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]')) hideTip(); });
  const sz = autoSize(el, draw);
  return { update(next) { o = { ...o, ...next }; sz.redraw(); } };
}

// ---------------------------------------------------------------------------
// Range bars for the time-in-market table: worst..best whisker, p10..p90 box,
// median tick. One shared x scale; drawn into every [data-range] cell.
// ---------------------------------------------------------------------------
export function drawRangeCells(container, rows, { clip = [-40, 40] } = {}) {
  const cells = [...container.querySelectorAll('[data-range]')];
  if (!cells.length) return;
  const cs = getComputedStyle(cells[0]);
  const W = Math.floor(cells[0].clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  if (!(W > 40)) return;
  const H = 18, pad = 4;
  const lo = Math.max(clip[0], d3.min(rows, r => r.worstPct)), hiV = Math.min(clip[1], d3.max(rows, r => r.bestPct));
  const x = d3.scaleLinear([Math.min(lo, -5), Math.max(hiV, 5)], [pad, W - pad]).nice();
  const cx = v => x(Math.max(x.domain()[0], Math.min(x.domain()[1], v)));
  cells.forEach((cell, i) => {
    const r = rows[i];
    const offL = r.worstPct < x.domain()[0], offR = r.bestPct > x.domain()[1];
    cell.innerHTML = `<svg width="${W}" height="${H}" aria-hidden="true">
      <line class="lt-zero" x1="${x(0)}" x2="${x(0)}" y1="0" y2="${H}"/>
      <line class="lt-rb-w" x1="${cx(r.worstPct)}" x2="${cx(r.bestPct)}" y1="${H / 2}" y2="${H / 2}"/>
      <rect class="lt-rb-box" x="${cx(r.p10Pct)}" width="${Math.max(1, cx(r.p90Pct) - cx(r.p10Pct))}" y="${H / 2 - 4}" height="8" rx="1"/>
      <line class="lt-rb-med" x1="${cx(r.medianPct)}" x2="${cx(r.medianPct)}" y1="${H / 2 - 7}" y2="${H / 2 + 7}"/>
      ${offL ? `<path class="lt-rb-off" d="M${pad + 5},${H / 2 - 4} L${pad},${H / 2} L${pad + 5},${H / 2 + 4}"/>` : ''}
      ${offR ? `<path class="lt-rb-off" d="M${W - pad - 5},${H / 2 - 4} L${W - pad},${H / 2} L${W - pad - 5},${H / 2 + 4}"/>` : ''}
    </svg>`;
  });
  const axis = container.querySelector('[data-range-axis]');
  if (axis) {
    const ticks = x.ticks(6);
    axis.innerHTML = `<svg width="${W}" height="14" aria-hidden="true">${ticks.map(v => `<text x="${x(v)}" y="10" text-anchor="middle">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%</text>`).join('')}</svg>`;
  }
}

// ---------------------------------------------------------------------------
// Projection fan: p10..p90 band, median line, contributions line; x = age.
// ---------------------------------------------------------------------------
/** fanChart(el, { ages:[], p10:[], p50:[], p90:[], contrib:[], height }) */
export function fanChart(el, initial) {
  let o = { ...initial };
  el.classList.add('lt-fan');
  el.innerHTML = '<div class="lt-fan-plot" role="img"></div>';
  const plot = el.firstChild;
  const tip = tipEl(el);
  let ctx = null;
  function draw(W) {
    const H = o.height || 240, m = { l: 54, r: 12, t: 10, b: 22 };
    if (!o.ages?.length) return;
    const x = d3.scaleLinear(d3.extent(o.ages), [m.l, W - m.r]);
    const y = d3.scaleLinear([0, d3.max(o.p90) * 1.05 || 1], [H - m.b, m.t]).nice();
    ctx = { x, y, W, H, m };
    const s = d3.create('svg').attr('width', W).attr('height', H).attr('class', 'tsc-svg').attr('aria-hidden', 'true');
    s.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(v => usd(v, { compact: true })).tickSizeOuter(0));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.min(10, o.ages.length - 1)).tickFormat(v => 'age ' + v).tickSizeOuter(0));
    const idx = o.ages.map((_, i) => i);
    s.append('path').attr('class', 'lt-fan-band').attr('d', d3.area().x(i => x(o.ages[i])).y0(i => y(o.p10[i])).y1(i => y(o.p90[i]))(idx));
    for (const [k, c] of [['p10', 'lt-fan-edge'], ['p90', 'lt-fan-edge']]) s.append('path').attr('class', 'tsc-line ' + c).attr('d', d3.line().x(i => x(o.ages[i])).y(i => y(o[k][i]))(idx));
    s.append('path').attr('class', 'tsc-line lt-fan-contrib').attr('d', d3.line().x(i => x(o.ages[i])).y(i => y(o.contrib[i]))(idx));
    s.append('path').attr('class', 'tsc-line lt-fan-med').attr('d', d3.line().x(i => x(o.ages[i])).y(i => y(o.p50[i]))(idx));
    const xh = s.append('g').attr('class', 'tsc-xh').style('display', 'none');
    xh.append('line').attr('y1', m.t).attr('y2', H - m.b);
    plot.replaceChildren(s.node());
    plot.style.height = H + 'px';
    plot.setAttribute('aria-label', 'Range of projected balances by age');
  }
  plot.addEventListener('pointermove', e => {
    if (!ctx) return;
    const r = plot.getBoundingClientRect();
    const age = ctx.x.invert(e.clientX - r.left);
    const i = Math.max(0, Math.min(o.ages.length - 1, d3.bisector(a => a).center(o.ages, age)));
    const px = ctx.x(o.ages[i]);
    d3.select(plot).select('.tsc-xh').style('display', null).select('line').attr('x1', px).attr('x2', px);
    tip.innerHTML = `<div class="tsc-tip-d">Age ${o.ages[i]}</div>` + tipRow('var(--amber)', '90th pct path', usd(o.p90[i])) + tipRow('var(--amber)', 'Median path', usd(o.p50[i])) +
      tipRow('var(--amber-dim)', '10th pct path', usd(o.p10[i])) + tipRow('var(--ink-2)', 'Paid in', usd(o.contrib[i]));
    placeTip(tip, el, px, ctx.m.t, ctx.W);
  });
  plot.addEventListener('pointerleave', () => { tip.hidden = true; d3.select(plot).select('.tsc-xh').style('display', 'none'); });
  const sz = autoSize(plot, draw);
  return { update(next) { o = { ...o, ...next }; sz.redraw(); } };
}

// ---------------------------------------------------------------------------
// Correlation matrix
// ---------------------------------------------------------------------------
/** corrMatrix(el, { symbols, r, n, months, groupOf: s => group }) */
export function corrMatrix(el, initial) {
  let o = { ...initial };
  el.classList.add('lt-corr');
  const color = v => {
    if (v == null) return null;
    // 0 → panel; +1 → amber; −1 → cyan (no "good"/"bad" connotation)
    return v >= 0 ? d3.interpolateRgb('#141a24', '#7a5600')(Math.pow(Math.max(0, v), 1.4)) : d3.interpolateRgb('#141a24', '#2a8d98')(Math.min(1, -v * 1.6));
  };
  function draw(W) {
    const N = o.symbols.length, lab = 40;
    const cell = Math.max(12, Math.min(26, Math.floor((W - lab - 4) / N)));
    const size = lab + cell * N;
    const showTxt = cell >= 22;
    const s = d3.create('svg').attr('width', size).attr('height', size + 2).attr('class', 'tsc-svg').attr('aria-hidden', 'true');
    const g = s.append('g');
    for (let i = 0; i < N; i++) {
      s.append('text').attr('class', 'lt-corr-l').attr('x', lab - 5).attr('y', lab + i * cell + cell / 2 + 3.5).attr('text-anchor', 'end').attr('data-row', i).text(o.symbols[i]);
      s.append('text').attr('class', 'lt-corr-l').attr('transform', `translate(${lab + i * cell + cell / 2 + 3.5},${lab - 5}) rotate(-90)`).attr('data-col', i).text(o.symbols[i]);
      for (let j = 0; j < N; j++) {
        const v = o.r[i]?.[j];
        const x0 = lab + j * cell, y0 = lab + i * cell;
        const c = color(v);
        g.append('rect').attr('x', x0 + 0.5).attr('y', y0 + 0.5).attr('width', cell - 1).attr('height', cell - 1).attr('rx', 1.5)
          .attr('fill', c || 'transparent').attr('class', c ? 'lt-corr-c' : 'lt-corr-c na').attr('data-i', i).attr('data-j', j);
        if (showTxt && i !== j) {
          g.append('text').attr('class', 'lt-corr-v' + '').attr('x', x0 + cell / 2).attr('y', y0 + cell / 2 + 3).attr('text-anchor', 'middle')
            .text(v == null ? '·' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace(/^0/, ''));
        }
      }
    }
    // group separators
    let prev = null;
    o.symbols.forEach((sym, i) => {
      const gname = o.groupOf(sym);
      if (prev != null && gname !== prev) {
        const p = lab + i * cell;
        s.append('line').attr('class', 'lt-corr-sep').attr('x1', lab).attr('x2', size).attr('y1', p).attr('y2', p);
        s.append('line').attr('class', 'lt-corr-sep').attr('y1', lab).attr('y2', size).attr('x1', p).attr('x2', p);
      }
      prev = gname;
    });
    s.append('rect').attr('class', 'lt-corr-hl').attr('display', 'none');
    el.replaceChildren(s.node());
    el._cell = cell; el._lab = lab;
  }
  el.addEventListener('pointermove', e => {
    const c = e.target.closest('rect[data-i]');
    if (!c) { hideTip(); return; }
    const i = +c.dataset.i, j = +c.dataset.j;
    const v = o.r[i]?.[j], n = o.n?.[i]?.[j];
    const a = o.symbols[i], b = o.symbols[j];
    showTip(`<div class="tt-head"><span class="tt-sym">${esc(a)} · ${esc(b)}</span></div>` +
      (i === j ? '<div class="tt-row"><span>Same fund</span><b>1.00</b></div>' :
        v == null ? `<div class="tt-row"><span>Correlation</span><b>not enough overlap</b></div><div class="tt-row"><span>Months in common</span><b>${n ?? '—'} (need ${o.minOverlap})</b></div>` :
          `<div class="tt-row"><span>Correlation</span><b>${(v < 0 ? '−' : '') + Math.abs(v).toFixed(2)}</b></div><div class="tt-row"><span>Months used</span><b>${n ?? '—'}</b></div>`), e);
    for (const t of el.querySelectorAll('.lt-corr-l')) t.classList.toggle('on', +t.dataset.row === i || +t.dataset.col === j);
  });
  el.addEventListener('pointerleave', () => { hideTip(); for (const t of el.querySelectorAll('.lt-corr-l.on')) t.classList.remove('on'); });
  const sz = autoSize(el, draw);
  return { update(next) { o = { ...o, ...next }; sz.redraw(); } };
}

// ---------------------------------------------------------------------------
// Risk vs return scatter
// ---------------------------------------------------------------------------
/** scatter(el, { points:[{ s, x, y, color, group, label }], xLabel, yLabel, height }) */
export function scatter(el, initial) {
  let o = { ...initial };
  el.classList.add('lt-sc');
  function draw(W) {
    const H = o.height || 300, m = { l: 40, r: 14, t: 10, b: 32 };
    const pts = o.points.filter(p => p.x != null && p.y != null);
    const x = d3.scaleLinear([0, d3.max(pts, p => p.x) * 1.08], [m.l, W - m.r]).nice();
    const y = d3.scaleLinear([Math.min(0, d3.min(pts, p => p.y)) - 1, d3.max(pts, p => p.y) + 1], [H - m.b, m.t]).nice();
    const s = d3.create('svg').attr('width', W).attr('height', H).attr('class', 'tsc-svg').attr('aria-hidden', 'true');
    s.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(v => (v < 0 ? '−' : '') + Math.abs(v) + '%').tickSizeOuter(0));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(v => v + '%').tickSizeOuter(0));
    s.append('text').attr('class', 'lt-ax-t').attr('x', W - m.r).attr('y', H - 3).attr('text-anchor', 'end').text(o.xLabel);
    s.append('text').attr('class', 'lt-ax-t').attr('x', m.l + 4).attr('y', m.t + 9).text(o.yLabel);
    if (y.domain()[0] < 0) s.append('line').attr('class', 'lt-zero').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
    const placed = [];
    for (const p of [...pts].sort((a, b) => b.y - a.y)) {
      const px = x(p.x), py = y(p.y);
      s.append('circle').attr('cx', px).attr('cy', py).attr('r', 4).attr('fill', p.color).attr('class', 'lt-sc-dot').attr('stroke', 'var(--panel)').attr('stroke-width', 1)
        .attr('data-tip', `<div class="tt-head"><span class="tt-sym">${esc(p.s)}</span></div><div class="tt-name">${esc(p.label)}</div><div class="tt-ind">${esc(p.group)}</div><div class="tt-row"><span>${esc(o.xLabel)}</span><b>${num(p.x, 1)}%</b></div><div class="tt-row"><span>${esc(o.yLabel)}</span><b>${pct(p.y, 1)}</b></div>`);
      const lw = p.s.length * 6 + 4;
      let ly = py + 3.5, lx = px + 6;
      if (lx + lw > W - m.r) lx = px - 6 - lw;
      const hit = () => placed.some(q => Math.abs(q.x - lx) < (q.w + lw) / 2 + 2 && Math.abs(q.y - ly) < 10);
      if (hit()) { ly = py - 6; if (hit()) { ly = py + 13; if (hit()) continue; } }
      placed.push({ x: lx, y: ly, w: lw });
      s.append('text').attr('class', 'lt-sc-l').attr('x', lx).attr('y', ly).text(p.s);
    }
    el.replaceChildren(s.node());
  }
  el.addEventListener('pointerover', e => { const t = e.target.closest('[data-tip]'); if (t) showTip(t.dataset.tip, e); });
  el.addEventListener('pointermove', e => { if (e.target.closest('[data-tip]')) moveTip(e); });
  el.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]')) hideTip(); });
  const sz = autoSize(el, draw);
  return { update(next) { o = { ...o, ...next }; sz.redraw(); } };
}

export { css };
