/**
 * Single-flight deduplicating loader with version tracking.
 * Eliminates fixed time-based expiration and protects against concurrent thundering-herd calls.
 */
export function createTimedLoader<T>(load: () => Promise<T>): (version?: number) => Promise<T> {
  let cached: { value: T; version?: number } | undefined;
  let pending: Promise<T> | undefined;

  return (version?: number) => {
    // If cached value exists and the version matches, return immediately without re-fetching
    if (cached && (version === undefined || cached.version === version)) {
      return Promise.resolve(cached.value);
    }
    // Single-flight lock: reuse active in-flight Promise for concurrent calls
    if (pending) return pending;

    pending = load()
      .then((value) => {
        cached = { value, version };
        return value;
      })
      .finally(() => {
        pending = undefined;
      });

    return pending;
  };
}
