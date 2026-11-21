// Universe of symbols tracked by Market Pulse.
// All symbols are Yahoo Finance tickers.

export const STRIP = [
  { s: '^GSPC', label: 'S&P 500' },
  { s: '^NDX', label: 'Nasdaq 100' },
  { s: '^DJI', label: 'Dow 30' },
  { s: '^RUT', label: 'Russell 2K' },
  { s: '^VIX', label: 'VIX' },
  { s: '^TNX', label: '10Y Yield', kind: 'yield' },
  { s: 'DX-Y.NYB', label: 'US Dollar' },
  { s: 'GC=F', label: 'Gold' },
  { s: 'CL=F', label: 'WTI Oil' },
  { s: 'BTC-USD', label: 'Bitcoin' },
];

// GICS sector -> SPDR sector ETF
export const SECTORS = [
  { name: 'Information Technology', short: 'Tech', etf: 'XLK', type: 'cyclical' },
  { name: 'Communication Services', short: 'Comm', etf: 'XLC', type: 'cyclical' },
  { name: 'Consumer Discretionary', short: 'Discr', etf: 'XLY', type: 'cyclical' },
  { name: 'Financials', short: 'Financials', etf: 'XLF', type: 'cyclical' },
  { name: 'Industrials', short: 'Industrials', etf: 'XLI', type: 'cyclical' },
  { name: 'Materials', short: 'Materials', etf: 'XLB', type: 'cyclical' },
  { name: 'Energy', short: 'Energy', etf: 'XLE', type: 'cyclical' },
  { name: 'Health Care', short: 'Health', etf: 'XLV', type: 'defensive' },
  { name: 'Consumer Staples', short: 'Staples', etf: 'XLP', type: 'defensive' },
  { name: 'Utilities', short: 'Utilities', etf: 'XLU', type: 'defensive' },
  { name: 'Real Estate', short: 'Real Est.', etf: 'XLRE', type: 'defensive' },
];

export const THEMES = [
  { s: 'SMH', label: 'Semiconductors' },
  { s: 'IGV', label: 'Software' },
  { s: 'ARKK', label: 'Innovation' },
  { s: 'XBI', label: 'Biotech' },
  { s: 'KRE', label: 'Regional Banks' },
  { s: 'ITA', label: 'Aerospace & Defense' },
  { s: 'XHB', label: 'Homebuilders' },
  { s: 'JETS', label: 'Airlines' },
  { s: 'XOP', label: 'Oil & Gas E&P' },
  { s: 'GDX', label: 'Gold Miners' },
  { s: 'IBIT', label: 'Bitcoin ETF' },
  { s: 'TAN', label: 'Solar' },
];

// Asset classes for the "where is the money going" board
export const ASSETS = [
  { s: 'SPY', label: 'US Large Caps', group: 'Equity' },
  { s: 'QQQ', label: 'Nasdaq 100', group: 'Equity' },
  { s: 'IWM', label: 'US Small Caps', group: 'Equity' },
  { s: 'EFA', label: 'Intl Developed', group: 'Equity' },
  { s: 'EEM', label: 'Emerging Mkts', group: 'Equity' },
  { s: 'BIL', label: 'T-Bills (Cash)', group: 'Safe haven' },
  { s: 'SHY', label: '1-3Y Treasuries', group: 'Safe haven' },
  { s: 'IEF', label: '7-10Y Treasuries', group: 'Safe haven' },
  { s: 'TLT', label: '20Y+ Treasuries', group: 'Safe haven' },
  { s: 'GLD', label: 'Gold', group: 'Safe haven' },
  { s: 'UUP', label: 'US Dollar', group: 'Safe haven' },
  { s: 'LQD', label: 'IG Corp Bonds', group: 'Credit' },
  { s: 'HYG', label: 'High Yield Bonds', group: 'Credit' },
  { s: 'DBC', label: 'Commodities', group: 'Real assets' },
  { s: 'VNQ', label: 'REITs', group: 'Real assets' },
  { s: 'IBIT', label: 'Bitcoin', group: 'Crypto' },
];

