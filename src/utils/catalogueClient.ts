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
const MODULES_STORAGE_KEY = 'asumed_modules_snapshot';
const LESSONS_STORAGE_KEY = 'asumed_lessons_snapshot';
const COLLECTIONS_STORAGE_KEY = 'asumed_collections_snapshot';

const SNAPSHOT_EXPIRY_MS = 1000 * 60 * 30; // 30 minutes

interface StoragePayload {
  timestamp: number;
  version?: number;
  materials: MaterialItem[];
}

interface ModulesStoragePayload {
  timestamp: number;
  version?: number;
  modules: ModuleInfo[];
}

interface LessonsStoragePayload {
  timestamp: number;
  version?: number;
  lessons: Lesson[];
}

interface CollectionsStoragePayload {
  timestamp: number;
  collections: MaterialCollection[];
}

// Single-flight in-flight request locks to prevent duplicate network calls
let materialsFetchPromise: Promise<MaterialItem[]> | null = null;
let modulesFetchPromise: Promise<ModuleInfo[]> | null = null;
let lessonsFetchPromise: Promise<Lesson[]> | null = null;
let collectionsFetchPromise: Promise<MaterialCollection[]> | null = null;

/**
 * Reads the server-rendered catalogue version from the HTML document meta tag.
 */
export function getPageCatalogueVersion(): number | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector('meta[name="catalogue-version"]');
  if (!meta) return null;
  const val = parseInt(meta.getAttribute('content') || '', 10);
  return Number.isFinite(val) && val > 0 ? val : null;
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
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        cachedPayload = JSON.parse(raw);
        if (cachedPayload && Array.isArray(cachedPayload.materials) && cachedPayload.materials.length > 0) {
          window.__CACHED_MATERIALS = cachedPayload.materials;

          const pageVersion = getPageCatalogueVersion();
          // If stored version matches current page version, data is 100% up to date - NO network calls!
          if (pageVersion && cachedPayload.version === pageVersion) {
            return cachedPayload.materials;
          }

          const isFresh = Date.now() - cachedPayload.timestamp < SNAPSHOT_EXPIRY_MS;
          // If fresh and no newer version indicated, return immediately without network fetch
          if (isFresh && (!pageVersion || cachedPayload.version === pageVersion)) {
            return cachedPayload.materials;
          }

          // If newer version exists on server, serve cached immediately and refresh in background once
          if (pageVersion && cachedPayload.version && cachedPayload.version < pageVersion) {
            void revalidateCatalogueInBackground();
            return cachedPayload.materials;
          }

          if (isFresh) {
            return cachedPayload.materials;
          }
        }
      }
    } catch {
      // LocalStorage error or parsing failure; proceed to fetch
    }
  }

  // 3. Fetch from /api/materials (intercepted by Service Worker offline cache)
  return revalidateCatalogueInBackground(cachedPayload?.materials);
}

/**
 * Asynchronously refreshes the client materials snapshot in the background.
 * Uses single-flight locking to avoid duplicate concurrent fetches.
 */
export async function revalidateCatalogueInBackground(fallback?: MaterialItem[]): Promise<MaterialItem[]> {
  if (materialsFetchPromise) return materialsFetchPromise;

  materialsFetchPromise = (async () => {
    try {
      const res = await fetch('/api/materials');
      if (res.ok) {
        const data: MaterialItem[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          if (typeof window !== 'undefined') {
            window.__CACHED_MATERIALS = data;
            const pageVersion = getPageCatalogueVersion() || 1;
            const payload: StoragePayload = {
              timestamp: Date.now(),
              version: pageVersion,
              materials: data
            };
            try {
              window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
            } catch {
              // Ignore storage quota error
            }
          }
          return data;
        }
      }
    } catch {
      // Network failure / offline
    }
    return fallback || [];
  })().finally(() => {
    materialsFetchPromise = null;
  });

  return materialsFetchPromise;
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
 * Resolves a single material ID to a MaterialItem object.
 */
export async function getClientMaterialById(id: string): Promise<MaterialItem | null> {
  const materials = await getClientMaterials();
  return materials.find((m) => m.id === id) || null;
}

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
  let cachedPayload: CollectionsStoragePayload | null = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(COLLECTIONS_STORAGE_KEY);
      if (raw) {
        cachedPayload = JSON.parse(raw);
        if (cachedPayload && Array.isArray(cachedPayload.collections) && cachedPayload.collections.length > 0) {
          window.__CACHED_COLLECTIONS = cachedPayload.collections;
          const isFresh = Date.now() - cachedPayload.timestamp < SNAPSHOT_EXPIRY_MS;
          if (isFresh) {
            return cachedPayload.collections;
          }
        }
      }
    } catch {}
  }

  // Fetch /api/collections
  return revalidateCollectionsInBackground(cachedPayload?.collections);
}

