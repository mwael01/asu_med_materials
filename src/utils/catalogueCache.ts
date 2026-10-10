import { randomUUID } from 'node:crypto';
import type { CatalogueCacheStore, CatalogueManifest } from '../types/catalogueCache';

const CHUNK_BYTES = 900_000;

/** In-memory cache store for local runtime and development environments */
export function createMemoryCacheStore(): CatalogueCacheStore {
  const store = new Map<string, unknown>();
  return {
    async get(key: string): Promise<unknown> {
      return store.get(key);
    },
    async set(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    }
  };
}

function isManifest(value: unknown, expectedVersion?: number): value is CatalogueManifest {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CatalogueManifest>;
  const hasValidStructure = entry.version === 1
    && typeof entry.dataVersion === 'number'
    && Array.isArray(entry.chunks)
    && entry.chunks.length > 0
    && entry.chunks.every((key) => typeof key === 'string');
  if (!hasValidStructure) return false;
  if (typeof expectedVersion === 'number') {
    return entry.dataVersion === expectedVersion;
  }
  return true;
}

/** Server-only cache adapter; serves snapshot when version matches, otherwise refreshes from origin. */
export async function loadCachedCatalogue<T>(
  cache: CatalogueCacheStore,
  key: string,
  fetchOrigin: () => Promise<T[]>,
  isItem: (value: unknown) => value is T,
  currentVersion: number = 1
): Promise<T[]> {
  try {
    const manifest = await cache.get(key);
    if (isManifest(manifest, currentVersion)) {
      const chunks = await Promise.all(manifest.chunks.map((chunk) => cache.get(chunk)));
      if (chunks.every((chunk) => Array.isArray(chunk) && chunk.every(isItem))) {
        return (chunks as T[][]).flat();
      }
    }
  } catch (error) {
    console.warn('[Catalogue cache] Read failed:', error instanceof Error ? error.message : 'Unknown error');
  }

  // Origin errors propagate. Never persist a failed fetch as an empty catalogue.
  const items = await fetchOrigin();
  try {
    const chunks: T[][] = [];
    let current: T[] = [];
    let bytes = 2;
    for (const item of items) {
      const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8') + 1;
      if (itemBytes > CHUNK_BYTES) throw new Error('Catalogue item exceeds cache chunk limit');
      if (bytes + itemBytes > CHUNK_BYTES) {
        chunks.push(current);
        current = [];
        bytes = 2;
      }
      current.push(item);
      bytes += itemBytes;
    }
    chunks.push(current);
    const generation = randomUUID();
    const keys = chunks.map((_, index) => `${key}:${generation}:${index}`);
    await Promise.all(chunks.map((chunk, index) => cache.set(keys[index]!, chunk, { ttl: 31_536_000 })));
    const manifest: CatalogueManifest = { version: 1, dataVersion: currentVersion, chunks: keys };
    await cache.set(key, manifest, { ttl: 31_536_000 });
    console.info(`[Catalogue cache] Filled snapshot for ${key} (version ${currentVersion}, ${items.length} records)`);
  } catch (error) {
    console.warn('[Catalogue cache] Write failed:', error instanceof Error ? error.message : 'Unknown error');
  }
  return items;
}
