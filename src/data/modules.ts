import type { ModuleInfo } from '../types/materials';

export const modulesData: ModuleInfo[] = [
  // Year 1
  {
    id: 'year1-foundation',
    code: 'MED101',
    title: 'Foundation Module',
    titleAr: 'موديول التأسيس (Foundation)',
    year: 1,
    subjects: ['General Anatomy', 'Histology', 'General Physiology', 'Medical Biochemistry', 'Genetics'],
    description: 'Cell biology, basic genetics, medical terminology, and foundational sciences.',
    descriptionAr: 'بيولوجيا الخلية، الوراثة الطبية، المصطلحات الأساسية، ومبادئ العلوم الطبية.'
  },
  {
    id: 'year1-musculoskeletal',
    code: 'MED102',
    title: 'Musculoskeletal System (MSK)',
    titleAr: 'موديول الجهاز العضلي الحركي (MSK)',
    year: 1,
    subjects: ['Locomotor Anatomy', 'Bone Histology', 'Muscle Physiology', 'Bone Pathology'],
    description: 'Anatomy and biomechanics of limbs, joints, bones, and muscle physiology.',
    descriptionAr: 'تشريح الأطراف والعظام والمفاصل ووظائف العضلات والأنسجة الضامة.'
  },
  {
    id: 'year1-blood',
    code: 'MED103',
    title: 'Blood & Lymphatic System',
    titleAr: 'موديول الدم والجهاز الليمفاوي (Blood)',
    year: 1,
    subjects: ['Hematology', 'Histology', 'Immunology', 'Blood Pathology', 'Blood Banking'],
    description: 'Hemopoiesis, immunity, hemostasis, blood components, and lymphoid organs.',
    descriptionAr: 'تكوين الدم، المناعة، التجلط، فصائل الدم، وأمراض الدم الأساسية.'
  },
  {
    id: 'year1-cardiovascular',
    code: 'MED104',
    title: 'Cardiovascular System 1 (CVS)',
    titleAr: 'موديول القلب والأوعية الدموية 1 (CVS)',
    year: 1,
    subjects: ['Heart Anatomy', 'Hemodynamics', 'Cardiovascular Pathology', 'CVS Pharmacology'],
    description: 'Heart anatomy, circulatory hemodynamics, electrophysiology, and ECG basics.',
    descriptionAr: 'تشريح القلب والأوعية، ديناميكا الدورة الدموية، ومبادئ رسم القلب ECG.'
  },

  // Year 2
  {
    id: 'year2-respiratory',
    code: 'MED201',
    title: 'Respiratory System (RESP)',
    titleAr: 'موديول الجهاز التنفسي (Respiratory)',
    year: 2,
    subjects: ['Pulmonary Anatomy', 'Respiratory Physiology', 'Pulmonary Pathology', 'Microbiology'],
    description: 'Airways, lung mechanics, gas exchange, and respiratory tract infections.',
    descriptionAr: 'تشريح وميكانيكا الرئة، تبادل الغازات، وأمراض الصدر والجهاز التنفسي.'
  },
  {
    id: 'year2-gastrointestinal',
    code: 'MED202',
    title: 'Gastrointestinal & Nutrition (GIT)',
    titleAr: 'موديول الجهاز الهضمي والتغذية (GIT)',
    year: 2,
    subjects: ['GI Anatomy', 'Digestive Physiology', 'Hepatology', 'GI Parasitology', 'GI Pathology'],
    description: 'Alimentary canal, hepatobiliary system, digestion, and clinical nutrition.',
    descriptionAr: 'القناة الهضمية، الكبد والبنكرياس، وظائف الهضم، والتغذية الإكلينيكية.'
  },
  {
    id: 'year2-endocrine',
    code: 'MED203',
    title: 'Endocrine & Metabolism (ENDO)',
    titleAr: 'موديول الغدد الصماء والأيض (Endocrine)',
    year: 2,
    subjects: ['Endocrine Physiology', 'Hormonal Biochemistry', 'Endocrine Pathology', 'Pharmacology'],
    description: 'Pituitary, thyroid, adrenal, pancreas, diabetes, and metabolic disorders.',
    descriptionAr: 'هرمونات الغدد الصماء، الغدة الدرقية والكظرية، مرض السكري، واضطرابات الأيض.'
  },
  {
    id: 'year2-renal',
    code: 'MED204',
    title: 'Renal & Urinary System (RENAL)',
    titleAr: 'موديول الجهاز البولي والكلى (Renal)',
    year: 2,
    subjects: ['Kidney Anatomy', 'Nephron Physiology', 'Renal Pathology', 'Acid-Base Balance'],
    description: 'Renal clearance, electrolyte and fluid regulation, and nephropathies.',
    descriptionAr: 'تشريح الكلى، وظائف النفرون، توازن السوائل والأملاح، والحموضة والقلوية.'
  },

  // Year 3
  {
    id: 'year3-cns',
    code: 'MED301',
    title: 'Central Nervous System (CNS)',
    titleAr: 'موديول الجهاز العصبي المركزي (CNS)',
    year: 3,
    subjects: ['Neuroanatomy', 'Neurophysiology', 'Neuropathology', 'Neuropharmacology'],
    description: 'Brain, spinal cord, motor/sensory pathways, cranial nerves, and neurology.',
    descriptionAr: 'تشريح ووظائف المخ والحبل الشوكي، المسارات العصبية، والأعصاب القحفية.'
  },
  {
    id: 'year3-special-senses',
    code: 'MED302',
    title: 'Special Senses',
    titleAr: 'موديول الحواس الخاصة (Special Senses)',
    year: 3,
    subjects: ['Ophthalmic Anatomy', 'Auditory Physiology', 'ENT Pathology'],
    description: 'Visual pathways, hearing, balance, and sensory receptors.',
    descriptionAr: 'مسار الإبصار، حاسة السمع والاتزان، وتشريح العين والأذن.'
  },
  {
    id: 'year3-reproductive',
    code: 'MED303',
    title: 'Reproductive System (REPRO)',
    titleAr: 'موديول الجهاز التناسلي (Reproductive)',
    year: 3,
    subjects: ['Reproductive Anatomy', 'Embryology', 'Genital Pathology', 'Endocrinology'],
    description: 'Male & female reproductive systems, embryology, and fertility.',
    descriptionAr: 'تشريح وأمراض الجهاز التناسلي للذكور والإناث، وعلم الأجنة.'
  },
  {
    id: 'year3-multisystem',
    code: 'MED304',
    title: 'Multi-System & Dermatology',
    titleAr: 'موديول التكامل والجلدية (Multi-System)',
    year: 3,
    subjects: ['Dermatology', 'Systemic Pathology', 'Clinical Skills'],
    description: 'Skin diseases, multisystem clinical integration, and hospital prep.',
    descriptionAr: 'أمراض الجلدية، التكامل الإكلينيكي للأجهزة المتعددة، والتهيئة للمستشفى.'
  },

  // Year 4
  {
    id: 'year4-surgery',
    code: 'MED401',
    title: 'General Surgery',
    titleAr: 'الجراحة العامة (General Surgery)',
    year: 4,
    subjects: ['Abdominal Surgery', 'Vascular Surgery', 'Breast & Endocrine', 'Emergency & Trauma'],
    description: 'Surgical diagnosis, acute abdomen, trauma, and operative management.',
    descriptionAr: 'جراحة البطن، الأوعية الدموية، الطوارئ والحوادث، والفحص الإكلينيكي الجراحي.'
  },
  {
    id: 'year4-internal-medicine-1',
    code: 'MED402',
    title: 'Internal Medicine (Part 1)',
    titleAr: 'الباطنة العامة - الجزء الأول (Internal Medicine 1)',
    year: 4,
    subjects: ['Cardiology', 'Chest Diseases', 'Gastroenterology', 'Nephrology'],
    description: 'Cardiology, chest, hepatology, and adult clinical examination.',
    descriptionAr: 'أمراض القلب، الصدر، الجهاز الهضمي والكبد، والفحص السريري للباطنة.'
  },
  {
    id: 'year4-pediatrics',
    code: 'MED403',
    title: 'Pediatrics',
    titleAr: 'طب الأطفال (Pediatrics)',
    year: 4,
    subjects: ['Neonatology', 'Growth & Development', 'Pediatric Infections', 'Pediatric Nutrition'],
    description: 'Infant growth, nutrition, pediatric emergencies, and infections.',
    descriptionAr: 'حديثي الولادة، النمو والتطور، التغذية، وأمراض الأطفال الشائعة.'
  },
  {
    id: 'year4-community',
    code: 'MED404',
    title: 'Community & Occupational Medicine',
    titleAr: 'طب المجتمع والبيئة (Community Medicine)',
    year: 4,
    subjects: ['Epidemiology', 'Biostatistics', 'Public Health', 'Occupational Health'],
    description: 'Epidemiology, biostatistics, preventive medicine, and public health.',
    descriptionAr: 'الوبائيات، الإحصاء الحيوي، الصحة العامة، والطب الوقائي.'
  },

  // Year 5
  {
    id: 'year5-obgyn',
    code: 'MED501',
    title: 'Obstetrics & Gynecology (OB/GYN)',
    titleAr: 'النساء والتوليد (OB/GYN)',
    year: 5,
    subjects: ['Antenatal Care', 'Labor & Delivery', 'Gynecologic Oncology', 'Reproductive Endocrinology'],
    description: 'Antenatal care, labor management, gynecological surgery, and infertility.',
    descriptionAr: 'متابعة الحمل، الولادة، أمراض النساء الجراحية والأورام، وتأخر الإنجاب.'
  },
  {
    id: 'year5-internal-medicine-2',
    code: 'MED502',
    title: 'Internal Medicine (Part 2)',
    titleAr: 'الباطنة العامة والتخصصية 2 (Internal Medicine 2)',
    year: 5,
    subjects: ['Neurology', 'Rheumatology', 'Hematology & Oncology', 'Endocrinology & Diabetes'],
    description: 'Neurology, rheumatology, hematology, and systemic diseases.',
    descriptionAr: 'الأعصاب، الروماتيزم والمناعة، أمراض الدم والأورام، والغدد الصماء.'
  },
  {
    id: 'year5-specialized-surgery',
    code: 'MED503',
    title: 'Specialized Surgery',
    titleAr: 'الجراحات التخصصية (Specialized Surgery)',
    year: 5,
    subjects: ['Orthopedics', 'Ophthalmology', 'ENT', 'Neurosurgery', 'Urology'],
    description: 'Orthopedic surgery, ophthalmology, ENT, and urology.',
    descriptionAr: 'جراحة العظام، الرمد وجراحة العيون، الأنف والأذن والحنجرة، والمسالك.'
  },
  {
    id: 'year5-forensics',
    code: 'MED504',
    title: 'Forensic Medicine & Clinical Toxicology',
    titleAr: 'الطب الشرعي والسموم الإكلينيكية (Forensics & Tox)',
    year: 5,
    subjects: ['Medical Ethics', 'Legal Medicine', 'Poisoning & Overdose', 'Injury Identification'],
    description: 'Medical jurisprudence, post-mortem signs, and toxicology management.',
    descriptionAr: 'آداب المهنة، الإصابات والوفيات الجنائية، والتعامل مع حالات التسمم الحاد.'
  }
];

export function getModulesByYear(year: number): ModuleInfo[] {
  return modulesData.filter((m) => m.year === year);
}

export function getModuleById(id: string): ModuleInfo | undefined {
  return modulesData.find((m) => m.id === id);
}
