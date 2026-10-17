import { parseMaterialMessageWithAI } from '../../firebase/ai';
import { getCachedUserProfile } from '../../firebase/auth';
import {
  checkUrlsBatchInFirestore,
  saveMaterialToFirestore,
  incrementUserContributionsCount,
  logAdminAction,
  updateSubmissionStatus,
} from '../../firebase/firestore';
import type { DraftCredit, MaterialDraft } from '../../types/ai';
import type {
  AcademicYear,
  DocumentItem,
  MaterialCategory,
  ModuleInfo,
  PlaylistItem,
  ResourceType,
} from '../../types/materials';
import { createDraft, draftCredit, validateDraft } from '../../utils/materialDrafts';
import { publishMaterialDrafts } from '../../utils/publishMaterialDrafts';
import { materialUrlKey, isHttpUrl } from '../../utils/materialLinks';
import { extractYouTubeId } from '../../utils/videoSources';
import { showToast } from '../../utils/toast';
import { mountMaterialEditor } from './materialEditor';

interface StickyPresets {
  locked: boolean;
  year?: AcademicYear;
  moduleId: string;
  subject: string;
  author: string;
}

const CATEGORY_CHIPS: Array<{ key: MaterialCategory; ar: string; en: string }> = [
  { key: 'lectures', ar: 'محاضرات', en: 'Lectures' },
  { key: 'practical', ar: 'عملي', en: 'Practical' },
  { key: 'summaries', ar: 'ملخصات', en: 'Summaries' },
  { key: 'exams', ar: 'امتحانات', en: 'Exams' },
  { key: 'references', ar: 'مراجع', en: 'References' },
];

