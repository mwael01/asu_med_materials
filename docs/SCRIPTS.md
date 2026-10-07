# Helper Scripts & Tooling

This document outlines automated helper scripts designed to assist AI agents and developers in maintaining, synchronizing, and expanding educational materials in the ASU Med Materials platform.

---

## 1. Cloud Firestore Schema Synchronizer

- **Location**: [`scripts/sync-firebase-schema.mjs`](file:///workspaces/asu_med_materials/scripts/sync-firebase-schema.mjs)
- **Purpose**: Inspects live remote Cloud Firestore collections, pulls accurate document counts and metadata, and synchronizes [`firebase/schema.json`](file:///workspaces/asu_med_materials/firebase/schema.json).
- **Usage**:
```bash
node scripts/sync-firebase-schema.mjs
# or via npm script:
pnpm run schema:sync
```

---

## 2. All Playlists Synchronizer (Cloud Firestore)

- **Location**: [`scripts/sync-all-playlists.js`](file:///workspaces/asu_med_materials/scripts/sync-all-playlists.js)
- **Purpose**: Queries all playlist records directly in Cloud Firestore (`materials` collection) that have a `playlistId` or YouTube playlist link, fetches live lecture videos with authentic titles and video IDs without requiring Google API credentials, and updates the corresponding Firestore documents with the `videos` array.
- **Usage**:
```bash
# Sync all playlists missing video chapters in Firestore:
node scripts/sync-all-playlists.js

# Sync a specific playlist document by its Firestore ID:
node scripts/sync-all-playlists.js --id yr1-intro-physiology-m-fayez-practical
```

---

## 3. Module & Material Seeding Scripts

- **Location**: [`scripts/seed-firestore.mjs`](file:///workspaces/asu_med_materials/scripts/seed-firestore.mjs)
- **Purpose**: Seeds new curriculum modules and batch materials directly into Cloud Firestore (`modules` and `materials` collections).
- **Usage**:
```bash
node scripts/seed-firestore.mjs
```

---

## 4. Cloud Firestore Indexes & Deployment

- **Index Definition**: [`firebase/firestore.indexes.json`](file:///workspaces/asu_med_materials/firebase/firestore.indexes.json)
- **Configuration**: Linked in [`firebase.json`](file:///workspaces/asu_med_materials/firebase.json) under `firestore.indexes`.
- **Purpose**: Configures all multi-field composite indexes (for materials, submissions, user rankings, and feedback) and single-field index exemptions to optimize query execution and prevent index bloat.
- **Usage**:
```bash
# Deploy composite indexes directly to remote Firebase project:
pnpm run deploy:indexes
# or via Firebase CLI directly:
firebase deploy --only firestore:indexes
```

## 5. Official Anki Flashcards Importer & Processor

- **Location**: [`scripts/flashcards/`](file:///home/mwael/work/asu_med_materials/scripts/flashcards)
- **Tooling**: Managed with `uv` (Python 3.12+), official `anki` library, `nh3` HTML sanitization, and `firebase-admin`.
- **Purpose**: Inspects, stages, classifies (`Subject > Unit > Chapter`), validates, and publishes Anki APKG/ZIP packages directly to Cloud Firestore.
- **Usage**:
```bash
# Inspect archive without remote writes:
uv run --project scripts/flashcards flashcards inspect "path/to/deck.apkg"

# Stage archive into Firestore drafts:
uv run --project scripts/flashcards flashcards stage "path/to/deck.apkg"

# Review staged import findings:
uv run --project scripts/flashcards flashcards review <import_id>

# Validate import completeness:
uv run --project scripts/flashcards flashcards validate <import_id>

# Publish import atomically to active website decks and linked materials:
uv run --project scripts/flashcards flashcards publish <import_id>
```

---


## Instructions for AI Agents
- **Single Source of Truth**: All study materials, curriculum modules, user profiles, and contributors live directly in Cloud Firestore. Never store or look for local JSON or static data files for materials.
- When adding new YouTube playlists, use YouTube fetch helpers to populate the `videos` array with accurate chapter titles and IDs directly in Cloud Firestore.
- Maintain error handling and rate-limiting timeouts between YouTube fetches to prevent network bans.
- Always run `pnpm run schema:sync` after adding or modifying Firestore documents to keep `firebase/schema.json` synchronized.
- Always run static validation (`pnpm astro check && pnpm build`) after code edits to ensure build and SSR integrity.

---

## 4. PWA Icon Generator

- **Location**: [`scripts/generate-icons.mjs`](file:///workspaces/asu_med_materials/scripts/generate-icons.mjs)
- **Purpose**: Generates the required PNG icons for PWA installability (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`) from the project's SVG favicon.
- **Requires**: `sharp` dev-dependency (`pnpm add -D sharp`).

### Usage:
```bash
node scripts/generate-icons.mjs
```

**Outputs** written to `public/icons/`:
| File | Size | Purpose |
|---|---|---|
| `icon-192.png` | 192×192 | Android home screen icon |
| `icon-512.png` | 512×512 | High-res / splash screen |
| `icon-maskable-512.png` | 512×512 | Maskable (adaptive icon safe zone) |

Re-run this script any time the favicon changes.

---

## PWA / Offline Architecture

The site uses a native Service Worker located at [`public/sw.js`](file:///workspaces/asu_med_materials/public/sw.js):

- **Service worker** is placed in `public/sw.js` and automatically copied to `dist/sw.js` upon build.
- **Registration**: Registered globally in [`src/layouts/Layout.astro`](file:///workspaces/asu_med_materials/src/layouts/Layout.astro) via [`src/utils/pwa.ts`](file:///workspaces/asu_med_materials/src/utils/pwa.ts).
- **Precache list**: Covers all 51 static routes (years, modules, subjects, playlists, search, contribute) and all brand icons and manifests.
- **Dynamic Asset Caching**: On install and runtime fetch, all `_astro/*.css` and `_astro/*.js` bundles are automatically discovered and cached using a Cache-First strategy.
- **Navigation Caching**: Network-First strategy with timeout (2.5s) and automatic multi-path cache fallback (matching canonical path, trailing-slash, and without trailing-slash).
- **Offline Fallback**: Branded RTL fallback page at [`public/offline.html`](file:///workspaces/asu_med_materials/public/offline.html) and home page fallback.


