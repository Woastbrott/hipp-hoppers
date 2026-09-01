import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { media, products, species } from '@/db/schema';
import type { Db } from '@/db/types';
import { insertSpeciesMedia, moveMedia } from '@/lib/media/queries';
import { createTestDatabase } from '../../../test/db';

import { findPublicSpeciesBySlug, listPublishedSpecies } from './public-queries';

const STORE = 'https://abc123xyz.public.blob.vercel-storage.com';

let db: Db;
let close: () => Promise<void>;

type SpeciesSeed = {
  slug: string;
  scientificName: string;
  commonName?: string | null;
  published?: boolean;
};

async function seedSpecies(seed: SpeciesSeed): Promise<string> {
  const rows = await db
    .insert(species)
    .values({
      slug: seed.slug,
      scientificName: seed.scientificName,
      commonName: seed.commonName ?? null,
      published: seed.published ?? true,
    })
    .returning({ id: species.id });

  const row = rows[0];
  if (!row) throw new Error('Species-Fixture fehlgeschlagen.');
  return row.id;
}

/** Bilder werden ans Ende gehaengt — die Reihenfolge der Aufrufe ist die Position. */
async function addMedia(speciesId: string, name: string): Promise<string> {
  const result = await insertSpeciesMedia(db, {
    speciesId,
    url: `${STORE}/species/${speciesId}/${name}`,
    alt: `Alt für ${name}`,
    width: 1600,
    height: 1200,
    contentType: 'image/jpeg',
  });

  if (!result.ok) throw new Error(`Media-Fixture fehlgeschlagen: ${result.reason}`);
  return result.id;
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(async () => {
  await close();
});

describe('listPublishedSpecies', () => {
  it('liefert ausschliesslich veroeffentlichte Arten', async () => {
    await seedSpecies({ slug: 'hierodula-majuscula', scientificName: 'Hierodula majuscula' });
    await seedSpecies({
      slug: 'idolomantis-diabolica',
      scientificName: 'Idolomantis diabolica',
      published: false,
    });

    const items = await listPublishedSpecies(db);

    expect(items.map((item) => item.slug)).toEqual(['hierodula-majuscula']);
  });

  it('gibt eine leere Liste zurueck, wenn nichts veroeffentlicht ist', async () => {
    await seedSpecies({ slug: 'nur-entwurf', scientificName: 'Nur Entwurf', published: false });

    expect(await listPublishedSpecies(db)).toEqual([]);
  });

  it('sortiert alphabetisch nach dem wissenschaftlichen Namen', async () => {
    await seedSpecies({ slug: 'phyllocrania', scientificName: 'Phyllocrania paradoxa' });
    await seedSpecies({ slug: 'creobroter', scientificName: 'Creobroter gemmatus' });
    await seedSpecies({ slug: 'hierodula', scientificName: 'Hierodula majuscula' });

    const items = await listPublishedSpecies(db);

    expect(items.map((item) => item.scientificName)).toEqual([
      'Creobroter gemmatus',
      'Hierodula majuscula',
      'Phyllocrania paradoxa',
    ]);
  });

  it('nimmt das Bild mit der kleinsten Position als Titelbild', async () => {
    const id = await seedSpecies({ slug: 'mit-bildern', scientificName: 'Mit Bildern' });
    await addMedia(id, 'eins.jpg');
    const zwei = await addMedia(id, 'zwei.jpg');
    await addMedia(id, 'drei.jpg');

    const [first] = await listPublishedSpecies(db);
    expect(first?.cover?.alt).toBe('Alt für eins.jpg');

    // Nach dem Hochschieben ist ein anderes Bild vorne — das Titelbild folgt der
    // Reihenfolge, nicht dem Anlagedatum.
    await moveMedia(db, zwei, 'up');

    const [afterMove] = await listPublishedSpecies(db);
    expect(afterMove?.cover?.alt).toBe('Alt für zwei.jpg');
    expect(afterMove?.cover?.width).toBe(1600);
  });

  it('liefert Arten ohne Bild mit cover null, statt sie zu verschlucken', async () => {
    const mitBild = await seedSpecies({ slug: 'mit-bild', scientificName: 'Aaa mit Bild' });
    await addMedia(mitBild, 'eins.jpg');
    await seedSpecies({ slug: 'ohne-bild', scientificName: 'Bbb ohne Bild' });

    const items = await listPublishedSpecies(db);

    expect(items).toHaveLength(2);
    expect(items[0]?.cover).not.toBeNull();
    expect(items[1]?.cover).toBeNull();
  });

  it('laesst sich von Produktbildern nicht durcheinanderbringen', async () => {
    const id = await seedSpecies({ slug: 'mit-produkt', scientificName: 'Mit Produkt' });
    await addMedia(id, 'art.jpg');

    const productRows = await db
      .insert(products)
      .values({ slug: 'nymphe-l3', name: 'Nymphe L3', priceCents: 1500, speciesId: id })
      .returning({ id: products.id });

    const productId = productRows[0]?.id;
    if (!productId) throw new Error('Produkt-Fixture fehlgeschlagen.');

    /*
     * Ein Produktbild hat keine species_id. Ohne den Filter im Titelbild-Query
     * bildeten alle Produktbilder zusammen eine `distinct on`-Gruppe mit
     * species_id = null — harmlos beim Join, aber eine Zeile, die niemand braucht.
     * Direkt eingefuegt, weil `insertSpeciesMedia` bewusst nur Arten kennt.
     */
    await db.insert(media).values({
      url: `${STORE}/products/${productId}/produkt.jpg`,
      alt: 'Alt für Produktbild',
      width: 800,
      height: 600,
      productId,
    });

    const items = await listPublishedSpecies(db);

    expect(items).toHaveLength(1);
    expect(items[0]?.cover?.alt).toBe('Alt für art.jpg');
  });
});

describe('findPublicSpeciesBySlug', () => {
  it('findet eine veroeffentlichte Art ohne Admin-Flag', async () => {
    await seedSpecies({
      slug: 'hierodula-majuscula',
      scientificName: 'Hierodula majuscula',
      commonName: 'Riesen-Gottesanbeterin',
    });

    const row = await findPublicSpeciesBySlug(db, 'hierodula-majuscula', {
      includeDrafts: false,
    });

    expect(row?.scientificName).toBe('Hierodula majuscula');
    expect(row?.commonName).toBe('Riesen-Gottesanbeterin');
    expect(row?.published).toBe(true);
  });

  it('haelt einen Entwurf ohne Admin-Flag zurueck', async () => {
    await seedSpecies({
      slug: 'idolomantis-diabolica',
      scientificName: 'Idolomantis diabolica',
      published: false,
    });

    expect(
      await findPublicSpeciesBySlug(db, 'idolomantis-diabolica', { includeDrafts: false }),
    ).toBeNull();
  });

  it('liefert denselben Entwurf mit Admin-Flag aus', async () => {
    await seedSpecies({
      slug: 'idolomantis-diabolica',
      scientificName: 'Idolomantis diabolica',
      published: false,
    });

    const row = await findPublicSpeciesBySlug(db, 'idolomantis-diabolica', {
      includeDrafts: true,
    });

    expect(row?.scientificName).toBe('Idolomantis diabolica');
    expect(row?.published).toBe(false);
  });

  it('liefert null fuer einen unbekannten Slug — mit Flag wie ohne', async () => {
    expect(await findPublicSpeciesBySlug(db, 'gibt-es-nicht', { includeDrafts: false })).toBeNull();
    expect(await findPublicSpeciesBySlug(db, 'gibt-es-nicht', { includeDrafts: true })).toBeNull();
  });

  it('gibt die Bilder in position-Reihenfolge zurueck', async () => {
    const id = await seedSpecies({ slug: 'mit-galerie', scientificName: 'Mit Galerie' });
    await addMedia(id, 'eins.jpg');
    const zwei = await addMedia(id, 'zwei.jpg');
    await addMedia(id, 'drei.jpg');

    await moveMedia(db, zwei, 'up');

    const row = await findPublicSpeciesBySlug(db, 'mit-galerie', { includeDrafts: false });

    expect(row?.images.map((image) => image.alt)).toEqual([
      'Alt für zwei.jpg',
      'Alt für eins.jpg',
      'Alt für drei.jpg',
    ]);
  });

  it('liefert eine leere Bilderliste statt undefined', async () => {
    await seedSpecies({ slug: 'ohne-bilder', scientificName: 'Ohne Bilder' });

    const row = await findPublicSpeciesBySlug(db, 'ohne-bilder', { includeDrafts: false });

    expect(row?.images).toEqual([]);
  });
});
