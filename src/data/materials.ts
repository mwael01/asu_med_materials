import type { MaterialItem, AcademicYear } from '../types/materials';
import { subjectToSlug } from '../utils/slug';

/**
 * Production Study Materials Database for ASU Med Materials.
 * Year 2 - Blood & Lymphatic System Module (MED201).
 * Attributions: Compiled and organized by M. Wael alongside original authors and creators.
 */
export const materialsData: MaterialItem[] = [
  // ==========================================
  // 1. Central Drives & Batch Resources
  // ==========================================
  {
    id: 'bld-drive-semester3',
    title: 'درايف الترم الأول المركزي (Semester 3 Drive)',
    description: 'الدرايف المركزي الرئيسي لمحتوى الترم الأول للفرقة الثانية بكلية الطب جامعة عين شمس.',
    url: 'https://drive.google.com/drive/folders/1CQc2-YTMiwcCxi_bHzey00z76RI5Ar7G',
    type: 'drive',
    category: 'central',
    year: 2,
    moduleId: 'year2-blood',
    author: ['M. Wael', 'ASU Med Batch Drive'],
    tags: ['داتا', 'درايف', 'الترم الاول', 'semester 3', 'blood'],
    isPinned: true
  },
  {
    id: 'bld-anki-s3',
    title: 'Anki Decks Semester 3 (بطاقات أنكي للاستذكار المتباعد)',
    description: 'فلاش كاردز أنكي المنسقة والمنظمة لموديولات الترم الأول سنة ثانية.',
    url: 'https://drive.google.com/drive/folders/1vcN5P39Vh0g4KDTyHz-LwayPkDIsC-Xt',
    type: 'drive',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    author: ['M. Wael', 'Anki ASU'],
    tags: ['anki', 'decks', 'flashcards', 'أنكي', 'مراجعة'],
    isPinned: true
  },
  {
    id: 'bld-daily-lectures-practical',
    title: 'الداتا اليومية للمحاضرات والسكاشن العملية (Day by Day)',
    description: 'تسجيلات وسلايدات المحاضرات والسكاشن العملية يوم بيوم من الكلية.',
    url: 'https://drive.google.com/drive/folders/1KJc7ATSQ-Y3QUvi30VxM8K4mTbBROu8O',
    type: 'drive',
    category: 'practical',
    year: 2,
    moduleId: 'year2-blood',
    author: ['M. Wael', 'ASU Med Batch Drive'],
    tags: ['daily', 'practical', 'lectures', 'يوم بيوم', 'عملي']
  },
  {
    id: 'bld-comprehensive-module-drive',
    title: 'درايف موديول Blood الشامل (MCQs، فورماتيف، وفاينل)',
    description: 'درايف شامل لكل ما يخص موديول الدم: أسئلة MCQs، فورماتيف الكلية، الامتحانات السابقة، وقائمة الأدوية.',
    url: 'https://drive.google.com/drive/folders/146BPx_lcIGMwrleN91M80sqbJkBt6KI4',
    type: 'drive',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    author: ['M. Wael', 'ASU Med Batch Drive'],
    tags: ['comprehensive', 'mcq', 'formatives', 'finals', 'drug list', 'شامل'],
    isPinned: true
  },
  {
    id: 'bld-year2-central-drives',
    title: 'درايفات سنة ثانية المركزية (Year 2 Central Drives)',
    description: 'مجلد الأرشيف الكامل لدرايفات الفرقة الثانية طب عين شمس.',
    url: 'https://drive.google.com/drive/folders/1641f5i37IeKWNocZeQA90W4VXniuyD5K',
    type: 'drive',
    category: 'central',
    year: 2,
    moduleId: 'year2-blood',
    author: ['M. Wael', 'ASU Med Batch Drive'],
    tags: ['درايفات', 'سنة ثانية', 'year 2', 'archives']
  },

  // ==========================================
  // 2. Anatomy
  // ==========================================
  {
    id: 'bld-anat-moodle-p1',
    title: 'تشريح الدم - Moodle الرسمي (Part 1)',
    description: 'تسجيل محاضرة التشريح الرسمية للكلية عبر منصة مودل - الجزء الأول.',
    url: 'https://drive.google.com/file/d/1hInCixkgIgwWMZU0rL5P--F3fxfojupn/view',
    type: 'drive',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'ASU Moodle'],
    tags: ['anatomy', 'moodle', 'تشريح', 'مودل']
  },
  {
    id: 'bld-anat-moodle-p2',
    title: 'تشريح الدم - Moodle الرسمي (Part 2)',
    description: 'تسجيل محاضرة التشريح الرسمية للكلية عبر منصة ستريم مودل - الجزء الثاني.',
    url: 'https://web.microsoftstream.com/video/68921174-83c0-4308-8c7a-5d7cad817d05',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'ASU Moodle'],
    tags: ['anatomy', 'stream', 'تشريح', 'مودل']
  },
  {
    id: 'bld-anat-moodle-p3',
    title: 'تشريح الدم - Moodle الرسمي (Part 3)',
    description: 'تسجيل محاضرة التشريح الرسمية للكلية عبر منصة مودل - الجزء الثالث.',
    url: 'https://drive.google.com/file/d/1PK7kwGQhHZPUgD58y9bTmuWkufdAp59w/view',
    type: 'drive',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'ASU Moodle'],
    tags: ['anatomy', 'moodle', 'تشريح', 'مودل']
  },
  {
    id: 'bld-anat-wahdan',
    title: 'شرح تشريح موديول Blood - د. وهدان (Dr. Wahdan)',
    description: 'قائمة تشغيل شرح تشريح الدم والجهاز الليمفاوي كاملة للدكتور وهدان.',
    url: 'https://www.youtube.com/playlist?list=PLIZNmuBMEjaMZmwn2FVmG8bYsmVs5n-_v',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'Dr. Wahdan'],
    playlistId: 'PLIZNmuBMEjaMZmwn2FVmG8bYsmVs5n-_v',
    tags: ['anatomy', 'wahdan', 'وهدان', 'تشريح', 'playlist'],
    isPinned: true
  },
  {
    id: 'bld-anat-sameh',
    title: 'تشريح الدم - Sameh (Part 1 & 2)',
    description: 'سلسلة فيديو شرح تشريح موديول الدم لدكتور سامح (مقسمة لجزئين).',
    url: 'https://youtu.be/CdxBqhfzMFg',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'Sameh'],
    videos: [
      { id: 'sameh-p1', title: 'تشريح الدم - سامح (الجزء 1)', youtubeId: 'CdxBqhfzMFg', url: 'https://youtu.be/CdxBqhfzMFg' },
      { id: 'sameh-p2', title: 'تشريح الدم - سامح (الجزء 2)', youtubeId: 'rrAfcJwypSs', url: 'https://youtu.be/rrAfcJwypSs' }
    ],
    tags: ['anatomy', 'sameh', 'تشريح', 'playlist']
  },
  {
    id: 'bld-anat-abdullah',
    title: 'تشريح الدم - عبدالله (Abdullah)',
    description: 'قائمة تشغيل شروحات تشريح موديول الدم لدكتور عبدالله.',
    url: 'https://youtube.com/playlist?list=PLuTP8UDoc4g8l22pdJhOUJwTPlLW7JOqQ',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'Abdullah'],
    playlistId: 'PLuTP8UDoc4g8l22pdJhOUJwTPlLW7JOqQ',
    tags: ['anatomy', 'abdullah', 'عبدالله', 'تشريح', 'playlist']
  },
  {
    id: 'bld-anat-mohammed',
    title: 'تشريح الدم - محمد (Mohammed)',
    description: 'قائمة تشغيل شروحات تشريح موديول الدم لدكتور محمد.',
    url: 'https://youtube.com/playlist?list=PLOs4vdEd6G8QWPMb8SBYltbYx7NVsIblt',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'Mohammed'],
    playlistId: 'PLOs4vdEd6G8QWPMb8SBYltbYx7NVsIblt',
    tags: ['anatomy', 'mohammed', 'تشريح', 'playlist']
  },
  {
    id: 'bld-anat-wageh',
    title: 'تشريح الدم - وجيه (Wageh - Part 1 & 2)',
    description: 'فيديوهات شرح تشريح موديول الدم للدكتور وجيه (جزئين كاملين).',
    url: 'https://youtu.be/tzkF5C1ja94',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'Wageh'],
    videos: [
      { id: 'wageh-p1', title: 'تشريح الدم - وجيه (الجزء 1)', youtubeId: 'tzkF5C1ja94', url: 'https://youtu.be/tzkF5C1ja94' },
      { id: 'wageh-p2', title: 'تشريح الدم - وجيه (الجزء 2)', youtubeId: 'LxRv6UxQh1c', url: 'https://youtu.be/LxRv6UxQh1c' }
    ],
    tags: ['anatomy', 'wageh', 'وجيه', 'تشريح', 'playlist']
  },
  {
    id: 'bld-anat-shareef',
    title: 'تشريح الدم - د. شريف (Dr. Shareef)',
    description: 'قائمة تشغيل شروحات تشريح موديول الدم للدكتور شريف.',
    url: 'https://youtube.com/playlist?list=PLe2L3M_TgeCg0ozSwFSz3Hv8q9Zyk2nAm',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'Dr. Shareef'],
    playlistId: 'PLe2L3M_TgeCg0ozSwFSz3Hv8q9Zyk2nAm',
    tags: ['anatomy', 'shareef', 'شريف', 'تشريح', 'playlist']
  },
  {
    id: 'bld-anat-ahmad-fareed',
    title: 'تشريح الدم - د. أحمد فريد (Dr. Ahmad Fareed)',
    description: 'قائمة تشغيل شروحات تشريح موديول الدم للدكتور أحمد فريد.',
    url: 'https://youtube.com/playlist?list=PLs0O24oUQeaCgOmLXzJSqKp7UEzjJwnBr',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'Dr. Ahmad Fareed'],
    playlistId: 'PLs0O24oUQeaCgOmLXzJSqKp7UEzjJwnBr',
    tags: ['anatomy', 'ahmad fareed', 'أحمد فريد', 'تشريح', 'playlist']
  },
  {
    id: 'bld-anat-mahmoud-alaa',
    title: 'تسجيلات وملفات تشريح الدم - د. محمود علاء',
    description: 'تسجيلات وملفات التشريح للدكتور محمود علاء على تليجرام موديول Blood.',
    url: 'https://t.me/Blood_Module/2600',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Anatomy',
    author: ['M. Wael', 'Dr. Mahmoud Alaa'],
    tags: ['anatomy', 'telegram', 'محمود علاء', 'تسجيلات']
  },

  // ==========================================
  // 3. Physiology
  // ==========================================
  {
    id: 'bld-phys-nagi',
    title: 'فسيولوجي الدم - د. ناجي (Dr. Nagi)',
    description: 'شرح فسيولوجي الدم كامل للدكتور ناجي في قائمة تشغيل يوتيوب.',
    url: 'https://youtube.com/playlist?list=PLFkJTdtzWoIaAWbijL3Pw4gVnxDjjPG8U',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Physiology',
    author: ['M. Wael', 'Dr. Nagi'],
    playlistId: 'PLFkJTdtzWoIaAWbijL3Pw4gVnxDjjPG8U',
    tags: ['physiology', 'nagi', 'ناجي', 'فسيولوجي', 'playlist'],
    isPinned: true
  },
  {
    id: 'bld-phys-fayez',
    title: 'فسيولوجي الدم - د. فايز (Dr. Fayez)',
    description: 'شرح فسيولوجي موديول الدم للدكتور فايز.',
    url: 'https://www.youtube.com/playlist?list=PLLShXxg1izojEV9_0S5rXSnMpPvPCu9L4',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Physiology',
    author: ['M. Wael', 'Dr. Fayez'],
    playlistId: 'PLLShXxg1izojEV9_0S5rXSnMpPvPCu9L4',
    tags: ['physiology', 'fayez', 'فايز', 'فسيولوجي', 'playlist']
  },
  {
    id: 'bld-phys-ninja-nerd',
    title: 'فسيولوجي الدم والهيماتولوجي - Ninja Nerd',
    description: 'سلسلة شروحات الهيماتولوجي وفسيولوجيا الدم المصورة الرائعة من قناة نينجا نيرد.',
    url: 'https://www.youtube.com/playlist?list=PLTF9h-T1TcJh9T57G0nls2uGPzzHKMxxh',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Physiology',
    author: ['M. Wael', 'Ninja Nerd'],
    playlistId: 'PLTF9h-T1TcJh9T57G0nls2uGPzzHKMxxh',
    tags: ['physiology', 'ninja nerd', 'hematology', 'فسيولوجي', 'playlist']
  },
  {
    id: 'bld-phys-najeeb',
    title: 'فسيولوجي الدم - د. نجيب (Dr. Najeeb)',
    description: 'محاضرات فسيولوجي الدم التأسيسية المفصلة للدكتور نجيب.',
    url: 'https://www.youtube.com/playlist?list=PLO2O9UjkQxLcuRB-j4ZbYEwCDP9A4tpCo',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Physiology',
    author: ['M. Wael', 'Dr. Najeeb'],
    playlistId: 'PLO2O9UjkQxLcuRB-j4ZbYEwCDP9A4tpCo',
    tags: ['physiology', 'najeeb', 'نجيب', 'فسيولوجي', 'playlist']
  },
  {
    id: 'bld-phys-ahmed',
    title: 'فسيولوجي الدم - د. أحمد (Dr. Ahmed)',
    description: 'قائمة تشغيل شرح فسيولوجيا الدم للدكتور أحمد.',
    url: 'https://www.youtube.com/playlist?list=PLJR3YnsG3vkRi3ZZowNVrwh_hpslIZM3B',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Physiology',
    author: ['M. Wael', 'Dr. Ahmed'],
    playlistId: 'PLJR3YnsG3vkRi3ZZowNVrwh_hpslIZM3B',
    tags: ['physiology', 'ahmed', 'أحمد', 'فسيولوجي', 'playlist']
  },
  {
    id: 'bld-phys-mohammed-elsherif',
    title: 'فسيولوجي الدم - د. محمد الشريف',
    description: 'تسجيلات وملفات فسيولوجي الدم للدكتور محمد الشريف على تليجرام.',
    url: 'https://t.me/Blood_Module/2580',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Physiology',
    author: ['M. Wael', 'Dr. Mohammed Elsherif'],
    tags: ['physiology', 'telegram', 'محمد الشريف', 'فسيولوجي']
  },

  // ==========================================
  // 4. Histology
  // ==========================================
  {
    id: 'bld-histo-faten',
    title: 'هستولوجي الدم - د. فاتن (Dr. Faten)',
    description: 'كورس هستولوجي الدم والأعضاء الليمفاوية للدكتورة فاتن.',
    url: 'https://youtube.com/playlist?list=PLlzicty9XavE7Ul7ogZHDUxjlkU-hs1nw',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'Dr. Faten'],
    playlistId: 'PLlzicty9XavE7Ul7ogZHDUxjlkU-hs1nw',
    tags: ['histology', 'faten', 'فاتن', 'هستولوجي', 'playlist']
  },
  {
    id: 'bld-histo-moodle-p1',
    title: 'هستولوجي الدم - ASU Moodle (Part 1)',
    description: 'محاضرة الهستولوجي وبيولوجيا الخلية الرسمية للكلية عبر ستريم - الجزء 1.',
    url: 'https://web.microsoftstream.com/video/c4d935b4-141a-4a8b-9ced-e62cb295b7a4?ASU=&English=en&Histology%20and%20Cell%20Biology=&MBL-2=14',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'ASU Moodle'],
    tags: ['histology', 'moodle', 'هستولوجي', 'مودل']
  },
  {
    id: 'bld-histo-moodle-p2',
    title: 'هستولوجي الدم - ASU Moodle (Part 2)',
    description: 'محاضرة الهستولوجي وبيولوجيا الخلية الرسمية للكلية عبر ستريم - الجزء 2.',
    url: 'https://web.microsoftstream.com/video/327f8487-40cc-47ce-819b-e0c2a1c1c8ab',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'ASU Moodle'],
    tags: ['histology', 'moodle', 'هستولوجي', 'مودل']
  },
  {
    id: 'bld-histo-moodle-p3',
    title: 'هستولوجي الدم - ASU Moodle (Part 3)',
    description: 'محاضرة الهستولوجي وبيولوجيا الخلية الرسمية للكلية عبر ستريم - الجزء 3.',
    url: 'https://web.microsoftstream.com/video/ccde0d21-3760-4269-b6c4-6f193d407ece',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'ASU Moodle'],
    tags: ['histology', 'moodle', 'هستولوجي', 'مودل']
  },
  {
    id: 'bld-histo-moodle-p4',
    title: 'هستولوجي الدم - ASU Moodle (Part 4)',
    description: 'محاضرة الهستولوجي وبيولوجيا الخلية الرسمية للكلية عبر ستريم - الجزء 4.',
    url: 'https://web.microsoftstream.com/video/d326284e-0ef0-4d58-a5e3-c7f629a7baf4',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'ASU Moodle'],
    tags: ['histology', 'moodle', 'هستولوجي', 'مودل']
  },
  {
    id: 'bld-histo-moodle-p5',
    title: 'هستولوجي الدم - ASU Moodle (Part 5)',
    description: 'محاضرة الهستولوجي وبيولوجيا الخلية الرسمية للكلية عبر ستريم - الجزء 5.',
    url: 'https://web.microsoftstream.com/video/b5907e16-3a60-4184-82b9-3311bcf1d212?list=studio',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'ASU Moodle'],
    tags: ['histology', 'moodle', 'هستولوجي', 'مودل']
  },
  {
    id: 'bld-histo-eman-nabil',
    title: 'هستولوجي الدم - د. إيمان نبيل (Dr. Eman Nabil)',
    description: 'شرح موديول هستولوجي الدم للدكتورة إيمان نبيل.',
    url: 'https://youtube.com/playlist?list=PLAlbG9dixa2hqxp9o2fMUEJ_6J3NXMIdl',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'Dr. Eman Nabil'],
    playlistId: 'PLAlbG9dixa2hqxp9o2fMUEJ_6J3NXMIdl',
    tags: ['histology', 'eman nabil', 'إيمان نبيل', 'هستولوجي', 'playlist']
  },
  {
    id: 'bld-histo-shireen-blood',
    title: 'مراجعة هستولوجي الدم (2.5 ساعة) - د. شيرين',
    description: 'مراجعة مركزة لهستولوجي الدم في ساعتين ونصف للدكتورة شيرين.',
    url: 'https://www.youtube.com/playlist?list=PLzjKJPnFc4jwQGsHZaD9vGxjreVjmIXx5',
    type: 'playlist',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'Dr. Shireen'],
    playlistId: 'PLzjKJPnFc4jwQGsHZaD9vGxjreVjmIXx5',
    tags: ['histology', 'shireen', 'شيرين', 'مراجعة', 'playlist']
  },
  {
    id: 'bld-histo-shireen-lymph',
    title: 'مراجعة هستولوجي الجهاز الليمفاوي (1.75 ساعة) - د. شيرين',
    description: 'مراجعة مركزة لهستولوجي الغدد والنسيج الليمفاوي في ساعة و45 دقيقة للدكتورة شيرين.',
    url: 'https://www.youtube.com/playlist?list=PLzjKJPnFc4jxRwOHbLymNVRxZPCY4QIoe',
    type: 'playlist',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'Dr. Shireen'],
    playlistId: 'PLzjKJPnFc4jxRwOHbLymNVRxZPCY4QIoe',
    tags: ['histology', 'lymph', 'shireen', 'شيرين', 'ليمف', 'playlist']
  },
  {
    id: 'bld-histo-ahmeed-nerd',
    title: 'هستولوجي الدم - د. أحمد نيرد (Dr. Ahmeed Nerd)',
    description: 'شروحات توضيحية لشرائح وخلايا الدم للدكتور أحمد نيرد.',
    url: 'https://www.youtube.com/playlist?list=PL5gt9J3j4ldbOOI2se0e_M_VY_a_ygWG2',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'Dr. Ahmeed Nerd'],
    playlistId: 'PL5gt9J3j4ldbOOI2se0e_M_VY_a_ygWG2',
    tags: ['histology', 'ahmeed nerd', 'هستولوجي', 'playlist']
  },
  {
    id: 'bld-histo-ahmed-zahra',
    title: 'تسجيلات هستولوجي الدم - د. أحمد زهرة',
    description: 'تسجيلات وملفات هستولوجي الدم للدكتور أحمد زهرة على تليجرام.',
    url: 'https://t.me/Blood_Module/2593',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'Dr. Ahmed Zahra'],
    tags: ['histology', 'telegram', 'أحمد زهرة', 'هستولوجي']
  },

  // ==========================================
  // 5. Biochemistry
  // ==========================================
  {
    id: 'bld-biochem-esawi',
    title: 'كيمياء حيوية الدم - د. عيسوي (Dr. Esawi)',
    description: 'شرح كيمياء الهيموجلوبين، البورفيريا، والأيض للدكتور عيسوي.',
    url: 'https://www.youtube.com/playlist?list=PLw03kzQQoHv0zzA3VmasZYxxGhYzfFIpx',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Biochemistry',
    author: ['M. Wael', 'Dr. Esawi'],
    playlistId: 'PLw03kzQQoHv0zzA3VmasZYxxGhYzfFIpx',
    tags: ['biochemistry', 'esawi', 'عيسوي', 'بايوكيمستري', 'playlist']
  },
  {
    id: 'bld-biochem-ayman',
    title: 'كيمياء حيوية الدم - د. أيمن (Dr. Ayman)',
    description: 'شرح موديول بايوكيمستري الدم للدكتور أيمن.',
    url: 'https://youtube.com/playlist?list=PLmjIY3SPvf2nea96csM-ni6mkdjwQ0g0C',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Biochemistry',
    author: ['M. Wael', 'Dr. Ayman'],
    playlistId: 'PLmjIY3SPvf2nea96csM-ni6mkdjwQ0g0C',
    tags: ['biochemistry', 'ayman', 'أيمن', 'بايوكيمستري', 'playlist']
  },
  {
    id: 'bld-biochem-walaa-1',
    title: 'كيمياء حيوية الدم - د. ولاء (الجزء الأول)',
    description: 'قائمة تشغيل شرح كيمياء حيوية الدم للدكتورة ولاء - الجزء الأول.',
    url: 'https://www.youtube.com/playlist?list=PLXd13HOsAnZy_t0jdd-D6ewRMVSNtalVo',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Biochemistry',
    author: ['M. Wael', 'Dr. Walaa'],
    playlistId: 'PLXd13HOsAnZy_t0jdd-D6ewRMVSNtalVo',
    tags: ['biochemistry', 'walaa', 'ولاء', 'بايوكيمستري', 'playlist']
  },
  {
    id: 'bld-biochem-walaa-2',
    title: 'كيمياء حيوية الدم - د. ولاء (الجزء الثاني)',
    description: 'قائمة تشغيل شرح كيمياء حيوية الدم للدكتورة ولاء - الجزء الثاني.',
    url: 'https://www.youtube.com/playlist?list=PLXd13HOsAnZy9bTXaZ7fLI9-kSOUQPfPk',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Biochemistry',
    author: ['M. Wael', 'Dr. Walaa'],
    playlistId: 'PLXd13HOsAnZy9bTXaZ7fLI9-kSOUQPfPk',
    tags: ['biochemistry', 'walaa', 'ولاء', 'بايوكيمستري', 'playlist']
  },
  {
    id: 'bld-biochem-mohammed',
    title: 'كيمياء حيوية الدم - د. محمد (5 أجزاء)',
    description: 'سلسلة شروحات كيمياء حيوية موديول الدم للدكتور محمد (مقسمة إلى 5 محاضرات فيديو).',
    url: 'https://youtu.be/csgUGDeXW7k',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Biochemistry',
    author: ['M. Wael', 'Dr. Mohammed'],
    videos: [
      { id: 'mohammed-p1', title: 'بايوكيمستري الدم - د. محمد (الجزء 1)', youtubeId: 'csgUGDeXW7k', url: 'https://youtu.be/csgUGDeXW7k' },
      { id: 'mohammed-p2', title: 'بايوكيمستري الدم - د. محمد (الجزء 2)', youtubeId: 'C3jCs4hvMUA', url: 'https://youtu.be/C3jCs4hvMUA' },
      { id: 'mohammed-p3', title: 'بايوكيمستري الدم - د. محمد (الجزء 3)', youtubeId: '9XEaxRBlV-c', url: 'https://youtu.be/9XEaxRBlV-c' },
      { id: 'mohammed-p4', title: 'بايوكيمستري الدم - د. محمد (الجزء 4)', youtubeId: 'VRzO7ncnmLM', url: 'https://youtu.be/VRzO7ncnmLM' },
      { id: 'mohammed-p5', title: 'بايوكيمستري الدم - د. محمد (الجزء 5)', youtubeId: 'I_jxHx4FDRo', url: 'https://youtu.be/I_jxHx4FDRo' }
    ],
    tags: ['biochemistry', 'mohammed', 'بايوكيمستري', 'playlist']
  },
  {
    id: 'bld-biochem-marwa',
    title: 'كيمياء حيوية الدم - د. مروة حمدي (4 أجزاء)',
    description: 'سلسلة محاضرات بايوكيمستري الدم للدكتورة مروة حمدي (4 أجزاء فيديو متتالية).',
    url: 'https://youtu.be/Idy7y9iSKbM',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Biochemistry',
    author: ['M. Wael', 'Dr. Marwa Hamdy'],
    videos: [
      { id: 'marwa-p1', title: 'بايوكيمستري الدم - د. مروة حمدي (الجزء 1)', youtubeId: 'Idy7y9iSKbM', url: 'https://youtu.be/Idy7y9iSKbM' },
      { id: 'marwa-p2', title: 'بايوكيمستري الدم - د. مروة حمدي (الجزء 2)', youtubeId: 'Ggl2T7x8PJs', url: 'https://youtu.be/Ggl2T7x8PJs' },
      { id: 'marwa-p3', title: 'بايوكيمستري الدم - د. مروة حمدي (الجزء 3)', youtubeId: 'pKtEGea18Io', url: 'https://youtu.be/pKtEGea18Io' },
      { id: 'marwa-p4', title: 'بايوكيمستري الدم - د. مروة حمدي (الجزء 4)', youtubeId: 'pKtEGea18Io', url: 'https://youtu.be/pKtEGea18Io' }
    ],
    tags: ['biochemistry', 'marwa hamdy', 'مروة حمدي', 'بايوكيمستري', 'playlist']
  },

  // ==========================================
  // 6. Pharmacology
  // ==========================================
  {
    id: 'bld-pharma-nour-eldin',
    title: 'فارماكولوجي الدم - د. أحمد نور الدين',
    description: 'شرح أدوية وسيولة الدم والتجلط والأنيميا للدكتور أحمد نور الدين.',
    url: 'https://www.youtube.com/playlist?list=PL_7f3u0OA6BM06UfWmzinSeaRNS_xvxNA',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pharmacology',
    author: ['M. Wael', 'Dr. Ahmed Nour Eldin'],
    playlistId: 'PL_7f3u0OA6BM06UfWmzinSeaRNS_xvxNA',
    tags: ['pharmacology', 'nour eldin', 'أحمد نور الدين', 'فارما', 'playlist'],
    isPinned: true
  },
  {
    id: 'bld-pharma-fouda',
    title: 'فارماكولوجي الدم المكثف (4 ساعات) - د. عبد المتعال فودة',
    description: 'مراجعة وشرح مركز لفارما الدم في 4 ساعات للدكتور عبد المتعال فودة.',
    url: 'https://t.me/Blood_Module/2595',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pharmacology',
    author: ['M. Wael', 'Dr. Abdel Motaal Fouda'],
    tags: ['pharmacology', 'fouda', 'عبد المتعال فودة', 'فارما']
  },
  {
    id: 'bld-pharma-tah',
    title: 'فارماكولوجي الدم (4.5 ساعات) - د. تاح',
    description: 'شرح فارما الدم في 4 ساعات ونصف للدكتور تاح عبر تليجرام.',
    url: 'https://t.me/Blood_Module/2597',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pharmacology',
    author: ['M. Wael', 'Dr. Tah'],
    tags: ['pharmacology', 'tah', 'تاح', 'فارما']
  },
  {
    id: 'bld-pharma-abdelrahman',
    title: 'فارماكولوجي الدم (6 ساعات) - د. أحمد عبد الرحمن',
    description: 'كورس وشرح فارما الدم الكامل في 6 ساعات للدكتور أحمد عبد الرحمن.',
    url: 'https://t.me/Blood_Module/2596',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pharmacology',
    author: ['M. Wael', 'Dr. Ahmed Abdel Rahman'],
    tags: ['pharmacology', 'abdel rahman', 'أحمد عبد الرحمن', 'فارما']
  },
  {
    id: 'bld-pharma-shaer',
    title: 'فارماكولوجي الدم - د. الشاعر',
    description: 'قائمة تشغيل شرح فارماكولوجيا الدم للدكتور الشاعر على يوتيوب.',
    url: 'https://www.youtube.com/playlist?list=PL0_tN0panMs8W-tpVy4a_eM9QR2DwwvxA',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pharmacology',
    author: ['M. Wael', 'Dr. El Shaer'],
    playlistId: 'PL0_tN0panMs8W-tpVy4a_eM9QR2DwwvxA',
    tags: ['pharmacology', 'shaer', 'الشاعر', 'فارما', 'playlist']
  },
  {
    id: 'bld-pharma-drug-list',
    title: 'قائمة وتفريغ أدوية الدم المعتمدة (Pharma Drug List)',
    description: 'ملف تفريغ وتلخيص كامل قائمة الأدوية المطلوبة في موديول الدم.',
    url: 'https://t.me/MG_ASU_MED/1236',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pharmacology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['pharma', 'drug list', 'أدوية', 'قائمة الأدوية'],
    isPinned: true
  },

  // ==========================================
  // 7. Pathology
  // ==========================================
  {
    id: 'bld-patho-nemer',
    title: 'باثولوجي الدم المركز (ساعتان) - د. أحمد النمر',
    description: 'شرح مكثف ومختصر لباثولوجي الدم في ساعتين فقط للدكتور أحمد النمر.',
    url: 'https://t.me/Blood_Module/2581',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pathology',
    author: ['M. Wael', 'Dr. Ahmed El-Nemer'],
    tags: ['pathology', 'nemer', 'أحمد النمر', 'باثولوجي']
  },
  {
    id: 'bld-patho-ghazy',
    title: 'باثولوجي الدم (4 ساعات) - د. سامح غازي',
    description: 'شرح باثولوجي الأنيميا وأورام الدم واللوكيميا والليمفوما في 4 ساعات للدكتور سامح غازي.',
    url: 'https://t.me/Blood_Module/2599',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pathology',
    author: ['M. Wael', 'Dr. Sameh Ghazy'],
    tags: ['pathology', 'sameh ghazy', 'سامح غازي', 'باثولوجي'],
    isPinned: true
  },
  {
    id: 'bld-patho-khalifa',
    title: 'باثولوجي الدم المفصل (5.5 ساعات) - د. عبد الرحمن خليفة',
    description: 'شرح باثولوجي الدم الكامل والشامل في 5 ساعات ونصف للدكتور عبد الرحمن خليفة.',
    url: 'https://t.me/Blood_Module/2582',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pathology',
    author: ['M. Wael', 'Dr. Abdel Rahman Khalifa'],
    tags: ['pathology', 'khalifa', 'عبد الرحمن خليفة', 'باثولوجي']
  },
  {
    id: 'bld-patho-sharkawy',
    title: 'باثولوجي الدم - د. خالد الشرقاوي',
    description: 'قائمة تشغيل شرح باثولوجي موديول الدم للدكتور خالد الشرقاوي على يوتيوب.',
    url: 'https://www.youtube.com/playlist?list=PLLmNysLEaLbj-ULVe6IKH8SSD7sF33F5-',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pathology',
    author: ['M. Wael', 'Dr. Khaled El-Sharkawy'],
    playlistId: 'PLLmNysLEaLbj-ULVe6IKH8SSD7sF33F5-',
    tags: ['pathology', 'sharkawy', 'خالد الشرقاوي', 'باثولوجي', 'playlist']
  },

  // ==========================================
  // 8. Parasitology
  // ==========================================
  {
    id: 'bld-para-madbouly',
    title: 'طفيليات الدم (5 ساعات) - د. نهى مدبولي',
    description: 'شرح طفيليات الدم (الملاريا والليشمانيا والتريبانوسوما) في 5 ساعات للدكتورة نهى مدبولي.',
    url: 'https://t.me/Blood_Module/2584',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Parasitology',
    author: ['M. Wael', 'Dr. Noha Madbouly'],
    tags: ['parasitology', 'madbouly', 'نهى مدبولي', 'بارا']
  },
  {
    id: 'bld-para-tokhy',
    title: 'طفيليات الدم (5.5 ساعات) - د. الطوخي',
    description: 'شرح باراسيتولوجي موديول الدم في 5 ساعات ونصف للدكتور الطوخي.',
    url: 'https://t.me/Blood_Module/2586',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Parasitology',
    author: ['M. Wael', 'Dr. El-Tokhy'],
    tags: ['parasitology', 'tokhy', 'الطوخي', 'بارا']
  },
  {
    id: 'bld-para-habib',
    title: 'طفيليات الدم - د. خالد حبيب',
    description: 'قائمة تشغيل شروحات باراسيتولوجي الدم للدكتور خالد حبيب على يوتيوب.',
    url: 'https://youtube.com/playlist?list=PLMnvpkQoftOI&si=um90GKLZ4QTh06wE',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Parasitology',
    author: ['M. Wael', 'Dr. Khaled Habib'],
    playlistId: 'PLMnvpkQoftOI',
    tags: ['parasitology', 'khaled habib', 'خالد حبيب', 'بارا', 'playlist']
  },
  {
    id: 'bld-para-ayman-ibrahim',
    title: 'طفيليات الدم - د. أيمن إبراهيم',
    description: 'قائمة تشغيل شرح طفيليات الدم للدكتور أيمن إبراهيم على يوتيوب.',
    url: 'https://youtube.com/playlist?list=PL0_tN0panMs-zQRtyaMYxsIE9pXPwuTRy',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Parasitology',
    author: ['M. Wael', 'Dr. Ayman Ibrahim'],
    playlistId: 'PL0_tN0panMs-zQRtyaMYxsIE9pXPwuTRy',
    tags: ['parasitology', 'ayman ibrahim', 'أيمن إبراهيم', 'بارا', 'playlist']
  },

  // ==========================================
  // 9. Microbiology
  // ==========================================
  {
    id: 'bld-micro-essam',
    title: 'ميكروبيولوجي الدم الشامل (14 ساعة) - د. أحمد عصام',
    description: 'كورس ميكروبيولوجيا الدم والمناعة المفصل في 14 ساعة للدكتور أحمد عصام.',
    url: 'https://t.me/Blood_Module/2579',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Microbiology',
    author: ['M. Wael', 'Dr. Ahmed Essam'],
    tags: ['microbiology', 'ahmed essam', 'أحمد عصام', 'مايكرو'],
    isPinned: true
  },
  {
    id: 'bld-micro-kot',
    title: 'ميكروبيولوجي الدم (11 ساعة) - د. هنادي القط',
    description: 'شرح ميكروبيولوجي ومناعة الدم في 11 ساعة للدكتورة هنادي القط على تليجرام.',
    url: 'https://t.me/Blood_Module/18',
    type: 'telegram',
    category: 'summaries',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Microbiology',
    author: ['M. Wael', 'Dr. Hanadi El-Kot'],
    tags: ['microbiology', 'hanadi kot', 'هنادي القط', 'مايكرو']
  },
  {
    id: 'bld-micro-atef',
    title: 'ميكروبيولوجي الدم - د. محمد عاطف',
    description: 'شرح ميكروبيولوجي الدم ومكافحة العدوى للدكتور محمد عاطف على يوتيوب.',
    url: 'https://youtube.com/playlist?list=PL9tL_1NKaz5eEaPIwMyIqXdkznGeQMaCg',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Microbiology',
    author: ['M. Wael', 'Dr. Mohamed Atef'],
    playlistId: 'PL9tL_1NKaz5eEaPIwMyIqXdkznGeQMaCg',
    tags: ['microbiology', 'atef', 'محمد عاطف', 'مايكرو', 'playlist']
  },
  {
    id: 'bld-micro-sherif',
    title: 'ميكروبيولوجي الدم - د. محمد الشريف',
    description: 'شرح ميكروبيولوجيا الدم للدكتور محمد الشريف على يوتيوب.',
    url: 'https://www.youtube.com/playlist?list=PL6HncFuy-vP76l0_g637yq52tbl6gw8cD',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Microbiology',
    author: ['M. Wael', 'Dr. Mohamed El-Sherif'],
    playlistId: 'PL6HncFuy-vP76l0_g637yq52tbl6gw8cD',
    tags: ['microbiology', 'sherif', 'محمد الشريف', 'مايكرو', 'playlist']
  },
  {
    id: 'bld-micro-mofy',
    title: 'ميكروبيولوجي الدم - د. خالد الموفي',
    description: 'شرح كورس ميكروبيولوجي الدم للدكتور خالد الموفي على يوتيوب.',
    url: 'https://youtube.com/playlist?list=PLvwOqR8bEHxCZRe1cJGmdG5Apae45qt5s',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Microbiology',
    author: ['M. Wael', 'Dr. Khaled El-Mofy'],
    playlistId: 'PLvwOqR8bEHxCZRe1cJGmdG5Apae45qt5s',
    tags: ['microbiology', 'mofy', 'خالد الموفي', 'مايكرو', 'playlist']
  },
  {
    id: 'bld-micro-ninja-nerd',
    title: 'المناعة وميكروبيولوجيا الدم - Ninja Nerd',
    description: 'شروحات الجهاز المناعي، الخلايا التائية والبائية والأجسام المضادة المصورة من نينجا نيرد.',
    url: 'https://www.youtube.com/playlist?list=PLTF9h-T1TcJj4AOPCxGxOUTH0IVmaH7_8',
    type: 'playlist',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Microbiology',
    author: ['M. Wael', 'Ninja Nerd'],
    playlistId: 'PLTF9h-T1TcJj4AOPCxGxOUTH0IVmaH7_8',
    tags: ['microbiology', 'immunology', 'ninja nerd', 'مناعة', 'playlist']
  },

  // ==========================================
  // 10. Clinical
  // ==========================================
  {
    id: 'bld-clin-bleeding-disorders',
    title: 'محاضرة أمراض وسيولة الدم والنزيف الإكلينيكية (Bleeding Disorders)',
    description: 'المحاضرة الإكلينيكية الرسمية لكلية الطب جامعة عين شمس عبر مايكروسوفت ستريم حول أمراض النزف والتجلط.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emp220069_med_asu_edu_eg/EX8_T-fqH6dBrBOhQSNE60oBAsuOPpy3d8Aq-FAKS9jyUA?e=5i7Q1c&nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJTdHJlYW1XZWJBcHAiLCJyZWZlcnJhbFZpZXciOiJTaGFyZURpYWxvZyIsInJlZmVycmFsQXBwUGxhdGZvcm0iOiJXZWIiLCJyZWZlcnJhbE1vZGUiOiJ2aWV3In19',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Clinical',
    author: ['M. Wael', 'ASU Faculty Stream'],
    tags: ['clinical', 'bleeding', 'disorders', 'عيادات', 'أمراض دم']
  },
  {
    id: 'bld-clin-wbc-disorders',
    title: 'محاضرة أمراض كرات الدم البيضاء واللوكيميا الإكلينيكية (WBC Disorders)',
    description: 'المحاضرة الإكلينيكية الرسمية لكلية الطب جامعة عين شمس عبر مايكروسوفت ستريم حول اضطرابات كريات الدم البيضاء.',
    url: 'https://medasuedu-my.sharepoint.com/:v:/g/personal/emp220159_med_asu_edu_eg/ESGNfSkHXwFKs26hTMdME34BDycc3DE1bPQZbejf0ndJlg?e=m3tOMF&nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJTdHJlYW1XZWJBcHAiLCJyZWZlcnJhbFZpZXciOiJTaGFyZURpYWxvZyIsInJlZmVycmFsQXBwUGxhdGZvcm0iOiJXZWIiLCJyZWZlcnJhbE1vZGUiOiJ2aWV3In19',
    type: 'website',
    category: 'lectures',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Clinical',
    author: ['M. Wael', 'ASU Faculty Stream'],
    tags: ['clinical', 'wbc', 'leukemia', 'disorders', 'عيادات']
  },

  // ==========================================
  // 11. Questions, MCQs, Essays, Formatives & Finals
  // ==========================================
  {
    id: 'bld-q-phys-mcq',
    title: 'بنك أسئلة MCQs فسيولوجي الدم (Physiology MCQs)',
    description: 'بنك أسئلة الاختيار من متعدد لمادة فسيولوجيا الدم.',
    url: 'https://t.me/MG_ASU_MED/1239',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Physiology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'mcq', 'physiology', 'فسيولوجي', 'أسئلة']
  },
  {
    id: 'bld-q-phys-essay',
    title: 'بنك الأسئلة المقالية فسيولوجي الدم (Physiology Essay)',
    description: 'تجميعة الأسئلة المقالية المقررة في فسيولوجيا موديول الدم.',
    url: 'https://t.me/MG_ASU_MED/1251',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Physiology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'essay', 'physiology', 'مقالي']
  },
  {
    id: 'bld-q-biochem-mcq',
    title: 'بنك أسئلة MCQs كيمياء حيوية الدم (Biochemistry MCQs)',
    description: 'بنك أسئلة الاختيار من متعدد لمادة بايوكيمستري الدم.',
    url: 'https://t.me/MG_ASU_MED/1271',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Biochemistry',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'mcq', 'biochemistry', 'بايوكيمستري', 'أسئلة']
  },
  {
    id: 'bld-q-biochem-essay',
    title: 'بنك الأسئلة المقالية بايوكيمستري الدم (Biochemistry Essay)',
    description: 'تجميعة الأسئلة المقالية المقررة في كيمياء حيوية الدم.',
    url: 'https://t.me/MG_ASU_MED/1280',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Biochemistry',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'essay', 'biochemistry', 'مقالي']
  },
  {
    id: 'bld-q-histo-mcq',
    title: 'بنك أسئلة MCQs هستولوجي الدم (Histology MCQs)',
    description: 'بنك أسئلة الاختيار من متعدد لمادة هستولوجيا الدم.',
    url: 'https://t.me/MG_ASU_MED/1253',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'mcq', 'histology', 'هستولوجي', 'أسئلة']
  },
  {
    id: 'bld-q-histo-essay',
    title: 'بنك الأسئلة المقالية هستولوجي الدم (Histology Essay)',
    description: 'تجميعة الأسئلة المقالية المقررة في هستولوجيا الدم.',
    url: 'https://t.me/MG_ASU_MED/1268',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Histology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'essay', 'histology', 'مقالي']
  },
  {
    id: 'bld-q-pharma-mcq',
    title: 'بنك أسئلة MCQs فارماكولوجي الدم (Pharmacology MCQs)',
    description: 'بنك أسئلة الاختيار من متعدد لمادة فارماكولوجي الدم.',
    url: 'https://t.me/MG_ASU_MED/1303',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pharmacology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'mcq', 'pharmacology', 'فارما', 'أسئلة']
  },
  {
    id: 'bld-q-pharma-essay',
    title: 'بنك الأسئلة المقالية فارما الدم (Pharmacology Essay)',
    description: 'تجميعة الأسئلة المقالية المقررة في فارماكولوجي موديول الدم.',
    url: 'https://t.me/MG_ASU_MED/1309',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pharmacology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'essay', 'pharmacology', 'مقالي']
  },
  {
    id: 'bld-q-patho-mcq',
    title: 'بنك أسئلة MCQs باثولوجي الدم (Pathology MCQs)',
    description: 'بنك أسئلة الاختيار من متعدد لمادة باثولوجيا الدم.',
    url: 'https://t.me/MG_ASU_MED/1282',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pathology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'mcq', 'pathology', 'باثولوجي', 'أسئلة']
  },
  {
    id: 'bld-q-patho-essay',
    title: 'بنك الأسئلة المقالية باثولوجي الدم (Pathology Essay)',
    description: 'تجميعة الأسئلة المقالية المقررة في باثولوجيا موديول الدم.',
    url: 'https://t.me/MG_ASU_MED/1300',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Pathology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'essay', 'pathology', 'مقالي']
  },
  {
    id: 'bld-q-para-mcq',
    title: 'بنك أسئلة MCQs طفيليات الدم (Parasitology MCQs)',
    description: 'بنك أسئلة الاختيار من متعدد لمادة باراسيتولوجي الدم.',
    url: 'https://t.me/MG_ASU_MED/1313',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Parasitology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'mcq', 'parasitology', 'بارا', 'أسئلة']
  },
  {
    id: 'bld-q-para-essay',
    title: 'بنك الأسئلة المقالية باراسيتولوجي الدم (Parasitology Essay)',
    description: 'تجميعة الأسئلة المقالية المقررة في طفيليات موديول الدم.',
    url: 'https://t.me/MG_ASU_MED/1326',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Parasitology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'essay', 'parasitology', 'مقالي']
  },
  {
    id: 'bld-q-micro-mcq',
    title: 'بنك أسئلة MCQs ميكروبيولوجي الدم (Microbiology MCQs)',
    description: 'بنك أسئلة الاختيار من متعدد لمادة ميكروبيولوجي الدم.',
    url: 'https://t.me/MG_ASU_MED/1328',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Microbiology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'mcq', 'microbiology', 'مايكرو', 'أسئلة']
  },
  {
    id: 'bld-q-micro-essay',
    title: 'بنك الأسئلة المقالية ميكروبيولوجي الدم (Microbiology Essay)',
    description: 'تجميعة الأسئلة المقالية المقررة في ميكروبيولوجي ومناعة موديول الدم.',
    url: 'https://t.me/MG_ASU_MED/1340',
    type: 'telegram',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    subject: 'Microbiology',
    author: ['M. Wael', 'MG ASU MED'],
    tags: ['questions', 'essay', 'microbiology', 'مقالي']
  },
  {
    id: 'bld-q-formatives-drive',
    title: 'درايف أرشيف امتحانات الفورماتيف (Formatives Archive Drive)',
    description: 'أرشيف امتحانات وكويزات الفورماتيف لكلية الطب جامعة عين شمس لموديول الدم.',
    url: 'https://drive.google.com/drive/folders/1vZX6X-JzuPU4IOwMaTWGRzET72Hi_2FB',
    type: 'drive',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    author: ['M. Wael', 'ASU Med Batch Drive'],
    tags: ['formatives', 'quiz', 'drive', 'فورماتيف', 'كويزات'],
    isPinned: true
  },
  {
    id: 'bld-q-assessments-final-drive',
    title: 'درايف امتحانات الفاينل والتقييمات السابقة (Assessments & Finals)',
    description: 'أرشيف امتحانات الفاينل والمدتيرم والتقييمات للسنوات السابقة لموديول الدم.',
    url: 'https://drive.google.com/drive/folders/1-bnDlLUNl7P--_jAM2-yxGgk3xY2eU1R',
    type: 'drive',
    category: 'exams',
    year: 2,
    moduleId: 'year2-blood',
    author: ['M. Wael', 'ASU Med Batch Drive'],
    tags: ['finals', 'assessments', 'exams', 'امتحانات سابقة', 'فاينل'],
    isPinned: true
  }
];

export function getAllMaterials(): MaterialItem[] {
  return materialsData;
}

export function getMaterialsByYear(year: AcademicYear): MaterialItem[] {
  return materialsData.filter((item) => item.year === year);
}

export function getMaterialsByModule(moduleId: string): MaterialItem[] {
  return materialsData.filter((item) => item.moduleId === moduleId);
}

export function getMaterialsByModuleAndSubject(moduleId: string, subject: string): MaterialItem[] {
  const targetSlug = subjectToSlug(subject);
  return materialsData.filter(
    (item) => item.moduleId === moduleId && item.subject && subjectToSlug(item.subject) === targetSlug
  );
}

export function getAllPlaylists(): MaterialItem[] {
  return materialsData.filter((item) => item.type === 'playlist' || !!item.playlistId || !!item.videos);
}

export function getPlaylistById(id: string): MaterialItem | undefined {
  return materialsData.find((item) => item.id === id && (item.type === 'playlist' || !!item.playlistId || !!item.videos));
}

export function getPinnedMaterials(): MaterialItem[] {
  return materialsData.filter((item) => item.isPinned);
}

export function getMaterialById(id: string): MaterialItem | undefined {
  return materialsData.find((item) => item.id === id);
}
