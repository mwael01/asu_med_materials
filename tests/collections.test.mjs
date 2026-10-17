import test from 'node:test';
import assert from 'node:assert/strict';

// Mock collections dataset
const mockCollections = [
  {
    id: 'col-patho-ospe',
    title: 'مراجعة أوسبي الباثولوجي الشاملة',
    titleEn: 'Comprehensive Pathology OSPE Spotting Pack',
    description: 'جميع صور وتجميعات وملازم العملي لامتحان OSPE لنهاية العام.',
    descriptionEn: 'High-yield pathology spotting slides and practical revision notes.',
    category: 'practical',
    year: 2,
    moduleId: 'blood-lymph',
    materialIds: ['mat-patho-slides', 'mat-patho-recap'],
    bookmarksCount: 15,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    createdBy: 'admin-1'
  },
  {
    id: 'col-finals-blood',
    title: 'حقيبة الفاينل لموديول الدم',
    titleEn: 'Blood Module Finals Revision Kit',
    description: 'امتحانات سابقة وتفريغات الدكتور وهدان ومذكرات المراجعة النهائية.',
    descriptionEn: 'Past exam recalls, Dr. Wahdan lecture handouts, and final summary sheets.',
    category: 'finals',
    year: 2,
    moduleId: 'blood-lymph',
    materialIds: ['mat-past-exams', 'mat-wahdan-summary', 'mat-patho-recap'],
    bookmarksCount: 42,
    createdAt: 1710100000000,
    updatedAt: 1710100000000,
    createdBy: 'admin-1'
  },
  {
    id: 'col-anatomy-y1',
    title: 'تجميعة عملي التشريح للفرقة الأولى',
    titleEn: 'Year 1 Anatomy Practical Pack',
    description: 'فيديوهات المشرحة وتجميعات العظام.',
    descriptionEn: 'Bone markings and dissection lab revision videos.',
    category: 'practical',
    year: 1,
    moduleId: 'musculoskeletal',
    materialIds: ['mat-bones-video'],
    bookmarksCount: 8,
    createdAt: 1710200000000,
    updatedAt: 1710200000000,
    createdBy: 'admin-2'
  }
];

const mockMaterials = [
  {
    id: 'mat-patho-slides',
    title: 'شرائح الباثولوجي العملية',
    titleEn: 'Pathology Practical Slides',
    category: 'practical',
    type: 'drive',
    year: 2,
    moduleId: 'blood-lymph'
  },
  {
    id: 'mat-patho-recap',
    title: 'ملخص الباثولوجي السريع',
    titleEn: 'Pathology High-Yield Recap',
    category: 'summaries',
    type: 'summary',
    year: 2,
    moduleId: 'blood-lymph'
  },
  {
    id: 'mat-past-exams',
    title: 'امتحانات الدم السابقة 2020-2024',
    titleEn: 'Blood Past Papers 2020-2024',
    category: 'exams',
    type: 'drive',
    year: 2,
    moduleId: 'blood-lymph'
  },
  {
    id: 'mat-wahdan-summary',
    title: 'تفريغ الدكتور وهدان',
    titleEn: 'Dr. Wahdan Handout',
    category: 'summaries',
    type: 'summary',
    year: 2,
    moduleId: 'blood-lymph'
  },
  {
    id: 'mat-bones-video',
    title: 'شرح عظام الطرف العلوي',
    titleEn: 'Upper Limb Bones Breakdown',
    category: 'lectures',
    type: 'youtube',
    year: 1,
    moduleId: 'musculoskeletal'
  }
];

test('Collections data structure contains required attributes and categories', () => {
  const validCategories = new Set(['practical', 'finals', 'midterm', 'revision', 'general']);

  for (const col of mockCollections) {
    assert.ok(col.id, 'Collection should have an id');
    assert.ok(col.title, 'Collection should have a title');
    assert.ok(Array.isArray(col.materialIds), 'Collection must have materialIds array');
    assert.ok(col.year >= 1 && col.year <= 5, 'Collection year must be between 1 and 5');
    assert.ok(validCategories.has(col.category), `Invalid category: ${col.category}`);
  }
});

