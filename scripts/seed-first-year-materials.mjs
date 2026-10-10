#!/usr/bin/env node
/**
 * Seeding Script: Add First Year Modules & Study Materials to Cloud Firestore
 *
 * Uses Service Account credentials to authenticate and write with admin privileges.
 *
 * 1. Modules Configured:
 *    - Semester 1 (Publicly Visible):
 *      * Introduction Module (year1-introduction, semester: 1)
 *      * ICT Module (year1-ict, semester: 1)
 *    - Semester 2 (Marked as semester: 2, hidden in public view):
 *      * General Pharmacology (year1-general-pharmacology, semester: 2)
 *      * General Pathology (year1-general-pathology, semester: 2)
 *      * Infection Module (year1-infection, semester: 2)
 *      * Locomotor Module (year1-locomotor, semester: 2)
 *
 * 2. Study Materials Configured & Deduplicated:
 *    - All Semester 1 & Semester 2 materials provided by the student community.
 *
 * Usage:
 *   node scripts/seed-first-year-materials.mjs
 */

import { createSign } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Load Service Account
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

async function writeFirestoreDoc(accessToken, collectionName, docId, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }

  const url = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/${collectionName}/${docId}`;
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
}

async function fetchAllDocs(accessToken, collectionName) {
  const results = [];
  let pageToken = '';

  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/${collectionName}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch ${collectionName} (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    if (data.documents) {
      for (const d of data.documents) {
        const id = d.name.split('/').pop();
        const obj = { id };
        if (d.fields) {
          for (const [k, v] of Object.entries(d.fields)) {
            if ('stringValue' in v) obj[k] = v.stringValue;
            else if ('integerValue' in v) obj[k] = parseInt(v.integerValue, 10);
            else if ('booleanValue' in v) obj[k] = v.booleanValue;
            else if ('doubleValue' in v) obj[k] = v.doubleValue;
            else if ('arrayValue' in v) {
              obj[k] = (v.arrayValue?.values || []).map((elem) => {
                if ('stringValue' in elem) return elem.stringValue;
                if ('mapValue' in elem) {
                  const subMap = {};
                  for (const [mk, mv] of Object.entries(elem.mapValue?.fields || {})) {
                    subMap[mk] = mv.stringValue || mv.integerValue || mv.booleanValue;
                  }
                  return subMap;
                }
                return elem;
              });
            }
          }
        }
        results.push(obj);
      }
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return results;
}

function materialUrlKey(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|si$|feature$|usp$|fbclid$)/i.test(key)) u.searchParams.delete(key);
    }
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return `youtube:${u.pathname.slice(1)}:${u.searchParams.get('list') || ''}`;
    if (['youtube.com', 'm.youtube.com'].includes(host)) {
      const video = u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed|v)\/([^/]+)/)?.[1];
      if (video) return `youtube:${video}:${u.searchParams.get('list') || ''}`;
      if (u.searchParams.has('list')) return `playlist:${u.searchParams.get('list')}`;
    }
    if (host === 'drive.google.com') {
      const id = u.pathname.match(/\/(?:d|folders)\/([^/]+)/)?.[1] || u.searchParams.get('id');
      if (id) return `drive:${id}`;
    }
    u.hostname = host === 'telegram.me' ? 't.me' : host;
    u.searchParams.sort();
    return `${u.hostname}${u.pathname.replace(/\/$/, '')}${u.search}`;
  } catch {
    return raw;
  }
}

// 3. First Year Curriculum Modules
const MODULES = [
  {
    id: 'year1-introduction',
    code: 'MED101',
    title: 'Introduction Module',
    titleAr: 'موديول المقدمة (Introduction)',
    year: 1,
    semester: 1,
    active: true,
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
  },
  {
    id: 'year1-ict',
    code: 'MED102',
    title: 'ICT Module',
    titleAr: 'موديول تكنولوجيا المعلومات والاتصالات (ICT)',
    year: 1,
    semester: 1,
    active: true,
    subjects: ['ICT'],
    description: 'Information and Communications Technology module covering Office 365, Generative AI, cloud productivity, and essential digital tools.',
    descriptionAr: 'موديول تكنولوجيا المعلومات والاتصالات وتطبيقات أوفيس 365 والذكاء الاصطناعي التوليدي والمهارات الرقمية الأساسية.'
  },
  {
    id: 'year1-general-pharmacology',
    code: 'MED103',
    title: 'General Pharmacology',
    titleAr: 'موديول الفارماكولوجي العام (General Pharmacology)',
    year: 1,
    semester: 2,
    active: true,
    subjects: ['Pharmacology'],
    description: 'General pharmacology principles, pharmacokinetics, pharmacodynamics, and introductory therapeutics.',
    descriptionAr: 'مبادئ علم الأدوية العام وحركية وتأثيرات الأدوية.'
  },
  {
    id: 'year1-general-pathology',
    code: 'MED104',
    title: 'General Pathology',
    titleAr: 'موديول الباثولوجي العام (General Pathology)',
    year: 1,
    semester: 2,
    active: true,
    subjects: ['Pathology'],
    description: 'Principles of general pathology, cell injury, cellular adaptation, inflammation, and repair.',
    descriptionAr: 'مبادئ علم الأمراض العام، إصابات الخلايا، التكيف الخلوي، والالتهاب.'
  },
  {
    id: 'year1-infection',
    code: 'MED105',
    title: 'Infection Module',
    titleAr: 'موديول العدوى (Infection)',
    year: 1,
    semester: 2,
    active: true,
    subjects: ['Microbiology', 'Parasitology', 'Immunology', 'Pathology', 'Pharmacology'],
    description: 'Microbiology, parasitology, immunology, and infectious diseases.',
    descriptionAr: 'علم الأحياء الدقيقة، الطفيليات الطبية، المناعة، وأمراض العدوى.'
  },
  {
    id: 'year1-locomotor',
    code: 'MED106',
    title: 'Locomotor Module',
    titleAr: 'موديول الجهاز الحركي (Locomotor)',
    year: 1,
    semester: 2,
    active: true,
    subjects: ['Anatomy', 'Histology', 'Physiology', 'Biochemistry', 'Pathology', 'Pharmacology', 'Parasitology', 'Microbiology', 'Clinical'],
    description: 'Integrated musculoskeletal and locomotor system sciences.',
    descriptionAr: 'تشريح ووظائف وأنسجة وأمراض الجهاز الحركي والعضلي الهيكلي.'
  }
];

// 4. Study Materials
const MATERIALS_TO_ADD = [
  // ==========================================
  // SEMESTER 1: INTRODUCTION MODULE
  // ==========================================

  // Biochemistry Revisions (SharePoint)
  {
    id: 'yr1-intro-bio-protein-rev-1-marwa',
    title: 'مراجعة كيمياء البروتين 1 - د. مروة حمدي',
    titleEn: 'Protein Chemistry Revision 1 - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة كيمياء البروتين الجزء الأول من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/EQB7YidG9KRPtxrj-UWXCOgBIVO3P0MUozi6jRiM1ceMbg?e=2OClZb',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Marwa Hamdy',
    tags: ['biochemistry', 'protein', 'revision', 'marwa hamdy', 'بايو', 'بروتين', 'مراجعة']
  },
  {
    id: 'yr1-intro-bio-protein-rev-2-marwa',
    title: 'مراجعة كيمياء البروتين 2 - د. مروة حمدي',
    titleEn: 'Protein Chemistry Revision 2 - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة كيمياء البروتين الجزء الثاني من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/ERj3zAVeTEpMuG5Nj0tJHjIB19JFpYO7UxC4SdKH3UjBQA?e=24cg5p',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Marwa Hamdy',
    tags: ['biochemistry', 'protein', 'revision', 'marwa hamdy', 'بايو', 'بروتين', 'مراجعة']
  },
  {
    id: 'yr1-intro-bio-cho-lipids-rev-marwa',
    title: 'مراجعة الكربوهيدرات والدهون - د. مروة حمدي',
    titleEn: 'Carbohydrates & Lipids Revision (Revision 3) - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة كيمياء الكربوهيدرات والدهون من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/ERABU2BP2elBjjVMXqPCNxkBhw2Mp3x3R3h9SaTQrmds2A?e=h8Iojc',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Marwa Hamdy',
    tags: ['biochemistry', 'carbohydrates', 'lipids', 'revision', 'marwa hamdy', 'بايو', 'مراجعة']
  },
  {
    id: 'yr1-intro-bio-enzymes-rev-arabic-marwa',
    title: 'مراجعة الإنزيمات (بالعربي) - د. مروة حمدي',
    titleEn: 'Enzymes Arabic Revision - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة الإنزيمات بالعربي من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/EX7J7wFrO4pCknBxsghNAfYBLFbwXQPLcM4v9xlUZmQUtA?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJTdHJlYW1XZWJBcHAiLCJyZWZlcnJhbFZpZXciOiJTaGFyZURpYWxvZy1MaW5rIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXcifX0%3D&e=LuK2aQ',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Marwa Hamdy',
    tags: ['biochemistry', 'enzymes', 'revision', 'marwa hamdy', 'بايو', 'إنزيمات', 'مراجعة']
  },
  {
    id: 'yr1-intro-bio-metabolism-p1-arabic-marwa',
    title: 'مراجعة الميتابوليزم الجزء 1 (بالعربي) - د. مروة حمدي',
    titleEn: 'Metabolism Revision Part 1 (Arabic) - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة الميتابوليزم الجزء الأول بالعربي من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/EVL0OwsVau1Im1ki7OOiG1YBZsazFq6vQJZm-TbF6-Lvcw?e=Ss4Zel',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Marwa Hamdy',
    tags: ['biochemistry', 'metabolism', 'revision', 'marwa hamdy', 'بايو', 'ميتابوليزم', 'مراجعة']
  },
  {
    id: 'yr1-intro-bio-metabolism-p2-glycolysis-marwa',
    title: 'مراجعة الميتابوليزم الجزء 2 (Glycolysis) - د. مروة حمدي',
    titleEn: 'Metabolism Revision Part 2: Glycolysis - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة مسار التحلل السكري Glycolysis من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/EfaXCJ1Zc01GmCMaulg7qEwBnuaQHOO0euoarMiWQAjZUg?e=DOFvAx',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Marwa Hamdy',
    tags: ['biochemistry', 'metabolism', 'glycolysis', 'revision', 'marwa hamdy', 'بايو', 'مراجعة']
  },
  {
    id: 'yr1-intro-bio-practical-rev-marwa',
    title: 'مراجعة عملي البايوكيمستري - د. مروة حمدي',
    titleEn: 'Biochemistry Practical Revision - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة العملي لمادة الكيمياء الحيوية من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/EYlEHz3pNxBKnksdSBM0BuUByYOBcEOitQ5doAvHYV7GSw?e=tXW872',
    type: 'website',
    category: 'practical',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Marwa Hamdy',
    tags: ['biochemistry', 'practical', 'revision', 'marwa hamdy', 'بايو', 'عملي']
  },

  // Histology Revisions (SharePoint)
  {
    id: 'yr1-intro-histo-cell-rev-1-faten',
    title: 'مراجعة الخلية هستولوجي 1 - د. فاتن محمود',
    titleEn: 'Histology Cell Revision 1 - Dr. Faten Mahmoud',
    description: 'تسجيل مراجعة الخلية الجزء الأول هستولوجي من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/ESa7VpT3xnxJlgTSjcqcq1YBO72LsoA2XzOrKeY9o4CaFA?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJTdHJlYW1XZWJBcHAiLCJyZWZlcnJhbFZpZXciOiJTaGFyZURpYWxvZy1MaW5rIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXcifX0%3D&e=leybON',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Histology',
    author: 'Dr. Faten Mahmoud',
    tags: ['histology', 'cell', 'revision', 'faten mahmoud', 'هستولوجي', 'خلية', 'مراجعة']
  },
  {
    id: 'yr1-intro-histo-cell-rev-2-faten',
    title: 'مراجعة الخلية هستولوجي 2 - د. فاتن محمود',
    titleEn: 'Histology Cell Revision 2 - Dr. Faten Mahmoud',
    description: 'تسجيل مراجعة الخلية الجزء الثاني هستولوجي من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/EXbvZ89tGaxLiY2SpxzZkccBGHeYrnwHfm_926q3MfqEsg?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJTdHJlYW1XZWJBcHAiLCJyZWZlcnJhbFZpZXciOiJTaGFyZURpYWxvZy1MaW5rIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXcifX0%3D&e=JjtzqS',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Histology',
    author: 'Dr. Faten Mahmoud',
    tags: ['histology', 'cell', 'revision', 'faten mahmoud', 'هستولوجي', 'خلية', 'مراجعة']
  },
  {
    id: 'yr1-intro-histo-practical-recorded-faten',
    title: 'مراجعة عملي الهستولوجي المسجلة (بالعربي) - د. فاتن محمود',
    titleEn: 'Practical Histology Recorded Revision (Arabic) - Dr. Faten Mahmoud',
    description: 'تسجيل مراجعة العملي هستولوجي بالعربي من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/Ed8lFIQ9OS5JpkkSiQmWTsUBBxo3awSwNSoj7VU5tWf9yQ?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJTdHJlYW1XZWJBcHAiLCJyZWZlcnJhbFZpZXciOiJTaGFyZURpYWxvZy1MaW5rIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXcifX0%3D&e=BdK0c8',
    type: 'website',
    category: 'practical',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Histology',
    author: 'Dr. Faten Mahmoud',
    tags: ['histology', 'practical', 'revision', 'faten mahmoud', 'هستولوجي', 'عملي']
  },

  // Genetics Revisions (SharePoint)
  {
    id: 'yr1-intro-genetics-bio-rev-1-marwa',
    title: 'مراجعة الوراثة بايو 1 - د. مروة حمدي',
    titleEn: 'Genetics Biochemistry Revision 1 - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة الوراثة بايو الجزء الأول من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/ETKcNyCTkqNGhCn0z8IpTCMBMNQ7vjrFaVbOYO0_9W3GpQ?e=cxqSLH',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Genetics',
    author: 'Dr. Marwa Hamdy',
    tags: ['genetics', 'biochemistry', 'revision', 'marwa hamdy', 'وراثة', 'بايو']
  },
  {
    id: 'yr1-intro-genetics-bio-rev-2-marwa',
    title: 'مراجعة الوراثة بايو 2 (بالعربي) - د. مروة حمدي',
    titleEn: 'Genetics Biochemistry Revision 2 (Arabic) - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة الوراثة بايو الجزء الثاني بالعربي من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/EReLqgXJDt1IsiMAho7XhpwBaKPNt65-GQdIKAkXfeYDNg?e=K5pP4h',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Genetics',
    author: 'Dr. Marwa Hamdy',
    tags: ['genetics', 'biochemistry', 'revision', 'marwa hamdy', 'وراثة', 'بايو']
  },
  {
    id: 'yr1-intro-genetics-bio-rev-3-marwa',
    title: 'مراجعة الوراثة بايو 3 (بالعربي) - د. مروة حمدي',
    titleEn: 'Genetics Biochemistry Revision 3 (Arabic) - Dr. Marwa Hamdy',
    description: 'تسجيل مراجعة الوراثة بايو الجزء الثالث بالعربي من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emanhamdy_med_asu_edu_eg/EWsM-hw1ua5KmHtnBfh_y08B5JbItRrsYGVKnuRVNoeQDA?e=ciFwVz',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Genetics',
    author: 'Dr. Marwa Hamdy',
    tags: ['genetics', 'biochemistry', 'revision', 'marwa hamdy', 'وراثة', 'بايو']
  },
  {
    id: 'yr1-intro-genetics-histo-rev-1-faten',
    title: 'مراجعة الوراثة هستولوجي 1 - د. فاتن محمود',
    titleEn: 'Genetics Histology Revision 1 - Dr. Faten Mahmoud',
    description: 'تسجيل مراجعة الوراثة هستولوجي الجزء الأول من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/EQ1LabLSRqRMknnwpDPYXVIBz14mpVkCXWsX1QWf0dFBYA?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJTdHJlYW1XZWJBcHAiLCJyZWZlcnJhbFZpZXciOiJTaGFyZURpYWxvZy1MaW5rIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXcifX0%3D&e=EcoENX',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Genetics',
    author: 'Dr. Faten Mahmoud',
    tags: ['genetics', 'histology', 'revision', 'faten mahmoud', 'وراثة', 'هستولوجي']
  },
  {
    id: 'yr1-intro-genetics-histo-rev-2-faten',
    title: 'مراجعة الوراثة هستولوجي 2 - د. فاتن محمود',
    titleEn: 'Genetics Histology Revision 2 - Dr. Faten Mahmoud',
    description: 'تسجيل مراجعة الوراثة هستولوجي الجزء الثاني من موقع الكلية.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/fatenmahmoud_med_asu_edu_eg/EUBVWdPivkxEqj4A4mshQq0BNsc5UVQmJ0NFDzlrZ6pEOg?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJTdHJlYW1XZWJBcHAiLCJyZWZlcnJhbFZpZXciOiJTaGFyZURpYWxvZy1MaW5rIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXcifX0%3D&e=ZcGbBy',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Genetics',
    author: 'Dr. Faten Mahmoud',
    tags: ['genetics', 'histology', 'revision', 'faten mahmoud', 'وراثة', 'هستولوجي']
  },

  // Physiology MCQs & Anatomy Atlas & EMP Questions
  {
    id: 'yr1-intro-phys-mcqs-drive',
    title: 'بنك أسئلة الفسيولوجيا (Physiology MCQs)',
    titleEn: 'Physiology MCQs Drive Folder',
    description: 'مجلد أسئلة وإم سي كيو لمادة الفسيولوجيا لموديول المقدمة.',
    url: 'https://drive.google.com/drive/folders/1EPMdKhdN2bWyC62Ds_Vk4XRIrqUZ8gfN',
    type: 'drive',
    category: 'exams',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Physiology',
    tags: ['physiology', 'mcq', 'drive', 'فسيولوجي', 'أسئلة']
  },
  {
    id: 'yr1-intro-anat-emp-questions-drive',
    title: 'ملفات تدريبات وأسئلة EMP للتشريح من الكلية',
    titleEn: 'Anatomy EMP Questions & Faculty Training Files',
    description: 'ملفات تدريبات وأسئلة بنك EMP من الكلية لمادة التشريح.',
    url: 'https://drive.google.com/drive/u/2/mobile/folders/1EKFsOnelKoMWs9K5bXIdA-muSbLVbOo7/1K0bcwXVTZCSrKpBZdRjf3rZenXXMG41k/1SAbNnyGiJrlp7W5esxwSYoytA-QclanJ/1IuESR-_ScOM2ok4e0J6sS5Hl0d32GfHp?sort=13&direction=a',
    type: 'drive',
    category: 'exams',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Anatomy',
    tags: ['anatomy', 'emp', 'questions', 'تشريح', 'أسئلة']
  },
  {
    id: 'yr1-intro-anat-faculty-atlas',
    title: 'أطلس التشريح المعتمد للكلية (Anatomy Atlas)',
    titleEn: 'Faculty Recommended Anatomy Atlas',
    description: 'أهم أطلس للتشريح المستخدم في امتحانات ومحاضرات وكتب الكلية.',
    url: 'https://drive.google.com/file/d/1JOFN620yLCsbclujk_76L7QLeie2koCc/view?usp=drivesdk',
    type: 'book',
    category: 'references',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Anatomy',
    tags: ['anatomy', 'atlas', 'book', 'تشريح', 'أطلس']
  },

  // Practical Playlists & Video Groups (Semester 1)
  {
    id: 'yr1-intro-genetics-ayman-basheer-practical',
    title: 'عملي الوراثة - د. أيمن بشير (سلسلة كاملة 9 أجزاء)',
    titleEn: 'Practical Genetics Series - Dr. Ayman Basheer (9 Parts)',
    description: 'شروحات عملي الوراثة: PCR، استخلاص الحمض النووي DNA extraction، التفريد الكهربائي Electrophoresis، البصمة الوراثية، والتراصف الحيوي Bioinformatics.',
    url: 'https://youtu.be/c2hWFY6e2FA',
    type: 'playlist',
    category: 'practical',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Genetics',
    author: 'Dr. Ayman Basheer',
    tags: ['genetics', 'practical', 'ayman basheer', 'وراثة', 'عملي', 'pcr', 'dna'],
    videos: [
      { id: 'ayman-gen-1', title: 'عملى genetics PCR 1', youtubeId: 'c2hWFY6e2FA', url: 'https://youtu.be/c2hWFY6e2FA' },
      { id: 'ayman-gen-2', title: 'عملى genetics PCR 2', youtubeId: 'VA4XLiLHySY', url: 'https://youtu.be/VA4XLiLHySY' },
      { id: 'ayman-gen-3', title: 'عملى genetics DNA extraction 1', youtubeId: 'qOH-UwPEkmc', url: 'https://youtu.be/qOH-UwPEkmc' },
      { id: 'ayman-gen-4', title: 'عملى genetics DNA extraction 2', youtubeId: 'JG4sZb_J0pI', url: 'https://youtu.be/JG4sZb_J0pI' },
      { id: 'ayman-gen-5', title: 'عملى genetics DNA electrophoresis', youtubeId: 'amEtd7IDuis', url: 'https://youtu.be/amEtd7IDuis' },
      { id: 'ayman-gen-6', title: 'عملى genetics DNA electrophoresis 2', youtubeId: 'e84sA3tEM_M', url: 'https://youtu.be/e84sA3tEM_M' },
      { id: 'ayman-gen-7', title: 'عملى genetics DNA finger printing', youtubeId: 'uVnobXaSUyI', url: 'https://youtu.be/uVnobXaSUyI' },
      { id: 'ayman-gen-8', title: 'عملى genetics Blotting', youtubeId: 'SHrk6wPBW78', url: 'https://youtu.be/SHrk6wPBW78' },
      { id: 'ayman-gen-9', title: 'عملى genetics bioinformatics', youtubeId: 'uruNBpbpB7Y', url: 'https://youtu.be/uruNBpbpB7Y' }
    ]
  },
  {
    id: 'yr1-intro-anat-abdullah-practical',
    title: 'عملي التشريح موديول المقدمة - د. عبدالله (3 أجزاء)',
    titleEn: 'Practical Anatomy Introduction - Dr. Abdullah (3 Parts)',
    description: 'شروحات عملي موديول المقدمة تشريح: العظام والمفاصل والمنصف الصدري والعضلات والأعصاب والأوعية الدموية وعلم الأجنة.',
    url: 'https://youtu.be/y0HBKbI4Tfo',
    type: 'playlist',
    category: 'practical',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Anatomy',
    author: 'Abdullah',
    tags: ['anatomy', 'practical', 'abdullah', 'تشريح', 'عملي'],
    videos: [
      { id: 'anat-abd-1', title: 'practical anatomy part 1 | bones, joints & mediastinum', youtubeId: 'y0HBKbI4Tfo', url: 'https://youtu.be/y0HBKbI4Tfo' },
      { id: 'anat-abd-2', title: 'practical part 2 | All the muscles, nerves & vessels', youtubeId: 'gZ-DoYwDiUY', url: 'https://youtu.be/gZ-DoYwDiUY' },
      { id: 'anat-abd-3', title: 'practical 3 | abdomen, head&neck & embryology', youtubeId: 'w2brCOP4JMI', url: 'https://youtu.be/w2brCOP4JMI' }
    ]
  },
  {
    id: 'yr1-intro-histo-zahra-practical',
    title: 'عملي الهستولوجي موديول المقدمة - د. أحمد زهرة (3 أجزاء)',
    titleEn: 'Practical Histology Introduction - Dr. Ahmed Zahra (3 Parts)',
    description: 'شروحات وتحديد شرائح عملي موديول المقدمة هستولوجي للدكتور أحمد زهرة.',
    url: 'https://youtu.be/PJ2yBpSIAns',
    type: 'playlist',
    category: 'practical',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Histology',
    author: 'Dr. Ahmed Zahra',
    tags: ['histology', 'practical', 'zahra', 'هستولوجي', 'عملي'],
    videos: [
      { id: 'histo-zh-1', title: 'Practical Histology Dr. Zahra ASU part 1', youtubeId: 'PJ2yBpSIAns', url: 'https://youtu.be/PJ2yBpSIAns' },
      { id: 'histo-zh-2', title: 'Practical Histology Dr. Zahra ASU part 2', youtubeId: 'ZgHSEJn-Sh4', url: 'https://youtu.be/ZgHSEJn-Sh4' },
      { id: 'histo-zh-3', title: 'Practical Histology Dr. Zahra ASU part 3', youtubeId: '5DcExHrFREg', url: 'https://youtu.be/5DcExHrFREg' }
    ]
  },
  {
    id: 'yr1-intro-bio-essawy-practical',
    title: 'عملي الكيمياء الحيوية - د. محمد عيسوي',
    titleEn: 'Practical Biochemistry - Dr. Mohamed Essawy',
    description: 'قائمة تشغيل شروحات عملي مادة الكيمياء الحيوية لموديول المقدمة.',
    url: 'https://youtube.com/playlist?list=PLw03kzQQoHv3kIXtb2kG0PZ4xmRBC0wry&si=2KT3IRdE3xlEo2yZ',
    playlistId: 'PLw03kzQQoHv3kIXtb2kG0PZ4xmRBC0wry',
    type: 'playlist',
    category: 'practical',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Mohamed Essawy',
    tags: ['biochemistry', 'practical', 'essawy', 'بايو', 'عملي']
  },
  {
    id: 'yr1-intro-immunology-ashraf-practical',
    title: 'عملي المناعة - د. محمد أشرف',
    titleEn: 'Practical Immunology - Dr. Mohamed Ashraf',
    description: 'قائمة تشغيل شروحات وتجارب عملي المناعة لموديول المقدمة.',
    url: 'https://youtube.com/playlist?list=PLN8Jt5eomWaGmuK1YYXpuVZmh0CIUEj5c&si=2GsyVZ5I1jxmjELe',
    playlistId: 'PLN8Jt5eomWaGmuK1YYXpuVZmh0CIUEj5c',
    type: 'playlist',
    category: 'practical',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Immunology',
    author: 'Dr. Mohamed Ashraf',
    tags: ['immunology', 'practical', 'ashraf', 'مناعة', 'عملي']
  },
  {
    id: 'yr1-intro-immunology-ibrahim-channel',
    title: 'قناة عملي المناعة - د. محمد إبراهيم',
    titleEn: 'Practical Immunology Channel - Dr. Mohamed Ibrahim',
    description: 'قناة شروحات ومراجعات عملي المناعة والمايكرو للدكتور محمد إبراهيم.',
    url: 'https://youtube.com/@dr.mohamedibrahim5594?si=ZpqP8DZn9YDeP_9T',
    type: 'youtube',
    category: 'practical',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Immunology',
    author: 'Dr. Mohamed Ibrahim',
    tags: ['immunology', 'practical', 'ibrahim', 'مناعة', 'عملي']
  },
  {
    id: 'yr1-intro-genetics-essawy-playlist',
    title: 'قائمة تشغيل عملي الوراثة - د. محمد عيسوي',
    titleEn: 'Practical Genetics Playlist - Dr. Mohamed Essawy',
    description: 'قائمة تشغيل شروحات عملي الوراثة لموديول المقدمة د. محمد عيسوي.',
    url: 'https://youtube.com/playlist?list=PLw03kzQQoHv0383b-dV2obhLMMEkUdjFA&si=7aiV2jOFFvcpiw',
    playlistId: 'PLw03kzQQoHv0383b-dV2obhLMMEkUdjFA',
    type: 'playlist',
    category: 'practical',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Genetics',
    author: 'Dr. Mohamed Essawy',
    tags: ['genetics', 'practical', 'essawy', 'وراثة', 'عملي']
  },

  // Telegram Revisions (Introduction Module)
  {
    id: 'yr1-intro-rev-telegram-histo',
    title: 'مراجعة الهستولوجي - تليجرام الدفعة',
    titleEn: 'Histology Telegram Revision',
    description: 'ملفات وتسجيلات مراجعة الهستولوجي لموديول المقدمة.',
    url: 'https://t.me/bg_Groub_ASU/555?single',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Histology',
    tags: ['histology', 'revision', 'telegram', 'هستولوجي', 'مراجعة']
  },
  {
    id: 'yr1-intro-rev-telegram-bio',
    title: 'مراجعة الكيمياء الحيوية - تليجرام الدفعة',
    titleEn: 'Biochemistry Telegram Revision',
    description: 'ملفات وتسجيلات مراجعة البايو لموديول المقدمة.',
    url: 'https://t.me/bg_Groub_ASU/563?single',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    tags: ['biochemistry', 'revision', 'telegram', 'بايو', 'مراجعة']
  },
  {
    id: 'yr1-intro-rev-telegram-anat',
    title: 'مراجعة التشريح - تليجرام الدفعة',
    titleEn: 'Anatomy Telegram Revision',
    description: 'ملفات وتسجيلات مراجعة التشريح لموديول المقدمة.',
    url: 'https://t.me/bg_Groub_ASU/582?single',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Anatomy',
    tags: ['anatomy', 'revision', 'telegram', 'تشريح', 'مراجعة']
  },
  {
    id: 'yr1-intro-rev-telegram-genetics',
    title: 'مراجعة الوراثة - تليجرام الدفعة',
    titleEn: 'Genetics Telegram Revision',
    description: 'ملفات وتسجيلات مراجعة الوراثة لموديول المقدمة.',
    url: 'https://t.me/bg_Groub_ASU/574?single',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Genetics',
    tags: ['genetics', 'revision', 'telegram', 'وراثة', 'مراجعة']
  },
  {
    id: 'yr1-intro-rev-telegram-immunology',
    title: 'مراجعة المناعة - تليجرام الدفعة',
    titleEn: 'Immunology Telegram Revision',
    description: 'ملفات وتسجيلات مراجعة المناعة لموديول المقدمة.',
    url: 'https://t.me/bg_Groub_ASU/568?single',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Immunology',
    tags: ['immunology', 'revision', 'telegram', 'مناعة', 'مراجعة']
  },

  // Central Telegram Channels & Bots (Semester 1)
  {
    id: 'yr1-intro-bot-introduction-modules',
    title: 'بوت موديول المقدمة (Introduction Modules Bot)',
    titleEn: 'Introduction Modules Telegram Bot',
    description: 'بوت تلجرام مخصص لمصادر وشروحات وأسئلة موديول المقدمة.',
    url: 'https://t.me/Introduction_ModulesBot',
    type: 'telegram',
    category: 'central',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    tags: ['telegram', 'bot', 'introduction', 'بوت', 'مقدمة']
  },
  {
    id: 'yr1-intro-bot-audata',
    title: 'بوت داتا الكلية (AU Data Bot)',
    titleEn: 'AU Data Telegram Bot',
    description: 'بوت تلجرام لتوفير مصادر ومذكرات دراسية لطلاب الكلية.',
    url: 'https://t.me/AUData_bot',
    type: 'telegram',
    category: 'central',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    tags: ['telegram', 'bot', 'داتا', 'بوت']
  },
  {
    id: 'yr1-intro-bot-medicine-way',
    title: 'بوت Medicine Way',
    titleEn: 'Medicine Way Telegram Bot',
    description: 'بوت تليجرام يحتوي على داتا ومصادر طبية مجمعة من كليات الطب.',
    url: 'https://t.me/Medicine_way_bot',
    type: 'telegram',
    category: 'central',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    tags: ['telegram', 'bot', 'medicine way', 'بوت']
  },
  {
    id: 'yr1-intro-past-lectures-recordings',
    title: 'تسجيلات محاضرات السنة السابقة لطب عين شمس',
    titleEn: 'Faculty Previous Year Recorded Lectures Group',
    description: 'جروب ريكوردات وتسجيلات محاضرات الكلية كاملة.',
    url: 'https://t.me/+9hKM9U9urYthYTdk',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    tags: ['telegram', 'recordings', 'lectures', 'تسجيلات', 'محاضرات']
  },
  {
    id: 'yr1-intro-past-finals-telegram-group',
    title: 'جروب أسئلة وامتحانات السنوات السابقة',
    titleEn: 'Previous Years Exams Telegram Group',
    description: 'جروب أسئلة الفاينال وأسئلة السنوات السابقة والريكولات الهامة قبل الامتحان.',
    url: 'https://t.me/c/2584841329/4',
    type: 'telegram',
    category: 'exams',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    tags: ['telegram', 'exams', 'questions', 'امتحانات', 'أسئلة']
  },
  {
    id: 'yr1-intro-anki-decks-asu-telegram',
    title: 'جروب كروت أنكي ASU (Anki Flashcards)',
    titleEn: 'ASU Anki Flashcards Telegram Group',
    description: 'جروب كروت تطبيق أنكي لمواد وموديولات كلية طب عين شمس.',
    url: 'https://t.me/Anki_flashcards_ASU/2',
    type: 'telegram',
    category: 'flashcards',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    tags: ['anki', 'flashcards', 'telegram', 'أنكي', 'فلاش كاردز']
  },

  // Extra Channels & Reference Creators (Introduction Module)
  {
    id: 'yr1-intro-channel-atbaa-asu',
    title: 'قناة أطباء عين شمس (Atbaa ASU)',
    titleEn: 'Atbaa ASU YouTube Channel',
    description: 'قناة طبية مميزة تابعة لطلاب وأطباء عين شمس تحتوي على شروحات ومراجعات.',
    url: 'https://youtube.com/@atbaa6513?si=nkk2awOpDQujPpDJ',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    tags: ['youtube', 'asu', 'أطباء', 'عين شمس']
  },
  {
    id: 'yr1-intro-channel-islam-khalaf',
    title: 'قناة د. إسلام خلف',
    titleEn: 'Dr. Islam Khalaf YouTube Channel',
    description: 'قناة تحتوي على تسجيلات وشروحات مبسطة للمواد الطبية الأساسية.',
    url: 'https://youtube.com/@islamkhalaf?si=1F8-9I1nh-KttjB_',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    author: 'Dr. Islam Khalaf',
    tags: ['youtube', 'islam khalaf', 'شرح']
  },
  {
    id: 'yr1-intro-channel-dr-mahmoud-elhefnawy',
    title: 'قناة د. محمود الحفناوي (كيمياء حيوية)',
    titleEn: 'Dr. Mahmoud Elhefnawy Biochemistry Channel',
    description: 'شرح مبسط وممتع لمادة الكيمياء الحيوية مع التكرار والتثبيت.',
    url: 'https://youtube.com/@dr.ma7moudel7efnawy99?si=-WoygqxnpJ_weBxo',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Mahmoud Elhefnawy',
    tags: ['biochemistry', 'elhefnawy', 'بايو']
  },
  {
    id: 'yr1-intro-channel-roaa-abdelkalik',
    title: 'قناة د. رؤى عبد الخالق (BioBox)',
    titleEn: 'BioBox by Dr. Roaa Abdelkalik',
    description: 'شروحات مبسطة في الكيمياء الحيوية لطلاب الطب.',
    url: 'https://youtube.com/@bioboxbyroaaabdelkalik?si=A6b2qOV7-PxM5Klm',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Roaa Abdelkalik',
    tags: ['biochemistry', 'roaa', 'biobox', 'بايو']
  },
  {
    id: 'yr1-intro-channel-moaz-biochem-playlist',
    title: 'شروحات الكيمياء الحيوية - د. معاذ',
    titleEn: 'Biochemistry Course - Dr. Moaz',
    description: 'شروحات مركزة وطرق تحفيظ ممتازة في مادة الكيمياء الحيوية.',
    url: 'https://youtube.com/playlist?list=PL3hyrxC3h0DPTNATwnZ2egBaGhiBULREd&si=9X4bDEMqk3xZdTne',
    playlistId: 'PL3hyrxC3h0DPTNATwnZ2egBaGhiBULREd',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    subject: 'Biochemistry',
    author: 'Dr. Moaz',
    tags: ['biochemistry', 'moaz', 'بايو']
  },
  {
    id: 'yr1-intro-channel-ayman-basheer',
    title: 'قناة د. أيمن بشير',
    titleEn: 'Dr. Ayman Basheer YouTube Channel',
    description: 'قناة دكتور أيمن بشير بشروحات منظمة في الوراثة والكيمياء الحيوية لعين شمس.',
    url: 'https://youtube.com/@aymanbasheer8736?si=13ydwMxB77SPXkfV',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-introduction',
    author: 'Dr. Ayman Basheer',
    tags: ['biochemistry', 'genetics', 'ayman basheer', 'بايو']
  },

  // ==========================================
  // SEMESTER 1: ICT MODULE (year1-ict)
  // ==========================================
  {
    id: 'yr1-ict-all-videos-series',
    title: 'فيديوهات موديول الـ ICT كاملة (19 فيديو)',
    titleEn: 'All ICT Videos - Complete Series (19 Parts)',
    description: 'سلسلة فيديوهات موديول تكنولوجيا المعلومات والاتصالات كاملة وتغطي Office 365, Generative AI, Outlook, OneDrive, Word, PowerPoint, Excel, Forms, Teams, OneNote.',
    url: 'https://youtu.be/sy9EdR-gzWY',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-ict',
    subject: 'ICT',
    tags: ['ict', 'office 365', 'ai', 'word', 'excel', 'powerpoint', 'teams', 'تكنولوجيا المعلومات'],
    videos: [
      { id: 'ict-vid-1', title: '1- Intro to Office 365', youtubeId: 'sy9EdR-gzWY', url: 'https://youtu.be/sy9EdR-gzWY' },
      { id: 'ict-vid-2', title: '2- Generative AI Part 1', youtubeId: 'og0BPH2_nsk', url: 'https://youtu.be/og0BPH2_nsk' },
      { id: 'ict-vid-3', title: '2- Generative AI Part 2', youtubeId: 'x5Y30VfCW3o', url: 'https://youtu.be/x5Y30VfCW3o' },
      { id: 'ict-vid-4', title: '3- Introduction to Outlook', youtubeId: 'wspKI_D4U4w', url: 'https://youtu.be/wspKI_D4U4w' },
      { id: 'ict-vid-5', title: '4- Introduction to OneDrive', youtubeId: 'FG7ecZ_F740', url: 'https://youtu.be/FG7ecZ_F740' },
      { id: 'ict-vid-6', title: '4- How to use One Drive', youtubeId: 'Xa-lx5bLF5o', url: 'https://youtu.be/Xa-lx5bLF5o' },
      { id: 'ict-vid-7', title: '5- Guide to Microsoft Word', youtubeId: 'S-nHYzK-BVg', url: 'https://youtu.be/S-nHYzK-BVg' },
      { id: 'ict-vid-8', title: '5- Using Find & Replace in Microsoft Word', youtubeId: '8ZSlu4DWJ5k', url: 'https://youtu.be/8ZSlu4DWJ5k' },
      { id: 'ict-vid-9', title: '6- Guide to Microsoft PowerPoint', youtubeId: 'XF34-Wu6qWU', url: 'https://youtu.be/XF34-Wu6qWU' },
      { id: 'ict-vid-10', title: '6- PowerPoint Part 2', youtubeId: '87dj0tGfEaE', url: 'https://youtu.be/87dj0tGfEaE' },
      { id: 'ict-vid-11', title: '6- PowerPoint Part 3', youtubeId: '2-9g6fVL7uQ', url: 'https://youtu.be/2-9g6fVL7uQ' },
      { id: 'ict-vid-12', title: '7- Excel Basics Tutorial', youtubeId: 'rwbho0CgEAE', url: 'https://youtu.be/rwbho0CgEAE' },
      { id: 'ict-vid-13', title: '7- Excel Part 2', youtubeId: 'lxq_46nY43g', url: 'https://youtu.be/lxq_46nY43g' },
      { id: 'ict-vid-14', title: '8- Intro to Microsoft Forms', youtubeId: 'r8XioXnl75o', url: 'https://youtu.be/r8XioXnl75o' },
      { id: 'ict-vid-15', title: '9- Introduction to Microsoft Teams 1', youtubeId: 's6PlCBMVAvE', url: 'https://youtu.be/s6PlCBMVAvE' },
      { id: 'ict-vid-16', title: '9- Introduction to Microsoft Teams 2', youtubeId: 'RR0x50ks7Co', url: 'https://youtu.be/RR0x50ks7Co' },
      { id: 'ict-vid-17', title: '9- Introduction to Microsoft Teams 3', youtubeId: 'Dim6rZGiuCM', url: 'https://youtu.be/Dim6rZGiuCM' },
      { id: 'ict-vid-18', title: '9- Introduction to Microsoft Teams 4', youtubeId: 'Whesxi0fJg8', url: 'https://youtu.be/Whesxi0fJg8' },
      { id: 'ict-vid-19', title: '9- Introduction to Microsoft Teams 5', youtubeId: 'geZFFmSHXEY', url: 'https://youtu.be/geZFFmSHXEY' },
      { id: 'ict-vid-20', title: '10- Introduction to Microsoft OneNote', youtubeId: 'qN15XnU96vQ', url: 'https://youtu.be/qN15XnU96vQ' }
    ]
  },
  {
    id: 'yr1-ict-generative-ai',
    title: 'الذكاء الاصطناعي التوليدي Generative AI (جزأين)',
    titleEn: 'Generative AI - Parts 1 & 2',
    description: 'مقدمة في الذكاء الاصطناعي التوليدي واستخداماته التعليمية والطبية.',
    url: 'https://youtu.be/og0BPH2_nsk',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-ict',
    subject: 'ICT',
    tags: ['ict', 'ai', 'generative ai', 'ذكاء اصطناعي'],
    videos: [
      { id: 'gen-ai-1', title: 'Generative AI part 1', youtubeId: 'og0BPH2_nsk', url: 'https://youtu.be/og0BPH2_nsk' },
      { id: 'gen-ai-2', title: 'Generative AI part 2', youtubeId: 'x5Y30VfCW3o', url: 'https://youtu.be/x5Y30VfCW3o' }
    ]
  },
  {
    id: 'yr1-ict-powerpoint-guide',
    title: 'دليل مايكروسوفت باوربوينت (3 أجزاء)',
    titleEn: 'Microsoft PowerPoint Guide (3 Parts)',
    description: 'شرح متكامل لبرنامج العروض التقديمية Microsoft PowerPoint.',
    url: 'https://youtu.be/XF34-Wu6qWU',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-ict',
    subject: 'ICT',
    tags: ['ict', 'powerpoint', 'office', 'باوربوينت'],
    videos: [
      { id: 'ppt-1', title: 'Guide to Microsoft PowerPoint', youtubeId: 'XF34-Wu6qWU', url: 'https://youtu.be/XF34-Wu6qWU' },
      { id: 'ppt-2', title: 'PowerPoint Part 2', youtubeId: '87dj0tGfEaE', url: 'https://youtu.be/87dj0tGfEaE' },
      { id: 'ppt-3', title: 'PowerPoint Part 3', youtubeId: '2-9g6fVL7uQ', url: 'https://youtu.be/2-9g6fVL7uQ' }
    ]
  },
  {
    id: 'yr1-ict-excel-basics',
    title: 'أساسيات مايكروسوفت إكسيل (جزأين)',
    titleEn: 'Microsoft Excel Basics (2 Parts)',
    description: 'شرح أساسيات برنامج الجداول الإلكترونية Microsoft Excel.',
    url: 'https://youtu.be/rwbho0CgEAE',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-ict',
    subject: 'ICT',
    tags: ['ict', 'excel', 'office', 'إكسيل'],
    videos: [
      { id: 'xl-1', title: 'Excel Basics Tutorial', youtubeId: 'rwbho0CgEAE', url: 'https://youtu.be/rwbho0CgEAE' },
      { id: 'xl-2', title: 'Excel Part 2', youtubeId: 'lxq_46nY43g', url: 'https://youtu.be/lxq_46nY43g' }
    ]
  },
  {
    id: 'yr1-ict-microsoft-teams',
    title: 'دليل استخدام مايكروسوفت تيمز (5 أجزاء)',
    titleEn: 'Microsoft Teams Guide (5 Parts)',
    description: 'شرح شامل لمنصة العمل الجماعي والمحاضرات Microsoft Teams.',
    url: 'https://youtu.be/s6PlCBMVAvE',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 1,
    moduleId: 'year1-ict',
    subject: 'ICT',
    tags: ['ict', 'teams', 'office', 'تيمز'],
    videos: [
      { id: 'tm-1', title: 'Introduction to Microsoft Teams 1', youtubeId: 's6PlCBMVAvE', url: 'https://youtu.be/s6PlCBMVAvE' },
      { id: 'tm-2', title: 'Introduction to Microsoft Teams 2', youtubeId: 'RR0x50ks7Co', url: 'https://youtu.be/RR0x50ks7Co' },
      { id: 'tm-3', title: 'Introduction to Microsoft Teams 3', youtubeId: 'Dim6rZGiuCM', url: 'https://youtu.be/Dim6rZGiuCM' },
      { id: 'tm-4', title: 'Introduction to Microsoft Teams 4', youtubeId: 'Whesxi0fJg8', url: 'https://youtu.be/Whesxi0fJg8' },
      { id: 'tm-5', title: 'Introduction to Microsoft Teams 5', youtubeId: 'geZFFmSHXEY', url: 'https://youtu.be/geZFFmSHXEY' }
    ]
  },

  // ==========================================
  // SEMESTER 2: LOCOMOTOR MODULE (year1-locomotor)
  // ==========================================
  {
    id: 'yr1-loco-drive-1',
    title: 'درايف موديول الجهاز الحركي 1 (Locomotor Drive 1)',
    titleEn: 'Locomotor Drive 1',
    url: 'https://drive.google.com/drive/folders/12E2Mj5k6SDlazajOvnp7aRcDsEPjGLwl',
    type: 'drive',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['locomotor', 'drive', 'لوكوموتور']
  },
  {
    id: 'yr1-loco-drive-2',
    title: 'درايف موديول الجهاز الحركي 2 (Locomotor Drive 2)',
    titleEn: 'Locomotor Drive 2',
    url: 'https://drive.google.com/drive/folders/1JylF-sGKOk1ZSAufQgzVbesxeEbjwzMg',
    type: 'drive',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['locomotor', 'drive', 'لوكوموتور']
  },
  {
    id: 'yr1-loco-drive-3',
    title: 'درايف موديول الجهاز الحركي 3 (Locomotor Drive 3)',
    titleEn: 'Locomotor Drive 3',
    url: 'https://drive.google.com/drive/folders/1JxIHa8Wu5m5XhFvPH0tVLi4RjT-Nv1fN',
    type: 'drive',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['locomotor', 'drive', 'لوكوموتور']
  },
  {
    id: 'yr1-loco-drive-4',
    title: 'درايف موديول الجهاز الحركي 4 (Locomotor Drive 4)',
    titleEn: 'Locomotor Drive 4',
    url: 'https://drive.google.com/drive/folders/1t_yU2aaGHk3MGq8JBIBqJh5rh2UTWx2J',
    type: 'drive',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['locomotor', 'drive', 'لوكوموتور']
  },
  {
    id: 'yr1-loco-drive-5',
    title: 'درايف موديول الجهاز الحركي 5 (Locomotor Drive 5)',
    titleEn: 'Locomotor Drive 5',
    url: 'https://drive.google.com/drive/folders/17wyQQHMGJE1q3Bcoaod6C5ZKCXUeDeX-',
    type: 'drive',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['locomotor', 'drive', 'لوكوموتور']
  },
  {
    id: 'yr1-loco-drive-batch',
    title: 'درايف الدفعة لموديول الجهاز الحركي (Our Locomotor Drive)',
    titleEn: 'Batch Locomotor Drive',
    description: 'مجلد الدفعة الرسمي لمحاضرات وسكاشن وكتب وملفات موديول Locomotor أولاً بأول.',
    url: 'https://drive.google.com/drive/folders/1iISiCTT9cQxszFSIGvXBK85vjKrtVGva',
    type: 'drive',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['locomotor', 'drive', 'batch', 'درايف', 'لوكوموتور']
  },
  {
    id: 'yr1-loco-anat-ahmed-farid',
    title: 'تشريح الجهاز الحركي - د. أحمد فريد',
    titleEn: 'Locomotor Anatomy - Dr. Ahmed Farid',
    url: 'https://youtube.com/playlist?list=PLs0O24oUQeaBP_2Zsz6_sq5Q4wH_6GISn&si=WahhujjsfaWH1ixP',
    playlistId: 'PLs0O24oUQeaBP_2Zsz6_sq5Q4wH_6GISn',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Anatomy',
    author: 'Dr. Ahmed Farid',
    tags: ['anatomy', 'locomotor', 'ahmed farid', 'تشريح']
  },
  {
    id: 'yr1-loco-anat-ayman-khanfour-1',
    title: 'تشريح الجهاز الحركي - د. أيمن خنفور (قائمة 1)',
    titleEn: 'Locomotor Anatomy - Dr. Ayman Khanfour (Part 1)',
    url: 'https://www.youtube.com/playlist?list=PL5Ituyh1PACJlFm_bGBUAGc9TRJHrbf1w',
    playlistId: 'PL5Ituyh1PACJlFm_bGBUAGc9TRJHrbf1w',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Anatomy',
    author: 'Dr. Ayman Khanfour',
    tags: ['anatomy', 'locomotor', 'khanfour', 'تشريح']
  },
  {
    id: 'yr1-loco-anat-ayman-khanfour-2',
    title: 'تشريح الجهاز الحركي - د. أيمن خنفور (قائمة 2)',
    titleEn: 'Locomotor Anatomy - Dr. Ayman Khanfour (Part 2)',
    url: 'https://www.youtube.com/playlist?list=PL5Ituyh1PACLhnxLPRc5P-W8zPycKlowj',
    playlistId: 'PL5Ituyh1PACLhnxLPRc5P-W8zPycKlowj',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Anatomy',
    author: 'Dr. Ayman Khanfour',
    tags: ['anatomy', 'locomotor', 'khanfour', 'تشريح']
  },
  {
    id: 'yr1-loco-anat-ayman-khanfour-3',
    title: 'تشريح الجهاز الحركي - د. أيمن خنفور (قائمة 3)',
    titleEn: 'Locomotor Anatomy - Dr. Ayman Khanfour (Part 3)',
    url: 'https://youtube.com/playlist?list=PL5Ituyh1PACIwcGLbXu2NeVqbzYG6HQyt',
    playlistId: 'PL5Ituyh1PACIwcGLbXu2NeVqbzYG6HQyt',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Anatomy',
    author: 'Dr. Ayman Khanfour',
    tags: ['anatomy', 'locomotor', 'khanfour', 'تشريح']
  },
  {
    id: 'yr1-loco-anat-wahdan-1',
    title: 'تشريح الجهاز الحركي - د. وهدان (قائمة 1)',
    titleEn: 'Locomotor Anatomy - Dr. Wahdan (Part 1)',
    url: 'https://www.youtube.com/playlist?list=PLIZNmuBMEjaNESsi2aZ2SgoaK4fJZHefg',
    playlistId: 'PLIZNmuBMEjaNESsi2aZ2SgoaK4fJZHefg',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Anatomy',
    author: 'Dr. Wahdan',
    tags: ['anatomy', 'locomotor', 'wahdan', 'تشريح']
  },
  {
    id: 'yr1-loco-anat-wahdan-2',
    title: 'تشريح الجهاز الحركي - د. وهدان (قائمة 2)',
    titleEn: 'Locomotor Anatomy - Dr. Wahdan (Part 2)',
    url: 'https://www.youtube.com/playlist?list=PLIZNmuBMEjaPt0397mit51EPDDSoi1JzH',
    playlistId: 'PLIZNmuBMEjaPt0397mit51EPDDSoi1JzH',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Anatomy',
    author: 'Dr. Wahdan',
    tags: ['anatomy', 'locomotor', 'wahdan', 'تشريح']
  },
  {
    id: 'yr1-loco-histo-zahra-practical',
    title: 'عملي هستولوجي الجهاز الحركي - د. أحمد زهرة',
    titleEn: 'Locomotor Histology Practical - Dr. Ahmed Zahra',
    url: 'https://youtube.com/playlist?list=PLgFd09l_yBQ-6bnm27h7IcwjZmFBOfAVW&si=u0ChVr5Qi25fL8Tp',
    playlistId: 'PLgFd09l_yBQ-6bnm27h7IcwjZmFBOfAVW',
    type: 'playlist',
    category: 'practical',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Histology',
    author: 'Dr. Ahmed Zahra',
    tags: ['histology', 'locomotor', 'zahra', 'عملي', 'هستولوجي']
  },
  {
    id: 'yr1-loco-histo-iman-nabeel',
    title: 'هستولوجي الجهاز الحركي - د. إيمان نبيل',
    titleEn: 'Locomotor Histology - Dr. Iman Nabeel',
    url: 'https://youtube.com/playlist?list=PLAlbG9dixa2jIch7OfvIkOTMmbCFOzKdA&si=FHbT9TkKVTB_CT25',
    playlistId: 'PLAlbG9dixa2jIch7OfvIkOTMmbCFOzKdA',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Histology',
    author: 'Dr. Iman Nabeel',
    tags: ['histology', 'locomotor', 'iman nabeel', 'هستولوجي']
  },
  {
    id: 'yr1-loco-histo-shereen-1',
    title: 'هستولوجي الجهاز الحركي - د. شيرين (قائمة 1)',
    titleEn: 'Locomotor Histology - Dr. Shereen (Part 1)',
    url: 'https://youtube.com/playlist?list=PLzjKJPnFc4jwAxG16dhE4U4R0pzJXjP-J',
    playlistId: 'PLzjKJPnFc4jwAxG16dhE4U4R0pzJXjP-J',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Histology',
    author: 'Dr. Shereen',
    tags: ['histology', 'locomotor', 'shereen', 'هستولوجي']
  },
  {
    id: 'yr1-loco-histo-shereen-2',
    title: 'هستولوجي الجهاز الحركي - د. شيرين (قائمة 2)',
    titleEn: 'Locomotor Histology - Dr. Shereen (Part 2)',
    url: 'https://youtube.com/playlist?list=PLzjKJPnFc4jzWlByLsj4Haq_rDe6vkSTR',
    playlistId: 'PLzjKJPnFc4jzWlByLsj4Haq_rDe6vkSTR',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Histology',
    author: 'Dr. Shereen',
    tags: ['histology', 'locomotor', 'shereen', 'هستولوجي']
  },
  {
    id: 'yr1-loco-phys-fayez',
    title: 'فسيولوجي الجهاز الحركي - د. محمد فايز',
    titleEn: 'Locomotor Physiology - Dr. Mohamed Fayez',
    url: 'https://youtube.com/playlist?list=PLLShXxg1izoiOXSW0ykit-XcZXZLJxyRn',
    playlistId: 'PLLShXxg1izoiOXSW0ykit-XcZXZLJxyRn',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Physiology',
    author: 'Dr. Mohamed Fayez',
    tags: ['physiology', 'locomotor', 'fayez', 'فسيولوجي']
  },
  {
    id: 'yr1-loco-phys-osama-telegram',
    title: 'تسجيلات فسيولوجي الجهاز الحركي - د. أسامة',
    titleEn: 'Locomotor Physiology Recordings - Dr. Osama',
    url: 'https://t.me/+RukXw77opUg0ZDg0',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Physiology',
    author: 'Dr. Osama',
    tags: ['physiology', 'locomotor', 'osama', 'فسيولوجي']
  },
  {
    id: 'yr1-loco-pharma-noureldeen',
    title: 'فارماكولوجي الجهاز الحركي - د. أحمد نور الدين',
    titleEn: 'Locomotor Pharmacology - Dr. Ahmed Noureldeen',
    url: 'https://youtube.com/playlist?list=PL_7f3u0OA6BNlq7n3j4O7vqw67C1jBBeb',
    playlistId: 'PL_7f3u0OA6BNlq7n3j4O7vqw67C1jBBeb',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Pharmacology',
    author: 'Dr. Ahmed Noureldeen',
    tags: ['pharmacology', 'locomotor', 'noureldeen', 'فارما']
  },
  {
    id: 'yr1-loco-pharma-fouda',
    title: 'فارماكولوجي الجهاز الحركي - د. عبد المتعال فودة',
    titleEn: 'Locomotor Pharmacology - Dr. Abdelmetaal Fouda',
    url: 'https://youtube.com/playlist?list=PLiccn5I1-F3Ik9PJcmXat0Pao1tEtqpTK',
    playlistId: 'PLiccn5I1-F3Ik9PJcmXat0Pao1tEtqpTK',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Pharmacology',
    author: 'Dr. Abdelmetaal Fouda',
    tags: ['pharmacology', 'locomotor', 'fouda', 'فارما']
  },
  {
    id: 'yr1-loco-para-khaled-habib',
    title: 'باراسيتولوجي الجهاز الحركي - د. خالد حبيب',
    titleEn: 'Locomotor Parasitology - Dr. Khaled Habib',
    url: 'https://youtube.com/playlist?list=PLZkFGqENZSw0BdK7KPvkYlDTdJHHiKrzf&si=whbBtr9yXBp6Ul6C',
    playlistId: 'PLZkFGqENZSw0BdK7KPvkYlDTdJHHiKrzf',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Parasitology',
    author: 'Dr. Khaled Habib',
    tags: ['parasitology', 'locomotor', 'khaled habib', 'بارا']
  },
  {
    id: 'yr1-loco-bio-ayman',
    title: 'كيمياء حيوية الجهاز الحركي - د. أيمن',
    titleEn: 'Locomotor Biochemistry - Dr. Ayman',
    url: 'https://youtube.com/playlist?list=PLTvDPZ9suvRQ9Hms4YH6xy_CLPtmCwNS8',
    playlistId: 'PLTvDPZ9suvRQ9Hms4YH6xy_CLPtmCwNS8',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Biochemistry',
    author: 'Dr. Ayman',
    tags: ['biochemistry', 'locomotor', 'ayman', 'بايو']
  },
  {
    id: 'yr1-loco-bio-walaa',
    title: 'كيمياء حيوية الجهاز الحركي - د. ولاء',
    titleEn: 'Locomotor Biochemistry - Dr. Walaa',
    url: 'https://youtube.com/playlist?list=PLXd13HOsAnZwVp2EAr92f5JKssXKFP8yT',
    playlistId: 'PLXd13HOsAnZwVp2EAr92f5JKssXKFP8yT',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Biochemistry',
    author: 'Dr. Walaa',
    tags: ['biochemistry', 'locomotor', 'walaa', 'بايو']
  },
  {
    id: 'yr1-loco-clinical-khadiga',
    title: 'كلينيكال الجهاز الحركي - د. خديجة',
    titleEn: 'Locomotor Clinical - Dr. Khadiga',
    url: 'https://youtube.com/playlist?list=PLrZitVjgO-PXelML9A-OBrfv4fFJS1k9q&si=mWq013rbbPSaaVXS',
    playlistId: 'PLrZitVjgO-PXelML9A-OBrfv4fFJS1k9q',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    subject: 'Clinical',
    author: 'Dr. Khadiga',
    tags: ['clinical', 'locomotor', 'khadiga', 'كلينيكال']
  },
  {
    id: 'yr1-loco-past-exams-telegram',
    title: 'امتحانات سنين سابقة للجهاز الحركي',
    titleEn: 'Locomotor Previous Years Exams',
    url: 'https://t.me/+cfphz_PeiYE0MDY0',
    type: 'telegram',
    category: 'exams',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['exams', 'locomotor', 'امتحانات', 'لوكوموتور']
  },
  {
    id: 'yr1-loco-paper-1-drive',
    title: 'أسئلة وامتحانات Locomotor Paper 1',
    titleEn: 'Locomotor Paper 1 Questions & Exams Drive',
    url: 'https://drive.google.com/drive/folders/1q9yT45SNdO5UhzZXqYnR9ve4laCD1C6W',
    type: 'drive',
    category: 'exams',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['exams', 'locomotor', 'paper 1', 'امتحانات']
  },
  {
    id: 'yr1-loco-paper-2-drive',
    title: 'أسئلة وامتحانات Locomotor Paper 2',
    titleEn: 'Locomotor Paper 2 Questions & Exams Drive',
    url: 'https://drive.google.com/drive/folders/169JdBDtBknoDf0RH01fzkztRpgRL_0yQ',
    type: 'drive',
    category: 'exams',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['exams', 'locomotor', 'paper 2', 'امتحانات']
  },
  {
    id: 'yr1-loco-telegram-revision-1',
    title: 'مراجعة الجهاز الحركي 1 - تليجرام الدفعة',
    titleEn: 'Locomotor Revision 1 - Batch Telegram',
    url: 'https://t.me/bg_Groub_ASU/1790',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['telegram', 'locomotor', 'revision', 'مراجعة']
  },
  {
    id: 'yr1-loco-telegram-revision-2',
    title: 'مراجعة الجهاز الحركي 2 - تليجرام الدفعة',
    titleEn: 'Locomotor Revision 2 - Batch Telegram',
    url: 'https://t.me/bg_Groub_ASU/1791',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['telegram', 'locomotor', 'revision', 'مراجعة']
  },
  {
    id: 'yr1-loco-bot-anquiz',
    title: 'جروب وبوت ANQUIZ Locomotor',
    titleEn: 'ANQUIZ Locomotor Telegram Group',
    description: 'جروب تدريبات وأسئلة هامة للحل قبل امتحانات الجهاز الحركي.',
    url: 'https://t.me/ANQUIZLOCOMOTOR',
    type: 'telegram',
    category: 'exams',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['telegram', 'mcq', 'locomotor', 'أسئلة']
  },

  // ==========================================
  // SEMESTER 2: INFECTION MODULE (year1-infection)
  // ==========================================
  {
    id: 'yr1-inf-questions-drive',
    title: 'درايف أسئلة موديول Infection',
    titleEn: 'Infection Module Questions Drive',
    url: 'https://drive.google.com/drive/folders/1X4woErRyvSQZc5LIWSwnTk7fFbgBH4in',
    type: 'drive',
    category: 'exams',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    tags: ['infection', 'drive', 'questions', 'انفكشن', 'أسئلة']
  },
  {
    id: 'yr1-inf-micro-lectures-feb25-drive',
    title: 'محاضرات الميكروبيولوجي 25 فبراير (نهاية ch7)',
    titleEn: 'Microbiology Lectures 25 Feb Drive',
    url: 'https://drive.google.com/file/d/16UWvxTLoAXragNyKZLY-XrWrbddIM16Q/view?usp=drivesdk',
    type: 'drive',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Microbiology',
    tags: ['microbiology', 'infection', 'lectures', 'مايكرو']
  },
  {
    id: 'yr1-inf-revision-telegram',
    title: 'مراجعة موديول Infection - تليجرام الدفعة',
    titleEn: 'Infection Module Telegram Revision',
    url: 'https://t.me/bg_Groub_ASU/1449',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    tags: ['infection', 'revision', 'telegram', 'مراجعة']
  },
  {
    id: 'yr1-inf-micro4-revision-telegram',
    title: 'مراجعة Micro 4 - تليجرام الدفعة',
    titleEn: 'Microbiology 4 Telegram Revision',
    url: 'https://t.me/bg_Groub_ASU/1890',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Microbiology',
    tags: ['microbiology', 'revision', 'telegram', 'مايكرو', 'مراجعة']
  },
  {
    id: 'yr1-inf-dr-ashraf-micro-telegram',
    title: 'قناة د. محمد أشرف ميكروبيولوجي',
    titleEn: 'Dr. Muhammad Ashraf Microbiology Telegram',
    url: 'https://t.me/MicroDrAshraf2026',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Microbiology',
    author: 'Dr. Muhammad Ashraf',
    tags: ['microbiology', 'ashraf', 'telegram', 'مايكرو']
  },
  {
    id: 'yr1-inf-dr-khaled-habib-para-channel',
    title: 'قناة د. خالد حبيب باراسيتولوجي',
    titleEn: 'Dr. Khaled Habib Parasitology Telegram Channel',
    url: 'https://t.me/+Dx380SK-e2lmYWE0',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Parasitology',
    author: 'Dr. Khaled Habib',
    tags: ['parasitology', 'khaled habib', 'telegram', 'بارا']
  },
  {
    id: 'yr1-inf-dr-khaled-habib-para-group',
    title: 'جروب د. خالد حبيب باراسيتولوجي',
    titleEn: 'Dr. Khaled Habib Parasitology Telegram Group',
    url: 'https://t.me/+rYruQfU0s51lOWE0',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Parasitology',
    author: 'Dr. Khaled Habib',
    tags: ['parasitology', 'khaled habib', 'telegram', 'بارا']
  },
  {
    id: 'yr1-inf-dr-ayman-ibrahim-para-telegram',
    title: 'قناة د. أيمن إبراهيم باراسيتولوجي',
    titleEn: 'Dr. Ayman Ibrahim Parasitology Telegram Channel',
    url: 'https://t.me/+6YrmbmB8VSthOGM0',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Parasitology',
    author: 'Dr. Ayman Ibrahim',
    tags: ['parasitology', 'ayman ibrahim', 'telegram', 'بارا']
  },
  {
    id: 'yr1-inf-dr-ayman-ibrahim-para-whatsapp',
    title: 'جروب د. أيمن إبراهيم باراسيتولوجي (واتساب)',
    titleEn: 'Dr. Ayman Ibrahim Parasitology WhatsApp Group',
    url: 'https://chat.whatsapp.com/L51WV9qli7iI5dGNO73vx8?mode=gi_c',
    type: 'whatsapp',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Parasitology',
    author: 'Dr. Ayman Ibrahim',
    tags: ['parasitology', 'ayman ibrahim', 'whatsapp', 'بارا']
  },
  {
    id: 'yr1-inf-microbiology-iraqi-playlist',
    title: 'قائمة تشغيل الميكروبيولوجي - د. العراقي',
    titleEn: 'Microbiology Playlist - Drs Iraqi ASU',
    url: 'https://youtube.com/playlist?list=PLHhr3oQExKFf9zHlZMmEsAeeaRdre0VRh&si=HquH4L21LnmJTdsR',
    playlistId: 'PLHhr3oQExKFf9zHlZMmEsAeeaRdre0VRh',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Microbiology',
    author: 'Drs Iraqi ASU',
    tags: ['microbiology', 'iraqi', 'playlist', 'مايكرو']
  },
  {
    id: 'yr1-inf-microbiology-chapters-series',
    title: 'سلسلة فصول الميكروبيولوجي (15 فيديو) - د. العراقي',
    titleEn: 'Medical Microbiology Chapters Series (15 Parts) - Drs Iraqi ASU',
    description: 'شروحات شاملة لفصول الميكروبيولوجي من الفصل الأول حتى العاشر.',
    url: 'https://youtu.be/BY7bjDiiKu8',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Microbiology',
    author: 'Drs Iraqi ASU',
    tags: ['microbiology', 'infection', 'iraqi', 'مايكرو'],
    videos: [
      { id: 'micro-ch-1', title: 'Chapter 1: Intro to Medical Microbiology', youtubeId: 'BY7bjDiiKu8', url: 'https://youtu.be/BY7bjDiiKu8' },
      { id: 'micro-ch-2-1', title: 'Chapter 2 Part 1', youtubeId: 'g78BlSerAZI', url: 'https://youtu.be/g78BlSerAZI' },
      { id: 'micro-ch-2-2', title: 'Chapter 2 Part 2', youtubeId: 'ERaqaKndpf8', url: 'https://youtu.be/ERaqaKndpf8' },
      { id: 'micro-ch-3', title: 'Chapter 3', youtubeId: 'IDwp8Fol3XI', url: 'https://youtu.be/IDwp8Fol3XI' },
      { id: 'micro-ch-4', title: 'Chapter 4', youtubeId: '2eE99YLxpWU', url: 'https://youtu.be/2eE99YLxpWU' },
      { id: 'micro-ch-5', title: 'Chapter 5', youtubeId: 'P1RhX0Wrtsg', url: 'https://youtu.be/P1RhX0Wrtsg' },
      { id: 'micro-ch-6-1', title: 'Chapter 6 Part 1', youtubeId: 'D3jFtA119QQ', url: 'https://youtu.be/D3jFtA119QQ' },
      { id: 'micro-ch-6-2', title: 'Chapter 6 Part 2', youtubeId: 'Rl7dnKRh4fw', url: 'https://youtu.be/Rl7dnKRh4fw' },
      { id: 'micro-ch-6-3', title: 'Chapter 6 Part 3', youtubeId: 'DnxtO2D4W7M', url: 'https://youtu.be/DnxtO2D4W7M' },
      { id: 'micro-ch-7', title: 'Chapter 7', youtubeId: '4M_N-FPs7eU', url: 'https://youtu.be/4M_N-FPs7eU' },
      { id: 'micro-ch-8', title: 'Chapter 8', youtubeId: 'WXIwRwtdbvc', url: 'https://youtu.be/WXIwRwtdbvc' },
      { id: 'micro-ch-9-1', title: 'Chapter 9 Part 1', youtubeId: 'dp_V3rcZCSs', url: 'https://youtu.be/dp_V3rcZCSs' },
      { id: 'micro-ch-9-2', title: 'Chapter 9 Part 2', youtubeId: 'p1Jk4seskFI', url: 'https://youtu.be/p1Jk4seskFI' },
      { id: 'micro-ch-10-1', title: 'Chapter 10 Part 1', youtubeId: '3xHRy1_6ecQ', url: 'https://youtu.be/3xHRy1_6ecQ' },
      { id: 'micro-ch-10-2', title: 'Chapter 10 Part 2', youtubeId: '8MTaYwMcHRg', url: 'https://youtu.be/8MTaYwMcHRg' }
    ]
  },
  {
    id: 'yr1-inf-parasitology-chapters-series',
    title: 'سلسلة فصول الباراسيتولوجي (12 فيديو) - د. العراقي',
    titleEn: 'Medical Parasitology Chapters Series (12 Parts) - Drs Iraqi ASU',
    description: 'شروحات شاملة لفصول الباراسيتولوجي من الفصل الأول حتى الثامن.',
    url: 'https://youtu.be/4BjY3eIScqA',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    subject: 'Parasitology',
    author: 'Drs Iraqi ASU',
    tags: ['parasitology', 'infection', 'iraqi', 'بارا'],
    videos: [
      { id: 'para-ch-1-1', title: 'Chapter 1 Part 1: Intro to Medical Parasitology', youtubeId: '4BjY3eIScqA', url: 'https://youtu.be/4BjY3eIScqA' },
      { id: 'para-ch-1-2', title: 'Chapter 1 Part 2', youtubeId: 'X3n0Ts96he4', url: 'https://youtu.be/X3n0Ts96he4' },
      { id: 'para-ch-1-3', title: 'Chapter 1 Part 3', youtubeId: 'smvnu6ZPtsE', url: 'https://youtu.be/smvnu6ZPtsE' },
      { id: 'para-ch-2-1', title: 'Chapter 2 Part 1', youtubeId: '-W0e6DgS4vQ', url: 'https://youtu.be/ -W0e6DgS4vQ' },
      { id: 'para-ch-2-2', title: 'Chapter 2 Part 2', youtubeId: 'UYOMyHRFfs8', url: 'https://youtu.be/UYOMyHRFfs8' },
      { id: 'para-ch-2-3', title: 'Chapter 2 Part 3', youtubeId: 'gXjmI6oRJ-U', url: 'https://youtu.be/gXjmI6oRJ-U' },
      { id: 'para-ch-3', title: 'Chapter 3', youtubeId: '9Wzipk7eUGI', url: 'https://youtu.be/9Wzipk7eUGI' },
      { id: 'para-ch-4', title: 'Chapter 4', youtubeId: '1Q5sY-zAH2k', url: 'https://youtu.be/1Q5sY-zAH2k' },
      { id: 'para-ch-5', title: 'Chapter 5', youtubeId: 'FPyY_s_G12c', url: 'https://youtu.be/FPyY_s_G12c' },
      { id: 'para-ch-6', title: 'Chapter 6', youtubeId: 'HuxkaGUZuVI', url: 'https://youtu.be/HuxkaGUZuVI' },
      { id: 'para-ch-7', title: 'Chapter 7', youtubeId: '9sblORwMt84', url: 'https://youtu.be/9sblORwMt84' },
      { id: 'para-ch-8', title: 'Chapter 8', youtubeId: 'yH5na3iuCKc', url: 'https://youtu.be/yH5na3iuCKc' }
    ]
  },

  // ==========================================
  // SEMESTER 2: GENERAL PHARMACOLOGY (year1-general-pharmacology)
  // ==========================================
  {
    id: 'yr1-pha-questions-drive',
    title: 'درايف أسئلة الفارماكولوجي العام',
    titleEn: 'General Pharmacology Questions Drive',
    url: 'https://drive.google.com/drive/folders/1InEW2kVut3qZnlpV9HJoyuzHvRwUreLG',
    type: 'drive',
    category: 'exams',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    tags: ['pharmacology', 'drive', 'questions', 'فارما', 'أسئلة']
  },
  {
    id: 'yr1-pha-lec-adrenergic-drive',
    title: 'محاضرات Adrenergic Pharmacology (حتى ص 53)',
    titleEn: 'Adrenergic Pharmacology Lecture Drive File',
    url: 'https://drive.google.com/file/d/1Id5sSZ0HXK_we1GpXbvyVl6u19kSkiIz/view?usp=drivesdk',
    type: 'drive',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    tags: ['pharmacology', 'adrenergic', 'drive', 'فارما']
  },
  {
    id: 'yr1-pha-lec-drug-interactions-drive',
    title: 'Drug Interaction & Revision of ph-Kinetics (MCQ)',
    titleEn: 'Drug Interaction & Pharmacokinetics Revision Drive File',
    url: 'https://drive.google.com/file/d/1v1ZpRjgnyJxTvc048cLdRmtqjeZRXZfL/view?usp=drivesdk',
    type: 'drive',
    category: 'exams',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    tags: ['pharmacology', 'kinetics', 'mcq', 'فارما']
  },
  {
    id: 'yr1-pha-revision-telegram',
    title: 'مراجعة الفارماكولوجي العام - تليجرام الدفعة',
    titleEn: 'General Pharmacology Telegram Revision',
    url: 'https://t.me/bg_Groub_ASU/1857',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    tags: ['pharmacology', 'revision', 'telegram', 'فارما', 'مراجعة']
  },
  {
    id: 'yr1-pha-chemotherapy-revision-telegram',
    title: 'مراجعة Chemotherapy فارما - تليجرام الدفعة',
    titleEn: 'Chemotherapy Pharmacology Telegram Revision',
    url: 'https://t.me/bg_Groub_ASU/1888',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    tags: ['pharmacology', 'chemotherapy', 'revision', 'فارما']
  },
  {
    id: 'yr1-pha-dr-badawy-mcq-telegram',
    title: 'قناة أسئلة الفارما MCQs - د. بدوي',
    titleEn: 'Pharmacology MCQs Channel - Dr. Badawy',
    url: 'https://t.me/MCQs_Pharma',
    type: 'telegram',
    category: 'exams',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    author: 'Dr. Badawy',
    tags: ['pharmacology', 'badawy', 'mcq', 'فارما']
  },
  {
    id: 'yr1-pha-dr-badawy-whatsapp',
    title: 'جروب د. بدوي فارما (واتساب)',
    titleEn: 'Dr. Badawy Pharmacology WhatsApp Group',
    url: 'https://chat.whatsapp.com/I2YpW6MUB690FOPLEPN3OZ?mode=gi_t',
    type: 'whatsapp',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    author: 'Dr. Badawy',
    tags: ['pharmacology', 'badawy', 'whatsapp', 'فارما']
  },
  {
    id: 'yr1-pha-dr-badawy-channel',
    title: 'قناة د. بدوي فارماكولوجي الرسمية',
    titleEn: 'Dr. Badawy Pharmacology Telegram Channel',
    url: 'https://t.me/Badawy_Pharmacology',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    author: 'Dr. Badawy',
    tags: ['pharmacology', 'badawy', 'telegram', 'فارما']
  },
  {
    id: 'yr1-pha-dr-badawy-intro-video',
    title: 'مقدمة الفارماكولوجي - د. بدوي',
    titleEn: 'ASU Introduction to Pharmacology - Dr. Badawy',
    url: 'https://youtu.be/MR4iyA8JWGs',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    author: 'Dr. Badawy',
    tags: ['pharmacology', 'badawy', 'intro', 'فارما']
  },
  {
    id: 'yr1-pha-dr-noureldin-channel',
    title: 'قناة د. أحمد نور الدين فارماكولوجي',
    titleEn: 'Dr. Ahmed Noureldin Pharmacology Channel',
    url: 'https://youtube.com/@anoureldin61?si=3d9WHUkESSCUq5tF',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    author: 'Dr. Ahmed Noureldin',
    tags: ['pharmacology', 'noureldin', 'youtube', 'فارما']
  },
  {
    id: 'yr1-pha-dr-elshorbagy-lectures',
    title: 'محاضرات كورس الفارما - د. محمد الشوربجي (محاضرتين)',
    titleEn: 'Pharmacology Course - Dr. Mohamed Elshorbagy',
    url: 'https://youtu.be/N4vFNmy3XLE',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    author: 'Dr. Mohamed Elshorbagy',
    tags: ['pharmacology', 'elshorbagy', 'absorption', 'فارما'],
    videos: [
      { id: 'shorbgy-1', title: 'المحاضرة الأولى في كورس الفارما | Absorption 01', youtubeId: 'N4vFNmy3XLE', url: 'https://youtu.be/N4vFNmy3XLE' },
      { id: 'shorbgy-2', title: 'المحاضرة رقم (2) كورس ما وراء الفارما', youtubeId: 'fxIk7_CsNSs', url: 'https://youtu.be/fxIk7_CsNSs' }
    ]
  },
  {
    id: 'yr1-pha-iraqi-parts-series',
    title: 'سلسلة الفارماكولوجي والعلاج الكيميائي (8 أجزاء) - د. العراقي',
    titleEn: 'Pharmacology & Chemotherapy Parts Series (8 Parts) - Drs Iraqi ASU',
    url: 'https://youtu.be/UHR0_7lJ100',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pharmacology',
    subject: 'Pharmacology',
    author: 'Drs Iraqi ASU',
    tags: ['pharmacology', 'chemotherapy', 'iraqi', 'فارما'],
    videos: [
      { id: 'pha-pt-1', title: 'Chemotherapy Part 1 Introduction', youtubeId: 'UHR0_7lJ100', url: 'https://youtu.be/UHR0_7lJ100' },
      { id: 'pha-pt-2', title: 'Part 2', youtubeId: 'sedw8pXn8rY', url: 'https://youtu.be/sedw8pXn8rY' },
      { id: 'pha-pt-3', title: 'Part 3', youtubeId: 'oFfwv6tP3kI', url: 'https://youtu.be/oFfwv6tP3kI' },
      { id: 'pha-pt-4', title: 'Part 4', youtubeId: '3oHw7un1pNk', url: 'https://youtu.be/3oHw7un1pNk' },
      { id: 'pha-pt-5', title: 'Part 5', youtubeId: 'mS6OdD9Yx4w', url: 'https://youtu.be/mS6OdD9Yx4w' },
      { id: 'pha-pt-6', title: 'Part 6', youtubeId: 'g2c53BaGY7Y', url: 'https://youtu.be/g2c53BaGY7Y' },
      { id: 'pha-pt-7', title: 'Part 7', youtubeId: 'aQ76XZwpD5Q', url: 'https://youtu.be/aQ76XZwpD5Q' },
      { id: 'pha-pt-8', title: 'Part 8', youtubeId: 'Eb9l5XsGIvk', url: 'https://youtu.be/Eb9l5XsGIvk' }
    ]
  },

  // ==========================================
  // SEMESTER 2: GENERAL PATHOLOGY (year1-general-pathology)
  // ==========================================
  {
    id: 'yr1-path-questions-drive',
    title: 'درايف أسئلة الباثولوجي العام',
    titleEn: 'General Pathology Questions Drive',
    url: 'https://drive.google.com/drive/folders/1zGpVCHAqVYNBAvnNOxdWhLZKZ5YLTNm_',
    type: 'drive',
    category: 'exams',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    tags: ['pathology', 'drive', 'questions', 'باثولوجي', 'أسئلة']
  },
  {
    id: 'yr1-path-revision-telegram',
    title: 'مراجعة الباثولوجي العام - تليجرام الدفعة',
    titleEn: 'General Pathology Telegram Revision',
    url: 'https://t.me/bg_Groub_ASU/1415',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    tags: ['pathology', 'revision', 'telegram', 'باثولوجي', 'مراجعة']
  },
  {
    id: 'yr1-path-dr-khalifa-telegram',
    title: 'قناة د. عبد الرحمن خليفة باثولوجي',
    titleEn: 'Dr. Abdelrhman Khalifa Pathology Telegram Channel',
    url: 'https://t.me/+LVo_-ETszj1lYzNk',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Abdelrhman Khalifa',
    tags: ['pathology', 'khalifa', 'telegram', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-khalifa-playlist',
    title: 'شروحات الباثولوجي - د. عبد الرحمن خليفة',
    titleEn: 'Pathology Lectures Playlist - Dr. Abdelrhman Khalifa',
    url: 'https://www.youtube.com/playlist?list=PL0_tN0panMs_UfTwTgpNgjoYVwceQ-9g3',
    playlistId: 'PL0_tN0panMs_UfTwTgpNgjoYVwceQ-9g3',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Abdelrhman Khalifa',
    tags: ['pathology', 'khalifa', 'playlist', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-tarek-elshmy-whatsapp',
    title: 'جروب د. طارق الشامي باثولوجي (واتساب)',
    titleEn: 'Dr. Tarek El Shmy Pathology WhatsApp Group',
    url: 'https://chat.whatsapp.com/JHAYRO9EkrA1j2N2KOHV7s?mode=gi_t',
    type: 'whatsapp',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Tarek El Shmy',
    tags: ['pathology', 'elshmy', 'whatsapp', 'باثولوجي']
  },
  {
    id: 'yr1-path-pathobro-telegram',
    title: 'قناة Simplified Pathology (Pathology Bro)',
    titleEn: 'Simplified Pathology Telegram Channel',
    url: 'https://t.me/pathobro2026',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    tags: ['pathology', 'pathobro', 'telegram', 'باثولوجي']
  },
  {
    id: 'yr1-path-pathobro-whatsapp',
    title: 'جروب Simplified Pathology (واتساب)',
    titleEn: 'Simplified Pathology WhatsApp Group',
    url: 'https://chat.whatsapp.com/JgrdM4gUpla0QUfu2XCQQR?mode=gi_t',
    type: 'whatsapp',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    tags: ['pathology', 'pathobro', 'whatsapp', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-alaa-whatsapp',
    title: 'جروب د. علاء باثولوجي (واتساب)',
    titleEn: 'Dr. Alaa Pathology WhatsApp Group',
    url: 'https://chat.whatsapp.com/FzKR03atjSA8KzzxK1DNbQ',
    type: 'whatsapp',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Alaa',
    tags: ['pathology', 'alaa', 'whatsapp', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-alaa-telegram',
    title: 'قناة د. علاء باثولوجي (تليجرام)',
    titleEn: 'Dr. Alaa Pathology Telegram Channel',
    url: 'https://t.me/+kamNgxYHVutiZjVk',
    type: 'telegram',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Alaa',
    tags: ['pathology', 'alaa', 'telegram', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-eslam-elrdad-whatsapp',
    title: 'جروب د. إسلام الرداد باثولوجي (واتساب)',
    titleEn: 'Dr. Eslam El-Radad Pathology WhatsApp Group',
    url: 'https://chat.whatsapp.com/H9SINXlOaKGL4KSw2jL7ld?mode=gi_t',
    type: 'whatsapp',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Eslam El-Radad',
    tags: ['pathology', 'elradad', 'whatsapp', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-eslam-elrdad-intro-video',
    title: 'مدخل إلى الباثولوجي العام - د. إسلام الرداد',
    titleEn: 'Introduction to General Pathology - Dr. Eslam El-Radad',
    url: 'https://youtu.be/YE4HKyLpp2E?si=-KPCVktQ4RGBLtZh',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Eslam El-Radad',
    tags: ['pathology', 'elradad', 'intro', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-hegazy-whatsapp',
    title: 'جروب د. محمد حجازي باثولوجي (واتساب)',
    titleEn: 'Dr. Mohamed Hegazy Pathology WhatsApp Group',
    url: 'https://chat.whatsapp.com/JBPSkDp8ZN45y82mp71Ja1?mode=ems_copy_t',
    type: 'whatsapp',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Mohamed Hegazy',
    tags: ['pathology', 'hegazy', 'whatsapp', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-hegazy-cell-injury',
    title: 'كورس الباثو (Cell Injury / Cellular Adaptation) - د. حجازي',
    titleEn: 'Cellular Adaptation & Injury - Dr. Mohamed Hegazy',
    url: 'https://youtu.be/0NV6aboE9Rk',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Mohamed Hegazy',
    tags: ['pathology', 'hegazy', 'cell injury', 'باثولوجي'],
    videos: [
      { id: 'heg-pt-1', title: 'Adaptation 1 - Dr Hegazy', youtubeId: '0NV6aboE9Rk', url: 'https://youtu.be/0NV6aboE9Rk' },
      { id: 'heg-pt-2', title: 'Adaptation 2 - Dr Hegazy', youtubeId: 'ioFYaM9_NNo', url: 'https://youtu.be/ioFYaM9_NNo' }
    ]
  },
  {
    id: 'yr1-path-dr-sameh-ghazy-playlist',
    title: 'قائمة تشغيل الباثولوجي العام - د. سامح غازي',
    titleEn: 'General Pathology Course - Dr. Sameh Ghazy',
    url: 'https://youtube.com/playlist?list=PLQQQEJTMnU0-CZUGFWo-youiNjr2G2M4s',
    playlistId: 'PLQQQEJTMnU0-CZUGFWo-youiNjr2G2M4s',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Sameh Ghazy',
    tags: ['pathology', 'ghazy', 'playlist', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-eman-playlist',
    title: 'قائمة تشغيل الباثولوجي العام - د. إيمان',
    titleEn: 'General Pathology Course - Dr. Eman',
    url: 'https://www.youtube.com/playlist?list=PLHM_2KJJH34F80qUjlz50Q5e6xVLQXXzo',
    playlistId: 'PLHM_2KJJH34F80qUjlz50Q5e6xVLQXXzo',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Eman',
    tags: ['pathology', 'eman', 'playlist', 'باثولوجي']
  },
  {
    id: 'yr1-path-medical-club-playlist',
    title: 'قائمة تشغيل الباثولوجي العام - Medical Club',
    titleEn: 'General Pathology Course - Medical Club',
    url: 'https://youtube.com/playlist?list=PLDa0nQDFgbrAT1jezZilICSLCSwdptaAi',
    playlistId: 'PLDa0nQDFgbrAT1jezZilICSLCSwdptaAi',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    tags: ['pathology', 'medical club', 'playlist', 'باثولوجي']
  },
  {
    id: 'yr1-path-dr-shehab-general-patho',
    title: 'شرح الباثولوجي العام - د. شهاب',
    titleEn: 'General Pathology - Dr. Shehab',
    url: 'https://youtu.be/XBiaKqFwh1o?si=UOrYthfse5LuwiV-',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Dr. Shehab',
    tags: ['pathology', 'shehab', 'باثولوجي']
  },
  {
    id: 'yr1-path-cellular-adaptation-pathobro',
    title: 'شرح التكيف الخلوي Cellular Adaptation - باثولوجي برو',
    titleEn: 'Cellular Adaptation Pathology - Pathology Bro',
    url: 'https://youtu.be/rnypYYunw48',
    type: 'youtube',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    tags: ['pathology', 'adaptation', 'باثولوجي']
  },
  {
    id: 'yr1-path-iraqi-parts-series',
    title: 'سلسلة الباثولوجي العام (7 أجزاء) - د. العراقي',
    titleEn: 'General Pathology Parts Series (7 Parts) - Drs Iraqi ASU',
    url: 'https://youtu.be/skneRhh5q30',
    type: 'playlist',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-general-pathology',
    subject: 'Pathology',
    author: 'Drs Iraqi ASU',
    tags: ['pathology', 'tuberculosis', 'granuloma', 'iraqi', 'باثولوجي'],
    videos: [
      { id: 'path-pt-1', title: 'Part 1: Tuberculosis (granuloma)', youtubeId: 'skneRhh5q30', url: 'https://youtu.be/skneRhh5q30' },
      { id: 'path-pt-2', title: 'Part 2', youtubeId: 'kvGgC9qOr2E', url: 'https://youtu.be/kvGgC9qOr2E' },
      { id: 'path-pt-3', title: 'Part 3', youtubeId: 'QmlVe9o7Fow', url: 'https://youtu.be/QmlVe9o7Fow' },
      { id: 'path-pt-4', title: 'Part 4', youtubeId: 'dEafWt4uMVY', url: 'https://youtu.be/dEafWt4uMVY' },
      { id: 'path-pt-5', title: 'Part 5', youtubeId: '5lhWeg8s0Ag', url: 'https://youtu.be/5lhWeg8s0Ag' },
      { id: 'path-pt-6', title: 'Part 6', youtubeId: '4jxKaH0xVPk', url: 'https://youtu.be/4jxKaH0xVPk' },
      { id: 'path-pt-7', title: 'Part 7', youtubeId: 'nR-qiYYgwzE', url: 'https://youtu.be/nR-qiYYgwzE' }
    ]
  },

  // ==========================================
  // SEMESTER 2: GENERAL REVISIONS & DRIVES
  // ==========================================
  {
    id: 'yr1-sem2-all-resources-telegram',
    title: 'تجميعة مصادر الترم الثاني الشاملة - تليجرام',
    titleEn: 'Second Semester All Resources Telegram Post',
    url: 'https://t.me/bg_Groub_ASU/166',
    type: 'telegram',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['telegram', 'semester 2', 'resources', 'ترم ثاني']
  },
  {
    id: 'yr1-sem2-bls-revision-telegram',
    title: 'مراجعة دورة الإنعاش القلبي الأساسي (BLS)',
    titleEn: 'Basic Life Support (BLS) Telegram Revision',
    url: 'https://t.me/bg_Groub_ASU/1841',
    type: 'telegram',
    category: 'summaries',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['bls', 'revision', 'telegram', 'إنعاش']
  },
  {
    id: 'yr1-sem2-he-stream-video',
    title: 'تسجيل H&E ميكروسوفت ستريم',
    titleEn: 'H&E Microsoft Stream Video',
    url: 'https://web.microsoftstream.com/video/55ffa50f-d839-4145-b865-597c4d036972',
    type: 'website',
    category: 'lectures',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['stream', 'histology', 'h&e']
  },
  {
    id: 'yr1-sem2-dr-khadega-all-subjects-whatsapp',
    title: 'جروب د. خديجة السيد لجميع مواد الترم الثاني (واتساب)',
    titleEn: 'Dr. Khadega El-Sayed All Subjects WhatsApp Group',
    url: 'https://chat.whatsapp.com/JwiXnSoqCdrKNtIQUuazOL?mode=wwt',
    type: 'whatsapp',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    author: 'Dr. Khadega El-Sayed',
    tags: ['whatsapp', 'khadega', 'semester 2']
  },
  {
    id: 'yr1-sem2-study-with-simba-telegram',
    title: 'داتا فارما وبايو وانفكشن - Study with Simba',
    titleEn: 'Study with Simba Pharma, Bio & Infection Telegram Post',
    url: 'https://t.me/study_with_simba/1986',
    type: 'telegram',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-infection',
    tags: ['telegram', 'simba', 'data']
  },
  {
    id: 'yr1-sem2-drive-7pr',
    title: 'درايف مواد الترم الثاني (ASU Med Drive)',
    titleEn: 'Second Semester Medical Sciences Drive Folder',
    url: 'https://drive.google.com/drive/folders/17prN0KBgwZEmaMhfA1w8ir4j0SwaLmIY',
    type: 'drive',
    category: 'central',
    year: 1,
    semester: 2,
    moduleId: 'year1-locomotor',
    tags: ['drive', 'semester 2', 'درايف']
  }
];

async function run() {
  console.log('🔑 Authenticating with Google Cloud OAuth using Service Account...');
  const token = await getAdminAccessToken();
  console.log('✓ Successfully authenticated as Admin Service Account!\n');

  // Step 1: Write/Update Modules
  console.log('📦 Updating Modules in Cloud Firestore:');
  for (const mod of MODULES) {
    await writeFirestoreDoc(token, 'modules', mod.id, mod);
    console.log(`  ✓ Module '${mod.id}' [Semester: ${mod.semester}, Code: ${mod.code}] saved.`);
  }

  // Step 2: Fetch existing materials to check duplicates
  console.log('\n🔍 Reading existing study materials from Firestore...');
  const existingMaterials = await fetchAllDocs(token, 'materials');
  const existingMap = new Map();
  for (const m of existingMaterials) {
    if (m.url) {
      existingMap.set(materialUrlKey(m.url), m);
    }
  }
  console.log(`  Found ${existingMaterials.length} total materials in database.`);

  // Step 3: Insert / Update Materials
  console.log(`\n📚 Seeding ${MATERIALS_TO_ADD.length} first-year study materials...`);
  let addedCount = 0;
  let updatedCount = 0;

  for (const item of MATERIALS_TO_ADD) {
    const key = materialUrlKey(item.url);
    const existing = existingMap.get(key);

    const docId = existing ? existing.id : item.id;
    const payload = {
      ...item,
      id: docId,
      bookmarksCount: existing?.bookmarksCount ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      addedBy: 'Mazen Yasin',
      added_by_username: 'mazenyasin'
    };

    await writeFirestoreDoc(token, 'materials', docId, payload);
    if (existing) {
      updatedCount++;
      console.log(`  ↻ Updated [${docId}]: ${item.title}`);
    } else {
      addedCount++;
      existingMap.set(key, payload);
      console.log(`  + Added [${docId}]: ${item.title}`);
    }
  }

  // Step 4: Increment materials version to invalidate SSR and edge cache
  console.log('\n🔄 Incrementing materials version in Firestore...');
  const currentVersionDoc = await fetch(
    `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/materials_version/current`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  let nextVersion = 2;
  if (currentVersionDoc.ok) {
    const vData = await currentVersionDoc.json();
    const cur = parseInt(vData.fields?.version?.integerValue || '1', 10);
    nextVersion = cur + 1;
  }

  await writeFirestoreDoc(token, 'materials_version', 'current', {
    version: nextVersion,
    updatedAt: new Date().toISOString()
  });

  console.log(`✓ Materials version incremented to: ${nextVersion}`);

  console.log(`\n🎉 Success! Seeding finished cleanly:`);
  console.log(`   - Modules Configured: ${MODULES.length}`);
  console.log(`   - Materials Added: ${addedCount}`);
  console.log(`   - Materials Updated: ${updatedCount}`);
  console.log(`   - All Semester 2 modules & materials marked as semester: 2`);
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ Fatal error during seeding:', err);
  process.exit(1);
});
