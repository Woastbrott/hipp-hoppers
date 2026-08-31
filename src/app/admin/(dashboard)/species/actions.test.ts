import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminUsers, media, products, species } from '@/db/schema';
import type { Db } from '@/db/types';
import { signSessionToken } from '@/lib/auth/jwt';
import { revokeSessions } from '@/lib/auth/session';
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

/**
 * Kein echter Blob-Store in der Umgebung. Gemockt wird das SDK, nicht unsere Logik:
 * die Aufrufe werden mitgeschrieben, damit die Zusicherungen ueber Reihenfolge und
 * Best-Effort-Verhalten pruefbar bleiben.
 */
const blobCalls: { head: string[]; del: string[][] } = { head: [], del: [] };
const blobFails = { head: false, del: false };

vi.mock('@vercel/blob', () => ({
  head: (url: string) => {
    blobCalls.head.push(url);
    return blobFails.head
      ? Promise.reject(new Error('Blob nicht gefunden'))
      : Promise.resolve({ url });
  },
  del: (urls: string | string[]) => {
    blobCalls.del.push(Array.isArray(urls) ? [...urls] : [urls]);
    return blobFails.del ? Promise.reject(new Error('Store nicht erreichbar')) : Promise.resolve();
  },
}));

vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    redirects.push(target);
    throw new TestRedirect(target);
  },
}));

// Erst nach den Mocks importieren.
const actionsModule = await import('./actions');
const {
  createSpeciesAction,
  deleteSpeciesAction,
  deleteSpeciesMediaAction,
  moveSpeciesMediaAction,
  persistSpeciesMediaAction,
  toggleSpeciesPublishedAction,
  updateSpeciesAction,
  updateSpeciesMediaAltAction,
} = actionsModule;
const { initialMediaActionState, initialSpeciesDeleteState, initialSpeciesFormState } =
  await import('./state');
const { insertSpeciesMedia, listSpeciesMedia } = await import('@/lib/media/queries');
const { ADMIN_REQUIRED_ERROR, FOREIGN_ORIGIN_ERROR } = await import('@/lib/auth/require-admin');

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

let adminId = '';

/** Idempotent: mehrere Aufrufe pro Test sind normal (Fixtures rufen sich gegenseitig). */
async function signIn(): Promise<void> {
  if (!context.db) throw new Error('Test-Datenbank nicht gesetzt.');

  const rows = await context.db
    .insert(adminUsers)
    .values({
      email: 'admin@hipp-hoppers.test',
      passwordHash: 'fuer-diesen-test-egal',
      tokenVersion: 1,
    })
    .onConflictDoUpdate({
      target: adminUsers.email,
      set: { passwordHash: 'fuer-diesen-test-egal' },
    })
    .returning({ id: adminUsers.id, tokenVersion: adminUsers.tokenVersion });

  const admin = rows[0];
  if (!admin) throw new Error('Admin-Fixture fehlgeschlagen.');

  adminId = admin.id;
  // Aktuelle Version, nicht fest 1: nach einem Widerruf im Test waere 1 veraltet.
  context.cookie = await signSessionToken({ sub: admin.id, tv: admin.tokenVersion });
}

/** Vollstaendiger Zustand beider Tabellen — Grundlage fuer "hat sich nichts geaendert". */
async function snapshot(): Promise<unknown> {
  return {
    species: await context.db!.select().from(species).orderBy(species.slug),
    media: await context.db!.select().from(media).orderBy(media.url),
  };
}

const STORE = 'https://abc123xyz.public.blob.vercel-storage.com';

function blobUrl(speciesId: string, name: string): string {
  return `${STORE}/species/${speciesId}/${name}`;
}

type Fixtures = { speciesId: string; mediaId: string; mediaUrl: string };

/** Eine Art mit einem Bild — die Ausgangslage fuer die Guard-Matrix. */
async function seedFixtures(): Promise<Fixtures> {
  const speciesId = await seedSpecies();
  const mediaUrl = blobUrl(speciesId, 'eins.jpg');

  const inserted = await insertSpeciesMedia(context.db!, {
    speciesId,
    url: mediaUrl,
    alt: 'Bestehendes Bild',
    width: 1600,
    height: 1200,
    contentType: 'image/jpeg',
  });

  if (!inserted.ok) throw new Error(`Media-Fixture fehlgeschlagen: ${inserted.reason}`);

  return { speciesId, mediaId: inserted.id, mediaUrl };
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
  blobCalls.head.length = 0;
  blobCalls.del.length = 0;
  blobFails.head = false;
  blobFails.del = false;
});

