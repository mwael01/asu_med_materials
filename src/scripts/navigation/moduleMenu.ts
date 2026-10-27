import { getUserStoredYear } from '../../utils/storage';

/** Browsing another year's tab does not change the student's saved preference. */
export function initModuleYearMenu(dropdown: HTMLElement): void {
  if (dropdown.dataset.yearMenuInitialized) return;
  dropdown.dataset.yearMenuInitialized = 'true';
  const tabs = dropdown.querySelectorAll<HTMLButtonElement>('.nav-module-year-tab');
  const panels = dropdown.querySelectorAll<HTMLElement>('.nav-module-year-panel');
  const empty = dropdown.querySelector<HTMLElement>('[data-module-year-empty]');

  function switchYear(year: number | null): void {
    tabs.forEach(tab => tab.setAttribute('aria-pressed', String(Number(tab.dataset.targetYear) === year)));
    panels.forEach(panel => { panel.hidden = Number(panel.dataset.panelYear) !== year; });
    if (empty) empty.hidden = year !== null;
  }

  const update = () => {
    const pageYear = Number(dropdown.dataset.currentYear);
    switchYear(Number.isInteger(pageYear) && pageYear >= 1 && pageYear <= 5 ? pageYear : getUserStoredYear());
  };
  tabs.forEach(tab => {
    tab.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      switchYear(Number(tab.dataset.targetYear));
    });
  });
  update();

  const lifecycle = new AbortController();
  window.addEventListener('user-preferences-updated', update, { signal: lifecycle.signal });
  window.addEventListener('storage', update, { signal: lifecycle.signal });
  document.addEventListener('astro:before-swap', () => lifecycle.abort(), { once: true });
}
