import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminUsers, species } from '@/db/schema';
import type { Db } from '@/db/types';
import { signSessionToken } from '@/lib/auth/jwt';
import { createTestDatabase } from '../../../test/db';

/**
 * Die Sichtbarkeitsregel der oeffentlichen Detailseite, an der Stelle geprueft, an
 * der sie faellt: Entwurf nur mit gueltiger Session, sonst derselbe 404 wie bei einem
 * Slug, den es gar nicht gibt. Waere der Unterschied von aussen sichtbar, koennte man
 * unveroeffentlichte Arten durchprobieren.
 */

const context: { db: Db | null; cookie: string | undefined } = { db: null, cookie: undefined };

class TestNotFound extends Error {
  constructor() {
    super('notFound');
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
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new TestNotFound();
  },
}));

// Erst nach den Mocks importieren.
const { loadPublicSpecies, resolvePublicSpecies } = await import('./public-page');

async function seedSpecies(slug: string, published: boolean): Promise<void> {
  await context.db!.insert(species).values({
    slug,
    scientificName: 'Idolomantis diabolica',
    published,
  });
}

/** Legt einen Admin an, setzt ein gueltiges Session-Cookie und meldet dessen Id. */
async function signIn(): Promise<string> {
  const rows = await context
    .db!.insert(adminUsers)
    .values({
      email: 'admin@hipp-hoppers.test',
      passwordHash: 'fuer-diesen-test-egal',
      tokenVersion: 1,
    })
    .returning({ id: adminUsers.id, tokenVersion: adminUsers.tokenVersion });

  const admin = rows[0];
  if (!admin) throw new Error('Admin-Fixture fehlgeschlagen.');

  context.cookie = await signSessionToken({ sub: admin.id, tv: admin.tokenVersion });
  return admin.id;
}

let close: () => Promise<void>;

beforeEach(async () => {
  const created = await createTestDatabase();
  context.db = created.db;
  close = created.close;
  context.cookie = undefined;
});

afterEach(async () => {
  await close();
  context.db = null;
});

describe('resolvePublicSpecies', () => {
  it('liefert eine veroeffentlichte Art ohne Session', async () => {
    await seedSpecies('idolomantis-diabolica', true);

    const row = await resolvePublicSpecies('idolomantis-diabolica');

    expect(row?.slug).toBe('idolomantis-diabolica');
    expect(row?.published).toBe(true);
  });

  it('liefert null fuer einen Entwurf ohne Session', async () => {
    await seedSpecies('idolomantis-diabolica', false);

    expect(await resolvePublicSpecies('idolomantis-diabolica')).toBeNull();
  });

  it('liefert den Entwurf mit gueltiger Admin-Session', async () => {
    await seedSpecies('idolomantis-diabolica', false);
    await signIn();

    const row = await resolvePublicSpecies('idolomantis-diabolica');

    expect(row?.slug).toBe('idolomantis-diabolica');
    expect(row?.published).toBe(false);
  });

  it('haelt einen Entwurf mit abgelaufenem Token zurueck', async () => {
    await seedSpecies('idolomantis-diabolica', false);
    const adminId = await signIn();

    // Derselbe Admin, dieselbe Signatur — nur nicht mehr gueltig.
    context.cookie = await signSessionToken({ sub: adminId, tv: 1 }, { expiresInSeconds: -60 });

    expect(await resolvePublicSpecies('idolomantis-diabolica')).toBeNull();
  });

  it('liefert null fuer einen unbekannten Slug', async () => {
    expect(await resolvePublicSpecies('gibt-es-nicht')).toBeNull();
  });

  it('lehnt einen Slug ab, der nicht dem Muster entspricht — ohne Query', async () => {
    // Die Datenbank wird absichtlich weggenommen: kaeme es hier zu einem Query,
    // wuerde der Getter im Mock werfen statt `null` zurueckzugeben.
    const database = context.db;
    context.db = null;

    try {
      await expect(resolvePublicSpecies('Idolomantis Diabolica')).resolves.toBeNull();
      await expect(resolvePublicSpecies('../admin')).resolves.toBeNull();
      await expect(resolvePublicSpecies('')).resolves.toBeNull();
    } finally {
      context.db = database;
    }
  });
});

describe('loadPublicSpecies', () => {
  it('gibt eine veroeffentlichte Art heraus', async () => {
    await seedSpecies('idolomantis-diabolica', true);

    const row = await loadPublicSpecies('idolomantis-diabolica');

    expect(row.slug).toBe('idolomantis-diabolica');
  });

  it('geht bei unbekanntem Slug in den notFound-Pfad', async () => {
    await expect(loadPublicSpecies('gibt-es-nicht')).rejects.toBeInstanceOf(TestNotFound);
  });

  it('geht bei einem Entwurf ohne Session in den notFound-Pfad', async () => {
    await seedSpecies('idolomantis-diabolica', false);

    await expect(loadPublicSpecies('idolomantis-diabolica')).rejects.toBeInstanceOf(TestNotFound);
  });

  it('rendert denselben Entwurf mit Admin-Session', async () => {
    await seedSpecies('idolomantis-diabolica', false);
    await signIn();

    await expect(loadPublicSpecies('idolomantis-diabolica')).resolves.toMatchObject({
      published: false,
    });
  });
});
