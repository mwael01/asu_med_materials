import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
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

let authInstance: Auth | null = null;
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

  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      setCachedUserProfile(null);
      callback(null, null);
      return;
    }

    // Try reading cached profile first, then sync with Firestore
    let profile = getCachedUserProfile();
    if (!profile || profile.uid !== firebaseUser.uid) {
      profile = await getUserProfileByUid(firebaseUser.uid);
    }

    // If profile doesn't exist in Firestore yet (e.g. first Google sign in), generate initial profile
    if (!profile) {
      const generatedUsername = (
        firebaseUser.displayName?.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') ||
        'student_' + firebaseUser.uid.substring(0, 5)
      );

      const available = await checkUsernameAvailable(generatedUsername, firebaseUser.uid);
      const finalUsername = available ? generatedUsername : `${generatedUsername}_${Date.now().toString(36).slice(-4)}`;

      profile = {
        uid: firebaseUser.uid,
        username: finalUsername,
        displayName: firebaseUser.displayName || 'ASU Med Student',
        photoURL: firebaseUser.photoURL || undefined,
        createdAt: new Date().toISOString()
      };

      await upsertUserProfile(profile);
    }

    setCachedUserProfile(profile);
    callback(firebaseUser, profile);
  });
}

/**
 * Sign in with Google Popup.
 */
export async function signInWithGoogle(): Promise<{ user: User; profile: UserProfile } | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth is not configured');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  let profile = await getUserProfileByUid(user.uid);
  if (!profile) {
    const rawName = user.displayName || user.email?.split('@')[0] || 'student';
    const baseUsername = rawName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const isAvail = await checkUsernameAvailable(baseUsername, user.uid);
    const username = isAvail ? baseUsername : `${baseUsername}_${Math.random().toString(36).substring(2, 6)}`;

    profile = {
      uid: user.uid,
      username,
      displayName: user.displayName || rawName,
      photoURL: user.photoURL || undefined,
      createdAt: new Date().toISOString()
    };

    await upsertUserProfile(profile);
  }

  setCachedUserProfile(profile);
  return { user, profile };
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
  const isAvailable = await checkUsernameAvailable(cleanUsername);
  if (!isAvailable) {
    throw new Error('اسم المستخدم مستخدم بالفعل أو غير صالح');
  }

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  const user = cred.user;

  // Update Firebase Auth profile
  await updateProfile(user, { displayName: displayName.trim() });

  const profile: UserProfile = {
    uid: user.uid,
    username: cleanUsername,
    displayName: displayName.trim(),
    academicYear,
    createdAt: new Date().toISOString()
  };

  await upsertUserProfile(profile);
  setCachedUserProfile(profile);
  return { user, profile };
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
