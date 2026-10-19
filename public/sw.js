// Service Worker for ASU Med Materials PWA
// Cache visited pages for offline access without fetching the entire catalogue.

const CACHE_NAME = 'asumed-cache-v10';

// 1. Static brand assets, icons, core navigation routes, and catalogue APIs
const PRECACHE_ASSETS = [
  '/',
  '/modules',
  '/videos',
  '/pdfs',
  '/flashcards',
  '/search',
  '/team',
  '/contributors',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/book.svg',
  '/icons/exam.svg',
  '/icons/google-drive.svg',
  '/icons/other.svg',
  '/icons/summary.svg',
  '/icons/telegram.svg',
  '/icons/website.svg',
  '/icons/whatsapp.svg',
  '/icons/youtube.svg',
  '/offline.html',
  '/api/materials',
  '/api/modules',
  '/api/lessons',
  '/api/collections',
  '/api/version'
];

// Helper: fetch with network timeout
function fetchWithTimeout(request, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Network timeout')), timeoutMs);
    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Fetch home once to extract and cache current _astro CSS/JS bundles
      try {
        const homeRes = await fetch('/', { cache: 'default' });
        if (homeRes.ok) {
          await cache.put('/', homeRes.clone());
          const html = await homeRes.text();
          const assetMatches = [...html.matchAll(/(?:href|src)="(\/_astro\/[^"]+)"/g)];
          const assetUrls = [...new Set(assetMatches.map((m) => m[1]))];
          await Promise.all(
            assetUrls.map((url) => cache.add(new Request(url, { cache: 'default' })).catch(() => {}))
          );
        }
      } catch (err) {
        // Silently skip if offline during install
      }

      // 2. Precache static assets & icons
      await Promise.all(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(new Request(asset, { cache: 'default' })).catch(() => {})
        )
      );

      // Activate immediately
      await self.skipWaiting();
    })()
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key.startsWith('asumed-cache-') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET requests on http/https
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // Cache Google Fonts for clean offline typography
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Cache Cloudflare R2 (asumed.eduvour.com) and Firebase Storage media assets (diagrams, images)
  if (
    url.hostname === 'asumed.eduvour.com' ||
    url.hostname.endsWith('.eduvour.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.pathname.startsWith('/flashcard-media/')
  ) {
    event.respondWith(
      caches.open('asumed-flashcard-media').then((mediaCache) =>
        mediaCache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res && res.status === 200) {
              mediaCache.put(request, res.clone());
            }
            return res;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // Ignore other external origins (YouTube iframe embeds, drives, etc.)
  if (url.origin !== self.location.origin) return;

  // Stale-While-Revalidate strategy for catalogue materials, modules, lessons, and collections endpoints
  if (
    url.pathname === '/api/materials' ||
    url.pathname === '/api/modules' ||
    url.pathname === '/api/lessons' ||
    url.pathname === '/api/collections' ||
    url.pathname === '/api/version'
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            cache.put(request, networkRes.clone());
          }
          return networkRes;
        }).catch(() => null);

        if (cached) {
          // Serve from cache immediately; update cache in background
          return cached;
        }

        const networkRes = await fetchPromise;
        if (networkRes) return networkRes;

        const fallbackBody = url.pathname === '/api/version' ? '{"version":1}' : '[]';
        return new Response(fallbackBody, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      })()
    );
    return;
  }

  // Skip other API routes — always network
  if (url.pathname.startsWith('/api/')) return;

  // Private pages must never enter the offline response cache.
  if (/^\/(admin|profile)(?:\/|$)/.test(url.pathname)) return;

  // 1. Static assets (_astro bundles, icons, manifest, fonts, images)
  // Strategy: Cache-First with Network fallback & cache put
  const isStaticAsset =
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:js|css|svg|png|jpg|jpeg|webp|ico|webmanifest|woff|woff2)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // 2. Navigation / HTML pages
  // Strategy: Stale-While-Revalidate for instant page transitions & offline access
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const path = url.pathname;
      const hasSearch = Boolean(url.search);
      const withSlash = path.endsWith('/') ? path : path + '/';
      const noSlash = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;

      // 1. Check if cached version exists (exact request match; do not ignore search parameters)
      const cached = hasSearch
        ? await cache.match(request)
        : (await cache.match(request)) ||
          (await cache.match(path)) ||
          (await cache.match(withSlash)) ||
          (await cache.match(noSlash));

      // 2. Network fetch promise that updates the cache in background
      const fetchPromise = (async () => {
        try {
          const networkResponse = await fetchWithTimeout(request, 3500);
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            await cache.put(request, copy);
            // Only associate bare path with unparameterized responses to avoid poisoning root routes!
            if (!hasSearch) {
              await cache.put(path, networkResponse.clone());
              if (withSlash !== path) await cache.put(withSlash, networkResponse.clone());
              if (noSlash !== path) await cache.put(noSlash, networkResponse.clone());
            }
          }
          return networkResponse;
        } catch {
          return null;
        }
      })();

      // 3. If cached, serve immediately (0ms) and update cache in background
      if (cached) {
        event.waitUntil(fetchPromise);
        return cached;
      }

      // 4. Not in cache yet: await network fetch
      const networkResponse = await fetchPromise;
      if (networkResponse) return networkResponse;

      // 5. Offline or network failed: fall back to cached home page or offline.html
      const fallback =
        (await cache.match('/', { ignoreSearch: true })) ||
        (await cache.match('/index.html', { ignoreSearch: true })) ||
        (await cache.match('/offline.html', { ignoreSearch: true }));
      if (fallback) return fallback;

      return new Response('الموقع غير متصل بالإنترنت حالياً.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })()
  );
});
