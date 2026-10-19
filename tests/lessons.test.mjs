import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonDoctors, doctorKey, lessonPath, lessonsForSubject, materialMatchesLesson, validateLesson } from '../src/utils/lessons.ts';
import { studyEntries, matchesDiscoveryType, materialStudyPath, legacyMaterialPath, isFlashcards, isMcqMaterial, isPdfMaterial, isVideoMaterial } from '../src/utils/studyContent.ts';
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

test('shared lesson names across multiple subjects maintain isolated material assignments', () => {
  const respModule = {
    id: 'year2-respiratory',
    title: 'Respiratory Module',
    code: 'MED202',
    year: 2,
    subjects: ['Anatomy', 'Histology']
  };

  const anatNoseLesson = {
    id: 'year2-resp-anat-nose-paranasal-sinuses',
    title: 'Nose and Paranasal sinuses',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    order: 1,
    active: true
  };

  const histoNoseLesson = {
    id: 'year2-resp-histo-nose-paranasal-sinuses',
    title: 'Nose and Paranasal sinuses',
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    order: 1,
    active: true
  };

  const allLessons = [anatNoseLesson, histoNoseLesson];

  // Each subject query resolves its own lesson
  const anatLessons = lessonsForSubject(allLessons, 'year2-respiratory', 'Anatomy');
  const histoLessons = lessonsForSubject(allLessons, 'year2-respiratory', 'Histology');
  assert.equal(anatLessons.length, 1);
  assert.equal(anatLessons[0].id, anatNoseLesson.id);
  assert.equal(anatLessons[0].title, 'Nose and Paranasal sinuses');

  assert.equal(histoLessons.length, 1);
  assert.equal(histoLessons[0].id, histoNoseLesson.id);
  assert.equal(histoLessons[0].title, 'Nose and Paranasal sinuses');

  // Materials assigned to Anatomy cannot bleed into Histology
  const anatMaterial = {
    id: 'anat-mat-1',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: anatNoseLesson.id
  };

  assert.equal(materialMatchesLesson(anatMaterial, anatNoseLesson), true);
  assert.equal(materialMatchesLesson(anatMaterial, histoNoseLesson), false);

  const histoMaterial = {
    id: 'histo-mat-1',
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    lessonId: histoNoseLesson.id
  };

  assert.equal(materialMatchesLesson(histoMaterial, histoNoseLesson), true);
  assert.equal(materialMatchesLesson(histoMaterial, anatNoseLesson), false);
});

test('lesson material partitioning divides Doctors, PDFs, Flashcards, and MCQs into separate sections and hides empty ones', () => {
  const lectureVideo = material({
    id: 'mat-lec-1',
    title: 'Nose Anatomy Lecture 1',
    url: 'https://youtu.be/test1234',
    type: 'youtube',
    category: 'lectures',
    author: 'Dr. Ashraf Ramzy'
  });

  const pdfSummary = material({
    id: 'mat-pdf-1',
    title: 'Anatomy Respiratory Notes',
    url: 'https://drive.google.com/file/d/testfile/view',
    type: 'drive',
    category: 'summaries',
    author: 'Dr. Youssef Shoukry'
  });

  const flashcardDeck = material({
    id: 'flashcards-deck-1',
    title: 'Unit 1::Ch1::Anatomy',
    url: '/flashcards/deck-1',
    type: 'flashcards',
    category: 'flashcards',
    flashcardDeckId: 'deck-1'
  });

  const mcqBank = material({
    id: 'mat-mcq-1',
    title: 'Anatomy MCQs & Question Bank (أسئلة وبنك)',
    url: 'https://drive.google.com/file/d/mcqfile/view',
    type: 'drive',
    category: 'exams',
    tags: ['anatomy', 'mcq', 'أسئلة']
  });

  // Verify classifier functions
  assert.equal(isFlashcards(flashcardDeck), true);
  assert.equal(isFlashcards(lectureVideo), false);
  assert.equal(isFlashcards(mcqBank), false);

  assert.equal(isMcqMaterial(mcqBank), true);
  assert.equal(isMcqMaterial(flashcardDeck), false);
  assert.equal(isMcqMaterial(pdfSummary), false);
  assert.equal(isMcqMaterial(lectureVideo), false);

  assert.equal(isPdfMaterial(pdfSummary), true);
  assert.equal(isPdfMaterial(lectureVideo), false);
  assert.equal(isPdfMaterial(flashcardDeck), false);
  assert.equal(isPdfMaterial(mcqBank), false);

  // Full lesson with all 4 categories present
  const allMaterials = [lectureVideo, pdfSummary, flashcardDeck, mcqBank];

  const lectureMaterials = allMaterials.filter(m => !isFlashcards(m) && !isMcqMaterial(m) && (isVideoMaterial(m) || m.category === 'lectures'));
  const doctors = lessonDoctors(lectureMaterials);
  const pdfs = allMaterials.filter(isPdfMaterial);
  const flashcards = allMaterials.filter(isFlashcards);
  const mcqs = allMaterials.filter(isMcqMaterial);

  assert.equal(doctors.length, 1);
  assert.equal(doctors[0].name, 'Dr. Ashraf Ramzy');
  assert.equal(pdfs.length, 1);
  assert.equal(pdfs[0].id, 'mat-pdf-1');
  assert.equal(flashcards.length, 1);
  assert.equal(flashcards[0].id, 'flashcards-deck-1');
  assert.equal(mcqs.length, 1);
  assert.equal(mcqs[0].id, 'mat-mcq-1');

  // Verify flashcards never leak into doctors
  assert.ok(!doctors.some(d => d.items.some(item => isFlashcards(item))));

  // Partial lesson missing MCQs and Doctors
  const partialMaterials = [pdfSummary, flashcardDeck];
  const partialLectures = partialMaterials.filter(m => !isFlashcards(m) && !isMcqMaterial(m) && (isVideoMaterial(m) || m.category === 'lectures'));
  const partialDoctors = lessonDoctors(partialLectures);
  const partialPdfs = partialMaterials.filter(isPdfMaterial);
  const partialFlashcards = partialMaterials.filter(isFlashcards);
  const partialMcqs = partialMaterials.filter(isMcqMaterial);

  assert.equal(partialDoctors.length, 0, 'Doctors section must be empty (hidden)');
  assert.equal(partialPdfs.length, 1, 'PDFs section must have 1 item');
  assert.equal(partialFlashcards.length, 1, 'Flashcards section must have 1 item');
  assert.equal(partialMcqs.length, 0, 'MCQs section must be empty (hidden)');
});


