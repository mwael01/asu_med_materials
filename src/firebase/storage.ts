import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  type FirebaseStorage
} from 'firebase/storage';
import { getFirebaseApp } from './config';

let storageInstance: FirebaseStorage | null = null;

export function getFirebaseStorage(): FirebaseStorage | null {
  if (storageInstance) return storageInstance;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    storageInstance = getStorage(app);
    return storageInstance;
  } catch (err) {
    console.warn('[Storage] Failed to initialize Firebase Storage:', err);
    return null;
  }
}

const MAX_AVATAR_BYTES = 2.5 * 1024 * 1024; // 2.5 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Uploads a profile avatar image to Firebase Storage and returns the public download URL.
 */
export async function uploadAvatarImage(userId: string, file: File): Promise<string> {
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error('Firebase Storage is not initialized or configured.');
  }

  // 1. Validation
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('نوع الملف غير مدعوم. يرجى رفع صورة بصيغة JPG أو PNG أو WebP.');
  }

  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('حجم الصورة كبير جداً. الحد الأقصى المسموح به هو 2.5 ميجابايت.');
  }

  // 2. Extension determination
  const ext = file.name.split('.').pop() || 'jpg';
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  const storagePath = `avatars/${userId}_${Date.now()}.${cleanExt}`;
  const fileRef = ref(storage, storagePath);

  // 3. Upload bytes with metadata
  const metadata = {
    contentType: file.type,
    customMetadata: {
      uploadedBy: userId,
      uploadedAt: new Date().toISOString()
    }
  };

  const snapshot = await uploadBytes(fileRef, file, metadata);
  const downloadUrl = await getDownloadURL(snapshot.ref);
  return downloadUrl;
}

/**
 * Deletes an old avatar image from Firebase Storage.
 */
export async function deleteAvatarByUrl(url: string): Promise<boolean> {
  const storage = getFirebaseStorage();
  if (!storage || !url) return false;

  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
    return true;
  } catch (err) {
    console.warn('[Storage] Could not delete avatar object:', err);
    return false;
  }
}
