import type { ModuleInfo } from '../types/materials';

export const modulesData: ModuleInfo[] = [
  // Year 2 - Blood & Lymphatic System
  {
    id: 'year2-blood',
    code: 'MED201',
    title: 'Blood & Lymphatic System',
    titleAr: 'موديول الدم والجهاز الليمفاوي (Blood)',
    year: 2,
    semester: 1,
    subjects: [
      'Anatomy',
      'Physiology',
      'Histology',
      'Biochemistry',
      'Pharmacology',
      'Pathology',
      'Parasitology',
      'Microbiology',
      'Clinical'
    ],
    description: 'Anatomy, physiology, histology, biochemistry, pharmacology, pathology, parasitology, microbiology, and clinical aspects of blood and lymphoid organs.',
    descriptionAr: 'تشريح، وظائف، هستولوجي، كيمياء حيوية، فارما، باثولوجي، طفيليات، ميكروبيولوجي، وعيادات أمراض الدم والنزف.'
  }
];

export function getModulesByYear(year: number): ModuleInfo[] {
  return modulesData.filter((m) => m.year === year);
}

export function getModuleById(id: string): ModuleInfo | undefined {
  return modulesData.find((m) => m.id === id);
}
