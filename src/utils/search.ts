import type { MaterialItem, AcademicYear, ResourceType } from '../types/materials';

export interface ModuleMetadata {
  id?: string;
  code?: string;
  title?: string;
  titleAr?: string;
}

export interface SearchDocument {
  id: string;
  year: AcademicYear;
  type: ResourceType;
  moduleId?: string;
  subject?: string;

  titleNorm: string;
  titleEnNorm: string;
  descNorm: string;
  descEnNorm: string;
  authorNorm: string;
  addedByNorm: string;
  videosNorm: string;
  subjectNorm: string;
  moduleNorm: string;
  tagsNorm: string;
  typeNorm: string;

  fullText: string;
}

export interface SearchFilterOptions {
  query?: string;
  year?: AcademicYear | 'all' | string;
  type?: ResourceType | 'all' | string;
  moduleId?: string;
  subject?: string;
}

export interface SearchResult {
  id: string;
  score: number;
}

/**
 * Normalizes text for comprehensive, high-precision search.
 * - Converts to lower-case.
 * - Removes Arabic diacritics / tashkeel.
 * - Normalizes Arabic hamzas (أ, إ, آ, ٱ -> ا).
 * - Normalizes taa marbuta (ة -> ه) and yaa / alif maqsura (ى -> ي).
 * - Strips tatweel (ـ).
 * - Converts punctuation and special characters into spaces.
 * - Collapses consecutive whitespace.
 */
