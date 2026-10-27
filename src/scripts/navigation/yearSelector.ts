import { navigate } from 'astro:transitions/client';
import { getUserStoredYear, setUserStoredYear } from '../../utils/storage';
import type { AcademicYear } from '../../types/materials';

export function initYearSelector(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#year-selector');
  if (!dialog || dialog.dataset.initialized) return;
  dialog.dataset.initialized = 'true';
  const choices = dialog.querySelectorAll<HTMLButtonElement>('[data-select-year]');
  const open = () => {
    const year = getUserStoredYear();
    choices.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.selectYear) === year)));
    if (!dialog.open) dialog.showModal();
    const selected = Array.from(choices).find(button => Number(button.dataset.selectYear) === year);
    (selected || choices[0])?.focus();
  };
  document.querySelectorAll<HTMLButtonElement>('.trigger-multistage-selector').forEach(button => button.addEventListener('click', open));
  dialog.querySelector('[data-close-year]')?.addEventListener('click', () => dialog.close());
  choices.forEach(button => {
    button.addEventListener('click', () => {
      const selectedYear = Number(button.dataset.selectYear) as AcademicYear;
      if (!Number.isInteger(selectedYear) || selectedYear < 1 || selectedYear > 5) return;
      setUserStoredYear(selectedYear);
      dialog.close();
      void navigate(button.dataset.yearHref || `/year/${selectedYear}`);
    });
  });

  // A dismissed prompt must not permanently suppress onboarding on the next visit.
  if (!getUserStoredYear() && !/^\/(admin|profile)(\/|$)/.test(location.pathname)) open();
}
