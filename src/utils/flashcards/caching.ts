import type { AcademicYear } from '../../types/materials';
import type { FlashcardCard, FlashcardDeck } from '../../types/flashcards';
import {
  getPublishedFlashcardDecks,
  getFlashcardCards,
  getFlashcardManifest
} from '../../firebase/flashcards';
import {
  cacheDeckMetadata,
  cacheCardsPayload,
  cacheManifest,
  getCachedCards,
  getCachedManifest
} from './persistence';

const MEDIA_CACHE_NAME = 'asumed-flashcard-media';
const CONCURRENCY_LIMIT = 4;

let activeAbortController: AbortController | null = null;
let currentPrefetchYear: number | null = null;

/**
 * Concurrency runner limiting simultaneous background fetch operations to `limit`.
 */
async function asyncPool<T, R>(
  limit: number,
  items: T[],
  fn: (item: T, signal: AbortSignal) => Promise<R>,
  signal: AbortSignal
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<any>[] = [];

  for (const item of items) {
    if (signal.aborted) break;

    const p = Promise.resolve().then(() => fn(item, signal));
    results.push(p as any);

    if (limit <= items.length) {
      const e: Promise<any> = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(results);
}

/**
 * Extracts all image URLs referenced by a deck's cards (via media metadata and HTML <img> tags).
 */
export function extractCardImageUrls(cards: FlashcardCard[]): string[] {
  const urls = new Set<string>();
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;

  for (const card of cards) {
    if (card.media && Array.isArray(card.media)) {
      for (const m of card.media) {
        if (m.storagePath) {
          urls.add(m.storagePath);
        }
      }
    }

    const html = `${card.questionHtml || ''} ${card.answerHtml || ''}`;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(html)) !== null) {
      const src = match[1]?.trim();
      if (src && !src.startsWith('data:')) {
        urls.add(src);
      }
    }
  }

  return Array.from(urls);
}

/**
 * Caches image assets only when the user opens a specific deck in the study player.
 * Images are stored in 'asumed-flashcard-media' Cache Storage to provide fast offline review
 * without causing network congestion when the website is first loaded.
 */
export async function cacheDeckImagesOnOpen(cards: FlashcardCard[]): Promise<void> {
  if (typeof window === 'undefined' || typeof caches === 'undefined' || !cards || cards.length === 0) return;

  try {
    const urls = extractCardImageUrls(cards);
    if (urls.length === 0) return;

    const cache = await caches.open(MEDIA_CACHE_NAME);

    await asyncPool(
      CONCURRENCY_LIMIT,
      urls,
      async (url, signal) => {
        if (signal.aborted) return;
        try {
          const match = await cache.match(url);
          if (!match) {
            const res = await fetch(url, { signal, mode: 'cors' });
            if (res.ok) {
              await cache.put(url, res);
            }
          }
        } catch {
          // Silently ignore individual image network or offline errors
        }
      },
      new AbortController().signal
    );
  } catch (err) {
    console.warn('[Cache] Error caching deck images on open:', err);
  }
}

/**
 * Caches a single deck's metadata, manifest, and cards payload.
 * Intentionally does NOT download image binaries upfront.
 */
async function prefetchDeck(
  deck: FlashcardDeck,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted || !deck.activeRevisionId) return;

  // 1. Cache deck metadata in IndexedDB
  await cacheDeckMetadata(deck);

  // 2. Fetch and cache manifest if needed
  let manifest = await getCachedManifest(deck.id);
  if (!manifest || manifest.revision.id !== deck.activeRevisionId) {
    manifest = await getFlashcardManifest(deck.id);
    if (manifest) {
      await cacheManifest(manifest);
    }
  }

  // 3. Fetch and cache cards payload if needed
  let cachedCards = await getCachedCards(deck.id, deck.activeRevisionId);
  if (!cachedCards) {
    cachedCards = await getFlashcardCards(deck.id, deck.activeRevisionId);
    if (cachedCards && cachedCards.length > 0) {
      await cacheCardsPayload(deck.id, deck.activeRevisionId, cachedCards);
    }
  }
}

/**
 * Automatically prefetches all published flashcard decks for the student's selected year in the background.
 * Respects 4 concurrent downloads, prioritizes opened deck, and aborts if year preference changes.
 */
export async function prefetchYearFlashcards(
  year: AcademicYear,
  priorityDeckId?: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  // If already prefetching for this year and no priority deck change, skip
  if (currentPrefetchYear === year && !priorityDeckId && activeAbortController) {
    return;
  }

  // Abort any active prefetch job
  if (activeAbortController) {
    activeAbortController.abort();
  }

  const controller = new AbortController();
  activeAbortController = controller;
  currentPrefetchYear = year;

  try {
    const decks = await getPublishedFlashcardDecks(year);
    if (controller.signal.aborted || !decks || decks.length === 0) return;

    // Prioritize currently opened deck
    const sortedDecks = [...decks].sort((a, b) => {
      if (a.id === priorityDeckId) return -1;
      if (b.id === priorityDeckId) return 1;
      return 0;
    });

    await asyncPool(
      CONCURRENCY_LIMIT,
      sortedDecks,
      (deck, signal) => prefetchDeck(deck, signal),
      controller.signal
    );
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn('[Cache] Background prefetching encountered error:', err);
    }
  } finally {
    if (activeAbortController === controller) {
      activeAbortController = null;
    }
  }
}

/**
 * Initializes automatic background prefetch listeners based on user year preferences.
 */
export function initFlashcardPrefetching(): void {
  if (typeof window === 'undefined') return;

  const run = () => {
    const rawYear = localStorage.getItem('asumed_user_year');
    const yearNum = rawYear ? parseInt(rawYear, 10) : 2;
    if (yearNum >= 1 && yearNum <= 5) {
      prefetchYearFlashcards(yearNum as AcademicYear);
    }
  };

  window.addEventListener('user-preferences-updated', (event: any) => {
    const newYear = event?.detail?.year;
    if (newYear) {
      prefetchYearFlashcards(newYear as AcademicYear);
    }
  });

  // Delay prefetch slightly after page load so it doesn't contend with initial page assets
  if (document.readyState === 'complete') {
    setTimeout(run, 1500);
  } else {
    window.addEventListener('load', () => setTimeout(run, 1500), { once: true });
  }
}
