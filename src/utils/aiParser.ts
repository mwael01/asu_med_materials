import type { AcademicYear, MaterialCategory, ResourceType, ModuleInfo } from '../types/materials';
import { extractUrls } from './submission';

export interface ParsedAIMaterial {
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  url: string;
  urls: string[];
  type: ResourceType;
  category: MaterialCategory;
  year: AcademicYear;
  semester?: 1 | 2;
  moduleId: string;
  moduleTitle?: string;
  moduleTitleEn?: string;
  subject?: string;
  subjectEn?: string;
  author?: string;
  authorEn?: string;
  tags: string[];
  playlistId?: string;
  videos?: Array<{
    id: string;
    title: string;
    youtubeId?: string;
    url?: string;
    duration?: string;
  }>;
}

/**
 * Builds a structured Gemini extraction prompt tailored to Ain Shams Medical curriculum,
 * instructing the model to extract single or multiple study materials into a clean JSON array.
 */
export function buildExtractionPrompt(rawMessage: string, modules: ModuleInfo[]): string {
  const moduleSummary = modules.slice(0, 30).map((m) => ({
    id: m.id,
    title: m.title,
    year: m.year,
    subjects: m.subjects
  }));

  return `You are an AI assistant for Ain Shams University Faculty of Medicine study platform (ASU Med Materials).
Analyze the following student message, announcement, or study links dump and extract structured material metadata into JSON.

STUDY MESSAGE TO PARSE:
"""
${rawMessage}
"""

AVAILABLE CURRICULUM MODULES REFERENCE:
${JSON.stringify(moduleSummary)}

VALID RESOURCE TYPES:
"drive" | "telegram" | "youtube" | "playlist" | "whatsapp" | "book" | "summary" | "exam" | "website" | "other"

VALID MATERIAL CATEGORIES:
"central" | "lectures" | "practical" | "summaries" | "exams" | "references"

OUTPUT INSTRUCTIONS:
Return strictly a valid JSON object (no markdown quotes, no explanations) adhering to this schema:
{
  "materials": [
    {
      "title": "Clean, concise Arabic title describing the material (e.g. 'تفريغات د. شيرين - هستولوجي الدم')",
      "titleEn": "Concise English title (optional)",
      "description": "Short informative Arabic description of what the material contains",
      "descriptionEn": "Short English description (optional)",
      "url": "Direct link to this specific resource",
      "type": "One of the valid resource types above",
      "category": "One of the valid categories above",
      "year": 1 | 2 | 3 | 4 | 5,
      "moduleId": "Matching module ID from the reference list above or best fit",
      "subject": "Subject name (e.g. 'Pathology', 'Physiology', 'Histology', 'Anatomy', 'Biochemistry', 'Pharmacology', 'Microbiology', 'Internal Medicine', 'Surgery', 'Pediatrics', 'Obstetrics & Gynecology')",
      "author": "Doctor or creator name if mentioned (e.g. 'د. شيرين')",
      "tags": ["Array of 2-5 relevant keywords"],
      "videos": [
        {
          "id": "Unique video identifier",
          "title": "Video title",
          "youtubeId": "YouTube video ID",
          "url": "Video URL",
          "duration": "Video duration (optional)"
        }
      ]
    }
  ]
}

IMPORTANT RULES:
1. If the message contains multiple links or resources, return an entry in "materials" for EACH resource/link.
2. If only one resource is present, return an array with that single item.
3. Extract ALL available information from the text - do not leave fields empty if the information is present.
4. For YouTube playlist links (URLs containing 'list=' or 'playlist'), set type to "playlist" and extract the playlistId from the URL (the value after 'list=').
5. For Google Drive links, set type to "drive" and use the URL as-is.
6. Infer year, module, and subject from context clues in the text.
7. If the text is in Arabic, provide Arabic titles/descriptions. If in English, provide English ones. If mixed, provide both.
8. For playlists, if individual video information is available in the text, populate the "videos" array with {id, title, youtubeId, url, duration} for each video.`;
}

/**
 * Normalizes and validates an individual extracted material object.
 */
const VALID_TYPES: ResourceType[] = ['drive', 'telegram', 'youtube', 'playlist', 'whatsapp', 'book', 'summary', 'exam', 'website', 'other'];
const VALID_CATEGORIES: MaterialCategory[] = ['central', 'lectures', 'practical', 'summaries', 'exams', 'references'];

