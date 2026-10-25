import type { AcademicYear, MaterialItem, ModuleInfo } from '../types/materials';
import type { Lesson, LessonDoctor, StudyEntry } from '../types/lessons';
import type { MaterialCollection, CollectionWithMaterials } from '../types/collections';
import type { NavCrumb } from '../types/navigation';
import type { PracticalImageFolder } from '../types/practicalImages';
import type { SitemapEntry } from '../types/seo';
import { subjectToSlug } from './slug';
import { isRevisionLesson, lessonDoctors, lessonPath, lessonsForSubject } from './lessons';
import { isMaterialAssignedToLesson } from './materialLessonLinks';
import { isPracticalImageMaterial, practicalFolderImages, practicalImagePath } from './practicalImages';
import { getDoctorMaterialCounts, isFlashcards } from './studyContent';
import { getDocumentEmbedUrl, hasDiscreteDocuments, isPdfDocument } from './documentViewer';

export const PRIMARY_SITE_ORIGIN = 'https://asumedmaterials.vercel.app';
export const SECONDARY_SITE_ORIGIN = 'https://asumed.vercel.app';
export const SITE_NAME = 'ASU Med';
export const UNIVERSITY_NAME = 'Ain Shams University Faculty of Medicine';
export const DEFAULT_OG_IMAGE = '/icons/icon-512.png';

/**
 * Resolves the canonical origin for the website.
 * Always defaults to https://asumedmaterials.vercel.app unless PUBLIC_SITE_URL is explicitly configured,
 * ensuring requests on asumed.vercel.app or preview deployments consolidate SEO signals onto the primary domain.
 */
export function resolveSiteOrigin(envSiteUrl?: string): string {
  const configured = envSiteUrl?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  return PRIMARY_SITE_ORIGIN;
}

/**
 * Builds a clean, canonical absolute URL on the primary origin.
 * Strips query parameters (e.g. ?item=, ?document=, ?image=, ?redirect=) and normalizes trailing slashes.
 */
