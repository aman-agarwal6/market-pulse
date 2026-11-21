// HTML panel renderers.
import { esc, fmtPrice, fmtPct, fmtChg, fmtBig, cls, arrow, heatColor, sparkSVG, pill, timeAgo } from './util.js';

const sym = s => s.replace(/\d{3,}-USD$/, '').replace(/-USD$/, '');

// ---------- Ticker strip ----------
export function renderStrip(el, strip) {
  el.innerHTML = strip.map(x => {
    const q = x.q;
    const isYield = x.kind === 'yield';
    const chgTxt = isYield ? `${q.ch >= 0 ? '+' : ''}${(q.ch * 100).toFixed(1)} bps` : `${fmtChg(q.ch)} (${fmtPct(q.c)})`;
    const price = isYield ? q.p.toFixed(3) + '%' : fmtPrice(q.p);
    const tone = x.s === '^VIX' ? -Math.sign(q.c) : Math.sign(q.c);
    return `<div class="tick ${tone > 0 ? 'is-up' : tone < 0 ? 'is-down' : ''}" data-sym="${esc(x.s)}">
      <div class="tick-label">${esc(x.label)}</div>
      <div class="tick-price">${price}</div>
      <div class="tick-chg ${cls(q.c)}">${arrow(q.c)} ${chgTxt}</div>
      ${sparkSVG(x.spark, { w: 160, h: 26, base: q.prev, color: tone > 0 ? 'var(--up)' : tone < 0 ? 'var(--down)' : undefined })}
    </div>`;
  }).join('');
}

// ---------- Scrolling tape ----------
let tapeSig = '';
export function renderTape(el, stocks) {
  const top = [...stocks].filter(s => s.c != null).sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 50);
  const sig = top.map(x => x.s).join(',');
  const html = top.map(x => `<span class="tape-item" data-sym="${esc(x.ys)}"><b>${esc(x.s)}</b>${fmtPrice(x.p)} <span class="${cls(x.c)}">${arrow(x.c)} ${fmtPct(x.c)}</span></span>`).join('');
  if (sig !== tapeSig) { el.innerHTML = html + html; tapeSig = sig; }
  else {
    // update values in place to keep the animation smooth
    const items = el.querySelectorAll('.tape-item');
    top.forEach((x, i) => {
      for (const node of [items[i], items[i + top.length]]) {
        if (!node) continue;
        node.innerHTML = `<b>${esc(x.s)}</b>${fmtPrice(x.p)} <span class="${cls(x.c)}">${arrow(x.c)} ${fmtPct(x.c)}</span>`;
      }
    });
  }
}

