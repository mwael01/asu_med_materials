# UI Component Specification & Catalog

This document details all UI components, their props, intended reuse guidelines, and responsive behavior for **ASU Med Materials**.

---

## 1. Principles & Rules

- **Minimalist & Convenient**: Omit fluff, boilerplate slogans, and filler copy. Prioritize getting students to the resource link in as few clicks as possible.
- **Arabic UI with Technical English**: Use clear Arabic for all navigation, buttons, and system messages, while preserving English medical disciplines (Anatomy, Pathology, etc.), module codes (MED101), and resource brand names (Google Drive, Telegram, YouTube).
- **Default White Theme**: Optimized for clean contrast on white backgrounds with subtle borders and emerald accents.
- **Component Reuse**: Reuse shared components across Year views, Module views, and the Search page.
- **Small Button Icons**: Use SVG icons for compact buttons and type badges; do not replace substantive visual elements with misleading standalone icons.

---

## 2. Component Inventory

### Selection & Onboarding

#### [`MultistageSelector.astro`](file:///workspaces/asu_med_materials/src/components/selection/MultistageSelector.astro)
- **Location**: `src/components/selection/MultistageSelector.astro`
- **Purpose**: Single-step modal for quick academic year selection (Years 1 to 5).
- **Persistence**: Saves choices to `localStorage` (`asumed_user_year`) and emits `user-preferences-updated`.
- **Props**: None (global client script).

---

### Navigation & Shell

#### [`Navbar.astro`](file:///workspaces/asu_med_materials/src/components/navigation/Navbar.astro)
- **Location**: `src/components/navigation/Navbar.astro`
- **Purpose**: Compact top navigation bar (`h-12`) with clean text brand title (`ASU Med Materials`), desktop nav links, featured Contribute CTA with special emerald-teal gradient and glowing animations (`.contribute-glow-btn`), year indicator badge (`#nav-user-year-badge`), search shortcut, bookmark drawer trigger, language switcher (`LanguageToggle.astro`), theme switcher (`ThemeToggle.astro`), and mobile burger menu trigger (`#mobile-menu-trigger`).
- **Props**: None.

#### [`MobileMenu.astro`](file:///workspaces/asu_med_materials/src/components/navigation/MobileMenu.astro)
- **Location**: `src/components/navigation/MobileMenu.astro`
- **Purpose**: Responsive slide-down navigation menu for small devices (< md), ensuring all pages and elements remain directly accessible. Features a prominent glowing Contribute button, 5-column Academic Years quick switcher grid (Years 1 to 5), core page links (Home, Playlists, Search, Contributors), and quick action shortcuts (Change Year, Saved Bookmarks).
- **Props**:
  ```typescript
  interface Props {
    currentPath: string;
  }
  ```


#### [`LanguageToggle.astro`](file:///workspaces/asu_med_materials/src/components/common/LanguageToggle.astro)
- **Location**: `src/components/common/LanguageToggle.astro`
- **Purpose**: Instant topbar language toggle button with a globe icon and language indicator badge (`AR` / `EN`). Triggers instantaneous in-place DOM translation without reloading or changing the URL route, updates `document.documentElement.lang` and `dir="ltr"` / `dir="rtl"`, persists user choice in `localStorage.getItem('asumed_lang')`, and dispatches `asumed-language-changed` for dynamic client components.
- **Props**: None.

#### [`Footer.astro`](file:///workspaces/asu_med_materials/src/components/navigation/Footer.astro)
- **Location**: `src/components/navigation/Footer.astro`
- **Purpose**: Minimalist site footer with creator attribution ("Made by M. Wael" linked to GitHub `@mwael01`), GitHub repository link, contribution guide link, and search index link.
- **Props**: None.

---

### Material Display

#### [`GroupedResourceList.astro`](file:///workspaces/asu_med_materials/src/components/materials/GroupedResourceList.astro)
- **Location**: `src/components/materials/GroupedResourceList.astro`
- **Purpose**: Groups study materials into functional categories:
  1. Central Drives & Channels (درايفات وقنوات الدفعة)
  2. Lectures & Playlists (محاضرات وشروحات فيديو)
  3. Practical, Labs & Dissections (سكاشن وعملي ومعامل)
  4. Summaries & Notes (ورق ومذكرات وملخصات)
  5. Past Exams & Recalls (امتحانات سابقة وريكولات)
  6. Books & References (كتب ومراجع)