export function buildCanonicalUrl(origin: string, pathOrUrl: string): string {
  const base = resolveSiteOrigin(origin);
  if (!pathOrUrl) return `${base}/`;

  let pathname = pathOrUrl;
  try {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      pathname = new URL(pathOrUrl).pathname;
    } else {
      pathname = pathOrUrl.split(/[?#]/)[0] || '/';
    }
  } catch {
    pathname = pathOrUrl.split(/[?#]/)[0] || '/';
  }

  if (!pathname.startsWith('/')) {
    pathname = '/' + pathname;
  }
  if (pathname.length > 1) {
    pathname = pathname.replace(/\/+$/, '');
  }
  return `${base}${pathname}`;
}

export function normalizeAuthors(author?: string | string[]): string[] {
  if (!author) return [];
  const raw = Array.isArray(author) ? author : [author];
  return raw.map((a) => a.trim()).filter(Boolean);
}

export function truncateMetaDescription(text: string, maxLength = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced).replace(/[,.;:!\s]+$/, '') + '…';
}

export function buildYearSeo(year: AcademicYear | number, modules: ModuleInfo[]) {
  const activeModules = modules.filter((m) => m.active !== false && !/^year\d+-reference-books$/.test(m.id));
  const moduleNames = activeModules.map((m) => m.title).slice(0, 6);
  const moduleSummary = moduleNames.length > 0 ? ` Modules include ${moduleNames.join(', ')}.` : '';

  const title = `Year ${year} Medical Modules & Study Materials | ${SITE_NAME}`;
  const description = truncateMetaDescription(
    `Browse Year ${year} curriculum modules, lectures, PDFs, flashcards, and study notes for ${UNIVERSITY_NAME}.${moduleSummary}`,
    165
  );
  const keywords = [
    `Year ${year} ASU Medicine`,
    `Ain Shams Medicine Year ${year}`,
    `ASU Med Year ${year}`,
    ...moduleNames
  ];

  return { title, description, keywords };
}

export function buildModuleSeo(module: ModuleInfo, activeSubjects: string[]) {
  const subjects = activeSubjects.length > 0 ? activeSubjects : module.subjects;
  const subjectList = subjects.slice(0, 8).join(', ');
  const rawDesc = module.description?.trim();

  const title = `${module.title} (Year ${module.year}) - Lectures, PDFs & Notes | ${SITE_NAME}`;
  const description = truncateMetaDescription(
    rawDesc
      ? `${module.title} (Year ${module.year}): ${rawDesc}. Subjects: ${subjectList} (${UNIVERSITY_NAME}).`
      : `${module.title} (Year ${module.year}) lectures, doctor playlists, PDFs, and flashcards across ${subjectList || 'all subjects'} at ${UNIVERSITY_NAME}.`,
    165
  );
  const keywords = [
    module.title,
    ...(module.titleAr ? [module.titleAr] : []),
    module.code,
    `Year ${module.year} ${module.title}`,
    `ASU Medicine ${module.title}`,
    ...subjects.map((s) => `${s} ${module.title}`)
  ].filter(Boolean);

  return { title, description, keywords };
}

export function buildSubjectSeo(
  module: ModuleInfo,
  subject: string,
  lessons: Lesson[],
  materialsCount: number
) {
  const regularLessons = lessons.filter((l) => !isRevisionLesson(l));
  const topLessonNames = regularLessons.slice(0, 4).map((l) => l.title);
  const lessonsPreview = topLessonNames.length > 0 ? ` Lessons: ${topLessonNames.join(', ')}.` : '';

  const title = `${subject} - ${module.title} (Year ${module.year}) | ${SITE_NAME}`;
  const description = truncateMetaDescription(
    `${subject} in ${module.title} (Year ${module.year}): ${regularLessons.length || lessons.length} lessons and ${materialsCount} study materials.${lessonsPreview} (${UNIVERSITY_NAME})`,
    165
  );
  const keywords = [
    `${subject} ${module.title}`,
    `${subject} ASU Medicine`,
    `Year ${module.year} ${subject}`,
    ...topLessonNames
  ];

  return { title, description, keywords };
}

export function buildLessonSeo(
  module: ModuleInfo,
  lesson: Lesson,
  doctors: LessonDoctor[],
  materials: MaterialItem[]
) {
  const doctorNames = doctors.map((d) => d.name).slice(0, 5);
  const doctorsPreview =
    doctorNames.length > 0 ? ` Lectures & notes by ${doctorNames.join(', ')}.` : '';

  const title = `${lesson.title} - ${lesson.subject} (${module.title}) | ${SITE_NAME}`;
  const description = truncateMetaDescription(
    `${lesson.title} in ${lesson.subject} (${module.title}, Year ${module.year}).${doctorsPreview} ${materials.length} curated videos, PDFs, and flashcards at ${UNIVERSITY_NAME}.`,
    165
  );
  const keywords = [
    lesson.title,
    `${lesson.title} ${lesson.subject}`,
    `${lesson.subject} ${module.title}`,
    ...doctorNames.map((name) => `${name} ${lesson.title}`),
    ...doctorNames
  ];

  return { title, description, keywords };
}

export function buildDoctorSeo(
  module: ModuleInfo,
  lesson: Lesson,
  doctor: LessonDoctor,
  entries: StudyEntry[]
) {
  const counts = getDoctorMaterialCounts(doctor.items);
  const parts: string[] = [];
  if (counts.videos > 0) parts.push(`${counts.videos} ${counts.videos === 1 ? 'video' : 'videos'}`);
  if (counts.pdfs > 0) parts.push(`${counts.pdfs} ${counts.pdfs === 1 ? 'PDF' : 'PDFs'}`);
  if (counts.mcqs > 0) parts.push(`${counts.mcqs} ${counts.mcqs === 1 ? 'MCQ' : 'MCQs'}`);
  if (counts.links > 0) parts.push(`${counts.links} ${counts.links === 1 ? 'resource' : 'resources'}`);

  const summaryCounts = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  const entryTitles = entries
    .map((e) => e.title)
    .filter(Boolean)
    .slice(0, 3);
  const entryPreview = entryTitles.length > 0 ? ` Includes: ${entryTitles.join(', ')}.` : '';

  const title = `${doctor.name} - ${lesson.title} (${lesson.subject} - ${module.title}) | ${SITE_NAME}`;
  const description = truncateMetaDescription(
    `${doctor.name} lectures & study materials for ${lesson.title} in ${lesson.subject}, ${module.title} (Year ${module.year})${summaryCounts}.${entryPreview}`,
    165
  );
  const keywords = [
    doctor.name,
    `${doctor.name} ${lesson.subject}`,
    `${doctor.name} ${lesson.title}`,
    `${doctor.name} ${module.title}`,
    `${lesson.title} ${lesson.subject}`,
    `ASU Medicine ${doctor.name}`
  ];

  return { title, description, keywords };
}

export function buildPracticalImagesSeo(
  module: ModuleInfo,
  lesson: Lesson,
  folder: PracticalImageFolder,
  imagesCount: number
) {
  const title = `${folder.title} - ${lesson.title} (${lesson.subject}) | ${SITE_NAME}`;
  const description = truncateMetaDescription(
    `Practice ${folder.title} (${imagesCount} high-resolution practical images & slides) for ${lesson.title} in ${lesson.subject}, ${module.title} (Year ${module.year}) at ${UNIVERSITY_NAME}.`,
    165
  );
  const keywords = [
    folder.title,
    `${lesson.subject} practical images`,
    `${lesson.subject} slides`,
    `${lesson.title} ${folder.title}`,
    module.title
  ];

  return { title, description, keywords };
}

export function buildPlaylistSeo(playlist: MaterialItem, moduleInfo?: ModuleInfo | null) {
  const displayTitle = playlist.titleEn || playlist.title;
  const authors = normalizeAuthors(playlist.author);
  const authorBy = authors.length > 0 ? ` by ${authors.join(', ')}` : '';
  const videoCount = playlist.videos?.length || 0;
  const countLabel = videoCount > 0 ? ` (${videoCount} lectures)` : '';
  const contextParts = [playlist.subject, moduleInfo?.title, playlist.year ? `Year ${playlist.year}` : '']
    .filter(Boolean)
    .join(' • ');

  const title = `${displayTitle}${authors[0] ? ` - ${authors[0]}` : ''} | ${SITE_NAME}`;
  const rawDesc = playlist.descriptionEn || playlist.description;
  const description = truncateMetaDescription(
    rawDesc
      ? `${displayTitle}${authorBy}${countLabel}: ${rawDesc} (${contextParts}).`
      : `Watch ${displayTitle}${authorBy}${countLabel} for ${contextParts || UNIVERSITY_NAME} on ${SITE_NAME} with interactive lecture tracking.`,
    165
  );
  const keywords = [
    displayTitle,
    ...(playlist.title !== displayTitle ? [playlist.title] : []),
    ...authors,
    ...(playlist.subject ? [playlist.subject] : []),
    ...(moduleInfo ? [moduleInfo.title] : []),
    ...(playlist.tags || [])
  ].filter(Boolean);

  return { title, description, keywords };
}

export function buildViewerSeo(
  material: MaterialItem,
  moduleInfo?: ModuleInfo | null,
  documentsCount = 1
) {
  const displayTitle = material.titleEn || material.title;
  const authors = normalizeAuthors(material.author);
  const authorBy = authors.length > 0 ? ` by ${authors.join(', ')}` : '';
  const bundleLabel = documentsCount > 1 ? ` (${documentsCount} documents)` : '';
  const contextParts = [material.subject, moduleInfo?.title, material.year ? `Year ${material.year}` : '']
    .filter(Boolean)
    .join(' • ');

  const title = `${displayTitle}${authors[0] ? ` - ${authors[0]}` : ''} | ${SITE_NAME}`;
  const rawDesc = material.descriptionEn || material.description;
  const description = truncateMetaDescription(
    rawDesc
      ? `${displayTitle}${authorBy}${bundleLabel}: ${rawDesc} (${contextParts}).`
      : `Read and download ${displayTitle}${authorBy}${bundleLabel} for ${contextParts || UNIVERSITY_NAME} on ${SITE_NAME}.`,
    165
  );
  const keywords = [
    displayTitle,
    ...(material.title !== displayTitle ? [material.title] : []),
    ...authors,
    ...(material.subject ? [material.subject] : []),
    ...(moduleInfo ? [moduleInfo.title] : []),
    ...(material.tags || [])
  ].filter(Boolean);

  return { title, description, keywords };
}

export function buildCollectionSeo(collection: CollectionWithMaterials, moduleInfo?: ModuleInfo | null) {
  const displayTitle = collection.titleEn || collection.title;
  const totalCount = collection.totalMaterialsCount ?? collection.materials.length;
  const contextParts = [
    collection.category ? `${collection.category.charAt(0).toUpperCase() + collection.category.slice(1)} Collection` : '',
    moduleInfo?.title,
    collection.year ? `Year ${collection.year}` : ''
  ]
    .filter(Boolean)
    .join(' • ');

  const title = `${displayTitle} (${moduleInfo?.title || `Year ${collection.year}`}) | ${SITE_NAME}`;
  const rawDesc = collection.descriptionEn || collection.description;
  const description = truncateMetaDescription(
    rawDesc
      ? `${displayTitle}: ${rawDesc} (${totalCount} study materials • ${contextParts}).`
      : `Explore ${displayTitle} with ${totalCount} curated study materials (${contextParts}) for ${UNIVERSITY_NAME}.`,
    165
  );
  const keywords = [
    displayTitle,
    ...(collection.title !== displayTitle ? [collection.title] : []),
    ...(moduleInfo ? [moduleInfo.title] : []),
    `Year ${collection.year} ${collection.category}`
  ].filter(Boolean);

  return { title, description, keywords };
}

export function buildFlashcardsSeo(deckTitle: string, cardsCount: number) {
  const title = `${deckTitle} - Medical Flashcards | ${SITE_NAME}`;
  const countText = cardsCount > 0 ? `${cardsCount} interactive flashcards` : 'Interactive flashcards';
  const description = truncateMetaDescription(
    `Study ${deckTitle} (${countText}) with spaced repetition and offline progress tracking for ${UNIVERSITY_NAME} on ${SITE_NAME}.`,
    165
  );
  const keywords = [deckTitle, `${deckTitle} flashcards`, 'ASU Med flashcards', 'Ain Shams Medicine flashcards'];
  return { title, description, keywords };
}

// ─── JSON-LD Structured Data Builders ─────────────────────────────────────────

export function buildWebsiteJsonLd(origin = PRIMARY_SITE_ORIGIN): Record<string, unknown> {
  const base = resolveSiteOrigin(origin);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        name: SITE_NAME,
        alternateName: [
          'ASU Med Materials',
          'asumedmaterials',
          'Ain Shams University Medical Study Hub',
          'ASU Faculty of Medicine Study Materials'
        ],
        url: `${base}/`,
        sameAs: [SECONDARY_SITE_ORIGIN],
        inLanguage: ['en', 'ar'],
        publisher: {
          '@id': `${base}/#organization`
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${base}/search?q={search_term_string}`
          },
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'EducationalOrganization',
        '@id': `${base}/#organization`,
        name: `${SITE_NAME} - ${UNIVERSITY_NAME}`,
        url: `${base}/`,
        sameAs: [SECONDARY_SITE_ORIGIN],
        logo: {
          '@type': 'ImageObject',
          url: `${base}${DEFAULT_OG_IMAGE}`
        }
      }
    ]
  };
}

