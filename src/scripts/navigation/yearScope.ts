import { getUserStoredYear } from '../../utils/storage';

export function initYearScope(): void {
  const root = document.querySelector<HTMLElement>('[data-saved-year-scope]');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  function update() {
    const year = getUserStoredYear();
    let visible = false;
    root!.querySelectorAll<HTMLElement>('[data-scope-year]').forEach(section => {
      const matches = Number(section.dataset.scopeYear) === year;
      section.hidden = !matches;
      if (matches) visible = true;
    });
    root!.querySelectorAll<HTMLElement>('[data-year-label]').forEach(label => {
      label.textContent = year ? `Year ${year}` : 'Choose your year';
    });
    const empty = root!.querySelector<HTMLElement>('[data-year-empty]');
    if (empty) {
      empty.hidden = visible;
      empty.textContent = year ? 'No resources available for this year yet.' : 'Choose your year to continue.';
    }
  }
  update();
  const lifecycle = new AbortController();
  window.addEventListener('user-preferences-updated', update, { signal: lifecycle.signal });
  window.addEventListener('storage', update, { signal: lifecycle.signal });
  document.addEventListener('astro:before-swap', () => lifecycle.abort(), { once: true });
}
