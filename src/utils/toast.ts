import type { ToastOptions, ToastType } from '../types/toast';

/**
 * Dispatches a toast notification to the Toast component.
 */
export function showToast(messageOrOptions: string | ToastOptions, type: ToastType = 'info'): void {
  if (typeof window === 'undefined') return;

  const detail: ToastOptions =
    typeof messageOrOptions === 'string'
      ? { message: messageOrOptions, type }
      : messageOrOptions;

  window.dispatchEvent(new CustomEvent('show-toast', { detail }));
}
