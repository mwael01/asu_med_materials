import { onAuthChange, getCachedUserProfile } from '../firebase/auth';
import {
  incrementMaterialBookmarkCount,
  syncSingleUserBookmark,
  syncSingleUserStudied,
  syncUserLibraryToFirestore,
  listenToUserProfile
} from '../firebase/firestore';
import {
  getStoredBookmarkIds,
  saveBookmarkIds,
  getStoredStudiedIds,
  saveStudiedIds
} from './storage';

const SYNC_INTERVAL_MS = 60_000;

let isListening = false;
let unsubscribeProfileListener: (() => void) | null = null;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let isUpdatingFromCloud = false;
let currentUid: string | null = null;

function mergeAndSync(uid: string, remoteProfile: { bookmarks?: string[]; completedMaterials?: string[] }): void {
  if (isUpdatingFromCloud) return;

  const cloudBookmarks: string[] = Array.isArray(remoteProfile.bookmarks) ? remoteProfile.bookmarks : [];
  const cloudStudied: string[] = Array.isArray(remoteProfile.completedMaterials) ? remoteProfile.completedMaterials : [];

  const localBookmarks = getStoredBookmarkIds();
  const localStudied = getStoredStudiedIds();

  const mergedBookmarks = Array.from(new Set([...cloudBookmarks, ...localBookmarks]));
  const mergedStudied = Array.from(new Set([...cloudStudied, ...localStudied]));

  const localBookmarksChanged =
    mergedBookmarks.length !== localBookmarks.length ||
    !localBookmarks.every((id) => mergedBookmarks.includes(id));

  const localStudiedChanged =
    mergedStudied.length !== localStudied.length ||
    !localStudied.every((id) => mergedStudied.includes(id));

  const cloudNeedsUpdate =
    mergedBookmarks.length !== cloudBookmarks.length ||
    mergedStudied.length !== cloudStudied.length;

  if (localBookmarksChanged || localStudiedChanged) {
    isUpdatingFromCloud = true;
    try {
      if (localBookmarksChanged) {
        saveBookmarkIds(mergedBookmarks);
      }
      if (localStudiedChanged) {
        saveStudiedIds(mergedStudied);
      }
    } finally {
      setTimeout(() => {
        isUpdatingFromCloud = false;
      }, 300);
    }
  }

  if (cloudNeedsUpdate) {
    syncUserLibraryToFirestore(uid, {
      bookmarks: mergedBookmarks,
      completedMaterials: mergedStudied
    }).catch((err) => {
      console.warn('[Sync] Failed to push merged data to Firestore:', err);
    });
  }
}

/**
 * Initializes bidirectional cloud sync for bookmarks and completed materials.
 * When the user logs in, merges cloud data with local storage and listens for multi-device updates.
 * Also sets up a 60-second periodic sync when the app is online.
 */
export function initUserLibrarySync(): void {
  if (typeof window === 'undefined') return;
  if (isListening) return;
  isListening = true;

  onAuthChange(async (firebaseUser) => {
    // 1. If user signed out, clean up listener and interval
    if (!firebaseUser) {
      if (unsubscribeProfileListener) {
        unsubscribeProfileListener();
        unsubscribeProfileListener = null;
      }
      if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
      }
      currentUid = null;
      return;
    }

    const uid = firebaseUser.uid;
    currentUid = uid;

    // 2. Setup real-time listener for multi-device sync
    if (unsubscribeProfileListener) {
      unsubscribeProfileListener();
    }

    unsubscribeProfileListener = listenToUserProfile(uid, async (remoteProfile) => {
      if (!remoteProfile) return;
      mergeAndSync(uid, remoteProfile);
    });

    // 3. Setup periodic sync (60s when online)
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
    }

    syncIntervalId = setInterval(async () => {
      if (!navigator.onLine || !currentUid) return;

      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const { getFirestoreDb } = await import('../firebase/firestore');
        const db = getFirestoreDb();
        if (!db) return;

        const userDoc = await getDoc(doc(db, 'users', currentUid));
        if (userDoc.exists()) {
          mergeAndSync(currentUid, userDoc.data());
        }
      } catch (err) {
        console.warn('[Sync] Periodic sync failed:', err);
      }
    }, SYNC_INTERVAL_MS);
  });
}

