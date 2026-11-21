// Polite fetch for non-Yahoo data hosts (FRED, GitHub, multpl, Fed, BLS, BEA):
// one request at a time per host, a short gap between requests, and
// exponential back-off on 429 / 5xx.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const hosts = new Map(); // host -> { chain: Promise, last: ms }
const GAP_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function once(url, { timeout, binary, headers }) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', ...headers }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) { const e = new Error(`HTTP ${res.status} ${url.slice(0, 100)}`); e.status = res.status; throw e; }
  return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// Testing hook: MP_FAIL_HOSTS=multpl.com,fred.stlouisfed.org makes requests to
// matching hosts fail, to check that one broken source does not break the rest.
const FAIL = (process.env.MP_FAIL_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
export const simulatedFailure = url => FAIL.some(h => url.includes(h));

/** Fetch text (or a Buffer with binary: true), serialized per host. */
export function politeFetch(url, { timeout = 30000, retries = 2, binary = false, headers = {} } = {}) {
  if (simulatedFailure(url)) return Promise.reject(new Error(`simulated failure (MP_FAIL_HOSTS) for ${new URL(url).host}`));
  const host = new URL(url).host;
  const h = hosts.get(host) || { chain: Promise.resolve(), last: 0 };
  hosts.set(host, h);
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = h.last + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      h.last = Date.now();
      try {
        return await once(url, { timeout, binary, headers });
      } catch (err) {
        const retryable = !err.status || err.status === 429 || err.status >= 500;
        if (!retryable || attempt >= retries) throw err;
        await sleep((err.status === 429 ? 20000 : 2000) * 2 ** attempt);
      }
    }
  };
  const p = h.chain.then(run, run);
  h.chain = p.catch(() => {});
  return p;
}