const TYPE_CHIPS: Array<{ key: ResourceType; ar: string; en: string }> = [
  { key: 'youtube', ar: 'فيديو', en: 'Video' },
  { key: 'playlist', ar: 'قائمة', en: 'Playlist' },
  { key: 'drive', ar: 'درايف', en: 'Drive' },
  { key: 'telegram', ar: 'تيليجرام', en: 'Telegram' },
  { key: 'summary', ar: 'ملخص/PDF', en: 'PDF / Summary' },
  { key: 'website', ar: 'موقع', en: 'Website' },
];

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

  // Sticky Presets elements
  const presetLockBtn = get<HTMLButtonElement>('admin-preset-lock-btn');
  const presetLockIcon = get('admin-preset-lock-icon');
  const presetLockText = get('admin-preset-lock-text');
  const presetLockedBanner = get('admin-preset-locked-banner');
  const presetYearPills = get('admin-preset-year-pills');
  const presetModuleSelect = get<HTMLSelectElement>('admin-preset-module');
  const presetSubjectInput = get<HTMLInputElement>('admin-preset-subject');
  const presetAuthorInput = get<HTMLInputElement>('admin-preset-author');

  // Quick Live URL Inspector elements
  const quickInput = get<HTMLInputElement>('admin-quick-url');
  const quickAddBtn = get<HTMLButtonElement>('admin-quick-add-btn');
  const quickPlatformBadge = get('admin-quick-platform-badge');
  const quickPlatformIcon = get('admin-quick-platform-icon');
  const quickPlatformText = get('admin-quick-platform-text');
  const quickStatus = get('admin-quick-status');
  const quickStatusIcon = get('admin-quick-status-icon');
  const quickStatusText = get('admin-quick-status-text');

  let source: Partial<DraftCredit> | undefined;
  let single = createDraft({}, draftCredit(getCachedUserProfile()));
  let staged: MaterialDraft[] = [];
  let revision = 0;
  let request: AbortController | undefined;
  let publishing = false;
  let singleEdited = false;
  let quickTimer: number | undefined;

  const presets: StickyPresets = {
    locked: false,
    year: undefined,
    moduleId: '',
    subject: '',
    author: '',
  };

  const lifecycle = new AbortController();
  const lang = (_ar: string, en: string) => en;
  const allDrafts = () => [...staged, ...(single.url || single.title ? [single] : [])];

  function invalidate() {
    revision++;
    request?.abort();
    aiButton.disabled = false;
  }

  function report(text: string) {
    notice.textContent = text;
    notice.classList.remove('hidden');
  }

  function getPlatformInfo(url: string): { icon: string; text: string; type: ResourceType } {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      if (['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
        if (u.searchParams.has('list')) return { icon: '🎬', text: 'YouTube Playlist', type: 'playlist' };
        return { icon: '▶️', text: 'YouTube', type: 'youtube' };
      }
      if (host === 'drive.google.com') return { icon: '📁', text: 'Google Drive', type: 'drive' };
      if (['t.me', 'telegram.me'].includes(host)) return { icon: '✈️', text: 'Telegram', type: 'telegram' };
      if (['chat.whatsapp.com', 'wa.me', 'whatsapp.com'].includes(host)) return { icon: '💬', text: 'WhatsApp', type: 'whatsapp' };
      if (/\.pdf$/i.test(u.pathname)) return { icon: '📄', text: 'PDF / Book', type: 'summary' };
      return { icon: '🌐', text: 'Website', type: 'website' };
    } catch {
      return { icon: '🔗', text: 'Link', type: 'other' };
    }
  }

  function refreshPresetModules() {
    if (!presetModuleSelect) return;
    const currentVal = presetModuleSelect.value;
    presetModuleSelect.replaceChildren();

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = lang('(بدون موديول / عام)', '(General / no module)');
    presetModuleSelect.appendChild(defaultOpt);

    const filtered = presets.year
      ? modules.filter((m) => m.active !== false && m.year === presets.year)
      : modules.filter((m) => m.active !== false);

    for (const mod of filtered) {
      const opt = document.createElement('option');
      opt.value = mod.id;
      opt.textContent = `${mod.year ? `Y${mod.year} - ` : ''}${mod.titleAr || mod.title}`;
      presetModuleSelect.appendChild(opt);
    }

    if (filtered.some((m) => m.id === currentVal)) {
      presetModuleSelect.value = currentVal;
      presets.moduleId = currentVal;
    } else {
      presetModuleSelect.value = '';
      presets.moduleId = '';
    }
  }

  function applyPresets(draft: MaterialDraft, force = false): void {
    if (presets.locked || force) {
      if (presets.year !== undefined) draft.year = presets.year;
      if (presets.moduleId) draft.moduleId = presets.moduleId;
      if (presets.subject && (!draft.subject || presets.locked)) draft.subject = presets.subject;
      if (presets.author && (!draft.author || draft.author.length === 0 || presets.locked)) {
        draft.author = presets.author.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
      }
    }
  }

  function newSingle() {
    single = createDraft({}, draftCredit(getCachedUserProfile(), source));
    applyPresets(single);
    singleEdited = false;
    renderSingle();
  }

  function renderSingle() {
    mountMaterialEditor(get('admin-single-editor'), single, modules, (field) => {
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
    get('admin-bulk-staging-title').textContent = `${lang('المواد المستخرجة في الانتظار', 'Extracted Materials in Review')} (${staged.length})`;
    const host = get('admin-bulk-cards-list');
    host.replaceChildren();

    for (const draft of staged) {
      const card = document.createElement('div');
      card.className =
        'p-3.5 sm:p-4 space-y-3 rounded-2xl border transition-all ' +
        (draft.isDuplicate
          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60'
          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700/80 shadow-xs');

      // 1. Top Bar: Checkbox + Platform info + Duplicate status + Actions
      const topBar = document.createElement('div');
      topBar.className = 'flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2.5';

      const leftCol = document.createElement('div');
      leftCol.className = 'flex items-center gap-2 flex-wrap min-w-0';

      const label = document.createElement('label');
      label.className = 'flex items-center gap-1.5 text-xs font-semibold cursor-pointer';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = draft.selected;
      checkbox.className = 'w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer';
      checkbox.onchange = () => {
        draft.selected = checkbox.checked;
        updateCount();
      };
      label.append(checkbox);

      const pInfo = getPlatformInfo(draft.url || '');
      const badge = document.createElement('span');
      badge.className = 'px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-1';
      badge.textContent = `${pInfo.icon} ${pInfo.text}`;

      leftCol.append(label, badge);

      if (draft.isDuplicate) {
        const dupBadge = document.createElement('span');
        dupBadge.className = 'px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300';
        dupBadge.textContent = draft.existingTitle
          ? `${lang('مكرر', 'Duplicate')}: "${draft.existingTitle}"`
          : lang('رابط مكرر', 'Duplicate link');
        leftCol.append(dupBadge);
      }

      const actionsCol = document.createElement('div');
      actionsCol.className = 'flex items-center gap-2 shrink-0';

      if (draft.url && isHttpUrl(draft.url)) {
        const linkBtn = document.createElement('a');
        linkBtn.href = draft.url;
        linkBtn.target = '_blank';
        linkBtn.rel = 'noopener noreferrer';
        linkBtn.className = 'text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1';
        linkBtn.textContent = lang('فتح الرابط ↗', 'Open ↗');
        actionsCol.append(linkBtn);
      }

      const detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className = 'text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer';
      detailsBtn.textContent = lang('التفاصيل ▾', 'Details ▾');

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'text-xs text-rose-600 dark:text-rose-400 hover:underline cursor-pointer';
      removeBtn.textContent = lang('حذف', 'Remove');
      removeBtn.onclick = () => {
        staged = staged.filter((d) => d !== draft);
        renderStaged();
      };

      actionsCol.append(detailsBtn, removeBtn);
      topBar.append(leftCol, actionsCol);
      card.append(topBar);

      // 2. Middle Row: Inline Title Edit & Quick Chip Switchers
      const middleRow = document.createElement('div');
      middleRow.className = 'space-y-2';

      // Title input
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = draft.title || '';
      titleInput.placeholder = lang('عنوان المادة (بالعربية)', 'Material Title (Arabic)');
      titleInput.className =
        'w-full px-2.5 py-1.5 text-xs font-semibold bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all';
      titleInput.addEventListener('input', () => {
        draft.title = titleInput.value;
      });
      middleRow.append(titleInput);

      // Quick Chips (Category & Type)
      const chipsContainer = document.createElement('div');
      chipsContainer.className = 'flex flex-wrap items-center gap-1.5 text-xs pt-1';

      // Category Chips
      const catLabel = document.createElement('span');
      catLabel.className = 'text-[10px] font-bold text-zinc-400 dark:text-zinc-500 me-1';
      catLabel.textContent = lang('التصنيف:', 'Category:');
      chipsContainer.append(catLabel);

      for (const chip of CATEGORY_CHIPS) {
        const chipBtn = document.createElement('button');
        chipBtn.type = 'button';
        const isCurrent = draft.category === chip.key;
        chipBtn.className =
          'px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ' +
          (isCurrent
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700');
        chipBtn.textContent = lang(chip.ar, chip.en);
        chipBtn.onclick = () => {
          draft.category = chip.key;
          renderStaged();
        };
        chipsContainer.append(chipBtn);
      }

      // Type Chips
      const sep = document.createElement('span');
      sep.className = 'text-zinc-300 dark:text-zinc-700 mx-1';
      sep.textContent = '|';
      chipsContainer.append(sep);

      const typeLabel = document.createElement('span');
      typeLabel.className = 'text-[10px] font-bold text-zinc-400 dark:text-zinc-500 me-1';
      typeLabel.textContent = lang('النوع:', 'Type:');
      chipsContainer.append(typeLabel);

      for (const chip of TYPE_CHIPS) {
        const chipBtn = document.createElement('button');
        chipBtn.type = 'button';
        const isCurrent = draft.type === chip.key;
        chipBtn.className =
          'px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ' +
          (isCurrent
            ? 'bg-indigo-600 text-white shadow-xs'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700');
        chipBtn.textContent = lang(chip.ar, chip.en);
        chipBtn.onclick = () => {
          draft.type = chip.key;
          renderStaged();
        };
        chipsContainer.append(chipBtn);
      }

      middleRow.append(chipsContainer);
      card.append(middleRow);

      // 3. Full Editor (Collapsible details)
      const editorWrapper = document.createElement('div');
      editorWrapper.className = 'hidden pt-2 border-t border-zinc-100 dark:border-zinc-800';
      card.append(editorWrapper);

      let mounted = false;
      detailsBtn.onclick = () => {
        const isHidden = editorWrapper.classList.toggle('hidden');
        detailsBtn.textContent = isHidden ? lang('التفاصيل ▾', 'Details ▾') : lang('إخفاء التفاصيل ▴', 'Hide Details ▴');
        if (!isHidden && !mounted) {
          mounted = true;
          mountMaterialEditor(editorWrapper, draft, modules, (field) => {
            if (field === 'url') {
              draft.isDuplicate = false;
              draft.existingTitle = undefined;
            }
          });
        }
      };

      host.append(card);
    }

    updateCount();
  }

  function updateCount() {
    const count = staged.filter((d) => d.selected).length;
    get('admin-bulk-selected-count').textContent = String(count);
    get<HTMLButtonElement>('admin-bulk-publish-btn').disabled = publishing || !count;
  }

  async function markDuplicates(drafts: MaterialDraft[], existing: MaterialDraft[] = []) {
    // Optimized: targeted Firestore queries + in-memory session memoization
    const matches = await checkUrlsBatchInFirestore(
      drafts.map((d) => d.url),
      false
    );
    const seen = new Map(existing.filter((d) => d.url).map((d) => [materialUrlKey(d.url), d.title]));
    for (const draft of drafts) {
      const key = materialUrlKey(draft.url);
      draft.isDuplicate = matches.has(draft.url) || seen.has(key);
      draft.existingTitle = matches.get(draft.url)?.title || seen.get(key);
      if (draft.isDuplicate) draft.selected = false;
      seen.set(key, draft.title);
    }
  }

  async function extract() {
    const text = aiInput.value.trim();
    if (!text || publishing) return;
    invalidate();
    const current = revision;
    request = new AbortController();
    const credit = draftCredit(getCachedUserProfile(), source);
    const originalSingle = single;
    const wasEdited = singleEdited;

    aiButton.disabled = true;
    report(lang('جاري قراءة الروابط وتجهيز المواد…', 'Reading links and preparing materials…'));

    try {
      const result = await parseMaterialMessageWithAI(text, modules, request.signal);
      if (current !== revision || !root?.isConnected) return;

      const drafts = result.items.map((item) => {
        const draft = createDraft(item, credit);
        applyPresets(draft);
        return draft;
      });

      if (!drafts.length) {
        report(result.message || lang('لا توجد روابط', 'No links found'));
        return;
      }

      try {
        await markDuplicates(drafts, allDrafts());
      } catch {
        for (const draft of drafts) {
          draft.selected = false;
          (draft.issues ||= []).push({
            field: 'url',
            message: 'تعذر فحص التكرار / Duplicate check unavailable',
          });
        }
      }

      if (current !== revision || !root?.isConnected) return;

      if (
        drafts.length === 1 &&
        !staged.length &&
        single === originalSingle &&
        !wasEdited &&
        !singleEdited &&
        !single.url &&
        !single.title
      ) {
        single = drafts[0];
        renderSingle();
      } else {
        staged.push(...drafts);
        renderStaged();
      }

      report(
        result.message ||
          (result.status === 'ai'
            ? lang('المواد جاهزة للمراجعة', 'Materials ready for review')
            : lang('تم تجهيز المسودات؛ راجع الملاحظات والحقول الناقصة', 'Drafts prepared; review notices and missing fields'))
      );
    } catch (error) {
      if (current === revision) {
        report(error instanceof Error ? error.message : lang('تعذر الاستخراج', 'Extraction failed'));
      }
    } finally {
      if (current === revision) aiButton.disabled = false;
    }
  }

  function setBusy(value: boolean) {
    publishing = value;
    root
      ?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'button,input,select,textarea'
      )
      .forEach((el) => (el.disabled = value));
    updateCount();
  }

  async function publish(drafts: MaterialDraft[]) {
    if (publishing || !drafts.length) return;
    const invalid = drafts.flatMap((d) => validateDraft(d, modules));
    if (invalid.length) {
      report([...new Set(invalid.map((i) => i.message))].join('\n'));
      return;
    }
    const admin = getCachedUserProfile();
    if (!admin || admin.role !== 'admin') {
      report(lang('سجل الدخول كمسؤول', 'Sign in as an admin'));
      return;
    }

    invalidate();
    setBusy(true);
    const saved: MaterialDraft[] = [];
    const failed: string[] = [];

    try {
      const matches = await checkUrlsBatchInFirestore(
        drafts.map((d) => d.url),
        false
      );
      const seen = new Set<string>();
      const duplicates = drafts.filter((d) => {
        const key = materialUrlKey(d.url);
        const duplicate = matches.has(d.url) || seen.has(key);
        seen.add(key);
        return duplicate;
      });

      if (
        duplicates.length &&
        !confirm(
          lang(
            'تتضمن المواد روابط مكررة. هل تريد نشرها رغم ذلك؟',
            'These materials include duplicate links. Publish them anyway?'
          )
        )
      ) {
        return;
      }

      const outcome = await publishMaterialDrafts(drafts, modules, {
        save: saveMaterialToFirestore,
        credit: (uid) => incrementUserContributionsCount(uid, 1),
        audit: (material) =>
          logAdminAction({
            adminUid: admin.uid,
            adminName: admin.displayName,
            adminUsername: admin.username,
            action: 'publish_material',
            targetId: material.id,
            targetTitle: material.title,
            details: 'Published reviewed material',
          }),
      });

      saved.push(...outcome.saved);
      failed.push(...outcome.failed.map((d) => d.title));
      staged = staged.filter((d) => !saved.includes(d));
      if (saved.includes(single)) newSingle();

      for (const id of new Set(saved.map((d) => d.sourceSubmissionId).filter((id): id is string => !!id))) {
        if (!allDrafts().some((d) => d.sourceSubmissionId === id)) {
          if (!(await updateSubmissionStatus(id, 'approved', admin))) {
            failed.push(lang('تحديث حالة المساهمة', 'Submission status update'));
          } else if (source?.sourceSubmissionId === id) {
            source = undefined;
            get('admin-source-submission-banner').classList.add('hidden');
            if (!single.url && !single.title) newSingle();
          }
        }
      }

      renderStaged();
      report(
        [
          failed.length
            ? `${lang('تعذر حفظ', 'Could not save')}: ${failed.join('، ')}`
            : lang('تم نشر المواد المحددة', 'Selected materials published'),
          ...outcome.warnings,
        ].join('\n')
      );
      if (saved.length) showToast(lang('تم حفظ المواد بنجاح!', 'Materials saved successfully!'), 'success');
    } catch (error) {
      report(error instanceof Error ? error.message : lang('تعذر النشر', 'Publishing failed'));
    } finally {
      setBusy(false);
    }
  }

  // --- Sticky Presets Event Listeners ---
  presetLockBtn.onclick = () => {
    presets.locked = !presets.locked;
    presetLockIcon.textContent = presets.locked ? '🔒' : '🔓';
    presetLockText.textContent = presets.locked
      ? lang('السياق مثبت', 'Presets Locked')
      : lang('تثبيت السياق', 'Lock Presets');
    presetLockBtn.classList.toggle('border-emerald-500', presets.locked);
    presetLockBtn.classList.toggle('bg-emerald-50', presets.locked);
    presetLockBtn.classList.toggle('dark:bg-emerald-950/60', presets.locked);
    presetLockBtn.classList.toggle('text-emerald-700', presets.locked);
    presetLockBtn.classList.toggle('dark:text-emerald-300', presets.locked);
    presetLockedBanner.classList.toggle('hidden', !presets.locked);

    if (presets.locked) {
      applyPresets(single);
      renderSingle();
      showToast(lang('تم تثبيت السياق للمواد الجديدة', 'Context presets locked for new materials'), 'info');
    }
  };

  presetYearPills.querySelectorAll<HTMLButtonElement>('.preset-year-pill').forEach((pill) => {
    pill.onclick = () => {
      presetYearPills.querySelectorAll('.preset-year-pill').forEach((p) => {
        p.classList.remove('active', 'border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/60', 'text-emerald-700', 'dark:text-emerald-300');
        p.classList.add('border-zinc-300', 'dark:border-zinc-600', 'bg-white', 'dark:bg-zinc-900', 'text-zinc-700', 'dark:text-zinc-300');
      });
      pill.classList.add('active', 'border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/60', 'text-emerald-700', 'dark:text-emerald-300');
      pill.classList.remove('border-zinc-300', 'dark:border-zinc-600', 'bg-white', 'dark:bg-zinc-900', 'text-zinc-700', 'dark:text-zinc-300');

      const yVal = pill.dataset.year;
      presets.year = yVal ? (Number(yVal) as AcademicYear) : undefined;
      refreshPresetModules();
      if (presets.locked) {
        applyPresets(single);
        renderSingle();
      }
    };
  });

  presetModuleSelect.onchange = () => {
    presets.moduleId = presetModuleSelect.value;
    if (presets.locked) {
      applyPresets(single);
      renderSingle();
    }
  };

  presetSubjectInput.oninput = () => {
    presets.subject = presetSubjectInput.value.trim();
    if (presets.locked) {
      applyPresets(single);
      renderSingle();
    }
  };

  presetAuthorInput.oninput = () => {
    presets.author = presetAuthorInput.value.trim();
    if (presets.locked) {
      applyPresets(single);
      renderSingle();
    }
  };

  // --- Real-Time Live URL Inspector Event Listeners ---
  quickInput.addEventListener('input', () => {
    window.clearTimeout(quickTimer);
    const val = quickInput.value.trim();

    if (!isHttpUrl(val)) {
      quickPlatformBadge.classList.add('hidden');
      quickStatus.classList.add('hidden');
      quickAddBtn.disabled = true;
      return;
    }

    const pInfo = getPlatformInfo(val);
    quickPlatformBadge.classList.remove('hidden');
    quickPlatformIcon.textContent = pInfo.icon;
    quickPlatformText.textContent = pInfo.text;
    quickAddBtn.disabled = false;

    // Debounced point query duplicate check (uses memory cache first = 0 reads)
    quickTimer = window.setTimeout(async () => {
      try {
        quickStatus.classList.remove('hidden');
        quickStatusIcon.textContent = '⏳';
        quickStatusText.textContent = lang('جاري الفحص السريع...', 'Checking link...');

        const matches = await checkUrlsBatchInFirestore([val], false);
        if (!quickInput.isConnected || quickInput.value.trim() !== val) return;

        if (matches.has(val)) {
          const existing = matches.get(val);
          quickStatus.className = 'text-[11px] font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-400';
          quickStatusIcon.textContent = '⚠️';
          quickStatusText.textContent = `${lang('المادة مسجلة مسبقاً بعنوان', 'Already registered as')}: "${existing?.title || val}"`;
        } else {
          quickStatus.className = 'text-[11px] font-semibold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400';
          quickStatusIcon.textContent = '✓';
          quickStatusText.textContent = lang('رابط جديد غير مسجل', 'Fresh link (not registered)');
        }
      } catch {
        quickStatus.classList.add('hidden');
      }
    }, 300);
  });

  const performQuickAdd = async () => {
    const val = quickInput.value.trim();
    if (!isHttpUrl(val)) return;

    const pInfo = getPlatformInfo(val);
    const titleParts: string[] = [];
    if (presets.subject) titleParts.push(presets.subject);
    if (presets.author) titleParts.push(presets.author);

    const draft = createDraft(
      {
        url: val,
        type: pInfo.type,
        title: titleParts.join(' - ') || pInfo.text,
      },
      draftCredit(getCachedUserProfile(), source)
    );

    applyPresets(draft, true);
    await markDuplicates([draft], allDrafts());
    staged.push(draft);
    renderStaged();

    quickInput.value = '';
    quickPlatformBadge.classList.add('hidden');
    quickStatus.classList.add('hidden');
    quickAddBtn.disabled = true;
    showToast(lang('تمت إضافة الرابط لقائمة المراجعة', 'Link added to review staging'), 'success');
  };

  quickAddBtn.onclick = () => void performQuickAdd();

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter
  aiInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void extract();
    }
  });

  quickInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!quickAddBtn.disabled) void performQuickAdd();
    }
  });

  // --- "Group Selected as Playlist" Toolbar Action ---
  const groupPlaylistBtn = get<HTMLButtonElement>('admin-bulk-group-playlist-btn');
  if (groupPlaylistBtn) {
    groupPlaylistBtn.onclick = () => {
      const selected = staged.filter((d) => d.selected);
      if (selected.length < 2) {
        showToast(
          lang('حدد مادتين أو أكثر لتجميعهما كقائمة تشغيل واحدة', 'Select 2 or more items to group as a single playlist'),
          'info'
        );
        return;
      }

      const videos: PlaylistItem[] = [];
      for (const d of selected) {
        if (d.type === 'playlist' && d.videos && d.videos.length > 0) {
          videos.push(...d.videos);
        } else if (d.url) {
          const ytId = extractYouTubeId(d.url);
          videos.push({
            id: crypto.randomUUID(),
            title: d.title || (ytId ? `Video ${videos.length + 1}` : d.url),
            url: d.url,
            youtubeId: ytId || undefined,
          });
        }
      }

      if (videos.length === 0) {
        showToast(
          lang('لم يتم العثور على فيديوهات صالحة في العناصر المحددة', 'No valid videos found in selected items'),
          'error'
        );
        return;
      }

      const first = selected[0];
      const subjectStr = presets.subject || first.subject || '';
      const authorStr =
        presets.author ||
        (Array.isArray(first.author) && first.author.length
          ? first.author.join('، ')
          : typeof first.author === 'string'
            ? first.author
            : '');
      const defaultTitle =
        [subjectStr, authorStr, lang('قائمة تشغيل', 'Playlist')].filter(Boolean).join(' - ') || 'Playlist Series';

      const promptRes = window.prompt(lang('أدخل عنوان قائمة التشغيل المجمعة:', 'Enter playlist title:'), defaultTitle);
      const playlistTitle = promptRes != null && promptRes.trim() ? promptRes.trim() : defaultTitle;

      const playlistDraft = createDraft(
        {
          title: playlistTitle,
          titleEn: first.titleEn,
          url: first.url,
          type: 'playlist',
          category: first.category || 'lectures',
          year: presets.locked && presets.year ? presets.year : first.year,
          moduleId: presets.locked && presets.moduleId ? presets.moduleId : first.moduleId,
          subject: subjectStr,
          author: authorStr
            ? authorStr
                .split(/[,،]/)
                .map((s: string) => s.trim())
                .filter(Boolean)
            : Array.isArray(first.author)
              ? first.author
              : [],
          videos,
        },
        draftCredit(getCachedUserProfile(), {
          contributor: first.contributor,
          contributorUid: first.contributorUid,
          contributorUsername: first.contributorUsername,
          sourceSubmissionId: first.sourceSubmissionId || source?.sourceSubmissionId,
        })
      );
      playlistDraft.selected = true;

      // Replace selected items with the new playlist draft
      staged = staged.filter((d) => !selected.includes(d));
      staged.unshift(playlistDraft);
      renderStaged();

      showToast(
        lang(
          `تم تجميع ${selected.length} عناصر في قائمة تشغيل واحدة بنجاح!`,
          `Grouped ${selected.length} items into a cohesive playlist!`
        ),
        'success'
      );
    };
  }

  // --- "Group Selected as Bundle / Pack" Toolbar Action ---
  const groupBundleBtn = get<HTMLButtonElement>('admin-bulk-group-bundle-btn');
  if (groupBundleBtn) {
    groupBundleBtn.onclick = () => {
      const selected = staged.filter((d) => d.selected);
      if (selected.length < 2) {
        showToast(
          lang('حدد مادتين أو أكثر لتجميعهما كحزمة دراسية واحدة', 'Select 2 or more items to group as a study bundle/pack'),
          'info'
        );
        return;
      }

      const documents: DocumentItem[] = [];
      for (const d of selected) {
        if (d.documents && d.documents.length > 0) {
          documents.push(...d.documents);
        } else if (d.url) {
          documents.push({
            id: crypto.randomUUID(),
            title: d.title || `Document ${documents.length + 1}`,
            url: d.url,
            type: d.type || 'drive',
          });
        }
      }

      if (documents.length === 0) {
        showToast(
          lang('لم يتم العثور على مستندات صالحة في العناصر المحددة', 'No valid documents found in selected items'),
          'error'
        );
        return;
      }

      const first = selected[0];
      const subjectStr = presets.subject || first.subject || '';
      const authorStr =
        presets.author ||
        (Array.isArray(first.author) && first.author.length
          ? first.author.join('، ')
          : typeof first.author === 'string'
            ? first.author
            : '');

      // Determine appropriate category (practical, exams, summaries, etc.)
      const catCount: Record<string, number> = {};
      selected.forEach((d) => {
        const cat = d.category || 'summaries';
        catCount[cat] = (catCount[cat] || 0) + 1;
      });
      let dominantCategory: MaterialCategory = 'summaries';
      let maxCount = 0;
      for (const [c, count] of Object.entries(catCount)) {
        if (count > maxCount) {
          maxCount = count;
          dominantCategory = c as MaterialCategory;
        }
      }

      const packKind =
        dominantCategory === 'practical'
          ? lang('حزمة عملي', 'Practical Pack')
          : dominantCategory === 'exams'
            ? lang('حزمة امتحانات وريكول', 'Finals Exam Pack')
            : lang('حزمة مذكرات', 'Study Bundle');

      const defaultTitle =
        [subjectStr, authorStr, packKind].filter(Boolean).join(' - ') || 'Study Bundle Pack';

      const promptRes = window.prompt(lang('أدخل عنوان الحزمة الدراسية المجمعة:', 'Enter study pack title:'), defaultTitle);
      const bundleTitle = promptRes != null && promptRes.trim() ? promptRes.trim() : defaultTitle;

      const bundleDraft = createDraft(
        {
          title: bundleTitle,
          titleEn: first.titleEn,
          url: first.url || documents[0]?.url || '',
          type: first.type === 'drive' || first.type === 'summary' || first.type === 'exam' ? first.type : 'drive',
          category: presets.locked ? first.category || dominantCategory : dominantCategory,
          year: presets.locked && presets.year ? presets.year : first.year,
          moduleId: presets.locked && presets.moduleId ? presets.moduleId : first.moduleId,
          subject: subjectStr,
          author: authorStr
            ? authorStr
                .split(/[,،]/)
                .map((s: string) => s.trim())
                .filter(Boolean)
            : Array.isArray(first.author)
              ? first.author
              : [],
          documents,
        },
        draftCredit(getCachedUserProfile(), {
          contributor: first.contributor,
          contributorUid: first.contributorUid,
          contributorUsername: first.contributorUsername,
          sourceSubmissionId: first.sourceSubmissionId || source?.sourceSubmissionId,
        })
      );
      bundleDraft.selected = true;

      // Replace selected items with the new bundle draft
      staged = staged.filter((d) => !selected.includes(d));
      staged.unshift(bundleDraft);
      renderStaged();

      showToast(
        lang(
          `تم تجميع ${selected.length} عناصر في حزمة دراسية واحدة بنجاح!`,
          `Grouped ${selected.length} items into a cohesive study pack!`
        ),
        'success'
      );
    };
  }

  // AI & Staging Standard Actions
  aiButton.addEventListener('click', extract);
  aiInput.addEventListener('input', invalidate);

  get('admin-add-manual-bulk-btn').onclick = () => {
    const draft = createDraft({}, draftCredit(getCachedUserProfile(), source));
    applyPresets(draft, true);
    staged.push(draft);
    renderStaged();
  };

  get('admin-add-to-staging-btn').onclick = async () => {
    if (publishing) return;
    const draft = single;
    try {
      await markDuplicates([draft], staged);
    } catch {
      report(lang('تعذر فحص التكرار', 'Duplicate check unavailable'));
    }
    if (!staged.includes(draft)) staged.push(draft);
    if (single === draft) newSingle();
    renderStaged();
  };

  get('admin-bulk-publish-btn').onclick = () => void publish(staged.filter((d) => d.selected));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void publish([single]);
  });

  get('admin-bulk-select-all-btn').onclick = () => {
    staged.forEach((d) => (d.selected = true));
    renderStaged();
  };

  get('admin-bulk-skip-dups-btn').onclick = async () => {
    try {
      await markDuplicates(staged);
      renderStaged();
    } catch {
      report(lang('تعذر فحص التكرار', 'Duplicate check unavailable'));
    }
  };

  get('admin-bulk-clear-btn').onclick = () => {
    if (confirm(lang('مسح قائمة المراجعة؟', 'Clear the review list?'))) {
      invalidate();
      staged = [];
      renderStaged();
    }
  };

  get('admin-bulk-switch-single-btn').onclick = () => form.scrollIntoView({ behavior: 'smooth' });

  get('admin-source-sub-cancel-btn').onclick = () => {
    invalidate();
    source = undefined;
    get('admin-source-submission-banner').classList.add('hidden');
    if (!singleEdited && !single.url) newSingle();
  };

  window.addEventListener(
    'admin:load-submission-for-extraction',
    (event) => {
      if (publishing) return;
      const detail = (
        event as CustomEvent<{
          submissionId: string;
          contributor?: string;
          contributorUid?: string;
          contributorUsername?: string;
          content?: string;
        }>
      ).detail;
      if (!detail) return;
      invalidate();
      source = {
        sourceSubmissionId: detail.submissionId,
        contributor: detail.contributor,
        contributorUid: detail.contributorUid,
        contributorUsername: detail.contributorUsername,
      };
      get('admin-source-submission-banner').classList.remove('hidden');
      get('admin-source-sub-text').textContent = `${lang('مساهمة', 'Submission')}: ${detail.contributor || 'فاعل خير'}`;
      aiInput.value = detail.content || '';
      document.querySelector<HTMLButtonElement>('.admin-nav-tab[data-tab="direct"]')?.click();
      void extract();
    },
    { signal: lifecycle.signal }
  );


  document.addEventListener(
    'astro:before-swap',
    () => {
      invalidate();
      lifecycle.abort();
    },
    { once: true, signal: lifecycle.signal }
  );

  refreshPresetModules();
  renderSingle();
  renderStaged();
}
