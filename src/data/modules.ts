import { getPublicModules } from './catalogue.server';
import type { ModuleInfo } from '../types/materials';
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

const loadModules = getPublicModules;

/** Fetch active modules; reuse the same pending read across SSR components. Hides second semester modules for now. */
export async function getAllModules(): Promise<ModuleInfo[]> {
  const list = (await loadModules()).filter(
    (module) => module.active !== false && module.semester !== 2
  );
  return list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/**
 * Fetches ALL modules including inactive ones (for admin management).
 */
export async function getAllModulesIncludingInactive(): Promise<ModuleInfo[]> {
  try {
    const modules = await fetchModulesFromFirestore();
    if (modules && modules.length > 0) return modules;
  } catch (err) {
    console.warn('[Modules] Failed to fetch modules from Firestore, falling back:', err);
  }
  return loadModules();
}

/**
 * Filter curriculum modules by academic year directly from Firestore.
 */
export async function getModulesByYear(year: number): Promise<ModuleInfo[]> {
  const modules = await getAllModules();
  return modules.filter((m) => m.year === year);
}

/**
 * Fetch a single module by ID from Cloud Firestore.
 */
export async function getModuleById(id: string): Promise<ModuleInfo | null> {
  const mod = (await getAllModules()).find((module) => module.id === id);
  if (mod) return mod;
  return null;
}
