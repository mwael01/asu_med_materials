import { getStoredBookmarkIds, saveBookmarkIds } from './storage';
import { syncBookmarkToggle } from './userSync';

let observer: MutationObserver | undefined;

export function renderBookmarkButtons(): void {
  if (typeof document === 'undefined') return;
  const saved = new Set(getStoredBookmarkIds());
  document.querySelectorAll<HTMLElement>('.bookmark-btn[data-id]').forEach((button) => {
    const id = button.dataset.id!;
    const active = saved.has(id);
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('.bookmark-icon-empty')?.classList.toggle('hidden', active);
    button.querySelector('.bookmark-icon-filled')?.classList.toggle('hidden', !active);
    button.classList.toggle('text-zinc-400', !active);
    for (const name of ['text-amber-500', 'dark:text-amber-400']) button.classList.toggle(name, active);
  });
}

/** Both card toggles and drawer removals use this idempotent action. */
export function setMaterialBookmarked(id: string, added: boolean): void {
  const current = getStoredBookmarkIds();
  if (!id || current.includes(id) === added) return;
  saveBookmarkIds(added ? [...current, id] : current.filter((entry) => entry !== id));
  renderBookmarkButtons();
  void syncBookmarkToggle(id, added);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bookmarks-updated', { detail: { id, added } }));
  }
}

export function stopBookmarkButtons(): void {
  observer?.disconnect();
  observer = undefined;
}

export function initBookmarkButtons(): void {
  stopBookmarkButtons();
  renderBookmarkButtons();
  if (typeof document !== 'undefined') {
    observer = new MutationObserver((mutations) => {
      if (
        mutations.some((mutation) =>
          [...mutation.addedNodes, ...mutation.removedNodes].some(
            (node) => node instanceof Element && (node.matches('.bookmark-btn') || node.querySelector('.bookmark-btn'))
          )
        )
      ) {
        renderBookmarkButtons();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// Backward-compatible aliases for existing callers
export const initBookmarkCounts = initBookmarkButtons;
export const stopBookmarkCounts = stopBookmarkButtons;
