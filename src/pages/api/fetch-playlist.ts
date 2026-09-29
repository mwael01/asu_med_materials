import type { APIRoute } from 'astro';
import { fetchPlaylistVideos } from '../../utils/youtube';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { playlistId } = body;

    if (!playlistId) {
      return new Response(
        JSON.stringify({ error: 'playlistId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const videos = await fetchPlaylistVideos(playlistId);
    return new Response(
      JSON.stringify({ videos }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