// Risk-on / risk-off ratio pairs. Positive relative move => risk-on.
export const RISK_PAIRS = [
  { a: 'SPY', b: 'TLT', label: 'Stocks vs Bonds', on: 'Stocks', off: 'Bonds' },
  { a: 'XLY', b: 'XLP', label: 'Cyclicals vs Staples', on: 'Discretionary', off: 'Staples' },
  { a: 'SPHB', b: 'SPLV', label: 'High Beta vs Low Vol', on: 'High beta', off: 'Low vol' },
  { a: 'HYG', b: 'LQD', label: 'Junk vs IG Credit', on: 'Junk', off: 'Quality' },
  { a: 'IWM', b: 'SPY', label: 'Small vs Large', on: 'Small caps', off: 'Large caps' },
  { a: 'RSP', b: 'SPY', label: 'Equal vs Cap Weight', on: 'Broad', off: 'Mega caps' },
  { a: 'SMH', b: 'SPY', label: 'Semis vs Market', on: 'Semis', off: 'Market' },
  { a: 'HG=F', b: 'GC=F', label: 'Copper vs Gold', on: 'Copper', off: 'Gold' },
  { a: 'EEM', b: 'SPY', label: 'EM vs US', on: 'EM', off: 'US' },
  { a: 'BTC-USD', b: 'GC=F', label: 'Bitcoin vs Gold', on: 'Bitcoin', off: 'Gold' },
];

// Global equity indices. iso = ISO 3166 numeric id used by world-atlas.
export const GLOBAL = [
  { s: '^GSPC', label: 'S&P 500', cc: 'US', iso: ['840'], region: 'Americas' },
  { s: '^GSPTSE', label: 'TSX', cc: 'CA', iso: ['124'], region: 'Americas' },
  { s: '^MXX', label: 'IPC', cc: 'MX', iso: ['484'], region: 'Americas' },
  { s: '^BVSP', label: 'Bovespa', cc: 'BR', iso: ['076'], region: 'Americas' },
  { s: '^MERV', label: 'Merval', cc: 'AR', iso: ['032'], region: 'Americas' },
  { s: '^FTSE', label: 'FTSE 100', cc: 'UK', iso: ['826'], region: 'Europe' },
  { s: '^GDAXI', label: 'DAX', cc: 'DE', iso: ['276'], region: 'Europe' },
  { s: '^FCHI', label: 'CAC 40', cc: 'FR', iso: ['250'], region: 'Europe' },
  { s: 'FTSEMIB.MI', label: 'FTSE MIB', cc: 'IT', iso: ['380'], region: 'Europe' },
  { s: '^IBEX', label: 'IBEX 35', cc: 'ES', iso: ['724'], region: 'Europe' },
  { s: '^AEX', label: 'AEX', cc: 'NL', iso: ['528'], region: 'Europe' },
  { s: '^SSMI', label: 'SMI', cc: 'CH', iso: ['756'], region: 'Europe' },
  { s: '^STOXX50E', label: 'Euro Stoxx 50', cc: 'EU', iso: [], region: 'Europe' },
  { s: 'XU100.IS', label: 'BIST 100', cc: 'TR', iso: ['792'], region: 'Europe' },
  { s: '^N225', label: 'Nikkei 225', cc: 'JP', iso: ['392'], region: 'Asia-Pacific' },
  { s: '^HSI', label: 'Hang Seng', cc: 'HK', iso: ['344'], region: 'Asia-Pacific' },
  { s: '000001.SS', label: 'Shanghai', cc: 'CN', iso: ['156'], region: 'Asia-Pacific' },
  { s: '^KS11', label: 'KOSPI', cc: 'KR', iso: ['410'], region: 'Asia-Pacific' },
  { s: '^TWII', label: 'Taiwan', cc: 'TW', iso: ['158'], region: 'Asia-Pacific' },
  { s: '^NSEI', label: 'Nifty 50', cc: 'IN', iso: ['356'], region: 'Asia-Pacific' },
  { s: '^AXJO', label: 'ASX 200', cc: 'AU', iso: ['036'], region: 'Asia-Pacific' },
  { s: '^STI', label: 'STI', cc: 'SG', iso: ['702'], region: 'Asia-Pacific' },
  { s: '^JKSE', label: 'Jakarta', cc: 'ID', iso: ['360'], region: 'Asia-Pacific' },
  { s: '^KLSE', label: 'KLCI', cc: 'MY', iso: ['458'], region: 'Asia-Pacific' },
  { s: '^NZ50', label: 'NZX 50', cc: 'NZ', iso: ['554'], region: 'Asia-Pacific' },
  { s: '^TA125.TA', label: 'TA-125', cc: 'IL', iso: ['376'], region: 'Middle East & Africa' },
  { s: '^J203.JO', label: 'JSE All Share', cc: 'ZA', iso: ['710'], region: 'Middle East & Africa' },
  { s: '^CASE30', label: 'EGX 30', cc: 'EG', iso: ['818'], region: 'Middle East & Africa' },
];

