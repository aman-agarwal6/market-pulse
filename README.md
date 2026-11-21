# Market Pulse

Market Pulse is a market dashboard that runs on your own computer and opens in your web browser. It has seven workspaces:

- **Today**: what the US stock market is doing right now.
- **Long-Term**: how today compares with a century of history, how expensive stocks are, and what investing steadily would have done.
- **Markets**: where money is moving.
- **Research**: individual companies and funds.
- **Macro**: the economy, in plain English.
- **World** and **News**: global markets, crypto, commodities, currencies and headlines.

All data comes from free public sources; no accounts or API keys are needed.

**What it is not.** Market Pulse is for information and learning only. It shows data and historical context. It does not tell you what to buy or sell, it is not investment advice, and its numbers can be delayed or wrong. Check anything important with an official source before acting on it.

## Run it on your computer

### What you need

- **Node.js 24 or newer.** Download the "LTS" installer from <https://nodejs.org> and install it with the default options.
- An internet connection. The app fetches market data while it runs.

### Get the code

- **Easiest:** on the project's GitHub page, click **Code → Download ZIP**, then unzip it somewhere, for example your Documents folder.
- **With Git:** `git clone <repository URL>`

### Start it on Windows

Double-click **`start.bat`** in the project folder.

- The first time, it installs what it needs (about a minute).
- It then starts Market Pulse and opens <http://localhost:3000> in your browser.
- If Node.js is missing or too old, it says so and tells you where to get it.

### Start it from a terminal (Windows, macOS, Linux)

Open a terminal in the project folder and run:

```bash
npm install     # first time only
npm start
```

Then open <http://localhost:3000>.

### Stop it

Close the console window, or press **Ctrl+C** in the terminal.

### Use a different port

If something else already uses port 3000, start Market Pulse on another port.

| Where | Command |
|---|---|
| Windows Command Prompt | `set PORT=3005` then `start.bat` (or `npm start`) |
| Windows PowerShell | `$env:PORT=3005; npm start` |
| macOS / Linux | `PORT=3005 npm start` |

Then open `http://localhost:3005`.

### The first run

- The page fills in within about 10 seconds.
- Some panels show "loading" for the first few minutes while the app gathers them in the background:
  - long-term history and valuation
  - economic data
  - ETF statistics
  - screener fundamentals for all 500 companies (about 10 minutes)
- Everything is saved in the `data/` folder, so later starts are quick.

### Privacy

Market Pulse only accepts connections from this computer (`127.0.0.1`). Nobody else on your network can open it. Your watchlist and settings are stored in your own browser.

Two optional settings exist: `HOST` (the address to listen on) and `SITE_PASSWORD` (asks for a password before showing the page; any username works). You normally need neither.

## A tour

Switch workspaces with the tabs at the top, the number keys **1–7**, or the command bar. On a phone, the main workspaces sit in a bar at the bottom and the rest under **More**.

### 1 · Today: what is the market doing right now?

- **S&P 500 explorer.** A heatmap of all 500 companies, sized by market value or equally. Switch to sortable rankings, filter by sector, or search. Click any stock for its chart, key stats and news.
- **Fear & Greed.** A composite of seven market signals, compared with yesterday, last week, last month and last year.
- **Market Brief.** Plain-English notes built from simple rules: "worst day since…", sector rotation, credit stress, safe-haven demand.

### 2 · Long-Term: is the market cheap or expensive, and what usually happens next?

- **Conditions scorecard.** Today's S&P 500 in one view:
  - valuation now (P/E, forward P/E, CAPE)
  - valuation by sector
  - the current fall from the record high
- **Valuation history.** CAPE (the Shiller P/E) and the trailing P/E back to the 1870s, with today's percentile in that history.
- **Drawdown history.** Every 10%+ fall since 1928: how deep it went, how long the fall took, and how long the recovery took.
- **This decline vs past ones.** The current fall overlaid on past falls.
- **What happened next.** After past falls of 5, 10, 15, 20 and 30%, how the index did 1, 3, 5 and 10 years later.
- **Time in the market.** For holding periods of 1–20 years: how often returns were positive, and the worst, typical and best yearly returns. Shown three ways:
  - price only, since 1950
  - with dividends, since 1988
  - after inflation, with dividends, since 1871
- **DCA simulator.** What investing a fixed amount every month in any fund or stock would have turned into, with dividends reinvested.
- **Compounding projector.** What regular saving could grow to at different rates of return.
- **Core ETFs.** 28 building-block index funds grouped by role:
  - cost, size and yield
  - 1/3/5/10-year returns, volatility and worst fall
  - risk vs return
  - a correlation matrix showing which funds move together

### 3 · Markets: where is money moving?

