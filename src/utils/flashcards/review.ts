import type {
  FlashcardCard,
  FlashcardProgress,
  FlashcardRating,
  ReviewProgress,
  ReviewState,
} from '../../types/flashcards';

export function createReviewState(cards: FlashcardCard[], progress?: FlashcardProgress): ReviewState {
  const seenSources = new Set<string>();
  const seenIds = new Set<string>();
  const valid: FlashcardCard[] = [];
  for (const card of cards) {
    if (card.quarantined) continue;
    const key = (card.sourceNoteGuid && typeof card.sourceTemplateOrdinal === 'number')
      ? `${card.sourceNoteGuid}:${card.sourceTemplateOrdinal}`
      : card.id;
    if (seenSources.has(key) || seenIds.has(card.id)) continue;
    seenSources.add(key);
    seenIds.add(card.id);
    valid.push(card);
  }
  valid.sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));

  const unseen: string[] = [];
  const again: string[] = [];
  for (const card of valid) {
    const saved = progress?.cards?.[card.id];
    const ratingIsCurrent = saved &&
      (saved.resetVersion || 0) === (progress?.resetVersion || 0) &&
      saved.contentHash === card.contentHash;
    if (ratingIsCurrent && saved.status === 'known') continue;
    if (ratingIsCurrent && saved.status === 'again') again.push(card.id);
    else unseen.push(card.id);
  }

  const pending = new Set([...unseen, ...again]);
  const queue: string[] = [];
  // Preserve the saved order, then append any newly pending cards in source order.
  for (const id of [...(progress?.pendingCardIds || []), ...unseen, ...again]) {
    if (!pending.delete(id)) continue;
    queue.push(id);
  }

  return {
    cards: valid,
    queue,
    revealed: false,
    paused: false,
    completed: valid.length > 0 && queue.length === 0,
  };
}

export function reviewProgress(state: ReviewState): ReviewProgress {
  const total = state.cards.length;
  const known = total - state.queue.length;
  const percent = total === 0 ? 0 : state.completed ? 100 : Math.min(99, Math.round(known / total * 100));
  return { total, known, percent };
}

export function currentCard(state: ReviewState): FlashcardCard | null {
  if (state.completed) return null;
  return state.cards.find((card) => card.id === state.queue[0]) || null;
}

export function reveal(state: ReviewState): ReviewState {
  if (state.paused || state.revealed || !currentCard(state)) return state;
  return { ...state, revealed: true };
}

export function rate(state: ReviewState, rating: FlashcardRating): ReviewState {
  if (!state.revealed || state.completed || state.paused || !currentCard(state)) return state;
  const [currentId, ...queue] = state.queue;
  if (rating === 'again') queue.push(currentId);
  return { ...state, queue, revealed: false, completed: queue.length === 0 };
}

export function togglePaused(state: ReviewState): ReviewState {
  if (!currentCard(state)) return state;
  return { ...state, paused: !state.paused };
}
