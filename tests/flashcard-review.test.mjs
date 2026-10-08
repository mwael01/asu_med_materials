import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReviewState, currentCard, rate, reveal, reviewProgress, togglePaused } from '../src/utils/flashcards/review.ts';
import { mergeGuestProgress, rateProgress, resetProgress, selectProgress } from '../src/utils/flashcards/progress.ts';
import { createProgressStorage } from '../src/utils/flashcards/progressStorage.ts';

const card = (id, ordinal = 0, extra = {}) => ({
  id, deckId: 'test-deck', revisionId: 'r1', ordinal, kind: 'basic',
  questionHtml: `Question ${id}`, answerHtml: `Answer ${id}`, media: [],
  sourceNoteGuid: id, sourceTemplateOrdinal: 0, sourceDeckPath: '', contentHash: `hash-${id}`,
  ...extra,
});
const cards = ['A', 'B', 'C'].map((id, ordinal) => card(id, ordinal));
const progress = (extra = {}) => ({
  deckId: 'test-deck', revisionId: 'r1', checkpointIndex: 0, resetVersion: 1, updatedAt: 1, cards: {}, ...extra,
});
const savedCard = (id, status, extra = {}) => ({
  cardId: id, status, contentHash: `hash-${id}`, revisionId: 'r1', resetVersion: 1, updatedAt: 1, ...extra,
});
const answer = (state, rating) => rate(reveal(state), rating);
const tick = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('Again relocates a card once; only Known advances fixed-total progress', () => {
  let state = createReviewState(cards);
  assert.deepEqual(reviewProgress(state), { known: 0, total: 3, percent: 0 });
  state = answer(state, 'again');
  assert.deepEqual(state.queue, ['B', 'C', 'A']);
  assert.deepEqual(reviewProgress(state), { known: 0, total: 3, percent: 0 });
  state = answer(state, 'known');
  assert.deepEqual(state.queue, ['C', 'A']);
  assert.deepEqual(reviewProgress(state), { known: 1, total: 3, percent: 33 });
  for (let i = 0; i < 50; i++) {
    state = answer(state, 'again');
    assert.equal(state.queue.length, 2);
    assert.equal(new Set(state.queue).size, 2);
    assert.equal(reviewProgress(state).known, 1);
  }
  state = answer(state, 'known');
  assert.equal(state.completed, false);
  state = answer(state, 'known');
  assert.deepEqual(state.queue, []);
  assert.equal(state.completed, true);
  assert.equal(currentCard(state), null);
  assert.deepEqual(reviewProgress(state), { known: 3, total: 3, percent: 100 });
});

test('one-card Again remains pending and requires a fresh reveal every time', () => {
  let state = createReviewState([cards[0]]);
  for (let i = 0; i < 10; i++) {
    state = answer(state, 'again');
    assert.deepEqual(state.queue, ['A']);
    assert.equal(state.revealed, false);
    assert.equal(state.completed, false);
    assert.equal(reviewProgress(state).percent, 0);
    assert.strictEqual(rate(state, 'known'), state);
  }
  assert.equal(answer(state, 'known').completed, true);
});

test('unrevealed, paused, empty and completed states reject ratings', () => {
  const state = createReviewState(cards);
  assert.strictEqual(rate(state, 'again'), state);
  const paused = togglePaused(reveal(state));
  assert.strictEqual(rate(paused, 'known'), paused);
  assert.strictEqual(reveal(paused), paused);
  const empty = createReviewState([]);
  assert.strictEqual(reveal(empty), empty);
  assert.strictEqual(rate(empty, 'again'), empty);
  assert.equal(empty.completed, false);
  assert.deepEqual(reviewProgress(empty), { known: 0, total: 0, percent: 0 });
  const complete = answer(createReviewState([cards[0]]), 'known');
  assert.strictEqual(rate(complete, 'again'), complete);
  assert.strictEqual(reveal(complete), complete);
});