- **Flows.** Sector performance and rotation, themes and industries, asset-class flows, a risk-on/risk-off scoreboard, and "Who's moving the S&P" (index-point contributors).
- **Breadth & movers.** How many stocks are rising, how many are above their averages, the breadth trend, top gainers, losers and most active stocks, and volatility (VIX).
- **Earnings & watchlist.** S&P 500 earnings in the next week and reactions to recent reports. Your watchlist is saved in your browser.

### 4 · Research: what is this company or fund about?

- **Screener.** Filter the S&P 500 by valuation, growth, profitability, dividends, momentum and more, or start from a preset: large and profitable, dividend payers, fast growers, low volatility, furthest below the 52-week high, low P/E. Each stock carries 0–100 factor scores for value, quality, growth, momentum and low volatility.
- **Company / ETF page.**
  - Stocks: business description, key stats, valuation, margins, multi-year financials, analyst opinion and targets, earnings history, dividends, ownership, and a peer comparison.
  - Funds: costs, holdings, sector weights, asset mix and returns.
- **Compare.** Put several tickers side by side: total-return chart, returns, risk, worst fall and correlation.

### 5 · Macro: how is the economy doing?

- **Overview.** The economy at a glance: each indicator's latest reading, its trend, and where it sits in its own history.
- **Inflation & the Fed.** CPI and PCE inflation against the Fed's 2% goal, the policy rate, real yields, inflation expectations, and the rate path that futures markets expect.
- **Jobs & growth.** Unemployment and the Sahm rule, payroll growth, jobless claims, GDP, industrial production, consumer sentiment.
- **Rates & credit.** Treasury yield curve, yield-curve spreads since the 1970s, mortgage rates, corporate credit spreads, financial conditions.
- **Recession watch.** Classic warning signs with a clear rule for each, plus the New York Fed's recession probability:
  - yield-curve inversion
  - the Sahm rule
  - rising jobless claims
  - credit stress
  - financial conditions
- **Calendar.** Upcoming CPI, jobs, GDP, PCE and other releases, plus Fed meetings.

### 6 · World

A world equity map and indices by region, a crypto heatmap and board, and commodities and currencies.

### 7 · News

Live market headlines.

### Command bar

