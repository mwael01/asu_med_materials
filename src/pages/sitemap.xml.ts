import type { APIRoute } from 'astro';
import { getMaterialsVersionFromFirestore } from '../firebase/firestore';
import { getPublicLessons, getPublicMaterials, getPublicModules } from '../data/catalogue.server';
import { getAllCollections } from '../data/collections';
import { generateSitemapEntries, renderSitemapXml, resolveSiteOrigin } from '../utils/seo';

export const GET: APIRoute = async () => {
  const origin = resolveSiteOrigin(import.meta.env.PUBLIC_SITE_URL);
  const version = await getMaterialsVersionFromFirestore();

  const [modules, lessons, materials, collections] = await Promise.all([
    getPublicModules(version),
    getPublicLessons(version),
    getPublicMaterials(version),
    getAllCollections()
  ]);

  const entries = generateSitemapEntries({
    origin,
    modules,
    lessons,
    materials,
    collections
  });

  const xml = renderSitemapXml(entries);

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
};
