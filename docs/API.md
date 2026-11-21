# Market Pulse data API

JSON endpoints for the Long-Term, Research and Macro workspaces. All data comes from free, no-key sources (Yahoo Finance, FRED, the Shiller dataset, multpl.com, NY Fed, federalreserve.gov, BLS, BEA). Examples below are real responses from 2026-11-20, trimmed.

## Conventions

- **Provenance on every section.** Each section carries `meta: { ok, source, asOf, fetchedAt, stale, error, note? }`.
  - Hide or grey out a section when `ok` is `false`.
  - `stale: true` means a refresh failed and a cached copy is being served.
  - One failing source never fails the whole endpoint; only its own sections go `ok:false`.
- **Missing data is `null`**, never a made-up value. This applies to whole sections, fields and series points.
- **Units.**
  - Fields ending in `Pct` are already ×100 (`3.95` means 3.95%).
  - Ratios such as P/E, debt/equity and beta are plain numbers.
  - Money is in the stated currency, as whole units (not thousands).
- **Times.** Dates are `YYYY-MM-DD`. Unix times are in seconds. Calendar times are US Eastern.
- **Compression.** Responses over 20 KB are gzipped when the browser sends `Accept-Encoding: gzip` (browsers do this automatically).
- **Errors** come back as `{ error }` with one of these statuses:
  - `400` bad parameter
  - `404` unknown symbol
  - `503` Yahoo is rate-limiting; retry later, or keep showing what you have
  - `502` other upstream failure
- **Symbols** must match `^[\w^.=\-]{1,20}$` and are upper-cased (`AAPL`, `BRK-B`, `^GSPC`, `BTC-USD`). URL-encode `^` as `%5E`.
- **Freshness.** Data loads lazily or warms in the background after boot. A first request on a cold install can take a few seconds; after that, responses come from cache. Check `/api/status` for freshness.

## Endpoints

| Endpoint | Params | Cache / refresh | Size (gzipped) |
|---|---|---|---|
| `GET /api/longterm` | none | Inputs: ^GSPC/^SP500TR daily 12 h, Shiller and multpl 24 h. Reload every 6 h (5 min after a failure). Live ^GSPC quote folded in per request (15 s cache). | ~83 KB |
| `GET /api/valuation` | none | Recomputed on each live quote refresh (15–45 s) | small |
| `GET /api/fundamentals` | none | Rebuilt at most every 15 min. Enrichment crawl 24 h per symbol. | ~140 KB |
| `GET /api/company?s=SYM` | `s` | 6 h (memory and disk). Quote block is live when the server already tracks the symbol. | 3–10 KB |
| `GET /api/history?s=SYM&range=&interval=` | `s`, `range`, `interval` | 1 h for `1d`, 6 h otherwise | SPY max daily ≈ 84 KB |
| `GET /api/etfs` | none | Build 30 min; fund info 24 h; daily history 12 h | small |
| `GET /api/macro` | none | Build 10 min. FRED: daily series 6 h, weekly 12 h, monthly/quarterly 24 h. NY Fed, FOMC, calendars 24 h. Futures 10 min. | ~154 KB |
| `GET /api/status` | none | live | small |

### GET /api/longterm

Long-run S&P 500 history, drawdowns, the "what happened next" study, time in the market, and valuation history.

