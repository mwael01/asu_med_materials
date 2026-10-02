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
  if (!draft.title.trim()) add('title','أضف العنوان العربي / Arabic title required');
  if (!draft.titleEn?.trim()) add('titleEn','أضف العنوان الإنجليزي / English title required');
  if (!isHttpUrl(draft.url)) add('url','أضف رابط HTTP صالح / Valid HTTP URL required');
  if (!draft.year || !Number.isInteger(draft.year) || draft.year < 1 || draft.year > 5) add('year','اختر السنة / Select a year');
  if (!VALID_TYPES.includes(draft.type)) add('type','اختر نوع المصدر / Select a resource type');
  if (!draft.category || !VALID_CATEGORIES.includes(draft.category)) add('category','اختر التصنيف / Select a category');
  if (draft.moduleId && !modules.some(m => m.id === draft.moduleId && m.year === draft.year && m.active !== false)) add('moduleId','الموديول لا يطابق السنة / Module must match year');
  if (Boolean(draft.description?.trim()) !== Boolean(draft.descriptionEn?.trim())) add('description','أكمل الوصف باللغتين أو احذف الوصف / Complete both descriptions or remove both');
  for (const video of draft.videos || []) {
    if (!video.title.trim() || !(video.youtubeId && /^[\w-]{11}$/.test(video.youtubeId) || video.url && isHttpUrl(video.url))) add('videos','أكمل عنوان ورابط كل فيديو / Complete each video title and link');
  }
  return issues;
}
export function serializeDraft(draft: MaterialDraft, modules: ModuleInfo[]): MaterialItem {
  const errors = validateDraft(draft, modules); if (errors.length) throw new Error(errors.map(i => i.message).join('\n'));
  const authors = (Array.isArray(draft.author) ? draft.author : [draft.author || '']).map(s => s.trim()).filter(Boolean);
  return {
    id:draft.materialId, title:draft.title.trim(), titleEn:draft.titleEn?.trim(),
    description:draft.description?.trim() || undefined, descriptionEn:draft.descriptionEn?.trim() || undefined,
    url:draft.url.trim(), type:draft.type, category:draft.category, year:draft.year!, moduleId:draft.moduleId || undefined,
    subject:draft.subject?.trim() || undefined, author:authors.length ? authors : undefined,
    tags:[...new Set(draft.tags.map(t => t.trim()).filter(Boolean))],
    addedBy:draft.contributor, contributorUid:draft.contributorUid, contributorUsername:draft.contributorUsername,
    added_by_username:draft.contributorUsername,
    playlistId:draft.type === 'playlist' ? new URL(draft.url).searchParams.get('list') || draft.playlistId : undefined,
    videos:draft.type === 'playlist' ? draft.videos : undefined, createdAt:new Date().toISOString(),
  };
}
