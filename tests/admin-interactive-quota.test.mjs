import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildExtractionPrompt,
  parseAIResponseJson,
  normalizeParsedItem,
} from '../src/utils/aiParser.ts';
import {
  createDraft,
  draftCredit,
  validateDraft,
  serializeDraft,
} from '../src/utils/materialDrafts.ts';
import {
  addUrlToVerificationCache,
  clearUrlVerificationCache,
  checkUrlsBatchInFirestore,
  checkUrlExistsInFirestore,
} from '../src/firebase/firestore.ts';
import { extractYouTubeId } from '../src/utils/videoSources.ts';


const testModules = [
  { id: 'bld-2', code: 'BLD', title: 'Blood & Lymph', titleAr: 'الدم والمناعة', year: 2, subjects: ['Pathology', 'Pharmacology'] },
  { id: 'cvs-2', code: 'CVS', title: 'Cardiovascular', titleAr: 'القلب والدوري', year: 2, subjects: ['Physiology', 'Anatomy'] },
  { id: 'cns-3', code: 'CNS', title: 'Central Nervous System', titleAr: 'الجهاز العصبي', year: 3, subjects: ['Anatomy', 'Pathology'] },
];

test('Firestore read quota: in-memory cache memoization protects read quota', async () => {
  clearUrlVerificationCache();

  const testUrl = 'https://drive.google.com/file/d/test-memo-quota-123/view';
  const fakeMaterial = {
    id: 'mat_test_1',
    title: 'تفريغ الدم د. شيرين',
    url: testUrl,
    year: 2,
    type: 'drive',
    category: 'summaries',
    createdAt: new Date().toISOString(),
  };

  // 1. Pre-seed cache (as when material is saved or previously inspected)
  addUrlToVerificationCache(fakeMaterial);

  // 2. Querying batch check must resolve from cache with 0 network calls
  const batchResult = await checkUrlsBatchInFirestore([testUrl], false);
  assert.equal(batchResult.has(testUrl), true);
  assert.equal(batchResult.get(testUrl)?.title, 'تفريغ الدم د. شيرين');

  // 3. Single URL check must also resolve from cache
  const singleResult = await checkUrlExistsInFirestore(testUrl);
  assert.equal(singleResult.exists, true);
  assert.equal(singleResult.existingMaterial?.id, 'mat_test_1');

  // 4. Clearing cache resets memory
  clearUrlVerificationCache();
});

test('AI Curriculum Intelligence: prompt embeds Egyptian doctor names, module codes, and categories', () => {
  const prompt = buildExtractionPrompt('مذكرات د. شيرين باثولوجي بلود https://example.com/1', testModules);

  // Doctors
  assert.ok(prompt.includes('د. حسام موافي') || prompt.includes('د. شيرين'));
  assert.ok(prompt.includes('د. وهدان'));
  assert.ok(prompt.includes('د. ماركو'));
  assert.ok(prompt.includes('د. ناجي'));
  assert.ok(prompt.includes('د. سامح غازي'));
  assert.ok(prompt.includes('د. عبد المتعال'));

  // Module codes and mappings
  assert.ok(prompt.includes('BLD') || prompt.includes('Blood'));
  assert.ok(prompt.includes('CNS'));
  assert.ok(prompt.includes('CVS'));

  // Category guidance
  assert.ok(prompt.includes('تفريغات') || prompt.includes('summaries'));
  assert.ok(prompt.includes('عملي') || prompt.includes('practical'));
  assert.ok(prompt.includes('امتحانات') || prompt.includes('exams'));
});

