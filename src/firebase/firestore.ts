import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  getCountFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  type Firestore
} from 'firebase/firestore';
import { getFirebaseApp } from './config';
import type { MaterialItem, AcademicYear, ModuleInfo } from '../types/materials';
import type { MaterialCollection } from '../types/collections';
import type { UserProfile, UserRole } from '../types/profile';
import { handleFirestoreError } from '../utils/firestoreErrors';
import type {
  SubmissionDocument,
  FeedbackDocument,
  AdminLogDocument
} from './schema';
import { normalizeResourceUrl } from '../utils/url';
import { materialUrlKey } from '../utils/materialLinks';

let firestoreInstance: Firestore | null = null;

/**
 * Returns the Firestore database instance configured with multi-tab IndexedDB offline persistence.
 */
export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  const app = getFirebaseApp();
  if (!app) return null;

  try {
    if (typeof window !== 'undefined') {
      firestoreInstance = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } else {
      firestoreInstance = getFirestore(app);
    }
  } catch (err: any) {
    // If already initialized, get existing instance
    try {
      firestoreInstance = getFirestore(app);
    } catch {
      console.warn('[Firestore] Could not initialize Firestore:', err?.message || err);
      return null;
    }
  }

  return firestoreInstance;
}

/**
 * Recursively strips keys with undefined values from objects before writing to Cloud Firestore.
 * Firestore strictly rejects documents containing undefined field values.
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  const result: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = sanitizeFirestorePayload(value);
      } else if (Array.isArray(value)) {
        result[key] = value
          .filter((item) => item !== undefined)
          .map((item) => (typeof item === 'object' && item !== null ? sanitizeFirestorePayload(item) : item));
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

// Collections
const MATERIALS_COLLECTION = 'materials';
const COLLECTIONS_COLLECTION = 'collections';
const USERS_COLLECTION = 'users';
const MATERIALS_VERSION_COLLECTION = 'materials_version';
const MATERIALS_VERSION_DOC_ID = 'current';

let cachedMaterialsVersion: { version: number; expiresAt: number } | null = null;
const MATERIALS_VERSION_TTL_MS = 60_000; // 60 seconds

export function invalidateMaterialsVersionCache(): void {
  cachedMaterialsVersion = null;
}

/**
 * Fetches the current materials version number from Cloud Firestore.
 * Caches in memory for 60 seconds to protect daily read quotas.
 * Defaults to 1 if not set or on network failure.
 */
export async function getMaterialsVersionFromFirestore(): Promise<number> {
  const now = Date.now();
  if (cachedMaterialsVersion && now < cachedMaterialsVersion.expiresAt) {
    return cachedMaterialsVersion.version;
  }

  const db = getFirestoreDb();
  if (!db) return cachedMaterialsVersion?.version || 1;

  try {
    const docRef = doc(db, MATERIALS_VERSION_COLLECTION, MATERIALS_VERSION_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const val = typeof data?.version === 'number' ? data.version : Number(data?.version);
      const version = Number.isFinite(val) && val > 0 ? val : 1;
      cachedMaterialsVersion = { version, expiresAt: now + MATERIALS_VERSION_TTL_MS };
      return version;
    }
  } catch (err) {
    console.warn('[Firestore] Failed to fetch materials version, falling back to cached or 1:', err);
  }
  return cachedMaterialsVersion?.version || 1;
}

/**
 * Atomically increments the materials version in Cloud Firestore.
 * Called whenever materials are added, modified, or deleted by admins.
 */
export async function incrementMaterialsVersionInFirestore(): Promise<number> {
  invalidateMaterialsVersionCache();
  const db = getFirestoreDb();
  if (!db) return 1;

  try {
    const docRef = doc(db, MATERIALS_VERSION_COLLECTION, MATERIALS_VERSION_DOC_ID);
    await setDoc(
      docRef,
      {
        version: increment(1),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    clearUrlVerificationCache();
    const snap = await getDoc(docRef);
    const newVersion = snap.exists() ? (snap.data()?.version || 1) : 1;
    cachedMaterialsVersion = { version: newVersion, expiresAt: Date.now() + MATERIALS_VERSION_TTL_MS };
    return newVersion;
  } catch (err) {
    console.warn('[Firestore] Failed to increment materials version:', err);
    return 1;
  }
}

/**
 * Fetches all study materials from Firestore (or IndexedDB cache when offline).
 */
export async function fetchMaterialsFromFirestore(year?: AcademicYear, strict = false): Promise<MaterialItem[]> {
  const db = getFirestoreDb();
  if (!db) {
    if (strict) throw new Error('Firestore is not configured');
    return [];
  }

  try {
    const materialsRef = collection(db, MATERIALS_COLLECTION);
    const q = year
      ? query(materialsRef, where('year', '==', year))
      : query(materialsRef);

    const snapshot = strict ? await getDocsFromServer(q) : await getDocs(q);
    const results: MaterialItem[] = [];
    snapshot.forEach((docSnap) => {
      results.push(docSnap.data() as MaterialItem);
    });
    return results;
  } catch (err) {
    if (strict) throw err;
    handleFirestoreError('Failed to fetch materials', err);
    return [];
  }
}

/**
 * Fetches a single study material by ID.
 */
export async function getMaterialByIdFromFirestore(id: string): Promise<MaterialItem | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const docRef = doc(db, MATERIALS_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as MaterialItem;
    }
    return null;
  } catch (err) {
    console.warn(`[Firestore] Failed to fetch material ${id}:`, err);
    return null;
  }
}

