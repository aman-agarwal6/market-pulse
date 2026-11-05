// SVG charts built with d3: fear gauge, rotation scatter, small multiples,
// yield curve, spreads, world map, distribution histogram.
import { heatColor, fmtPct, esc, showTip, moveTip, hideTip, cls, getPalette } from './util.js';

const size = el => ({ w: Math.max(200, el.clientWidth), h: el.clientHeight });

// ---------------------------------------------------------------------------
// Fear & Greed gauge
// ---------------------------------------------------------------------------
export function fearGauge(el, fear) {
  if (!fear || fear.score == null) { el.innerHTML = '<div class="empty">Waiting for data…</div>'; return; }
  const W = 340, H = 196, cx = W / 2, cy = 170, r = 132, th = 20;
  const pal = getPalette();
  const zones = [
    { a: 0, b: 25, c: pal[0], l: 'Extreme fear' }, { a: 25, b: 45, c: pal[1], l: 'Fear' },
    { a: 45, b: 55, c: pal[3], l: 'Neutral' }, { a: 55, b: 75, c: pal[5], l: 'Greed' }, { a: 75, b: 100, c: pal[6], l: 'Extreme greed' },
  ];
  const ang = v => Math.PI * (v / 100) - Math.PI / 2;
  const arc = d3.arc().innerRadius(r - th).outerRadius(r).cornerRadius(2).padAngle(0.012);
  const needle = ang(fear.score);
  const color = heatColor(fear.score - 50, 50);
  const ticks = [0, 25, 50, 75, 100];
  let svg = `<svg class="fear-gauge" viewBox="0 0 ${W} ${H}">
    <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g transform="translate(${cx},${cy})">`;
  for (const z of zones) {
    const active = fear.score >= z.a && fear.score <= z.b;
    svg += `<path d="${arc({ startAngle: ang(z.a), endAngle: ang(z.b) })}" fill="${z.c}" opacity="${active ? 1 : 0.35}" ${active ? 'filter="url(#glow)"' : ''}/>`;
  }
  for (const t of ticks) {
    const a = ang(t) - Math.PI / 2;
    svg += `<text x="${Math.cos(a) * (r + 13)}" y="${Math.sin(a) * (r + 13) + 3}" text-anchor="middle" fill="#66727f" font-family="JetBrains Mono" font-size="9.5">${t}</text>`;
  }
  const nx = Math.cos(needle - Math.PI / 2) * (r - th - 10), ny = Math.sin(needle - Math.PI / 2) * (r - th - 10);
  svg += `<line x1="0" y1="0" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="3" stroke-linecap="round" filter="url(#glow)"/>
    <circle r="7" fill="#0b0f15" stroke="#fff" stroke-width="2.5"/>
    <text class="fear-score" y="-34" text-anchor="middle">${fear.score}</text>
    </g></svg>`;
  const SHORT = { vix: 'VIX level', term: 'VIX term', mom: 'Momentum', breadth: '% > 50-day', hilo: 'Highs/lows', haven: 'Stocks/bonds', junk: 'Junk bonds' };
  const comps = fear.comps.map(c => `
    <div class="fc" title="${esc(c.label)} — ${esc(c.hint)}">
      <span class="lbl">${esc(SHORT[c.key] || c.label)}</span>
      <span class="meter"><i style="width:${c.score}%;background:${heatColor(c.score - 50, 50)}"></i></span>
      <span class="val">${esc(c.fmt)}</span>
    </div>`).join('');
  const lab = v => (v < 25 ? 'Extreme fear' : v < 45 ? 'Fear' : v <= 55 ? 'Neutral' : v <= 75 ? 'Greed' : 'Extreme greed');
  const cmp = fear.compare ? `<div class="fear-cmp">${[['Prev close', fear.compare.prev], ['1 week ago', fear.compare.week], ['1 month ago', fear.compare.month], ['1 year ago', fear.compare.year]]
    .map(([k, p]) => `<div title="${p ? esc(p.d) : ''}"><div class="k">${k}</div><div class="v" style="color:${p ? heatColor(p.v - 50, 50) : ''}">${p ? p.v : '—'}</div><div class="l">${p ? lab(p.v) : ''}</div></div>`).join('')}</div>` : '';
  el.innerHTML = `<div class="fear-wrap">
    <div class="fear-top"><div class="fear-dial">${svg}<div class="fear-label" style="color:${color}">${esc(fear.label)}</div></div>${cmp}</div>
    <div class="fear-hist" id="fearHist"></div>
    <div class="fear-comps two">${comps}</div></div>`;
  if (fear.history?.length > 5) fearHistChart(el.querySelector('#fearHist'), fear.history, fear.score);
}

