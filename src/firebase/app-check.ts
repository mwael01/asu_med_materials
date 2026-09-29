import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getFirebaseApp } from './config';

/**
 * reCAPTCHA Enterprise Site Key for ASU Med Materials App Check.
 */
export const RECAPTCHA_ENTERPRISE_SITE_KEY =
  import.meta.env.PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY || '';

let appCheckInstance: AppCheck | null = null;

/**
 * Initializes Firebase App Check with the reCAPTCHA Enterprise provider.
 * Automatically injects debug tokens in development mode for localhost testing.
 */
export function initAppCheck(): AppCheck | null {
  if (typeof window === 'undefined') return null;
  if (appCheckInstance) return appCheckInstance;

  // Allow completely bypassing App Check during local debugging
  if (import.meta.env.PUBLIC_DISABLE_APP_CHECK === 'true') {
    return null;
  }

  // If site key is not configured in environment, skip gracefully
  if (!RECAPTCHA_ENTERPRISE_SITE_KEY) {
    return null;
  }

  const app = getFirebaseApp();
  if (!app) return null;

  try {
    // In local development or when an App Check debug token is provided in environment:
    if (import.meta.env.DEV || import.meta.env.PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN) {
      // @ts-ignore
      self.FIREBASE_APPCHECK_DEBUG_TOKEN =
        import.meta.env.PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
    }

    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });

    return appCheckInstance;
  } catch (err: any) {
    // If already initialized or unsupported in current environment, gracefully continue
    console.warn('[AppCheck] Initialization skipped or already active:', err?.message || err);
    return null;
  }
}

/**
 * Returns current App Check instance.
 */
export function getAppCheck(): AppCheck | null {
  return appCheckInstance;
}
