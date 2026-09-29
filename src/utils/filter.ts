import type { MaterialItem, FilterOptions } from '../types/materials';
import { createSearchDocument, scoreSearchDocument, tokenizeQuery } from './search';

export function filterMaterials(
  materials: MaterialItem[],
  options: FilterOptions
): MaterialItem[] {
  const query = options.query?.trim() ?? '';
  const tokens = tokenizeQuery(query);
  const year = options.year;
  const type = options.type;
  const moduleId = options.moduleId;
  const subject = options.subject?.trim().toLowerCase();

  const matchedItems: { item: MaterialItem; score: number }[] = [];

  for (const item of materials) {
    // Filter by Academic Year
    if (year && year !== 'all' && item.year !== year) {
      continue;
    }

    // Filter by Resource Type
    if (type && type !== 'all') {
      const isYouTubeMatch = type === 'youtube' && (item.type === 'youtube' || item.type === 'playlist');
      if (!isYouTubeMatch && item.type !== type) {
        continue;
      }
    }

    // Filter by Module ID
    if (moduleId && item.moduleId !== moduleId) {
      continue;
    }

    // Filter by Subject
    if (subject && item.subject?.toLowerCase() !== subject) {
      continue;
    }

    // Text search matching with smart normalization and multi-token matching
    if (tokens.length > 0) {
      const doc = createSearchDocument(item);
      const score = scoreSearchDocument(doc, query, tokens);
      if (score <= 0) continue;
      matchedItems.push({ item, score });
    } else {
      matchedItems.push({ item, score: 0 });
    }
  }

  if (tokens.length > 0) {
    matchedItems.sort((a, b) => b.score - a.score);
  }

  return matchedItems.map((m) => m.item);
}
