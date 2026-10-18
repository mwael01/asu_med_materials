import type { SubjectAppearance, SubjectIconName } from '../types/navigation';

export const MODULE_COLOR_PALETTE: Record<string, string> = {
  red: 'bg-red-950/50 text-red-300 dark:bg-red-950/50 dark:text-red-300',
  rose: 'bg-rose-950/50 text-rose-300 dark:bg-rose-950/50 dark:text-rose-300',
  orange: 'bg-orange-950/50 text-orange-300 dark:bg-orange-950/50 dark:text-orange-300',
  amber: 'bg-amber-950/50 text-amber-300 dark:bg-amber-950/50 dark:text-amber-300',
  yellow: 'bg-yellow-950/50 text-yellow-300 dark:bg-yellow-950/50 dark:text-yellow-300',
  emerald: 'bg-emerald-950/50 text-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300',
  teal: 'bg-teal-950/50 text-teal-300 dark:bg-teal-950/50 dark:text-teal-300',
  cyan: 'bg-cyan-950/50 text-cyan-300 dark:bg-cyan-950/50 dark:text-cyan-300',
  sky: 'bg-sky-950/50 text-sky-300 dark:bg-sky-950/50 dark:text-sky-300',
  blue: 'bg-blue-950/50 text-blue-300 dark:bg-blue-950/50 dark:text-blue-300',
  indigo: 'bg-indigo-950/50 text-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-300',
  violet: 'bg-violet-950/50 text-violet-300 dark:bg-violet-950/50 dark:text-violet-300',
  purple: 'bg-purple-950/50 text-purple-300 dark:bg-purple-950/50 dark:text-purple-300',
  fuchsia: 'bg-fuchsia-950/50 text-fuchsia-300 dark:bg-fuchsia-950/50 dark:text-fuchsia-300',
  pink: 'bg-pink-950/50 text-pink-300 dark:bg-pink-950/50 dark:text-pink-300',
  lime: 'bg-lime-950/50 text-lime-300 dark:bg-lime-950/50 dark:text-lime-300',
  slate: 'bg-slate-800/60 text-slate-300 dark:bg-slate-800/60 dark:text-slate-300',
};

export const AVAILABLE_MODULE_ICONS: readonly SubjectIconName[] = [
  'compass',
  'droplet',
  'bone',
  'heart',
  'cells',
  'flask',
  'pill',
  'microscope',
  'bacteria',
  'parasite',
  'shield',
  'dna',
  'embryo',
  'monitor',
  'presentation',
  'stethoscope',
  'book',
  'brain',
  'activity'
] as const;

const validIconsSet = new Set<string>(AVAILABLE_MODULE_ICONS);

const appearances: { pattern: RegExp; appearance: SubjectAppearance }[] = [
  { pattern: /embryo/i, appearance: { icon: 'embryo', colors: 'bg-orange-950/50 text-orange-300 dark:bg-orange-950/50 dark:text-orange-300' } },
  { pattern: /anat/i, appearance: { icon: 'bone', colors: 'bg-rose-950/50 text-rose-300 dark:bg-rose-950/50 dark:text-rose-300' } },
  { pattern: /physio/i, appearance: { icon: 'heart', colors: 'bg-red-950/50 text-red-300 dark:bg-red-950/50 dark:text-red-300' } },
  { pattern: /histo|cell biology/i, appearance: { icon: 'cells', colors: 'bg-violet-950/50 text-violet-300 dark:bg-violet-950/50 dark:text-violet-300' } },
  { pattern: /biochem|chemistry/i, appearance: { icon: 'flask', colors: 'bg-amber-950/50 text-amber-300 dark:bg-amber-950/50 dark:text-amber-300' } },
  { pattern: /pharm/i, appearance: { icon: 'pill', colors: 'bg-emerald-950/50 text-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300' } },
  { pattern: /patho/i, appearance: { icon: 'microscope', colors: 'bg-blue-950/50 text-blue-300 dark:bg-blue-950/50 dark:text-blue-300' } },
  { pattern: /micro/i, appearance: { icon: 'bacteria', colors: 'bg-teal-950/50 text-teal-300 dark:bg-teal-950/50 dark:text-teal-300' } },
  { pattern: /parasit/i, appearance: { icon: 'parasite', colors: 'bg-lime-950/50 text-lime-300 dark:bg-lime-950/50 dark:text-lime-300' } },
  { pattern: /immun/i, appearance: { icon: 'shield', colors: 'bg-cyan-950/50 text-cyan-300 dark:bg-cyan-950/50 dark:text-cyan-300' } },
  { pattern: /genetic/i, appearance: { icon: 'dna', colors: 'bg-fuchsia-950/50 text-fuchsia-300 dark:bg-fuchsia-950/50 dark:text-fuchsia-300' } },
  { pattern: /\bict\b|computer|informatics/i, appearance: { icon: 'monitor', colors: 'bg-sky-950/50 text-sky-300 dark:bg-sky-950/50 dark:text-sky-300' } },
  { pattern: /presentation|communication/i, appearance: { icon: 'presentation', colors: 'bg-indigo-950/50 text-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-300' } },
  { pattern: /clinical|medicine|surgery|pediatric|gyn[ae]+c|obstetric/i, appearance: { icon: 'stethoscope', colors: 'bg-pink-950/50 text-pink-300 dark:bg-pink-950/50 dark:text-pink-300' } },
];

