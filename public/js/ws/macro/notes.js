// Plain-English "how to read" notes that go beyond the API's what/why text:
// definitions a beginner needs the first time they meet a term, and the
// known limits of each measure. Descriptive only.
export const BP = 'A basis point (bp) is one hundredth of a percentage point: 0.25 percentage point = 25 bp, the usual size of a Fed move.';
export const PP = 'Changes in rates are shown in percentage points (pp): inflation going from 3.0% to 3.4% is a rise of 0.4 pp.';
export const RECESSION = 'Grey shading marks US recessions as dated by the National Bureau of Economic Research (NBER), from the peak month to the trough month. The NBER announces these dates months after the fact.';
export const PERCENTILE = 'The percentile compares the latest reading with every reading in the series’ own history: 90% means only one reading in ten was higher.';

export const SERIES_NOTES = {
  cpi: PP + ' CPI is published by the Bureau of Labor Statistics (BLS) around the middle of each month and covers the previous month.',
  coreCpi: 'Core inflation leaves out food and energy prices, which jump with harvests and oil markets, to show the slower-moving trend underneath.',
  pce: 'PCE inflation comes from the Commerce Department (BEA). It covers more kinds of spending than CPI, including health care paid for on people’s behalf, and usually runs a little below CPI. The Fed defines its 2% goal with this measure.',
  corePce: 'Core PCE is PCE inflation without food and energy. It is the inflation measure the Fed watches most closely for the underlying trend.',
  breakeven10: 'Treasury Inflation-Protected Securities (TIPS) pay a yield on top of inflation. The gap between a normal 10-year yield and the 10-year TIPS yield is the inflation rate at which both would pay the same: the “breakeven”. It also contains risk premiums, so it is an approximate market expectation, not a survey.',
  unemployment: 'It counts people without a job who looked for one in the past four weeks, as a share of everyone working or looking. Historically it has risen quickly at the start of recessions and fallen slowly afterwards.',
  payrolls: 'The monthly change in jobs reported by employers, in thousands. First estimates are revised over the next two months, sometimes by tens of thousands, so a 3-month average gives a steadier read.',
  claims: 'The number of people filing a new claim for unemployment benefits in a week. Weekly counts are noisy (holidays, storms), so the 4-week average is the usual read.',
  sahm: 'The Sahm rule, named after economist Claudia Sahm, compares the latest 3-month average unemployment rate with its lowest 3-month average over the prior 12 months. This is the real-time version, built from the data as first published.',
  gdp: 'Gross domestic product adjusted for inflation (“real”). Quarterly growth is converted to an annual rate, roughly ×4. The first estimate is revised twice in the following two months and again later. US recessions are dated by the NBER from many indicators, not by two negative quarters.',
  indpro: 'Output of factories, mines and utilities compared with the same month a year earlier. Manufacturing is a smaller share of the economy than it used to be, so this is one cyclical signal among several.',
  sentiment: 'A monthly University of Michigan survey of households, set to 100 in 1966. It tends to move with inflation, gas prices and the news, and has been a loose guide to actual spending month to month.',
  fedFunds: 'The rate banks charge each other for overnight loans. The Fed sets a target range 0.25 pp wide and steers the effective (actual average) rate inside it. ' + BP,
  y2: 'The yield on 2-year Treasury notes. It moves mostly with what markets expect the Fed’s policy rate to be over the next two years.',
  y10: 'The yield on 10-year Treasury notes, the benchmark long-term interest rate in the US. Mortgage rates and the discount rates used to value stocks are built on it.',
  real10: 'The real yield is the yield after expected inflation, taken from 10-year TIPS. It is the inflation-adjusted return on a safe 10-year bond. FRED’s history for it starts in 2003.',
  s10y2y: 'The yield curve plots Treasury yields from short to long maturities. Normally long-term yields are higher. When this spread is below zero the curve is “inverted”: markets are being paid less to lend for longer, which has often happened when they expect rates to fall. ' + BP,
  s10y3m: 'This version of the yield-curve spread uses the 3-month bill. It feeds the New York Fed’s recession-probability model. Below zero means the curve is inverted. ' + BP,
  mortgage30: 'The average rate offered on a new 30-year fixed-rate mortgage, from Freddie Mac’s weekly survey of lenders. It usually sits about 1.5–3 pp above the 10-year Treasury yield.',
  hySpread: 'The extra yield that lower-rated (“high-yield” or “junk”) companies pay over Treasuries, from the ICE BofA US High Yield index. FRED only publishes the last 3 years of this index, so its percentile covers that short window; the Baa spread gives the long-run context.',
  baaSpread: 'Moody’s Baa corporate bond yield minus the 10-year Treasury yield. Baa is the lowest investment-grade rating, so this spread rises when lenders worry about companies’ ability to repay. History since 1986 in this data.',
  nfci: 'The Chicago Fed’s National Financial Conditions Index combines 105 measures of risk, credit and leverage. Zero is the average since 1971; each 1.0 is one standard deviation. Negative means looser (easier) than average, positive tighter.',
  m2: 'M2 adds up cash, checking and savings deposits and retail money-market funds. Growth is shown versus a year earlier. Its link with inflation has been loose in most decades.',
};
