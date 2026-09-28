import type { MaterialSubmission, SubmissionResponse } from '../types/submission';
import { saveSubmissionToFirestore } from '../firebase/firestore';
import { getCachedUserProfile } from '../firebase/auth';
import type { SubmissionDocument } from '../firebase/schema';

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
 * Submits payload directly to Cloud Firestore (submissions collection)
 */
export async function submitMaterial(payload: MaterialSubmission): Promise<SubmissionResponse> {
  try {
    const urls =
      payload.mode === 'single'
        ? payload.url
          ? [payload.url]
          : []
        : extractUrls(payload.content);

    const cachedProfile = getCachedUserProfile();
    const contributorName =
      (payload.mode === 'single' ? payload.addedBy : payload.contributor) ||
      cachedProfile?.displayName ||
      cachedProfile?.username ||
      'فاعل خير';

    const title =
      (payload.mode === 'single' ? payload.title : payload.notes) ||
      (urls[0] ? 'مساهمة طلابية' : 'مساهمة جديدة');

    const subDoc: SubmissionDocument = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      mode: payload.mode,
      title: title.trim() || 'مساهمة جديدة',
      url: payload.mode === 'single' ? payload.url : urls[0] || undefined,
      content: payload.mode === 'dump' ? payload.content : payload.url,
      urls,
      contributor: contributorName,
      contributorUid: cachedProfile?.uid,
      year: payload.year || 'general',
      moduleId: payload.moduleId,
      subject: payload.mode === 'single' ? payload.subject : undefined,
      type: payload.mode === 'single' ? payload.type : undefined,
      notes: payload.mode === 'dump' ? payload.notes : payload.description,
      status: 'pending',
      timestamp: new Date().toISOString()
    };

    const docId = await saveSubmissionToFirestore(subDoc);
    if (!docId) {
      return {
        success: false,
        error: 'تعذر حفظ المساهمة. يرجى التأكد من اتصال الإنترنت والمحاولة مرة أخرى.'
      };
    }

    return {
      success: true,
      timestamp: subDoc.timestamp
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'حدث خطأ غير متوقع أثناء إرسال المساهمة.'
    };
  }
}
