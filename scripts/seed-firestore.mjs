#!/usr/bin/env node
/**
 * Migration & Seeding Script: Cloud Firestore
 *
 * Seeds:
 *   1. Study Materials (materials)
 *   2. Curriculum Modules (modules)
 *   3. Team & Contributor Profiles (contributors)
 *
 * Usage:
 *   node scripts/seed-firestore.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const schemaDir = resolve(__dirname, '../src/firebase/schema');

async function seedCollection(name, items, getId, transform = (x) => x) {
  if (!items || items.length === 0) {
    console.log(`⚠️  No items to seed for '${name}'. Skipping.`);
    return 0;
  }
  console.log(`\n🚀 Seeding ${items.length} items to '${name}' collection...`);
  let uploaded = 0;
  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    const id = getId(raw, i);
    const data = transform(raw, id, i);
    try {
      await setDoc(doc(db, name, id), data, { merge: true });
      uploaded++;
      process.stdout.write(`\r  ✓ Seeded: ${uploaded}/${items.length} (${id})`);
    } catch (err) {
      console.error(`\n❌ Failed to upload ${id} to ${name}:`, err.message);
    }
  }
  console.log(`\n✅ Completed ${name}: ${uploaded}/${items.length} seeded.`);
  return uploaded;
}

try {
  // 1. Seed Study Materials
  const materialsPath = resolve(schemaDir, 'materials-cache.json');
  if (existsSync(materialsPath)) {
    const materials = JSON.parse(readFileSync(materialsPath, 'utf8'));
    await seedCollection('materials', materials, (m) => m.id);
  }

  // 2. Seed Curriculum Modules
  const modulesPath = resolve(schemaDir, 'modules-cache.json');
  if (existsSync(modulesPath)) {
    const modules = JSON.parse(readFileSync(modulesPath, 'utf8'));
    await seedCollection('modules', modules, (m) => m.id);
  }

  // 3. Seed Contributors & Authors
  const contribPath = resolve(schemaDir, 'contributors-cache.json');
  if (existsSync(contribPath)) {
    const contribData = JSON.parse(readFileSync(contribPath, 'utf8'));
    const combinedContribs = [];

    if (Array.isArray(contribData.authors)) {
      for (const author of contribData.authors) {
        combinedContribs.push({ ...author, kind: 'author' });
      }
    }

    if (Array.isArray(contribData.contributorProfiles)) {
      for (const profile of contribData.contributorProfiles) {
        combinedContribs.push({ ...profile, kind: 'contributorProfile' });
      }
    }

    await seedCollection('contributors', combinedContribs, (c) => c.id);
  }

  console.log('\n🎉 All collections seeded successfully to Cloud Firestore!');
  process.exit(0);
} catch (err) {
  console.error('\n❌ Seeding error:', err.message);
  process.exit(1);
}
