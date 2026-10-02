import type { ResourceType } from '../types/materials';

export function isHttpUrl(value: string): boolean {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
}
export function extractMaterialUrls(text: string): string[] {
  const matches = text.match(/(?:https?:\/\/|www\.|(?:t\.me|telegram\.me|drive\.google\.com|youtube\.com|youtu\.be|chat\.whatsapp\.com|wa\.me|mega\.nz|mediafire\.com)\/)[^\s<>"'`\[\]{}]+/gi) || [];
  const urls = matches.map(raw => {
    let value = raw.replace(/[.,;!،؛؟]+$/, '');
    while (value.endsWith(')') && (value.match(/\)/g)?.length || 0) > (value.match(/\(/g)?.length || 0)) value = value.slice(0, -1);
    return /^https?:/i.test(value) ? value : `https://${value}`;
  });
  return [...new Set(urls.filter(isHttpUrl))];
}
// URL paths, resource identifiers, and invite tokens are case-sensitive.
export function materialUrlKey(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|si$|feature$|usp$|fbclid$)/i.test(key)) u.searchParams.delete(key);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return `youtube:${u.pathname.slice(1)}:${u.searchParams.get('list') || ''}`;
    if (['youtube.com', 'm.youtube.com'].includes(host)) {
      const video = u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed|v)\/([^/]+)/)?.[1];
      if (video) return `youtube:${video}:${u.searchParams.get('list') || ''}`;
      if (u.searchParams.has('list')) return `playlist:${u.searchParams.get('list')}`;
    }
    if (host === 'drive.google.com') {
      const id = u.pathname.match(/\/(?:d|folders)\/([^/]+)/)?.[1] || u.searchParams.get('id');
      if (id) return `drive:${id}`;
    }
    u.hostname = host === 'telegram.me' ? 't.me' : host;
    u.searchParams.sort();
    return `${u.hostname}${u.pathname.replace(/\/$/, '')}${u.search}`;
  } catch { return raw; }
}
export function detectResourceType(url: string): ResourceType {
  try {
    const u = new URL(url); const h = u.hostname.replace(/^www\./, '');
    if (h === 'drive.google.com' || h === 'docs.google.com') return 'drive';
    if (['t.me', 'telegram.me'].includes(h)) return 'telegram';
    if (['youtube.com', 'm.youtube.com', 'youtu.be'].includes(h)) return u.searchParams.has('list') ? 'playlist' : 'youtube';
    if (['chat.whatsapp.com', 'wa.me', 'whatsapp.com'].includes(h)) return 'whatsapp';
    if (/\.pdf$/i.test(u.pathname)) return 'summary';
    return 'website';
  } catch { return 'other'; }
}
