import type { DocumentItem, MaterialItem } from '../types/materials';

export const isHostedDocumentUrl = (url: string): boolean =>
  /^https:\/\/asumed\.eduvour\.com\/materials\/sha256\/[a-f0-9]{64}\.(pdf|jpg|jpeg|png)(?:\?v=[a-f0-9]{64})?$/.test(url);

export function getDocumentDownloadPath(materialId: string, documentId: string): string {
  return `/api/material-download?material=${encodeURIComponent(materialId)}&document=${encodeURIComponent(documentId)}`;
}

/**
 * Resolves the direct download URL for a document.
 * Returns /api/material-download for hosted R2 files.
 * Returns direct Google Drive download link (export=download) for Google Drive files.
 * Returns direct URL for direct document links.
 * Returns null for non-downloadable external websites.
 */
export function getDocumentDownloadUrl(
  url?: string,
  materialId?: string,
  documentId?: string
): string | null {
  if (!url) return null;
  const clean = url.trim();

  // 1. Hosted R2 document via internal streaming attachment endpoint
  if (isHostedDocumentUrl(clean) && materialId && documentId) {
    return getDocumentDownloadPath(materialId, documentId);
  }

  // 2. Google Drive document / file (direct zero-proxy download)
  const driveId = extractDriveDocumentId(clean);
  if (driveId) {
    return `https://drive.google.com/uc?export=download&id=${driveId}`;
  }

  // 3. Direct document files (.pdf, images, .docx, .pptx)
  if (/\.(pdf|png|jpe?g|webp|gif|docx?|pptx?)(?:[?#]|$)/i.test(clean)) {
    return clean;
  }

  return null;
}

export const isImageDocument = (url: string): boolean =>
  /^https?:\/\//i.test(url) && /\.(png|jpe?g|gif|webp|avif|bmp)(?:[?#]|$)/i.test(url);

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
 * Checks if a material contains multiple grouped discrete documents.
 */
export function hasDiscreteDocuments(material?: MaterialItem | null): boolean {
  return Boolean(material && Array.isArray(material.documents) && material.documents.length > 0);
}

/**
 * Resolves discrete document items for a material, falling back to primary URL if singular.
 */
export function resolveDocumentItems(material?: MaterialItem | null): DocumentItem[] {
  if (!material) return [];
  if (hasDiscreteDocuments(material)) {
    return material.documents || [];
  }
  if (material.url) {
    return [
      {
        id: material.id || 'primary_doc',
        title: material.title || 'Document',
        url: material.url,
        type: material.type,
      },
    ];
  }
  return [];
}

/**
 * Checks if a material or URL points to an embeddable document (Google Drive file or direct PDF).
 */
export function isEmbeddableDocument(urlOrMaterial?: string | MaterialItem | null): boolean {
  if (!urlOrMaterial) return false;
  if (typeof urlOrMaterial !== 'string') {
    if (hasDiscreteDocuments(urlOrMaterial)) {
      return (urlOrMaterial.documents || []).some((doc) => isEmbeddableDocument(doc.url));
    }
    return isEmbeddableDocument(urlOrMaterial.url);
  }
  const url = urlOrMaterial;
  if (!url) return false;
  if (isImageDocument(url)) return true;

  if (extractDriveDocumentId(url)) return true;
  if (/\.pdf(?:[?#]|$)/i.test(url)) return true;

  return false;
}

/**
 * Generates the clean iframe preview embed URL for the document.
 */
export function getDocumentEmbedUrl(url?: string): string | null {
  if (!url) return null;
  if (isImageDocument(url) || isHostedDocumentUrl(url)) return url;
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
