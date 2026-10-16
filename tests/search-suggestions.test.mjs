import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSearchSuggestions,
  prefetchSearchIndex,
  getOrBuildSearchIndex
} from '../src/utils/searchSuggestions.ts';

// Mock client materials in window.__CACHED_MATERIALS for testing
const mockMaterials = [
  {
    id: 'playlist-wahdan-patho',
    title: 'Pathology General Lectures - Dr. Wahdan',
    titleEn: 'General Pathology Lectures Dr. Wahdan',
    author: 'Dr. Wahdan',
    subject: 'Pathology',
    type: 'playlist',
    year: 2,
    url: 'https://youtube.com/playlist?list=PL123',
    playlistId: 'PL123',
    videos: [
      { id: 'v1', title: 'Cell Injury Part 1', youtubeId: 'abc1' },
      { id: 'v2', title: 'Cell Injury Part 2', youtubeId: 'abc2' }
    ]
  },
  {
    id: 'video-nagi-cardio',
    title: 'Physiology Cardiac Cycle Dr. Nagi',
    titleEn: 'Cardiac Cycle Physiology Dr Nagi',
    author: 'Dr. Nagi',
    subject: 'Physiology',
    type: 'youtube',
    year: 1,
    url: 'https://youtube.com/watch?v=xyz987'
  },
  {
    id: 'summary-wahdan-notes',
    title: 'Pathology Handwritten Summary Notes',
    titleEn: 'Pathology Revision Sheet',
    author: 'Dr. Wahdan',
    subject: 'Pathology',
    type: 'summary',
    year: 2,
    url: 'https://drive.google.com/file/d/summary1'
  },
  {
    id: 'drive-anatomy-batch',
    title: 'Anatomy Batch Drive Upper Limb',
    titleEn: 'Upper Limb Anatomy Drive',
    author: 'Batch Committee',
    subject: 'Anatomy',
    type: 'drive',
    year: 1,
    url: 'https://drive.google.com/drive/folders/batch1'
  }
];

// Provide mock environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    __CACHED_MATERIALS: mockMaterials
  };
} else {
  globalThis.window.__CACHED_MATERIALS = mockMaterials;
}

test('getSearchSuggestions returns empty results for blank or empty query', async () => {
  const emptyRes = await getSearchSuggestions('');
  assert.equal(emptyRes.query, '');
  assert.equal(emptyRes.totalMatches, 0);
  assert.equal(emptyRes.videosAndPlaylists.length, 0);
  assert.equal(emptyRes.otherMaterials.length, 0);

  const spacesRes = await getSearchSuggestions('    ');
  assert.equal(spacesRes.totalMatches, 0);
});

test('getSearchSuggestions correctly categorizes playlists and videos vs materials', async () => {
  // Query matching Dr. Wahdan: 1 playlist and 1 summary document
  const res = await getSearchSuggestions('wahdan');
  assert.ok(res.totalMatches >= 2, `Expected >= 2 matches, got ${res.totalMatches}`);

  // Videos and playlists group should contain the playlist
  assert.ok(res.videosAndPlaylists.length >= 1);
  const playlistItem = res.videosAndPlaylists.find((i) => i.id === 'playlist-wahdan-patho');
  assert.ok(playlistItem, 'Expected playlist-wahdan-patho in videosAndPlaylists');
  assert.equal(playlistItem.isPlaylist, true);
  assert.equal(playlistItem.videoCount, 2);
  assert.equal(playlistItem.url, '/playlist/playlist-wahdan-patho');
  assert.equal(playlistItem.target, '_self');

  // Other materials group should contain the summary sheet
  assert.ok(res.otherMaterials.length >= 1);
  const summaryItem = res.otherMaterials.find((i) => i.id === 'summary-wahdan-notes');
  assert.ok(summaryItem, 'Expected summary-wahdan-notes in otherMaterials');
  assert.equal(summaryItem.isPlaylist, false);
  assert.equal(summaryItem.url, 'https://drive.google.com/file/d/summary1');
  assert.equal(summaryItem.target, '_blank');
});

test('getSearchSuggestions supports Arabic doctor aliases and slang', async () => {
  // Arabic query "وهدان" matches "Dr. Wahdan"
  const res = await getSearchSuggestions('وهدان');
  assert.ok(res.totalMatches >= 2);
  const hasPlaylist = res.videosAndPlaylists.some((i) => i.id === 'playlist-wahdan-patho');
  assert.ok(hasPlaylist, 'Expected wahdan playlist to match Arabic query');

  // Arabic query "ناجي" matches "Dr. Nagi"
  const resNagi = await getSearchSuggestions('ناجي');
  assert.ok(resNagi.totalMatches >= 1);
  assert.equal(resNagi.videosAndPlaylists[0].id, 'video-nagi-cardio');
  assert.equal(resNagi.videosAndPlaylists[0].type, 'youtube');
  assert.equal(resNagi.videosAndPlaylists[0].url, 'https://youtube.com/watch?v=xyz987');
  assert.equal(resNagi.videosAndPlaylists[0].target, '_blank');
});

test('getSearchSuggestions caps results per group based on maxPerGroup', async () => {
  const res = await getSearchSuggestions('pathology', 1);
  assert.ok(res.videosAndPlaylists.length <= 1);
  assert.ok(res.otherMaterials.length <= 1);
  assert.ok(res.totalMatches >= 2, 'Total matches should reflect total before capping');
});

test('getOrBuildSearchIndex and prefetchSearchIndex reuse cached in-memory structures', async () => {
  prefetchSearchIndex();
  const index1 = await getOrBuildSearchIndex();
  assert.ok(index1.docs.length >= 4);

  const index2 = await getOrBuildSearchIndex();
  assert.strictEqual(index1.docs, index2.docs, 'Should return the identical cached array reference');
});
