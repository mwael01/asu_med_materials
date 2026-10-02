import type { MaterialDraft } from '../types/ai';
import type { MaterialItem, ModuleInfo } from '../types/materials';
import { serializeDraft } from './materialDrafts';

interface PublishServices {
  save: (material: MaterialItem) => Promise<boolean>;
  credit: (uid: string) => Promise<void>;
  audit: (material: MaterialItem) => Promise<boolean>;
}
/** Partial saves retain failed drafts; accounting failures must never cause a saved item to be republished. */
export async function publishMaterialDrafts(drafts: MaterialDraft[], modules: ModuleInfo[], services: PublishServices) {
  const materials = drafts.map(draft => serializeDraft(draft, modules));
  const saved: MaterialDraft[] = [], failed: MaterialDraft[] = [], warnings: string[] = [];
  for (const [index, draft] of drafts.entries()) {
    if (draft.saved) { saved.push(draft); continue; }
    const material = materials[index];
    try {
      if (!await services.save(material)) { failed.push(draft); continue; }
    } catch { failed.push(draft); continue; }
    draft.saved = true; saved.push(draft);
    try { if (material.contributorUid) await services.credit(material.contributorUid); }
    catch { warnings.push('تم الحفظ لكن تعذر تحديث عدد المساهمات / Saved, but contribution count update failed'); }
    try { if (!await services.audit(material)) warnings.push('تم الحفظ لكن تعذر تسجيل النشاط / Saved, but activity logging failed'); }
    catch { warnings.push('تم الحفظ لكن تعذر تسجيل النشاط / Saved, but activity logging failed'); }
  }
  return {saved, failed, warnings};
}
