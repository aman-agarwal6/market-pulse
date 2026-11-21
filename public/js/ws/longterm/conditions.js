// Long-Term › Conditions: "where we stand" header, the conditions scorecard,
// today's S&P 500 valuation, valuation history (CAPE / trailing P/E) and the
// sector valuation table.
import { panelHTML, segHTML, seg, statGridHTML, dataTable, tsChart, setPanelState, setSourceBadge, errorStateHTML, emptyStateHTML } from '../../ui.js';
import { getLongterm, getValuation, refreshValuation, getMacro, getHistory, trendHistory, erpHistory, macroSeries } from './data.js';
import { esc, fmtDate, fmtMonth, pct, share, num, pts, ordinal, depthBand, DEPTH_BANDS, percentileOf, summarize, year } from './fmt.js';

const st = { lt: null, val: null, macro: null, gspc: null, S: null, vh: 'cape', vhChart: null, sectors: null };

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------
export const MARKUP = `
<div class="ws-sec" data-section="conditions">
  <h3 class="section-title">Where the market stands</h3>
  <section class="grid">
    ${panelHTML({ id: 'pStand', span: 12, title: 'S&amp;P 500 Today', cls: 'lt-stand-panel',
      sub: 'Level · distance from the record close · headline valuation',
      note: 'How far the S&amp;P 500 is below its highest close, and how richly it is priced compared with history.',
      info: 'A "record close" is the highest level the S&P 500 has ever closed at. The distance below it is called a drawdown.\n\nCommon labels for that distance: within 5% of the record; a pullback (5–10% below); a correction (10–20% below); a bear market (20% or more below). They describe the size of a fall, not what comes next.\n\nCAPE (the Shiller P/E) is the index price divided by the average of the last 10 years of inflation-adjusted earnings. The P/E ratio is price divided by one year of earnings. Both answer "how many dollars do investors pay per dollar of profit?" — higher means pricier compared with history.',
      bodyId: 'ltStand', minH: 118, source: { source: 'Yahoo Finance · Shiller · multpl', label: 'live level' } })}

    ${panelHTML({ id: 'pScorecard', span: 7, title: 'Conditions Scorecard', cls: 'lt-score-panel',
      sub: 'Ten measures, each placed within its own history · no composite score',
      note: 'Each row shows today’s reading and where it falls within that measure’s own past.',
      info: 'Each bar runs from the lowest reading on record (left) to the highest (right), ordered by percentile. The marker shows where today falls: a marker at the 90th percentile means today is higher than 90% of past readings. The thin ticks mark the 25th and 75th percentiles; the labels under the bar give the lowest, median and highest values.\n\nThe measures cover different things — valuation, momentum, mood, credit, rates and prices — and they often disagree. They are shown side by side, not added up: there is no single score and no signal here.\n\nHistories differ in length (from about a year for Fear & Greed to 145 years for CAPE), so each row says how far back its comparison goes.',
      bodyId: 'ltScore', minH: 560, source: { source: 'Shiller · multpl · FRED · Yahoo Finance' } })}

    <div class="span-5 col-stack">
    ${panelHTML({ id: 'pValToday', title: 'Today’s S&amp;P 500 Valuation',
      sub: 'Today’s 500 companies on Yahoo data, live · cap-weighted',
      note: 'What investors are paying for the current index, computed company by company.',
      info: 'Every ratio here adds up all 500 companies: total market value divided by total earnings (or dividends, or book value). Bigger companies count for more, as they do in the index.\n\nP/E here uses each company’s last 12 months of earnings as Yahoo reports them (GAAP EPS), refreshed with every quote. The "P/E · S&P reported earnings" in the header and history comes instead from S&P’s own as-reported index earnings, which are published with a lag and cover a slightly earlier period, so the two are close but not equal. Forward P/E uses analysts’ consensus estimates for the next fiscal year (or the next 12 months), which are usually higher, so forward P/E is usually lower.\n\nEarnings yield is the P/E turned upside down (earnings ÷ price). The forward-basis risk premium compares the forward earnings yield with the 10-year Treasury yield: how much more stocks are expected to earn per dollar than a safe government bond pays. The header and scorecard show a trailing-basis version built from last year’s reported earnings, which reads lower. Both are rough gauges, not forecasts.\n\nConcentration is the share of the index in its 10 largest companies.',
      bodyId: 'ltValToday', minH: 420, source: { source: 'Yahoo Finance quotes · ^TNX' } })}

    ${panelHTML({ id: 'pSectors', cls: 'grow', title: 'Sector Valuation',
      sub: '11 GICS sectors · today’s companies on Yahoo data, same basis as above',
      note: 'How the price of each part of the market compares with its earnings.',
      info: 'Weight is the sector’s share of the S&P 500’s total market value. P/E ratios are cap-weighted within each sector, so the largest companies dominate.\n\nSectors have always had different typical P/Es: fast-growing or very stable businesses usually carry higher ones. Comparing a sector with its own history (not shown here) is more meaningful than comparing sectors with each other.\n\nAn asterisk marks a forward P/E based on next-fiscal-year estimates because next-12-month estimates cover less than 90% of that sector.',
      bodyId: 'ltSectors', minH: 300, source: { source: 'Yahoo Finance quotes' } })}
    </div>

    ${panelHTML({ id: 'pValHist', span: 12, title: 'Valuation History',
      sub: 'Monthly since 1881 · Shiller dataset extended with multpl.com',
      controls: segHTML({ id: 'ltVhSeg', small: true, value: 'cape', label: 'Valuation measure', options: [['cape', 'CAPE'], ['pe', 'P/E · S&amp;P reported']] }),
      note: 'The price of US stocks relative to their earnings, month by month for well over a century.',
      info: 'CAPE divides the S&P 500 (and, before 1957, its predecessor indexes) by the average of 10 years of inflation-adjusted earnings, which smooths out recessions and booms. P/E on S&P reported earnings uses only the last 12 months of as-reported earnings, so it spikes when profits collapse (in 2009 earnings fell so far that the P/E briefly passed 120).\n\nThe dashed lines show the long-run average and median. The dashed segment at the end runs from the last published month to today’s estimate, which scales the latest published value by the index’s move since then with earnings held constant.\n\nHigh valuations have tended to be followed by lower average returns over the next decade, but the relationship is loose and says little about the next year or two.',
      body: '<div id="ltVhChart"></div><div id="ltVhStats" class="lt-vh-stats"></div>', minH: 360, source: { source: 'Shiller · multpl.com' } })}

  </section>
</div>`;

