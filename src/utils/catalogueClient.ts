import type { MaterialItem } from '../types/materials';
import type { MaterialCollection } from '../types/collections';

declare global {
  interface Window {
    __CACHED_MATERIALS?: MaterialItem[];
    __ALL_SEARCH_MATERIALS?: MaterialItem[];
    __CACHED_COLLECTIONS?: MaterialCollection[];
  }
}

const STORAGE_KEY = 'asumed_catalogue_snapshot';
const SNAPSHOT_EXPIRY_MS = 1000 * 60 * 30; // 30 minutes

interface StoragePayload {
  timestamp: number;
  materials: MaterialItem[];
}

/**
 * Loads materials from in-memory cache, local snapshot, or the edge-cached /api/materials endpoint.
 * Guarantees zero Firestore queries from client-side execution.
 */
export async function getClientMaterials(): Promise<MaterialItem[]> {
  // 1. In-memory check
  if (typeof window !== 'undefined') {
    if (window.__CACHED_MATERIALS && window.__CACHED_MATERIALS.length > 0) {
      return window.__CACHED_MATERIALS;
    }
    if (window.__ALL_SEARCH_MATERIALS && window.__ALL_SEARCH_MATERIALS.length > 0) {
      window.__CACHED_MATERIALS = window.__ALL_SEARCH_MATERIALS;
      return window.__CACHED_MATERIALS;
    }
  }

  // 2. Local storage snapshot check
  let cachedPayload: StoragePayload | null = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        cachedPayload = JSON.parse(raw);
        if (cachedPayload && Array.isArray(cachedPayload.materials) && cachedPayload.materials.length > 0) {
          window.__CACHED_MATERIALS = cachedPayload.materials;

          // If snapshot is still relatively fresh, return it and revalidate asynchronously
          const isFresh = Date.now() - cachedPayload.timestamp < SNAPSHOT_EXPIRY_MS;
          if (isFresh) {
            void revalidateCatalogueInBackground();
            return cachedPayload.materials;
          }
        }
      }
    } catch {
      // LocalStorage error or parsing failure; proceed to fetch
    }
  }

  // 3. Fetch from /api/materials (intercepted by Service Worker offline cache)
  try {
    const res = await fetch('/api/materials');
    if (res.ok) {
      const data: MaterialItem[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        if (typeof window !== 'undefined') {
          window.__CACHED_MATERIALS = data;
          try {
            const payload: StoragePayload = { timestamp: Date.now(), materials: data };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
          } catch {
            // Storage quota exceeded or disabled
          }
        }
        return data;
      }
    }
  } catch {
    // Network failure / offline
  }

  // If fetch failed but we had a stale snapshot, return stale snapshot
  if (cachedPayload && Array.isArray(cachedPayload.materials)) {
    return cachedPayload.materials;
  }

  return [];
}

/**
 * Asynchronously refreshes the client materials snapshot in the background.
 */
async function revalidateCatalogueInBackground(): Promise<void> {
  try {
    const res = await fetch('/api/materials');
    if (res.ok) {
      const data: MaterialItem[] = await res.json();
      if (Array.isArray(data) && data.length > 0 && typeof window !== 'undefined') {
        window.__CACHED_MATERIALS = data;
        const payload: StoragePayload = { timestamp: Date.now(), materials: data };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
          // Ignore storage quota error
        }
      }
    }
  } catch {
    // Ignore background revalidation errors
  }
}

/**
 * Resolves an array of material IDs to full MaterialItem objects using the client catalogue.
 */
export async function getClientMaterialsByIds(ids: string[]): Promise<MaterialItem[]> {
  if (!ids || ids.length === 0) return [];
  const materials = await getClientMaterials();
  const idSet = new Set(ids);
  return materials.filter((m) => idSet.has(m.id));
}

/**
 * Resolves a single material ID to a MaterialItem object using the client catalogue.
 */
export async function getClientMaterialById(id: string): Promise<MaterialItem | null> {
  if (!id) return null;
  const materials = await getClientMaterials();
  return materials.find((m) => m.id === id) || null;
}

const COLLECTIONS_STORAGE_KEY = 'asumed_collections_snapshot';

/**
 * Loads collections from in-memory cache, local snapshot, or /api/collections endpoint.
 */
export async function getClientCollections(): Promise<MaterialCollection[]> {
  if (typeof window !== 'undefined') {
    if (window.__CACHED_COLLECTIONS && window.__CACHED_COLLECTIONS.length > 0) {
      return window.__CACHED_COLLECTIONS;
    }
  }

  // Local storage check
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
      if (raw) {
        const payload = JSON.parse(raw);
        if (payload && Array.isArray(payload.collections) && payload.collections.length > 0) {
          window.__CACHED_COLLECTIONS = payload.collections;
          const isFresh = Date.now() - payload.timestamp < SNAPSHOT_EXPIRY_MS;
          if (isFresh) {
            void revalidateCollectionsInBackground();
            return payload.collections;
          }
        }
      }
    } catch {}
  }

  // Fetch /api/collections
  try {
    const res = await fetch('/api/collections');
    if (res.ok) {
      const data: MaterialCollection[] = await res.json();
      if (Array.isArray(data)) {
        if (typeof window !== 'undefined') {
          window.__CACHED_COLLECTIONS = data;
          try {
            localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify({ timestamp: Date.now(), collections: data }));
          } catch {}
        }
        return data;
      }
    }
  } catch {}

  return [];
}

async function revalidateCollectionsInBackground(): Promise<void> {
  try {
    const res = await fetch('/api/collections');
    if (res.ok) {
      const data: MaterialCollection[] = await res.json();
      if (Array.isArray(data) && typeof window !== 'undefined') {
        window.__CACHED_COLLECTIONS = data;
        try {
          localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify({ timestamp: Date.now(), collections: data }));
        } catch {}
      }
    }
  } catch {}
}

/**
 * Resolves an array of collection IDs to full MaterialCollection objects.
 */
export async function getClientCollectionsByIds(ids: string[]): Promise<MaterialCollection[]> {
  if (!ids || ids.length === 0) return [];
  const collections = await getClientCollections();
  const idSet = new Set(ids);
  return collections.filter((c) => idSet.has(c.id));
}

/**
 * Resolves a single collection ID to a MaterialCollection object.
 */
export async function getClientCollectionById(id: string): Promise<MaterialCollection | null> {
  if (!id) return null;
  const collections = await getClientCollections();
  return collections.find((c) => c.id === id) || null;
}

