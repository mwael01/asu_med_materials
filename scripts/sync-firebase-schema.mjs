#!/usr/bin/env node
/**
 * Schema Synchronization Script: Cloud Firestore <-> firebase/schema.json
 *
 * Connects to remote Firestore, inspects collection counts, pulls latest live metadata,
 * and updates:
 *   - firebase/schema.json (metadata, counts, lastSyncedAt)
 *
 * Usage:
 *   node scripts/sync-firebase-schema.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { readFileSync, existsSync, writeFileSync } from 'fs';
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

console.log('📡 Connecting to Cloud Firestore...');

try {
  // 1. Fetch materials
  const materialsSnap = await getDocs(collection(db, 'materials'));
  const materials = [];
  materialsSnap.forEach((doc) => materials.push(doc.data()));

  // 2. Fetch modules
  const modulesSnap = await getDocs(collection(db, 'modules'));
  const modules = [];
  modulesSnap.forEach((doc) => modules.push(doc.data()));

  // 3. Fetch contributors
  const contribSnap = await getDocs(collection(db, 'contributors'));
  const authors = [];
  const contributorProfiles = [];
  contribSnap.forEach((doc) => {
    const data = doc.data();
    if (data.kind === 'author') {
      const { kind, ...authorData } = data;
      authors.push(authorData);
    } else {
      const { kind, ...profileData } = data;
      contributorProfiles.push(profileData);
    }
  });
  authors.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  // 4. Fetch users count
  let usersCount = 0;
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    usersCount = usersSnap.size;
  } catch {}

  // 5. Fetch submissions count
  let submissionsCount = 0;
  try {
    const subsSnap = await getDocs(collection(db, 'submissions'));
    submissionsCount = subsSnap.size;
  } catch {}

  // 6. Fetch feedback count
  let feedbackCount = 0;
  try {
    const fbSnap = await getDocs(collection(db, 'feedback'));
    feedbackCount = fbSnap.size;
  } catch {}

  // 7. Fetch admin_logs count
  let adminLogsCount = 0;
  try {
    const logsSnap = await getDocs(collection(db, 'admin_logs'));
    adminLogsCount = logsSnap.size;
  } catch {}

  console.log(`📊 Remote Collections Status:`);
  console.log(`   - materials:    ${materials.length} documents`);
  console.log(`   - modules:      ${modules.length} documents`);
  console.log(`   - contributors: ${contribSnap.size} documents (${authors.length} authors, ${contributorProfiles.length} profiles)`);
  console.log(`   - users:        ${usersCount} documents`);
  console.log(`   - submissions:  ${submissionsCount} documents`);
  console.log(`   - feedback:     ${feedbackCount} documents`);
  console.log(`   - admin_logs:   ${adminLogsCount} documents`);

  // 8. Update firebase/schema.json
  const schemaPath = resolve(__dirname, '../firebase/schema.json');
  if (existsSync(schemaPath)) {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    schema.lastSyncedAt = new Date().toISOString();
    if (schema.collections?.materials) schema.collections.materials.totalDocuments = materials.length;
    if (schema.collections?.modules) schema.collections.modules.totalDocuments = modules.length;
    if (schema.collections?.contributors) schema.collections.contributors.totalDocuments = contribSnap.size;
    if (schema.collections?.users) schema.collections.users.totalDocuments = usersCount;
    if (schema.collections?.submissions) schema.collections.submissions.totalDocuments = submissionsCount;
    if (schema.collections) {
      if (!schema.collections.feedback) {
        schema.collections.feedback = { totalDocuments: feedbackCount };
      } else {
        schema.collections.feedback.totalDocuments = feedbackCount;
      }
      if (!schema.collections.admin_logs) {
        schema.collections.admin_logs = { totalDocuments: adminLogsCount };
      } else {
        schema.collections.admin_logs.totalDocuments = adminLogsCount;
      }
    }

    writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');
    console.log(`✅ Updated firebase/schema.json with latest metadata.`);
  }

  console.log('🎉 Schema synchronization completed successfully!');
  process.exit(0);
} catch (err) {
  console.error('❌ Schema synchronization failed:', err.message);
  process.exit(1);
}
