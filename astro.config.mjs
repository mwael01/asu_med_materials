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
          const createApiHandler = (handlerPath) => (req, res) => {
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
              const { default: handler } = await import(handlerPath);
              await handler(req, res);
            });
          };

          server.middlewares.use('/api/submit-material', createApiHandler('./api/submit-material.ts'));
          server.middlewares.use('/api/submit-feedback', createApiHandler('./api/submit-feedback.ts'));
        }
      }
    ]
  }
});