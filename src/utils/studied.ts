import { getStoredStudiedIds, toggleItemStudied } from './storage';
import { getCurrentLanguage } from './i18n';

/**
 * Updates checkbox UI state for all materials cards, playlist headers, and drawer items in the current DOM.
 * If animateId is provided, ONLY updates that specific button and triggers the spring micro-animation.
 * If animateId is not provided, updates all buttons without animations (initial load, events).
 */
export function updateStudiedCardUI(animateId?: string): void {
  if (typeof document === 'undefined') return;

  const studiedIds = getStoredStudiedIds();

  // 1. Update data-is-studied attribute on card wrappers
  document.querySelectorAll<HTMLElement>('[data-material-id]').forEach((card) => {
    const matId = card.getAttribute('data-material-id');
    const isStudied = matId ? studiedIds.includes(matId) : false;
    if (isStudied) {
      card.setAttribute('data-is-studied', 'true');
    } else {
      card.removeAttribute('data-is-studied');
    }
  });

  // 2. Update studied checkbox buttons
  if (animateId) {
    // When animateId is provided, ONLY update that specific button to avoid triggering transitions on other cards
    const btn = document.querySelector<HTMLButtonElement>(`.studied-btn[data-id="${CSS.escape(animateId)}"], [data-studied-btn][data-id="${CSS.escape(animateId)}"]`);
    if (btn) {
      updateSingleStudiedButton(btn, animateId, true, true);
    }
  } else {
    // No animateId: update all buttons without animations (initial load, studied-updated event, astro:after-swap)
    document.querySelectorAll<HTMLButtonElement>('.studied-btn, [data-studied-btn]').forEach((btn) => {
      const matId = btn.getAttribute('data-id');
      if (!matId) return;
      const isStudied = studiedIds.includes(matId);
      updateSingleStudiedButton(btn, matId, isStudied, false);
    });
  }

  // 3. Update drawer studied buttons if present
  if (animateId) {
    // When animateId is provided, only update the specific drawer button
    const btn = document.querySelector<HTMLButtonElement>(`.drawer-studied-btn[data-drawer-studied-id="${CSS.escape(animateId)}"]`);
    if (btn) {
      updateSingleDrawerStudiedButton(btn, animateId, true);
    }
  } else {
    // No animateId: update all drawer buttons
    document.querySelectorAll<HTMLButtonElement>('.drawer-studied-btn').forEach((btn) => {
      const matId = btn.getAttribute('data-drawer-studied-id');
      if (!matId) return;
      const isStudied = studiedIds.includes(matId);
      updateSingleDrawerStudiedButton(btn, matId, isStudied);
    });
  }
}

/**
 * Updates a single studied button's UI state
 * @param btn - The button element to update
 * @param matId - The material ID
 * @param isStudied - Whether the material is studied
 * @param animate - Whether to trigger the animation
 */
function updateSingleStudiedButton(btn: HTMLButtonElement, matId: string, isStudied: boolean, animate: boolean): void {
  btn.setAttribute('aria-checked', isStudied ? 'true' : 'false');
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
 * @param matId - The material ID
 * @param isStudied - Whether the material is studied
 */
function updateSingleDrawerStudiedButton(btn: HTMLButtonElement, matId: string, isStudied: boolean): void {
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
  updateStudiedCardUI(matId);

  const showFn = (window as any).showToast;
  if (typeof showFn === 'function') {
    const isAr = getCurrentLanguage() === 'ar';
    showFn({
      type: isNowStudied ? 'success' : 'info',
      message: isNowStudied
        ? (isAr ? 'تم التحديد كمذاكر' : 'Marked as studied')
        : (isAr ? 'تم إلغاء التحديد' : 'Unmarked as studied'),
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

    window.addEventListener('studied-updated', () => {
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