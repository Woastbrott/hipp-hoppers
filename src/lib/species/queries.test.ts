import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { products, species } from '@/db/schema';
import type { Db } from '@/db/types';
import type { SpeciesFormValues } from '@/lib/validation/species';
import { createTestDatabase } from '../../../test/db';

import {
  countProductsForSpecies,
  createSpecies,
  deleteSpecies,
  findSpeciesById,
  listSpecies,
  setSpeciesPublished,
  updateSpecies,
} from './queries';

let db: Db;
let close: () => Promise<void>;

function values(overrides: Partial<SpeciesFormValues> = {}): SpeciesFormValues {
  return {
    slug: 'hierodula-majuscula',
    scientificName: 'Hierodula majuscula',
    commonName: 'Riesen-Gottesanbeterin',
    description: null,
    temperatureMinCelsius: 24,
    temperatureMaxCelsius: 30,
    humidityMinPercent: 60,
    humidityMaxPercent: 80,
    adultSizeMinMm: 70,
    adultSizeMaxMm: 90,
    difficulty: 'fortgeschritten',
    published: false,
    ...overrides,
  };
}

async function createOk(overrides: Partial<SpeciesFormValues> = {}): Promise<string> {
  const result = await createSpecies(db, values(overrides));
  if (!result.ok) throw new Error(`Fixture fehlgeschlagen: ${result.reason}`);
  return result.id;
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(async () => {
  await close();
});

describe('createSpecies', () => {
  it('legt eine Art an und gibt id und slug zurueck', async () => {
    const result = await createSpecies(db, values());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slug).toBe('hierodula-majuscula');

    const stored = await findSpeciesById(db, result.id);
    expect(stored?.scientificName).toBe('Hierodula majuscula');
    expect(stored?.temperatureMinCelsius).toBe(24);
    expect(stored?.published).toBe(false);
  });

  it('meldet eine Slug-Kollision als Feldfehler statt zu werfen', async () => {
    await createOk();

    const collision = await createSpecies(
      db,
      values({ scientificName: 'Hierodula majuscula (2)' }),
    );

    expect(collision).toEqual({ ok: false, reason: 'slug_taken' });

    // Der erste Datensatz bleibt unberuehrt, es entsteht kein zweiter.
    const all = await listSpecies(db);
    expect(all).toHaveLength(1);
  });

  it('laesst optionale Felder als null zu', async () => {
    const id = await createOk({
      slug: 'nackt',
      commonName: null,
      description: null,
      temperatureMinCelsius: null,
      temperatureMaxCelsius: null,
      humidityMinPercent: null,
      humidityMaxPercent: null,
      adultSizeMinMm: null,
      adultSizeMaxMm: null,
      difficulty: null,
    });

    const stored = await findSpeciesById(db, id);
    expect(stored?.commonName).toBeNull();
    expect(stored?.difficulty).toBeNull();
  });
});

