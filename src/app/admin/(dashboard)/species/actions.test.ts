import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminUsers, products } from '@/db/schema';
import type { Db } from '@/db/types';
import { signSessionToken } from '@/lib/auth/jwt';
import { listSpecies } from '@/lib/species/queries';
import { createTestDatabase } from '../../../../../test/db';

/**
 * Prueft die Zusicherung, die kein Typcheck sieht: eine mutierende Server Action
 * schreibt nichts, wenn keine gueltige Session vorliegt.
 *
 * Server Actions sind eigene Endpoints. Das Gate im Layout schuetzt nur das Rendering —
 * wer die Action direkt aufruft, kommt daran vorbei.
 */

// --- Testdoubles fuer den Request-Kontext ---------------------------------
const context: {
  db: Db | null;
  cookie: string | undefined;
  headers: Record<string, string>;
} = {
  db: null,
  cookie: undefined,
  headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
};

const redirects: string[] = [];

class TestRedirect extends Error {
  constructor(readonly target: string) {
    super(`redirect:${target}`);
  }
}

vi.mock('@/db', () => ({
  get db() {
    if (!context.db) throw new Error('Test-Datenbank nicht gesetzt.');
    return context.db;
  },
}));

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        context.cookie === undefined ? undefined : { name, value: context.cookie },
      set: () => undefined,
    }),
  headers: () => Promise.resolve(new Headers(context.headers)),
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
}));

vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    redirects.push(target);
    throw new TestRedirect(target);
  },
}));

// Erst nach den Mocks importieren.
const {
  createSpeciesAction,
  deleteSpeciesAction,
  toggleSpeciesPublishedAction,
  updateSpeciesAction,
} = await import('./actions');
const { initialSpeciesDeleteState, initialSpeciesFormState } = await import('./state');

// --- Fixtures -------------------------------------------------------------
function formData(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    slug: 'hierodula-majuscula',
    scientificName: 'Hierodula majuscula',
    commonName: '',
    description: '',
    temperatureMinCelsius: '',
    temperatureMaxCelsius: '',
    humidityMinPercent: '',
    humidityMaxPercent: '',
    adultSizeMinMm: '',
    adultSizeMaxMm: '',
    difficulty: '',
    ...overrides,
  };

  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

async function signIn(): Promise<void> {
  if (!context.db) throw new Error('Test-Datenbank nicht gesetzt.');

  const rows = await context.db
    .insert(adminUsers)
    .values({
      email: 'admin@hipp-hoppers.test',
      passwordHash: 'fuer-diesen-test-egal',
      tokenVersion: 1,
    })
    .returning({ id: adminUsers.id });

  const admin = rows[0];
  if (!admin) throw new Error('Admin-Fixture fehlgeschlagen.');

  context.cookie = await signSessionToken({ sub: admin.id, tv: 1 });
}

async function seedSpecies(): Promise<string> {
  await signIn();
  await expect(createSpeciesAction(initialSpeciesFormState, formData())).rejects.toBeInstanceOf(
    TestRedirect,
  );

  const [row] = await listSpecies(context.db!);
  if (!row) throw new Error('Species-Fixture fehlgeschlagen.');
  return row.id;
}

let close: () => Promise<void>;

beforeEach(async () => {
  const created = await createTestDatabase();
  context.db = created.db;
  close = created.close;
  context.cookie = undefined;
  context.headers = { origin: 'http://localhost:3000', host: 'localhost:3000' };
  redirects.length = 0;
});

afterEach(async () => {
  await close();
  context.db = null;
});

