import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isHomePage,
  shouldShowPwaInstallPrompt,
  isPwaPromptDismissed,
  setPwaPromptDismissed,
  PWA_DISMISS_DURATION_MS
} from '../src/utils/pwa.ts';

test('isHomePage correctly identifies the home page and rejects non-home routes', () => {
  assert.equal(isHomePage('/'), true);
  assert.equal(isHomePage(''), true);
  assert.equal(isHomePage('/index.html'), true);
  assert.equal(isHomePage('//'), true);

  // Non-home routes must return false
  assert.equal(isHomePage('/modules'), false);
  assert.equal(isHomePage('/module/year2-respiratory'), false);
  assert.equal(isHomePage('/module/year2-respiratory/anatomy'), false);
  assert.equal(isHomePage('/year/2'), false);
  assert.equal(isHomePage('/videos'), false);
  assert.equal(isHomePage('/pdfs'), false);
  assert.equal(isHomePage('/flashcards'), false);
  assert.equal(isHomePage('/team'), false);
  assert.equal(isHomePage('/search'), false);
  assert.equal(isHomePage('/contribute'), false);
});

test('shouldShowPwaInstallPrompt is true strictly on home page when uninstalled and not dismissed', () => {
  assert.equal(shouldShowPwaInstallPrompt('/', false, false), true);
  assert.equal(shouldShowPwaInstallPrompt('', false, false), true);

  // False if on any other page
  assert.equal(shouldShowPwaInstallPrompt('/modules', false, false), false);
  assert.equal(shouldShowPwaInstallPrompt('/module/year2-respiratory', false, false), false);
  assert.equal(shouldShowPwaInstallPrompt('/year/1', false, false), false);
  assert.equal(shouldShowPwaInstallPrompt('/videos', false, false), false);
});

test('shouldShowPwaInstallPrompt is false if already installed or in standalone mode', () => {
  // Even on home page, must NEVER appear if already installed or standalone
  assert.equal(shouldShowPwaInstallPrompt('/', true, false), false);
  assert.equal(shouldShowPwaInstallPrompt('', true, false), false);
});

test('shouldShowPwaInstallPrompt is false if dismissed', () => {
  assert.equal(shouldShowPwaInstallPrompt('/', false, true), false);
  assert.equal(shouldShowPwaInstallPrompt('', false, true), false);
});

test('24-hour dismissal timestamp calculations', () => {
  const mockStorage = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k)
  };

  const baseTime = 1700000000000;
  setPwaPromptDismissed(PWA_DISMISS_DURATION_MS, baseTime);

  const storedUntil = Number(mockStorage.get('asumed_pwa_dismissed_until'));
  assert.equal(storedUntil, baseTime + 24 * 60 * 60 * 1000);

  // Within 24 hours: must be considered dismissed
  assert.equal(isPwaPromptDismissed(baseTime + 1000), true);
  assert.equal(isPwaPromptDismissed(baseTime + 12 * 60 * 60 * 1000), true);
  assert.equal(isPwaPromptDismissed(baseTime + 23 * 60 * 60 * 1000), true);

  // After 24 hours: dismissal expires
  assert.equal(isPwaPromptDismissed(baseTime + 24 * 60 * 60 * 1000 + 1), false);
  assert.equal(isPwaPromptDismissed(baseTime + 48 * 60 * 60 * 1000), false);

  delete globalThis.window;
  delete globalThis.localStorage;
});
