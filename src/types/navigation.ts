export type SubjectIconName =
  | 'bone' | 'heart' | 'cells' | 'flask' | 'pill' | 'microscope'
  | 'bacteria' | 'parasite' | 'shield' | 'dna' | 'embryo'
  | 'monitor' | 'presentation' | 'stethoscope' | 'book'
  | 'droplet' | 'compass' | 'brain' | 'activity' | 'lungs';

export interface SubjectAppearance {
  icon: SubjectIconName;
  colors: string;
}

export interface NavigationCardItem {
  title: string;
  href: string;
  subject?: string;
  appearance?: SubjectAppearance;
}

export interface NavCrumbOption {
  title: string;
  href: string;
  active?: boolean;
  year?: number;
}

export interface NavCrumb {
  title: string;
  href?: string;
  menu?: NavCrumbOption[];
  isYear?: boolean;
  isModule?: boolean;
  year?: number;
}
