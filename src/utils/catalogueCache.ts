import { randomUUID } from 'node:crypto';
import type { CatalogueCacheStore, CatalogueManifest } from '../types/catalogueCache';

export const CATALOGUE_TTL_SECONDS = 86_400;
const CHUNK_BYTES = 900_000;

function isManifest(value: unknown): value is CatalogueManifest {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CatalogueManifest>;
  return entry.version === 1 && typeof entry.expiresAt === 'number'
    && entry.expiresAt > Date.now() && Array.isArray(entry.chunks)
    && entry.chunks.length > 0 && entry.chunks.every((key) => typeof key === 'string');
}

/** Server-only cache adapter; publish a generation only after every chunk is stored. */
export async function loadCachedCatalogue<T>(
  cache: CatalogueCacheStore,
  key: string,
  fetchOrigin: () => Promise<T[]>,
  isItem: (value: unknown) => value is T,
): Promise<T[]> {
  try {
    const manifest = await cache.get(key);
    if (isManifest(manifest)) {
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
    const expiresAt = Date.now() + CATALOGUE_TTL_SECONDS * 1000;
    await Promise.all(chunks.map((chunk, index) => cache.set(keys[index]!, chunk, { ttl: CATALOGUE_TTL_SECONDS + 60 })));
    const manifest: CatalogueManifest = { version: 1, expiresAt, chunks: keys };
    await cache.set(key, manifest, { ttl: CATALOGUE_TTL_SECONDS });
    console.info(`[Catalogue cache] Filled ${key} (${items.length} records)`);
  } catch (error) {
    console.warn('[Catalogue cache] Write failed:', error instanceof Error ? error.message : 'Unknown error');
  }
  return items;
}
