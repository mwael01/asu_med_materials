import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData
} from 'firebase/firestore';
import { getFirestoreDb, sanitizeFirestorePayload } from './firestore';
import type { AcademicYear, MaterialItem } from '../types/materials';
import type { FlashcardCard, FlashcardDeck, FlashcardManifest, FlashcardProgress } from '../types/flashcards';

const DECKS = 'flashcard_decks';
const IMPORTS = 'flashcard_imports';

function toDeck(data: DocumentData, id: string): FlashcardDeck {
  return {
    ...(data as FlashcardDeck),
    id,
    tags: Array.isArray(data.tags) ? data.tags : [],
    cardCount: Number(data.cardCount || 0),
    publicationStatus: data.publicationStatus || 'draft',
  };
}

function toCard(data: DocumentData, id: string): FlashcardCard {
  return {
    ...(data as FlashcardCard),
    id,
    media: Array.isArray(data.media) ? data.media : [],
  };
}

export async function getPublishedFlashcardDecks(year?: AcademicYear): Promise<FlashcardDeck[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const ref = collection(db, DECKS);
  const constraints = [where('publicationStatus', '==', 'published'), orderBy('title'), limit(200)];
  const snap = await getDocs(year ? query(ref, where('year', '==', year), ...constraints) : query(ref, ...constraints));
  return snap.docs.map((item) => toDeck(item.data(), item.id));
}

export async function getAllFlashcardDecks(): Promise<FlashcardDeck[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const ref = collection(db, DECKS);
  const snap = await getDocs(query(ref, orderBy('updatedAt', 'desc'), limit(300)));
  return snap.docs.map((item) => toDeck(item.data(), item.id));
}

export async function getFlashcardDeck(deckId: string): Promise<FlashcardDeck | null> {
  const db = getFirestoreDb();
  if (!db || !deckId) return null;
  const snap = await getDoc(doc(db, DECKS, deckId));
  return snap.exists() ? toDeck(snap.data(), snap.id) : null;
}

export async function getFlashcardManifest(deckId: string): Promise<FlashcardManifest | null> {
  const deck = await getFlashcardDeck(deckId);
  if (!deck?.activeRevisionId || deck.publicationStatus !== 'published') return null;
  const db = getFirestoreDb();
  if (!db) return null;
  const revisionRef = doc(db, DECKS, deckId, 'revisions', deck.activeRevisionId);
  const revisionSnap = await getDoc(revisionRef);
  if (!revisionSnap.exists()) return null;
  const cards = await getDocs(collection(revisionRef, 'cards'));
  return {
    deck,
    revision: revisionSnap.data() as FlashcardManifest['revision'],
    cardIds: cards.docs.map((item) => item.id)
  };
}

export async function getFlashcardCards(deckId: string, revisionId: string): Promise<FlashcardCard[]> {
  const db = getFirestoreDb();
  if (!db || !deckId || !revisionId) return [];
  const cardsRef = collection(db, DECKS, deckId, 'revisions', revisionId, 'cards');
  const snap = await getDocs(query(cardsRef, orderBy('ordinal'), limit(5000)));
  return snap.docs.map((item) => toCard(item.data(), item.id));
}

export async function updateFlashcardDeckMetadata(
  deckId: string,
  updates: Partial<FlashcardDeck>
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !deckId) return false;
  try {
    const payload = sanitizeFirestorePayload({
      ...updates,
      updatedAt: new Date().toISOString()
    });
    await updateDoc(doc(db, DECKS, deckId), payload);
    return true;
  } catch (err) {
    console.warn(`[Firestore] Failed to update deck ${deckId}:`, err);
    return false;
  }
}

export async function publishFlashcardDeck(deckId: string, revisionId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !deckId || !revisionId) return false;

  try {
    const now = new Date().toISOString();
    // 1. Update deck
    await updateDoc(doc(db, DECKS, deckId), {
      publicationStatus: 'published',
      activeRevisionId: revisionId,
      updatedAt: now
    });

    // 2. Update revision
    await updateDoc(doc(db, DECKS, deckId, 'revisions', revisionId), {
      status: 'published',
      complete: true,
      publishedAt: now
    });

    // 3. Update or create linked material
    const deck = await getFlashcardDeck(deckId);
    if (deck) {
      const materialId = `flashcards-${deckId}`;
      const materialPayload: Partial<MaterialItem> = {
        id: materialId,
        title: deck.title,
        titleEn: deck.title,
        description: `Flashcards for ${deck.title} (${deck.cardCount} cards)`,
        descriptionEn: `Flashcards for ${deck.title} (${deck.cardCount} cards)`,
        url: `/flashcards/${deckId}`,
        type: 'flashcards',
        category: 'flashcards',
        year: deck.year,
        moduleId: deck.moduleId,
        subject: deck.subject || 'General',
        tags: ['flashcards', 'anki', deck.moduleId, ...(deck.tags || [])],
        flashcardDeckId: deckId,
        createdAt: deck.createdAt || now
      };
      await setDoc(doc(db, 'materials', materialId), sanitizeFirestorePayload(materialPayload), { merge: true });
    }

    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to publish deck ${deckId}:`, err);
    return false;
  }
}

export async function unpublishFlashcardDeck(deckId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !deckId) return false;

  try {
    await updateDoc(doc(db, DECKS, deckId), {
      publicationStatus: 'draft',
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to unpublish deck ${deckId}:`, err);
    return false;
  }
}

export async function getFlashcardProgressFromFirestore(
  uid: string,
  deckId: string
): Promise<FlashcardProgress | null> {
  const db = getFirestoreDb();
  if (!db || !uid || !deckId) return null;

  try {
    const progressRef = doc(db, 'users', uid, 'flashcard_progress', deckId);
    const snap = await getDoc(progressRef);
    return snap.exists() ? (snap.data() as FlashcardProgress) : null;
  } catch (err) {
    console.warn(`[Firestore] Failed to load progress for user ${uid}, deck ${deckId}:`, err);
    return null;
  }
}

export async function saveFlashcardProgressToFirestore(
  uid: string,
  progress: FlashcardProgress
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !uid || !progress?.deckId) return false;

  try {
    const progressRef = doc(db, 'users', uid, 'flashcard_progress', progress.deckId);
    await setDoc(progressRef, sanitizeFirestorePayload(progress), { merge: true });
    return true;
  } catch (err) {
    console.warn(`[Firestore] Failed to save progress for user ${uid}, deck ${progress.deckId}:`, err);
    return false;
  }
}

export async function getAllFlashcardImports(): Promise<any[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, IMPORTS), orderBy('createdAt', 'desc'), limit(50)));
    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.warn('[Firestore] Failed to fetch imports:', err);
    return [];
  }
}