function fearHistChart(el, hist, live) {
  const w = Math.max(200, el.clientWidth), H = 86, m = { t: 6, r: 6, b: 16, l: 24 };
  const parse = d3.timeParse('%Y-%m-%d');
  const data = hist.map(d => ({ d: parse(d.d), v: d.v }));
  const x = d3.scaleTime(d3.extent(data, d => d.d), [m.l, w - m.r]);
  const y = d3.scaleLinear([0, 100], [H - m.b, m.t]);
  const pal = getPalette();
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', H);
  [[0, 25, pal[0]], [25, 45, pal[1]], [45, 55, pal[3]], [55, 75, pal[5]], [75, 100, pal[6]]].forEach(([a, b, c]) =>
    svg.append('rect').attr('x', m.l).attr('width', w - m.l - m.r).attr('y', y(b)).attr('height', y(a) - y(b)).attr('fill', c).attr('opacity', 0.08));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues([0, 50, 100]).tickSizeOuter(0));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(4).tickSizeOuter(0));
  svg.append('path').attr('d', d3.line().x(d => x(d.d)).y(d => y(d.v)).curve(d3.curveMonotoneX)(data)).attr('fill', 'none').attr('stroke', '#e6edf3').attr('stroke-width', 1.5);
  const lp = data.at(-1);
  svg.append('circle').attr('cx', x(lp.d)).attr('cy', y(live ?? lp.v)).attr('r', 3.5).attr('fill', heatColor((live ?? lp.v) - 50, 50)).attr('stroke', '#0b0f15').attr('stroke-width', 1.5);
  const xh = svg.append('g').attr('class', 'xhair').style('display', 'none');
  xh.append('line').attr('y1', m.t).attr('y2', H - m.b);
  const bis = d3.bisector(d => d.d).left;
  svg.on('mousemove', ev => {
    const [mx] = d3.pointer(ev);
    const d = data[Math.min(data.length - 1, Math.max(0, bis(data, x.invert(mx))))];
    xh.style('display', null).select('line').attr('x1', x(d.d)).attr('x2', x(d.d));
    showTip(`<div class="tt-sym">${d.v}</div><div class="tt-name">${d3.timeFormat('%b %d, %Y')(d.d)} · 6-signal daily score</div>`, ev);
  }).on('mouseleave', () => { xh.style('display', 'none'); hideTip(); });
}

