/**
 * Utilities for PWA detection, standalone display mode, and service worker registration.
 */

/**
 * Checks whether the website is currently running as an installed PWA or standalone web app.
 * If true, install prompts or download banners must NEVER be shown.
 */
export function isPwaInstalledOrStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Standard CSS media query for standalone / fullscreen / minimal-ui display mode
  const isDisplayStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches;

  // 2. iOS Safari standalone boolean
  const isIosStandalone = Boolean((window.navigator as any).standalone);

  // 3. Android TWA / app referrer
  const isAndroidApp = typeof document !== 'undefined' && document.referrer.startsWith('android-app://');

  // 4. Saved installation marker in localStorage
  let isLocalInstalled = false;
  try {
    isLocalInstalled = localStorage.getItem('asumed_pwa_installed') === 'true';
  } catch {}

  return isDisplayStandalone || isIosStandalone || isAndroidApp || isLocalInstalled;
}

/**
 * Detects if the current browser is running on Apple iOS.
 */
export function isIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return (isIos || isIpadOs) && !(window as any).MSStream;
}

/**
 * Registers the service worker for PWA caching and installability.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Check for service worker updates
        reg.update();

        // Listen for new service worker installation
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available, notify the app
              window.dispatchEvent(new CustomEvent('sw-update-available'));
            }
          });
        });

        // Listen for messages from the service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SKIP_WAITING') {
            window.location.reload();
          }
        });
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register);
  }
}
