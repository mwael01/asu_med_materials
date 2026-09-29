export interface ContactLink {
  label?: string;
  value: string;
  href: string;
}

export interface PersonContacts {
  whatsapp?: ContactLink[];
  telegram?: ContactLink[];
  github?: ContactLink[];
  linkedin?: ContactLink[];
  instagram?: ContactLink[];
  linktree?: ContactLink[];
  facebook?: ContactLink[];
  youtube?: ContactLink[];
  website?: ContactLink[];
  email?: ContactLink[];
  other?: ContactLink[];
}

export interface AuthorEntry {
  id: string;
  name: string;
  role: string;
  roleAr?: string;
  adminRoleDescription?: string;
  bio?: string;
  bioEn?: string;
  photo?: string;
  order: number;
  badge?: {
    text: string;
    textAr?: string;
  };
  matchNames?: string[];
  contacts?: PersonContacts;
}

export interface ContributorStats {
  name: string;
  total: number;
  authored: number;
  subjects: number;
  byType: Record<string, number>;
  byYear: Record<string, number>;
  username?: string;
}
