import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDriveDocumentId,
  isEmbeddableDocument,
  getDocumentEmbedUrl,
  getDocumentExternalUrl,
  getDocumentViewerPath
} from '../src/utils/documentViewer.ts';

test('extractDriveDocumentId extracts IDs from valid Google Drive file URLs', () => {
  assert.equal(
    extractDriveDocumentId('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'
  );
  assert.equal(
    extractDriveDocumentId('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview?usp=sharing'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'
  );
  assert.equal(
    extractDriveDocumentId('https://drive.google.com/open?id=1234567890abcdef'),
    '1234567890abcdef'
  );
  assert.equal(
    extractDriveDocumentId('https://drive.google.com/uc?id=987654321fedcba'),
    '987654321fedcba'
  );
  assert.equal(
    extractDriveDocumentId('https://docs.google.com/document/d/docId12345/edit'),
    'docId12345'
  );
  assert.equal(
    extractDriveDocumentId('https://docs.google.com/presentation/d/slidesId67890/edit#slide=id.p'),
    'slidesId67890'
  );
});

test('extractDriveDocumentId excludes Google Drive folders and invalid inputs', () => {
  assert.equal(extractDriveDocumentId('https://drive.google.com/drive/folders/12345folderId'), null);
  assert.equal(extractDriveDocumentId('https://drive.google.com/drive/u/0/folders/67890folderId'), null);
  assert.equal(extractDriveDocumentId('https://t.me/asu_channel'), null);
  assert.equal(extractDriveDocumentId('https://youtube.com/watch?v=12345678901'), null);
  assert.equal(extractDriveDocumentId(''), null);
  assert.equal(extractDriveDocumentId(undefined), null);
});

test('isEmbeddableDocument correctly detects embeddable files', () => {
  assert.equal(isEmbeddableDocument('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view'), true);
  assert.equal(isEmbeddableDocument('https://example.com/summary.pdf'), true);
  assert.equal(isEmbeddableDocument('https://example.com/summary.PDF?token=123'), true);
  assert.equal(isEmbeddableDocument({ url: 'https://drive.google.com/file/d/abc/view' }), true);

  assert.equal(isEmbeddableDocument('https://drive.google.com/drive/folders/batch-drive-123'), false);
  assert.equal(isEmbeddableDocument('https://t.me/telegram_channel'), false);
  assert.equal(isEmbeddableDocument('https://chat.whatsapp.com/invite123'), false);
  assert.equal(isEmbeddableDocument('https://youtube.com/watch?v=12345678901'), false);
  assert.equal(isEmbeddableDocument(null), false);
});

test('getDocumentEmbedUrl generates correct preview iframe URLs', () => {
  assert.equal(
    getDocumentEmbedUrl('https://drive.google.com/file/d/testFileId123/view?usp=sharing'),
    'https://drive.google.com/file/d/testFileId123/preview'
  );
  assert.equal(
    getDocumentEmbedUrl('https://docs.google.com/document/d/myDocId/edit'),
    'https://docs.google.com/document/d/myDocId/preview'
  );
  assert.equal(
    getDocumentEmbedUrl('https://example.com/notes.pdf'),
    'https://docs.google.com/viewer?url=https%3A%2F%2Fexample.com%2Fnotes.pdf&embedded=true'
  );
  assert.equal(getDocumentEmbedUrl('https://drive.google.com/drive/folders/folderId'), null);
  assert.equal(getDocumentEmbedUrl('https://t.me/channel'), null);
});

test('getDocumentExternalUrl and getDocumentViewerPath format correct destinations', () => {
  assert.equal(
    getDocumentExternalUrl('https://drive.google.com/file/d/file123/preview'),
    'https://drive.google.com/file/d/file123/view'
  );
  assert.equal(
    getDocumentExternalUrl('https://example.com/notes.pdf'),
    'https://example.com/notes.pdf'
  );
  assert.equal(getDocumentViewerPath('bld-dr-ahmed-notes'), '/viewer/bld-dr-ahmed-notes');
});
