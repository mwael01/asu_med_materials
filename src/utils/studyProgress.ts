import type { StudyEntry } from '../types/lessons';

export function entryProgressStorage(entry: StudyEntry): { key: string; itemId: string } {
  return entry.playlistProgress
    ? { key: `asumed_playlist_${entry.materialId}`, itemId: entry.itemId }
    : { key: `asumed_documents_${entry.materialId}`, itemId: entry.key };
}

export function parseProgress(raw: string | null): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, done]) => typeof done === 'boolean')) : {};
  } catch { return {}; }
}
