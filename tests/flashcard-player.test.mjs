import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as review from '../src/utils/flashcards/review.ts';
import * as progress from '../src/utils/flashcards/progress.ts';
import { t } from '../src/utils/i18n.ts';
import { createRatingFlow } from '../src/scripts/flashcards/ratingFlow.ts';

const playerSource = await readFile(new URL('../src/scripts/flashcards/player.ts', import.meta.url), 'utf8');
const playerCode = ts.transpileModule(playerSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(setImmediate);
const sampleCards = (count = 3) => Array.from({ length: count }, (_, i) => ({
  id: String(i), deckId: 'test-deck', revisionId: 'r1', ordinal: i, kind: 'basic',
  questionHtml: `Question ${i}`, answerHtml: `Answer ${i}`, contentHash: `hash-${i}`,
  sourceNoteGuid: String(i), sourceTemplateOrdinal: 0, sourceDeckPath: '', media: [],
}));

class EventHub {
  listeners = new Map();
  addEventListener(name, callback, options) {
    const handlers = this.listeners.get(name) || [];
    handlers.push({ callback, signal: options?.signal });
    this.listeners.set(name, handlers);
  }
  dispatch(name, event = {}) {
    const input = { preventDefault() {}, stopPropagation() {}, target: null, ...event };
    for (const { callback, signal } of this.listeners.get(name) || []) {
      if (!signal?.aborted) callback(input);
    }
  }
}
class Element extends EventHub {
  attributes = new Map();
  style = {};
  textContent = '';
  innerHTML = '';
  className = '';
  hiddenClasses = new Set();
  classList = {
    add: (...names) => names.forEach((name) => this.hiddenClasses.add(name)),
    remove: (...names) => names.forEach((name) => this.hiddenClasses.delete(name)),
    contains: (name) => this.hiddenClasses.has(name),
    toggle: (name, force) => {
      const add = force ?? !this.hiddenClasses.has(name);
      if (add) this.hiddenClasses.add(name);
      else this.hiddenClasses.delete(name);
      return add;
    },
  };
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  querySelector() { return this.span ||= new Element(); }
  querySelectorAll() { return []; }
  closest() { return null; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
class Button extends Element { disabled = false; }

function playerHarness(cards = sampleCards(), saved = null, storage = {}) {
  const elements = new Map();
  const document = new EventHub();
  const window = new EventHub();
  const h = { elements, document, window, saved, saves: [], language: 'en', gestures: null };
  document.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, id.startsWith('btn-') ? new Button() : new Element());
    return elements.get(id);
  };
  document.querySelector = () => document.getElementById('dialog-confirm-reset').open ? {} : null;
  const container = document.getElementById('study-player-container');
  container.setAttribute('data-deck', JSON.stringify({ id: 'test-deck', activeRevisionId: 'r1' }));
  container.setAttribute('data-initial-cards', JSON.stringify(cards));
  for (const id of ['session-complete-screen', 'session-empty-screen', 'session-paused-screen', 'card-hint-panel', 'card-answer-container']) {
    document.getElementById(id).classList.add('hidden');
  }
  const dependencies = {
    '../../utils/flashcards/review': review,
    '../../utils/flashcards/progress': progress,
    '../../utils/flashcards/persistence': {
      loadFlashcardProgress: async () => h.saved,
      saveFlashcardProgress: async (_uid, value) => {
        h.saves.push(structuredClone(value));
        if (storage.save) await storage.save(value);
        h.saved = structuredClone(value);
      },
      getCachedCards: async () => null,
      cacheCardsPayload: async () => {},
      cacheDeckMetadata: async () => {},
    },
    '../../firebase/auth': { getCachedUserProfile: () => null },
    '../../utils/flashcards/caching': { cacheDeckImagesOnOpen: async () => {} },
    '../../utils/i18n': { t, getCurrentLanguage: () => h.language },
    './cardHtml': { prepareCardHtml: (html) => ({ html, hintText: 'Test hint' }) },
    './gestures': { bindCardGestures: (_element, _shades, callbacks) => {
      h.gestures = callbacks;
      return { cancel() {}, cancelActive() {} };
    } },
    './animations': { createCardAnimations: () => ({
      exit: async () => true, enter: async () => true, settle: async () => true, reset() {}, reveal() {},
    }) },
    './ratingFlow': { createRatingFlow },
  };
  runInNewContext(playerCode, {
    require: (name) => {
      assert.ok(dependencies[name], `Unexpected player dependency ${name}`);
      return dependencies[name];
    },
    exports: {}, document, window, console, AbortController, HTMLButtonElement: Button,
  });
  h.element = (id) => document.getElementById(id);
  h.click = async (id) => {
    if (!h.element(id).disabled) h.element(id).dispatch('click');
    await tick();
  };
  h.key = async (key) => { window.dispatch('keydown', { key, code: key }); await tick(); };
  return h;
}

test('player buttons, keyboard and gesture ratings share fixed-total completion and saved order', async () => {
  const h = playerHarness();
  await tick();
  assert.equal(h.element('player-progress-counter').textContent, '0 of 3 completed');
  assert.equal(h.element('player-progress-percent').textContent, '0%');
  await h.click('btn-reveal-answer');
  await h.click('btn-rate-again');
  assert.deepEqual(h.saved.pendingCardIds, ['1', '2', '0']);
  assert.equal(h.saved.cards['0'].status, 'again');
  assert.equal(h.element('player-progress-counter').textContent, '0 of 3 completed');
  await h.key('Space');
  h.gestures.rate('known');
  await tick();
  assert.deepEqual(h.saved.pendingCardIds, ['2', '0']);
  assert.equal(h.element('player-progress-counter').textContent, '1 of 3 completed');
  assert.equal(h.element('player-progress-percent').textContent, '33%');
  await h.key('Space');
  await h.key('ArrowLeft');
  assert.deepEqual(h.saved.pendingCardIds, ['0', '2']);
  assert.equal(h.element('player-progress-percent').textContent, '33%');
  await h.key('Space');
  await h.key('ArrowRight');
  await h.key('Space');
  await h.key('ArrowRight');
  assert.equal(h.element('player-progress-counter').textContent, '3 of 3 completed');
  assert.equal(h.element('player-progress-percent').textContent, '100%');
  assert.equal(h.element('session-complete-screen').classList.contains('hidden'), false);
  assert.deepEqual(h.saved.pendingCardIds, []);
  const reopened = playerHarness(sampleCards(), h.saved);
  await tick();
  assert.equal(reopened.element('session-complete-screen').classList.contains('hidden'), false);
});

test('one-card Again clears answer and hint presentation and cannot rate twice without revealing', async () => {
  const h = playerHarness(sampleCards(1));
  await tick();
  await h.click('btn-reveal-answer');
  await h.click('btn-toggle-hint');
  assert.equal(h.element('card-hint-panel').classList.contains('hidden'), false);
  assert.ok(h.element('card-answer-body').innerHTML);
  await h.click('btn-rate-again');
  assert.equal(h.element('card-answer-body').innerHTML, '');
  assert.equal(h.element('card-answer-container').classList.contains('hidden'), true);
  assert.equal(h.element('card-hint-panel').classList.contains('hidden'), true);
  assert.equal(h.element('session-complete-screen').classList.contains('hidden'), true);
  await h.click('btn-rate-known');
  assert.equal(h.saves.length, 1);
  await h.click('btn-reveal-answer');
  await h.click('btn-rate-known');
  assert.equal(h.element('player-progress-percent').textContent, '100%');
});

test('resume, pause and language changes retain truthful progress and dynamic translation parameters', async () => {
  const h = playerHarness();
  await tick();
  await h.click('btn-reveal-answer');
  await h.click('btn-rate-again');
  await h.click('btn-reveal-answer');
  await h.click('btn-rate-known');
  const reopened = playerHarness(sampleCards(), h.saved);
  await tick();
  assert.equal(reopened.element('card-question-body').innerHTML, 'Question 2');
  assert.equal(reopened.element('player-progress-percent').textContent, '33%');
  await reopened.click('btn-pause-session');
  reopened.language = 'ar';
  reopened.window.dispatch('asumed-language-changed');
  assert.equal(reopened.element('player-progress-counter').textContent, 'اكتملت 1 من 3 بطاقة');
  assert.deepEqual(JSON.parse(reopened.element('player-progress-counter').getAttribute('data-i18n-params')), { known: 1, total: 3 });
  assert.equal(reopened.element('session-paused-screen').classList.contains('hidden'), false);
  await reopened.key('Space');
  await reopened.key('ArrowRight');
  assert.equal(reopened.saves.length, 0);
  await reopened.click('btn-resume-session');
  assert.equal(reopened.element('card-question-body').innerHTML, 'Question 2');
});

test('Review again and Reset save a fresh pass before allowing further ratings', async () => {
  let release;
  let held = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = playerHarness(sampleCards(1), null, { save: async () => { if (held) await gate; } });
  await tick();
  await h.click('btn-reveal-answer');
  await h.click('btn-rate-known');
  held = true;
  await h.click('btn-review-again');
  assert.equal(h.element('btn-reveal-answer').disabled, true);
  await h.key('Space');
  await h.key('ArrowRight');
  assert.equal(h.saves.length, 2);
  assert.equal(h.saves[1].resetVersion, 2);
  assert.deepEqual(h.saves[1].cards, {});
  assert.deepEqual(h.saves[1].pendingCardIds, ['0']);
  held = false;
  release();
  await tick();
  assert.equal(h.element('player-progress-counter').textContent, '0 of 1 completed');
  assert.equal(h.element('btn-reveal-answer').disabled, false);
  const reopened = playerHarness(sampleCards(1), h.saved);
  await tick();
  assert.equal(reopened.element('session-complete-screen').classList.contains('hidden'), true);
  await h.click('btn-reveal-answer');
  await h.click('btn-rate-known');
  await h.click('btn-reset-session');
  await h.click('btn-confirm-reset');
  assert.equal(h.saved.resetVersion, 3);
  assert.deepEqual(h.saved.pendingCardIds, ['0']);
  assert.equal(h.element('player-progress-percent').textContent, '0%');
});

test('empty and quarantined decks show an empty state, never completed or 100%', async () => {
  for (const cards of [[], sampleCards(1).map((card) => ({ ...card, quarantined: true }))]) {
    const h = playerHarness(cards);
    await tick();
    assert.equal(h.element('session-empty-screen').classList.contains('hidden'), false);
    assert.equal(h.element('session-complete-screen').classList.contains('hidden'), true);
    assert.equal(h.element('player-progress-counter').textContent, '0 of 0 completed');
    assert.equal(h.element('player-progress-percent').textContent, '0%');
    assert.equal(h.element('btn-pause-session').disabled, true);
    assert.equal(h.element('btn-reset-session').disabled, true);
  }
});

test('occlusion cards hide the top overlay on reveal and toggle via button', async () => {
  const overlayMock = new Element();
  overlayMock.id = 'io-overlay';
  const cards = [{
    id: 'io-1', deckId: 'test-deck', revisionId: 'r1', ordinal: 0, kind: 'occlusion',
    questionHtml: '<div id="io-wrapper"><div id="io-overlay"><img src="q.svg"></div><div id="io-original"><img src="base.jpg"></div></div>',
    answerHtml: '<div id="io-extra">Notes</div>',
    contentHash: 'hash-io-1',
    sourceNoteGuid: 'io-1', sourceTemplateOrdinal: 0, sourceDeckPath: '', media: [],
  }];
  const h = playerHarness(cards);
  h.element('card-question-body').querySelectorAll = (sel) => {
    if (sel.includes('#io-overlay')) return [overlayMock];
    return [];
  };
  await tick();
  // Question mode: overlay is visible
  assert.equal(overlayMock.classList.contains('is-hidden'), false);
  assert.equal(h.element('card-occlusion-container').classList.contains('hidden'), true);

  // Reveal answer: top overlay is hidden
  await h.click('btn-reveal-answer');
  assert.equal(overlayMock.classList.contains('is-hidden'), true);
  assert.equal(overlayMock.style.display, 'none');
  assert.equal(h.element('card-occlusion-container').classList.contains('hidden'), false);

  // Toggle mask button shows overlay again
  await h.click('btn-toggle-occlusion');
  assert.equal(overlayMock.classList.contains('is-hidden'), false);
  assert.equal(overlayMock.style.display, '');

  // Toggle again hides it
  await h.click('btn-toggle-occlusion');
  assert.equal(overlayMock.classList.contains('is-hidden'), true);
  assert.equal(overlayMock.style.display, 'none');
});

