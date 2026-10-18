import { getUserStoredYear, setUserStoredYear } from '../../utils/storage';
import type { AcademicYear } from '../../types/materials';

export function initYearSelector(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#year-selector');
  if (!dialog || dialog.dataset.initialized) return;
  dialog.dataset.initialized = 'true';
  const open = () => { if (!dialog.open) dialog.showModal(); };
  document.querySelectorAll<HTMLButtonElement>('.trigger-multistage-selector').forEach(button => button.addEventListener('click', open));
  dialog.querySelector('[data-close-year]')?.addEventListener('click', () => dialog.close());
  dialog.querySelectorAll<HTMLButtonElement>('[data-select-year]').forEach(button => {
    button.addEventListener('click', () => {
      const selectedYear = Number(button.dataset.selectYear) as AcademicYear;
      setUserStoredYear(selectedYear);
      dialog.close();
      if (location.pathname === '/') {
        window.location.reload();
      }
    });
  });

  // A dismissed prompt must not permanently suppress onboarding on the next visit.
  if (!getUserStoredYear() && !['/admin', '/profile'].includes(location.pathname)) open();
}