// ---------- Regime bar ----------
export function renderRegime(el, S) {
  const spx = S.strip.find(x => x.s === '^GSPC')?.q;
  const vix = S.strip.find(x => x.s === '^VIX')?.q;
  const b = S.breadth;
  const dd = spx?.h52 ? (spx.p / spx.h52 - 1) * 100 : null;
  const c = spx?.c ?? 0;
  const regime = dd != null && dd <= -20 ? 'BEAR MARKET' : dd != null && dd <= -10 ? 'CORRECTION' : c <= -3 ? 'SEVERE SELLOFF' : c <= -1.5 ? 'RISK-OFF' : c >= 1.5 ? 'RISK-ON RALLY' : c < -0.3 ? 'MILD WEAKNESS' : c > 0.3 ? 'GRINDING HIGHER' : 'RANGEBOUND';
  const tone = c <= -1 || (dd != null && dd <= -10) ? 'bad' : c >= 1 ? 'good' : 'neutral';
  const ad = b.n ? `${b.adv} ▲ / ${b.dec} ▼` : '—';
  const stat = (k, v, s, klass = '', extra = '') => `<div class="rstat"><div class="k">${k}</div><div class="v ${klass}">${v}</div><div class="s">${s}</div>${extra}</div>`;
  // Long-Term measures declines from the record close; this is from the 52-week intraday high, so say so.
  const ddLink = '<a class="rstat-link" href="#/longterm/history" title="Long-Term › History: past S&amp;P 500 declines and recoveries, measured from record closes">How this decline compares with history →</a>';
  el.innerHTML = `<div class="regime-badge ${tone}"><div class="k">Market regime</div><div class="v">${regime}</div></div>
    <div class="regime-stats">
      ${stat('S&amp;P drawdown', dd != null ? fmtPct(dd, 1) : '—', 'from 52-week intraday high', cls(dd), ddLink)}
      ${stat('Advancers / Decliners', ad, `${b.n ? Math.round(b.dec / b.n * 100) : 0}% of S&amp;P down`)}
      ${stat('Equal-weight S&amp;P', fmtPct(b.eqWeight), 'average stock today', cls(b.eqWeight))}
      ${stat('Fear &amp; Greed', S.fear?.score ?? '—', S.fear?.label || '', '')}
      ${stat('Risk appetite', S.riskScore != null ? S.riskScore + '/100' : '—', `${S.risk.filter(r => r.d > 0).length}/${S.risk.length} gauges risk-on`)}
      ${stat('VIX', vix ? vix.p.toFixed(2) : '—', vix ? `${fmtPct(vix.c, 1)} today` : '', vix && vix.c > 0 ? 'down' : 'up')}
      ${stat('Above 50-day avg', b.above50 != null ? b.above50.toFixed(0) + '%' : '—', `${b.above200?.toFixed(0) ?? '—'}% above 200-day`)}
    </div>`;
}

// ---------- Market brief ----------
export function renderBrief(el, brief) {
  el.innerHTML = brief.map(b => `<div class="bi ${b.tone}"><div class="rail"></div><div>
    <div class="bi-title"><span>${esc(b.title)}</span><span class="tag">${esc(b.tag)}</span></div>
    <div class="bi-text">${esc(b.text)}</div></div></div>`).join('') || '<div class="empty">Waiting for data…</div>';
}

// ---------- Sector bars ----------
export function renderSectorBars(el, sectors, tf) {
  const list = sectors.filter(s => s[tf] != null).sort((a, b) => b[tf] - a[tf]);
  const max = Math.max(0.5, ...list.map(s => Math.abs(s[tf])));
  el.innerHTML = list.map(s => {
    const v = s[tf];
    const wd = Math.abs(v) / max * 50;
    return `<div class="hbar" data-sym="${s.etf}" title="${esc(s.name)} · ${s.count} stocks · ${s.weight}% of S&P">
      <div class="lbl"><b>${esc(s.short)}</b><small>${s.etf}</small>
        <div class="adbar"><span style="flex:${s.adv};background:var(--up)"></span><span style="flex:${s.dec};background:var(--down)"></span></div></div>
      <div class="track"><span class="zero"></span><i class="${v >= 0 ? 'pos' : 'neg'}" style="width:${wd}%"></i></div>
      <div class="val ${cls(v)}">${fmtPct(v)}</div></div>`;
  }).join('') + `<div class="sub" style="margin-top:8px">Thin bar under each name = advancers vs decliners today. Defensives: Staples, Utilities, Health Care, Real Estate.</div>`;
}

