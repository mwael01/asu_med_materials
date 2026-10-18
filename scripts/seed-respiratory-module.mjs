#!/usr/bin/env node
/**
 * Migration Script: Seed Respiratory Module and its Curriculum Lessons into Cloud Firestore.
 *
 * Configures:
 * 1. Module document: `year2-respiratory` (MED202) marked active: true, order: 1, icon: 'lungs', color: 'cyan'.
 * 2. Updates `year2-blood` module with order: 2 to make Respiratory the primary default active module.
 * 3. 52 comprehensive lessons mapped to their 8 respective subjects according to FOM-ASU timetable.
 * 4. Multi-subject shared lessons (e.g. Nose and Paranasal sinuses in Anatomy and Histology).
 * 5. Increments Cloud Firestore `materials_version` to invalidate and refresh client/server caches.
 *
 * Usage:
 *   node scripts/seed-respiratory-module.mjs
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

async function setFirestoreDoc(accessToken, projectId, collectionName, docId, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
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

const RESPIRATORY_MODULE = {
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
};

const RESPIRATORY_LESSONS = [
  // --- ANATOMY (8 lessons) ---
  {
    id: 'year2-resp-anat-nose-paranasal-sinuses',
    title: 'Nose and Paranasal sinuses',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    order: 1,
    active: true
  },
  {
    id: 'year2-resp-anat-larynx-trachea',
    title: 'Larynx & Trachea',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    order: 2,
    active: true
  },
  {
    id: 'year2-resp-anat-thoracic-cage-joints',
    title: 'Thoracic cage & Joints',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    order: 3,
    active: true
  },
  {
    id: 'year2-resp-anat-thoracic-wall',
    title: 'Thoracic wall',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    order: 4,
    active: true
  },
  {
    id: 'year2-resp-anat-diaphragm',
    title: 'Diaphragm',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    order: 5,
    active: true
  },
  {
    id: 'year2-resp-anat-pleura',
    title: 'Pleura',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    order: 6,
    active: true
  },
  {
    id: 'year2-resp-anat-lung-anatomy',
    title: 'Lung Anatomy',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    order: 7,
    active: true
  },
  {
    id: 'year2-resp-anat-respiratory-development',
    title: 'Respiratory system development',
    moduleId: 'year2-respiratory',
    subject: 'Anatomy',
    order: 8,
    active: true
  },

  // --- HISTOLOGY (5 lessons) ---
  {
    id: 'year2-resp-histo-nose-paranasal-sinuses',
    title: 'Nose and Paranasal sinuses',
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    order: 1,
    active: true
  },
  {
    id: 'year2-resp-histo-conductive-portion',
    title: 'Conductive portion (Parts I, II, and III)',
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    order: 2,
    active: true
  },
  {
    id: 'year2-resp-histo-larynx-trachea',
    title: 'Larynx & Trachea',
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    order: 3,
    active: true
  },
  {
    id: 'year2-resp-histo-respiratory-portion',
    title: 'Respiratory portion',
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    order: 4,
    active: true
  },
  {
    id: 'year2-resp-histo-pleura',
    title: 'Pleura',
    moduleId: 'year2-respiratory',
    subject: 'Histology',
    order: 5,
    active: true
  },

  // --- PHYSIOLOGY (12 lessons) ---
  {
    id: 'year2-resp-physio-mechanics-breathing',
    title: 'Function of respiratory system & mechanics of breathing (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 1,
    active: true
  },
  {
    id: 'year2-resp-physio-airway-resistance',
    title: 'Airway resistance',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 2,
    active: true
  },
  {
    id: 'year2-resp-physio-elastic-behavior-surfactant',
    title: 'Elastic behavior of the lung, pulmonary surfactant & work of breathing (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 3,
    active: true
  },
  {
    id: 'year2-resp-physio-lung-volumes-capacities',
    title: 'Lung volume & capacities (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 4,
    active: true
  },
  {
    id: 'year2-resp-physio-ventilation-perfusion',
    title: 'Ventilation/Perfusion ratio',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 5,
    active: true
  },
  {
    id: 'year2-resp-physio-gas-exchange',
    title: 'Gas exchange and diffusion capacity',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 6,
    active: true
  },
  {
    id: 'year2-resp-physio-o2-transport',
    title: 'O_2 transport & O_2-Hb dissociation curve (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 7,
    active: true
  },
  {
    id: 'year2-resp-physio-co2-transport',
    title: 'CO_2 transport & dissociation curve',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 8,
    active: true
  },
  {
    id: 'year2-resp-physio-hypoxia-cyanosis',
    title: 'Hypoxia, Cyanosis & O_2 therapy',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 9,
    active: true
  },
  {
    id: 'year2-resp-physio-neural-control',
    title: 'Neural control of respiration',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 10,
    active: true
  },
  {
    id: 'year2-resp-physio-regulation-respiration',
    title: 'Chemical & Non-chemical regulation of respiration (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 11,
    active: true
  },
  {
    id: 'year2-resp-physio-exercise-altitude',
    title: 'Effect of exercise and high altitude on ventilation',
    moduleId: 'year2-respiratory',
    subject: 'Physiology',
    order: 12,
    active: true
  },

  // --- PATHOLOGY (9 lessons) ---
  {
    id: 'year2-resp-patho-urtd',
    title: 'Introduction & Upper Respiratory Tract Diseases (URTD) Pathology',
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    order: 1,
    active: true
  },
  {
    id: 'year2-resp-patho-pleural-diseases',
    title: 'Pleural diseases',
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    order: 2,
    active: true
  },
  {
    id: 'year2-resp-patho-atelectasis-ards',
    title: 'Atelectasis/collapse & ARDS',
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    order: 3,
    active: true
  },
  {
    id: 'year2-resp-patho-obstructive-lung-diseases',
    title: 'Obstructive lung diseases (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    order: 4,
    active: true
  },
  {
    id: 'year2-resp-patho-restrictive-lung-diseases',
    title: 'Restrictive Lung diseases',
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    order: 5,
    active: true
  },
  {
    id: 'year2-resp-patho-pulmonary-tb',
    title: 'Pulmonary TB (Tuberculosis)',
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    order: 6,
    active: true
  },
  {
    id: 'year2-resp-patho-lung-infections',
    title: 'Lung Infections',
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    order: 7,
    active: true
  },
  {
    id: 'year2-resp-patho-lung-tumors-1',
    title: 'Lung Tumors I',
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    order: 8,
    active: true
  },
  {
    id: 'year2-resp-patho-lung-tumors-2-vascular',
    title: 'Lung Tumors II & Pulmonary vascular diseases',
    moduleId: 'year2-respiratory',
    subject: 'Pathology',
    order: 9,
    active: true
  },

  // --- PHARMACOLOGY (5 lessons) ---
  {
    id: 'year2-resp-pharm-bronchial-asthma',
    title: 'Drug therapy for bronchial asthma (Parts I, II, III, and IV)',
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    order: 1,
    active: true
  },
  {
    id: 'year2-resp-pharm-drugs-of-tb',
    title: 'Drugs of TB',
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    order: 2,
    active: true
  },
  {
    id: 'year2-resp-pharm-treatment-infection-1-2',
    title: 'Treatment of respiratory infection (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    order: 3,
    active: true
  },
  {
    id: 'year2-resp-pharm-treatment-infection-3',
    title: 'Treatment of respiratory infection (Part III)',
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    order: 4,
    active: true
  },
  {
    id: 'year2-resp-pharm-drug-therapy-cough',
    title: 'Drug therapy of cough',
    moduleId: 'year2-respiratory',
    subject: 'Pharmacology',
    order: 5,
    active: true
  },

  // --- MICROBIOLOGY (6 lessons) ---
  {
    id: 'year2-resp-micro-urti',
    title: 'Upper respiratory tract infection (Microbiology overview)',
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    order: 1,
    active: true
  },
  {
    id: 'year2-resp-micro-whooping-cough-bronchitis',
    title: 'Whooping cough, bronchitis, and bronchiolitis',
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    order: 2,
    active: true
  },
  {
    id: 'year2-resp-micro-tb',
    title: 'Tuberculosis (TB) Microbiology',
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    order: 3,
    active: true
  },
  {
    id: 'year2-resp-micro-pneumonia',
    title: 'Pneumonia',
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    order: 4,
    active: true
  },
  {
    id: 'year2-resp-micro-atypical-pneumonia',
    title: 'Atypical Pneumonia (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    order: 5,
    active: true
  },
  {
    id: 'year2-resp-micro-fungal-infections',
    title: 'Fungal infections',
    moduleId: 'year2-respiratory',
    subject: 'Microbiology',
    order: 6,
    active: true
  },

  // --- PARASITOLOGY (2 lessons) ---
  {
    id: 'year2-resp-para-paragonimus-westermani',
    title: 'Paragonimus westermani',
    moduleId: 'year2-respiratory',
    subject: 'Parasitology',
    order: 1,
    active: true
  },
  {
    id: 'year2-resp-para-mites-loefflers',
    title: "House dust mites & Loeffler's Syndrome",
    moduleId: 'year2-respiratory',
    subject: 'Parasitology',
    order: 2,
    active: true
  },

  // --- BIOCHEMISTRY (5 lessons) ---
  {
    id: 'year2-resp-biochem-glucose-oxidation',
    title: 'Glucose oxidation and shuttles (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    order: 1,
    active: true
  },
  {
    id: 'year2-resp-biochem-krebs-cycle-1-2',
    title: 'Krebs cycle (Parts I and II)',
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    order: 2,
    active: true
  },
  {
    id: 'year2-resp-biochem-krebs-molecular-basis',
    title: 'Krebs cycle & Molecular basis of lung diseases',
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    order: 3,
    active: true
  },
  {
    id: 'year2-resp-biochem-biological-oxidation',
    title: 'Biological oxidation (Parts I, II, III, and IV)',
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    order: 4,
    active: true
  },
  {
    id: 'year2-resp-biochem-phospholipid-metabolism',
    title: 'Phospholipid metabolism',
    moduleId: 'year2-respiratory',
    subject: 'Biochemistry',
    order: 5,
    active: true
  }
];

async function seedRespiratoryModule() {
  const sa = getServiceAccount();
  if (!sa) {
    throw new Error('Service account key not found. Ensure medmaterials-firebase-adminsdk-*.json exists.');
  }

  const projectId = sa.project_id || 'medmaterials';
  console.log(`Authenticating with service account ${sa.client_email} for project ${projectId}...`);
  const accessToken = await getAdminAccessToken(sa);

  console.log(`1. Saving ${RESPIRATORY_MODULE.id} module document...`);
  await setFirestoreDoc(accessToken, projectId, 'modules', RESPIRATORY_MODULE.id, RESPIRATORY_MODULE);
  console.log(`✓ Module ${RESPIRATORY_MODULE.id} saved.`);

  console.log('2. Updating year2-blood module order to 2...');
  await setFirestoreDoc(accessToken, projectId, 'modules', 'year2-blood', {
    order: 2,
    active: true
  });
  console.log('✓ Module year2-blood order updated to 2.');

  console.log(`3. Seeding ${RESPIRATORY_LESSONS.length} lessons into 'lessons' collection...`);
  let lessonCount = 0;
  for (const lesson of RESPIRATORY_LESSONS) {
    await setFirestoreDoc(accessToken, projectId, 'lessons', lesson.id, lesson);
    lessonCount++;
    if (lessonCount % 10 === 0 || lessonCount === RESPIRATORY_LESSONS.length) {
      console.log(`  - Seeded ${lessonCount}/${RESPIRATORY_LESSONS.length} lessons`);
    }
  }

  console.log('4. Incrementing Cloud Firestore materials_version...');
  await incrementMaterialsVersion(accessToken, projectId);

  console.log(`\n🎉 Done! Added ${RESPIRATORY_MODULE.title} as default active module with ${RESPIRATORY_LESSONS.length} lessons across 8 subjects.`);
}

seedRespiratoryModule().catch(err => {
  console.error('Fatal error seeding respiratory module:', err);
  process.exit(1);
});
