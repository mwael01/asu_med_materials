// src/i18n/materialsTranslations.ts

export interface MaterialTranslation {
  titleEn: string;
  titleAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
}

export const materialTranslations: Record<string, MaterialTranslation> = {
  // Central Drives & Batch Resources
  'bld-drive-semester3': {
    titleAr: 'درايف الترم الأول المركزي (Semester 3 Drive)',
    titleEn: 'Semester 3 Central Drive (Term 1)',
    descriptionAr: 'درايف الدفعة الرسمي الموحد لجميع مواد وسكاشن الترم الأول لسنة ثانية طب عين شمس.',
    descriptionEn: 'Unified official batch drive for all Year 2 Term 1 lectures, sections, and study materials at ASU Med.'
  },
  'bld-anki-s3': {
    titleAr: 'Anki Decks Semester 3 (بطاقات أنكي للاستذكار المتباعد)',
    titleEn: 'Semester 3 Anki Decks (Spaced Repetition)',
    descriptionAr: 'مجلد أنكي يضم بطاقات استذكار متباعد لكل موديولات الترم الأول (Blood و CVS).',
    descriptionEn: 'Anki folder containing spaced repetition flashcard decks for all Term 1 modules (Blood & CVS).'
  },
  'bld-daily-lectures-practical': {
    titleAr: 'الداتا اليومية للمحاضرات والسكاشن العملية (Day by Day)',
    titleEn: 'Daily Lectures & Practical Labs Data (Day by Day)',
    descriptionAr: 'درايف تفريغ الداتا اليومية ينزل عليه كل المحاضرات والسكاشن أولاً بأول.',
    descriptionEn: 'Daily updated drive containing recordings and files for daily lectures and practical sections.'
  },
  'bld-comprehensive-module-drive': {
    titleAr: 'درايف موديول Blood الشامل (MCQs، فورماتيف، وفاينل)',
    titleEn: 'Comprehensive Blood Module Drive (MCQs, Formatives & Finals)',
    descriptionAr: 'أشمل درايف لموديول الدم يضم بنوك الأسئلة، تفريغات د. شيرين، تجميعات الامتحانات السابقة، والمصادر الإكلينيكية.',
    descriptionEn: 'The most comprehensive Blood module drive containing question banks, Dr. Shireen notes, past exams, and clinical resources.'
  },
  'bld-year2-central-drives': {
    titleAr: 'درايفات سنة ثانية المركزية (Year 2 Central Drives)',
    titleEn: 'Year 2 Central Drives & Batch Resources',
    descriptionAr: 'مجلد شامل لدرايفات الدفعة المركزية، تجميعات موديولات سنة ثانية، وأرشيف السنوات السابقة.',
    descriptionEn: 'Comprehensive folder for central batch drives, Year 2 module archives, and past exam repositories.'
  },
  'bld-batch-lectures-drive': {
    titleAr: 'درايف محاضرات وسكاشن موديول Blood (تسجيلات وملفات PDF)',
    titleEn: 'Blood Module Lectures & Practical Labs Drive (Recordings & PDFs)',
    descriptionAr: 'درايف منظم يضم تسجيلات المحاضرات الرسمية، ملفات البوربوينت، وسكاشن العملي لموديول الدم.',
    descriptionEn: 'Organized drive containing official faculty lecture recordings, PowerPoint slides, and practical lab handouts.'
  },
  'bld-batch-lectures-telegram': {
    titleAr: 'قناة تليجرام محاضرات وسكاشن موديول Blood',
    titleEn: 'Blood Module Lectures & Labs Telegram Channel',
    descriptionAr: 'القناة الرسمية المخصصة لتنزيل تسجيلات وتفريغات موديول الدم يوماً بيوم.',
    descriptionEn: 'Official Telegram channel dedicated to posting daily Blood module recordings, notes, and handouts.'
  },
  'bld-bot-asumedzone': {
    titleAr: 'بوت ASU Med Zone (@ASUMedZonebot)',
    titleEn: 'ASU Med Zone Bot (@ASUMedZonebot)',
    descriptionAr: 'بوت تليجرام شامل يوفر وصولاً سريعاً لكل موديولات ودرايفات كلية طب عين شمس.',
    descriptionEn: 'Comprehensive Telegram bot providing instant access to all ASU Faculty of Medicine drives and modules.'
  },
  'bld-bot-asubooks': {
    titleAr: 'بوت ASU Books (@ASUbooksbot)',
    titleEn: 'ASU Books Bot (@ASUbooksbot)',
    descriptionAr: 'بوت تليجرام مخصص لتحميل الكتب الطبية والمراجع والمذكرات الورقية بصيغة PDF.',
    descriptionEn: 'Dedicated Telegram bot for downloading medical textbooks, references, and PDF notes.'
  },
  'bld-q-formatives-drive': {
    titleAr: 'درايف أرشيف امتحانات الفورماتيف (Formatives Archive Drive)',
    titleEn: 'Formative Exams Archive Drive',
    descriptionAr: 'أرشيف درايف شامل لامتحانات الفورماتيف والكويزات السابقة لموديول الدم لكل المواد.',
    descriptionEn: 'Comprehensive drive archive of previous formative exams and quizzes for all Blood module subjects.'
  },
  'bld-q-assessments-final-drive': {
    titleAr: 'درايف امتحانات الفاينل والتقييمات السابقة (Assessments & Finals)',
    titleEn: 'Final Exams & Assessments Archive Drive',
    descriptionAr: 'درايف مجمع لامتحانات التقييم السابقة والفاينل لموديول الدم مع نماذج الإجابات.',
    descriptionEn: 'Archive drive for previous module assessments and final exams with answer keys.'
  },

  // Question Banks (MCQ & Essay)
  'bld-q-phys-mcq': {
    titleAr: 'بنك أسئلة MCQs فسيولوجي الدم (Physiology MCQs)',
    titleEn: 'Blood Physiology MCQs Bank',
    descriptionAr: 'تجميعة أسئلة اختيار من متعدد MCQs لمادة الفسيولوجي مع الإجابات والشرح.',
    descriptionEn: 'Collection of MCQ questions for Blood Physiology with answer keys and explanations.'
  },
  'bld-q-phys-essay': {
    titleAr: 'بنك الأسئلة المقالية فسيولوجي الدم (Physiology Essay)',
    titleEn: 'Blood Physiology Essay Questions Bank',
    descriptionAr: 'أهم الأسئلة المقالية المتكررة في امتحانات فسيولوجي الدم مع الإجابات النموذجية.',
    descriptionEn: 'Most frequent essay questions in Blood Physiology exams with model answers.'
  },
  'bld-q-biochem-mcq': {
    titleAr: 'بنك أسئلة MCQs كيمياء حيوية الدم (Biochemistry MCQs)',
    titleEn: 'Blood Biochemistry MCQs Bank',
    descriptionAr: 'بنك أسئلة اختيار من متعدد لموضوعات الكيمياء الحيوية (Heme synthesis, Iron metabolism, Jaundice, etc.).',
    descriptionEn: 'MCQs bank covering Blood Biochemistry topics (Heme synthesis, Iron metabolism, Jaundice, etc.).'
  },
  'bld-q-biochem-essay': {
    titleAr: 'بنك الأسئلة المقالية بايوكيمستري الدم (Biochemistry Essay)',
    titleEn: 'Blood Biochemistry Essay Questions Bank',
    descriptionAr: 'تجميعة الأسئلة المقالية المتوقعة في كيمياء حيوية موديول الدم.',
    descriptionEn: 'Collection of high-yield essay questions for Blood Biochemistry.'
  },
  'bld-q-histo-mcq': {
    titleAr: 'بنك أسئلة MCQs هستولوجي الدم (Histology MCQs)',
    titleEn: 'Blood Histology MCQs Bank',
    descriptionAr: 'أسئلة MCQs معتمدة لهستولوجي الدم والأعضاء الليمفاوية والـ Bone marrow.',
    descriptionEn: 'Verified MCQs for Blood, Lymphoid organs, and Bone marrow histology.'
  },
  'bld-q-histo-essay': {
    titleAr: 'بنك الأسئلة المقالية هستولوجي الدم (Histology Essay)',
    titleEn: 'Blood Histology Essay Questions Bank',
    descriptionAr: 'الأسئلة المقالية المقررة في هستولوجي الدم والأعضاء الليمفاوية.',
    descriptionEn: 'High-yield essay questions for Blood and Lymphoid histology.'
  },
  'bld-q-pharma-mcq': {
    titleAr: 'بنك أسئلة MCQs فارماكولوجي الدم (Pharmacology MCQs)',
    titleEn: 'Blood Pharmacology MCQs Bank',
    descriptionAr: 'بنك أسئلة شامل لأدوية علاج الأنيميا ومضادات التجلط ومذيبات الجلطات.',
    descriptionEn: 'Comprehensive MCQs bank for Anemia drugs, Anticoagulants, and Thrombolytics.'
  },
  'bld-q-pharma-essay': {
    titleAr: 'بنك الأسئلة المقالية فارما الدم (Pharmacology Essay)',
    titleEn: 'Blood Pharmacology Essay Questions Bank',
    descriptionAr: 'أهم الأسئلة المقالية ومقارنات أدوية فارما الدم (Anticoagulants, Antiplatelets, Iron).',
    descriptionEn: 'Key essay questions and drug comparisons for Blood Pharmacology.'
  },
  'bld-q-patho-mcq': {
    titleAr: 'بنك أسئلة MCQs باثولوجي الدم (Pathology MCQs)',
    titleEn: 'Blood Pathology MCQs Bank',
    descriptionAr: 'أسئلة MCQs شاملة لكل أنواع الأنيميا وأورام الدم (Leukemias & Lymphomas) والنزيف.',
    descriptionEn: 'Comprehensive MCQs covering Anemias, Leukemias, Lymphomas, and Bleeding disorders.'
  },
  'bld-q-patho-essay': {
    titleAr: 'بنك الأسئلة المقالية باثولوجي الدم (Pathology Essay)',
    titleEn: 'Blood Pathology Essay Questions Bank',
    descriptionAr: 'أسئلة مقالية هامة في باثولوجي الدم وجداول المقارنات.',
    descriptionEn: 'High-yield essay questions and comparison tables for Blood Pathology.'
  },
  'bld-q-para-mcq': {
    titleAr: 'بنك أسئلة MCQs طفيليات الدم (Parasitology MCQs)',
    titleEn: 'Blood Parasitology MCQs Bank',
    descriptionAr: 'أسئلة MCQs لطفيليات الدم (Malaria, Leishmania, Trypanosoma, Filariasis, Toxoplasma).',
    descriptionEn: 'MCQs for blood parasites (Malaria, Leishmania, Trypanosoma, Filariasis, Toxoplasma).'
  },
  'bld-q-para-essay': {
    titleAr: 'بنك الأسئلة المقالية باراسيتولوجي الدم (Parasitology Essay)',
    titleEn: 'Blood Parasitology Essay Questions Bank',
    descriptionAr: 'الأسئلة المقالية المقررة لدورات حياة وتشخيص وعلاج طفيليات الدم والأنسجة.',
    descriptionEn: 'Essay questions covering life cycles, diagnosis, and treatment of blood parasites.'
  },
  'bld-q-micro-mcq': {
    titleAr: 'بنك أسئلة MCQs ميكروبيولوجي الدم (Microbiology MCQs)',
    titleEn: 'Blood Microbiology MCQs Bank',
    descriptionAr: 'أسئلة اختيار من متعدد للمناعة وفيروسات وبكتيريا الدم.',
    descriptionEn: 'MCQs for Immunology, viral, and bacterial infections of the blood.'
  },
  'bld-q-micro-essay': {
    titleAr: 'بنك الأسئلة المقالية ميكروبيولوجي الدم (Microbiology Essay)',
    titleEn: 'Blood Microbiology Essay Questions Bank',
    descriptionAr: 'تجميعة الأسئلة المقالية لميكروبيولوجيا الدم وموضوعات المناعة.',
    descriptionEn: 'Collection of essay questions for Blood Microbiology and Immunology.'
  },

  // Official Faculty & Moodle Materials
  'bld-anat-moodle-p1': {
    titleAr: 'تشريح الدم - Moodle الرسمي (Part 1)',
    titleEn: 'Blood Anatomy - Official Moodle (Part 1)',
    descriptionAr: 'ملفات وعروض التشريح الرسمية المرفوعة على منصة مودل كلية طب عين شمس (الجزء الأول).',
    descriptionEn: 'Official anatomy files and presentations uploaded to ASU Med Moodle platform (Part 1).'
  },
  'bld-anat-moodle-p2': {
    titleAr: 'تشريح الدم - Moodle الرسمي (Part 2)',
    titleEn: 'Blood Anatomy - Official Moodle (Part 2)',
    descriptionAr: 'ملفات وعروض التشريح الرسمية على منصة مودل (الجزء الثاني).',
    descriptionEn: 'Official anatomy files and presentations on ASU Med Moodle platform (Part 2).'
  },
  'bld-anat-moodle-p3': {
    titleAr: 'تشريح الدم - Moodle الرسمي (Part 3)',
    titleEn: 'Blood Anatomy - Official Moodle (Part 3)',
    descriptionAr: 'عروض وتشريح الطحال والجهاز الليمفاوي الرسمية على منصة مودل (الجزء الثالث).',
    descriptionEn: 'Official anatomy presentations for spleen and lymphatics on ASU Med Moodle (Part 3).'
  },
  'bld-histo-moodle-p2': {
    titleAr: 'هستولوجي الدم - ASU Moodle (Part 2)',
    titleEn: 'Blood Histology - ASU Moodle (Part 2)',
    descriptionAr: 'محاضرات وعروض شرائح الهستولوجي الرسمية على منصة مودل (Part 2).',
    descriptionEn: 'Official histology lecture slides on ASU Med Moodle (Part 2).'
  },
  'bld-histo-moodle-p3': {
    titleAr: 'هستولوجي الدم - ASU Moodle (Part 3)',
    titleEn: 'Blood Histology - ASU Moodle (Part 3)',
    descriptionAr: 'محاضرات وعروض شرائح الهستولوجي الرسمية على منصة مودل (Part 3).',
    descriptionEn: 'Official histology lecture slides on ASU Med Moodle (Part 3).'
  },
  'bld-histo-moodle-p4': {
    titleAr: 'هستولوجي الدم - ASU Moodle (Part 4)',
    titleEn: 'Blood Histology - ASU Moodle (Part 4)',
    descriptionAr: 'محاضرات وعروض شرائح الهستولوجي الرسمية على منصة مودل (Part 4).',
    descriptionEn: 'Official histology lecture slides on ASU Med Moodle (Part 4).'
  },
  'bld-histo-moodle-p5': {
    titleAr: 'هستولوجي الدم - ASU Moodle (Part 5)',
    titleEn: 'Blood Histology - ASU Moodle (Part 5)',
    descriptionAr: 'محاضرات وعروض شرائح الهستولوجي الرسمية على منصة مودل (Part 5).',
    descriptionEn: 'Official histology lecture slides on ASU Med Moodle (Part 5).'
  },
  'bld-biochem-college-recordings-dropbox': {
    titleAr: 'تسجيلات الكلية النظرية - كيمياء حيوية الدم (Biochemistry Dropbox)',
    titleEn: 'Faculty Theoretical Lectures - Blood Biochemistry (Dropbox)',
    descriptionAr: 'مجلد دروب بوكس يضم تسجيلات محاضرات الكلية النظرية المعتمدة لمادة الكيمياء الحيوية.',
    descriptionEn: 'Dropbox folder containing official faculty theoretical lecture recordings for Biochemistry.'
  },
  'bld-para-college-recordings-dropbox': {
    titleAr: 'تسجيلات الكلية النظرية - طفيليات الدم (Parasitology Dropbox)',
    titleEn: 'Faculty Theoretical Lectures - Blood Parasitology (Dropbox)',
    descriptionAr: 'مجلد دروب بوكس يضم تسجيلات محاضرات الكلية الرسمية لمادة الباراسيتولوجي لموديول الدم.',
    descriptionEn: 'Dropbox folder containing official faculty lecture recordings for Blood Parasitology.'
  },

  // Lectures, Playlists & Clinical Topics
  'bld-youtube-rahma-ayman': {
    titleAr: 'قناة د. رحمة أيمن - شروحات موديول Blood',
    titleEn: 'Dr. Rahma Ayman Channel - Blood Module Lectures',
    descriptionAr: 'قناة يوتيوب تضم شروحات مبسطة لموضوعات موديول الدم.',
    descriptionEn: 'YouTube channel offering simplified lectures for Blood module topics.'
  },
  'bld-anat-wahdan': {
    titleAr: 'شرح تشريح موديول Blood - د. وهدان (Dr. Wahdan)',
    titleEn: 'Blood Anatomy Lectures - Dr. Wahdan',
    descriptionAr: 'شرح تفصيلي لتشريح الطحال والأوعية الليمفاوية في الصدر والأطراف بواسطة د. وهدان.',
    descriptionEn: 'Detailed anatomical lectures for Spleen and body lymphatic drainage by Dr. Wahdan.'
  },
  'sameh-p1': {
    titleAr: 'تشريح الدم - سامح (الجزء 1)',
    titleEn: 'Blood Anatomy - Sameh (Part 1)',
    descriptionAr: 'شرح تشريح موديول الدم بواسطة سامح.',
    descriptionEn: 'Blood module anatomy lectures by Sameh.'
  },
  'adel-p1': {
    titleAr: 'تشريح Thoracic Duct & Thymus - د. محمد عادل',
    titleEn: 'Anatomy of Thoracic Duct & Thymus - Dr. Mohamed Adel',
    descriptionAr: 'شرح تفصيلي لتشريح القناة الصدرية والغدة الصعترية.',
    descriptionEn: 'Detailed anatomical lecture for the Thoracic Duct and Thymus gland.'
  },
  'wageh-p1': {
    titleAr: 'تشريح الدم - وجيه (الجزء 1)',
    titleEn: 'Blood Anatomy - Wageh (Part 1)',
    descriptionAr: 'شروحات تشريح موديول الدم بواسطة وجيه.',
    descriptionEn: 'Blood module anatomy explanations by Wageh.'
  },
  'bld-phys-nagi': {
    titleAr: 'فسيولوجي الدم - د. ناجي (Dr. Nagi)',
    titleEn: 'Blood Physiology - Dr. Nagi',
    descriptionAr: 'شرح كورس فسيولوجي الدم كاملاً من أشهر وأفضل شروحات الفسيولوجي للدكتور ناجي.',
    descriptionEn: 'Complete Blood Physiology course lectures by Dr. Nagi.'
  },
  'bld-lec-w1d2-physio': {
    titleAr: 'محاضرة فسيولوجي الدم (الأسبوع 1 - اليوم 2)',
    titleEn: 'Blood Physiology Lecture (Week 1 - Day 2)',
    descriptionAr: 'تسجيل محاضرة الفسيولوجي للأسبوع الأول من موديول الدم.',
    descriptionEn: 'Recording of Week 1 Day 2 Physiology lecture for the Blood module.'
  },
  'bld-histo-faten': {
    titleAr: 'هستولوجي الدم - د. فاتن (Dr. Faten)',
    titleEn: 'Blood Histology - Dr. Faten',
    descriptionAr: 'شرح هستولوجي خلايا الدم والأعضاء الليمفاوية د. فاتن.',
    descriptionEn: 'Histology lectures for blood cells and lymphoid organs by Dr. Faten.'
  },
  'PLlzicty9XavE7Ul7ogZHDUxjlkU-hs1nw-1': {
    titleAr: 'شرح هستولوجي RBCs',
    titleEn: 'RBCs Histology Lecture',
    descriptionAr: 'محاضرة مخصصة لتركيب وهستولوجيا كرات الدم الحمراء.',
    descriptionEn: 'Dedicated lecture on the structure and histology of red blood cells (RBCs).'
  },
  'bld-histo-eman-nabil': {
    titleAr: 'هستولوجي الدم - د. إيمان نبيل (Dr. Eman Nabil)',
    titleEn: 'Blood Histology - Dr. Eman Nabil',
    descriptionAr: 'شرح منهج هستولوجي الدم والأعضاء الليمفاوية بالكامل بواسطة د. إيمان نبيل.',
    descriptionEn: 'Complete Blood & Lymphoid Histology lectures by Dr. Eman Nabil.'
  },
  'bld-histo-shireen-blood': {
    titleAr: 'مراجعة هستولوجي الدم (2.5 ساعة) - د. شيرين',
    titleEn: 'Blood Histology Revision (2.5 hrs) - Dr. Shireen',
    descriptionAr: 'مراجعة مكثفة سريعة وشاملة لكل موضوعات هستولوجي الدم في جلستين.',
    descriptionEn: 'Intensive high-yield revision for all Blood Histology topics in 2 sessions.'
  },
  'bld-biochem-esawi': {
    titleAr: 'كيمياء حيوية الدم - د. عيسوي (Dr. Esawi)',
    titleEn: 'Blood Biochemistry - Dr. Esawi',
    descriptionAr: 'شرح كيمياء حيوية موديول الدم بالكامل د. عيسوي.',
    descriptionEn: 'Complete Blood Biochemistry lecture series by Dr. Esawi.'
  },
  'bld-biochem-walaa-1': {
    titleAr: 'كيمياء حيوية الدم - د. ولاء (الجزء الأول)',
    titleEn: 'Blood Biochemistry - Dr. Walaa (Part 1)',
    descriptionAr: 'شرح منهج كيمياء حيوية الدم الجزء الأول د. ولاء.',
    descriptionEn: 'Blood Biochemistry curriculum lectures Part 1 by Dr. Walaa.'
  },
  'bld-biochem-walaa-2': {
    titleAr: 'كيمياء حيوية الدم - د. ولاء (الجزء الثاني)',
    titleEn: 'Blood Biochemistry - Dr. Walaa (Part 2)',
    descriptionAr: 'شرح منهج كيمياء حيوية الدم الجزء الثاني د. ولاء.',
    descriptionEn: 'Blood Biochemistry curriculum lectures Part 2 by Dr. Walaa.'
  },
  'bld-biochem-mohammed': {
    titleAr: 'كيمياء حيوية الدم - د. محمد (5 أجزاء)',
    titleEn: 'Blood Biochemistry - Dr. Mohamed (5 Parts)',
    descriptionAr: 'سلسلة 5 أجزاء لشرح كيمياء حيوية موديول الدم بواسطة د. محمد.',
    descriptionEn: '5-part lecture series explaining Blood Biochemistry by Dr. Mohamed.'
  },
  'bld-biochem-marwa': {
    titleAr: 'كيمياء حيوية الدم ومراجعات - د. مروة حمدي',
    titleEn: 'Blood Biochemistry & Revisions - Dr. Marwa Hamdy',
    descriptionAr: 'شروحات وتسجيلات ومراجعات كيمياء حيوية الدم د. مروة حمدي.',
    descriptionEn: 'Blood Biochemistry lectures and revision sessions by Dr. Marwa Hamdy.'
  },
  'bld-biochem-marwa-telegram-series': {
    titleAr: 'تسجيلات وشروحات بايوكيمستري الدم - د. مروة حمدي (Medical Team Telegram)',
    titleEn: 'Blood Biochemistry Recordings - Dr. Marwa Hamdy (Telegram)',
    descriptionAr: 'سلسلة التسجيلات الصوتية لشرح موضوعات بايوكيمستري الدم.',
    descriptionEn: 'Audio recordings series explaining Blood Biochemistry topics.'
  },
  'bld-biochem-marwa-heme-synthesis-tg': {
    titleAr: 'تسجيل Heme synthesis - بايو الدم - د. مروة حمدي',
    titleEn: 'Heme Synthesis Audio Recording - Blood Biochem - Dr. Marwa Hamdy',
    descriptionAr: 'تسجيل صوتي يشرح خطوات وأنزيمات تصنيع الهيم وتنظيمه.',
    descriptionEn: 'Audio lecture explaining steps, enzymes, and regulation of Heme synthesis.'
  },
  'bld-biochem-marwa-iron-metabolism-tg': {
    titleAr: 'تسجيل Iron metabolism - بايو الدم - د. مروة حمدي',
    titleEn: 'Iron Metabolism Audio Recording - Blood Biochem - Dr. Marwa Hamdy',
    descriptionAr: 'تسجيل صوتي يشرح امتصاص ونقل وتخزين الحديد واضطراباته.',
    descriptionEn: 'Audio lecture explaining iron absorption, transport, storage, and disorders.'
  },
  'bld-biochem-marwa-hmp-tg': {
    titleAr: 'تسجيل مسار HMP pathway - بايو الدم - د. مروة حمدي',
    titleEn: 'HMP Pathway Audio Recording - Blood Biochem - Dr. Marwa Hamdy',
    descriptionAr: 'تسجيل صوتي لمسار البنتوز فوسفات وأهميته لكرات الدم الحمراء وإنزيم G6PD.',
    descriptionEn: 'Audio lecture on Pentose Phosphate Pathway, RBC importance, and G6PD.'
  },
  'bld-biochem-marwa-glycolysis-tg': {
    titleAr: 'تسجيل Glycolysis - بايو الدم - د. مروة حمدي',
    titleEn: 'Glycolysis Audio Recording - Blood Biochem - Dr. Marwa Hamdy',
    descriptionAr: 'تسجيل صوتي لتحلل الجلوكوز وإنتاج الطاقة في كرات الدم الحمراء مسار Rapoport-Luebering.',
    descriptionEn: 'Audio lecture on RBC glycolysis, energy production, and the Rapoport-Luebering shunt.'
  },
  'bld-biochem-marwa-folic-b12-tg': {
    titleAr: 'تسجيل Folic acid & Vit B12 - بايو الدم - د. مروة حمدي',
    titleEn: 'Folic Acid & Vit B12 Recording - Blood Biochem - Dr. Marwa Hamdy',
    descriptionAr: 'تسجيل صوتي لدور حمض الفوليك وفيتامين ب12 في تصنيع الدم والأنيميا الخبيثة.',
    descriptionEn: 'Audio recording on Folic acid and Vitamin B12 in hematopoiesis and megaloblastic anemia.'
  },
  'bld-biochem-marwa-wbcs-tg': {
    titleAr: 'تسجيل WBCs metabolism - بايو الدم - د. مروة حمدي',
    titleEn: 'WBCs Metabolism Recording - Blood Biochem - Dr. Marwa Hamdy',
    descriptionAr: 'تسجيل صوتي لأيض كرات الدم البيضاء والبلعمة والـ Respiratory burst.',
    descriptionEn: 'Audio recording on white blood cell metabolism, phagocytosis, and the respiratory burst.'
  },
  'bld-biochem-marwa-telegram-revision': {
    titleAr: 'تسجيلات مراجعة بايوكيمستري الدم (تليجرام) - د. مروة حمدي',
    titleEn: 'Blood Biochemistry Revision Recordings - Dr. Marwa Hamdy',
    descriptionAr: 'تسجيلات المراجعة النهائية لكيمياء حيوية موديول الدم.',
    descriptionEn: 'Final revision audio recordings for Blood Biochemistry.'
  },
  'bld-lec-w1d2-bio-1': {
    titleAr: 'محاضرة بايوكيمستري 1 (الأسبوع 1 - اليوم 2)',
    titleEn: 'Biochemistry Lecture 1 (Week 1 - Day 2)',
    descriptionAr: 'تسجيل محاضرة الكيمياء الحيوية الأولى للأسبوع الأول.',
    descriptionEn: 'Recording of Week 1 Day 2 Biochemistry lecture 1.'
  },
  'bld-lec-w1d2-bio-2': {
    titleAr: 'محاضرة بايوكيمستري 2 (الأسبوع 1 - اليوم 2)',
    titleEn: 'Biochemistry Lecture 2 (Week 1 - Day 2)',
    descriptionAr: 'تسجيل محاضرة الكيمياء الحيوية الثانية للأسبوع الأول.',
    descriptionEn: 'Recording of Week 1 Day 2 Biochemistry lecture 2.'
  },
  'bld-pharma-nour-eldin': {
    titleAr: 'فارماكولوجي الدم - د. أحمد نور الدين',
    titleEn: 'Blood Pharmacology - Dr. Ahmed Nour Eldin',
    descriptionAr: 'شرح كامل لمنهج فارماكولوجي الدم من د. أحمد نور الدين.',
    descriptionEn: 'Complete Blood Pharmacology course lectures by Dr. Ahmed Nour Eldin.'
  },
  'bld-pharma-fouda': {
    titleAr: 'فارماكولوجي الدم المكثف (4 ساعات) - د. عبد المتعال فودة',
    titleEn: 'Crash Course Blood Pharmacology (4 hrs) - Dr. Abdelmotaal Fouda',
    descriptionAr: 'كورس مركز ومكثف 4 ساعات لفارماكولوجي الدم من د. عبد المتعال فودة.',
    descriptionEn: 'Intensive 4-hour crash course for Blood Pharmacology by Dr. Abdelmotaal Fouda.'
  },
  'bld-pharma-tah': {
    titleAr: 'فارماكولوجي الدم (4.5 ساعات) - د. تاح',
    titleEn: 'Blood Pharmacology (4.5 hrs) - Dr. Tah',
    descriptionAr: 'كورس مجمع لفارماكولوجي الدم 4.5 ساعات للدكتور تاح.',
    descriptionEn: 'Comprehensive 4.5-hour Blood Pharmacology course by Dr. Tah.'
  },
  'bld-pharma-abdelrahman': {
    titleAr: 'فارماكولوجي الدم (6 ساعات) - د. أحمد عبد الرحمن',
    titleEn: 'Blood Pharmacology (6 hrs) - Dr. Ahmed Abdelrahman',
    descriptionAr: 'كورس شامل ومفصل 6 ساعات لفارماكولوجي الدم للدكتور أحمد عبد الرحمن.',
    descriptionEn: 'Detailed 6-hour Blood Pharmacology course by Dr. Ahmed Abdelrahman.'
  },
  'bld-pharma-shaer': {
    titleAr: 'فارماكولوجي الدم - د. الشاعر',
    titleEn: 'Blood Pharmacology - Dr. El-Shaer',
    descriptionAr: 'شرح فارما الدم بواسطة د. الشاعر.',
    descriptionEn: 'Blood Pharmacology lectures by Dr. El-Shaer.'
  },
  'bld-pharma-drug-list': {
    titleAr: 'قائمة وتفريغ أدوية الدم المعتمدة (Pharma Drug List)',
    titleEn: 'Approved Blood Pharmacology Drug List & Summary',
    descriptionAr: 'جدول ملخص لكل أدوية موديول الدم والجرعات وموانع الاستعمال.',
    descriptionEn: 'Summary table of all Blood module drugs, mechanisms, indications, and contraindications.'
  },
  'bld-pharma-shorbagy-lec01': {
    titleAr: 'فارماكولوجي الدم - د. الشوربجي (المحاضرة الأولى: علاج أنيميا نقص الحديد)',
    titleEn: 'Blood Pharmacology - Dr. El-Shorbagy (Lec 1: Iron Deficiency Anemia)',
    descriptionAr: 'المحاضرة الأولى لفارما الدم عن مستحضرات الحديد وعلاج الأنيميا.',
    descriptionEn: 'First pharmacology lecture on iron preparations and treatment of anemia.'
  },
  'bld-patho-nemer': {
    titleAr: 'باثولوجي الدم المركز (ساعتان) - د. أحمد النمر',
    titleEn: 'Intensive Blood Pathology (2 hrs) - Dr. Ahmed El-Nemer',
    descriptionAr: 'مراجعة مركزة وسريعة لباثولوجي الدم في ساعتين فقط د. أحمد النمر.',
    descriptionEn: 'Fast-track 2-hour intensive Blood Pathology revision by Dr. Ahmed El-Nemer.'
  },
  'bld-patho-ghazy': {
    titleAr: 'باثولوجي الدم (4 ساعات) - د. سامح غازي',
    titleEn: 'Blood Pathology (4 hrs) - Dr. Sameh Ghazy',
    descriptionAr: 'شرح مجمع لباثولوجي موديول الدم 4 ساعات بواسطة د. سامح غازي.',
    descriptionEn: '4-hour Blood Pathology lecture series by Dr. Sameh Ghazy.'
  },
  'bld-patho-khalifa': {
    titleAr: 'باثولوجي الدم المفصل (5.5 ساعات) - د. عبد الرحمن خليفة',
    titleEn: 'Detailed Blood Pathology (5.5 hrs) - Dr. Abdelrahman Khalifa',
    descriptionAr: 'شرح مفصل وممنهج 5.5 ساعات لباثولوجي الدم للدكتور عبد الرحمن خليفة.',
    descriptionEn: 'Comprehensive 5.5-hour Blood Pathology lectures by Dr. Abdelrahman Khalifa.'
  },
  'bld-patho-sharkawy': {
    titleAr: 'باثولوجي الدم - د. خالد الشرقاوي',
    titleEn: 'Blood Pathology - Dr. Khaled El-Sharkawy',
    descriptionAr: 'شرح باثولوجي موديول الدم د. خالد الشرقاوي.',
    descriptionEn: 'Blood Pathology course lectures by Dr. Khaled El-Sharkawy.'
  },
  'bld-para-madbouly': {
    titleAr: 'طفيليات الدم (5 ساعات) - د. نهى مدبولي',
    titleEn: 'Blood Parasitology (5 hrs) - Dr. Noha Madbouly',
    descriptionAr: 'شرح منهج باراسيتولوجي الدم بالكامل 5 ساعات للدكتورة نهى مدبولي.',
    descriptionEn: 'Complete 5-hour Blood Parasitology course by Dr. Noha Madbouly.'
  },
  'bld-para-tokhy': {
    titleAr: 'طفيليات الدم (5.5 ساعات) - د. الطوخي',
    titleEn: 'Blood Parasitology (5.5 hrs) - Dr. El-Tokhy',
    descriptionAr: 'شرح منهج طفيليات الدم 5.5 ساعات للدكتور الطوخي.',
    descriptionEn: 'Complete 5.5-hour Blood Parasitology lectures by Dr. El-Tokhy.'
  },
  'bld-para-habib': {
    titleAr: 'طفيليات الدم - د. خالد حبيب',
    titleEn: 'Blood Parasitology - Dr. Khaled Habib',
    descriptionAr: 'شرح طفيليات الدم بواسطة د. خالد حبيب.',
    descriptionEn: 'Blood Parasitology course lectures by Dr. Khaled Habib.'
  },
  'bld-para-ayman-ibrahim': {
    titleAr: 'طفيليات الدم - د. أيمن إبراهيم',
    titleEn: 'Blood Parasitology - Dr. Ayman Ibrahim',
    descriptionAr: 'شروحات طفيليات موديول الدم للدكتور أيمن إبراهيم.',
    descriptionEn: 'Blood Parasitology lectures by Dr. Ayman Ibrahim.'
  },
  'bld-para-ayman-blood-2022': {
    titleAr: 'طفيليات الدم - د. أيمن (Dr. Ayman)',
    titleEn: 'Blood Parasitology - Dr. Ayman',
    descriptionAr: 'شرح طفيليات الدم د. أيمن.',
    descriptionEn: 'Blood Parasitology lectures by Dr. Ayman.'
  },
  'bld-para-noha-madbouly-playlist': {
    titleAr: 'طفيليات الدم - د. نهى مدبولي (Dr. Noha Madbouly)',
    titleEn: 'Blood Parasitology - Dr. Noha Madbouly',
    descriptionAr: 'شرح منهج طفيليات الدم بالكامل للدكتورة نهى مدبولي.',
    descriptionEn: 'Complete Blood Parasitology curriculum lectures by Dr. Noha Madbouly.'
  },
  'bld-micro-essam': {
    titleAr: 'ميكروبيولوجي الدم الشامل (14 ساعة) - د. أحمد عصام',
    titleEn: 'Comprehensive Blood Microbiology (14 hrs) - Dr. Ahmed Essam',
    descriptionAr: 'شرح ميكروبيولوجي ومناعة موديول الدم 14 ساعة للدكتور أحمد عصام.',
    descriptionEn: 'Comprehensive 14-hour Blood Microbiology & Immunology course by Dr. Ahmed Essam.'
  },
  'bld-micro-kot': {
    titleAr: 'ميكروبيولوجي الدم (11 ساعة) - د. هنادي القط',
    titleEn: 'Blood Microbiology (11 hrs) - Dr. Hanady El-Kot',
    descriptionAr: 'كورس ميكروبيولوجيا الدم والمناعة 11 ساعة للدكتورة هنادي القط.',
    descriptionEn: '11-hour Blood Microbiology & Immunology course by Dr. Hanady El-Kot.'
  },
  'bld-micro-atef': {
    titleAr: 'ميكروبيولوجي الدم - د. محمد عاطف',
    titleEn: 'Blood Microbiology - Dr. Mohamed Atef',
    descriptionAr: 'شرح ميكروبيولوجي ومناعة الدم بواسطة د. محمد عاطف.',
    descriptionEn: 'Blood Microbiology & Immunology lectures by Dr. Mohamed Atef.'
  },
  'bld-micro-sherif': {
    titleAr: 'ميكروبيولوجي الدم - د. محمد الشريف',
    titleEn: 'Blood Microbiology - Dr. Mohamed El-Sherif',
    descriptionAr: 'سلسلة شروحات المناعة وميكروبيولوجيا الدم للدكتور محمد الشريف.',
    descriptionEn: 'Immunology and Blood Microbiology lecture series by Dr. Mohamed El-Sherif.'
  },
  'bld-micro-mofy': {
    titleAr: 'ميكروبيولوجي الدم - د. خالد الموفي',
    titleEn: 'Blood Microbiology - Dr. Khaled El-Mofy',
    descriptionAr: 'شرح ميكروبيولوجي ومناعة موديول الدم للدكتور خالد الموفي.',
    descriptionEn: 'Blood module microbiology & immunology lectures by Dr. Khaled El-Mofy.'
  },
  'bld-micro-ninja-nerd': {
    titleAr: 'المناعة وميكروبيولوجيا الدم - Ninja Nerd',
    titleEn: 'Blood Immunology & Microbiology - Ninja Nerd',
    descriptionAr: 'سلسلة شروحات المناعة الرائعة عالمياً من Ninja Nerd.',
    descriptionEn: 'World-renowned Immunology and Blood Microbiology lectures by Ninja Nerd.'
  },
  'bld-micro-kareem-emad-lec01': {
    titleAr: 'ميكروبيولوجي الدم - د. كريم عماد (المحاضرة الأولى: Parvo B19)',
    titleEn: 'Blood Microbiology - Dr. Kareem Emad (Lec 1: Parvo B19)',
    descriptionAr: 'المحاضرة الأولى لميكروبيولوجي الدم عن فيروس Parvo B19 وتأثيره على كرات الدم الحمراء.',
    descriptionEn: 'First microbiology lecture on Parvovirus B19 and its effect on erythroid precursors.'
  },
  'bld-clin-bleeding-disorders': {
    titleAr: 'محاضرة أمراض وسيولة الدم والنزيف الإكلينيكية (Bleeding Disorders)',
    titleEn: 'Clinical Bleeding Disorders & Hemostasis Lecture',
    descriptionAr: 'شرح سريري شامل لأمراض سيولة الدم واعتلالات التجلط واختبارات التخثر.',
    descriptionEn: 'Comprehensive clinical lecture on bleeding disorders, coagulation cascades, and laboratory tests.'
  },
  'bld-clin-wbc-disorders': {
    titleAr: 'محاضرة أمراض كرات الدم البيضاء واللوكيميا الإكلينيكية (WBC Disorders)',
    titleEn: 'Clinical WBC Disorders & Leukemia Lecture',
    descriptionAr: 'شرح سريري لأمراض كرات الدم البيضاء وسرطانات الدم الحادة والمزمنة والليمفوما.',
    descriptionEn: 'Clinical lecture covering WBC disorders, acute and chronic leukemias, and lymphomas.'
  }
};