/**
 * Saves or updates a material item in Firestore.
 */
export async function saveMaterialToFirestore(material: MaterialItem): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const docRef = doc(db, MATERIALS_COLLECTION, material.id);
    await setDoc(docRef, sanitizeFirestorePayload(material), { merge: true });
    addUrlToVerificationCache(material);
    await incrementMaterialsVersionInFirestore();
    return true;
  } catch (err) {
    console.error('[Firestore] Failed to save material:', err);
    return false;
  }
}

// Session-level URL verification cache (normalizedKey -> { item, expiresAt })
const urlVerificationCache = new Map<string, { item: MaterialItem | null; expiresAt: number }>();
const VERIFICATION_CACHE_TTL_MS = 300_000; // 5 minutes

/**
 * Inserts a material URL into the verification cache so subsequent duplicate checks cost 0 reads.
 */
export function addUrlToVerificationCache(material: MaterialItem): void {
  if (material?.url) {
    const key = materialUrlKey(material.url);
    if (key) {
      urlVerificationCache.set(key, { item: material, expiresAt: Date.now() + VERIFICATION_CACHE_TTL_MS });
    }
  }
}

/**
 * Clears the session-level URL verification cache.
 */
export function clearUrlVerificationCache(): void {
  urlVerificationCache.clear();
}

/**
 * Checks a batch of URLs against existing materials in Firestore.
 * Uses targeted point queries ('url' == or 'url' in) and session memoization
 * to protect Firestore read quotas instead of scanning the full collection.
 */
export async function checkUrlsBatchInFirestore(urls: string[], strict = false): Promise<Map<string, MaterialItem>> {
  const result = new Map<string, MaterialItem>();
  if (!urls || urls.length === 0) return result;

  try {
    const now = Date.now();
    const missingUrls: string[] = [];

    // 1. Check in-memory session cache first (costs 0 Firestore reads)
    for (const rawUrl of urls) {
      if (!rawUrl) continue;
      const norm = materialUrlKey(rawUrl);
      if (!norm) continue;

      const cached = urlVerificationCache.get(norm);
      if (!strict && cached && now < cached.expiresAt) {
        if (cached.item) {
          result.set(rawUrl, cached.item);
        }
      } else {
        missingUrls.push(rawUrl);
      }
    }

    if (missingUrls.length === 0) {
      return result;
    }

    const db = getFirestoreDb();
    if (!db) return result;

    // 2. Query Firestore using targeted queries in chunks of 30 (never scan full collection)
    const materialsRef = collection(db, MATERIALS_COLLECTION);

    for (let i = 0; i < missingUrls.length; i += 30) {
      const chunk = missingUrls.slice(i, i + 30);
      const q = chunk.length === 1
        ? query(materialsRef, where('url', '==', chunk[0]), limit(1))
        : query(materialsRef, where('url', 'in', chunk));

      const snapshot = strict ? await getDocsFromServer(q) : await getDocs(q);
      const matchedNorms = new Set<string>();

      snapshot.forEach((docSnap) => {
        const mat = docSnap.data() as MaterialItem;
        if (mat?.url) {
          const norm = materialUrlKey(mat.url);
          if (norm) {
            matchedNorms.add(norm);
            urlVerificationCache.set(norm, { item: mat, expiresAt: now + VERIFICATION_CACHE_TTL_MS });
            for (const inputUrl of chunk) {
              if (materialUrlKey(inputUrl) === norm) {
                result.set(inputUrl, mat);
              }
            }
          }
        }
      });

      // Cache non-matches as null so repeated checks cost 0 reads
      for (const inputUrl of chunk) {
        const norm = materialUrlKey(inputUrl);
        if (norm && !matchedNorms.has(norm)) {
          urlVerificationCache.set(norm, { item: null, expiresAt: now + VERIFICATION_CACHE_TTL_MS });
        }
      }
    }
  } catch (err) {
    if (strict) throw err;
    console.warn('[Firestore] Error checking batch URLs:', err);
  }

  return result;
}

/**
 * Checks whether a single URL already exists in the Firestore materials collection.
 * Uses targeted point query with limit(1) and session memoization.
 */
export async function checkUrlExistsInFirestore(
  url: string
): Promise<{ exists: boolean; existingMaterial?: MaterialItem }> {
  if (!url || !url.trim()) return { exists: false };
  const matches = await checkUrlsBatchInFirestore([url.trim()]);
  if (matches.has(url.trim())) {
    return { exists: true, existingMaterial: matches.get(url.trim()) };
  }
  return { exists: false };
}