function normalizeParsedItem(
  item: any,
  rawMessage: string,
  modules: ModuleInfo[],
  fallbackUrl = ''
): ParsedAIMaterial {
  const url = (item?.url || fallbackUrl || '').trim();
  const detectedType = VALID_TYPES.includes(item?.type) ? item.type : detectResourceType(url);

  const validYear = (
    typeof item?.year === 'number' && item.year >= 1 && item.year <= 5
      ? item.year
      : 2
  ) as AcademicYear;

  const yearModules = modules.filter((m) => m.year === validYear);
  let matchedModule = modules.find((m) => m.id === item?.moduleId);
  if (!matchedModule) {
    if (item?.subject) {
      const subLower = String(item.subject).toLowerCase();
      matchedModule = yearModules.find((m) =>
        m.subjects.some((s) => s.toLowerCase() === subLower)
      );
    }
    if (!matchedModule) {
      matchedModule = yearModules[0] || modules[0];
    }
  }

  const finalModuleId = matchedModule?.id || modules[0]?.id || '';
  const finalYear = (matchedModule?.year || validYear) as AcademicYear;

  let title = (item?.title || '').trim();
  if (!title) {
    if (item?.author && item?.subject) {
      title = `${item.author} - ${item.subject}`;
    } else {
      title = 'مصدر دراسي جديد';
    }
  }

  const isPlaylist = detectedType === 'playlist';
  const playlistId = isPlaylist && url.includes('list=')
    ? url.split('list=')[1]?.split('&')[0]
    : undefined;

  const rawAuthor = item?.author;
  const author = Array.isArray(rawAuthor)
    ? rawAuthor.filter(Boolean).join('، ')
    : typeof rawAuthor === 'string' ? rawAuthor.trim() : undefined;

  return {
    title,
    titleEn: item?.titleEn?.trim() || undefined,
    description: item?.description?.trim() || undefined,
    descriptionEn: item?.descriptionEn?.trim() || undefined,
    url,
    urls: url ? [url] : extractUrls(rawMessage),
    type: detectedType,
    category: VALID_CATEGORIES.includes(item?.category) ? item.category : (isPlaylist ? 'lectures' : 'summaries'),
    year: finalYear,
    moduleId: finalModuleId,
    subject: item?.subject?.trim() || 'عام',
    author,
    tags: Array.isArray(item?.tags) ? item.tags.filter(Boolean) : [],
    playlistId,
    videos: Array.isArray(item?.videos) ? item.videos : undefined
  };
}

/**
 * Parses and validates the raw JSON text returned by Gemini.
 * Supports single item, array, or { materials: [...] } structures.
 */
export function parseAIResponseJson(
  rawText: string,
  rawMessage: string,
  modules: ModuleInfo[]
): ParsedAIMaterial[] {
  try {
    let cleanText = rawText.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }

    const parsed = JSON.parse(cleanText);

    let rawList: any[] = [];
    if (Array.isArray(parsed.materials)) {
      rawList = parsed.materials;
    } else if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && typeof parsed === 'object') {
      rawList = [parsed];
    }

    if (rawList.length === 0) {
      return fallbackParseDumpText(rawMessage, modules);
    }

    return rawList.map((item) => normalizeParsedItem(item, rawMessage, modules));
  } catch (err) {
    console.warn('[AI Parser] JSON parse failed, utilizing heuristic fallback:', err);
    return fallbackParseDumpText(rawMessage, modules);
  }
}

/**
 * Resource type detection from URL.
 */
export function detectResourceType(url: string): ResourceType {
  const u = url.toLowerCase();
  if (u.includes('drive.google.com')) return 'drive';
  if (u.includes('t.me') || u.includes('telegram')) return 'telegram';
  if (u.includes('youtube.com/playlist') || u.includes('list=')) return 'playlist';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('chat.whatsapp.com') || u.includes('wa.me')) return 'whatsapp';
  if (u.endsWith('.pdf') || u.includes('mega.nz') || u.includes('mediafire.com')) return 'summary';
  return 'other';
}

/**
 * Smart heuristic fallback parser when AI API is unavailable.
 * Extracts every URL and creates structured materials with line-specific context.
 */
export function fallbackParseDumpText(
  rawText: string,
  modules: ModuleInfo[]
): ParsedAIMaterial[] {
  const urls = extractUrls(rawText);
  if (urls.length === 0) {
    return [parseSingleTextContext(rawText, '', [], modules)];
  }

  // If only 1 URL found
  if (urls.length === 1) {
    return [parseSingleTextContext(rawText, urls[0], urls, modules)];
  }

  // If multiple URLs found, split rawText into lines to find per-URL context
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: ParsedAIMaterial[] = [];

  for (const url of urls) {
    // Find the line containing this URL
    const lineIndex = lines.findIndex((l) => l.includes(url));
    let contextText = url;
    if (lineIndex !== -1) {
      // Collect surrounding lines for context
      const prev = lineIndex > 0 ? lines[lineIndex - 1] : '';
      const curr = lines[lineIndex];
      const next = lineIndex < lines.length - 1 ? lines[lineIndex + 1] : '';
      contextText = [prev, curr, next].filter(Boolean).join('\n');
    }

    items.push(parseSingleTextContext(contextText, url, urls, modules));
  }

  return items;
}

