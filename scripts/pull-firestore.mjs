#!/usr/bin/env node
/**
 * Utility script: Pull all materials from Cloud Firestore and refresh the local schema cache.
 *
 * Usage:
 *   node scripts/pull-firestore.mjs
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

console.log('🔄 Fetching latest materials from Cloud Firestore...');
try {
  const snap = await getDocs(collection(db, 'materials'));
  const materials = [];
  snap.forEach((doc) => {
    materials.push(doc.data());
  });

  if (materials.length === 0) {
    console.warn('⚠️ No materials found in Firestore.');
  } else {
    const targetPath = resolve(__dirname, '../src/firebase/schema/materials-cache.json');
    writeFileSync(targetPath, JSON.stringify(materials, null, 2), 'utf8');
    console.log(`✅ Successfully updated local schema cache with ${materials.length} materials from Firestore.`);
  }
} catch (err) {
  console.error('❌ Failed to pull materials from Firestore:', err.message);
  process.exit(1);
}