test('deck eligibility deduplicates IDs and source identity, excludes quarantined cards and sorts ordinals', () => {
  const state = createReviewState([
    cards[2], cards[0], card('A', 5, { sourceNoteGuid: 'different' }), cards[1],
    card('alias-B', 7, { sourceNoteGuid: 'B' }), card('hidden', 4, { quarantined: true }),
  ]);
  assert.deepEqual(state.queue, ['A', 'B', 'C']);
  assert.equal(state.cards.length, 3);
});

test('legacy numeric checkpoints never skip pending cards', () => {
  for (const checkpointIndex of [1, 99, -5]) {
    const state = createReviewState(cards, progress({ checkpointIndex, cards: {
      A: savedCard('A', 'again'), B: savedCard('B', 'known'),
    } }));
    assert.deepEqual(state.queue, ['C', 'A']);
    assert.equal(currentCard(state).id, 'C');
    assert.deepEqual(reviewProgress(state), { known: 1, total: 3, percent: 33 });
  }
});

test('saved pending order is restored and reconciled with current deck contents', () => {
  const state = createReviewState([...cards, card('D', 3), card('hidden', 4, { quarantined: true })], progress({
    pendingCardIds: ['C', 'removed', 'C', 'hidden', 'B'],
    cards: { B: savedCard('B', 'known'), A: savedCard('A', 'again') },
  }));
  assert.deepEqual(state.queue, ['C', 'D', 'A']);
  assert.deepEqual(reviewProgress(state), { known: 1, total: 4, percent: 25 });
});

test('changed hashes and stale reset generations are pending again', () => {
  const state = createReviewState(cards, progress({ cards: {
    A: savedCard('A', 'known', { contentHash: 'old-hash' }),
    B: savedCard('B', 'known', { resetVersion: 0 }),
    C: savedCard('C', 'known', { resetVersion: 2 }),
  } }));
  assert.deepEqual(state.queue, ['A', 'B', 'C']);
  assert.equal(reviewProgress(state).known, 0);
});

test('all valid Known statuses complete a reopened deck, even with stale saved queue IDs', () => {
  const state = createReviewState(cards, progress({
    pendingCardIds: ['A', 'B', 'C'],
    cards: Object.fromEntries(cards.map(({ id }) => [id, savedCard(id, 'known')])),
  }));
  assert.equal(state.completed, true);
  assert.deepEqual(reviewProgress(state), { total: 3, known: 3, percent: 100 });
});

test('rounding never reports 100% while a card is pending', () => {
  const many = Array.from({ length: 1000 }, (_, i) => card(String(i), i));
  const state = createReviewState(many, progress({ cards: Object.fromEntries(
    many.slice(1).map(({ id }) => [id, savedCard(id, 'known')]),
  ) }));
  assert.deepEqual(reviewProgress(state), { total: 1000, known: 999, percent: 99 });
});

test('ratings save status and queue together; reopening preserves the next card exactly', () => {
  let state = createReviewState(cards);
  let saved = progress();
  for (const rating of ['again', 'known', 'again', 'again', 'known', 'known']) {
    const current = currentCard(state);
    state = answer(state, rating);
    const previous = saved;
    saved = rateProgress(saved, current.id, rating, current.contentHash, 'r1', state.queue);
    assert.equal(saved.cards[current.id].status, rating);
    assert.equal(saved.checkpointIndex, 0);
    assert.ok(saved.updatedAt > previous.updatedAt);
    assert.deepEqual(createReviewState(cards, saved).queue, state.queue);
    assert.deepEqual(reviewProgress(createReviewState(cards, saved)), reviewProgress(state));
  }
});

test('reset and fresh review replace saved completion with a resumable source-order queue', () => {
  const old = progress({ cards: { A: savedCard('A', 'known') }, pendingCardIds: ['C', 'B'] });
  const fresh = createReviewState(cards);
  const saved = resetProgress(old, fresh.queue);
  assert.equal(saved.resetVersion, 2);
  assert.deepEqual(saved.cards, {});
  assert.deepEqual(saved.pendingCardIds, ['A', 'B', 'C']);
  // Firestore merge can retain older card entries: resetVersion must still invalidate them.
  assert.deepEqual(createReviewState(cards, { ...saved, cards: old.cards }).queue, ['A', 'B', 'C']);
  assert.equal(reviewProgress(createReviewState(cards, saved)).known, 0);
});