export const CRYPTO = [
  'BTC-USD', 'ETH-USD', 'XRP-USD', 'BNB-USD', 'SOL-USD', 'TRX-USD', 'HYPE32196-USD', 'DOGE-USD',
  'XMR-USD', 'ADA-USD', 'LINK-USD', 'BCH-USD', 'XLM-USD', 'LTC-USD', 'AVAX-USD', 'NEAR-USD',
  'TON11419-USD', 'HBAR-USD', 'UNI7083-USD', 'SUI20947-USD', 'SHIB-USD', 'DOT-USD', 'PEPE24478-USD',
  'AAVE-USD', 'ETC-USD', 'ICP-USD', 'APT21794-USD',
];

export const COMMODITIES = [
  { s: 'GC=F', label: 'Gold', unit: '/oz', group: 'Metals' },
  { s: 'SI=F', label: 'Silver', unit: '/oz', group: 'Metals' },
  { s: 'PL=F', label: 'Platinum', unit: '/oz', group: 'Metals' },
  { s: 'HG=F', label: 'Copper', unit: '/lb', group: 'Metals' },
  { s: 'CL=F', label: 'WTI Crude', unit: '/bbl', group: 'Energy' },
  { s: 'BZ=F', label: 'Brent Crude', unit: '/bbl', group: 'Energy' },
  { s: 'NG=F', label: 'Natural Gas', unit: '/MMBtu', group: 'Energy' },
  { s: 'ZC=F', label: 'Corn', unit: '/bu', group: 'Agriculture' },
  { s: 'ZW=F', label: 'Wheat', unit: '/bu', group: 'Agriculture' },
  { s: 'ZS=F', label: 'Soybeans', unit: '/bu', group: 'Agriculture' },
];

export const FX = [
  { s: 'DX-Y.NYB', label: 'Dollar Index', note: 'DXY', group: 'Majors' },
  { s: 'EURUSD=X', label: 'EUR / USD', note: 'Euro', group: 'Majors' },
  { s: 'JPY=X', label: 'USD / JPY', note: 'Yen (falling = yen strength)', group: 'Majors' },
  { s: 'GBPUSD=X', label: 'GBP / USD', note: 'Pound', group: 'Majors' },
  { s: 'CHF=X', label: 'USD / CHF', note: 'Swiss franc (haven)', group: 'Majors' },
  { s: 'AUDUSD=X', label: 'AUD / USD', note: 'Aussie (risk proxy)', group: 'Majors' },
  { s: 'CAD=X', label: 'USD / CAD', note: 'Loonie', group: 'Majors' },
  { s: 'CNY=X', label: 'USD / CNY', note: 'Yuan', group: 'Emerging markets' },
  { s: 'KRW=X', label: 'USD / KRW', note: 'Won (tech/chip proxy)', group: 'Emerging markets' },
  { s: 'INR=X', label: 'USD / INR', note: 'Rupee', group: 'Emerging markets' },
  { s: 'MXN=X', label: 'USD / MXN', note: 'Peso (EM risk)', group: 'Emerging markets' },
  { s: 'BRL=X', label: 'USD / BRL', note: 'Real', group: 'Emerging markets' },
];

export const RATES = [
  { s: '^IRX', label: '3M T-Bill' },
  { s: '^FVX', label: '5Y Treasury' },
  { s: '^TNX', label: '10Y Treasury' },
  { s: '^TYX', label: '30Y Treasury' },
];

export const VOL = [
  { s: '^VIX', label: 'VIX', note: 'S&P 30-day implied vol' },
  { s: '^VIX9D', label: 'VIX 9-Day', note: 'Short-term fear' },
  { s: '^VIX3M', label: 'VIX 3-Month', note: 'Term structure anchor' },
  { s: '^VVIX', label: 'VVIX', note: 'Volatility of VIX' },
  { s: '^MOVE', label: 'MOVE', note: 'Bond-market vol' },
  { s: '^SKEW', label: 'SKEW', note: 'Tail-risk pricing' },
];