// ---------- Risk on/off ----------
export function renderRisk(el, risk, score) {
  const max = Math.max(1, ...risk.map(r => Math.abs(r.d || 0)));
  const color = heatColor((score ?? 50) - 50, 50);
  el.innerHTML = `<div class="risk-head">
      <div class="risk-score" style="color:${color}">${score ?? '—'}<small>RISK SCORE</small></div>
      <div class="risk-meter"><div class="bar"><i style="left:${score ?? 50}%"></i></div><div class="ends"><span>Risk-off</span><span>Neutral</span><span>Risk-on</span></div></div>
    </div>
    ${risk.map(r => {
      const win = r.d > 0 ? r.on : r.off;
      return `<div class="rp" title="1W ${fmtPct(r.w)} · 1M ${fmtPct(r.m)}">
        <div class="lbl" title="${esc(r.label)}: ${r.a}/${r.b} — ${esc(win)} winning today">${esc(r.label)}<small>${r.a.replace('=F', '').replace('-USD', '')}/${r.b.replace('=F', '')} → <b class="${r.d > 0 ? 'up' : 'down'}">${esc(win)}</b></small></div>
        <div class="track"><span class="zero"></span><i class="${r.d >= 0 ? 'pos' : 'neg'}" style="width:${Math.abs(r.d || 0) / max * 50}%"></i></div>
        <div class="val ${cls(r.d)}">${fmtPct(r.d)}</div></div>`;
    }).join('')}`;
}

// ---------- Asset class flows ----------
export function renderAssets(el, assets) {
  let grp = '';
  let rows = '';
  const maxRv = Math.max(2, ...assets.map(a => a.rv || 0));
  for (const a of assets) {
    if (a.group !== grp) { grp = a.group; rows += `<tr class="grp"><td colspan="7">${esc(grp)}</td></tr>`; }
    const q = a.q;
    const flow = (q.c || 0) * (a.rv || 1);
    const flowTxt = Math.abs(flow) < 0.15 ? '<span class="flat">— flat</span>' : flow > 0 ? `<span class="up flow-arrow">▲ INFLOW</span>` : `<span class="down flow-arrow">▼ OUTFLOW</span>`;
    rows += `<tr class="click" data-sym="${a.s}">
      <td class="txt"><span class="sym">${a.s}</span> <span class="nm">${esc(a.label)}</span></td>
      <td>${fmtPrice(q.p)}</td>
      <td>${pill(q.c, 3)}</td>
      <td class="${cls(q.perf.w)}">${fmtPct(q.perf.w, 1)}</td>
      <td class="${cls(q.perf.m)}">${fmtPct(q.perf.m, 1)}</td>
      <td><div class="rv"><span>${a.rv != null ? a.rv.toFixed(1) + 'x' : '—'}</span><span class="b"><i class="${a.rv > 1.5 ? 'hot' : ''}" style="width:${Math.min(100, (a.rv || 0) / maxRv * 100)}%"></i></span></div></td>
      <td>${flowTxt}</td></tr>`;
  }
  el.innerHTML = `<table class="tbl"><thead><tr><th>Asset</th><th>Price</th><th>Today</th><th>1W</th><th>1M</th><th>Vol vs avg</th><th>Signal</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="sub" style="margin-top:8px">Signal = direction × relative volume. Big moves on heavy volume suggest real money moving in or out.</div>`;
}

// ---------- Contributors ----------
export function renderContrib(el, contributors, spx) {
  const all = [...contributors.down, ...contributors.up];
  const max = Math.max(0.5, ...all.map(x => Math.abs(x.pts)));
  const col = (title, list) => `<div><h5>${title}</h5>${list.map(x => `
    <div class="cbar" data-sym="${esc(x.s.replace(/\./g, '-'))}" title="${esc(x.n)} · ${esc(x.sec)}">
      <span class="s">${esc(x.s)}</span>
      <span class="track"><i style="width:${Math.abs(x.pts) / max * 100}%;background:${x.pts < 0 ? 'var(--down)' : 'var(--up)'}"></i></span>
      <span class="v ${cls(x.pts)}">${x.pts > 0 ? '+' : ''}${x.pts.toFixed(1)}</span></div>`).join('')}</div>`;
  const dn = contributors.down.reduce((a, x) => a + x.pts, 0);
  const up = contributors.up.reduce((a, x) => a + x.pts, 0);
  el.innerHTML = `<div class="contrib-cols">${col('Biggest drags (pts)', contributors.down)}${col('Biggest lifts (pts)', contributors.up)}</div>
    <div class="contrib-total">S&amp;P 500 today: <b class="${cls(spx?.ch)}">${spx ? fmtChg(spx.ch) : '—'} pts</b> · top-10 drags <b class="down">${dn.toFixed(1)}</b> · top-10 lifts <b class="up">+${up.toFixed(1)}</b></div>`;
}

