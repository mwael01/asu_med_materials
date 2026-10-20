import type { MaterialItem } from '../types/materials';

export const DEPARTMENT_AUTHOR = 'ASU Faculty Staff';

export interface TeacherGroup {
  id: string;
  name: string;
  isDoctor: boolean;
  isDepartment?: boolean;
  isGeneral?: boolean;
  count: number;
  items: MaterialItem[];
}

const DEPARTMENT_PATTERNS = [
  /asu med faculty/i,
  /asu faculty/i,
  /asu moodle/i,
  /moodle/i,
  /asu\s*2\s*learn/i,
  /faculty stream/i,
  /faculty/i,
  /department/i,
  /قسم/i,
  /الكلية/i,
];

function isDepartmentName(name: string): boolean {
  return DEPARTMENT_PATTERNS.some((pattern) => pattern.test(name));
}

/** Official course materials belong to staff even when a source names a speaker. */
export function isDepartmentMaterial(material: MaterialItem): boolean {
  const authors = Array.isArray(material.author) ? material.author : material.author ? [material.author] : [];
  if (authors.some(isDepartmentName)) return true;
  if (/^(?:asu2learn|moodle)(?:-|$)/i.test(material.importRunId || '')) return true;
  if (/^(?:asu2learn-)|(?:^|[-_])moodle(?:[-_]|$)/i.test(material.id)) return true;
  if ([material.title, material.titleEn, ...(material.tags || [])].some(value =>
    /\b(?:moodle|asu2learn|college staff|faculty staff|faculty stream|department staff)\b|موودل|مودل/i.test(value || ''))) return true;
  const urls = [material.url, ...(material.importSources || []),
    ...(material.documents || []).map(item => item.url), ...(material.videos || []).map(item => item.url)];
  return urls.some(value => {
    try {
      const url = new URL(value || '');
      return ['http:', 'https:'].includes(url.protocol) &&
        ['asu2learn.asu.edu.eg', 'moodle.asu.edu.eg'].includes(url.hostname);
    } catch {
      return false;
    }
  });
}

/**
 * Groups materials by Doctor / Teacher, followed by Faculty & Department and General Summaries.
 * Ensures materials prepared by the same doctor are clustered together for fast access.
 */
export function groupMaterialsByTeacher(materials: MaterialItem[]): TeacherGroup[] {
  const doctorMap = new Map<string, MaterialItem[]>();
  const departmentItems: MaterialItem[] = [];
  const generalItems: MaterialItem[] = [];

  for (const material of materials) {
    if (isDepartmentMaterial(material)) {
      if (!departmentItems.some(item => item.id === material.id)) departmentItems.push(material);
      continue;
    }
    const rawAuthors = Array.isArray(material.author)
      ? material.author
      : material.author
        ? [material.author]
        : [];

    const cleanedAuthors = rawAuthors.map((a) => a.trim()).filter(Boolean);

    if (cleanedAuthors.length === 0) {
      generalItems.push(material);
      continue;
    }

    let assigned = false;
    for (const author of cleanedAuthors) {
      if (
        /^(dr|doctor|دكتور|د\.)/i.test(author) ||
        !/(asu|zone|batch|drive|anki|groups)/i.test(author)
      ) {
        // Individual Doctor or Teacher
        const key = author;
        let list = doctorMap.get(key);
        if (!list) {
          list = [];
          doctorMap.set(key, list);
        }
        if (!list.some((m) => m.id === material.id)) {
          list.push(material);
        }
        assigned = true;
      }
    }

    if (!assigned) {
      if (!generalItems.some((m) => m.id === material.id)) {
        generalItems.push(material);
      }
    }
  }

  // Convert doctor map to sorted groups (descending by item count)
  const doctorGroups: TeacherGroup[] = Array.from(doctorMap.entries())
    .map(([name, items]) => ({
      id: `teacher-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      isDoctor: true,
      count: items.length,
      items
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const result: TeacherGroup[] = [...doctorGroups];

  if (departmentItems.length > 0) {
    result.push({
      id: 'teacher-department-staff',
      name: 'Faculty & Department Staff',
      isDoctor: false,
      isDepartment: true,
      count: departmentItems.length,
      items: departmentItems
    });
  }

  if (generalItems.length > 0) {
    result.push({
      id: 'teacher-general-summaries',
      name: 'General & Batch Summaries',
      isDoctor: false,
      isGeneral: true,
      count: generalItems.length,
      items: generalItems
    });
  }

  return result;
}
