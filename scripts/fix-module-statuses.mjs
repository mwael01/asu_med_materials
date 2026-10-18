#!/usr/bin/env node
/**
 * Migration Script: Restore and normalize curriculum module statuses in Cloud Firestore.
 *
 * Configures:
 * 1. `year2-respiratory`: active: true, order: 1 (currently studied active module for Year 2)
 * 2. `year2-blood`: active: false, order: 2, complete fields restored
 * 3. Year 1 modules:
 *    - `year1-introduction`: active: true, order: 1 (currently studied active module for Year 1)
 *    - `year1-ict`: active: false, order: 2
 *    - `year1-general-pharmacology`: active: false, order: 3
 *    - `year1-general-pathology`: active: false, order: 4
 *    - `year1-infection`: active: false, order: 5
 *    - `year1-locomotor`: active: false, order: 6
 * 4. Increments Cloud Firestore `materials_version` to invalidate cache across client and server.
 *
 * Usage:
 *   node scripts/fix-module-statuses.mjs
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

async function setFirestoreDoc(accessToken, projectId, collectionName, docId, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}/${docId}`;
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
    throw new Error(`Failed to write ${collectionName}/${docId} (${res.status}): ${errText}`);
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

const MODULES_TO_UPDATE = [
  {
    id: 'year2-blood',
    data: {
      id: 'year2-blood',
      code: 'MED201',
      title: 'Blood & Lymphatic System',
      titleAr: 'موديول الدم والجهاز الليمفاوي (Blood & Lymph)',
      year: 2,
      semester: 1,
      active: false,
      order: 2,
      icon: 'droplet',
      color: 'red',
      subjects: [
        'Anatomy',
        'Physiology',
        'Histology',
        'Biochemistry',
        'Pharmacology',
        'Pathology',
        'Parasitology',
        'Microbiology',
        'Clinical Lectures'
      ],
      description: 'Anatomy, physiology, histology, biochemistry, pharmacology, pathology, parasitology, microbiology, and clinical aspects of blood and lymphoid organs.',
      descriptionAr: 'تشريح، وظائف، هستولوجي، كيمياء حيوية، فارما، باثولوجي، طفيليات، ميكروبيولوجي، وعيادات أمراض الدم والنزف.'
    }
  },
  {
    id: 'year2-respiratory',
    data: {
      id: 'year2-respiratory',
      code: 'MED202',
      title: 'Respiratory Module',
      titleAr: 'موديول الجهاز التنفسي (Respiratory)',
      year: 2,
      semester: 1,
      active: true,
      order: 1,
      icon: 'lungs',
      color: 'cyan',
      subjects: [
        'Anatomy',
        'Histology',
        'Physiology',
        'Biochemistry',
        'Pathology',
        'Pharmacology',
        'Microbiology',
        'Parasitology'
      ],
      description: 'Respiratory system module covering anatomy, histology, physiology, biochemistry, pathology, pharmacology, microbiology, and parasitology of the upper and lower respiratory tracts.',
      descriptionAr: 'موديول الجهاز التنفسي شاملاً التشريح والأنسجة والفسيولوجيا والكيمياء الحيوية والباثولوجي والفارماكولوجي والميكروبيولوجي والباراسيتولوجي.'
    }
  },
  {
    id: 'year1-introduction',
    data: {
      id: 'year1-introduction',
      code: 'MED101',
      title: 'Introduction Module',
      titleAr: 'موديول المقدمة (Introduction)',
      year: 1,
      semester: 1,
      active: true,
      order: 1,
      icon: 'compass',
      color: 'indigo',
      subjects: [
        'Anatomy',
        'Physiology',
        'Histology',
        'Biochemistry',
        'Immunology',
        'Genetics',
        'Embryology',
        'Presentation Skills'
      ],
      description: 'Foundational medical sciences introduction covering basic anatomy, physiology, histology, biochemistry, immunology, genetics, embryology, and presentation skills.',
      descriptionAr: 'الموديول التمهيدي للعلوم الطبية الأساسية للفرقة الأولى، ويشمل مبادئ التشريح وعلم الأجنة، الفسيولوجيا، الهستولوجي، الكيمياء الحيوية، المناعة، علم الوراثة، ومهارات العرض.'
    }
  },
  {
    id: 'year1-ict',
    data: {
      id: 'year1-ict',
      code: 'MED102',
      title: 'ICT Module',
      titleAr: 'موديول تكنولوجيا المعلومات والاتصالات (ICT)',
      year: 1,
      semester: 1,
      active: false,
      order: 2,
      icon: 'monitor',
      color: 'sky',
      subjects: ['ICT'],
      description: 'Information and Communications Technology module covering Office 365, Generative AI, cloud productivity, and essential digital tools.',
      descriptionAr: 'موديول تكنولوجيا المعلومات والاتصالات وتطبيقات أوفيس 365 والذكاء الاصطناعي التوليدي والمهارات الرقمية الأساسية.'
    }
  },
  {
    id: 'year1-general-pharmacology',
    data: {
      id: 'year1-general-pharmacology',
      code: 'MED103',
      title: 'General Pharmacology',
      titleAr: 'موديول الفارماكولوجي العام (General Pharmacology)',
      year: 1,
      semester: 2,
      active: false,
      order: 3,
      icon: 'pill',
      color: 'emerald',
      subjects: ['Pharmacology'],
      description: 'General pharmacology principles, pharmacokinetics, pharmacodynamics, and introductory therapeutics.',
      descriptionAr: 'مبادئ علم الأدوية العام وحركية وتأثيرات الأدوية.'
    }
  },
  {
    id: 'year1-general-pathology',
    data: {
      id: 'year1-general-pathology',
      code: 'MED104',
      title: 'General Pathology',
      titleAr: 'موديول الباثولوجي العام (General Pathology)',
      year: 1,
      semester: 2,
      active: false,
      order: 4,
      icon: 'microscope',
      color: 'amber',
      subjects: ['Pathology'],
      description: 'Principles of general pathology, cell injury, cellular adaptation, inflammation, and repair.',
      descriptionAr: 'مبادئ علم الأمراض العام، إصابات الخلايا، التكيف الخلوي، والالتهاب.'
    }
  },
  {
    id: 'year1-infection',
    data: {
      id: 'year1-infection',
      code: 'MED105',
      title: 'Infection Module',
      titleAr: 'موديول العدوى (Infection)',
      year: 1,
      semester: 2,
      active: false,
      order: 5,
      icon: 'bacteria',
      color: 'teal',
      subjects: ['Microbiology', 'Parasitology', 'Immunology', 'Pathology', 'Pharmacology'],
      description: 'Microbiology, parasitology, immunology, and infectious diseases.',
      descriptionAr: 'علم الأحياء الدقيقة، الطفيليات الطبية، المناعة، وأمراض العدوى.'
    }
  },
  {
    id: 'year1-locomotor',
    data: {
      id: 'year1-locomotor',
      code: 'MED106',
      title: 'Locomotor Module',
      titleAr: 'موديول الجهاز الحركي (Locomotor)',
      year: 1,
      semester: 2,
      active: false,
      order: 6,
      icon: 'bone',
      color: 'rose',
      subjects: ['Anatomy', 'Histology', 'Physiology', 'Biochemistry', 'Pathology', 'Pharmacology', 'Parasitology', 'Microbiology', 'Clinical'],
      description: 'Integrated musculoskeletal and locomotor system sciences.',
      descriptionAr: 'تشريح ووظائف وأنسجة وأمراض الجهاز الحركي والعضلي الهيكلي.'
    }
  }
];

async function main() {
  const sa = getServiceAccount();
  if (!sa) {
    throw new Error('Service account key file not found');
  }

  const projectId = sa.project_id;
  const accessToken = await getAdminAccessToken(sa);
  console.log(`Connected to Firebase project: ${projectId}`);

  for (const mod of MODULES_TO_UPDATE) {
    console.log(`Updating ${mod.id} (active: ${mod.data.active}, order: ${mod.data.order})...`);
    await setFirestoreDoc(accessToken, projectId, 'modules', mod.id, mod.data);
    console.log(`✓ Module ${mod.id} updated.`);
  }

  console.log('Incrementing materials_version...');
  await incrementMaterialsVersion(accessToken, projectId);

  console.log('\n🎉 Successfully updated all module statuses and incremented cache version.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