export function buildBreadcrumbJsonLd(
  origin: string,
  crumbs: NavCrumb[] | undefined,
  currentPath: string
): Record<string, unknown> | null {
  if (!crumbs || crumbs.length === 0) return null;
  const base = resolveSiteOrigin(origin);

  const itemListElement: Record<string, unknown>[] = [
    {
      '@type': 'ListItem',
      position: 1,
      name: SITE_NAME,
      item: `${base}/`
    }
  ];

  crumbs.forEach((crumb, idx) => {
    const isLast = idx === crumbs.length - 1;
    const itemUrl = crumb.href
      ? buildCanonicalUrl(base, crumb.href)
      : isLast
        ? buildCanonicalUrl(base, currentPath)
        : undefined;

    const entry: Record<string, unknown> = {
      '@type': 'ListItem',
      position: idx + 2,
      name: crumb.title
    };
    if (itemUrl) {
      entry.item = itemUrl;
    }
    itemListElement.push(entry);
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement
  };
}

export function buildModuleJsonLd(
  origin: string,
  module: ModuleInfo,
  subjects: string[]
): Record<string, unknown> {
  const base = resolveSiteOrigin(origin);
  const url = buildCanonicalUrl(base, `/module/${encodeURIComponent(module.id)}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: module.title,
    ...(module.titleAr ? { alternateName: module.titleAr } : {}),
    courseCode: module.code,
    description:
      module.description ||
      `${module.title} (Year ${module.year}) curriculum module at ${UNIVERSITY_NAME}.`,
    url,
    educationalLevel: `Year ${module.year}`,
    provider: {
      '@type': 'EducationalOrganization',
      name: UNIVERSITY_NAME,
      url: `${base}/`
    },
    hasPart: subjects.map((subject) => ({
      '@type': 'Course',
      name: `${subject} - ${module.title}`,
      url: buildCanonicalUrl(base, `/module/${encodeURIComponent(module.id)}/${subjectToSlug(subject)}`)
    }))
  };
}

export function buildSubjectJsonLd(
  origin: string,
  module: ModuleInfo,
  subject: string,
  lessons: Lesson[]
): Record<string, unknown> {
  const base = resolveSiteOrigin(origin);
  const url = buildCanonicalUrl(base, `/module/${encodeURIComponent(module.id)}/${subjectToSlug(subject)}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${subject} - ${module.title}`,
    description: `Lessons, lectures, and study resources for ${subject} in ${module.title} (Year ${module.year}).`,
    url,
    isPartOf: {
      '@type': 'Course',
      name: module.title,
      url: buildCanonicalUrl(base, `/module/${encodeURIComponent(module.id)}`)
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: lessons.length,
      itemListElement: lessons.map((lesson, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: lesson.title,
        url: buildCanonicalUrl(base, lessonPath(lesson))
      }))
    }
  };
}

export function buildLessonJsonLd(
  origin: string,
  module: ModuleInfo,
  lesson: Lesson,
  doctors: LessonDoctor[]
): Record<string, unknown> {
  const base = resolveSiteOrigin(origin);
  const url = buildCanonicalUrl(base, lessonPath(lesson));
  return {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: `${lesson.title} (${lesson.subject} - ${module.title})`,
    learningResourceType: 'Lesson',
    educationalLevel: `Year ${module.year}`,
    url,
    isPartOf: {
      '@type': 'Course',
      name: `${lesson.subject} - ${module.title}`,
      url: buildCanonicalUrl(base, `/module/${encodeURIComponent(module.id)}/${subjectToSlug(lesson.subject)}`)
    },
    ...(doctors.length > 0
      ? {
          hasPart: doctors.map((doctor) => ({
            '@type': 'CollectionPage',
            name: `${doctor.name} - ${lesson.title}`,
            url: buildCanonicalUrl(base, `${lessonPath(lesson)}/doctor/${doctor.key}`),
            author: {
              '@type': doctor.key === 'department' ? 'EducationalOrganization' : 'Person',
              name: doctor.name
            }
          }))
        }
      : {})
  };
}

export function buildDoctorJsonLd(
  origin: string,
  module: ModuleInfo,
  lesson: Lesson,
  doctor: LessonDoctor,
  entries: StudyEntry[]
): Record<string, unknown> {
  const base = resolveSiteOrigin(origin);
  const url = buildCanonicalUrl(base, `${lessonPath(lesson)}/doctor/${doctor.key}`);
  const isDepartment = doctor.key === 'department';

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${doctor.name} - ${lesson.title} (${lesson.subject} - ${module.title})`,
    description: `Lectures, PDFs, and study materials by ${doctor.name} for ${lesson.title} in ${lesson.subject} (${module.title}, Year ${module.year}).`,
    url,
    about: {
      '@type': 'LearningResource',
      name: lesson.title,
      educationalLevel: `Year ${module.year}`
    },
    author: {
      '@type': isDepartment ? 'EducationalOrganization' : 'Person',
      name: doctor.name,
      affiliation: {
        '@type': 'EducationalOrganization',
        name: UNIVERSITY_NAME
      }
    },
    isPartOf: {
      '@type': 'LearningResource',
      name: `${lesson.title} - ${lesson.subject}`,
      url: buildCanonicalUrl(base, lessonPath(lesson))
    },
    ...(entries.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: entries.length,
            itemListElement: entries.slice(0, 50).map((entry, idx) => ({
              '@type': 'ListItem',
              position: idx + 1,
              item: {
                '@type': entry.tab === 'videos' ? 'VideoObject' : 'LearningResource',
                name: entry.title,
                learningResourceType: entry.tab,
                author: {
                  '@type': isDepartment ? 'EducationalOrganization' : 'Person',
                  name: doctor.name
                }
              }
            }))
          }
        }
      : {})
  };
}

