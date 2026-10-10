import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getRecentMaterialsForYear,
  groupRecentMaterialsByYear,
  ACADEMIC_YEARS
} from '../src/utils/recentMaterials.ts';

const mockMaterials = [
  { id: 'm1-old', title: 'Year 1 Old', year: 1, createdAt: '2026-01-01T10:00:00Z', url: '#', type: 'drive', tags: [] },
  { id: 'm1-new', title: 'Year 1 New', year: 1, createdAt: '2026-10-01T10:00:00Z', url: '#', type: 'drive', tags: [] },
  { id: 'm1-mid', title: 'Year 1 Mid', year: 1, createdAt: '2026-05-01T10:00:00Z', url: '#', type: 'drive', tags: [] },
  { id: 'm2-latest', title: 'Year 2 Latest', year: 2, createdAt: '2026-09-15T12:00:00Z', url: '#', type: 'drive', tags: [] },
  { id: 'm2-earlier', title: 'Year 2 Earlier', year: 2, createdAt: '2026-08-01T12:00:00Z', url: '#', type: 'drive', tags: [] },
  { id: 'm3-undated', title: 'Year 3 No Date', year: 3, url: '#', type: 'drive', tags: [] },
];

test('getRecentMaterialsForYear strictly isolates materials to the given student year', () => {
  const y1Recent = getRecentMaterialsForYear(mockMaterials, 1);
  assert.equal(y1Recent.length, 3);
  assert.equal(y1Recent[0].id, 'm1-new');
  assert.equal(y1Recent[1].id, 'm1-mid');
  assert.equal(y1Recent[2].id, 'm1-old');
  assert.ok(y1Recent.every((item) => item.year === 1), 'All items must belong to Year 1');

  const y2Recent = getRecentMaterialsForYear(mockMaterials, 2);
  assert.equal(y2Recent.length, 2);
  assert.equal(y2Recent[0].id, 'm2-latest');
  assert.equal(y2Recent[1].id, 'm2-earlier');
  assert.ok(y2Recent.every((item) => item.year === 2), 'All items must belong to Year 2');
});

test('getRecentMaterialsForYear excludes materials from other years even if they are more recent', () => {
  // m1-new is 2026-10-01, newer than m2-latest (2026-09-15).
  // Requesting Year 2 must NEVER include m1-new.
  const y2Recent = getRecentMaterialsForYear(mockMaterials, 2);
  const ids = y2Recent.map((item) => item.id);
  assert.ok(!ids.includes('m1-new'), 'Year 1 recent material must NOT appear in Year 2');
  assert.ok(!ids.includes('m1-mid'), 'Year 1 materials must NOT appear in Year 2');
});

test('getRecentMaterialsForYear respects the limit parameter', () => {
  const limited = getRecentMaterialsForYear(mockMaterials, 1, 2);
  assert.equal(limited.length, 2);
  assert.equal(limited[0].id, 'm1-new');
  assert.equal(limited[1].id, 'm1-mid');
});

test('getRecentMaterialsForYear handles undated materials gracefully', () => {
  const y3Recent = getRecentMaterialsForYear(mockMaterials, 3);
  assert.equal(y3Recent.length, 1);
  assert.equal(y3Recent[0].id, 'm3-undated');
});

test('getRecentMaterialsForYear returns empty array for year with no materials', () => {
  const y4Recent = getRecentMaterialsForYear(mockMaterials, 4);
  assert.deepEqual(y4Recent, []);
  const y5Recent = getRecentMaterialsForYear(mockMaterials, 5);
  assert.deepEqual(y5Recent, []);
});

test('groupRecentMaterialsByYear groups and partitions materials across all academic years correctly', () => {
  const grouped = groupRecentMaterialsByYear(mockMaterials);
  assert.equal(Object.keys(grouped).length, 5);
  assert.equal(grouped[1].length, 3);
  assert.equal(grouped[2].length, 2);
  assert.equal(grouped[3].length, 1);
  assert.equal(grouped[4].length, 0);
  assert.equal(grouped[5].length, 0);
  assert.deepEqual(ACADEMIC_YEARS, [1, 2, 3, 4, 5]);
});
