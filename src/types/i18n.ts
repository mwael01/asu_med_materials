export type SupportedLanguage = 'en' | 'ar';

export interface TranslationsSchema {
  nav: {
    home: string;
    year: string; // e.g. "Year {y}" / "السنة {y}"
    search: string;
    contribute: string;
    contributors: string;
    changeYear: string;
    chooseYear: string;
    changeYearTitle: string;
    searchTitle: string;
    savedResourcesTitle: string;
    feedback: string;
    toggleThemeTitle: string;
    toggleLangTitle: string;
    menu: string;
    academicYears: string;
  };
  home: {
    heroTitle: string;
    heroSubtitle: string;
    searchPlaceholder: string;
    academicYears: string;
    comingSoon: string;
    recentMaterials: string;
    browseAll: string;
    myModules: string;
    myLibrary: string;
    myLibrarySubtitle: string;
    unstudiedOnly: string;
    allModules: string;
    completedCount: string;
    allCompletedFilter: string;
    newFolder: string;
    createFolder: string;
    folderNamePlaceholder: string;
    allSaved: string;
    deleteFolderConfirm: string;
    manageFolders: string;
    noModulesFound: string;
  };
  year: {
    breadcrumbHome: string;
    modulesCount: string; // "{n} study modules" / "{n} موديولات دراسية"
    materialsCount: string; // "{n} verified resources" / "{n} مصادر تعليمية معتمدة"
    modulesTitle: string;
    centralDrivesTitle: string;
    yearName: Record<number, string>;
  };
  module: {
    breadcrumbHome: string;
    yearBadge: string;
    semester1: string;
    semester2: string;
    allSubjects: string;
    subjectsTitle: string;
    browseModule: string;
    activeSubject: string;
  };
  search: {
    title: string;
    subtitle: string;
    placeholder: string;
    yearFilterLabel: string;
    allYears: string;
    typeFilterLabel: string;
    allTypes: string;
    resultsCount: string; // "Showing {n} study resources" / "عرض {n} مصادر تعليمية"
    resetFilters: string;
    emptyTitle: string;
    emptyDesc: string;
  };
  categories: {
    central: string;
    lectures: string;
    practical: string;
    summaries: string;
    exams: string;
    references: string;
  };
  types: {
    drive: string;
    telegram: string;
    youtube: string;
    playlist: string;
    whatsapp: string;
    book: string;
    summary: string;
    exam: string;
    website: string;
    other: string;
  };
  card: {
    by: string; // "By:" / "إعداد:"
    addedBy: string; // "Added by:" / "مساهمة:"
    lecturesCount: string; // "{n} lectures / videos" / "{n} فيديوهات / محاضرات"
    copyLink: string;
    save: string;
    openResource: string;
    copiedToast: string;
    markStudied: string;
    unmarkStudied: string;
    studiedToast: string;
    unstudiedToast: string;
  };
  bookmarks: {
    title: string;
    emptyTitle: string;
    emptyDesc: string;
    footerNote: string;
    closeLabel: string;
    openBtn: string;
    removeBtn: string;
    filterAll: string;
    filterUnstudied: string;
    studiedProgress: string;
    viewInHome: string;
  };
  selector: {
    title: string;
    closeLabel: string;
  };
  contribute: {
    breadcrumbHome: string;
    breadcrumbContribute: string;
    title: string;
    subtitle: string;
    contentLabel: string;
    contentPlaceholder: string;
    detectedLinks: string;
    titleLabel: string;
    titlePlaceholder: string;
    contributorLabel: string;
    contributorPlaceholder: string;
    yearLabel: string;
    yearGeneral: string;
    moduleLabel: string;
    moduleGeneral: string;
    submitBtn: string;
    sendingBtn: string;
    successTitle: string;
    successDesc: string;
    submitAnother: string;
    emptyError: string;
    optional: string;
    toFeedbackPrompt: string;
    toFeedbackLink: string;
  };
  contributors: {
    breadcrumbHome: string;
    breadcrumbCurrent: string;
    title: string;
    subtitle: string;
    teamTitle: string;
    creatorsTitle: string;
    creatorsRankNote: string;
    noContributors: string;
    totalCount: string;
    clickDetails: string;
    rank: string;
    totalResources: string;
    subjectsCount: string;
    byType: string;
    academicYears: string;
    yearPrefix: string;
    viewAll: string;
    resourceTitle: string;
    resourceRankNote: string;
    resourceRank: string;
    viewAllAdded: string;
    showAllCreators: string;
    showLess: string;
  };
  contacts: {
    whatsapp: string;
    telegram: string;
    instagram: string;
  };
  common: {
    close: string;
    completed: string;
  };
  toast: {
    later: string;
    close: string;
    dismissAria: string;
  };
  playlists: {
    breadcrumbHome: string;
    breadcrumbModule: string;
    breadcrumbCurrent: string;
    title: string;
    subtitle: string;
    backToModule: string;
    allSubjects: string;
    allPlaylistsCount: string;
    progress: string;
    reset: string;
    markCompleted: string;
    completed: string;
    seriesCompleted: string;
    lectures: string;
    markAllDone: string;
    nowPlaying: string;
    prevVideo: string;
    nextVideo: string;
    lecturePrefix: string;
    resetConfirm: string;
  };
  pwa: {
    installPrompt: string;
    installBtn: string;
    laterBtn: string;
  };
  feedback: {
    breadcrumbHome: string;
    breadcrumbFeedback: string;
    title: string;
    subtitle: string;
    categoryLabel: string;
    categorySuggestion: string;
    categoryContentIssue: string;
    categoryBug: string;
    categoryGeneral: string;
    messageLabel: string;
    messagePlaceholder: string;
    yearLabel: string;
    yearGeneral: string;
    moduleLabel: string;
    moduleGeneral: string;
    senderNameLabel: string;
    senderNamePlaceholder: string;
    contactLabel: string;
    contactPlaceholder: string;
    submitBtn: string;
    sendingBtn: string;
    successTitle: string;
    successDesc: string;
    submitAnother: string;
    emptyError: string;
    optional: string;
    toContributePrompt: string;
    toContributeLink: string;
  };
  footer: {
    tagline: string;
    university: string;
    madeBy: string;
    shareResource: string;
    contributors: string;
    feedback: string;
    searchCatalog: string;
  };
}
