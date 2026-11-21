// /api/history?s=SYM&range=...&interval=1d|1wk|1mo
// Raw and dividend-adjusted closes as compact parallel arrays for the DCA
// simulator and compare tool (the client runs the simulations).
import * as yahoo from './yahoo.js';
import { cached, trimMemory, meta } from './store.js';

const H = 3600000;
export const HISTORY_RANGES = ['1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max'];
export const HISTORY_INTERVALS = ['1d', '1wk', '1mo'];

const r4 = v => Math.round(v * 1e4) / 1e4;

export async function getHistory(sym, range, interval) {
  const key = `hist-${sym}-${range}-${interval}`;
  const ttl = interval === '1d' ? 1 * H : 6 * H;
  const long = range === 'max' || range === '10y' || range === '5y';
  const res = await cached(key, ttl, async () => {
    const h = await yahoo.history(sym, { range, interval, interactive: true });
    if (!h || !h.t.length) throw Object.assign(new Error('no history for symbol'), { status: 404 });
    const off = h.meta?.gmtoffset ?? 0;
    return {
      s: sym, name: h.meta?.longName || h.meta?.shortName || null, currency: h.meta?.currency || null, type: h.meta?.instrumentType || null,
      exchangeTimezone: h.meta?.exchangeTimezoneName || null, gmtoffset: off,
      firstTradeDate: h.meta?.firstTradeDate ?? null,
      t: h.t, c: h.c.map(r4), adj: h.adj.map(r4), div: h.div.map(d => ({ t: d.t, amount: r4(d.amount) })),
    };
  }, { disk: long });
  trimMemory('hist-', 200);
  const d = res.data;
  return {
    ...d, range, interval,
    meta: meta({ ok: !res.stale, stale: res.stale, error: res.error, fetchedAt: res.t, source: 'Yahoo Finance chart (adjclose = split- and dividend-adjusted close)', asOf: d.t.length ? new Date((d.t[d.t.length - 1]) * 1000).toISOString() : null,
      note: `t = bar start (unix seconds, add gmtoffset for exchange-local date). c = close (split-adjusted), adj = close adjusted for dividends too. Cached ${ttl / H} h.` }),
  };
}
