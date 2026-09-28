import type { AcademicYear, MaterialItem } from './materials';

export type UserRole = 'student' | 'contributor' | 'admin';

export interface UserProfile {
  uid: string;
  username: string;       // Unique handle, e.g. "mohamed_wael" (used for /profile?u=username)
  displayName: string;    // Display name, e.g. "Mohamed Wael"
  photoURL?: string;      // Firebase Storage avatar URL
  bio?: string;           // Student bio or description
  academicYear?: AcademicYear; // Academic year 1..5
  role?: UserRole;
  contributionsCount?: number;
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
