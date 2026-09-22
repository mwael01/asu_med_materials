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
- **Purpose**: Two-stage prompt modal for student onboarding and quick year switching.
  - **Stage 1**: Choose Academic Year (السنة الأولى إلى الخامسة).
  - **Stage 2**: Choose current module or view entire year.
- **Persistence**: Saves choices to `localStorage` (`asumed_user_year`, `asumed_user_module`) and emits `user-preferences-updated`.
- **Props**: None (global client script).

---

### Navigation & Shell

#### [`Navbar.astro`](file:///workspaces/asu_med_materials/src/components/navigation/Navbar.astro)
- **Location**: `src/components/navigation/Navbar.astro`
- **Purpose**: Compact top navigation bar (`h-12`) with clean text brand title (`ASU Med Materials`), academic year links, search shortcut, year indicator badge (`#nav-user-year-badge`), bookmark drawer trigger, and theme switch.
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
  - Uses an accessible stretched-link pattern (`<a href={material.url}><span class="absolute inset-0"></span>...</a>`) so clicking anywhere on the card opens the resource in a new tab.
  - Title shows a visible underline on hover and active click (`group-hover:underline group-active:underline underline-offset-4 decoration-emerald-500`) with subtle tactile click feedback (`active:scale-[0.99]`).
  - Includes a dedicated bookmark toggle button (`.bookmark-btn`) with `z-10` in the top bar to save materials to offline local bookmarks without triggering the external link.
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
- **Purpose**: RTL search input with debounce and keyboard shortcut (`/` to focus).
- **Props**:
  ```typescript
  interface Props {
    placeholder?: string;
    initialQuery?: string;
    autofocus?: boolean;
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
- **Purpose**: RTL slide-over drawer showing the student's saved bookmarks stored in `localStorage`.
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

#### [`/playlists`](file:///workspaces/asu_med_materials/src/pages/playlists.astro) (Catalog Page)
- **Location**: `src/pages/playlists.astro`
- **Purpose**: Central catalog for all structured video playlists and lecture series across disciplines.
- **Features**:
  - Filter pills by medical subject (`Anatomy`, `Physiology`, `Histology`, `Biochemistry`, `Pharmacology`, `Pathology`, `Parasitology`, `Microbiology`).
  - Progress badge showing watched items count reading from `localStorage`.
  - Quick action buttons to launch the embedded player.

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

#### [`QuickDumpForm.astro`](file:///workspaces/asu_med_materials/src/components/contribute/QuickDumpForm.astro)
- **Location**: `src/components/contribute/QuickDumpForm.astro`
- **Purpose**: Permissive, zero-friction material sharing component enabling students to dump forwarded WhatsApp messages, multiple URLs, notes, and text blocks directly.
- **Features**:
  - Live client-side URL detection badge (`🔗 تم رصد X رابط`).
  - Interactive "تجربة بنموذج رسالة" button to pre-fill a realistic batch message.
  - Non-mandatory contributor attribution field (supports anonymous contributions).
  - Optional academic year and module selectors.
  - Submits payload to `/api/submit-material` with fallback to direct GitHub issue creation if serverless tokens are unconfigured.
- **Props**:
  ```typescript
  interface Props {
    modules: ModuleInfo[];
  }
  ```

#### [`DetailedSubmitForm.astro`](file:///workspaces/asu_med_materials/src/components/contribute/DetailedSubmitForm.astro)
- **Location**: `src/components/contribute/DetailedSubmitForm.astro`
- **Purpose**: Permissive individual source submission form for users who wish to specify metadata for a single resource.
- **Features**:
  - URL input with automatic protocol prefixing (`https://`).
  - Optional title, description, and author attribution fields.
  - Academic year, module, and resource type selectors.
  - Direct feedback box with issue URL and fallback links.
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