test('snapshot selection prioritizes reset generation, then time, and keeps local ties', () => {
  const local = progress({ resetVersion: 2, updatedAt: 20 });
  assert.strictEqual(selectProgress(local, progress({ resetVersion: 1, updatedAt: 100 })), local);
  assert.strictEqual(selectProgress(local, progress({ resetVersion: 2, updatedAt: 19 })), local);
  assert.strictEqual(selectProgress(local, progress({ resetVersion: 2, updatedAt: 20 })), local);
  const newer = progress({ resetVersion: 2, updatedAt: 21 });
  assert.strictEqual(selectProgress(local, newer), newer);
  const reset = progress({ resetVersion: 3, updatedAt: 1 });
  assert.strictEqual(selectProgress(local, reset), reset);
  assert.strictEqual(selectProgress(null, newer), newer);
  assert.strictEqual(selectProgress(local, null), local);
});

test('guest merge keeps user conflicts and user queue order, then appends guest-only pending cards', () => {
  const guest = progress({ pendingCardIds: ['B', 'C', 'A'], cards: {
    A: savedCard('A', 'again'), B: savedCard('B', 'again'),
  } });
  const user = progress({ pendingCardIds: ['C', 'A', 'C'], cards: { A: savedCard('A', 'known') } });
  const merged = mergeGuestProgress(guest, user);
  assert.equal(merged.cards.A.status, 'known');
  assert.deepEqual(createReviewState(cards, merged).queue, ['C', 'B']);
  assert.deepEqual(merged.pendingCardIds, ['C', 'B']);
  assert.deepEqual(createReviewState(cards, mergeGuestProgress(guest, null)).queue, ['B', 'C', 'A']);
});

test('merged stale statuses remain pending after a newer reset', () => {
  const merged = mergeGuestProgress(progress({ resetVersion: 2, pendingCardIds: ['B', 'A'] }), progress({
    cards: { A: savedCard('A', 'known') }, pendingCardIds: ['C'],
  }));
  assert.deepEqual(createReviewState(cards, merged).queue, ['C', 'B', 'A']);
});

function storageHarness(extra = {}, timeout = 100) {
  const local = new Map();
  const calls = [];
  const adapter = {
    loadLocal: async (uid, deckId) => local.get(`${uid}:${deckId}`) || null,
    saveLocal: async (uid, value) => { local.set(`${uid}:${value.deckId}`, structuredClone(value)); },
    loadRemote: async () => null,
    saveRemote: async (uid, value) => { calls.push([uid, structuredClone(value)]); return true; },
    isOnline: () => true,
    ...extra,
  };
  return { local, calls, adapter, storage: createProgressStorage(adapter, timeout) };
}

test('loading awaits cloud selection and caches the returned snapshot before rendering', async () => {
  const cloud = deferred();
  const h = storageHarness({ loadRemote: () => cloud.promise });
  const old = progress({ pendingCardIds: ['A', 'B', 'C'] });
  const remote = progress({ updatedAt: 10, pendingCardIds: ['C', 'A'], cards: { B: savedCard('B', 'known') } });
  h.local.set('user:test-deck', old);
  let returned = false;
  const loading = h.storage.load('user', 'test-deck').then((value) => { returned = true; return value; });
  await tick();
  assert.equal(returned, false);
  cloud.resolve(remote);
  assert.deepEqual(await loading, remote);
  assert.deepEqual(h.local.get('user:test-deck'), remote);
});