```
{ generatedAt,
  sources: { gspc:{meta}, sp500tr, shiller:{…, note:"Last price 2026-09-01, dividends 2023-06-01, earnings 2023-06-01, CPI 2023-09-01, CAPE 2023-09-01…"}, multplCape, multplPE, live },
  current: { meta, price:6910.39, date:"2026-11-20", allTimeHigh:7818.93, allTimeHighDate:"2026-10-06", drawdownPct:-11.62,
    calendarDaysSinceHigh:45, tradingDaysSinceHigh:33, episodeLow:6910.39, episodeLowDate:"2026-11-20", episodeLowPct:-11.62,
    thresholdsCrossedNow:[5,10], deepestThresholdNow:10, thresholdsCrossedThisEpisode:[5,10] },
  drawdowns: { meta, minDepthPct:10,
    episodes:[{ peakDate:"2007-10-09", peak:1565.15, troughDate:"2009-03-09", trough:676.53, depthPct:-56.78,
      tradingDaysPeakToTrough:355, calendarDaysPeakToTrough, recoveryDate:"2013-03-28", tradingDaysTroughToRecovery,
      calendarDaysTroughToRecovery:1480, calendarDaysPeakToRecovery, ongoing:false, pre1950:false }, …27],
    countsByDecade:[{ decade:"1990s", ge5:17, ge10:4, ge20:0 }, …], countsNote },
  chart: { meta, freq:"weekly…", dates:[5160 weeks from 1927-12-30], close:[…], underwaterPct:[…],
    totalReturn:{ note, dates:[2029 weeks from 1988], close:[…] } },
  whatNext: { meta, horizonsYears:[1,3,5,10],
    thresholds:[{ thresholdPct:20,
      events:[{ date:"2008-07-09", close:1244.69, peakDate:"2007-10-09", fwd:{"1":-29.08,"3":6.01,"5":32.75,"10":123.68} }, …],
      summary:{ all:{…}, since1950:{ "10":{ count:9, median:98.83, mean:123.72, min:9.85, max:325.02, pctPositive:100 }, … } } }, …5 thresholds: 5/10/15/20/30],
    current:{ drawdownPct, thresholdsCrossedNow, thresholdsCrossedThisEpisode } },
  timeInMarket: {
    price:{ meta, label, from:"1950-01-31", to,
      windows:[{ years:10, windows:803, pctPositive:92.4, worstPct:-5.08, worstStart:"1999-02-26", p10Pct:0.73, medianPct:8.18, p90Pct:12.67, bestPct:16.75, bestStart }, …1/3/5/10/15/20] },
    totalReturn:{ /* ^SP500TR, nominal, dividends reinvested, since 1988; same shape */ },
    realTotalReturn:{ /* Shiller, inflation-adjusted, dividends reinvested; from:"1871-01-01", to:"2023-06-01" */ } },
  valuationHistory: { meta,
    cape:{ dates:[1751 months from 1881], values, extendedFrom:"2023-07-01", estimatedPoints:[],
      overlapCheck:{ months:60, maxAbsDiff:1.01, meanAbsDiff:0.024 }, firstDate, lastDate,
      stats:{ all:{ from:"1881-01-01", mean:17.82, median:16.61 }, since1950:{ mean:20.87, median:20.2 } },
      current:{ value:36.44, estimated:true, method:"multpl value for 2026-11-20 (36.44) x S&P 500 change since then (0%); earnings held constant",
        referenceDate, referenceValue, percentileAll:96.4, percentileSince1950:93.2 } },
    trailingPE:{ /* same shape; current 23.55, percentileAll 89.5 */ } },
  valuationToday: { /* identical to /api/valuation */ } }
```

How to read it:

- **Episode.** Runs from an all-time closing high to the next close at or above that high. Depth uses daily closes, price only.
  - A decline while the index is still below an older high belongs to the bigger episode, not a new one. So 2011's ~19% fall is inside 2007–13, and 1932–54 is inside the 1929 episode.
  - Episodes peaking before 1950 are included and flagged `pre1950: true`. Filter on `peakDate` for "since 1950".
  - The last episode may be `ongoing: true`, with `recoveryDate: null`.