export const FUTURES = [
  { s: 'ES=F', label: 'S&P 500 fut' },
  { s: 'NQ=F', label: 'Nasdaq fut' },
  { s: 'YM=F', label: 'Dow fut' },
  { s: 'RTY=F', label: 'Russell fut' },
  { s: 'ZN=F', label: '10Y Note fut' },
  { s: 'CL=F', label: 'Crude fut' },
  { s: 'GC=F', label: 'Gold fut' },
];

export const EXTRA = ['SPHB', 'SPLV', 'RSP', 'XLY', 'XLP'];

// ---------------------------------------------------------------------------
// Core ETF building blocks (/api/etfs), grouped by role.
// ---------------------------------------------------------------------------
export const ETFS = [
  { s: 'VTI', role: 'US total market', label: 'Vanguard Total Stock Market' },
  { s: 'VOO', role: 'US large cap', label: 'Vanguard S&P 500' },
  { s: 'SPY', role: 'US large cap', label: 'SPDR S&P 500' },
  { s: 'IVV', role: 'US large cap', label: 'iShares Core S&P 500' },
  { s: 'RSP', role: 'US large cap', label: 'Invesco S&P 500 Equal Weight' },
  { s: 'QQQ', role: 'US growth', label: 'Invesco QQQ (Nasdaq 100)' },
  { s: 'VUG', role: 'US growth', label: 'Vanguard Growth' },
  { s: 'VTV', role: 'US value / dividend', label: 'Vanguard Value' },
  { s: 'SCHD', role: 'US value / dividend', label: 'Schwab US Dividend Equity' },
  { s: 'VIG', role: 'US value / dividend', label: 'Vanguard Dividend Appreciation' },
  { s: 'IWM', role: 'US small cap', label: 'iShares Russell 2000' },
  { s: 'VB', role: 'US small cap', label: 'Vanguard Small-Cap' },
  { s: 'VXUS', role: 'International (all ex-US)', label: 'Vanguard Total International Stock' },
  { s: 'VEA', role: 'International developed', label: 'Vanguard FTSE Developed Markets' },
  { s: 'EFA', role: 'International developed', label: 'iShares MSCI EAFE' },
  { s: 'VWO', role: 'Emerging markets', label: 'Vanguard FTSE Emerging Markets' },
  { s: 'EEM', role: 'Emerging markets', label: 'iShares MSCI Emerging Markets' },
  { s: 'BND', role: 'Bonds', label: 'Vanguard Total Bond Market' },
  { s: 'AGG', role: 'Bonds', label: 'iShares Core US Aggregate Bond' },
  { s: 'SHY', role: 'Bonds', label: 'iShares 1-3 Year Treasury' },
  { s: 'IEF', role: 'Bonds', label: 'iShares 7-10 Year Treasury' },
  { s: 'TLT', role: 'Bonds', label: 'iShares 20+ Year Treasury' },
  { s: 'TIP', role: 'Bonds', label: 'iShares TIPS (inflation-protected)' },
  { s: 'VNQ', role: 'Real assets', label: 'Vanguard Real Estate (REITs)' },
  { s: 'GLD', role: 'Real assets', label: 'SPDR Gold Shares' },
  { s: 'IBIT', role: 'Crypto', label: 'iShares Bitcoin Trust' },
  { s: 'VT', role: 'All-in-one', label: 'Vanguard Total World Stock' },
  { s: 'AOR', role: 'All-in-one', label: 'iShares Core 60/40 Balanced Allocation' },
];