// ---------------------------------------------------------------------------
// Live S&P 500 numbers (snapshot first, /api/longterm as fallback)
// ---------------------------------------------------------------------------
function liveCurrent() {
  const c = st.lt?.current;
  if (!c) return null;
  const q = st.S?.strip?.find(x => x.s === '^GSPC')?.q;
  const price = q?.p ?? c.price;
  const ath = Math.max(c.allTimeHigh, price);
  return {
    price, chg: q?.c ?? null, ma200: q?.ma200 ?? null,
    ath, athDate: price > c.allTimeHigh ? c.date : c.allTimeHighDate,
    dd: (price / ath - 1) * 100,
    calDays: c.calendarDaysSinceHigh, tradDays: c.tradingDaysSinceHigh,
    low: Math.min(c.episodeLow ?? price, price), lowDate: (c.episodeLow ?? Infinity) <= price ? c.episodeLowDate : c.date,
    lowPct: Math.min(c.episodeLowPct ?? 0, (price / ath - 1) * 100),
  };
}
export const getLive = liveCurrent;
/** The one 10-year yield used everywhere on this page: live ^TNX, else FRED's latest close. */
function tenYear() { return st.val?.index?.tenYearYieldPct ?? macroSeries(st.macro, 'y10')?.latest?.value ?? null; }

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function depthScaleHTML(dd) {
  const MAX = 35; // visual floor of the scale (deeper readings pin to the end)
  const w = b => ((Math.min(-b.to, MAX) - (-b.from)) / MAX) * 100;
  const cur = depthBand(dd);
  const pos = Math.min(MAX, -Math.min(0, dd)) / MAX * 100;
  return `<div class="lt-depth" role="img" aria-label="${esc(pct(dd, 1))} below the record: ${esc(cur.label)}">
    <div class="lt-depth-bar">${DEPTH_BANDS.map(b => `<span class="z-${b.id}${b === cur ? ' on' : ''}" style="width:${w(b)}%"><em>${b.short}</em></span>`).join('')}
      <i class="lt-depth-mk" style="left:${pos}%"></i></div>
    <div class="lt-depth-ax"><span style="left:0">0%</span><span style="left:${5 / MAX * 100}%">−5%</span><span style="left:${10 / MAX * 100}%">−10%</span><span style="left:${20 / MAX * 100}%">−20%</span><span style="left:100%">−${MAX}%+</span></div>
  </div>`;
}