afterEach(async () => {
  await close();
  context.db = null;
});

// ---------------------------------------------------------------------------
// requireAdmin: die Matrix
// ---------------------------------------------------------------------------

/** Wie eine abgewiesene Action nach aussen aussieht — Rueckgabewert oder Umleitung. */
type Denial = { kind: 'error'; message: string | null } | { kind: 'redirect'; target: string };

type GuardedAction = {
  name: string;
  /** Ruft die Action so auf, wie sie aus dem Formular (oder dem Uploader) kaeme. */
  run: (fixtures: Fixtures) => Promise<Denial>;
};

async function catchRedirect(call: Promise<unknown>): Promise<Denial> {
  try {
    await call;
    return { kind: 'error', message: 'Action ist durchgelaufen statt abzuweisen.' };
  } catch (error: unknown) {
    if (error instanceof TestRedirect) return { kind: 'redirect', target: error.target };
    throw error;
  }
}

const guardedActions: GuardedAction[] = [
  {
    name: 'createSpeciesAction',
    run: async () => {
      const result = await createSpeciesAction(
        initialSpeciesFormState,
        formData({ slug: 'geschmuggelt', scientificName: 'Geschmuggelt' }),
      );
      return { kind: 'error', message: result.formError };
    },
  },
  {
    name: 'updateSpeciesAction',
    run: async ({ speciesId }) => {
      const result = await updateSpeciesAction(
        speciesId,
        initialSpeciesFormState,
        formData({ slug: 'gekapert', scientificName: 'Gekapert' }),
      );
      return { kind: 'error', message: result.formError };
    },
  },
  {
    name: 'deleteSpeciesAction',
    run: async ({ speciesId }) => {
      const result = await deleteSpeciesAction(
        speciesId,
        initialSpeciesDeleteState,
        new FormData(),
      );
      return { kind: 'error', message: result.error };
    },
  },
  {
    name: 'toggleSpeciesPublishedAction',
    run: ({ speciesId }) =>
      catchRedirect(toggleSpeciesPublishedAction(speciesId, true, new FormData())),
  },
  {
    name: 'persistSpeciesMediaAction',
    run: async ({ speciesId }) => {
      const result = await persistSpeciesMediaAction({
        speciesId,
        url: blobUrl(speciesId, 'geschmuggelt.jpg'),
        alt: 'Geschmuggelt',
        width: 800,
        height: 600,
        contentType: 'image/jpeg',
      });

      return { kind: 'error', message: result.ok ? null : result.error };
    },
  },
  {
    name: 'updateSpeciesMediaAltAction',
    run: async ({ mediaId }) => {
      const data = new FormData();
      data.set('alt', 'Gekapert');

      const result = await updateSpeciesMediaAltAction(mediaId, initialMediaActionState, data);
      return { kind: 'error', message: result.error };
    },
  },
  {
    name: 'deleteSpeciesMediaAction',
    run: async ({ mediaId }) => {
      const result = await deleteSpeciesMediaAction(
        mediaId,
        initialMediaActionState,
        new FormData(),
      );
      return { kind: 'error', message: result.error };
    },
  },
  {
    name: 'moveSpeciesMediaAction',
    run: ({ mediaId }) => catchRedirect(moveSpeciesMediaAction(mediaId, 'up', new FormData())),
  },
];

