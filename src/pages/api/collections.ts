import type { APIRoute } from 'astro';
import { getAllCollections } from '../../data/collections';

export const GET: APIRoute = async () => {
  try {
    const collections = await getAllCollections();
    return new Response(JSON.stringify(collections), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to fetch collections' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
