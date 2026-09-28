import type { MaterialItem, AcademicYear } from '../../types/materials';
import { subjectToSlug } from '../../utils/slug';
import firestoreSnapshot from '../../firebase/schema/materials-cache.json';
import { fetchMaterialsFromFirestore } from '../../firebase/firestore';

/**
 * Local Firestore schema snapshot of study materials for zero-failure SSG builds,
 * instant guest access, and fallback when offline.
 */
export const staticMaterialsData: MaterialItem[] = firestoreSnapshot as MaterialItem[];

// Default export maintained for existing static route imports
export const materialsData: MaterialItem[] = staticMaterialsData;

export function getAllMaterials(): MaterialItem[] {
  return materialsData;
}

const isReferenceModuleId = (moduleId?: string): boolean => !!moduleId && /^year\d+-reference-books$/.test(moduleId);

export function getMaterialsByYear(year: AcademicYear): MaterialItem[] {
  return materialsData.filter((item) => {
    if (isReferenceModuleId(item.moduleId)) {
      return true;
    }
    return item.year === year;
  });
}

export function getMaterialsByModule(moduleId: string): MaterialItem[] {
  if (isReferenceModuleId(moduleId)) {
    return materialsData.filter((item) => isReferenceModuleId(item.moduleId));
  }

  return materialsData.filter((item) => item.moduleId === moduleId);
}

export function getMaterialsByModuleAndSubject(moduleId: string, subject: string): MaterialItem[] {
  const targetSlug = subjectToSlug(subject);

  if (isReferenceModuleId(moduleId)) {
    return materialsData.filter(
      (item) => isReferenceModuleId(item.moduleId) && item.subject && subjectToSlug(item.subject) === targetSlug
    );
  }

  return materialsData.filter(
    (item) => item.moduleId === moduleId && item.subject && subjectToSlug(item.subject) === targetSlug
  );
}

export function getAllPlaylists(): MaterialItem[] {
  return materialsData.filter((item) => item.type === 'playlist' || !!item.playlistId || !!item.videos);
}

export function getPlaylistById(id: string): MaterialItem | undefined {
  return materialsData.find((item) => item.id === id && (item.type === 'playlist' || !!item.playlistId || !!item.videos));
}

export function getMaterialById(id: string): MaterialItem | undefined {
  return materialsData.find((item) => item.id === id);
}

/**
 * Client-side dynamic materials retriever:
 * Fetches updated/cached materials from Cloud Firestore (IndexedDB cache).
 * Falls back to local Firestore snapshot if offline or network unavailable.
 */
export async function getDynamicMaterials(year?: AcademicYear): Promise<MaterialItem[]> {
  try {
    const firestoreMaterials = await fetchMaterialsFromFirestore(year);
    if (firestoreMaterials && firestoreMaterials.length > 0) {
      const map = new Map<string, MaterialItem>();
      for (const m of staticMaterialsData) {
        if (!year || m.year === year || isReferenceModuleId(m.moduleId)) {
          map.set(m.id, m);
        }
      }
      for (const m of firestoreMaterials) {
        map.set(m.id, m);
      }
      return Array.from(map.values());
    }
  } catch (e) {
    console.warn('[Materials] Falling back to local Firestore snapshot:', e);
  }

  return year ? getMaterialsByYear(year) : getAllMaterials();
}
