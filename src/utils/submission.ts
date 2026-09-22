import type { MaterialSubmission, SubmissionResponse } from '../types/submission';

/**
 * Extracts and normalizes URLs from arbitrary text
 */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /(?:https?:\/\/|ftps?:\/\/|www\.|(?:t\.me|drive\.google\.com|youtube\.com|youtu\.be|mega\.nz|notion\.site|notion\.so|mediafire\.com)\/)[^\s<>"'{}|\\^`\[\]]+/gi;
  const matches = text.match(urlRegex) || [];

  const normalized = matches.map((raw) => {
    let u = raw.trim().replace(/[\.\,\:\;\!\؟\?]+$/, '');
    if (!/^https?:\/\//i.test(u)) {
      u = `https://${u}`;
    }
    return u;
  });

  return Array.from(new Set(normalized));
}

/**
 * Identifies the platforms represented by a list of URLs
 */
export function detectPlatformTags(urls: string[]): string[] {
  const platforms = new Set<string>();
  for (const u of urls) {
    const lower = u.toLowerCase();
    if (lower.includes('drive.google.com')) platforms.add('Google Drive');
    else if (lower.includes('t.me') || lower.includes('telegram')) platforms.add('Telegram');
    else if (lower.includes('youtube.com') || lower.includes('youtu.be')) platforms.add('YouTube');
    else if (lower.includes('whatsapp.com') || lower.includes('wa.me')) platforms.add('WhatsApp');
    else if (lower.includes('mega.nz') || lower.includes('mediafire.com')) platforms.add('Cloud Drive');
    else platforms.add('Link');
  }
  return Array.from(platforms);
}

/**
 * Generates direct prefilled GitHub issue URL as a fallback
 */
export function generateFallbackUrl(title: string, body: string): string {
  return `https://github.com/mwael01/asu_med_materials/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/**
 * Submits payload to the API handler
 */
export async function submitMaterial(payload: MaterialSubmission): Promise<SubmissionResponse> {
  try {
    const response = await fetch('/api/submit-material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    return result;
  } catch (err: any) {
    const fallbackTitle = payload.mode === 'dump'
      ? '[تفريغ مصادر]: رسالة مجمعة'
      : `[إضافة مصدر]: ${payload.title || payload.url}`;
    const fallbackBody = payload.mode === 'dump'
      ? payload.content
      : `الرابط: ${payload.url}\nالعنوان: ${payload.title || ''}\nالملاحظات: ${payload.description || ''}`;

    return {
      success: false,
      fallbackUrl: generateFallbackUrl(fallbackTitle, fallbackBody),
      error: 'تعذر الاتصال بالخادم. يمكنك فتح التذكرة على GitHub مباشرة لحفظ مصادرك.'
    };
  }
}
