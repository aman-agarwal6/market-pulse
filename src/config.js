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
