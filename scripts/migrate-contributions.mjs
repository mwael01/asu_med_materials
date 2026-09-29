#!/usr/bin/env node
/**
 * Migration Script: Link Materials to User Profiles
 *
 * Matches materials' `addedBy` static names to user profiles via the
 * `contributors` collection `matchNames` bridge, then sets
 * `contributorUid` and `contributorUsername` on matched materials.
 *
 * Dry-run by default. Use --apply to write changes to Firestore.
 *
 * Usage:
 *   node scripts/migrate-contributions.mjs           # dry run
 *   node scripts/migrate-contributions.mjs --apply   # apply changes
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

async function migrate() {
  console.log('\n📦 Fetching users, contributors, and materials...\n');

  const [usersSnap, contributorsSnap, materialsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'contributors')),
    getDocs(collection(db, 'materials')),
  ]);

  const users = [];
  usersSnap.forEach((d) => users.push({ id: d.id, ...d.data() }));

  const contributors = [];
  contributorsSnap.forEach((d) => contributors.push({ id: d.id, ...d.data() }));

  const materials = [];
  materialsSnap.forEach((d) => materials.push({ id: d.id, ...d.data() }));

  console.log(`  Users: ${users.length}`);
  console.log(`  Contributors: ${contributors.length}`);
  console.log(`  Materials: ${materials.length}\n`);

  // Build matchNames → user lookup
  const matchNameToUser = new Map();
  for (const contributor of contributors) {
    const matchNames = contributor.matchNames || [];
    for (const mn of matchNames) {
      const normalized = normalizeName(mn);
      // Find user by displayName or username matching this matchName
      const user = users.find(
        (u) =>
          normalizeName(u.displayName) === normalized ||
          normalizeName(u.username) === normalized
      );
      if (user) {
        matchNameToUser.set(normalized, { user, contributorId: contributor.id, matchName: mn });
      }
    }
  }

  console.log(`  MatchName → User links: ${matchNameToUser.size}\n`);

  // Find materials to migrate
  const toMigrate = [];
  const unmatched = new Set();

  for (const material of materials) {
    if (material.contributorUid) continue;

    const addedByNames = namesOf(material.addedBy);
    let matched = false;

    for (const name of addedByNames) {
      const normalized = normalizeName(name);
      if (matchNameToUser.has(normalized)) {
        const { user, contributorId, matchName } = matchNameToUser.get(normalized);
        toMigrate.push({
          materialId: material.id,
          materialName: material.title || material.id,
          addedBy: name,
          username: user.username,
          uid: user.uid,
          contributorId,
          matchName,
        });
        matched = true;
        break;
      }
    }

    if (!matched && addedByNames.length > 0) {
      for (const name of addedByNames) {
        unmatched.add(name.trim());
      }
    }
  }

  console.log(`  Materials to migrate: ${toMigrate.length}`);
  console.log(`  Unmatched names: ${unmatched.size}\n`);

  if (toMigrate.length === 0) {
    console.log('✅ No materials need migration.');
    return;
  }

  console.log('─'.repeat(60));
  console.log('Materials to migrate:');
  console.log('─'.repeat(60));
  for (const m of toMigrate) {
    console.log(`  ${m.materialName}`);
    console.log(`    addedBy: "${m.addedBy}" → @${m.username} (${m.uid})`);
  }

  if (unmatched.size > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('Unmatched names (no user account found):');
    console.log('─'.repeat(60));
    for (const name of unmatched) {
      console.log(`  "${name}"`);
    }
  }

  if (!APPLY) {
    console.log('\n⚠️  DRY RUN — no changes written. Use --apply to execute.');
    return;
  }

  console.log('\n🚀 Applying changes...\n');

  // Group by contributor to update matchNames
  const contributorUpdates = new Map();
  for (const m of toMigrate) {
    if (!contributorUpdates.has(m.contributorId)) {
      const contributor = contributors.find((c) => c.id === m.contributorId);
      contributorUpdates.set(m.contributorId, {
        matchNames: [...(contributor?.matchNames || [])],
      });
    }
    const update = contributorUpdates.get(m.contributorId);
    update.matchNames = update.matchNames.filter(
      (n) => normalizeName(n) !== normalizeName(m.matchName)
    );
  }

  // Batch update materials
  const batchSize = 500;
  let migrated = 0;

  for (let i = 0; i < toMigrate.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = toMigrate.slice(i, i + batchSize);

    for (const m of chunk) {
      const ref = doc(db, 'materials', m.materialId);
      batch.update(ref, {
        contributorUid: m.uid,
        contributorUsername: m.username,
      });
    }

    await batch.commit();
    migrated += chunk.length;
    process.stdout.write(`\r  ✓ Migrated: ${migrated}/${toMigrate.length}`);
  }

  // Update contributor documents (remove matched matchNames)
  let contributorsUpdated = 0;
  for (const [contributorId, update] of contributorUpdates) {
    const ref = doc(db, 'contributors', contributorId);
    await updateDoc(ref, { matchNames: update.matchNames });
    contributorsUpdated++;
  }

  console.log(`\n\n✅ Migration complete!`);
  console.log(`  Materials updated: ${migrated}`);
  console.log(`  Contributors updated: ${contributorsUpdated}`);
}

migrate().catch((err) => {
  console.error('\n❌ Migration error:', err.message);
  process.exit(1);
});
