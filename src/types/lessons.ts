import type { MaterialItem } from './materials';

export interface Lesson {
  id: string;
  title: string;
  moduleId: string;
  subject: string;
  order: number;
  active: boolean;
  isRevision?: boolean;
}

export type StudyTab = 'videos' | 'pdfs' | 'links';
export type DiscoveryType = 'videos' | 'pdfs' | 'flashcards';

export interface StudyEntry {
  key: string;
  itemId: string;
  materialId: string;
  bundleTitle: string;
  title: string;
  tab: StudyTab;
  url: string;
  embedUrl: string | null;
  embedType: 'iframe' | 'video' | 'none';
  /** Existing playlist progress uses the original video ID. */
  playlistProgress: boolean;
}

export interface LessonDoctor {
  key: string;
  name: string;
  items: MaterialItem[];
}
