// Long-Term › Planning: DCA simulator (real price history, computed in the
// browser) and the compounding projector (historical rolling-window ranges).
import { panelHTML, segHTML, seg, tsChart, setSourceBadge, errorStateHTML, skeletonHTML } from '../../ui.js';
import { debounce } from '../../util.js';
import { getHistory, getLongterm, getEtfs, search } from './data.js';
import { simulateDCA, project } from './sim.js';
import { fanChart } from './charts.js';
import { esc, fmtDate, fmtMonth, pct, share, usd, spanWords, loadPref, savePref, tone } from './fmt.js';

const QUICK = ['VOO', 'VTI', 'VT', 'VXUS', 'QQQ', 'SCHD', 'BND', 'AOR'];
const PRESETS = [['5y', '5 years'], ['10y', '10 years'], ['start', 'Since fund start'], ['2007', 'Oct 2007 peak'], ['2022', 'Jan 2022']];
const DCA_KEY = 'mp.lt.dca', PROJ_KEY = 'mp.lt.proj';
const st = {
  dca: loadPref(DCA_KEY, { s: 'VOO', monthly: 500, lump: 0, preset: '10y', start: null }),
  proj: loadPref(PROJ_KEY, { age: 23, target: 65, start: 1000, monthly: 500 }),
  chart: null, fan: null, hist: null, runId: 0, lt: null,
};

const field = (id, label, input, hint = '') => `<label class="lt-f" for="${id}"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
const money = (id, v, min = 0, step = 50) => `<span class="lt-money"><i>$</i><input id="${id}" type="number" inputmode="decimal" min="${min}" step="${step}" value="${v}"></span>`;

export const MARKUP = `
<div class="ws-sec" data-section="planning">
  <h3 class="section-title">Planning tools</h3>
  <section class="grid">
    ${panelHTML({ id: 'pDca', span: 7, title: 'DCA Simulator',
      sub: 'Investing a fixed amount every month · real prices, dividends reinvested',
      note: 'What investing the same amount each month into a fund would have grown to, using its actual price history.',
      info: 'Dollar-cost averaging (DCA) means investing a fixed amount on a regular schedule, whatever the price. Here each purchase happens on the first trading day on or after the same day each month, at that day’s closing price. Prices are adjusted for dividends, which assumes every dividend was reinvested. Fees beyond the fund’s own expense ratio, taxes and trading costs are not included.\n\nThe chart compares the account’s value (amber) with the total paid in (grey). Where the amber line is below the grey one, the account was worth less than had been put in.\n\nMoney-weighted return is the yearly rate that turns your actual deposits, on their actual dates, into the ending value; it is the right measure when money goes in over time. The fund’s own annualized return over the same dates is shown beside it for comparison.',
      body: `<div class="lt-form" id="ltDcaForm">
        ${field('ltDcaSym', 'Fund or ticker', '<input id="ltDcaSym" class="lt-in lt-sym" list="ltDcaList" autocomplete="off" spellcheck="false" maxlength="20"><datalist id="ltDcaList"></datalist>')}
        ${field('ltDcaAmt', 'Each month', money('ltDcaAmt', 500, 0, 50))}
        ${field('ltDcaLump', 'Starting lump sum', money('ltDcaLump', 0, 0, 500), 'optional')}
        ${field('ltDcaStart', 'Start', '<input id="ltDcaStart" class="lt-in" type="month">')}
      </div>
      <div class="lt-form-row"><div class="lt-quick" id="ltDcaQuick" role="group" aria-label="Quick picks">${QUICK.map(s => `<button type="button" class="lt-chip sm" data-s="${s}">${s}</button>`).join('')}</div>
        ${segHTML({ id: 'ltDcaPreset', small: true, value: '10y', label: 'Start presets', options: PRESETS })}</div>
      <div id="ltDcaOut" aria-live="polite"></div>`, minH: 520,
      source: { source: 'Yahoo Finance', label: 'dividend-adjusted daily closes' } })}

    ${panelHTML({ id: 'pProj', span: 5, title: 'Compounding Projector',
      sub: 'An illustration from historical ranges · not a forecast · today’s dollars',
      note: 'How steady monthly saving could add up, using the range of returns the US stock market has delivered in the past.',
      info: 'This applies three constant yearly returns to your savings: the 10th percentile, the median and the 90th percentile of every rolling period of the same length in the S&P 500’s inflation-adjusted total return since 1871 (Shiller data, dividends reinvested, through mid-2023).\n\nThe period length matches your time horizon, up to 20 years — the longest window in the data. For horizons beyond 20 years the 20-year spread is used as is; over longer spans past outcomes were somewhat less spread out, so treat the band as wide rather than precise.\n\nBecause returns are after inflation, results are in today’s dollars: what the balance would buy now. Real life adds things this ignores: fees, taxes, years of no saving, and the fact that returns arrive unevenly, not at a steady rate. Past ranges do not set limits on the future.',
      body: `<div class="lt-form" id="ltProjForm">
        ${field('ltPAge', 'Age now', '<input id="ltPAge" class="lt-in" type="number" min="14" max="90" step="1">')}
        ${field('ltPTarget', 'Until age', '<input id="ltPTarget" class="lt-in" type="number" min="15" max="100" step="1">')}
        ${field('ltPStart', 'Starting amount', money('ltPStart', 1000, 0, 500))}
        ${field('ltPMonthly', 'Each month', money('ltPMonthly', 500, 0, 50))}
      </div>
      <div id="ltProjOut" aria-live="polite"></div>`, minH: 520,
      source: { source: 'Shiller data', label: 'real total return' } })}
  </section>
