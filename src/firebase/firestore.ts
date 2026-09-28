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
  updateDoc,
  deleteDoc,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  query,
  where,
  type Firestore
} from 'firebase/firestore';
import { getFirebaseApp } from './config';
import type { MaterialItem, AcademicYear, ModuleInfo } from '../types/materials';
import type { UserProfile, UserRole } from '../types/profile';
import type {
  ContributorDocument,
  SubmissionDocument,
  FeedbackDocument,
  AdminLogDocument
} from './schema';
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
 * Atomically increments or decrements the bookmark/love counter for a material in Firestore.
 */
export async function incrementMaterialBookmarkCount(materialId: string, delta: 1 | -1): Promise<number> {
  const db = getFirestoreDb();
  if (!db || !materialId) return 0;

  try {
    const matRef = doc(db, MATERIALS_COLLECTION, materialId);
    await updateDoc(matRef, {
      bookmarksCount: increment(delta)
    });
    return delta;
  } catch {
    try {
      const matRef = doc(db, MATERIALS_COLLECTION, materialId);
      const snap = await getDoc(matRef);
      if (snap.exists()) {
        const cur = (snap.data()?.bookmarksCount as number) || 0;
        const next = Math.max(0, cur + delta);
        await setDoc(matRef, { bookmarksCount: next }, { merge: true });
        return next;
      }
    } catch (innerErr) {
      console.warn(`[Firestore] Failed to update bookmark count for material ${materialId}:`, innerErr);
    }
    return 0;
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
    await setDoc(userDocRef, updatePayload, { merge: true });
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
      timestamp: sub.timestamp || new Date().toISOString(),
      status: sub.status || 'pending'
    };
    await setDoc(docRef, payload, { merge: true });
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
    await setDoc(docRef, payload, { merge: true });
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
    const snap = await getDocs(q);
    return snap.size;
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
    const snap = await getDocs(usersRef);
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
    await setDoc(docRef, payload);
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
    const snap = await getDocs(coll);
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