- **Props**:
  ```typescript
  interface Props {
    materials: MaterialItem[];
    showYear?: boolean;
  }
  ```

#### [`ResourceCard.astro`](file:///workspaces/asu_med_materials/src/components/materials/ResourceCard.astro)
- **Location**: `src/components/materials/ResourceCard.astro`
- **Purpose**: Fast, minimalist card that functions as a single clickable link opening the resource in a new tab.
- **Interactivity**:
  - Uses an accessible body-scoped link pattern (`<div class="relative group/body"><a href={material.url}><span class="absolute inset-0"></span>...</a></div>`) strictly bounded to the title and description, guaranteeing that the top action header and footer tags are completely separated from the link hit target.
  - Title shows a visible underline on hover and active click (`group-hover/body:underline underline-offset-4 decoration-emerald-500`) with smooth transition feedback.
  - Dedicated bookmark toggle button (`.bookmark-btn`) with inline `arguments[0].stopPropagation()` and capture-phase event listeners to save materials to offline local bookmarks without triggering card navigation.
  - Dedicated studied / done checkbox toggle button (`.studied-btn`) with inline `arguments[0].stopPropagation()`, prominent `w-6 h-6` checkbox, emerald theme styling, spring pop micro-animation (`.animate-studied-pop`, `.animate-checkmark`), and instant `localStorage` persistence (`asumed_studied_materials`) with memory fallback. Uses capture-phase click and pointerdown interception to eliminate any card link interference.
- **Author Attribution ("إعداد")**:
  - Displays `author` supporting single or multiple names (array up to 5 names).
  - Displays first 2 names and appends `...` if more names exist to preserve card responsiveness and avoid line wrapping.
  - Full author list preserved in the HTML `title` tooltip for hover credit.
  - Clean, muted styling (`text-[11px] text-zinc-500 font-medium`).
- **Props**:
  ```typescript
  interface Props {
    material: MaterialItem;
    showYear?: boolean;
  }
  ```

#### [`ResourceGrid.astro`](file:///workspaces/asu_med_materials/src/components/materials/ResourceGrid.astro)
- **Location**: `src/components/materials/ResourceGrid.astro`
- **Purpose**: Responsive grid container wrapping resource cards with empty and loading states.
- **Props**:
  ```typescript
  interface Props {
    materials: MaterialItem[];
    emptyMessage?: string;
    showYear?: boolean;
  }
  ```

#### [`TypeBadge.astro`](file:///workspaces/asu_med_materials/src/components/materials/TypeBadge.astro)
- **Location**: `src/components/materials/TypeBadge.astro`
- **Purpose**: Compact badge with authentic, downloaded brand icons (Google Drive, Telegram, YouTube, WhatsApp, Summary, Exam, Book) and localized label.
- **Icons**:
  - Downloaded official SVGs located in `public/icons/` (`google-drive.svg`, `youtube.svg`, `telegram.svg`, `whatsapp.svg`, etc.).
  - Rendered with modern neutral pill styling and crisp vector clarity.
- **Props**:
  ```typescript
  interface Props {
    type: ResourceType;
    size?: 'sm' | 'md';
  }
  ```

#### [`ModuleCard.astro`](file:///workspaces/asu_med_materials/src/components/materials/ModuleCard.astro)
- **Location**: `src/components/materials/ModuleCard.astro`
- **Purpose**: Card for navigation on the Year overview page, representing an academic module.
- **Props**:
  ```typescript
  interface Props {
    module: ModuleInfo;
    resourceCount?: number;
  }
  ```

#### [`SubjectBar.astro`](file:///workspaces/asu_med_materials/src/components/materials/SubjectBar.astro)
- **Location**: `src/components/materials/SubjectBar.astro`
- **Purpose**: Horizontal scrollable navigation and filtration bar for module subjects, linking to dedicated subject pages (`/module/[id]/[subject]`).
- **Props**:
  ```typescript
  interface Props {
    moduleId: string;
    subjects: string[];
    activeSubjectSlug?: string;
    activeSubjectName?: string;
    totalCount?: number;
    materialCounts?: Record<string, number>;
  }
  ```

