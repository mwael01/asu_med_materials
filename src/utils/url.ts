/**
 * URL Normalization and Canonicalization Utilities.
 * Normalizes academic and study material resource links across YouTube, Drive,
 * Telegram, WhatsApp, and general URLs to accurately detect duplicates in Firestore.
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'si',
  'feature',
  'usp',
  'fbclid',
  'igshid',
  'ref',
  'gclid',
  'pp',
  's'
]);

/**
 * Normalizes a resource URL into a canonical comparison string.
 * Strips tracking queries, protocols, and standardizes video/drive/telegram links.
 */
export function normalizeResourceUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  let str = rawUrl.trim();
  if (!str) return '';

  // Add temporary protocol if missing to allow standard URL parsing
  if (!/^https?:\/\//i.test(str)) {
    str = 'https://' + str;
  }

  try {
    const parsed = new URL(str);

    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = parsed.pathname;

    // 1. YouTube Normalization
    if (host === 'youtu.be') {
      const videoId = pathname.replace(/^\/+/, '').split('/')[0];
      host = 'youtube.com';
      pathname = '/watch';
      const listId = parsed.searchParams.get('list');
      parsed.searchParams.delete('list');
      parsed.searchParams.set('v', videoId);
      if (listId) parsed.searchParams.set('list', listId);
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      host = 'youtube.com';
      // Normalize /v/ or /embed/ to /watch?v=
      if (pathname.startsWith('/embed/') || pathname.startsWith('/v/')) {
        const videoId = pathname.split('/')[2];
        pathname = '/watch';
        if (videoId) parsed.searchParams.set('v', videoId);
      }
    }

    // 2. Google Drive Normalization
    if (host === 'drive.google.com') {
      // e.g. /drive/u/0/folders/ID -> /drive/folders/ID
      pathname = pathname.replace(/\/drive\/u\/\d+\//, '/drive/');
      // e.g. /file/d/ID/view -> /file/d/ID
      pathname = pathname.replace(/\/file\/d\/([^\/]+)(?:\/view|\/preview)?/, '/file/d/$1');
      // e.g. /open?id=ID -> /file/d/ID
      const openId = parsed.searchParams.get('id');
      if (openId && pathname.includes('/open')) {
        pathname = `/file/d/${openId}`;
        parsed.searchParams.delete('id');
      }
    }

    // 3. Telegram Normalization
    if (host === 'telegram.me' || host === 'telegram.dog') {
      host = 't.me';
    }
    if (host === 't.me') {
      pathname = pathname.toLowerCase();
    }

    // 4. Strip tracking parameters
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }

    // Sort query parameters deterministically
    const sortedKeys = Array.from(parsed.searchParams.keys()).sort();
    const queryParts: string[] = [];
    for (const key of sortedKeys) {
      const val = parsed.searchParams.get(key);
      if (val !== null && val !== '') {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
      } else {
        queryParts.push(encodeURIComponent(key));
      }
    }

    // Remove trailing slash from pathname (except root)
    let cleanPath = pathname.replace(/\/+$/, '');
    if (!cleanPath) cleanPath = '';

    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

    return `${host}${cleanPath}${queryString}`.toLowerCase();
  } catch {
    // If URL parsing fails, fallback to simple string sanitization
    return str
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '')
      .split('?')[0]
      .toLowerCase();
  }
}

/**
 * Checks whether two URLs point to the same canonical study resource.
 */
export function areUrlsEqual(url1: string, url2: string): boolean {
  if (!url1 || !url2) return false;
  return normalizeResourceUrl(url1) === normalizeResourceUrl(url2);
}
