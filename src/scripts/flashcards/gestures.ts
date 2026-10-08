import type {
  CardGesture,
  CardGestureCallbacks,
} from '../../types/flashcardInteraction';
import {
  beginGesture,
  finishGesture,
  moveGesture,
  tossThreshold,
} from './gestureState';

const INTERACTIVE =
  'button, a, input, textarea, select, label, dialog, [contenteditable], audio, video, [role="button"]';
function targetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function hasCardSelection(surface: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  for (let index = 0; index < selection.rangeCount; index++) {
    if (selection.getRangeAt(index).intersectsNode(surface)) return true;
  }
  return false;
}

export function bindCardGestures(
  surface: HTMLElement,
  shades: { again: HTMLElement | null; known: HTMLElement | null },
  callbacks: CardGestureCallbacks,
  signal: AbortSignal,
) {
  let active: CardGesture | null = null;
  let frame = 0;
  let suppressClick = false;
  const touches = new Set<number>();
  const options = { signal };

  function clearFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function clearFeedback() {
    if (shades.again) shades.again.style.opacity = '0';
    if (shades.known) shades.known.style.opacity = '0';
  }
  function draw() {
    frame = 0;
    if (!active || active.phase !== 'dragging') return;
    const { dx, width } = active;
    surface.style.transform = `translate3d(${dx}px, 0, 0) rotate(${Math.max(-16, Math.min(16, dx * 0.04))}deg)`;
    const ratio = Math.min(1, Math.abs(dx) / tossThreshold(width));
    if (shades.again) shades.again.style.opacity = dx < 0 ? String(ratio) : '0';
    if (shades.known) shades.known.style.opacity = dx > 0 ? String(ratio) : '0';
  }
  function release() {
    const pointerId = active?.pointerId;
    active = null;
    clearFrame();
    surface.classList.remove('is-dragging');
    surface.style.willChange = '';
    if (pointerId !== undefined && surface.hasPointerCapture(pointerId))
      surface.releasePointerCapture(pointerId);
  }
  function cancel() {
    if (active) suppressClick = true;
    release();
    clearFeedback();
    surface.style.transform = '';
  }

  // Capture phase observes the second finger even outside the card, before its own handler.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') return;
      touches.add(event.pointerId);
      if (touches.size > 1) cancel();
    },
    { ...options, capture: true },
  );
  for (const name of ['pointerup', 'pointercancel'] as const) {
    document.addEventListener(
      name,
      (event) => touches.delete(event.pointerId),
      { ...options, capture: true },
    );
  }
  surface.addEventListener(
    'pointerdown',
    (event) => {
      // A new genuine contact must not inherit click suppression from an old drag.
      if (active || !event.isPrimary || event.button !== 0 || touches.size > 1)
        return;
      // Run in capture phase before the browser can begin selecting child text.
      // Keep the mode after release; the next mouse/pen contact restores selection.
      surface.dataset.inputMode = event.pointerType || 'mouse';
      suppressClick = false;
      const target = targetElement(event.target);
      if (
        !callbacks.canInteract() ||
        target?.closest(INTERACTIVE) ||
        (event.pointerType !== 'touch' && hasCardSelection(surface))
      )
        return;
      active = beginGesture(event, surface.getBoundingClientRect().width);
    },
    { ...options, capture: true },
  );
  window.addEventListener(
    'pointermove',
    (event) => {
      if (!active || event.pointerId !== active.pointerId) return;
      if (
        !callbacks.canInteract() ||
        (active.pointerType !== 'touch' && hasCardSelection(surface))
      ) {
        cancel();
        return;
      }
      const previous = active.phase;
      active = moveGesture(active, event, callbacks.canDrag());
      if (active.phase !== 'dragging') return;
      if (previous !== 'dragging') {
        surface.classList.add('is-dragging');
        surface.style.willChange = 'transform';
        surface.setPointerCapture(event.pointerId);
      }
      if (!frame) frame = requestAnimationFrame(draw);
    },
    options,
  );
  window.addEventListener(
    'pointerup',
    (event) => {
      if (!active || active.pointerId !== event.pointerId) return;
      if (
        !callbacks.canInteract() ||
        (active.pointerType !== 'touch' && hasCardSelection(surface))
      ) {
        cancel();
        return;
      }
      const state = active;
      const result = finishGesture(state, event, callbacks.canDrag());
      if (state.phase === 'dragging') {
        active = moveGesture(state, event, false);
        clearFrame();
        draw();
      }
      suppressClick = result.type !== 'tap';
      release();
      clearFeedback();
      if (result.type === 'rate') callbacks.rate(result.rating);
      else if (result.type === 'tap') {
        const target = targetElement(event.target);
        if (!target?.closest(`img, ${INTERACTIVE}`) && surface.contains(target))
          callbacks.reveal();
      } else if (state.phase === 'dragging') callbacks.settle();
    },
    options,
  );
  window.addEventListener(
    'pointercancel',
    (event) => {
      if (active?.pointerId === event.pointerId) cancel();
    },
    options,
  );
  surface.addEventListener(
    'lostpointercapture',
    (event) => {
      if (active?.pointerId === event.pointerId) cancel();
    },
    options,
  );
  surface.addEventListener(
    'click',
    (event) => {
      if (!suppressClick && callbacks.canInteract()) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { ...options, capture: true },
  );
  surface.addEventListener(
    'dragstart',
    (event) => {
      if (event.target instanceof HTMLImageElement) event.preventDefault();
    },
    options,
  );
  surface.addEventListener('contextmenu', cancel, options);
  window.addEventListener(
    'blur',
    () => {
      touches.clear();
      cancel();
    },
    options,
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) {
        touches.clear();
        cancel();
      }
    },
    options,
  );
  signal.addEventListener(
    'abort',
    () => {
      cancel();
      delete surface.dataset.inputMode;
    },
    { once: true },
  );
  return {
    cancel,
    cancelActive: () => {
      if (active) cancel();
    },
  };
}
