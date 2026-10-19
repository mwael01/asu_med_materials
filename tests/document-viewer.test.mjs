import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDriveDocumentId,
  isEmbeddableDocument,
  getDocumentEmbedUrl,
  getDocumentExternalUrl,
  getDocumentViewerPath,
  getDocumentDownloadUrl
} from '../src/utils/documentViewer.ts';
import { isHostedDocumentUrl, getDocumentDownloadPath } from '../src/utils/documentViewer.ts';
import { downloadHostedDocument } from '../src/utils/documentDownload.server.ts';

test('downloads stream catalogue files with attachment filenames and do not follow redirects', async () => {
  const document = { id: 'doc', title: 'ملخص\r\nlung', url: `https://asumed.eduvour.com/materials/sha256/${'a'.repeat(64)}.pdf` };
  const response = await downloadHostedDocument(document, async (url, options) => {
    assert.equal(url, document.url);
    assert.equal(options.redirect, 'error');
    return new Response('%PDF', { headers: { 'Content-Type': 'application/pdf', 'Content-Length': '4' } });
  });
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  assert.equal(response.headers.get('Content-Length'), '4');
  assert.match(response.headers.get('Content-Disposition'), /^attachment;.*filename\*=UTF-8''/);
  assert.equal(await response.text(), '%PDF');
  let fetched = false;
  assert.equal((await downloadHostedDocument({ ...document, url: 'http://localhost/private.pdf' }, async () => { fetched = true; })).status, 404);
  assert.equal(fetched, false);
  assert.equal((await downloadHostedDocument(document, async () => new Response('Missing', { status: 404 }))).status, 502);
});

test('hosted files embed directly and only immutable R2 documents can be downloaded', () => {
  const url = `https://asumed.eduvour.com/materials/sha256/${'a'.repeat(64)}.pdf`;
  assert.equal(getDocumentEmbedUrl(url), url);
  assert.equal(isHostedDocumentUrl(url), true);
  assert.equal(isHostedDocumentUrl(url + `?v=${'a'.repeat(64)}`), true);
  assert.equal(getDocumentEmbedUrl(url + `?v=${'a'.repeat(64)}`), url + `?v=${'a'.repeat(64)}`);
  assert.equal(isHostedDocumentUrl(url.replace('asumed.eduvour.com', 'asumed.eduvour.com.evil.test')), false);
  assert.equal(isHostedDocumentUrl(url + '?redirect=http://localhost'), false);
  assert.equal(isHostedDocumentUrl('http://127.0.0.1/private.pdf'), false);
  assert.equal(getDocumentDownloadPath('a/b', 'x&y'), '/api/material-download?material=a%2Fb&document=x%26y');
});

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

test('getDocumentDownloadUrl generates direct download links without proxy', () => {
  // Hosted R2 document
  const hostedUrl = `https://asumed.eduvour.com/materials/sha256/${'b'.repeat(64)}.pdf`;
  assert.equal(
    getDocumentDownloadUrl(hostedUrl, 'material-123', 'doc-456'),
    '/api/material-download?material=material-123&document=doc-456'
  );

  // Google Drive document (zero-proxy direct download URL)
  assert.equal(
    getDocumentDownloadUrl('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view'),
    'https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'
  );
  assert.equal(
    getDocumentDownloadUrl('https://drive.google.com/open?id=1234567890abcdef'),
    'https://drive.google.com/uc?export=download&id=1234567890abcdef'
  );

  // Direct PDF and document files
  assert.equal(
    getDocumentDownloadUrl('https://example.com/histology_atlas.pdf?v=1'),
    'https://example.com/histology_atlas.pdf?v=1'
  );

  // Excluded or non-downloadable links
  assert.equal(getDocumentDownloadUrl('https://drive.google.com/drive/folders/folderId'), null);
  assert.equal(getDocumentDownloadUrl('https://t.me/asu_channel'), null);
  assert.equal(getDocumentDownloadUrl('https://youtube.com/watch?v=12345678901'), null);
  assert.equal(getDocumentDownloadUrl(undefined), null);
});

