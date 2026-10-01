import type { MaterialItem, AcademicYear } from '../../types/materials';
import { getPublicMaterials } from '../catalogue.server';
import { subjectToSlug } from '../../utils/slug';


const isReferenceModuleId = (moduleId?: string): boolean =>
  Boolean(moduleId && /^year\d+-reference-books$/.test(moduleId));

// One pending read per runtime, including concurrent page/component renders.
const loadMaterials = getPublicMaterials;

/** Fetch the public catalogue from Firestore with a bounded runtime cache. */
export async function getAllMaterials(): Promise<MaterialItem[]> {
  return loadMaterials();
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
  const material = (await getAllMaterials()).find((item) => item.id === id);
  if (material && (material.type === 'playlist' || Boolean(material.playlistId) || Boolean(material.videos))) {
    return material;
  }
  return null;
}

/**
 * Retrieve a single material by ID from Firestore.
 */
export async function getMaterialById(id: string): Promise<MaterialItem | null> {
  const material = (await getAllMaterials()).find((item) => item.id === id);
  if (material) return material;
  return null;
}
