import test from 'node:test';
import assert from 'node:assert/strict';
import { changeBookmarkCount, normalizeBookmarkCount } from '../src/utils/bookmarkCounts.ts';
import { getClientMaterials, getClientMaterialsByIds, getClientMaterialById } from '../src/utils/catalogueClient.ts';

test('Bookmark Counts Normalization and Optimistic Updates', async () => {
  assert.equal(normalizeBookmarkCount(-5), 0);
  assert.equal(normalizeBookmarkCount(NaN), 0);
  assert.equal(normalizeBookmarkCount(12.8), 12);

  const state = { displayed: 5, snapshot: 5, pending: 0 };
  let renderCount = 0;
  const mockRender = () => { renderCount++; };

  // 1. Successful increment
  let writeExecuted = false;
  await changeBookmarkCount(
    state,
    1,
    async () => { writeExecuted = true; },
    mockRender
  );
  assert.equal(writeExecuted, true);
  assert.equal(state.displayed, 6);
  assert.ok(renderCount >= 1);

  // 2. Failed decrement should rollback to previous
  let threwError = false;
  try {
    await changeBookmarkCount(
      state,
      -1,
      async () => { throw new Error('Firestore write simulated network failure'); },
      mockRender
    );
  } catch {
    threwError = true;
  }
  assert.equal(threwError, true);
  assert.equal(state.displayed, 6, 'Should rollback to 6 on failure');
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
