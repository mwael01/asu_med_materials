import type { SupportedLanguage } from '../types/i18n';
import { translations } from '../i18n/translations';

const DEFAULT_LANG: SupportedLanguage = 'en';

export function getInitialLanguage(): SupportedLanguage {
  return DEFAULT_LANG;
}

export function getCurrentLanguage(): SupportedLanguage {
  return DEFAULT_LANG;
}

/**
 * Access English translation string by path (e.g. 'nav.home', 'year.modulesCount')
 */
export function t(
  path: string,
  _lang: SupportedLanguage = 'en',
  params?: Record<string, string | number>
): string {
  const dict = (translations.en || {}) as any;
  const keys = path.split('.');
  let current: any = dict;

  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = current[k];
    } else {
      return path;
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
 * No-op stubs for backward-compatibility
 */
export function applyLanguage(_lang?: SupportedLanguage): void {}
export function setLanguage(_lang?: SupportedLanguage): void {}
export function toggleLanguage(): SupportedLanguage {
  return DEFAULT_LANG;
}
export function initLanguageClient(): void {}

export {
  getMaterialEnglishTitle,
  getMaterialEnglishDesc,
  getMaterialArabicTitle
} from '../i18n/materialsTranslations';
