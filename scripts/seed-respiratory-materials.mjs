#!/usr/bin/env node
/**
 * Migration Script: Seed Respiratory Module Direct Materials & Subject Revisions into Cloud Firestore.
 *
 * Configures:
 * 1. 8 Subject Revision Lessons (Anatomy ... Parasitology) marked isRevision: true, order: 99.
 * 2. 72 Curated MaterialItems attached directly to curriculum lessons and revision sections.
 * 3. Grouped playlists for multi-part video series (Dr. Abdullah, Dr. Kareem, Dr. Marwa Hamdy, Dr. El-Shorbagy, etc.).
 * 4. Official FOM-ASU SharePoint college revision stream recordings.
 * 5. Direct 1-click Google Drive viewer links for lecture notes and guides.
 * 6. Executes batched writes via Firestore REST commit API (≤200 operations per request, 0 reads).
 * 7. Atomically increments materials_version/current.
 *
 * Usage:
 *   node scripts/seed-respiratory-materials.mjs
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
  if (val === null || val === undefined) return { nullValue: null };
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

async function batchCommit(accessToken, projectId, writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ writes })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Batch commit failed (${res.status}): ${errText}`);
  }
  return res.json();
}

async function incrementMaterialsVersion(accessToken, projectId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      writes: [
        {
          transform: {
            document: `projects/${projectId}/databases/(default)/documents/materials_version/current`,
            fieldTransforms: [
              {
                fieldPath: 'version',
                increment: { integerValue: '1' }
              },
              {
                fieldPath: 'updatedAt',
                setToServerValue: 'REQUEST_TIME'
              }
            ]
          }
        }
      ]
    })
  });

  if (!res.ok) {
    console.warn(`[Warning] Could not increment materials_version via transform (${res.status}): ${await res.text()}`);
  } else {
    console.log('✓ Successfully incremented materials_version in Firestore');
  }
}

// 23 Dedicated Subject Revision Lessons (Practical, Assessments, Finals)
const REVISION_LESSONS = [
  // Anatomy
  { id: 'year2-resp-anatomy-practical', title: 'Practical Revisions', moduleId: 'year2-respiratory', subject: 'Anatomy', order: 97, active: true, isRevision: true, revisionType: 'practical' },
  { id: 'year2-resp-anatomy-assessments', title: 'Assessments & Formatives', moduleId: 'year2-respiratory', subject: 'Anatomy', order: 98, active: true, isRevision: true, revisionType: 'assessment' },
  { id: 'year2-resp-anatomy-finals', title: 'Final Revisions', moduleId: 'year2-respiratory', subject: 'Anatomy', order: 99, active: true, isRevision: true, revisionType: 'final' },

  // Histology
  { id: 'year2-resp-histo-practical', title: 'Practical Revisions', moduleId: 'year2-respiratory', subject: 'Histology', order: 97, active: true, isRevision: true, revisionType: 'practical' },
  { id: 'year2-resp-histo-assessments', title: 'Assessments & Formatives', moduleId: 'year2-respiratory', subject: 'Histology', order: 98, active: true, isRevision: true, revisionType: 'assessment' },
  { id: 'year2-resp-histo-finals', title: 'Final Revisions', moduleId: 'year2-respiratory', subject: 'Histology', order: 99, active: true, isRevision: true, revisionType: 'final' },

  // Physiology
  { id: 'year2-resp-physio-practical', title: 'Practical Revisions', moduleId: 'year2-respiratory', subject: 'Physiology', order: 97, active: true, isRevision: true, revisionType: 'practical' },
  { id: 'year2-resp-physio-assessments', title: 'Assessments & Formatives', moduleId: 'year2-respiratory', subject: 'Physiology', order: 98, active: true, isRevision: true, revisionType: 'assessment' },
  { id: 'year2-resp-physio-finals', title: 'Final Revisions', moduleId: 'year2-respiratory', subject: 'Physiology', order: 99, active: true, isRevision: true, revisionType: 'final' },

  // Biochemistry
  { id: 'year2-resp-biochem-practical', title: 'Practical Revisions', moduleId: 'year2-respiratory', subject: 'Biochemistry', order: 97, active: true, isRevision: true, revisionType: 'practical' },
  { id: 'year2-resp-biochem-assessments', title: 'Assessments & Formatives', moduleId: 'year2-respiratory', subject: 'Biochemistry', order: 98, active: true, isRevision: true, revisionType: 'assessment' },
  { id: 'year2-resp-biochem-finals', title: 'Final Revisions', moduleId: 'year2-respiratory', subject: 'Biochemistry', order: 99, active: true, isRevision: true, revisionType: 'final' },

  // Pathology
  { id: 'year2-resp-patho-practical', title: 'Practical Revisions', moduleId: 'year2-respiratory', subject: 'Pathology', order: 97, active: true, isRevision: true, revisionType: 'practical' },
  { id: 'year2-resp-patho-assessments', title: 'Assessments & Formatives', moduleId: 'year2-respiratory', subject: 'Pathology', order: 98, active: true, isRevision: true, revisionType: 'assessment' },
  { id: 'year2-resp-patho-finals', title: 'Final Revisions', moduleId: 'year2-respiratory', subject: 'Pathology', order: 99, active: true, isRevision: true, revisionType: 'final' },

  // Pharmacology
  { id: 'year2-resp-pharma-practical', title: 'Practical Revisions', moduleId: 'year2-respiratory', subject: 'Pharmacology', order: 97, active: true, isRevision: true, revisionType: 'practical' },
  { id: 'year2-resp-pharma-assessments', title: 'Assessments & Formatives', moduleId: 'year2-respiratory', subject: 'Pharmacology', order: 98, active: true, isRevision: true, revisionType: 'assessment' },
  { id: 'year2-resp-pharma-finals', title: 'Final Revisions', moduleId: 'year2-respiratory', subject: 'Pharmacology', order: 99, active: true, isRevision: true, revisionType: 'final' },

  // Microbiology
  { id: 'year2-resp-micro-practical', title: 'Practical Revisions', moduleId: 'year2-respiratory', subject: 'Microbiology', order: 97, active: true, isRevision: true, revisionType: 'practical' },
  { id: 'year2-resp-micro-assessments', title: 'Assessments & Formatives', moduleId: 'year2-respiratory', subject: 'Microbiology', order: 98, active: true, isRevision: true, revisionType: 'assessment' },
  { id: 'year2-resp-micro-finals', title: 'Final Revisions', moduleId: 'year2-respiratory', subject: 'Microbiology', order: 99, active: true, isRevision: true, revisionType: 'final' },

  // Parasitology (no practical exam at ASU)
  { id: 'year2-resp-para-assessments', title: 'Assessments & Formatives', moduleId: 'year2-respiratory', subject: 'Parasitology', order: 98, active: true, isRevision: true, revisionType: 'assessment' },
  { id: 'year2-resp-para-finals', title: 'Final Revisions', moduleId: 'year2-respiratory', subject: 'Parasitology', order: 99, active: true, isRevision: true, revisionType: 'final' }
];

// Curated Materials List
const MATERIALS = [
  // ==========================================
  // 1. ANATOMY
  // ==========================================
  {
    id: 'resp-anat-nose-lec1-ashraf',
    title: 'Lecture 1: Nose',
    url: 'https://youtu.be/V-w2arjU_no',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anat-nose-paranasal-sinuses',
    author: 'Dr. Ashraf Ramzy',
    tags: ['anatomy', 'nose', 'upper respiratory', 'ashraf ramzy'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-sinuses-lec2-ashraf',
    title: 'Lecture 2: Paranasal Sinuses',
    url: 'https://youtu.be/tGn8FvXKGjk',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anat-nose-paranasal-sinuses',
    author: 'Dr. Ashraf Ramzy',
    tags: ['anatomy', 'paranasal sinuses', 'upper respiratory', 'ashraf ramzy'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-part1-youssef-pdf',
    title: 'Anatomy Respiratory Part 1 (Nose & Sinuses)',
    url: 'https://drive.google.com/file/d/1BuVP4pvx4X-l9h4T9l9CQEv5dM2rBEd6/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anat-nose-paranasal-sinuses',
    author: 'Dr. Youssef Shoukry',
    tags: ['anatomy', 'lecture notes', 'youssef shoukry', 'nose', 'sinuses'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-larynx-trachea-ashraf',
    title: 'Respiratory System - Larynx & Trachea (Parts 1-3)',
    url: 'https://youtu.be/tyg5gI9GI80',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anat-larynx-trachea',
    author: 'Dr. Ashraf Ramzy',
    tags: ['anatomy', 'larynx', 'trachea', 'ashraf ramzy'],
    videos: [
      { id: 'tyg5gI9GI80', title: 'Part 1: Respiratory System - Larynx & Trachea', url: 'https://youtu.be/tyg5gI9GI80', youtubeId: 'tyg5gI9GI80' },
      { id: 'aobRodKheek', title: 'Part 2: Respiratory System - Larynx & Trachea', url: 'https://youtu.be/aobRodKheek', youtubeId: 'aobRodKheek' },
      { id: 'YGDkbTSdhlQ', title: 'Part 3: Respiratory System - Larynx & Trachea', url: 'https://youtu.be/YGDkbTSdhlQ', youtubeId: 'YGDkbTSdhlQ' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-part2-youssef-pdf',
    title: 'Bg Anatomy Rep p2 (Larynx & Trachea)',
    url: 'https://drive.google.com/file/d/1YEvo4BBRTG_-2uhtxyow-_Dh1P_CgodR/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anat-larynx-trachea',
    author: 'Dr. Youssef Shoukry',
    tags: ['anatomy', 'larynx', 'trachea', 'youssef shoukry'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-part3-youssef-pdf',
    title: 'Bg Anatomy Respiratory p3 (Thoracic Wall & Cage)',
    url: 'https://drive.google.com/file/d/1L9J8wivX3z-YOq8w8jZwH5K0HaUFmIXT/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anat-thoracic-cage-joints',
    author: 'Dr. Youssef Shoukry',
    tags: ['anatomy', 'thoracic cage', 'joints', 'youssef shoukry'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-drawings-youssef-pdf',
    title: 'Respiratory Anatomy Drawings',
    url: 'https://drive.google.com/file/d/1bVt9gkqCCysTxTjtBW_egwgvfCQCzP1e/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anat-thoracic-cage-joints',
    author: 'Dr. Youssef Shoukry',
    tags: ['anatomy', 'drawings', 'diagrams', 'youssef shoukry'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-lung-ashraf',
    title: 'Respiratory System - Lung Anatomy',
    url: 'https://youtu.be/HQSY4VBkVTc',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anat-lung-anatomy',
    author: 'Dr. Ashraf Ramzy',
    tags: ['anatomy', 'lung', 'ashraf ramzy'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-sharepoint-revision',
    title: 'Anatomy Respiratory Revision (College Staff Stream)',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/IQDCAKoN5MRjTJ_9hNBeDunzARs1ExebBtLDN7RSzqjoO7E?e=qaQFxf',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anatomy-finals',
    author: 'Dr. Faten Mahmoud',
    tags: ['anatomy', 'college revision', 'sharepoint', 'faten mahmoud'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-practical-abdullah',
    title: 'Anatomy Respiratory Practical (10 Marks) - Dr. Abdullah',
    url: 'https://youtube.com/playlist?list=PLuTP8UDoc4g9mbjXNRM4jcxUeGPdNccnv',
    type: 'playlist',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anatomy-practical',
    author: 'Dr. Abdullah',
    tags: ['anatomy', 'practical', 'ribs', 'vertebrae', 'bones', 'xray', 'soft tissue'],
    videos: [
      { id: 'MaWNodReLqA', title: 'Respiratory practical 1 (Ribs)', url: 'https://youtu.be/MaWNodReLqA', youtubeId: 'MaWNodReLqA' },
      { id: 'QVjwWc5qRHM', title: 'Respiratory practical 1 (Ribs) (rotated)', url: 'https://youtu.be/QVjwWc5qRHM', youtubeId: 'QVjwWc5qRHM' },
      { id: 'mUhcBy9B-80', title: 'Respiratory practical (vertebrae 1)', url: 'https://youtu.be/mUhcBy9B-80', youtubeId: 'mUhcBy9B-80' },
      { id: 'kll8a_IKRc0', title: 'Respiratory practical (vertebrae 1) (rotated)', url: 'https://youtu.be/kll8a_IKRc0', youtubeId: 'kll8a_IKRc0' },
      { id: 'TjXMgSFh3rg', title: 'Respiratory practical (vertebrae 2)', url: 'https://youtu.be/TjXMgSFh3rg', youtubeId: 'TjXMgSFh3rg' },
      { id: 'jbqpiWzYHNE', title: 'Respiratory practical (vertebrae 2) (rotated)', url: 'https://youtu.be/jbqpiWzYHNE', youtubeId: 'jbqpiWzYHNE' },
      { id: 'cIle5FSSOZU', title: 'Respiratory practical (bone photos)', url: 'https://youtu.be/cIle5FSSOZU', youtubeId: 'cIle5FSSOZU' },
      { id: '_qusUL-dcp8', title: 'Respiratory practical (X ray)', url: 'https://youtu.be/_qusUL-dcp8', youtubeId: '_qusUL-dcp8' },
      { id: 'G6H7zMuCCl4', title: 'Respiratory practical (pharynx, larynx, trachea)', url: 'https://youtu.be/G6H7zMuCCl4', youtubeId: 'G6H7zMuCCl4' },
      { id: 'okUPggzrPa4', title: 'Respiratory practical (I.C spaces, Lung 1)', url: 'https://youtu.be/okUPggzrPa4', youtubeId: 'okUPggzrPa4' },
      { id: 'k3eu2oQnSKs', title: 'Respiratory practical (lung 2, mediastinum, diaphragm)', url: 'https://youtu.be/k3eu2oQnSKs', youtubeId: 'k3eu2oQnSKs' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-practical-kareem',
    title: 'Anatomy Respiratory Practical Sessions - Dr. Kareem',
    url: 'https://www.youtube.com/playlist?list=PL4qpJuM3HP2yHo_PeDPiKbkT0H5Aps1hB',
    type: 'playlist',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anatomy-practical',
    author: 'Dr. Kareem',
    tags: ['anatomy', 'practical', 'bones', 'soft tissue', 'lungs', 'diaphragm'],
    videos: [
      { id: 'LMprHkEwo4w', title: 'Practical Anatomy - Dr Hazem - Bones', url: 'https://youtu.be/LMprHkEwo4w', youtubeId: 'LMprHkEwo4w' },
      { id: 'TCycnSacuKo', title: 'Practical Anatomy - Dr Hazem - Soft Tissue', url: 'https://youtu.be/TCycnSacuKo', youtubeId: 'TCycnSacuKo' },
      { id: '8Zegn9R8pEg', title: 'Practical Anatomy - Dr Wafaa - Bones', url: 'https://youtu.be/8Zegn9R8pEg', youtubeId: '8Zegn9R8pEg' },
      { id: '2w9cBzDpmdk', title: 'Practical Anatomy - Dr Wafaa - Nose & Larynx', url: 'https://youtu.be/2w9cBzDpmdk', youtubeId: '2w9cBzDpmdk' },
      { id: 'sG_-q8EA-rk', title: 'Practical Anatomy - Dr Wafaa - Lungs', url: 'https://youtu.be/sG_-q8EA-rk', youtubeId: 'sG_-q8EA-rk' },
      { id: 'HDmNJKgv9mo', title: 'Practical Anatomy - Dr Wafaa - Diaphragm', url: 'https://youtu.be/HDmNJKgv9mo', youtubeId: 'HDmNJKgv9mo' },
      { id: 'atmC7RfCchA', title: 'Practical Anatomy - Dr Ali', url: 'https://youtu.be/atmC7RfCchA', youtubeId: 'atmC7RfCchA' },
      { id: 'zjQCpGMHYf4', title: 'Practical Anatomy - Mariam Mamdouh', url: 'https://youtu.be/zjQCpGMHYf4', youtubeId: 'zjQCpGMHYf4' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-anat-dr-adel-notes-pdf',
    title: 'Dr M Adel Anatomy Notes',
    url: 'https://drive.google.com/file/d/1I4AwWHqWQShhDZvnxfTBKcp4b3mXQIXc/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anatomy-finals',
    author: 'Dr. M Adel',
    tags: ['anatomy', 'revision', 'dr adel'],
    createdAt: new Date().toISOString()
  },

  // ==========================================
  // 2. HISTOLOGY
  // ==========================================
  {
    id: 'resp-histo-upper-tract-samir',
    title: 'Histology of the Upper Respiratory Tract',
    url: 'https://youtu.be/EQjuJ0pAb_Y',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    lessonId: 'year2-resp-histo-nose-paranasal-sinuses',
    author: 'Dr. Ahmed Samir',
    tags: ['histology', 'upper tract', 'ahmed samir', 'nose', 'larynx'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-histo-zahra-notes-pdf',
    title: 'Bg Histo Dr. Zahra Respiratory Notes',
    url: 'https://drive.google.com/file/d/1ToVUuJEaMUv1PDHUdHcl6s-Ey4eUkfKY/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    lessonId: 'year2-resp-histo-nose-paranasal-sinuses',
    author: 'Dr. Zahra',
    tags: ['histology', 'notes', 'zahra'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-histo-lower-tract-samir',
    title: 'Histology of the Lower Respiratory Tract',
    url: 'https://youtu.be/nsDvFp0TJ70',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    lessonId: 'year2-resp-histo-conductive-portion',
    author: 'Dr. Ahmed Samir',
    tags: ['histology', 'lower tract', 'ahmed samir', 'bronchi', 'alveoli'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-histo-sharepoint-revision',
    title: 'Histology Respiratory Revision (College Staff Stream)',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/IQAfnBtGjwFrQIYt7jXgiWYvAaCyobxHwr2idJlOEl7bR8k?e=2pzX90',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    lessonId: 'year2-resp-histo-finals',
    author: 'Dr. Faten Mahmoud',
    tags: ['histology', 'college revision', 'sharepoint', 'faten mahmoud'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-histo-practical-video',
    title: 'Histology Respiratory Practical (3 Marks)',
    url: 'https://youtu.be/7ZVpI20aBEQ',
    type: 'youtube',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    lessonId: 'year2-resp-histo-practical',
    tags: ['histology', 'practical', 'microscope', 'slides'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-histo-practical-guide-pdf',
    title: 'Histology Respiratory Practical Guide',
    url: 'https://drive.google.com/file/d/12A12Polakpsylvzk0NXfpRnVFLr9ZWHP/view',
    type: 'drive',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    lessonId: 'year2-resp-histo-practical',
    tags: ['histology', 'practical guide', 'pdf'],
    createdAt: new Date().toISOString()
  },

  // ==========================================
  // 3. PHYSIOLOGY
  // ==========================================
  {
    id: 'resp-physio-mechanics-nahhas',
    title: 'Respiratory Physiology 1 & 2 (Mechanics of Breathing)',
    url: 'https://youtu.be/4lh91Pee4Kk',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-mechanics-breathing',
    author: 'Dr. Mohamed El-Nahhas',
    tags: ['physiology', 'mechanics', 'ventilation', 'el-nahhas'],
    videos: [
      { id: '4lh91Pee4Kk', title: 'Respiratory Physiology 1', url: 'https://youtu.be/4lh91Pee4Kk', youtubeId: '4lh91Pee4Kk' },
      { id: '9SECc8oxNX8', title: 'Respiratory Physiology 2', url: 'https://youtu.be/9SECc8oxNX8', youtubeId: '9SECc8oxNX8' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-abdelhamid-notes-pdf',
    title: 'Bg Physio Respiratory Notes',
    url: 'https://drive.google.com/file/d/1nra5x_bLGipebrTkDfOq2lN9e13y3fnM/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-mechanics-breathing',
    author: 'Dr. Abdelhamid',
    tags: ['physiology', 'notes', 'abdelhamid'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-resistance-nahhas',
    title: 'Airway Resistance & Dead Space',
    url: 'https://youtu.be/tc24NOPYc8Q',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-airway-resistance',
    author: 'Dr. Mohamed El-Nahhas',
    tags: ['physiology', 'airway resistance', 'dead space', 'el-nahhas'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-elastic-nahhas',
    title: 'Respiratory Physiology 3 (Elastic Behavior & Compliance)',
    url: 'https://youtu.be/e0_1gM4wfGw',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-elastic-behavior-surfactant',
    author: 'Dr. Mohamed El-Nahhas',
    tags: ['physiology', 'compliance', 'surfactant', 'el-nahhas'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-volume-loops-nahhas',
    title: 'Respiratory Flow - Volume Loops',
    url: 'https://youtu.be/M_ekGmcp-aM',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-lung-volumes-capacities',
    author: 'Dr. Mohamed El-Nahhas',
    tags: ['physiology', 'volume loops', 'spirometry', 'capacities', 'el-nahhas'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-sharepoint-rev1',
    title: 'Respiratory Physiology Revision Part 1 (College Staff Stream)',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/IQD7B09aGMsqQ6wIx2hzcm3VAXLIVlb1fWY9GKOtQxguJ38?e=6FESyG',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-finals',
    author: 'Dr. Faten Mahmoud',
    tags: ['physiology', 'college revision', 'sharepoint', 'faten mahmoud'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-sharepoint-rev2',
    title: 'Respiratory Physiology Revision Part 2 (College Staff Stream)',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/IQAOvgWSV17UTIjY5ApdBcjHAUYIV66EoelfMB8TYHoubSA?e=hu2fyw',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-finals',
    author: 'Dr. Faten Mahmoud',
    tags: ['physiology', 'college revision', 'sharepoint', 'faten mahmoud'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-crash-course-nahhas',
    title: 'Respiration Crash Course (Parts 1 & 2)',
    url: 'https://youtu.be/AQfoRvknO6w',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-finals',
    author: 'Dr. Mohamed El-Nahhas',
    tags: ['physiology', 'crash course', 'revision', 'el-nahhas'],
    videos: [
      { id: 'AQfoRvknO6w', title: 'Respiration Crash Course Part 1', url: 'https://youtu.be/AQfoRvknO6w', youtubeId: 'AQfoRvknO6w' },
      { id: 'uDg39QYibz0', title: 'Respiration Crash Course Part 2', url: 'https://youtu.be/uDg39QYibz0', youtubeId: 'uDg39QYibz0' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-practical-video',
    title: 'Respiratory Physiology Practical (3 Marks)',
    url: 'https://youtu.be/NF1bGBMwyy8',
    type: 'youtube',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-practical',
    tags: ['physiology', 'practical', 'lab'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-clinical-practical',
    title: 'Respiratory Clinical Examination Practical (8 Marks)',
    url: 'https://youtu.be/6xfpfsWASus',
    type: 'playlist',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-practical',
    tags: ['clinical', 'examination', 'practical'],
    videos: [
      { id: '6xfpfsWASus', title: 'Respiratory Clinical Examination Part 1', url: 'https://youtu.be/6xfpfsWASus', youtubeId: '6xfpfsWASus' },
      { id: 'y8XS_JBuC78', title: 'Respiratory Clinical Examination Part 2', url: 'https://youtu.be/y8XS_JBuC78', youtubeId: 'y8XS_JBuC78' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-sgd1-pdf',
    title: 'Physiology SGD 1',
    url: 'https://drive.google.com/file/d/1TM3rdgFrUpEFEmI_y9vkiY0e3A6GWCv8/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-assessments',
    tags: ['physiology', 'sgd', 'small group discussion'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-physio-sgd2-pdf',
    title: 'Physiology SGD 2',
    url: 'https://drive.google.com/file/d/1A3GpH1PN2rY2ny8KJDL50P87XMhh5Mm6/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-assessments',
    tags: ['physiology', 'sgd', 'small group discussion'],
    createdAt: new Date().toISOString()
  },

  // ==========================================
  // 4. BIOCHEMISTRY
  // ==========================================
  {
    id: 'resp-bio-part1-omar-pdf',
    title: 'Bio Respiratory Module Part-1',
    url: 'https://drive.google.com/file/d/1NCEcKp3SwQ1sXqoIazum3R_en9zORLfL/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    lessonId: 'year2-resp-biochem-glucose-oxidation',
    author: 'Dr. Omar',
    tags: ['biochemistry', 'glucose oxidation', 'dr omar'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-bio-dr-omar-pdf',
    title: 'Bio Dr. Omar Full Notes',
    url: 'https://drive.google.com/file/d/1lpt9N3mtbLR1jtr2B7Rn2a1YgHQUx6BF/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    lessonId: 'year2-resp-biochem-glucose-oxidation',
    author: 'Dr. Omar',
    tags: ['biochemistry', 'lecture notes', 'dr omar'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-bio-lab2-pdh-hamdy',
    title: 'Lab 2: CBL for PDH Deficiency',
    url: 'https://youtu.be/CNSeldb-yZI',
    type: 'youtube',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    lessonId: 'year2-resp-biochem-glucose-oxidation',
    author: 'Dr. Marwa Hamdy',
    tags: ['biochemistry', 'cbl', 'pdh', 'practical', 'marwa hamdy'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-bio-part2-omar-pdf',
    title: 'Respiratory Module Part-2 (Krebs & Biological Oxidation)',
    url: 'https://drive.google.com/file/d/1_anNIQzouoCGJQbpt2aKBu3ICS8-Utx2/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    lessonId: 'year2-resp-biochem-krebs-cycle-1-2',
    author: 'Dr. Omar',
    tags: ['biochemistry', 'krebs cycle', 'biological oxidation', 'dr omar'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-bio-krebs-sgd-pdf',
    title: 'EMP Krebs Cycle SGD',
    url: 'https://drive.google.com/file/d/1k-C_1ogXpae4-73fclbFw2m8gLlPBxkX/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    lessonId: 'year2-resp-biochem-krebs-cycle-1-2',
    tags: ['biochemistry', 'krebs cycle', 'sgd'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-bio-practical-hamdy',
    title: 'Biochemistry Respiratory Practical Series (3 Marks) - Dr. Marwa Hamdy',
    url: 'https://youtu.be/v5X20DnYVj8',
    type: 'playlist',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    lessonId: 'year2-resp-biochem-practical',
    author: 'Dr. Marwa Hamdy',
    tags: ['biochemistry', 'practical', 'buffer', 'pdh', 'marwa hamdy'],
    videos: [
      { id: 'v5X20DnYVj8', title: 'Lab 1 (PH & Buffer)', url: 'https://youtu.be/v5X20DnYVj8', youtubeId: 'v5X20DnYVj8' },
      { id: 'CNSeldb-yZI', title: 'Lab 2 (CBL for PDH Deficiency)', url: 'https://youtu.be/CNSeldb-yZI', youtubeId: 'CNSeldb-yZI' },
      { id: 'mAPyiKX9u4w', title: 'Biochemistry Practical Questions', url: 'https://youtu.be/mAPyiKX9u4wl', youtubeId: 'mAPyiKX9u4wl' },
      { id: '88UnJJE28_A', title: 'Biochemistry Full Practical Review', url: 'https://youtu.be/88UnJJE28_A', youtubeId: '88UnJJE28_A' }
    ],
    createdAt: new Date().toISOString()
  },

  // ==========================================
  // 5. PATHOLOGY
  // ==========================================
  {
    id: 'resp-patho-urt-radad',
    title: 'Respiratory Pathology | URT Diseases',
    url: 'https://youtu.be/J24uWNPtXGc',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-urtd',
    author: 'Dr. Eslam El-Radad',
    tags: ['pathology', 'urt diseases', 'el-radad'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-hegazy-notes-pdf',
    title: 'Respiratory Pathology Notes (2026 Edit)',
    url: 'https://drive.google.com/file/d/1KjIT0NH8Ax-KpiAI9RSAJVLbA6DDw4DP/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-urtd',
    author: 'Dr. Hegazy',
    tags: ['pathology', 'lecture notes', 'hegazy'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-obstructive-radad',
    title: 'Respiratory Pathology Obstructive and Restrictive Lung Diseases',
    url: 'https://youtu.be/5QgCnP4LO-Y',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-obstructive-lung-diseases',
    author: 'Dr. Eslam El-Radad',
    tags: ['pathology', 'obstructive', 'restrictive', 'el-radad'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-restrictive-radad',
    title: 'Difference Between Obstructive & Restrictive Lung Diseases',
    url: 'https://youtu.be/MDNOSgz9zwI',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-restrictive-lung-diseases',
    author: 'Dr. Eslam El-Radad',
    tags: ['pathology', 'restrictive', 'obstructive', 'el-radad'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-infections-radad',
    title: 'Respiratory Pathology Infections Till Emphysema',
    url: 'https://youtu.be/SOkMIJpmGp0',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-lung-infections',
    author: 'Dr. Eslam El-Radad',
    tags: ['pathology', 'infections', 'emphysema', 'el-radad'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-tb-infections-radad',
    title: 'Respiratory Pathology Infections & Tuberculosis',
    url: 'https://youtu.be/CEcf8b_xA4E',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-pulmonary-tb',
    author: 'Dr. Eslam El-Radad',
    tags: ['pathology', 'tuberculosis', 'tb', 'infections', 'el-radad'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-tumors-radad',
    title: 'Respiratory Pathology Lung Cancer, URT Infections & Tumors',
    url: 'https://youtu.be/q42lnkiivM8',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-lung-tumors-1',
    author: 'Dr. Eslam El-Radad',
    tags: ['pathology', 'lung cancer', 'tumors', 'el-radad'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-sharepoint-revision',
    title: 'Pathology Respiratory Revision (College Staff Stream)',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/shimaa_elgohary_med_asu_edu_eg/IQDxpgheSRIXTohER1WTJZvUAXXIkxmxGDE7a9FLDOEx4J4?e=7uY7hn',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-finals',
    author: 'Dr. Shimaa Elgohary',
    tags: ['pathology', 'college revision', 'sharepoint', 'shimaa elgohary'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-revision-radad',
    title: 'Lung Diseases Revision (Module 310)',
    url: 'https://youtu.be/ut-X-d5Oyqw',
    type: 'youtube',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-finals',
    author: 'Dr. Eslam El-Radad',
    tags: ['pathology', 'revision', 'el-radad'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-practical-jars-slides',
    title: 'Pathology Respiratory Practical (Jars & Slides - 7 Marks)',
    url: 'https://youtu.be/quqiMPtO0VM',
    type: 'playlist',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-practical',
    tags: ['pathology', 'practical', 'jars', 'slides'],
    videos: [
      { id: 'quqiMPtO0VM', title: 'Practical Pathology Jars', url: 'https://youtu.be/quqiMPtO0VM', youtubeId: 'quqiMPtO0VM' },
      { id: 'DFDVNz7Ve1I', title: 'Practical Pathology Slides', url: 'https://youtu.be/DFDVNz7Ve1I', youtubeId: 'DFDVNz7Ve1I' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-patho-dept-book-pdf',
    title: 'Pathology Department Book',
    url: 'https://drive.google.com/file/d/1irIdgY5eL9AI4gfTFvaCK_IdqERNSEbF/view',
    type: 'drive',
    category: 'references',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-finals',
    tags: ['pathology', 'department book', 'reference'],
    createdAt: new Date().toISOString()
  },

  // ==========================================
  // 6. PHARMACOLOGY
  // ==========================================
  {
    id: 'resp-pharma-shorbagy-lec1-recording',
    title: 'Lecture 1: Bronchial Asthma Audio Recording - Dr. Mohamed El-Shorbagy',
    url: 'https://t.me/DrShorbgy_Pharmacology/61',
    type: 'telegram',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharm-bronchial-asthma',
    author: 'Dr. Mohamed El-Shorbagy',
    tags: ['pharmacology', 'recording', 'audio', 'bronchial asthma', 'el-shorbagy', 'telegram', 'lecture 1'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-drug-list-pdf',
    title: 'Respiratory Pharmacology Drug List',
    url: 'https://drive.google.com/file/d/1DZ_CUuOZiziVF7OnYRAu4Gxbva1zQLTZ/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharm-bronchial-asthma',
    tags: ['pharmacology', 'drug list', 'asthma'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-part1-pdf',
    title: 'Respiratory Module Pharmacology Part 1',
    url: 'https://drive.google.com/file/d/1d-Ez7HTTkIZ5OrwlFYjlaZwULCPFCm-W/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharm-bronchial-asthma',
    tags: ['pharmacology', 'bronchial asthma', 'notes'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-badawy-telegram',
    title: 'Dr. Badawy Respiratory Pharmacology Notes',
    url: 'https://t.me/+AObJQCuhLtM5YzVk',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharm-bronchial-asthma',
    author: 'Dr. Badawy',
    tags: ['pharmacology', 'badawy', 'telegram'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-part2-pdf',
    title: 'Respiratory Pharmacology Part 2 (Infections & Cough)',
    url: 'https://drive.google.com/file/d/1xeNWVQyk04gb51IfXRyIfGzICUphrNie/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharm-treatment-infection-1-2',
    tags: ['pharmacology', 'respiratory infection', 'cough'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-sharepoint-rev1',
    title: 'Pharmacology Respiratory Revision Part 1 (College Staff Stream)',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/IQBHWwei8QprRoCCDt-sLi0DAfyrh5Si-NgvtLbwjz_wKY0?e=etFV0Q',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharma-finals',
    author: 'Dr. Faten Mahmoud',
    tags: ['pharmacology', 'college revision', 'sharepoint', 'faten mahmoud'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-sharepoint-rev2',
    title: 'Pharmacology Respiratory Revision Part 2 (College Staff Stream)',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/amany_hasanin_med_asu_edu_eg/IQD18C_nkGi7T7TEz9R6_BFMAT1rP9UZ616qBhHIwN-iLVk?e=SemhXS',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharma-finals',
    author: 'Dr. Amany Hasanin',
    tags: ['pharmacology', 'college revision', 'sharepoint', 'amany hasanin'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-practical-series',
    title: 'Pharmacology Respiratory Practical (10 Marks)',
    url: 'https://youtu.be/WnZ9wvj5_jo',
    type: 'playlist',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharma-practical',
    author: 'Dr. Mohamed El-Shorbagy',
    tags: ['pharmacology', 'practical', 'shorbagy'],
    videos: [
      { id: 'WnZ9wvj5_jo', title: 'Dr. Mohamed El-Shorbagy Practical Pharmacology', url: 'https://youtu.be/WnZ9wvj5_jo', youtubeId: 'WnZ9wvj5_jo' },
      { id: 'Ht99-Nm85ig', title: 'Pharma Practical Part 1', url: 'https://youtu.be/Ht99-Nm85ig', youtubeId: 'Ht99-Nm85ig' },
      { id: 'Nz-eAb5N20A', title: 'Pharma Practical Part 2', url: 'https://youtu.be/Nz-eAb5N20A', youtubeId: 'Nz-eAb5N20A' }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-moodle-87923',
    title: 'ASU Moodle Pharma Practical Quiz (87923)',
    url: 'https://moodle.med.asu.edu.eg/mod/quiz/view.php?id=87923',
    type: 'website',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharma-practical',
    tags: ['pharmacology', 'moodle', 'quiz'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-moodle-87926',
    title: 'ASU Moodle Pharma Practical Quiz (87926)',
    url: 'https://moodle.med.asu.edu.eg/mod/quiz/view.php?id=87926',
    type: 'website',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharma-practical',
    tags: ['pharmacology', 'moodle', 'quiz'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-pharma-moodle-81649',
    title: 'ASU Moodle Pharma Practical Quiz (81649)',
    url: 'https://moodle.med.asu.edu.eg/mod/quiz/view.php?id=81649',
    type: 'website',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    lessonId: 'year2-resp-pharma-practical',
    tags: ['pharmacology', 'moodle', 'quiz'],
    createdAt: new Date().toISOString()
  },

  // ==========================================
  // 7. MICROBIOLOGY
  // ==========================================
  {
    id: 'resp-micro-ch1-ashraf-pdf',
    title: 'Respiratory Micro Chapter 1 (Upper Respiratory Tract Infections)',
    url: 'https://drive.google.com/file/d/1heZIhoGfSDZJda_USwd5FXSw9_Wpn786/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    lessonId: 'year2-resp-micro-urti',
    author: 'Dr. Mohammed Ashraf',
    tags: ['microbiology', 'urti', 'mohammed ashraf'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-micro-ch2-ashraf-pdf',
    title: 'Respiratory Micro Chapter 2 (Whooping Cough, Bronchitis & Bronchiolitis)',
    url: 'https://drive.google.com/file/d/1h-n8p1UeL8wCCqnhayYRjtc3mWIIqS5U/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    lessonId: 'year2-resp-micro-whooping-cough-bronchitis',
    author: 'Dr. Mohammed Ashraf',
    tags: ['microbiology', 'whooping cough', 'bronchitis', 'mohammed ashraf'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-micro-ch3-ashraf-pdf',
    title: 'Respiratory Micro Chapter 3 (Tuberculosis Microbiology)',
    url: 'https://drive.google.com/file/d/1BPesbY2IYmrspZ5dUicnYlB1NC2diuoK/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    lessonId: 'year2-resp-micro-tb',
    author: 'Dr. Mohammed Ashraf',
    tags: ['microbiology', 'tb', 'tuberculosis', 'mohammed ashraf'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-micro-ch4-ashraf-pdf',
    title: 'Respiratory Micro Chapter 4 (Pneumonia & Atypical Pneumonia)',
    url: 'https://drive.google.com/file/d/1roV9M5riZDW9FIG9PZehL_HKTwCp6X_6/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    lessonId: 'year2-resp-micro-pneumonia',
    author: 'Dr. Mohammed Ashraf',
    tags: ['microbiology', 'pneumonia', 'atypical pneumonia', 'mohammed ashraf'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-micro-ch5-ashraf-pdf',
    title: 'Respiratory Micro Chapter 5 (Fungal Infections)',
    url: 'https://drive.google.com/file/d/11JzbWkO9EOd9O4CRQD6gT4GRVgFtu6pb/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    lessonId: 'year2-resp-micro-fungal-infections',
    author: 'Dr. Mohammed Ashraf',
    tags: ['microbiology', 'fungal infections', 'mycology', 'mohammed ashraf'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-micro-sharepoint-revision',
    title: 'Microbiology Respiratory Revision (College Staff Stream)',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/IQAPfLsKOKWITY-CJiJr3mlMAc0vGIa5ZC_DaS1I7BLy0EM?e=dUMK6D',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    lessonId: 'year2-resp-micro-finals',
    author: 'Dr. Faten Mahmoud',
    tags: ['microbiology', 'college revision', 'sharepoint', 'faten mahmoud'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-micro-practical-playlist',
    title: 'Microbiology Practical Lab & Flashcards (7 Marks)',
    url: 'https://youtube.com/playlist?list=PLN8Jt5eomWaH2EacfT_45tRL_pM_j9vZp',
    type: 'playlist',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    lessonId: 'year2-resp-micro-practical',
    author: 'Dr. Muhammad Ashraf',
    tags: ['microbiology', 'practical', 'lab', 'flashcards', 'muhammad ashraf'],
    videos: [
      { id: 'U4hI270X43A', title: 'Respiratory Microbiology Practical Lab', url: 'https://youtu.be/U4hI270X43A', youtubeId: 'U4hI270X43A' },
      { id: 'k2dG8v9F0rU', title: 'Respiratory Practical Flashcards - ASU', url: 'https://youtu.be/k2dG8v9F0rU', youtubeId: 'k2dG8v9F0rU' }
    ],
    createdAt: new Date().toISOString()
  },

  // ==========================================
  // 8. PARASITOLOGY
  // ==========================================
  {
    id: 'resp-para-ayman-notes-pdf',
    title: 'Para Dr Ayman Respiratory 2025-2026',
    url: 'https://drive.google.com/file/d/167mS-29OZzP4Y2715G6oyWPbcH_Ncek5/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Parasitology',
    lessonId: 'year2-resp-para-paragonimus-westermani',
    author: 'Dr. Ayman',
    tags: ['parasitology', 'paragonimus', 'loeffler', 'dr ayman'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-para-simba-hub',
    title: 'Simba Respiratory Parasitology Hub',
    url: 'https://t.me/c/2258936363/250',
    type: 'telegram',
    category: 'central',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Parasitology',
    lessonId: 'year2-resp-para-paragonimus-westermani',
    tags: ['parasitology', 'telegram', 'simba'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-para-record-telegram',
    title: 'ASU Medical Parasitology Respiratory Record',
    url: 'https://t.me/MG_ASU_MED/1158',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Parasitology',
    lessonId: 'year2-resp-para-mites-loefflers',
    tags: ['parasitology', 'record', 'telegram'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-para-simba-main-hub',
    title: 'Simba All-in-One Respiratory Study Hub',
    url: 'https://t.me/study_with_simba/7179',
    type: 'telegram',
    category: 'central',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Parasitology',
    lessonId: 'year2-resp-para-finals',
    tags: ['parasitology', 'telegram', 'simba', 'central hub'],
    createdAt: new Date().toISOString()
  },

  // ==========================================
  // 9. CENTRAL FORMATIVES & CASE STUDIES
  // ==========================================
  {
    id: 'resp-formatives-essay-pdf',
    title: 'Respiratory Formatives (Essay Questions)',
    url: 'https://drive.google.com/file/d/1YwhLECe9oj5QyjqlTB-WUzUFuDUddllh/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-assessments',
    tags: ['formatives', 'essay questions', 'pathology'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-formatives-integrated-case-pdf',
    title: 'Formative Integrated Respiratory Case 2024',
    url: 'https://drive.google.com/file/d/1kGaZdwy_W5EENkf8vaPutO0wYLTetRo2/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    lessonId: 'year2-resp-physio-assessments',
    tags: ['formatives', 'integrated case', 'physiology'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-all-practical-labs-pdf',
    title: 'All Practical Respiratory Labs Guide',
    url: 'https://drive.google.com/file/d/13f7_Ff_h1nbUrs3yo80rsGFItKloWRlz/view',
    type: 'drive',
    category: 'practical',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    lessonId: 'year2-resp-anatomy-practical',
    tags: ['practical', 'labs guide', 'all subjects'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'resp-essay-compilation-pdf',
    title: 'Respiratory Essay Questions Compilation',
    url: 'https://drive.google.com/file/d/158jCxHHXGaFVJOUlSZaYBTtCylNS5HNH/view',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    lessonId: 'year2-resp-patho-finals',
    tags: ['essay questions', 'compilation'],
    createdAt: new Date().toISOString()
  }
];

async function seedRespiratoryMaterials() {
  const sa = getServiceAccount();
  if (!sa) {
    throw new Error('Service account key not found. Ensure medmaterials-firebase-adminsdk-*.json exists.');
  }

  const projectId = sa.project_id || 'medmaterials';
  console.log(`Authenticating with service account ${sa.client_email} for project ${projectId}...`);
  const accessToken = await getAdminAccessToken(sa);

  console.log(`\n1. Preparing ${REVISION_LESSONS.length} subject revision lessons...`);
  const lessonWrites = REVISION_LESSONS.map(lesson => {
    const fields = {};
    for (const [k, v] of Object.entries(lesson)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return {
      update: {
        name: `projects/${projectId}/databases/(default)/documents/lessons/${lesson.id}`,
        fields
      }
    };
  });

  console.log(`2. Preparing ${MATERIALS.length} material items...`);
  const materialWrites = MATERIALS.map(material => {
    const fields = {};
    for (const [k, v] of Object.entries(material)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return {
      update: {
        name: `projects/${projectId}/databases/(default)/documents/materials/${material.id}`,
        fields
      }
    };
  });

  const allWrites = [...lessonWrites, ...materialWrites];
  console.log(`Total documents to write: ${allWrites.length}`);

  // Batch commit in chunks of ≤ 200 writes
  const CHUNK_SIZE = 200;
  for (let i = 0; i < allWrites.length; i += CHUNK_SIZE) {
    const chunk = allWrites.slice(i, i + CHUNK_SIZE);
    console.log(`Committing batch ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} writes)...`);
    await batchCommit(accessToken, projectId, chunk);
  }
  console.log(`✓ All ${allWrites.length} documents written successfully!`);

  console.log('\n3. Incrementing Cloud Firestore materials_version...');
  await incrementMaterialsVersion(accessToken, projectId);

  console.log(`\n🎉 Hydration Complete!`);
  console.log(`- ${REVISION_LESSONS.length} Subject Revision Lessons created.`);
  console.log(`- ${MATERIALS.length} Direct Lesson Materials created (0 loose reads, 0 Anki, 0 MCQs).`);
}

seedRespiratoryMaterials().catch(err => {
  console.error('Fatal error seeding respiratory materials:', err);
  process.exit(1);
});
