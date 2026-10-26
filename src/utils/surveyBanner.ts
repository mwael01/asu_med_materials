/**
 * Utilities for managing the non-disruptive Google Form survey banner and friendly popup state.
 */

export const GOOGLE_FEEDBACK_FORM_URL = 'https://forms.gle/zkLCxQqaN4HFY3JH8';
export const SURVEY_COMPLETED_KEY = 'asumed_survey_completed';
export const SURVEY_DISMISSED_UNTIL_KEY = 'asumed_survey_dismissed_until';
export const SURVEY_SNOOZE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (1 month)

export function isSurveyExcludedPath(pathname: string): boolean {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  return clean === '/admin' || clean.startsWith('/admin/') || clean === '/feedback';
}

export function isSurveyCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SURVEY_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markSurveyCompleted(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SURVEY_COMPLETED_KEY, 'true');
  } catch {}
}

export function isSurveySnoozed(now = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const until = Number(localStorage.getItem(SURVEY_DISMISSED_UNTIL_KEY) || '0');
    return now < until;
  } catch {
    return false;
  }
}

export function snoozeSurveyBanner(durationMs = SURVEY_SNOOZE_DURATION_MS, now = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SURVEY_DISMISSED_UNTIL_KEY, String(now + durationMs));
  } catch {}
}

export function shouldShowSurveyBanner(
  pathname: string,
  completed = isSurveyCompleted(),
  snoozed = isSurveySnoozed()
): boolean {
  if (completed || snoozed) return false;
  return !isSurveyExcludedPath(pathname);
}
