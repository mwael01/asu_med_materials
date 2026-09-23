import { getStoredStudiedIds, toggleItemStudied } from './storage';
import { getCurrentLanguage, t } from './i18n';

/**
 * Updates checkbox UI state for all materials cards, playlist headers, and drawer items in the current DOM.
 * If animateId is provided, ONLY updates elements matching that specific material ID and triggers spring micro-animation if studied.
 * If animateId is not provided, updates all buttons without animations (initial load, events).
 */
export function updateStudiedCardUI(animateId?: string): void {
  if (typeof document === 'undefined') return;

  const studiedIds = getStoredStudiedIds();

  // 1. Update data-is-studied attribute on card wrappers
  if (animateId) {
    const isStudied = studiedIds.includes(animateId);
    document.querySelectorAll<HTMLElement>(`[data-material-id="${CSS.escape(animateId)}"]`).forEach((card) => {
      if (isStudied) {
        card.setAttribute('data-is-studied', 'true');
      } else {
        card.removeAttribute('data-is-studied');
      }
    });
  } else {
    document.querySelectorAll<HTMLElement>('[data-material-id]').forEach((card) => {
      const matId = card.getAttribute('data-material-id');
      const isStudied = matId ? studiedIds.includes(matId) : false;
      if (isStudied) {
        card.setAttribute('data-is-studied', 'true');
      } else {
        card.removeAttribute('data-is-studied');
      }
    });
  }

  // 2. Update studied checkbox buttons
  if (animateId) {
    const isStudied = studiedIds.includes(animateId);
    document.querySelectorAll<HTMLButtonElement>(
      `.studied-btn[data-id="${CSS.escape(animateId)}"], [data-studied-btn][data-id="${CSS.escape(animateId)}"]`
    ).forEach((btn) => {
      updateSingleStudiedButton(btn, isStudied, isStudied);
    });
  } else {
    document.querySelectorAll<HTMLButtonElement>('.studied-btn, [data-studied-btn]').forEach((btn) => {
      const matId = btn.getAttribute('data-id');
      if (!matId) return;
      const isStudied = studiedIds.includes(matId);
      updateSingleStudiedButton(btn, isStudied, false);
    });
  }

  // 3. Update drawer studied buttons if present
  if (animateId) {
    const isStudied = studiedIds.includes(animateId);
    document.querySelectorAll<HTMLButtonElement>(
      `.drawer-studied-btn[data-drawer-studied-id="${CSS.escape(animateId)}"]`
    ).forEach((btn) => {
      updateSingleDrawerStudiedButton(btn, isStudied);
    });
  } else {
    document.querySelectorAll<HTMLButtonElement>('.drawer-studied-btn').forEach((btn) => {
      const matId = btn.getAttribute('data-drawer-studied-id');
      if (!matId) return;
      const isStudied = studiedIds.includes(matId);
      updateSingleDrawerStudiedButton(btn, isStudied);
    });
  }
}

/**
 * Updates a single studied button's UI state
 * @param btn - The button element to update
 * @param isStudied - Whether the material is studied
 * @param animate - Whether to trigger the animation
 */
function updateSingleStudiedButton(btn: HTMLButtonElement, isStudied: boolean, animate: boolean): void {
  btn.setAttribute('aria-checked', isStudied ? 'true' : 'false');
  const lang = getCurrentLanguage();
  const label = isStudied ? t('card.unmarkStudied', lang) : t('card.markStudied', lang);
  btn.setAttribute('title', label);
  btn.setAttribute('aria-label', label);

  const box = btn.querySelector<HTMLElement>('.studied-box');
  const checkmark = btn.querySelector<HTMLElement>('.studied-checkmark');

  if (isStudied) {
    btn.classList.add('is-studied');
    if (box) {
      box.classList.add(
        'is-checked',
        'border-emerald-600',
        'bg-emerald-600',
        'dark:border-emerald-500',
        'dark:bg-emerald-500',
        'text-white',
        'shadow-xs'
      );
      box.classList.remove('border-zinc-300', 'dark:border-zinc-600', 'bg-white', 'dark:bg-zinc-800');

      if (animate) {
        box.classList.remove('animate-studied-pop');
        void box.offsetWidth; // Force DOM reflow to restart CSS animation
        box.classList.add('animate-studied-pop');
      }
    }

    if (checkmark) {
      checkmark.classList.remove('hidden');

      if (animate) {
        checkmark.classList.remove('animate-checkmark');
        void checkmark.offsetWidth; // Force DOM reflow
        checkmark.classList.add('animate-checkmark');
      }
    }
  } else {
    btn.classList.remove('is-studied');
    if (box) {
      box.classList.remove(
        'is-checked',
        'animate-studied-pop',
        'border-emerald-600',
        'bg-emerald-600',
        'dark:border-emerald-500',
        'dark:bg-emerald-500',
        'text-white',
        'shadow-xs'
      );
      box.classList.add('border-zinc-300', 'dark:border-zinc-600', 'bg-white', 'dark:bg-zinc-800');
    }

    if (checkmark) {
      checkmark.classList.remove('animate-checkmark');
      checkmark.classList.add('hidden');
    }
  }
}

