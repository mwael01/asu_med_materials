import type { AcademicYear } from './materials';

export type FlashcardCardKind = 'basic' | 'reversed' | 'cloze' | 'image' | 'occlusion';
export type FlashcardPublicationStatus = 'draft' | 'published' | 'archived';
export type FlashcardFindingSeverity = 'info' | 'warning' | 'error';

export interface FlashcardDeck {
  id: string;
  title: string;
  sourceTitle: string;
  year: AcademicYear;
  semester?: 1 | 2;
  moduleId: string;
  subject?: string;
  unit?: string;
  chapter?: string;
  author?: string;
  tags: string[];
  cardCount: number;
  publicationStatus: FlashcardPublicationStatus;
  activeRevisionId?: string;
  sourceId: string;
  sourceSha256: string;
  sourceDeckPath: string;
  updatedAt: string;
  createdAt: string;
}

export interface FlashcardMedia {
  storagePath: string;
  contentType: string;
  width?: number;
  height?: number;
  byteSize?: number;
}

export interface FlashcardCard {
  id: string;
  deckId: string;
  revisionId: string;
  ordinal: number;
  kind: FlashcardCardKind;
  questionHtml: string;
  answerHtml: string;
  questionDirection?: 'ltr' | 'rtl' | 'auto';
  answerDirection?: 'ltr' | 'rtl' | 'auto';
  media: FlashcardMedia[];
  sourceNoteGuid: string;
  sourceTemplateOrdinal: number;
  sourceClozeOrdinal?: number;
  sourceDeckPath: string;
  contentHash: string;
  quarantined?: boolean;
  quarantineReason?: string;
}

export interface FlashcardRevision {
  id: string;
  deckId: string;
  status: FlashcardPublicationStatus;
  cardCount: number;
  sourceSha256: string;
  sourceId: string;
  complete: boolean;
  createdAt: string;
  publishedAt?: string;
}

export type FlashcardRating = 'again' | 'known';

export interface FlashcardProgressCard {
  cardId: string;
  status: FlashcardRating;
  contentHash: string;
  updatedAt: number;
  revisionId: string;
  resetVersion: number;
}

export interface FlashcardProgress {
  deckId: string;
  revisionId: string;
  checkpointIndex: number;
  resetVersion: number;
  updatedAt: number;
  cards: Record<string, FlashcardProgressCard>;
}

export interface FlashcardFinding {
  code: string;
  severity: FlashcardFindingSeverity;
  message: string;
  deckPath?: string;
  cardId?: string;
}

export interface FlashcardManifest {
  deck: FlashcardDeck;
  revision: FlashcardRevision;
  cardIds: string[];
}
