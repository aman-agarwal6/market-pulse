// Treemap heatmap (finviz-style) rendered with absolutely-positioned divs so
// colors and positions can animate between live updates.
import { heatColor, fmtPct, fmtPrice, fmtBig, esc, showTip, moveTip, hideTip, sparkSVG, TF_MAX, TF_LABEL, cls } from './util.js';

export class Heatmap {
  constructor(el, { grouped = true, onClick, onSector, maxFor = tf => TF_MAX[tf] || 3, sparks = () => ({}), tfLabels = TF_LABEL, colorFor = null, fmtFor = null } = {}) {
    this.el = el;
    this.onSector = onSector;
    this.colorFor = colorFor || ((v, tf) => heatColor(v, this.maxFor(tf)));
    this.fmtFor = fmtFor || ((v) => fmtPct(v));
    this.grouped = grouped;
    this.onClick = onClick;
    this.maxFor = maxFor;
    this.sparks = sparks;
    this.tfLabels = tfLabels;
    this.cells = new Map();
    this.sectorEls = new Map();
    this.prevPrice = new Map();
    this.items = [];
    this.opts = { tf: 'c', size: 'mc', sector: null, search: '' };
    this.byKey = new Map();
    this.frozen = new Map(); // stable tile sizes so the layout doesn't jump on every tick
    this.frozenAt = 0;

    el.addEventListener('mousemove', e => {
      const cell = e.target.closest('.hm-cell');
      if (!cell) return hideTip();
      const it = this.byKey.get(cell.dataset.k);
      if (!it) return hideTip();
      if (this._tipKey !== it.key || !document.getElementById('tooltip').classList.contains('show')) {
        this._tipKey = it.key;
        showTip(this.tipHTML(it), e);
      } else moveTip(e);
    });
    el.addEventListener('mouseleave', () => { this._tipKey = null; hideTip(); });
    el.addEventListener('click', e => {
      const lbl = e.target.closest('.hm-sector-label');
      if (lbl && this.onSector) { this.onSector(this.opts.sector ? null : lbl.dataset.sec); return; }
      const cell = e.target.closest('.hm-cell');
      if (cell && this.onClick) this.onClick(this.byKey.get(cell.dataset.k));
    });
    new ResizeObserver(() => this.render()).observe(el);
  }

  sizeOf(it) {
    if (!this.frozen.has(it.key)) this.frozen.set(it.key, it.size || 0);
    return this.frozen.get(it.key);
  }

  update(items, opts = {}) {
    if (Date.now() - this.frozenAt > 30 * 60000) { this.frozen.clear(); this.frozenAt = Date.now(); }
    this.items = items;
    this.byKey = new Map(items.map(x => [x.key, x]));
    Object.assign(this.opts, opts);
    this.render(true);
  }

  setOpts(opts) { Object.assign(this.opts, opts); this.render(); }

  val(it) { return it.perf?.[this.opts.tf] ?? null; }

