import type { FlashcardProgress, FlashcardRating } from '../../types/flashcards';

/** Reset generations take precedence over timestamps; ties keep the local snapshot. */
export function selectProgress(
  local: FlashcardProgress | null,
  remote: FlashcardProgress | null,
): FlashcardProgress | null {
  if (!local) return remote;
  if (!remote) return local;
  const resetDifference = (remote.resetVersion || 0) - (local.resetVersion || 0);
  return resetDifference > 0 || (resetDifference === 0 && remote.updatedAt > local.updatedAt)
    ? remote : local;
}

export function rateProgress(
  progress: FlashcardProgress,
  cardId: string,
  rating: FlashcardRating,
  contentHash: string,
  revisionId: string,
  pendingCardIds: string[],
): FlashcardProgress {
  const updatedAt = Math.max(Date.now(), (progress.updatedAt || 0) + 1);
  return {
    ...progress,
    revisionId,
    checkpointIndex: 0,
    pendingCardIds: [...pendingCardIds],
    updatedAt,
    cards: {
      ...progress.cards,
      [cardId]: { cardId, status: rating, contentHash, updatedAt, revisionId, resetVersion: progress.resetVersion },
    },
  };
}

export function resetProgress(progress: FlashcardProgress, pendingCardIds: string[]): FlashcardProgress {
  return {
    ...progress,
    cards: {},
    checkpointIndex: 0,
    pendingCardIds: [...pendingCardIds],
    resetVersion: (progress.resetVersion || 0) + 1,
    updatedAt: Math.max(Date.now(), (progress.updatedAt || 0) + 1),
  };
}

export function mergeGuestProgress(
  guest: FlashcardProgress,
  user: FlashcardProgress | null,
): FlashcardProgress {
  if (!user) return { ...guest, checkpointIndex: 0, updatedAt: Math.max(Date.now(), guest.updatedAt + 1) };
  const cards = { ...guest.cards, ...user.cards };
  const resetVersion = Math.max(user.resetVersion || 0, guest.resetVersion || 0);
  const pendingCardIds = [...new Set([
    ...(user.pendingCardIds || []),
    ...(guest.pendingCardIds || []),
    ...Object.keys(cards).sort(),
  ])].filter((id) => {
    const card = cards[id];
    return !card || card.status !== 'known' || (card.resetVersion || 0) !== resetVersion;
  });
  return {
    deckId: user.deckId,
    revisionId: user.revisionId || guest.revisionId,
    checkpointIndex: 0,
    pendingCardIds,
    resetVersion,
    updatedAt: Math.max(Date.now(), user.updatedAt + 1, guest.updatedAt + 1),
    cards,
  };
}
