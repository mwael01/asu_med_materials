export interface StoredFileRecord {
  materialId: string;
  documentId: string;
  fileName: string;
  relativePath: string;
  size: number;
  lastModified: number;
}

const DB_NAME = 'asumed_study_folder_db';
const DB_VERSION = 1;
const STORE_HANDLES = 'handles';
const STORE_INDEX = 'file_index';
const ROOT_HANDLE_KEY = 'study_folder_root';

function openFolderDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES);
      }
      if (!db.objectStoreNames.contains(STORE_INDEX)) {
        const indexStore = db.createObjectStore(STORE_INDEX, { keyPath: 'id' });
        indexStore.createIndex('materialId', 'materialId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function saveStoredDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openFolderDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANDLES, 'readwrite');
    tx.objectStore(STORE_HANDLES).put(handle, ROOT_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openFolderDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_HANDLES, 'readonly');
      const req = tx.objectStore(STORE_HANDLES).get(ROOT_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function disconnectStudyFolder(): Promise<void> {
  try {
    const db = await openFolderDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_HANDLES, STORE_INDEX], 'readwrite');
      tx.objectStore(STORE_HANDLES).delete(ROOT_HANDLE_KEY);
      tx.objectStore(STORE_INDEX).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

export async function verifyFolderPermission(
  handle: FileSystemDirectoryHandle,
  readWrite = false
): Promise<boolean> {
  const mode = readWrite ? 'readwrite' : 'read';
  try {
    const query = await (handle as any).queryPermission({ mode });
    if (query === 'granted') return true;
    const request = await (handle as any).requestPermission({ mode });
    return request === 'granted';
  } catch {
    return false;
  }
}

export function sanitizePathSegment(segment: string): string {
  return segment.replace(/[\\/:*?"<>|\0\r\n]/g, ' ').replace(/\s+/g, ' ').trim() || 'General';
}

export function resolveCurriculumPath(
  year: number,
  moduleTitle: string,
  subject: string,
  fileName: string
): string[] {
  const cleanYear = `Year ${year}`;
  const cleanModule = sanitizePathSegment(moduleTitle);
  const cleanSubject = sanitizePathSegment(subject);
  const cleanFile = sanitizePathSegment(fileName).replace(/\.pdf$/i, '') + '.pdf';
  return [cleanYear, cleanModule, cleanSubject, cleanFile];
}

export function parseMaterialIdFromFileName(name: string): { materialId?: string; documentId?: string } {
  const matchWithDoc = name.match(/^\[m-([a-zA-Z0-9_-]+?)-d-([a-zA-Z0-9_-]+)\]/);
  if (matchWithDoc) {
    return { materialId: matchWithDoc[1], documentId: matchWithDoc[2] };
  }
  const matchMatOnly = name.match(/^\[m-([a-zA-Z0-9_-]+)\]/);
  if (matchMatOnly) {
    return { materialId: matchMatOnly[1] };
  }
  return {};
}

export async function scanAndIndexFolder(
  dirHandle: FileSystemDirectoryHandle
): Promise<StoredFileRecord[]> {
  const records: StoredFileRecord[] = [];

  async function walk(handle: FileSystemDirectoryHandle, currentPath: string[]): Promise<void> {
    for await (const entry of (handle as any).values()) {
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, [...currentPath, entry.name]);
      } else if (entry.kind === 'file') {
        const fileName = entry.name;
        if (/\.(pdf|mp4|webm|docx?|pptx?)$/i.test(fileName)) {
          try {
            const file = await (entry as FileSystemFileHandle).getFile();
            const { materialId, documentId } = parseMaterialIdFromFileName(fileName);
            const relativePath = [...currentPath, fileName].join('/');
            records.push({
              materialId: materialId || fileName,
              documentId: documentId || fileName,
              fileName,
              relativePath,
              size: file.size,
              lastModified: file.lastModified
            });
          } catch {}
        }
      }
    }
  }

  await walk(dirHandle, []);

  // Update in IndexedDB index
  try {
    const db = await openFolderDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_INDEX, 'readwrite');
      const store = tx.objectStore(STORE_INDEX);
      store.clear();
      for (const rec of records) {
        store.put({
          id: `${rec.materialId}__${rec.documentId}`,
          ...rec
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}

  return records;
}

export async function isMaterialInLocalFolder(
  materialId: string,
  documentId?: string
): Promise<StoredFileRecord | null> {
  try {
    const db = await openFolderDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_INDEX, 'readonly');
      const store = tx.objectStore(STORE_INDEX);
      if (documentId) {
        const req = store.get(`${materialId}__${documentId}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } else {
        const index = store.index('materialId');
        const req = index.get(materialId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }
    });
  } catch {
    return null;
  }
}

export async function listIndexedFiles(): Promise<StoredFileRecord[]> {
  try {
    const db = await openFolderDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_INDEX, 'readonly');
      const req = tx.objectStore(STORE_INDEX).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getFileHandleByRelativePath(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const fileName = parts.pop()!;
  let currentDir = rootHandle;

  for (const dirName of parts) {
    try {
      currentDir = await currentDir.getDirectoryHandle(dirName, { create: false });
    } catch {
      return null;
    }
  }

  try {
    return await currentDir.getFileHandle(fileName, { create: false });
  } catch {
    return null;
  }
}

export async function readLocalFileBlobUrl(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<string | null> {
  const fileHandle = await getFileHandleByRelativePath(rootHandle, relativePath);
  if (!fileHandle) return null;
  const file = await fileHandle.getFile();
  return URL.createObjectURL(file);
}

export async function deleteLocalFile(
  rootHandle: FileSystemDirectoryHandle,
  record: StoredFileRecord
): Promise<boolean> {
  const parts = record.relativePath.split('/').filter(Boolean);
  if (parts.length === 0) return false;
  const fileName = parts.pop()!;
  let currentDir = rootHandle;

  for (const dirName of parts) {
    try {
      currentDir = await currentDir.getDirectoryHandle(dirName, { create: false });
    } catch {
      return false;
    }
  }

  try {
    await currentDir.removeEntry(fileName);
    // Remove from index
    const db = await openFolderDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_INDEX, 'readwrite');
      tx.objectStore(STORE_INDEX).delete(`${record.materialId}__${record.documentId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function saveFileToCurriculumFolder(
  rootHandle: FileSystemDirectoryHandle,
  year: number,
  moduleTitle: string,
  subject: string,
  fileName: string,
  blob: Blob,
  materialId: string,
  documentId: string
): Promise<StoredFileRecord> {
  const segments = resolveCurriculumPath(year, moduleTitle, subject, fileName);
  const targetFileName = `[m-${materialId}-d-${documentId}]-${segments.pop()!}`;
  let currentDir = rootHandle;

  for (const dirName of segments) {
    currentDir = await currentDir.getDirectoryHandle(dirName, { create: true });
  }

  const fileHandle = await currentDir.getFileHandle(targetFileName, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(blob);
  await writable.close();

  const relativePath = [...segments, targetFileName].join('/');
  const record: StoredFileRecord = {
    materialId,
    documentId,
    fileName: targetFileName,
    relativePath,
    size: blob.size,
    lastModified: Date.now()
  };

  // Add to IndexedDB index
  const db = await openFolderDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_INDEX, 'readwrite');
    tx.objectStore(STORE_INDEX).put({
      id: `${materialId}__${documentId}`,
      ...record
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return record;
}
