#!/usr/bin/env node
/**
 * Migration Script: Update Contributor Attribution to Mazen Yasin
 *
 * In-place updates all Year 1 study materials in Cloud Firestore:
 * - addedBy: 'Mazen Yasin'
 * - added_by_username: 'mazenyasin'
 *
 * Uses Firestore REST API with updateMask and currentDocument.exists=true
 * to execute zero-read updates and avoid 429 quota exhaustion.
 *
 * Usage:
 *   node scripts/migrate-contributor-mazen.mjs
 */

import { createSign } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Load Service Account Key
const saPath = resolve(__dirname, '../medmaterials-firebase-adminsdk-fbsvc-3d6cbd593c.json');
if (!existsSync(saPath)) {
  console.error(`❌ Service account key not found at: ${saPath}`);
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));

// 2. Obtain Google OAuth2 Access Token for Firestore
async function getAdminAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(header + '.' + claim);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = header + '.' + claim + '.' + signature;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!tokenRes.ok) {
    throw new Error(`OAuth token request failed with HTTP ${tokenRes.status}: ${await tokenRes.text()}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

// 3. Extract Document IDs from seed script & reference books
function getTargetMaterialIds() {
  const seedPath = resolve(__dirname, 'seed-first-year-materials.mjs');
  const seedContent = readFileSync(seedPath, 'utf8');

  const startIdx = seedContent.indexOf('const MATERIALS_TO_ADD = [');
  const endIdx = seedContent.indexOf('\nasync function run()');
  const arrayStr = seedContent.slice(startIdx + 'const MATERIALS_TO_ADD = '.length, endIdx).trim().replace(/;$/, '');
  
  // Safe evaluation of the materials array literal
  const items = eval(arrayStr);
  const ids = new Set(items.map((it) => it.id).filter(Boolean));

  // Add anatomy reference books
  for (let year = 1; year <= 2; year++) {
    for (let idx = 1; idx <= 9; idx++) {
      ids.add(`ref-anatomy-book-${year}-${idx}`);
    }
  }

  return Array.from(ids);
}

// 4. Update individual material document with in-place PATCH
async function patchMaterialDoc(token, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/materials/${docId}?updateMask.fieldPaths=addedBy&updateMask.fieldPaths=added_by_username&currentDocument.exists=true`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        addedBy: { stringValue: 'Mazen Yasin' },
        added_by_username: { stringValue: 'mazenyasin' }
      }
    })
  });

  if (res.ok) {
    return { id: docId, status: 'updated' };
  } else if (res.status === 404) {
    return { id: docId, status: 'not_found' };
  } else {
    const text = await res.text();
    return { id: docId, status: 'error', error: text, code: res.status };
  }
}

// 5. Invalidate runtime cache by incrementing materials_version/current
async function incrementMaterialsVersion(token) {
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents:commit`;
  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      writes: [
        {
          transform: {
            document: `projects/${sa.project_id}/databases/(default)/documents/materials_version/current`,
            fieldTransforms: [
              {
                fieldPath: 'version',
                increment: { integerValue: '1' }
              }
            ]
          }
        }
      ]
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to increment materials version: HTTP ${res.status} ${await res.text()}`);
  }
}

async function main() {
  console.log('🔑 Authenticating with Google Cloud OAuth using Service Account...');
  const token = await getAdminAccessToken();
  console.log('✓ Successfully authenticated!\n');

  const docIds = getTargetMaterialIds();
  console.log(`📋 Found ${docIds.length} candidate material IDs to update in Firestore.`);

  let updatedCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  // Process in batches of 10 concurrent requests
  const CONCURRENCY = 10;
  for (let i = 0; i < docIds.length; i += CONCURRENCY) {
    const chunk = docIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((id) => patchMaterialDoc(token, id)));

    for (const r of results) {
      if (r.status === 'updated') {
        updatedCount++;
      } else if (r.status === 'not_found') {
        notFoundCount++;
      } else {
        errorCount++;
        console.error(`  ❌ Error updating [${r.id}] (${r.code}): ${r.error}`);
      }
    }

    const progress = Math.min(i + CONCURRENCY, docIds.length);
    process.stdout.write(`\r  Progress: ${progress}/${docIds.length} | Updated: ${updatedCount} | Not Found: ${notFoundCount} | Errors: ${errorCount}`);
  }

  console.log('\n');

  // Invalidate cache
  console.log('🔄 Incrementing materials version in Firestore...');
  await incrementMaterialsVersion(token);
  console.log('✓ Materials version incremented successfully!');

  console.log('\n🎉 Migration Complete:');
  console.log(`  - Total processed: ${docIds.length}`);
  console.log(`  - Successfully updated: ${updatedCount}`);
  console.log(`  - Skipped (document does not exist): ${notFoundCount}`);
  console.log(`  - Errors: ${errorCount}`);
}

main().catch((err) => {
  console.error('\n❌ Fatal migration error:', err);
  process.exit(1);
});
