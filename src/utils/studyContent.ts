import type { MaterialItem, VideoSourceType } from '../types/materials';
import type { DiscoveryType, Lesson, StudyEntry } from '../types/lessons';
import { getDocumentEmbedUrl, isEmbeddableDocument, isImageDocument } from './documentViewer';
import { parseVideoSource } from './videoSources';
import { lessonDoctors, lessonPath } from './lessons';
import { isHttpUrl } from './materialLinks';
import { assignedLessons } from './materialLessonLinks';

export const isFlashcards = (material: MaterialItem): boolean =>
  material.type === 'flashcards' || Boolean(material.flashcardDeckId) || material.category === 'flashcards';

export function isVideoMaterial(material: MaterialItem): boolean {
  if (material.videos?.length || material.playlistId || ['youtube', 'playlist'].includes(material.type)) return true;
  // Drive file IDs alone cannot distinguish a PDF from a video.
  return /\.(mp4|webm|mov)(?:[?#]|$)/i.test(material.url) ||
    /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//i.test(material.url);
}

export function isMcqMaterial(material: MaterialItem): boolean {
  if (isFlashcards(material)) return false;
  if (material.type === 'exam' || material.category === 'exams') return true;
  const mcqRegex = /\b(mcq|mcqs|quiz|exam|questions|question bank)\b/i;
  const mcqArabicRegex = /(أسئلة|اسئلة|امتحان|امتحانات|بنك أسئلة|بنك الاسئلة|كويز)/i;
  if (material.tags?.some(tag => mcqRegex.test(tag) || mcqArabicRegex.test(tag))) return true;
  if (mcqRegex.test(material.title) || mcqArabicRegex.test(material.title)) return true;
  if (material.titleEn && mcqRegex.test(material.titleEn)) return true;
  return false;
}

export function isPdfMaterial(material: MaterialItem): boolean {
  if (isFlashcards(material) || isMcqMaterial(material)) return false;
  if (isVideoMaterial(material) || material.category === 'lectures') return false;
  if (material.category === 'summaries' || material.category === 'references') return true;
  if (material.type === 'summary' || material.type === 'book') return true;
  if (material.documents?.length) return true;
  if (/\.pdf(?:[?#]|$)/i.test(material.url)) return true;
  if (material.type === 'drive' && !material.url.includes('/folders/')) return true;
  return false;
}

export function studyEntries(materials: MaterialItem[]): StudyEntry[] {
  const result: StudyEntry[] = [];
  for (const material of materials) {
    if (isFlashcards(material)) continue;
    const base = { materialId: material.id, bundleTitle: material.titleEn || material.title };
    const addVideo = (itemId: string, title: string, url: string, youtubeId?: string, sourceType?: VideoSourceType, origin = 'videos') => {
      const source = parseVideoSource(url, youtubeId, sourceType);
      if (!isHttpUrl(source.externalUrl)) return;
      result.push({ ...base, key: JSON.stringify([material.id, origin, itemId]), itemId, title,
        tab: 'videos', url: source.externalUrl, embedUrl: source.embedUrl, embedType: source.embedType,
        playlistProgress: origin === 'videos' && Boolean(material.videos?.length) });
    };
    if (material.videos?.length) {
      for (const video of material.videos) addVideo(video.id, video.title, video.url || '', video.youtubeId, video.sourceType);
    } else if (isVideoMaterial(material)) {
      if (material.playlistId) {
        result.push({ ...base, key: JSON.stringify([material.id, 'videos', material.id]), itemId: material.id,
          title: base.bundleTitle, tab: 'videos', url: `https://www.youtube.com/playlist?list=${encodeURIComponent(material.playlistId)}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(material.playlistId)}&rel=0`,
          embedType: 'iframe', playlistProgress: false });
      } else addVideo(material.id, base.bundleTitle, material.url);
    }
    if (material.documents?.length) {
      for (const document of material.documents) {
        if (!isHttpUrl(document.url)) continue;
        const isVideo = /\.(mp4|webm|mov)(?:[?#]|$)/i.test(document.url) || document.type === 'youtube' || document.type === 'playlist';
        if (isVideo) {
          addVideo(document.id, document.title, document.url, undefined, undefined, 'documents');
          continue;
        }
        const embed = getDocumentEmbedUrl(document.url);
        result.push({ ...base, key: JSON.stringify([material.id, 'documents', document.id]), itemId: document.id,
          title: document.title, tab: embed ? 'pdfs' : 'links', url: document.url,
          embedUrl: embed, embedType: isImageDocument(document.url) ? 'image' : embed ? 'iframe' : 'none', playlistProgress: false });
      }
    } else if (!isVideoMaterial(material) && isHttpUrl(material.url)) {
      const embed = getDocumentEmbedUrl(material.url);
      result.push({ ...base, key: JSON.stringify([material.id, embed ? 'pdfs' : 'links', material.id]), itemId: material.id,
        title: base.bundleTitle, tab: embed ? 'pdfs' : 'links', url: material.url,
        embedUrl: embed, embedType: isImageDocument(material.url) ? 'image' : embed ? 'iframe' : 'none', playlistProgress: false });
    }
  }
  return result;
}

export function matchesDiscoveryType(material: MaterialItem, type: DiscoveryType): boolean {
  if (type === 'flashcards') return isFlashcards(material);
  return studyEntries([material]).some(entry => entry.tab === type);
}

export function legacyMaterialPath(material: MaterialItem): string {
  if (isFlashcards(material)) return `/flashcards/${encodeURIComponent(material.flashcardDeckId || material.id)}`;
  if (material.type === 'playlist' || material.playlistId || material.videos?.length) return `/playlist/${encodeURIComponent(material.id)}`;
  if (material.documents?.length || isEmbeddableDocument(material)) return `/viewer/${encodeURIComponent(material.id)}`;
  return isHttpUrl(material.url) || material.url.startsWith('/') ? material.url : '#';
}

/** Shared by discovery and search; hidden or stale assignments keep their legacy destination. */
export function materialStudyPath(material: MaterialItem, lessons: Lesson[], type?: DiscoveryType): string {
  if (isFlashcards(material)) return legacyMaterialPath(material);
  const lesson = assignedLessons(material, lessons).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0];
  if (!lesson) return legacyMaterialPath(material);
  const doctor = lessonDoctors([material])[0];
  if (!doctor) return lessonPath(lesson);
  const entries = studyEntries([material]);
  const selected = entries.find(entry => entry.tab === type) || entries[0];
  const params = new URLSearchParams();
  if (selected) params.set('item', selected.key);
  return `${lessonPath(lesson)}/doctor/${doctor.key}${params.size ? `?${params}` : ''}`;
}