/**
 * Saves multiple materials atomically in Firestore while skipping duplicates.
 * Also logs the admin action and optionally marks the source submission as approved.
 */
export async function saveMaterialsBulk(
  materials: MaterialItem[],
  actingAdmin?: UserProfile,
  sourceSubmissionId?: string
): Promise<{ savedCount: number; skippedCount: number; errors: string[] }> {
  const db = getFirestoreDb();
  if (!db || !materials || materials.length === 0) {
    return { savedCount: 0, skippedCount: 0, errors: ['Database not available or materials empty'] };
  }

  const urlsToCheck = materials.map((m) => m.url).filter(Boolean);
  const existingMap = await checkUrlsBatchInFirestore(urlsToCheck);

  let savedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const seenNormUrlsInBatch = new Set<string>();

  for (const mat of materials) {
    if (!mat.title || !mat.url) {
      skippedCount++;
      continue;
    }

    const norm = normalizeResourceUrl(mat.url);
    if (existingMap.has(mat.url) || (norm && seenNormUrlsInBatch.has(norm))) {
      skippedCount++;
      continue;
    }

    if (norm) seenNormUrlsInBatch.add(norm);

    try {
      const docRef = doc(db, MATERIALS_COLLECTION, mat.id);
      await setDoc(docRef, sanitizeFirestorePayload(mat), { merge: true });
      savedCount++;
      if (mat.contributorUid) {
        await incrementUserContributionsCount(mat.contributorUid, 1);
      }
    } catch (err: any) {
      console.error(`[Firestore] Failed to save material ${mat.id} in bulk:`, err);
      errors.push(`Material "${mat.title}": ${err?.message || 'Save failed'}`);
    }
  }

  if (savedCount > 0) {
    await incrementMaterialsVersionInFirestore();
  }

  // Update submission status if source submission exists
  if (sourceSubmissionId && savedCount > 0) {
    try {
      await updateSubmissionStatus(sourceSubmissionId, 'approved', actingAdmin);
    } catch (err) {
      console.warn(`[Firestore] Failed to update source submission ${sourceSubmissionId}:`, err);
    }
  }

  // Log admin action
  if (actingAdmin && savedCount > 0) {
    try {
      await logAdminAction({
        adminUid: actingAdmin.uid,
        adminName: actingAdmin.displayName,
        adminUsername: actingAdmin.username,
        action: 'publish_material',
        targetId: sourceSubmissionId || materials[0]?.id || 'bulk',
        targetTitle: `نشر ${savedCount} مواد دفعة واحدة`,
        details: `Successfully published ${savedCount} materials in bulk (Skipped ${skippedCount} duplicates)`
      });
    } catch (logErr) {
      console.warn('[Firestore] Failed to log bulk admin action:', logErr);
    }
  }

  return { savedCount, skippedCount, errors };
}


/**
 * Retrieves a user profile by UID.
 */
export async function getUserProfileByUid(uid: string): Promise<UserProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (err) {
    handleFirestoreError(`Failed to get user profile ${uid}`, err);
    return null;
  }
}

/**
 * Retrieves a user profile by unique username handle.
 */
export async function getUserProfileByUsername(username: string): Promise<UserProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  const normalized = username.trim().toLowerCase().replace(/^@/, '');
  if (!normalized) return null;

  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const q = query(usersRef, where('username', '==', normalized));
    const snap = await getDocs(q);

    if (!snap.empty) {
      return snap.docs[0].data() as UserProfile;
    }
    return null;
  } catch (err) {
    console.warn(`[Firestore] Failed to get profile for @${normalized}:`, err);
    return null;
  }
}

/**
 * Validates whether a username handle is available.
 */
export async function checkUsernameAvailable(username: string, currentUid?: string): Promise<boolean> {
  const db = getFirestoreDb();
  const normalized = username.trim().toLowerCase().replace(/^@/, '');
  if (!normalized || normalized.length < 3 || normalized.length > 25) return false;

  // Only allow alphanumeric characters, underscores, and hyphens
  if (!/^[a-z0-9_-]+$/.test(normalized)) return false;

  if (!db) return true; // Local dev fallback

  try {
    const existing = await getUserProfileByUsername(normalized);
    if (!existing) return true;
    return existing.uid === currentUid;
  } catch {
    return true;
  }
}

/**
 * Creates or updates a user profile in Firestore.
 */
