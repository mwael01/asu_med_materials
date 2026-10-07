import type {
  FlashcardCard,
  FlashcardDeck,
  FlashcardManifest,
  FlashcardProgress,
  FlashcardProgressCard,
  FlashcardRating
} from '../../types/flashcards';
import {
  getFlashcardProgressFromFirestore,
  saveFlashcardProgressToFirestore
} from '../../firebase/flashcards';

const DB_NAME = 'asumed_flashcards_db';
const DB_VERSION = 2;
const STORES = {
  PROGRESS: 'progress',
  DECKS: 'decks',
  CARDS: 'cards',
  MANIFESTS: 'manifests',
  CHECKPOINTS: 'checkpoints'
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not supported'));
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.PROGRESS)) {
        db.createObjectStore(STORES.PROGRESS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.DECKS)) {
        db.createObjectStore(STORES.DECKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.CARDS)) {
        db.createObjectStore(STORES.CARDS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.MANIFESTS)) {
        db.createObjectStore(STORES.MANIFESTS, { keyPath: 'deckId' });
      }
      if (!db.objectStoreNames.contains(STORES.CHECKPOINTS)) {
        db.createObjectStore(STORES.CHECKPOINTS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

function progressKey(uid: string | null, deckId: string): string {
  return `${uid || 'guest'}:${deckId}`;
}

function cardsKey(deckId: string, revisionId: string): string {
  return `${deckId}:${revisionId}`;
}

// -------------------------------------------------------------
// Flashcard Progress Management (Local + Cloud Sync)
// -------------------------------------------------------------

export async function loadFlashcardProgress(
  uid: string | null,
  deckId: string
): Promise<FlashcardProgress | null> {
  if (typeof indexedDB === 'undefined' || !deckId) return null;

  try {
    const db = await openDb();
    const local = await new Promise<FlashcardProgress | null>((resolve, reject) => {
      const tx = db.transaction(STORES.PROGRESS, 'readonly');
      const req = tx.objectStore(STORES.PROGRESS).get(progressKey(uid, deckId));
      req.onsuccess = () => resolve(req.result?.value || null);
      req.onerror = () => reject(req.error);
    });

    // If authenticated and online, check Firestore for newer sync
    if (uid && navigator.onLine) {
      getFlashcardProgressFromFirestore(uid, deckId).then((remote) => {
        if (!remote) return;
        if (!local || remote.updatedAt > (local.updatedAt || 0) || remote.resetVersion > (local.resetVersion || 0)) {
          saveLocalProgress(uid, remote);
        }
      }).catch(() => {});
    }

    return local;
  } catch (err) {
    console.warn('[Persistence] Error loading progress:', err);
    return null;
  }
}

async function saveLocalProgress(uid: string | null, progress: FlashcardProgress): Promise<void> {
  if (typeof indexedDB === 'undefined' || !progress?.deckId) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.PROGRESS, 'readwrite');
    const req = tx.objectStore(STORES.PROGRESS).put({
      key: progressKey(uid, progress.deckId),
      value: progress
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveFlashcardProgress(
  uid: string | null,
  progress: FlashcardProgress
): Promise<void> {
  await saveLocalProgress(uid, progress);

  // If user signed in, sync to Firestore
  if (uid && navigator.onLine) {
    saveFlashcardProgressToFirestore(uid, progress).catch((err) => {
      console.warn('[Persistence] Cloud progress sync failed, will retry:', err);
    });
  }
}

export async function mergeGuestProgressOnLogin(uid: string, deckIds: string[]): Promise<void> {
  if (!uid || typeof indexedDB === 'undefined') return;

  for (const deckId of deckIds) {
    const guestProgress = await loadFlashcardProgress(null, deckId);
    if (!guestProgress || Object.keys(guestProgress.cards || {}).length === 0) continue;

    const userProgress = await loadFlashcardProgress(uid, deckId);
    if (!userProgress) {
      // User has no progress for this deck, copy guest progress directly
      const merged: FlashcardProgress = {
        ...guestProgress,
        updatedAt: Date.now()
      };
      await saveFlashcardProgress(uid, merged);
    } else {
      // Merge: user cards win on conflict, add guest-only reviewed cards
      const mergedCards = { ...guestProgress.cards, ...userProgress.cards };
      const merged: FlashcardProgress = {
        deckId,
        revisionId: userProgress.revisionId || guestProgress.revisionId,
        checkpointIndex: userProgress.checkpointIndex,
        resetVersion: Math.max(userProgress.resetVersion || 0, guestProgress.resetVersion || 0),
        updatedAt: Date.now(),
        cards: mergedCards
      };
      await saveFlashcardProgress(uid, merged);
    }
  }
}

export function rateProgress(
  progress: FlashcardProgress,
  cardId: string,
  rating: FlashcardRating,
  contentHash: string,
  revisionId: string
): FlashcardProgress {
  const card: FlashcardProgressCard = {
    cardId,
    status: rating,
    contentHash,
    updatedAt: Date.now(),
    revisionId,
    resetVersion: progress.resetVersion
  };
  return {
    ...progress,
    revisionId,
    updatedAt: Date.now(),
    cards: { ...progress.cards, [cardId]: card }
  };
}

export function resetProgress(progress: FlashcardProgress): FlashcardProgress {
  return {
    ...progress,
    cards: {},
    checkpointIndex: 0,
    resetVersion: (progress.resetVersion || 0) + 1,
    updatedAt: Date.now()
  };
}

// -------------------------------------------------------------
// Flashcard Decks & Cards Caching in IndexedDB
// -------------------------------------------------------------

export async function cacheDeckMetadata(deck: FlashcardDeck): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.DECKS, 'readwrite');
    const req = tx.objectStore(STORES.DECKS).put(deck);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedDecks(year?: number): Promise<FlashcardDeck[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.DECKS, 'readonly');
    const req = tx.objectStore(STORES.DECKS).getAll();
    req.onsuccess = () => {
      const all: FlashcardDeck[] = req.result || [];
      const filtered = year ? all.filter((d) => d.year === year) : all;
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function cacheCardsPayload(
  deckId: string,
  revisionId: string,
  cards: FlashcardCard[]
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.CARDS, 'readwrite');
    const req = tx.objectStore(STORES.CARDS).put({
      key: cardsKey(deckId, revisionId),
      deckId,
      revisionId,
      cards,
      timestamp: Date.now()
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedCards(
  deckId: string,
  revisionId: string
): Promise<FlashcardCard[] | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CARDS, 'readonly');
    const req = tx.objectStore(STORES.CARDS).get(cardsKey(deckId, revisionId));
    req.onsuccess = () => resolve(req.result?.cards || null);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheManifest(manifest: FlashcardManifest): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.MANIFESTS, 'readwrite');
    const req = tx.objectStore(STORES.MANIFESTS).put(manifest);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedManifest(deckId: string): Promise<FlashcardManifest | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MANIFESTS, 'readonly');
    const req = tx.objectStore(STORES.MANIFESTS).get(deckId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
