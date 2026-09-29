import type { APIRoute } from 'astro';
import { fetchDriveMetadata } from '../../utils/drive';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { driveUrl } = body;

    if (!driveUrl) {
      return new Response(
        JSON.stringify({ error: 'driveUrl is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const files = await fetchDriveMetadata(driveUrl);
    return new Response(
      JSON.stringify({ files }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