function renderStand() {
  const el = document.getElementById('ltStand');
  const c = liveCurrent();
  if (!c) return;
  const band = depthBand(c.dd);
  const vh = st.lt.valuationHistory;
  const cape = vh?.meta?.ok ? vh.cape?.current : null;
  const pe = vh?.meta?.ok ? vh.trailingPE?.current : null;
  const vi = st.val?.index;
  const atRecord = c.dd > -0.005;
  const lowNote = !atRecord && c.lowPct < c.dd - 0.05 ? ` · lowest close so far ${num(c.low, 2)} (${pct(c.lowPct, 1)}) on ${fmtDate(c.lowDate)}` : '';
  const tile = (k, basis, v, s, est) => `<div class="lt-hv"><div class="lt-hv-k">${k}${est ? ' <span class="lt-est" title="Estimate">est.</span>' : ''}<span class="lt-basis">${basis}</span></div><div class="lt-hv-v">${v}</div><div class="lt-hv-s">${s}</div></div>`;
  const y10 = tenYear();
  const ey = pe?.value ? 100 / pe.value : null;
  el.innerHTML = `<div class="lt-stand">
    <div class="lt-stand-lvl">
      <div class="lt-hv-k">S&amp;P 500</div>
      <div class="lt-stand-px">${num(c.price, 2)}</div>
      <div class="lt-stand-chg ${c.chg > 0 ? 'up' : c.chg < 0 ? 'down' : 'flat'}">${c.chg != null ? pct(c.chg, 2) + ' today' : ''}</div>
    </div>
    <div class="lt-stand-dd">
      <div class="lt-stand-head"><span class="lt-band-tag t-${band.id}">${band.label}</span>
        <span class="lt-stand-ddv">${atRecord ? 'At a record close' : `${pct(c.dd, 1)} <small>below the record close</small>`}</span></div>
      ${depthScaleHTML(c.dd)}
      <div class="lt-stand-meta">Record close ${num(c.ath, 2)} on ${fmtDate(c.athDate)}${atRecord ? '' : ` · ${c.calDays} calendar days (${c.tradDays} trading days) ago${lowNote}`}</div>
    </div>
    <div class="lt-stand-vals">
      ${tile('CAPE', 'Shiller · 10 yrs of real earnings', cape?.value != null ? num(cape.value, 1) : '—', cape?.percentileAll != null ? `${ordinal(cape.percentileAll)} percentile since ${year(vh.cape.stats.all.from)}` : 'not available', cape?.estimated)}
      ${tile('P/E', 'S&amp;P reported earnings', pe?.value != null ? num(pe.value, 1) : '—', pe?.percentileAll != null ? `${ordinal(pe.percentileAll)} percentile since ${year(vh.trailingPE.stats.all.from)}` : 'not available', pe?.estimated)}
      ${tile('Earnings yield', 'S&amp;P reported earnings', ey != null ? share(ey, 2) : '—', ey != null && y10 != null ? `1 ÷ that P/E · vs ${share(y10, 2)} on the 10-year Treasury` : '1 ÷ that P/E')}
      ${tile('Risk premium', 'trailing · S&amp;P reported', ey != null && y10 != null ? pts(ey - y10) : '—', 'that earnings yield − 10-year Treasury yield')}
    </div>
    <p class="lt-stand-basis">Valuation basis for this row: S&amp;P 500 as-reported earnings (Shiller data, extended with multpl.com); today’s values are estimated from the index’s move since the last published figure. Figures built from today’s 500 companies on Yahoo data, including forward P/E, are in “Today’s S&amp;P 500 Valuation” below.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------
function gaugeRows() {
  const lt = st.lt, vh = lt.valuationHistory, c = liveCurrent(), S = st.S, val = st.val?.index;
  const rows = [];
  const push = r => rows.push(r);
  const ofHist = (values, v) => { const sm = summarize(values); return sm ? { ...sm, pct: percentileOf(values, v) } : null; };

  // 1 Drawdown depth (weekly, worst close each week)
  {
    const uw = lt.chart?.underwaterPct || [];
    const h = ofHist(uw, c.dd);
    const share10 = uw.length ? uw.filter(v => v <= -10).length / uw.length * 100 : null;
    push({ id: 'dd', name: 'Drawdown depth', sub: 'below the record close', value: pct(c.dd, 1), h, since: lt.chart?.dates?.[0], fmt: v => pct(v, 0),
      read: `How far the index is below its highest close. Since ${year(lt.chart.dates[0])} it has spent ${share(share10, 0)} of weeks at least 10% below a record (the 1929–54 slump accounts for much of that).` });
  }
  // 2 CAPE
  if (vh?.meta?.ok && vh.cape?.current) {
    const cc = vh.cape.current, h = ofHist(vh.cape.values, cc.value);
    if (h && cc.percentileAll != null) h.pct = cc.percentileAll;
    push({ id: 'cape', name: 'CAPE', sub: 'Shiller P/E · today is an estimate', value: num(cc.value, 1), est: cc.estimated, h, since: vh.cape.stats.all.from, fmt: v => num(v, 0),
      read: `Price against 10 years of inflation-adjusted earnings. Higher means more paid per dollar of past profits; ${ordinal(cc.percentileSince1950)} percentile when measured from 1950 only.` });
  }
  // 3 Trailing P/E
  if (vh?.meta?.ok && vh.trailingPE?.current) {
    const cc = vh.trailingPE.current, h = ofHist(vh.trailingPE.values, cc.value);
    if (h && cc.percentileAll != null) h.pct = cc.percentileAll;
    push({ id: 'pe', name: 'P/E · S&amp;P reported earnings', sub: 'price ÷ last 12 months’ as-reported earnings', value: num(cc.value, 1), est: cc.estimated, h, since: vh.trailingPE.stats.all.from, fmt: v => num(v, 0),
      read: 'Price against one year of reported earnings. Jumps when profits slump (as in 2009), so it is noisier than CAPE.' });
  }
  // 4 Equity risk premium (trailing earnings yield − 10y), history since 1962
  {
    const y10 = macroSeries(st.macro, 'y10');
    const tnx = tenYear();
    const peNow = vh?.trailingPE?.current?.value;
    if (y10?.history && peNow && tnx != null) {
      const hist = erpHistory(vh.trailingPE, y10.history);
      const v = 100 / peNow - tnx;
      push({ id: 'erp', name: 'Risk premium · trailing basis', sub: 'S&amp;P reported earnings yield − 10-yr Treasury', value: pts(v), h: ofHist(hist.values, v), since: hist.dates[0], fmt: v => sgn0(v),
        read: `Extra earnings per dollar that stocks offer over a 10-year Treasury, using last year’s reported earnings (${share(100 / peNow, 2)} vs ${share(tnx, 2)}) so it compares with history.${val?.equityRiskPremiumPct != null ? ` The forward-basis version in the valuation panel (${pts(val.equityRiskPremiumPct)}) uses analysts’ higher next-year estimates, so it reads higher.` : ''}` });
    } else push({ id: 'erp', name: 'Risk premium · trailing basis', sub: 'S&amp;P reported earnings yield − 10-yr Treasury', value: '—', h: null, read: 'Needs the 10-year Treasury history from the macro data, which did not load.' });
  }
  // 5 Trend
  {
    const q = st.S?.strip?.find(x => x.s === '^GSPC')?.q;
    const now = q?.ma200 ? (q.p / q.ma200 - 1) * 100 : null;
    const th = st.gspc ? trendHistory(st.gspc) : null;
    push({ id: 'trend', name: 'Trend', sub: 'S&P 500 vs its 200-day average', value: now != null ? pct(now, 1) : '—', h: th && now != null ? ofHist(th.values, now) : null, since: th?.dates[0], fmt: v => pct(v, 0),
      read: `Distance from the average close of the last 200 trading days${q?.ma200 ? ` (${num(q.ma200, 0)})` : ''}. Below zero means the index is under its longer-run trend.` });
  }
  // 6 Breadth
  {
    const b = S?.breadth;
    push({ id: 'breadth', name: 'Breadth', sub: '% of S&P 500 stocks above their 200-day', value: b?.above200 != null ? share(b.above200, 0) : '—', h: b?.above200 != null ? { pct: b.above200, min: 0, max: 100, median: null, scale: true } : null,
      read: 'Share of member stocks above their own 200-day average. The app keeps no long history of this, so the bar shows the plain 0–100% scale rather than a percentile.' });
  }
  // 7 Sentiment
  {
    const f = S?.fear;
    const hist = S?.breadth?.history?.fearHist || f?.history || [];
    const h = f ? ofHist(hist.map(x => x.v), f.score) : null;
    push({ id: 'fear', name: 'Sentiment', sub: 'this app’s Fear & Greed (0–100)', value: f ? `${f.score} <small>${esc(f.label)}</small>` : '—', h, since: hist[0]?.d, fmt: v => num(v, 0),
      read: 'A 0–100 composite of seven live signals (volatility, momentum, breadth, safe-haven demand…). It describes the current mood; extremes have come before both rebounds and further falls.' });
  }
  // 8 Credit spreads
  {
    const s = macroSeries(st.macro, 'baaSpread'), hy = macroSeries(st.macro, 'hySpread');
    push(s ? { id: 'credit', name: 'Credit spreads', sub: 'Baa corporate bonds − 10-year Treasury', value: pts(s.latest.value).replace('+', ''), h: withPct(ofHist(s.history?.values || [], s.latest.value), s.percentile), since: s.percentileSince, fmt: v => num(v, 1),
      read: `Extra yield lenders demand from mid-grade companies. Wider spreads mean more worry about defaults.${hy ? ` High-yield spread ${num(hy.latest.value, 2)} pts (${ordinal(hy.percentile)} percentile, last 3 years only).` : ''}` }
      : { id: 'credit', name: 'Credit spreads', sub: 'Baa − 10-year Treasury', value: '—', h: null, read: 'Macro data did not load.' });
  }
  // 9 Yield curve
  {
    const s = macroSeries(st.macro, 's10y3m'), s2 = macroSeries(st.macro, 's10y2y');
    push(s ? { id: 'curve', name: 'Yield curve', sub: '10-year − 3-month Treasury', value: pts(s.latest.value), h: withPct(ofHist(s.history?.values || [], s.latest.value), s.percentile), since: s.percentileSince, fmt: v => sgn0(v),
      read: `Below zero ("inverted") has come before most US recessions, with long and variable lags.${s2 ? ` 10-year − 2-year: ${pts(s2.latest.value)}.` : ''}` }
      : { id: 'curve', name: 'Yield curve', sub: '10-year − 3-month', value: '—', h: null, read: 'Macro data did not load.' });
  }
  // 10 Inflation
  {
    const s = macroSeries(st.macro, 'cpi');
    push(s ? { id: 'cpi', name: 'Inflation', sub: `CPI, year over year · ${fmtMonth(s.latest.date)}`, value: share(s.latest.value, 1), h: withPct(ofHist(s.history?.values || [], s.latest.value), s.percentile), since: s.percentileSince, fmt: v => num(v, 0) + '%',
      read: `Consumer prices against a year earlier. The Federal Reserve aims for 2% on its preferred (PCE) measure.${s.latestEstimate ? ` ${fmtMonth(s.latestEstimate.date)} estimate: ${share(s.latestEstimate.value, 1)}.` : ''}` }
      : { id: 'cpi', name: 'Inflation', sub: 'CPI, year over year', value: '—', h: null, read: 'Macro data did not load.' });
  }
  return rows;
}
const sgn0 = v => (v > 0.05 ? '+' : '') + num(v, 1);
const withPct = (h, p) => (h && p != null ? { ...h, pct: p } : h);

function scoreRowHTML(r) {
  const h = r.h;
  let bar = '<div class="lt-sc-na">No history available</div>';
  if (h) {
    const ends = h.scale ? '<span>0%</span><span>50%</span><span>100%</span>' : `<span>${r.fmt(h.min)}</span><span>median ${r.fmt(h.median)}</span><span>${r.fmt(h.max)}</span>`;
    bar = `<div class="pbar${h.scale ? ' lt-scale' : ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(h.pct)}" aria-label="${esc(r.name)}: ${h.scale ? 'share' : 'percentile'} ${Math.round(h.pct)}"><i style="left:${Math.max(0, Math.min(100, h.pct))}%"></i></div><div class="lt-sc-ends">${ends}</div>`;
  }
  const pctTxt = h && !h.scale ? `<b>${ordinal(h.pct)}</b><span>pct since ${year(r.since)}</span>` : h?.scale ? '<b>—</b><span>scale 0–100%</span>' : '';
  return `<div class="lt-sc-row" data-g="${r.id}">
    <div class="lt-sc-name"><b>${r.name}</b><span>${r.sub}</span></div>
    <div class="lt-sc-val">${r.value}${r.est ? ' <span class="lt-est" title="Estimate">est.</span>' : ''}</div>
    <div class="lt-sc-bar">${bar}</div>
    <div class="lt-sc-pct">${pctTxt}</div>
    <p class="lt-sc-read">${r.read}</p>
  </div>`;
}

function renderScore() {
  const el = document.getElementById('ltScore');
  if (!st.lt || !liveCurrent()) return;
  const rows = gaugeRows();
  const html = `<div class="lt-sc-head"><span>Measure</span><span class="r">Now</span><span>Where today sits in its history</span><span>Percentile</span></div>` + rows.map(scoreRowHTML).join('');
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
}

// ---------------------------------------------------------------------------
// Today's valuation
// ---------------------------------------------------------------------------
function renderValToday() {
  const el = document.getElementById('ltValToday');
  const v = st.val;
  if (!v?.meta?.ok || !v.index) { el.innerHTML = errorStateHTML({ title: 'Valuation is not available', message: esc(v?.meta?.error || 'The live valuation could not be computed.') }); return; }
  const i = v.index;
  const ntmOk = i.forwardPENTMCoverage?.capPct >= 90;
  const tiles = [
    { label: 'P/E · today’s 500 (Yahoo)', value: num(i.trailingPE, 1), sub: `${i.trailingPECoverage.companies} companies · ${i.trailingPECoverage.lossMakers} loss-makers included` },
    { label: 'Forward P/E · estimates', value: num(i.forwardPE, 1), sub: `next fiscal year${i.forwardPENTM != null ? ` · next 12 months ${num(i.forwardPENTM, 1)} (${share(i.forwardPENTMCoverage.capPct, 0)} of cap)` : ''}` },
    { label: 'Earnings yield · today’s 500', value: share(i.earningsYieldPct, 2), sub: `1 ÷ P/E · forward ${share(ntmOk ? i.forwardEarningsYieldNTMPct : i.forwardEarningsYieldPct, 2)}` },
    { label: '10-year Treasury', value: share(i.tenYearYieldPct, 2), sub: 'yield, live (^TNX)' },
    { label: 'Risk premium · forward basis', value: pts(i.equityRiskPremiumPct), sub: ntmOk ? 'next-12-month estimated earnings yield − 10-year' : 'next-fiscal-year estimated earnings yield − 10-year' },
    { label: 'Dividend yield', value: share(i.dividendYieldPct, 2), sub: `trailing 12 months · indicated ${share(i.forwardDividendYieldPct, 2)}` },
  ];
  const t10 = i.top10;
  const maxW = Math.max(...t10.names.map(n => n.weightPct));
  el.innerHTML = statGridHTML(tiles, { min: 150 }) + `
    <div class="lt-top10">
      <div class="lt-sub-h"><span>Top-10 concentration</span><b>${share(t10.capPct, 1)} <small>of the index</small></b></div>
      <div class="lt-top10-l">${t10.names.map(n => `<div class="lt-t10" data-sym="${esc(n.s.replace('.', '-'))}" role="button" tabindex="0" title="${esc(n.n)}${n.classes.length > 1 ? ' (' + esc(n.classes.join(' + ')) + ')' : ''}">
        <b>${esc(n.s)}</b><span class="lt-t10-n">${esc(n.n)}</span><span class="lt-t10-bar"><i style="width:${n.weightPct / maxW * 100}%"></i></span><span class="lt-t10-w">${share(n.weightPct, 1)}</span></div>`).join('')}</div>
      <p class="lt-fine">Full market caps (not float-adjusted), so weights differ slightly from S&amp;P’s published ones. Share classes are merged (e.g. GOOGL + GOOG). Price/book ${num(i.priceToBook, 2)} (${share(i.priceToBookCoverage.capPct, 0)} of cap).</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Valuation history chart
// ---------------------------------------------------------------------------
function renderValHist() {
  const vh = st.lt?.valuationHistory;
  if (!document.getElementById('ltVhChart')) {
    document.querySelector('#pValHist .panel-body').innerHTML = '<div id="ltVhChart"></div><div id="ltVhStats" class="lt-vh-stats"></div>';
    st.vhChart = null;
  }
  const box = document.getElementById('ltVhChart');
  const statsEl = document.getElementById('ltVhStats');
  if (!vh?.meta?.ok) { box.innerHTML = emptyStateHTML({ title: 'Valuation history unavailable', message: esc(vh?.meta?.error || '') }); statsEl.innerHTML = ''; return; }
  const isCape = st.vh === 'cape';
  const s = isCape ? vh.cape : vh.trailingPE;
  const est = new Set(s.estimatedPoints || []);
  const main = s.dates.map((d, i) => ({ t: d, v: est.has(d) ? null : s.values[i] }));
  let lastPub = -1;
  for (let i = s.dates.length - 1; i >= 0; i--) if (!est.has(s.dates[i])) { lastPub = i; break; }
  const estPts = [];
  if (lastPub >= 0) estPts.push({ t: s.dates[lastPub], v: s.values[lastPub] });
  s.dates.forEach((d, i) => { if (est.has(d)) estPts.push({ t: d, v: s.values[i] }); });
  if (s.current?.value != null) estPts.push({ t: s.current.referenceDate > s.dates.at(-1) ? s.current.referenceDate : st.lt.current.date, v: s.current.value });
  const name = isCape ? 'CAPE' : 'P/E · S&P reported earnings';
  const opts = {
    series: [
      { id: 'pub', label: name + ' (published monthly)', data: main, color: '#ffb000', width: 1.3, fmt: v => num(v, 1) },
      { id: 'est', label: est.size ? 'Estimated months and today' : 'Today (estimate)', data: estPts, color: '#ffb000', dash: '3 3', width: 1.6, fmt: v => num(v, 1) },
    ],
    height: 270, yFmt: v => num(v, 0), tipDate: d3.utcFormat('%b %Y'),
    yDomain: isCape ? [0, 48] : [0, 50],
    refs: [
      { v: s.stats.all.mean, label: `mean ${num(s.stats.all.mean, 1)} · median ${num(s.stats.all.median, 1)} (lower line), since ${year(s.stats.all.from)}`, color: 'var(--ink-3)' },
      { v: s.stats.all.median, label: '', color: 'var(--ink-4)' },
    ],
    ariaLabel: name + ' monthly history',
  };
  if (!st.vhChart) st.vhChart = tsChart(box, opts); else st.vhChart.update(opts);
  const c = s.current;
  const maxI = s.values.indexOf(Math.max(...s.values));
  const minI = s.values.indexOf(Math.min(...s.values));
  statsEl.innerHTML = `
    <div><span>Today</span><b>${num(c.value, 1)}</b><em>${c.estimated ? 'estimate' : ''}</em></div>
    <div><span>Percentile</span><b>${ordinal(c.percentileAll)}</b><em>since ${year(s.stats.all.from)}</em></div>
    <div><span>Percentile</span><b>${ordinal(c.percentileSince1950)}</b><em>since 1950</em></div>
    <div><span>Mean since 1950</span><b>${num(s.stats.since1950.mean, 1)}</b><em>median ${num(s.stats.since1950.median, 1)}</em></div>
    <div><span>Highest</span><b>${num(s.values[maxI], 1)}</b><em>${fmtMonth(s.dates[maxI])}${!isCape && s.values[maxI] > 50 ? ' · off scale' : ''}</em></div>
    <div><span>Lowest</span><b>${num(s.values[minI], 1)}</b><em>${fmtMonth(s.dates[minI])}</em></div>`;
  const pnl = document.getElementById('pValHist');
  const note = isCape
    ? `Shiller data to ${fmtMonth(vh.cape.extendedFrom ? prevMonth(vh.cape.extendedFrom) : vh.cape.lastDate)}, multpl.com from ${fmtMonth(vh.cape.extendedFrom)} (overlap check: mean difference ${num(vh.cape.overlapCheck?.meanAbsDiff, 2)}). Today: ${esc(c.method)}.`
    : `Shiller data to ${fmtMonth(prevMonth(vh.trailingPE.extendedFrom))}, multpl.com after.${est.size ? ` ${est.size} recent months use estimated earnings (dashed).` : ''} Today: ${esc(c.method)}.`;
  setFoot(pnl, note);
}
const prevMonth = s => { if (!s) return s; const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); };
function setFoot(pnl, html) {
  let l = pnl.querySelector('.panel-foot-l');
  if (!l) return;
  l.innerHTML = `<span class="lt-fine">${html}</span>`;
}

