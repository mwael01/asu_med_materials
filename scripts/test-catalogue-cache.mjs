// Run with Node 22.12+: node --experimental-strip-types scripts/test-catalogue-cache.mjs
import assert from 'node:assert/strict';
import { loadCachedCatalogue, CATALOGUE_TTL_SECONDS } from '../src/utils/catalogueCache.ts';
import { createTimedLoader } from '../src/utils/timedLoader.ts';

const records = new Map();
const writes = [];
const cache = {
  get: async (key) => records.get(key),
  set: async (key, value, options) => { records.set(key, value); writes.push({ key, value, options }); },
};
const valid = (item) => Boolean(item && typeof item.id === 'string');
let reads = 0;
const origin = async () => { reads++; return [{ id: 'one' }]; };
await loadCachedCatalogue(cache, 'materials', origin, valid);
await loadCachedCatalogue(cache, 'materials', origin, valid);
assert.equal(reads, 1, 'a separate loader invocation must reuse the shared catalogue');
assert.equal(writes.at(-1).options.ttl, CATALOGUE_TTL_SECONDS);
const manifest = records.get('materials');
manifest.expiresAt = Date.now() - 1;
await loadCachedCatalogue(cache, 'materials', origin, valid);
assert.equal(reads, 2, 'expired catalogue must refresh');
records.delete(records.get('materials').chunks[0]);
await loadCachedCatalogue(cache, 'materials', origin, valid);
assert.equal(reads, 3, 'incomplete catalogue must refresh');
records.set(records.get('materials').chunks[0], [{ unexpected: true }]);
await loadCachedCatalogue(cache, 'materials', origin, valid);
assert.equal(reads, 4, 'invalid records must refresh');

let emptyReads = 0;
const emptyOrigin = async () => { emptyReads++; return []; };
assert.deepEqual(await loadCachedCatalogue(cache, 'empty', emptyOrigin, valid), []);
assert.deepEqual(await loadCachedCatalogue(cache, 'empty', emptyOrigin, valid), []);
assert.equal(emptyReads, 1, 'valid empty collections must be cached');
await assert.rejects(loadCachedCatalogue(cache, 'failed', async () => { throw new Error('Firestore unavailable'); }, valid));
assert.equal(records.has('failed'), false, 'origin failures must not publish a manifest');

const unavailable = { get: async () => { throw new Error('cache down'); }, set: async () => { throw new Error('cache down'); } };
assert.deepEqual(await loadCachedCatalogue(unavailable, 'fallback', origin, valid), [{ id: 'one' }]);
const partial = { get: cache.get, set: async (key, value, options) => {
  if (key.includes(':')) throw new Error('chunk write failed');
  return cache.set(key, value, options);
} };
await loadCachedCatalogue(partial, 'partial', origin, valid);
assert.equal(records.has('partial'), false, 'failed chunk writes must not publish a manifest');

const large = Array.from({ length: 5 }, (_, index) => ({ id: String(index), text: 'ع'.repeat(200_000) }));
assert.deepEqual(await loadCachedCatalogue(cache, 'large', async () => large, valid), large);
assert.ok(records.get('large').chunks.length > 1);
for (const key of records.get('large').chunks) {
  assert.ok(Buffer.byteLength(JSON.stringify(records.get(key))) < 1_000_000);
}
assert.deepEqual(await loadCachedCatalogue(cache, 'large', async () => { throw new Error('must not fetch'); }, valid), large);

let concurrentReads = 0;
let resolve;
const deduplicated = createTimedLoader(() => {
  concurrentReads++;
  return new Promise((done) => { resolve = done; });
});
const first = deduplicated();
const second = deduplicated();
assert.equal(concurrentReads, 1);
resolve([]);
assert.deepEqual(await first, []);
assert.deepEqual(await second, []);
let attempts = 0;
const retry = createTimedLoader(async () => { if (++attempts === 1) throw new Error('offline'); return []; });
await assert.rejects(retry());
assert.deepEqual(await retry(), []);
assert.equal(attempts, 2);
console.log('Catalogue cache tests passed.');
