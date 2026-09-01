import 'server-only';

import { and, asc, eq, isNotNull } from 'drizzle-orm';

import { media, species, type Species } from '@/db/schema';
import type { Db } from '@/db/types';
import { listSpeciesMedia, type MediaItem } from '@/lib/media/queries';

/**
 * Die oeffentliche Lesesicht auf `species`.
 *
 * Eigene Datei statt eines Flags in `queries.ts`: der Sichtbarkeitsfilter ist keine
 * Bedingung, die jede Seite selbst dranschreiben soll. Wer hier importiert, bekommt
 * `published` — die einzige Ausnahme ist die Draft-Vorschau, und die muss man
 * ausdruecklich anfordern.
 */

export type SpeciesCover = {
  url: string;
  alt: string;
  width: number;
  height: number;
};

export type PublicSpeciesListItem = {
  slug: string;
  scientificName: string;
  commonName: string | null;
  difficulty: Species['difficulty'];
  cover: SpeciesCover | null;
};

export type PublicSpeciesDetail = {
  id: string;
  slug: string;
  scientificName: string;
  commonName: string | null;
  description: string | null;
  temperatureMinCelsius: number | null;
  temperatureMaxCelsius: number | null;
  humidityMinPercent: number | null;
  humidityMaxPercent: number | null;
  adultSizeMinMm: number | null;
  adultSizeMaxMm: number | null;
  difficulty: Species['difficulty'];
  /** Die Seite muss wissen, ob sie gerade einen Entwurf zeigt. */
  published: boolean;
  /** In `position`-Reihenfolge; das erste ist das Titelbild. */
  images: MediaItem[];
};

/**
 * Titelbild je Art in einem Zug.
 *
 * `distinct on (species_id)` liefert pro Art genau die erste Zeile der Sortierung —
 * dieselbe Reihenfolge, nach der die Galerie sortiert. Die Alternative waere ein
 * Query pro Karte; bei fuenfzig Arten waeren das fuenfzig Roundtrips fuer ein Bild.
 */
function coverSubquery(db: Db) {
  return (
    db
      .selectDistinctOn([media.speciesId], {
        speciesId: media.speciesId,
        url: media.url,
        alt: media.alt,
        width: media.width,
        height: media.height,
      })
      .from(media)
      // Produktbilder haben keine species_id und wuerden sonst eine eigene Gruppe bilden.
      .where(isNotNull(media.speciesId))
      .orderBy(asc(media.speciesId), asc(media.position), asc(media.createdAt))
      .as('cover')
  );
}

/** Nach dem Left Join koennen die Bildspalten fehlen — dann gibt es kein Titelbild. */
function toCover(row: {
  coverUrl: string | null;
  coverAlt: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
}): SpeciesCover | null {
  if (
    row.coverUrl === null ||
    row.coverAlt === null ||
    row.coverWidth === null ||
    row.coverHeight === null
  ) {
    return null;
  }

  return { url: row.coverUrl, alt: row.coverAlt, width: row.coverWidth, height: row.coverHeight };
}

/**
 * Alle veroeffentlichten Arten fuer das Verzeichnis, alphabetisch nach dem
 * wissenschaftlichen Namen. `description` bleibt draussen — bis zu 4000 Zeichen pro
 * Art, die keine Karte anzeigt.
 */
export async function listPublishedSpecies(db: Db): Promise<PublicSpeciesListItem[]> {
  const cover = coverSubquery(db);

  const rows = await db
    .select({
      slug: species.slug,
      scientificName: species.scientificName,
      commonName: species.commonName,
      difficulty: species.difficulty,
      coverUrl: cover.url,
      coverAlt: cover.alt,
      coverWidth: cover.width,
      coverHeight: cover.height,
    })
    .from(species)
    .leftJoin(cover, eq(cover.speciesId, species.id))
    .where(eq(species.published, true))
    .orderBy(asc(species.scientificName));

  return rows.map((row) => ({
    slug: row.slug,
    scientificName: row.scientificName,
    commonName: row.commonName,
    difficulty: row.difficulty,
    cover: toCover(row),
  }));
}

/**
 * Eine Art samt Bildern.
 *
 * `includeDrafts` ist ein Pflichtparameter und kein Default: wer einen Entwurf
 * ausliefert, soll das an der Aufrufstelle sichtbar entschieden haben.
 */
export async function findPublicSpeciesBySlug(
  db: Db,
  slug: string,
  options: { includeDrafts: boolean },
): Promise<PublicSpeciesDetail | null> {
  const visibility = options.includeDrafts
    ? eq(species.slug, slug)
    : and(eq(species.slug, slug), eq(species.published, true));

  const rows = await db
    .select({
      id: species.id,
      slug: species.slug,
      scientificName: species.scientificName,
      commonName: species.commonName,
      description: species.description,
      temperatureMinCelsius: species.temperatureMinCelsius,
      temperatureMaxCelsius: species.temperatureMaxCelsius,
      humidityMinPercent: species.humidityMinPercent,
      humidityMaxPercent: species.humidityMaxPercent,
      adultSizeMinMm: species.adultSizeMinMm,
      adultSizeMaxMm: species.adultSizeMaxMm,
      difficulty: species.difficulty,
      published: species.published,
    })
    .from(species)
    .where(visibility)
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Zweiter Query statt Join: ein Join wuerde die Art pro Bild wiederholen, und die
  // Sortierlogik der Galerie steht schon in `listSpeciesMedia`.
  const images = await listSpeciesMedia(db, row.id);

  return { ...row, images };
}
