import type { MaterialItem, AcademicYear } from '../../types/materials';
import { subjectToSlug } from '../../utils/slug';
import { bloodMaterials } from './blood/blood';
import { referenceBooksMaterials } from './reference/reference-books';

/**
 * Unified Study Materials Database for ASU Med Materials.
 * Aggregates all modular curriculum data.
 */
export const materialsData: MaterialItem[] = [
  ...bloodMaterials,
  ...referenceBooksMaterials,
];

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
