import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  beginGesture,
  moveGesture,
  finishGesture,
  tossThreshold,
} from '../src/scripts/flashcards/gestureState.ts';
import { createRatingFlow } from '../src/scripts/flashcards/ratingFlow.ts';
import { bindCardGestures } from '../src/scripts/flashcards/gestures.ts';
import { createCardAnimations } from '../src/scripts/flashcards/animations.ts';

const sample = (x = 0, y = 0, time = 0, id = 1) => ({
  clientX: x,
  clientY: y,
  timeStamp: time,
  pointerId: id,
});
const start = () => beginGesture(sample(), 360);
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test('a short stationary tap reveals; long press and out-and-back motion do not', () => {
  assert.equal(finishGesture(start(), sample(3, 2, 100), false).type, 'tap');
  assert.equal(finishGesture(start(), sample(0, 0, 351), false).type, 'reset');
  const moved = moveGesture(start(), sample(20, 0, 20), false);
  assert.equal(finishGesture(moved, sample(0, 0, 100), false).type, 'reset');
});
test('vertical intent remains scrolling even after horizontal motion', () => {
  const vertical = moveGesture(start(), sample(3, 12, 20), true);
  assert.equal(vertical.phase, 'scrolling');
  const sideways = moveGesture(vertical, sample(140, 14, 80), true);
  assert.equal(sideways.phase, 'scrolling');
  assert.equal(
    finishGesture(sideways, sample(140, 14, 90), true).type,
    'reset',
  );
});
test('diagonal movement and unrevealed swipes never rate', () => {
  const diagonal = moveGesture(start(), sample(40, 40, 40), true);
  assert.equal(
    finishGesture(diagonal, sample(100, 100, 90), true).type,
    'reset',
  );
  const unrevealed = moveGesture(start(), sample(140, 0, 50), false);
  assert.equal(
    finishGesture(unrevealed, sample(140, 0, 70), false).type,
    'reset',
  );
});
test('horizontal movement locks only beyond slop and direction ratio', () => {
  assert.equal(moveGesture(start(), sample(9, 0, 20), true).phase, 'pending');
  assert.equal(moveGesture(start(), sample(10, 0, 20), true).phase, 'dragging');
  assert.equal(
    moveGesture(start(), sample(13, 10, 20), true).phase,
    'dragging',
  );
  assert.notEqual(
    moveGesture(start(), sample(12, 10, 20), true).phase,
    'dragging',
  );
  assert.notEqual(
    moveGesture(start(), sample(100, 0, 400), true).phase,
    'dragging',
  );
});
test('threshold adapts to card width with minimum and maximum limits', () => {
  assert.equal(tossThreshold(200), 60);
  assert.equal(tossThreshold(400), 88);
  assert.equal(tossThreshold(900), 100);
  const drag = moveGesture(start(), sample(20, 0, 20), true);
  assert.equal(finishGesture(drag, sample(79, 0, 50), true).type, 'reset');
  assert.deepEqual(finishGesture(drag, sample(80, 0, 50), true), {
    type: 'rate',
    rating: 'known',
  });
  assert.deepEqual(finishGesture(drag, sample(-100, 0, 50), true), {
    type: 'rate',
    rating: 'again',
  });
});
test('wrong pointer cannot move the tracked gesture; release alone cannot create a toss', () => {
  const state = start();
  assert.equal(moveGesture(state, sample(100, 0, 20, 2), true), state);
  assert.equal(finishGesture(state, sample(100, 0, 20), true).type, 'reset');
});