describe('ohne gueltige Session', () => {
  it('legt createSpeciesAction nichts an', async () => {
    const result = await createSpeciesAction(initialSpeciesFormState, formData());

    expect(result.status).toBe('error');
    expect(result.formError).toMatch(/Nicht angemeldet/);
    expect(await listSpecies(context.db!)).toEqual([]);
  });

  it('aendert updateSpeciesAction nichts', async () => {
    const id = await seedSpecies();
    context.cookie = undefined;

    const result = await updateSpeciesAction(
      id,
      initialSpeciesFormState,
      formData({ scientificName: 'Gekapert', slug: 'gekapert' }),
    );

    expect(result.status).toBe('error');

    const [row] = await listSpecies(context.db!);
    expect(row?.scientificName).toBe('Hierodula majuscula');
  });

  it('loescht deleteSpeciesAction nichts', async () => {
    const id = await seedSpecies();
    context.cookie = undefined;

    const result = await deleteSpeciesAction(id, initialSpeciesDeleteState, new FormData());

    expect(result.error).toMatch(/Nicht angemeldet/);
    expect(await listSpecies(context.db!)).toHaveLength(1);
  });

  it('schaltet toggleSpeciesPublishedAction nichts um, sondern schickt zur Anmeldung', async () => {
    const id = await seedSpecies();
    context.cookie = undefined;

    await expect(toggleSpeciesPublishedAction(id, true, new FormData())).rejects.toBeInstanceOf(
      TestRedirect,
    );

    expect(redirects.at(-1)).toBe('/admin/login');

    const [row] = await listSpecies(context.db!);
    expect(row?.published).toBe(false);
  });

  it('lehnt auch ein abgelaufenes Token ab', async () => {
    await signIn();
    context.cookie = await signSessionToken(
      { sub: '11111111-2222-4333-8444-555555555555', tv: 1 },
      { expiresInSeconds: -60 },
    );

    const result = await createSpeciesAction(initialSpeciesFormState, formData());

    expect(result.status).toBe('error');
    expect(await listSpecies(context.db!)).toEqual([]);
  });
});

describe('CSRF', () => {
  it('lehnt eine Anfrage von fremder Origin ab, auch mit gueltiger Session', async () => {
    await signIn();
    context.headers = { origin: 'https://boeser-nachbar.example', host: 'localhost:3000' };

    const result = await createSpeciesAction(initialSpeciesFormState, formData());

    expect(result.status).toBe('error');
    expect(result.formError).toMatch(/abgelehnt/);
    expect(await listSpecies(context.db!)).toEqual([]);
  });
});

describe('mit gueltiger Session', () => {
  it('legt an und leitet auf die Detailseite weiter', async () => {
    await signIn();

    await expect(createSpeciesAction(initialSpeciesFormState, formData())).rejects.toBeInstanceOf(
      TestRedirect,
    );

    const list = await listSpecies(context.db!);
    expect(list).toHaveLength(1);
    expect(redirects.at(-1)).toBe(`/admin/species/${list[0]?.id ?? ''}`);
  });

  it('gibt Validierungsfehler pro Feld zurueck, ohne zu schreiben', async () => {
    await signIn();

    const result = await createSpeciesAction(
      initialSpeciesFormState,
      formData({ temperatureMinCelsius: '30', temperatureMaxCelsius: '20' }),
    );

    expect(result.status).toBe('error');
    expect(result.fieldErrors.temperatureMaxCelsius).toMatch(/Maximum darf nicht unter/);
    expect(await listSpecies(context.db!)).toEqual([]);
  });

  it('meldet eine Slug-Kollision am Feld', async () => {
    const id = await seedSpecies();
    expect(id).toBeTruthy();

    const result = await createSpeciesAction(
      initialSpeciesFormState,
      formData({ scientificName: 'Andere Art' }),
    );

    expect(result.fieldErrors.slug).toMatch(/gibt es schon/);
    expect(await listSpecies(context.db!)).toHaveLength(1);
  });

  it('lehnt das Loeschen ab, solange ein Produkt an der Art haengt', async () => {
    const id = await seedSpecies();

    await context.db!.insert(products).values({
      slug: 'oothek',
      name: 'Oothek',
      priceCents: 2500,
      speciesId: id,
    });

    const result = await deleteSpeciesAction(id, initialSpeciesDeleteState, new FormData());

    expect(result.error).toMatch(/1 Produkt hängt an dieser Art/);
    expect(await listSpecies(context.db!)).toHaveLength(1);
  });

  it('loescht eine Art ohne Produkte und leitet zur Liste', async () => {
    const id = await seedSpecies();

    await expect(
      deleteSpeciesAction(id, initialSpeciesDeleteState, new FormData()),
    ).rejects.toBeInstanceOf(TestRedirect);

    expect(redirects.at(-1)).toBe('/admin/species');
    expect(await listSpecies(context.db!)).toEqual([]);
  });

  it('schaltet published um', async () => {
    const id = await seedSpecies();

    await toggleSpeciesPublishedAction(id, true, new FormData());

    const [row] = await listSpecies(context.db!);
    expect(row?.published).toBe(true);
  });
});
