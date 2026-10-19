import type { APIRoute } from 'astro';
import { getMaterialsVersionFromFirestore } from '../../firebase/firestore';

export const GET: APIRoute = async () => {
  try {
    const version = await getMaterialsVersionFromFirestore();
    return new Response(JSON.stringify({ version }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to fetch version' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
