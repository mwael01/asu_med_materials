import type { FlashcardRating } from '../../types/flashcards';
import type { RatingCallbacks } from '../../types/flashcardInteraction';

/** Owns the single rating transaction and invalidates stale animation continuations. */
export function createRatingFlow(callbacks: RatingCallbacks) {
  let locked = false;
  let generation = 0;
  function interrupt() {
    generation++;
    locked = false;
    callbacks.reset();
    callbacks.busy(false);
  }
  async function request(rating: FlashcardRating): Promise<void> {
    if (locked || !callbacks.canRate()) return;
    locked = true;
    const token = ++generation;
    callbacks.busy(true);
    try {
      callbacks.commit(rating);
      const exited = await callbacks.exit(rating);
      if (token !== generation) return;
      callbacks.render();
      if (exited) await callbacks.enter();
    } finally {
      if (token === generation) {
        locked = false;
        callbacks.reset();
        callbacks.busy(false);
      }
    }
  }
  return { request, interrupt };
}
