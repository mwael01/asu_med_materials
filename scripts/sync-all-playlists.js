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
import { fetchPlaylistVideos } from './fetch-youtube-playlist.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const materialsDir = path.resolve(__dirname, '../src/data/materials');

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