describe('updateSpecies', () => {
  it('schreibt die geaenderten Felder', async () => {
    const id = await createOk();

    const result = await updateSpecies(
      db,
      id,
      values({ slug: 'hierodula-membranacea', scientificName: 'Hierodula membranacea' }),
    );

    expect(result.ok).toBe(true);

    const stored = await findSpeciesById(db, id);
    expect(stored?.slug).toBe('hierodula-membranacea');
    expect(stored?.scientificName).toBe('Hierodula membranacea');
  });

  it('zieht updatedAt nach', async () => {
    const id = await createOk();
    const before = await findSpeciesById(db, id);

    await updateSpecies(db, id, values({ commonName: 'Anderer Name' }));
    const after = await findSpeciesById(db, id);

    expect(after?.updatedAt.getTime()).toBeGreaterThanOrEqual(before?.updatedAt.getTime() ?? 0);
    expect(after?.createdAt.getTime()).toBe(before?.createdAt.getTime());
  });

  it('meldet eine Kollision mit einem fremden Slug', async () => {
    await createOk({ slug: 'belegt', scientificName: 'Andere Art' });
    const id = await createOk({ slug: 'frei' });

    const result = await updateSpecies(db, id, values({ slug: 'belegt' }));
    expect(result).toEqual({ ok: false, reason: 'slug_taken' });

    const stored = await findSpeciesById(db, id);
    expect(stored?.slug).toBe('frei');
  });

  it('erlaubt es, den eigenen Slug beizubehalten', async () => {
    const id = await createOk({ slug: 'bleibt' });

    const result = await updateSpecies(db, id, values({ slug: 'bleibt', commonName: 'Neu' }));
    expect(result.ok).toBe(true);
  });

  it('gibt not_found zurueck, wenn es die Art nicht gibt', async () => {
    const result = await updateSpecies(db, '11111111-2222-4333-8444-555555555555', values());
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('setSpeciesPublished', () => {
  it('schaltet zwischen Entwurf und veroeffentlicht um', async () => {
    const id = await createOk({ published: false });

    await setSpeciesPublished(db, id, true);
    expect((await findSpeciesById(db, id))?.published).toBe(true);

    await setSpeciesPublished(db, id, false);
    expect((await findSpeciesById(db, id))?.published).toBe(false);
  });

  it('gibt not_found zurueck, wenn es die Art nicht gibt', async () => {
    const result = await setSpeciesPublished(db, '11111111-2222-4333-8444-555555555555', true);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('deleteSpecies', () => {
  it('loescht eine Art ohne Produkte', async () => {
    const id = await createOk();

    // `blobUrls` ist die Liste der Dateien, die die Action danach aufraeumen soll.
    expect(await deleteSpecies(db, id)).toEqual({ ok: true, blobUrls: [] });
    expect(await findSpeciesById(db, id)).toBeNull();
  });

  it('lehnt das Loeschen ab, solange Produkte an der Art haengen', async () => {
    const id = await createOk();

    await db.insert(products).values([
      { slug: 'oothek-hierodula', name: 'Oothek', priceCents: 2500, speciesId: id },
      { slug: 'nymphe-l3', name: 'Nymphe L3', priceCents: 1500, speciesId: id },
    ]);

    const result = await deleteSpecies(db, id);

    expect(result).toEqual({ ok: false, reason: 'has_products', productCount: 2 });

    // Nichts kaskadiert weg: Art und Produkte stehen noch.
    expect(await findSpeciesById(db, id)).not.toBeNull();
    expect(await countProductsForSpecies(db, id)).toBe(2);
  });

  it('haelt den Fremdschluessel als zweite Schicht bereit', async () => {
    const id = await createOk();
    await db
      .insert(products)
      .values({ slug: 'p', name: 'Produkt', priceCents: 100, speciesId: id });

    // Direkt an der Anwendungspruefung vorbei: das Constraint muss es fangen.
    await expect(db.delete(species).where(eq(species.id, id))).rejects.toThrow();
  });

  it('gibt not_found zurueck, wenn es die Art nicht gibt', async () => {
    const result = await deleteSpecies(db, '11111111-2222-4333-8444-555555555555');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('listSpecies', () => {
  it('gibt nur die Spalten der Liste zurueck, alphabetisch nach Namen', async () => {
    await createOk({ slug: 'zebra', scientificName: 'Zebra mantis' });
    await createOk({ slug: 'alpha', scientificName: 'Alpha mantis' });

    const list = await listSpecies(db);

    expect(list.map((item) => item.scientificName)).toEqual(['Alpha mantis', 'Zebra mantis']);
    expect(Object.keys(list[0] ?? {}).sort()).toEqual([
      'commonName',
      'difficulty',
      'id',
      'published',
      'scientificName',
      'slug',
      'updatedAt',
    ]);
  });

  it('ist leer, solange nichts angelegt ist', async () => {
    expect(await listSpecies(db)).toEqual([]);
  });
});
