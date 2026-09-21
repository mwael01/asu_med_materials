// Service Worker for ASU Med Materials PWA
// Provides 100% offline access to all static materials, pages, and assets.

const CACHE_NAME = 'asumed-cache-v2';

// 1. Static brand assets & icons
const PRECACHE_ASSETS = [
  '/',
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
  '/offline.html'
];

// 2. All 51 static routes in the website
const PRECACHE_ROUTES = [
  '/',
  '/contribute',
  '/search',
  '/playlists',
  '/year/1',
  '/year/2',
  '/year/3',
  '/year/4',
  '/year/5',
  '/module/year2-blood',
  '/module/year2-blood/anatomy',
  '/module/year2-blood/biochemistry',
  '/module/year2-blood/clinical',
  '/module/year2-blood/histology',
  '/module/year2-blood/microbiology',
  '/module/year2-blood/parasitology',
  '/module/year2-blood/pathology',
  '/module/year2-blood/pharmacology',
  '/module/year2-blood/physiology',
  '/playlist/bld-anat-abdullah',
  '/playlist/bld-anat-ahmad-fareed',
  '/playlist/bld-anat-mohammed',
  '/playlist/bld-anat-sameh',
  '/playlist/bld-anat-shareef',
  '/playlist/bld-anat-wageh',
  '/playlist/bld-anat-wahdan',
  '/playlist/bld-biochem-ayman',
  '/playlist/bld-biochem-esawi',
  '/playlist/bld-biochem-marwa',
  '/playlist/bld-biochem-mohammed',
  '/playlist/bld-biochem-walaa-1',
  '/playlist/bld-biochem-walaa-2',
  '/playlist/bld-histo-ahmeed-nerd',
  '/playlist/bld-histo-eman-nabil',
  '/playlist/bld-histo-faten',
  '/playlist/bld-histo-shireen-blood',
  '/playlist/bld-histo-shireen-lymph',
  '/playlist/bld-micro-atef',
  '/playlist/bld-micro-mofy',
  '/playlist/bld-micro-ninja-nerd',
  '/playlist/bld-micro-sherif',
  '/playlist/bld-para-ayman-ibrahim',
  '/playlist/bld-para-habib',
  '/playlist/bld-patho-sharkawy',
  '/playlist/bld-pharma-nour-eldin',
  '/playlist/bld-pharma-shaer',
  '/playlist/bld-phys-ahmed',
  '/playlist/bld-phys-fayez',
  '/playlist/bld-phys-nagi',
  '/playlist/bld-phys-najeeb',
  '/playlist/bld-phys-ninja-nerd'
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

      // 1. Fetch home page to extract and cache current _astro CSS/JS bundles
      try {
        const homeRes = await fetch('/', { cache: 'reload' });
        if (homeRes.ok) {
          await cache.put('/', homeRes.clone());
          const html = await homeRes.text();
          const assetMatches = [...html.matchAll(/(?:href|src)="(\/_astro\/[^"]+)"/g)];
          const assetUrls = [...new Set(assetMatches.map((m) => m[1]))];
          await Promise.all(
            assetUrls.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))
          );
        }
      } catch (err) {
        // Silently skip if offline during install
      }

      // 2. Precache static assets & icons
      await Promise.all(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(new Request(asset, { cache: 'reload' })).catch(() => {})
        )
      );

      // 3. Precache all routes (with both canonical path and trailing slash)
      await Promise.all(
        PRECACHE_ROUTES.map(async (route) => {
          try {
            const res = await fetch(route, { cache: 'reload' });
            if (res.ok) {
              await cache.put(route, res.clone());
              const withSlash = route.endsWith('/') ? route : route + '/';
              const noSlash = route.endsWith('/') && route !== '/' ? route.slice(0, -1) : route;
              if (withSlash !== route) await cache.put(withSlash, res.clone());
              if (noSlash !== route) await cache.put(noSlash, res.clone());
            }
          } catch (err) {
            // Silently continue
          }
        })
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
          if (key !== CACHE_NAME) {
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

  // Ignore other external origins (YouTube iframe embeds, drives, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip API routes — always network
  if (url.pathname.startsWith('/api/')) return;

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
  // Strategy: Network-First (with timeout) and Cache fallback
  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetchWithTimeout(request, 2500);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          const copy = networkResponse.clone();
          cache.put(request, copy);

          // Also store under canonical pathname variations
          const path = url.pathname;
          const withSlash = path.endsWith('/') ? path : path + '/';
          const noSlash = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
          cache.put(path, networkResponse.clone());
          if (withSlash !== path) cache.put(withSlash, networkResponse.clone());
          if (noSlash !== path) cache.put(noSlash, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // Offline or network timed out — look up in cache
        const cache = await caches.open(CACHE_NAME);

        // 1. Try exact request (with or without query parameters)
        let matched = await cache.match(request, { ignoreSearch: true });
        if (matched) return matched;

        // 2. Try pathname
        const path = url.pathname;
        matched = await cache.match(path, { ignoreSearch: true });
        if (matched) return matched;

        // 3. Try pathname with trailing slash
        matched = await cache.match(path.endsWith('/') ? path : path + '/', { ignoreSearch: true });
        if (matched) return matched;

        // 4. Try pathname without trailing slash
        if (path.endsWith('/') && path !== '/') {
          matched = await cache.match(path.slice(0, -1), { ignoreSearch: true });
          if (matched) return matched;
        }

        // 5. Fall back to cached home page or offline.html
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
      }
    })()
  );
});
