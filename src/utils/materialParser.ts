import type { MaterialItem } from '../types/materials';

export function detectType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('drive.google.com')) return 'drive';
  if (u.includes('t.me') || u.includes('telegram.me')) return 'telegram';
  if (u.includes('youtube.com/playlist')) return 'playlist';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('chat.whatsapp.com') || u.includes('wa.me')) return 'whatsapp';
  if (u.endsWith('.pdf') || u.includes('mega.nz') || u.includes('mediafire.com')) return 'summary';
  return 'other';
}

export function slugify(text: string, index: number = 0): string {
  const clean = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const rand = Math.random().toString(36).substring(2, 6);
  return clean ? `${clean}-${rand}` : `mat-${Date.now().toString(36)}-${index + 1}`;
}

export interface ParseOptions {
  year?: number;
  moduleId?: string;
  subject?: string;
  author?: string;
  contributor?: string;
  addedBy?: string;
}

export function parseDumpText(rawText: string, options: ParseOptions = {}): MaterialItem[] {
  const lines = rawText.split(/\r?\n/);
  const items: MaterialItem[] = [];
  const urlRegex = /(?:https?:\/\/|www\.|(?:t\.me|drive\.google\.com|youtube\.com|youtu\.be|mega\.nz|mediafire\.com)\/)[^\s<>"'{}|\\^`\[\]]+/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const urls = line.match(urlRegex);
    if (!urls) continue;

    for (const rawUrl of urls) {
      let cleanUrl = rawUrl.trim().replace(/[\.\,\:\;\!\؟\?]+$/, '');
      if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = `https://${cleanUrl}`;
      }

      let lineTitle = line
        .replace(rawUrl, '')
        .replace(/^[\d\.\-\*\#\:\s]+/, '')
        .trim()
        .replace(/[:\-–ـ،,\s]+$/, '')
        .trim();

      if (!lineTitle && i > 0 && !lines[i - 1].match(urlRegex)) {
        lineTitle = lines[i - 1]
          .replace(/^[\d\.\-\*\#\:\s]+/, '')
          .trim()
          .replace(/[:\-–ـ،,\s]+$/, '')
          .trim();
      }

      const type = detectType(cleanUrl);
      const title = lineTitle || `مصدر ${type.toUpperCase()}`;

      items.push({
        id: slugify(title, items.length),
        title,
        url: cleanUrl,
        type: type as MaterialItem['type'],
        year: (options.year || 2) as MaterialItem['year'],
        moduleId: options.moduleId || 'year2-blood',
        subject: options.subject || 'عام',
        author: options.author || undefined,
        addedBy: options.contributor || options.addedBy || 'فاعل خير',
        tags: [type, options.subject || 'عام'].filter(Boolean)
      });
    }
  }

  return items;
}
