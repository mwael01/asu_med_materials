import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../src/middleware.ts';

function createMockContext(pathname, options = {}) {
  const headers = new Map();
  if (options.authorization) headers.set('authorization', options.authorization);
  if (options.cookie) headers.set('cookie', options.cookie);

  return {
    url: new URL(`https://example.com${pathname}`),
    request: {
      method: options.method || 'GET',
      headers: {
        has: (k) => headers.has(k.toLowerCase()),
        get: (k) => headers.get(k.toLowerCase()) || null
      }
    }
  };
}

function createMockNext(responseHeaders = {}) {
  return async () => {
    const headers = new Map(Object.entries(responseHeaders));
    return {
      status: 200,
      headers: {
        has: (k) => headers.has(k.toLowerCase()),
        get: (k) => headers.get(k.toLowerCase()) || null,
        set: (k, v) => headers.set(k.toLowerCase(), v)
      }
    };
  };
}

test('Middleware sets Edge CDN caching for public HTML pages including /modules', async () => {
  const publicPaths = ['/', '/modules', '/module/year2-respiratory', '/playlist/p-1', '/user/doctor', '/viewer/doc-123', '/collection/col-abc', '/contribute', '/feedback'];

  for (const path of publicPaths) {
    const ctx = createMockContext(path);
    const next = createMockNext();
    const res = await onRequest(ctx, next);

    assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate', `Path ${path} should have browser revalidation`);
    assert.equal(res.headers.get('vercel-cdn-cache-control'), 'public, s-maxage=900, stale-while-revalidate=86400', `Path ${path} should have Edge CDN caching`);
  }
});

test('Middleware preserves and sets Edge CDN caching for public API routes', async () => {
  const publicApiPaths = ['/api/materials', '/api/modules', '/api/lessons', '/api/collections'];

  for (const path of publicApiPaths) {
    const ctx = createMockContext(path);
    const next = createMockNext();
    const res = await onRequest(ctx, next);

    assert.equal(res.headers.get('cache-control'), 'public, max-age=60, s-maxage=1800, stale-while-revalidate=86400', `API ${path} should have public CDN cache`);
    assert.equal(res.headers.get('vercel-cdn-cache-control'), 'public, s-maxage=1800, stale-while-revalidate=86400', `API ${path} should have Edge CDN cache`);
  }
});

test('Middleware sets 5-minute Edge CDN cache for micro /api/version endpoint', async () => {
  const ctx = createMockContext('/api/version');
  const next = createMockNext();
  const res = await onRequest(ctx, next);

  assert.equal(res.headers.get('cache-control'), 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
  assert.equal(res.headers.get('vercel-cdn-cache-control'), 'public, s-maxage=300, stale-while-revalidate=86400');
});

test('Middleware sets 1-hour Edge CDN cache for /robots.txt and /sitemap.xml', async () => {
  for (const seoPath of ['/robots.txt', '/sitemap.xml']) {
    const ctx = createMockContext(seoPath);
    const next = createMockNext();
    const res = await onRequest(ctx, next);

    assert.equal(res.headers.get('cache-control'), 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    assert.equal(res.headers.get('vercel-cdn-cache-control'), 'public, s-maxage=3600, stale-while-revalidate=86400');
  }
});

test('Middleware marks authenticated requests and private routes as private, no-store', async () => {
  // Authenticated request to /modules
  const authCtx = createMockContext('/modules', { authorization: 'Bearer token' });
  const authNext = createMockNext();
  const authRes = await onRequest(authCtx, authNext);
  assert.equal(authRes.headers.get('cache-control'), 'private, no-store');

  // Request to /admin
  const adminCtx = createMockContext('/admin');
  const adminNext = createMockNext();
  const adminRes = await onRequest(adminCtx, adminNext);
  assert.equal(adminRes.headers.get('cache-control'), 'private, no-store');

  // Request to /profile
  const profileCtx = createMockContext('/profile');
  const profileNext = createMockNext();
  const profileRes = await onRequest(profileCtx, profileNext);
  assert.equal(profileRes.headers.get('cache-control'), 'private, no-store');
});
