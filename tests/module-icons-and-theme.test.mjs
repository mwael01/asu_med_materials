import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getModuleAppearance,
  MODULE_COLOR_PALETTE,
  AVAILABLE_MODULE_ICONS
} from '../src/utils/subjectAppearance.ts';
import { moduleConverter } from '../src/firebase/schema.ts';
import { getClientModules, getClientModuleById } from '../src/utils/catalogueClient.ts';

test('getModuleAppearance resolves explicit icons and dark mode colors', () => {
  const blood = getModuleAppearance({
    id: 'year2-blood',
    title: 'Blood & Lymphatic System',
    icon: 'droplet',
    color: 'red'
  });
  assert.equal(blood.icon, 'droplet');
  assert.equal(blood.colors, MODULE_COLOR_PALETTE.red);
  assert.match(blood.colors, /bg-red-950\/50/);
  assert.match(blood.colors, /text-red-300/);

  const intro = getModuleAppearance({
    id: 'year1-introduction',
    title: 'Introduction Module',
    icon: 'compass',
    color: 'indigo'
  });
  assert.equal(intro.icon, 'compass');
  assert.equal(intro.colors, MODULE_COLOR_PALETTE.indigo);
  assert.match(intro.colors, /bg-indigo-950\/50/);
  assert.match(intro.colors, /text-indigo-300/);
});

test('getModuleAppearance gracefully infers fallback icons and colors when fields are absent', () => {
  const bloodInferred = getModuleAppearance({
    id: 'year2-blood',
    title: 'Blood & Lymphatic System'
  });
  assert.equal(bloodInferred.icon, 'droplet');
  assert.equal(bloodInferred.colors, MODULE_COLOR_PALETTE.red);

  const pharmInferred = getModuleAppearance({
    id: 'year1-general-pharmacology',
    title: 'General Pharmacology'
  });
  assert.equal(pharmInferred.icon, 'pill');
  assert.equal(pharmInferred.colors, MODULE_COLOR_PALETTE.emerald);

  const unknown = getModuleAppearance({
    id: 'custom-module',
    title: 'Some Advanced System'
  });
  assert.equal(unknown.icon, 'book');
  assert.equal(unknown.colors, MODULE_COLOR_PALETTE.slate);
});

test('Dark mode color palette contains exclusively dark-mode-compatible classes for all colors', () => {
  const expectedColors = [
    'red', 'rose', 'orange', 'amber', 'emerald', 'teal', 'cyan',
    'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'lime', 'slate'
  ];

  for (const col of expectedColors) {
    const classStr = MODULE_COLOR_PALETTE[col];
    assert.ok(classStr, `Color ${col} must exist in MODULE_COLOR_PALETTE`);
    // All colors must have a dark background tint (950 or 800) and pastel text (300)
    assert.match(classStr, /bg-(?:[a-z]+-950\/(?:40|50)|slate-800\/60)/, `${col} must have dark background tint`);
    assert.match(classStr, /text-(?:[a-z]+-300|slate-300)/, `${col} must have soft pastel text color`);
  }
});

test('AVAILABLE_MODULE_ICONS includes newly added icons', () => {
  assert.ok(AVAILABLE_MODULE_ICONS.includes('droplet'));
  assert.ok(AVAILABLE_MODULE_ICONS.includes('compass'));
  assert.ok(AVAILABLE_MODULE_ICONS.includes('brain'));
  assert.ok(AVAILABLE_MODULE_ICONS.includes('activity'));
});

test('moduleConverter preserves icon and color across Firestore serialization', () => {
  const sampleModule = {
    id: 'year2-blood',
    code: 'MED201',
    title: 'Blood & Lymphatic System',
    titleAr: 'موديول الدم',
    year: 2,
    semester: 1,
    subjects: ['Anatomy', 'Physiology', 'Histology', 'Pathology'],
    description: 'Blood module',
    active: true,
    icon: 'droplet',
    color: 'red'
  };

  const firestoreData = moduleConverter.toFirestore(sampleModule);
  assert.equal(firestoreData.icon, 'droplet');
  assert.equal(firestoreData.color, 'red');

  const mockSnapshot = {
    id: sampleModule.id,
    data: () => firestoreData
  };

  const parsedModule = moduleConverter.fromFirestore(mockSnapshot);
  assert.equal(parsedModule.icon, 'droplet');
  assert.equal(parsedModule.color, 'red');
  assert.equal(parsedModule.id, sampleModule.id);
});

test('getClientModules and getClientModuleById resolve from memory and localStorage snapshot', async () => {
  const mockModules = [
    {
      id: 'year2-blood',
      code: 'MED201',
      title: 'Blood & Lymphatic System',
      year: 2,
      subjects: ['Pathology'],
      icon: 'droplet',
      color: 'red'
    },
    {
      id: 'year1-ict',
      code: 'MED102',
      title: 'ICT Module',
      year: 1,
      subjects: ['ICT'],
      icon: 'monitor',
      color: 'sky'
    }
  ];

  // Mock window & localStorage
  const storageMap = new Map();
  global.window = {
    __CACHED_MODULES: undefined,
    localStorage: {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, val) => storageMap.set(key, String(val))
    }
  };

  // Seed localStorage with fresh snapshot
  storageMap.set('asumed_modules_snapshot', JSON.stringify({
    timestamp: Date.now(),
    modules: mockModules
  }));

  const loaded = await getClientModules();
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].id, 'year2-blood');
  assert.equal(loaded[0].icon, 'droplet');
  assert.equal(loaded[0].color, 'red');
  assert.equal(global.window.__CACHED_MODULES?.length, 2);

  const bloodMod = await getClientModuleById('year2-blood');
  assert.ok(bloodMod);
  assert.equal(bloodMod?.code, 'MED201');
  assert.equal(bloodMod?.icon, 'droplet');

  const nonExistent = await getClientModuleById('unknown-mod');
  assert.equal(nonExistent, null);
});