/** Die vier Wege, auf denen eine Anfrage keine gueltige Berechtigung hat. */
const denials = [
  {
    name: 'ohne Cookie',
    expected: ADMIN_REQUIRED_ERROR,
    apply: () => {
      context.cookie = undefined;
      return Promise.resolve();
    },
  },
  {
    name: 'mit abgelaufenem Token',
    expected: ADMIN_REQUIRED_ERROR,
    apply: async () => {
      context.cookie = await signSessionToken({ sub: adminId, tv: 1 }, { expiresInSeconds: -60 });
    },
  },
  {
    name: 'mit veralteter token_version',
    expected: ADMIN_REQUIRED_ERROR,
    apply: async () => {
      // Wie nach einem Logout: das Token ist unversehrt, die Version stimmt nicht mehr.
      await revokeSessions(context.db!, adminId);
    },
  },
  {
    name: 'von fremder Origin',
    expected: FOREIGN_ORIGIN_ERROR,
    apply: () => {
      context.headers = { origin: 'https://boeser-nachbar.example', host: 'localhost:3000' };
      return Promise.resolve();
    },
  },
];

const guardMatrix = guardedActions.flatMap((action) =>
  denials.map((denial) => ({
    action: action.name,
    denial: denial.name,
    run: action.run,
    apply: denial.apply,
    expected: denial.expected,
  })),
);

