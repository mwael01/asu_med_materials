import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMaterialsByTeacher, isDepartmentMaterial } from '../src/utils/teacherGrouping.ts';
import { teacherIdentity } from '../src/utils/teacherIdentity.ts';

test('teacher formatting variants share a deterministic group without duplicating joint credits', () => {
  const materials = [
    { id: 'a', title: 'Lecture', author: 'Dr. Mohamed Elshorbagy', type: 'youtube', year: 2 },
    { id: 'b', title: 'Notes', author: 'Mohamed El-Shorbagy', type: 'summary', year: 2 },
    { id: 'c', title: 'Revision', author: ['Dr. Mohamed El Shorbagy', 'Dr. Mohamed Elshorbagy'], type: 'playlist', year: 2 },
    { id: 'd', title: 'Other doctor', author: 'Dr. Ahmed Elshorbagy', type: 'summary', year: 2 },
  ];
  const groups = groupMaterialsByTeacher(materials);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].items.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(groups[0].count, 3);
  assert.deepEqual(groupMaterialsByTeacher([...materials].reverse()).map(g => [g.id, g.name, g.count]),
    groups.map(g => [g.id, g.name, g.count]));
  assert.notEqual(teacherIdentity('Dr. Mohamed Elshorbagy'), teacherIdentity('Dr. Ahmed Elshorbagy'));
  assert.notEqual(teacherIdentity('Dr. A-B'), teacherIdentity('Dr. A B'));
});

test('reviewed aliases merge new imports while ambiguous or stale aliases cannot merge different doctors', () => {
  const base = { title: 'Lecture', type: 'youtube', year: 2, url: 'https://example.org/lecture', tags: [] };
  const canonical = { ...base, id: 'canonical', author: 'Dr. Mohamed El-Shorbagy',
    authorAliases: { 'Dr. Elshorbagy': 'Dr. Mohamed El-Shorbagy' } };
  const imported = { ...base, id: 'imported', author: 'Dr. Elshorbagy' };
  assert.equal(groupMaterialsByTeacher([canonical, imported]).length, 1);
  assert.equal(groupMaterialsByTeacher([canonical, imported])[0].count, 2);
  const ambiguous = { ...base, id: 'different', author: 'Dr. Ahmed El-Shorbagy',
    authorAliases: { 'Dr. Elshorbagy': 'Dr. Ahmed El-Shorbagy' } };
  assert.equal(groupMaterialsByTeacher([canonical, imported, ambiguous]).length, 3);
  const stale = { ...canonical, author: 'Dr. Corrected Attribution' };
  assert.equal(groupMaterialsByTeacher([stale, imported]).length, 2);
});

test('official Moodle and ASU2Learn sources exclusively use the department folder', () => {
  const base = { title: 'Lecture', url: 'https://example.org/lecture', type: 'website', year: 2, tags: [], author: 'Dr. Example' };
  const materials = [
    { ...base, id: 'asu2learn-series' },
    { ...base, id: 'lecture', title: 'Lecture — ASU2Learn', author: undefined },
    { ...base, id: 'resp-moodle-lecture' },
    { ...base, id: 'mirrored', importSources: ['https://asu2learn.asu.edu.eg/medicine/mod/url/view.php?id=123'] },
    { ...base, id: 'tagged', tags: ['Moodle'] },
    { ...base, id: 'staff-joint', author: ['Dr. Example', 'ASU Faculty Staff'] },
    { ...base, id: 'imported', importRunId: 'asu2learn-respiratory' },
    { ...base, id: 'nested', documents: [{ id: 'file', url: 'https://moodle.asu.edu.eg/mod/resource/view.php?id=1' }] },
    { ...base, id: 'independent' },
    { ...base, id: 'untrusted', url: 'https://asu2learn.asu.edu.eg.evil.test/lecture' },
  ];
  const groups = groupMaterialsByTeacher(materials);
  assert.deepEqual(groups.find(group => group.isDepartment).items.map(item => item.id), materials.slice(0, 8).map(item => item.id));
  assert.deepEqual(groups.find(group => group.name === 'Dr. Example').items.map(item => item.id), ['independent', 'untrusted']);
  assert.equal(groups.some(group => group.isGeneral), false);
  assert.equal(isDepartmentMaterial(materials[9]), false);
});

