import type { AcademicYear } from '../types/materials';

const BOOKMARKS_STORAGE_KEY = 'asumed_bookmarks';
const STUDIED_STORAGE_KEY = 'asumed_studied_materials';
const USER_YEAR_KEY = 'asumed_user_year';
const USER_MODULE_KEY = 'asumed_user_module';
const HAS_VISITED_KEY = 'asumed_has_visited';

// Bookmarks management
export function getStoredBookmarkIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBookmarkIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent('bookmarks-updated', { detail: ids }));
  } catch (err) {
    console.error('Failed to save bookmarks to localStorage', err);
  }
}

export function isItemBookmarked(id: string): boolean {
  return getStoredBookmarkIds().includes(id);
}

export function toggleItemBookmark(id: string): boolean {
  const current = getStoredBookmarkIds();
  const index = current.indexOf(id);
  let updated: string[];

  if (index >= 0) {
    updated = current.filter((item) => item !== id);
  } else {
    updated = [...current, id];
  }

  saveBookmarkIds(updated);
  return index < 0; // returns true if newly added, false if removed
}

// Studied / Completed materials management
let memoryStudiedFallback: string[] | null = null;

export function getStoredStudiedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STUDIED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryStudiedFallback = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('LocalStorage read failed for studied materials:', err);
  }
  return memoryStudiedFallback ? [...memoryStudiedFallback] : [];
}

export function saveStudiedIds(ids: string[], sourceId?: string): void {
  memoryStudiedFallback = [...ids];
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STUDIED_STORAGE_KEY, JSON.stringify(ids));
  } catch (err) {
    console.error('Failed to save studied materials to localStorage', err);
  }
  try {
    window.dispatchEvent(new CustomEvent('studied-updated', { detail: { ids, sourceId } }));
  } catch {}
}

export function isItemStudied(id: string): boolean {
  return getStoredStudiedIds().includes(id);
}

export function toggleItemStudied(id: string): boolean {
  const current = getStoredStudiedIds();
  const index = current.indexOf(id);
  let updated: string[];

  if (index >= 0) {
    updated = current.filter((item) => item !== id);
  } else {
    updated = [...current, id];
  }

  saveStudiedIds(updated, id);
  return index < 0; // returns true if newly studied, false if unmarked
}

// User Year & Preferences management
export function getUserStoredYear(): AcademicYear | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem(USER_YEAR_KEY);
    if (!val) return null;
    const num = parseInt(val, 10);
    return num >= 1 && num <= 5 ? (num as AcademicYear) : null;
  } catch {
    return null;
  }
}

export function setUserStoredYear(year: AcademicYear): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_YEAR_KEY, String(year));
    window.dispatchEvent(new CustomEvent('user-preferences-updated', { detail: { year } }));
  } catch (err) {
    console.error('Failed to save user year to localStorage', err);
  }
}

export function getUserStoredModule(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(USER_MODULE_KEY);
  } catch {
    return null;
  }
}

export function setUserStoredModule(moduleId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (moduleId) {
      localStorage.setItem(USER_MODULE_KEY, moduleId);
    } else {
      localStorage.removeItem(USER_MODULE_KEY);
    }
    window.dispatchEvent(new CustomEvent('user-preferences-updated'));
  } catch (err) {
    console.error('Failed to save user module to localStorage', err);
  }
}

// First visit detection
export function getHasVisited(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(HAS_VISITED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setHasVisited(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HAS_VISITED_KEY, 'true');
  } catch (err) {
    console.error('Failed to save visited flag to localStorage', err);
  }
}