#### [`SubjectSelectionCards.astro`](file:///workspaces/asu_med_materials/src/components/materials/SubjectSelectionCards.astro)
- **Location**: `src/components/materials/SubjectSelectionCards.astro`
- **Purpose**: Single scrollable row of clean subject selection boxes on the module page for instant client-side subject filtration.
- **Props**:
  ```typescript
  interface Props {
    moduleId: string;
    moduleTitle: string;
    subjects: string[];
    totalCount?: number;
    materialCounts?: Record<string, number>;
  }
  ```

#### [`YearSelector.astro`](file:///workspaces/asu_med_materials/src/components/materials/YearSelector.astro)
- **Location**: `src/components/materials/YearSelector.astro`
- **Purpose**: Fast switcher bar between Academic Years 1 to 5.
- **Props**:
  ```typescript
  interface Props {
    currentYear?: AcademicYear | 'all';
  }
  ```

---

### Search & Filtering

#### [`SearchBar.astro`](file:///workspaces/asu_med_materials/src/components/search/SearchBar.astro)
- **Location**: `src/components/search/SearchBar.astro`
- **Purpose**: RTL search input with debounce, search submit button, and keyboard shortcut (`/` to focus).
- **Props**:
  ```typescript
  interface Props {
    placeholder?: string;
    initialQuery?: string;
    autofocus?: boolean;
    size?: 'default' | 'lg';
  }
  ```

#### [`FilterToolbar.astro`](file:///workspaces/asu_med_materials/src/components/search/FilterToolbar.astro)
- **Location**: `src/components/search/FilterToolbar.astro`
- **Purpose**: Horizontal pill filters for resource types. Selecting the **YouTube** filter matches both standalone YouTube videos (`type: 'youtube'`) and structured YouTube playlists (`type: 'playlist'`).
- **Props**:
  ```typescript
  interface Props {
    selectedType?: ResourceType | 'all';
  }
  ```

---

### Bookmarks & Common

#### [`BookmarksDrawer.astro`](file:///workspaces/asu_med_materials/src/components/bookmarks/BookmarksDrawer.astro)
- **Location**: `src/components/bookmarks/BookmarksDrawer.astro`
- **Purpose**: RTL slide-over Smart Drawer displaying the student's saved bookmarks organized by automatic academic hierarchy (`Module > Subject > Materials`).
- **Features**:
  - **Automatic Smart Grouping**: Materials are grouped by Module, and subdivided into clean Subject groups without bloated count pills.
  - **Quick Filters**: Instant toggle between `All` and `To Study` (unstudied only) to keep exam prep focused.
  - **Inline Studied Checkbox**: Interactive `w-6 h-6` checkbox matching the website theme for toggling completion directly inside the drawer.
  - **Home Page Shortcut**: Quick jump link to the student's Home Page Library.
- **Props**: None.

#### [`ThemeToggle.astro`](file:///workspaces/asu_med_materials/src/components/common/ThemeToggle.astro)
- **Location**: `src/components/common/ThemeToggle.astro`
- **Purpose**: Accessible button to toggle between Light (default) and Dark theme.
- **Props**: None.

#### [`Toast.astro`](file:///workspaces/asu_med_materials/src/components/common/Toast.astro)
- **Location**: `src/components/common/Toast.astro`
- **Purpose**: Floating toast notification container and global event listener (`window.showToast`).
- **Features**:
  - Supports `info`, `success`, `warning`, `error`, and `pwa` notification variants with matched icons.
  - Action buttons, dismiss button, auto-dismiss timeout, and smooth translation animations.

#### [`PwaInstallToast.astro`](file:///workspaces/asu_med_materials/src/components/pwa/PwaInstallToast.astro)
- **Location**: `src/components/pwa/PwaInstallToast.astro`
- **Purpose**: Detects device environment and prompts user to download and install the website as a PWA.
- **Rules & Guardrails**:
  - Checks if the website is already running in standalone mode (`display-mode: standalone`, `fullscreen`, iOS standalone, or already installed). If already a PWA, it strictly **never** displays the toast.

---

### Video Playlists & Embedded Player System

#### [`/playlist/[id]`](file:///workspaces/asu_med_materials/src/pages/playlist/[id].astro) (Dedicated Player Page)
- **Location**: `src/pages/playlist/[id].astro`
- **Purpose**: Distraction-free, interactive study player for watching playlists and tracking lecture progress.
- **Features**:
  - **Embedded YouTube Player**: 16:9 responsive embed supporting both multi-part video series (`youtube.com/embed/{id}`) and full YouTube playlists (`videoseries?list={playlistId}`).
  - **Watch Progress Tracking**: Interactive "Mark as Done" (تمت المشاهدة) checkmarks on individual lectures/parts, with real-time percentage progress bar.
  - **Persistence**: Watch progress persisted in `localStorage` under `asumed_playlist_{id}`.
  - **Sequential Stepper**: Previous/Next navigation controls for multi-part video collections.

