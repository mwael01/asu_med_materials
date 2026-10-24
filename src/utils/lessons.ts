import type { Lesson, LessonDoctor } from '../types/lessons';
import type { MaterialItem, ModuleInfo } from '../types/materials';
import { validateImageFolders } from './practicalImages';
import { subjectToSlug } from './slug';
import { groupMaterialsByTeacher } from './teacherGrouping';
import { teacherIdentity } from './teacherIdentity';

export function lessonPath(lesson: Lesson): string {
  return `/module/${encodeURIComponent(lesson.moduleId)}/${subjectToSlug(lesson.subject)}/lesson/${encodeURIComponent(lesson.id)}`;
}

/** UTF-8 name identity, without punctuation-stripping collisions or order-dependent IDs. */
export function doctorKey(name: string): string {
  return 'doctor-' + Array.from(new TextEncoder().encode(name.normalize('NFKC').trim().toLowerCase()))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function lessonDoctors(materials: MaterialItem[]): LessonDoctor[] {
  const doctors = new Map<string, LessonDoctor>();
  for (const group of groupMaterialsByTeacher(materials)) {
    if (group.isGeneral) continue;
    const key = group.isDepartment ? 'department' : doctorKey(group.name);
    const doctor = doctors.get(key) || { key, name: group.name, items: [] };
    for (const item of group.items) {
      if (!doctor.items.some(existing => existing.id === item.id)) doctor.items.push(item);
    }
    doctors.set(key, doctor);
  }
  return [...doctors.values()];
}

/** Resolve reviewed name changes without restoring a former, incorrect doctor credit. */
export function findLessonDoctor(doctors: LessonDoctor[], key: string): LessonDoctor | undefined {
  const exact = doctors.find(doctor => doctor.key === key);
  if (exact) return exact;
  return doctors.find(doctor => doctor.key !== 'department' && doctor.items.some(material => {
    const names = Array.isArray(material.author) ? material.author : [material.author || ''];
    return names.some(name => teacherIdentity(name) === teacherIdentity(doctor.name) && doctorKey(name) === key) ||
      Object.entries(material.authorAliases || {}).some(([alias, canonical]) =>
        teacherIdentity(canonical) === teacherIdentity(doctor.name) && doctorKey(alias) === key);
  }));
}

export function materialMatchesLesson(material: Pick<MaterialItem, 'moduleId' | 'subject'>, lesson: Lesson): boolean {
  return material.moduleId === lesson.moduleId && Boolean(material.subject) &&
    subjectToSlug(material.subject!) === subjectToSlug(lesson.subject);
}

export function validateLesson(lesson: Lesson, modules: ModuleInfo[]): void {
  if (lesson.practicalImageFolders) validateImageFolders(lesson.practicalImageFolders);
  const module = modules.find(item => item.id === lesson.moduleId);
  if (!lesson.id || lesson.id.includes('/') || !lesson.title.trim() || !Number.isFinite(lesson.order)) {
    throw new Error('A lesson needs an ID, title, and numeric order.');
  }
  if (!module || !module.subjects.some(subject => subjectToSlug(subject) === subjectToSlug(lesson.subject))) {
    throw new Error('Select a subject belonging to this module.');
  }
}

export function lessonsForSubject(lessons: Lesson[], moduleId: string, subject: string): Lesson[] {
  return lessons.filter(lesson => lesson.active !== false && lesson.moduleId === moduleId &&
    subjectToSlug(lesson.subject) === subjectToSlug(subject))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

/** Determines if a lesson is a revision lesson (Practical, Assessments, Finals) */
export function isRevisionLesson(lesson: Lesson): boolean {
  return Boolean(
    lesson.isRevision ||
    lesson.revisionType ||
    (typeof lesson.order === 'number' && lesson.order >= 90) ||
    lesson.id.endsWith('-revisions') ||
    lesson.id.endsWith('-practical') ||
    lesson.id.endsWith('-assessments') ||
    lesson.id.endsWith('-finals')
  );
}
