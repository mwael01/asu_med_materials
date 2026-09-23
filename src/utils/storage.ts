import type { AcademicYear, UserFolder, FolderColor } from '../types/materials';

const BOOKMARKS_STORAGE_KEY = 'asumed_bookmarks';
const STUDIED_STORAGE_KEY = 'asumed_studied_materials';
const USER_YEAR_KEY = 'asumed_user_year';
const USER_MODULE_KEY = 'asumed_user_module';
const USER_FOLDERS_KEY = 'asumed_folders';
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

// User Folders Management
export function getUserFolders(): UserFolder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USER_FOLDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserFolders(folders: UserFolder[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_FOLDERS_KEY, JSON.stringify(folders));
    window.dispatchEvent(new CustomEvent('folders-updated', { detail: folders }));
  } catch (err) {
    console.error('Failed to save folders to localStorage', err);
  }
}

export function createUserFolder(name: string, color: FolderColor = 'emerald'): UserFolder {
  const folders = getUserFolders();
  const newFolder: UserFolder = {
    id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    name: name.trim(),
    color,
    materialIds: [],
    createdAt: Date.now()
  };
  folders.push(newFolder);
  saveUserFolders(folders);
  return newFolder;
}

export function deleteUserFolder(folderId: string): void {
  const folders = getUserFolders().filter((f) => f.id !== folderId);
  saveUserFolders(folders);
}

export function renameUserFolder(folderId: string, newName: string): void {
  const folders = getUserFolders().map((f) => {
    if (f.id === folderId) {
      return { ...f, name: newName.trim() };
    }
    return f;
  });
  saveUserFolders(folders);
}

export function addMaterialToFolder(folderId: string, materialId: string): void {
  const folders = getUserFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (folder && !folder.materialIds.includes(materialId)) {
    folder.materialIds.push(materialId);
    saveUserFolders(folders);
  }
  const bookmarks = getStoredBookmarkIds();
  if (!bookmarks.includes(materialId)) {
    saveBookmarkIds([...bookmarks, materialId]);
  }
}

export function removeMaterialFromFolder(folderId: string, materialId: string): void {
  const folders = getUserFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (folder) {
    folder.materialIds = folder.materialIds.filter((id) => id !== materialId);
    saveUserFolders(folders);
  }
}

export function toggleMaterialInFolder(folderId: string, materialId: string): boolean {
  const folders = getUserFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return false;
  const exists = folder.materialIds.includes(materialId);
  if (exists) {
    folder.materialIds = folder.materialIds.filter((id) => id !== materialId);
  } else {
    folder.materialIds.push(materialId);
    const bookmarks = getStoredBookmarkIds();
    if (!bookmarks.includes(materialId)) {
      saveBookmarkIds([...bookmarks, materialId]);
    }
  }
  saveUserFolders(folders);
  return !exists;
}

export function getFoldersForMaterial(materialId: string): UserFolder[] {
  return getUserFolders().filter((f) => f.materialIds.includes(materialId));
}

export function setMaterialFolders(materialId: string, targetFolderIds: string[]): void {
  const folders = getUserFolders();
  folders.forEach((f) => {
    const shouldHave = targetFolderIds.includes(f.id);
    const has = f.materialIds.includes(materialId);
    if (shouldHave && !has) {
      f.materialIds.push(materialId);
    } else if (!shouldHave && has) {
      f.materialIds = f.materialIds.filter((id) => id !== materialId);
    }
  });
  saveUserFolders(folders);
  if (targetFolderIds.length > 0) {
    const bookmarks = getStoredBookmarkIds();
    if (!bookmarks.includes(materialId)) {
      saveBookmarkIds([...bookmarks, materialId]);
    }
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
