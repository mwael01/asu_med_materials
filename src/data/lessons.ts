import { getPublicLessons } from './catalogue.server';
import { getModuleById } from './modules';
import { getMaterialsByModuleAndSubject } from './materials';
import { lessonsForSubject, materialMatchesLesson } from '../utils/lessons';
import { subjectToSlug } from '../utils/slug';
import { getMaterialsVersionFromFirestore } from '../firebase/firestore';

export async function loadLessonPage(moduleId: string, subjectSlug: string, lessonId: string, version?: number) {
  const resolvedVersion = version ?? (await getMaterialsVersionFromFirestore());
  const [module, lessons] = await Promise.all([
    getModuleById(moduleId, resolvedVersion),
    getPublicLessons(resolvedVersion)
  ]);
  if (!module) return null;
  const subject = module.subjects.find(item => subjectToSlug(item) === subjectSlug);
  if (!subject) return null;
  const lesson = lessonsForSubject(lessons, module.id, subject).find(item => item.id === lessonId);
  if (!lesson) return null;
  const materials = (await getMaterialsByModuleAndSubject(module.id, subject, resolvedVersion))
    .filter(item => item.lessonId === lesson.id && materialMatchesLesson(item, lesson));
  return { module, lesson, materials };
}
