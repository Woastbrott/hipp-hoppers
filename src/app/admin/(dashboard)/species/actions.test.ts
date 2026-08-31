import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminUsers, products, species } from '@/db/schema';
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
  toggleSpeciesPublishedAction,
  updateSpeciesAction,
} = actionsModule;
const { initialSpeciesDeleteState, initialSpeciesFormState } = await import('./state');
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

  adminId = admin.id;
  context.cookie = await signSessionToken({ sub: admin.id, tv: 1 });
}

/** Vollstaendiger Zustand der Tabelle — Grundlage fuer "hat sich nichts geaendert". */
async function speciesSnapshot(): Promise<unknown> {
  return context.db!.select().from(species).orderBy(species.slug);
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

// ---------------------------------------------------------------------------
// requireAdmin: die Matrix
// ---------------------------------------------------------------------------

/** Wie eine abgewiesene Action nach aussen aussieht — Rueckgabewert oder Umleitung. */
type Denial = { kind: 'error'; message: string | null } | { kind: 'redirect'; target: string };

type GuardedAction = {
  name: string;
  /** Ruft die Action so auf, wie sie aus dem Formular kaeme. */
  run: (speciesId: string) => Promise<Denial>;
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
    run: async (speciesId) => {
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
    run: async (speciesId) => {
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
    run: (speciesId) =>
      catchRedirect(toggleSpeciesPublishedAction(speciesId, true, new FormData())),
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

    // Faellt um, sobald jemand eine fuenfte Action ergaenzt, ohne sie hier einzutragen.
    expect(exported).toEqual(guardedActions.map((entry) => entry.name).sort());
  });

  it.each(guardMatrix)('$action weist $denial ab und mutiert nichts', async (entry) => {
    const speciesId = await seedSpecies();
    const before = await speciesSnapshot();

    await entry.apply();
    const denial = await entry.run(speciesId);

    if (denial.kind === 'redirect') {
      expect(denial.target).toBe('/admin/login');
    } else {
      // Exakt die generische Meldung — keine Id, keine Mail, kein Grund.
      expect(denial.message).toBe(entry.expected);
    }

    expect(await speciesSnapshot()).toEqual(before);
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
