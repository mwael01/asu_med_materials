import type { MaterialItem } from '../types/materials';

declare global {
  interface Window {
    __CACHED_MATERIALS?: MaterialItem[];
    __ALL_SEARCH_MATERIALS?: MaterialItem[];
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