// ---------- Themes ----------
export function renderThemes(el, themes) {
  el.innerHTML = themes.map(t => `<div class="theme" data-sym="${t.s}" style="background:linear-gradient(160deg, ${heatColor(t.q.c, 4)}, ${heatColor(t.q.c * 0.6, 4)})">
    <div class="l">${esc(t.label)}</div><div class="s">${t.s} · ${fmtPrice(t.q.p)}</div>
    <div class="c">${fmtPct(t.q.c)}</div>
    <div class="wm"><span>1W ${fmtPct(t.q.perf.w, 1)}</span><span>1M ${fmtPct(t.q.perf.m, 1)}</span></div></div>`).join('');
}

// ---------- Breadth now ----------
function ring(pct, label, color) {
  const r = 30, c = 2 * Math.PI * r;
  return `<div class="ring"><svg width="80" height="80" viewBox="0 0 80 80">
    <circle cx="40" cy="40" r="${r}" fill="none" stroke="#141a24" stroke-width="8"/>
    <circle cx="40" cy="40" r="${r}" fill="none" style="stroke:${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c * pct / 100} ${c}" transform="rotate(-90 40 40)"/>
    <text x="40" y="45" text-anchor="middle" fill="#e6edf3" font-family="JetBrains Mono" font-weight="700" font-size="15">${pct.toFixed(0)}%</text></svg>
    <div class="k">${label}</div></div>`;
}
export function renderBreadthNow(el, b) {
  const uv = b.upVol + b.dnVol || 1;
  el.innerHTML = `<div class="bwrap">
    <div class="bblock">
      <h5>Advancers vs decliners <span>${b.adv} / ${b.dec}</span></h5>
      <div class="split"><div class="u" style="flex-grow:${b.adv}">${b.adv}</div>${b.unch ? `<div class="n" style="flex-grow:${b.unch}"></div>` : ''}<div class="d" style="flex-grow:${b.dec}">${b.dec}</div></div>
      <h5 style="margin-top:12px">Up vs down volume <span>${(b.upVol / uv * 100).toFixed(0)}% up</span></h5>
      <div class="split"><div class="u" style="flex-grow:${b.upVol}">${fmtBig(b.upVol)}</div><div class="d" style="flex-grow:${b.dnVol}">${fmtBig(b.dnVol)}</div></div>
      <h5 style="margin-top:12px">52-week extremes</h5>
      <div class="hl"><div><div class="k">New highs</div><div class="v up">${b.newHigh}</div></div><div><div class="k">New lows</div><div class="v down">${b.newLow}</div></div></div>
    </div>
    <div class="bblock">
      <h5>Trend participation</h5>
      <div class="rings">${ring(b.above50, 'above 50-day', b.above50 >= 50 ? 'var(--up)' : 'var(--down)')}${ring(b.above200, 'above 200-day', b.above200 >= 50 ? 'var(--up)' : 'var(--down)')}</div>
      <div class="sub" style="margin-top:10px">Below 20% on the 50-day historically marks oversold washouts; above 80% is overbought.</div>
    </div>
  </div><div class="dist" id="distChart"></div>`;
}