export async function upsertUserProfile(profile: UserProfile): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const userDocRef = doc(db, USERS_COLLECTION, profile.uid);
    const existingSnap = await getDoc(userDocRef);
    let finalUsername = profile.username.trim().toLowerCase().replace(/^@/, '');
    let hasCustomUsername = profile.hasCustomUsername ?? false;
    let finalPhotoURL = profile.photoURL;

    if (existingSnap.exists()) {
      const existing = existingSnap.data() as UserProfile;
      // If the user already had a permanent custom username, lock it in permanently
      if (existing.username && existing.hasCustomUsername) {
        finalUsername = existing.username;
        hasCustomUsername = true;
      }
      // If existing profile already has an avatar image and incoming profile did not specify one, preserve existing
      if (existing.photoURL && profile.photoURL === undefined) {
        finalPhotoURL = existing.photoURL;
      }
    }

    const payload = {
      ...profile,
      username: finalUsername,
      hasCustomUsername,
      photoURL: finalPhotoURL,
      updatedAt: new Date().toISOString()
    };
    await setDoc(userDocRef, sanitizeFirestorePayload(payload), { merge: true });
    invalidateUsersCache();
    return true;
  } catch (err) {
    console.error('[Firestore] Failed to save user profile:', err);
    return false;
  }
}

/**
 * Synchronizes user bookmarks and/or completed materials to Firestore.
 */
export async function syncUserLibraryToFirestore(
  uid: string,
  payload: { bookmarks?: string[]; completedMaterials?: string[] }
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !uid) return false;

  try {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString()
    };
    if (payload.bookmarks) {
      updatePayload.bookmarks = payload.bookmarks;
    }
    if (payload.completedMaterials) {
      updatePayload.completedMaterials = payload.completedMaterials;
    }
    await setDoc(userDocRef, sanitizeFirestorePayload(updatePayload), { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to sync user library for ${uid}:`, err);
    return false;
  }
}

/**
 * Toggles a single bookmark item for a user in Firestore using arrayUnion/arrayRemove.
 */
export async function syncSingleUserBookmark(
  uid: string,
  materialId: string,
  isAdded: boolean
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !uid || !materialId) return false;

  try {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(userDocRef, {
      bookmarks: isAdded ? arrayUnion(materialId) : arrayRemove(materialId),
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Toggles a single completed material item for a user in Firestore using arrayUnion/arrayRemove.
 */
export async function syncSingleUserStudied(
  uid: string,
  materialId: string,
  isStudied: boolean
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !uid || !materialId) return false;

  try {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(userDocRef, {
      completedMaterials: isStudied ? arrayUnion(materialId) : arrayRemove(materialId),
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Listens in real-time to changes on the user's profile document (for multi-device sync).
 */
export function listenToUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
): () => void {
  const db = getFirestoreDb();
  if (!db || !uid) return () => {};

  const userDocRef = doc(db, USERS_COLLECTION, uid);
  return onSnapshot(
    userDocRef,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as UserProfile);
      } else {
        callback(null);
      }
    },
    (err) => {
      console.warn(`[Firestore] User profile subscription error for ${uid}:`, err);
    }
  );
}

/**
 * Increments or updates the contributions count for a user in Firestore.
 */
export async function incrementUserContributionsCount(uid: string, delta: number = 1): Promise<void> {
  const db = getFirestoreDb();
  if (!db || !uid) return;
  try {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(userDocRef, {
      contributionsCount: increment(delta),
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn(`[Firestore] Failed to increment contributions count for ${uid}:`, err);
  }
}

/**
 * Retrieves all materials contributed by a given user (by handle or UID).
 */
export async function getUserContributions(usernameOrUid: string): Promise<MaterialItem[]> {
  const db = getFirestoreDb();
  const rawTarget = usernameOrUid.trim();
  const target = rawTarget.toLowerCase().replace(/^@/, '');
  if (!target) return [];

  if (!db) return [];

  try {
    // Leverage cache-first materials fetcher instead of raw full collection read
    const allMaterials = await fetchMaterialsFromFirestore();
    const contributions: MaterialItem[] = [];

    for (const mat of allMaterials) {
      // 1. Direct UID match
      if (mat.contributorUid && (mat.contributorUid === rawTarget || mat.contributorUid === target)) {
        contributions.push(mat);
        continue;
      }

      // 2. Direct Username match
      if (mat.creator_username && mat.creator_username.toLowerCase().replace(/^@/, '') === target) {
        contributions.push(mat);
        continue;
      }
      if (mat.contributorUsername && mat.contributorUsername.toLowerCase().replace(/^@/, '') === target) {
        contributions.push(mat);
        continue;
      }
    }

    return contributions;
  } catch (err) {
    console.warn(`[Firestore] Failed to get contributions for ${target}:`, err);
    return [];
  }
}

const MODULES_COLLECTION = 'modules';

/**
 * Fetches all curriculum modules from Firestore (or IndexedDB cache).
 */
export async function fetchModulesFromFirestore(year?: AcademicYear, strict = false): Promise<ModuleInfo[]> {
  const db = getFirestoreDb();
  if (!db) {
    if (strict) throw new Error('Firestore is not configured');
    return [];
  }

  try {
    const modulesRef = collection(db, MODULES_COLLECTION);
    const q = year
      ? query(modulesRef, where('year', '==', year))
      : query(modulesRef);

    const snapshot = await getDocs(q);
    const results: ModuleInfo[] = [];
    snapshot.forEach((docSnap) => {
      results.push(docSnap.data() as ModuleInfo);
    });
    return results;
  } catch (err) {
    if (strict) throw err;
    console.warn('[Firestore] Failed to fetch modules, falling back:', err);
    return [];
  }
}

/**
 * Fetches a single module by ID from Firestore.
 */
export async function getModuleByIdFromFirestore(id: string): Promise<ModuleInfo | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const docRef = doc(db, MODULES_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as ModuleInfo;
    }
    return null;
  } catch (err) {
    console.warn(`[Firestore] Failed to fetch module ${id}:`, err);
    return null;
  }
}

/**
 * Saves or updates a curriculum module in Firestore.
 */
export async function saveModuleToFirestore(mod: ModuleInfo): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const docRef = doc(db, MODULES_COLLECTION, mod.id);
    await setDoc(docRef, sanitizeFirestorePayload(mod), { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to save module ${mod.id}:`, err);
    return false;
  }
}

