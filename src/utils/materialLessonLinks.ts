import type { MaterialItem } from '../types/materials';
import type { Lesson } from '../types/lessons';
import type { MaterialLessonLink } from '../types/materialLessonLinks';
import { subjectToSlug } from './slug';

export const materialLessonLinkId = (materialId: string, lessonId: string): string =>
  `${encodeURIComponent(materialId).replace(/~/g, '%7E')}~${encodeURIComponent(lessonId).replace(/~/g, '%7E')}`;

export function attachLessonLinks(materials: MaterialItem[], links: MaterialLessonLink[]): MaterialItem[] {
  const byMaterial = new Map<string, MaterialLessonLink[]>();
  for (const link of links) {
    const items = byMaterial.get(link.materialId) || [];
    if (!items.some(item => item.lessonId === link.lessonId && item.moduleId === link.moduleId)) items.push(link);
    byMaterial.set(link.materialId, items);
  }
  return materials.map(material => ({ ...material,
    lessonLinks: (byMaterial.get(material.id) || []).filter(link => link.moduleId === material.moduleId) }));
}

export function isMaterialAssignedToLesson(material: MaterialItem, lesson: Lesson): boolean {
  if (material.moduleId !== lesson.moduleId) return false;
  if (material.lessonLinks?.some(link => link.materialId === material.id && link.moduleId === lesson.moduleId && link.lessonId === lesson.id)) return true;
  return material.lessonId === lesson.id && Boolean(material.subject) &&
    subjectToSlug(material.subject!) === subjectToSlug(lesson.subject);
}

export function assignedLessons(material: MaterialItem, lessons: Lesson[]): Lesson[] {
  return lessons.filter(lesson => lesson.active !== false && isMaterialAssignedToLesson(material, lesson));
}
