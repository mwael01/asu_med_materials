import type { MaterialItem, AcademicYear } from '../types/materials';

export const ACADEMIC_YEARS: AcademicYear[] = [1, 2, 3, 4, 5];

/**
 * Filters and returns the most recent materials for a specific academic year.
 * Materials with a valid `createdAt` timestamp are sorted in descending order.
 * If no dated materials exist, falls back to the year's available materials.
 */
export function getRecentMaterialsForYear(
  materials: MaterialItem[],
  year: AcademicYear,
  limit: number = 6
): MaterialItem[] {
  const yearItems = materials.filter((item) => Number(item.year) === year);
  const withDate = yearItems
    .filter((item) => item.createdAt && Number.isFinite(Date.parse(item.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt!) - Date.parse(a.createdAt!));

  return withDate.length > 0 ? withDate.slice(0, limit) : yearItems.slice(0, limit);
}

/**
 * Groups recent materials for all academic years (1 through 5).
 */
export function groupRecentMaterialsByYear(
  materials: MaterialItem[],
  limit: number = 6
): Record<AcademicYear, MaterialItem[]> {
  const result: Record<AcademicYear, MaterialItem[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: []
  };

  for (const y of ACADEMIC_YEARS) {
    result[y] = getRecentMaterialsForYear(materials, y, limit);
  }

  return result;
}
