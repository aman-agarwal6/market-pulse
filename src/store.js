// Disk + memory cache with in-flight de-duplication, stale-on-error fallback,
// and a registry of dataset freshness used by /api/status.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// MP_CACHE_DIR overrides the location (used to test cold starts without touching data/).
export const CACHE_DIR = process.env.MP_CACHE_DIR ? path.resolve(process.env.MP_CACHE_DIR) : path.join(ROOT, 'data', 'cache');

const mem = new Map();      // key -> { t, data }
const inflight = new Map(); // key -> Promise
const registry = new Map(); // dataset -> status

const safe = key => key.replace(/[^\w.\-^=]/g, '_');
const fileFor = key => path.join(CACHE_DIR, safe(key) + '.json');

export async function readDisk(key) {
  try {
    const txt = await fs.readFile(fileFor(key), 'utf8');
    const j = JSON.parse(txt);
    if (j && typeof j.t === 'number') return j;
  } catch { /* missing or corrupt */ }
  return null;
}

export async function writeDisk(key, data, t = Date.now()) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = fileFor(key);
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify({ t, data }));
  await fs.rename(tmp, file);
}

/**
 * Get a cached value, fetching when older than ttlMs.
 *  - memory first, then disk (disk: true), then fetcher()
 *  - concurrent callers share one in-flight fetch
 *  - if the fetch fails and any older copy exists, that copy is returned with
 *    stale = true (the error is attached) instead of throwing
 * Returns { data, t (ms fetched), stale, error }.
 */
export async function cached(key, ttlMs, fetcher, { disk = true, memory = true } = {}) {
  const now = Date.now();
  let hit = memory ? mem.get(key) : null;
  if (!hit && disk) {
    hit = await readDisk(key);
    if (hit && memory) mem.set(key, hit);
  }
  if (hit && now - hit.t < ttlMs) return { data: hit.data, t: hit.t, stale: false, error: null };
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const data = await fetcher();
      if (data == null) throw new Error('empty result');
      const t = Date.now();
      if (memory) mem.set(key, { t, data });
      if (disk) await writeDisk(key, data, t).catch(e => console.warn('[store] write failed', key, e.message));
      return { data, t, stale: false, error: null };
    } catch (err) {
      if (hit) return { data: hit.data, t: hit.t, stale: true, error: err.message || String(err) };
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Drop a memory entry (e.g. to bound memory for per-symbol caches). */
export function forget(key) { mem.delete(key); }

export function memSize(prefix) {
  let n = 0;
  for (const k of mem.keys()) if (k.startsWith(prefix)) n++;
  return n;
}

/** Trim per-symbol memory entries with this prefix to at most max (oldest first). */
export function trimMemory(prefix, max) {
  const keys = [...mem.entries()].filter(([k]) => k.startsWith(prefix)).sort((a, b) => a[1].t - b[1].t).map(([k]) => k);
  while (keys.length > max) mem.delete(keys.shift());
}

// ---------------------------------------------------------------------------
// Dataset registry
// ---------------------------------------------------------------------------
/**
 * Record the state of a dataset. Fields: source, asOf (data date, ISO string or
 * ms), fetchedAt (ms), ok (bool), error (string|null), nextRefresh (ms), note.
 */
export function report(name, fields) {
  const prev = registry.get(name) || { name };
  registry.set(name, { ...prev, ...fields, updated: Date.now() });
}

export function reportResult(name, res, { source, asOf, ttlMs, note } = {}) {
  report(name, {
    source, note,
    asOf: asOf ?? null,
    fetchedAt: res?.t ?? null,
    ok: !!res && !res.stale,
    stale: !!res?.stale,
    error: res?.error ?? null,
    nextRefresh: res?.t && ttlMs ? res.t + ttlMs : null,
  });
}

export function reportError(name, err, extra = {}) {
  const prev = registry.get(name) || {};
  report(name, { ...extra, ok: false, error: err?.message || String(err), lastErrorAt: Date.now(), stale: prev.fetchedAt ? true : false });
}

export function allStatus() {
  return [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Standard section metadata object for payloads. */
export function meta({ ok = true, source, asOf = null, fetchedAt = null, stale = false, error = null, note } = {}) {
  const m = { ok, source, asOf, fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null, stale, error };
  if (note) m.note = note;
  return m;
}