/**
 * Deletes a module document from Firestore and logs the admin action.
 */
export async function deleteModuleFromFirestore(
  moduleId: string,
  actingAdmin?: UserProfile
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !moduleId) return false;

  try {
    const docRef = doc(db, MODULES_COLLECTION, moduleId);
    const snap = await getDoc(docRef);
    const moduleData = snap.exists() ? (snap.data() as ModuleInfo) : null;

    await deleteDoc(docRef);

    if (actingAdmin) {
      await logAdminAction({
        adminUid: actingAdmin.uid,
        adminName: actingAdmin.displayName,
        adminUsername: actingAdmin.username,
        action: 'delete_module',
        targetId: moduleId,
        targetTitle: moduleData?.title || moduleId,
        details: `Deleted module "${moduleData?.title}" (Year ${moduleData?.year})`
      });
    }
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to delete module ${moduleId}:`, err);
    return false;
  }
}

/**
 * Toggles a module's active status in Firestore and logs the admin action.
 */
export async function toggleModuleActive(
  moduleId: string,
  active: boolean,
  actingAdmin?: UserProfile
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !moduleId) return false;

  try {
    const docRef = doc(db, MODULES_COLLECTION, moduleId);
    const snap = await getDoc(docRef);
    const moduleData = snap.exists() ? (snap.data() as ModuleInfo) : null;

    await setDoc(docRef, { active, updatedAt: new Date().toISOString() }, { merge: true });

    if (actingAdmin) {
      await logAdminAction({
        adminUid: actingAdmin.uid,
        adminName: actingAdmin.displayName,
        adminUsername: actingAdmin.username,
        action: 'toggle_module',
        targetId: moduleId,
        targetTitle: moduleData?.title || moduleId,
        details: `${active ? 'Activated' : 'Deactivated'} module "${moduleData?.title}"`
      });
    }
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to toggle module ${moduleId}:`, err);
    return false;
  }
}

/**
 * Deletes a material document from Firestore and logs the admin action.
 */
