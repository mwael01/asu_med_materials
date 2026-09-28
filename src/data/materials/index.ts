import type { MaterialItem, AcademicYear } from '../../types/materials';
import { subjectToSlug } from '../../utils/slug';
import { fetchMaterialsFromFirestore, getMaterialByIdFromFirestore } from '../../firebase/firestore';

const isReferenceModuleId = (moduleId?: string): boolean =>
  Boolean(moduleId && /^year\d+-reference-books$/.test(moduleId));

// Short-term in-memory cache to deduplicate concurrent queries during a single server render
let materialsMemoryCache: { data: MaterialItem[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 15_000; // 15 seconds

/**
 * Fetches all study materials directly from Cloud Firestore (single source of truth).
 */
export async function getAllMaterials(): Promise<MaterialItem[]> {
  const now = Date.now();
  if (materialsMemoryCache && now - materialsMemoryCache.timestamp < CACHE_TTL_MS) {
    return materialsMemoryCache.data;
  }

  const materials = await fetchMaterialsFromFirestore();
  if (materials && materials.length > 0) {
    materialsMemoryCache = { data: materials, timestamp: now };
    return materials;
  }

  return materialsMemoryCache?.data || [];
}

/**
 * Filter materials by academic year from Firestore.
 */
export async function getMaterialsByYear(year: AcademicYear): Promise<MaterialItem[]> {
  const materials = await getAllMaterials();
  return materials.filter((item) => {
    if (isReferenceModuleId(item.moduleId)) {
      return true;
    }
    return item.year === year;
  });
}

/**
 * Filter materials by curriculum module ID from Firestore.
 */
export async function getMaterialsByModule(moduleId: string): Promise<MaterialItem[]> {
  const materials = await getAllMaterials();
  if (isReferenceModuleId(moduleId)) {
    return materials.filter((item) => isReferenceModuleId(item.moduleId));
  }
  return materials.filter((item) => item.moduleId === moduleId);
}

/**
 * Filter materials by module and subject from Firestore.
 */
export async function getMaterialsByModuleAndSubject(
  moduleId: string,
  subject: string
): Promise<MaterialItem[]> {
  const targetSlug = subjectToSlug(subject);
  const materials = await getAllMaterials();

  if (isReferenceModuleId(moduleId)) {
    return materials.filter(
      (item) => isReferenceModuleId(item.moduleId) && item.subject && subjectToSlug(item.subject) === targetSlug
    );
  }

  return materials.filter(
    (item) => item.moduleId === moduleId && item.subject && subjectToSlug(item.subject) === targetSlug
  );
}

/**
 * Retrieve all video playlists from Firestore.
 */
export async function getAllPlaylists(): Promise<MaterialItem[]> {
  const materials = await getAllMaterials();
  return materials.filter((item) => item.type === 'playlist' || Boolean(item.playlistId) || Boolean(item.videos));
}

/**
 * Retrieve a single video playlist by ID from Firestore.
 */
export async function getPlaylistById(id: string): Promise<MaterialItem | null> {
  const material = await getMaterialByIdFromFirestore(id);
  if (material && (material.type === 'playlist' || Boolean(material.playlistId) || Boolean(material.videos))) {
    return material;
  }
  // Fallback to searching in memory
  const all = await getAllMaterials();
  const found = all.find((item) => item.id === id && (item.type === 'playlist' || Boolean(item.playlistId) || Boolean(item.videos)));
  return found || null;
}

/**
 * Retrieve a single material by ID from Firestore.
 */
export async function getMaterialById(id: string): Promise<MaterialItem | null> {
  const material = await getMaterialByIdFromFirestore(id);
  if (material) return material;
  const all = await getAllMaterials();
  return all.find((item) => item.id === id) || null;
}
