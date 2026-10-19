import test from 'node:test';
import assert from 'node:assert/strict';
import { attachLessonLinks, assignedLessons, isMaterialAssignedToLesson, materialLessonLinkId } from '../src/utils/materialLessonLinks.ts';
import { materialStudyPath, studyEntries } from '../src/utils/studyContent.ts';
import { materialConverter } from '../src/firebase/schema.ts';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const material = { id: 'shared', title: 'Respiratory notes', moduleId: 'resp', subject: 'Anatomy', year: 2,
  type: 'summary', tags: [], url: 'https://example.org/notes.pdf', lessonId: 'anatomy' };
const lesson = (id, subject, rest = {}) => ({ id, subject, moduleId: 'resp', title: id, order: 1, active: true, ...rest });
const anatomy = lesson('anatomy', 'Anatomy'), histology = lesson('histology', 'Histology');
const link = (lessonId, rest = {}) => ({ id: lessonId, materialId: material.id, moduleId: 'resp', lessonId, ...rest });

test('one original material serves multiple subjects and merges its legacy assignment once', () => {
  const [shared] = attachLessonLinks([material], [link('anatomy'), link('histology'), link('histology'), link('wrong', { moduleId: 'renal' })]);
  assert.equal(shared.id, material.id);
  assert.equal(shared.lessonLinks.length, 2);
  assert.deepEqual(assignedLessons(shared, [anatomy, histology]).map(item => item.id), ['anatomy', 'histology']);
  assert.equal(isMaterialAssignedToLesson(shared, histology), true);
  assert.equal(isMaterialAssignedToLesson(shared, { ...histology, moduleId: 'renal' }), false);
  assert.deepEqual(assignedLessons(shared, [{ ...histology, active: false }]), []);
  assert.equal(materialStudyPath(shared, [histology]), '/module/resp/histology/lesson/histology');
  assert.equal(materialConverter.toFirestore(shared).lessonLinks, undefined);
  const imported = { ...shared, contentSha256: 'hash', importSources: ['https://example.org/source'], importRunId: 'run' };
  const stored = materialConverter.toFirestore(imported);
  const restored = materialConverter.fromFirestore({ id: imported.id, data: () => stored });
  assert.deepEqual(restored.importSources, imported.importSources);
  assert.equal(restored.contentSha256, 'hash');
});

test('unrelated and stale edges do not expose resources in the wrong lesson', () => {
  const [shared] = attachLessonLinks([material], [link('histology', { materialId: 'different' })]);
  assert.equal(isMaterialAssignedToLesson(shared, histology), false);
  assert.equal(isMaterialAssignedToLesson({ ...shared, subject: 'Histology' }, anatomy), false);
  assert.equal(materialStudyPath({ ...shared, lessonId: undefined }, [histology]), '/viewer/shared');
  assert.notEqual(materialLessonLinkId('a~b', 'c'), materialLessonLinkId('a', 'b~c'));
  assert.equal(materialLessonLinkId('ملف', 'درس'), '%D9%85%D9%84%D9%81~%D8%AF%D8%B1%D8%B3');
});

test('ordered images and PDFs use the same stable material identity and document progress', () => {
  const entries = studyEntries([{ ...material, documents: [
    { id: 'page-1', title: 'Page one', url: 'https://example.org/first.jpg' },
    { id: 'page-2', title: 'Page two', url: 'https://example.org/second.png?version=1' },
    { id: 'pdf', title: 'PDF', url: material.url },
  ] }]);
  assert.deepEqual(entries.map(item => item.itemId), ['page-1', 'page-2', 'pdf']);
  assert.deepEqual(entries.map(item => item.embedType), ['image', 'image', 'iframe']);
  assert.ok(entries.every(item => item.materialId === material.id && item.tab === 'pdfs'));
});

async function assignmentHarness({ failBatch = 0, foreignLesson = false } = {}) {
  const state = { commits: [], invalidations: 0, attempts: 0 };
  const source = await readFile(new URL('../src/firebase/materialLessonLinks.ts', import.meta.url), 'utf8');
  const exports = {};
  const api = {
    collection: (_db, name) => ({ path: name }), doc: (_db, name, id) => ({ path: `${name}/${id}` }),
    query: ref => ref, where() {}, deleteField: () => 'DELETE', increment: value => ({ increment: value }),
    async getDocs() { return { docs: [], size: 0 }; },
    async getDoc(ref) { return { exists: () => true, data: () => ({ moduleId: foreignLesson && ref.path.startsWith('lessons/') ? 'renal' : 'resp' }) }; },
    writeBatch() {
      const operations = [];
      return {
        set: (ref, value) => operations.push(['set', ref.path, value]),
        update: (ref, value) => operations.push(['update', ref.path, value]),
        delete: ref => operations.push(['delete', ref.path]),
        async commit() {
          state.attempts++;
          if (state.attempts === failBatch) throw new Error('Disconnected');
          state.commits.push(operations);
        },
      };
    },
  };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, encodeURIComponent, Date, require: name => {
    if (name === 'firebase/firestore') return api;
    if (name === './firestore') return { getFirestoreDb: () => ({}), invalidateMaterialsVersionCache: () => state.invalidations++ };
    if (name === '../utils/materialLessonLinks') return { materialLessonLinkId };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return { ...state, state, assign: exports.assignMaterialToLessons };
}

test('large assignments stay within rule limits and preserve existing destinations on interruption', async () => {
  const ids = Array.from({ length: 24 }, (_, index) => `lesson-${index}`);
  const { state, assign } = await assignmentHarness();
  await assign('shared', ids);
  assert.deepEqual(state.commits.map(batch => batch.filter(write => write[1].startsWith('material_lesson_links/')).length), [8, 8, 8, 0]);
  assert.ok(state.commits.every(batch => batch.some(write => write[1] === 'materials_version/current')));
  assert.ok(state.commits.at(-1).some(write => write[0] === 'update' && write[1] === 'materials/shared'));
  const interrupted = await assignmentHarness({ failBatch: 2 });
  await assert.rejects(interrupted.assign('shared', ids), /refresh before retrying/);
  assert.equal(interrupted.state.commits.length, 1);
  assert.ok(!interrupted.state.commits[0].some(write => write[0] === 'update'));
  assert.equal(interrupted.state.invalidations, 1);
});

test('cross-module assignment fails before writing any links', async () => {
  const { state, assign } = await assignmentHarness({ foreignLesson: true });
  await assert.rejects(assign('shared', ['wrong-module']), /must belong/);
  assert.equal(state.commits.length, 0);
});