export async function revalidateCollectionsInBackground(fallback?: MaterialCollection[]): Promise<MaterialCollection[]> {
  if (collectionsFetchPromise) return collectionsFetchPromise;

  collectionsFetchPromise = (async () => {
    try {
      const res = await fetch('/api/collections');
      if (res.ok) {
        const data: MaterialCollection[] = await res.json();
        if (Array.isArray(data)) {
          if (typeof window !== 'undefined') {
            window.__CACHED_COLLECTIONS = data;
            const payload: CollectionsStoragePayload = { timestamp: Date.now(), collections: data };
            try {
              window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(payload));
            } catch {}
          }
          return data;
        }
      }
    } catch {}
    return fallback || [];
  })().finally(() => {
    collectionsFetchPromise = null;
  });

  return collectionsFetchPromise;
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

          const pageVersion = getPageCatalogueVersion();
          if (pageVersion && cachedPayload.version === pageVersion) {
            return cachedPayload.modules;
          }

          const isFresh = Date.now() - cachedPayload.timestamp < SNAPSHOT_EXPIRY_MS;
          if (isFresh && (!pageVersion || cachedPayload.version === pageVersion)) {
            return cachedPayload.modules;
          }

          if (pageVersion && cachedPayload.version && cachedPayload.version < pageVersion) {
            void revalidateModulesInBackground();
            return cachedPayload.modules;
          }

          if (isFresh) {
            return cachedPayload.modules;
          }
        }
      }
    } catch {}
  }

  // 3. Fetch from /api/modules
  return revalidateModulesInBackground(cachedPayload?.modules);
}

export async function revalidateModulesInBackground(fallback?: ModuleInfo[]): Promise<ModuleInfo[]> {
  if (modulesFetchPromise) return modulesFetchPromise;

  modulesFetchPromise = (async () => {
    try {
      const res = await fetch('/api/modules');
      if (res.ok) {
        const data: ModuleInfo[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          if (typeof window !== 'undefined') {
            window.__CACHED_MODULES = data;
            const pageVersion = getPageCatalogueVersion() || 1;
            const payload: ModulesStoragePayload = {
              timestamp: Date.now(),
              version: pageVersion,
              modules: data
            };
            try {
              window.localStorage?.setItem(MODULES_STORAGE_KEY, JSON.stringify(payload));
            } catch {}
          }
          return data;
        }
      }
    } catch {}
    return fallback || [];
  })().finally(() => {
    modulesFetchPromise = null;
  });

  return modulesFetchPromise;
}

/**
 * Resolves a single module ID to a ModuleInfo object using client cache.
 */
export async function getClientModuleById(id: string): Promise<ModuleInfo | null> {
  if (!id) return null;
  const modules = await getClientModules();
  return modules.find((m) => m.id === id) || null;
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

          const pageVersion = getPageCatalogueVersion();
          if (pageVersion && cachedPayload.version === pageVersion) {
            return cachedPayload.lessons;
          }

          const isFresh = Date.now() - cachedPayload.timestamp < SNAPSHOT_EXPIRY_MS;
          if (isFresh && (!pageVersion || cachedPayload.version === pageVersion)) {
            return cachedPayload.lessons;
          }

          if (pageVersion && cachedPayload.version && cachedPayload.version < pageVersion) {
            void revalidateLessonsInBackground();
            return cachedPayload.lessons;
          }

          if (isFresh) {
            return cachedPayload.lessons;
          }
        }
      }
    } catch {}
  }

  // 3. Fetch from /api/lessons
  return revalidateLessonsInBackground(cachedPayload?.lessons);
}

export async function revalidateLessonsInBackground(fallback?: Lesson[]): Promise<Lesson[]> {
  if (lessonsFetchPromise) return lessonsFetchPromise;

  lessonsFetchPromise = (async () => {
    try {
      const res = await fetch('/api/lessons');
      if (res.ok) {
        const data: Lesson[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          if (typeof window !== 'undefined') {
            window.__CACHED_LESSONS = data;
            const pageVersion = getPageCatalogueVersion() || 1;
            const payload: LessonsStoragePayload = {
              timestamp: Date.now(),
              version: pageVersion,
              lessons: data
            };
            try {
              window.localStorage?.setItem(LESSONS_STORAGE_KEY, JSON.stringify(payload));
            } catch {}
          }
          return data;
        }
      }
    } catch {}
    return fallback || [];
  })().finally(() => {
    lessonsFetchPromise = null;
  });

  return lessonsFetchPromise;
}

/**
 * Eagerly restores all catalogue snapshots from localStorage into in-memory window cache.
 * Guarantees instant 0ms access to materials, modules, and lessons everywhere across the site.
 * Does NOT spam network requests when the stored version matches the current page version.
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

  // 5. Version-driven revalidation: only refresh in background if page reports a newer version
  const pageVersion = getPageCatalogueVersion();
  if (pageVersion) {
    try {
      const matRaw = window.localStorage?.getItem(STORAGE_KEY);
      const matPayload = matRaw ? JSON.parse(matRaw) : null;
      if (!matPayload || !matPayload.version || matPayload.version < pageVersion) {
        void revalidateCatalogueInBackground();
        void revalidateModulesInBackground();
        void revalidateLessonsInBackground();
      }
    } catch {}
  }
}