export function buildPlaylistJsonLd(
  origin: string,
  playlist: MaterialItem,
  moduleInfo?: ModuleInfo | null
): Record<string, unknown> {
  const base = resolveSiteOrigin(origin);
  const url = buildCanonicalUrl(base, `/playlist/${encodeURIComponent(playlist.id)}`);
  const displayTitle = playlist.titleEn || playlist.title;
  const authors = normalizeAuthors(playlist.author);
  const videos = playlist.videos || [];

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: displayTitle,
    description:
      playlist.descriptionEn ||
      playlist.description ||
      `Lecture playlist for ${displayTitle}${moduleInfo ? ` in ${moduleInfo.title}` : ''}.`,
    url,
    ...(authors.length > 0
      ? {
          author: authors.map((name) => ({
            '@type': 'Person',
            name
          }))
        }
      : {}),
    ...(videos.length > 0
      ? {
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: videos.length,
            itemListElement: videos.slice(0, 100).map((video, idx) => ({
              '@type': 'ListItem',
              position: idx + 1,
              name: video.title
            }))
          }
        }
      : {})
  };
}

export function buildDocumentJsonLd(
  origin: string,
  material: MaterialItem,
  moduleInfo?: ModuleInfo | null
): Record<string, unknown> {
  const base = resolveSiteOrigin(origin);
  const url = buildCanonicalUrl(base, `/viewer/${encodeURIComponent(material.id)}`);
  const displayTitle = material.titleEn || material.title;
  const authors = normalizeAuthors(material.author);

  return {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: displayTitle,
    description:
      material.descriptionEn ||
      material.description ||
      `Study document ${displayTitle}${moduleInfo ? ` for ${moduleInfo.title}` : ''}.`,
    url,
    learningResourceType: material.type === 'exam' ? 'Quiz' : 'Study Document',
    educationalLevel: `Year ${material.year}`,
    ...(authors.length > 0
      ? {
          author: authors.map((name) => ({
            '@type': 'Person',
            name
          }))
        }
      : {}),
    ...(moduleInfo
      ? {
          isPartOf: {
            '@type': 'Course',
            name: moduleInfo.title,
            url: buildCanonicalUrl(base, `/module/${encodeURIComponent(moduleInfo.id)}`)
          }
        }
      : {})
  };
}