/**
 * Returns translated English title for a material ID, falling back to pattern translations or original title.
 */
export function getMaterialEnglishTitle(id: string, fallbackTitle: string): string {
  if (materialTranslations[id]?.titleEn) {
    return materialTranslations[id].titleEn;
  }

  // Fallback pattern matching for common medical resource titles
  if (/^درايف\s+(.+)\s+المركزي/i.test(fallbackTitle)) {
    return fallbackTitle.replace(/^درايف\s+(.+)\s+المركزي.*/i, '$1 Central Drive');
  }
  if (/^بنك أسئلة MCQs\s+(.+)/i.test(fallbackTitle)) {
    return fallbackTitle.replace(/^بنك أسئلة MCQs\s+(.+)/i, '$1 MCQs Bank');
  }
  if (/^بنك الأسئلة المقالية\s+(.+)/i.test(fallbackTitle)) {
    return fallbackTitle.replace(/^بنك الأسئلة المقالية\s+(.+)/i, '$1 Essay Questions Bank');
  }
  if (/^قناة تليجرام\s+(.+)/i.test(fallbackTitle)) {
    return fallbackTitle.replace(/^قناة تليجرام\s+(.+)/i, '$1 Telegram Channel');
  }
  if (/^بوت\s+(.+)/i.test(fallbackTitle)) {
    return fallbackTitle.replace(/^بوت\s+(.+)/i, '$1 Bot');
  }
  if (/^محاضرة\s+(.+)/i.test(fallbackTitle)) {
    return fallbackTitle.replace(/^محاضرة\s+(.+)/i, '$1 Lecture');
  }
  if (/^تسجيلات\s+(.+)/i.test(fallbackTitle)) {
    return fallbackTitle.replace(/^تسجيلات\s+(.+)/i, '$1 Recordings');
  }
  if (/^شرح\s+(.+)/i.test(fallbackTitle)) {
    return fallbackTitle.replace(/^شرح\s+(.+)/i, '$1 Lectures');
  }
  if (/^مذكرات\s+(.+)/i.test(fallbackTitle)) {
    return fallbackTitle.replace(/^مذكرات\s+(.+)/i, '$1 Notes');
  }

  return fallbackTitle;
}

/**
 * Returns translated English description for a material ID.
 */
export function getMaterialEnglishDesc(id: string, fallbackDesc: string): string {
  return materialTranslations[id]?.descriptionEn || fallbackDesc;
}

/**
 * Returns Arabic title for a material ID.
 */
export function getMaterialArabicTitle(id: string, fallbackTitle: string): string {
  return materialTranslations[id]?.titleAr || fallbackTitle;
}
