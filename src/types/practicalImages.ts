import type { DocumentItem } from './materials';

/** Folder definitions belong to a particular Practical Revision lesson. */
export interface PracticalImageFolder {
  id: string;
  title: string;
}

export interface PracticalGalleryImage extends DocumentItem {
  key: string;
  materialId: string;
  folderId: string;
  author?: string;
}
