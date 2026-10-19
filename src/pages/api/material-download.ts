import type { APIRoute } from 'astro';
import { getMaterialById } from '../../data/materials';
import { isHostedDocumentUrl, resolveDocumentItems } from '../../utils/documentViewer';
import { downloadHostedDocument } from '../../utils/documentDownload.server';
import type { DocumentItem } from '../../types/materials';

/** Stream a public catalogue file with attachment headers; never proxy arbitrary URLs. */
export const GET: APIRoute = async ({ url }) => {
  const materialId = url.searchParams.get('material');
  const documentId = url.searchParams.get('document');
  const directUrl = url.searchParams.get('url');
  const customFilename = url.searchParams.get('filename');

  // Direct hosted URL streaming (strictly validated)
  if (directUrl) {
    if (!isHostedDocumentUrl(directUrl)) {
      return new Response('Document not found', { status: 404 });
    }
    const title = customFilename || 'Document';
    return downloadHostedDocument({ id: 'direct', title, url: directUrl });
  }

  if (!materialId) {
    return new Response('Missing document', { status: 400 });
  }

  const material = await getMaterialById(materialId);
  if (!material) {
    return new Response('Document not found', { status: 404 });
  }

  const items = resolveDocumentItems(material);
  if (items.length === 0) {
    return new Response('Document not found', { status: 404 });
  }

  let doc: DocumentItem | undefined;

  if (documentId) {
    doc = items.find(item => item.id === documentId || item.id === `doc_${documentId}`);
    if (!doc && /^doc_(\d+)$/.test(documentId)) {
      const idx = parseInt(documentId.replace('doc_', ''), 10) - 1;
      doc = items[idx];
    }
  } else {
    doc = items[0];
  }

  if (!doc || !isHostedDocumentUrl(doc.url)) {
    return new Response('Document not found', { status: 404 });
  }

  // Determine the best human-readable title
  let effectiveTitle = customFilename || doc.title;
  if (!customFilename && material.title) {
    if (!effectiveTitle || effectiveTitle === 'Document' || /^Document \d+$/i.test(effectiveTitle)) {
      effectiveTitle = material.title;
    } else if (items.length > 1 && !effectiveTitle.toLowerCase().includes(material.title.toLowerCase())) {
      effectiveTitle = `${material.title} - ${effectiveTitle}`;
    }
  }

  return downloadHostedDocument({
    ...doc,
    title: effectiveTitle || 'Document',
  });
};
