import type { ModuleInfo } from '../types/materials';

/**
 * Resolves the currently studied active module from a list of curriculum modules for an academic year.
 * 
 * Rules:
 * 1. Strictly filters out cross-year reference books (e.g. `yearX-reference-books`).
 * 2. Matches the student's academic year.
 * 3. Gives highest priority to the module marked `active === true`.
 * 4. Falls back to the module with the lowest order (or first in sequence).
 * 5. Returns null if the year has no curriculum modules available.
 */
export function resolveActiveModule(modules: ModuleInfo[], year: number): ModuleInfo | null {
  const yearMods = modules
    .filter((m) => m.year === year && !m.id.includes('reference-books'))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  if (yearMods.length === 0) return null;
  const active = yearMods.find((m) => m.active === true);
  return active || yearMods[0];
}
