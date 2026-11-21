// Time-series line/area chart (d3). Multiple series, linear or log scale,
// shaded bands (recessions, bear markets), reference lines, crosshair with a
// tooltip, keyboard and touch support, and responsive redraw. Styles: ui.css (.tsc).
//
//   const chart = tsChart(el, {
//     series: [{ id: 'spx', label: 'S&P 500', data: [{ t: '2020-01-02', v: 3257 }, …] }],
//     log: true, height: 280, yFmt: v => v.toLocaleString(),
//     bands: [{ from: '2020-02-19', to: '2020-04-07', label: 'COVID recession' }],
//   });
//   chart.update({ series: [...] });   // merge new options and redraw
//   chart.destroy();
//
// Points: { t, v } or [t, v]. t is a Date, epoch milliseconds, or an ISO date
// string ('YYYY-MM-DD' is read as that calendar day). v null/NaN = gap.
// Options (all optional except series):
//   series[]   { id, label, data, color, area = false, width = 1.6, dash: '4 3', fmt: v => string }
//   height     px (default 260); el width is used and tracked with ResizeObserver
//   log        log y scale (non-positive values are dropped)
//   normalize  rebase every series to this value (e.g. 100) at its first point, to compare growth
//   yFmt       axis + tooltip number format;  tipDate: Date => string;  xTicks: count hint
//   yDomain    [min, max] override;  zero: true forces 0 into the y range
//   bands[]    { from, to, label, color }  shaded x ranges, labelled at the top
//   refs[]     { v, label, color }  horizontal dashed lines
//   legend     true | false (default: shown when there are 2+ series)
//   ariaLabel  description for screen readers
//   empty      message when no series has data
export const SERIES_COLORS = ['#ffb000', '#3cc8d6', '#a48bff', '#e6edf3', '#ff8fb1', '#8bd450'];

const parseDay = d3.utcParse('%Y-%m-%d');
function toDate(t) {
  if (t instanceof Date) return t;
  if (typeof t === 'number') return new Date(t);
  if (typeof t === 'string') return (t.length === 10 && parseDay(t)) || new Date(t);
  return null;
}
const defFmt = v => {
  const a = Math.abs(v);
  return a >= 1e6 ? d3.format('.3~s')(v) : a >= 100 ? d3.format(',.0f')(v) : a >= 1 ? d3.format(',.2~f')(v) : d3.format('.3~f')(v);
};
const dayFmt = d3.utcFormat('%b %-d, %Y');
let uid = 0;

