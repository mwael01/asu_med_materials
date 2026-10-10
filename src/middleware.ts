import { defineMiddleware } from 'astro:middleware';

/** Only anonymous, public HTML is eligible for shared CDN caching. */
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
  const publicPage = path === '/' || path === '/search' || path === '/contributors'
    || /^\/(year|module|playlist|flashcards)\//.test(path);
  if (context.request.method === 'GET' && publicPage && response.status === 200
    && !context.request.headers.has('authorization')
    && !context.request.headers.has('cookie') && !response.headers.has('set-cookie')) {
    response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    response.headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  } else {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
});
