import type { AcademicYear, ResourceType } from './materials';

export type SubmissionMode = 'dump' | 'single';

export interface QuickDumpSubmission {
  mode: 'dump';
  content: string; // The raw text block / WhatsApp message / multiple links
  contributor?: string; // Contributor name or team (optional)
  year?: AcademicYear | 'general';
  moduleId?: string;
  notes?: string;
}

export interface DetailedSubmission {
  mode: 'single';
  title?: string;
  url: string;
  type?: ResourceType;
  year?: AcademicYear | 'general';
  moduleId?: string;
  subject?: string;
  author?: string; // Content creator / Doctor / Lecturer
  addedBy?: string; // Student contributor
  description?: string;
}

export type MaterialSubmission = QuickDumpSubmission | DetailedSubmission;

export interface SubmissionResponse {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  fallbackUrl?: string;
  error?: string;
  details?: unknown;
}