// ---------------------------------------------------------------------------
// Economy (/api/macro): FRED series. transform: level | yoy (% vs 12 months
// earlier) | diff (change vs previous observation). freq: D W M Q.
// higherIsHotter: true when a higher reading means a hotter economy / more
// inflation pressure, false when higher means cooler, null when it is neither.
// ---------------------------------------------------------------------------
export const MACRO_SERIES = [
  { key: 'cpi', id: 'CPIAUCSL', group: 'Inflation', title: 'CPI inflation', unit: '% YoY', freq: 'M', transform: 'yoy', higherIsHotter: true,
    what: 'How much consumer prices rose over the past 12 months.', why: 'Inflation eats real returns and drives Fed rate decisions; the Fed aims for about 2%.' },
  { key: 'coreCpi', id: 'CPILFESL', group: 'Inflation', title: 'Core CPI inflation', unit: '% YoY', freq: 'M', transform: 'yoy', higherIsHotter: true,
    what: 'CPI excluding food and energy, which swing a lot.', why: 'Shows the stickier underlying trend the Fed watches closely.' },
  { key: 'pce', id: 'PCEPI', group: 'Inflation', title: 'PCE inflation', unit: '% YoY', freq: 'M', transform: 'yoy', higherIsHotter: true,
    what: 'Price index for personal consumption, a broader inflation measure than CPI.', why: 'This is the measure behind the Fed\'s official 2% target.' },
  { key: 'corePce', id: 'PCEPILFE', group: 'Inflation', title: 'Core PCE inflation', unit: '% YoY', freq: 'M', transform: 'yoy', higherIsHotter: true,
    what: 'PCE inflation excluding food and energy.', why: 'The Fed\'s favourite gauge of underlying inflation.' },
  { key: 'breakeven10', id: 'T10YIE', group: 'Inflation', title: '10-year breakeven inflation', unit: '%', freq: 'D', transform: 'level', higherIsHotter: true,
    what: 'Average yearly inflation over 10 years implied by regular vs inflation-protected Treasury yields.', why: 'Shows whether bond investors expect inflation to stay contained.' },
  { key: 'unemployment', id: 'UNRATE', group: 'Jobs', title: 'Unemployment rate', unit: '%', freq: 'M', transform: 'level', higherIsHotter: false,
    what: 'Share of people in the labour force who want a job and do not have one.', why: 'Rising unemployment is one of the clearest signs of a slowing economy.' },
  { key: 'payrolls', id: 'PAYEMS', group: 'Jobs', title: 'Payroll job growth', unit: 'thousand jobs / month', freq: 'M', transform: 'diff', higherIsHotter: true,
    what: 'Jobs added (or lost) by US employers last month.', why: 'Steady job growth supports spending and corporate earnings.' },
  { key: 'claims', id: 'ICSA', group: 'Jobs', title: 'Initial jobless claims', unit: 'claims / week', freq: 'W', transform: 'level', higherIsHotter: false,
    what: 'New applications for unemployment benefits each week.', why: 'The fastest-moving labour indicator; sustained rises often lead recessions.' },
  { key: 'sahm', id: 'SAHMREALTIME', group: 'Jobs', title: 'Sahm rule indicator', unit: 'pct. points', freq: 'M', transform: 'level', higherIsHotter: false,
    what: '3-month average unemployment rate minus its lowest 3-month average of the prior year.', why: 'A reading of 0.5 or more has historically signalled the early months of a recession.' },
  { key: 'gdp', id: 'A191RL1Q225SBEA', group: 'Growth', title: 'Real GDP growth', unit: '% annualized (q/q)', freq: 'Q', transform: 'level', higherIsHotter: true,
    what: 'Inflation-adjusted growth of the whole economy last quarter, at an annual rate.', why: 'Earnings grow with the economy over the long run.' },
  { key: 'indpro', id: 'INDPRO', group: 'Growth', title: 'Industrial production', unit: '% YoY', freq: 'M', transform: 'yoy', higherIsHotter: true,
    what: 'Output of factories, mines and utilities vs a year ago.', why: 'A cyclical part of the economy that often turns before the rest.' },
  { key: 'sentiment', id: 'UMCSENT', group: 'Growth', title: 'Consumer sentiment (U. Michigan)', unit: 'index (1966 = 100)', freq: 'M', transform: 'level', higherIsHotter: true,
    what: 'Survey of how confident households feel about their finances and the economy.', why: 'Consumer spending is about two-thirds of the US economy.' },
  { key: 'fedFunds', id: 'DFF', group: 'Rates', title: 'Fed funds rate (effective)', unit: '%', freq: 'D', transform: 'level', higherIsHotter: null,
    what: 'The overnight interest rate the Federal Reserve targets.', why: 'Sets the base cost of money; higher rates cool the economy and make cash and bonds more competitive with stocks.' },
  { key: 'y2', id: 'DGS2', group: 'Rates', title: '2-year Treasury yield', unit: '%', freq: 'D', transform: 'level', higherIsHotter: null,
    what: 'Yield on 2-year US government bonds.', why: 'Tracks where markets expect the Fed to set rates over the next two years.' },
  { key: 'y10', id: 'DGS10', group: 'Rates', title: '10-year Treasury yield', unit: '%', freq: 'D', transform: 'level', higherIsHotter: null,
    what: 'Yield on 10-year US government bonds.', why: 'The benchmark for mortgages and for valuing stocks; higher yields make future earnings worth less today.' },
  { key: 'real10', id: 'DFII10', group: 'Rates', title: '10-year real yield (TIPS)', unit: '%', freq: 'D', transform: 'level', higherIsHotter: null,
    what: '10-year Treasury yield after expected inflation.', why: 'The true return on safe bonds; high real yields are a headwind for stock valuations.' },
  { key: 's10y2y', id: 'T10Y2Y', group: 'Rates', title: 'Yield curve: 10-year minus 2-year', unit: 'pct. points', freq: 'D', transform: 'level', higherIsHotter: null,
    what: 'Gap between long and short Treasury yields.', why: 'Below zero ("inverted") has preceded most US recessions, usually by many months.' },
  { key: 's10y3m', id: 'T10Y3M', group: 'Rates', title: 'Yield curve: 10-year minus 3-month', unit: 'pct. points', freq: 'D', transform: 'level', higherIsHotter: null,
    what: 'Gap between the 10-year yield and the 3-month bill yield.', why: 'The spread used by the New York Fed\'s recession-probability model.' },
  { key: 'mortgage30', id: 'MORTGAGE30US', group: 'Rates', title: '30-year mortgage rate', unit: '%', freq: 'W', transform: 'level', higherIsHotter: null,
    what: 'Average rate on a new 30-year fixed mortgage (Freddie Mac survey).', why: 'Drives housing affordability and activity.' },
  { key: 'hySpread', id: 'BAMLH0A0HYM2', group: 'Credit & conditions', title: 'High-yield credit spread', unit: 'pct. points', freq: 'D', transform: 'level', higherIsHotter: false,
    what: 'Extra yield junk-rated companies pay over Treasuries (ICE BofA US High Yield OAS).', why: 'Widening spreads mean lenders fear defaults; they usually widen in recessions and selloffs.' },
  { key: 'baaSpread', id: 'BAA10Y', group: 'Credit & conditions', title: 'Baa corporate spread', unit: 'pct. points', freq: 'D', transform: 'level', higherIsHotter: false,
    what: 'Moody\'s Baa corporate bond yield minus the 10-year Treasury yield.', why: 'A long-history credit stress gauge (FRED only keeps 3 years of the high-yield spread).' },
  { key: 'nfci', id: 'NFCI', group: 'Credit & conditions', title: 'Financial conditions (Chicago Fed NFCI)', unit: 'index (0 = average)', freq: 'W', transform: 'level', higherIsHotter: false,
    what: 'Summary of risk, credit and leverage in financial markets. Positive = tighter than average.', why: 'Tight conditions make borrowing harder and tend to slow the economy.' },
  { key: 'm2', id: 'M2SL', group: 'Money', title: 'M2 money supply growth', unit: '% YoY', freq: 'M', transform: 'yoy', higherIsHotter: true,
    what: 'Growth in cash, checking and savings deposits and money funds vs a year ago.', why: 'Rapid growth can feed inflation; contraction is rare and signals tight money.' },
];

