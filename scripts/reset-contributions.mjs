#!/usr/bin/env node
/**
 * Reset Script: Clear Incorrect Contributor Migration Data
 *
 * This script identifies materials where contributorUid/contributorUsername
 * were incorrectly set by the buggy migration script and clears them.
 *
 * A material is considered incorrectly migrated if:
 * - contributorUid is set
 * - But the addedBy name doesn't match the user's displayName or username
 *
 * Dry-run by default. Use --apply to write changes to Firestore.
 *
 * Usage:
 *   node scripts/reset-contributions.mjs           # dry run
 *   node scripts/reset-contributions.mjs --apply   # apply changes
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local or .env
for (const envFile of ['.env.local', '.env']) {
  const p = resolve(__dirname, `../${envFile}`);
  if (existsSync(p)) {
    const content = readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const firebaseConfig = {
  apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('[Error] Firebase configuration missing in environment.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function normalizeName(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesOf(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function reset() {
  console.log('\n📦 Fetching users and materials...\n');

  const [usersSnap, materialsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'materials')),
  ]);

  const users = [];
  usersSnap.forEach((d) => users.push({ id: d.id, ...d.data() }));

  const materials = [];
  materialsSnap.forEach((d) => materials.push({ id: d.id, ...d.data() }));

  console.log(`  Users: ${users.length}`);
  console.log(`  Materials: ${materials.length}\n`);

  // Build a map of user UIDs to their possible names
  const userNamesByUid = new Map();
  for (const user of users) {
    const names = new Set();
    if (user.displayName) names.add(normalizeName(user.displayName));
    if (user.username) names.add(normalizeName(user.username));
    userNamesByUid.set(user.uid, names);
  }

  // Find incorrectly migrated materials
  const toReset = [];
  const correct = [];

  for (const material of materials) {
    if (!material.contributorUid) continue;

    const addedByNames = namesOf(material.addedBy);
    const userNames = userNamesByUid.get(material.contributorUid);

    if (!userNames) {
      toReset.push({
        materialId: material.id,
        materialName: material.title || material.id,
        reason: 'User not found',
        contributorUid: material.contributorUid,
        contributorUsername: material.contributorUsername,
        addedBy: material.addedBy,
      });
      continue;
    }

    // Check if any addedBy name matches the user
    const isCorrect = addedByNames.some((name) => {
      const normalized = normalizeName(name);
      return userNames.has(normalized);
    });

    if (isCorrect) {
      correct.push(material.id);
    } else {
      toReset.push({
        materialId: material.id,
        materialName: material.title || material.id,
        reason: 'Name mismatch',
        contributorUid: material.contributorUid,
        contributorUsername: material.contributorUsername,
        addedBy: material.addedBy,
      });
    }
  }

  console.log(`  Correctly migrated: ${correct.length}`);
  console.log(`  Incorrectly migrated: ${toReset.length}\n`);

  if (toReset.length === 0) {
    console.log('✅ No incorrectly migrated materials found.');
    return;
  }

  console.log('─'.repeat(60));
  console.log('Materials to reset:');
  console.log('─'.repeat(60));
  for (const m of toReset.slice(0, 50)) {
    console.log(`  ${m.materialName}`);
    console.log(`    Reason: ${m.reason}`);
    console.log(`    contributorUid: ${m.contributorUid}`);
    console.log(`    contributorUsername: ${m.contributorUsername}`);
    console.log(`    addedBy: ${JSON.stringify(m.addedBy)}`);
  }
  if (toReset.length > 50) {
    console.log(`  ... and ${toReset.length - 50} more`);
  }

  if (!APPLY) {
    console.log('\n⚠️  DRY RUN — no changes written. Use --apply to execute.');
    return;
  }

  console.log('\n🚀 Resetting incorrect migration data...\n');

  const batchSize = 500;
  let resetCount = 0;

  for (let i = 0; i < toReset.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = toReset.slice(i, i + batchSize);

    for (const m of chunk) {
      const ref = doc(db, 'materials', m.materialId);
      batch.update(ref, {
        contributorUid: null,
        contributorUsername: null,
      });
    }

    await batch.commit();
    resetCount += chunk.length;
    process.stdout.write(`\r  ✓ Reset: ${resetCount}/${toReset.length}`);
  }

  console.log(`\n\n✅ Reset complete!`);
  console.log(`  Materials reset: ${resetCount}`);
}

reset().catch((err) => {
  console.error('\n❌ Reset error:', err.message);
  process.exit(1);
});
