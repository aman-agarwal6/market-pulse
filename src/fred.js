// FRED (St. Louis Fed) series via the public no-key CSV download:
//   https://fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES
// One series per request (with several ids the `cosd` start date is ignored),
// serialized and cached on disk by frequency.
import { politeFetch } from './net.js';
import { cached, reportResult } from './store.js';

const H = 3600000;
export const FRED_TTL = { D: 6 * H, W: 12 * H, M: 24 * H, Q: 24 * H };

/** Parse a fredgraph CSV ("observation_date,ID" header). Missing values ('.' or '') are skipped. */
export function parseFredCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length || !/^observation_date|^DATE/i.test(lines[0])) throw new Error('unexpected FRED CSV: ' + lines[0]?.slice(0, 60));
  const dates = [], values = [];
  for (let i = 1; i < lines.length; i++) {
    const [d, v] = lines[i].split(',');
    if (!v || v === '.') continue;
    const x = parseFloat(v);
    if (!Number.isFinite(x)) continue;
    dates.push(d); values.push(x);
  }
  return { dates, values };
}

export async function fredSeries(id, freq = 'M') {
  const ttl = FRED_TTL[freq] || 24 * H;
  const res = await cached(`fred-${id}`, ttl, async () => {
    const s = parseFredCSV(await politeFetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`));
    if (!s.dates.length) throw new Error(`FRED ${id}: no observations`);
    return s;
  });
  reportResult(`fred:${id}`, res, { source: `FRED ${id}`, asOf: res.data.dates.at(-1), ttlMs: ttl });
  return res;
}