// Extra FRED series used for derived blocks (not listed as standalone cards).
export const MACRO_AUX = [
  { key: 'fedTargetLow', id: 'DFEDTARL', freq: 'D' },
  { key: 'fedTargetHigh', id: 'DFEDTARU', freq: 'D' },
  { key: 'usrec', id: 'USREC', freq: 'M' },
];

export function macroSymbols() {
  const set = new Set();
  STRIP.forEach(x => set.add(x.s));
  SECTORS.forEach(x => set.add(x.etf));
  THEMES.forEach(x => set.add(x.s));
  ASSETS.forEach(x => set.add(x.s));
  RISK_PAIRS.forEach(x => { set.add(x.a); set.add(x.b); });
  GLOBAL.forEach(x => set.add(x.s));
  CRYPTO.forEach(x => set.add(x));
  COMMODITIES.forEach(x => set.add(x.s));
  FX.forEach(x => set.add(x.s));
  RATES.forEach(x => set.add(x.s));
  VOL.forEach(x => set.add(x.s));
  EXTRA.forEach(x => set.add(x));
  FUTURES.forEach(x => set.add(x.s));
  return [...set];
}

// Intraday sparklines (5-minute bars) are fetched for these.
export function intradaySymbols() {
  const set = new Set(STRIP.map(x => x.s));
  SECTORS.forEach(x => set.add(x.etf));
  return [...set];
}
