# ASU Med Materials Architecture

This document describes the architectural layout, directory structure, data model, and engineering standards for the **ASU Med Materials** platform.

---

## 1. System Overview

ASU Med Materials is a lightweight, static-first web portal built with [Astro](https://astro.build/) for students at Ain Shams University Faculty of Medicine. It aggregates study resources (Google Drives, Telegram channels, YouTube playlists, summary notes, past exams, and community links) in an organized, searchable, and offline-capable interface.

### Key Technical Pillars

- **Dynamic On-Demand Server Core**: Server-side rendering (SSR) powered by Astro (`output: 'server'`) with `@astrojs/vercel`, rendering content directly from Firestore with bounded runtime and CDN caching.
- **Cloud Firestore Single Source of Truth**: All study materials, curriculum modules, and contributors live in Cloud Firestore. No local catalogue files are used; public content refreshes through bounded caches.
- **In-Memory Server Request Deduplication**: Public materials and modules use Vercel Runtime Cache for 24 hours, shared across page routes and server instances within a region. A 60-second in-process cache shares pending requests and reduces cache-outage reads. Anonymous public HTML uses Vercel CDN caching (60 seconds fresh, followed by 60 seconds of stale-while-revalidate). Private pages, API responses, and requests with cookies or authorization bypass shared caching.
- **Arabic-First with Technical English**: Arabic RTL interface for clear local usability, paired with standard English terminology for subjects (Anatomy, Histology, etc.), channel names, and drive labels.
- **Multistage Year & Module Selection**: Students are guided on first visit through a two-stage prompt (Year & Module) saved locally in `localStorage` for personalized, instant access.
- **Structured Grouped Categorization**: Materials are grouped by functional learning category (Central Drives, Lectures, Practical Labs & OSPE, Summaries, and Past Exams).
- **Default White Theme**: Clean high-contrast white theme by default, with an optional dark mode toggle saved in `localStorage`.
- **Offline Bookmarks & PWA**: Saved client-side in `localStorage` (`asumed_bookmarks`) with web app manifest and multi-tab IndexedDB cache support.

---

## 2. Directory Structure

```
asu_med_materials/
├── docs/                        # Architecture and developer documentation
│   ├── ARCHITECTURE.md          # System architecture and data flow
│   ├── COMPONENTS.md            # Component catalog and design guidelines
│   └── CURRICULUM_STRUCTURE.md  # ASU Medicine curriculum mapping
├── public/                      # Static assets, PWA manifest, and icons
│   ├── favicon.svg
│   ├── icons/                   # PWA & resource brand icons
│   └── manifest.webmanifest
├── src/
│   ├── assets/                  # Bundled SVGs and images
│   ├── components/              # Modular UI components
│   │   ├── bookmarks/           # Offline bookmark drawer (BookmarksDrawer.astro)
│   │   ├── common/              # Theme & Language toggles (ThemeToggle.astro, LanguageToggle.astro)
│   │   ├── materials/           # ResourceCard, GroupedResourceList, ModuleCard, SubjectBar, YearSelector
│   │   ├── contributors/        # AuthorCard, ContributorCard, ContactButtons
│   │   ├── navigation/          # Navbar.astro, Footer.astro
│   │   ├── search/              # SearchBar.astro, FilterToolbar.astro
│   │   └── selection/           # MultistageSelector.astro (Two-stage Year/Module modal)
│   ├── data/                    # Dynamic data query functions & caching
│   │   ├── modules.ts           # Firestore module queries (getAllModules, getModuleById)
│   │   ├── materials.ts         # Facade re-exporting from ./materials/index
│   │   └── materials/           # Modular study materials loaders
│   │       └── index.ts         # Firestore materials queries with shared 24-hour caching
│   ├── firebase/                # Firebase client, converters & schema types
│   │   ├── client.ts            # Firebase app, auth, firestore (IndexedDB cache), storage
│   │   ├── firestore.ts         # Firestore data access & converters
│   │   └── schema.ts            # Strongly typed schema interfaces
│   ├── i18n/                    # Centralized bilingual dictionaries
│   │   └── translations.ts      # Canonical Arabic & English key-value dictionaries
│   ├── layouts/                 # Base page layouts
│   │   └── Layout.astro         # Shell with RTL/LTR, SEO, PWA, i18n, and Theme setup
│   ├── pages/                   # File-based routing
│   │   ├── index.astro          # Personalized student dashboard: active modules & organized library folders
│   │   ├── year/[year].astro    # Year-specific overview & grouped materials
│   │   ├── module/[id].astro    # Dedicated module resources page
│   │   ├── module/[id]/[subject].astro # Dedicated module subject page
│   │   ├── playlists.astro      # Video playlists index & tracker
│   │   ├── playlist/[id].astro  # Integrated video playlist player & curriculum checkpoint viewer
│   │   ├── search.astro         # Global search & multi-filter explorer
│   │   ├── contribute.astro     # Contribution guide & automatic submission form
│   │   ├── feedback.astro       # Student feedback, issue reporting & suggestions
│   │   └── contributors.astro   # Site team on top + content makers (author field only, ranked)
│   ├── styles/                  # Global styles & Tailwind configuration
│   │   └── global.css
│   ├── types/                   # TypeScript interfaces & types
│   │   ├── i18n.ts              # SupportedLanguage, TranslationsDictionary types
│   │   ├── materials.ts         # Material, module, and curriculum types
│   │   ├── submission.ts        # Material submission payload and response types
│   │   ├── feedback.ts          # Feedback category and submission types
│   │   └── contributors.ts      # Author, contributor profile, contact, and stats types
│   └── utils/                   # Shared pure TypeScript helper functions
│       ├── contributors.ts      # Contributor stats aggregation + initials fallback
│       ├── feedback.ts          # Feedback submission API client
│       ├── filter.ts            # Search and filter matching logic
│       ├── i18n.ts              # Language manager, DOM translation binding & reactivity
│       ├── slug.ts              # URL slugification for subjects and routes
│       └── storage.ts           # Bookmarks, user folders, and academic preferences in localStorage
├── astro.config.mjs             # Astro build configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. Data Model & Types

All entities are strictly typed in [`src/types/materials.ts`](file:///workspaces/asu_med_materials/src/types/materials.ts).

### Core Entities

```typescript
export type AcademicYear = 1 | 2 | 3 | 4 | 5;

export type ResourceType =
  | 'drive'
  | 'telegram'
  | 'youtube'
  | 'whatsapp'
  | 'book'
  | 'summary'
  | 'exam'
  | 'website'
  | 'other';

export type MaterialCategory =
  | 'central'      // درايفات وقنوات الدفعة
  | 'lectures'     // محاضرات وشروحات الفيديو
  | 'practical'    // سكاشن وعملي ومعامل
  | 'summaries'    // ورق ومذكرات وملخصات
  | 'exams'        // امتحانات سابقة وريكولات
  | 'references';  // كتب ومراجع

export interface ModuleInfo {
  id: string;             // e.g. "year1-foundation"
  code: string;           // e.g. "MED101"
  title: string;          // e.g. "Foundation Module"
  titleAr?: string;       // e.g. "موديول التأسيس"
  year: AcademicYear;     // 1 to 5
  semester?: 1 | 2;
  subjects: string[];     // e.g. ["Anatomy", "Physiology", "Biochemistry"]
  description?: string;
  descriptionAr?: string;
}

export interface MaterialItem {
  id: string;             // Unique identifier
  title: string;          // Resource name
  description?: string;   // Context description
  url: string;            // Destination URL
  type: ResourceType;     // Resource format
  category?: MaterialCategory; // Group category
  year: AcademicYear;     // Academic year
  moduleId?: string;      // Related module ID
  subject?: string;       // Medical discipline
  author?: string | string[]; // Creator, doctor, or contributors (up to 5 names)
  tags: string[];         // Search tags
  createdAt?: string;     // ISO date
}
```

---

## 4. Client-Side Features & State Management

1. **Student Personal Hub & Year Preferences**:
   - Stored in `localStorage` under `asumed_user_year` and `asumed_user_module`.
   - The home page serves as the student's personal study space: presenting active modules for their year and an automatically organized **Personal Study Library** (`Module > Subject > Materials`).
   - Students can change their active year anytime via the "تغيير السنة" multistage modal.
   - Emits `user-preferences-updated` when modified, dynamically synchronizing modules grid and navbar indicators.

2. **Personal Study Library & Smart Hierarchy**:
   - Stored in `localStorage` under `asumed_bookmarks` alongside studied items in `asumed_studied_materials`.
   - Materials are automatically structured by **Module > Subject > Materials** without tedious manual folder creation.
   - Features real-time completion progress tracking (`X/Y studied`), dynamic module filter chips, and an "Unstudied Only" quick toggle to streamline exam prep.
   - Dispatches `bookmarks-updated` and `studied-updated` custom events for instantaneous reactive rendering across the page and the Smart Drawer.

3. **Default Light Theme & Tailwind v4 Custom Dark Variant**:
   - In Tailwind CSS v4, manual class-based dark mode requires `@custom-variant dark (&:where(.dark, .dark *));` in [`src/styles/global.css`](file:///workspaces/asu_med_materials/src/styles/global.css) to override the default system `@media (prefers-color-scheme: dark)`.
   - Zero flash of unstyled theme (FOUC) handled via an inline `<script>` in [`Layout.astro`](file:///workspaces/asu_med_materials/src/layouts/Layout.astro).
   - Defaults to white/light mode. Dark mode is only activated if `localStorage.getItem('theme') === 'dark'`.

4. **Bookmarks System**:
   - Users can bookmark frequently accessed drives, channels, and playlists.
   - Saved in client `localStorage` under `asumed_bookmarks`.
   - Accessible from the top navbar drawer even when offline.

5. **Instant Search & Filtering**:
   - Client-side in-memory search using normalized text scoring over title, subject, tags, and author.
   - Live URL query parameters (`?q=...&type=...&year=...`) for shareable search states.

6. **Direct GitHub Issues API Integration (Vercel Serverless Function)**:
   - Implemented via [`api/submit-material.js`](file:///workspaces/asu_med_materials/api/submit-material.js) as a native Vercel Serverless Function at `POST /api/submit-material`.
   - In development, serviced via Vite connect middleware in [`astro.config.mjs`](file:///workspaces/asu_med_materials/astro.config.mjs).
   - In production on Vercel, executes securely using the `GITHUB_TOKEN` environment variable to create issues on `mwael01/asu_med_materials` directly via GitHub REST API.
   - The contribute page ([`src/pages/contribute.astro`](file:///workspaces/asu_med_materials/src/pages/contribute.astro)) provides a clean, single-purpose form without manual PR cards or external GitHub issues links, giving students instant on-page confirmation and status feedback.

7. **Per-Subject Filtration & Dedicated Subject Pages**:
   - Every module features a [`SubjectBar.astro`](file:///workspaces/asu_med_materials/src/components/materials/SubjectBar.astro) navigation bar showing all academic subjects for that module.
   - Each subject has a dedicated static URL route (`/module/[id]/[subject]`, e.g. `/module/year1-foundation/medical-biochemistry`) with dedicated title, SEO, custom breadcrumbs, and empty states.
   - Material cards link directly to their corresponding subject page via clickable subject badges.

8. **Multi-Language Support (Client-Side In-Place Toggle)**:
   - **Language Toggle**: Topbar button with a globe icon and language indicator badge (`AR` / `EN`) switching instantly between English (default for new visitors) and Arabic (100% preserved verbatim without alteration).
   - **Zero URL Deviation**: Retains all static URLs identical across languages without redirects or duplicate route generation.
   - **Zero Flash of Unstyled Text / Direction**: Synchronous inline `<script is:inline>` in `<head>` sets `lang` and `dir="ltr"` / `dir="rtl"` immediately from `localStorage.getItem('asumed_lang')` before layout rendering.
   - **Declarative HTML Binding**: Static markup uses `data-i18n="key"`, `data-i18n-attr="attr:key"`, `data-i18n-mod-title-en`/`ar`, `data-i18n-subject-en`/`ar`, `data-i18n-material-title`, and `data-i18n-material-desc` attributes. The helper `applyLanguage()` in [`src/utils/i18n.ts`](file:///workspaces/asu_med_materials/src/utils/i18n.ts) translates elements instantly in-place.
   - **Material Titles & Descriptions**: Centralized translations dictionary in [`src/i18n/materialsTranslations.ts`](file:///workspaces/asu_med_materials/src/i18n/materialsTranslations.ts) maps central drives, question banks, day-by-day folders, and lecture series into natural English titles and descriptions, with pattern-matching fallbacks for batches and subjects.
   - **Bilingual Search Matching**: The client-side catalog search in [`src/pages/search.astro`](file:///workspaces/asu_med_materials/src/pages/search.astro) indexes both Arabic and English titles and descriptions simultaneously, matching queries seamlessly in either language.
   - **Full Core Component Coverage**: All forms (Detailed submit, Quick Dump bulk linker), toast notifications, contributor popup cards, and playlist video players dynamically respond to language switching while maintaining strict logical CSS (`rtl:`, `text-start`).
   - **Reactive Custom Event**: Dispatches `asumed-language-changed` on `window` whenever the language is switched, allowing client scripts (dynamic search counter, bookmarks drawer, multistage modal, video playlist stepper) to update text immediately.
   - **Event Listener Lifecycle Safeguards**: All client scripts in persistent components and pages (`index.astro`, `BookmarksDrawer.astro`, `MultistageSelector.astro`, `MobileMenu.astro`) utilize global listener guards or `AbortController` cleanup to completely prevent listener duplication across ViewTransitions (`astro:after-swap`).
   - **Dictionary Architecture**: Centralized dictionary in [`src/i18n/translations.ts`](file:///workspaces/asu_med_materials/src/i18n/translations.ts) typed with [`src/types/i18n.ts`](file:///workspaces/asu_med_materials/src/types/i18n.ts), covering all site navigation, academic years, modules, subjects, categories, badges, toasts, forms, and controls.

9. **Student Feedback & Google Sheets Webhook Integration**:
   - Dedicated route at `/feedback` ([`src/pages/feedback.astro`](file:///workspaces/asu_med_materials/src/pages/feedback.astro)) powered by [`FeedbackForm.astro`](file:///workspaces/asu_med_materials/src/components/feedback/FeedbackForm.astro).
   - Reciprocal cross-linking between `/contribute` and `/feedback` ensures students can seamlessly navigate between sharing study drives and submitting feedback or bug reports.
   - Handled via [`api/submit-feedback.ts`](file:///workspaces/asu_med_materials/api/submit-feedback.ts) (Vercel Serverless Function & local Vite middleware) which forwards JSON payloads directly to Google Sheets via Google Apps Script webhooks (`GOOGLE_SHEETS_FEEDBACK_WEBHOOK_URL` or `GOOGLE_SHEETS_WEBHOOK_URL`).
   - Automatically pre-selects the student's academic year from `localStorage.getItem('asumed_user_year')` and filters related modules for instant submission.
   - Provides local development fallback mocking successful responses when no webhook is configured.

10. **Firebase Integration, Offline-First Persistence & Student Profiles**:
   - **Cloud Firestore**: Configured with modular SDK v12 `persistentLocalCache` and `persistentMultipleTabManager` for multi-tab IndexedDB offline persistence. Materials, curriculum modules, contributor data, and student profiles queried online are cached directly in IndexedDB for immediate offline access.
   - **Offline-First Persistence Architecture**:
     1. *Dynamic SSR on Vercel*: On-demand server rendering queries Firestore directly with 60s in-memory request deduplication, without static snapshot rebuilds. Public catalogue data can remain cached for 24 hours plus the short HTML cache interval; open pages do not automatically reload.
     2. *Client IndexedDB Firestore Cache*: Modular Firebase SDK v12 with `persistentLocalCache` and `persistentMultipleTabManager` caches queries across tabs for instant offline retrieval without network roundtrips.
     3. *Service Worker*: Fetches the homepage once to discover bundles and pre-caches static assets. Other public pages are cached after visiting, rather than fetching all routes on installation. Profile/admin pages bypass the response cache. Unvisited pages use the offline fallback.
   - **Dynamic Collections & Local Schema Architecture**:
     - `materials`: 163+ medical study drives, playlists, exam papers, and textbooks across academic years, queried on-demand.
     - `modules`: Curriculum modules stored dynamically in Firestore with bilingual descriptions and subjects, fetched via `getAllModules()`.
     - `contributors`: Platform team authors and community contributors dynamically managed with roles and badges.
     - `users`: Medical student profiles with custom handles and contribution counts.
     - `submissions`: Pending and approved peer material submissions.
   - **Schema Specification & Synchronization**:
     - [`firebase/schema.json`](file:///home/mwael/work/asu_med_materials/firebase/schema.json): Canonical JSON schema defining document types, constraints, and live document counts (local contract for syntax validation).
     - [`firebase/firestore.indexes.json`](file:///home/mwael/work/asu_med_materials/firebase/firestore.indexes.json): Declarative Cloud Firestore composite index configuration and single-field overrides (deployed via `pnpm run deploy:indexes`).
     - [`src/firebase/schema.ts`](file:///home/mwael/work/asu_med_materials/src/firebase/schema.ts): Strongly typed TypeScript interfaces and `FirestoreDataConverter` implementations (`materialConverter`, `moduleConverter`, `contributorConverter`, `userConverter`, `submissionConverter`).
     - [`scripts/sync-firebase-schema.mjs`](file:///home/mwael/work/asu_med_materials/scripts/sync-firebase-schema.mjs) (`pnpm run schema:sync`): Synchronizes live Firestore collection states and document counts with `firebase/schema.json`.
     - [`scripts/seed-firestore.mjs`](file:///home/mwael/work/asu_med_materials/scripts/seed-firestore.mjs): Uploads initial/seed materials, modules, and contributors to Cloud Firestore.
   - **Zero-Friction Guest Mode**: Visitors can browse, search, use bookmarks, track completed materials, and submit resources completely offline without creating an account.
   - **Firebase Authentication**: Supports one-click Google Sign-In and Email/Password registration. Profiles are cached locally in `localStorage` for zero-delay UI rendering on page load.
   - **Firebase Storage**: Securely handles avatar image uploads (`avatars/{userId}_{timestamp}.ext`) with strict MIME type and 2.5 MB size validation.
   - **Unified Shareable Profile Route (`/profile`)**:
     - `/profile` (Logged-in): Student dashboard to edit display name, unique `@username` handle, academic year, bio, and upload avatar pictures.
     - `/profile?u=username`: Shareable public profile card showcasing student bio, academic year badge, and list of study materials contributed.
     - `/profile` (Guest): Welcoming guest card explaining offline capabilities with fast sign-in options.
   - **Security & Environment Architecture**:
     - Client-exposed variables strictly prefixed with `PUBLIC_FIREBASE_*` in `.env.local` and documented in `.env.example`.
     - Security rules version-controlled under `firebase/firestore.rules` and `firebase/storage.rules`.

---

## 5. Coding & Quality Standards

- **Static Validation**: Run `pnpm astro check` and `pnpm build` after all modifications.
- **Component Separation**: Keep components focused on a single responsibility.
- **Documentation**: Keep docs synchronized with major architectural decisions without bloating `README.md`.

## 6. Firestore Read Optimizations

- Public material/module queries use the official `@vercel/functions` Runtime Cache with a 86,400-second TTL. The first cache miss reads Firestore; later pages and students reuse that catalogue, including individual playlist/module lookups and profile contribution matching. Local development uses short in-process caching.
- Cache keys include the Firebase project, Vercel project, and schema version. Oversized catalogues are stored in generation-specific chunks below 1 MB; a manifest is published after all chunks succeed. Failed Firestore reads are never cached as empty results. Cache failures fall back to Firestore with short in-process reuse; origin failures return uncached errors.
- Admin reads/writes, duplicate checks, authentication, submissions, bookmark/progress writes, and profile listeners remain direct Firebase operations. Publishing does not invalidate the daily public catalogue.
- Runtime Cache is regional and may evict entries; simultaneous misses across instances can repeat reads. It persists across deployments, and usage may be billed by Vercel. Bump the key version when the cached schema changes.
- Admin logs order and limit in Firestore; admin lists limit in Firestore; team queries filter roles before downloading documents.
- Missing material/module lookups do not fall back to full-collection scans. Document IDs must match the stored `id`, as in current write functions.
- The homepage renders six recently added materials from its existing catalogue query, with no additional reads.
- The shared bookmarks drawer receives the complete catalogue from the shared cache. Moving the drawer and homepage library to lazy queries of saved document IDs would enable scoped year/module reads in a future coordinated change.
- IndexedDB supports offline access; ordinary online `getDocs` calls can still incur server reads. Measure actual reductions in the Firebase Usage dashboard after deployment and verify public CDN hits with `x-vercel-cache`.

Cache verification: test cache reuse across different routes and cold instances, daily expiry, empty collections, read/write failures, incomplete chunks, and oversized catalogues. Confirm live account syncing and direct admin changes; compare Firebase reads and Vercel Runtime Cache activity after deployment. Runtime cache hits are distinct from HTML CDN `x-vercel-cache` hits. See [Vercel Runtime Cache documentation](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#getcache).