---

### Contribution & Materials Sharing

#### [`ContributeForm.astro`](file:///workspaces/asu_med_materials/src/components/contribute/ContributeForm.astro)
- **Location**: `src/components/contribute/ContributeForm.astro`
- **Purpose**: Unified, zero-friction material sharing component supporting both single resource links and bulk/WhatsApp dumps in a single streamlined interface.
- **Features**:
  - Live client-side URL detection badge showing count of recognized links in real time.
  - Multi-line smart input accepting single URLs, multiple links, or complete WhatsApp messages.
  - Optional title/notes and contributor attribution inputs.
  - Dynamic module dropdown filtering based on selected academic year.
  - Automatic submission mode selection (`single` for individual link submissions, `dump` for bulk text/multiple links).
  - Submits payload to `/api/submit-material` with fallback to direct GitHub issue creation if serverless tokens are unconfigured.
  - Interactive success card replacing the form upon completion with issue link preview.
- **Props**:
  ```typescript
  interface Props {
    modules: ModuleInfo[];
  }
  ```

---

### Contributors & Site Team (`/contributors`)

Data lives in [`src/data/contributors.json`](file:///workspaces/asu_med_materials/src/data/contributors.json) (site team `authors` in manual order + `contributorProfiles` overrides with `matchNames`, optional photo, and labeled contacts). The contributors list shows content makers only: derived at build time by [`src/utils/contributors.ts`](file:///workspaces/asu_med_materials/src/utils/contributors.ts) scanning the `author` field across `materialsData` (`addedBy` ignored), then sorting descending by total. Types in [`src/types/contributors.ts`](file:///workspaces/asu_med_materials/src/types/contributors.ts).

#### [`ContactButtons.astro`](file:///workspaces/asu_med_materials/src/components/contributors/ContactButtons.astro)
- **Location**: `src/components/contributors/ContactButtons.astro`
- **Purpose**: Reusable labeled contact pills for WhatsApp, Telegram, GitHub, LinkedIn, and Instagram. Each link supports an optional label (e.g. shared batch number vs personal).
- **Props**:
  ```typescript
  interface Props {
    contacts?: PersonContacts;
    compact?: boolean;
  }
  ```

#### [`AuthorCard.astro`](file:///workspaces/asu_med_materials/src/components/contributors/AuthorCard.astro)
- **Location**: `src/components/contributors/AuthorCard.astro`
- **Purpose**: Site team card with big circular photo (`w-24 h-24 rounded-full`) or initials fallback, name, emerald role pill, one-line bio, and contact buttons.
- **Props**:
  ```typescript
  interface Props {
    author: AuthorEntry;
  }
  ```

#### [`ContributorCard.astro`](file:///workspaces/asu_med_materials/src/components/contributors/ContributorCard.astro)
- **Purpose**: Compact ranked card (`#rank` + total count). Click opens an accessible anchored popup card directly beneath the clicked contributor card/name with a directional pointer caret, active card highlight, total sources and subject count, top types, per-year breakdown, contacts, and a link to the contributor's materials (`/search?q=<name>`). Supports auto-closing other popups, outside click, and Escape key dismissal.
- **Props**:
  ```typescript
  interface Props {
    contributor: ContributorStats;
    dialogId: string;
    rank: number;
  }
  ```

---

### Home Page Student Hub (`src/pages/index.astro`)
The homepage reuses canonical shared components directly rather than bespoke card implementations:
- **Welcome & Focus Banner**: Minimalist alert matching the original design displaying active year, direct link to year modules, and change year trigger.
- **Personal Study Library**: Reuses [`ResourceCard.astro`](file:///workspaces/asu_med_materials/src/components/materials/ResourceCard.astro) inside responsive subject grids structured by automatic academic hierarchy (`Module > Subject > Materials`). Includes dynamic module filter chips and an unstudied-only toggle. Removes all manual folder dialogs, count boxes, and extraneous pills for a clean, unified presentation.



