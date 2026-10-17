import type { MaterialItem, ResourceType, AcademicYear } from '../types/materials';
import {
  createSearchDocument,
  scoreSearchDocument,
  tokenizeQuery,
  type SearchDocument
} from './search';
import { getClientMaterials } from './catalogueClient';
import { isEmbeddableDocument, getDocumentViewerPath } from './documentViewer';

export interface SearchSuggestionItem {
  id: string;
  title: string;
  titleEn?: string;
  type: ResourceType;
  year: AcademicYear;
  subject?: string;
  author?: string;
  isPlaylist: boolean;
  videoCount?: number;
  url: string;
  target: '_self' | '_blank';
}

export interface SearchSuggestionsResult {
  query: string;
  totalMatches: number;
  videosAndPlaylists: SearchSuggestionItem[];
  otherMaterials: SearchSuggestionItem[];
}

let cachedDocs: SearchDocument[] | null = null;
let cachedMaterials: MaterialItem[] | null = null;
let cachedMaterialsLength = 0;
let indexingPromise: Promise<{ docs: SearchDocument[]; materials: MaterialItem[] }> | null = null;

/**
 * Lazily loads client materials and pre-computes search documents in memory.
 * Reuses in-memory structures across queries for instant, lag-free suggestions.
 */
export async function getOrBuildSearchIndex(): Promise<{ docs: SearchDocument[]; materials: MaterialItem[] }> {
  if (cachedDocs && cachedMaterials && cachedDocs.length === cachedMaterialsLength) {
    return { docs: cachedDocs, materials: cachedMaterials };
  }

  if (indexingPromise) {
    return indexingPromise;
  }

  const p = (async () => {
    const materials = await getClientMaterials();
    const docs = materials.map((m) => createSearchDocument(m));
    cachedDocs = docs;
    cachedMaterials = materials;
    cachedMaterialsLength = materials.length;
    return { docs, materials };
  })().finally(() => {
    indexingPromise = null;
  });

  indexingPromise = p;
  return p;
}

/**
 * Pre-warms the materials index in the background (e.g. on input focus or pointer enter)
 * so that subsequent keystrokes encounter zero network latency.
 */
export function prefetchSearchIndex(): void {
  void getOrBuildSearchIndex();
}

/**
 * Resolves link destination and target for a given suggestion item.
 */
function resolveItemLink(material: MaterialItem, isPlaylist: boolean): { url: string; target: '_self' | '_blank' } {
  if (isPlaylist) {
    return { url: `/playlist/${material.id}`, target: '_self' };
  }
  if (isEmbeddableDocument(material.url)) {
    return { url: getDocumentViewerPath(material.id), target: '_self' };
  }
  const isInternal =
    material.type === 'flashcards' ||
    Boolean(material.flashcardDeckId) ||
    (Boolean(material.url) && material.url.startsWith('/'));

  return {
    url: material.url || `/search?q=${encodeURIComponent(material.title)}`,
    target: isInternal ? '_self' : '_blank'
  };
}

/**
 * Computes realtime search suggestions with separated categories for video playlists and materials.
 */
export async function getSearchSuggestions(
  rawQuery: string,
  maxPerGroup: number = 4
): Promise<SearchSuggestionsResult> {
  const query = (rawQuery || '').trim();
  const tokens = tokenizeQuery(query);

  if (!query || tokens.length === 0) {
    return {
      query,
      totalMatches: 0,
      videosAndPlaylists: [],
      otherMaterials: []
    };
  }

  const { docs, materials } = await getOrBuildSearchIndex();
  const materialMap = new Map<string, MaterialItem>();
  for (let i = 0; i < materials.length; i++) {
    materialMap.set(materials[i].id, materials[i]);
  }

  interface ScoredMatch {
    doc: SearchDocument;
    material: MaterialItem;
    score: number;
    isPlaylist: boolean;
    isVideo: boolean;
  }

  const matches: ScoredMatch[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const score = scoreSearchDocument(doc, query, tokens);
    if (score <= 0) continue;

    const material = materialMap.get(doc.id);
    if (!material) continue;

    const isPlaylist =
      doc.type === 'playlist' ||
      Boolean(material.playlistId) ||
      Boolean(material.videos && material.videos.length > 0);
    const isVideo = doc.type === 'youtube' || isPlaylist;

    matches.push({ doc, material, score, isPlaylist, isVideo });
  }

  // Sort descending by relevance score
  matches.sort((a, b) => b.score - a.score);

  const videosAndPlaylists: SearchSuggestionItem[] = [];
  const otherMaterials: SearchSuggestionItem[] = [];

  for (let i = 0; i < matches.length; i++) {
    const { material, isPlaylist, isVideo } = matches[i];
    const { url, target } = resolveItemLink(material, isPlaylist);

    const rawAuthor = Array.isArray(material.author)
      ? material.author[0]
      : (material.author || '');

    const item: SearchSuggestionItem = {
      id: material.id,
      title: material.title,
      titleEn: material.titleEn,
      type: material.type,
      year: material.year,
      subject: material.subject,
      author: rawAuthor || undefined,
      isPlaylist,
      videoCount: material.videos?.length || undefined,
      url,
      target
    };

    if (isVideo && videosAndPlaylists.length < maxPerGroup) {
      videosAndPlaylists.push(item);
    } else if (!isVideo && otherMaterials.length < maxPerGroup) {
      otherMaterials.push(item);
    }

    if (videosAndPlaylists.length >= maxPerGroup && otherMaterials.length >= maxPerGroup) {
      break;
    }
  }

  return {
    query,
    totalMatches: matches.length,
    videosAndPlaylists,
    otherMaterials
  };
}
