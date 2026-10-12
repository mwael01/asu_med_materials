import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  updateProfile,
  type Auth,
  type User
} from 'firebase/auth';
import { getFirebaseApp } from './config';
import { getUserProfileByUid, upsertUserProfile, checkUsernameAvailable } from './firestore';
import type { UserProfile } from '../types/profile';
import type { AcademicYear } from '../types/materials';
import { isIosDevice, isPwaInstalledOrStandalone } from '../utils/pwa';

let authInstance: Auth | null = null;
let lastAuthenticatedUid: string | null = null;
const CACHED_PROFILE_KEY = 'asumed_cached_profile';

export function getFirebaseAuth(): Auth | null {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    authInstance = getAuth(app);
    return authInstance;
  } catch (err) {
    console.warn('[Auth] Failed to initialize Auth:', err);
    return null;
  }
}

/**
 * Reads locally cached user profile for instant offline UI rendering.
 */
export function getCachedUserProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHED_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedUserProfile(profile: UserProfile | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (profile) {
      localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(CACHED_PROFILE_KEY);
    }
  } catch {}
}

/**
 * Subscribes to Firebase Authentication state changes.
 * Profile data is served from localStorage cache to avoid duplicate Firestore reads.
 * Real-time profile sync is handled by listenToUserProfile in userSync.ts.
 */
export function onAuthChange(
  callback: (user: User | null, profile: UserProfile | null) => void
): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    // Guest mode if unconfigured
    callback(null, getCachedUserProfile());
    return () => {};
  }

  let hasFired = false;
  // Safety timeout: if onAuthStateChanged does not fire within 1500ms, emit cached state or guest
  const fallbackTimer = setTimeout(() => {
    if (!hasFired) {
      hasFired = true;
      const cached = getCachedUserProfile();
      callback(auth.currentUser, cached);
    }
  }, 1500);

  return onAuthStateChanged(
    auth,
    async (firebaseUser) => {
      try {
      if (!firebaseUser) {
        if (lastAuthenticatedUid !== null) {
          return;
        }
        if (!hasFired) {
          hasFired = true;
          clearTimeout(fallbackTimer);
          setCachedUserProfile(null);
          callback(null, null);
        }
        return;
      }

      lastAuthenticatedUid = firebaseUser.uid;

      const cached = getCachedUserProfile();
      let currentProfile: UserProfile | null = cached;

      // Instant zero-flash render from local cache if UID matches
      if (cached && cached.uid === firebaseUser.uid) {
        if (!hasFired) {
          hasFired = true;
          clearTimeout(fallbackTimer);
          callback(firebaseUser, cached);
        }
        return;
      }

      // If profile doesn't exist in Firestore yet (e.g. first Google sign in), generate initial profile
      if (!currentProfile || currentProfile.uid !== firebaseUser.uid) {
        try {
          const generatedUsername = (
            firebaseUser.displayName?.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') ||
            'student_' + firebaseUser.uid.substring(0, 5)
          );

          const available = await checkUsernameAvailable(generatedUsername, firebaseUser.uid);
          const finalUsername = available ? generatedUsername : `${generatedUsername}_${Date.now().toString(36).slice(-4)}`;

          currentProfile = {
            uid: firebaseUser.uid,
            username: finalUsername,
            displayName: firebaseUser.displayName || 'ASU Med Student',
            photoURL: firebaseUser.photoURL || undefined,
            createdAt: new Date().toISOString()
          };

          await upsertUserProfile(currentProfile);
        } catch (e) {
          console.warn('[Auth] Fallback profile generated in-memory:', e);
          currentProfile = {
            uid: firebaseUser.uid,
            username: firebaseUser.displayName?.toLowerCase().replace(/\s+/g, '_') || 'student',
            displayName: firebaseUser.displayName || 'ASU Med Student',
            photoURL: firebaseUser.photoURL || undefined,
            createdAt: new Date().toISOString()
          };
        }

        if (!hasFired) {
          hasFired = true;
          clearTimeout(fallbackTimer);
          setCachedUserProfile(currentProfile);
          callback(firebaseUser, currentProfile);
        }
      }
      } catch (outerErr) {
        if (!hasFired) {
          hasFired = true;
          clearTimeout(fallbackTimer);
          console.warn('[Auth] Error in onAuthStateChanged callback:', outerErr);
          callback(firebaseUser, getCachedUserProfile());
        }
      }
    },
    (authError) => {
      if (!hasFired) {
        hasFired = true;
        clearTimeout(fallbackTimer);
        console.warn('[Auth] onAuthStateChanged error:', authError);
        callback(null, getCachedUserProfile());
      }
    }
  );
}

/**
 * Resolves an existing profile or creates a new one for authenticated users.
 */
async function resolveOrCreateUserProfile(user: User): Promise<UserProfile> {
  let profile = await getUserProfileByUid(user.uid);
  if (!profile) {
    const rawName = user.displayName || user.email?.split('@')[0] || 'student';
    const baseUsername = rawName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const isAvail = await checkUsernameAvailable(baseUsername, user.uid);
    const username = isAvail ? baseUsername : `${baseUsername}_${Math.random().toString(36).substring(2, 6)}`;

    profile = {
      uid: user.uid,
      username,
      hasCustomUsername: false, // User can customize and finalize their username once
      displayName: user.displayName || rawName,
      photoURL: user.photoURL || undefined,
      createdAt: new Date().toISOString()
    };

    await upsertUserProfile(profile);
  }
  return profile;
}

