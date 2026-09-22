# ASU Med Materials Architecture

This document describes the architectural layout, directory structure, data model, and engineering standards for the **ASU Med Materials** platform.

---

## 1. System Overview

ASU Med Materials is a lightweight, static-first web portal built with [Astro](https://astro.build/) for students at Ain Shams University Faculty of Medicine. It aggregates study resources (Google Drives, Telegram channels, YouTube playlists, summary notes, past exams, and community links) in an organized, searchable, and offline-capable interface.

### Key Technical Pillars

- **Zero-runtime Static Core**: Fast load times on mobile connections inside hospital and university campuses.
- **Arabic-First with Technical English**: Arabic RTL interface for clear local usability, paired with standard English terminology for subjects (Anatomy, Histology, etc.), channel names, and drive labels.
- **Multistage Year & Module Selection**: Students are guided on first visit through a two-stage prompt (Year & Module) saved locally in `localStorage` for personalized, instant access.
- **Structured Grouped Categorization**: Materials are grouped by functional learning category (Central Drives, Lectures, Practical Labs & OSPE, Summaries, and Past Exams).
- **Default White Theme**: Clean high-contrast white theme by default, with an optional dark mode toggle saved in `localStorage`.
- **Git-driven Content Management**: Materials are stored in typed JSON / data files within the repository, allowing easy peer contributions and version control.
- **Offline Bookmarks & PWA**: Saved client-side in `localStorage` (`asumed_bookmarks`) with web app manifest support.

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
│   ├── data/                    # Structured study materials & curriculum data
│   │   ├── modules.ts           # Year and module metadata (MED101-MED504)
│   │   ├── materials.ts         # Verified study materials production database
│   │   └── contributors.json    # Site team authors + contributor profile overrides
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
│   │   └── contributors.astro   # Site team on top + content makers (author field only, ranked)
│   ├── styles/                  # Global styles & Tailwind configuration
│   │   └── global.css
│   ├── types/                   # TypeScript interfaces & types
│   │   ├── i18n.ts              # SupportedLanguage, TranslationsDictionary types
│   │   ├── materials.ts         # Material, module, and curriculum types
│   │   └── contributors.ts      # Author, contributor profile, contact, and stats types
│   └── utils/                   # Shared pure TypeScript helper functions
│       ├── contributors.ts      # Contributor stats aggregation + initials fallback
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

---

## 5. Coding & Quality Standards

- **Static Validation**: Run `pnpm astro check` and `pnpm build` after all modifications.
- **Component Separation**: Keep components focused on a single responsibility.
- **Documentation**: Keep docs synchronized with major architectural decisions without bloating `README.md`.
