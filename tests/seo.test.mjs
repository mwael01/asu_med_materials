import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PRIMARY_SITE_ORIGIN,
  SECONDARY_SITE_ORIGIN,
  resolveSiteOrigin,
  buildCanonicalUrl,
  buildYearSeo,
  buildModuleSeo,
  buildSubjectSeo,
  buildLessonSeo,
  buildDoctorSeo,
  buildPracticalImagesSeo,
  buildPlaylistSeo,
  buildViewerSeo,
  buildCollectionSeo,
  buildFlashcardsSeo,
  buildWebsiteJsonLd,
  buildBreadcrumbJsonLd,
  buildModuleJsonLd,
  buildLessonJsonLd,
  buildDoctorJsonLd,
  buildPlaylistJsonLd,
  buildDocumentJsonLd,
  generateSitemapEntries,
  renderSitemapXml
} from '../src/utils/seo.ts';
import { doctorKey, lessonDoctors } from '../src/utils/lessons.ts';
import { studyEntries } from '../src/utils/studyContent.ts';

test('resolveSiteOrigin and buildCanonicalUrl consolidate domains and strip query params', () => {
  assert.equal(resolveSiteOrigin(), 'https://asumedmaterials.vercel.app');
  assert.equal(resolveSiteOrigin(''), 'https://asumedmaterials.vercel.app');
  assert.equal(resolveSiteOrigin('https://asumedmaterials.vercel.app/'), 'https://asumedmaterials.vercel.app');

  // Root path keeps trailing slash, subpaths strip trailing slash and query/hash
  assert.equal(buildCanonicalUrl(PRIMARY_SITE_ORIGIN, '/'), 'https://asumedmaterials.vercel.app/');
  assert.equal(
    buildCanonicalUrl(PRIMARY_SITE_ORIGIN, '/?redirect=false'),
    'https://asumedmaterials.vercel.app/'
  );
  assert.equal(
    buildCanonicalUrl(
      PRIMARY_SITE_ORIGIN,
      '/module/year2-respiratory/anatomy/lesson/l1/doctor/doctor-123/?item=%5B%22m1%22%5D#top'
    ),
    'https://asumedmaterials.vercel.app/module/year2-respiratory/anatomy/lesson/l1/doctor/doctor-123'
  );
  assert.equal(
    buildCanonicalUrl(PRIMARY_SITE_ORIGIN, 'https://asumed.vercel.app/viewer/doc-1?document=page-2'),
    'https://asumedmaterials.vercel.app/viewer/doc-1'
  );
});

