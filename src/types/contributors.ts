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
}

export interface AuthorEntry {
  id: string;
  name: string;
  role: string;
  roleAr?: string;
  bio?: string;
  bioEn?: string;
  photo?: string;
  order: number;
  matchNames?: string[];
  contacts?: PersonContacts;
}

export interface ContributorProfile {
  id: string;
  name: string;
  photo?: string;
  note?: string;
  noteEn?: string;
  year?: number;
  matchNames: string[];
  contacts?: PersonContacts;
}

export interface ContributorsFile {
  authors: AuthorEntry[];
  contributorProfiles: ContributorProfile[];
}

export interface ContributorStats {
  name: string;
  total: number;
  authored: number;
  subjects: number;
  byType: Record<string, number>;
  byYear: Record<string, number>;
  profile?: ContributorProfile;
}
