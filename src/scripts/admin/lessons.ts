import { fetchLessonsFromFirestore, saveLessonToFirestore } from '../../firebase/lessons';
import { fetchMaterialLessonLinks, assignMaterialToLessons } from '../../firebase/materialLessonLinks';
import { attachLessonLinks, isMaterialAssignedToLesson, materialLessonLinkId } from '../../utils/materialLessonLinks';
import { fetchMaterialsFromFirestore, fetchModulesFromFirestore } from '../../firebase/firestore';
import { getCachedUserProfile } from '../../firebase/auth';
import type { Lesson } from '../../types/lessons';
import type { MaterialItem, ModuleInfo } from '../../types/materials';
import { subjectToSlug } from '../../utils/slug';

export function initAdminLessons(): void {
  const root = document.querySelector<HTMLElement>('[data-lesson-manager]');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const moduleSelect = root.querySelector<HTMLSelectElement>('[data-lessons-module]')!;
  const subjectSelect = root.querySelector<HTMLSelectElement>('[data-lessons-subject]')!;
  const editSelect = root.querySelector<HTMLSelectElement>('[data-lesson-edit]')!;
  const form = root.querySelector<HTMLFormElement>('[data-lesson-form]')!;
  const status = root.querySelector<HTMLElement>('[data-lessons-status]')!;
  const assignments = root.querySelector<HTMLElement>('[data-lesson-assignments]')!;
  let modules: ModuleInfo[] = [], lessons: Lesson[] = [], materials: MaterialItem[] = [];
  let loaded = false, loading = false;
  const selectedLessons = () => lessons.filter(lesson => lesson.moduleId === moduleSelect.value &&
    subjectToSlug(lesson.subject) === subjectToSlug(subjectSelect.value))
    .sort((a,b) => a.order - b.order || a.title.localeCompare(b.title));
  function report(error: unknown) { status.textContent = error instanceof Error ? error.message : 'Unable to save. Try again.'; }
  function resetForm() { form.reset(); editSelect.value = ''; }
  function renderAssignments() {
    assignments.replaceChildren();
    const items = materials.filter(item => item.moduleId === moduleSelect.value);
    for (const material of items) {
      const row = document.createElement('div'); row.className = 'grid sm:grid-cols-[1fr_15rem] gap-2 items-center py-2 border-b border-zinc-100 dark:border-zinc-800';
      const title = document.createElement('span'); title.className = 'text-sm break-words'; title.textContent = material.titleEn || material.title;
      const select = document.createElement('select'); select.className = 'study-input'; select.setAttribute('aria-label', `Lesson for ${material.title}`);
      select.multiple = true; select.size = 4;
      const moduleLessons = lessons.filter(lesson => lesson.moduleId === material.moduleId)
        .sort((a, b) => a.subject.localeCompare(b.subject) || a.order - b.order);
      for (const lesson of moduleLessons) {
        const option = new Option(`${lesson.subject} · ${lesson.title}${lesson.active ? '' : ' (inactive)'}`, lesson.id);
        option.selected = isMaterialAssignedToLesson(material, lesson);
        select.append(option);
      }
      const previousIds = [...new Set([material.lessonId, ...(material.lessonLinks || []).map(link => link.lessonId)].filter((id): id is string => Boolean(id)))];
      for (const id of previousIds.filter(id => !moduleLessons.some(lesson => lesson.id === id))) {
        select.append(new Option('Unavailable lesson — deselect to remove', id, false, true));
      }
      const control = document.createElement('div'); control.className = 'space-y-2';
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save assignments'; save.className = 'text-sm text-emerald-600';
      save.addEventListener('click', async () => {
        const ids = [...select.selectedOptions].map(option => option.value);
        select.disabled = true; save.disabled = true;
        try {
          await assignMaterialToLessons(material.id, ids);
          material.lessonId = undefined;
          material.lessonLinks = ids.map(lessonId => ({ id: materialLessonLinkId(material.id, lessonId), materialId: material.id, moduleId: material.moduleId!, lessonId }));
          status.textContent = 'Assignment saved.';
        } catch (error) { report(error); }
        finally { select.disabled = false; save.disabled = false; }
      });
      control.append(select, save); row.append(title, control); assignments.append(row);
    }
    if (!items.length) assignments.textContent = 'No materials in this module yet.';
  }
  function renderSubject() {
    editSelect.replaceChildren(new Option('New lesson', ''), ...selectedLessons().map(lesson => new Option(`${lesson.order}. ${lesson.title}${lesson.active ? '' : ' (inactive)'}`, lesson.id)));
    resetForm(); renderAssignments();
  }
  function renderModule() {
    const module = modules.find(item => item.id === moduleSelect.value);
    subjectSelect.replaceChildren(...(module?.subjects || []).map(subject => new Option(subject, subject)));
    renderSubject();
  }
  async function load() {
    if (loading || getCachedUserProfile()?.role !== 'admin') return;
    loading = true; status.textContent = 'Loading…';
    try {
      const [loadedModules, loadedLessons, loadedMaterials, links] = await Promise.all([fetchModulesFromFirestore(undefined, true), fetchLessonsFromFirestore(true), fetchMaterialsFromFirestore(undefined, true), fetchMaterialLessonLinks(true)]);
      modules = loadedModules; lessons = loadedLessons; materials = attachLessonLinks(loadedMaterials, links);
      const selectedModule = moduleSelect.value, selectedSubject = subjectSelect.value;
      moduleSelect.replaceChildren(...modules.map(module => new Option(`Year ${module.year} · ${module.title}`, module.id)));
      if (modules.some(module => module.id === selectedModule)) moduleSelect.value = selectedModule;
      renderModule();
      if ([...subjectSelect.options].some(option => option.value === selectedSubject)) { subjectSelect.value = selectedSubject; renderSubject(); }
      loaded = true; status.textContent = '';
    } catch (error) { report(error); }
    finally { loading = false; }
  }
  moduleSelect.addEventListener('change', renderModule);
  subjectSelect.addEventListener('change', renderSubject);
  editSelect.addEventListener('change', () => {
    const lesson = lessons.find(item => item.id === editSelect.value);
    form.querySelector<HTMLInputElement>('[name=title]')!.value = lesson?.title || '';
    form.querySelector<HTMLInputElement>('[name=order]')!.value = String(lesson?.order || 0);
    form.querySelector<HTMLInputElement>('[name=active]')!.checked = lesson?.active !== false;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!loaded) return;
    const button = form.querySelector<HTMLButtonElement>('[type=submit]')!; button.disabled = true;
    const lesson: Lesson = { id: editSelect.value || crypto.randomUUID(), moduleId: moduleSelect.value, subject: subjectSelect.value,
      title: form.querySelector<HTMLInputElement>('[name=title]')!.value.trim(),
      order: Number(form.querySelector<HTMLInputElement>('[name=order]')!.value), active: form.querySelector<HTMLInputElement>('[name=active]')!.checked };
    try {
      await saveLessonToFirestore(lesson);
      lessons = [...lessons.filter(item => item.id !== lesson.id), lesson];
      renderSubject(); status.textContent = 'Lesson saved.';
    } catch (error) { report(error); }
    finally { button.disabled = false; }
  });
  root.querySelector('[data-lessons-refresh]')!.addEventListener('click', load);
  document.querySelector('[data-tab=lessons]')?.addEventListener('click', () => { if (!loaded) void load(); });
}
