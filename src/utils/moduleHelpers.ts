import type { ModuleInfo } from '../types/materials';

/**
 * Resolves the currently studied active module from a list of curriculum modules for an academic year.
 * 
 * Rules:
 * 1. Strictly filters out cross-year reference books (e.g. `yearX-reference-books`).
 * 2. Matches the student's academic year.
 * 3. Selects only a module explicitly marked `active === true`, in curriculum order.
 * 4. Returns null when no curriculum module is explicitly active.
 */
export function resolveActiveModule(modules: ModuleInfo[], year: number): ModuleInfo | null {
  const yearMods = modules
    .filter((m) => m.year === year && !m.id.includes('reference-books'))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  return yearMods.find((m) => m.active === true) ?? null;
}

/** Resolve a landing page without ever falling back to another academic year. */
export function resolveYearDestination(modules: ModuleInfo[], year: number): string {
  const active = resolveActiveModule(modules, year);
  return active ? `/module/${active.id}` : `/year/${year}`;
}

/** Active status controls the landing page, not membership in the module menu. */
export function getYearModules(modules: ModuleInfo[], year: number): ModuleInfo[] {
  return modules.filter(module => module.year === year)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}
