import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveActiveModule } from '../src/utils/moduleHelpers.ts';

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

test('resolveActiveModule falls back to lowest order when no module is marked active: true', () => {
  // Year 3 has no active: true, falls back to order: 1
  const activeYear3 = resolveActiveModule(mockModules, 3);
  assert.ok(activeYear3);
  assert.equal(activeYear3.id, 'year3-cns');
});

test('resolveActiveModule filters out reference books and returns null for years without curriculum modules', () => {
  // Year 5 only has reference books
  const activeYear5 = resolveActiveModule(mockModules, 5);
  assert.equal(activeYear5, null);

  // Year 4 has no modules defined
  const activeYear4 = resolveActiveModule(mockModules, 4);
  assert.equal(activeYear4, null);
});