test('dynamic SEO builders generate rich titles, descriptions, and keywords for curriculum & doctor pages', () => {
  const mod = {
    id: 'year2-respiratory',
    code: 'MED202',
    title: 'Respiratory System',
    titleAr: 'الجهاز التنفسي',
    year: 2,
    subjects: ['Anatomy', 'Physiology'],
    active: true
  };
  const lesson = {
    id: 'resp-anat-nose',
    title: 'Nose and Paranasal Sinuses',
    moduleId: mod.id,
    subject: 'Anatomy',
    order: 1,
    active: true
  };
  const materials = [
    {
      id: 'mat-1',
      title: 'Nose Anatomy Lecture',
      url: 'https://youtube.com/playlist?list=PL123',
      type: 'playlist',
      year: 2,
      moduleId: mod.id,
      subject: 'Anatomy',
      lessonId: lesson.id,
      author: 'Dr. Ashraf Ramzy',
      tags: ['anatomy'],
      videos: [
        { id: 'v1', title: 'Part 1: Nasal Cavity', youtubeId: 'abc12345678' },
        { id: 'v2', title: 'Part 2: Paranasal Sinuses', youtubeId: 'def12345678' }
      ]
    },
    {
      id: 'mat-2',
      title: 'Nose Anatomy Handout',
      url: 'https://drive.google.com/file/d/pdf123/view',
      type: 'summary',
      category: 'summaries',
      year: 2,
      moduleId: mod.id,
      subject: 'Anatomy',
      lessonId: lesson.id,
      author: 'Dr. Ashraf Ramzy',
      tags: ['notes']
    }
  ];

  const yearSeo = buildYearSeo(2, [mod]);
  assert.match(yearSeo.title, /Year 2/);
  assert.match(yearSeo.description, /Respiratory System/);

  const modSeo = buildModuleSeo(mod, ['Anatomy', 'Physiology']);
  assert.match(modSeo.title, /Respiratory System \(Year 2\)/);
  assert.match(modSeo.description, /Anatomy, Physiology/);

  const subjSeo = buildSubjectSeo(mod, 'Anatomy', [lesson], materials.length);
  assert.match(subjSeo.title, /Anatomy - Respiratory System/);
  assert.match(subjSeo.description, /Nose and Paranasal Sinuses/);

  const doctors = lessonDoctors(materials);
  const lessonSeo = buildLessonSeo(mod, lesson, doctors, materials);
  assert.match(lessonSeo.title, /Nose and Paranasal Sinuses - Anatomy/);
  assert.match(lessonSeo.description, /Dr\. Ashraf Ramzy/);

  const doctor = doctors[0];
  const entries = studyEntries(doctor.items);
  const docSeo = buildDoctorSeo(mod, lesson, doctor, entries);
  assert.match(docSeo.title, /Dr\. Ashraf Ramzy - Nose and Paranasal Sinuses/);
  assert.match(docSeo.description, /2 videos, 1 PDF/);
  assert.ok(docSeo.keywords.includes('Dr. Ashraf Ramzy'));

  const playlistSeo = buildPlaylistSeo(materials[0], mod);
  assert.match(playlistSeo.title, /Nose Anatomy Lecture - Dr\. Ashraf Ramzy/);
  assert.match(playlistSeo.description, /2 lectures/);

  const viewerSeo = buildViewerSeo(materials[1], mod, 1);
  assert.match(viewerSeo.title, /Nose Anatomy Handout - Dr\. Ashraf Ramzy/);

  const imgSeo = buildPracticalImagesSeo(mod, lesson, { id: 'slides', title: 'Histology Slides' }, 14);
  assert.match(imgSeo.title, /Histology Slides - Nose and Paranasal Sinuses/);
  assert.match(imgSeo.description, /14 high-resolution/);

  const colSeo = buildCollectionSeo(
    {
      id: 'col-1',
      title: 'Respiratory Finals Pack',
      category: 'finals',
      year: 2,
      moduleId: mod.id,
      materialIds: ['mat-1'],
      materials: [materials[0]],
      totalMaterialsCount: 5
    },
    mod
  );
  assert.match(colSeo.title, /Respiratory Finals Pack/);
  assert.match(colSeo.description, /5 curated study materials/);

  const fcSeo = buildFlashcardsSeo('Respiratory Anatomy Deck', 120);
  assert.match(fcSeo.title, /Respiratory Anatomy Deck - Medical Flashcards/);
  assert.match(fcSeo.description, /120 interactive flashcards/);
});

test('JSON-LD builders produce valid Schema.org structures with primary and secondary domains', () => {
  const websiteLd = buildWebsiteJsonLd(PRIMARY_SITE_ORIGIN);
  assert.equal(websiteLd['@context'], 'https://schema.org');
  const graph = websiteLd['@graph'];
  assert.ok(Array.isArray(graph));
  assert.equal(graph[0]['@type'], 'WebSite');
  assert.equal(graph[0].url, 'https://asumedmaterials.vercel.app/');
  assert.deepEqual(graph[0].sameAs, [SECONDARY_SITE_ORIGIN]);

  const crumbs = [
    { title: 'Year 2', href: '/year/2' },
    { title: 'Respiratory', href: '/module/year2-respiratory' },
    { title: 'Anatomy' }
  ];
  const breadcrumbLd = buildBreadcrumbJsonLd(
    PRIMARY_SITE_ORIGIN,
    crumbs,
    '/module/year2-respiratory/anatomy'
  );
  assert.equal(breadcrumbLd['@type'], 'BreadcrumbList');
  assert.equal(breadcrumbLd.itemListElement.length, 4);
  assert.equal(
    breadcrumbLd.itemListElement[3].item,
    'https://asumedmaterials.vercel.app/module/year2-respiratory/anatomy'
  );

  const mod = {
    id: 'year2-respiratory',
    code: 'MED202',
    title: 'Respiratory System',
    year: 2,
    subjects: ['Anatomy']
  };
  const lesson = {
    id: 'resp-anat-nose',
    title: 'Nose and Paranasal Sinuses',
    moduleId: mod.id,
    subject: 'Anatomy',
    order: 1,
    active: true
  };
  const doctor = {
    key: doctorKey('Dr. Ashraf Ramzy'),
    name: 'Dr. Ashraf Ramzy',
    items: []
  };
  const entries = [
    {
      key: '["m1","videos","v1"]',
      itemId: 'v1',
      materialId: 'm1',
      bundleTitle: 'Lecture 1',
      title: 'Part 1: Nasal Cavity',
      tab: 'videos',
      url: 'https://youtu.be/abc',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abc',
      embedType: 'iframe',
      playlistProgress: true
    }
  ];

  const modLd = buildModuleJsonLd(PRIMARY_SITE_ORIGIN, mod, ['Anatomy']);
  assert.equal(modLd['@type'], 'Course');
  assert.equal(modLd.url, 'https://asumedmaterials.vercel.app/module/year2-respiratory');

  const lessonLd = buildLessonJsonLd(PRIMARY_SITE_ORIGIN, mod, lesson, [doctor]);
  assert.equal(lessonLd['@type'], 'LearningResource');
  assert.equal(lessonLd.hasPart.length, 1);

  const doctorLd = buildDoctorJsonLd(PRIMARY_SITE_ORIGIN, mod, lesson, doctor, entries);
  assert.equal(doctorLd['@type'], 'CollectionPage');
  assert.equal(doctorLd.author['@type'], 'Person');
  assert.equal(doctorLd.author.name, 'Dr. Ashraf Ramzy');
  assert.equal(doctorLd.mainEntity.numberOfItems, 1);

  const playlistLd = buildPlaylistJsonLd(
    PRIMARY_SITE_ORIGIN,
    {
      id: 'pl-1',
      title: 'Series 1',
      url: 'https://youtube.com/playlist?list=PL1',
      type: 'playlist',
      year: 2,
      author: 'Dr. Test',
      tags: [],
      videos: [{ id: 'v1', title: 'Ep 1' }]
    },
    mod
  );
  assert.equal(playlistLd['@type'], 'CollectionPage');
  assert.equal(playlistLd.mainEntity.numberOfItems, 1);

  const docLd = buildDocumentJsonLd(
    PRIMARY_SITE_ORIGIN,
    {
      id: 'doc-1',
      title: 'Summary PDF',
      url: 'https://drive.google.com/file/d/123/view',
      type: 'summary',
      year: 2,
      author: 'Dr. Test',
      tags: []
    },
    mod
  );
  assert.equal(docLd['@type'], 'LearningResource');
  assert.equal(docLd.url, 'https://asumedmaterials.vercel.app/viewer/doc-1');
});

