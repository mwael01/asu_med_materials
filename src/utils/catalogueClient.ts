import type { MaterialItem, ModuleInfo } from '../types/materials';
import type { MaterialCollection } from '../types/collections';
import type { Lesson } from '../types/lessons';

declare global {
  interface Window {
    __CACHED_MATERIALS?: MaterialItem[];
    __ALL_SEARCH_MATERIALS?: MaterialItem[];
    __CACHED_COLLECTIONS?: MaterialCollection[];
    __CACHED_MODULES?: ModuleInfo[];
    __CACHED_LESSONS?: Lesson[];
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

const MODULES_STORAGE_KEY = 'asumed_modules_snapshot';

interface ModulesStoragePayload {
  timestamp: number;
  modules: ModuleInfo[];
}

/**
 * Loads curriculum modules from in-memory cache, local snapshot, or /api/modules endpoint.
 */
export async function getClientModules(): Promise<ModuleInfo[]> {
  // 1. In-memory check
  if (typeof window !== 'undefined') {
    if (window.__CACHED_MODULES && window.__CACHED_MODULES.length > 0) {
      return window.__CACHED_MODULES;
    }
  }

  // 2. Local storage snapshot check
  let cachedPayload: ModulesStoragePayload | null = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(MODULES_STORAGE_KEY);
      if (raw) {
        cachedPayload = JSON.parse(raw);
        if (cachedPayload && Array.isArray(cachedPayload.modules) && cachedPayload.modules.length > 0) {
          window.__CACHED_MODULES = cachedPayload.modules;
          const isFresh = Date.now() - cachedPayload.timestamp < SNAPSHOT_EXPIRY_MS;
          if (isFresh) {
            void revalidateModulesInBackground();
            return cachedPayload.modules;
          }
        }
      }
    } catch {}
  }

  // 3. Fetch from /api/modules (intercepted by Service Worker offline cache)
  try {
    const res = await fetch('/api/modules');
    if (res.ok) {
      const data: ModuleInfo[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        if (typeof window !== 'undefined') {
          window.__CACHED_MODULES = data;
          try {
            const payload: ModulesStoragePayload = { timestamp: Date.now(), modules: data };
            window.localStorage?.setItem(MODULES_STORAGE_KEY, JSON.stringify(payload));
          } catch {}
        }
        return data;
      }
    }
  } catch {}

  // Fallback to stale snapshot if fetch failed (e.g. offline)
  if (cachedPayload && Array.isArray(cachedPayload.modules)) {
    return cachedPayload.modules;
  }

  return [];
}

async function revalidateModulesInBackground(): Promise<void> {
  try {
    const res = await fetch('/api/modules');
    if (res.ok) {
      const data: ModuleInfo[] = await res.json();
      if (Array.isArray(data) && typeof window !== 'undefined') {
        window.__CACHED_MODULES = data;
        const payload: ModulesStoragePayload = { timestamp: Date.now(), modules: data };
        try {
          window.localStorage?.setItem(MODULES_STORAGE_KEY, JSON.stringify(payload));
        } catch {}
      }
    }
  } catch {}
}

/**
 * Resolves a single module ID to a ModuleInfo object using client cache.
 */
export async function getClientModuleById(id: string): Promise<ModuleInfo | null> {
  if (!id) return null;
  const modules = await getClientModules();
  return modules.find((m) => m.id === id) || null;
}

const LESSONS_STORAGE_KEY = 'asumed_lessons_snapshot';

interface LessonsStoragePayload {
  timestamp: number;
  lessons: Lesson[];
}

/**
 * Loads curriculum lessons from in-memory cache, local snapshot, or /api/lessons endpoint.
 */
