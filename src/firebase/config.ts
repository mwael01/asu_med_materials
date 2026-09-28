import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

/**
 * Client-facing Firebase configuration.
 * All client variables must use the Astro PUBLIC_ prefix.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID || '',
};

/**
 * Checks whether Firebase configuration variables are provided in the environment.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

let appInstance: FirebaseApp | null = null;
let analyticsInstance: Analytics | null = null;

/**
 * Returns the initialized FirebaseApp instance.
 * Gracefully handles unconfigured environments without crashing.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') {
    // Server-side / Build-time check
    if (!isFirebaseConfigured()) return null;
    return getApps().length ? getApp() : initializeApp(firebaseConfig);
  }

  if (appInstance) return appInstance;

  if (getApps().length > 0) {
    appInstance = getApp();
    return appInstance;
  }

  if (!isFirebaseConfigured()) {
    console.warn(
      '[Firebase] Configuration missing or incomplete. Operating in offline/guest-fallback mode.'
    );
    return null;
  }

  try {
    appInstance = initializeApp(firebaseConfig);
    // Initialize analytics asynchronously if supported in browser
    getFirebaseAnalytics().catch(() => {});
    return appInstance;
  } catch (err) {
    console.error('[Firebase] Failed to initialize Firebase App:', err);
    return null;
  }
}

/**
 * Returns Firebase Analytics instance when supported in the browser.
 */
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null;
  if (analyticsInstance) return analyticsInstance;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(app);
      return analyticsInstance;
    }
  } catch (err) {
    console.warn('[Firebase] Analytics not supported in this environment:', err);
  }
  return null;
}
