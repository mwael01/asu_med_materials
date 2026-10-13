import { normalizeSearchText } from './searchNormalize';

/**
 * Groups of equivalent medical terms, subjects, doctor names, and academic keywords.
 * Bidirectional: matching any word in a group connects to all words in the group.
 */
const ALIAS_GROUPS: string[][] = [
  // --- Medical Subjects ---
  ['pathology', 'patho', 'باثولوجي', 'باثو'],
  ['physiology', 'physio', 'فسيولوجي', 'فسيولوجيا', 'فزيو'],
  ['anatomy', 'anat', 'تشريح', 'اناتومي'],
  ['histology', 'histo', 'هستولوجي', 'هستو'],
  ['biochemistry', 'biochem', 'كيمياء حيوية', 'بايو'],
  ['pharmacology', 'pharma', 'فارماكولوجي', 'فارما'],
  ['microbiology', 'micro', 'مايكروبيولوجي', 'مايكرو'],
  ['parasitology', 'parasito', 'باراسيتولوجي', 'بارا'],
  ['forensic', 'طب شرعي', 'فورنسيك'],
  ['toxicology', 'toxic', 'سموم', 'توكسيك'],
  ['community', 'comm', 'صحة عامة', 'كوميونيتي'],
  ['cardiology', 'cardio', 'قلب', 'cvs'],
  ['neurology', 'neuro', 'اعصاب', 'cns'],
  ['pulmonology', 'respiratory', 'تنفسي', 'rs'],
  ['nephrology', 'renal', 'كلى'],
  ['pediatrics', 'peds', 'ped', 'اطفال'],
  ['obstetrics', 'gynecology', 'obgyn', 'gyne', 'obs', 'نسا', 'توليد'],
  ['surgery', 'surg', 'جراحة'],
  ['internal medicine', 'med', 'باطنة'],
  ['ophthalmology', 'ophthal', 'رمد'],
  ['ent', 'انف واذن'],
  ['orthopedic', 'ortho', 'عظام'],

  // --- Common Doctors & Faculty Members ---
  ['nagi', 'nagy', 'ناجي'],
  ['wahdan', 'وهدان'],
  ['tareq', 'tarek', 'طارق'],
  ['abdelmoteleb', 'abdelmottaleb', 'abdelmotaleb', 'عبدالمطلب', 'عبد المطلب'],
  ['magdy', 'magdi', 'مجدي'],
  ['ayman', 'ايمن', 'أيمن'],
  ['allam', 'علام'],
  ['shouman', 'شومان'],
  ['hesham', 'hisham', 'هشام'],
  ['samir', 'سمير'],
  ['farag', 'فرج'],
  ['saleh', 'صالح'],
  ['ashraf', 'اشرف', 'أشرف'],
  ['mahmoud', 'محمود'],
  ['ahmed', 'احمد', 'أحمد'],
  ['mohamed', 'muhammad', 'mohammad', 'محمد'],

  // --- Academic Keywords & Resource Types ---
  ['mcq', 'mcqs', 'quiz', 'exam', 'اسئلة', 'امتحانات', 'امتحان', 'بنك', 'بنوك'],
  ['practical', 'prac', 'ospe', 'lab', 'عملي', 'سلايدات', 'سلايد', 'slides'],
  ['summary', 'summaries', 'notes', 'تفريغ', 'تفريغات', 'ملخص', 'تلخيص', 'نوتس'],
  ['revision', 'review', 'مراجعة', 'فاينل', 'final'],
  ['lecture', 'lectures', 'محاضرة', 'محاضرات', 'شرح', 'فيديو', 'فيديوهات', 'record', 'records', 'تسجيل', 'تسجيلات'],
  ['book', 'books', 'كتاب', 'كتب', 'شيت', 'شيتات', 'sheet', 'sheets'],
  ['drive', 'درايف', 'google drive']
];

// Pre-computed lookup map for fast O(1) alias expansion
const ALIAS_LOOKUP = new Map<string, string[]>();

for (const group of ALIAS_GROUPS) {
  const normalizedMembers = group.map((item) => normalizeSearchText(item)).filter(Boolean);
  const uniqueMembers = Array.from(new Set(normalizedMembers));

  for (const member of uniqueMembers) {
    const existing = ALIAS_LOOKUP.get(member) || [];
    const merged = Array.from(new Set([...existing, ...uniqueMembers]));
    ALIAS_LOOKUP.set(member, merged);
  }
}

/**
 * Returns all normalized alias equivalents for a given normalized token.
 * Returns empty array if no aliases exist.
 */
export function getAliasesForToken(token: string): string[] {
  if (!token) return [];
  const direct = ALIAS_LOOKUP.get(token);
  if (direct) return direct;

  // Partial match: if the token is a prefix of an alias key (e.g. "path" -> "pathology")
  if (token.length >= 4) {
    for (const [key, aliases] of ALIAS_LOOKUP.entries()) {
      if (key.startsWith(token) || token.startsWith(key)) {
        return aliases;
      }
    }
  }

  return [];
}

/**
 * Expands an array of query tokens with their synonym/alias variants.
 */
export function expandTokensWithAliases(tokens: string[]): string[] {
  const result = new Set<string>();
  for (const t of tokens) {
    result.add(t);
    const aliases = getAliasesForToken(t);
    for (const a of aliases) {
      result.add(a);
    }
  }
  return Array.from(result);
}
