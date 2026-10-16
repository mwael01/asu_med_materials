import type { AcademicYear, MaterialItem } from './materials';

export type CollectionCategory = 'practical' | 'finals' | 'midterm' | 'revision' | 'general';

export interface MaterialCollection {
  id: string;
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  year: AcademicYear;
  moduleId?: string;
  subject?: string;
  category: CollectionCategory;
  materialIds: string[]; // Ordered list of material IDs
  featured?: boolean;
  order?: number;
  bookmarksCount?: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CollectionWithMaterials extends MaterialCollection {
  materials: MaterialItem[];
}
