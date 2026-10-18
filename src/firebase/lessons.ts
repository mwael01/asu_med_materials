import { collection, doc, getDocs, getDocsFromServer, getDoc, setDoc, updateDoc, deleteField, query, where } from 'firebase/firestore';
import type { FirestoreDataConverter } from 'firebase/firestore';
import type { Lesson } from '../types/lessons';
import { getFirestoreDb, fetchModulesFromFirestore, incrementMaterialsVersionInFirestore } from './firestore';
import { materialMatchesLesson, validateLesson } from '../utils/lessons';
import type { MaterialItem } from '../types/materials';

export const lessonConverter: FirestoreDataConverter<Lesson> = {
  toFirestore: (lesson: Lesson) => ({ ...lesson }),
  fromFirestore(snapshot, options) {
    const data = snapshot.data(options);
    return { id: snapshot.id, title: data.title || '', moduleId: data.moduleId || '',
      subject: data.subject || '', order: typeof data.order === 'number' ? data.order : 0, active: data.active !== false };
  },
};

export async function fetchLessonsFromFirestore(strict = false): Promise<Lesson[]> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore is not available');
  const ref = collection(db, 'lessons').withConverter(lessonConverter);
  const snapshot = strict ? await getDocsFromServer(ref) : await getDocs(ref);
  return snapshot.docs.map(item => item.data());
}

export async function saveLessonToFirestore(lesson: Lesson): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore is not available');
  validateLesson(lesson, await fetchModulesFromFirestore(undefined, true));
  const assigned = await getDocs(query(collection(db, 'materials'), where('lessonId', '==', lesson.id)));
  if (assigned.docs.some(item => !materialMatchesLesson(item.data() as MaterialItem, lesson))) {
    throw new Error('Unassign materials before moving this lesson to another module or subject.');
  }
  await setDoc(doc(db, 'lessons', lesson.id).withConverter(lessonConverter), { ...lesson, title: lesson.title.trim() });
  await incrementMaterialsVersionInFirestore();
}

/** Updates assignment only; never overwrites a material with a stale admin snapshot. */
export async function assignMaterialToLesson(materialId: string, lessonId: string | null): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore is not available');
  const materialRef = doc(db, 'materials', materialId);
  const material = await getDoc(materialRef);
  if (!material.exists()) throw new Error('Material no longer exists.');
  if (lessonId) {
    const lesson = await getDoc(doc(db, 'lessons', lessonId).withConverter(lessonConverter));
    if (!lesson.exists() || !materialMatchesLesson(material.data() as MaterialItem, lesson.data())) {
      throw new Error('The lesson must match the material’s module and subject.');
    }
  }
  await updateDoc(materialRef, { lessonId: lessonId || deleteField() });
  await incrementMaterialsVersionInFirestore();
}
