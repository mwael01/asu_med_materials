/**
 * Script to automatically populate `videos` for all playlists with `playlistId` in `src/data/materials.ts`.
 *
 * Usage:
 *   node scripts/sync-all-playlists.js
 *
 * This updates `src/data/materials.ts` with real video titles and IDs fetched from YouTube.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPlaylistVideos } from './fetch-youtube-playlist.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const materialsFilePath = path.resolve(__dirname, '../src/data/materials.ts');

async function syncAllPlaylists() {
  console.log('Reading materials data from:', materialsFilePath);
  let content = fs.readFileSync(materialsFilePath, 'utf8');

  // Find all playlist blocks:
  // Match objects with type: 'playlist' and playlistId: '...'
  const playlistBlockRegex = /{\s*id:\s*'([^']+)',[\s\S]*?type:\s*'playlist',[\s\S]*?playlistId:\s*'([^']+)',([\s\S]*?tags:)/g;

  let match;
  const updates = [];

  while ((match = playlistBlockRegex.exec(content)) !== null) {
    const id = match[1];
    const playlistId = match[2];
    const intermediate = match[3];

    // Only fetch if videos is not already present
    if (!intermediate.includes('videos:')) {
      updates.push({ id, playlistId });
    }
  }

  console.log(`Found ${updates.length} playlists to fetch video items for...`);

  for (const item of updates) {
    console.log(`\nFetching for playlist ${item.id} (${item.playlistId})...`);
    try {
      const videos = await fetchPlaylistVideos(item.playlistId);
      console.log(`  -> Found ${videos.length} videos`);

      if (videos.length > 0) {
        // Format videos as JS code
        const videosCode =
          'videos: [\n' +
          videos
            .map(
              (v) =>
                `      { id: ${JSON.stringify(v.id)}, title: ${JSON.stringify(v.title)}, youtubeId: ${JSON.stringify(v.youtubeId)}, url: ${JSON.stringify(v.url)} }`
            )
            .join(',\n') +
          '\n    ],\n    ';

        // Insert videos right after playlistId: '...'
        const targetSearch = `id: '${item.id}',`;
        const itemIdx = content.indexOf(targetSearch);
        if (itemIdx !== -1) {
          const playlistIdStr = `playlistId: '${item.playlistId}',`;
          const plIdIdx = content.indexOf(playlistIdStr, itemIdx);
          if (plIdIdx !== -1) {
            const insertPos = plIdIdx + playlistIdStr.length;
            content =
              content.slice(0, insertPos) +
              '\n    ' +
              videosCode.trim() +
              content.slice(insertPos);
            console.log(`  -> Successfully injected ${videos.length} videos into ${item.id}`);
          }
        }
      }
    } catch (err) {
      console.error(`  -> Failed for ${item.id}:`, err.message);
    }
    // Small delay to avoid aggressive rate limiting
    await new Promise((r) => setTimeout(r, 600));
  }

  fs.writeFileSync(materialsFilePath, content, 'utf8');
  console.log('\nAll playlist video sync completed and saved to src/data/materials.ts!');
}

syncAllPlaylists().catch(console.error);
