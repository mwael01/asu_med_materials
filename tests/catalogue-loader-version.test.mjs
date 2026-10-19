import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimedLoader } from '../src/utils/timedLoader.ts';
import { createMemoryCacheStore, loadCachedCatalogue } from '../src/utils/catalogueCache.ts';

test('createTimedLoader forwards version parameter to load callback', async () => {
  const versionsReceived = [];
  const loader = createTimedLoader(async (version) => {
    versionsReceived.push(version);
    return `data-v${version}`;
  });

  const res1 = await loader(1);
  assert.equal(res1, 'data-v1');
  assert.deepEqual(versionsReceived, [1]);

  // Calling with same version returns cached value without invoking load
  const res2 = await loader(1);
  assert.equal(res2, 'data-v1');
  assert.deepEqual(versionsReceived, [1]);

  // Calling with new version forwards the new version and refreshes cache
  const res3 = await loader(10);
  assert.equal(res3, 'data-v10');
  assert.deepEqual(versionsReceived, [1, 10]);

  // Subsequent call with new version returns cached v10
  const res4 = await loader(10);
  assert.equal(res4, 'data-v10');
  assert.deepEqual(versionsReceived, [1, 10]);
});

test('createTimedLoader provides single-flight deduplication during concurrent requests', async () => {
  let callCount = 0;
  const loader = createTimedLoader(async (version) => {
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return `value-${version}`;
  });

  // Launch 5 concurrent calls with version 10
  const results = await Promise.all([
    loader(10),
    loader(10),
    loader(10),
    loader(10),
    loader(10)
  ]);

  assert.equal(callCount, 1, 'Only one load call should have been made');
  assert.deepEqual(results, [
    'value-10',
    'value-10',
    'value-10',
    'value-10',
    'value-10'
  ]);
});

test('Catalogue cache end-to-end version invalidation', async () => {
  const store = createMemoryCacheStore();
  let firestoreReads = 0;
  let currentFirestoreVersion = 1;
  let firestoreMaterials = [
    { id: 'mat-1', title: 'Old Video 1', url: 'https://youtube.com/1' }
  ];

  const originFetcher = async () => {
    firestoreReads++;
    return [...firestoreMaterials];
  };

  const isItem = (val) => Boolean(val && typeof val.id === 'string');

  const cachedLoader = createTimedLoader((version) =>
    loadCachedCatalogue(store, 'materials', originFetcher, isItem, version || 1)
  );

  // Request 1: initial load at version 1
  const firstResult = await cachedLoader(currentFirestoreVersion);
  assert.equal(firstResult.length, 1);
  assert.equal(firstResult[0].title, 'Old Video 1');
  assert.equal(firestoreReads, 1);

  // Request 2: same version 1 -> served from memory without read
  const secondResult = await cachedLoader(currentFirestoreVersion);
  assert.equal(secondResult.length, 1);
  assert.equal(firestoreReads, 1);

  // Update in Firestore: version increments to 10 and new videos added
  currentFirestoreVersion = 10;
  firestoreMaterials = [
    { id: 'mat-1', title: 'Old Video 1', url: 'https://youtube.com/1' },
    { id: 'mat-2', title: 'New Practical Video 2', url: 'https://youtube.com/2' }
  ];

  // Request 3: request with version 10 -> cache invalidates and fetches new materials
  const thirdResult = await cachedLoader(currentFirestoreVersion);
  assert.equal(thirdResult.length, 2);
  assert.equal(thirdResult[1].title, 'New Practical Video 2');
  assert.equal(firestoreReads, 2);

  // Request 4: same version 10 -> served from cache
  const fourthResult = await cachedLoader(currentFirestoreVersion);
  assert.equal(fourthResult.length, 2);
  assert.equal(firestoreReads, 2);
});

test('getMaterialsVersionFromFirestore handles concurrent calls with single-flight promise', async () => {
  const { getMaterialsVersionFromFirestore, invalidateMaterialsVersionCache } = await import('../src/firebase/firestore.ts');
  invalidateMaterialsVersionCache();

  // Call 5 times concurrently
  const versions = await Promise.all([
    getMaterialsVersionFromFirestore(),
    getMaterialsVersionFromFirestore(),
    getMaterialsVersionFromFirestore(),
    getMaterialsVersionFromFirestore(),
    getMaterialsVersionFromFirestore()
  ]);

  assert.equal(versions.length, 5);
  for (const v of versions) {
    assert.equal(typeof v, 'number');
    assert.ok(v >= 1);
  }
});
