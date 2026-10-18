#!/usr/bin/env node
/**
 * Migration Script: Assign Icons and Distinctive Colors to Curriculum Modules in Cloud Firestore.
 *
 * Uses the Service Account key to authenticate with the Firestore REST API, updates the
 * 12 curriculum modules with their icon and color, and increments the materials_version.
 *
 * Usage:
 *   node scripts/update-module-icons.mjs
 */

import { createSign } from 'crypto';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getServiceAccount() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  }
  const rootDir = resolve(__dirname, '..');
  const files = readdirSync(rootDir);
  const saFile = files.find(f => f.startsWith('medmaterials-firebase-adminsdk-') && f.endsWith('.json'));
  if (saFile) {
    return JSON.parse(readFileSync(resolve(rootDir, saFile), 'utf8'));
  }
  return null;
}

async function getAdminAccessToken(sa) {
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

function toFirestoreValue(val) {
  if (val === null) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function patchFirestoreFields(accessToken, projectId, collectionName, docId, fieldsToUpdate) {
  const fields = {};
  const queryParams = new URLSearchParams();
  for (const [k, v] of Object.entries(fieldsToUpdate)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
      queryParams.append('updateMask.fieldPaths', k);
    }
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${docId}?${queryParams.toString()}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to update ${collectionName}/${docId} (${res.status}): ${errText}`);
  }
  return res.json();
}

const MODULE_DEFINITIONS = [
  { id: 'year1-introduction', icon: 'compass', color: 'indigo' },
  { id: 'year1-ict', icon: 'monitor', color: 'sky' },
  { id: 'year1-general-pharmacology', icon: 'pill', color: 'emerald' },
  { id: 'year1-general-pathology', icon: 'microscope', color: 'amber' },
  { id: 'year1-infection', icon: 'bacteria', color: 'teal' },
  { id: 'year1-locomotor', icon: 'bone', color: 'rose' },
  { id: 'year2-blood', icon: 'droplet', color: 'red' },
  { id: 'year1-reference-books', icon: 'book', color: 'purple' },
  { id: 'year2-reference-books', icon: 'book', color: 'purple' },
  { id: 'year3-reference-books', icon: 'book', color: 'purple' },
  { id: 'year4-reference-books', icon: 'book', color: 'purple' },
  { id: 'year5-reference-books', icon: 'book', color: 'purple' },
];

async function updateModuleIcons() {
  const sa = getServiceAccount();
  if (!sa) {
    throw new Error('Service account key not found. Ensure medmaterials-firebase-adminsdk-*.json exists.');
  }

  const projectId = sa.project_id || 'medmaterials';
  console.log(`Authenticating with service account ${sa.client_email} for project ${projectId}...`);
  const accessToken = await getAdminAccessToken(sa);

  console.log(`Updating ${MODULE_DEFINITIONS.length} modules with icons and colors...`);
  let updatedCount = 0;

  for (const item of MODULE_DEFINITIONS) {
    await patchFirestoreFields(accessToken, projectId, 'modules', item.id, {
      icon: item.icon,
      color: item.color,
      updatedAt: new Date().toISOString()
    });
    console.log(`✔ Updated module [${item.id}]: icon="${item.icon}", color="${item.color}"`);
    updatedCount++;
  }

  // Increment materials_version
  try {
    const now = new Date().toISOString();
    // Read current version
    const versionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/materials_version/current`;
    const vRes = await fetch(versionUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    let currentV = 1;
    if (vRes.ok) {
      const vData = await vRes.json();
      currentV = Number(vData.fields?.version?.integerValue || 1);
    }
    const newVersion = currentV + 1;
    await patchFirestoreFields(accessToken, projectId, 'materials_version', 'current', {
      version: newVersion,
      updatedAt: now
    });
    console.log(`✔ Incremented materials_version in Firestore to ${newVersion}.`);
  } catch (err) {
    console.warn('⚠️ Could not increment materials_version:', err.message);
  }

  console.log(`\n🎉 Successfully updated ${updatedCount}/${MODULE_DEFINITIONS.length} modules in Cloud Firestore.`);
}

updateModuleIcons()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error updating module icons:', err);
    process.exit(1);
  });
