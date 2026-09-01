import 'server-only';

import { notFound } from 'next/navigation';
import { cache } from 'react';

import { db } from '@/db';
import { getCurrentAdmin } from '@/lib/auth/current-admin';
import { SLUG_PATTERN } from '@/lib/slug';

import { findPublicSpeciesBySlug, type PublicSpeciesDetail } from './public-queries';

/**
 * Datenzugriff der oeffentlichen Detailseite.
 *
 * Die Draft-Vorschau ist Lese-Logik, keine Mutation: `getCurrentAdmin()` ohne
 * Redirect-Zwang. Wer keine gueltige Session hat, bekommt denselben 404 wie jeder
 * andere — ein unveroeffentlichter Slug ist von aussen nicht von einem falschen zu
 * unterscheiden.
 *
 * `cache()`, weil `generateMetadata` und die Seite denselben Datensatz brauchen und
 * innerhalb eines Renderdurchlaufs ein Query dafuer reicht.
 */
export const resolvePublicSpecies = cache(
  async (slug: string): Promise<PublicSpeciesDetail | null> => {
    // Ein Slug, den es nach unseren eigenen Regeln nicht geben kann, braucht keinen Query.
    if (!SLUG_PATTERN.test(slug)) return null;

    const admin = await getCurrentAdmin();

    return findPublicSpeciesBySlug(db, slug, { includeDrafts: admin !== null });
  },
);

/**
 * Wie `resolvePublicSpecies`, nur ohne den Null-Fall: fuer die Seite selbst, die bei
 * einem unbekannten oder nicht sichtbaren Slug nichts anderes tun kann als 404.
 *
 * `generateMetadata` benutzt bewusst die andere Variante — Metadaten sollen keinen
 * Renderabbruch ausloesen, das entscheidet die Seite.
 */
export async function loadPublicSpecies(slug: string): Promise<PublicSpeciesDetail> {
  const row = await resolvePublicSpecies(slug);

  if (!row) {
    notFound();
  }

  return row;
}
