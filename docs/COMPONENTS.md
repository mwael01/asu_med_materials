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
