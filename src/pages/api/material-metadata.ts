import type { APIRoute } from 'astro';
import { verifyMetadataAdmin } from '../../server/adminIdentity';
import { fetchMetadataBatch } from '../../server/linkMetadata';
export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json', 'Cache-Control':'no-store'}});
export const POST: APIRoute = async ({request}) => {
  try {
    if (!await verifyMetadataAdmin(request)) return json({error:'Admin authentication required'}, 403);
    // Bound streamed bodies too (Content-Length alone is not sufficient).
    const reader = request.body?.getReader();
    if (!reader) return json({error:'URLs required'}, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 90000) { await reader.cancel(); return json({error:'Request too large'}, 413); }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json({error:'Invalid JSON'}, 400); }
    const urls = (body as {urls?: unknown})?.urls;
    if (!Array.isArray(urls) || !urls.length || urls.length > 20 || urls.some(url => typeof url !== 'string' || url.length > 4096)) return json({error:'Provide 1–20 URLs'}, 400);
    return json({metadata:await fetchMetadataBatch([...new Set(urls as string[])])});
  } catch { return json({error:'Metadata service unavailable'}, 503); }
};
