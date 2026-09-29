import type { FeedbackSubmission, FeedbackResponse } from '../types/feedback';
import { saveFeedbackToFirestore } from '../firebase/firestore';
import { getCachedUserProfile } from '../firebase/auth';
import type { FeedbackDocument } from '../firebase/schema';

/**
 * Submits feedback payload directly to Cloud Firestore (feedback collection)
 */
export async function submitFeedback(payload: FeedbackSubmission): Promise<FeedbackResponse> {
  try {
    const cachedProfile = getCachedUserProfile();
    const senderName =
      payload.senderName ||
      cachedProfile?.displayName ||
      cachedProfile?.username ||
      'فاعل خير';

    const fbDoc: FeedbackDocument = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      category: payload.category,
      message: payload.message,
      year: payload.year,
      moduleId: payload.moduleId,
      senderName,
      senderUid: cachedProfile?.uid,
      contact: payload.contact,
      pageUrl: payload.pageUrl,
      status: 'new',
      timestamp: new Date().toISOString()
    };

    const docId = await saveFeedbackToFirestore(fbDoc);
    if (!docId) {
      return {
        success: false,
        error: 'تعذر حفظ الملاحظات. يرجى التأكد من اتصال الإنترنت والمحاولة مرة أخرى.'
      };
    }

    return {
      success: true,
      timestamp: fbDoc.timestamp
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'حدث خطأ غير متوقع أثناء إرسال الملاحظات.'
    };
  }
}