export function normalizeSearchText(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[.,/#!$%\^&\*;:{}=\-_`~()\[\]"'?@+|<>\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenizes a user query into clean, normalized search terms.
 */
export function tokenizeQuery(query: string): string[] {
  const norm = normalizeSearchText(query);
  if (!norm) return [];
  return norm.split(/\s+/).filter(Boolean);
}

/**
 * Creates a pre-computed SearchDocument from a MaterialItem and optional module metadata.
 */
export function createSearchDocument(
  material: MaterialItem,
  moduleMeta?: ModuleMetadata
): SearchDocument {
  const titleNorm = normalizeSearchText(material.title);
  const titleEnNorm = normalizeSearchText(material.titleEn);
  const descNorm = normalizeSearchText(material.description);
  const descEnNorm = normalizeSearchText(material.descriptionEn);

  // Author / Created by
  const rawAuthor = Array.isArray(material.author)
    ? material.author.join(' ')
    : (material.author || '');
  const authorNorm = normalizeSearchText(rawAuthor);

  // Added by (contributor name + username handle)
  const rawAddedBy = Array.isArray(material.addedBy)
    ? material.addedBy.join(' ')
    : (material.addedBy || '');
  const rawContributor = material.contributorUsername
    ? `${rawAddedBy} ${material.contributorUsername} @${material.contributorUsername}`
    : rawAddedBy;
  const addedByNorm = normalizeSearchText(rawContributor);

  // Playlist video titles
  const rawVideos = material.videos && material.videos.length > 0
    ? material.videos.map((v) => v.title).join(' ')
    : '';
  const videosNorm = normalizeSearchText(rawVideos);

  // Subject
  const subjectNorm = normalizeSearchText(material.subject || '');

  // Module (id, code, title, titleAr)
  const rawModule = [
    material.moduleId || '',
    moduleMeta?.code || '',
    moduleMeta?.title || '',
    moduleMeta?.titleAr || ''
  ].filter(Boolean).join(' ');
  const moduleNorm = normalizeSearchText(rawModule);

  // Tags
  const rawTags = Array.isArray(material.tags) ? material.tags.join(' ') : '';
  const tagsNorm = normalizeSearchText(rawTags);

  // Type
  const typeNorm = normalizeSearchText(material.type || '');

  // Consolidated search document
  const fullText = [
    titleNorm,
    titleEnNorm,
    authorNorm,
    addedByNorm,
    subjectNorm,
    moduleNorm,
    videosNorm,
    tagsNorm,
    typeNorm,
    descNorm,
    descEnNorm
  ].filter(Boolean).join(' ');

  return {
    id: material.id,
    year: material.year,
    type: material.type,
    moduleId: material.moduleId,
    subject: material.subject,
    titleNorm,
    titleEnNorm,
    descNorm,
    descEnNorm,
    authorNorm,
    addedByNorm,
    videosNorm,
    subjectNorm,
    moduleNorm,
    tagsNorm,
    typeNorm,
    fullText
  };
}

/**
 * Calculates the relevance score for a document against a query and its tokens.
 * Returns 0 if any token does not match.
 */
export function scoreSearchDocument(
  doc: SearchDocument,
  rawQuery: string,
  tokens: string[]
): number {
  if (tokens.length === 0) return 0;

  // Fast check: ALL tokens must appear somewhere in the consolidated fullText
  for (let i = 0; i < tokens.length; i++) {
    if (!doc.fullText.includes(tokens[i])) {
      return 0; // Missing token, no match
    }
  }

  let score = 10; // Baseline match
  const normQuery = normalizeSearchText(rawQuery);

  // Exact full query bonuses
  if (normQuery.length > 1) {
    if (doc.titleNorm === normQuery || doc.titleEnNorm === normQuery) {
      score += 500;
    } else if (doc.titleNorm.startsWith(normQuery) || doc.titleEnNorm.startsWith(normQuery)) {
      score += 300;
    } else if (doc.titleNorm.includes(normQuery) || doc.titleEnNorm.includes(normQuery)) {
      score += 200;
    }

    if (doc.authorNorm.includes(normQuery)) score += 150;
    if (doc.subjectNorm.includes(normQuery)) score += 140;
    if (doc.moduleNorm.includes(normQuery)) score += 130;
    if (doc.videosNorm.includes(normQuery)) score += 120;
    if (doc.addedByNorm.includes(normQuery)) score += 90;
  }

  // Per-token field scoring
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (doc.titleNorm.includes(t) || doc.titleEnNorm.includes(t)) score += 60;
    if (doc.authorNorm.includes(t)) score += 45;
    if (doc.subjectNorm.includes(t)) score += 40;
    if (doc.moduleNorm.includes(t)) score += 35;
    if (doc.videosNorm.includes(t)) score += 30;
    if (doc.addedByNorm.includes(t)) score += 25;
    if (doc.tagsNorm.includes(t)) score += 15;
    if (doc.descNorm.includes(t) || doc.descEnNorm.includes(t)) score += 10;
    if (doc.typeNorm.includes(t)) score += 5;
  }

  return score;
}

/**
 * Pure search function over pre-computed search documents.
 * Returns sorted search results matching the query and filter criteria.
 */
export function searchDocuments(
  docs: SearchDocument[],
  options: SearchFilterOptions
): SearchResult[] {
  const query = options.query?.trim() || '';
  const tokens = tokenizeQuery(query);
  const year = options.year;
  const type = options.type;
  const moduleId = options.moduleId;
  const subject = options.subject ? normalizeSearchText(options.subject) : undefined;

  const results: SearchResult[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];

    // Year filter
    if (year && year !== 'all' && String(doc.year) !== String(year)) {
      continue;
    }

    // Type filter
    if (type && type !== 'all') {
      const isYouTubeMatch = type === 'youtube' && (doc.type === 'youtube' || doc.type === 'playlist');
      if (!isYouTubeMatch && doc.type !== type) {
        continue;
      }
    }

    // Module filter
    if (moduleId && doc.moduleId !== moduleId) {
      continue;
    }

    // Subject filter
    if (subject && doc.subjectNorm !== subject) {
      continue;
    }

    // Text search matching & scoring
    if (tokens.length > 0) {
      const score = scoreSearchDocument(doc, query, tokens);
      if (score <= 0) continue;
      results.push({ id: doc.id, score });
    } else {
      results.push({ id: doc.id, score: 0 });
    }
  }

  // Sort by score descending if query was provided
  if (tokens.length > 0) {
    results.sort((a, b) => b.score - a.score);
  }

  return results;
}
