# ASU Med Materials architecture

ASU Med Materials uses Astro SSR, TypeScript, Tailwind CSS, Firebase, and Vercel. Cloud Firestore is the sole source for materials, curriculum modules, lessons, collections, contributor profiles, and student data. There are no local catalogue snapshots.

## Student navigation

The primary flow is saved year → modules → subjects → lessons → doctors → a tabbed study workspace. Home contains module cards and a year-change action. Videos, PDFs, and Flashcards have dedicated discovery pages; search lives only at `/search`. Public pages use compact titles and breadcrumbs without module descriptions or filter strips.

Year selection uses `asumed_user_year` in localStorage and the `user-preferences-updated` event. Existing `asumed_user_module` values no longer drive public navigation. Shared destinations survive onboarding. Year scoping runs client-side on anonymous shared HTML; it never changes Firestore curriculum visibility.

See [Study flow and lesson curation](STUDY_FLOW.md) for route contracts, Firestore fields, admin assignment, player persistence, and deployment order.

## Code organization

- `src/pages/`: Astro routes, including public discovery and nested lesson/doctor pages.
- `src/components/`: Reusable navigation, headings, directories, resource grids, player shells, forms, and admin UI.
- `src/scripts/`: Typed browser controllers grouped by navigation, search, study, playlists, flashcards, and admin responsibilities.
- `src/types/`: Domain interfaces; `materials.ts` defines resources and curriculum, `lessons.ts` defines lessons and study entries.
- `src/data/`: Public catalogue loaders, visibility rules, and route-context resolution.
- `src/firebase/`: Firebase initialization, converters, authenticated operations, and Firestore access.
- `src/utils/`: Pure content resolution, search, grouping, local preferences, bookmark/progress, and shared client services.
- `firebase/`: Security rules, index definitions, and schema metadata, without material content snapshots.
- `scripts/`: Reusable administrative and data-processing tools; see [Scripts](SCRIPTS.md).

## Data and caching

Public modules, materials, and lessons share versioned Vercel Runtime Cache snapshots and single-flight in-process loaders. `materials_version/current` selects the current snapshot; the version reader caches for 60 seconds. Administrative mutations increment the version. Cache keys include the project and schema namespace; large snapshots use generation-specific chunks and a final manifest. Origin failures propagate instead of being cached as empty results.

Anonymous public HTML uses Vercel CDN caching (300 seconds fresh, with stale-while-revalidate). Client-side navigation uses Astro's `<ClientRouter />` with `prefetchAll: true` (hover/tap strategy), eliminating full-page document reloads and providing seamless view transitions with 0ms perceived latency.

Firebase's multi-tab IndexedDB persistence caches direct browser reads. The service worker (`public/sw.js`) precaches core application routes (`/`, `/videos`, `/pdfs`, `/flashcards`, `/search`, `/contributors`) and catalogue APIs (`/api/materials`, `/api/modules`, `/api/lessons`, `/api/collections`). Navigation requests use a Stale-While-Revalidate strategy, serving cached HTML immediately in 0ms while silently revalidating in the background. Profile and admin routes strictly bypass service-worker caching.

Client-side data access uses `warmupCatalogueCache()` to eagerly hydrate `localStorage` snapshots (`asumed_catalogue_snapshot`, `asumed_modules_snapshot`, `asumed_lessons_snapshot`) into in-memory window stores upon startup and view transitions, providing instant zero-wait access to materials, search documents, and bookmarks.

Existing semester-two hiding and inactive-module filtering remain in the data layer. Reference modules keep their existing visibility behavior; saved-year discovery strictly isolates by material year.

## Existing study features

- Material bookmarks and studied IDs persist locally and synchronize with authenticated profiles. The shared bookmark drawer remains accessible from navigation.
- Video playlists and document bundles preserve source item order and original IDs. Doctor players combine sources within one lesson; legacy playlist/viewer URLs still work.
- Flashcard decks retain their dedicated offline study player, revision lifecycle, and progress model. See [Flashcards](FLASHCARDS.md).
- English UI uses existing legacy title fallbacks. Search retains Arabic normalization and doctor/subject aliases.
- Google and email authentication, avatar uploads, profiles, contributions, feedback, collections, and admin management remain available.
- Admin AI extraction produces reviewable typed drafts and publishes directly to Firestore. See [Admin AI](ADMIN_AI.md).

## SEO and search discovery

The canonical production origin is `https://asumedmaterials.vercel.app` (configured in `astro.config.mjs` and `src/utils/seo.ts`), with `https://asumed.vercel.app` linked via `sameAs` in `WebSite` structured data. `Layout.astro` emits canonical URLs (stripping transient UI query parameters such as `?item=`, `?document=`, and `?redirect=`), Open Graph/Twitter card tags, `BreadcrumbList` JSON-LD derived from navigation crumbs, and page-specific Schema.org JSON-LD (`Course`, `CollectionPage`, `LearningResource`, `VideoObject`, `Person`).

`/robots.txt` (`src/pages/robots.txt.ts`) and `/sitemap.xml` (`src/pages/sitemap.xml.ts`) are dynamically generated from the versioned server catalogue cache (`getPublicModules`, `getPublicLessons`, `getPublicMaterials`, `getAllCollections`) and cached on the Vercel Edge CDN for 1 hour (`s-maxage=3600, stale-while-revalidate=86400`), exposing all academic years, modules, subjects, lessons, doctor pages (`/doctor/[doctorKey]`), practical image folders (`/images/[collection]`), playlists (`/playlist/[id]`), embeddable documents (`/viewer/[id]`), flashcard decks (`/flashcards/[id]`), and collections (`/collection/[id]`) with zero uncached Firestore reads.

## Validation

Run `pnpm astro check`, `pnpm test`, and `pnpm build` after major changes. Keep UI responsive and components reusable. Document architectural changes here or in focused documents instead of expanding the README. Deploy rules before application features that require a new Firestore collection.
