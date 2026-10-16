import type { MaterialCollection, CollectionWithMaterials } from '../types/collections';
import type { AcademicYear, MaterialItem } from '../types/materials';
import { fetchCollectionsFromFirestore } from '../firebase/firestore';
import { getAllMaterials } from './materials';

let cachedCollections: MaterialCollection[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute in-memory cache for SSR

/**
 * Retrieves all curated collections from Cloud Firestore with runtime caching.
 */
export async function getAllCollections(): Promise<MaterialCollection[]> {
  const now = Date.now();
  if (cachedCollections && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedCollections;
  }

  try {
    const collections = await fetchCollectionsFromFirestore();
    if (collections && collections.length > 0) {
      cachedCollections = collections;
      lastFetchTime = now;
      return collections;
    }
  } catch (err) {
    console.warn('[Collections] Failed to fetch collections from Firestore:', err);
  }

  return cachedCollections || [];
}

/**
 * Invalidates the in-memory collections cache.
 */
export function invalidateCollectionsCache(): void {
  cachedCollections = null;
  lastFetchTime = 0;
}

/**
 * Retrieves a single collection by ID along with its resolved child materials in curated order.
 */
export async function getCollectionById(id: string): Promise<CollectionWithMaterials | null> {
  if (!id) return null;
  const collections = await getAllCollections();
  const col = collections.find((c) => c.id === id);
  if (!col) return null;

  const allMaterials = await getAllMaterials();
  const materialMap = new Map<string, MaterialItem>();
  for (let i = 0; i < allMaterials.length; i++) {
    materialMap.set(allMaterials[i].id, allMaterials[i]);
  }

  const materials: MaterialItem[] = [];
  if (Array.isArray(col.materialIds)) {
    for (const mId of col.materialIds) {
      const mat = materialMap.get(mId);
      if (mat) {
        materials.push(mat);
      }
    }
  }

  return {
    ...col,
    materials
  };
}

/**
 * Filter collections by academic year.
 */
export async function getCollectionsByYear(year: AcademicYear): Promise<MaterialCollection[]> {
  const collections = await getAllCollections();
  return collections.filter((c) => c.year === year);
}

/**
 * Filter collections by curriculum module ID.
 */
export async function getCollectionsByModule(moduleId: string): Promise<MaterialCollection[]> {
  const collections = await getAllCollections();
  return collections.filter((c) => c.moduleId === moduleId);
}

/**
 * Retrieve featured collections for timeline / homepage highlights.
 */
export async function getFeaturedCollections(): Promise<MaterialCollection[]> {
  const collections = await getAllCollections();
  return collections.filter((c) => c.featured === true);
}
