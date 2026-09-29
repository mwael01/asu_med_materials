#!/usr/bin/env node
/**
 * Migration Script: Link Materials to User Profiles via Usernames
 *
 * This script links materials to user profiles by:
 * 1. Matching materials' addedBy/author names to contributor matchNames
 * 2. Setting added_by_username and creator_username fields
 * 3. Updating addedBy/author names to the profile displayName
 *
 * Uses exact matching only (no substring matching).
 * Dry-run by default. Use --apply to write changes to Firestore.
 * Use --force to re-process materials that already have username fields set.
 * Use --verbose to see detailed matching diagnostics.
 *
 * Usage:
 *   node scripts/migrate-usernames.mjs           # dry run
 *   node scripts/migrate-usernames.mjs --apply   # apply changes
 *   node scripts/migrate-usernames.mjs --apply --force  # re-process all
 *   node scripts/migrate-usernames.mjs --verbose        # detailed diagnostics
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
const FORCE = process.argv.includes('--force');
const VERBOSE = process.argv.includes('--verbose');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function normalizeName(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesOf(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isValidMatchName(name) {
  const normalized = normalizeName(name);
  return normalized.length >= 2;
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
  console.log(`  Materials: ${materials.length}`);
  console.log(`  Force mode: ${FORCE}`);
  console.log(`  Verbose mode: ${VERBOSE}\n`);

  // Build matchNames → user lookup using EXACT matching only
  const matchNameToUser = new Map();
  for (const contributor of contributors) {
    const matchNames = (contributor.matchNames || []).filter(isValidMatchName);

    if (VERBOSE) {
      console.log(`  Contributor: ${contributor.name} (${contributor.kind})`);
      console.log(`    matchNames: ${JSON.stringify(matchNames)}`);
    }

    for (const mn of matchNames) {
      const normalized = normalizeName(mn);

      const user = users.find((u) =>
        normalizeName(u.displayName) === normalized ||
        normalizeName(u.username) === normalized
      );

      if (user) {
        matchNameToUser.set(normalized, {
          user,
          contributorId: contributor.id,
          matchName: mn,
          kind: contributor.kind,
        });
        if (VERBOSE) {
          console.log(`    ✓ "${mn}" → @${user.username} (${user.displayName})`);
        }
      } else if (VERBOSE) {
        console.log(`    ✗ "${mn}" → no user match`);
      }
    }
  }

  console.log(`\n  MatchName → User links: ${matchNameToUser.size}\n`);

  if (VERBOSE && matchNameToUser.size > 0) {
    console.log('  MatchName → User map:');
    for (const [key, value] of matchNameToUser) {
      console.log(`    "${key}" → @${value.user.username} (${value.user.displayName}) [${value.kind}]`);
    }
    console.log('');
  }

  // Find materials to migrate
  const toMigrate = [];
  const unmatched = new Set();
  let skippedAlreadyMigrated = 0;
  let skippedNoNames = 0;

  for (const material of materials) {
    const updates = {};
    let matched = false;

    // Match addedBy → added_by_username
    const shouldProcessAddedBy = FORCE || !material.added_by_username;
    if (shouldProcessAddedBy && material.addedBy) {
      const addedByNames = namesOf(material.addedBy);
      for (const name of addedByNames) {
        const normalized = normalizeName(name);
        if (matchNameToUser.has(normalized)) {
          const { user, matchName } = matchNameToUser.get(normalized);
          updates.added_by_username = user.username;
          updates.addedBy = user.displayName;
          matched = true;
          if (VERBOSE) {
            console.log(`  ✓ addedBy "${name}" → @${user.username}`);
          }
          break;
        }
      }
    }

    // Match author → creator_username
    const shouldProcessAuthor = FORCE || !material.creator_username;
    if (shouldProcessAuthor && material.author) {
      const authorNames = namesOf(material.author);
      for (const name of authorNames) {
        const normalized = normalizeName(name);
        if (matchNameToUser.has(normalized)) {
          const { user, matchName } = matchNameToUser.get(normalized);
          updates.creator_username = user.username;
          updates.author = user.displayName;
          matched = true;
          if (VERBOSE) {
            console.log(`  ✓ author "${name}" → @${user.username}`);
          }
          break;
        }
      }
    }

    if (matched) {
      toMigrate.push({
        materialId: material.id,
        materialName: material.title || material.id,
        updates,
      });
    } else {
      if (material.added_by_username || material.creator_username) {
        skippedAlreadyMigrated++;
      } else if (!material.addedBy && !material.author) {
        skippedNoNames++;
      } else {
        const addedByNames = namesOf(material.addedBy);
        const authorNames = namesOf(material.author);
        for (const name of [...addedByNames, ...authorNames]) {
          unmatched.add(name.trim());
        }
      }
    }
  }

  console.log(`  Skipped (already migrated): ${skippedAlreadyMigrated}`);
  console.log(`  Skipped (no names): ${skippedNoNames}`);

  console.log(`  Materials to migrate: ${toMigrate.length}`);
  console.log(`  Unmatched names: ${unmatched.size}\n`);

  if (toMigrate.length === 0) {
    console.log('✅ No materials need migration.');
    return;
  }

  console.log('─'.repeat(60));
  console.log('Materials to migrate:');
  console.log('─'.repeat(60));
  for (const m of toMigrate.slice(0, 50)) {
    console.log(`  ${m.materialName}`);
    console.log(`    Updates: ${JSON.stringify(m.updates)}`);
  }
  if (toMigrate.length > 50) {
    console.log(`  ... and ${toMigrate.length - 50} more`);
  }

  if (unmatched.size > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('Unmatched names (no user account found):');
    console.log('─'.repeat(60));
    for (const name of [...unmatched].slice(0, 30)) {
      console.log(`  "${name}"`);
    }
    if (unmatched.size > 30) {
      console.log(`  ... and ${unmatched.size - 30} more`);
    }
  }

  if (!APPLY) {
    console.log('\n⚠️  DRY RUN — no changes written. Use --apply to execute.');
    return;
  }

  console.log('\n🚀 Applying changes...\n');

  const batchSize = 500;
  let migrated = 0;

  for (let i = 0; i < toMigrate.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = toMigrate.slice(i, i + batchSize);

    for (const m of chunk) {
      const ref = doc(db, 'materials', m.materialId);
      batch.update(ref, m.updates);
    }

    await batch.commit();
    migrated += chunk.length;
    process.stdout.write(`\r  ✓ Migrated: ${migrated}/${toMigrate.length}`);
  }

  console.log(`\n\n✅ Migration complete!`);
  console.log(`  Materials updated: ${migrated}`);
}

migrate().catch((err) => {
  console.error('\n❌ Migration error:', err.message);
  process.exit(1);
});
