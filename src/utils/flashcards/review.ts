import type { FlashcardCard, FlashcardProgress, FlashcardRating } from '../../types/flashcards';

export interface ReviewState {
  cards: FlashcardCard[];
  queue: string[];
  currentIndex: number;
  revealed: boolean;
  paused: boolean;
  completed: boolean;
}

export function createReviewState(cards: FlashcardCard[], progress?: FlashcardProgress): ReviewState {
  // 1. Filter out quarantined cards, deduplicate defensively, and sort strictly in source ordinal order
  const seen = new Set<string>();
  const valid: FlashcardCard[] = [];
  for (const card of cards) {
    if (card.quarantined) continue;
    const key = (card.sourceNoteGuid && typeof card.sourceTemplateOrdinal === 'number')
      ? `${card.sourceNoteGuid}:${card.sourceTemplateOrdinal}`
      : card.id;
    if (!seen.has(key)) {
      seen.add(key);
      valid.push(card);
    }
  }
  valid.sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));

  const statusById = progress?.cards || {};
  const currentResetVersion = progress?.resetVersion || 0;

  // 2. Separate cards into unseen and again based on progress and contentHash stability
  const unseen: string[] = [];
  const again: string[] = [];

  for (const card of valid) {
    const cardProgress = statusById[card.id];
    // If progress is missing, or resetVersion is older, or content changed -> card is unseen
    if (
      !cardProgress ||
      (cardProgress.resetVersion || 0) < currentResetVersion ||
      cardProgress.contentHash !== card.contentHash
    ) {
      unseen.push(card.id);
    } else if (cardProgress.status === 'again') {
      again.push(card.id);
    }
    // 'known' cards leave the queue completely
  }

  // Queue starts with unseen cards, followed by Again cards
  const queue = [...unseen, ...again];
  const checkpoint = progress?.checkpointIndex ?? 0;
  const initialIndex = Math.min(checkpoint, Math.max(0, queue.length - 1));

  return {
    cards: valid,
    queue,
    currentIndex: queue.length === 0 ? 0 : initialIndex,
    revealed: false,
    paused: false,
    completed: queue.length === 0
  };
}

export function currentCard(state: ReviewState): FlashcardCard | null {
  if (state.completed || state.currentIndex >= state.queue.length) return null;
  const id = state.queue[state.currentIndex];
  return state.cards.find((card) => card.id === id) || null;
}

export function reveal(state: ReviewState): ReviewState {
  if (state.completed || state.paused || state.revealed) return state;
  return { ...state, revealed: true };
}

export function rate(state: ReviewState, rating: FlashcardRating): ReviewState {
  if (!state.revealed || state.completed || state.paused) return state;

  const queue = [...state.queue];
  const currentId = queue[state.currentIndex];
  if (!currentId) return { ...state, completed: true };

  // Again cards return after the first pass (appended to end of queue)
  if (rating === 'again') {
    queue.push(currentId);
  }

  const nextIndex = state.currentIndex + 1;
  const completed = nextIndex >= queue.length;

  return {
    ...state,
    queue,
    currentIndex: completed ? Math.max(0, queue.length - 1) : nextIndex,
    revealed: false,
    completed
  };
}

export function togglePaused(state: ReviewState): ReviewState {
  if (state.completed) return state;
  return { ...state, paused: !state.paused };
}

export function reviewAll(cards: FlashcardCard[]): ReviewState {
  return createReviewState(cards);
}
