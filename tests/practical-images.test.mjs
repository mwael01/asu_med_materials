import test from 'node:test';
import assert from 'node:assert/strict';
import { practicalFolderImages, practicalImagePath, parseImageFolders } from '../src/utils/practicalImages.ts';
import { lessonConverter } from '../src/firebase/lessons.ts';
import { matchesDiscoveryType } from '../src/utils/studyContent.ts';
import { materialConverter } from '../src/firebase/schema.ts';
const lesson = { id: 'practical', title: 'Practical Revision', moduleId: 'resp', subject: 'Histology', active: true, order: 90, revisionType: 'practical',
  practicalImageFolders: [{ id: 'real-lab', title: 'Real Lab Slides' }, { id: 'computer-lab', title: 'Computer Lab Slides' }] };
const material = (id, docs) => ({ id, title: id, type: 'other', category: 'practical', year: 2, tags: [], moduleId: 'resp', subject: 'Histology', lessonId: 'practical', url: docs[0].url, documents: docs });
const image = (id, folder) => ({ id, title: id, url: `https://example.org/${id}.jpg`, practicalImageFolderId: folder });

test('folders are configured per lesson and flatten source bundles and unanswered questions', () => {
  const lab = material('lab', [image('real', 'real-lab'), image('tem', 'computer-lab')]);
  const question = material('question', [image('question', 'computer-lab')]);
  assert.deepEqual(practicalFolderImages([lab, question], lesson, 'computer-lab').map(item => item.id), ['tem', 'question']);
  assert.deepEqual(practicalFolderImages([lab, question], lesson, 'real-lab').map(item => item.id), ['real']);
  assert.equal(matchesDiscoveryType(lab, 'pdfs'), false);
  assert.deepEqual(practicalFolderImages([lab], { ...lesson, moduleId: 'another' }, 'computer-lab'), []);
  assert.deepEqual(practicalFolderImages([lab], lesson, 'unconfigured'), []);
  const pathology = { ...lesson, subject: 'Pathology', practicalImageFolders: [{ id: 'jars', title: 'Jars' }] };
  assert.deepEqual(practicalFolderImages([lab], pathology, 'computer-lab'), []);
});

test('legacy material bookmarks redirect to the selected image in the flat folder', () => {
  const source = material('mixed', [image('lab', 'real-lab'), image('tem', 'computer-lab')]);
  const path = new URL(practicalImagePath(source, [lesson], 'tem'), 'https://example.org');
  assert.equal(path.pathname, '/module/resp/histology/lesson/practical/images/computer-lab');
  assert.equal(path.searchParams.get('image'), JSON.stringify(['mixed', 'tem']));
  assert.equal(practicalImagePath(source, [{ ...lesson, active: false }]), null);
});

test('dynamic configuration, thumbnails and document assignments survive Firestore conversion', () => {
  assert.deepEqual(parseImageFolders('jars: Jars\ncustom-stations: Practical Stations'), [{ id: 'jars', title: 'Jars' }, { id: 'custom-stations', title: 'Practical Stations' }]);
  assert.throws(() => parseImageFolders('jars: Jars\njars: Duplicate'));
  assert.throws(() => parseImageFolders('../nested: Invalid'));
  const converted = lessonConverter.fromFirestore({ id: lesson.id, data: () => lessonConverter.toFirestore(lesson) });
  assert.deepEqual(converted.practicalImageFolders, lesson.practicalImageFolders);
  const source = material('images', [{ ...image('a', 'real-lab'), thumbnailUrl: 'https://example.org/thumb.jpg' }]);
  assert.deepEqual(materialConverter.fromFirestore({ id: source.id, data: () => materialConverter.toFirestore(source) }).documents, source.documents);
});
