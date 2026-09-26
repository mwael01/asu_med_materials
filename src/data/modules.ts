import type { ModuleInfo } from '../types/materials';
import { referenceBooksMaterials } from './materials/reference/reference-books';

const getReferenceBookSubjects = (): string[] =>
  Array.from(
    new Set(
      referenceBooksMaterials
        .filter((item) => item.subject && /^year\d+-reference-books$/.test(item.moduleId ?? ''))
        .map((item) => item.subject as string)
    )
  );

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
  },
  {
    id: 'year1-reference-books',
    code: 'REF101',
    title: 'Reference Books',
    titleAr: 'الكتب المرجعية',
    year: 1,
    subjects: getReferenceBookSubjects(),
    description: 'Cross-subject medical reference books and standard textbooks used across anatomy, physiology, histology, pathology, and clinical study.',
    descriptionAr: 'كتب مرجعية طبية واسعة الاستخدام في التشريح، الفسيولوجيا، الأنسجة، الباثولوجي، والمواد السريرية.'
  },
  {
    id: 'year2-reference-books',
    code: 'REF201',
    title: 'Reference Books',
    titleAr: 'الكتب المرجعية',
    year: 2,
    subjects: getReferenceBookSubjects(),
    description: 'Cross-subject medical reference books and standard textbooks used across anatomy, physiology, histology, pathology, and clinical study.',
    descriptionAr: 'كتب مرجعية طبية واسعة الاستخدام في التشريح، الفسيولوجيا، الأنسجة، الباثولوجي، والمواد السريرية.'
  },
  {
    id: 'year3-reference-books',
    code: 'REF301',
    title: 'Reference Books',
    titleAr: 'الكتب المرجعية',
    year: 3,
    subjects: getReferenceBookSubjects(),
    description: 'Cross-subject medical reference books and standard textbooks used across anatomy, physiology, histology, pathology, and clinical study.',
    descriptionAr: 'كتب مرجعية طبية واسعة الاستخدام في التشريح، الفسيولوجيا، الأنسجة، الباثولوجي، والمواد السريرية.'
  },
  {
    id: 'year4-reference-books',
    code: 'REF401',
    title: 'Reference Books',
    titleAr: 'الكتب المرجعية',
    year: 4,
    subjects: getReferenceBookSubjects(),
    description: 'Cross-subject medical reference books and standard textbooks used across anatomy, physiology, histology, pathology, and clinical study.',
    descriptionAr: 'كتب مرجعية طبية واسعة الاستخدام في التشريح، الفسيولوجيا، الأنسجة، الباثولوجي، والمواد السريرية.'
  },
  {
    id: 'year5-reference-books',
    code: 'REF501',
    title: 'Reference Books',
    titleAr: 'الكتب المرجعية',
    year: 5,
    subjects: getReferenceBookSubjects(),
    description: 'Cross-subject medical reference books and standard textbooks used across anatomy, physiology, histology, pathology, and clinical study.',
    descriptionAr: 'كتب مرجعية طبية واسعة الاستخدام في التشريح، الفسيولوجيا، الأنسجة، الباثولوجي، والمواد السريرية.'
  }
];

export function getModulesByYear(year: number): ModuleInfo[] {
  return modulesData.filter((m) => m.year === year);
}

export function getModuleById(id: string): ModuleInfo | undefined {
  return modulesData.find((m) => m.id === id);
}
