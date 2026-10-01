import { getCache } from '@vercel/functions';
import { firebaseConfig } from '../firebase/config';
import { fetchMaterialsFromFirestore, fetchModulesFromFirestore } from '../firebase/firestore';
import type { MaterialItem, ModuleInfo } from '../types/materials';
import { loadCachedCatalogue } from '../utils/catalogueCache';
import { createTimedLoader } from '../utils/timedLoader';

const namespace = `asumed:${process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME || 'website'}:${firebaseConfig.projectId}:catalogue-v1`;
const isMaterial = (value: unknown): value is MaterialItem => Boolean(value && typeof value === 'object'
  && typeof (value as MaterialItem).id === 'string' && typeof (value as MaterialItem).title === 'string'
  && typeof (value as MaterialItem).url === 'string');
const isModule = (value: unknown): value is ModuleInfo => Boolean(value && typeof value === 'object'
  && typeof (value as ModuleInfo).id === 'string' && Array.isArray((value as ModuleInfo).subjects));

// Short local reuse deduplicates concurrent requests and cache-outage fallbacks.
export const getPublicMaterials = createTimedLoader(() => {
  const origin = () => fetchMaterialsFromFirestore(undefined, true);
  return process.env.VERCEL === '1'
    ? loadCachedCatalogue(getCache({ namespace }), 'materials', origin, isMaterial)
    : origin();
});
export const getPublicModules = createTimedLoader(() => {
  const origin = () => fetchModulesFromFirestore(undefined, true);
  return process.env.VERCEL === '1'
    ? loadCachedCatalogue(getCache({ namespace }), 'modules', origin, isModule)
    : origin();
});
