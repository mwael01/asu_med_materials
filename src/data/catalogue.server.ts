import { getCache } from '@vercel/functions';
import { firebaseConfig } from '../firebase/config';
import {
  fetchMaterialsFromFirestore,
  fetchModulesFromFirestore,
  getMaterialsVersionFromFirestore
} from '../firebase/firestore';
import { fetchLessonsFromFirestore } from '../firebase/lessons';
import { fetchMaterialLessonLinks } from '../firebase/materialLessonLinks';
import type { MaterialLessonLink } from '../types/materialLessonLinks';
import { attachLessonLinks } from '../utils/materialLessonLinks';
import type { Lesson } from '../types/lessons';
import type { MaterialItem, ModuleInfo } from '../types/materials';
import { loadCachedCatalogue, createMemoryCacheStore } from '../utils/catalogueCache';
import { createTimedLoader } from '../utils/timedLoader';

const namespace = `asumed:${process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME || 'website'}:${firebaseConfig.projectId}:catalogue-v2`;

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
export const getPublicMaterials = async (version?: number): Promise<MaterialItem[]> => {
  const currentVersion = version ?? (await getMaterialsVersionFromFirestore());
  const [materials, links] = await Promise.all([
    internalMaterialsLoader(currentVersion),
    internalLessonLinksLoader(currentVersion)
  ]);
  return attachLessonLinks(materials, links);
};

const loadModulesSnapshot = (version: number) => {
  const origin = () => fetchModulesFromFirestore(undefined, true);
  return loadCachedCatalogue(getActiveCacheStore(), 'modules', origin, isModule, version);
};

const internalModulesLoader = createTimedLoader((version?: number) =>
  loadModulesSnapshot(version || 1)
);

export const getPublicModules = async (version?: number): Promise<ModuleInfo[]> => {
  const currentVersion = version ?? (await getMaterialsVersionFromFirestore());
  return internalModulesLoader(currentVersion);
};

const isLesson = (value: unknown): value is Lesson => Boolean(value && typeof value === 'object' &&
  typeof (value as Lesson).id === 'string' && typeof (value as Lesson).moduleId === 'string' &&
  typeof (value as Lesson).subject === 'string');
const internalLessonsLoader = createTimedLoader((version?: number) =>
  loadCachedCatalogue(getActiveCacheStore(), 'lessons', () => fetchLessonsFromFirestore(true), isLesson, version || 1));
export const getPublicLessons = async (version?: number): Promise<Lesson[]> => {
  const currentVersion = version ?? (await getMaterialsVersionFromFirestore());
  return internalLessonsLoader(currentVersion);
};

const isLessonLink = (value: unknown): value is MaterialLessonLink => Boolean(value && typeof value === 'object' &&
  typeof (value as MaterialLessonLink).materialId === 'string' && typeof (value as MaterialLessonLink).lessonId === 'string' &&
  typeof (value as MaterialLessonLink).moduleId === 'string');
const internalLessonLinksLoader = createTimedLoader((version?: number) =>
  loadCachedCatalogue(getActiveCacheStore(), 'material_lesson_links', () => fetchMaterialLessonLinks(true), isLessonLink, version || 1));