Press **/** or **Ctrl+K** and type a ticker, a workspace or a short code (a "mnemonic", as on a Bloomberg terminal). A few useful ones:

| Type | Opens |
|---|---|
| `AAPL` (any ticker) | Full company or fund page (Shift+Enter opens a quick chart instead) |
| `GP VOO` | Quick chart for VOO |
| `DES MSFT` | Company page |
| `COMP VOO QQQ` | Compare tickers |
| `DCA VOO` | DCA simulator for VOO |
| `EQS` | Screener |
| `IMAP` | S&P 500 heatmap |
| `DDH` | S&P 500 drawdown history |
| `CAPE` | Market valuation (CAPE, P/E) |
| `ETF` | Core ETFs |
| `ECO` | Economy overview (`ECO CPI` jumps to one indicator) |
| `FED` | Fed path from futures |
| `RECW` | Recession watch |
| `ECAL` | Economic calendar |
| `GC` | Yield curve, rates & credit |
| `FLOW` / `BRDH` / `MOST` | Money flows / breadth & movers / most active |
| `WEI` / `CRYP` / `TOP` | World indices / crypto / news |
| `W`, `ADD TSLA` | Open the watchlist / add a ticker to it |

The command bar also has settings: a colorblind-friendly palette, and plain-English notes under panel titles.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `1`–`7` | Switch workspace |
| `/` or `Ctrl+K` | Open the command bar |
| `↑` `↓`, `Enter`, `Esc` | Move, open, close in the command bar and lists |
| `?` | Show all shortcuts and mnemonics |
| `Esc` | Close a chart or explainer |

## Where the data comes from

No API keys or accounts are needed. Every panel shows its source and when its data is from. If a source fails, only the panels that depend on it are marked unavailable.

| Source | Supplies | How fresh |
|---|---|---|
| Yahoo Finance | Quotes for stocks, ETFs, indices, futures, FX and crypto; price history; company and fund fundamentals; analyst data; fed funds futures; news | Quotes every 15 s while US markets are open (45 s otherwise). Daily history every 20 min. Company pages 6 h. Screener fundamentals re-read daily. Futures 10 min. |
| FRED (St. Louis Fed) | 23 economic series (inflation, jobs, growth, rates, spreads, financial conditions, money supply) and US recession dates | Daily series every 6 h, weekly 12 h, monthly and quarterly 24 h |
| Robert Shiller's data, via the open `datasets/s-and-p-500` list | Monthly S&P 500 price, dividends, earnings, CPI and CAPE back to 1871 | Checked daily; the source updates monthly |
| multpl.com | CAPE and S&P 500 P/E after 2023, current to the day | Daily |
| New York Fed | Yield-curve recession probability, 12 months ahead | Daily |
| U.S. Treasury | Daily Treasury yield curve | Every 3 h |
| Federal Reserve | FOMC meeting dates | Daily |
| BLS and BEA | Official release calendars (CPI, jobs report, GDP, PCE, …) | Daily |
| `datasets/s-and-p-500-companies` | The S&P 500 member list with sectors | Weekly |

**Honest limits**

- **Delays.** Quotes can be delayed (up to 15 minutes on some exchanges) and are occasionally wrong. Yahoo's data is unofficial.
- **Valuation history after 2023.** Shiller's monthly dataset stops in 2023, so CAPE and P/E history after that come from multpl.com. Today's CAPE and P/E are estimates and are labelled as such.
- **Inflation-adjusted returns end in mid-2023**, where Shiller's dividend data stops.
- **Index caps.** Market values are full, not float-adjusted, so index weights differ slightly from S&P's official ones.
- **Early index history.** Before 1957 the "S&P 500" history is its predecessor, the S&P 90.
- **High-yield credit spread.** FRED only shares the last 3 years. A longer-history corporate spread (Baa, since 1986) is shown alongside it.
- **Fed path.** Futures give the market's expected *average* rate for each month, not the odds of a move at a specific meeting.
- **October 2025.** Some US data from October 2025 was never published (government shutdown). Readings that need it are shown as clearly marked estimates.
- **Recession watch.** Its flags apply fixed rules to data. They are not forecasts.

## Troubleshooting

- **"Port 3000 is already in use" / `EADDRINUSE`.** Market Pulse is probably already running in another window; close it. Otherwise start it on another port (see above).
- **The page loads but shows no prices.** Yahoo may be blocking or rate-limiting requests from your connection. Wait a few minutes and reload; the app backs off and retries on its own. A message containing `crumb failed` in the console means Yahoo refused the login step; it usually clears up after a while.
- **A panel says "unavailable".** One source failed or is still loading. The rest of the page keeps working. Reload after a few minutes, and check `http://localhost:3000/api/status` for details.
- **Odd or stale data after an update.** Stop Market Pulse, delete the `data/` folder, and start it again. It rebuilds everything (the first few minutes are slower again).
- **"Node.js was not found" or "needs Node.js 24".** Install the current LTS from <https://nodejs.org>, then open a new terminal or double-click `start.bat` again.

## For developers

### Project layout

- **`server.js`**: plain `node:http` server. It runs the live refresh loops (quotes, history, intraday, news, yield curve), the live stream (Server-Sent Events), the JSON routes, and background warm-up of the research datasets.
- **`src/`**, by role:
  - Data sources:
    - `yahoo.js` (Yahoo client, with a separate gentle queue for background requests)
    - `fred.js`, `shiller.js`, `macro.js` (also NY Fed, FOMC calendar, BLS/BEA calendars, fed funds futures)
    - `universe.js`, `xls.js`
  - Datasets behind the endpoints: `longterm.js`, `valuation.js`, `fundamentals.js`, `company.js`, `etfs.js`, `history.js`
  - Pure calculations, unit-tested: `stats.js` (drawdowns, returns, rolling windows, DCA, correlation, percentiles), `factors.js`, `shareclass.js` (per-ticker caps for multi-class companies)
  - Dashboard: `engine.js` (snapshot analytics), `config.js` (symbol lists, ETF list, economic series)
  - Plumbing: `store.js` (disk and memory cache, dataset status), `net.js` (polite fetching), `normalize.js`
- **`public/`**: the browser app.
  - `js/shell.js`: workspace router and shell.
  - `js/ws/`: one module per workspace, with helper folders `longterm/`, `research/` and `macro/`.
  - Other `js/` files: `commands.js` (command bar), `ui.js` (panel helpers), `util.js` (formatting).
  - `css/`: shared styles and one stylesheet per workspace.
- **`test/`**: `node:test` unit tests with small, hand-checkable fixtures.
- **`docs/API.md`**: the JSON API (endpoints, response shapes, formulas, caveats).
- **`data/`**: cache, created at runtime and not committed.

### Commands

```bash
npm start      # run the app
npm test       # run the unit tests
```

### Adding a workspace

Create `public/js/ws/<id>.js` exporting `{ id, title, key, sections, mount, update, … }`, and register it in `public/js/ws/index.js`. The full conventions are in the comment at the top of `public/js/shell.js`: routes, sections, panels, the command bar and styling.

If the workspace needs new data, add a module in `src/` and a route in the `ROUTES` table in `server.js`, following `docs/API.md`.
