import type { AcademicYear, MaterialCategory, ResourceType, ModuleInfo } from '../types/materials';
import { extractUrls } from './submission';

export interface ParsedAIMaterial {
  title: string;
  titleEn?: string;
  description?: string;
  url: string;
  urls: string[];
  type: ResourceType;
  category: MaterialCategory;
  year: AcademicYear;
  moduleId: string;
  subject?: string;
  author?: string;
  tags: string[];
}

/**
 * Builds a structured Gemini extraction prompt tailored to Ain Shams Medical curriculum.
 */
export function buildExtractionPrompt(rawMessage: string, modules: ModuleInfo[]): string {
  const moduleSummary = modules.slice(0, 30).map((m) => ({
    id: m.id,
    title: m.title,
    year: m.year,
    subjects: m.subjects
  }));

  return `You are an AI assistant for Ain Shams University Faculty of Medicine study platform (ASU Med Materials).
Analyze the following student message/WhatsApp announcement or study material dump and extract structured material metadata into JSON.

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
Return strictly a valid JSON object (no markdown quotes, no explanations) adhering to this TypeScript interface:
{
  "title": "Clean, concise Arabic title describing the material (e.g. 'تفريغات د. شيرين - هستولوجي الدم')",
  "titleEn": "Concise English title (optional)",
  "description": "Short informative description of what the material contains",
  "url": "The primary clean resource link (Drive, YouTube, Telegram, etc.)",
  "urls": ["All valid URLs detected in the message"],
  "type": "One of the valid resource types above",
  "category": "One of the valid categories above",
  "year": 1 | 2 | 3 | 4 | 5,
  "moduleId": "Matching module ID from the reference list above (e.g. 'year2-blood', 'year1-foundation', etc.) or best fit",
  "subject": "Subject name in English or Arabic (e.g. 'Pathology', 'Physiology', 'Histology', 'Anatomy', 'Biochemistry', 'Pharmacology', 'Microbiology', 'Internal Medicine', 'Surgery', 'Pediatrics', 'Obstetrics & Gynecology')",
  "author": "Doctor or creator name who authored the material if mentioned (e.g. 'د. شيرين', 'د. عبد المنعم', 'د. موافي', 'اتحاد الطلاب')",
  "tags": ["Array of 2-5 relevant keywords"]
}`;
}

/**
 * Parses and validates the raw JSON text returned by Gemini.
 */
export function parseAIResponseJson(
  rawText: string,
  rawMessage: string,
  modules: ModuleInfo[]
): ParsedAIMaterial {
  try {
    // Strip markdown code block indicators if model wrapped response in ```json ... ```
    let cleanText = rawText.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }

    const parsed = JSON.parse(cleanText);
    const urls = Array.isArray(parsed.urls) && parsed.urls.length > 0 ? parsed.urls : extractUrls(rawMessage);
    const primaryUrl = parsed.url || urls[0] || '';

    // Verify module ID exists, fallback to first module or default
    const matchedModule = modules.find((m) => m.id === parsed.moduleId);
    const validYear = (parsed.year >= 1 && parsed.year <= 5 ? parsed.year : matchedModule?.year || 2) as AcademicYear;
    const finalModuleId = matchedModule ? matchedModule.id : modules.find((m) => m.year === validYear)?.id || 'year2-blood';

    return {
      title: parsed.title || 'مصدر دراسي جديد',
      titleEn: parsed.titleEn || undefined,
      description: parsed.description || undefined,
      url: primaryUrl,
      urls,
      type: parsed.type || detectResourceType(primaryUrl),
      category: parsed.category || 'summaries',
      year: validYear,
      moduleId: finalModuleId,
      subject: parsed.subject || 'عام',
      author: parsed.author || undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags : []
    };
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
 */
export function fallbackParseDumpText(
  rawText: string,
  modules: ModuleInfo[]
): ParsedAIMaterial {
  const urls = extractUrls(rawText);
  const primaryUrl = urls[0] || '';
  const type = detectResourceType(primaryUrl);

  const lower = rawText.toLowerCase();

  // Detect Academic Year
  let year: AcademicYear = 2;
  if (/سنة\s*(أولى|اولى|1)|first\s*year|year\s*1/i.test(rawText)) year = 1;
  else if (/سنة\s*(ثانية|تانية|2)|second\s*year|year\s*2/i.test(rawText)) year = 2;
  else if (/سنة\s*(ثالثة|تالتة|3)|third\s*year|year\s*3/i.test(rawText)) year = 3;
  else if (/سنة\s*(رابعة|4)|fourth\s*year|year\s*4/i.test(rawText)) year = 4;
  else if (/سنة\s*(خامسة|5)|fifth\s*year|year\s*5/i.test(rawText)) year = 5;

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
  const docMatch = rawText.match(/د[\.\s]+([^\s\n،,:-]+(?:\s+[^\s\n،,:-]+)?)/i);
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
  const matchedModule = yearModules.find((m) =>
    m.subjects.some((s) => s.toLowerCase() === subject.toLowerCase())
  ) || yearModules[0] || modules[0];

  // Title generation
  const firstLine = rawText.split('\n')[0].replace(primaryUrl, '').replace(/https?:\/\/[^\s]+/g, '').trim();
  const title = firstLine.length > 5 && firstLine.length < 90
    ? firstLine
    : author
      ? `${author} - ${subject !== 'عام' ? subject : matchedModule?.title || 'مادة علمية'}`
      : `مصدر ${subject !== 'عام' ? subject : matchedModule?.title || 'دراسي'}`;

  return {
    title,
    url: primaryUrl,
    urls,
    type,
    category,
    year,
    moduleId: matchedModule ? matchedModule.id : 'year2-blood',
    subject,
    author,
    tags: [subject, type].filter((t) => t !== 'عام')
  };
}