function ratingHarness() {
  let eligible = true;
  let busy = false;
  const commits = [];
  const exits = [];
  let renders = 0;
  let entries = 0;
  const flow = createRatingFlow({
    canRate: () => eligible && !busy,
    busy: (value) => {
      busy = value;
    },
    commit: (rating) => {
      commits.push(rating);
    },
    exit: () => {
      const task = deferred();
      exits.push(task);
      return task.promise;
    },
    render: () => {
      renders++;
    },
    enter: async () => {
      entries++;
      return true;
    },
    reset: () => {},
  });
  return {
    flow,
    commits,
    exits,
    setEligible: (value) => {
      eligible = value;
    },
    get busy() {
      return busy;
    },
    get renders() {
      return renders;
    },
    get entries() {
      return entries;
    },
  };
}
test('rating acquires its lock then commits once, fixing the old guarded toss failure', async () => {
  const h = ratingHarness();
  const request = h.flow.request('known');
  assert.equal(h.busy, true);
  assert.deepEqual(h.commits, ['known']);
  await h.flow.request('again');
  assert.equal(h.commits.length, 1);
  h.exits[0].resolve(true);
  await request;
  assert.equal(h.renders, 1);
  assert.equal(h.entries, 1);
  assert.equal(h.busy, false);
});
test('unready, unrevealed, paused, or completed reviews reject ratings via eligibility', async () => {
  const h = ratingHarness();
  h.setEligible(false);
  await h.flow.request('again');
  assert.equal(h.commits.length, 0);
  assert.equal(h.busy, false);
});
test('interrupt keeps an accepted rating and prevents stale render/entry', async () => {
  const h = ratingHarness();
  const request = h.flow.request('again');
  h.flow.interrupt();
  h.exits[0].resolve(true);
  await request;
  assert.deepEqual(h.commits, ['again']);
  assert.equal(h.renders, 0);
  assert.equal(h.entries, 0);
  assert.equal(h.busy, false);
});
test('old completion cannot unlock a newer transaction after reset or reinitialization', async () => {
  const h = ratingHarness();
  const old = h.flow.request('again');
  h.flow.interrupt();
  const current = h.flow.request('known');
  h.exits[0].resolve(true);
  await old;
  assert.equal(h.busy, true);
  h.exits[1].resolve(true);
  await current;
  assert.equal(h.renders, 1);
  assert.equal(h.busy, false);
});
test('cancelled exit still displays committed state and releases the lock', async () => {
  const h = ratingHarness();
  const request = h.flow.request('known');
  h.exits[0].resolve(false);
  await request;
  assert.equal(h.busy, false);
  assert.equal(h.commits.length, 1);
  assert.equal(h.renders, 1);
  assert.equal(h.entries, 0);
});