// ---------------------------------------------------------------------------
// Sector table
// ---------------------------------------------------------------------------
function renderSectors() {
  const el = document.getElementById('ltSectors');
  const v = st.val;
  if (!v?.meta?.ok || !v.sectors?.length) { el.innerHTML = emptyStateHTML({ title: 'Sector valuation unavailable' }); return; }
  const rows = v.sectors.map(s => {
    const ntm = s.forwardPENTMCoverage?.capPct >= 90 && s.forwardPENTM != null;
    return { ...s, fpe: ntm ? s.forwardPENTM : s.forwardPE, fpeFY: !ntm };
  });
  const cols = [
    { key: 'sector', label: 'Sector', fmt: (v, r) => `<span class="lt-sec-n">${esc(v)}</span><small class="lt-muted"> ${r.companies}</small>` },
    { key: 'weightPct', label: 'Weight', type: 'num', fmt: v => `<span class="lt-wbar"><i style="width:${Math.min(100, v / 35 * 100)}%"></i></span>${share(v, 1)}` },
    { key: 'trailingPE', label: 'P/E', type: 'num', title: 'P/E on the last 12 months of earnings (Yahoo, same basis as the panel above)', fmt: v => num(v, 1) },
    { key: 'fpe', label: 'Fwd P/E', type: 'num', title: 'Forward P/E (next 12 months; * = next fiscal year)', fmt: (v, r) => num(v, 1) + (r.fpeFY ? '*' : '') },
    { key: 'dividendYieldPct', label: 'Div yld', type: 'num', title: 'Trailing dividend yield', fmt: v => share(v, 2), hideBelow: 'sm' },
  ];
  if (!st.sectors) st.sectors = dataTable(el, { columns: cols, rows, sort: 'weightPct', dir: -1, label: 'Sector valuation', csv: 'sp500-sector-valuation' });
  else st.sectors.update(rows);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export function wire(root) {
  seg(root.querySelector('#ltVhSeg'), v => { st.vh = v; renderValHist(); });
}

let loading = null;
export function load() {
  if (loading) return loading;
  const stand = document.getElementById('pStand');
  for (const id of ['pStand', 'pScorecard', 'pValToday', 'pValHist', 'pSectors']) {
    const p = document.getElementById(id);
    if (!p.querySelector('.panel-body').dataset.loaded) setPanelState(p, 'loading', { rows: 6 });
  }
  loading = (async () => {
    const [lt, val, macro, gspc] = await Promise.allSettled([getLongterm(), getValuation(), getMacro(), getHistory('^GSPC')]);
    if (lt.status === 'rejected') {
      loading = null;
      for (const id of ['pStand', 'pScorecard', 'pValHist']) {
        const p = document.getElementById(id);
        setPanelState(p, 'error', { message: esc(lt.reason?.message || ''), retry: () => load() });
        setSourceBadge(p, { error: true });
      }
    } else st.lt = lt.value;
    st.val = val.status === 'fulfilled' ? val.value : null;
    st.macro = macro.status === 'fulfilled' ? macro.value : null;
    st.gspc = gspc.status === 'fulfilled' ? gspc.value : null;
    if (st.lt) {
      const ok = st.lt.current?.meta?.ok !== false;
      for (const id of ['pStand', 'pScorecard', 'pValHist']) setPanelState(document.getElementById(id), 'ready');
      if (ok) { renderStand(); renderScore(); } else setPanelState(stand, 'error', { message: esc(st.lt.current?.meta?.error || 'S&P 500 history unavailable') });
      renderValHist();
      for (const id of ['pStand', 'pScorecard', 'pValHist']) { const b = document.getElementById(id).querySelector('.panel-body'); b.dataset.loaded = '1'; }
      setSourceBadge(stand, { asOf: Date.parse(st.lt.generatedAt) });
      setSourceBadge(document.getElementById('pValHist'), { asOf: Date.parse(st.lt.valuationHistory?.meta?.fetchedAt || st.lt.generatedAt) });
      setSourceBadge(document.getElementById('pScorecard'), { asOf: Date.parse(st.lt.generatedAt) });
    }
    for (const id of ['pValToday', 'pSectors']) {
      const p = document.getElementById(id);
      if (val.status === 'rejected') { setPanelState(p, 'error', { message: esc(val.reason?.message || ''), retry: () => { loading = null; load(); } }); setSourceBadge(p, { error: true }); continue; }
      setPanelState(p, 'ready');
      p.querySelector('.panel-body').dataset.loaded = '1';
      setSourceBadge(p, { asOf: Date.parse(st.val.meta.asOf) });
    }
    if (st.val) { renderValToday(); renderSectors(); }
    return st;
  })();
  return loading;
}

/** Fresh live valuation (every few minutes while the workspace is open). */
export async function refreshLive() {
  if (!st.val) return;
  try {
    const v = await refreshValuation();
    if (v !== st.val) { st.val = v; renderValToday(); renderSectors(); renderStand(); setSourceBadge(document.getElementById('pValToday'), { asOf: Date.parse(v.meta.asOf) }); setSourceBadge(document.getElementById('pSectors'), { asOf: Date.parse(v.meta.asOf) }); }
  } catch { /* keep the last good copy */ }
}

/** Live snapshot: header level and the breadth / sentiment / trend rows. */
export function live(S) {
  st.S = S;
  if (!st.lt) return;
  renderStand();
  renderScore();
}
export function redraw() { st.vhChart?.redraw(); }
export const state = st;