describe('requireAdmin', () => {
  it('deckt jede exportierte Action der Datei ab', () => {
    const exported = Object.entries(actionsModule)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort();

    // Faellt um, sobald jemand eine weitere Action ergaenzt, ohne sie hier einzutragen.
    expect(exported).toEqual(guardedActions.map((entry) => entry.name).sort());
  });

  it.each(guardMatrix)('$action weist $denial ab und mutiert nichts', async (entry) => {
    const fixtures = await seedFixtures();
    const before = await snapshot();

    await entry.apply();
    const denial = await entry.run(fixtures);

    if (denial.kind === 'redirect') {
      expect(denial.target).toBe('/admin/login');
    } else {
      // Exakt die generische Meldung — keine Id, keine Mail, kein Grund.
      expect(denial.message).toBe(entry.expected);
    }

    expect(await snapshot()).toEqual(before);
    // Ohne Berechtigung wird der Store nicht einmal angefasst.
    expect(blobCalls.del).toEqual([]);
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

describe('persistSpeciesMediaAction — der Client wird nicht geglaubt', () => {
  beforeEach(async () => {
    await signIn();
  });

  it('schreibt nach bestandener Pruefung und bestaetigt vorher die Existenz im Store', async () => {
    const speciesId = await seedSpecies();
    const url = blobUrl(speciesId, 'neu.jpg');

    const result = await persistSpeciesMediaAction({
      speciesId,
      url,
      alt: 'Adultes Weibchen',
      width: 1600,
      height: 1200,
      contentType: 'image/jpeg',
    });

    expect(result).toEqual({ ok: true });
    expect(blobCalls.head).toEqual([url]);

    const items = await listSpeciesMedia(context.db!, speciesId);
    expect(items).toHaveLength(1);
    expect(items[0]?.alt).toBe('Adultes Weibchen');
  });

  it('lehnt eine URL auf fremdem Host ab, ohne den Store zu fragen', async () => {
    const speciesId = await seedSpecies();

    const result = await persistSpeciesMediaAction({
      speciesId,
      url: `https://boeser-nachbar.example/species/${speciesId}/bild.jpg`,
      alt: 'Untergeschoben',
      width: 800,
      height: 600,
      contentType: 'image/jpeg',
    });

    expect(result.ok).toBe(false);
    expect(blobCalls.head).toEqual([]);
    expect(await listSpeciesMedia(context.db!, speciesId)).toEqual([]);
  });

  it('lehnt das Prefix einer fremden Art ab', async () => {
    const speciesId = await seedSpecies();
    const fremd = '99999999-2222-4333-8444-555555555555';

    const result = await persistSpeciesMediaAction({
      speciesId,
      url: blobUrl(fremd, 'bild.jpg'),
      alt: 'Untergeschoben',
      width: 800,
      height: 600,
      contentType: 'image/jpeg',
    });

    expect(result.ok).toBe(false);
    expect(await listSpeciesMedia(context.db!, speciesId)).toEqual([]);
  });

  it('lehnt einen fehlenden Alt-Text ab', async () => {
    const speciesId = await seedSpecies();

    const result = await persistSpeciesMediaAction({
      speciesId,
      url: blobUrl(speciesId, 'ohne-alt.jpg'),
      alt: '   ',
      width: 800,
      height: 600,
      contentType: 'image/jpeg',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Alt-Text ist Pflicht/);
  });

  it('schreibt nichts, wenn der Store die Datei nicht kennt', async () => {
    const speciesId = await seedSpecies();
    blobFails.head = true;

    const result = await persistSpeciesMediaAction({
      speciesId,
      url: blobUrl(speciesId, 'gibt-es-nicht.jpg'),
      alt: 'Behauptet',
      width: 800,
      height: 600,
      contentType: 'image/jpeg',
    });

    expect(result.ok).toBe(false);
    expect(await listSpeciesMedia(context.db!, speciesId)).toEqual([]);
  });

  it('behandelt einen wiederholten Aufruf als Erfolg, ohne doppelt zu schreiben', async () => {
    const fixtures = await seedFixtures();

    const result = await persistSpeciesMediaAction({
      speciesId: fixtures.speciesId,
      url: fixtures.mediaUrl,
      alt: 'Nochmal dasselbe',
      width: 1600,
      height: 1200,
      contentType: 'image/jpeg',
    });

    expect(result).toEqual({ ok: true });
    expect(await listSpeciesMedia(context.db!, fixtures.speciesId)).toHaveLength(1);
  });
});

describe('Aufraeumen im Store', () => {
  beforeEach(async () => {
    await signIn();
  });

  it('loescht beim Einzelbild erst die Zeile, dann den Blob', async () => {
    const fixtures = await seedFixtures();

    const result = await deleteSpeciesMediaAction(
      fixtures.mediaId,
      initialMediaActionState,
      new FormData(),
    );

    expect(result).toEqual({ error: null });
    expect(await listSpeciesMedia(context.db!, fixtures.speciesId)).toEqual([]);
    expect(blobCalls.del).toEqual([[fixtures.mediaUrl]]);
  });

  it('meldet dem Nutzer Erfolg, auch wenn der Store nicht erreichbar ist', async () => {
    const fixtures = await seedFixtures();
    blobFails.del = true;

    const result = await deleteSpeciesMediaAction(
      fixtures.mediaId,
      initialMediaActionState,
      new FormData(),
    );

    // Die Zeile ist weg — aus Sicht der Anwendung ist das Bild geloescht.
    // Was bleibt, ist eine Waise fuer `pnpm blob:prune`.
    expect(result).toEqual({ error: null });
    expect(await listSpeciesMedia(context.db!, fixtures.speciesId)).toEqual([]);
  });

  it('raeumt beim Loeschen einer Art alle zugehoerigen Blobs ab', async () => {
    const fixtures = await seedFixtures();

    const zweite = await insertSpeciesMedia(context.db!, {
      speciesId: fixtures.speciesId,
      url: blobUrl(fixtures.speciesId, 'zwei.jpg'),
      alt: 'Zweites Bild',
      width: 800,
      height: 600,
      contentType: 'image/jpeg',
    });
    expect(zweite.ok).toBe(true);

    await expect(
      deleteSpeciesAction(fixtures.speciesId, initialSpeciesDeleteState, new FormData()),
    ).rejects.toBeInstanceOf(TestRedirect);

    expect(await listSpecies(context.db!)).toEqual([]);
    expect(blobCalls.del).toEqual([[fixtures.mediaUrl, blobUrl(fixtures.speciesId, 'zwei.jpg')]]);
  });

  it('bricht den Loeschvorgang der Art nicht ab, wenn der Store scheitert', async () => {
    const fixtures = await seedFixtures();
    blobFails.del = true;

    await expect(
      deleteSpeciesAction(fixtures.speciesId, initialSpeciesDeleteState, new FormData()),
    ).rejects.toBeInstanceOf(TestRedirect);

    expect(redirects.at(-1)).toBe('/admin/species');
    expect(await listSpecies(context.db!)).toEqual([]);
  });

  it('fasst den Store gar nicht an, wenn die Art keine Bilder hatte', async () => {
    const speciesId = await seedSpecies();

    await expect(
      deleteSpeciesAction(speciesId, initialSpeciesDeleteState, new FormData()),
    ).rejects.toBeInstanceOf(TestRedirect);

    expect(blobCalls.del).toEqual([]);
  });
});