// Minimal event targets exercise the production bindings without a DOM dependency.
// Browser scrolling arbitration is verified separately on physical devices.
class TestNode extends EventTarget {
  constructor(parent = null) {
    super();
    this.parentElement = parent;
  }
}
class TestElement extends TestNode {
  constructor(kind = 'div', parent = null) {
    super(parent);
    this.kind = kind;
    this.parent = parent;
    this.style = {};
    this.dataset = {};
    this.classes = new Set();
    this.captured = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
    };
  }
  closest(selector) {
    if (
      selector
        .split(',')
        .map((x) => x.trim())
        .includes(this.kind)
    )
      return this;
    return this.parent?.closest(selector) ?? null;
  }
  contains(target) {
    return target === this || !!target?.parentElement && this.contains(target.parentElement);
  }
  getBoundingClientRect() {
    return { width: 360 };
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  setPointerCapture(id) {
    this.captured.add(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
  }
}
function event(type, target, x = 0, y = 0, time = 0, id = 1, extra = {}) {
  const e = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries({
    ...sample(x, y, time, id),
    target,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    ...extra,
  })) {
    Object.defineProperty(e, key, { value });
  }
  return e;
}
function gestureHarness() {
  const original = new Map();
  const set = (name, value) => {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  };
  const win = new EventTarget();
  const windowCaptureListeners = new Map();
  const addWindowListener = win.addEventListener.bind(win);
  win.addEventListener = (type, listener, options) => {
    if (options?.capture)
      windowCaptureListeners.set(type, { listener, signal: options.signal });
    addWindowListener(type, listener, options);
  };
  function dispatchWindow(e) {
    if (!e.stopAtTarget) return win.dispatchEvent(e);
    // A descendant stops bubbling; window capture still runs before that target.
    const registration = windowCaptureListeners.get(e.type);
    if (registration && !registration.signal?.aborted)
      registration.listener(e);
  }
  let selected = false;
  let selectionNode = null;
  win.getSelection = () => ({
    isCollapsed: !selected,
    rangeCount: selected ? 1 : 0,
    getRangeAt: () => ({ intersectsNode: node => node.contains(selectionNode) }),
  });
  const doc = new EventTarget();
  doc.hidden = false;
  const frames = new Map();
  let frameId = 0;
  set('window', win);
  set('document', doc);
  set('Element', TestElement);
  set('Node', TestNode);
  set('HTMLImageElement', TestElement);
  set('requestAnimationFrame', (fn) => {
    frames.set(++frameId, fn);
    return frameId;
  });
  set('cancelAnimationFrame', (id) => frames.delete(id));
  const surface = new TestElement();
  const image = new TestElement('img', surface);
  const button = new TestElement('button', surface);
  const captureOwners = new Map();
  const captureLosses = [];
  function loseCapture(target, id) {
    target.captured.delete(id);
    if (captureOwners.get(id) === target) captureOwners.delete(id);
    if (surface.contains(target))
      surface.dispatchEvent(event('lostpointercapture', target, 0, 0, 0, id));
  }
  // hasPointerCapture reflects the pending owner during a browser handoff.
  // Process the old owner's bubbling loss before the next pointer event.
  surface.setPointerCapture = (id) => {
    const previous = captureOwners.get(id);
    if (previous && previous !== surface) {
      previous.captured.delete(id);
      captureLosses.push({ target: previous, id });
    }
    captureOwners.set(id, surface);
    surface.captured.add(id);
  };
  surface.releasePointerCapture = (id) => loseCapture(surface, id);
  const controller = new AbortController();
  let interactive = true;
  let revealed = true;
  const calls = [];
  const gesture = bindCardGestures(
    surface,
    { again: new TestElement(), known: new TestElement() },
    {
      canInteract: () => interactive,
      canDrag: () => revealed,
      reveal: () => calls.push('reveal'),
      rate: (rating) => calls.push(rating),
      settle: () => calls.push('settle'),
    },
    controller.signal,
  );
  function dispatch(
    type,
    target = surface,
    x = 0,
    y = 0,
    time = 0,
    id = 1,
    extra = {},
  ) {
    if (type.startsWith('pointer')) {
      for (const { target: previous, id: pointerId } of captureLosses.splice(0))
        loseCapture(previous, pointerId);
    }
    const e = event(type, target, x, y, time, id, extra);
    if (type === 'pointerdown') {
      const owner = target instanceof TestElement ? target : target.parentElement;
      if (owner && e.pointerType !== 'mouse') {
        captureOwners.set(id, owner);
        owner.captured.add(id);
      }
      doc.dispatchEvent(e);
      surface.dispatchEvent(e);
    } else if (type === 'pointerup' || type === 'pointercancel') {
      doc.dispatchEvent(e);
      dispatchWindow(e);
      const owner = captureOwners.get(id);
      if (owner) loseCapture(owner, id);
    } else if (type === 'pointermove') dispatchWindow(e);
    else if (type === 'lostpointercapture') loseCapture(target, id);
    else surface.dispatchEvent(e);
    return e;
  }
  return {
    surface,
    image,
    button,
    calls,
    frames,
    gesture,
    dispatch,
    controller,
    win,
    doc,
    set selected(value) {
      selected = value;
      selectionNode = value ? surface : null;
    },
    set selectionNode(value) {
      selected = !!value;
      selectionNode = value;
    },
    set revealed(value) {
      revealed = value;
    },
    set interactive(value) {
      interactive = value;
    },
    flush() {
      const jobs = [...frames.values()];
      frames.clear();
      for (const fn of jobs) fn();
    },
    restore() {
      controller.abort();
      for (const [name, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}
function withGestures(fn) {
  const h = gestureHarness();
  try {
    fn(h);
  } finally {
    h.restore();
  }
}
test('implicit child capture transfers to the card without dropping either toss direction', () => {
  for (const kind of ['span', 'strong', 'img', 'svg', 'path']) {
    for (const direction of [-1, 1]) {
      withGestures((h) => {
        const child = new TestElement(kind, new TestElement('p', h.surface));
        h.dispatch('pointerdown', child);
        assert.equal(child.hasPointerCapture(1), true);
        h.dispatch('pointermove', child, direction * 30, 0, 30);
        assert.equal(h.surface.hasPointerCapture(1), true);
        // The next move delivers the child's bubbling lostpointercapture first.
        h.dispatch('pointermove', h.surface, direction * 110, 0, 60);
        h.flush();
        assert.equal(h.surface.hasPointerCapture(1), true);
        assert.match(h.surface.style.transform, new RegExp(`${direction * 110}px`));
        h.dispatch('pointerup', h.surface, direction * 120, 0, 80);
        h.dispatch('pointerup', h.surface, direction * 120, 0, 90);
        assert.deepEqual(h.calls, [direction < 0 ? 'again' : 'known']);
        assert.equal(h.surface.hasPointerCapture(1), false);
        assert.equal(h.frames.size, 0);
      });
    }
  }
});
test('a short text-origin drag survives capture transfer and settles once', () =>
  withGestures((h) => {
    const child = new TestElement('span', h.surface);
    h.dispatch('pointerdown', child);
    h.dispatch('pointermove', child, 25, 0, 40);
    h.dispatch('pointerup', h.surface, 30, 0, 80);
    assert.deepEqual(h.calls, ['settle']);
    assert.equal(h.dispatch('click', child).defaultPrevented, true);
  }));
test('queued surface capture loss is harmless when the surface holds capture again', () =>
  withGestures((h) => {
    h.dispatch('pointerdown');
    h.dispatch('pointermove', h.surface, 100, 0, 40);
    h.surface.dispatchEvent(event('lostpointercapture', h.surface));
    h.dispatch('pointerup', h.surface, 110, 0, 80);
    assert.deepEqual(h.calls, ['known']);
  }));
test('capture acquisition failure cancels before drag styling and never rates', () =>
  withGestures((h) => {
    h.surface.setPointerCapture = () => {
      throw new DOMException('Pointer is no longer active', 'NotFoundError');
    };
    h.dispatch('pointerdown', new TestElement('span', h.surface));
    h.dispatch('pointermove', h.surface, 100, 0, 40);
    assert.equal(h.surface.classes.has('is-dragging'), false);
    assert.equal(h.surface.style.willChange, '');
    assert.equal(h.surface.style.transform, '');
    assert.equal(h.frames.size, 0);
    h.dispatch('pointerup', h.surface, 110, 0, 80);
    assert.deepEqual(h.calls, []);
  }));
test('descendants stopping propagation cannot interrupt window capture tracking', () => {
  for (const termination of ['pointerup', 'pointercancel']) {
    withGestures((h) => {
      const child = new TestElement('span', h.surface);
      h.dispatch('pointerdown', child);
      h.dispatch('pointermove', child, 100, 0, 40, 1, { stopAtTarget: true });
      h.dispatch(termination, h.surface, 110, 0, 80, 1, { stopAtTarget: true });
      assert.deepEqual(h.calls, termination === 'pointerup' ? ['known'] : []);
      assert.equal(h.surface.hasPointerCapture(1), false);
      assert.equal(h.frames.size, 0);
    });
  }
});
test('bindings capture horizontal drag, batch painting, and release outside the card', () =>
  withGestures((h) => {
    h.dispatch('pointerdown');
    h.dispatch('pointermove', h.surface, 30, 0, 30);
    h.dispatch('pointermove', h.surface, 90, 0, 60);
    assert.equal(h.frames.size, 1);
    assert.equal(h.surface.hasPointerCapture(1), true);
    h.flush();
    assert.match(h.surface.style.transform, /90px/);
    h.dispatch('pointerup', new TestElement(), 110, 0, 80);
    assert.deepEqual(h.calls, ['known']);
    assert.equal(h.surface.hasPointerCapture(1), false);
  }));
test('pointer cancellation and capture loss reset without rating or stale frames', () =>
  withGestures((h) => {
    for (const termination of ['pointercancel', 'lostpointercapture']) {
      h.dispatch('pointerdown');
      h.dispatch('pointermove', h.surface, 100, 0, 30);
      h.dispatch(termination, h.surface, 100, 0, 50);
      assert.equal(h.frames.size, 0);
      assert.equal(h.surface.style.transform, '');
      assert.equal(h.surface.hasPointerCapture(1), false);
      h.dispatch('pointerup', h.surface, 100, 0, 60);
    }
    assert.deepEqual(h.calls, []);
  }));
test('vertical scrolling never captures or transforms the card', () =>
  withGestures((h) => {
    h.dispatch('pointerdown');
    h.dispatch('pointermove', h.surface, 2, 40, 30);
    h.dispatch('pointerup', h.surface, 2, 90, 100);
    assert.equal(h.surface.hasPointerCapture(1), false);
    assert.equal(h.frames.size, 0);
    assert.deepEqual(h.calls, []);
  }));
test('image taps do not reveal; image drags suppress their generated click only', () =>
  withGestures((h) => {
    h.dispatch('pointerdown', h.image);
    h.dispatch('pointerup', h.image, 0, 0, 100);
    assert.deepEqual(h.calls, []);
    assert.equal(h.dispatch('click', h.image).defaultPrevented, false);
    h.dispatch('pointerdown', h.image);
    h.dispatch('pointermove', h.image, 30, 0, 50);
    h.dispatch('pointerup', h.image, 35, 0, 100);
    assert.deepEqual(h.calls, ['settle']);
    assert.equal(h.dispatch('click', h.image).defaultPrevented, true);
    h.dispatch('pointerdown', h.image);
    h.dispatch('pointerup', h.image, 0, 0, 100);
    assert.equal(h.dispatch('click', h.image).defaultPrevented, false);
  }));
test('interactive controls, mouse selection, nonprimary mouse buttons, and unready state are ignored', () =>
  withGestures((h) => {
    h.dispatch('pointerdown', h.button);
    h.dispatch('pointerup', h.button, 0, 0, 100);
    h.selected = true;
    h.dispatch('pointerdown', h.surface, 0, 0, 0, 1, { pointerType: 'mouse' });
    h.dispatch('pointerup', h.surface, 0, 0, 100, 1, { pointerType: 'mouse' });
    h.selected = false;
    h.dispatch('pointerdown', h.surface, 0, 0, 0, 1, {
      pointerType: 'mouse',
      button: 2,
    });
    h.dispatch('pointerup', h.surface, 0, 0, 100);
    h.interactive = false;
    h.dispatch('pointerdown');
    h.dispatch('pointerup', h.surface, 0, 0, 100);
    assert.deepEqual(h.calls, []);
  }));
test('second touch outside the card cancels dragging and allows pinch handling', () =>
  withGestures((h) => {
    h.dispatch('pointerdown');
    h.dispatch('pointermove', h.surface, 100, 0, 40);
    h.doc.dispatchEvent(
      event('pointerdown', new TestElement(), 0, 0, 50, 2, {
        isPrimary: false,
      }),
    );
    h.dispatch('pointerup', h.surface, 100, 0, 70);
    assert.equal(h.surface.style.transform, '');
    assert.equal(h.surface.hasPointerCapture(1), false);
    assert.deepEqual(h.calls, []);
  }));
test('abort removes global handlers and cancels pending frames', () =>
  withGestures((h) => {
    h.dispatch('pointerdown');
    h.dispatch('pointermove', h.surface, 30, 0, 20);
    h.controller.abort();
    h.dispatch('pointermove', h.surface, 110, 0, 40);
    h.dispatch('pointerup', h.surface, 110, 0, 60);
    assert.equal(h.frames.size, 0);
    assert.deepEqual(h.calls, []);
  }));
test('reduced motion settles immediately without an animation or retained transform', async () => {
  const original = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  try {
    const surface = new TestElement();
    surface.style.transform = 'translateX(90px)';
    surface.animate = () => {
      throw new Error('reduced motion must not animate');
    };
    const animations = createCardAnimations(surface);
    assert.equal(await animations.exit('known'), true);
    assert.equal(await animations.enter(), true);
    assert.equal(await animations.settle(), true);
    assert.equal(surface.style.transform, '');
  } finally {
    globalThis.window = original;
  }
});

test('unrevealed background tap reveals once; a long press does not', () =>
  withGestures((h) => {
    h.revealed = false;
    h.dispatch('pointerdown');
    h.dispatch('pointerup', h.surface, 1, 1, 100);
    assert.deepEqual(h.calls, ['reveal']);
    h.dispatch('pointerdown');
    h.dispatch('pointerup', h.surface, 0, 0, 500);
    assert.deepEqual(h.calls, ['reveal']);
  }));
test('short drag settles and cannot open an image or reveal through a generated click', () =>
  withGestures((h) => {
    h.dispatch('pointerdown');
    h.dispatch('pointermove', h.surface, 25, 0, 40);
    h.dispatch('pointerup', h.surface, 30, 0, 80);
    assert.deepEqual(h.calls, ['settle']);
    assert.equal(h.dispatch('click').defaultPrevented, true);
  }));
test('foreign pointer events cannot complete an active drag', () =>
  withGestures((h) => {
    h.dispatch('pointerdown');
    h.dispatch('pointermove', h.surface, 40, 0, 40);
    h.dispatch('pointermove', h.surface, 150, 0, 60, 2);
    h.dispatch('pointerup', h.surface, 150, 0, 80, 2);
    assert.deepEqual(h.calls, []);
    h.dispatch('pointerup', h.surface, 100, 0, 100);
    assert.deepEqual(h.calls, ['known']);
  }));
test('keyboard/button interruption cancels a held drag without changing a released toss transform', () =>
  withGestures((h) => {
    h.dispatch('pointerdown');
    h.dispatch('pointermove', h.surface, 100, 0, 40);
    h.flush();
    h.gesture.cancelActive();
    h.dispatch('pointerup', h.surface, 100, 0, 80);
    assert.deepEqual(h.calls, []);
    h.dispatch('pointerdown');
    h.dispatch('pointermove', h.surface, 100, 0, 40);
    h.dispatch('pointerup', h.surface, 100, 0, 80);
    const releasedTransform = h.surface.style.transform;
    h.gesture.cancelActive();
    assert.equal(h.surface.style.transform, releasedTransform);
    assert.deepEqual(h.calls, ['known']);
  }));
test('blur and tab suspension cancel pending drags and allow a fresh contact', () =>
  withGestures((h) => {
    for (const hidden of [false, true]) {
      h.dispatch('pointerdown');
      h.dispatch('pointermove', h.surface, 100, 0, 40);
      if (hidden) {
        h.doc.hidden = true;
        h.doc.dispatchEvent(new Event('visibilitychange'));
        h.doc.hidden = false;
      } else h.win.dispatchEvent(new Event('blur'));
      h.dispatch('pointerup', h.surface, 100, 0, 80);
      assert.equal(h.surface.style.transform, '');
    }
    assert.deepEqual(h.calls, []);
    h.dispatch('pointerdown');
    h.dispatch('pointerup', h.surface, 0, 0, 100);
    assert.deepEqual(h.calls, ['reveal']);
  }));
test('animation driver begins at release position, then clears it for the next card', async () => {
  const original = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  try {
    const surface = new TestElement();
    surface.style.transform = 'translate3d(110px, 0, 0) rotate(4deg)';
    const recorded = [];
    surface.animate = (frames, options) => {
      recorded.push({ frames, options });
      return { finished: Promise.resolve(), cancel() {} };
    };
    const animations = createCardAnimations(surface);
    assert.equal(await animations.exit('known'), true);
    assert.equal(recorded[0].frames[0].transform, surface.style.transform);
    assert.match(recorded[0].frames[1].transform, /120%/);
    assert.equal(await animations.enter(), true);
    assert.equal(surface.style.transform, '');
    assert.equal(recorded[1].options.duration, 140);
  } finally {
    globalThis.window = original;
  }
});
test('animation reset cancels outstanding promises without unhandled rejections', async () => {
  const original = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  try {
    const surface = new TestElement();
    surface.animate = () => {
      let reject;
      const finished = new Promise((_, r) => {
        reject = r;
      });
      return {
        finished,
        cancel() {
          reject(new Error('cancelled'));
        },
      };
    };
    const animations = createCardAnimations(surface);
    const exit = animations.exit('again');
    animations.reset();
    assert.equal(await exit, false);
    assert.equal(surface.style.transform, '');
  } finally {
    globalThis.window = original;
  }
});

test('rebinding after disposal leaves exactly one gesture handler on the same surface', () =>
  withGestures((h) => {
    h.controller.abort();
    const replacement = new AbortController();
    let reveals = 0;
    const gesture = bindCardGestures(
      h.surface,
      { again: null, known: null },
      {
        canInteract: () => true,
        canDrag: () => false,
        reveal: () => { reveals++; },
        rate: () => assert.fail('unrevealed card cannot rate'),
        settle: () => {},
      },
      replacement.signal,
    );
    try {
      h.dispatch('pointerdown');
      h.dispatch('pointerup', h.surface, 0, 0, 100);
      assert.equal(reveals, 1);
      assert.deepEqual(h.calls, []);
      gesture.cancel();
    } finally {
      replacement.abort();
    }
  }),
);

test('image and control clicks are blocked during initialization or settling', () =>
  withGestures((h) => {
    h.interactive = false;
    assert.equal(h.dispatch('click', h.image).defaultPrevented, true);
    assert.equal(h.dispatch('click', h.button).defaultPrevented, true);
    h.interactive = true;
    assert.equal(h.dispatch('click', h.image).defaultPrevented, false);
  }),
);

test('touch dragging starts from deeply nested text and decorative elements', () => {
  for (const kind of ['span', 'strong', 'h2', 'li', 'svg', 'path']) {
    withGestures((h) => {
      const paragraph = new TestElement('p', h.surface);
      const child = new TestElement(kind, paragraph);
      h.selectionNode = new TestElement('p');
      h.dispatch('pointerdown', child);
      assert.equal(h.surface.dataset.inputMode, 'touch');
      h.dispatch('pointermove', child, 100, 0, 40);
      h.flush();
      assert.equal(h.surface.hasPointerCapture(1), true);
      assert.match(h.surface.style.transform, /100px/);
      h.dispatch('pointerup', child, 110, 0, 80);
      assert.deepEqual(h.calls, ['known']);
    });
  }
});
test('touch gestures are not cancelled by selection created after contact', () =>
  withGestures((h) => {
    const text = new TestElement('span', h.surface);
    h.dispatch('pointerdown', text);
    h.selected = true;
    h.dispatch('pointermove', text, -100, 0, 40);
    h.dispatch('pointerup', text, -110, 0, 80);
    assert.deepEqual(h.calls, ['again']);
  }),
);
test('touch contact with existing card selection still permits dragging', () =>
  withGestures((h) => {
    const text = new TestElement('span', h.surface);
    h.selectionNode = text;
    h.dispatch('pointerdown', text);
    h.dispatch('pointermove', text, 100, 0, 40);
    h.dispatch('pointerup', text, 100, 0, 80);
    assert.deepEqual(h.calls, ['known']);
  }),
);
test('text-node event targets normalize to their parent for drags and reveal taps', () =>
  withGestures((h) => {
    const span = new TestElement('span', h.surface);
    const text = new TestNode(span);
    h.dispatch('pointerdown', text);
    h.dispatch('pointermove', text, 100, 0, 40);
    h.dispatch('pointerup', text, 100, 0, 80);
    assert.deepEqual(h.calls, ['known']);
    h.revealed = false;
    h.dispatch('pointerdown', text);
    h.dispatch('pointerup', text, 0, 0, 100);
    assert.deepEqual(h.calls, ['known', 'reveal']);
  }),
);
test('buttons, links, and editable fields remain tap-only even through nested text', () => {
  for (const kind of ['button', 'a', 'input', 'textarea', 'select', '[contenteditable]']) {
    withGestures((h) => {
      const control = new TestElement(kind, h.surface);
      const label = new TestNode(new TestElement('span', control));
      h.dispatch('pointerdown', label);
      h.dispatch('pointermove', label, 100, 0, 40);
      h.dispatch('pointerup', label, 100, 0, 80);
      assert.deepEqual(h.calls, []);
      assert.equal(h.surface.hasPointerCapture(1), false);
      assert.equal(h.dispatch('click', label).defaultPrevented, false);
    });
  }
});
test('selection outside the card does not block mouse or pen grabbing', () => {
  for (const pointerType of ['mouse', 'pen']) {
    withGestures((h) => {
      h.selectionNode = new TestElement('p');
      const text = new TestElement('span', h.surface);
      const input = { pointerType };
      h.dispatch('pointerdown', text, 0, 0, 0, 1, input);
      h.dispatch('pointermove', text, 100, 0, 40, 1, input);
      h.dispatch('pointerup', text, 100, 0, 80, 1, input);
      assert.deepEqual(h.calls, ['known']);
    });
  }
});
test('mouse or pen selection intersecting the card cancels a pending gesture', () => {
  for (const pointerType of ['mouse', 'pen']) {
    withGestures((h) => {
      const text = new TestElement('span', new TestElement('p', h.surface));
      const input = { pointerType };
      h.dispatch('pointerdown', text, 0, 0, 0, 1, input);
      h.selectionNode = text;
      h.dispatch('pointermove', text, 100, 0, 40, 1, input);
      h.dispatch('pointerup', text, 100, 0, 80, 1, input);
      assert.deepEqual(h.calls, []);
      assert.equal(h.surface.hasPointerCapture(1), false);
    });
  }
});
test('switching to mouse or pen restores selection mode, including control contacts', () =>
  withGestures((h) => {
    for (const pointerType of ['mouse', 'pen']) {
      h.dispatch('pointerdown');
      h.dispatch('pointerup', h.surface, 0, 0, 100);
      assert.equal(h.surface.dataset.inputMode, 'touch');
      h.dispatch('pointerdown', h.button, 0, 0, 0, 1, { pointerType });
      assert.equal(h.surface.dataset.inputMode, pointerType);
      h.dispatch('pointerup', h.button, 0, 0, 100, 1, { pointerType });
    }
    h.controller.abort();
    assert.equal(h.surface.dataset.inputMode, undefined);
  }),
);
test('vertical gestures beginning on nested text still scroll without rating', () =>
  withGestures((h) => {
    const text = new TestElement('span', new TestElement('p', h.surface));
    h.selected = true;
    h.dispatch('pointerdown', text);
    h.dispatch('pointermove', text, 2, 50, 40);
    h.dispatch('pointerup', text, 2, 100, 80);
    assert.deepEqual(h.calls, []);
    assert.equal(h.surface.hasPointerCapture(1), false);
    assert.equal(h.frames.size, 0);
  }),
);