export async function deleteMaterialFromFirestore(
  materialId: string,
  actingAdmin?: UserProfile
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !materialId) return false;

  try {
    const docRef = doc(db, MATERIALS_COLLECTION, materialId);
    const snap = await getDoc(docRef);
    const matData = snap.exists() ? (snap.data() as MaterialItem) : null;

    await deleteDoc(docRef);

    if (actingAdmin) {
      await logAdminAction({
        adminUid: actingAdmin.uid,
        adminName: actingAdmin.displayName,
        adminUsername: actingAdmin.username,
        action: 'delete_material',
        targetId: materialId,
        targetTitle: matData?.title || materialId,
        details: `Deleted material "${matData?.title}" (${matData?.type})`
      });
    }
    await incrementMaterialsVersionInFirestore();
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to delete material ${materialId}:`, err);
    return false;
  }
}


let cachedAdminUsers: { admins: UserProfile[]; expiresAt: number; limitCount: number } | null = null;
const ADMIN_USERS_TTL_MS = 15 * 60 * 1000; // 15 minutes

let cachedUsernamesMap: { map: Map<string, { displayName: string; photoURL: string }>; expiresAt: number } | null = null;
const USERNAMES_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function invalidateUsersCache(): void {
  cachedAdminUsers = null;
  cachedUsernamesMap = null;
}

/**
 * Fetches administrators from Firestore (users where role == 'admin'), capped at limitCount.
 * Caches in memory for 15 minutes to reduce repetitive queries.
 */
export async function fetchAdminUsers(limitCount = 8): Promise<UserProfile[]> {
  const now = Date.now();
  if (cachedAdminUsers && now < cachedAdminUsers.expiresAt && cachedAdminUsers.limitCount >= limitCount) {
    return cachedAdminUsers.admins.slice(0, limitCount);
  }

  const db = getFirestoreDb();
  if (!db) return cachedAdminUsers?.admins.slice(0, limitCount) || [];

  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const q = query(usersRef, where('role', '==', 'admin'), limit(limitCount));
    const snapshot = await getDocs(q);
    const admins: UserProfile[] = [];

    snapshot.forEach((docSnap) => {
      admins.push(docSnap.data() as UserProfile);
    });

    cachedAdminUsers = { admins, expiresAt: now + ADMIN_USERS_TTL_MS, limitCount };
    return admins.slice(0, limitCount);
  } catch (err) {
    console.warn('[Firestore] Failed to fetch admin users:', err);
    return cachedAdminUsers?.admins.slice(0, limitCount) || [];
  }
}

/**
 * Fetches a lightweight map of username → { displayName, photoURL } for all users.
 * Used for resolving contributor usernames to display names and photos in the UI.
 * Caches in memory for 15 minutes to prevent scanning the entire users collection on every visit.
 */
export async function fetchAllUsernames(): Promise<Map<string, { displayName: string; photoURL: string }>> {
  const now = Date.now();
  if (cachedUsernamesMap && now < cachedUsernamesMap.expiresAt) {
    return cachedUsernamesMap.map;
  }

  const db = getFirestoreDb();
  if (!db) return cachedUsernamesMap?.map || new Map();

  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const snapshot = await getDocs(usersRef);
    const map = new Map<string, { displayName: string; photoURL: string }>();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      if (data.username && data.displayName) {
        map.set(data.username.toLowerCase(), {
          displayName: data.displayName,
          photoURL: data.photoURL || ''
        });
      }
    });

    cachedUsernamesMap = { map, expiresAt: now + USERNAMES_TTL_MS };
    return map;
  } catch (err) {
    console.warn('[Firestore] Failed to fetch usernames:', err);
    return cachedUsernamesMap?.map || new Map();
  }
}


// ==============================================================================
// 1. Material Submissions (Pure Firestore)
// ==============================================================================
const SUBMISSIONS_COLLECTION = 'submissions';

/**
 * Saves a student material submission directly to Firestore.
 */
export async function saveSubmissionToFirestore(sub: SubmissionDocument): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const subId = sub.id || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, SUBMISSIONS_COLLECTION, subId);
    const payload: SubmissionDocument = {
      ...sub,
      id: subId,
      title: sub.title || 'مساهمة طلابية جديدة',
      timestamp: sub.timestamp || new Date().toISOString(),
      status: sub.status || 'pending'
    };
    await setDoc(docRef, sanitizeFirestorePayload(payload), { merge: true });
    return subId;
  } catch (err) {
    console.error('[Firestore] Failed to save submission:', err);
    return null;
  }
}

/**
 * Fetches submissions from Firestore, optionally filtered by status.
 */
export async function fetchSubmissionsFromFirestore(
  status?: 'pending' | 'approved' | 'rejected'
): Promise<SubmissionDocument[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const coll = collection(db, SUBMISSIONS_COLLECTION);
    const q = status ? query(coll, where('status', '==', status)) : query(coll);
    const snap = await getDocs(q);
    const results: SubmissionDocument[] = [];
    snap.forEach((d) => {
      results.push(d.data() as SubmissionDocument);
    });

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results;
  } catch (err) {
    console.warn('[Firestore] Failed to fetch submissions:', err);
    return [];
  }
}

/**
 * Fetches all submissions created by a specific user (by UID), sorted newest first.
 */
export async function getUserSubmissions(uid: string): Promise<SubmissionDocument[]> {
  const db = getFirestoreDb();
  if (!db || !uid) return [];

  try {
    const coll = collection(db, SUBMISSIONS_COLLECTION);
    const q = query(coll, where('contributorUid', '==', uid));
    const snap = await getDocs(q);
    const results: SubmissionDocument[] = [];
    snap.forEach((d) => {
      results.push(d.data() as SubmissionDocument);
    });

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results;
  } catch (err) {
    console.warn(`[Firestore] Failed to fetch submissions for user ${uid}:`, err);
    return [];
  }
}

/**
 * Updates submission status and logs the action if an acting admin is provided.
 */
export async function updateSubmissionStatus(
  id: string,
  status: 'approved' | 'rejected',
  actingAdmin?: UserProfile
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const docRef = doc(db, SUBMISSIONS_COLLECTION, id);
    await setDoc(docRef, { status }, { merge: true });

    if (actingAdmin) {
      await logAdminAction({
        adminUid: actingAdmin.uid,
        adminName: actingAdmin.displayName,
        adminUsername: actingAdmin.username,
        action: status === 'approved' ? 'approve_submission' : 'reject_submission',
        targetId: id,
        details: `Updated submission ${id} status to ${status}`
      });
    }
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to update submission ${id}:`, err);
    return false;
  }
}

/**
 * Deletes a submission document from Firestore.
 */
