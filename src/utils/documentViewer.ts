import type { MaterialItem } from '../types/materials';

/**
 * Extracts a Google Drive file ID from view/preview/open/uc/edit URLs.
 * Explicitly ignores Google Drive folders (/drive/folders/).
 */
export function extractDriveDocumentId(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/\/drive\/folders\//i.test(trimmed)) return null;

  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch) return fileDMatch[1];

  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && !trimmed.includes('/folders/')) return idParamMatch[1];

  const docMatch = trimmed.match(/docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return docMatch[1];

  return null;
}

/**
 * Checks if a material or URL points to an embeddable document (Google Drive file or direct PDF).
 */
export function isEmbeddableDocument(urlOrMaterial?: string | MaterialItem | null): boolean {
  if (!urlOrMaterial) return false;
  const url = typeof urlOrMaterial === 'string' ? urlOrMaterial : urlOrMaterial.url;
  if (!url) return false;

  if (extractDriveDocumentId(url)) return true;
  if (/\.pdf(?:[?#]|$)/i.test(url)) return true;

  return false;
}

/**
 * Generates the clean iframe preview embed URL for the document.
 */
export function getDocumentEmbedUrl(url?: string): string | null {
  if (!url) return null;
  const driveId = extractDriveDocumentId(url);
  if (driveId) {
    if (url.includes('docs.google.com/document/')) {
      return `https://docs.google.com/document/d/${driveId}/preview`;
    }
    if (url.includes('docs.google.com/presentation/')) {
      return `https://docs.google.com/presentation/d/${driveId}/preview`;
    }
    return `https://drive.google.com/file/d/${driveId}/preview`;
  }

  if (/\.pdf(?:[?#]|$)/i.test(url)) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  }

  return null;
}

/**
 * Resolves the clean external destination URL (e.g. for opening in Google Drive).
 */
export function getDocumentExternalUrl(url: string): string {
  const driveId = extractDriveDocumentId(url);
  if (driveId && !url.includes('docs.google.com')) {
    return `https://drive.google.com/file/d/${driveId}/view`;
  }
  return url;
}

/**
 * Returns the in-app viewer route path for a given material.
 */
export function getDocumentViewerPath(materialId: string): string {
  return `/viewer/${encodeURIComponent(materialId)}`;
}
