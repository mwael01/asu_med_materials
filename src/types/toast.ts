export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'pwa';

export interface ToastAction {
  label: string;
  onClick?: () => void;
  primary?: boolean;
}

export interface ToastOptions {
  id?: string;
  title?: string;
  message: string;
  type?: ToastType;
  duration?: number; // 0 for persistent until dismissed
  action?: ToastAction;
  dismissible?: boolean;
}
