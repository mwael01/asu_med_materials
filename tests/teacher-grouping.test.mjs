import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMaterialsByTeacher } from '../src/utils/teacherGrouping.ts';

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