/**
 * Updates a single drawer studied button's UI state
 * @param btn - The button element to update
 * @param isStudied - Whether the material is studied
 */
function updateSingleDrawerStudiedButton(btn: HTMLButtonElement, isStudied: boolean): void {
  const lang = getCurrentLanguage();
  const label = isStudied ? t('card.unmarkStudied', lang) : t('card.markStudied', lang);
  btn.setAttribute('title', label);
  btn.setAttribute('aria-label', label);

  if (isStudied) {
    btn.classList.add('is-checked', 'border-emerald-600', 'bg-emerald-600', 'dark:border-emerald-500', 'dark:bg-emerald-500', 'text-white');
    btn.classList.remove('border-zinc-300', 'dark:border-zinc-600', 'bg-white', 'dark:bg-zinc-800', 'text-transparent');
    btn.querySelector('svg')?.classList.remove('hidden');
  } else {
    btn.classList.remove('is-checked', 'border-emerald-600', 'bg-emerald-600', 'dark:border-emerald-500', 'dark:bg-emerald-500', 'text-white');
    btn.classList.add('border-zinc-300', 'dark:border-zinc-600', 'bg-white', 'dark:bg-zinc-800', 'text-transparent');
    btn.querySelector('svg')?.classList.add('hidden');
  }
}

/**
 * Central event handler for studied checkbox clicks
 */
function handleStudiedClick(e: Event): void {
  const rawTarget = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
  const target = rawTarget?.closest('.studied-btn, .drawer-studied-btn, [data-studied-btn]') as HTMLElement | null;
  if (!target) return;

  // Intercept early in capture phase to completely prevent link navigation from stretched link or card click
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const matId = target.getAttribute('data-id') || target.getAttribute('data-drawer-studied-id');
  if (!matId) return;

  const isNowStudied = toggleItemStudied(matId);

  const showFn = (window as any).showToast;
  if (typeof showFn === 'function') {
    const lang = getCurrentLanguage();
    showFn({
      type: isNowStudied ? 'success' : 'info',
      message: isNowStudied ? t('card.studiedToast', lang) : t('card.unstudiedToast', lang),
      duration: 2000
    });
  }
}

let studiedListenerAttached = false;

/**
 * Initializes studied materials click listener and updates UI
 */
export function initStudiedMaterials(): void {
  updateStudiedCardUI();

  if (!studiedListenerAttached && typeof document !== 'undefined') {
    studiedListenerAttached = true;

    // Use capture phase (true) to intercept click events before any stretched link or card container can capture
    document.addEventListener('click', handleStudiedClick, true);

    window.addEventListener('studied-updated', (e: Event) => {
      const customEvent = e as CustomEvent;
      const sourceId = customEvent.detail && typeof customEvent.detail === 'object' && 'sourceId' in customEvent.detail
        ? customEvent.detail.sourceId
        : undefined;
      updateStudiedCardUI(sourceId);
    });

    window.addEventListener('asumed-language-changed', () => {
      updateStudiedCardUI();
    });

    document.addEventListener('astro:after-swap', () => {
      updateStudiedCardUI();
    });

    // Expose helpers on window for browser console testing & inspection
    try {
      (window as any).getDoneMaterials = getStoredStudiedIds;
      (window as any).toggleDoneMaterial = toggleItemStudied;
    } catch {}
  }
}