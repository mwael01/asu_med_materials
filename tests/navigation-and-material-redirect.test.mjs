import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('Service worker v12 enforces relaxed navigation timeout and isolates home redirect', () => {
  const swContent = fs.readFileSync(path.join(projectRoot, 'public/sw.js'), 'utf-8');

  // Verify cache name bump
  assert.match(swContent, /CACHE_NAME\s*=\s*'asumed-cache-v12'/, 'Service worker cache should be bumped to v12');

  // Verify timeout is relaxed to 12s
  assert.match(swContent, /fetchWithTimeout\(request,\s*12000\)/, 'Service worker navigation timeout must be at least 12000ms');

  // Verify that sub-routes never fall back to home ('/')
  assert.match(swContent, /if\s*\(path === '\/' \|\| path === '\/index\.html'\)/, 'Only root path may fall back to cached /');
  assert.match(swContent, /const offlineFallback = await cache\.match\('\/offline\.html'/, 'Sub-routes must fall back to /offline.html');
});

test('Material and Playlist viewers redirect non-existent resources to /404', () => {
  const viewerContent = fs.readFileSync(path.join(projectRoot, 'src/pages/viewer/[id].astro'), 'utf-8');
  const playlistContent = fs.readFileSync(path.join(projectRoot, 'src/pages/playlist/[id].astro'), 'utf-8');

  assert.doesNotMatch(viewerContent, /return Astro\.redirect\('\/\?redirect=false'\)/, 'Viewer must not redirect missing items to /?redirect=false');
  assert.match(viewerContent, /return Astro\.redirect\('\/404'\)/, 'Viewer must redirect missing items to /404');

  assert.doesNotMatch(playlistContent, /return Astro\.redirect\('\/\?redirect=false'\)/, 'Playlist player must not redirect missing items to /?redirect=false');
  assert.match(playlistContent, /return Astro\.redirect\('\/404'\)/, 'Playlist player must redirect missing items to /404');
});

test('Index page respects redirect=false query parameter', () => {
  const indexContent = fs.readFileSync(path.join(projectRoot, 'src/pages/index.astro'), 'utf-8');

  assert.match(indexContent, /Astro\.url\.searchParams\.get\('redirect'\) !== 'false'/, 'SSR must check redirect=false');
  assert.match(indexContent, /params\.get\('redirect'\) === 'false'/, 'Client script must check redirect=false');
});

test('Layout.astro includes global navigation loading indicator', () => {
  const layoutContent = fs.readFileSync(path.join(projectRoot, 'src/layouts/Layout.astro'), 'utf-8');

  assert.match(layoutContent, /id="global-nav-progress"/, 'Layout must contain global-nav-progress element');
  assert.match(layoutContent, /astro:before-preparation/, 'Layout must listen to astro:before-preparation');
  assert.match(layoutContent, /astro:page-load/, 'Layout must listen to astro:page-load');
});
