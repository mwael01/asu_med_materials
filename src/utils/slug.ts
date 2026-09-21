/**
 * Utility functions for slugifying subject names and matching slugs
 */

export function subjectToSlug(subject: string): string {
  return subject
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugToSubject(slug: string, subjects: string[]): string | undefined {
  return subjects.find((s) => subjectToSlug(s) === slug);
}