  render(live = false) {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    if (!W || !H || !this.items.length) return;
    const { tf, size, sector, search } = this.opts;
    this.el.classList.toggle('zoomed', !!sector);
    let items = this.items.filter(x => this.sizeOf(x) > 0);
    if (sector) items = items.filter(x => x.group === sector);

    let rootData;
    if (this.grouped) {
      const g = d3.group(items, d => d.group, d => d.sub);
      rootData = { children: [...g].map(([name, subs]) => ({ name, children: [...subs].map(([sname, list]) => ({ name: sname, children: list })) })) };
    } else rootData = { children: items };

    const root = d3.hierarchy(rootData)
      .sum(d => (d.children ? 0 : size === 'eq' ? 1 : this.sizeOf(d)))
      .sort((a, b) => b.value - a.value);
    d3.treemap()
      .size([W, H])
      .tile(d3.treemapSquarify.ratio(1.15))
      .paddingTop(d => (this.grouped && d.depth === 1 ? 16 : 0))
      .paddingInner(d => (d.depth === 0 ? (this.grouped ? 3 : 1) : d.depth === 1 ? 1 : 0))
      .round(true)(root);

    // Sector frames
    const seenSec = new Set();
    if (this.grouped) {
      for (const node of root.children || []) {
        const name = node.data.name;
        seenSec.add(name);
        let el = this.sectorEls.get(name);
        if (!el) {
          el = document.createElement('div');
          el.className = 'hm-sector';
          el.innerHTML = '<div class="hm-sector-label"></div>';
          this.el.appendChild(el);
          this.sectorEls.set(name, el);
        }
        Object.assign(el.style, { left: node.x0 + 'px', top: node.y0 + 'px', width: node.x1 - node.x0 + 'px', height: node.y1 - node.y0 + 'px' });
        let s = 0, w = 0;
        for (const lf of node.leaves()) { const v = this.val(lf.data); if (v != null) { const wt = size === 'eq' ? 1 : lf.data.size; s += v * wt; w += wt; } }
        const avg = w ? s / w : null;
        const lbl = el.firstChild;
        const nameTxt = (node.x1 - node.x0) > 120 ? name : (node.x1 - node.x0) > 60 ? name.split(' ')[0] : '';
        lbl.dataset.sec = name;
        lbl.title = this.opts.sector ? 'Click to zoom out' : `Click to zoom into ${name}`;
        lbl.innerHTML = `${esc(nameTxt)}${(node.x1 - node.x0) > 70 ? `<span class="num ${tf === 'rv' || tf === 'off' ? '' : cls(avg)}">${this.fmtFor(avg, tf)}</span>` : ''}`;
      }
    }
    for (const [k, el] of this.sectorEls) if (!seenSec.has(k)) { el.remove(); this.sectorEls.delete(k); }

    // Cells
    const seen = new Set();
    const q = (search || '').trim().toUpperCase();
    this.el.classList.toggle('has-filter', !!q);
    for (const lf of root.leaves()) {
      const it = lf.data;
      seen.add(it.key);
      let el = this.cells.get(it.key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'hm-cell';
        el.dataset.k = it.key;
        this.el.appendChild(el);
        this.cells.set(it.key, el);
      }
      const w = lf.x1 - lf.x0, h = lf.y1 - lf.y0;
      const v = this.val(it);
      el.style.left = lf.x0 + 'px';
      el.style.top = lf.y0 + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.backgroundColor = this.colorFor(v, tf);

      const label = it.label;
      const fs = Math.max(8, Math.min(34, Math.min(w / (label.length * 0.68 + 0.6), h * 0.36)));
      let html = '';
      if (w >= 18 && h >= 12) {
        html = `<div class="t" style="font-size:${fs.toFixed(1)}px">${esc(label)}</div>`;
        const pctTxt = this.fmtFor(v, tf);
        const pfs = Math.min(fs * 0.62, (w - 4) / (pctTxt.length * 0.62));
        if (h > fs * 2.3 && pfs >= 7) html += `<div class="c" style="font-size:${pfs.toFixed(1)}px">${pctTxt}</div>`;
        if (h > fs * 4.2 && w > 90 && it.name) html += `<div class="nm">${esc(it.name)}</div>`;
      }
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
      el.classList.toggle('match', !!q && (it.label.toUpperCase().startsWith(q) || (it.name || '').toUpperCase().includes(q)));

      if (live) {
        const prev = this.prevPrice.get(it.key);
        if (prev != null && it.price != null && prev !== it.price) {
          el.classList.remove('flash-up', 'flash-down');
          void el.offsetWidth;
          el.classList.add(it.price > prev ? 'flash-up' : 'flash-down');
        }
        this.prevPrice.set(it.key, it.price);
      }
    }
    for (const [k, el] of this.cells) if (!seen.has(k)) { el.remove(); this.cells.delete(k); }
  }

  tipHTML(it) {
    const tf = this.opts.tf;
    const peers = this.grouped
      ? this.items.filter(x => x.sub === it.sub).sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 9)
      : [];
    if (this.grouped && !peers.includes(it)) peers.push(it);
    const pmax = Math.max(1, ...peers.map(p => Math.abs(this.val(p) || 0)));
    const sp = this.sparks()[it.sym];
    const perfKeys = Object.keys(this.tfLabels).filter(k => it.perf?.[k] !== undefined);
    return `
      ${this.grouped ? `<div class="tt-ind">${esc(it.group)} › ${esc(it.sub)}</div>` : ''}
      <div class="tt-head"><div><div class="tt-sym">${esc(it.label)}</div><div class="tt-name">${esc(it.name || '')}</div></div>
        <div style="text-align:right"><div class="tt-big ${tf === 'rv' || tf === 'off' ? '' : cls(this.val(it))}">${this.fmtFor(this.val(it), tf)}</div><div class="tt-name">${this.tfLabels[tf] || ({ ext: 'Pre / after hours', rv: 'Volume vs 10d avg', off: 'From 52-week high' })[tf] || ''}</div></div></div>
      <div class="tt-row"><span>Price</span><b>${fmtPrice(it.price)}</b></div>
      ${it.size ? `<div class="tt-row"><span>Market cap</span><b>${fmtBig(it.size, '$')}</b></div>` : ''}
      ${it.extra || ''}
      ${sp ? `<div class="tt-spark">${sparkSVG([...sp, it.price], { w: 300, h: 40 })}<div class="tt-row" style="font-size:10px"><span>last 30 sessions</span></div></div>` : ''}
      <div class="tt-perf">${perfKeys.map(k => `<div style="background:${heatColor(it.perf[k], this.maxFor(k))}"><small>${this.tfLabels[k]}</small>${fmtPct(it.perf[k], 1)}</div>`).join('')}</div>
      ${peers.length > 1 ? `<div class="tt-peers">${peers.map(p => {
        const v = this.val(p);
        return `<div class="tt-peer ${p === it ? 'self' : ''}"><span>${esc(p.label)}</span><span class="bar" style="width:${Math.max(2, Math.abs(v || 0) / pmax * 100)}%;background:${this.colorFor(v, tf)}"></span><span style="text-align:right" class="${p === it || tf === 'rv' || tf === 'off' ? '' : cls(v)}">${this.fmtFor(v, tf)}</span></div>`;
      }).join('')}</div>` : ''}`;
  }
}
