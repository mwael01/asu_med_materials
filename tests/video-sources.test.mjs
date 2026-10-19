import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDriveFileId,
  extractYouTubeId,
  extractVimeoId,
  isDirectVideoUrl,
  isTelegramUrl,
  parseVideoSource,
  determinePrimaryPlaylistSource,
  getVideoDownloadUrl
} from '../src/utils/videoSources.ts';

test('audio tracks use native playback or Telegram fallback with hosted downloads', () => {
  const url = `https://asumed.eduvour.com/materials/sha256/${'b'.repeat(64)}.m4a?v=${'b'.repeat(64)}`;
  assert.equal(parseVideoSource(url, undefined, 'direct', 'audio').embedType, 'audio');
  assert.equal(parseVideoSource('https://t.me/asumedmaterials/4', undefined, 'telegram', 'audio').embedType, 'none');
  assert.match(getVideoDownloadUrl(url), /^\/api\/material-download\?url=/);
  assert.equal(parseVideoSource('https://example.org/lecture.mp4').embedType, 'video');
  assert.equal(parseVideoSource('https://drive.google.com/file/d/audioFile123/view', undefined, 'drive', 'audio').embedType, 'iframe');
});

test('extractDriveFileId correctly extracts Google Drive file IDs', () => {
  assert.equal(
    extractDriveFileId('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'
  );
  assert.equal(
    extractDriveFileId('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview?usp=sharing'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'
  );
  assert.equal(
    extractDriveFileId('https://drive.google.com/open?id=1234567890abcdef'),
    '1234567890abcdef'
  );
  assert.equal(
    extractDriveFileId('https://drive.google.com/uc?id=987654321fedcba'),
    '987654321fedcba'
  );
  assert.equal(extractDriveFileId('https://example.com/not-a-drive-link'), null);
  assert.equal(extractDriveFileId(''), null);
  assert.equal(extractDriveFileId(undefined), null);
});

test('extractYouTubeId handles URLs and IDs', () => {
  assert.equal(extractYouTubeId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(
    extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=10'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(extractYouTubeId('https://not-youtube.com/v=12345'), null);
});

test('isDirectVideoUrl identifies playable direct video formats', () => {
  assert.equal(isDirectVideoUrl('https://example.com/lecture1.mp4'), true);
  assert.equal(isDirectVideoUrl('https://example.com/lecture1.WEBM'), true);
  assert.equal(isDirectVideoUrl('https://cdn.asu.edu/video.m4v?token=xyz'), true);
  assert.equal(isDirectVideoUrl('https://example.com/page.html'), false);
  assert.equal(isDirectVideoUrl('https://t.me/asu_med/123'), false);
  assert.equal(isDirectVideoUrl(''), false);
});

test('isTelegramUrl identifies Telegram channels and messages', () => {
  assert.equal(isTelegramUrl('https://t.me/asu_med_materials/105'), true);
  assert.equal(isTelegramUrl('https://telegram.me/lectures/42'), true);
  assert.equal(isTelegramUrl('tg://resolve?domain=channel'), true);
  assert.equal(isTelegramUrl('https://youtube.com/watch?v=123'), false);
});

test('parseVideoSource resolves Google Drive to preview iframe embed', () => {
  const result = parseVideoSource('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view');
  assert.equal(result.sourceType, 'drive');
  assert.equal(result.embedType, 'iframe');
  assert.equal(result.embedUrl, 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');
  assert.equal(result.externalUrl, 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view');
  assert.equal(result.icon, '/icons/google-drive.svg');
});

test('parseVideoSource resolves YouTube to embed iframe', () => {
  const result = parseVideoSource(undefined, 'dQw4w9WgXcQ');
  assert.equal(result.sourceType, 'youtube');
  assert.equal(result.embedType, 'iframe');
  assert.match(result.embedUrl, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.equal(result.externalUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(result.icon, '/icons/youtube.svg');
});

test('parseVideoSource resolves Direct video to HTML5 video', () => {
  const result = parseVideoSource('https://media.asumed.edu/lectures/part1.mp4');
  assert.equal(result.sourceType, 'direct');
  assert.equal(result.embedType, 'video');
  assert.equal(result.embedUrl, 'https://media.asumed.edu/lectures/part1.mp4');
  assert.equal(result.externalUrl, 'https://media.asumed.edu/lectures/part1.mp4');
});

test('parseVideoSource resolves Telegram to non-embeddable with external link', () => {
  const result = parseVideoSource('https://t.me/asu_med/456');
  assert.equal(result.sourceType, 'telegram');
  assert.equal(result.embedType, 'none');
  assert.equal(result.embedUrl, null);
  assert.equal(result.externalUrl, 'https://t.me/asu_med/456');
  assert.equal(result.icon, '/icons/telegram.svg');
});

test('parseVideoSource resolves generic external link to non-embeddable fallback', () => {
  const result = parseVideoSource('https://med-lectures-portal.org/video/99');
  assert.equal(result.sourceType, 'external');
  assert.equal(result.embedType, 'none');
  assert.equal(result.embedUrl, null);
  assert.equal(result.externalUrl, 'https://med-lectures-portal.org/video/99');
});

test('determinePrimaryPlaylistSource detects dominant source type', () => {
  // Mostly Drive
  const drivePlaylist = {
    id: 'pl-drive',
    title: 'Dr. Marco Drive Series',
    type: 'playlist',
    year: 2,
    url: 'https://drive.google.com/drive/folders/12345',
    tags: [],
    videos: [
      { id: 'v1', title: 'Part 1', url: 'https://drive.google.com/file/d/aaa/view' },
      { id: 'v2', title: 'Part 2', url: 'https://drive.google.com/file/d/bbb/view' },
      { id: 'v3', title: 'Part 3', youtubeId: 'dQw4w9WgXcQ' }
    ]
  };
  assert.equal(determinePrimaryPlaylistSource(drivePlaylist), 'drive');

  // Mostly Telegram
  const tgPlaylist = {
    id: 'pl-tg',
    title: 'Histology Telegram Series',
    type: 'playlist',
    year: 1,
    url: 'https://t.me/histo_channel',
    tags: [],
    videos: [
      { id: 'v1', title: 'Part 1', url: 'https://t.me/histo_channel/1' },
      { id: 'v2', title: 'Part 2', url: 'https://t.me/histo_channel/2' }
    ]
  };
  assert.equal(determinePrimaryPlaylistSource(tgPlaylist), 'telegram');
});

test('getVideoDownloadUrl extracts direct video and Google Drive download links without proxy', () => {
  // Direct video file
  assert.equal(
    getVideoDownloadUrl('https://example.com/videos/anatomy_lecture1.mp4'),
    'https://example.com/videos/anatomy_lecture1.mp4'
  );
  assert.equal(
    getVideoDownloadUrl('https://example.com/videos/pathology.webm?token=abc'),
    'https://example.com/videos/pathology.webm?token=abc'
  );

  // Google Drive video file
  assert.equal(
    getVideoDownloadUrl('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view'),
    'https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'
  );

  // YouTube / Telegram / External website (no direct download)
  assert.equal(getVideoDownloadUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(getVideoDownloadUrl('https://t.me/histo_channel/1'), null);
  assert.equal(getVideoDownloadUrl('https://drive.google.com/drive/folders/batchId'), null);
  assert.equal(getVideoDownloadUrl(undefined), null);
});

