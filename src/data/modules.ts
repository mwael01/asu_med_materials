import type { ModuleInfo } from '../types/materials';
import modulesSnapshot from '../firebase/schema/modules-cache.json';
import { fetchModulesFromFirestore } from '../firebase/firestore';

export const REFERENCE_BOOK_SUBJECTS: string[] = [
  'Anatomy',
  'Physiology',
  'Histology',
  'Biochemistry',
  'Pharmacology',
  'Pathology',
  'Cell Biology',
  'Embryology',
  'Terminology'
];

/**
 * Local Firestore schema snapshot of curriculum modules for zero-failure SSG builds,
 * instant guest access, and fallback when offline.
 */
export const modulesData: ModuleInfo[] = modulesSnapshot as ModuleInfo[];

export function getModulesByYear(year: number): ModuleInfo[] {
  return modulesData.filter((m) => m.year === year);
}

export function getModuleById(id: string): ModuleInfo | undefined {
  return modulesData.find((m) => m.id === id);
}

/**
 * Client-side dynamic modules retriever:
 * Fetches updated modules from Cloud Firestore (IndexedDB cache).
 * Falls back to local snapshot if offline or network unavailable.
 */
export async function getDynamicModules(year?: number): Promise<ModuleInfo[]> {
  try {
    const firestoreModules = await fetchModulesFromFirestore(year as any);
    if (firestoreModules && firestoreModules.length > 0) {
      return firestoreModules;
    }
  } catch (e) {
    console.warn('[Modules] Falling back to local snapshot:', e);
  }
  return year ? getModulesByYear(year) : modulesData;
}
