import type { FlashcardRating } from '../../types/flashcards';

export function createCardAnimations(surface: HTMLElement) {
  const running = new Set<Animation>();
  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  async function play(
    target: HTMLElement,
    frames: Keyframe[],
    duration: number,
  ): Promise<boolean> {
    if (reducedMotion() || typeof target.animate !== 'function') return true;
    const animation = target.animate(frames, {
      duration,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'forwards',
    });
    running.add(animation);
    try {
      await animation.finished;
      return true;
    } catch {
      return false;
    } finally {
      running.delete(animation);
      animation.cancel();
    }
  }
  function reset() {
    for (const animation of running) animation.cancel();
    running.clear();
    surface.style.transform = '';
    surface.style.opacity = '';
    surface.style.willChange = '';
  }
  return {
    reset,
    async exit(rating: FlashcardRating) {
      const direction = rating === 'known' ? 1 : -1;
      const from =
        surface.style.transform || 'translate3d(0, 0, 0) rotate(0deg)';
      return play(
        surface,
        [
          { transform: from, opacity: 1 },
          {
            transform: `translate3d(${direction * 120}%, 0, 0) rotate(${direction * 16}deg)`,
            opacity: 0,
          },
        ],
        180,
      );
    },
    async enter() {
      surface.style.transform = '';
      return play(
        surface,
        [
          { transform: 'translateY(8px) scale(0.98)', opacity: 0 },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ],
        140,
      );
    },
    async settle() {
      const from = surface.style.transform || 'none';
      const finished = await play(
        surface,
        [
          { transform: from },
          { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
        ],
        180,
      );
      if (finished) surface.style.transform = '';
      return finished;
    },
    reveal(answer: HTMLElement | null, controls: HTMLElement | null) {
      for (const target of [answer, controls]) {
        if (target)
          void play(
            target,
            [
              { opacity: 0, transform: 'translateY(8px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            180,
          );
      }
    },
  };
}
