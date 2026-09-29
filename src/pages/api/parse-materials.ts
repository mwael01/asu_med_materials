import type { APIRoute } from 'astro';
import { parseDumpText } from '../../utils/materialParser';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { text, year, moduleId, subject, author, addedBy } = body;

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'text is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const items = parseDumpText(text, { year, moduleId, subject, author, addedBy });
    return new Response(
      JSON.stringify({ items }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
