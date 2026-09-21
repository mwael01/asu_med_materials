import type { MaterialItem, AcademicYear } from '../types/materials';
import { subjectToSlug } from '../utils/slug';

/**
 * Production Study Materials Database for ASU Med Materials.
 * Real verified study materials are stored here.
 * Submissions can also be added directly via the contribute page / GitHub Issues.
 */
export const materialsData: MaterialItem[] = [];

export function getAllMaterials(): MaterialItem[] {
  return materialsData;
}

export function getMaterialsByYear(year: AcademicYear): MaterialItem[] {
  return materialsData.filter((item) => item.year === year);
}

export function getMaterialsByModule(moduleId: string): MaterialItem[] {
  return materialsData.filter((item) => item.moduleId === moduleId);
}

export function getMaterialsByModuleAndSubject(moduleId: string, subject: string): MaterialItem[] {
  const targetSlug = subjectToSlug(subject);
  return materialsData.filter(
    (item) => item.moduleId === moduleId && item.subject && subjectToSlug(item.subject) === targetSlug
  );
}

export function getPinnedMaterials(): MaterialItem[] {
  return materialsData.filter((item) => item.isPinned);
}

export function getMaterialById(id: string): MaterialItem | undefined {
  return materialsData.find((item) => item.id === id);
}
