import type { ModuleInfo } from '../types/materials';
import { fetchModulesFromFirestore, getModuleByIdFromFirestore } from '../firebase/firestore';

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

let modulesMemoryCache: { data: ModuleInfo[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 15_000; // 15 seconds

/**
 * Fetches active curriculum modules from Cloud Firestore (filters out deactivated modules).
 */
export async function getAllModules(): Promise<ModuleInfo[]> {
  const now = Date.now();
  if (modulesMemoryCache && now - modulesMemoryCache.timestamp < CACHE_TTL_MS) {
    return modulesMemoryCache.data;
  }

  const modules = await fetchModulesFromFirestore();
  // Filter out deactivated modules for public views
  const activeModules = modules.filter(m => m.active !== false);
  if (activeModules && activeModules.length > 0) {
    modulesMemoryCache = { data: activeModules, timestamp: now };
    return activeModules;
  }

  return modulesMemoryCache?.data || [];
}

/**
 * Fetches ALL modules including inactive ones (for admin management).
 */
export async function getAllModulesIncludingInactive(): Promise<ModuleInfo[]> {
  return fetchModulesFromFirestore();
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
  const mod = await getModuleByIdFromFirestore(id);
  if (mod) return mod;
  const all = await getAllModules();
  return all.find((m) => m.id === id) || null;
}
