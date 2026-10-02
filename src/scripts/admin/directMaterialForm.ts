import { parseMaterialMessageWithAI } from '../../firebase/ai';
import { getCachedUserProfile } from '../../firebase/auth';
import { checkUrlsBatchInFirestore, saveMaterialToFirestore, incrementUserContributionsCount, logAdminAction, updateSubmissionStatus } from '../../firebase/firestore';
import type { DraftCredit, MaterialDraft } from '../../types/ai';
import type { ModuleInfo } from '../../types/materials';
import { createDraft, draftCredit, validateDraft } from '../../utils/materialDrafts';
import { publishMaterialDrafts } from '../../utils/publishMaterialDrafts';
import { materialUrlKey } from '../../utils/materialLinks';
import { getCurrentLanguage } from '../../utils/i18n';
import { showToast } from '../../utils/toast';
import { mountMaterialEditor } from './materialEditor';

export function initDirectMaterialForm(): void {
  const root = document.getElementById('admin-direct-form-root');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const modules: ModuleInfo[] = JSON.parse(root.dataset.modules || '[]');
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const form = get<HTMLFormElement>('admin-direct-form');
  const aiInput = get<HTMLTextAreaElement>('admin-ai-input');
  const aiButton = get<HTMLButtonElement>('admin-ai-extract-btn');
  const notice = get('admin-ai-notice');
  let source: Partial<DraftCredit> | undefined;
  let single = createDraft({}, draftCredit(getCachedUserProfile()));
  let staged: MaterialDraft[] = [];
  let revision = 0; let request: AbortController | undefined;
  let publishing = false;
  let singleEdited = false;
  const lifecycle = new AbortController();
  const lang = (ar: string, en: string) => getCurrentLanguage() === 'en' ? en : ar;
  const allDrafts = () => [...staged, ...(single.url || single.title ? [single] : [])];
  function invalidate() { revision++; request?.abort(); aiButton.disabled = false; }
  function report(text: string) { notice.textContent = text; notice.classList.remove('hidden'); }
  function newSingle() { single = createDraft({}, draftCredit(getCachedUserProfile(), source)); singleEdited = false; renderSingle(); }
  function renderSingle() {
    mountMaterialEditor(get('admin-single-editor'), single, modules, field => {
      if (!single.sourceSubmissionId && !single.contributorUid) {
        const credit = draftCredit(getCachedUserProfile());
        if (credit.contributorUid) {
          const name = single.contributor;
          Object.assign(single, credit);
          if (field === 'contributor' || name !== 'الإدارة') single.contributor = name;
          const input = get('admin-single-editor').querySelector<HTMLInputElement>('[data-field="contributor"]');
          if (input) input.value = single.contributor;
        }
      }
      singleEdited = true;
    });
  }
  function renderStaged() {
    get('admin-bulk-staging').classList.toggle('hidden', !staged.length);
    get('admin-bulk-staging-title').textContent = lang('مراجعة المواد', 'Review materials');
    const host = get('admin-bulk-cards-list'); host.replaceChildren();
    for (const draft of staged) {
      const card = document.createElement('div'); card.className = 'p-3 sm:p-4 space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-700';
      const bar = document.createElement('div'); bar.className = 'flex items-center justify-between gap-2';
      const label = document.createElement('label'); label.className = 'flex items-center gap-2 text-xs';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = draft.selected;
      checkbox.onchange = () => { draft.selected = checkbox.checked; updateCount(); };
      label.append(checkbox, document.createTextNode(lang('تحديد للنشر','Select for publishing')));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-xs text-rose-600'; remove.textContent = lang('حذف','Remove');
      remove.onclick = () => { staged = staged.filter(d => d !== draft); renderStaged(); };
      bar.append(label,remove); card.append(bar);

      const editor = document.createElement('div'); card.append(editor); host.append(card);
      mountMaterialEditor(editor, draft, modules, field => { if (field === 'url') { draft.isDuplicate = false; draft.existingTitle = undefined; } });
    }
    updateCount();
  }
  function updateCount() {
    const count = staged.filter(d => d.selected).length;
    get('admin-bulk-selected-count').textContent = String(count);
    get<HTMLButtonElement>('admin-bulk-publish-btn').disabled = publishing || !count;
  }
  async function markDuplicates(drafts: MaterialDraft[], existing: MaterialDraft[] = []) {
    const matches = await checkUrlsBatchInFirestore(drafts.map(d => d.url), true);
    const seen = new Map(existing.filter(d => d.url).map(d => [materialUrlKey(d.url), d.title]));
    for (const draft of drafts) {
      const key = materialUrlKey(draft.url);
      draft.isDuplicate = matches.has(draft.url) || seen.has(key);
      draft.existingTitle = matches.get(draft.url)?.title || seen.get(key);
      if (draft.isDuplicate) draft.selected = false;
      seen.set(key, draft.title);
    }
  }
  async function extract() {
    const text = aiInput.value.trim(); if (!text || publishing) return;
    invalidate(); const current = revision; request = new AbortController();
    const credit = draftCredit(getCachedUserProfile(), source);
    const originalSingle = single; const wasEdited = singleEdited;
    aiButton.disabled = true; report(lang('جاري قراءة الروابط وتجهيز المواد…','Reading links and preparing materials…'));
    try {
      const result = await parseMaterialMessageWithAI(text, modules, request.signal);
      if (current !== revision || !root?.isConnected) return;
      const drafts = result.items.map(item => createDraft(item, credit));
      if (!drafts.length) { report(result.message || lang('لا توجد روابط','No links found')); return; }
      try { await markDuplicates(drafts, allDrafts()); }
      catch { for (const draft of drafts) { draft.selected = false; (draft.issues ||= []).push({field:'url',message:'تعذر فحص التكرار / Duplicate check unavailable'}); } }
      if (current !== revision || !root?.isConnected) return;
      if (drafts.length === 1 && !staged.length && single === originalSingle && !wasEdited && !singleEdited && !single.url && !single.title) {
        single = drafts[0]; renderSingle();
      } else { staged.push(...drafts); renderStaged(); }
      report(result.message || (result.status === 'ai' ? lang('المواد جاهزة للمراجعة','Materials ready for review') : lang('تم تجهيز المسودات؛ راجع الملاحظات والحقول الناقصة','Drafts prepared; review notices and missing fields')));
    } catch (error) {
      if (current === revision) report(error instanceof Error ? error.message : lang('تعذر الاستخراج','Extraction failed'));
    } finally { if (current === revision) aiButton.disabled = false; }
  }
  function setBusy(value: boolean) {
    publishing = value;
    root?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button,input,select,textarea').forEach(el => el.disabled = value);
    updateCount();
  }
  async function publish(drafts: MaterialDraft[]) {
    if (publishing || !drafts.length) return;
    const invalid = drafts.flatMap(d => validateDraft(d,modules));
    if (invalid.length) { report([...new Set(invalid.map(i => i.message))].join('\n')); return; }
    const admin = getCachedUserProfile();
    if (!admin || admin.role !== 'admin') { report(lang('سجل الدخول كمسؤول','Sign in as an admin')); return; }
    invalidate(); setBusy(true);
    const saved: MaterialDraft[] = []; const failed: string[] = [];
    try {
      const matches = await checkUrlsBatchInFirestore(drafts.map(d => d.url), true);
      const seen = new Set<string>();
      const duplicates = drafts.filter(d => { const key = materialUrlKey(d.url); const duplicate = matches.has(d.url) || seen.has(key); seen.add(key); return duplicate; });
      if (duplicates.length && !confirm(lang('تتضمن المواد روابط مكررة. هل تريد نشرها رغم ذلك؟','These materials include duplicate links. Publish them anyway?'))) return;
      const outcome = await publishMaterialDrafts(drafts,modules,{
        save:saveMaterialToFirestore,
        credit:uid => incrementUserContributionsCount(uid,1),
        audit:material => logAdminAction({adminUid:admin.uid,adminName:admin.displayName,adminUsername:admin.username,action:'publish_material',targetId:material.id,targetTitle:material.title,details:'Published reviewed material'}),
      });
      saved.push(...outcome.saved);
      failed.push(...outcome.failed.map(d => d.title));
      staged = staged.filter(d => !saved.includes(d));
      if (saved.includes(single)) newSingle();
      for (const id of new Set(saved.map(d => d.sourceSubmissionId).filter((id): id is string => !!id))) {
        // Never approve another submission or approve while its other drafts remain unresolved.
        if (!allDrafts().some(d => d.sourceSubmissionId === id)) {
          if (!await updateSubmissionStatus(id,'approved',admin)) failed.push(lang('تحديث حالة المساهمة','Submission status update'));
          else if (source?.sourceSubmissionId === id) { source = undefined; get('admin-source-submission-banner').classList.add('hidden'); if (!single.url && !single.title) newSingle(); }
        }
      }
      renderStaged();
      report([failed.length ? `${lang('تعذر حفظ','Could not save')}: ${failed.join('، ')}` : lang('تم نشر المواد المحددة','Selected materials published'), ...outcome.warnings].join('\n'));
      if (saved.length) showToast(lang('تم حفظ المواد','Materials saved'),'success');
    } catch (error) { report(error instanceof Error ? error.message : lang('تعذر النشر','Publishing failed')); }
    finally { setBusy(false); }
  }
  aiButton.addEventListener('click', extract);
  aiInput.addEventListener('input', invalidate);
  get('admin-add-manual-bulk-btn').onclick = () => { staged.push(createDraft({},draftCredit(getCachedUserProfile(),source))); renderStaged(); };
  get('admin-add-to-staging-btn').onclick = async () => {
    if (publishing) return;
    const draft = single;
    try { await markDuplicates([draft],staged); } catch { report(lang('تعذر فحص التكرار','Duplicate check unavailable')); }
    if (!staged.includes(draft)) staged.push(draft);
    if (single === draft) newSingle(); renderStaged();
  };
  get('admin-bulk-publish-btn').onclick = () => void publish(staged.filter(d => d.selected));
  form.addEventListener('submit', event => {event.preventDefault(); void publish([single]);});
  get('admin-bulk-select-all-btn').onclick = () => { staged.forEach(d => d.selected = true); renderStaged(); };
  get('admin-bulk-skip-dups-btn').onclick = async () => {
    try { await markDuplicates(staged); renderStaged(); } catch { report(lang('تعذر فحص التكرار','Duplicate check unavailable')); }
  };
  get('admin-bulk-clear-btn').onclick = () => { if (confirm(lang('مسح قائمة المراجعة؟','Clear the review list?'))) { invalidate(); staged = []; renderStaged(); } };
  get('admin-bulk-switch-single-btn').onclick = () => form.scrollIntoView({behavior:'smooth'});
  get('admin-source-sub-cancel-btn').onclick = () => { invalidate(); source = undefined; get('admin-source-submission-banner').classList.add('hidden'); if (!singleEdited && !single.url) newSingle(); };
  window.addEventListener('admin:load-submission-for-extraction', event => {
    if (publishing) return;
    const detail = (event as CustomEvent<{submissionId:string; contributor?:string; contributorUid?:string; contributorUsername?:string; content?:string}>).detail;
    if (!detail) return;
    invalidate();
    source = {sourceSubmissionId:detail.submissionId,contributor:detail.contributor,contributorUid:detail.contributorUid,contributorUsername:detail.contributorUsername};
    get('admin-source-submission-banner').classList.remove('hidden');
    get('admin-source-sub-text').textContent = `${lang('مساهمة','Submission')}: ${detail.contributor || 'فاعل خير'}`;
    aiInput.value = detail.content || '';
    document.querySelector<HTMLButtonElement>('.admin-nav-tab[data-tab="direct"]')?.click();
    void extract();
  }, {signal:lifecycle.signal});
  window.addEventListener('asumed-language-changed', () => {if (!publishing) {renderSingle(); renderStaged();}}, {signal:lifecycle.signal});
  document.addEventListener('astro:before-swap', () => {invalidate(); lifecycle.abort();}, {once:true,signal:lifecycle.signal});
  renderSingle(); renderStaged();
}
