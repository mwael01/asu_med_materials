export function extractPlaylistId(input: string): string | null {
  if (!input) return null;
  const match = input.match(/[?&]list=([^&]+)/);
  if (match) return match[1];
  return input.trim();
}

export interface PlaylistVideo {
  id: string;
  title: string;
  youtubeId: string;
  url: string;
}

export async function fetchPlaylistVideos(playlistId: string): Promise<PlaylistVideo[]> {
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
  const videos: PlaylistVideo[] = [];

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
        console.warn('JSON parse warning:', err);
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