- **Pre-1957 values.** `^GSPC` before 1957 is the S&P 90 composite (Yahoo's series).
- **What happened next.**
  - An event is the first close at least X% below the prior high within each episode; each episode counts once per threshold.
  - `fwd[N]` is the **price return** (no dividends) to the first close on or after the same date N years later.
  - Horizons that haven't elapsed are `null` and excluded from `summary`.
- **Time in market.**
  - Rolling windows start every month and returns are annualized.
  - `price` uses month-end closes.
  - `realTotalReturn` uses Shiller's monthly *average* prices and **ends 2023-06**, where Shiller's dividend data stops.
- **Chart.** `chart.underwaterPct` is the worst daily drawdown within each week; `close` is the week's last close.
- **Valuation history.**
  - CAPE comes from the Shiller dataset up to 2023-09, and from multpl.com after that (same methodology). multpl also replaces the dataset's last 3 possibly-preliminary months. `overlapCheck` shows how closely the two agree.
  - `estimatedPoints` lists multpl months flagged as using estimated earnings.
  - **`current.value` is always an estimate**: the newest published point scaled by the S&P's move since that date, with earnings held constant.
  - If multpl is unavailable and the newest point is over 6 months old, `current.value` is `null` and `method` says why.

### GET /api/valuation

Valuation of today's S&P 500, built from live quotes for every constituent plus `^TNX`.

```
{ meta,
  index:{ companies:500, marketCap, weightPct:100,
    trailingPE:22.29, trailingPECoverage:{ companies:500, capPct:100, lossMakers:23 }, trailingEarnings,
    forwardPE:16.02, forwardPECoverage:{ companies, capPct, negative }, forwardEarnings,
    forwardPENTM:16.77, forwardPENTMCoverage:{ companies:481, capPct:96.5, negative:1 },
    earningsYieldPct:4.49, forwardEarningsYieldPct:6.24, forwardEarningsYieldNTMPct:5.96, forwardVsTrailingEarningsPct:39.2,
    dividendYieldPct:1.10, dividendYieldCoverage, forwardDividendYieldPct:1.18,
    priceToBook:4.81, priceToBookCoverage:{ companies:463, capPct:93.7 }, excludedCurrencyMismatch:0,
    tenYearYieldPct:4.91, equityRiskPremiumPct:1.05, equityRiskPremiumBasis:"next-12-month forward earnings yield - 10y yield",
    top10:{ capPct:38.2, names:[{ s:"AAPL", classes:["AAPL"], n:"Apple Inc.", weightPct:7.86 }, …10] },
    shareClassesMerged:[["GOOGL","GOOG"],["FOXA","FOX"],["NWSA","NWS"]] },
  sectors:[{ sector:"Information Technology", companies:76, marketCap, weightPct:32.76, trailingPE:24.50, forwardPE:13.63, forwardPENTM:14.82, …same fields }, …11 GICS sectors] }
```

- **Coverage.** Every ratio reports its coverage. Show it next to the ratio.
- **NTM availability.** `forwardPENTM` needs fiscal-year dates from the background crawl, so it covers little of the index for the first ~10 minutes after a fresh install.
- **`forwardVsTrailingEarningsPct` is indicative only**: it mixes GAAP trailing EPS with consensus next-fiscal-year EPS over a 1–2 year horizon. Do not present it as a growth forecast.
- **ERP proxy** is a rough "stocks vs bonds" gauge, not a forecast. `equityRiskPremiumBasis` states which forward yield it used.

### GET /api/fundamentals

One screener row per S&P 500 member (503 rows; both share classes appear as separate rows).

```
{ generatedAt,
  meta:{ quotes:{ok, source, asOf}, history:{…}, enrichment:{ ok, coverage:503, of:503, crawling, crawlProgress, lastError } },
  notes:{ rebuild, pe, peg, perf, pos52Pct, relVolume, risk, enrichment, factors, marketCap },
  count:503,
  rows:[{ s:"MSFT", ys:"MSFT", n:"Microsoft", sec:"Information Technology", ind:"Systems Software",
    price:484.52, chgPct:-2.77, marketCap, companyMarketCap, shareClasses:null, capMethod:"yahoo", currency,
    perf:{ d:-2.77, w:-7.51, m:-7.02, q:-0.57, ytd:0.19, y:2.63 },
    high52, low52, pos52Pct:64.5, vsMa50Pct:-6.83, vsMa200Pct:9.33, relVolume:2.01,
    pe:25.29, fpe:20.02, peg:0.76, pb:7.65, eps:19.16, epsFwd:24.20, epsFwdGrowthPct:26.3,
    earningsYieldPct:3.95, fwdEarningsYieldPct:4.99, divYieldPct:0.74, fwdDivYieldPct:0.79,
    rating:"1.4 - Strong Buy", ratingScore:1.4, nextEarnings:"2027-01-27", nextEarningsEstimated:true,
    r12_1Pct:10.37, r6_1Pct:24.49, vol1yPct:34.09, beta1y:1.019,
    grossMarginPct:67.66, operatingMarginPct:47.1, profitMarginPct:41.17, roePct:34.22, roaPct:14.41,
    revenueGrowthPct:18.8, earningsGrowthPct:32.3, debtToEquity:0.285,
    freeCashflowTTM:59957000000, freeCashflowTTMDate:"2026-09-30", leveredFreeCashflow:2994125056, fcfYieldPct:1.67,
    betaYahoo:1.045, evToEbitda:17.85, priceToSales:10.39, payoutRatioPct:19,
    targetMean:636.12, targetLow:440, targetHigh:870, upsidePct:31.3, analysts:54, enrichedAt,
    factors:{ index:{ value:22, quality:95, growth:72, momentum:75, lowVol:31 }, sector:{ value:23, quality:88, growth:23, momentum:51, lowVol:87 } } }] }
```

- **`pe`** is missing for loss-makers. `earningsYieldPct` is still present for them, as a negative number.
- **`ratingScore`** runs from 1 (strong buy) to 5 (strong sell).
- **Enrichment fields** (`grossMarginPct` through `analysts`) are `null` until the background crawl reaches a symbol. `meta.enrichment.coverage` counts how many rows have them.
- **Growth fields** compare the latest quarter with the same quarter a year earlier.
- **`fcfYieldPct`** is reported trailing-12-month free cash flow (operating cash flow − capex) divided by market cap.
  - It is `null` for Financials, where FCF is not meaningful.
  - `leveredFreeCashflow` is a different Yahoo estimate that is often much lower (MSFT $3.0B vs $60.0B). Do not label it "free cash flow".
- **Gross margin** is `null` for banks; Yahoo reports 0.
- **`marketCap`** is this **ticker's own** cap, the same number the dashboard heatmap uses. Rows sum to the index (about $63T) without double counting. For multi-class companies (GOOGL/GOOG, FOXA/FOX, NWSA/NWS):
  - `marketCap` = that class's shares outstanding × its price (`capMethod: "class-shares"`).
  - If Yahoo's per-class share counts look wrong, the company cap is split across the classes instead (`capMethod: "split"`).
  - `companyMarketCap` is Yahoo's whole-company cap. It is used for company-level ratios such as `fcfYieldPct`.
  - `shareClasses` lists the sibling tickers (`null` for single-class companies).
- **Factor ranks** are defined in [Formulas](#formulas).

### GET /api/company?s=SYM

Works for any Yahoo symbol.

| Symbol type | Sections |
|---|---|
| Stock | `identity, meta, quote, profile, keyStats, valuation, profitability, balanceSheet, financials, analyst, earnings, dividends, ownership, peers` |
| ETF / mutual fund | `identity, meta, quote, fund, holdings, performance` |
| Index or crypto | `identity, meta, quote` only |

Any section Yahoo lacks is `null`.

Stock (AAPL), trimmed:

```
identity:{ symbol:"AAPL", name:"Apple Inc.", type:"EQUITY", exchange:"NasdaqGS", currency:"USD" },
quote:{ price:342.56, changePct:-1.9, marketCap, time, marketState:"POST", averageAnalystRating:"2.2 - Buy", live:true },
profile:{ description, sector, industry, employees, website, hq, officers:[{ name, title }, …≤5] },
keyStats:{ marketCap, enterpriseValue, sharesOutstanding, floatShares, beta:1.089, high52:360.83, low52:243.42, avgVolume3m, shortPctFloat:1, allTimeHigh },
valuation:{ trailingPE:38.15, forwardPE:32.4, pegRatio:2.82, priceToSales:10.4, priceToBook:44.41, evToRevenue:10.68, evToEbitda:29.81, earningsYieldPct:2.62, fcfYieldPct:2.73, fcfYieldNote },
profitability:{ grossMarginPct:48.79, operatingMarginPct:33.01, profitMarginPct:27.6, ebitdaMarginPct:35.81, roePct:142.26, roaPct:25.87, revenueGrowthPct:11.7, earningsGrowthPct:14.1, note },
balanceSheet:{ totalCash, totalDebt, netDebt, debtToEquity:0.843, currentRatio:1.02, quickRatio:0.83, operatingCashflow, freeCashflowTTM, freeCashflowTTMDate, leveredFreeCashflow, totalRevenue, ebitda, currency },
financials:{ annual:{ dates:["2023-09-30",…4], revenue, grossProfit, operatingIncome, netIncome, eps:[6.13,6.08,7.46,8.98], freeCashFlow, operatingCashFlow, capex, sharesDiluted },
  quarterly:{ /* same, ~5 quarters */ }, currency, note },
analyst:{ recommendationMean:2.18, recommendationKey:"buy", averageAnalystRating, analysts:39, targetLow:250, targetMean:345.63, targetMedian:355, targetHigh:425, upsidePct:0.9,
  trend:[{ period:"0m", strongBuy:6, buy:20, hold:13, sell:3, strongSell:3 }, …-1m/-2m/-3m] },
earnings:{ history:[{ quarter:"2026-09-30", period:"-1q", epsEstimate:1.985, epsActual:2.1, surprisePct:5.8 }, …4],
  next:{ date:"2027-01-28", dateEnd, estimated:true, epsAvg:2.911, epsLow, epsHigh, revenueAvg, revenueLow, revenueHigh },
  estimates:[{ period:"0q"|"+1q"|"0y"|"+1y", endDate, epsAvg, epsLow, epsHigh, epsYearAgo, epsGrowthPct, analysts, revenueAvg, revenueGrowthPct }] },
dividends:{ rate:1.08, yieldPct:0.31, trailingRate, trailingYieldPct, payoutRatioPct:11.8, fiveYearAvgYieldPct, exDate:"2026-11-12", payDate:"2026-11-16" },
ownership:{ insidersPct:1.69, institutionsPct:66.48, institutionsFloatPct, institutionsCount:7786 },
peers:{ note, subject:{…},
  list:[{ s:"DELL", sameSubIndustry:true, subIndustry, price, marketCap, pe:16.16, fpe:9.1, pb, priceToSales:1.17, evToEbitda:12.55, divYieldPct,
    grossMarginPct, operatingMarginPct, revenueGrowthPct, roePct, perf1yPct:126.9 }, …≤8] }
```

ETF (VOO), trimmed:

```
fund:{ family:"Vanguard", category:"Large Blend", legalType, expenseRatioPct:0.03, aum:1735726989312, yieldPct:1.07, trailingPE:21.47,
  inceptionDate:"2010-09-07", turnoverPct:2, beta3y:0.97, description },
holdings:{ top:[{ s:"AAPL", n:"Apple Inc", weightPct:7.7 }, …10],
  sectorWeights:[{ sector:"realestate", weightPct:1.8 }, …],
  assetAllocation:{ stockPct:99.89, bondPct, cashPct, otherPct, preferredPct, convertiblePct } },
performance:{ note, asOf, trailingPct:{ ytd, m1, m3, y1, y3, y5, y10 }, annual:[{ year:"2025", returnPct:17.82 }, …] }
```

- **Statements.** `financials` holds about 4 fiscal years and 5 quarters. Banks have no gross-profit or operating-income lines; those arrays contain `null`.
- **Peers** are S&P 500 members in the same GICS sub-industry, nearest by market cap. If there are fewer than 4, the list is topped up from the same sector.
  - `peers` is `null` for symbols outside the S&P 500.
  - `priceToSales`, `evToEbitda` and the margins in peer rows depend on the background crawl.
- **`performance` is Yahoo's own figure** and sometimes inconsistent. Prefer `/api/etfs` stats, which are computed from adjusted prices.
- **`sectorWeights` keys** are Yahoo ids (`realestate`, `consumer_cyclical`, …).
- **Dropped Yahoo fields.** Yahoo's ETF equity ratios and bond duration/maturity are wrong, so they are not provided.

### GET /api/history?s=SYM&range=…&interval=…

Price history for the DCA simulator and the compare tool.

- **`range`:** `1mo 3mo 6mo ytd 1y 2y 5y 10y max`. Default `5y`.
- **`interval`:** `1d 1wk 1mo`. Default `1d`.

```
{ s:"VOO", name:"Vanguard S&P 500 ETF", currency:"USD", type:"ETF", exchangeTimezone:"America/New_York", gmtoffset:-18000, firstTradeDate,
  t:[1283313600, …], c:[104.36, …], adj:[78.827, …], div:[{ t:1285335000, amount:0.558 }, …], range:"max", interval:"1mo", meta }
```

- **`t`** is the bar start in unix seconds. Add `gmtoffset` before taking the date.
- **`c`** is the split-adjusted close. **`adj`** is also adjusted for dividends; use `adj` for total-return / DCA maths.
- **`range=max` returns true daily bars** when `interval=1d` (Yahoo would otherwise silently return monthly ones).
- **Limits.** Yahoo history can start after a fund's real inception. Unknown symbols return 404.
- **Reference DCA.** `simulateDCA` in `src/stats.js` is a tested reference implementation the client can mirror.

### GET /api/etfs

28 core ETFs grouped by role: US total market, large cap, growth, value/dividend, small cap, international (all ex-US / developed), emerging markets, bonds, real assets, crypto, all-in-one.

```
{ generatedAt, meta, groups:["US total market","US large cap",…],
  funds:[{ s:"VTI", role:"US total market", label, quote:{ price:340.02, changePct:-3.52, time },
    name, family, category, expenseRatioPct:0.03, aum:1818139557888, yieldPct:1.06, inceptionDate, trailingPE:20.87,
    stats:{ firstDate:"2001-06-15", lastDate, years:25.4,
      totalReturnAnnualizedPct:{ y1:7.44, y3:16.27, y5:8.58, y10:13.46 }, sinceInceptionAnnualizedPct:9.26,
      volatilityPct:{ y3:13.2, y10:16.01 },
      maxDrawdown10y:{ pct:-35, peak:"2020-02-19", trough:"2020-03-23", window:"last 10 years" },
      maxDrawdownAll:{ pct:-55.45, peak:"2007-10-09", trough:"2009-03-09", window:"since inception (Yahoo history start)" },
      fromHighPct:-11.52, highDate, high, fromHighTotalReturnPct:-11.3 },
    meta:{ info, history } }, …28],
  correlation:{ note,
    y3:{ months:36, from:"2023-11", to:"2026-10", minOverlapMonths:24, symbols:[…], r:[[1,1,…],…], n:[[36,…],…] },
    y10:{ months:120, minOverlapMonths:36, … } } }
```

- **Returns** are annualized total return (dividends reinvested) from dividend-adjusted daily closes, trailing from the latest close. A fund too young for a horizon gets `null`.
- **Volatility** is the standard deviation of monthly total returns × √12.
- **Max drawdown** uses daily adjusted closes. `window` says whether it covers the last 10 years or the fund is younger than that.
- **Distance from high.**
  - `fromHighPct` is price-only from the all-time closing high.
  - `fromHighTotalReturnPct` includes dividends; bond funds differ a lot between the two.
- **Correlations** use complete calendar months only.
  - `r` is `null` when a pair overlaps fewer than `minOverlapMonths`. IBIT has ~33 months, so it has no 10-year correlations.
  - `n` is the number of months actually used for each pair.
- **`trailingPE`** is equity funds only; Yahoo's figures for bond, gold and crypto funds are nonsense.

### GET /api/macro

```
{ generatedAt,
  series:[{ key:"cpi", id:"CPIAUCSL", group:"Inflation", title:"CPI inflation", what, why, unit:"% YoY", freq:"M", transform:"yoy", higherIsHotter:true, meta,
    latest:{ date:"2026-09-01", value:3.717 }, previous:{ date, value:3.353 }, change:0.364,
    yearAgo:{ date:"2025-09-01", value:3.023 }, changeFromYearAgo:0.695, percentile:66.9, percentileSince:"1948-01-01",
    history:{ note, dates:[…], values:[…] },
    latestEstimate:{ date:"2026-10-01", value:3.95, estimated:true, method:"2025-10-01 is missing in the source; year-ago base interpolated…", note },
    latestRaw:{ date:"2026-10-01", index:337.476 },
    extra?:{…} }, …23],
  recessions:{ meta, note, periods:[{ start:"2020-03-01", end:"2020-04-01", ongoing:false }, …35 since 1854] },
  recessionWatch:{ meta, items:[
    { key:"s10y3m", label, meta, latest:0.6, date, inverted:false, currentInversion:null,
      lastInversion:{ start:"2025-06-01", end:"2025-08-01", months:3, deepest:-0.04, ongoing:false }, monthsSinceInversionEnded:15, status:"ok", rule },
    { key:"s10y2y", … },
    { key:"sahm", latest:0, threshold:0.5, triggered:false, status, rule },
    { key:"claims", latest:197750, yearAgo:227000, changePct:-12.9, status, rule },
    { key:"credit", highYield:{ value:3.52, date, percentile:91.8, since:"2023-11-21" }, baa:{ value:1.56, date, percentile:10, since:"1986-01-02" }, status, rule },
    { key:"nfci", latest:-0.478, status, rule },
    { key:"recessionProbability", latest:12.4, forMonth:"2027-10-31", basedOnSpreadMonth:"2026-10-31", spreadUsed:0.981, history:{ dates, values }, status, rule } ] },
  fedPath:{ meta, effectiveRatePct:3.88, targetRange:{ low:3.75, high:4, date },
    months:[{ month:"2026-12", symbol:"ZQZ26.CBT", price:95.955, impliedRatePct:4.045, changeVsEffectiveBp:16.5, moves25bpPriced:0.66, volume, quoteTime }, …13] },
  fomc:{ meta, next:{ start:"2026-12-08", end:"2026-12-09", sep:true }, upcoming:[…8] },
  calendar:{ meta:{ bls, bea, fomc }, note, events:[{ title:"Consumer Price Index", date:"2026-12-10", timeET:"08:30", source:"BLS" }, …next 120 days] } }
```

The 23 series, by group:

| Group | `key` |
|---|---|
| Inflation | `cpi`, `coreCpi`, `pce`, `corePce`, `breakeven10` |
| Jobs | `unemployment`, `payrolls`, `claims`, `sahm` |
| Growth | `gdp`, `indpro`, `sentiment` |
| Rates | `fedFunds`, `y2`, `y10`, `real10`, `s10y2y`, `s10y3m`, `mortgage30` |
| Credit & conditions | `hySpread`, `baaSpread`, `nfci` |
| Money | `m2` |

**Series fields**

- **`transform`** is one of:
  - `level`: the value as published
  - `yoy`: % change vs the same month a year earlier
  - `diff`: change vs the previous observation (payrolls, in thousands of jobs per month)
- **`higherIsHotter`**: `true` means higher = hotter economy / more inflation pressure; `false` means higher = cooler; `null` means neither.
- **`percentile`** is measured against the series' own history since `percentileSince`.
- **History density:**
  - daily series: daily for the last 2 years, weekly before
  - weekly series: weekly for 5 years, monthly before
  - monthly and quarterly: full history
- **`extra` fields:**
  - `payrolls`: `{ avg3m }`
  - `claims`: `{ avg4w, avg4wDate, avg4wYearAgo, avg4wYearAgoDate }`
  - `fedFunds`: `{ targetRange:{ low, high, date } }`

**Caveats**

- **October 2025 was never published** (government shutdown). Year-over-year series whose newest month needs October 2025 as a base keep `latest` at the last properly computed month. They add a separate `latestEstimate` with `estimated:true` and the method. Show the estimate clearly labelled, or not at all.
- **High-yield spread history is only 3 years** (FRED licensing), so its percentile covers that window only. Use `baaSpread` (since 1986) for long-run context.
- **Recession watch.**
  - `status` is one of `ok`, `watch`, `warning` or `unknown`.
  - Each item's `rule` states the exact thresholds, applied mechanically. Present them as data, not a forecast or advice.
- **NY Fed probability.** `recessionProbability.latest` is the NY Fed model's probability (%) for `forMonth`, 12 months after the spread month it uses.
- **Fed path months are averages.** `impliedRatePct` = 100 − futures price = the market's expected **average** effective rate for that calendar month. It is not a per-meeting probability: a meeting late in a month only partly shows up in that month.
  - `moves25bpPriced`: +1 = one 25 bp hike priced vs today's effective rate, −1 = one cut.
  - Stale or invalid contracts have `impliedRatePct: null` and a `reason`.
  - Quotes may be delayed.
- **FOMC.** Lists regularly scheduled meetings only. `sep` marks meetings with a Summary of Economic Projections. Decisions come at 2:00 pm ET on `end`.
- **Calendar.** Covers CPI, PPI, jobs report, JOLTS, ECI, GDP, PCE and FOMC decisions. Each feed's coverage end is in `calendar.meta`; BLS currently publishes only through 2026-12-30.

### GET /api/status

```
{ now, uptimeSec, recentErrors:[…],
  yahooBackgroundGate:{ queued, active, coolingDown, cooldownUntil, throttled429 },
  fundamentalsCrawl:{ running, startedAt, finishedAt, done, total, failures, consecutiveFailures, lastError, nextRun, coverage:503 },
  datasets:[{ name:"dashboard:quotes", source, ok, asOf, fetchedAt, nextRefresh, error, stale }, …] }
```

Dataset names:

- `dashboard:quotes|history|intraday|news|curve`
- `longterm:^GSPC|^SP500TR|shiller|multplCape|multplPE`
- `fred:<SERIES_ID>`
- `macro:nyfed|fomc|calendar-bls|calendar-bea|fedFutures`
- `etfs`
- `fundamentals:crawl`

## Formulas

**Index valuation (`/api/valuation`, `src/valuation.js`)**

- **Share classes.** Yahoo gives each class (GOOGL/GOOG, FOXA/FOX, NWSA/NWS) the whole company's market cap. So each ticker first gets its own cap from one shared helper (`src/shareclass.js`), the same one the dashboard heatmap, sector weights and contributors use:
  - class shares outstanding × price, used when the class caps sum to 50–105% of the company cap;
  - otherwise the company cap split across the classes.

  Classes are then summed into one company. The unlisted Alphabet Class B is therefore not in the index cap.
- **Caps** are Yahoo full market caps, not float-adjusted, so weights differ slightly from S&P's official ones.

| Measure | Formula |
|---|---|
| Company earnings E | companyCap × EPS_ttm / price, which equals EPS × listed shares. Loss-makers keep **negative** E. |
| Trailing P/E | Σ marketCap / Σ E |
| Forward P/E | Σ marketCap / Σ (marketCap × epsForward / price). `epsForward` = next-fiscal-year consensus, usually adjusted EPS. |
| Forward P/E, next 12 months | EPS_ntm = f × epsCurrentYear + (1 − f) × epsForward, where f = (fiscal-year end − now) / 365.25 days, clamped to [0, 1] |
| Earnings yield | 1 / P/E |
| Dividend yield (trailing) | Σ (marketCap × trailing-12-month yield) / Σ marketCap |
| Dividend yield (forward) | Σ (marketCap × indicated yield) / Σ marketCap |
| Price / book | Σ marketCap / Σ (marketCap / P/B). Excludes negative or missing book, and P/B below 0.1 or above 500. |
| Equity risk premium proxy | forward earnings yield − 10-year Treasury yield (`^TNX`). Uses the NTM yield when it covers ≥ 90% of index cap, else next-fiscal-year. |
| Top-10 concentration | cap of the 10 largest companies / total cap |
| Sector weight | sector cap / total cap |

**Long-run series**

| Measure | Formula |
|---|---|
| Drawdown | close / running maximum close − 1 |
| Annualized return (CAGR) | (end / start)^(1 / years) − 1 |
| Real total return (Shiller) | TR_t = TR_{t−1} × (P_t + D_t / 12) / P_{t−1}, deflated by CPI. D is the annualized dividend. |
| CAPE | real price / 10-year average real earnings (Shiller methodology) |

**Factor ranks (`/api/fundamentals`, `src/factors.js`)**

- **Input ranks.** Each input is percentile-ranked 0–100 across the whole index (`factors.index`) or within the GICS sector (`factors.sector`). Ties share the average rank.
- **Factor score.** The mean of the available input ranks, re-ranked 0–100 in the same group. 100 = the most of that trait.
- **Too few inputs.** A stock with fewer than the minimum number of inputs gets `null`.

| Factor | Inputs | Min inputs |
|---|---|---|
| value | ttm earnings yield (EPS / price); forward earnings yield (next-FY EPS / price); FCF yield (reported ttm FCF / cap; not used for Financials) | 2 |
| quality | ROE; operating margin; gross margin; low leverage = −debt/equity (negative-equity companies skipped) | 2 |
| growth | revenue growth (latest quarter y/y); earnings growth (latest quarter y/y); implied next-FY EPS growth = epsForward / EPS_ttm − 1 (only if EPS_ttm > 0) | 2 |
| momentum | 12-1 month return (first close of the 1-year history to the close 21 trading days ago); 6-1 month return (126 to 21 trading days ago) | 1 |
| lowVol | −annualized volatility (stdev of daily returns × √252, 1 year); −beta (OLS slope of daily returns on `^GSPC`, 1 year) | 1 |

**Other screener fields**

| Field | Formula |
|---|---|
| PEG | forward P/E ÷ implied next-FY EPS growth %, only when both are positive |
| 52-week position | (price − 52w low) / (52w high − 52w low) × 100 |
| Relative volume | today's volume / 3-month average daily volume |
| Upside | target mean / price − 1 |