/**
 * Heuristic parsing of a single resource with its surrounding text context.
 */
function parseSingleTextContext(
  text: string,
  url: string,
  allUrls: string[],
  modules: ModuleInfo[]
): ParsedAIMaterial {
  const type = detectResourceType(url);
  const lower = text.toLowerCase();

  // Detect Academic Year
  let year: AcademicYear = 2;
  if (/سنة\s*(أولى|اولى|1)|first\s*year|year\s*1/i.test(text)) year = 1;
  else if (/سنة\s*(ثانية|تانية|2)|second\s*year|year\s*2/i.test(text)) year = 2;
  else if (/سنة\s*(ثالثة|تالتة|3)|third\s*year|year\s*3/i.test(text)) year = 3;
  else if (/سنة\s*(رابعة|4)|fourth\s*year|year\s*4/i.test(text)) year = 4;
  else if (/سنة\s*(خامسة|5)|fifth\s*year|year\s*5/i.test(text)) year = 5;

  // Detect Subject
  let subject = 'عام';
  if (lower.includes('باثولوجي') || lower.includes('patho')) subject = 'Pathology';
  else if (lower.includes('فارما') || lower.includes('pharma')) subject = 'Pharmacology';
  else if (lower.includes('فسيولوجي') || lower.includes('physio')) subject = 'Physiology';
  else if (lower.includes('اناتومي') || lower.includes('anatomy')) subject = 'Anatomy';
  else if (lower.includes('هستولوجي') || lower.includes('histo')) subject = 'Histology';
  else if (lower.includes('بايو') || lower.includes('biochem')) subject = 'Biochemistry';
  else if (lower.includes('مايكرو') || lower.includes('micro')) subject = 'Microbiology';
  else if (lower.includes('باطنة') || lower.includes('internal medicine')) subject = 'Internal Medicine';
  else if (lower.includes('جراحة') || lower.includes('surgery')) subject = 'Surgery';
  else if (lower.includes('اطفال') || lower.includes('أطفال') || lower.includes('pediatric')) subject = 'Pediatrics';
  else if (lower.includes('نسا') || lower.includes('توليد') || lower.includes('gynecology') || lower.includes('obs')) subject = 'Obstetrics & Gynecology';

  // Detect Doctor / Author
  let author: string | undefined = undefined;
  const docMatch = text.match(/د[\.\s]+([^\s\n،,:-]+(?:\s+[^\s\n،,:-]+)?)/i);
  if (docMatch) {
    author = `د. ${docMatch[1].trim()}`;
  }

  // Detect Category
  let category: MaterialCategory = 'summaries';
  if (type === 'youtube' || type === 'playlist') category = 'lectures';
  else if (lower.includes('عملي') || lower.includes('lab') || lower.includes('practical')) category = 'practical';
  else if (lower.includes('امتحان') || lower.includes('quiz') || lower.includes('أسئلة') || lower.includes('exam')) category = 'exams';
  else if (lower.includes('كتاب') || lower.includes('مرجع') || lower.includes('book')) category = 'references';
  else if (lower.includes('درايف الدفعة') || lower.includes('قناة الدفعة') || lower.includes('رسمي')) category = 'central';

  // Best matching module
  const yearModules = modules.filter((m) => m.year === year);
  const matchedModule =
    yearModules.find((m) => m.subjects.some((s) => s.toLowerCase() === subject.toLowerCase())) ||
    yearModules[0] ||
    modules[0];

  // Title generation
  const cleanLine = text
    .replace(url, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[\n\r]+/g, ' ')
    .trim();

  let title = cleanLine.length > 5 && cleanLine.length < 80 ? cleanLine : '';
  if (!title) {
    title = author
      ? `${author} - ${subject !== 'عام' ? subject : matchedModule?.title || 'مادة علمية'}`
      : `مصدر ${subject !== 'عام' ? subject : matchedModule?.title || 'دراسي'}`;
  }

  const isPlaylist = type === 'playlist';
  const playlistId = isPlaylist && url.includes('list=')
    ? url.split('list=')[1]?.split('&')[0]
    : undefined;

  const description = cleanLine.length > 5 && cleanLine.length < 200
    ? cleanLine
    : undefined;

  return {
    title,
    url,
    urls: allUrls.length > 0 ? allUrls : [url],
    type,
    category,
    year,
    moduleId: matchedModule?.id || modules[0]?.id || '',
    subject,
    author,
    description,
    playlistId: isPlaylist ? playlistId : undefined,
    tags: [subject, type].filter((t) => t !== 'عام')
  };
}
