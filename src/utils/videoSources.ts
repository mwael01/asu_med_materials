import type {
  MaterialItem,
  VideoSourceType,
  VideoEmbedType
} from '../types/materials';
import { getDocumentDownloadUrl, isHostedDocumentUrl } from './documentViewer';

export interface ParsedVideoSource {
  sourceType: VideoSourceType;
  embedType: VideoEmbedType;
  embedUrl: string | null;
  externalUrl: string;
  sourceLabelEn: string;
  sourceLabelAr: string;
  icon: string;
}

/**
 * Extracts a Google Drive file ID from view/preview/open/uc URLs.
 */
export function extractDriveFileId(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const fileDMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch) return fileDMatch[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  return null;
}

/**
 * Extracts a YouTube video ID from standard watch URLs, shortlinks, embeds, or raw 11-char IDs.
 */
export function extractYouTubeId(urlOrId?: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

/**
 * Extracts a Vimeo video ID from URLs.
 */
export function extractVimeoId(url?: string): string | null {
  if (!url) return null;
  const match = url.trim().match(
    /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)/
  );
  return match ? match[1] : null;
}

/**
 * Determines whether a URL points directly to an HTML5-playable video file.
 */
export function isDirectVideoUrl(url?: string): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  try {
    const parsed = new URL(clean);
    return /\.(mp4|webm|m4v|ogv|mov|m3u8)$/i.test(parsed.pathname);
  } catch {
    return /\.(mp4|webm|m4v|ogv|mov|m3u8)(\?.*)?$/i.test(clean);
  }
}

/**
 * Determines whether a URL is hosted on Telegram (which cannot be embedded via iframes).
 */
export function isTelegramUrl(url?: string): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  return (
    /^(https?:\/\/)?(t\.me|telegram\.me|web\.telegram\.org)\//i.test(clean) ||
    clean.startsWith('tg://')
  );
}

/**
 * Analyzes a video item (or URL / YouTube ID combination) and produces
 * its playback strategy (iframe embed, native video player, or fallback action card).
 */
