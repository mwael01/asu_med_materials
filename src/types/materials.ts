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
  | 'website'
  | 'other';

export interface PlaylistItem {
  id: string;
  title: string;
  youtubeId?: string;
  url?: string;
  duration?: string;
}

export type MaterialCategory =
  | 'central'      // درايفات وقنوات الدفعة المركزية
  | 'lectures'     // محاضرات وشروحات الفيديو
  | 'practical'    // عملي وسكاشن ومعامل
  | 'summaries'    // ورق ومذكرات وملخصات
  | 'exams'        // امتحانات سابقة وريكولات
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
  subject?: string;
  author?: string | string[]; // Creator / Doctor / Teacher who prepared the materials
  addedBy?: string | string[]; // Contributor / Student who added it to the platform
  tags: string[];
  createdAt?: string;
  playlistId?: string; // YouTube playlist ID if applicable
  videos?: PlaylistItem[]; // Individual videos for multi-part video series
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