/**
 * Syncs a bookmark toggle action:
 * 1. Atomically increments/decrements the material's total bookmark/love counter in Firestore.
 * 2. Updates the material's counter and UI in all matching cards in the DOM.
 * 3. Syncs the user's bookmark list to their Firestore profile if logged in.
 */
export async function syncBookmarkToggle(materialId: string, isAdded: boolean): Promise<void> {
  if (!materialId) return;

  // 1. Optimistically update all matching bookmark buttons in the DOM
  updateDOMBookmarkCount(materialId, isAdded);

  // 2. Increment / decrement total bookmarksCount on material in Cloud Firestore
  try {
    incrementMaterialBookmarkCount(materialId, isAdded ? 1 : -1);
  } catch (err) {
    console.warn(`[Sync] Failed to update bookmark count in Firestore for ${materialId}:`, err);
  }

  // 3. If user is authenticated, sync to their user profile document
  const cached = getCachedUserProfile();
  if (cached?.uid && !isUpdatingFromCloud) {
    try {
      syncSingleUserBookmark(cached.uid, materialId, isAdded);
    } catch (err) {
      console.warn(`[Sync] Failed to sync bookmark for user ${cached.uid}:`, err);
    }
  }
}

/**
 * Syncs a completed/studied status toggle to the user profile in Firestore if logged in.
 */
export async function syncStudiedToggle(materialId: string, isStudied: boolean): Promise<void> {
  if (!materialId) return;

  const cached = getCachedUserProfile();
  if (cached?.uid && !isUpdatingFromCloud) {
    try {
      syncSingleUserStudied(cached.uid, materialId, isStudied);
    } catch (err) {
      console.warn(`[Sync] Failed to sync studied item for user ${cached.uid}:`, err);
    }
  }
}

/**
 * Updates bookmark counts and active styles across all card instances of this material in the DOM.
 */
function updateDOMBookmarkCount(materialId: string, isAdded: boolean): void {
  if (typeof document === 'undefined') return;

  const delta = isAdded ? 1 : -1;
  const escaped = CSS.escape(materialId);

  document.querySelectorAll<HTMLElement>(`.bookmark-btn[data-id="${escaped}"]`).forEach((btn) => {
    const countEl = btn.querySelector<HTMLElement>('.bookmark-count');
    if (countEl) {
      const current = parseInt(countEl.getAttribute('data-count') || countEl.textContent || '0', 10) || 0;
      const next = Math.max(0, current + delta);
      countEl.textContent = String(next);
      countEl.setAttribute('data-count', String(next));

      if (isAdded) {
        countEl.classList.add('text-amber-600', 'dark:text-amber-400');
        countEl.classList.remove('text-zinc-500', 'dark:text-zinc-400');
      } else {
        countEl.classList.remove('text-amber-600', 'dark:text-amber-400');
        countEl.classList.add('text-zinc-500', 'dark:text-zinc-400');
      }
    }

    const emptyIcon = btn.querySelector('.bookmark-icon-empty');
    const filledIcon = btn.querySelector('.bookmark-icon-filled');

    if (isAdded) {
      emptyIcon?.classList.add('hidden');
      filledIcon?.classList.remove('hidden');
      btn.classList.add('text-amber-500', 'dark:text-amber-400');
      btn.classList.remove('text-zinc-400');
    } else {
      emptyIcon?.classList.remove('hidden');
      filledIcon?.classList.add('hidden');
      btn.classList.remove('text-amber-500', 'dark:text-amber-400');
      btn.classList.add('text-zinc-400');
    }
  });
}
