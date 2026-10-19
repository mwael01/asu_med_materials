import type { MaterialItem, AcademicYear } from '../../types/materials';
import { getPublicMaterials } from '../catalogue.server';
import { getAllModules } from '../modules';
import { subjectToSlug } from '../../utils/slug';
import { getMaterialsVersionFromFirestore } from '../../firebase/firestore';
import { getPublicLessons } from '../catalogue.server';
import { assignedLessons } from '../../utils/materialLessonLinks';

const isReferenceModuleId = (moduleId?: string): boolean =>
  Boolean(moduleId && /^year\d+-reference-books$/.test(moduleId));

/** Fetch the public catalogue from Firestore with a bounded runtime cache. Hides second semester materials and deduplicates records. */
export async function getAllMaterials(version?: number): Promise<MaterialItem[]> {
  const resolvedVersion = version ?? (await getMaterialsVersionFromFirestore());
  const [materials, activeModules] = await Promise.all([
    getPublicMaterials(resolvedVersion),
    getAllModules(resolvedVersion)
  ]);
  const activeModuleIds = new Set(activeModules.map((m) => m.id));

  const filtered = materials.filter((item) => {
    // Hide second semester materials
    if (item.semester === 2) {
      return false;
    }
    // If the material is bound to a module, ensure the module is currently active and visible
    if (item.moduleId) {
      if (isReferenceModuleId(item.moduleId)) {
        return true;
      }
      return activeModuleIds.has(item.moduleId);
    }
    return true;
  });

  // Defensive deduplication by ID and unique (moduleId, url)
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  return filtered.filter((item) => {
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    if (item.url && item.moduleId) {
      const urlKey = `${item.moduleId}:${item.url.trim()}`;
      if (seenUrls.has(urlKey)) return false;
      seenUrls.add(urlKey);
    }
    return true;
  });
}

/**
 * Filter materials by academic year from Firestore.
 */
export async function getMaterialsByYear(year: AcademicYear, version?: number): Promise<MaterialItem[]> {
  const materials = await getAllMaterials(version);
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
export async function getMaterialsByModule(moduleId: string, version?: number): Promise<MaterialItem[]> {
  const materials = await getAllMaterials(version);
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
  subject: string,
  version?: number
): Promise<MaterialItem[]> {
  const targetSlug = subjectToSlug(subject);
  const [materials, lessons] = await Promise.all([
    getAllMaterials(version),
    getPublicLessons(version)
  ]);

  if (isReferenceModuleId(moduleId)) {
    return materials.filter(
      (item) => isReferenceModuleId(item.moduleId) && item.subject && subjectToSlug(item.subject) === targetSlug
    );
  }

  return materials.filter(
    (item) => item.moduleId === moduleId && ((item.subject && subjectToSlug(item.subject) === targetSlug) ||
      assignedLessons(item, lessons).some(lesson => subjectToSlug(lesson.subject) === targetSlug))
  );
}

/**
 * Retrieve all video playlists from Firestore.
 */
export async function getAllPlaylists(version?: number): Promise<MaterialItem[]> {
  const materials = await getAllMaterials(version);
  return materials.filter((item) => item.type === 'playlist' || Boolean(item.playlistId) || Boolean(item.videos));
}

/**
 * Retrieve a single video playlist by ID from Firestore.
 */
export async function getPlaylistById(id: string, version?: number): Promise<MaterialItem | null> {
  const isPlaylist = (item: MaterialItem) =>
    item.type === 'playlist' || Boolean(item.playlistId) || Boolean(item.videos);
  const material = (await getAllMaterials(version)).find((item) => item.id === id);
  if (material && isPlaylist(material)) {
    return material;
  }
  // Fallback: check getPublicMaterials directly so valid playlists in non-active modules or semester 2 are not dropped
  const allRaw = await getPublicMaterials(version);
  const found = allRaw.find((item) => item.id === id);
  if (found && isPlaylist(found)) {
    return found;
  }
  return null;
}

/**
 * Retrieve a single material by ID from Firestore.
 */
export async function getMaterialById(id: string, version?: number): Promise<MaterialItem | null> {
  const material = (await getAllMaterials(version)).find((item) => item.id === id);
  if (material) return material;
  // Fallback: check getPublicMaterials directly so valid materials in non-active modules or semester 2 are not dropped
  const allRaw = await getPublicMaterials(version);
  return allRaw.find((item) => item.id === id) || null;
}
