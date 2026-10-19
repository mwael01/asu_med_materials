import type { DocumentItem } from '../types/materials';
import { isHostedDocumentUrl } from './documentViewer';

export async function downloadHostedDocument(document: DocumentItem, fetchFile: typeof fetch = fetch): Promise<Response> {
  if (!isHostedDocumentUrl(document.url)) return new Response('Document not found', { status: 404 });
  try {
    const upstream = await fetchFile(document.url, {
      redirect: 'error', signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'ASUMedMaterials/1.0' },
    });
    if (!upstream.ok || !upstream.body) return new Response('File unavailable', { status: 502 });
    const extension = new URL(document.url).pathname.split('.').pop()!;
    const title = document.title.replace(/[\r\n\u0000-\u001f/\\]/g, ' ').trim().slice(0, 180) || 'Document';
    const filename = title.toLowerCase().endsWith(`.${extension}`) ? title : `${title}.${extension}`;
    const encoded = encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const headers = new Headers({
      'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="document.${extension}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    const length = upstream.headers.get('Content-Length');
    if (length) headers.set('Content-Length', length);
    return new Response(upstream.body, { headers });
  } catch {
    return new Response('File unavailable', { status: 502 });
  }
}