const defaultAppearance: SubjectAppearance = {
  icon: 'book',
  colors: 'bg-slate-800/60 text-slate-300 dark:bg-slate-800/60 dark:text-slate-300',
};

export function getSubjectAppearance(subject: string): SubjectAppearance {
  return appearances.find(item => item.pattern.test(subject))?.appearance || defaultAppearance;
}

export function getModuleAppearance(mod?: { icon?: string; color?: string; id?: string; title?: string } | null): SubjectAppearance {
  if (!mod) return defaultAppearance;

  let icon: SubjectIconName = 'book';
  if (mod.icon && validIconsSet.has(mod.icon)) {
    icon = mod.icon as SubjectIconName;
  } else {
    const text = `${mod.id || ''} ${mod.title || ''}`.toLowerCase();
    if (text.includes('blood')) icon = 'droplet';
    else if (text.includes('intro')) icon = 'compass';
    else if (text.includes('ict') || text.includes('computer')) icon = 'monitor';
    else if (text.includes('pharm')) icon = 'pill';
    else if (text.includes('patho')) icon = 'microscope';
    else if (text.includes('infect') || text.includes('micro')) icon = 'bacteria';
    else if (text.includes('locomotor') || text.includes('musculo') || text.includes('bone')) icon = 'bone';
    else if (text.includes('heart') || text.includes('cardio') || text.includes('cvs')) icon = 'heart';
    else if (text.includes('neuro') || text.includes('cns') || text.includes('brain')) icon = 'brain';
    else icon = 'book';
  }

  let colors = MODULE_COLOR_PALETTE.slate;
  const colorKey = mod.color?.toLowerCase().trim();
  if (colorKey && MODULE_COLOR_PALETTE[colorKey]) {
    colors = MODULE_COLOR_PALETTE[colorKey];
  } else if (mod.color && mod.color.includes('bg-')) {
    colors = mod.color;
  } else {
    const text = `${mod.id || ''} ${mod.title || ''}`.toLowerCase();
    if (text.includes('blood')) colors = MODULE_COLOR_PALETTE.red;
    else if (text.includes('intro')) colors = MODULE_COLOR_PALETTE.indigo;
    else if (text.includes('ict')) colors = MODULE_COLOR_PALETTE.sky;
    else if (text.includes('pharm')) colors = MODULE_COLOR_PALETTE.emerald;
    else if (text.includes('patho')) colors = MODULE_COLOR_PALETTE.amber;
    else if (text.includes('infect')) colors = MODULE_COLOR_PALETTE.teal;
    else if (text.includes('locomotor')) colors = MODULE_COLOR_PALETTE.rose;
    else if (text.includes('reference')) colors = MODULE_COLOR_PALETTE.purple;
    else colors = MODULE_COLOR_PALETTE.slate;
  }

  return { icon, colors };
}