// ---------------------------------------------------------------------------
// Sector rotation (simplified RRG)
// ---------------------------------------------------------------------------
export function rrgChart(el, sectors, onClick) {
  const { w } = size(el);
  const H = 330, m = { t: 14, r: 14, b: 26, l: 36 };
  const pts = sectors.filter(s => s.rrg?.length);
  if (!pts.length) { el.innerHTML = '<div class="empty">Waiting for history…</div>'; return; }
  const all = pts.flatMap(s => s.rrg);
  const mx = Math.max(2, d3.max(all, p => Math.abs(p.x)) * 1.15);
  const my = Math.max(2, d3.max(all, p => Math.abs(p.y)) * 1.15);
  const x = d3.scaleLinear([-mx, mx], [m.l, w - m.r]);
  const y = d3.scaleLinear([-my, my], [H - m.b, m.t]);
  const q = (px, py) => (px >= 0 && py >= 0 ? 'lead' : px >= 0 ? 'weak' : py < 0 ? 'lag' : 'impr');
  const pal = getPalette();
  const QC = { lead: pal[6], weak: '#ffb000', lag: pal[0], impr: '#3cc8d6' };
  el.innerHTML = '';
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', H);
  const quad = [
    ['lead', x(0), m.t, w - m.r - x(0), y(0) - m.t, 'LEADING', 'end', w - m.r - 6, m.t + 12],
    ['weak', x(0), y(0), w - m.r - x(0), H - m.b - y(0), 'WEAKENING', 'end', w - m.r - 6, H - m.b - 6],
    ['lag', m.l, y(0), x(0) - m.l, H - m.b - y(0), 'LAGGING', 'start', m.l + 6, H - m.b - 6],
    ['impr', m.l, m.t, x(0) - m.l, y(0) - m.t, 'IMPROVING', 'start', m.l + 6, m.t + 12],
  ];
  for (const [k, qx, qy, qw, qh, lbl, anchor, tx, ty] of quad) {
    svg.append('rect').attr('x', qx).attr('y', qy).attr('width', qw).attr('height', qh).attr('fill', QC[k]).attr('opacity', 0.045);
    svg.append('text').attr('x', tx).attr('y', ty).attr('text-anchor', anchor).attr('fill', QC[k]).attr('opacity', 0.75)
      .attr('font-size', 9.5).attr('font-weight', 700).attr('letter-spacing', '.12em').text(lbl);
  }
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d => d + '%').tickSizeOuter(0));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%').tickSizeOuter(0));
  svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', '#2a3342');
  svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', '#2a3342');

  const line = d3.line().x(p => x(p.x)).y(p => y(p.y)).curve(d3.curveCatmullRom.alpha(0.5));
  const labels = [];
  for (const s of pts) {
    const last = s.rrg.at(-1);
    const c = QC[q(last.x, last.y)];
    const g = svg.append('g').style('cursor', 'pointer');
    g.append('path').attr('d', line(s.rrg)).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 1.5).attr('opacity', 0.45);
    s.rrg.slice(0, -1).forEach((p, i) => g.append('circle').attr('cx', x(p.x)).attr('cy', y(p.y)).attr('r', 1.6 + i * 0.4).attr('fill', c).attr('opacity', 0.25 + i * 0.12));
    g.append('circle').attr('cx', x(last.x)).attr('cy', y(last.y)).attr('r', 6).attr('fill', c).attr('stroke', '#0b0f15').attr('stroke-width', 2);
    labels.push({ x: x(last.x) + 9, y: y(last.y) + 3.5, ax: x(last.x), ay: y(last.y), t: s.etf });
    g.append('circle').attr('cx', x(last.x)).attr('cy', y(last.y)).attr('r', 14).attr('fill', 'transparent')
      .on('mousemove', ev => showTip(`<div class="tt-sym">${esc(s.name)}</div><div class="tt-name">${s.etf} · ${({ lead: 'Leading', weak: 'Weakening', lag: 'Lagging', impr: 'Improving' })[q(last.x, last.y)]}</div>
        <div class="tt-row"><span>1M vs S&amp;P</span><b class="${cls(last.x)}">${fmtPct(last.x)}</b></div>
        <div class="tt-row"><span>1W vs S&amp;P</span><b class="${cls(last.y)}">${fmtPct(last.y)}</b></div>
        <div class="tt-row"><span>Today</span><b class="${cls(s.c)}">${fmtPct(s.c)}</b></div>`, ev))
      .on('mouseleave', hideTip)
      .on('click', () => onClick?.(s.etf));
  }
  // simple vertical de-overlap for labels that sit close together
  labels.sort((a, b) => a.y - b.y);
  for (let it = 0; it < 20; it++) {
    for (let i = 1; i < labels.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = labels[j], b = labels[i];
        if (Math.abs(a.x - b.x) < 40 && Math.abs(a.y - b.y) < 12.5) { const push = (12.5 - Math.abs(a.y - b.y)) / 2 + 0.1; if (a.y <= b.y) { a.y -= push; b.y += push; } else { a.y += push; b.y -= push; } }
      }
    }
  }
  const lg = svg.append('g').attr('pointer-events', 'none');
  for (const l of labels) {
    if (Math.abs(l.y - 3.5 - l.ay) > 6) lg.append('line').attr('x1', l.ax + 4).attr('y1', l.ay).attr('x2', l.x - 1).attr('y2', l.y - 3.5).attr('stroke', '#46505c').attr('stroke-width', 0.75);
    lg.append('text').attr('x', l.x).attr('y', l.y).attr('fill', '#e6edf3').attr('font-size', 10.5).attr('font-weight', 600)
      .attr('paint-order', 'stroke').attr('stroke', '#0b0f15').attr('stroke-width', 3).text(l.t);
  }
}

