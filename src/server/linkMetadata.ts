import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { load } from 'cheerio';
import type { LinkMetadata } from '../types/ai';

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Only ordinary global unicast IPv6; exclude transition/documentation ranges.
  const [first, second = '0'] = address.toLowerCase().split(':');
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) &&
    first !== '2002' && first !== '3fff' && !(first === '2001' && (parseInt(second || '0', 16) < 0x200 || second === 'db8'));
}
export function validatePreviewUrl(raw: string): URL {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || raw.length > 4096) throw new Error('blocked');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || !host.includes('.') && !isIP(host) || (isIP(host) && !isPublicAddress(host))) throw new Error('blocked');
  return url;
}
const defaultTransport = {lookup, httpRequest, httpsRequest};
export async function fetchHtml(url: URL, signal: AbortSignal, redirects = 0, transport = defaultTransport): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{address: host, family: isIP(host)}] : await transport.lookup(host, {all:true});
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('blocked');
  if (signal.aborted) throw new Error('timeout');
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? transport.httpsRequest : transport.httpRequest)(url, {
      signal,
      headers: {'User-Agent':'ASUMedMaterials/1.0 (public link previews)', Accept:'text/html,application/xhtml+xml', 'Accept-Encoding':'identity'},
      // Pin the socket lookup; do not resolve the hostname again after validation.
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [address]); else callback(null, address.address, address.family);
      },
    }, response => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.destroy();
        if (redirects >= 3) { reject(new Error('redirect limit')); return; }
        try {
          const next = validatePreviewUrl(new URL(response.headers.location, url).href);
          fetchHtml(next, signal, redirects + 1, transport).then(resolve, reject);
        } catch (error) { reject(error); }
        return;
      }
      if (response.statusCode !== 200 || !/^(text\/html|application\/xhtml\+xml)/i.test(response.headers['content-type'] || '')) {
        response.destroy(); reject(new Error('unavailable')); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1024 * 1024) { response.destroy(new Error('response limit')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.on('error', reject); request.end();
  });
}
export function parsePreviewHtml(html: string, url: string): LinkMetadata {
  const $ = load(html);
  const clean = (s: string | undefined, max: number) => s?.replace(/\s+/g, ' ').trim().slice(0, max) || undefined;
  const meta = (key: string) => $(`meta[property="${key}"],meta[name="${key}"]`).first().attr('content');
  const title = clean(meta('og:title') || meta('twitter:title') || $('title').first().text(), 300);
  const description = clean(meta('og:description') || meta('description') || meta('twitter:description'), 1500);
  // Channel/uploader metadata is not authorship evidence.
  const author = clean(meta('author'), 200);
  const login = /^(sign in|log in|login|access denied|just a moment|تسجيل الدخول)(\b|\s)/i.test(title || '');
  return login || !title && !description ? {url, status:'unavailable'} : {url, title, description, author, status:'ok'};
}
export async function fetchLinkMetadata(url: string, transport = defaultTransport, timeoutMs = 8000): Promise<LinkMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const target = validatePreviewUrl(url);
    // Public preview endpoints; never open authenticated group sessions.
    if (target.hostname === 'youtu.be') {
      const id = target.pathname.slice(1).split('/')[0];
      target.hostname = 'www.youtube.com'; target.pathname = '/watch'; target.searchParams.set('v', id);
    }
    const work = fetchHtml(target, controller.signal, 0, transport).then(html => parsePreviewHtml(html, url));
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout')), {once:true}));
    return await Promise.race([work, aborted]);
  } catch (error) {
    return {url, status: error instanceof Error && error.message === 'blocked' ? 'blocked' : 'unavailable'};
  } finally { clearTimeout(timer); }
}
export async function fetchMetadataBatch(urls: string[], fetchOne: (url: string) => Promise<LinkMetadata> = fetchLinkMetadata): Promise<LinkMetadata[]> {
  const results: LinkMetadata[] = new Array(urls.length); let next = 0;
  await Promise.all(Array.from({length: Math.min(4, urls.length)}, async () => {
    while (next < urls.length) { const index = next++; results[index] = await fetchOne(urls[index]); }
  }));
  return results;
}
