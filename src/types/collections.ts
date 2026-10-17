import type { AcademicYear, MaterialItem } from './materials';

export type CollectionCategory = 'practical' | 'finals' | 'midterm' | 'revision' | 'general';

export interface MaterialCollection {
  id: string;
  parentId?: string; // Optional parent collection ID for nested subgroups
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  year: AcademicYear;
  moduleId?: string;
  subject?: string;
  category: CollectionCategory;
  materialIds: string[]; // Ordered list of material IDs
  subcollectionIds?: string[]; // Optional ordered list of child collection IDs
  featured?: boolean;
  order?: number;
  bookmarksCount?: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CollectionWithMaterials extends MaterialCollection {
  materials: MaterialItem[];
  subcollections?: CollectionWithMaterials[]; // Nested child groups with their resolved materials
  parent?: MaterialCollection | null; // Resolved parent collection for breadcrumb trail
  totalMaterialsCount?: number; // Recursive count of materials across parent and all subgroups
}

