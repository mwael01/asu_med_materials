import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [
    AstroPWA({
      // Use 'generateSW' so Workbox auto-builds the service worker from our config.
      // The generated sw.js is placed in /dist at build time.
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: 'script',

      // Workbox config — defines what gets precached and runtime-cached
      workbox: {
        // Pre-cache all pages and static assets emitted by the Astro build
        globDirectory: 'dist',
        globPatterns: [
          '**/*.{html,js,css,svg,png,ico,webmanifest,woff,woff2}'
        ],

        // Navigation fallback: serve index.html for any unmatched HTML request
        // (handles direct URL loads when offline)
        navigateFallback: '/',
        navigateFallbackDenylist: [/^\/api\//],

        // Runtime caching rules (for resources NOT pre-cached)
        runtimeCaching: [
          {
            // Cache Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Cache Google Fonts files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
          // NOTE: YouTube embeds are external and cannot be cached.
          // Playlist video playback requires internet — only the app shell works offline.
        ],

        // Skip waiting + claim clients immediately
        skipWaiting: true,
        clientsClaim: true,
      },

      // Manifest is in public/manifest.webmanifest — don't let vite-pwa override it
      manifest: false,

      // Dev options — disable SW in dev to avoid stale cache issues
      devOptions: {
        enabled: false,
      }
    })
  ],

  vite: {
    plugins: [
      tailwindcss(),
      {
        name: 'api-dev-middleware',
        configureServer(server) {
          server.middlewares.use('/api/submit-material', (req, res) => {
            /** @type {any[]} */
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', async () => {
              try {
                // @ts-ignore
                const raw = Buffer.concat(chunks).toString();
                // @ts-ignore
                req.body = raw ? JSON.parse(raw) : {};
              } catch {
                // @ts-ignore
                req.body = {};
              }
              const { default: handler } = await import('./api/submit-material.js');
              await handler(req, res);
            });
          });
        }
      }
    ]
  }
});