export async function getClientLessons(): Promise<Lesson[]> {
  // 1. In-memory check
  if (typeof window !== 'undefined') {
    if (window.__CACHED_LESSONS && window.__CACHED_LESSONS.length > 0) {
      return window.__CACHED_LESSONS;
    }
  }

  // 2. Local storage snapshot check
  let cachedPayload: LessonsStoragePayload | null = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(LESSONS_STORAGE_KEY);
      if (raw) {
        cachedPayload = JSON.parse(raw);
        if (cachedPayload && Array.isArray(cachedPayload.lessons) && cachedPayload.lessons.length > 0) {
          window.__CACHED_LESSONS = cachedPayload.lessons;
          const isFresh = Date.now() - cachedPayload.timestamp < SNAPSHOT_EXPIRY_MS;
          if (isFresh) {
            void revalidateLessonsInBackground();
            return cachedPayload.lessons;
          }
        }
      }
    } catch {}
  }

  // 3. Fetch from /api/lessons (intercepted by Service Worker offline cache)
  try {
    const res = await fetch('/api/lessons');
    if (res.ok) {
      const data: Lesson[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        if (typeof window !== 'undefined') {
          window.__CACHED_LESSONS = data;
          try {
            const payload: LessonsStoragePayload = { timestamp: Date.now(), lessons: data };
            window.localStorage?.setItem(LESSONS_STORAGE_KEY, JSON.stringify(payload));
          } catch {}
        }
        return data;
      }
    }
  } catch {}

  // Fallback to stale snapshot if fetch failed (e.g. offline)
  if (cachedPayload && Array.isArray(cachedPayload.lessons)) {
    return cachedPayload.lessons;
  }

  return [];
}

async function revalidateLessonsInBackground(): Promise<void> {
  try {
    const res = await fetch('/api/lessons');
    if (res.ok) {
      const data: Lesson[] = await res.json();
      if (Array.isArray(data) && typeof window !== 'undefined') {
        window.__CACHED_LESSONS = data;
        const payload: LessonsStoragePayload = { timestamp: Date.now(), lessons: data };
        try {
          window.localStorage?.setItem(LESSONS_STORAGE_KEY, JSON.stringify(payload));
        } catch {}
      }
    }
  } catch {}
}

/**
 * Eagerly restores all catalogue snapshots from localStorage into in-memory window cache
 * and initiates non-blocking background revalidation. Guarantees instant 0ms access to
 * materials, modules, and lessons everywhere across the site.
 */
export function warmupCatalogueCache(): void {
  if (typeof window === 'undefined') return;

  // 1. Eager restore materials
  if (!window.__CACHED_MATERIALS || window.__CACHED_MATERIALS.length === 0) {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const payload = JSON.parse(raw);
        if (payload && Array.isArray(payload.materials) && payload.materials.length > 0) {
          window.__CACHED_MATERIALS = payload.materials;
        }
      }
    } catch {}
  }

  // 2. Eager restore modules
  if (!window.__CACHED_MODULES || window.__CACHED_MODULES.length === 0) {
    try {
      const raw = window.localStorage?.getItem(MODULES_STORAGE_KEY);
      if (raw) {
        const payload = JSON.parse(raw);
        if (payload && Array.isArray(payload.modules) && payload.modules.length > 0) {
          window.__CACHED_MODULES = payload.modules;
        }
      }
    } catch {}
  }

  // 3. Eager restore lessons
  if (!window.__CACHED_LESSONS || window.__CACHED_LESSONS.length === 0) {
    try {
      const raw = window.localStorage?.getItem(LESSONS_STORAGE_KEY);
      if (raw) {
        const payload = JSON.parse(raw);
        if (payload && Array.isArray(payload.lessons) && payload.lessons.length > 0) {
          window.__CACHED_LESSONS = payload.lessons;
        }
      }
    } catch {}
  }

  // 4. Eager restore collections
  if (!window.__CACHED_COLLECTIONS || window.__CACHED_COLLECTIONS.length === 0) {
    try {
      const raw = window.localStorage?.getItem(COLLECTIONS_STORAGE_KEY);
      if (raw) {
        const payload = JSON.parse(raw);
        if (payload && Array.isArray(payload.collections) && payload.collections.length > 0) {
          window.__CACHED_COLLECTIONS = payload.collections;
        }
      }
    } catch {}
  }

  // 5. Trigger background fetch / revalidation if needed
  void getClientModules();
  void getClientMaterials();
  void getClientLessons();
}