// ---------- Movers ----------
export function renderMovers(el, movers, tab) {
  const list = movers[tab] || [];
  el.innerHTML = `<table class="tbl"><thead><tr><th>Symbol</th><th>Price</th><th>Change</th><th>Volume</th><th>Vol vs 10d</th><th>$ Traded</th></tr></thead><tbody>
    ${list.map(x => `<tr class="click" data-sym="${esc(x.ys)}">
      <td class="txt"><span class="sym">${esc(x.s)}</span> <span class="nm">${esc(x.n)}</span></td>
      <td>${fmtPrice(x.p)}</td><td>${pill(x.c, 5)}</td><td>${fmtBig(x.v)}</td>
      <td class="${x.rv > 2 ? 'up' : ''}">${x.rv != null ? x.rv.toFixed(2) + 'x' : '—'}</td><td>${fmtBig(x.dv, '$')}</td></tr>`).join('')}
  </tbody></table>`;
}

// ---------- Volatility ----------
export function renderVol(el, vol) {
  el.innerHTML = `<div class="vol-grid">${vol.map(v => `<div class="vtile" data-sym="${esc(v.s)}">
    <div class="k">${esc(v.label)}</div><div class="n">${esc(v.note)}</div>
    <div class="v">${v.q.p?.toFixed(2)}</div><div class="c ${v.q.c > 0 ? 'down' : v.q.c < 0 ? 'up' : 'flat'}">${arrow(v.q.c)} ${fmtPct(v.q.c, 1)}</div></div>`).join('')}</div>
    <div class="term" id="termChart"></div><div id="termNote"></div>`;
  const vix = vol.find(v => v.s === '^VIX')?.q, v3 = vol.find(v => v.s === '^VIX3M')?.q, v9 = vol.find(v => v.s === '^VIX9D')?.q;
  const note = el.querySelector('#termNote');
  if (vix && v3) {
    const r = vix.p / v3.p;
    note.innerHTML = `<div class="term-note">VIX / VIX3M = <b>${r.toFixed(2)}</b> — ${r > 1 ? 'the curve is <b>inverted (backwardation)</b>: traders want protection right now. This happens in acute selloffs and often near short-term bottoms.' : r > 0.92 ? 'the curve is <b>flattening</b>: near-term worry is building.' : 'the curve is in normal <b>contango</b>: no acute panic.'}${v9 && v9.p > vix.p ? ` 9-day VIX above 30-day: stress is front-loaded.` : ''}</div>`;
  }
  return [
    { k: '9-Day', v: v9?.p, prev: v9?.prev },
    { k: '30-Day', v: vix?.p, prev: vix?.prev },
    { k: '3-Month', v: v3?.p, prev: v3?.prev },
  ];
}

// ---------- Global list ----------
export function renderGlobalList(el, global) {
  const regions = d3.group(global, g => g.region);
  let html = '';
  for (const [region, list] of regions) {
    html += `<div class="region-h">${esc(region)}</div>`;
    html += [...list].sort((a, b) => (b.q.c ?? -99) - (a.q.c ?? -99)).map(g => `<div class="gi" data-sym="${esc(g.s)}">
      <span class="cc">${g.cc}</span>
      <span class="l"><span class="st ${g.q.st === 'REGULAR' ? 'live' : ''}" title="${g.q.st === 'REGULAR' ? 'Open now' : 'Closed'}"></span>${esc(g.label)}<small>${g.q.perf.ytd != null ? 'YTD ' + fmtPct(g.q.perf.ytd, 0) : ''}</small></span>
      <span class="p">${g.q.p?.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
      ${pill(g.q.c, 3)}</div>`).join('');
  }
  el.innerHTML = html;
}