test('offline, failed and timed-out cloud reads retain local progress without late overwrites', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const pending = deferred();
  const loadPending = () => pending.promise;
  const saved = progress({ updatedAt: 50, pendingCardIds: ['C', 'B', 'A'] });
  for (const extra of [
    { isOnline: () => false, loadRemote: () => { throw Error('must not read'); } },
    { loadRemote: async () => { throw Error('offline'); } },
    { loadRemote: loadPending },
  ]) {
    const h = storageHarness(extra, 10);
    h.local.set('user:test-deck', saved);
    assert.deepEqual(await h.storage.load('user', 'test-deck'), saved);
    if (extra.loadRemote === loadPending) pending.resolve(progress({ updatedAt: 100 }));
    await tick();
    assert.deepEqual(h.local.get('user:test-deck'), saved);
  }
});

test('cloud progress still loads when the local cache is unavailable', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const remote = progress({ updatedAt: 10 });
  const h = storageHarness({
    loadLocal: async () => { throw Error('cache unavailable'); },
    saveLocal: async () => { throw Error('cache unavailable'); },
    loadRemote: async () => remote,
  });
  assert.deepEqual(await h.storage.load('user', 'test-deck'), remote);
});

test('a rating saved during cloud loading is not replaced by an older remote snapshot', async () => {
  const cloud = deferred();
  const h = storageHarness({ loadRemote: () => cloud.promise });
  const loading = h.storage.load('user', 'test-deck');
  await tick();
  const latest = progress({ updatedAt: 100, pendingCardIds: ['B', 'A'] });
  await h.storage.save('user', latest);
  cloud.resolve(progress({ updatedAt: 50, pendingCardIds: ['A', 'B'] }));
  assert.deepEqual(await loading, latest);
  assert.deepEqual(h.local.get('user:test-deck'), latest);
});

test('local and cloud writes are serialized independently, with immutable snapshots', async () => {
  const firstLocal = deferred();
  const firstRemote = deferred();
  const localCalls = [];
  const remoteCalls = [];
  const h = storageHarness({
    saveLocal: async (_uid, value) => { localCalls.push(value); if (localCalls.length === 1) await firstLocal.promise; },
    saveRemote: async (_uid, value) => { remoteCalls.push(value); if (remoteCalls.length === 1) await firstRemote.promise; return true; },
  });
  const first = progress({ pendingCardIds: ['B', 'A'], cards: { A: savedCard('A', 'again') } });
  const one = h.storage.save('user', first);
  const two = h.storage.save('user', progress({ updatedAt: 2, pendingCardIds: ['A'] }));
  first.pendingCardIds.push('invalid');
  first.cards.A.status = 'known';
  await tick();
  assert.equal(localCalls.length, 1);
  assert.equal(remoteCalls.length, 0);
  firstLocal.resolve();
  await Promise.all([one, two]);
  assert.equal(localCalls.length, 2);
  assert.equal(remoteCalls.length, 1);
  assert.deepEqual(localCalls[0].pendingCardIds, ['B', 'A']);
  assert.equal(localCalls[0].cards.A.status, 'again');
  firstRemote.resolve();
  await tick();
  assert.equal(remoteCalls.length, 2);
  assert.equal(remoteCalls[1].updatedAt, 2);
});

test('save failure does not poison later local or cloud writes, and decks use independent queues', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let saves = 0;
  let syncs = 0;
  const h = storageHarness({
    saveLocal: async () => { if (++saves === 1) throw Error('write failed'); },
    saveRemote: async () => { if (++syncs === 1) throw Error('sync failed'); return true; },
  });
  await assert.rejects(h.storage.save('user', progress()), /write failed/);
  await h.storage.save('user', progress({ updatedAt: 2 }));
  await tick();
  assert.equal(saves, 2);
  assert.equal(syncs, 2);
  const held = deferred();
  const other = storageHarness({ saveLocal: async (_uid, value) => { if (value.deckId === 'held') await held.promise; } });
  const waiting = other.storage.save('user', progress({ deckId: 'held' }));
  await other.storage.save('user', progress({ deckId: 'free' }));
  held.resolve();
  await waiting;
});
