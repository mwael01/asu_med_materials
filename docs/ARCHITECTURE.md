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

Anonymous public HTML uses Vercel CDN caching (300 seconds fresh, with stale-while-revalidate). API, private, authenticated, and cookie-bearing requests bypass shared HTML caching. New type pages share these rules. Cached pages need a refresh to display catalogue changes.

Firebase's multi-tab IndexedDB persistence caches direct browser reads. The service worker caches visited public pages and static assets, rather than crawling the catalogue. An unavailable page uses the offline fallback. Profile/admin responses bypass service-worker caching.

Existing semester-two hiding and inactive-module filtering remain in the data layer. Reference modules keep their existing visibility behavior; saved-year discovery strictly isolates by material year.

## Existing study features

- Material bookmarks and studied IDs persist locally and synchronize with authenticated profiles. The shared bookmark drawer remains accessible from navigation.
- Video playlists and document bundles preserve source item order and original IDs. Doctor players combine sources within one lesson; legacy playlist/viewer URLs still work.
- Flashcard decks retain their dedicated offline study player, revision lifecycle, and progress model. See [Flashcards](FLASHCARDS.md).
- English UI uses existing legacy title fallbacks. Search retains Arabic normalization and doctor/subject aliases.
- Google and email authentication, avatar uploads, profiles, contributions, feedback, collections, and admin management remain available.
- Admin AI extraction produces reviewable typed drafts and publishes directly to Firestore. See [Admin AI](ADMIN_AI.md).

## Validation

Run `pnpm astro check`, `pnpm test`, and `pnpm build` after major changes. Keep UI responsive and components reusable. Document architectural changes here or in focused documents instead of expanding the README. Deploy rules before application features that require a new Firestore collection.
