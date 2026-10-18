import type { APIRoute } from 'astro';
import { getAllModules } from '../../data/modules';

export const GET: APIRoute = async () => {
  try {
    const modules = await getAllModules();
    return new Response(JSON.stringify(modules), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to fetch modules catalogue' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
