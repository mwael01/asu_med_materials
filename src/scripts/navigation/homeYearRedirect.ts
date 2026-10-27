import { navigate } from 'astro:transitions/client';
import { getUserStoredYear } from '../../utils/storage';

export function initHomeYearRedirect(): void {
  const root = document.querySelector<HTMLElement>('[data-home-year-redirect]');
  if (!root || location.pathname !== '/' || root.dataset.initialized) return;
  root.dataset.initialized = 'true';

  const year = getUserStoredYear();
  if (!year) return;

  // Destinations are resolved from the cached catalogue by the shared year dialog.
  const choice = document.querySelector<HTMLElement>(`#year-selector [data-select-year="${year}"]`);
  const destination = choice?.dataset.yearHref || `/year/${year}`;
  const directLink = root.querySelector<HTMLAnchorElement>('#direct-active-link');
  if (directLink) directLink.href = destination;

  const params = new URLSearchParams(location.search);
  if (root.dataset.autoRedirect === 'false' || params.get('redirect') === 'false') return;
  void navigate(destination, { history: 'replace' });
}
