import type { MaterialItem } from '../types/materials';

/** Formatting equivalence only. Spelling variants and abbreviated names need source review. */
export function teacherIdentity(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase()
    .replace(/^(?:(?:dr|prof)\.\s*|(?:dr|doctor|prof|professor)\s+|د\.\s*|(?:دكتور|دكتورة)\s+)+/u, '')
    .replace(/\p{Pd}/gu, '-')
    .replace(/\b(el|al)[ -]+(?=\p{L}{2})/gu, '$1')
    .replace(/\s+/gu, ' ');
}

/** Pick the same label regardless of material order; prefer a titled name. */
export function preferredTeacherName(names: string[]): string {
  return [...new Set(names.map(name => name.normalize('NFKC').trim()).filter(Boolean))]
    .sort((a, b) => Number(/^(?:dr\b|doctor\b|prof\b|د\.|دكتور)/iu.test(b)) -
      Number(/^(?:dr\b|doctor\b|prof\b|د\.|دكتور)/iu.test(a)) || a.localeCompare(b, 'en'))[0] || '';
}
/** Learn only reviewed aliases from Firestore. Ambiguous short names stay separate. */
export function teacherNameResolver(materials: Pick<MaterialItem, 'author' | 'authorAliases'>[]): (name: string) => string {
  const aliases = new Map<string, Map<string, string[]>>();
  for (const material of materials) {
    const authors = Array.isArray(material.author) ? material.author : [material.author || ''];
    for (const [alias, canonical] of Object.entries(material.authorAliases || {})) {
      const target = teacherIdentity(canonical);
      if (!target || !authors.some(author => teacherIdentity(author) === target)) continue;
      const candidates = aliases.get(teacherIdentity(alias)) || new Map<string, string[]>();
      candidates.set(target, [...(candidates.get(target) || []), canonical]);
      aliases.set(teacherIdentity(alias), candidates);
    }
  }
  return name => {
    const candidates = aliases.get(teacherIdentity(name));
    return candidates?.size === 1 ? preferredTeacherName([...candidates.values()][0]) : name;
  };
}