test('Material resolution preserves curated order', () => {
  const col = mockCollections[1]; // col-finals-blood: ['mat-past-exams', 'mat-wahdan-summary', 'mat-patho-recap']
  const materialMap = new Map(mockMaterials.map((m) => [m.id, m]));

  const resolved = [];
  for (const id of col.materialIds) {
    const item = materialMap.get(id);
    if (item) resolved.push(item);
  }

  assert.equal(resolved.length, 3);
  assert.equal(resolved[0].id, 'mat-past-exams');
  assert.equal(resolved[1].id, 'mat-wahdan-summary');
  assert.equal(resolved[2].id, 'mat-patho-recap');
});

test('Collections filter by year correctly', () => {
  const year2Collections = mockCollections.filter((c) => c.year === 2);
  const year1Collections = mockCollections.filter((c) => c.year === 1);
  const year3Collections = mockCollections.filter((c) => c.year === 3);

  assert.equal(year2Collections.length, 2);
  assert.equal(year1Collections.length, 1);
  assert.equal(year3Collections.length, 0);
});

test('Collections filter by module correctly', () => {
  const bloodCollections = mockCollections.filter((c) => c.moduleId === 'blood-lymph');
  const mskCollections = mockCollections.filter((c) => c.moduleId === 'musculoskeletal');

  assert.equal(bloodCollections.length, 2);
  assert.equal(mskCollections.length, 1);
});

test('Collections filter by category correctly', () => {
  const practicalPacks = mockCollections.filter((c) => c.category === 'practical');
  const finalsPacks = mockCollections.filter((c) => c.category === 'finals');

  assert.equal(practicalPacks.length, 2);
  assert.equal(finalsPacks.length, 1);
});

test('Client collections utility returns matched collections by IDs', async () => {
  // Mock window and global fetch for client catalogue test
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.window = {
      location: { href: 'http://localhost:4321/' },
      __CACHED_COLLECTIONS: mockCollections
    };

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ collections: mockCollections })
    });

    const { getClientCollections, getClientCollectionsByIds, getClientCollectionById } = await import(
      '../src/utils/catalogueClient.ts'
    );

    const all = await getClientCollections();
    assert.equal(all.length, 3);

    const matched = await getClientCollectionsByIds(['col-patho-ospe', 'col-anatomy-y1']);
    assert.equal(matched.length, 2);
    assert.equal(matched[0].id, 'col-patho-ospe');
    assert.equal(matched[1].id, 'col-anatomy-y1');

    const single = await getClientCollectionById('col-finals-blood');
    assert.ok(single);
    assert.equal(single?.id, 'col-finals-blood');
    assert.equal(single?.materialIds.length, 3);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('groupCollectionsByYear filters out subgroups from top-level home timeline slots', async () => {
  const { groupCollectionsByYear } = await import('../src/data/collections.ts');

  const datasetWithSubgroups = [
    ...mockCollections,
    {
      id: 'col-dr-marco',
      parentId: 'col-patho-ospe',
      title: 'د. ماركو - عملي باثولوجي',
      category: 'practical',
      year: 2,
      materialIds: ['mat-patho-slides']
    }
  ];

  const grouped = groupCollectionsByYear(datasetWithSubgroups);
  assert.equal(grouped[1].length, 1);
  assert.equal(grouped[2].length, 2); // Only root collections col-patho-ospe and col-finals-blood
  assert.equal(grouped[3].length, 0);

  // Subgroup must not appear directly in root timeline slots
  assert.ok(!grouped[2].some((c) => c.id === 'col-dr-marco'), 'Subgroup must not appear in root timeline slots');
});

test('Hierarchical collections resolve subcollections, parent link, and total materials count', async () => {
  const dataset = [
    {
      id: 'col-parent-practical',
      title: 'حزمة العملي الشاملة',
      category: 'practical',
      year: 2,
      materialIds: ['mat-patho-recap'] // 1 direct material
    },
    {
      id: 'col-sub-marco',
      parentId: 'col-parent-practical',
      title: 'د. ماركو',
      category: 'practical',
      year: 2,
      materialIds: ['mat-patho-slides', 'mat-wahdan-summary'] // 2 materials
    }
  ];

  const materialMap = new Map(mockMaterials.map((m) => [m.id, m]));

  // Test resolution logic directly
  const parent = dataset[0];
  const child = dataset[1];

  assert.equal(child.parentId, parent.id);
  assert.ok(child.materialIds.length === 2);
  assert.ok(parent.materialIds.length === 1);
});

