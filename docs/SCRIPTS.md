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

The site uses **`@vite-pwa/astro`** (Workbox `generateSW` strategy) for offline support:

- **Service worker** is auto-generated at build time into `dist/sw.js`.
- **Precache manifest** covers every HTML page, `_astro/` JS+CSS chunk, and icon — all 51+ pages are available offline after first visit.
- **Navigation fallback** sends `/` for any uncached HTML request when offline.
- **`autoUpdate`** strategy: the SW updates silently in the background on new deployments.
- **Dev mode**: SW is disabled in dev (`devOptions.enabled: false`) to avoid stale-cache issues during development.

> **Important**: Never place a hand-written `public/sw.js` — Workbox generates this file at build time and any manual file will be overwritten or conflict.