// ---------- Rates ----------
export function renderRateTiles(el, rates, yc) {
  const tile = (k, v, c, n, alert) => `<div class="rtile ${alert ? 'alert' : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="c">${c}</div><div class="n">${n}</div></div>`;
  let html = rates.map(r => tile(r.label, r.q.p.toFixed(3) + '%', `<span class="${cls(r.q.ch)}">${r.q.ch >= 0 ? '+' : ''}${(r.q.ch * 100).toFixed(1)} bps</span>`, `1M ${r.q.perf.m != null ? fmtPct(r.q.perf.m, 1) : '—'}`)).join('');
  if (yc?.latest) {
    const T = yc.tenors, L = yc.latest.y;
    const y2 = L[T.indexOf('2 Yr')], y10 = L[T.indexOf('10 Yr')], y3m = L[T.indexOf('3 Mo')];
    const s1 = y10 - y2, s2 = y10 - y3m;
    html += tile('2Y Treasury', y2?.toFixed(2) + '%', '<span class="flat">daily close</span>', 'U.S. Treasury');
    html += tile('10Y − 2Y', (s1 * 100).toFixed(0) + ' bps', s1 < 0 ? '<span class="down">INVERTED</span>' : '<span class="up">positive</span>', 'curve slope', s1 < 0);
    html += tile('10Y − 3M', (s2 * 100).toFixed(0) + ' bps', s2 < 0 ? '<span class="down">INVERTED</span>' : '<span class="up">positive</span>', 'Fed\'s favored signal', s2 < 0);
  }
  el.innerHTML = `<div class="rate-tiles">${html}</div>`;
}

