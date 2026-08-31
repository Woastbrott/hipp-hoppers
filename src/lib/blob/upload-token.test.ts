import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminUsers, species } from '@/db/schema';
import type { Db } from '@/db/types';
import { signSessionToken } from '@/lib/auth/jwt';
import { createTestDatabase } from '../../../test/db';

import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  speciesBlobPrefix,
} from './upload-contract';

/**
 * Die Token-Route ist der Sicherheitspunkt des Client-Uploads: danach schreibt der
 * Browser direkt in den Store. Was hier durchgeht, ist nicht mehr aufzuhalten.
 */

const context: {
  db: Db | null;
  cookie: string | undefined;
  headers: Record<string, string>;
} = {
  db: null,
  cookie: undefined,
  headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
};

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

const { resolveUploadTokenOptions } = await import('./upload-token');

let close: () => Promise<void>;
let speciesId = '';

async function signIn(): Promise<void> {
  const rows = await context
    .db!.insert(adminUsers)
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

function payload(id: string = speciesId): string {
  return JSON.stringify({ speciesId: id });
}

function pathnameFor(id: string = speciesId): string {
  return `${speciesBlobPrefix(id)}bild.jpg`;
}

beforeEach(async () => {
  const created = await createTestDatabase();
  context.db = created.db;
  close = created.close;
  context.cookie = undefined;
  context.headers = { origin: 'http://localhost:3000', host: 'localhost:3000' };

  const rows = await created.db
    .insert(species)
    .values({ slug: 'idolomantis-diabolica', scientificName: 'Idolomantis diabolica' })
    .returning({ id: species.id });

  const row = rows[0];
  if (!row) throw new Error('Species-Fixture fehlgeschlagen.');
  speciesId = row.id;
});

afterEach(async () => {
  await close();
  context.db = null;
});

describe('resolveUploadTokenOptions — ohne Berechtigung', () => {
  it('lehnt ohne Session ab', async () => {
    const result = await resolveUploadTokenOptions(pathnameFor(), payload());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unauthorized');
  });

  it('lehnt bei abgelaufenem Token ab', async () => {
    await signIn();
    context.cookie = await signSessionToken(
      { sub: '11111111-2222-4333-8444-555555555555', tv: 1 },
      { expiresInSeconds: -60 },
    );

    const result = await resolveUploadTokenOptions(pathnameFor(), payload());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unauthorized');
  });

  it('lehnt von fremder Origin ab', async () => {
    await signIn();
    context.headers = { origin: 'https://boeser-nachbar.example', host: 'localhost:3000' };

    const result = await resolveUploadTokenOptions(pathnameFor(), payload());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unauthorized');
  });
});

describe('resolveUploadTokenOptions — mit Session', () => {
  beforeEach(async () => {
    await signIn();
  });

  it('stellt Optionen mit Formatliste, Groessengrenze und Zufallssuffix aus', async () => {
    const result = await resolveUploadTokenOptions(pathnameFor(), payload());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.options.allowedContentTypes).toEqual([...ALLOWED_IMAGE_CONTENT_TYPES]);
    expect(result.options.allowedContentTypes).not.toContain('image/svg+xml');
    expect(result.options.maximumSizeInBytes).toBe(MAX_UPLOAD_BYTES);
    expect(result.options.addRandomSuffix).toBe(true);
    expect(JSON.parse(result.options.tokenPayload)).toEqual({ speciesId });
  });

  it('lehnt einen Zielpfad ausserhalb des Art-Prefixes ab', async () => {
    for (const pathname of [
      'anderes/verzeichnis/bild.jpg',
      `species/99999999-2222-4333-8444-555555555555/bild.jpg`,
      `${speciesBlobPrefix(speciesId)}tief/bild.jpg`,
      speciesBlobPrefix(speciesId),
    ]) {
      const result = await resolveUploadTokenOptions(pathname, payload());

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe('foreign_pathname');
    }
  });

  it('lehnt eine unbekannte Art ab', async () => {
    const unknown = '99999999-2222-4333-8444-555555555555';
    const result = await resolveUploadTokenOptions(pathnameFor(unknown), payload(unknown));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unknown_species');
  });

  it('lehnt kaputte oder fehlende Nutzlast ab', async () => {
    for (const raw of [null, '', 'kein-json', '{}', JSON.stringify({ speciesId: 'keine-uuid' })]) {
      const result = await resolveUploadTokenOptions(pathnameFor(), raw);

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe('invalid_payload');
    }
  });
});
