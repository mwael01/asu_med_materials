import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonDoctors, doctorKey, lessonPath, lessonsForSubject, materialMatchesLesson, validateLesson } from '../src/utils/lessons.ts';
import { studyEntries, matchesDiscoveryType, materialStudyPath, legacyMaterialPath } from '../src/utils/studyContent.ts';
import { entryProgressStorage, parseProgress } from '../src/utils/studyProgress.ts';
import { materialConverter, submissionConverter } from '../src/firebase/schema.ts';
import { createDraft, serializeDraft } from '../src/utils/materialDrafts.ts';

const module = { id: 'test-module', title: 'Test module', code: 'TEST', year: 1, subjects: ['Anatomy'] };
const lesson = { id: 'test-lesson', title: 'Test lesson', moduleId: module.id, subject: 'Anatomy', order: 1, active: true };
const material = (data = {}) => ({ id: 'test-resource', title: 'Test resource', url: 'https://example.org/resource', type: 'website', year: 1,
  moduleId: module.id, subject: 'Anatomy', tags: [], ...data });

test('subject lesson ordering excludes other modules, subjects and inactive lessons', () => {
  const lessons = [lesson, { ...lesson, id: 'earlier', order: 0 }, { ...lesson, id: 'inactive', active: false },
    { ...lesson, id: 'other-module', moduleId: 'another' }, { ...lesson, id: 'other-subject', subject: 'Physiology' }];
  assert.deepEqual(lessonsForSubject(lessons, module.id, ' anatomy ').map(item => item.id), ['earlier', lesson.id]);
  assert.equal(materialMatchesLesson(material(), lesson), true);
  assert.equal(materialMatchesLesson(material({ moduleId: 'another' }), lesson), false);
  assert.equal(materialMatchesLesson(material({ subject: undefined }), lesson), false);
  assert.throws(() => validateLesson({ ...lesson, subject: 'Physiology' }, [module]));
  assert.throws(() => validateLesson({ ...lesson, title: ' ' }, [module]));
  assert.throws(() => validateLesson({ ...lesson, order: NaN }, [module]));
  assert.doesNotThrow(() => validateLesson(lesson, [module]));
});

test('doctor URLs remain stable across ordering, multiple authors, Arabic and punctuation', () => {
  const shared = material({ author: ['Dr. Test', 'د. اختبار'] });
  const groups = lessonDoctors([shared, material({ id: 'faculty', author: 'ASU Faculty' }), material({ id: 'general' })]);
  assert.equal(groups.length, 3);
  assert.equal(groups.find(group => group.name === 'Dr. Test').items[0].id, shared.id);
  assert.equal(groups.find(group => group.name === 'د. اختبار').key, doctorKey('د. اختبار'));
  assert.notEqual(doctorKey('Dr. A-B'), doctorKey('Dr. A B'));
  assert.notEqual(doctorKey('د. أحمد'), doctorKey('د. محمد'));
  assert.equal(doctorKey('Dr. Test'), doctorKey(' dr. test '));
  assert.ok(groups.some(group => group.key === 'department'));
});

test('mixed video and PDF bundles retain order and item identity, excluding drive folders from PDFs', () => {
  const mixed = material({ type: 'playlist', videos: [
    { id: 'video-b', title: 'Second', youtubeId: 'abcdefghijk' },
    { id: 'video-a', title: 'First', url: 'https://example.org/test.mp4' },
  ], documents: [{ id: 'doc', title: 'Notes', url: 'https://example.org/test.pdf' },
    { id: 'folder', title: 'Folder', url: 'https://drive.google.com/drive/folders/test' }] });
  const entries = studyEntries([mixed]);
  assert.deepEqual(entries.map(entry => entry.itemId), ['video-b', 'video-a', 'doc', 'folder']);
  assert.deepEqual(entries.map(entry => entry.tab), ['videos', 'videos', 'pdfs', 'links']);
  assert.equal(entries[0].embedType, 'iframe');
  assert.equal(entries[1].embedType, 'video');
  assert.equal(new Set(entries.map(entry => entry.key)).size, 4);
  assert.equal(matchesDiscoveryType(mixed, 'videos'), true);
  assert.equal(matchesDiscoveryType(mixed, 'pdfs'), true);
  assert.equal(matchesDiscoveryType(material({ url: 'https://drive.google.com/drive/folders/test' }), 'pdfs'), false);
  assert.equal(matchesDiscoveryType(material({ url: 'https://example.org/test.mp4' }), 'pdfs'), false);
  assert.equal(matchesDiscoveryType(material({ flashcardDeckId: 'test-deck' }), 'flashcards'), true);
  assert.equal(studyEntries([material({ type: 'flashcards' })]).length, 0);
});

test('playlist-only videos and unsupported external videos retain working fallback links', () => {
  const playlist = material({ type: 'playlist', playlistId: 'test-list' });
  assert.match(studyEntries([playlist])[0].embedUrl, /videoseries\?list=test-list/);
  const external = material({ type: 'playlist', videos: [{ id: 'x', title: 'External', url: 'https://t.me/test/123' }] });
  assert.equal(studyEntries([external])[0].embedType, 'none');
  assert.equal(studyEntries([material({ url: 'javascript:alert(1)' })]).length, 0);
});

