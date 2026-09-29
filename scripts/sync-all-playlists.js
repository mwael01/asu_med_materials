#!/usr/bin/env node
/**
 * Script to automatically populate `videos` for all playlists with `playlistId`
 * across the modular JSON files under `src/data/materials/`.
 *
 * Usage:
 *   node scripts/sync-all-playlists.js
 *   node scripts/sync-all-playlists.js --file src/data/materials/blood/physiology/physiology.json
 *
 * This updates the corresponding JSON files with real video titles and IDs fetched from YouTube.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const materialsDir = path.resolve(__dirname, '../src/data/materials');

function extractPlaylistId(input) {
  if (!input) return null;
  const match = input.match(/[?&]list=([^&]+)/);
  if (match) return match[1];
  return input.trim();
}

async function fetchPlaylistVideos(playlistId) {
  const cleanId = extractPlaylistId(playlistId);
  if (!cleanId) {
    throw new Error(`Invalid playlist ID or URL: ${playlistId}`);
  }

  const url = `https://www.youtube.com/playlist?list=${cleanId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ar,en;q=0.9'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch playlist ${cleanId}: HTTP ${res.status}`);
  }

  const html = await res.text();
  const videos = [];

  const start = html.indexOf('ytInitialData = ');
  if (start !== -1) {
    const jsonStart = start + 'ytInitialData = '.length;
    const end = html.indexOf(';</script>', jsonStart);
    if (end !== -1) {
      try {
        const data = JSON.parse(html.substring(jsonStart, end));
        const contents =
          data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

        if (Array.isArray(contents)) {
          for (const item of contents) {
            if (item.lockupViewModel) {
              const vidId = item.lockupViewModel.contentId;
              const title = item.lockupViewModel.metadata?.lockupMetadataViewModel?.title?.content;
              if (vidId && title) {
                videos.push({
                  id: `${cleanId}-${videos.length + 1}`,
                  title: title.trim(),
                  youtubeId: vidId,
                  url: `https://youtu.be/${vidId}`
                });
              }
            } else if (item.playlistVideoRenderer) {
              const vidId = item.playlistVideoRenderer.videoId;
              const title =
                item.playlistVideoRenderer.title?.runs?.[0]?.text ||
                item.playlistVideoRenderer.title?.simpleText;
              if (vidId && title) {
                videos.push({
                  id: `${cleanId}-${videos.length + 1}`,
                  title: title.trim(),
                  youtubeId: vidId,
                  url: `https://youtu.be/${vidId}`
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('JSON parse warning:', err.message);
      }
    }
  }

  if (videos.length === 0) {
    const regex = /"playlistVideoRenderer":\{"videoId":"([^"]+)".*?"title":\{"runs":\[\{"text":"([^"]+)"/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const vidId = m[1];
      const title = m[2].replace(/\\u0026/g, '&').replace(/\\"/g, '"');
      videos.push({
        id: `${cleanId}-${videos.length + 1}`,
        title: title.trim(),
        youtubeId: vidId,
        url: `https://youtu.be/${vidId}`
      });
    }
  }

  return videos;
}

function getAllJsonFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function syncAllPlaylists() {
  const args = process.argv.slice(2);
  let filesToProcess = [];

  const fileArgIndex = args.indexOf('--file');
  if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
    const customPath = path.resolve(process.cwd(), args[fileArgIndex + 1]);
    if (!fs.existsSync(customPath)) {
      throw new Error(`Specified file not found: ${customPath}`);
    }
    filesToProcess = [customPath];
  } else {
    filesToProcess = getAllJsonFiles(materialsDir);
  }

  console.log(`Scanning ${filesToProcess.length} JSON file(s) under materials directory...`);

  let totalUpdatedPlaylists = 0;

  for (const filePath of filesToProcess) {
    const relPath = path.relative(path.resolve(__dirname, '..'), filePath);
    let items;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      items = JSON.parse(raw);
    } catch (err) {
      console.warn(`Skipping unparseable JSON file ${relPath}: ${err.message}`);
      continue;
    }

    if (!Array.isArray(items)) continue;

    let fileChanged = false;

    for (const item of items) {
      if (item && item.type === 'playlist' && item.playlistId) {
        const needsSync = !Array.isArray(item.videos) || item.videos.length === 0;
        if (needsSync) {
          console.log(`\nFetching videos for playlist ${item.id} (${item.playlistId}) in ${relPath}...`);
          try {
            const videos = await fetchPlaylistVideos(item.playlistId);
            console.log(`  -> Found ${videos.length} videos`);
            if (videos.length > 0) {
              item.videos = videos;
              fileChanged = true;
              totalUpdatedPlaylists++;
            }
          } catch (err) {
            console.error(`  -> Failed for ${item.id}:`, err.message);
          }
          // Small delay to avoid aggressive rate limiting
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }

    if (fileChanged) {
      fs.writeFileSync(filePath, JSON.stringify(items, null, 2) + '\n', 'utf8');
      console.log(`Saved updates to ${relPath}`);
    }
  }

  if (totalUpdatedPlaylists === 0) {
    console.log('\nAll playlists are already fully synchronized! No missing video arrays found.');
  } else {
    console.log(`\nSuccessfully synchronized ${totalUpdatedPlaylists} playlist(s) across JSON files!`);
  }
}

syncAllPlaylists().catch(console.error);
