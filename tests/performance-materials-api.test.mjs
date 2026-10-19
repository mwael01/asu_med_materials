import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoredBookmarkIds } from '../src/utils/storage.ts';
import { setMaterialBookmarked } from '../src/utils/bookmarks.ts';
import { getClientMaterials, getClientMaterialsByIds, getClientMaterialById } from '../src/utils/catalogueClient.ts';

test('Bookmark Toggle and Storage Idempotency without Counter Network Overhead', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  globalThis.window = {
    localStorage: globalThis.localStorage,
    dispatchEvent: () => true,
    CustomEvent: class CustomEvent {},
  };

  assert.deepEqual(getStoredBookmarkIds(), []);

  // 1. Add bookmark
  setMaterialBookmarked('mat-123', true);
  assert.deepEqual(getStoredBookmarkIds(), ['mat-123']);

  // 2. Idempotent re-add
  setMaterialBookmarked('mat-123', true);
  assert.deepEqual(getStoredBookmarkIds(), ['mat-123']);

  // 3. Add second bookmark
  setMaterialBookmarked('mat-456', true);
  assert.deepEqual(getStoredBookmarkIds(), ['mat-123', 'mat-456']);

  // 4. Remove bookmark
  setMaterialBookmarked('mat-123', false);
  assert.deepEqual(getStoredBookmarkIds(), ['mat-456']);

  // 5. Idempotent remove
  setMaterialBookmarked('mat-123', false);
  assert.deepEqual(getStoredBookmarkIds(), ['mat-456']);
});

test('Client Catalogue Memory and Snapshot Resolution', async () => {
  // Mock global window and cached materials
  const sample = [
    { id: 'm-1', title: 'Anatomy Lecture 1', year: 1, type: 'youtube', url: 'https://youtube.com/1' },
    { id: 'm-2', title: 'Physiology Notes', year: 2, type: 'summary', url: 'https://drive.com/2' }
  ];

  globalThis.window = {
    __CACHED_MATERIALS: sample,
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    }
  };

  const materials = await getClientMaterials();
  assert.equal(materials.length, 2);
  assert.equal(materials[0].id, 'm-1');

  const single = await getClientMaterialById('m-2');
  assert.ok(single);
  assert.equal(single.id, 'm-2');
  assert.equal(single.title, 'Physiology Notes');

  const multiple = await getClientMaterialsByIds(['m-1']);
  assert.equal(multiple.length, 1);
  assert.equal(multiple[0].id, 'm-1');

  const nonExistent = await getClientMaterialById('non-existent');
  assert.equal(nonExistent, null);
});

test('Client Catalogue does ZERO network requests when stored version matches page version', async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => [{ id: 'm-network', title: 'Network Material', url: 'https://youtube.com/net' }]
    };
  };

  const storedPayload = {
    timestamp: Date.now() - 1000 * 60 * 5, // 5 mins ago
    version: 18,
    materials: [{ id: 'm-stored', title: 'Stored Material v18', url: 'https://youtube.com/stored' }]
  };

  globalThis.document = {
    querySelector: (sel) => sel === 'meta[name="catalogue-version"]' ? { getAttribute: () => '18' } : null
  };

  globalThis.window = {
    localStorage: {
      getItem: (key) => key === 'asumed_catalogue_snapshot' ? JSON.stringify(storedPayload) : null,
      setItem: () => {}
    }
  };

  const materials = await getClientMaterials();
  assert.equal(materials.length, 1);
  assert.equal(materials[0].id, 'm-stored');
  assert.equal(fetchCount, 0, 'ZERO network requests should be made when snapshot version matches page meta version');
});

test('Client Catalogue triggers background revalidation when page meta version is newer than snapshot', async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => [{ id: 'm-v19', title: 'Updated Material v19', url: 'https://youtube.com/v19' }]
    };
  };

  const storedPayload = {
    timestamp: Date.now() - 1000 * 60 * 5,
    version: 18, // Old version in storage
    materials: [{ id: 'm-stored', title: 'Stored Material v18', url: 'https://youtube.com/stored' }]
  };

  // Server SSR page is at version 19
  globalThis.document = {
    querySelector: (sel) => sel === 'meta[name="catalogue-version"]' ? { getAttribute: () => '19' } : null
  };

  let savedStorage = null;
  globalThis.window = {
    localStorage: {
      getItem: (key) => key === 'asumed_catalogue_snapshot' ? JSON.stringify(storedPayload) : null,
      setItem: (key, val) => { savedStorage = JSON.parse(val); }
    }
  };

  // Returns cached v18 immediately for 0ms UI
  const materials = await getClientMaterials();
  assert.equal(materials[0].id, 'm-stored');

  // Background fetch was triggered
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fetchCount, 1, 'Should trigger exactly 1 background fetch when server has newer version');
  assert.ok(savedStorage);
  assert.equal(savedStorage.version, 19);
});
