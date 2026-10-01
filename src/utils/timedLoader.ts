/** Runtime-only cache of Firestore results; no local catalogue files or snapshots. */
export function createTimedLoader<T>(load: () => Promise<T>, ttlMs = 60_000): () => Promise<T> {
  let cached: { value: T; expiresAt: number } | undefined;
  let pending: Promise<T> | undefined;

  return () => {
    if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.value);
    if (pending) return pending;
    pending = load().then((value) => {
      cached = { value, expiresAt: Date.now() + ttlMs };
      return value;
    }).finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
