import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  DocumentData
} from 'firebase/firestore';
import type { MaterialItem, ModuleInfo, AcademicYear, ResourceType, MaterialCategory, PlaylistItem } from '../types/materials';
import type { FlashcardCard, FlashcardDeck, FlashcardRevision } from '../types/flashcards';
import type { UserProfile, UserRole } from '../types/profile';
import type { PersonContacts } from '../types/contributors';

/**
 * Canonical Cloud Firestore collection identifiers.
 */
export const COLLECTIONS = {
  MATERIALS: 'materials',
  MODULES: 'modules',
  USERS: 'users',
  SUBMISSIONS: 'submissions',
  FEEDBACK: 'feedback',
  ADMIN_LOGS: 'admin_logs',
  CONTRIBUTORS: 'contributors'
  ,FLASHCARD_DECKS: 'flashcard_decks'
  ,FLASHCARD_IMPORTS: 'flashcard_imports'
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/**
 * 1. Material Document Schema in Firestore
 */
export interface MaterialDocument {
  id: string;
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  url: string;
  type: ResourceType;
  category?: MaterialCategory;
  year: AcademicYear;
  moduleId?: string;
  subject?: string;
  author?: string | string[];
  addedBy?: string | string[];
  contributorUid?: string;
  contributorUsername?: string;
  added_by_username?: string;
  creator_username?: string;
  tags: string[];
  createdAt?: string;
  playlistId?: string;
  videos?: PlaylistItem[];
  bookmarksCount?: number;
  flashcardDeckId?: string;
}

export type FlashcardDeckDocument = FlashcardDeck;
export type FlashcardRevisionDocument = FlashcardRevision;
export type FlashcardCardDocument = FlashcardCard;

/**
 * 2. Module Document Schema in Firestore
 */
export interface ModuleDocument {
  id: string;
  code: string;
  title: string;
  titleAr?: string;
  year: AcademicYear;
  semester?: 1 | 2;
  subjects: string[];
  description?: string;
  descriptionAr?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 3. User Profile Document Schema in Firestore
 */
export interface UserDocument {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  academicYear?: AcademicYear;
  role?: UserRole;
  contributionsCount?: number;
  bookmarks?: string[];
  completedMaterials?: string[];
  createdAt: string;
  updatedAt?: string;
}

/**
 * 4. Material Submission Document Schema in Firestore
 */
export interface SubmissionDocument {
  id: string;
  mode: 'single' | 'dump';
  title?: string;
  url?: string;
  content?: string;
  urls: string[];
  contributor: string;
  contributorUid?: string;
  contributorUsername?: string;
  year: AcademicYear | 'general';
  moduleId?: string;
  subject?: string;
  type?: ResourceType;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
}

/**
 * 5. Student Feedback Document Schema in Firestore
 */
export type FeedbackCategory = 'suggestion' | 'content_issue' | 'bug' | 'general';
export type FeedbackStatus = 'new' | 'reviewed';

export interface FeedbackDocument {
  id: string;
  category: FeedbackCategory;
  message: string;
  year?: AcademicYear | 'general';
  moduleId?: string;
  senderName?: string;
  senderUid?: string;
  contact?: string; // Telegram / WhatsApp / Email
  pageUrl?: string;
  status: FeedbackStatus;
  timestamp: string;
}

/**
 * 6. Admin Action Audit Log Schema in Firestore
 */
export type AdminActionType =
  | 'publish_material'
  | 'approve_submission'
  | 'reject_submission'
  | 'resolve_feedback'
  | 'delete_feedback'
  | 'promote_admin'
  | 'demote_admin'
  | 'create_module'
  | 'update_module'
  | 'toggle_module'
  | 'delete_module'
  | 'delete_material';

export interface AdminLogDocument {
  id: string;
  adminUid: string;
  adminName: string;
  adminUsername: string;
  action: AdminActionType;
  targetId?: string;
  targetTitle?: string;
  details?: string;
  timestamp: string;
}

/**
 * 7. Contributor & Team Document Schema in Firestore
 */
export interface ContributorDocument {
  id: string;
  kind: 'author' | 'contributorProfile';
  name: string;
  role?: string;
  roleAr?: string;
  adminRoleDescription?: string;
  bio?: string;
  bioEn?: string;
  photo?: string;
  order?: number;
  badge?: {
    text: string;
    textAr?: string;
  };
  matchNames: string[];
  contacts?: PersonContacts;
  note?: string;
  noteEn?: string;
  year?: number;
}

/**
 * Firestore Data Converter for Material Documents.
 */
export const materialConverter: FirestoreDataConverter<MaterialItem> = {
  toFirestore(material: MaterialItem): DocumentData {
    return {
      id: material.id,
      title: material.title,
      titleEn: material.titleEn || null,
      description: material.description || null,
      descriptionEn: material.descriptionEn || null,
      url: material.url,
      type: material.type,
      category: material.category || null,
      year: material.year,
      moduleId: material.moduleId || null,
      subject: material.subject || null,
      author: material.author || null,
      addedBy: material.addedBy || null,
      contributorUid: material.contributorUid || null,
      contributorUsername: material.contributorUsername || null,
      added_by_username: material.added_by_username || null,
      creator_username: material.creator_username || null,
      tags: Array.isArray(material.tags) ? material.tags : [],
      createdAt: material.createdAt || new Date().toISOString(),
      playlistId: material.playlistId || null,
      videos: Array.isArray(material.videos) ? material.videos : null,
      bookmarksCount: typeof material.bookmarksCount === 'number' ? material.bookmarksCount : 0,
      flashcardDeckId: material.flashcardDeckId || null,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions
  ): MaterialItem {
    const data = snapshot.data(options);
    return {
      id: data.id || snapshot.id,
      title: data.title || '',
      titleEn: data.titleEn || undefined,
      description: data.description || undefined,
      descriptionEn: data.descriptionEn || undefined,
      url: data.url || '',
      type: data.type || 'other',
      category: data.category || undefined,
      year: (data.year || 2) as AcademicYear,
      moduleId: data.moduleId || undefined,
      subject: data.subject || undefined,
      author: data.author || undefined,
      addedBy: data.addedBy || undefined,
      contributorUid: data.contributorUid || undefined,
      contributorUsername: data.contributorUsername || undefined,
      added_by_username: data.added_by_username || undefined,
      creator_username: data.creator_username || undefined,
      tags: Array.isArray(data.tags) ? data.tags : [],
      createdAt: data.createdAt || undefined,
      playlistId: data.playlistId || undefined,
      videos: Array.isArray(data.videos) ? data.videos : undefined,
      bookmarksCount: typeof data.bookmarksCount === 'number' ? data.bookmarksCount : 0,
      flashcardDeckId: data.flashcardDeckId || undefined,
    };
  }
};

/**
 * Firestore Data Converter for Module Documents.
 */
export const moduleConverter: FirestoreDataConverter<ModuleInfo> = {
  toFirestore(mod: ModuleInfo): DocumentData {
    return {
      id: mod.id,
      code: mod.code,
      title: mod.title,
      titleAr: mod.titleAr || null,
      year: mod.year,
      semester: mod.semester || null,
      subjects: Array.isArray(mod.subjects) ? mod.subjects : [],
      description: mod.description || null,
      descriptionAr: mod.descriptionAr || null,
      active: mod.active !== false, // defaults to true
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions
  ): ModuleInfo {
    const data = snapshot.data(options);
    return {
      id: data.id || snapshot.id,
      code: data.code || '',
      title: data.title || '',
      titleAr: data.titleAr || undefined,
      year: (data.year || 1) as AcademicYear,
      semester: data.semester || undefined,
      subjects: Array.isArray(data.subjects) ? data.subjects : [],
      description: data.description || undefined,
      descriptionAr: data.descriptionAr || undefined,
      active: data.active !== false, // defaults to true
    };
  }
};

/**
 * Firestore Data Converter for User Profile Documents.
 */
export const userConverter: FirestoreDataConverter<UserProfile> = {
  toFirestore(profile: UserProfile): DocumentData {
    return {
      uid: profile.uid,
      username: profile.username.trim().toLowerCase().replace(/^@/, ''),
      displayName: profile.displayName.trim(),
      photoURL: profile.photoURL || null,
      bio: profile.bio || null,
      academicYear: profile.academicYear || null,
      role: profile.role || 'student',
      contributionsCount: profile.contributionsCount || 0,
      bookmarks: Array.isArray(profile.bookmarks) ? profile.bookmarks : [],
      completedMaterials: Array.isArray(profile.completedMaterials) ? profile.completedMaterials : [],
      createdAt: profile.createdAt || new Date().toISOString(),
      updatedAt: profile.updatedAt || new Date().toISOString()
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions
  ): UserProfile {
    const data = snapshot.data(options);
    return {
      uid: data.uid || snapshot.id,
      username: data.username || snapshot.id,
      displayName: data.displayName || 'ASU Student',
      photoURL: data.photoURL || undefined,
      bio: data.bio || undefined,
      academicYear: data.academicYear || undefined,
      role: data.role || 'student',
      contributionsCount: data.contributionsCount || 0,
      bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
      completedMaterials: Array.isArray(data.completedMaterials) ? data.completedMaterials : [],
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || undefined,
    };
  }
};

/**
 * Firestore Data Converter for Material Submissions.
 */
export const submissionConverter: FirestoreDataConverter<SubmissionDocument> = {
  toFirestore(sub: SubmissionDocument): DocumentData {
    return {
      ...sub,
      timestamp: sub.timestamp || new Date().toISOString()
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions
  ): SubmissionDocument {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      mode: data.mode || 'single',
      title: data.title,
      url: data.url,
      content: data.content,
      urls: Array.isArray(data.urls) ? data.urls : [],
      contributor: data.contributor || 'فاعل خير',
      contributorUid: data.contributorUid,
      contributorUsername: data.contributorUsername,
      year: data.year || 'general',
      moduleId: data.moduleId,
      subject: data.subject,
      type: data.type,
      notes: data.notes,
      status: data.status || 'pending',
      timestamp: data.timestamp || new Date().toISOString(),
    };
  }
};

/**
 * Firestore Data Converter for Contributor Documents.
 */
export const contributorConverter: FirestoreDataConverter<ContributorDocument> = {
  toFirestore(c: ContributorDocument): DocumentData {
    return {
      id: c.id,
      kind: c.kind,
      name: c.name,
      role: c.role || null,
      roleAr: c.roleAr || null,
      adminRoleDescription: c.adminRoleDescription || null,
      bio: c.bio || null,
      bioEn: c.bioEn || null,
      photo: c.photo || null,
      order: c.order ?? null,
      badge: c.badge || null,
      matchNames: Array.isArray(c.matchNames) ? c.matchNames : [],
      contacts: c.contacts || null,
      note: c.note || null,
      noteEn: c.noteEn || null,
      year: c.year ?? null,
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions
  ): ContributorDocument {
    const data = snapshot.data(options);
    return {
      id: data.id || snapshot.id,
      kind: data.kind || 'contributorProfile',
      name: data.name || '',
      role: data.role || undefined,
      roleAr: data.roleAr || undefined,
      adminRoleDescription: data.adminRoleDescription || undefined,
      bio: data.bio || undefined,
      bioEn: data.bioEn || undefined,
      photo: data.photo || undefined,
      order: data.order ?? undefined,
      badge: data.badge || undefined,
      matchNames: Array.isArray(data.matchNames) ? data.matchNames : [],
      contacts: data.contacts || undefined,
      note: data.note || undefined,
      noteEn: data.noteEn || undefined,
      year: data.year ?? undefined,
    };
  }
};

/**
 * Firestore Data Converter for Feedback Documents.
 */
export const feedbackConverter: FirestoreDataConverter<FeedbackDocument> = {
  toFirestore(fb: FeedbackDocument): DocumentData {
    return {
      ...fb,
      timestamp: fb.timestamp || new Date().toISOString()
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions
  ): FeedbackDocument {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      category: data.category || 'general',
      message: data.message || '',
      year: data.year || 'general',
      moduleId: data.moduleId || undefined,
      senderName: data.senderName || 'فاعل خير',
      senderUid: data.senderUid || undefined,
      contact: data.contact || undefined,
      pageUrl: data.pageUrl || undefined,
      status: data.status || 'new',
      timestamp: data.timestamp || new Date().toISOString(),
    };
  }
};

/**
 * Firestore Data Converter for Admin Activity Log Documents.
 */
export const adminLogConverter: FirestoreDataConverter<AdminLogDocument> = {
  toFirestore(log: AdminLogDocument): DocumentData {
    return {
      ...log,
      timestamp: log.timestamp || new Date().toISOString()
    };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options?: SnapshotOptions
  ): AdminLogDocument {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      adminUid: data.adminUid || '',
      adminName: data.adminName || 'Admin',
      adminUsername: data.adminUsername || 'admin',
      action: data.action || 'publish_material',
      targetId: data.targetId || undefined,
      targetTitle: data.targetTitle || undefined,
      details: data.details || undefined,
      timestamp: data.timestamp || new Date().toISOString(),
    };
  }
};