// ---------- Crypto list ----------
export function renderCryptoList(el, crypto, sparks) {
  const list = [...crypto].sort((a, b) => (b.mc || 0) - (a.mc || 0));
  el.innerHTML = `<table class="tbl"><thead><tr><th>Coin</th><th>Price</th><th>24h</th><th>7d</th><th>30 days</th></tr></thead><tbody>
    ${list.map(c => `<tr class="click" data-sym="${esc(c.s)}">
      <td class="txt"><span class="sym">${esc(sym(c.s))}</span> <span class="nm">${fmtBig(c.mc, '$')}</span></td>
      <td>${fmtPrice(c.p)}</td><td>${pill(c.c, 6, 1)}</td><td class="${cls(c.perf.w)}">${fmtPct(c.perf.w, 1)}</td>
      <td class="spark-cell">${sparkSVG(sparks[c.s] ? [...sparks[c.s], c.p] : null, { w: 70, h: 20, fill: false })}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- Commodities / FX ----------
export function renderQuoteTable(el, rows, { grouped = false, sparks = {}, max = 3 } = {}) {
  let grp = '';
  let body = '';
  for (const r of rows) {
    if (grouped && r.group !== grp) { grp = r.group; body += `<tr class="grp"><td colspan="7">${esc(grp)}</td></tr>`; }
    const q = r.q;
    body += `<tr class="click" data-sym="${esc(r.s)}">
      <td class="txt"><span class="sym">${esc(r.label)}</span> <span class="nm">${esc(r.note || r.unit || r.s)}</span></td>
      <td>${fmtPrice(q.p)}</td><td>${pill(q.c, max)}</td>
      <td class="${cls(q.perf.w)}">${fmtPct(q.perf.w, 1)}</td><td class="${cls(q.perf.m)}">${fmtPct(q.perf.m, 1)}</td><td class="${cls(q.perf.ytd)}">${fmtPct(q.perf.ytd, 1)}</td>
      <td class="spark-cell">${sparkSVG(sparks[r.s] ? [...sparks[r.s], q.p] : null, { w: 80, h: 20, fill: false })}</td></tr>`;
  }
  el.innerHTML = `<table class="tbl"><thead><tr><th>Market</th><th>Last</th><th>Today</th><th>1W</th><th>1M</th><th>YTD</th><th>30 sessions</th></tr></thead><tbody>${body}</tbody></table>`;
}

// ---------- News ----------
export function newsHTML(items, lookup) {
  if (!items?.length) return '<div class="empty">No headlines yet.</div>';
  return items.map(n => {
    const tks = (n.tickers || []).slice(0, 4).map(t => {
      const q = lookup(t);
      return `<span class="tk ${q ? cls(q.c) : ''}">${esc(t)}${q?.c != null ? ' ' + fmtPct(q.c, 1) : ''}</span>`;
    }).join('');
    return `<a class="nitem ${n.thumb ? '' : 'nothumb'}" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">
      ${n.thumb ? `<img src="${esc(n.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <div><div class="t">${esc(n.title)}</div><div class="m"><span class="pub">${esc(n.publisher)}</span><span>${timeAgo(n.time)}</span>${tks}</div></div></a>`;
  }).join('');
}

// ---------- Futures row ----------
export function renderFutures(el, futures, marketState) {
  const open = marketState === 'REGULAR';
  el.innerHTML = `<span class="lbl">${open ? 'Futures' : 'Futures · trading now'}</span>` + futures.map(f => `<span class="fut" data-sym="${esc(f.s)}" title="${esc(f.q.n)}">
    <span class="k">${esc(f.label)}</span>${fmtPrice(f.q.p)}<span class="${cls(f.q.c)}">${fmtPct(f.q.c)}</span></span>`).join('');
}

// ---------- Earnings ----------
const etDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
const etHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
function session(t) {
  const h = +etHour.format(new Date(t * 1000));
  return h < 10 ? 'pre' : h >= 16 ? 'post' : '';
}
export function renderEarnings(el, earnings) {
  const up = earnings?.upcoming || [];
  const rec = earnings?.recent || [];
  const byDay = d3.group(up, e => etDay.format(new Date(e.t * 1000)));
  let left = '';
  for (const [day, list] of byDay) {
    const sorted = [...list].sort((a, b) => b.mc - a.mc);
    left += `<div class="earn-day">${esc(day)}</div><div class="earn-chips">${sorted.map(e => {
      const ses = session(e.t);
      return `<span class="echip ${e.mc > 2e11 ? 'big' : ''}" data-sym="${esc(e.ys)}" title="${esc(e.n)} · ${fmtBig(e.mc, '$')}${e.est ? ' · date estimated' : ''}">${esc(e.s)}<small>${ses === 'pre' ? 'BMO' : ses === 'post' ? 'AMC' : ''}${e.est ? '*' : ''}</small></span>`;
    }).join('')}</div>`;
  }
  const right = rec.length ? `<table class="tbl"><thead><tr><th>Reported</th><th>When</th><th>Today</th><th>1W</th></tr></thead><tbody>${rec.slice(0, 14).map(e => `
    <tr class="click" data-sym="${esc(e.ys)}"><td class="txt"><span class="sym">${esc(e.s)}</span> <span class="nm">${esc(e.n)}</span></td>
    <td class="flat">${etDay.format(new Date(e.t * 1000)).replace(/^\w+, /, '')}</td><td>${pill(e.c, 5)}</td><td class="${cls(e.w)}">${fmtPct(e.w, 1)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No S&amp;P reports in the last few days.</div>';
  el.innerHTML = `<div class="earn-cols"><div><h5>Upcoming · BMO = before open, AMC = after close, * = estimated</h5><div class="earn-scroll">${left || '<div class="empty">No S&amp;P reports in the next week.</div>'}</div></div>
    <div><h5>Recently reported · market reaction</h5><div class="earn-scroll">${right}</div></div></div>`;
}

// ---------- Watchlist ----------
export function renderWatchlist(el, syms, lookup, sparks) {
  if (!syms.length) { el.innerHTML = '<div class="empty">Your watchlist is empty. Search a ticker above, or open any chart and click ☆.</div>'; return; }
  el.innerHTML = `<table class="tbl"><thead><tr><th>Symbol</th><th>Last</th><th>Today</th><th>1M</th><th>30 sessions</th><th></th></tr></thead><tbody>${syms.map(s => {
    const q = lookup(s);
    return `<tr class="click" data-sym="${esc(s)}"><td class="txt"><span class="sym">${esc(q?.label || s)}</span> <span class="nm">${esc(q?.n || '')}</span></td>
      <td>${q ? fmtPrice(q.p) : '…'}</td><td>${q ? pill(q.c, 3) : ''}</td><td class="${cls(q?.perf?.m)}">${q ? fmtPct(q.perf?.m, 1) : ''}</td>
      <td class="spark-cell">${sparkSVG(sparks[s] && q ? [...sparks[s], q.p] : null, { w: 80, h: 20, fill: false })}</td>
      <td><button class="wl-x" data-rm="${esc(s)}" title="Remove">✕</button></td></tr>`;
  }).join('')}</tbody></table>`;
}

// ---------- Sector money flow (dollar volume in rising vs falling stocks) ----------
export function renderSectorFlow(el, stocks, sectors) {
  const rows = sectors.map(sec => {
    let up = 0, dn = 0, norm = 0;
    for (const x of stocks) {
      if (x.sec !== sec.name || !x.p || !x.v) continue;
      const dv = x.p * x.v;
      if (x.c > 0) up += dv; else if (x.c < 0) dn += dv;
      if (x.av) norm += x.p * x.av;
    }
    return { name: sec.short, full: sec.name, etf: sec.etf, up, dn, net: up - dn, act: norm ? (up + dn) / norm : null };
  }).sort((a, b) => b.net - a.net);
  const max = Math.max(1, ...rows.map(r => Math.abs(r.net)));
  const signed = v => (v >= 0 ? '+' : '−') + fmtBig(Math.abs(v), '$');
  const totUp = rows.reduce((a, r) => a + r.up, 0), totDn = rows.reduce((a, r) => a + r.dn, 0);
  el.innerHTML = `<div class="sflow-head"><span>Sector</span><span style="text-align:center">outflow ◂ ▸ inflow</span><span>Net $</span><span>Activity</span></div>
    ${rows.map(r => `<div class="sflow" data-sym="${r.etf}" title="${esc(r.full)} · $ in rising stocks ${fmtBig(r.up, '$')} · $ in falling stocks ${fmtBig(r.dn, '$')}">
      <span class="lbl">${esc(r.name)}</span>
      <span class="track"><span class="zero"></span><i class="${r.net >= 0 ? 'pos' : 'neg'}" style="width:${Math.abs(r.net) / max * 50}%"></i></span>
      <span class="val ${cls(r.net)}">${signed(r.net)}</span>
      <span class="act ${r.act > 1.2 ? 'hot' : ''}">${r.act != null ? r.act.toFixed(1) + 'x' : '—'}</span></div>`).join('')}
    <div class="contrib-total">All S&amp;P 500: <b class="up">${fmtBig(totUp, '$')}</b> traded in rising stocks vs <b class="down">${fmtBig(totDn, '$')}</b> in falling ones
      (${totUp + totDn ? Math.round(totDn / (totUp + totDn) * 100) : 0}% of dollar volume on the sell side). Activity = today's $ volume ÷ 10-day average, so it climbs through the session.</div>`;
}

// ---------- Watchlist quick-add chips ----------
const QUICK = [
  ['^VIX', 'VIX'], ['TLT', 'TLT'], ['GLD', 'GLD'], ['UUP', 'UUP'], ['HYG', 'HYG'], ['IWM', 'IWM'], ['SMH', 'SMH'],
  ['XLU', 'XLU'], ['XLP', 'XLP'], ['ES=F', 'ES fut'], ['CL=F', 'Oil'], ['ETH-USD', 'ETH'], ['AAPL', 'AAPL'], ['MSFT', 'MSFT'], ['AMZN', 'AMZN'], ['TSLA', 'TSLA'],
];
export function renderWatchQuick(el, syms) {
  const avail = QUICK.filter(([s]) => !syms.includes(s)).slice(0, 12);
  el.innerHTML = avail.length ? `<h5>Quick add · useful in a selloff</h5><div class="chips">${avail.map(([s, l]) => `<button data-add="${esc(s)}" title="Add ${esc(s)}">+ ${esc(l)}</button>`).join('')}</div>` : '';
}
