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
│   │   ├── common/              # Theme toggle (ThemeToggle.astro)
│   │   ├── materials/           # ResourceCard, GroupedResourceList, ModuleCard, SubjectBar, YearSelector
│   │   ├── navigation/          # Navbar.astro, Footer.astro
│   │   ├── search/              # SearchBar.astro, FilterToolbar.astro
│   │   └── selection/           # MultistageSelector.astro (Two-stage Year/Module modal)
│   ├── data/                    # Structured study materials & curriculum data
│   │   ├── modules.ts           # Year and module metadata (MED101-MED504)
│   │   └── materials.ts         # Verified study materials production database
│   ├── layouts/                 # Base page layouts
│   │   └── Layout.astro         # Shell with RTL, SEO, PWA, and Theme setup
│   ├── pages/                   # File-based routing
│   │   ├── index.astro          # Landing dashboard & personalized year card
│   │   ├── year/[year].astro    # Year-specific overview & grouped materials
│   │   ├── module/[id].astro    # Dedicated module resources page
│   │   ├── module/[id]/[subject].astro # Dedicated module subject page
│   │   ├── search.astro         # Global search & multi-filter explorer
│   │   └── contribute.astro     # Contribution guide & automatic submission form
│   ├── styles/                  # Global styles & Tailwind configuration
│   │   └── global.css
│   ├── types/                   # TypeScript interfaces & types
│   │   └── materials.ts         # Material, module, and curriculum types
│   └── utils/                   # Shared pure TypeScript helper functions
│       ├── filter.ts            # Search and filter matching logic
│       ├── slug.ts              # URL slugification for subjects and routes
│       └── storage.ts           # Bookmarks & user year preferences in localStorage
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

1. **Multistage Onboarding, Auto-Redirection & Year Preference**:
   - Stored in `localStorage` under `asumed_user_year` and `asumed_user_module`.
   - **Auto-Redirection**: Returning students visiting `/` are automatically and immediately redirected to their chosen academic year (`/year/${savedYear}`).
   - **Bypass Flag (`?redirect=false`)**: Users who wish to access the home page directly can pass `?redirect=false` (or `?noredirect=true`). Navbar and breadcrumbs "الرئيسية" links automatically include `/?redirect=false` to prevent redirect loops.
   - On first visit to the homepage (when no year is set), [`MultistageSelector.astro`](file:///workspaces/asu_med_materials/src/components/selection/MultistageSelector.astro) prompts the student to select their Academic Year, followed by their current module or all modules.
   - The user's selection immediately personalizes the homepage banner and navbar indicator, and can be changed anytime via the "تغيير السنة" button.

2. **Default Light Theme & Tailwind v4 Custom Dark Variant**:
   - In Tailwind CSS v4, manual class-based dark mode requires `@custom-variant dark (&:where(.dark, .dark *));` in [`src/styles/global.css`](file:///workspaces/asu_med_materials/src/styles/global.css) to override the default system `@media (prefers-color-scheme: dark)`.
   - Zero flash of unstyled theme (FOUC) handled via an inline `<script>` in [`Layout.astro`](file:///workspaces/asu_med_materials/src/layouts/Layout.astro).
   - Defaults to white/light mode. Dark mode is only activated if `localStorage.getItem('theme') === 'dark'`.

3. **Bookmarks System**:
   - Users can bookmark frequently accessed drives, channels, and playlists.
   - Saved in client `localStorage` under `asumed_bookmarks`.
   - Accessible from the top navbar drawer even when offline.

4. **Instant Search & Filtering**:
   - Client-side in-memory search using normalized text scoring over title, subject, tags, and author.
   - Live URL query parameters (`?q=...&type=...&year=...`) for shareable search states.

5. **Direct GitHub Issues API Integration (Vercel Serverless Function)**:
   - Implemented via [`api/submit-material.js`](file:///workspaces/asu_med_materials/api/submit-material.js) as a native Vercel Serverless Function at `POST /api/submit-material`.
   - In development, serviced via Vite connect middleware in [`astro.config.mjs`](file:///workspaces/asu_med_materials/astro.config.mjs).
   - In production on Vercel, executes securely using the `GITHUB_TOKEN` environment variable to create issues on `mwael01/asu_med_materials` directly via GitHub REST API.
   - The contribute page ([`src/pages/contribute.astro`](file:///workspaces/asu_med_materials/src/pages/contribute.astro)) provides a clean, single-purpose form without manual PR cards or external GitHub issues links, giving students instant on-page confirmation and status feedback.

6. **Per-Subject Filtration & Dedicated Subject Pages**:
   - Every module features a [`SubjectBar.astro`](file:///workspaces/asu_med_materials/src/components/materials/SubjectBar.astro) navigation bar showing all academic subjects for that module.
   - Each subject has a dedicated static URL route (`/module/[id]/[subject]`, e.g. `/module/year1-foundation/medical-biochemistry`) with dedicated title, SEO, custom breadcrumbs, and empty states.
   - Material cards link directly to their corresponding subject page via clickable subject badges.

---

## 5. Coding & Quality Standards

- **Static Validation**: Run `pnpm astro check` and `pnpm build` after all modifications.
- **Component Separation**: Keep components focused on a single responsibility.
- **Documentation**: Keep docs synchronized with major architectural decisions without bloating `README.md`.