// ─── Sitemap Generation ───────────────────────────────────────────────────────

export interface SitemapSourceData {
  origin?: string;
  modules: ModuleInfo[];
  lessons: Lesson[];
  materials: MaterialItem[];
  collections?: MaterialCollection[];
}

export function isMaterialPlaylistPage(material: MaterialItem): boolean {
  return (
    material.type === 'playlist' ||
    Boolean(material.playlistId) ||
    Boolean(material.videos && material.videos.length > 0)
  );
}

export function isMaterialViewerPage(material: MaterialItem, lessons: Lesson[]): boolean {
  if (isFlashcards(material)) return false;
  if (isMaterialPlaylistPage(material)) return false;
  if (practicalImagePath(material, lessons)) return false;
  return (
    hasDiscreteDocuments(material) ||
    Boolean(getDocumentEmbedUrl(material.url)) ||
    isPdfDocument(material.url)
  );
}

/**
 * Generates deduplicated SitemapEntry records for all public static and dynamic pages:
 * - Static routes (/, /modules, /search, /team, /contribute, /feedback)
 * - Academic years (/year/1..5)
 * - Modules (/module/[id])
 * - Subjects (/module/[id]/[subjectSlug])
 * - Lessons (/module/[id]/[subjectSlug]/lesson/[lessonId])
 * - Doctor pages (/module/[id]/[subjectSlug]/lesson/[lessonId]/doctor/[doctorKey])
 * - Practical image folders (/module/[id]/[subjectSlug]/lesson/[lessonId]/images/[folderId])
 * - Playlists (/playlist/[id])
 * - Document viewers (/viewer/[id])
 * - Flashcards (/flashcards/[deckId])
 * - Curated collections (/collection/[id])
 */