export function parseVideoSource(
  url?: string,
  youtubeId?: string,
  explicitType?: VideoSourceType,
  mediaKind?: 'audio' | 'video'
): ParsedVideoSource {
  const cleanUrl = (url || '').trim();
  if (mediaKind === 'audio' && /^https?:\/\//i.test(cleanUrl) && !isTelegramUrl(cleanUrl)
    && (explicitType === 'direct' || /\.(mp3|ogg|m4a|wav|flac|webm)(?:[?#]|$)/i.test(cleanUrl))) {
    return { sourceType: 'direct', embedType: 'audio', embedUrl: cleanUrl, externalUrl: cleanUrl,
      sourceLabelEn: 'Audio', sourceLabelAr: 'صوت', icon: '/icons/playlist.svg' };
  }

  // 1. YouTube
  const cleanYtId = extractYouTubeId(youtubeId) || extractYouTubeId(cleanUrl);
  if (cleanYtId || explicitType === 'youtube') {
    const id = cleanYtId || '';
    return {
      sourceType: 'youtube',
      embedType: id ? 'iframe' : 'none',
      embedUrl: id
        ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&enablejsapi=1&playsinline=1`
        : null,
      externalUrl: id ? `https://www.youtube.com/watch?v=${id}` : cleanUrl,
      sourceLabelEn: 'YouTube',
      sourceLabelAr: 'يوتيوب',
      icon: '/icons/youtube.svg'
    };
  }

  // 2. Google Drive
  const driveFileId = extractDriveFileId(cleanUrl);
  if (driveFileId || explicitType === 'drive' || cleanUrl.includes('drive.google.com')) {
    const fileId = driveFileId || '';
    return {
      sourceType: 'drive',
      embedType: fileId ? 'iframe' : 'none',
      embedUrl: fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null,
      externalUrl: fileId ? `https://drive.google.com/file/d/${fileId}/view` : cleanUrl,
      sourceLabelEn: 'Google Drive',
      sourceLabelAr: 'Google Drive',
      icon: '/icons/google-drive.svg'
    };
  }

  // 3. Direct HTML5 Video File
  if (isDirectVideoUrl(cleanUrl) || explicitType === 'direct') {
    return {
      sourceType: 'direct',
      embedType: cleanUrl ? 'video' : 'none',
      embedUrl: cleanUrl || null,
      externalUrl: cleanUrl,
      sourceLabelEn: 'Direct Video',
      sourceLabelAr: 'فيديو مباشر',
      icon: '/icons/playlist.svg'
    };
  }

  // 4. Vimeo
  const vimeoId = extractVimeoId(cleanUrl);
  if (vimeoId || explicitType === 'vimeo') {
    return {
      sourceType: 'vimeo',
      embedType: vimeoId ? 'iframe' : 'none',
      embedUrl: vimeoId ? `https://player.vimeo.com/video/${vimeoId}` : null,
      externalUrl: vimeoId ? `https://vimeo.com/${vimeoId}` : cleanUrl,
      sourceLabelEn: 'Vimeo',
      sourceLabelAr: 'فيميو',
      icon: '/icons/playlist.svg'
    };
  }

  // 5. Telegram
  if (isTelegramUrl(cleanUrl) || explicitType === 'telegram') {
    return {
      sourceType: 'telegram',
      embedType: 'none',
      embedUrl: null,
      externalUrl: cleanUrl,
      sourceLabelEn: 'Telegram',
      sourceLabelAr: 'تيليجرام',
      icon: '/icons/telegram.svg'
    };
  }

  // 6. External / Fallback Web Video
  return {
    sourceType: 'external',
    embedType: 'none',
    embedUrl: null,
    externalUrl: cleanUrl,
    sourceLabelEn: 'External Source',
    sourceLabelAr: 'مصدر خارجي',
    icon: '/icons/website.svg'
  };
}

/**
 * Determines the primary source type for a playlist based on its discrete videos or root metadata.
 */
export function determinePrimaryPlaylistSource(playlist: MaterialItem): VideoSourceType {
  const videos = playlist.videos;
  if (Array.isArray(videos) && videos.length > 0) {
    const counts: Record<VideoSourceType, number> = {
      youtube: 0,
      drive: 0,
      direct: 0,
      vimeo: 0,
      telegram: 0,
      external: 0
    };

    for (const v of videos) {
      const parsed = parseVideoSource(v.url, v.youtubeId, v.sourceType);
      counts[parsed.sourceType] = (counts[parsed.sourceType] || 0) + 1;
    }

    let dominantSource: VideoSourceType = 'youtube';
    let maxCount = 0;
    for (const [src, cnt] of Object.entries(counts) as [VideoSourceType, number][]) {
      if (cnt > maxCount) {
        maxCount = cnt;
        dominantSource = src;
      }
    }
    return dominantSource;
  }

  if (playlist.playlistId) return 'youtube';
  if (playlist.type === 'drive') return 'drive';
  if (playlist.type === 'telegram') return 'telegram';

  if (playlist.url) {
    return parseVideoSource(playlist.url).sourceType;
  }

  return 'youtube';
}

/**
 * Resolves direct download URL for a video source if directly downloadable.
 * Returns Google Drive direct download URL (export=download) for Google Drive videos.
 * Returns direct URL for HTML5 direct video files (.mp4, .webm, etc.).
 * Returns null for third-party embeds (YouTube, Vimeo, Telegram).
 */
export function getVideoDownloadUrl(url?: string): string | null {
  if (!url) return null;
  const clean = url.trim();
  if (isHostedDocumentUrl(clean)) return getDocumentDownloadUrl(clean);

  const driveId = extractDriveFileId(clean);
  if (driveId) {
    return `https://drive.google.com/uc?export=download&id=${driveId}`;
  }

  if (isDirectVideoUrl(clean)) {
    return clean;
  }

  return null;
}

