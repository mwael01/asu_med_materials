import { incrementMaterialBookmarkCount, listenToMaterialBookmarkCount } from '../firebase/firestore';
import { getStoredBookmarkIds, saveBookmarkIds } from './storage';
import { syncBookmarkToggle } from './userSync';
import { changeBookmarkCount, normalizeBookmarkCount, receiveBookmarkCount } from './bookmarkCounts';
import type { BookmarkCountState } from '../types/bookmarks';

const counts = new Map<string, BookmarkCountState>();
const subscriptions = new Map<string, () => void>();
let observer: MutationObserver | undefined;

function stateFor(id: string): BookmarkCountState {
  let state = counts.get(id);
  if (!state) {
    const element = document.querySelector<HTMLElement>(`.bookmark-btn[data-id="${CSS.escape(id)}"] .bookmark-count`);
    state = { displayed: normalizeBookmarkCount(Number(element?.dataset.count ?? 0)), snapshot: null, pending: 0 };
    counts.set(id, state);
  }
  return state;
}

export function renderBookmarkButtons(): void {
  const saved = new Set(getStoredBookmarkIds());
  document.querySelectorAll<HTMLElement>('.bookmark-btn[data-id]').forEach((button) => {
    const id = button.dataset.id!;
    const active = saved.has(id);
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('.bookmark-icon-empty')?.classList.toggle('hidden', active);
    button.querySelector('.bookmark-icon-filled')?.classList.toggle('hidden', !active);
    button.classList.toggle('text-zinc-400', !active);
    for (const name of ['text-amber-500', 'dark:text-amber-400']) button.classList.toggle(name, active);
    const counter = button.querySelector<HTMLElement>('.bookmark-count');
    if (!counter) return;
    const count = String(stateFor(id).displayed);
    if (counter.textContent !== count) counter.textContent = count;
    counter.dataset.count = count;
    for (const name of ['text-amber-600', 'dark:text-amber-400']) counter.classList.toggle(name, active);
    for (const name of ['text-zinc-500', 'dark:text-zinc-400']) counter.classList.toggle(name, !active);
  });
}

/** Both card toggles and drawer removals use this idempotent action. */
export function setMaterialBookmarked(id: string, added: boolean): void {
  const current = getStoredBookmarkIds();
  if (!id || current.includes(id) === added) return;
  const state = stateFor(id);
  saveBookmarkIds(added ? [...current, id] : current.filter((entry) => entry !== id));
  void changeBookmarkCount(state, added ? 1 : -1,
    () => incrementMaterialBookmarkCount(id, added ? 1 : -1), renderBookmarkButtons
  ).catch((error) => console.warn(`[Bookmarks] Count sync failed for ${id}:`, error));
  void syncBookmarkToggle(id, added);
}

function refreshSubscriptions(): void {
  const ids = new Set(Array.from(document.querySelectorAll<HTMLElement>('.bookmark-btn[data-id]'), (button) => button.dataset.id!));
  for (const [id, unsubscribe] of subscriptions) {
    if (!ids.has(id)) {
      unsubscribe();
      subscriptions.delete(id);
    }
  }
  for (const id of ids) {
    if (subscriptions.has(id)) continue;
    const state = stateFor(id);
    subscriptions.set(id, listenToMaterialBookmarkCount(id, (count) => {
      receiveBookmarkCount(state, count);
      renderBookmarkButtons();
    }));
  }
  renderBookmarkButtons();
}

export function stopBookmarkCounts(): void {
  observer?.disconnect();
  for (const unsubscribe of subscriptions.values()) unsubscribe();
  subscriptions.clear();
  counts.clear();
}

export function initBookmarkCounts(): void {
  stopBookmarkCounts();
  refreshSubscriptions();
  observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some(
      (node) => node instanceof Element && (node.matches('.bookmark-btn') || node.querySelector('.bookmark-btn'))
    ))) refreshSubscriptions();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
