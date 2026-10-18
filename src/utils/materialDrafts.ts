import type { DraftCredit, MaterialDraft, ParsedAIMaterial, ReviewIssue } from '../types/ai';
import type { MaterialItem, ModuleInfo } from '../types/materials';
import type { UserProfile } from '../types/profile';
import { VALID_CATEGORIES, VALID_TYPES } from './aiParser';
import { isHttpUrl } from './materialLinks';
export function draftCredit(admin: UserProfile | null, source?: Partial<DraftCredit>): DraftCredit {
  if (source?.sourceSubmissionId) return {
    contributor:source.contributor || 'فاعل خير', contributorUid:source.contributorUid,
    contributorUsername:source.contributorUsername, sourceSubmissionId:source.sourceSubmissionId,
  };
  return {contributor:admin?.displayName || admin?.username || 'الإدارة', contributorUid:admin?.uid, contributorUsername:admin?.username};
}
export function createDraft(item: Partial<ParsedAIMaterial>, credit: DraftCredit): MaterialDraft {
  const id = crypto.randomUUID();
  return {title:'', url:'', urls:[], type:'other', moduleId:'', tags:[], ...item, ...credit, stagedId:id, materialId:`mat_${id}`, selected:true, isDuplicate:false};
}
export function validateDraft(draft: ParsedAIMaterial, modules: ModuleInfo[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const add = (field: string, message: string) => issues.push({field, message});
  const effectiveTitle = draft.title?.trim() || draft.titleEn?.trim();
  if (!effectiveTitle) add('title', 'Title is required');
  if (!isHttpUrl(draft.url)) add('url', 'Valid HTTP URL required');
  if (!draft.year || !Number.isInteger(draft.year) || draft.year < 1 || draft.year > 5) add('year', 'Select a year');
  if (!VALID_TYPES.includes(draft.type)) add('type', 'Select a resource type');
  if (!draft.category || !VALID_CATEGORIES.includes(draft.category)) add('category', 'Select a category');
  if (draft.moduleId && !modules.some(m => m.id === draft.moduleId && m.year === draft.year && m.active !== false)) add('moduleId', 'Module must match year');
  for (const video of draft.videos || []) {
    if (!video.title.trim() || !(video.youtubeId && /^[\w-]{11}$/.test(video.youtubeId) || video.url && isHttpUrl(video.url))) add('videos', 'Complete each video title and link');
  }
  for (const doc of draft.documents || []) {
    if (!doc.title?.trim() || !doc.url || !isHttpUrl(doc.url)) add('documents', 'Complete each document title and link');
  }
  return issues;
}
export function serializeDraft(draft: MaterialDraft, modules: ModuleInfo[]): MaterialItem {
  const errors = validateDraft(draft, modules); if (errors.length) throw new Error(errors.map(i => i.message).join('\n'));
  const authors = (Array.isArray(draft.author) ? draft.author : [draft.author || '']).map(s => s.trim()).filter(Boolean);
  const title = (draft.title?.trim() || draft.titleEn?.trim() || '');
  const titleEn = draft.titleEn?.trim() || title;
  const desc = draft.description?.trim() || draft.descriptionEn?.trim() || undefined;
  return {
    id: draft.materialId,
    title,
    titleEn,
    description: desc,
    descriptionEn: draft.descriptionEn?.trim() || desc,
    url: draft.url.trim(),
    type: draft.type,
    category: draft.category,
    year: draft.year!,
    moduleId: draft.moduleId || undefined,
    subject: draft.subject?.trim() || undefined,
    lessonId: draft.lessonId?.trim() || undefined,
    author: authors.length ? authors : undefined,
    tags: [...new Set(draft.tags.map(t => t.trim()).filter(Boolean))],
    contributorUid: draft.contributorUid,
    contributorUsername: draft.contributorUsername,
    playlistId: draft.type === 'playlist' ? new URL(draft.url).searchParams.get('list') || draft.playlistId : undefined,
    videos: draft.type === 'playlist' ? draft.videos : undefined,
    documents: draft.documents && draft.documents.length > 0 ? draft.documents : undefined,
    createdAt: new Date().toISOString(),
  };
}