/**
 * Checks for pending redirect sign-in result (critical for Apple Safari, WebKit, and iOS PWAs).
 */
export async function checkRedirectAuthResult(): Promise<{ user: User; profile: UserProfile } | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;

  try {
    const result = await getRedirectResult(auth);
    if (!result || !result.user) return null;

    const user = result.user;
    const profile = await resolveOrCreateUserProfile(user);
    setCachedUserProfile(profile);
    return { user, profile };
  } catch (err: any) {
    console.warn('[Auth] Redirect auth check warning:', err?.message || err);
    return null;
  }
}

/**
 * Sign in with Google.
 * Supports popup on standard desktop browsers with automatic redirect fallback for
 * Apple Safari / WebKit when popups are blocked, and direct redirect in iOS standalone PWAs.
 */
export async function signInWithGoogle(): Promise<{ user: User; profile: UserProfile } | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth is not configured');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  // On iOS standalone PWA, popup window.open escapes into external Safari and loses session context.
  // Use redirect directly so the WebClip sandbox retains the credentials.
  if (isIosDevice() && isPwaInstalledOrStandalone()) {
    await signInWithRedirect(auth, provider);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const profile = await resolveOrCreateUserProfile(user);
    setCachedUserProfile(profile);
    return { user, profile };
  } catch (popupErr: any) {
    // If Apple Safari / browser policy blocks popups, gracefully fall back to redirect
    if (
      popupErr?.code === 'auth/popup-blocked' ||
      popupErr?.code === 'auth/cancelled-popup-request' ||
      popupErr?.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      console.warn('[Auth] Popup blocked by browser policy, falling back to redirect authentication...');
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw popupErr;
  }
}

/**
 * Sign in with Email and Password.
 */
export async function signInWithEmail(
  email: string,
  pass: string
): Promise<{ user: User; profile: UserProfile | null }> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth is not configured');
  }

  const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
  const profile = await getUserProfileByUid(result.user.uid);
  if (profile) setCachedUserProfile(profile);
  return { user: result.user, profile };
}

/**
 * Register with Email and Password, creating profile.
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  displayName: string,
  username: string,
  academicYear?: AcademicYear
): Promise<{ user: User; profile: UserProfile }> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth is not configured');
  }

  const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
  if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 25) {
    throw new Error('يجب أن يتكون اسم المستخدم من 3 إلى 25 حرفاً أو رقماً');
  }
  if (!/^[a-z0-9_-]+$/.test(cleanUsername)) {
    throw new Error('يسمح فقط بالأحرف الإنجليزية والأرقام والشرطة _ أو -');
  }

  const isAvailable = await checkUsernameAvailable(cleanUsername);
  if (!isAvailable) {
    throw new Error('اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر');
  }

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  const user = cred.user;

  // Update Firebase Auth profile
  await updateProfile(user, { displayName: displayName.trim() });

  const profile: UserProfile = {
    uid: user.uid,
    username: cleanUsername,
    hasCustomUsername: true, // Email signups explicitly chose their permanent username
    displayName: displayName.trim(),
    academicYear,
    createdAt: new Date().toISOString()
  };

  await upsertUserProfile(profile);
  setCachedUserProfile(profile);
  return { user, profile };
}

/**
 * Sets a permanent, immutable custom username for the user.
 * Once set, it cannot be changed.
 */
export async function setPermanentUsername(
  uid: string,
  desiredUsername: string
): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
  const clean = desiredUsername.trim().toLowerCase().replace(/^@/, '');

  if (!clean || clean.length < 3 || clean.length > 25) {
    return { success: false, error: 'يجب أن يتكون اسم المستخدم من 3 إلى 25 حرفاً أو رقماً' };
  }

  if (!/^[a-z0-9_-]+$/.test(clean)) {
    return { success: false, error: 'يسمح فقط بالأحرف الإنجليزية والأرقام والشرطة _ أو -' };
  }

  const isAvailable = await checkUsernameAvailable(clean, uid);
  if (!isAvailable) {
    return { success: false, error: 'اسم المستخدم مأخوذ بالفعل، يرجى اختيار اسم آخر' };
  }

  const currentProfile = await getUserProfileByUid(uid);
  if (!currentProfile) {
    return { success: false, error: 'تعذر العثور على بيانات المستخدم' };
  }

  if (currentProfile.hasCustomUsername) {
    return { success: false, error: 'تم تعيين اسم المستخدم الخاص بك مسبقاً ولا يمكن تغييره' };
  }

  const updatedProfile: UserProfile = {
    ...currentProfile,
    username: clean,
    hasCustomUsername: true,
    updatedAt: new Date().toISOString()
  };

  const saved = await upsertUserProfile(updatedProfile);
  if (saved) {
    setCachedUserProfile(updatedProfile);
    return { success: true, profile: updatedProfile };
  } else {
    return { success: false, error: 'تعذر حفظ اسم المستخدم في قاعدة البيانات' };
  }
}

/**
 * Sign out current user.
 */
export async function signOutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  setCachedUserProfile(null);
  if (auth) {
    await signOut(auth);
  }
}
