import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasDiscreteDocuments,
  resolveDocumentItems,
  isEmbeddableDocument,
  extractDriveDocumentId,
  getDocumentEmbedUrl,
  getDocumentExternalUrl
} from '../src/utils/documentViewer.ts';
import { createDraft, validateDraft, serializeDraft } from '../src/utils/materialDrafts.ts';

test('hasDiscreteDocuments detects multi-file document bundles', () => {
  assert.equal(hasDiscreteDocuments(null), false);
  assert.equal(hasDiscreteDocuments({ id: '1', title: 'Single Doc', url: 'https://example.com/doc.pdf', type: 'drive', year: 2, tags: [] }), false);
  assert.equal(hasDiscreteDocuments({ id: '2', title: 'Empty Bundle', url: '', documents: [], type: 'drive', year: 2, tags: [] }), false);
  assert.equal(
    hasDiscreteDocuments({
      id: '3',
      title: 'Practical Bundle',
      url: 'https://drive.google.com/file/d/12345/view',
      type: 'drive',
      year: 2,
      tags: [],
      documents: [
        { id: 'd1', title: 'OSPE Slides', url: 'https://drive.google.com/file/d/12345/view', type: 'drive' },
        { id: 'd2', title: 'Checklist', url: 'https://drive.google.com/file/d/67890/view', type: 'drive' }
      ]
    }),
    true
  );
});

test('resolveDocumentItems returns documents array for bundles or wraps singular file', () => {
  assert.deepEqual(resolveDocumentItems(null), []);

  // Singular file fallback
  const singular = {
    id: 'mat_single',
    title: 'Pathology Summary',
    url: 'https://drive.google.com/file/d/12345/view',
    type: 'drive',
    year: 2,
    tags: []
  };
  const resolvedSingular = resolveDocumentItems(singular);
  assert.equal(resolvedSingular.length, 1);
  assert.equal(resolvedSingular[0].title, 'Pathology Summary');
  assert.equal(resolvedSingular[0].url, 'https://drive.google.com/file/d/12345/view');

  // Multi-document bundle
  const bundle = {
    id: 'mat_bundle',
    title: 'Pathology OSPE Pack',
    url: 'https://drive.google.com/file/d/12345/view',
    type: 'drive',
    year: 2,
    tags: [],
    documents: [
      { id: 'f1', title: 'Station 1 OSPE', url: 'https://drive.google.com/file/d/12345/view', type: 'drive' },
      { id: 'f2', title: 'Station 2 Slides', url: 'https://drive.google.com/file/d/67890/view', type: 'drive' },
      { id: 'f3', title: 'Station 3 Key', url: 'https://drive.google.com/file/d/abcde/view', type: 'drive' }
    ]
  };
  const resolvedBundle = resolveDocumentItems(bundle);
  assert.equal(resolvedBundle.length, 3);
  assert.equal(resolvedBundle[0].title, 'Station 1 OSPE');
  assert.equal(resolvedBundle[1].title, 'Station 2 Slides');
  assert.equal(resolvedBundle[2].title, 'Station 3 Key');
});

test('isEmbeddableDocument recognizes embeddable document bundles', () => {
  // Bundle where documents contain Google Drive links
  const bundle = {
    id: 'mat_bundle_embed',
    title: 'Finals Exam Pack',
    url: 'https://unembeddable-example.com/pack',
    type: 'drive',
    year: 2,
    tags: [],
    documents: [
      { id: 'f1', title: 'Final 2022', url: 'https://drive.google.com/file/d/12345/view', type: 'drive' },
      { id: 'f2', title: 'Final 2023', url: 'https://drive.google.com/file/d/67890/view', type: 'drive' }
    ]
  };

  assert.equal(isEmbeddableDocument(bundle), true);
});

test('validateDraft and serializeDraft accurately validate and serialize document bundles', () => {
  const mockModules = [
    {
      id: 'blood-lymphoid',
      code: 'BLD',
      title: 'Blood and Lymphoid',
      year: 2,
      subjects: ['Pathology', 'Histology', 'Physiology'],
      active: true
    }
  ];

  const draft = createDraft(
    {
      title: 'Pathology Practical Pack',
      url: 'https://drive.google.com/file/d/12345/view',
      type: 'drive',
      category: 'practical',
      year: 2,
      moduleId: 'blood-lymphoid',
      subject: 'Pathology',
      author: ['Dr. Marco'],
      documents: [
        { id: 'd1', title: 'Station 1 Slides', url: 'https://drive.google.com/file/d/12345/view', type: 'drive' },
        { id: 'd2', title: 'Station 2 Checklist', url: 'https://drive.google.com/file/d/67890/view', type: 'drive' }
      ]
    },
    { contributor: 'Admin', contributorUid: 'admin_123' }
  );

  const issues = validateDraft(draft, mockModules);
  assert.equal(issues.length, 0);

  const serialized = serializeDraft(draft, mockModules);
  assert.equal(serialized.title, 'Pathology Practical Pack');
  assert.equal(serialized.category, 'practical');
  assert.ok(Array.isArray(serialized.documents));
  assert.equal(serialized.documents.length, 2);
  assert.equal(serialized.documents[0].title, 'Station 1 Slides');
  assert.equal(serialized.documents[1].title, 'Station 2 Checklist');
});

test('validateDraft rejects bundle documents with empty title or invalid URL', () => {
  const mockModules = [
    {
      id: 'blood-lymphoid',
      code: 'BLD',
      title: 'Blood and Lymphoid',
      year: 2,
      subjects: ['Pathology'],
      active: true
    }
  ];

  const invalidDraft = createDraft(
    {
      title: 'Faulty Pack',
      url: 'https://drive.google.com/file/d/12345/view',
      type: 'drive',
      category: 'practical',
      year: 2,
      moduleId: 'blood-lymphoid',
      documents: [
        { id: 'd1', title: '', url: 'https://drive.google.com/file/d/12345/view', type: 'drive' },
        { id: 'd2', title: 'Doc 2', url: 'not-a-valid-http-url', type: 'drive' }
      ]
    },
    { contributor: 'Admin' }
  );

  const issues = validateDraft(invalidDraft, mockModules);
  const docIssues = issues.filter((i) => i.field === 'documents');
  assert.equal(docIssues.length > 0, true);
});
