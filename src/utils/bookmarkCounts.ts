import type { BookmarkCountState } from '../types/bookmarks';

export function normalizeBookmarkCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function receiveBookmarkCount(state: BookmarkCountState, count: number): void {
  state.snapshot = normalizeBookmarkCount(count);
  if (state.pending === 0) state.displayed = state.snapshot;
}

export async function changeBookmarkCount(
  state: BookmarkCountState,
  delta: 1 | -1,
  write: () => Promise<void>,
  render: () => void
): Promise<void> {
  state.pending++;
  const previous = state.displayed;
  state.displayed = normalizeBookmarkCount(state.displayed + delta);
  const appliedDelta = state.displayed - previous;
  render();
  try {
    await write();
  } catch (error) {
    state.displayed = normalizeBookmarkCount(state.displayed - appliedDelta);
    throw error;
  } finally {
    state.pending--;
    if (state.pending === 0 && state.snapshot !== null) state.displayed = state.snapshot;
    render();
  }
}
