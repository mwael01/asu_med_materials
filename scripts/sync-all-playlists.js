#!/usr/bin/env node
/**
 * Script to automatically populate `videos` for all playlists with `playlistId`
 * directly in Cloud Firestore.
 *
 * Usage:
 *   node scripts/sync-all-playlists.js
 *   node scripts/sync-all-playlists.js --id yr1-intro-physiology-m-fayez-practical
 *
 * This queries Cloud Firestore for playlist materials, fetches real video titles
 * and IDs from YouTube, and updates the corresponding Firestore document.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local or .env
for (const envFile of ['.env.local', '.env']) {
  const p = resolve(__dirname, `../${envFile}`);
  if (existsSync(p)) {
    const content = readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const firebaseConfig = {
  apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('[Error] Firebase configuration missing in environment.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
      'Accept-Language': 'ar,en;q=0.9',
    },
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
                  url: `https://youtu.be/${vidId}`,
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
                  url: `https://youtu.be/${vidId}`,
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
        url: `https://youtu.be/${vidId}`,
      });
    }
  }

  return videos;
}

async function syncAllPlaylists() {
  const args = process.argv.slice(2);
  const idArgIndex = args.indexOf('--id');
  const targetId = idArgIndex !== -1 ? args[idArgIndex + 1] : null;

  console.log('📡 Connecting to Cloud Firestore...');

  let playlistsToProcess = [];

  if (targetId) {
    const docSnap = await getDoc(doc(db, 'materials', targetId));
    if (!docSnap.exists()) {
      throw new Error(`Specified material not found in Firestore: ${targetId}`);
    }
    playlistsToProcess = [{ id: docSnap.id, ...docSnap.data() }];
  } else {
    const snap = await getDocs(collection(db, 'materials'));
    playlistsToProcess = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((item) => item.type === 'playlist' || Boolean(item.playlistId) || (item.url && item.url.includes('list=')));
  }

  console.log(`Found ${playlistsToProcess.length} playlist resource(s) in Cloud Firestore.`);

  let totalUpdated = 0;

  for (const item of playlistsToProcess) {
    const pid = item.playlistId || extractPlaylistId(item.url);
    if (!pid) continue;

    const needsSync = !Array.isArray(item.videos) || item.videos.length === 0;
    if (needsSync) {
      console.log(`\nFetching videos for playlist '${item.id}' (${pid})...`);
      try {
        const videos = await fetchPlaylistVideos(pid);
        console.log(`  -> Found ${videos.length} videos`);
        if (videos.length > 0) {
          await updateDoc(doc(db, 'materials', item.id), {
            playlistId: pid,
            videos,
          });
          totalUpdated++;
          console.log(`  ✓ Updated Firestore document for '${item.id}'`);
        }
      } catch (err) {
        console.error(`  ❌ Failed for ${item.id}:`, err.message);
      }
      // Courteous rate-limiting timeout between YouTube fetches
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (totalUpdated === 0) {
    console.log('\nAll playlists in Firestore are already fully synchronized!');
  } else {
    console.log(`\n🎉 Successfully synchronized ${totalUpdated} playlist(s) in Cloud Firestore!`);
  }

  process.exit(0);
}

syncAllPlaylists().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
