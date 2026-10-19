import type { APIRoute } from 'astro';
import { getMaterialById } from '../../data/materials';
import { isHostedDocumentUrl, resolveDocumentItems } from '../../utils/documentViewer';
import { downloadHostedDocument } from '../../utils/documentDownload.server';

/** Stream a public catalogue file with attachment headers; never proxy arbitrary URLs. */
export const GET: APIRoute = async ({ url }) => {
  const materialId = url.searchParams.get('material');
  const documentId = url.searchParams.get('document');
  if (!materialId || !documentId) return new Response('Missing document', { status: 400 });
  const material = await getMaterialById(materialId);
  const document = resolveDocumentItems(material).find(item => item.id === documentId);
  if (!document || !isHostedDocumentUrl(document.url)) return new Response('Document not found', { status: 404 });
  return downloadHostedDocument(document);
};
