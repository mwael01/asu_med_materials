import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizePathSegment,
  resolveCurriculumPath,
  parseMaterialIdFromFileName,
  isFileSystemAccessSupported
} from '../src/utils/localFolderManager.ts';

test('sanitizePathSegment strips illegal filesystem characters across OSes', () => {
  assert.equal(sanitizePathSegment('Year 1: Anatomy & Histology?'), 'Year 1 Anatomy & Histology');
  assert.equal(sanitizePathSegment('Lecture <1> *Part 2* / Intro | Final'), 'Lecture 1 Part 2 Intro Final');
  assert.equal(sanitizePathSegment('   Spaces   Around   '), 'Spaces Around');
  assert.equal(sanitizePathSegment(':::???***'), 'General');
  assert.equal(sanitizePathSegment(''), 'General');
});

test('resolveCurriculumPath constructs normalized curriculum directory hierarchy', () => {
  const pathParts = resolveCurriculumPath(
    2,
    'Musculoskeletal (MSK): Anatomy & Physiology',
    'Practical Anatomy: Bones',
    'Upper Limb Notes.pdf'
  );

  assert.deepEqual(pathParts, [
    'Year 2',
    'Musculoskeletal (MSK) Anatomy & Physiology',
    'Practical Anatomy Bones',
    'Upper Limb Notes.pdf'
  ]);
});

test('resolveCurriculumPath ensures .pdf extension is maintained', () => {
  const parts1 = resolveCurriculumPath(1, 'General', 'Histology', 'Summary');
  assert.equal(parts1[3], 'Summary.pdf');

  const parts2 = resolveCurriculumPath(1, 'General', 'Histology', 'Summary.pdf');
  assert.equal(parts2[3], 'Summary.pdf');

  const parts3 = resolveCurriculumPath(1, 'General', 'Histology', 'Summary.PDF');
  assert.equal(parts3[3], 'Summary.pdf');
});

test('parseMaterialIdFromFileName correctly parses structured and unstructured filenames', () => {
  const parsed1 = parseMaterialIdFromFileName('[m-msk_dr_ahmed-d-doc1]-Upper Limb Notes.pdf');
  assert.equal(parsed1.materialId, 'msk_dr_ahmed');
  assert.equal(parsed1.documentId, 'doc1');

  const parsed2 = parseMaterialIdFromFileName('[m-anatomy-lecture-1]-Handout.pdf');
  assert.equal(parsed2.materialId, 'anatomy-lecture-1');
  assert.equal(parsed2.documentId, undefined);

  const parsed3 = parseMaterialIdFromFileName('Regular Notes Without Tag.pdf');
  assert.equal(parsed3.materialId, undefined);
  assert.equal(parsed3.documentId, undefined);
});

test('isFileSystemAccessSupported returns false in headless Node environment', () => {
  assert.equal(isFileSystemAccessSupported(), false);
});
