import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  type Firestore
} from 'firebase/firestore';
import { getFirebaseApp } from './config';
import type { MaterialItem, AcademicYear, ModuleInfo } from '../types/materials';
import type { UserProfile } from '../types/profile';
import type { ContributorDocument } from './schema';
import type { AuthorEntry, ContributorProfile } from '../types/contributors';

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

// Collections
const MATERIALS_COLLECTION = 'materials';
const USERS_COLLECTION = 'users';

/**
 * Fetches all study materials from Firestore (or IndexedDB cache when offline).
 */
export async function fetchMaterialsFromFirestore(year?: AcademicYear): Promise<MaterialItem[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const materialsRef = collection(db, MATERIALS_COLLECTION);
    const q = year
      ? query(materialsRef, where('year', '==', year))
      : query(materialsRef);

    const snapshot = await getDocs(q);
    const results: MaterialItem[] = [];
    snapshot.forEach((docSnap) => {
      results.push(docSnap.data() as MaterialItem);
    });
    return results;
  } catch (err) {
    console.warn('[Firestore] Failed to fetch materials, falling back:', err);
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
    await setDoc(docRef, material, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firestore] Failed to save material:', err);
    return false;
  }
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
    console.warn(`[Firestore] Failed to get user profile ${uid}:`, err);
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
    const payload = {
      ...profile,
      username: profile.username.trim().toLowerCase().replace(/^@/, ''),
      updatedAt: new Date().toISOString()
    };
    await setDoc(userDocRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.error('[Firestore] Failed to save user profile:', err);
    return false;
  }
}

/**
 * Retrieves all materials contributed by a given user (by handle or UID).
 */
export async function getUserContributions(usernameOrUid: string): Promise<MaterialItem[]> {
  const db = getFirestoreDb();
  const target = usernameOrUid.trim().toLowerCase().replace(/^@/, '');
  if (!target) return [];

  if (!db) return [];

  try {
    const materialsRef = collection(db, MATERIALS_COLLECTION);
    // Fetch materials and filter in-memory for flexible match across author/addedBy array
    const snapshot = await getDocs(materialsRef);
    const contributions: MaterialItem[] = [];

    snapshot.forEach((snap) => {
      const mat = snap.data() as MaterialItem;
      const addedByArr = Array.isArray(mat.addedBy)
        ? mat.addedBy
        : mat.addedBy
          ? [mat.addedBy]
          : [];

      const matches = addedByArr.some((c) => {
        const norm = c.toLowerCase().trim().replace(/^@/, '');
        return norm === target || norm.includes(target);
      });

      if (matches) {
        contributions.push(mat);
      }
    });

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
export async function fetchModulesFromFirestore(year?: AcademicYear): Promise<ModuleInfo[]> {
  const db = getFirestoreDb();
  if (!db) return [];

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
    await setDoc(docRef, mod, { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to save module ${mod.id}:`, err);
    return false;
  }
}

const CONTRIBUTORS_COLLECTION = 'contributors';

/**
 * Fetches all platform authors and contributor profiles from Firestore.
 */
export async function fetchContributorsFromFirestore(): Promise<{
  authors: AuthorEntry[];
  contributorProfiles: ContributorProfile[];
}> {
  const db = getFirestoreDb();
  if (!db) return { authors: [], contributorProfiles: [] };

  try {
    const contribRef = collection(db, CONTRIBUTORS_COLLECTION);
    const snapshot = await getDocs(contribRef);
    const authors: AuthorEntry[] = [];
    const contributorProfiles: ContributorProfile[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as ContributorDocument;
      if (data.kind === 'author') {
        authors.push({
          id: data.id || docSnap.id,
          name: data.name,
          role: data.role || '',
          roleAr: data.roleAr,
          bio: data.bio,
          bioEn: data.bioEn,
          photo: data.photo,
          order: data.order ?? 99,
          badge: data.badge,
          matchNames: data.matchNames || [],
          contacts: data.contacts,
        });
      } else {
        contributorProfiles.push({
          id: data.id || docSnap.id,
          name: data.name,
          photo: data.photo,
          note: data.note,
          noteEn: data.noteEn,
          year: data.year,
          matchNames: data.matchNames || [],
          contacts: data.contacts,
        });
      }
    });

    authors.sort((a, b) => a.order - b.order);
    return { authors, contributorProfiles };
  } catch (err) {
    console.warn('[Firestore] Failed to fetch contributors, falling back:', err);
    return { authors: [], contributorProfiles: [] };
  }
}

/**
 * Saves or updates a contributor document in Firestore.
 */
export async function saveContributorToFirestore(contributor: ContributorDocument): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const docRef = doc(db, CONTRIBUTORS_COLLECTION, contributor.id);
    await setDoc(docRef, contributor, { merge: true });
    return true;
  } catch (err) {
    console.error(`[Firestore] Failed to save contributor ${contributor.id}:`, err);
    return false;
  }
}