</div>`;

// ---------------------------------------------------------------------------
// DCA
// ---------------------------------------------------------------------------
function presetDate(p, h) {
  const last = h.dates[h.dates.length - 1];
  const back = y => { const d = new Date(last + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - y); return d.toISOString().slice(0, 10); };
  return { '5y': back(5), '10y': back(10), start: h.dates[0], 2007: '2007-10-09', 2022: '2022-01-03' }[p] || back(10);
}
function startFor(h) {
  return st.dca.preset ? presetDate(st.dca.preset, h) : (st.dca.start || presetDate('10y', h));
}
function syncForm() {
  const d = st.dca;
  document.getElementById('ltDcaSym').value = d.s;
  document.getElementById('ltDcaAmt').value = d.monthly;
  document.getElementById('ltDcaLump').value = d.lump;
  for (const b of document.querySelectorAll('#ltDcaPreset button')) { const on = b.dataset.v === d.preset; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  for (const b of document.querySelectorAll('#ltDcaQuick button')) b.classList.toggle('on', b.dataset.s === d.s);
}

async function runDca() {
  const out = document.getElementById('ltDcaOut');
  const pnl = document.getElementById('pDca');
  const id = ++st.runId;
  const sym = st.dca.s;
  if (!st.hist || st.hist.s !== sym) { out.classList.add('is-loading'); if (!st.chart) out.innerHTML = `<div class="lt-dca-load">${skeletonHTML({ rows: 3, chart: true })}</div>`; }
  let h;
  try { h = await getHistory(sym); } catch (e) {
    if (id !== st.runId) return;
    out.classList.remove('is-loading');
    st.hist = null; st.chart?.destroy(); st.chart = null;
    out.innerHTML = errorStateHTML({ title: e.status === 404 ? `No price history for ${esc(sym)}` : 'Could not load prices', message: e.status === 404 ? 'Check the ticker, or pick one of the funds above.' : esc(e.message) });
    if (e.status === 404) savePref(DCA_KEY, { ...st.dca, s: 'VOO' });
    setSourceBadge(pnl, { error: e.status !== 404 });
    return;
  }
  if (id !== st.runId) return;
  out.classList.remove('is-loading');
  st.hist = h;
  const reqStart = startFor(h);
  const clamped = reqStart < h.dates[0];
  const start = clamped ? h.dates[0] : reqStart;
  document.getElementById('ltDcaStart').min = h.dates[0].slice(0, 7);
  document.getElementById('ltDcaStart').max = h.dates.at(-1).slice(0, 7);
  document.getElementById('ltDcaStart').value = start.slice(0, 7);
  const r = simulateDCA(h, { start, monthly: st.dca.monthly, lump: st.dca.lump });
  setSourceBadge(pnl, { asOf: Date.parse(h.meta?.asOf) || Date.now() });
  if (r.error) { st.chart?.destroy(); st.chart = null; out.innerHTML = errorStateHTML({ title: 'Nothing to simulate', message: esc(r.error) }); return; }
  const name = h.name || sym;
  const w = r.worst;
  const tiles = [
    ['Paid in', usd(r.invested), `${r.buys} purchases over ${spanWords(r.years * 365.25)}`],
    ['Ending value', usd(r.value), `on ${fmtDate(r.endDate)}`],
    ['Gain', `<span class="${tone(r.gain)}">${r.gain < 0 ? '−' : '+'}${usd(Math.abs(r.gain))}</span>`, `<span class="${tone(r.gainPct)}">${pct(r.gainPct, 1)}</span> on money paid in`],
    ['Return per year', `<span class="${tone(r.irrPct)}">${pct(r.irrPct, 2)}</span>`, r.fundCagrPct != null ? `money-weighted · the fund itself ${pct(r.fundCagrPct, 2)}/yr` : 'money-weighted'],
  ];
  const deep = w
    ? `<b>Deepest point below paid in:</b> <span class="down">${pct(w.pct, 1)}</span> (${usd(Math.abs(w.gap))} under ${usd(w.paid)} paid in) on ${fmtDate(w.date)}. ${w.to ? `That stretch below paid in lasted ${spanWords(w.days)}, ${fmtMonth(w.from)} to ${fmtMonth(w.to)}.` : `The account has been below paid in since ${fmtDate(w.from)}.`}`
    : '<b>Deepest point below paid in:</b> none — the account was never worth less than the money put in.';
  const chartWrap = '<div id="ltDcaChart"></div>';
  if (!document.getElementById('ltDcaChart')) { out.innerHTML = `<div class="lt-dca-h"></div><div class="lt-dca-stats"></div><p class="lt-dca-deep"></p>${chartWrap}<p class="lt-fine lt-dca-fine"></p>`; st.chart = null; }
  out.querySelector('.lt-dca-h').innerHTML = `<b>${esc(sym)}</b> <span>${esc(name)}</span> <span class="lt-muted">· from ${fmtDate(r.startDate)}${clamped ? ` (its price history starts here; requested ${fmtDate(reqStart)})` : ''}</span>`;
  out.querySelector('.lt-dca-stats').innerHTML = tiles.map(([k, v, s]) => `<div class="lt-kv"><div class="lt-kv-k">${k}</div><div class="lt-kv-v">${v}</div><div class="lt-kv-s">${s}</div></div>`).join('');
  out.querySelector('.lt-dca-deep').innerHTML = deep;
  out.querySelector('.lt-dca-fine').innerHTML = `Purchases on the first trading day on or after the ${ordinalDay(r.startDate)} of each month${st.dca.lump ? `, plus ${usd(st.dca.lump)} on the first day` : ''}. Yahoo history can start after a fund’s launch. No taxes, commissions or cash drag.`;
  const step = r.series.dates.length > 3000 ? 2 : 1;
  const thin = (arr) => arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
  const ds = thin(r.series.dates), vs = thin(r.series.value), cs = thin(r.series.contrib);
  const opts = {
    series: [
      { id: 'v', label: 'Account value', data: ds.map((d, i) => ({ t: d, v: vs[i] })), color: '#ffb000', area: true, width: 1.6, fmt: v => usd(v) },
      { id: 'c', label: 'Paid in', data: ds.map((d, i) => ({ t: d, v: cs[i] })), color: '#a4b0bd', width: 1.2, dash: '4 3', fmt: v => usd(v) },
    ],
    height: 250, yFmt: v => usd(v, { compact: true }), yDomain: [0, Math.max(...vs, ...cs) * 1.06], legend: true, ariaLabel: `DCA into ${sym}: value against total paid in`,
  };
  if (!st.chart) st.chart = tsChart(document.getElementById('ltDcaChart'), opts); else st.chart.update(opts);
  writeHash();
}
const ordinalDay = d => { const n = +d.slice(8, 10); return n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };

function writeHash() {
  if (!location.hash.startsWith('#/longterm')) return;
  const p = new URLSearchParams({ s: st.dca.s });
  if (st.dca.monthly !== 500) p.set('m', st.dca.monthly);
  if (st.dca.lump) p.set('l', st.dca.lump);
  if (st.dca.preset && st.dca.preset !== '10y') p.set('p', st.dca.preset);
  if (!st.dca.preset && st.dca.start) p.set('from', st.dca.start);
  const h = '#/longterm/planning?' + p.toString();
  if (location.hash.startsWith('#/longterm/planning') && location.hash !== h) history.replaceState(history.state, '', h);
}

function setDca(patch, run = true) {
  Object.assign(st.dca, patch);
  savePref(DCA_KEY, st.dca);
  syncForm();
  if (run) runDca();
}

// ---------------------------------------------------------------------------
// Projector
// ---------------------------------------------------------------------------
function renderProj() {
  const out = document.getElementById('ltProjOut');
  const tim = st.lt?.timeInMarket?.realTotalReturn;
  if (!tim?.meta?.ok) { out.innerHTML = errorStateHTML({ title: 'Historical ranges unavailable', message: esc(tim?.meta?.error || 'Shiller data did not load.') }); return; }
  const p = st.proj;
  const years = Math.round(p.target - p.age);
  if (!(years >= 1) || years > 80) { out.innerHTML = `<p class="lt-warn">Set a target age between 1 and 80 years after your current age.</p>`; return; }
  const wins = [...tim.windows].sort((a, b) => a.years - b.years);
  const win = [...wins].reverse().find(w => w.years <= years) || wins[0];
  const rates = { p10: win.p10Pct, median: win.medianPct, p90: win.p90Pct };
  const r = project({ age: p.age, target: p.target, start: p.start, monthly: p.monthly, rates });
  const endPaid = r.contrib.at(-1), endMed = r.p50.at(-1);
  const growth = Math.max(0, endMed - endPaid);
  const paidShare = endMed > 0 ? Math.min(100, endPaid / endMed * 100) : 100;
  const why = years > 20 ? `Your horizon is ${years} years; the data’s longest window is 20 years, so its spread is used.` : years === win.years ? `Your horizon is ${years} years, matching the ${win.years}-year window.` : `Your horizon is ${years} years; the nearest shorter window in the data is ${win.years} years.`;
  const card = (k, v, rate, cls) => `<div class="lt-pj ${cls}"><div class="lt-kv-k">${k}</div><div class="lt-pj-v">${usd(v)}</div><div class="lt-kv-s">${pct(rate, 1)}/yr after inflation</div></div>`;
  if (!document.getElementById('ltFan')) { out.innerHTML = '<div class="lt-pj-top"></div><div id="ltFan"></div><p class="lt-fine lt-pj-fine"></p>'; st.fan = null; }
  out.querySelector('.lt-pj-top').innerHTML = `<div class="lt-pj-row">
      ${card('Low end · 10th pct', r.p10.at(-1), rates.p10, 'lo')}
      ${card('Middle · median', endMed, rates.median, 'mid')}
      ${card('High end · 90th pct', r.p90.at(-1), rates.p90, 'hi')}
    </div>
    <div class="lt-split" aria-label="Median outcome split into money paid in and growth">
      <div class="lt-split-bar"><i class="paid" style="width:${paidShare}%"></i><i class="grow" style="width:${100 - paidShare}%"></i></div>
      <div class="lt-split-l"><span><i class="paid"></i>Paid in <b>${usd(endPaid)}</b></span><span><i class="grow"></i>Growth (median path) <b>${usd(growth)}</b></span><span class="lt-muted">at age ${p.target}</span></div>
    </div>`;
  out.querySelector('.lt-pj-fine').innerHTML = `${why} Rates are the 10th percentile, median and 90th percentile annualized real total return of all ${win.windows.toLocaleString('en-US')} rolling ${win.years}-year periods, ${fmtMonth(tim.from)}–${fmtMonth(tim.to)}; the worst such period returned ${pct(win.worstPct, 1)}/yr. Each line holds one rate constant for every year — real returns are never this smooth.`;
  if (!st.fan) st.fan = fanChart(document.getElementById('ltFan'), { ...r, height: 210 }); else st.fan.update({ ...r, height: 210 });
}

function readProj() {
  const n = id => { const v = parseFloat(document.getElementById(id).value); return isFinite(v) ? v : null; };
  const age = n('ltPAge'), target = n('ltPTarget'), start = n('ltPStart'), monthly = n('ltPMonthly');
  st.proj = { age: clamp(age ?? 23, 14, 90), target: clamp(target ?? 65, 15, 100), start: Math.max(0, start ?? 0), monthly: Math.max(0, monthly ?? 0) };
  savePref(PROJ_KEY, st.proj);
  renderProj();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export function wire(root) {
  const symIn = root.querySelector('#ltDcaSym');
  const list = root.querySelector('#ltDcaList');
  const fillList = items => { list.innerHTML = items.map(x => `<option value="${esc(x.s)}">${esc(x.n || '')}</option>`).join(''); };
  st.fillCore = () => getEtfs().then(e => { st.core = e.funds.map(f => ({ s: f.s, n: f.label })); fillList(st.core); }).catch(() => {});
  const doSearch = debounce(async q => {
    try { const r = await search(q); if (symIn.value.trim().toUpperCase() === q) fillList([...(st.core || []).filter(x => x.s.startsWith(q)), ...(r || []).filter(x => /ETF|EQUITY|MUTUALFUND|INDEX/.test(x.type))].slice(0, 12)); } catch { /* keep list */ }
  }, 200);
  symIn.addEventListener('input', () => { const q = symIn.value.trim().toUpperCase(); if (q.length >= 1) doSearch(q); });
  const commit = () => { const v = symIn.value.trim().toUpperCase(); if (v && /^[\w^.=-]{1,20}$/.test(v) && v !== st.dca.s) setDca({ s: v }); };
  symIn.addEventListener('change', commit);
  symIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  root.querySelector('#ltDcaQuick').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) setDca({ s: b.dataset.s }); });
  const amt = debounce(() => {
    const m = Math.max(0, parseFloat(root.querySelector('#ltDcaAmt').value) || 0);
    const l = Math.max(0, parseFloat(root.querySelector('#ltDcaLump').value) || 0);
    setDca({ monthly: m, lump: l }, true);
  }, 350);
  root.querySelector('#ltDcaAmt').addEventListener('input', amt);
  root.querySelector('#ltDcaLump').addEventListener('input', amt);
  root.querySelector('#ltDcaStart').addEventListener('change', e => { if (e.target.value) setDca({ preset: null, start: e.target.value + '-01' }); });
  seg(root.querySelector('#ltDcaPreset'), v => setDca({ preset: v, start: null }));
  const pj = debounce(readProj, 250);
  for (const id of ['ltPAge', 'ltPTarget', 'ltPStart', 'ltPMonthly']) root.querySelector('#' + id).addEventListener('input', pj);
  const p = st.proj;
  root.querySelector('#ltPAge').value = p.age; root.querySelector('#ltPTarget').value = p.target;
  root.querySelector('#ltPStart').value = p.start; root.querySelector('#ltPMonthly').value = p.monthly;
  syncForm();
}

let started = false;
export function load() {
  if (started) return;
  started = true;
  st.fillCore?.();
  runDca();
  getLongterm().then(lt => { st.lt = lt; renderProj(); setSourceBadge(document.getElementById('pProj'), { asOf: Date.parse(lt.timeInMarket?.realTotalReturn?.meta?.fetchedAt) || Date.now() }); })
    .catch(e => { document.getElementById('ltProjOut').innerHTML = errorStateHTML({ title: 'Could not load historical ranges', message: esc(e.message) }); started = false; });
}

/** Deep link: #/longterm/planning?s=VOO&m=250&l=1000&p=start|from=2015-01-01 */
export function applyParams(params) {
  const s = params.get('s');
  if (!s) return false;
  const patch = { s: s.toUpperCase() };
  if (params.has('m')) patch.monthly = Math.max(0, +params.get('m') || 0);
  if (params.has('l')) patch.lump = Math.max(0, +params.get('l') || 0);
  if (params.has('from') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('from'))) { patch.preset = null; patch.start = params.get('from'); }
  else if (params.has('p') && PRESETS.some(([v]) => v === params.get('p'))) { patch.preset = params.get('p'); patch.start = null; }
  const same = Object.entries(patch).every(([k, v]) => st.dca[k] === v);
  if (same && started) return true;
  setDca(patch, started);
  return true;
}
export function redraw() { st.chart?.redraw(); }
export { share };
