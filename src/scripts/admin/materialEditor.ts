import type { MaterialDraft } from '../../types/ai';
import type { AcademicYear, MaterialCategory, ModuleInfo, ResourceType } from '../../types/materials';
import { VALID_CATEGORIES, VALID_TYPES } from '../../utils/aiParser';
import { validateDraft } from '../../utils/materialDrafts';
import { isHttpUrl } from '../../utils/materialLinks';
import { getCurrentLanguage } from '../../utils/i18n';

const inputClass = 'min-w-0 w-full px-2 py-1 text-xs rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900';
const optionNames: Record<string, [string,string]> = {
  drive:['Google Drive','Google Drive'], telegram:['تيليجرام','Telegram'], youtube:['فيديو يوتيوب','YouTube video'], playlist:['قائمة تشغيل','Playlist'], whatsapp:['واتساب','WhatsApp'], book:['كتاب','Book'], summary:['ملخص / مستند','Summary / document'], exam:['أسئلة امتحان','Exam'], website:['موقع','Website'], other:['أخرى','Other'],
  central:['مصادر الدفعة','Batch resources'], lectures:['محاضرات','Lectures'], practical:['عملي','Practical'], summaries:['ملخصات','Summaries'], exams:['امتحانات','Exams'], references:['مراجع','References'],
};
export function mountMaterialEditor(host: HTMLElement, draft: MaterialDraft, modules: ModuleInfo[], changed: (field: string) => void): void {
  const template = document.getElementById('material-review-template') as HTMLTemplateElement;
  host.replaceChildren(template.content.cloneNode(true));
  const en = getCurrentLanguage() === 'en';
  host.querySelectorAll<HTMLElement>('[data-label-ar]').forEach(el => {el.textContent = en ? el.dataset.labelEn! : el.dataset.labelAr!;});
  const fields = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-field]').forEach(el => fields.set(el.dataset.field!, el));
  const choices = (name: string, entries: [string,string][]) => {
    const select = fields.get(name) as HTMLSelectElement;
    select.replaceChildren(...entries.map(([value,label]) => new Option(label,value)));
  };
  const empty = en ? 'Select…' : 'اختر…';
  choices('year', [['',empty], ...[1,2,3,4,5].map(n => [String(n), en ? `Year ${n}` : `السنة ${n}`] as [string,string])]);
  choices('type', VALID_TYPES.map(v => [v, optionNames[v][en ? 1 : 0]]));
  choices('category', [['',empty], ...VALID_CATEGORIES.map(v => [v, optionNames[v][en ? 1 : 0]] as [string,string])]);
  function refreshModules() {
    choices('moduleId', [['',en ? 'General / no module' : 'عام / بدون موديول'], ...modules.filter(m => m.active !== false && m.year === draft.year).map(m => [m.id,en ? m.title : m.titleAr || m.title] as [string,string])]);
    fields.get('moduleId')!.value = draft.moduleId;
  }
  refreshModules();
  for (const [key, el] of fields) {
    const value = draft[key as keyof MaterialDraft];
    el.value = Array.isArray(value) ? value.join('، ') : value == null ? '' : String(value);
    if (['title','titleEn','url','year','type','category'].includes(key)) el.required = true;
    if (key === 'titleEn' || key === 'descriptionEn' || key === 'url') el.dir = 'ltr';
    el.addEventListener('input', () => {
      const value = el.value;
      switch (key) {
        case 'year': draft.year = value ? Number(value) as AcademicYear : undefined;
          if (!modules.some(m => m.id === draft.moduleId && m.year === draft.year)) draft.moduleId = '';
          refreshModules(); break;
        case 'type': draft.type = value as ResourceType; toggleVideos(); break;
        case 'category': draft.category = value ? value as MaterialCategory : undefined; break;
        case 'url': draft.url = value; draft.isDuplicate = false; draft.existingTitle = undefined; updateResourceLink(); break;
        case 'author': draft.author = value.split(/[,،]/).map(s => s.trim()).filter(Boolean); break;
        case 'tags': draft.tags = value.split(/[,،]/).map(s => s.trim()).filter(Boolean); break;
        case 'title': case 'titleEn': case 'moduleId': case 'subject': case 'description': case 'descriptionEn': case 'playlistId': case 'contributor': draft[key] = value; break;
      }
      draft.issues = draft.issues?.filter(i => i.field !== key);
      showIssues(); changed(key);
    });
  }
  function toggleVideos() { host.querySelector('[data-playlist]')?.classList.toggle('hidden', draft.type !== 'playlist'); }
  function updateResourceLink() {
    const link = host.querySelector<HTMLAnchorElement>('[data-resource-link]')!;
    const valid = isHttpUrl(draft.url); link.classList.toggle('hidden', !valid);
    if (valid) link.href = draft.url; else link.removeAttribute('href');
  }
  function showIssues() {
    const messages = [...(draft.issues || []), ...validateDraft(draft, modules)].map(i => i.message);
    if (draft.isDuplicate) messages.unshift(`${en ? 'Duplicate URL' : 'رابط مكرر'}: ${draft.existingTitle || draft.url}`);
    host.querySelector('[data-issues]')!.textContent = [...new Set(messages)].join('\n');
  }
  function renderVideos() {
    const container = host.querySelector<HTMLElement>('[data-videos]')!; container.replaceChildren();
    for (const video of draft.videos || []) {
      const row = document.createElement('div'); row.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2';
      for (const key of ['title','youtubeId','url','duration'] as const) {
        const input = document.createElement('input'); input.className = inputClass; input.value = video[key] || '';
        const labels = {title:en ? 'Video title' : 'عنوان الفيديو', youtubeId:'YouTube ID', url:en ? 'Video URL' : 'رابط الفيديو', duration:en ? 'Duration' : 'المدة'};
        input.placeholder = labels[key]; input.setAttribute('aria-label', labels[key]);
        input.addEventListener('input', () => { video[key] = input.value; showIssues(); changed('videos'); }); row.append(input);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-xs text-rose-600 text-start'; remove.textContent = en ? 'Remove video' : 'حذف الفيديو';
      remove.onclick = () => {draft.videos = draft.videos?.filter(v => v !== video); renderVideos(); showIssues(); changed('videos');};
      row.append(remove); container.append(row);
    }
  }
  host.querySelector('[data-add-video]')!.addEventListener('click', () => { (draft.videos ||= []).push({id:crypto.randomUUID(),title:''}); renderVideos(); showIssues(); changed('videos'); });
  host.querySelector('[data-credit]')!.textContent = draft.contributorUsername ? `@${draft.contributorUsername}` : '';
  renderVideos(); toggleVideos(); updateResourceLink(); showIssues();
}