test('Multi-source playlist normalization: supports Drive, Telegram, and YouTube video items', () => {
  const playlistUrl = 'https://drive.google.com/drive/folders/folder-123';
  const rawItem = {
    url: playlistUrl,
    title: 'سلسلة باثولوجي بلود',
    titleEn: 'Blood Pathology Series',
    year: 2,
    moduleId: 'bld-2',
    subject: 'Pathology',
    category: 'lectures',
    type: 'playlist',
    videos: [
      {
        title: 'الجزء الأول',
        url: 'https://drive.google.com/file/d/vid-drive-1/preview',
      },
      {
        title: 'الجزء الثاني',
        url: 'https://t.me/asu_channel/456',
      },
      {
        title: 'الجزء الثالث يوتيوب',
        url: 'https://www.youtube.com/watch?v=11charYtIdX',
        youtubeId: '11charYtIdX',
      },
    ],
  };

  const evidence = `${playlistUrl}\nhttps://drive.google.com/file/d/vid-drive-1/preview\nhttps://t.me/asu_channel/456\nhttps://www.youtube.com/watch?v=11charYtIdX`;
  const normalized = normalizeParsedItem(rawItem, playlistUrl, testModules, evidence);

  assert.equal(normalized.type, 'playlist');
  assert.equal(normalized.videos?.length, 3);
  assert.equal(normalized.videos?.[0].title, 'الجزء الأول');
  assert.equal(normalized.videos?.[0].url, 'https://drive.google.com/file/d/vid-drive-1/preview');
  assert.equal(normalized.videos?.[1].title, 'الجزء الثاني');
  assert.equal(normalized.videos?.[1].url, 'https://t.me/asu_channel/456');
  assert.equal(normalized.videos?.[2].youtubeId, '11charYtIdX');

  // Verify validateDraft and serializeDraft accept this multi-source playlist
  const draft = createDraft(normalized, draftCredit(null));
  const validationIssues = validateDraft(draft, testModules);
  assert.equal(validationIssues.length, 0);

  const serialized = serializeDraft(draft, testModules);
  assert.equal(serialized.type, 'playlist');
  assert.equal(serialized.videos?.length, 3);
});

test('Playlist Grouping: combines individual video items into a cohesive playlist draft', () => {
  const adminProfile = { uid: 'admin_test_1', displayName: 'Doctor Admin', username: 'doc_admin', role: 'admin' };
  const ytVideo1 = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
  const ytVideo2 = 'https://www.youtube.com/watch?v=bbbbbbbbbbb';

  const draft1 = createDraft({
    title: 'مراجعة باثولوجي جزء 1',
    titleEn: 'Pathology Revision Part 1',
    url: ytVideo1,
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'bld-2',
    subject: 'Pathology',
    author: ['د. شيرين'],
  }, draftCredit(adminProfile));

  const draft2 = createDraft({
    title: 'مراجعة باثولوجي جزء 2',
    titleEn: 'Pathology Revision Part 2',
    url: ytVideo2,
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'bld-2',
    subject: 'Pathology',
    author: ['د. شيرين'],
  }, draftCredit(adminProfile));

  // Simulating the grouping action from directMaterialForm.ts
  const selected = [draft1, draft2];
  const videos = selected.map((d, index) => ({
    id: crypto.randomUUID(),
    title: d.title || `Video ${index + 1}`,
    url: d.url,
    youtubeId: extractYouTubeId(d.url) || undefined,
  }));

  assert.equal(videos.length, 2);
  assert.equal(videos[0].youtubeId, 'aaaaaaaaaaa');
  assert.equal(videos[1].youtubeId, 'bbbbbbbbbbb');

  const playlistTitle = 'باثولوجي الدم - د. شيرين - مراجعة شاملة';
  const groupedPlaylistDraft = createDraft({
    title: playlistTitle,
    titleEn: 'Blood Pathology - Dr. Shireen Revision',
    url: draft1.url,
    type: 'playlist',
    category: draft1.category,
    year: draft1.year,
    moduleId: draft1.moduleId,
    subject: draft1.subject,
    author: draft1.author,
    videos,
  }, draftCredit(adminProfile));

  assert.equal(groupedPlaylistDraft.type, 'playlist');
  assert.equal(groupedPlaylistDraft.videos?.length, 2);
  assert.equal(groupedPlaylistDraft.subject, 'Pathology');
  assert.deepEqual(groupedPlaylistDraft.author, ['د. شيرين']);

  const issues = validateDraft(groupedPlaylistDraft, testModules);
  assert.equal(issues.length, 0);

  const serialized = serializeDraft(groupedPlaylistDraft, testModules);
  assert.equal(serialized.type, 'playlist');
  assert.equal(serialized.videos?.length, 2);
});