export async function deleteSubmissionFromFirestore(
  id: string,
  actingAdmin?: UserProfile
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const docRef = doc(db, SUBMISSIONS_COLLECTION, id);
    await deleteDoc(docRef);

    if (actingAdmin) {
      await logAdminAction({
        adminUid: actingAdmin.uid,
        adminName: actingAdmin.displayName,
        adminUsername: actingAdmin.username,
        action: 'reject_submission',
        targetId: id,
        details: `Deleted submission document ${id}`
      });
    }
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to delete submission ${id}:`, err);
    return false;
  }
}

// ==============================================================================
// 2. Student Feedback (Pure Firestore)
// ==============================================================================
const FEEDBACK_COLLECTION = 'feedback';

/**
 * Saves student feedback directly to Firestore.
 */
export async function saveFeedbackToFirestore(feedback: FeedbackDocument): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const fbId = feedback.id || `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, FEEDBACK_COLLECTION, fbId);
    const payload: FeedbackDocument = {
      ...feedback,
      id: fbId,
      status: feedback.status || 'new',
      timestamp: feedback.timestamp || new Date().toISOString()
    };
    await setDoc(docRef, sanitizeFirestorePayload(payload), { merge: true });
    return fbId;
  } catch (err) {
    console.error('[Firestore] Failed to save feedback:', err);
    return null;
  }
}

/**
 * Fetches all student feedback from Firestore.
 */
export async function fetchFeedbackFromFirestore(): Promise<FeedbackDocument[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const coll = collection(db, FEEDBACK_COLLECTION);
    const snap = await getDocs(coll);
    const results: FeedbackDocument[] = [];
    snap.forEach((d) => {
      results.push(d.data() as FeedbackDocument);
    });

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results;
  } catch (err) {
    console.warn('[Firestore] Failed to fetch feedback:', err);
    return [];
  }
}

/**
 * Updates feedback status (e.g. marked as reviewed) and logs the action.
 */
export async function updateFeedbackStatus(
  id: string,
  status: 'new' | 'reviewed',
  actingAdmin?: UserProfile
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const docRef = doc(db, FEEDBACK_COLLECTION, id);
    await setDoc(docRef, { status }, { merge: true });

    if (actingAdmin) {
      await logAdminAction({
        adminUid: actingAdmin.uid,
        adminName: actingAdmin.displayName,
        adminUsername: actingAdmin.username,
        action: 'resolve_feedback',
        targetId: id,
        details: `Marked feedback ${id} as ${status}`
      });
    }
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to update feedback ${id}:`, err);
    return false;
  }
}

/**
 * Deletes a feedback document from Firestore.
 */
export async function deleteFeedbackFromFirestore(
  id: string,
  actingAdmin?: UserProfile
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const docRef = doc(db, FEEDBACK_COLLECTION, id);
    await deleteDoc(docRef);

    if (actingAdmin) {
      await logAdminAction({
        adminUid: actingAdmin.uid,
        adminName: actingAdmin.displayName,
        adminUsername: actingAdmin.username,
        action: 'delete_feedback',
        targetId: id,
        details: `Deleted feedback ${id}`
      });
    }
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to delete feedback ${id}:`, err);
    return false;
  }
}

// ==============================================================================
// 3. Admin Team Management & 25 Limit
// ==============================================================================
export const MAX_ADMIN_COUNT = 25;

/**
 * Counts current active administrators in the platform.
 */
export async function getAdminCount(): Promise<number> {
  const db = getFirestoreDb();
  if (!db) return 0;

  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const q = query(usersRef, where('role', '==', 'admin'));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (err) {
    console.warn('[Firestore] Failed to count admins:', err);
    return 0;
  }
}

/**
 * Fetches all admins and contributors.
 */
export async function fetchAdminsAndContributors(): Promise<{
  admins: UserProfile[];
  contributors: UserProfile[];
}> {
  const db = getFirestoreDb();
  if (!db) return { admins: [], contributors: [] };

  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const snap = await getDocs(query(usersRef, where('role', 'in', ['admin', 'contributor'])));
    const admins: UserProfile[] = [];
    const contributors: UserProfile[] = [];

    snap.forEach((d) => {
      const u = d.data() as UserProfile;
      if (u.role === 'admin') {
        admins.push(u);
      } else if (u.role === 'contributor') {
        contributors.push(u);
      }
    });

    admins.sort((a, b) => (b.contributionsCount || 0) - (a.contributionsCount || 0));
    contributors.sort((a, b) => (b.contributionsCount || 0) - (a.contributionsCount || 0));
    return { admins, contributors };
  } catch (err) {
    console.warn('[Firestore] Failed to fetch team:', err);
    return { admins: [], contributors: [] };
  }
}

/**
 * Searches user profile by handle (@username) or UID.
 */
export async function searchUserByUsernameOrUid(queryText: string): Promise<UserProfile | null> {
  const cleaned = queryText.trim().toLowerCase().replace(/^@/, '');
  if (!cleaned) return null;

  // First try direct UID lookup
  const byUid = await getUserProfileByUid(cleaned);
  if (byUid) return byUid;

  // Next try username lookup
  return getUserProfileByUsername(cleaned);
}

/**
 * Updates a user's role while strictly enforcing the 25-admin limit and logging the change.
 */
