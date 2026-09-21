/**
 * Helper script to fetch YouTube playlist videos (ID, Title, URL) without requiring an API key.
 * 
 * Supports YouTube's modern InnerTube `lockupViewModel` as well as classic `playlistVideoRenderer`.
 *
 * Usage:
 *   node scripts/fetch-youtube-playlist.js <playlistId_or_URL>
 *   node scripts/fetch-youtube-playlist.js --json <playlistId_or_URL>
 *
 * Examples:
 *   node scripts/fetch-youtube-playlist.js PLIZNmuBMEjaMZmwn2FVmG8bYsmVs5n-_v
 *   node scripts/fetch-youtube-playlist.js "https://www.youtube.com/playlist?list=PLFkJTdtzWoIaAWbijL3Pw4gVnxDjjPG8U"
 */

export function extractPlaylistId(input) {
  if (!input) return null;
  const match = input.match(/[?&]list=([^&]+)/);
  if (match) return match[1];
  return input.trim();
}

export async function fetchPlaylistVideos(playlistId) {
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

  // Parse ytInitialData JSON payload
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

  // Regex fallback if JSON extraction found nothing
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

// CLI Execution Support
if (process.argv[1]?.endsWith('fetch-youtube-playlist.js')) {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const target = args.find((a) => !a.startsWith('--'));

  if (!target) {
    console.error('Usage: node scripts/fetch-youtube-playlist.js [--json] <playlistId_or_URL>');
    process.exit(1);
  }

  fetchPlaylistVideos(target)
    .then((videos) => {
      if (isJson) {
        console.log(JSON.stringify(videos, null, 2));
      } else {
        console.log(`\nFetched ${videos.length} videos from playlist:`);
        videos.forEach((v, i) => {
          console.log(`[${i + 1}] ${v.title} (${v.youtubeId})`);
        });
      }
    })
    .catch((err) => {
      console.error('Error fetching playlist:', err.message);
      process.exit(1);
    });
}