export function generateSitemapEntries(data: SitemapSourceData): SitemapEntry[] {
  const base = resolveSiteOrigin(data.origin);
  const entries = new Map<string, SitemapEntry>();

  const addEntry = (path: string, priority: number, changefreq: SitemapEntry['changefreq'] = 'weekly', lastmod?: string) => {
    const loc = buildCanonicalUrl(base, path);
    if (!entries.has(loc)) {
      entries.set(loc, { loc, priority, changefreq, ...(lastmod ? { lastmod } : {}) });
    }
  };

  // 1. Core Static Pages
  addEntry('/', 1.0, 'daily');
  addEntry('/modules', 0.9, 'daily');
  addEntry('/search', 0.8, 'daily');
  addEntry('/team', 0.5, 'monthly');
  addEntry('/contribute', 0.5, 'monthly');
  addEntry('/feedback', 0.4, 'monthly');

  // 2. Academic Years (1..5)
  for (const year of [1, 2, 3, 4, 5] as const) {
    addEntry(`/year/${year}`, 0.9, 'weekly');
  }

  // Filter active modules and visible materials
  const activeModules = data.modules.filter((m) => m.active !== false);
  const activeModuleIds = new Set(activeModules.map((m) => m.id));
  const visibleMaterials = data.materials.filter((m) => {
    if (m.semester === 2) return false;
    if (m.moduleId && !/^year\d+-reference-books$/.test(m.moduleId)) {
      return activeModuleIds.has(m.moduleId);
    }
    return true;
  });

  // 3. Modules, Subjects, Lessons, Doctor Pages, and Practical Image Folders
  for (const mod of activeModules) {
    addEntry(`/module/${encodeURIComponent(mod.id)}`, 0.9, 'weekly');

    for (const subject of mod.subjects) {
      const subjectSlug = subjectToSlug(subject);
      const subjectLessons = lessonsForSubject(data.lessons, mod.id, subject);
      const subjectMaterials = visibleMaterials.filter(
        (item) =>
          item.moduleId === mod.id &&
          ((item.subject && subjectToSlug(item.subject) === subjectSlug) ||
            subjectLessons.some((l) => isMaterialAssignedToLesson(item, l)))
      );

      // Include subject page if the module has this subject
      addEntry(`/module/${encodeURIComponent(mod.id)}/${subjectSlug}`, 0.85, 'weekly');

      for (const lesson of subjectLessons) {
        const lessonMaterials = subjectMaterials.filter((m) => isMaterialAssignedToLesson(m, lesson));

        // Regular lessons are always visible; revision lessons are visible when they have materials
        if (isRevisionLesson(lesson) && lessonMaterials.length === 0) {
          continue;
        }

        const lPath = lessonPath(lesson);
        addEntry(lPath, 0.8, 'weekly');

        // Doctor pages for this lesson
        const remainingForDoctors = lessonMaterials.filter(
          (item) => !isPracticalImageMaterial(item) && !isFlashcards(item)
        );
        const doctors = lessonDoctors(remainingForDoctors);
        for (const doctor of doctors) {
          addEntry(`${lPath}/doctor/${encodeURIComponent(doctor.key)}`, 0.8, 'weekly');
        }

        // Practical Image Folders for this lesson
        if (lesson.practicalImageFolders && lesson.practicalImageFolders.length > 0) {
          for (const folder of lesson.practicalImageFolders) {
            const folderImgs = practicalFolderImages(lessonMaterials, lesson, folder.id);
            if (folderImgs.length > 0) {
              addEntry(`${lPath}/images/${encodeURIComponent(folder.id)}`, 0.75, 'weekly');
            }
          }
        }
      }
    }
  }

  // 4. Playlists, Document Viewers, and Flashcards
  for (const mat of visibleMaterials) {
    const lastmod =
      mat.createdAt && /^\d{4}-\d{2}-\d{2}/.test(mat.createdAt)
        ? mat.createdAt.slice(0, 10)
        : undefined;

    if (isFlashcards(mat)) {
      const deckId = mat.flashcardDeckId || mat.id;
      if (deckId) {
        addEntry(`/flashcards/${encodeURIComponent(deckId)}`, 0.75, 'weekly', lastmod);
      }
    } else if (isMaterialPlaylistPage(mat)) {
      addEntry(`/playlist/${encodeURIComponent(mat.id)}`, 0.75, 'weekly', lastmod);
    } else if (isMaterialViewerPage(mat, data.lessons)) {
      addEntry(`/viewer/${encodeURIComponent(mat.id)}`, 0.7, 'weekly', lastmod);
    }
  }

  // 5. Curated Collections
  if (data.collections) {
    for (const col of data.collections) {
      if (col.id) {
        addEntry(`/collection/${encodeURIComponent(col.id)}`, 0.75, 'weekly');
      }
    }
  }

  return Array.from(entries.values());
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderSitemapXml(entries: SitemapEntry[]): string {
  const urlsXml = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) parts.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (typeof entry.priority === 'number') {
        parts.push(`    <priority>${entry.priority.toFixed(2).replace(/\.?0+$/, (m) => (m === '.00' ? '.0' : m))}</priority>`);
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>\n`;
}
