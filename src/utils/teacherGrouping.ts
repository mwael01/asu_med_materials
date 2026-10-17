import type { MaterialItem } from '../types/materials';

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
  /faculty stream/i,
  /faculty/i,
  /department/i,
  /قسم/i,
  /الكلية/i,
];

function isDepartmentName(name: string): boolean {
  return DEPARTMENT_PATTERNS.some((pattern) => pattern.test(name));
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
      if (isDepartmentName(author)) {
        if (!departmentItems.some((m) => m.id === material.id)) {
          departmentItems.push(material);
        }
        assigned = true;
      } else if (
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
