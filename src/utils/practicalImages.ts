import type { MaterialItem, DocumentItem } from '../types/materials';
import type { Lesson } from '../types/lessons';
import type { PracticalImageFolder, PracticalGalleryImage } from '../types/practicalImages';
import { isImageDocument } from './documentViewer';
import { isMaterialAssignedToLesson } from './materialLessonLinks';
import { subjectToSlug } from './slug';

export const validImageFolderId = (id: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);

export function validateImageFolders(folders: PracticalImageFolder[]): void {
  const ids = new Set<string>();
  for (const folder of folders) {
    if (!validImageFolderId(folder.id) || !folder.title.trim() || ids.has(folder.id)) {
      throw new Error('Image folders need unique lowercase IDs and titles.');
    }
    ids.add(folder.id);
  }
}

export function parseImageFolders(value: string): PracticalImageFolder[] {
  const folders = value.split('\n').filter(line => line.trim()).map(line => {
    const colon = line.indexOf(':');
    return { id: colon < 0 ? '' : line.slice(0, colon).trim(), title: colon < 0 ? '' : line.slice(colon + 1).trim() };
  });
  validateImageFolders(folders);
  return folders;
}

export const imageFolderId = (material: MaterialItem, document: DocumentItem): string | undefined =>
  document.practicalImageFolderId || material.practicalImageFolderId;

export function isPracticalImageMaterial(material: MaterialItem): boolean {
  return Boolean(material.practicalImageCollection || material.practicalImageFolderId ||
    material.documents?.some(doc => doc.practicalImageFolderId));
}

export function practicalFolderImages(materials: MaterialItem[], lesson: Lesson, folderId: string): PracticalGalleryImage[] {
  if (!lesson.practicalImageFolders?.some(folder => folder.id === folderId)) return [];
  const images: PracticalGalleryImage[] = [];
  const seen = new Set<string>();
  for (const material of [...materials].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id))) {
    if (!isMaterialAssignedToLesson(material, lesson)) continue;
    for (const doc of material.documents || []) {
      if (imageFolderId(material, doc) !== folderId || !(isImageDocument(doc.url) || doc.mimeType?.startsWith('image/'))) continue;
      if (seen.has(doc.url)) continue;
      seen.add(doc.url);
      images.push({ ...doc, key: JSON.stringify([material.id, doc.id]), materialId: material.id, folderId,
        author: Array.isArray(material.author) ? material.author.join(', ') : material.author,
        sourceUrls: doc.sourceUrls || material.importSources });
    }
  }
  return images;
}

export function practicalImagePath(material: MaterialItem, lessons: Lesson[], documentId?: string): string | null {
  const doc = material.documents?.find(doc => doc.id === documentId && imageFolderId(material, doc)) || material.documents?.find(doc => imageFolderId(material, doc));
  if (!doc) return null;
  const folderId = imageFolderId(material, doc);
  const lesson = lessons.find(lesson => lesson.active !== false && isMaterialAssignedToLesson(material, lesson) &&
    lesson.practicalImageFolders?.some(folder => folder.id === folderId));
  if (!lesson || !folderId) return null;
  return `/module/${encodeURIComponent(lesson.moduleId)}/${subjectToSlug(lesson.subject)}/lesson/${encodeURIComponent(lesson.id)}/images/${encodeURIComponent(folderId)}?${new URLSearchParams({ image: JSON.stringify([material.id, doc.id]) })}`;
}
