import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
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
              const { default: handler } = await import('./api/submit-material.ts');
              await handler(req, res);
            });
          });
        }
      }
    ]
  }
});