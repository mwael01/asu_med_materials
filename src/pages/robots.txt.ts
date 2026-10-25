import type { APIRoute } from 'astro';
import { resolveSiteOrigin } from '../utils/seo';

export const GET: APIRoute = () => {
  const origin = resolveSiteOrigin(import.meta.env.PUBLIC_SITE_URL);
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    ''
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
};
