import type { SupportedLanguage, TranslationsSchema } from '../types/i18n';

export const translations: Record<SupportedLanguage, TranslationsSchema> = {
  ar: {
    nav: {
      home: 'الرئيسية',
      year: 'السنة {y}',
      search: 'البحث',
      contribute: 'شارك مصدر',
      contributors: 'المساهمون',
      changeYear: 'تغيير السنة',
      chooseYear: 'اختر سنتك',
      changeYearTitle: 'تغيير السنة والموديول',
      searchTitle: 'بحث في المواد والمصادر',
      savedResourcesTitle: 'المصادر المحفوظة',
      toggleThemeTitle: 'تبديل المظهر',
      toggleLangTitle: 'Switch to English'
    },
    home: {
      welcomeTitle: 'مرحباً بك! سنتك الدراسية المختارة:',
      welcomeDesc: 'تم ضبط الموقع على سنتك للوصول المباشر إلى موديولاتك ودرايفاتك.',
      openYearModules: 'فتح موديولات سنتك ←',
      change: 'تغيير',
      heroTitle: 'منصة مصادر كليّة الطب - جامعة عين شمس',
      heroSubtitle: 'درايفات الدفعات، قنوات التليجرام، شروحات اليوتيوب، وورق ومذكرات المذاكرة لجميع السنوات الخمس.',
      searchPlaceholder: 'ابحث عن موديول، مادة (مثل anatomy)، دكتور، أو نوع المصدر...',
      academicYears: 'السنوات الدراسية',
      comingSoon: 'قريباً',
      recentMaterials: 'أحدث المصادر المضافة',
      browseAll: 'استعراض كل المصادر'
    },
    year: {
      breadcrumbHome: 'الرئيسية',
      modulesCount: '{n} موديولات دراسية',
      materialsCount: '{n} مصادر تعليمية معتمدة',
      modulesTitle: 'موديولات السنة',
      centralDrivesTitle: 'المصادر والدرايفات المركزية',
      yearName: {
        1: 'السنة الأولى (Year 1)',
        2: 'السنة الثانية (Year 2)',
        3: 'السنة الثالثة (Year 3)',
        4: 'السنة الرابعة (Year 4)',
        5: 'السنة الخامسة (Year 5)'
      }
    },
    module: {
      breadcrumbHome: 'الرئيسية',
      yearBadge: 'السنة {y}',
      semester1: 'الترم الأول',
      semester2: 'الترم الثاني',
      allSubjects: 'جميع المواد',
      subjectsTitle: 'المواد الدراسية',
      browseModule: 'تصفح الموديول'
    },
    search: {
      title: 'دليل البحث الشامل في المصادر',
      subtitle: 'ابحث بالكلمات المفتاحية، أسماء المواد (Anatomy, Physiology, etc.)، أكواد الموديولات، أو أنواع المصادر عبر جميع السنوات الخمس.',
      placeholder: 'اكتب للبحث: مثل anatomy, ecg, pathology, مذكرات، ورق شرح، امتحانات...',
      yearFilterLabel: 'السنة:',
      allYears: 'جميع السنوات',
      typeFilterLabel: 'النوع:',
      allTypes: 'الكل',
      resultsCount: 'عرض {n} مصادر تعليمية',
      resetFilters: 'إعادة تعيين الفلاتر',
      emptyTitle: 'لم نجد مصادر مطابقة لبحثك',
      emptyDesc: 'جرب البحث بكلمات مفتاحية أخرى أو إلغاء بعض الفلاتر.'
    },
    categories: {
      central: 'درايفات وقنوات مركزية',
      lectures: 'محاضرات وشروحات الفيديو',
      practical: 'عملي وسكاشن ومعامل',
      summaries: 'ورق ومذكرات وملخصات',
      exams: 'امتحانات سابقة وريكولات',
      references: 'كتب ومراجع'
    },
    types: {
      drive: 'درايف جوجل',
      telegram: 'تليجرام',
      youtube: 'يوتيوب',
      playlist: 'قائمة تشغيل',
      whatsapp: 'واتساب',
      book: 'مرجع',
      summary: 'مذكرات',
      exam: 'امتحانات',
      website: 'موقع',
      other: 'مصدر'
    },
    card: {
      by: 'إعداد:',
      addedBy: 'مساهمة:',
      lecturesCount: '{n} فيديوهات / محاضرات',
      copyLink: 'نسخ الرابط',
      save: 'حفظ',
      openResource: 'فتح المصدر',
      copiedToast: 'تم نسخ الرابط إلى الحافظة'
    },
    bookmarks: {
      title: 'المصادر المحفوظة',
      emptyTitle: 'مفيش مصادر محفوظة لسه',
      emptyDesc: 'دوس على علامة الـ Bookmark في أي كارت علشان تحفظه هنا وتفتحه بسرعة حتى لو أوفلاين.',
      footerNote: 'محفوظة محلياً على جهازك • متاحة أوفلاين بدون نت',
      closeLabel: 'إغلاق قائمة المحفوظات',
      openBtn: 'فتح',
      removeBtn: 'حذف'
    },
    selector: {
      step1Of2: 'الخطوة 1 من 2',
      step2Of2: 'الخطوة 2 من 2',
      step1Title: 'اختر سنتك الدراسية',
      step1Desc: 'هنحفظ اختيارك علشان تظهر لك موديولات وداتا سنتك تلقائياً.',
      step2Title: 'اختر موديول أو تصفح السنة',
      step2Desc: 'اضغط على أي موديول لفتحه مباشرة، أو تصفح داتا السنة كاملة.',
      browseAllYear: 'تصفح كل داتا ومصادر السنة',
      backBtn: 'رجوع',
      closeLabel: 'إغلاق النافذة'
    },
    contribute: {
      breadcrumbHome: 'الرئيسية',
      breadcrumbContribute: 'مشاركة مادة',
      title: 'مشاركة المصادر والمذكرات',
      subtitle: 'شارك روابط درايف، قنوات، أو رسائل مجمعة وسيتم تنظيمها ونشرها للطلاب.',
      contentLabel: 'روابط المصادر أو محتوى الرسالة',
      contentPlaceholder: 'الصق الروابط (Google Drive, Telegram, YouTube) أو الصق رسائل الواتساب مباشرة...',
      detectedLinks: 'تم اكتشاف {n} رابط',
      titleLabel: 'عنوان المصدر أو الملاحظات',
      titlePlaceholder: 'مثال: مذكرات د. شيرين، درايف الدفعة، بنك أسئلة...',
      contributorLabel: 'اسمك للمساهمة',
      contributorPlaceholder: 'اسمك لحفظ حقك في المشاركة (أو اتركه فارغاً)',
      yearLabel: 'السنة الدراسية',
      yearGeneral: 'عام / غير محدد',
      moduleLabel: 'الموديول',
      moduleGeneral: 'عام / كل الموديولات',
      submitBtn: 'إرسال المصادر',
      sendingBtn: 'جاري الإرسال...',
      successTitle: 'تم استلام المصادر بنجاح!',
      successDesc: 'شكراً لمساهمتك! سيتم مراجعة الروابط وتنظيمها في المكان المناسب قريباً.',
      submitAnother: 'إرسال مصادر أخرى',
      emptyError: 'من فضلك الصق رابط المصدر أو الرسالة قبل الإرسال',
      optional: '(اختياري)'
    },
    contributors: {
      breadcrumbHome: 'الرئيسية',
      breadcrumbCurrent: 'فريق العمل والمساهمون',
      title: 'فريق العمل والمساهمون',
      subtitle: 'فريق عمل المنصة ({a}) وصناع المحتوى من الدكاترة والقنوات ({c}).',
      teamTitle: 'فريق العمل',
      creatorsTitle: 'صناع المحتوى',
      creatorsRankNote: 'مرتبون حسب عدد المصادر • اضغط على أي بطاقة للتفاصيل',
      noContributors: 'لا يوجد مساهمون مسجلون حالياً.',
      totalCount: '{n} مصدر',
      clickDetails: 'اضغط للتفاصيل',
      rank: 'المرتبة #{r} بين صناع المحتوى',
      totalResources: 'إجمالي المصادر',
      subjectsCount: 'مواد دراسية',
      byType: 'حسب نوع المصدر',
      academicYears: 'السنوات الدراسية',
      yearPrefix: 'سنة {y}:',
      viewAll: 'عرض كل مصادره ({n})'
    },
    contacts: {
      whatsapp: 'واتساب',
      telegram: 'تليجرام',
      instagram: 'انستجرام'
    },
    common: {
      close: 'إغلاق',
      completed: 'مكتمل ✓'
    },
    toast: {
      later: 'لاحقاً',
      close: 'إغلاق',
      dismissAria: 'إغلاق التنبيه'
    },
    playlists: {
      breadcrumbHome: 'الرئيسية',
      breadcrumbModule: 'موديول الدم',
      breadcrumbCurrent: 'قوائم التشغيل',
      title: 'قوائم التشغيل',
      subtitle: 'شروحات وسلاسل الفيديو لموديول الدم.',
      backToModule: 'كل مصادر موديول الدم ←',
      allSubjects: 'جميع المواد',
      allPlaylistsCount: 'جميع المواد ({n})',
      progress: 'التقدم',
      reset: 'إعادة ضبط',
      markCompleted: 'تحديد كمكتمل',
      completed: 'مكتمل ✓',
      seriesCompleted: 'السلسلة مكتملة ✓',
      lectures: 'المحاضرات',
      markAllDone: 'تحديد الكل ✓',
      nowPlaying: 'قيد التشغيل',
      prevVideo: 'الفيديو السابق',
      nextVideo: 'الفيديو التالي',
      lecturePrefix: 'محاضرة',
      resetConfirm: 'هل تريد بالتأكيد إعادة ضبط سجل المشاهدة لهذه القائمة؟'
    },
    pwa: {
      installPrompt: 'تثبيت المنصة كتطبيق على جهازك للوصول السريع بدون إنترنت.',
      installBtn: 'تثبيت الآن',
      laterBtn: 'لاحقاً'
    },
    footer: {
      tagline: 'المنصة الشاملة لمصادر طب عين شمس',
      university: 'كلية الطب جامعة عين شمس',
      madeBy: 'Made by',
      shareResource: 'شارك مصدراً أو درايف',
      contributors: 'فريق العمل والمساهمون',
      searchCatalog: 'دليل البحث الشامل'
    }
  },
  en: {
    nav: {
      home: 'Home',
      year: 'Year {y}',
      search: 'Search',
      contribute: 'Contribute',
      contributors: 'Contributors',
      changeYear: 'Change Year',
      chooseYear: 'Choose Year',
      changeYearTitle: 'Change Year & Module',
      searchTitle: 'Search Materials & Subjects',
      savedResourcesTitle: 'Saved Bookmarks',
      toggleThemeTitle: 'Toggle Theme',
      toggleLangTitle: 'التبديل إلى العربية'
    },
    home: {
      welcomeTitle: 'Welcome! Your Selected Year:',
      welcomeDesc: 'The site is configured to your year for direct access to your modules and drives.',
      openYearModules: 'Open Year Modules →',
      change: 'Change',
      heroTitle: 'ASU Faculty of Medicine Materials Hub',
      heroSubtitle: 'Batch drives, Telegram channels, YouTube lectures, and study notes across all five years.',
      searchPlaceholder: 'Search modules, subjects (e.g. anatomy), professors, or resource types...',
      academicYears: 'Academic Years',
      comingSoon: 'Coming Soon',
      recentMaterials: 'Recently Added Materials',
      browseAll: 'Browse All Materials'
    },
    year: {
      breadcrumbHome: 'Home',
      modulesCount: '{n} Study Modules',
      materialsCount: '{n} Verified Resources',
      modulesTitle: 'Year Modules',
      centralDrivesTitle: 'Central Batch Resources',
      yearName: {
        1: 'Year 1',
        2: 'Year 2',
        3: 'Year 3',
        4: 'Year 4',
        5: 'Year 5'
      }
    },
    module: {
      breadcrumbHome: 'Home',
      yearBadge: 'Year {y}',
      semester1: 'Semester 1',
      semester2: 'Semester 2',
      allSubjects: 'All Subjects',
      subjectsTitle: 'Subjects',
      browseModule: 'Browse Module'
    },
    search: {
      title: 'Comprehensive Resource Catalog & Search',
      subtitle: 'Search by keywords, subject names (Anatomy, Physiology, etc.), module codes, or resource types across all five years.',
      placeholder: 'Search by keyword: e.g. anatomy, ecg, pathology, notes, summaries, exams...',
      yearFilterLabel: 'Year:',
      allYears: 'All Years',
      typeFilterLabel: 'Type:',
      allTypes: 'All',
      resultsCount: 'Showing {n} study resources',
      resetFilters: 'Reset Filters',
      emptyTitle: 'No resources found matching your search',
      emptyDesc: 'Try different search keywords or remove some filters.'
    },
    categories: {
      central: 'Central Batch Drives & Channels',
      lectures: 'Lectures & Video Explanations',
      practical: 'Practical, Labs & Sessions',
      summaries: 'Notes, Summaries & Handouts',
      exams: 'Past Exams & Recalls',
      references: 'Books & Medical References'
    },
    types: {
      drive: 'Google Drive',
      telegram: 'Telegram',
      youtube: 'YouTube',
      playlist: 'Playlist',
      whatsapp: 'WhatsApp',
      book: 'Reference Book',
      summary: 'Notes / Summary',
      exam: 'Past Exams',
      website: 'Website',
      other: 'Resource'
    },
    card: {
      by: 'By:',
      addedBy: 'Added by:',
      lecturesCount: '{n} lectures / videos',
      copyLink: 'Copy Link',
      save: 'Save',
      openResource: 'Open Resource',
      copiedToast: 'Link copied to clipboard'
    },
    bookmarks: {
      title: 'Saved Resources',
      emptyTitle: 'No saved resources yet',
      emptyDesc: 'Click the Bookmark icon on any card to save it here for fast offline access.',
      footerNote: 'Saved locally on your device • Available offline',
      closeLabel: 'Close bookmarks drawer',
      openBtn: 'Open',
      removeBtn: 'Remove'
    },
    selector: {
      step1Of2: 'Step 1 of 2',
      step2Of2: 'Step 2 of 2',
      step1Title: 'Choose Your Academic Year',
      step1Desc: 'We will remember your selection to show your year modules and materials automatically.',
      step2Title: 'Choose a Module or Browse Year',
      step2Desc: 'Click any module to open it directly, or browse all year resources.',
      browseAllYear: 'Browse All Year Resources',
      backBtn: 'Back',
      closeLabel: 'Close selection modal'
    },
    contribute: {
      breadcrumbHome: 'Home',
      breadcrumbContribute: 'Contribute',
      title: 'Share Study Materials',
      subtitle: 'Share drives, lecture playlists, or study notes to support fellow medical students.',
      contentLabel: 'Resource Links or Content',
      contentPlaceholder: 'Paste links (Google Drive, Telegram, YouTube) or paste full WhatsApp messages...',
      detectedLinks: '{n} link(s) detected',
      titleLabel: 'Title or Notes',
      titlePlaceholder: 'e.g. Dr. Shireen notes, Batch Drive, Question Bank...',
      contributorLabel: 'Contributor Name',
      contributorPlaceholder: 'Your name for attribution (or leave blank)',
      yearLabel: 'Academic Year',
      yearGeneral: 'General / Unspecified',
      moduleLabel: 'Module',
      moduleGeneral: 'General / All Modules',
      submitBtn: 'Submit Materials',
      sendingBtn: 'Submitting...',
      successTitle: 'Materials Submitted Successfully!',
      successDesc: 'Thank you for contributing! Your submission will be reviewed and cataloged shortly.',
      submitAnother: 'Submit More Materials',
      emptyError: 'Please enter a link or paste content before submitting.',
      optional: '(Optional)'
    },
    contributors: {
      breadcrumbHome: 'Home',
      breadcrumbCurrent: 'Team & Contributors',
      title: 'Team & Contributors',
      subtitle: 'Platform team ({a}) and content creators from doctors and educational channels ({c}).',
      teamTitle: 'Core Team',
      creatorsTitle: 'Content Creators',
      creatorsRankNote: 'Ranked by resource count • Click any card for details',
      noContributors: 'No contributors registered yet.',
      totalCount: '{n} resources',
      clickDetails: 'Click for details',
      rank: 'Rank #{r} among content creators',
      totalResources: 'Total Resources',
      subjectsCount: 'Subjects',
      byType: 'By Resource Type',
      academicYears: 'Academic Years',
      yearPrefix: 'Year {y}:',
      viewAll: 'View all resources ({n})'
    },
    contacts: {
      whatsapp: 'WhatsApp',
      telegram: 'Telegram',
      instagram: 'Instagram'
    },
    common: {
      close: 'Close',
      completed: 'Completed ✓'
    },
    toast: {
      later: 'Later',
      close: 'Close',
      dismissAria: 'Dismiss notification'
    },
    playlists: {
      breadcrumbHome: 'Home',
      breadcrumbModule: 'Blood Module',
      breadcrumbCurrent: 'Playlists',
      title: 'Playlists & Video Series',
      subtitle: 'Video lectures and playlists for the Blood & Lymphatic System module.',
      backToModule: '← All Blood Module Resources',
      allSubjects: 'All Subjects',
      allPlaylistsCount: 'All Subjects ({n})',
      progress: 'Progress',
      reset: 'Reset',
      markCompleted: 'Mark as Completed',
      completed: 'Completed ✓',
      seriesCompleted: 'Series Completed ✓',
      lectures: 'Lectures',
      markAllDone: 'Mark All ✓',
      nowPlaying: 'Now Playing',
      prevVideo: 'Previous Video',
      nextVideo: 'Next Video',
      lecturePrefix: 'Lecture',
      resetConfirm: 'Are you sure you want to reset watch progress for this playlist?'
    },
    pwa: {
      installPrompt: 'Install app on your device for fast offline access anytime.',
      installBtn: 'Install Now',
      laterBtn: 'Later'
    },
    footer: {
      tagline: 'All-in-one Medical Study Hub for ASU',
      university: 'Ain Shams University Faculty of Medicine',
      madeBy: 'Made by',
      shareResource: 'Share a Resource or Drive',
      contributors: 'Team & Contributors',
      searchCatalog: 'Comprehensive Search'
    }
  }
};
