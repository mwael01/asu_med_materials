import type { AcademicYear, MaterialCategory, PlaylistItem, ResourceType } from './materials';

export interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  author?: string;
  status: 'ok' | 'unavailable' | 'blocked';
}
export interface ReviewIssue {
  field: string;
  message: string;
}
export interface ParsedAIMaterial {
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  url: string;
  urls: string[];
  type: ResourceType;
  category?: MaterialCategory;
  year?: AcademicYear;
  moduleId: string;
  subject?: string;
  author?: string | string[];
  tags: string[];
  playlistId?: string;
  videos?: PlaylistItem[];
  issues?: ReviewIssue[];
}
export interface ExtractionResult {
  items: ParsedAIMaterial[];
  status: 'ai' | 'partial' | 'fallback';
  message?: string;
}
export interface DraftCredit {
  contributor: string;
  contributorUid?: string;
  contributorUsername?: string;
  sourceSubmissionId?: string;
}
export interface MaterialDraft extends ParsedAIMaterial, DraftCredit {
  stagedId: string;
  materialId: string;
  selected: boolean;
  isDuplicate: boolean;
  existingTitle?: string;
  saved?: boolean;
}
