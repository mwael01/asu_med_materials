import { createSearchDocument, scoreSearchDocument, tokenizeQuery } from '../../utils/search';
import { getUserStoredYear } from '../../utils/storage';
import type { MaterialItem, ModuleInfo } from '../../types/materials';

export function initSearchPage(): void {
  const root = document.querySelector<HTMLElement>('[data-search-page]');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const { materials, modules }: { materials: MaterialItem[]; modules: ModuleInfo[] } = JSON.parse(root.querySelector('[data-search-data]')?.textContent || '{}');
  const input = root.querySelector<HTMLInputElement>('#site-search-input')!;
  const all = root.querySelector<HTMLInputElement>('[data-search-all]')!;
  const results = root.querySelector<HTMLElement>('[data-search-results]')!;
  const grid = results.querySelector<HTMLElement>('.materials-grid');
  const empty = root.querySelector<HTMLElement>('[data-search-empty]')!;
  const cards = [...results.querySelectorAll<HTMLElement>('[data-material-id]')];
  const cardById = new Map(cards.map(card => [card.dataset.materialId!, card]));
  const moduleMap = new Map(modules.map(module => [module.id, module]));
  let docs: ReturnType<typeof createSearchDocument>[] | undefined;
  const params = new URLSearchParams(location.search);
  input.value = params.get('q') || '';
  all.checked = params.get('year') === 'all';
  let explicitYear = /^[1-5]$/.test(params.get('year') || '') ? Number(params.get('year')) : null;
  const lifecycle = new AbortController();
  function apply() {
    const year = explicitYear || getUserStoredYear();
    const query = input.value.trim();
    const tokens = tokenizeQuery(query);
    let scores: { id: string; score: number }[];
    if (tokens.length) {
      docs ||= materials.map(material => createSearchDocument(material, moduleMap.get(material.moduleId || '')));
      scores = docs.filter(doc => all.checked || doc.year === year)
        .map(doc => ({ id: doc.id, score: scoreSearchDocument(doc, query, tokens) })).filter(item => item.score > 0)
        .sort((a,b) => b.score - a.score);
    } else scores = materials.filter(item => all.checked || item.year === year).map(item => ({ id: item.id, score: 1 }));
    const visible = new Set(scores.map(item => item.id));
    cards.forEach(card => { card.hidden = !visible.has(card.dataset.materialId!); });
    if (grid) {
      const fragment = document.createDocumentFragment();
      for (const result of scores) {
        const card = cardById.get(result.id); if (card) fragment.append(card);
      }
      grid.append(fragment);
    }
    results.hidden = scores.length === 0;
    empty.hidden = scores.length > 0;
    root!.querySelector('[data-search-year]')!.textContent = all.checked ? 'All years' : year ? `Year ${year}` : 'Choose your year on Home';
    const url = new URL(location.href);
    url.search = '';
    if (query) url.searchParams.set('q', query);
    if (all.checked) url.searchParams.set('year', 'all');
    else if (explicitYear) url.searchParams.set('year', String(explicitYear));
    history.replaceState(null, '', url);
  }
  let timer: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(apply, 70); });
  all.addEventListener('change', apply);
  root.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); apply(); });
  window.addEventListener('user-preferences-updated', () => { explicitYear = null; apply(); }, { signal: lifecycle.signal });
  window.addEventListener('storage', apply, { signal: lifecycle.signal });
  window.addEventListener('popstate', () => {
    const next = new URLSearchParams(location.search);
    input.value = next.get('q') || '';
    all.checked = next.get('year') === 'all';
    explicitYear = /^[1-5]$/.test(next.get('year') || '') ? Number(next.get('year')) : null;
    apply();
  }, { signal: lifecycle.signal });
  document.addEventListener('astro:before-swap', () => { clearTimeout(timer); lifecycle.abort(); }, { once: true });
  apply();
}
