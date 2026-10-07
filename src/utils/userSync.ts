import { onAuthChange, getCachedUserProfile } from '../firebase/auth';
import {
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

let isListening = false;
let unsubscribeProfileListener: (() => void) | null = null;
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
    // 1. If user signed out, clean up listener
    if (!firebaseUser) {
      if (unsubscribeProfileListener) {
        unsubscribeProfileListener();
        unsubscribeProfileListener = null;
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

    // 3. Re-sync when user returns to the tab (replaces 60s polling)
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !currentUid || !navigator.onLine) return;

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
        console.warn('[Sync] Visibility re-sync failed:', err);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
  });
}

/**
 * Syncs the user's bookmark list to their Firestore profile if logged in.
 */
export async function syncBookmarkToggle(materialId: string, isAdded: boolean): Promise<void> {
  if (!materialId) return;

  // Explicit user actions must still sync while a cloud merge is in progress.
  const cached = getCachedUserProfile();
  if (cached?.uid) {
    try {
      const synced = await syncSingleUserBookmark(cached.uid, materialId, isAdded);
      if (!synced) throw new Error('Bookmark profile sync failed');
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
