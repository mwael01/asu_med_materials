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
import { getFirestore, collection, getCountFromServer } from 'firebase/firestore';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'node:child_process';

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

const useAdmin = process.argv.includes('--admin') ||
  (!firebaseConfig.apiKey && existsSync(resolve(__dirname, '../firebaseadmin.json')));
if (!useAdmin && (!firebaseConfig.apiKey || !firebaseConfig.projectId)) {
  console.error('[Error] Firebase configuration missing in environment.');
  process.exit(1);
}

const db = useAdmin ? null : getFirestore(initializeApp(firebaseConfig));

console.log('📡 Connecting to Cloud Firestore...');

try {
  const schemaPath = resolve(__dirname, '../firebase/schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const selected = process.argv.find(arg => arg.startsWith('--collections='))?.slice('--collections='.length).split(',');
  const names = selected || Object.keys(schema.collections);
  if (names.some(name => !schema.collections[name])) throw new Error('Unknown collection in --collections');

  // Aggregations return counts without downloading materials, profiles or users.
  let results;
  if (useAdmin) {
    // Reuse the existing importer environment and Admin credential loader.
    // Only aggregate counts are returned to Node; no credentials or documents.
    const script = `import json, sys
sys.path.insert(0, 'scripts/telegram-materials')
from telegram_materials.store import get_db
db = get_db()
results = []
for name in sys.argv[1:]:
    try:
        count = db.collection(name).count().get(retry=None, timeout=30)[0][0].value
        results.append({'name': name, 'count': int(count)})
    except Exception as exc:
        results.append({'name': name, 'error': type(exc).__name__})
print(json.dumps(results))
`;
    const processResult = spawnSync(resolve(__dirname, 'telegram-materials/.venv/bin/python'), ['-c', script, ...names],
      { cwd: resolve(__dirname, '..'), encoding: 'utf8', timeout: 150_000 });
    if (processResult.status !== 0) throw new Error('Admin count process failed; check importer environment and credentials');
    results = JSON.parse(processResult.stdout).map(value => value.error
      ? { status: 'rejected', reason: { code: value.error } }
      : { status: 'fulfilled', value });
  } else {
    results = await Promise.allSettled(names.map(async name => ({
      name, count: (await getCountFromServer(collection(db, name))).data().count
    })));
  }
  let updated = 0;
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === 'fulfilled') {
      const { name, count } = result.value;
      schema.collections[name].totalDocuments = count;
      console.log(`   - ${name}: ${count} documents`);
      updated++;
    } else {
      console.warn(`   - ${names[index]}: count unavailable; retaining previous metadata (${result.reason?.code || 'error'})`);
    }
  }
  if (!updated) throw new Error('No collection counts were available; schema was not changed');
  schema.lastSyncedAt = new Date().toISOString();
  writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + '\n', 'utf8');
  console.log(`Updated firebase/schema.json using ${updated} count aggregations.`);
  process.exit(0);
} catch (err) {
  console.error('Schema synchronization failed:', err.message);
  process.exit(1);
}
