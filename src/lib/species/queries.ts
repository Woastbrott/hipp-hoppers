import 'server-only';

import { asc, count, eq } from 'drizzle-orm';

import { products, species, type Species } from '@/db/schema';
import type { Db } from '@/db/types';
import { isForeignKeyViolation, isUniqueViolation } from '@/lib/db-errors';
import { collectSpeciesBlobUrls } from '@/lib/media/queries';
import type { SpeciesFormValues } from '@/lib/validation/species';

/** Aus der Migration; siehe src/db/migrations. */
const SLUG_CONSTRAINT = 'species_slug_key';
const PRODUCT_SPECIES_FK = 'products_species_id_species_id_fk';

export type SpeciesListItem = {
  id: string;
  slug: string;
  scientificName: string;
  commonName: string | null;
  difficulty: Species['difficulty'];
  published: boolean;
  updatedAt: Date;
};

export type SpeciesWriteResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; reason: 'slug_taken' }
  | { ok: false; reason: 'not_found' };

export type SpeciesDeleteResult =
  /** `blobUrls` sind die Dateien, die jetzt niemand mehr referenziert. */
  | { ok: true; blobUrls: string[] }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'has_products'; productCount: number };

/**
 * Nur die Spalten, die die Liste anzeigt. `description` ist bis zu 4000 Zeichen lang
 * und hat in einer Uebersicht nichts verloren.
 */
export async function listSpecies(db: Db): Promise<SpeciesListItem[]> {
  return db
    .select({
      id: species.id,
      slug: species.slug,
      scientificName: species.scientificName,
      commonName: species.commonName,
      difficulty: species.difficulty,
      published: species.published,
      updatedAt: species.updatedAt,
    })
    .from(species)
    .orderBy(asc(species.scientificName));
}

export async function findSpeciesById(db: Db, id: string): Promise<Species | null> {
  const rows = await db.select().from(species).where(eq(species.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Explizite Spaltenliste statt eines durchgereichten Objekts: was hier nicht steht,
 * kann ueber das Formular auch nicht geschrieben werden. `id`, `createdAt` und
 * `published` ueber die Schnellaktion bleiben damit ausserhalb der Reichweite des Requests.
 */
function writableColumns(values: SpeciesFormValues) {
  return {
    slug: values.slug,
    scientificName: values.scientificName,
    commonName: values.commonName,
    description: values.description,
    temperatureMinCelsius: values.temperatureMinCelsius,
    temperatureMaxCelsius: values.temperatureMaxCelsius,
    humidityMinPercent: values.humidityMinPercent,
    humidityMaxPercent: values.humidityMaxPercent,
    adultSizeMinMm: values.adultSizeMinMm,
    adultSizeMaxMm: values.adultSizeMaxMm,
    difficulty: values.difficulty,
    published: values.published,
  };
}

export async function createSpecies(
  db: Db,
  values: SpeciesFormValues,
): Promise<SpeciesWriteResult> {
  try {
    const rows = await db
      .insert(species)
      .values(writableColumns(values))
      .returning({ id: species.id, slug: species.slug });

    const row = rows[0];
    if (!row) return { ok: false, reason: 'not_found' };

    return { ok: true, id: row.id, slug: row.slug };
  } catch (error: unknown) {
    if (isUniqueViolation(error, SLUG_CONSTRAINT)) {
      return { ok: false, reason: 'slug_taken' };
    }
    throw error;
  }
}

export async function updateSpecies(
  db: Db,
  id: string,
  values: SpeciesFormValues,
): Promise<SpeciesWriteResult> {
  try {
    const rows = await db
      .update(species)
      // `updatedAt` hat nur ein Insert-Default — bei Updates muss es von Hand kommen.
      .set({ ...writableColumns(values), updatedAt: new Date() })
      .where(eq(species.id, id))
      .returning({ id: species.id, slug: species.slug });

    const row = rows[0];
    if (!row) return { ok: false, reason: 'not_found' };

    return { ok: true, id: row.id, slug: row.slug };
  } catch (error: unknown) {
    if (isUniqueViolation(error, SLUG_CONSTRAINT)) {
      return { ok: false, reason: 'slug_taken' };
    }
    throw error;
  }
}

export async function setSpeciesPublished(
  db: Db,
  id: string,
  published: boolean,
): Promise<SpeciesWriteResult> {
  const rows = await db
    .update(species)
    .set({ published, updatedAt: new Date() })
    .where(eq(species.id, id))
    .returning({ id: species.id, slug: species.slug });

  const row = rows[0];
  if (!row) return { ok: false, reason: 'not_found' };

  return { ok: true, id: row.id, slug: row.slug };
}

export async function countProductsForSpecies(db: Db, speciesId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(products)
    .where(eq(products.speciesId, speciesId));

  return rows[0]?.value ?? 0;
}

/**
 * Zwei Schutzschichten, absichtlich:
 *  1. Die Zaehlung liefert eine lesbare Meldung ("3 Produkte haengen dran").
 *  2. Der Fremdschluessel steht auf `restrict` und faengt den Fall, in dem zwischen
 *     Zaehlung und Delete ein Produkt entsteht.
 *
 * Eine Transaktion waere hier das naheliegende Mittel — der neon-http-Treiber kann
 * aber keine interaktiven Transaktionen. Das Constraint leistet dasselbe, ohne dass
 * die Anwendung dafuer geradestehen muss.
 *
 * Die Bild-URLs werden VOR dem Loeschen eingesammelt, weil die `media`-Zeilen mit der
 * Art kaskadierend verschwinden. Das Aufraeumen im Blob-Store macht die Action —
 * hier bleibt es bei der Datenbank.
 */
export async function deleteSpecies(db: Db, id: string): Promise<SpeciesDeleteResult> {
  const productCount = await countProductsForSpecies(db, id);

  if (productCount > 0) {
    return { ok: false, reason: 'has_products', productCount };
  }

  const blobUrls = await collectSpeciesBlobUrls(db, id);

  try {
    const rows = await db.delete(species).where(eq(species.id, id)).returning({ id: species.id });

    if (rows.length === 0) return { ok: false, reason: 'not_found' };

    return { ok: true, blobUrls };
  } catch (error: unknown) {
    if (isForeignKeyViolation(error, PRODUCT_SPECIES_FK)) {
      const current = await countProductsForSpecies(db, id);
      return { ok: false, reason: 'has_products', productCount: Math.max(current, 1) };
    }
    throw error;
  }
}
