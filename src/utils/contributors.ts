import { materialsData } from '../data/materials';
import contributorsFile from '../data/contributors.json';
import type {
  AuthorEntry,
  ContributorProfile,
  ContributorStats,
  ContributorsFile,
} from '../types/contributors';

const data = contributorsFile as ContributorsFile;

export function getAuthors(): AuthorEntry[] {
  return [...data.authors].sort((a, b) => a.order - b.order);
}

export function getContributorProfiles(): ContributorProfile[] {
  return data.contributorProfiles;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
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
export function getAllContributors(): ContributorStats[] {
  const grouped = new Map<string, ContributorStats>();
  const subjectSets = new Map<string, Set<string>>();

  for (const material of materialsData) {
    for (const authorName of namesOf(material.author)) {
      const trimmed = authorName.trim();
      if (!trimmed) continue;
      const key = normalizeName(trimmed);
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
    entry.subjects = subjectSets.get(key)?.size ?? 0;
  }

  const profiles = getContributorProfiles();
  for (const profile of profiles) {
    const keys = [profile.name, ...profile.matchNames].map(normalizeName);
    const existingKey = keys.find((k) => grouped.has(k));
    if (existingKey) {
      const entry = grouped.get(existingKey);
      if (entry) {
        entry.profile = profile;
        entry.name = profile.name;
      }
    } else {
      grouped.set(normalizeName(profile.name), {
        name: profile.name,
        total: 0,
        authored: 0,
        subjects: 0,
        byType: {},
        byYear: {},
        profile,
      });
    }
  }

  return [...grouped.values()].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  );
}

export const getContentCreators = getAllContributors;

/**
 * Resource contributors: grouped from the `addedBy` field of materialsData
 * (students/contributors who collected, shared, and added materials to the website).
 * Sorted descending by total contributions.
 */
export function getResourceContributors(): ContributorStats[] {
  const grouped = new Map<string, ContributorStats>();
  const subjectSets = new Map<string, Set<string>>();

  for (const material of materialsData) {
    for (const adderName of namesOf(material.addedBy)) {
      const trimmed = adderName.trim();
      if (!trimmed) continue;
      const key = normalizeName(trimmed);
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
    entry.subjects = subjectSets.get(key)?.size ?? 0;
  }

  // 1. Link with ContributorProfiles if matched
  const profiles = getContributorProfiles();
  for (const profile of profiles) {
    const keys = [profile.name, ...profile.matchNames].map(normalizeName);
    const existingKey = keys.find((k) => grouped.has(k));
    if (existingKey) {
      const entry = grouped.get(existingKey);
      if (entry) {
        entry.profile = profile;
        entry.name = profile.name;
      }
    }
  }

  // 2. Link with Authors if matched and doesn't already have profile
  const authors = getAuthors();
  for (const author of authors) {
    const matchNames = [author.name, ...(author.matchNames ?? [])];
    const keys = matchNames.map(normalizeName);
    const existingKey = keys.find((k) => grouped.has(k));
    if (existingKey) {
      const entry = grouped.get(existingKey);
      if (entry && !entry.profile) {
        entry.profile = {
          id: author.id,
          name: author.name,
          photo: author.photo,
          note: author.roleAr || author.role,
          noteEn: author.role,
          matchNames: author.matchNames ?? [author.name],
          contacts: author.contacts,
        };
        entry.name = author.name;
      }
    }
  }

  return [...grouped.values()].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  );
}

export function getContributorByName(name: string): ContributorStats | undefined {
  const key = normalizeName(name);
  return getAllContributors().find((c) => normalizeName(c.name) === key)
    || getResourceContributors().find((c) => normalizeName(c.name) === key);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
