import type { AcademicYear, MaterialItem } from './materials';

export type UserRole = 'student' | 'contributor' | 'admin';

export type ContactPlatform =
  | 'whatsapp'
  | 'telegram'
  | 'facebook'
  | 'youtube'
  | 'linkedin'
  | 'github'
  | 'website'
  | 'email'
  | 'other';

export interface UserContact {
  platform: ContactPlatform;
  url: string;
  label?: string;
}

export interface UserProfile {
  uid: string;
  username: string;       // Unique handle, e.g. "mohamed_wael" (used for /profile?u=username)
  hasCustomUsername?: boolean; // Whether the user has chosen their permanent unique username
  displayName: string;    // Display name, e.g. "Mohamed Wael"
  photoURL?: string;      // Firebase Storage avatar URL
  bio?: string;           // Student bio or description
  academicYear?: AcademicYear; // Academic year 1..5
  role?: UserRole;
  adminRoleDescription?: string; // Role description shown under name in Core Team card
  contacts?: UserContact[];      // Social and contact links
  contributionsCount?: number;
  bookmarks?: string[];          // Material IDs bookmarked by user
  completedMaterials?: string[]; // Material IDs marked as completed / studied by user
  createdAt: string;
  updatedAt?: string;
}

export interface UserContribution {
  id: string;
  material: MaterialItem;
  status: 'published' | 'pending' | 'draft';
  submittedAt: string;
}

export interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
}
