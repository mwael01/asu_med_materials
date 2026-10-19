import { collection, doc, getDoc, getDocs, getDocsFromServer, query, where, writeBatch, deleteField, increment } from 'firebase/firestore';
import { getFirestoreDb, invalidateMaterialsVersionCache } from './firestore';
import type { MaterialLessonLink } from '../types/materialLessonLinks';
import { materialLessonLinkId } from '../utils/materialLessonLinks';

export async function fetchMaterialLessonLinks(strict = false): Promise<MaterialLessonLink[]> {
  const db = getFirestoreDb();
  if (!db) return []; // Match the catalogue's explicit unconfigured/offline mode.
  const ref = collection(db, 'material_lesson_links');
  const snapshot = strict ? await getDocsFromServer(ref) : await getDocs(ref);
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as MaterialLessonLink);
}

/** Replaces assignments without rewriting content; batches respect Firestore rule access limits. */
export async function assignMaterialToLessons(materialId: string, lessonIds: string[]): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore is not available');
  const materialRef = doc(db, 'materials', materialId);
  const material = await getDoc(materialRef);
  if (!material.exists()) throw new Error('Material no longer exists.');
  const ids = [...new Set(lessonIds)];
  const lessons = await Promise.all(ids.map(id => getDoc(doc(db, 'lessons', id))));
  if (lessons.some(lesson => !lesson.exists() || lesson.data()?.moduleId !== material.data().moduleId)) {
    throw new Error('Every lesson must belong to the material’s module.');
  }
  const previous = await getDocs(query(collection(db, 'material_lesson_links'), where('materialId', '==', materialId)));
  const missing = ids.filter(lessonId => !previous.docs.some(link => link.id === materialLessonLinkId(materialId, lessonId)));
  const removed = previous.docs.filter(link => !ids.includes(link.data().lessonId));
  if (removed.length > 497) throw new Error('Too many stale assignments; remove them in smaller groups.');
  try {
    // Upsert first so a failed intermediate batch never removes existing destinations.
    // Each link rule reads its lesson and material; eight additions stay below the 20-access limit.
    for (let offset = 0; offset < missing.length; offset += 8) {
      const batch = writeBatch(db);
      for (const lessonId of missing.slice(offset, offset + 8)) {
        const id = materialLessonLinkId(materialId, lessonId);
        batch.set(doc(db, 'material_lesson_links', id), { materialId, lessonId, moduleId: material.data().moduleId });
      }
      batch.set(doc(db, 'materials_version', 'current'), { version: increment(1), updatedAt: new Date().toISOString() }, { merge: true });
      await batch.commit();
    }
    const batch = writeBatch(db);
    for (const link of removed) batch.delete(link.ref);
    batch.update(materialRef, { lessonId: deleteField() });
    batch.set(doc(db, 'materials_version', 'current'), { version: increment(1), updatedAt: new Date().toISOString() }, { merge: true });
    await batch.commit();
  } catch {
    throw new Error('Assignment save was interrupted. Some additions may have saved; refresh before retrying.');
  } finally {
    invalidateMaterialsVersionCache();
  }
}
