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
 * Helper to recursively resolve a collection with its child subcollections and materials.
 */
function resolveCollectionNode(
  col: MaterialCollection,
  allCollections: MaterialCollection[],
  materialMap: Map<string, MaterialItem>,
  visited: Set<string>
): CollectionWithMaterials {
  visited.add(col.id);

  // 1. Resolve direct materials
  const materials: MaterialItem[] = [];
  if (Array.isArray(col.materialIds)) {
    for (const mId of col.materialIds) {
      const mat = materialMap.get(mId);
      if (mat) {
        materials.push(mat);
      }
    }
  }

  // 2. Resolve child subcollections
  const subcollections: CollectionWithMaterials[] = [];
  const childCollectionCandidates = allCollections.filter(
    (c) => (c.parentId === col.id || (Array.isArray(col.subcollectionIds) && col.subcollectionIds.includes(c.id))) &&
           !visited.has(c.id)
  );

  // Sort child subcollections by order if provided, then title
  childCollectionCandidates.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const child of childCollectionCandidates) {
    subcollections.push(resolveCollectionNode(child, allCollections, materialMap, new Set(visited)));
  }

  // 3. Calculate total materials count recursively
  let totalMaterialsCount = materials.length;
  for (const sub of subcollections) {
    totalMaterialsCount += sub.totalMaterialsCount ?? sub.materials.length;
  }

  return {
    ...col,
    materials,
    subcollections: subcollections.length > 0 ? subcollections : undefined,
    totalMaterialsCount
  };
}

/**
 * Retrieves a single collection by ID along with its resolved child materials,
 * parent group trail, and nested subgroups in curated order.
 */
export async function getCollectionById(id: string, version?: number): Promise<CollectionWithMaterials | null> {
  if (!id) return null;
  const collections = await getAllCollections();
  const col = collections.find((c) => c.id === id);
  if (!col) return null;

  const allMaterials = await getAllMaterials(version);
  const materialMap = new Map<string, MaterialItem>();
  for (let i = 0; i < allMaterials.length; i++) {
    materialMap.set(allMaterials[i].id, allMaterials[i]);
  }

  const resolved = resolveCollectionNode(col, collections, materialMap, new Set());

  // Resolve parent collection if parentId exists
  if (col.parentId) {
    resolved.parent = collections.find((c) => c.id === col.parentId) || null;
  }

  return resolved;
}

/**
 * Filter collections by academic year.
 */
export async function getCollectionsByYear(year: AcademicYear): Promise<MaterialCollection[]> {
  const collections = await getAllCollections();
  return collections.filter((c) => c.year === year);
}

/**
 * Retrieves root collections (top-level groups without a parentId) for a given academic year.
 */
export async function getRootCollectionsByYear(year: AcademicYear): Promise<MaterialCollection[]> {
  const collections = await getAllCollections();
  return collections.filter((c) => c.year === year && (!c.parentId || c.parentId.trim() === ''));
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
  return collections.filter((c) => c.featured === true && (!c.parentId || c.parentId.trim() === ''));
}

/**
 * Groups root collections by academic year for SSR multi-year rendering on the home page.
 */
export function groupCollectionsByYear(collections: MaterialCollection[]): Record<AcademicYear, MaterialCollection[]> {
  const result: Record<AcademicYear, MaterialCollection[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: []
  };

  for (const c of collections) {
    // Only group top-level collections for homepage timeline representation
    if (result[c.year] && (!c.parentId || c.parentId.trim() === '')) {
      result[c.year].push(c);
    }
  }

  return result;
}

/**
 * Retrieves featured or top timeline collections for a given academic year.
 * If no collections are explicitly marked featured: true, falls back to top available root collections.
 */
export async function getFeaturedCollectionsByYear(year: AcademicYear, limit = 6): Promise<MaterialCollection[]> {
  const rootCollections = await getRootCollectionsByYear(year);
  const featured = rootCollections.filter((c) => c.featured === true);
  if (featured.length > 0) {
    return featured.slice(0, limit);
  }
  return rootCollections.slice(0, limit);
}

