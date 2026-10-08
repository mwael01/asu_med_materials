import type {
  CardGesture,
  GestureResult,
  PointerSample,
} from '../../types/flashcardInteraction';

export const TAP_SLOP = 10;
export const TAP_DURATION = 350;
export function tossThreshold(width: number): number {
  return Math.min(100, Math.max(60, width * 0.22));
}
export function beginGesture(event: PointerSample, width: number): CardGesture {
  return {
    pointerId: event.pointerId,
    pointerType: event.pointerType || 'mouse',
    startX: event.clientX,
    startY: event.clientY,
    startedAt: event.timeStamp,
    width,
    dx: 0,
    dy: 0,
    maxDistance: 0,
    phase: 'pending',
  };
}
export function moveGesture(
  state: CardGesture,
  event: PointerSample,
  canDrag: boolean,
): CardGesture {
  if (state.pointerId !== event.pointerId) return state;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  let phase = state.phase;
  if (phase === 'pending') {
    if (Math.abs(dy) >= TAP_SLOP && Math.abs(dy) > Math.abs(dx) / 1.3) {
      phase = 'scrolling';
    } else if (
      canDrag &&
      event.timeStamp - state.startedAt <= TAP_DURATION &&
      Math.abs(dx) >= TAP_SLOP &&
      Math.abs(dx) >= 1.3 * Math.abs(dy)
    ) {
      phase = 'dragging';
    }
  }
  return {
    ...state,
    dx,
    dy,
    phase,
    maxDistance: Math.max(state.maxDistance, Math.hypot(dx, dy)),
  };
}
export function finishGesture(
  state: CardGesture,
  event: PointerSample,
  canDrag: boolean,
): GestureResult {
  // A release sample alone must not manufacture a drag without a captured move.
  const final = moveGesture(state, event, false);
  if (
    state.phase === 'dragging' &&
    canDrag &&
    Math.abs(final.dx) >= tossThreshold(state.width)
  ) {
    return { type: 'rate', rating: final.dx > 0 ? 'known' : 'again' };
  }
  if (
    state.phase === 'pending' &&
    final.maxDistance < TAP_SLOP &&
    event.timeStamp - state.startedAt <= TAP_DURATION
  )
    return { type: 'tap' };
  return { type: 'reset' };
}
