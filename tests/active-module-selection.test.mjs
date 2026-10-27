import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveActiveModule, resolveYearDestination, getYearModules } from '../src/utils/moduleHelpers.ts';

const mockModules = [
  // Year 1 Modules
  {
    id: 'year1-introduction',
    title: 'Introduction Module',
    year: 1,
    active: true,
    order: 1,
    subjects: ['Anatomy']
  },
  {
    id: 'year1-ict',
    title: 'ICT Module',
    year: 1,
    active: false,
    order: 2,
    subjects: ['ICT']
  },
  {
    id: 'year1-general-pharmacology',
    title: 'General Pharmacology',
    year: 1,
    active: false,
    order: 3,
    subjects: ['Pharmacology']
  },
  {
    id: 'year1-reference-books',
    title: 'Reference Books',
    year: 1,
    subjects: ['Anatomy']
  },

  // Year 2 Modules
  {
    id: 'year2-respiratory',
    title: 'Respiratory Module',
    year: 2,
    active: true,
    order: 1,
    subjects: ['Anatomy', 'Physiology']
  },
  {
    id: 'year2-blood',
    title: 'Blood & Lymphatic System',
    year: 2,
    active: false,
    order: 2,
    subjects: ['Pathology']
  },
  {
    id: 'year2-reference-books',
    title: 'Reference Books',
    year: 2,
    subjects: ['Anatomy']
  },

  // Year 3 Modules (no explicitly active module, only ordered modules)
  {
    id: 'year3-cns',
    title: 'Central Nervous System',
    year: 3,
    active: false,
    order: 1,
    subjects: ['Neuroanatomy']
  },
  {
    id: 'year3-special-senses',
    title: 'Special Senses',
    year: 3,
    active: false,
    order: 2,
    subjects: ['ENT']
  },

  // Year 5 (only reference books)
  {
    id: 'year5-reference-books',
    title: 'Reference Books',
    year: 5,
    subjects: ['Surgery']
  }
];

test('resolveActiveModule returns the module with active: true for the student year', () => {
  // Year 2: Respiratory (active: true) vs Blood (active: false)
  const activeYear2 = resolveActiveModule(mockModules, 2);
  assert.ok(activeYear2);
  assert.equal(activeYear2.id, 'year2-respiratory');
  assert.equal(activeYear2.title, 'Respiratory Module');

  // Year 1: Introduction (active: true)
  const activeYear1 = resolveActiveModule(mockModules, 1);
  assert.ok(activeYear1);
  assert.equal(activeYear1.id, 'year1-introduction');
});

test('resolveActiveModule returns null when no module is explicitly active', () => {
  assert.equal(resolveActiveModule(mockModules, 3), null);
  assert.equal(resolveActiveModule([{ ...mockModules[0], active: undefined }], 1), null);
});

test('year destinations never fall back to another year or to a reference module', () => {
  assert.equal(resolveYearDestination(mockModules, 1), '/module/year1-introduction');
  assert.equal(resolveYearDestination(mockModules, 2), '/module/year2-respiratory');
  for (const year of [3, 4, 5]) assert.equal(resolveYearDestination(mockModules, year), `/year/${year}`);
  assert.equal(resolveYearDestination([{ ...mockModules.at(-1), active: true }], 5), '/year/5');
});

test('year module menu includes inactive Blood, excludes other years, and preserves curriculum order', () => {
  const modules = [...mockModules].reverse();
  const original = [...modules];
  assert.deepEqual(getYearModules(modules, 2).map(module => module.id), [
    'year2-respiratory', 'year2-blood', 'year2-reference-books',
  ]);
  assert.deepEqual(modules, original);
  assert.deepEqual(getYearModules(modules, 4), []);
});

test('resolveActiveModule filters out reference books and returns null for years without curriculum modules', () => {
  // Year 5 only has reference books
  const activeYear5 = resolveActiveModule(mockModules, 5);
  assert.equal(activeYear5, null);

  // Year 4 has no modules defined
  const activeYear4 = resolveActiveModule(mockModules, 4);
  assert.equal(activeYear4, null);
});