test('generateSitemapEntries includes all dynamic routes (years, modules, subjects, lessons, doctors, images, playlists, viewers, flashcards, collections)', () => {
  const modules = [
    {
      id: 'year2-respiratory',
      code: 'MED202',
      title: 'Respiratory System',
      year: 2,
      subjects: ['Anatomy'],
      active: true
    },
    {
      id: 'inactive-module',
      code: 'OLD',
      title: 'Inactive',
      year: 2,
      subjects: ['Anatomy'],
      active: false
    }
  ];

  const lessons = [
    {
      id: 'l-regular',
      title: 'Nose',
      moduleId: 'year2-respiratory',
      subject: 'Anatomy',
      order: 1,
      active: true,
      practicalImageFolders: [{ id: 'slides', title: 'Slides' }]
    },
    {
      id: 'l-empty-revision',
      title: 'Empty Revision',
      moduleId: 'year2-respiratory',
      subject: 'Anatomy',
      order: 99,
      active: true,
      isRevision: true,
      revisionType: 'final'
    },
    {
      id: 'l-active-revision',
      title: 'Active Revision',
      moduleId: 'year2-respiratory',
      subject: 'Anatomy',
      order: 98,
      active: true,
      isRevision: true,
      revisionType: 'practical'
    }
  ];

  const materials = [
    // Doctor playlist assigned to l-regular
    {
      id: 'pl-ashraf',
      title: 'Ashraf Playlist',
      url: 'https://youtube.com/playlist?list=PL1',
      type: 'playlist',
      year: 2,
      moduleId: 'year2-respiratory',
      subject: 'Anatomy',
      lessonId: 'l-regular',
      author: 'Dr. Ashraf Ramzy',
      tags: [],
      videos: [{ id: 'v1', title: 'Part 1', youtubeId: 'abcdefghijk' }]
    },
    // Practical image bundle assigned to l-regular
    {
      id: 'img-bundle',
      title: 'Histology Slides',
      url: 'https://asumed.eduvour.com/materials/sha256/' + 'a'.repeat(64) + '.jpg',
      type: 'other',
      category: 'practical',
      year: 2,
      moduleId: 'year2-respiratory',
      subject: 'Anatomy',
      lessonId: 'l-regular',
      practicalImageFolderId: 'slides',
      tags: [],
      documents: [
        {
          id: 'img-1',
          title: 'Slide 1',
          url: 'https://asumed.eduvour.com/materials/sha256/' + 'a'.repeat(64) + '.jpg',
          practicalImageFolderId: 'slides'
        }
      ]
    },
    // Embeddable PDF document assigned to l-active-revision
    {
      id: 'doc-pdf',
      title: 'Revision Notes PDF',
      url: 'https://drive.google.com/file/d/file123/view',
      type: 'summary',
      year: 2,
      moduleId: 'year2-respiratory',
      subject: 'Anatomy',
      lessonId: 'l-active-revision',
      author: 'ASU Faculty Staff',
      tags: []
    },
    // Flashcards deck
    {
      id: 'fc-item',
      title: 'Anatomy Deck',
      url: '/flashcards/resp-anat-deck',
      type: 'flashcards',
      flashcardDeckId: 'resp-anat-deck',
      year: 2,
      moduleId: 'year2-respiratory',
      subject: 'Anatomy',
      lessonId: 'l-regular',
      tags: []
    },
    // Non-embeddable external link (should NOT have a /viewer/[id] entry because /viewer redirects externally)
    {
      id: 'ext-tg',
      title: 'Telegram Channel',
      url: 'https://t.me/asumed_channel',
      type: 'telegram',
      year: 2,
      moduleId: 'year2-respiratory',
      subject: 'Anatomy',
      tags: []
    }
  ];

  const collections = [
    {
      id: 'col-resp',
      title: 'Respiratory Master Collection',
      category: 'general',
      year: 2,
      moduleId: 'year2-respiratory',
      materialIds: ['pl-ashraf']
    }
  ];

  const entries = generateSitemapEntries({
    origin: PRIMARY_SITE_ORIGIN,
    modules,
    lessons,
    materials,
    collections
  });

  const urls = new Set(entries.map((e) => e.loc));

  // Static & year routes
  assert.ok(urls.has('https://asumedmaterials.vercel.app/'));
  assert.ok(urls.has('https://asumedmaterials.vercel.app/modules'));
  assert.ok(urls.has('https://asumedmaterials.vercel.app/year/2'));

  // Active module & subject
  assert.ok(urls.has('https://asumedmaterials.vercel.app/module/year2-respiratory'));
  assert.ok(urls.has('https://asumedmaterials.vercel.app/module/year2-respiratory/anatomy'));
  assert.ok(!urls.has('https://asumedmaterials.vercel.app/module/inactive-module'));

  // Lessons (regular + non-empty revision; empty revision excluded)
  assert.ok(urls.has('https://asumedmaterials.vercel.app/module/year2-respiratory/anatomy/lesson/l-regular'));
  assert.ok(urls.has('https://asumedmaterials.vercel.app/module/year2-respiratory/anatomy/lesson/l-active-revision'));
  assert.ok(!urls.has('https://asumedmaterials.vercel.app/module/year2-respiratory/anatomy/lesson/l-empty-revision'));

  // Doctor pages (Dr. Ashraf Ramzy & Department)
  const ashrafKey = doctorKey('Dr. Ashraf Ramzy');
  assert.ok(
    urls.has(
      `https://asumedmaterials.vercel.app/module/year2-respiratory/anatomy/lesson/l-regular/doctor/${ashrafKey}`
    )
  );
  assert.ok(
    urls.has(
      'https://asumedmaterials.vercel.app/module/year2-respiratory/anatomy/lesson/l-active-revision/doctor/department'
    )
  );

  // Practical image folder page
  assert.ok(
    urls.has(
      'https://asumedmaterials.vercel.app/module/year2-respiratory/anatomy/lesson/l-regular/images/slides'
    )
  );

  // Material pages
  assert.ok(urls.has('https://asumedmaterials.vercel.app/playlist/pl-ashraf'));
  assert.ok(urls.has('https://asumedmaterials.vercel.app/viewer/doc-pdf'));
  assert.ok(urls.has('https://asumedmaterials.vercel.app/flashcards/resp-anat-deck'));
  assert.ok(urls.has('https://asumedmaterials.vercel.app/collection/col-resp'));

  // Excluded redirecting /viewer pages
  assert.ok(!urls.has('https://asumedmaterials.vercel.app/viewer/ext-tg'));
  assert.ok(!urls.has('https://asumedmaterials.vercel.app/viewer/img-bundle'));

  // Render XML verification
  const xml = renderSitemapXml(entries);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/asumedmaterials\.vercel\.app\/playlist\/pl-ashraf<\/loc>/);
});

test('Layout, 404, and DoctorPlayer contain required SEO and crawlability markup', () => {
  const root = process.cwd();
  const layout = fs.readFileSync(path.join(root, 'src/layouts/Layout.astro'), 'utf8');
  const notFound = fs.readFileSync(path.join(root, 'src/pages/404.astro'), 'utf8');
  const doctorPlayer = fs.readFileSync(path.join(root, 'src/components/study/DoctorPlayer.astro'), 'utf8');

  assert.match(layout, /rel="canonical"/);
  assert.match(layout, /property="og:title"/);
  assert.match(layout, /application\/ld\+json/);
  assert.match(notFound, /Astro\.response\.status\s*=\s*404/);
  assert.match(notFound, /noindex=\{true\}/);
  assert.match(doctorPlayer, /aria-label="Doctor study materials index"/);
});