export function tsChart(el, initial) {
  const id = 'tsc' + (++uid);
  let o = {};
  let prepared = [];
  let lastW = 0;
  let hoverIdx = null;
  el.classList.add('tsc');
  el.innerHTML = `<div class="tsc-legend" hidden></div><div class="tsc-plot" tabindex="0" role="img"></div><div class="tsc-tip" hidden></div>`;
  const legend = el.querySelector('.tsc-legend');
  const plot = el.querySelector('.tsc-plot');
  const tip = el.querySelector('.tsc-tip');
  let svg = null, scales = null, master = [];

  function prepare() {
    prepared = (o.series || []).map((s, i) => {
      let data = (s.data || []).map(p => Array.isArray(p) ? { t: toDate(p[0]), v: p[1] } : { t: toDate(p.t), v: p.v })
        .filter(p => p.t && !isNaN(p.t))
        .map(p => ({ t: p.t, v: p.v == null || !isFinite(p.v) || (o.log && p.v <= 0) ? null : +p.v }))
        .sort((a, b) => a.t - b.t);
      if (o.normalize) {
        const first = data.find(p => p.v != null)?.v;
        if (first) data = data.map(p => ({ t: p.t, v: p.v == null ? null : p.v / first * o.normalize }));
      }
      return { ...s, i, color: s.color || SERIES_COLORS[i % SERIES_COLORS.length], data };
    });
    // Master timeline for the crosshair: the series with the most points.
    master = [...prepared].sort((a, b) => b.data.length - a.data.length)[0]?.data.filter(p => p.v != null) || [];
  }

  function fmtV(s, v) { return v == null ? '—' : (s.fmt || o.yFmt || defFmt)(v); }

  function renderLegend(idx = null) {
    const show = o.legend ?? prepared.length > 1;
    legend.hidden = !show;
    if (!show) return;
    const t = idx != null ? master[idx]?.t : null;
    legend.innerHTML = prepared.map(s => {
      const p = t ? nearest(s.data, t) : [...s.data].reverse().find(x => x.v != null);
      return `<span><i style="background:${s.color}${s.dash ? ';opacity:.7' : ''}"></i>${escText(s.label || s.id || '')}<b>${p ? fmtV(s, p.v) : '—'}</b></span>`;
    }).join('');
  }

  function nearest(data, t) {
    if (!data.length) return null;
    const i = d3.bisector(d => d.t).center(data, t);
    const p = data[i];
    return p && Math.abs(p.t - t) <= gapTolerance(data) ? p : null;
  }
  function gapTolerance(data) {
    const n = data.length;
    return n > 1 ? Math.max(4 * 86400e3, ((data[n - 1].t - data[0].t) / n) * 3) : Infinity;
  }

  function draw() {
    const W = plot.clientWidth;
    if (!W) return; // hidden: drawn when it becomes visible (ResizeObserver)
    lastW = W;
    const H = o.height || 260;
    plot.style.height = H + 'px';
    const has = prepared.some(s => s.data.some(p => p.v != null));
    if (!has) { plot.innerHTML = `<div class="tsc-empty">${escText(o.empty || 'No data for this range.')}</div>`; svg = null; renderLegend(); return; }

    const all = prepared.flatMap(s => s.data);
    const vals = all.map(p => p.v).filter(v => v != null);
    const xExt = d3.extent(all, p => p.t);
    let [lo, hi] = o.yDomain || d3.extent(vals);
    for (const r of o.refs || []) { lo = Math.min(lo, r.v); hi = Math.max(hi, r.v); }
    if (o.zero && !o.log) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const yTickW = Math.max(...[lo, hi].map(v => (o.yFmt || defFmt)(v).length)) * 6.2 + 10;
    const m = { t: (o.bands || []).some(b => b.label) ? 18 : 10, r: 12, b: 22, l: Math.max(34, Math.min(72, yTickW)) };
    const x = d3.scaleUtc(xExt, [m.l, W - m.r]);
    let y;
    if (o.log) {
      y = d3.scaleLog([Math.max(lo * 0.92, 1e-9), hi * 1.06], [H - m.b, m.t]);
    } else {
      const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.05 || 1;
      y = d3.scaleLinear([o.yDomain ? lo : lo - pad, o.yDomain ? hi : hi + pad], [H - m.b, m.t]);
      if (!o.yDomain) y.nice(Math.max(3, Math.round(H / 55)));
    }
    scales = { x, y, m, W, H };

    const s = d3.create('svg').attr('width', W).attr('height', H).attr('class', 'tsc-svg')
      .attr('aria-hidden', 'true');
    s.append('defs').html(`<clipPath id="${id}-clip"><rect x="${m.l}" y="0" width="${Math.max(0, W - m.l - m.r)}" height="${H - m.b}"/></clipPath>` +
      prepared.filter(p => p.area).map(p => `<linearGradient id="${id}-g${p.i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.color}" stop-opacity=".24"/><stop offset="1" stop-color="${p.color}" stop-opacity="0"/></linearGradient>`).join(''));

    // Bands
    const gb = s.append('g').attr('class', 'tsc-bands').attr('clip-path', `url(#${id}-clip)`);
    const labels = s.append('g').attr('class', 'tsc-band-labels');
    for (const b of o.bands || []) {
      const x0 = x(Math.max(toDate(b.from), xExt[0])), x1 = x(Math.min(toDate(b.to), xExt[1]));
      if (!(x1 > x0)) continue;
      gb.append('rect').attr('x', x0).attr('width', x1 - x0).attr('y', 0).attr('height', H - m.b).attr('fill', b.color || 'var(--band)');
      if (b.label && x1 - x0 > 34) labels.append('text').attr('x', x0 + 3).attr('y', 11).text(b.label.length * 5.6 > x1 - x0 ? b.label.slice(0, Math.floor((x1 - x0) / 5.6)) : b.label);
    }

    // Grid + axes
    const yTicks = o.log ? y.ticks(Math.max(3, Math.round(H / 55))).filter((v, i, a) => a.length < 9 || [1, 2, 5].includes(+String(v).replace(/[^1-9]/g, '')[0])) : y.ticks(Math.max(3, Math.round(H / 55)));
    s.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).tickValues(yTicks).tickSize(-(W - m.l - m.r)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).tickValues(yTicks).tickFormat(o.yFmt || defFmt).tickSizeOuter(0));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(o.xTicks || Math.max(2, Math.floor(W / 110))).tickSizeOuter(0));

    for (const r of o.refs || []) {
      s.append('line').attr('class', 'tsc-ref').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(r.v)).attr('y2', y(r.v)).attr('stroke', r.color || 'var(--ink-4)');
      if (r.label) s.append('text').attr('class', 'tsc-ref-l').attr('x', W - m.r - 2).attr('y', y(r.v) - 4).attr('text-anchor', 'end').text(r.label);
    }

    // Series
    const gs = s.append('g').attr('clip-path', `url(#${id}-clip)`);
    for (const p of prepared) {
      if (p.area) {
        gs.append('path').attr('d', d3.area().defined(d => d.v != null).x(d => x(d.t)).y0(H - m.b).y1(d => y(d.v))(p.data)).attr('fill', `url(#${id}-g${p.i})`);
      }
      gs.append('path').attr('class', 'tsc-line').attr('d', d3.line().defined(d => d.v != null).x(d => x(d.t)).y(d => y(d.v))(p.data))
        .attr('stroke', p.color).attr('stroke-width', p.width || 1.6).attr('stroke-dasharray', p.dash || null);
      const last = [...p.data].reverse().find(d => d.v != null);
      if (last) gs.append('circle').attr('cx', x(last.t)).attr('cy', y(last.v)).attr('r', 2.8).attr('fill', p.color).attr('stroke', 'var(--panel)').attr('stroke-width', 1.5);
    }

    // Crosshair layer
    const xh = s.append('g').attr('class', 'tsc-xh').style('display', 'none');
    xh.append('line').attr('y1', m.t - 4).attr('y2', H - m.b);
    for (const p of prepared) xh.append('circle').attr('r', 3.5).attr('fill', p.color).attr('stroke', 'var(--panel)').attr('stroke-width', 2).attr('data-i', p.i);

    plot.replaceChildren(s.node());
    svg = s;
    plot.setAttribute('aria-label', o.ariaLabel || prepared.map(p => p.label).filter(Boolean).join(', ') + ' chart');
    if (hoverIdx != null && master[hoverIdx]) showAt(hoverIdx); else renderLegend();
  }

  function showAt(idx) {
    if (!svg || !master.length) return;
    idx = Math.max(0, Math.min(master.length - 1, idx));
    hoverIdx = idx;
    const t = master[idx].t;
    const { x, y, m, W } = scales;
    const px = x(t);
    const xh = svg.select('.tsc-xh').style('display', null);
    xh.select('line').attr('x1', px).attr('x2', px);
    const rows = [];
    for (const p of prepared) {
      const pt = nearest(p.data, t);
      const c = xh.select(`circle[data-i="${p.i}"]`);
      if (pt?.v != null) { c.style('display', null).attr('cx', x(pt.t)).attr('cy', y(pt.v)); rows.push([p, pt.v]); }
      else c.style('display', 'none');
    }
    tip.innerHTML = `<div class="tsc-tip-d">${(o.tipDate || dayFmt)(t)}</div>` + rows.map(([p, v]) =>
      `<div class="tsc-tip-r"><i style="background:${p.color}"></i><span>${escText(p.label || p.id || '')}</span><b>${fmtV(p, v)}</b></div>`).join('');
    // Band under the crosshair (e.g. which recession)
    const band = (o.bands || []).find(b => t >= toDate(b.from) && t <= toDate(b.to));
    if (band?.label) tip.innerHTML += `<div class="tsc-tip-b">${escText(band.label)}</div>`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const left = px + 14 + tw > W - m.r ? px - tw - 14 : px + 14;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = (legend.hidden ? 0 : legend.offsetHeight) + m.t + 'px';
    renderLegend(idx);
  }
  function hide() {
    hoverIdx = null;
    tip.hidden = true;
    svg?.select('.tsc-xh').style('display', 'none');
    renderLegend();
  }
  function idxAt(clientX) {
    const r = plot.getBoundingClientRect();
    const t = scales.x.invert(clientX - r.left);
    return d3.bisector(d => d.t).center(master, t);
  }

  plot.addEventListener('pointermove', e => { if (scales && master.length) showAt(idxAt(e.clientX)); });
  plot.addEventListener('pointerdown', e => { if (scales && master.length) showAt(idxAt(e.clientX)); });
  plot.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', e => {
    if (!master.length) return;
    const step = e.shiftKey ? Math.max(1, Math.round(master.length / 20)) : 1;
    const cur = hoverIdx ?? master.length - 1;
    const next = { ArrowLeft: cur - step, ArrowRight: cur + step, Home: 0, End: master.length - 1 }[e.key];
    if (next != null) { e.preventDefault(); showAt(next); }
    else if (e.key === 'Escape' && hoverIdx != null) { e.stopPropagation(); hide(); }
  });

  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if (plot.clientWidth && plot.clientWidth !== lastW) draw(); });
  });
  ro.observe(plot);

  function update(next = {}) { o = { ...o, ...next }; prepare(); draw(); }
  update(initial);
  return {
    el,
    update,
    redraw: draw,
    destroy() { ro.disconnect(); el.innerHTML = ''; el.classList.remove('tsc'); },
  };
}

function escText(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
