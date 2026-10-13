import type { APIRoute } from 'astro';
import { getAllMaterials } from '../../data/materials';

export const GET: APIRoute = async () => {
  try {
    const materials = await getAllMaterials();
    return new Response(JSON.stringify(materials), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to fetch materials catalogue' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