test('discovery enters assigned doctor workspaces and preserves legacy paths for stale assignments', () => {
  const assigned = material({ lessonId: lesson.id, author: 'Dr. Test', type: 'playlist',
    videos: [{ id: 'v', title: 'Video', youtubeId: 'abcdefghijk' }], documents: [{ id: 'd', title: 'PDF', url: 'https://example.org/test.pdf' }] });
  const path = new URL(materialStudyPath(assigned, [lesson], 'pdfs'), 'https://example.org');
  assert.equal(path.pathname, `${lessonPath(lesson)}/doctor/${doctorKey('Dr. Test')}`);
  assert.equal(path.searchParams.get('item'), studyEntries([assigned])[1].key);
  assert.equal(materialStudyPath(assigned, [{ ...lesson, active: false }]), `/playlist/${assigned.id}`);
  assert.equal(materialStudyPath(assigned, [{ ...lesson, moduleId: 'wrong' }]), `/playlist/${assigned.id}`);
  assert.equal(materialStudyPath({ ...assigned, author: undefined }, [lesson]), lessonPath(lesson));
  assert.equal(legacyMaterialPath(material({ type: 'youtube', url: 'https://youtu.be/abcdefghijk' })), 'https://youtu.be/abcdefghijk');
  assert.equal(legacyMaterialPath(material({ type: 'flashcards', flashcardDeckId: 'deck' })), '/flashcards/deck');
});

test('item progress reuses original playlist keys without cross-material collisions', () => {
  const video = studyEntries([material({ type: 'playlist', videos: [{ id: 'original-video', title: 'Video', youtubeId: 'abcdefghijk' }] })])[0];
  assert.deepEqual(entryProgressStorage(video), { key: `asumed_playlist_${video.materialId}`, itemId: 'original-video' });
  const pdf = studyEntries([material({ url: 'https://example.org/test.pdf' })])[0];
  assert.equal(entryProgressStorage(pdf).key, `asumed_documents_${pdf.materialId}`);
  assert.deepEqual(parseProgress('{"original-video":true,"invalid":"yes"}'), { 'original-video': true });
  assert.deepEqual(parseProgress('broken'), {});
  assert.deepEqual(parseProgress('[]'), {});
});

test('lesson assignment and document bundles survive converters, drafts, and submissions', () => {
  const source = material({ lessonId: lesson.id, documents: [{ id: 'd', title: 'PDF', url: 'https://example.org/test.pdf' }] });
  const data = materialConverter.toFirestore(source);
  const restored = materialConverter.fromFirestore({ id: source.id, data: () => data });
  assert.equal(restored.lessonId, lesson.id);
  assert.deepEqual(restored.documents, source.documents);
  const draft = createDraft({ ...source, urls: [source.url], category: 'lectures' }, { contributor: 'Test' });
  assert.equal(serializeDraft(draft, [module]).lessonId, lesson.id);
  const submission = submissionConverter.fromFirestore({ id: 'sub', data: () => ({ lessonId: lesson.id }) });
  assert.equal(submission.lessonId, lesson.id);
});

test('unlessoned subjects and type-scoped subject filtering logic', () => {
  const multiSubjectModule = {
    id: 'blood-module',
    title: 'Blood Module',
    year: 2,
    subjects: ['Pathology', 'Physiology', 'Histology', 'Biochemistry']
  };

  const lessons = [
    { id: 'l1', title: 'RBCs', moduleId: 'blood-module', subject: 'Physiology', order: 1, active: true },
    { id: 'l2', title: 'Anemia', moduleId: 'blood-module', subject: 'Pathology', order: 1, active: true },
    { id: 'l3', title: 'Inactive Lesson', moduleId: 'blood-module', subject: 'Histology', order: 1, active: false }
  ];

  const materials = [
    { id: 'm1', title: 'RBC Video', type: 'youtube', url: 'https://youtu.be/test', moduleId: 'blood-module', subject: 'Physiology', lessonId: 'l1' },
    { id: 'm2', title: 'Anemia Notes', type: 'summary', url: 'https://example.org/anemia.pdf', moduleId: 'blood-module', subject: 'Pathology', lessonId: 'l2' }
  ];

  // 1. Unlessoned subjects filtering: only Pathology and Physiology have active lessons
  const activeSubjects = multiSubjectModule.subjects.filter(subject => {
    return lessonsForSubject(lessons, multiSubjectModule.id, subject).length > 0;
  });
  assert.deepEqual(activeSubjects, ['Pathology', 'Physiology']);
  assert.equal(activeSubjects.includes('Histology'), false); // inactive lesson only
  assert.equal(activeSubjects.includes('Biochemistry'), false); // zero lessons

  // 2. Type filtering: 'videos' matches only Physiology (has m1 which is a video)
  const videoSubjects = multiSubjectModule.subjects.filter(subject => {
    const sLessons = lessonsForSubject(lessons, multiSubjectModule.id, subject);
    if (sLessons.length === 0) return false;
    const lessonIds = new Set(sLessons.map(l => l.id));
    return materials.some(m => m.lessonId && lessonIds.has(m.lessonId) && matchesDiscoveryType(m, 'videos'));
  });
  assert.deepEqual(videoSubjects, ['Physiology']);

  // 3. Type filtering: 'pdfs' matches only Pathology (has m2 which is a pdf)
  const pdfSubjects = multiSubjectModule.subjects.filter(subject => {
    const sLessons = lessonsForSubject(lessons, multiSubjectModule.id, subject);
    if (sLessons.length === 0) return false;
    const lessonIds = new Set(sLessons.map(l => l.id));
    return materials.some(m => m.lessonId && lessonIds.has(m.lessonId) && matchesDiscoveryType(m, 'pdfs'));
  });
  assert.deepEqual(pdfSubjects, ['Pathology']);
});

