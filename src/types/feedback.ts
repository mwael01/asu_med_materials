import type { AcademicYear } from './materials';

export type FeedbackCategory =
  | 'suggestion'     // اقتراح ميزة أو فكرة جديدة
  | 'content_issue' // تصحيح محتوى أو رابط لا يعمل
  | 'bug'           // مشكلة تقنية في الموقع
  | 'general';      // رأي عام أو رسالة لفريق العمل

export interface FeedbackSubmission {
  category: FeedbackCategory;
  message: string;
  year?: AcademicYear | 'general';
  moduleId?: string;
  senderName?: string;
  contact?: string; // Telegram / WhatsApp / Email
  pageUrl?: string; // Context page
}

export interface FeedbackResponse {
  success: boolean;
  timestamp?: string;
  mock?: boolean;
  row?: number;
  error?: string;
  details?: unknown;
}