test('groupMaterialsByTeacher groups materials by named doctor descending by count', () => {
  const materials = [
    { id: '1', title: 'Pathology Lecture 1', author: 'Dr. Shereen', type: 'youtube', year: 2 },
    { id: '2', title: 'Pathology Lecture 2', author: 'Dr. Shereen', type: 'youtube', year: 2 },
    { id: '3', title: 'Pathology Summary', author: 'Dr. Shereen', type: 'summary', year: 2 },
    { id: '4', title: 'Anatomy Upper Limb', author: 'Dr. Wahdan', type: 'youtube', year: 2 },
    { id: '5', title: 'Anatomy Thorax', author: 'Dr. Wahdan', type: 'youtube', year: 2 },
    { id: '6', title: 'Histology Cells', author: 'Dr. Marco', type: 'summary', year: 2 },
  ];

  const groups = groupMaterialsByTeacher(materials);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].name, 'Dr. Shereen');
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].items.length, 3);
  assert.equal(groups[1].name, 'Dr. Wahdan');
  assert.equal(groups[1].count, 2);
  assert.equal(groups[2].name, 'Dr. Marco');
  assert.equal(groups[2].count, 1);
});

test('groupMaterialsByTeacher classifies Department and General materials accurately', () => {
  const materials = [
    { id: '1', title: 'Dr. Shereen Blood', author: 'Dr. Shereen', type: 'youtube', year: 2 },
    { id: '2', title: 'Official Lecture Slides', author: 'ASU Med Faculty', type: 'drive', year: 2 },
    { id: '3', title: 'Moodle Exam Questions', author: 'ASU Moodle', type: 'exam', year: 2 },
    { id: '4', title: 'Past Exams Batch Recalls', type: 'exam', year: 2 }, // no author
    { id: '5', title: 'Student Flashcards Deck', author: 'MG ASU MED', type: 'flashcards', year: 2 },
  ];

  const groups = groupMaterialsByTeacher(materials);

  const doctorGroup = groups.find((g) => g.name === 'Dr. Shereen');
  assert.ok(doctorGroup);
  assert.equal(doctorGroup.items.length, 1);

  const deptGroup = groups.find((g) => g.isDepartment);
  assert.ok(deptGroup);
  assert.equal(deptGroup.name, 'Faculty & Department Staff');
  assert.equal(deptGroup.items.length, 2);

  const generalGroup = groups.find((g) => g.isGeneral);
  assert.ok(generalGroup);
  assert.equal(generalGroup.name, 'General & Batch Summaries');
  assert.equal(generalGroup.items.length, 2);
});

test('groupMaterialsByTeacher handles multiple authors array without duplicates', () => {
  const materials = [
    {
      id: 'shared-1',
      title: 'Joint Anatomy Series',
      author: ['Dr. Ahmed Farid', 'Dr. Ayman Khanfour'],
      type: 'playlist',
      year: 2
    },
    {
      id: 'farid-only',
      title: 'Farid Solo',
      author: 'Dr. Ahmed Farid',
      type: 'summary',
      year: 2
    }
  ];

  const groups = groupMaterialsByTeacher(materials);

  const farid = groups.find((g) => g.name === 'Dr. Ahmed Farid');
  assert.ok(farid);
  assert.equal(farid.items.length, 2);

  const khanfour = groups.find((g) => g.name === 'Dr. Ayman Khanfour');
  assert.ok(khanfour);
  assert.equal(khanfour.items.length, 1);
});

test('groupMaterialsByTeacher returns empty array on empty input', () => {
  assert.deepEqual(groupMaterialsByTeacher([]), []);
});

test('official college staff mirrors and Arabic Moodle titles retain department ownership', () => {
  for (const title of ['Microbiology revision (College Staff Stream)', 'محاضرات مودل الكلية']) {
    const groups = groupMaterialsByTeacher([{ id: 'college-source', title, author: 'Dr. Named Speaker', url: 'https://example.org/video', type: 'website', year: 2 }]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].isDepartment, true);
  }
});

test('faculty-account Stream recordings stay with staff while other SharePoint hosts remain independent', () => {
  const material = { id: 'recording', title: 'Revision', author: 'Dr. Named Speaker', type: 'website', year: 1, tags: [] };
  const path = '/:v:/g/personal/example_med_asu_edu_eg/recording';
  assert.equal(isDepartmentMaterial({ ...material, url: 'https://medasuedu-my.sharepoint.com' + path }), true);
  assert.equal(isDepartmentMaterial({ ...material, url: 'https://another.sharepoint.com' + path }), false);
  assert.equal(isDepartmentMaterial({ ...material, url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/example_student/recording' }), false);
});
