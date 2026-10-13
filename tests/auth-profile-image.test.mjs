import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import {
  resolveOrCreateUserProfile,
  getCachedUserProfile,
  setCachedUserProfile,
  setFirestoreOpsForTesting
} from '../src/firebase/auth.ts';

// Setup mock window & localStorage environment for Node.js
const mockStorage = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

beforeEach(() => {
  mockStorage.clear();
  setFirestoreOpsForTesting(); // reset to default
});

test('existing profile with custom avatar is preserved and NEVER overwritten by Google photo', async () => {
  const existingProfile = {
    uid: 'user-123',
    username: 'mohamed_wael',
    displayName: 'Mohamed Wael',
    photoURL: 'https://i.imgur.com/my-custom-photo.jpg',
    academicYear: 5,
    role: 'admin',
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  let upsertCalled = false;
  setFirestoreOpsForTesting({
    getUserProfileByUid: async (uid) => {
      assert.equal(uid, 'user-123');
      return { ...existingProfile };
    },
    upsertUserProfile: async (p) => {
      upsertCalled = true;
      return true;
    }
  });

  // Incoming Google user on a different browser (new session)
  const googleUser = {
    uid: 'user-123',
    displayName: 'Google Display Name',
    photoURL: 'https://lh3.googleusercontent.com/a/google-account-photo=s96-c'
  };

  const resolved = await resolveOrCreateUserProfile(googleUser);

  // 1. Returned profile retains original custom avatar
  assert.equal(resolved.photoURL, 'https://i.imgur.com/my-custom-photo.jpg');
  assert.notEqual(resolved.photoURL, googleUser.photoURL);

  // 2. upsertUserProfile was NOT called to overwrite Firestore with Google photo
  assert.equal(upsertCalled, false);

  // 3. LocalStorage cached profile retains original custom avatar
  const cached = getCachedUserProfile();
  assert.ok(cached, 'Profile must be cached in localStorage');
  assert.equal(cached.photoURL, 'https://i.imgur.com/my-custom-photo.jpg');
});

test('existing profile without avatar falls back to Google photo as initial avatar', async () => {
  const existingProfileNoAvatar = {
    uid: 'user-456',
    username: 'student_456',
    displayName: 'Student Without Avatar',
    photoURL: undefined,
    academicYear: 2,
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  let savedProfile = null;
  setFirestoreOpsForTesting({
    getUserProfileByUid: async (uid) => {
      assert.equal(uid, 'user-456');
      return { ...existingProfileNoAvatar };
    },
    upsertUserProfile: async (p) => {
      savedProfile = p;
      return true;
    }
  });

  const googleUser = {
    uid: 'user-456',
    displayName: 'Google User',
    photoURL: 'https://lh3.googleusercontent.com/a/initial-avatar.jpg'
  };

  const resolved = await resolveOrCreateUserProfile(googleUser);

  // Should populate Google avatar since profile had no avatar
  assert.equal(resolved.photoURL, 'https://lh3.googleusercontent.com/a/initial-avatar.jpg');
  assert.ok(savedProfile);
  assert.equal(savedProfile.photoURL, 'https://lh3.googleusercontent.com/a/initial-avatar.jpg');

  // Should cache the updated profile
  const cached = getCachedUserProfile();
  assert.equal(cached.photoURL, 'https://lh3.googleusercontent.com/a/initial-avatar.jpg');
});

test('new user without existing profile creates initial profile with Google photo', async () => {
  let createdProfile = null;
  setFirestoreOpsForTesting({
    getUserProfileByUid: async () => null, // No profile in Firestore yet
    checkUsernameAvailable: async () => true,
    upsertUserProfile: async (p) => {
      createdProfile = p;
      return true;
    }
  });

  const newGoogleUser = {
    uid: 'user-789',
    displayName: 'New Student',
    email: 'newstudent@med.asu.edu.eg',
    photoURL: 'https://lh3.googleusercontent.com/a/new-user-photo.jpg'
  };

  const resolved = await resolveOrCreateUserProfile(newGoogleUser);

  assert.equal(resolved.uid, 'user-789');
  assert.equal(resolved.displayName, 'New Student');
  assert.equal(resolved.photoURL, 'https://lh3.googleusercontent.com/a/new-user-photo.jpg');
  assert.ok(createdProfile);
  assert.equal(createdProfile.photoURL, 'https://lh3.googleusercontent.com/a/new-user-photo.jpg');

  const cached = getCachedUserProfile();
  assert.equal(cached.photoURL, 'https://lh3.googleusercontent.com/a/new-user-photo.jpg');
});
