import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSearchDocument,
  scoreSearchDocument,
  searchDocuments,
  tokenizeQuery,
  normalizeSearchText,
  stripArabicPrefix,
  stemToken
} from '../src/utils/search.ts';
import { getAliasesForToken } from '../src/utils/searchAliases.ts';

test('Search Normalization & Arabic Prefix Stripping', () => {
  assert.equal(stripArabicPrefix('الباثولوجي'), 'باثولوجي');
  assert.equal(stripArabicPrefix('التشريح'), 'تشريح');
  assert.equal(stripArabicPrefix('دوهدان'), 'وهدان');
  assert.equal(stripArabicPrefix('للعملي'), 'عملي');
  assert.equal(stripArabicPrefix('وباثولوجي'), 'باثولوجي');
  assert.deepEqual(tokenizeQuery('دكتور_وهدان'), ['وهدان']);

  assert.equal(stemToken('lectures'), 'lecture');
  assert.equal(stemToken('summaries'), 'summary');
  assert.equal(stemToken('notes'), 'note');
  assert.equal(stemToken('فيديوهات'), 'فيديو');
  assert.equal(stemToken('تسجيلات'), 'تسجيل');
});

test('Alias Dictionary Lookup', () => {
  const pathoAliases = getAliasesForToken('patho');
  assert.ok(pathoAliases.includes('pathology'));
  assert.ok(pathoAliases.includes('باثولوجي'));

  const wahdanAliases = getAliasesForToken('wahdan');
  assert.ok(wahdanAliases.includes('وهدان'));

  const nagiAliases = getAliasesForToken('ناجي');
  assert.ok(nagiAliases.includes('nagi'));
  assert.ok(nagiAliases.includes('nagy'));

  const mcqAliases = getAliasesForToken('mcq');
  assert.ok(mcqAliases.includes('اسئلة') || mcqAliases.includes('امتحانات'));
});

test('Search Matching with Doctor Names and Medical Slang', () => {
  const sampleMaterials = [
    {
      id: 'mat-1',
      title: 'Pathology General Lecture 1',
      author: 'Dr. Wahdan',
      subject: 'Pathology',
      type: 'youtube',
      year: 2,
      url: 'https://youtube.com/watch?v=123'
    },
    {
      id: 'mat-2',
      title: 'Physiology Membrane Potential',
      author: 'Dr. Nagi',
      subject: 'Physiology',
      type: 'youtube',
      year: 1,
      url: 'https://youtube.com/watch?v=456'
    },
    {
      id: 'mat-3',
      title: 'Anatomy Upper Limb Practical OSPE',
      author: 'Department Staff',
      subject: 'Anatomy',
      type: 'practical',
      year: 1,
      url: 'https://drive.google.com/123'
    }
  ];

  const docs = sampleMaterials.map((m) => createSearchDocument(m));

  // 1. Searching in Arabic for English Doctor Name: "وهدان" -> mat-1
  const res1 = searchDocuments(docs, { query: 'وهدان' });
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, 'mat-1');

  // 2. Searching with Arabic prefix: "الباثولوجي" -> mat-1
  const res2 = searchDocuments(docs, { query: 'الباثولوجي' });
  assert.ok(res2.length >= 1);
  assert.equal(res2[0].id, 'mat-1');

  // 3. Searching with medical slang: "patho" -> mat-1
  const res3 = searchDocuments(docs, { query: 'patho' });
  assert.ok(res3.length >= 1);
  assert.equal(res3[0].id, 'mat-1');

  // 4. Searching with doctor title + name: "د ناجي" -> mat-2
  const res4 = searchDocuments(docs, { query: 'د ناجي' });
  assert.ok(res4.length >= 1);
  assert.equal(res4[0].id, 'mat-2');

  // 5. Searching Arabic slang for practical: "عملي اناتومي" -> mat-3
  const res5 = searchDocuments(docs, { query: 'عملي اناتومي' });
  assert.ok(res5.length >= 1);
  assert.equal(res5[0].id, 'mat-3');
});

test('Arbitrary Token Order and Multi-token Tolerance', () => {
  const sampleMaterials = [
    {
      id: 'mat-1',
      title: 'Physiology CVS Lectures Dr Nagi',
      author: 'Dr. Nagi',
      subject: 'Physiology',
      type: 'youtube',
      year: 2,
      url: 'https://youtube.com/1'
    },
    {
      id: 'mat-2',
      title: 'Physiology Renal Notes',
      author: 'Student Team',
      subject: 'Physiology',
      type: 'summary',
      year: 2,
      url: 'https://drive.google.com/2'
    }
  ];

  const docs = sampleMaterials.map((m) => createSearchDocument(m));

  // Query order 1: "nagi physio"
  const tokens1 = tokenizeQuery('nagi physio');
  const score1 = scoreSearchDocument(docs[0], 'nagi physio', tokens1);

  // Query order 2: "physio nagi"
  const tokens2 = tokenizeQuery('physio nagi');
  const score2 = scoreSearchDocument(docs[0], 'physio nagi', tokens2);

  // Both should produce identical high scores (both tokens matched)
  assert.ok(score1 > 500, `Expected high score, got ${score1}`);
  assert.ok(score2 > 500, `Expected high score, got ${score2}`);
  assert.equal(score1, score2);

  // Partial tolerance: query with 3 words where 2 match:
  // "physio nagi mcqs" -> mat-1 matches physio + nagi, but not mcqs.
  const partialRes = searchDocuments(docs, { query: 'physio nagi mcqs' });
  assert.ok(partialRes.length >= 1, 'Document should still be returned with partial score');
  assert.equal(partialRes[0].id, 'mat-1');

  // Completely unrelated query should return 0 results
  const noMatchRes = searchDocuments(docs, { query: 'ophthalmology surgery retina' });
  assert.equal(noMatchRes.length, 0);
});

test('Bilingual Search and Doctor Aliases Cross-Matching', () => {
  const materials = [
    {
      id: 'doc-patho',
      title: 'General Pathology Revision Sheet',
      author: 'دكتور وهدان',
      subject: 'باثولوجي',
      type: 'summary',
      year: 2,
      url: 'https://example.com/1'
    },
    {
      id: 'doc-anat',
      title: 'Upper Limb Anatomy Dissection',
      author: 'Dr. Magdy',
      subject: 'Anatomy',
      type: 'youtube',
      year: 1,
      url: 'https://example.com/2'
    }
  ];

  const docs = materials.map((m) => createSearchDocument(m));

  // Search English "wahdan" on Arabic author "دكتور وهدان"
  const resWahdan = searchDocuments(docs, { query: 'wahdan' });
  assert.equal(resWahdan.length, 1);
  assert.equal(resWahdan[0].id, 'doc-patho');

  // Search English "patho sheet" on "General Pathology Revision Sheet"
  const resSheet = searchDocuments(docs, { query: 'patho sheet' });
  assert.equal(resSheet.length, 1);
  assert.equal(resSheet[0].id, 'doc-patho');

  // Search Arabic "تشريح مجدي" on English "Upper Limb Anatomy Dissection" / "Dr. Magdy"
  const resMagdy = searchDocuments(docs, { query: 'تشريح مجدي' });
  assert.equal(resMagdy.length, 1);
  assert.equal(resMagdy[0].id, 'doc-anat');
});
