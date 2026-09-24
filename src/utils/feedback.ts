import type { FeedbackSubmission, FeedbackResponse } from '../types/feedback';

/**
 * Submits feedback payload to the API handler (/api/submit-feedback)
 */
export async function submitFeedback(payload: FeedbackSubmission): Promise<FeedbackResponse> {
  try {
    const response = await fetch('/api/submit-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    return result;
  } catch (err: any) {
    return {
      success: false,
      error: 'تعذر الاتصال بالخادم. يرجى التأكد من اتصال الإنترنت والمحاولة مرة أخرى.'
    };
  }
}
