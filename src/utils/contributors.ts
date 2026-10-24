import { getAllMaterials } from '../data/materials';
import type { ContributorStats } from '../types/contributors';
import { preferredTeacherName, teacherIdentity, teacherNameResolver } from './teacherIdentity';

function normalizeName(value: string): string {
  return teacherIdentity(value);
}

function namesOf(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Content makers only: grouped from the `author` field of materialsData
 * (whoever prepared the material). `addedBy` is intentionally ignored.
 * Sorted descending by total contributions.
 */
export async function getAllContributors(): Promise<ContributorStats[]> {
  const grouped = new Map<string, ContributorStats>();
  const subjectSets = new Map<string, Set<string>>();
  const names = new Map<string, Set<string>>();
  const materials = await getAllMaterials();
  const resolveName = teacherNameResolver(materials);

  for (const material of materials) {
    const counted = new Set<string>();
    for (const authorName of namesOf(material.author)) {
      const trimmed = resolveName(authorName.trim());
      if (!trimmed) continue;
      const key = normalizeName(trimmed);
      if (!key) continue;
      const variants = names.get(key) || new Set<string>();
      variants.add(trimmed);
      names.set(key, variants);
      if (counted.has(key)) continue;
      counted.add(key);
      let entry = grouped.get(key);
      if (!entry) {
        entry = {
          name: trimmed,
          total: 0,
          authored: 0,
          subjects: 0,
          byType: {},
          byYear: {},
        };
        grouped.set(key, entry);
        subjectSets.set(key, new Set());
      }
      entry.authored += 1;
      entry.total += 1;
      entry.byType[material.type] = (entry.byType[material.type] ?? 0) + 1;
      entry.byYear[String(material.year)] = (entry.byYear[String(material.year)] ?? 0) + 1;
      if (material.subject?.trim()) {
        subjectSets.get(key)?.add(material.subject.trim());
      }
    }
  }

  for (const [key, entry] of grouped) {
    entry.name = preferredTeacherName([...names.get(key)!]);
    entry.subjects = subjectSets.get(key)?.size ?? 0;
  }

  return [...grouped.values()].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  );
}

export const getContentCreators = getAllContributors;

export async function getContributorByName(name: string): Promise<ContributorStats | undefined> {
  const key = normalizeName(name);
  const allContributors = await getAllContributors();
  return allContributors.find((c) => normalizeName(c.name) === key);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