export async function updateUserRole(
  uid: string,
  newRole: UserRole,
  actingAdmin?: UserProfile
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) return { success: false, error: 'Database not available' };

  try {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      return { success: false, error: 'User not found' };
    }

    const targetUser = userSnap.data() as UserProfile;

    // Check 25 Admin Limit
    if (newRole === 'admin' && targetUser.role !== 'admin') {
      const currentCount = await getAdminCount();
      if (currentCount >= MAX_ADMIN_COUNT) {
        return {
          success: false,
          error: `تم الوصول للحد الأقصى للمسؤولين (${MAX_ADMIN_COUNT} مسؤولاً). يرجى خفض رتبة أحد المسؤولين الحاليين قبل إضافة مسؤول جديد.`
        };
      }
    }

    await setDoc(userDocRef, { role: newRole, updatedAt: new Date().toISOString() }, { merge: true });
    invalidateUsersCache();

    if (actingAdmin) {
      await logAdminAction({
        adminUid: actingAdmin.uid,
        adminName: actingAdmin.displayName,
        adminUsername: actingAdmin.username,
        action: newRole === 'admin' ? 'promote_admin' : 'demote_admin',
        targetId: uid,
        targetTitle: targetUser.displayName || targetUser.username,
        details: `Changed role of @${targetUser.username} to ${newRole}`
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error(`[Firestore] Failed to update role for ${uid}:`, err);
    return { success: false, error: err?.message || 'Failed to update role' };
  }
}

// ==============================================================================
// 4. Admin Activity Audit Logs
// ==============================================================================
const ADMIN_LOGS_COLLECTION = 'admin_logs';

/**
 * Records an immutable admin action log.
 */
export async function logAdminAction(
  logData: Omit<AdminLogDocument, 'id' | 'timestamp'>
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const docRef = doc(db, ADMIN_LOGS_COLLECTION, logId);
    const payload: AdminLogDocument = {
      ...logData,
      id: logId,
      timestamp: new Date().toISOString()
    };
    await setDoc(docRef, sanitizeFirestorePayload(payload));
    return true;
  } catch (err) {
    console.warn('[Firestore] Failed to record admin log:', err);
    return false;
  }
}

/**
 * Fetches recent admin activity logs for display in the dashboard.
 */
export async function fetchRecentAdminLogs(limitCount: number = 50): Promise<AdminLogDocument[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const coll = collection(db, ADMIN_LOGS_COLLECTION);
    const snap = await getDocs(query(coll, orderBy('timestamp', 'desc'), limit(Math.max(1, Math.floor(limitCount)))));
    const results: AdminLogDocument[] = [];
    snap.forEach((d) => {
      results.push(d.data() as AdminLogDocument);
    });

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results.slice(0, limitCount);
  } catch (err) {
    console.warn('[Firestore] Failed to fetch admin logs:', err);
    return [];
  }
}

// =========================================================================
// Collections & Curated Packs
// =========================================================================

/**
 * Fetches all curated collections from Cloud Firestore.
 */
export async function fetchCollectionsFromFirestore(): Promise<MaterialCollection[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const collRef = collection(db, COLLECTIONS_COLLECTION);
    const snap = await getDocs(collRef);
    const collections: MaterialCollection[] = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        collections.push({ id: docSnap.id, ...(docSnap.data() as Omit<MaterialCollection, 'id'>) });
      }
    });
    collections.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    return collections;
  } catch (err) {
    handleFirestoreError('Failed to fetch collections', err);
    return [];
  }
}

/**
 * Fetches a single curated collection by ID from Cloud Firestore.
 */
export async function fetchCollectionByIdFromFirestore(id: string): Promise<MaterialCollection | null> {
  const db = getFirestoreDb();
  if (!db || !id) return null;

  try {
    const docRef = doc(db, COLLECTIONS_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as Omit<MaterialCollection, 'id'>) };
    }
    return null;
  } catch (err) {
    handleFirestoreError(`Failed to fetch collection ${id}`, err);
    return null;
  }
}

/**
 * Creates or updates a curated collection in Cloud Firestore.
 */
export async function saveCollectionToFirestore(
  collectionData: Partial<MaterialCollection> & { id?: string }
): Promise<string> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore is not available');

  const id = collectionData.id || `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const docRef = doc(db, COLLECTIONS_COLLECTION, id);

  const cleanData: Record<string, any> = {
    ...collectionData,
    id,
    updatedAt: new Date().toISOString()
  };
  if (!cleanData.createdAt) {
    cleanData.createdAt = new Date().toISOString();
  }

  // Remove undefined fields
  Object.keys(cleanData).forEach((key) => {
    if (cleanData[key] === undefined) {
      delete cleanData[key];
    }
  });

  await setDoc(docRef, cleanData, { merge: true });
  return id;
}

/**
 * Deletes a collection from Cloud Firestore (admin-only).
 */
export async function deleteCollectionFromFirestore(id: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db || !id) throw new Error('Firestore is not available');
  await deleteDoc(doc(db, COLLECTIONS_COLLECTION, id));
}





