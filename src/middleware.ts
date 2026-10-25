import { defineMiddleware } from 'astro:middleware';

const PUBLIC_STATIC_PAGES = new Set([
  '/',
  '/modules',
  '/search',
  '/team',
  '/contributors',
  '/contribute',
  '/feedback'
]);

const PUBLIC_API_ROUTES = new Set([
  '/api/materials',
  '/api/modules',
  '/api/lessons',
  '/api/collections',
  '/api/version'
]);

const PUBLIC_SEO_ROUTES = new Set([
  '/robots.txt',
  '/sitemap.xml'
]);

const isPublicPage = (path: string): boolean =>
  PUBLIC_STATIC_PAGES.has(path) ||
  /^\/(year|module|playlist|flashcards|user|collection|viewer)\//.test(path);

/** Only anonymous, public resources are eligible for shared CDN caching. */
export const onRequest = defineMiddleware(async (context, next) => {
  let response: Response;
  try {
    response = await next();
  } catch (error) {
    console.error('[SSR] Page request failed:', error instanceof Error ? error.message : 'Unknown error');
    return new Response('The website is temporarily unavailable. Please try again.', {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const path = context.url.pathname;
  const isGet = context.request.method === 'GET';
  const isSuccess = response.status === 200;
  const isAnonymous =
    !context.request.headers.has('authorization') &&
    !context.request.headers.has('cookie') &&
    !response.headers.has('set-cookie');

  if (isGet && isSuccess && isAnonymous) {
    if (PUBLIC_API_ROUTES.has(path)) {
      // Micro version endpoint caches for 5 minutes; large catalogues for 30 minutes
      const sMaxAge = path === '/api/version' ? 300 : 1800;
      response.headers.set(
        'Cache-Control',
        `public, max-age=60, s-maxage=${sMaxAge}, stale-while-revalidate=86400`
      );
      response.headers.set(
        'Vercel-CDN-Cache-Control',
        `public, s-maxage=${sMaxAge}, stale-while-revalidate=86400`
      );
      return response;
    }

    if (PUBLIC_SEO_ROUTES.has(path)) {
      response.headers.set(
        'Cache-Control',
        'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
      );
      response.headers.set(
        'Vercel-CDN-Cache-Control',
        'public, s-maxage=3600, stale-while-revalidate=86400'
      );
      return response;
    }

    if (isPublicPage(path)) {
      // Browser revalidates HTML; Edge CDN caches for 15 minutes with 24h background SWR
      response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
      response.headers.set(
        'Vercel-CDN-Cache-Control',
        'public, s-maxage=900, stale-while-revalidate=86400'
      );
      return response;
    }
  }

  // Private, dynamic, or authenticated routes must never be cached on shared CDN
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
