import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Isolated cache dir (must be set before store.js is imported).
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-store-'));
process.env.MP_CACHE_DIR = dir;
const { cached, readDisk } = await import('../src/store.js');

test('cached(): dedupes concurrent fetches and writes to disk', async () => {
  let calls = 0;
  const f = async () => { calls++; await new Promise(r => setTimeout(r, 20)); return { x: 1 }; };
  const [a, b] = await Promise.all([cached('t1', 60000, f), cached('t1', 60000, f)]);
  assert.equal(calls, 1);
  assert.deepEqual(a.data, { x: 1 });
  assert.equal(b.stale, false);
  assert.deepEqual((await readDisk('t1')).data, { x: 1 });
  await cached('t1', 60000, f);
  assert.equal(calls, 1); // fresh -> no refetch
});

test('cached(): serves the stale copy when a refresh fails', async () => {
  await cached('t2', 60000, async () => ({ v: 'old' }));
  const r = await cached('t2', 0, async () => { throw new Error('boom'); });
  assert.equal(r.stale, true);
  assert.equal(r.error, 'boom');
  assert.deepEqual(r.data, { v: 'old' });
});

test('cached(): throws when nothing is cached and the fetch fails', async () => {
  await assert.rejects(cached('t3', 60000, async () => { throw new Error('nope'); }), /nope/);
  await assert.rejects(cached('t4', 60000, async () => null), /empty result/);
});

test.after(() => fs.rm(dir, { recursive: true, force: true }));