// ---------------------------------------------------------------------------
// Small multiples with a shared x axis and synced crosshair
// ---------------------------------------------------------------------------
export function smallMultiples(el, panels, { xFmt = d => d } = {}) {
  const { w } = size(el);
  el.innerHTML = '';
  const m = { l: 48, r: 16 };
  const dates = panels[0]?.data.map(p => p.d) || [];
  if (!dates.length) { el.innerHTML = '<div class="empty">Waiting for history…</div>'; return; }
  const parse = d3.timeParse('%Y-%m-%d');
  const allDates = [...new Set(panels.flatMap(p => p.data.map(x => x.d)))].sort();
  const x = d3.scaleTime(d3.extent(allDates, parse), [m.l, w - m.r]);
  const charts = [];
  panels.forEach((p, idx) => {
    const H = p.h || 100;
    const isLast = idx === panels.length - 1;
    const bottom = isLast ? 20 : 4;
    const wrap = document.createElement('div');
    const last = p.data.at(-1);
    wrap.innerHTML = `<div class="chart-title">${esc(p.title)}<span class="xv">${last ? p.fmt(last.v) : ''}</span></div>`;
    el.appendChild(wrap);
    const vals = p.data.map(d => d.v);
    let lo = d3.min(vals), hi = d3.max(vals);
    if (p.domain) { lo = Math.min(lo, p.domain[0]); hi = Math.max(hi, p.domain[1]); }
    const pad = (hi - lo) * 0.08 || 1;
    const y = d3.scaleLinear([lo - pad, hi + pad], [H - bottom, 6]);
    const svg = d3.select(wrap).append('svg').attr('width', w).attr('height', H);
    svg.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(w - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickFormat(p.tick || (d => d)).tickSizeOuter(0));
    if (isLast) svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - bottom})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
    for (const r of p.refs || []) {
      svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(r.v)).attr('y2', y(r.v)).attr('stroke', r.c || '#3a4250').attr('stroke-dasharray', '3 3');
      svg.append('text').attr('x', w - m.r - 2).attr('y', y(r.v) - 3).attr('text-anchor', 'end').attr('fill', r.c || '#66727f').attr('font-size', 9.5).attr('font-family', 'JetBrains Mono').text(r.l);
    }
    const color = p.color || '#3cc8d6';
    const pts = p.data.map(d => [x(parse(d.d)), y(d.v)]);
    const area = d3.area().x(d => d[0]).y0(H - bottom).y1(d => d[1]);
    const gid = 'sm' + idx + Math.random().toString(36).slice(2, 6);
    svg.append('defs').html(`<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>`);
    svg.append('path').attr('d', area(pts)).attr('fill', `url(#${gid})`);
    svg.append('path').attr('d', d3.line()(pts)).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('stroke-linejoin', 'round');
    const lp = pts.at(-1);
    if (lp) svg.append('circle').attr('cx', lp[0]).attr('cy', lp[1]).attr('r', 3.5).attr('fill', color).attr('stroke', '#0b0f15').attr('stroke-width', 2);
    const xh = svg.append('g').attr('class', 'xhair').style('display', 'none');
    xh.append('line').attr('y1', 4).attr('y2', H - bottom);
    const dot = xh.append('circle').attr('r', 4).attr('fill', color).attr('stroke', '#0b0f15').attr('stroke-width', 2);
    charts.push({ svg, xh, dot, y, p, wrap, map: new Map(p.data.map(d => [d.d, d.v])) });
  });
  const bis = d3.bisector(d => d).left;
  const move = ev => {
    const [mx] = d3.pointer(ev, charts[0].svg.node());
    const dt = x.invert(mx);
    const key = d3.timeFormat('%Y-%m-%d')(dt);
    let i = Math.min(allDates.length - 1, Math.max(0, bis(allDates, key)));
    const d = allDates[i];
    const px = x(parse(d));
    for (const c of charts) {
      const v = c.map.get(d);
      c.xh.style('display', null).select('line').attr('x1', px).attr('x2', px);
      if (v != null) c.dot.attr('cx', px).attr('cy', c.y(v)).style('display', null); else c.dot.style('display', 'none');
      c.wrap.querySelector('.xv').textContent = v != null ? `${xFmt(d)} · ${c.p.fmt(v)}` : '';
    }
  };
  const leave = () => {
    for (const c of charts) {
      c.xh.style('display', 'none');
      const last = c.p.data.at(-1);
      c.wrap.querySelector('.xv').textContent = last ? c.p.fmt(last.v) : '';
    }
  };
  for (const c of charts) c.svg.on('mousemove', move).on('mouseleave', leave);
}

