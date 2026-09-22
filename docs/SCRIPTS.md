# Helper Scripts & Tooling

This document outlines automated helper scripts designed to assist AI agents and developers in maintaining, synchronizing, and expanding educational materials in the ASU Med Materials platform.

---

## 1. YouTube Playlist Video Fetcher

- **Location**: [`scripts/fetch-youtube-playlist.js`](file:///workspaces/asu_med_materials/scripts/fetch-youtube-playlist.js)
- **Purpose**: Fetches real video titles, YouTube video IDs, and URLs for any public YouTube playlist without requiring Google API credentials.
- **Capabilities**:
  - Parses modern YouTube web payloads (`lockupViewModel`) and legacy `playlistVideoRenderer`.
  - Supports both direct playlist IDs (e.g. `PLIZNmuBMEjaMZmwn2FVmG8bYsmVs5n-_v`) and full YouTube playlist URLs.
  - Generates structured metadata compatible with `MaterialVideoItem`.

### Usage:
```bash
# Display formatted video list in terminal:
node scripts/fetch-youtube-playlist.js <playlistId_or_URL>

# Output raw JSON array:
node scripts/fetch-youtube-playlist.js --json <playlistId_or_URL>
```

---

## 2. All Playlists Synchronizer

- **Location**: [`scripts/sync-all-playlists.js`](file:///workspaces/asu_med_materials/scripts/sync-all-playlists.js)
- **Purpose**: Iterates over all playlist records defined in [`src/data/materials.ts`](file:///workspaces/asu_med_materials/src/data/materials.ts) that contain a `playlistId`, fetches their live lecture videos from YouTube, and populates the `videos: [ ... ]` property with authentic video names and IDs.

### Usage:
```bash
node scripts/sync-all-playlists.js
```

---

## 3. Materials Dump Parser

- **Location**: [`scripts/parse-materials-dump.js`](file:///workspaces/asu_med_materials/scripts/parse-materials-dump.js)
- **Purpose**: Parses raw WhatsApp messages, multi-link text blocks, or GitHub issues and extracts structured draft `MaterialItem` objects ready to copy-paste into `src/data/materials.ts`.
- **Capabilities**:
  - Automatically identifies URLs (Google Drive, Telegram channels, YouTube playlists/videos, WhatsApp groups, PDF downloads).
  - Extracts title and context around each link from preceding or inline text.
  - Generates unique slugs and tags.
  - Can fetch GitHub issues directly using `--issue <issue_number>` to extract raw dumped content and contributor metadata.

### Usage:
```bash
# Parse a raw text or WhatsApp message string:
node scripts/parse-materials-dump.js "درايف المحاضرات https://drive.google.com/... وقناة التليجرام https://t.me/..."

# Parse from a text file:
node scripts/parse-materials-dump.js --file ./message.txt --module year2-blood --year 2

# Parse directly from a GitHub issue:
node scripts/parse-materials-dump.js --issue 15
```

---

## Instructions for AI Agents
- When adding new YouTube playlists or series to `src/data/materials.ts`, you may use these scripts to populate detailed video lectures automatically instead of manually typing each video ID.
- Maintain error handling and rate-limiting timeouts between YouTube fetches to prevent network bans.
- Always run static validation (`pnpm astro check && pnpm build`) after updating data files.

---

## 3. PWA Icon Generator

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


