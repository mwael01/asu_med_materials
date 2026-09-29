export interface FirestoreErrorInfo {
  message: string;
  code?: string;
  timestamp: number;
}

let lastError: FirestoreErrorInfo | null = null;
const errorListeners: Set<(error: FirestoreErrorInfo | null) => void> = new Set();

export function setFirestoreError(error: FirestoreErrorInfo | null): void {
  lastError = error;
  errorListeners.forEach((listener) => listener(error));
}

export function getFirestoreError(): FirestoreErrorInfo | null {
  return lastError;
}

export function clearFirestoreError(): void {
  setFirestoreError(null);
}

export function onFirestoreError(listener: (error: FirestoreErrorInfo | null) => void): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

export function handleFirestoreError(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : 'An unknown error occurred';
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : undefined;
  setFirestoreError({ message, code, timestamp: Date.now() });
  console.warn(`[Firestore] ${context}:`, err);
}
