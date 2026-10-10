export interface CatalogueManifest {
  version: 1;
  dataVersion: number;
  chunks: string[];
}
export interface CatalogueCacheStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { ttl?: number }): Promise<void>;
}
