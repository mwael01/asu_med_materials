/**
 * Normalizes text for comprehensive, high-precision search.
 * - Converts to lower-case.
 * - Removes Arabic diacritics / tashkeel.
 * - Normalizes Arabic hamzas (أ, إ, آ, ٱ -> ا).
 * - Normalizes taa marbuta (ة -> ه) and yaa / alif maqsura (ى -> ي).
 * - Strips tatweel (ـ).
 * - Converts punctuation and special characters into spaces.
 * - Collapses consecutive whitespace.
 */
export function normalizeSearchText(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[.,/#!$%\^&\*;:{}=\-_`~()\[\]"'?@+|<>\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips common Arabic prefixes (such as the definite article "ال", title prefixes "دكتور",
 * or conjunctions "و"/"ف") from a normalized Arabic token when the word length allows.
 */
export function stripArabicPrefix(word: string): string {
  if (!word || word.length < 3) return word;

  // Title prefixes
  if (word.startsWith('دكتور') && word.length > 5) {
    return word.slice(5);
  }
  if (word.startsWith('دكتوره') && word.length > 6) {
    return word.slice(6);
  }
  if (word.startsWith('د') && word.length >= 4) {
    // e.g. "دناجي" -> "ناجي", "دوهدان" -> "وهدان"
    const withoutD = word.slice(1);
    if (withoutD.length >= 3) return withoutD;
  }

  // Definite article "ال" (e.g. "الباثولوجي" -> "باثولوجي", "العملي" -> "عملي")
  if (word.startsWith('ال') && word.length >= 4) {
    const withoutAl = word.slice(2);
    // Double check for preposition+al: e.g. "للعملي" -> handled below
    if (withoutAl.length >= 2) return withoutAl;
  }

  // Preposition "لل" (e.g. "للعملي" -> "عملي")
  if (word.startsWith('لل') && word.length >= 4) {
    return word.slice(2);
  }

  // Conjunction prefix ("وال" e.g. "والباثولوجي" -> "باثولوجي")
  if (word.startsWith('وال') && word.length >= 5) {
    return word.slice(3);
  }

  // Preposition with definite article ("بال", "كال", "لل")
  if ((word.startsWith('بال') || word.startsWith('كال')) && word.length >= 5) {
    return word.slice(3);
  }

  // Conjunction "و" followed by a word (e.g. "وباثولوجي" -> "باثولوجي"), excluding names like "وهدان"
  if (word.startsWith('و') && word.length >= 5 && !word.startsWith('وهدان')) {
    return word.slice(1);
  }

  return word;
}

/**
 * Normalizes English and Arabic plurals / suffixes to root forms.
 */
export function stemToken(token: string): string {
  if (!token) return '';
  let stemmed = token;

  // 1. Strip Arabic prefixes first
  stemmed = stripArabicPrefix(stemmed);

  // 2. Arabic plural and feminine suffixes (ات, ين, ون, يه, ه)
  if (stemmed.length >= 5) {
    if (stemmed.endsWith('ات')) {
      stemmed = stemmed.slice(0, -2);
    } else if (stemmed.endsWith('ين') || stemmed.endsWith('ون') || stemmed.endsWith('يه')) {
      stemmed = stemmed.slice(0, -2);
    }
  }

  // Trailing feminine marker "ه" (e.g. "محاضره" -> "محاضر", "فيديوه" -> "فيديو", "تسجيله" -> "تسجيل")
  if (stemmed.endsWith('ه') && stemmed.length >= 4 && !stemmed.endsWith('الله')) {
    stemmed = stemmed.slice(0, -1);
  }

  // 3. English plurals
  const preservedEnglishShort = new Set(['cns', 'cvs', 'peds', 'ospe', 'plus', 'this', 'yes']);
  if (!preservedEnglishShort.has(stemmed) && /^[a-z]+$/.test(stemmed)) {
    if (stemmed.length > 4 && stemmed.endsWith('ies')) {
      stemmed = stemmed.slice(0, -3) + 'y';
    } else if (
      stemmed.length > 4 &&
      (stemmed.endsWith('sses') || stemmed.endsWith('shes') || stemmed.endsWith('ches') || stemmed.endsWith('xes'))
    ) {
      stemmed = stemmed.slice(0, -2);
    } else if (stemmed.length > 3 && stemmed.endsWith('s') && !stemmed.endsWith('ss')) {
      stemmed = stemmed.slice(0, -1);
    }
  }

  return stemmed;
}

/**
 * Tokenizes a user query into clean, normalized, and stemmed search terms.
 * Ignores empty noise tokens and single doctor title letters.
 */
export function tokenizeQuery(query: string): string[] {
  const norm = normalizeSearchText(query);
  if (!norm) return [];

  const rawTokens = norm.split(/\s+/).filter(Boolean);
  const result: string[] = [];

  for (const t of rawTokens) {
    // Skip standalone title indicator ("د", "dr", "دكتور", "دكتوره", "doctor") if other tokens exist
    const isDoctorTitle = t === 'د' || t === 'dr' || t === 'دكتور' || t === 'دكتوره' || t === 'doctor';
    if (isDoctorTitle && rawTokens.length > 1) {
      continue;
    }
    result.push(t);
  }

  return result.length > 0 ? result : rawTokens;
}
