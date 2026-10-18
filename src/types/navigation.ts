export interface NavigationCardItem {
  title: string;
  href: string;
  subject?: string;
}

export type SubjectIconName =
  | 'bone' | 'heart' | 'cells' | 'flask' | 'pill' | 'microscope'
  | 'bacteria' | 'parasite' | 'shield' | 'dna' | 'embryo'
  | 'monitor' | 'presentation' | 'stethoscope' | 'book';

export interface SubjectAppearance {
  icon: SubjectIconName;
  colors: string;
}
