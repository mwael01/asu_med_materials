import type { SupportedLanguage } from '../types/i18n';
import { translations } from '../i18n/translations';

const STORAGE_KEY = 'asumed_lang';
const DEFAULT_LANG: SupportedLanguage = 'en';

export function getInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {}
  return DEFAULT_LANG;
}

export function getCurrentLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  const docLang = document.documentElement.lang;
  if (docLang === 'ar' || docLang === 'en') return docLang;
  return getInitialLanguage();
}

/**
 * Access translation string by path (e.g. 'nav.home', 'year.modulesCount')
 */
export function t(
  path: string,
  lang: SupportedLanguage = getCurrentLanguage(),
  params?: Record<string, string | number>
): string {
  const dict = translations[lang] || translations[DEFAULT_LANG];
  const keys = path.split('.');
  let current: any = dict;

  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = current[k];
    } else {
      // Fallback to English dictionary if key missing
      const fallbackDict = translations.en as any;
      let fb = fallbackDict;
      for (const fbk of keys) {
        if (fb && typeof fb === 'object' && fbk in fb) {
          fb = fb[fbk];
        } else {
          return path;
        }
      }
      current = fb;
      break;
    }
  }

  if (typeof current !== 'string') {
    return path;
  }

  let result = current;
  if (params) {
    for (const [pk, pv] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${pk}\\}`, 'g'), String(pv));
    }
  }

  return result;
}

/**
 * Apply language directly to DOM elements
 */
export function applyLanguage(lang: SupportedLanguage): void {
  if (typeof window === 'undefined') return;

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  // 1. Elements with data-i18n="key"
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;

    let params: Record<string, string | number> | undefined;
    const rawParams = el.getAttribute('data-i18n-params');
    if (rawParams) {
      try {
        params = JSON.parse(rawParams);
      } catch {}
    }

    const translated = t(key, lang, params);
    if (el.getAttribute('data-i18n-html') === 'true') {
      el.innerHTML = translated;
    } else {
      el.textContent = translated;
    }
  });

  // 2. Elements with data-i18n-attr="placeholder:search.placeholder,title:nav.searchTitle"
  document.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    const attrSpec = el.getAttribute('data-i18n-attr');
    if (!attrSpec) return;

    const parts = attrSpec.split(',');
    for (const part of parts) {
      const [attrName, key] = part.split(':').map((s) => s.trim());
      if (attrName && key) {
        const translated = t(key, lang);
        el.setAttribute(attrName, translated);
      }
    }
  });

  // 3. Elements with bilingual module title/description
  document.querySelectorAll<HTMLElement>('[data-i18n-mod-title-en]').forEach((el) => {
    const enText = el.getAttribute('data-i18n-mod-title-en') || '';
    const arText = el.getAttribute('data-i18n-mod-title-ar') || '';
    el.textContent = lang === 'ar' ? (arText || enText) : (enText || arText);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-mod-desc-en]').forEach((el) => {
    const enText = el.getAttribute('data-i18n-mod-desc-en') || '';
    const arText = el.getAttribute('data-i18n-mod-desc-ar') || '';
    el.textContent = lang === 'ar' ? (arText || enText) : (enText || arText);
  });

  // 4. Material titles and descriptions
  document.querySelectorAll<HTMLElement>('[data-i18n-material-title]').forEach((el) => {
    const enText = el.getAttribute('data-title-en') || '';
    const arText = el.getAttribute('data-title-ar') || '';
    if (enText || arText) {
      el.textContent = lang === 'ar' ? (arText || enText) : (enText || arText);
    }
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-material-desc]').forEach((el) => {
    const enText = el.getAttribute('data-desc-en') || '';
    const arText = el.getAttribute('data-desc-ar') || '';
    if (enText || arText) {
      el.textContent = lang === 'ar' ? (arText || enText) : (enText || arText);
    }
  });

  // 5. Author roles, bios, and contributor notes
  document.querySelectorAll<HTMLElement>('[data-i18n-author-role]').forEach((el) => {
    const enText = el.getAttribute('data-role-en') || '';
    const arText = el.getAttribute('data-role-ar') || '';
    if (enText || arText) {
      el.textContent = lang === 'ar' ? (arText || enText) : (enText || arText);
    }
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-author-bio]').forEach((el) => {
    const enText = el.getAttribute('data-bio-en') || '';
    const arText = el.getAttribute('data-bio-ar') || '';
    if (enText || arText) {
      el.textContent = lang === 'ar' ? (arText || enText) : (enText || arText);
    }
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-contributor-note]').forEach((el) => {
    const enText = el.getAttribute('data-note-en') || '';
    const arText = el.getAttribute('data-note-ar') || '';
    if (enText || arText) {
      el.textContent = lang === 'ar' ? (arText || enText) : (enText || arText);
    }
  });

  // 6. Update language toggle button visual text
  const langToggleBtn = document.getElementById('topbar-language-toggle');
  if (langToggleBtn) {
    const labelBadge = langToggleBtn.querySelector('.lang-toggle-label');
    if (labelBadge) {
      labelBadge.textContent = lang === 'en' ? 'EN' : 'عربي';
    }
    const nextLangTitle = lang === 'en' ? 'التبديل إلى العربية' : 'Switch to English';
    langToggleBtn.setAttribute('title', nextLangTitle);
    langToggleBtn.setAttribute('aria-label', nextLangTitle);
  }

  // 6. Fire notification event so dynamic widgets (Search, Bookmarks, YearSelector, etc.) can react
  window.dispatchEvent(
    new CustomEvent('asumed-language-changed', {
      detail: { lang }
    })
  );
}

export function setLanguage(lang: SupportedLanguage): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  applyLanguage(lang);
}

export function toggleLanguage(): SupportedLanguage {
  const current = getCurrentLanguage();
  const next: SupportedLanguage = current === 'en' ? 'ar' : 'en';
  setLanguage(next);
  return next;
}

export function initLanguageClient(): void {
  if (typeof window === 'undefined') return;
  const initial = getInitialLanguage();
  applyLanguage(initial);
}

export {
  getMaterialEnglishTitle,
  getMaterialEnglishDesc,
  getMaterialArabicTitle
} from '../i18n/materialsTranslations';
