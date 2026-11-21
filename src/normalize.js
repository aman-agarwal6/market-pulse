// Helpers for Yahoo payloads: {raw, fmt} objects -> plain numbers.

/** Recursively replace { raw, fmt, longFmt } objects with raw; empty {} -> null. */
export function plain(v) {
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    if ('raw' in v && (typeof v.raw === 'number' || v.raw === null)) return Number.isFinite(v.raw) ? v.raw : null;
    const keys = Object.keys(v);
    if (!keys.length) return null;
    const o = {};
    for (const k of keys) o[k] = plain(v[k]);
    return o;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

/** Number or null. */
export const n = v => {
  const x = v && typeof v === 'object' && 'raw' in v ? v.raw : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};

/** Fraction -> percent (0.123 -> 12.3), rounded. */
export const pct = (v, d = 2) => (n(v) == null ? null : Math.round(n(v) * 100 * 10 ** d) / 10 ** d);

export const r = (v, d = 2) => (n(v) == null ? null : Math.round(n(v) * 10 ** d) / 10 ** d);

/** Unix seconds -> 'YYYY-MM-DD' (UTC). */
export const isoDate = s => (n(s) == null ? null : new Date(n(s) * 1000).toISOString().slice(0, 10));
