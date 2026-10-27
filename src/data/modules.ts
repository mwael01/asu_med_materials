import { getPublicModules } from './catalogue.server';
import type { ModuleInfo } from '../types/materials';
import { fetchModulesFromFirestore } from '../firebase/firestore';
import { resolveActiveModule } from '../utils/moduleHelpers';

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

/** Fetch all modules; reuse the same pending read across SSR components. */
export async function getAllModules(version?: number): Promise<ModuleInfo[]> {
  const list = await loadModules(version);
  return list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}


/**
 * Resolves the currently studied active module for an academic year.
 * Selects a module explicitly marked active: true; returns null when none is active.
 */
export async function getActiveModuleForYear(year: number, version?: number): Promise<ModuleInfo | null> {
  const modules = await getAllModules(version);
  return resolveActiveModule(modules, year);
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
export async function getModulesByYear(year: number, version?: number): Promise<ModuleInfo[]> {
  const modules = await getAllModules(version);
  return modules.filter((m) => m.year === year);
}

/**
 * Fetch a single module by ID from Cloud Firestore.
 */
export async function getModuleById(id: string, version?: number): Promise<ModuleInfo | null> {
  const mod = (await getAllModules(version)).find((module) => module.id === id);
  if (mod) return mod;
  return null;
}