// ---------------------------------------------------------------------------
// Yield curve
// ---------------------------------------------------------------------------
const TENOR_Y = { '1 Mo': 1 / 12, '3 Mo': 0.25, '6 Mo': 0.5, '1 Yr': 1, '2 Yr': 2, '3 Yr': 3, '5 Yr': 5, '7 Yr': 7, '10 Yr': 10, '20 Yr': 20, '30 Yr': 30 };
const TENOR_SHORT = { '1 Mo': '1M', '3 Mo': '3M', '6 Mo': '6M', '1 Yr': '1Y', '2 Yr': '2Y', '3 Yr': '3Y', '5 Yr': '5Y', '7 Yr': '7Y', '10 Yr': '10Y', '20 Yr': '20Y', '30 Yr': '30Y' };

export function yieldCurve(el, yc) {
  if (!yc) { el.innerHTML = '<div class="empty">Waiting for Treasury data…</div>'; return; }
  const { w } = size(el);
  // When the panel sizes to its row (.fit), fill the available height.
  const fitted = (getComputedStyle(el.closest('.panel') || el).contain || '').includes('size');
  const H = fitted ? Math.max(260, el.clientHeight - 38) : 300, m = { t: 14, r: 50, b: 26, l: 40 };
  const series = [
    { k: 'year', label: `1 year ago (${yc.year.date})`, c: '#56606c', wd: 1.5 },
    { k: 'month', label: `1 month ago (${yc.month.date})`, c: '#8a7dff', wd: 1.5 },
    { k: 'week', label: `1 week ago (${yc.week.date})`, c: '#3cc8d6', wd: 1.5 },
    { k: 'latest', label: `Latest close (${yc.latest.date})`, c: '#ffb000', wd: 2.5 },
  ];
  const tenors = yc.tenors;
  const x = d3.scalePoint(tenors, [m.l, w - m.r]).padding(0.2);
  const vals = series.flatMap(s => yc[s.k].y).filter(v => v != null);
  const y = d3.scaleLinear([d3.min(vals) - 0.15, d3.max(vals) + 0.15], [H - m.b, m.t]).nice();
  el.innerHTML = `<div class="chart-legend">${series.slice().reverse().map(s => `<span><i style="background:${s.c}"></i>${esc(s.label)}</span>`).join('')}<span><i style="background:transparent;border:2px solid #fff;width:9px;height:9px;border-radius:50%"></i>Live (Yahoo)</span></div>`;
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', H);
  svg.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(''));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toFixed(1) + '%').tickSizeOuter(0));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat(t => TENOR_SHORT[t]).tickSizeOuter(0));
  const line = d3.line().defined(d => d[1] != null).x(d => x(d[0])).y(d => y(d[1])).curve(d3.curveMonotoneX);
  for (const s of series) {
    const data = tenors.map((t, i) => [t, yc[s.k].y[i]]);
    svg.append('path').attr('d', line(data)).attr('fill', 'none').attr('stroke', s.c).attr('stroke-width', s.wd).attr('opacity', s.k === 'latest' ? 1 : 0.85);
    if (s.k === 'latest') {
      data.filter(d => d[1] != null).forEach(d => svg.append('circle').attr('cx', x(d[0])).attr('cy', y(d[1])).attr('r', 3.5).attr('fill', s.c).attr('stroke', '#0b0f15').attr('stroke-width', 2));
    }
    const lastD = data.filter(d => d[1] != null).at(-1);
    if (lastD) svg.append('text').attr('x', x(lastD[0]) + 8).attr('y', y(lastD[1]) + 3).attr('fill', s.c).attr('font-size', 10).attr('font-family', 'JetBrains Mono').text(lastD[1].toFixed(2));
  }
  if (yc.live) {
    for (const [t, v] of Object.entries(yc.live)) {
      if (v == null || !x(t)) continue;
      svg.append('circle').attr('cx', x(t)).attr('cy', y(v)).attr('r', 6).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 1.5);
    }
  }
  // hover per tenor
  const band = x.step();
  tenors.forEach((t, i) => {
    svg.append('rect').attr('x', x(t) - band / 2).attr('width', band).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', ev => showTip(`<div class="tt-sym">${TENOR_SHORT[t]} Treasury</div>
        ${series.slice().reverse().map(s => `<div class="tt-row"><span style="color:${s.c}">${s.label.split(' (')[0]}</span><b>${yc[s.k].y[i]?.toFixed(2) ?? '—'}%</b></div>`).join('')}
        ${yc.live?.[t] != null ? `<div class="tt-row"><span>Live</span><b>${yc.live[t].toFixed(3)}%</b></div>` : ''}
        ${yc.year.y[i] != null && yc.latest.y[i] != null ? `<div class="tt-row"><span>1Y change</span><b class="${cls(yc.latest.y[i] - yc.year.y[i])}">${((yc.latest.y[i] - yc.year.y[i]) * 100).toFixed(0)} bps</b></div>` : ''}`, ev))
      .on('mouseleave', hideTip);
  });
}

// ---------------------------------------------------------------------------
// Spread history (2s10s and 3m10y), single axis in percentage points
// ---------------------------------------------------------------------------
export function spreadChart(el, series) {
  if (!series?.length) { el.innerHTML = ''; return; }
  const { w } = size(el);
  const H = 190, m = { t: 10, r: 14, b: 22, l: 40 };
  const parse = d3.timeParse('%m/%d/%Y');
  const data = series.map(s => ({ d: parse(s.d), a: s.s2s10, b: s.s3m10 })).filter(s => s.d);
  const x = d3.scaleTime(d3.extent(data, d => d.d), [m.l, w - m.r]);
  const ext = d3.extent(data.flatMap(d => [d.a, d.b]).filter(v => v != null));
  const y = d3.scaleLinear([Math.min(ext[0], -0.1), Math.max(ext[1], 0.1)], [H - m.b, m.t]).nice();
  const S = [{ k: 'a', label: '10Y − 2Y', c: '#ffb000' }, { k: 'b', label: '10Y − 3M', c: '#3cc8d6' }];
  el.innerHTML = `<div class="chart-title">Curve spreads · 1 year<span class="xv"></span></div><div class="chart-legend">${S.map(s => `<span><i style="background:${s.c}"></i>${s.label}</span>`).join('')}<span style="color:#66727f">below 0 = inverted curve (classic recession warning)</span></div>`;
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', H);
  svg.append('rect').attr('x', m.l).attr('width', w - m.l - m.r).attr('y', y(0)).attr('height', Math.max(0, H - m.b - y(0))).attr('fill', getPalette()[0]).attr('opacity', 0.06);
  svg.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat(''));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d => d.toFixed(1)).tickSizeOuter(0));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
  svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', '#66727f');
  for (const s of S) {
    svg.append('path').attr('d', d3.line().defined(d => d[s.k] != null).x(d => x(d.d)).y(d => y(d[s.k]))(data)).attr('fill', 'none').attr('stroke', s.c).attr('stroke-width', 2);
  }
  const xh = svg.append('g').attr('class', 'xhair').style('display', 'none');
  xh.append('line').attr('y1', m.t).attr('y2', H - m.b);
  const lab = el.querySelector('.xv');
  const bis = d3.bisector(d => d.d).left;
  svg.on('mousemove', ev => {
    const [mx] = d3.pointer(ev);
    const i = Math.min(data.length - 1, Math.max(0, bis(data, x.invert(mx))));
    const d = data[i];
    xh.style('display', null).select('line').attr('x1', x(d.d)).attr('x2', x(d.d));
    lab.textContent = `${d3.timeFormat('%b %d, %Y')(d.d)} · 10Y−2Y ${d.a?.toFixed(2)} · 10Y−3M ${d.b?.toFixed(2)}`;
  }).on('mouseleave', () => { xh.style('display', 'none'); lab.textContent = ''; });
}

// ---------------------------------------------------------------------------
// World map
// ---------------------------------------------------------------------------
let worldTopo = null;
let worldLoading = null;
const EURO_FALLBACK = ['040', '056', '620', '246', '372', '300', '442', '705', '703', '233', '428', '440', '191'];

export async function worldMap(el, global, onClick) {
  if (!worldTopo) {
    worldLoading ||= fetch('/vendor/countries-50m.json').then(r => r.json());
    worldTopo = await worldLoading;
  }
  const { w } = size(el);
  const H = el.clientHeight || 470;
  const feats = topojson.feature(worldTopo, worldTopo.objects.countries).features.filter(f => f.id !== '010');
  const proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [w - 6, H - 6]], { type: 'FeatureCollection', features: feats });
  const path = d3.geoPath(proj);
  const byIso = new Map();
  for (const g of global) for (const iso of g.iso) byIso.set(iso, g);
  const stoxx = global.find(g => g.s === '^STOXX50E');
  for (const iso of EURO_FALLBACK) if (!byIso.has(iso) && stoxx) byIso.set(iso, { ...stoxx, proxy: true });

  el.innerHTML = '';
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', H);
  svg.append('path').attr('d', path({ type: 'Sphere' })).attr('fill', '#070a0e').attr('stroke', '#141a22');
  svg.append('path').attr('d', path(d3.geoGraticule10())).attr('fill', 'none').attr('stroke', '#10151c').attr('stroke-width', 0.5);
  svg.append('g').selectAll('path').data(feats).join('path')
    .attr('class', f => 'country' + (byIso.has(f.id) ? ' has' : ''))
    .attr('d', path)
    .attr('fill', f => { const g = byIso.get(f.id); return g ? heatColor(g.q.c, 3) : '#161c25'; })
    .attr('opacity', f => (byIso.get(f.id)?.proxy ? 0.55 : 1))
    .on('mousemove', (ev, f) => {
      const g = byIso.get(f.id);
      if (!g) return hideTip();
      showTip(`<div class="tt-ind">${esc(f.properties.name)}${g.proxy ? ' · via Euro Stoxx 50' : ''}</div><div class="tt-head"><div class="tt-sym">${esc(g.label)}</div><div class="tt-big ${cls(g.q.c)}">${fmtPct(g.q.c)}</div></div>
        <div class="tt-row"><span>Level</span><b>${g.q.p?.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b></div>
        <div class="tt-row"><span>1W / 1M</span><b><span class="${cls(g.q.perf.w)}">${fmtPct(g.q.perf.w, 1)}</span> / <span class="${cls(g.q.perf.m)}">${fmtPct(g.q.perf.m, 1)}</span></b></div>
        <div class="tt-row"><span>YTD</span><b class="${cls(g.q.perf.ytd)}">${fmtPct(g.q.perf.ytd, 1)}</b></div>
        <div class="tt-row"><span>Session</span><b>${g.q.st === 'REGULAR' ? 'Open' : 'Closed'}</b></div>`, ev);
    })
    .on('mouseleave', hideTip)
    .on('click', (ev, f) => { const g = byIso.get(f.id); if (g) onClick?.(g.s); });

  // Labels at centroids for indices with a country shape; dots for tiny ones.
  const tiny = { '344': [114.17, 22.32], '702': [103.82, 1.35] };
  for (const g of global) {
    const iso = g.iso[0];
    if (!iso) continue;
    let pt;
    if (tiny[iso]) pt = proj(tiny[iso]);
    else {
      const f = feats.find(ff => ff.id === iso);
      if (!f) continue;
      const big = iso === '840' ? [-98, 39] : iso === '124' ? [-105, 57] : iso === '250' ? [2.4, 46.6] : iso === '554' ? [174, -41] : iso === '360' ? [113, -1] : iso === '458' ? [102, 4] : null;
      pt = big ? proj(big) : path.centroid(f);
    }
    if (!pt || isNaN(pt[0])) continue;
    if (tiny[iso]) svg.append('circle').attr('cx', pt[0]).attr('cy', pt[1]).attr('r', 4).attr('fill', heatColor(g.q.c, 3)).attr('stroke', '#fff').attr('stroke-width', 1);
    const small = ['528', '756', '056', '702', '344', '376', '158', '410'].includes(iso);
    if (small && w < 900) continue;
    svg.append('text').attr('class', 'map-lbl').attr('x', pt[0]).attr('y', pt[1] + (tiny[iso] ? -7 : 3)).attr('text-anchor', 'middle')
      .attr('font-size', small ? 8.5 : 10).text(fmtPct(g.q.c, 1));
  }
}

// ---------------------------------------------------------------------------
// Distribution histogram of daily % changes
// ---------------------------------------------------------------------------
export function distChart(el, dist) {
  const { w } = size(el);
  const H = 150, m = { t: 16, r: 6, b: 30, l: 6 };
  const isLo = v => v == null || v === -Infinity, isHi = v => v == null || v === Infinity;
  const labels = dist.map(d => (isLo(d.lo) ? `<${d.hi}` : isHi(d.hi) ? `>${d.lo}` : `${d.lo}…${d.hi}`));
  const x = d3.scaleBand(labels, [m.l, w - m.r]).padding(0.12);
  const y = d3.scaleLinear([0, d3.max(dist, d => d.count) || 1], [H - m.b, m.t]);
  el.innerHTML = '<div class="chart-title">Distribution of today\'s moves<span>stocks per bucket (%)</span></div>';
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', H);
  dist.forEach((d, i) => {
    const mid = isLo(d.lo) ? -12 : isHi(d.hi) ? 12 : (d.lo + d.hi) / 2;
    const bh = H - m.b - y(d.count);
    svg.append('path')
      .attr('d', roundedTop(x(labels[i]), y(d.count), x.bandwidth(), bh, Math.min(4, bh)))
      .attr('fill', heatColor(mid, 6))
      .on('mousemove', ev => showTip(`<div class="tt-sym">${labels[i]}%</div><div class="tt-row"><span>Stocks</span><b>${d.count}</b></div>`, ev))
      .on('mouseleave', hideTip);
    if (d.count) svg.append('text').attr('x', x(labels[i]) + x.bandwidth() / 2).attr('y', y(d.count) - 4).attr('text-anchor', 'middle')
      .attr('fill', '#a4b0bd').attr('font-size', 9.5).attr('font-family', 'JetBrains Mono').text(d.count);
  });
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0))
    .selectAll('text').attr('font-size', 8.5);
}

function roundedTop(x, y, w, h, r) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// ---------------------------------------------------------------------------
// VIX term structure mini chart
// ---------------------------------------------------------------------------
export function termChart(el, pts) {
  const { w } = size(el);
  const H = 120, m = { t: 16, r: 30, b: 22, l: 36 };
  const valid = pts.filter(p => p.v != null);
  if (valid.length < 2) { el.innerHTML = ''; return; }
  const x = d3.scalePoint(pts.map(p => p.k), [m.l, w - m.r]).padding(0.3);
  const ext = d3.extent(valid.flatMap(p => [p.v, p.prev].filter(v => v != null)));
  const y = d3.scaleLinear([ext[0] * 0.9, ext[1] * 1.08], [H - m.b, m.t]).nice();
  el.innerHTML = '<div class="chart-title">VIX term structure<span>today vs yesterday</span></div>';
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', H);
  svg.append('g').attr('class', 'grid-line').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(w - m.l - m.r)).tickFormat(''));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickSizeOuter(0));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0));
  const ln = d3.line().defined(d => d[1] != null).x(d => x(d[0])).y(d => y(d[1]));
  svg.append('path').attr('d', ln(pts.map(p => [p.k, p.prev]))).attr('fill', 'none').attr('stroke', '#56606c').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
  svg.append('path').attr('d', ln(pts.map(p => [p.k, p.v]))).attr('fill', 'none').attr('stroke', '#ffb000').attr('stroke-width', 2.5);
  for (const p of valid) {
    svg.append('circle').attr('cx', x(p.k)).attr('cy', y(p.v)).attr('r', 4).attr('fill', '#ffb000').attr('stroke', '#0b0f15').attr('stroke-width', 2);
    svg.append('text').attr('x', x(p.k)).attr('y', y(p.v) - 8).attr('text-anchor', 'middle').attr('fill', '#e6edf3').attr('font-size', 10).attr('font-family', 'JetBrains Mono').text(p.v.toFixed(1));
  }
}
