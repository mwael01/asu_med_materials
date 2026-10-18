import type { SubjectAppearance } from '../types/navigation';

const appearances: { pattern: RegExp; appearance: SubjectAppearance }[] = [
  { pattern: /embryo/i, appearance: { icon: 'embryo', colors: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' } },
  { pattern: /anat/i, appearance: { icon: 'bone', colors: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' } },
  { pattern: /physio/i, appearance: { icon: 'heart', colors: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' } },
  { pattern: /histo|cell biology/i, appearance: { icon: 'cells', colors: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' } },
  { pattern: /biochem|chemistry/i, appearance: { icon: 'flask', colors: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' } },
  { pattern: /pharm/i, appearance: { icon: 'pill', colors: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' } },
  { pattern: /patho/i, appearance: { icon: 'microscope', colors: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' } },
  { pattern: /micro/i, appearance: { icon: 'bacteria', colors: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' } },
  { pattern: /parasit/i, appearance: { icon: 'parasite', colors: 'bg-lime-50 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300' } },
  { pattern: /immun/i, appearance: { icon: 'shield', colors: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300' } },
  { pattern: /genetic/i, appearance: { icon: 'dna', colors: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300' } },
  { pattern: /\bict\b|computer|informatics/i, appearance: { icon: 'monitor', colors: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' } },
  { pattern: /presentation|communication/i, appearance: { icon: 'presentation', colors: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' } },
  { pattern: /clinical|medicine|surgery|pediatric|gyn[ae]+c|obstetric/i, appearance: { icon: 'stethoscope', colors: 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300' } },
];

const defaultAppearance: SubjectAppearance = {
  icon: 'book', colors: 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
};

export function getSubjectAppearance(subject: string): SubjectAppearance {
  return appearances.find(item => item.pattern.test(subject))?.appearance || defaultAppearance;
}
