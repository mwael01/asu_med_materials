import type { MaterialItem, AcademicYear, ResourceType } from '../types/materials';
import {
  normalizeSearchText,
  tokenizeQuery,
  stripArabicPrefix,
  stemToken
} from './searchNormalize';
import { getAliasesForToken } from './searchAliases';

export {
  normalizeSearchText,
  tokenizeQuery,
  stripArabicPrefix,
  stemToken
};

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
  aliasesNorm: string;

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
 * Creates a pre-computed SearchDocument from a MaterialItem and optional module metadata.
 * Automatically enriches searchable text with bilingual medical aliases, author names,
 * and academic keywords so arbitrary word searches match smoothly.
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
  const username = material.added_by_username || material.contributorUsername || '';
  const rawContributor = username
    ? `${rawAddedBy} ${username} @${username}`
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

  // Extract and expand aliases for subject, author, type, and title words
  const aliasTokens = new Set<string>();
  const seedWords = [
    ...subjectNorm.split(/\s+/),
    ...authorNorm.split(/\s+/),
    typeNorm,
    ...titleNorm.split(/\s+/),
    ...titleEnNorm.split(/\s+/)
  ].filter((w) => w.length >= 3);

  for (const word of seedWords) {
    const aliases = getAliasesForToken(word);
    for (const a of aliases) {
      aliasTokens.add(a);
    }
    const stemmed = stemToken(word);
    if (stemmed && stemmed !== word) {
      aliasTokens.add(stemmed);
      const stemAliases = getAliasesForToken(stemmed);
      for (const sa of stemAliases) {
        aliasTokens.add(sa);
      }
    }
  }

  const aliasesNorm = Array.from(aliasTokens).join(' ');

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
    aliasesNorm,
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
    aliasesNorm,
    fullText
  };
}

/**
 * Checks if a candidate term or any of its stems/aliases matches a document field.
 */
function tokenMatchesText(field: string, token: string, stem: string, aliases: string[]): boolean {
  if (!field) return false;
  if (field.includes(token)) return true;
  if (stem && field.includes(stem)) return true;
  for (let i = 0; i < aliases.length; i++) {
    if (field.includes(aliases[i])) return true;
  }
  return false;
}

/**
 * Calculates the relevance score for a document against a user query and its tokens.
 * Supports arbitrary words, out-of-order terms, medical slang, Arabic prefixes, and tolerance.
 */
export function scoreSearchDocument(
  doc: SearchDocument,
  rawQuery: string,
  tokens: string[]
): number {
  if (tokens.length === 0) return 0;

  const normQuery = normalizeSearchText(rawQuery);

  let matchedTokenCount = 0;
  let tokenScore = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const stem = stemToken(t);
    const aliases = getAliasesForToken(t);

    let tokenMatched = false;

    // Check specific fields with weighted scoring
    if (tokenMatchesText(doc.titleNorm, t, stem, aliases) || tokenMatchesText(doc.titleEnNorm, t, stem, aliases)) {
      tokenScore += 100;
      tokenMatched = true;
    }
    if (tokenMatchesText(doc.subjectNorm, t, stem, aliases)) {
      tokenScore += 80;
      tokenMatched = true;
    }
    if (tokenMatchesText(doc.authorNorm, t, stem, aliases)) {
      tokenScore += 75;
      tokenMatched = true;
    }
    if (tokenMatchesText(doc.moduleNorm, t, stem, aliases)) {
      tokenScore += 60;
      tokenMatched = true;
    }
    if (tokenMatchesText(doc.videosNorm, t, stem, aliases)) {
      tokenScore += 40;
      tokenMatched = true;
    }
    if (tokenMatchesText(doc.addedByNorm, t, stem, aliases)) {
      tokenScore += 30;
      tokenMatched = true;
    }
    if (tokenMatchesText(doc.tagsNorm, t, stem, aliases)) {
      tokenScore += 25;
      tokenMatched = true;
    }
    if (tokenMatchesText(doc.typeNorm, t, stem, aliases)) {
      tokenScore += 25;
      tokenMatched = true;
    }
    if (tokenMatchesText(doc.descNorm, t, stem, aliases) || tokenMatchesText(doc.descEnNorm, t, stem, aliases)) {
      tokenScore += 15;
      tokenMatched = true;
    }
    if (!tokenMatched && tokenMatchesText(doc.fullText, t, stem, aliases)) {
      tokenScore += 20;
      tokenMatched = true;
    }

    if (tokenMatched) {
      matchedTokenCount++;
    }
  }

  // Acceptance threshold:
  // - Single-token query: must match that token.
  // - 2 tokens query: must match at least 1 token (prioritizing both).
  // - 3+ tokens query: must match at least 60% of tokens (e.g. 2 of 3, 3 of 4).
  const requiredMatches = tokens.length === 1 ? 1 : Math.max(1, Math.ceil(tokens.length * 0.6));
  if (matchedTokenCount < requiredMatches) {
    return 0;
  }

  let finalScore = tokenScore;

  // Multi-token completion bonus
  if (matchedTokenCount === tokens.length) {
    // Huge bonus for documents matching ALL user tokens
    finalScore += 500;
  } else {
    // Penalty for missing tokens proportional to missing count
    const missingRatio = (tokens.length - matchedTokenCount) / tokens.length;
    finalScore = Math.max(10, Math.round(finalScore * (1 - missingRatio * 0.5)));
  }

  // Exact phrase bonuses when user typed a multi-word sequence
  if (normQuery.length > 2) {
    if (doc.titleNorm === normQuery || doc.titleEnNorm === normQuery) {
      finalScore += 600;
    } else if (doc.titleNorm.startsWith(normQuery) || doc.titleEnNorm.startsWith(normQuery)) {
      finalScore += 400;
    } else if (doc.titleNorm.includes(normQuery) || doc.titleEnNorm.includes(normQuery)) {
      finalScore += 250;
    }

    if (doc.authorNorm.includes(normQuery)) finalScore += 150;
    if (doc.subjectNorm.includes(normQuery)) finalScore += 140;
    if (doc.moduleNorm.includes(normQuery)) finalScore += 130;
    if (doc.videosNorm.includes(normQuery)) finalScore += 120;
  }

  return finalScore;
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
