export type AcademicYear = 1 | 2 | 3 | 4 | 5;

export type ResourceType =
  | 'drive'
  | 'telegram'
  | 'youtube'
  | 'playlist'
  | 'whatsapp'
  | 'book'
  | 'summary'
  | 'exam'
  | 'flashcards'
  | 'website'
  | 'other';

export type VideoSourceType = 'youtube' | 'drive' | 'direct' | 'vimeo' | 'telegram' | 'external';
export type VideoEmbedType = 'iframe' | 'video' | 'none';

export interface PlaylistItem {
  id: string;
  title: string;
  youtubeId?: string;
  url?: string;
  duration?: string;
  sourceType?: VideoSourceType;
}

export interface DocumentItem {
  id: string;
  title: string;
  url: string;
  type?: ResourceType;
}

export type MaterialCategory =
  | 'central'      // درايفات وقنوات الدفعة المركزية
  | 'lectures'     // محاضرات وشروحات الفيديو
  | 'practical'    // عملي وسكاشن ومعامل
  | 'summaries'    // ورق ومذكرات وملخصات
  | 'exams'        // امتحانات سابقة وريكولات
  | 'flashcards'   // Interactive study decks
  | 'references';  // كتب ومراجع

export interface ModuleInfo {
  id: string;
  code: string;
  title: string;
  titleAr?: string;
  year: AcademicYear;
  semester?: 1 | 2;
  subjects: string[];
  description?: string;
  descriptionAr?: string;
  active?: boolean; // defaults to true when undefined
}

export interface MaterialItem {
  id: string;
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  url: string;
  type: ResourceType;
  category?: MaterialCategory;
  year: AcademicYear;
  moduleId?: string;
  semester?: 1 | 2;
  subject?: string;
  lessonId?: string;
  author?: string | string[]; // Creator / Doctor / Teacher who prepared the materials
  contributorUid?: string; // Firebase Auth UID of the contributing user
  contributorUsername?: string; // Username handle of the contributing user
  creator_username?: string; // Username of the content creator (if they have a profile)
  tags: string[];
  createdAt?: string;
  playlistId?: string; // YouTube playlist ID if applicable
  flashcardDeckId?: string;
  videos?: PlaylistItem[]; // Individual videos for multi-part video series
  documents?: DocumentItem[]; // Individual documents for multi-file study bundles
  bookmarksCount?: number; // Total number of students who bookmarked/loved this material
}

export interface FilterOptions {
  query?: string;
  year?: AcademicYear | 'all';
  type?: ResourceType | 'all';
  category?: MaterialCategory | 'all';
  moduleId?: string;
  subject?: string;
}

export interface UserPreferences {
  year?: AcademicYear;
  moduleId?: string;
}


