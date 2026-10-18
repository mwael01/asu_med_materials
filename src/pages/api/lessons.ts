import type { APIRoute } from 'astro';
import { getPublicLessons } from '../../data/catalogue.server';

export const GET: APIRoute = async () => {
  try {
    const lessons = await getPublicLessons();
    return new Response(JSON.stringify(lessons), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to fetch lessons catalogue' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
