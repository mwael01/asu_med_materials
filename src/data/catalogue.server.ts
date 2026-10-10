import { getCache } from '@vercel/functions';
import { firebaseConfig } from '../firebase/config';
import {
  fetchMaterialsFromFirestore,
  fetchModulesFromFirestore,
  getMaterialsVersionFromFirestore
} from '../firebase/firestore';
import type { MaterialItem, ModuleInfo } from '../types/materials';
import { loadCachedCatalogue, createMemoryCacheStore } from '../utils/catalogueCache';
import { createTimedLoader } from '../utils/timedLoader';

const namespace = `asumed:${process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME || 'website'}:${firebaseConfig.projectId}:catalogue-v1`;

const isMaterial = (value: unknown): value is MaterialItem =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as MaterialItem).id === 'string' &&
      typeof (value as MaterialItem).title === 'string' &&
      typeof (value as MaterialItem).url === 'string'
  );

const isModule = (value: unknown): value is ModuleInfo =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as ModuleInfo).id === 'string' &&
      Array.isArray((value as ModuleInfo).subjects)
  );

const localCacheStore = createMemoryCacheStore();
const getActiveCacheStore = () =>
  process.env.VERCEL === '1' ? getCache({ namespace }) : localCacheStore;

const loadMaterialsSnapshot = (version: number) => {
  const origin = () => fetchMaterialsFromFirestore(undefined, true);
  return loadCachedCatalogue(getActiveCacheStore(), 'materials', origin, isMaterial, version);
};

const internalMaterialsLoader = createTimedLoader((version?: number) =>
  loadMaterialsSnapshot(version || 1)
);

/**
 * Version-driven materials loader.
 * Checks /materials_version/current from Firestore; if the stored cache snapshot
 * matches this version, serves from cache without materials collection reads.
 */
export const getPublicMaterials = async (): Promise<MaterialItem[]> => {
  const currentVersion = await getMaterialsVersionFromFirestore();
  return internalMaterialsLoader(currentVersion);
};

const loadModulesSnapshot = () => {
  const origin = () => fetchModulesFromFirestore(undefined, true);
  return loadCachedCatalogue(getActiveCacheStore(), 'modules', origin, isModule, 1);
};

const internalModulesLoader = createTimedLoader(() => loadModulesSnapshot());

export const getPublicModules = async (): Promise<ModuleInfo[]> => {
  return internalModulesLoader();
};
