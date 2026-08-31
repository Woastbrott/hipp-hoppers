import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminUsers } from '@/db/schema';
import type { Db } from '@/db/types';
import { SESSION_COOKIE_NAME, signSessionToken } from '@/lib/auth/jwt';
import { revokeSessions } from '@/lib/auth/session';
import { createTestDatabase } from '../../../../test/db';

/**
 * Der Logout ist der dokumentierte Sonderfall unter den mutierenden Actions: er darf
 * NICHT an `requireAdmin()` haengen. Sonst bekaeme jemand mit abgelaufenem oder
 * entwertetem Token eine Fehlermeldung statt einer Abmeldung und bliebe scheinbar
 * angemeldet.
 *
 * Zusicherung hier: das Cookie geht bei eigener Origin immer weg, `token_version`
 * wandert aber nur bei gueltiger Session.
 */

type CookieWrite = { name: string; value: string; maxAge?: number };

const context: {
  db: Db | null;
  cookie: string | undefined;
  headers: Record<string, string>;
  cookieWrites: CookieWrite[];
} = {
  db: null,
  cookie: undefined,
  headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
  cookieWrites: [],
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
      set: (name: string, value: string, options?: { maxAge?: number }) => {
        context.cookieWrites.push({ name, value, maxAge: options?.maxAge });
      },
    }),
  headers: () => Promise.resolve(new Headers(context.headers)),
}));

vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    redirects.push(target);
    throw new TestRedirect(target);
  },
}));

const dashboardActions = await import('./actions');
const { logoutAction } = dashboardActions;

let adminId = '';
let close: () => Promise<void>;

async function createAdmin(): Promise<void> {
  if (!context.db) throw new Error('Test-Datenbank nicht gesetzt.');

  const rows = await context.db
    .insert(adminUsers)
    .values({
      email: 'admin@hipp-hoppers.test',
      passwordHash: 'fuer-diesen-test-egal',
      tokenVersion: 1,
    })
    .returning({ id: adminUsers.id });

  const row = rows[0];
  if (!row) throw new Error('Admin-Fixture fehlgeschlagen.');
  adminId = row.id;
}

async function tokenVersion(): Promise<number | undefined> {
  const rows = await context
    .db!.select({ tokenVersion: adminUsers.tokenVersion })
    .from(adminUsers)
    .where(eq(adminUsers.id, adminId));

  return rows[0]?.tokenVersion;
}

/** Das Loeschen ist ein Ueberschreiben mit maxAge 0 — siehe lib/auth/cookie.ts. */
function sessionCookieCleared(): boolean {
  return context.cookieWrites.some(
    (write) => write.name === SESSION_COOKIE_NAME && write.value === '' && write.maxAge === 0,
  );
}

async function runLogout(): Promise<string> {
  try {
    await logoutAction();
    throw new Error('logoutAction hat nicht umgeleitet.');
  } catch (error: unknown) {
    if (error instanceof TestRedirect) return error.target;
    throw error;
  }
}

beforeEach(async () => {
  const created = await createTestDatabase();
  context.db = created.db;
  close = created.close;
  context.cookie = undefined;
  context.headers = { origin: 'http://localhost:3000', host: 'localhost:3000' };
  context.cookieWrites = [];
  redirects.length = 0;

  await createAdmin();
});

afterEach(async () => {
  await close();
  context.db = null;
});

describe('logoutAction', () => {
  it('ist die einzige Action dieser Datei', () => {
    const exported = Object.entries(dashboardActions)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);

    // Kommt hier eine Action dazu, braucht sie eine bewusste Entscheidung:
    // `requireAdmin()` wie ueberall sonst — oder eine Begruendung wie beim Logout.
    expect(exported).toEqual(['logoutAction']);
  });

  it('entwertet bei gueltiger Session die Token-Version und loescht das Cookie', async () => {
    context.cookie = await signSessionToken({ sub: adminId, tv: 1 });

    expect(await runLogout()).toBe('/admin/login');

    expect(await tokenVersion()).toBe(2);
    expect(sessionCookieCleared()).toBe(true);
  });

  it('loescht das Cookie auch bei abgelaufenem Token, ohne token_version anzufassen', async () => {
    context.cookie = await signSessionToken({ sub: adminId, tv: 1 }, { expiresInSeconds: -60 });

    expect(await runLogout()).toBe('/admin/login');

    expect(await tokenVersion()).toBe(1);
    expect(sessionCookieCleared()).toBe(true);
  });

  it('loescht das Cookie auch bei veralteter token_version', async () => {
    const staleToken = await signSessionToken({ sub: adminId, tv: 1 });
    await revokeSessions(context.db!, adminId);
    context.cookie = staleToken;

    expect(await runLogout()).toBe('/admin/login');

    // Der frueher hochgezaehlte Wert bleibt: ein zweiter Logout zaehlt nicht weiter.
    expect(await tokenVersion()).toBe(2);
    expect(sessionCookieCleared()).toBe(true);
  });

  it('loescht das Cookie auch ganz ohne Session', async () => {
    context.cookie = undefined;

    expect(await runLogout()).toBe('/admin/login');

    expect(await tokenVersion()).toBe(1);
    expect(sessionCookieCleared()).toBe(true);
  });

  it('fasst von fremder Origin nichts an', async () => {
    context.cookie = await signSessionToken({ sub: adminId, tv: 1 });
    context.headers = { origin: 'https://boeser-nachbar.example', host: 'localhost:3000' };

    expect(await runLogout()).toBe('/admin/login');

    expect(await tokenVersion()).toBe(1);
    expect(sessionCookieCleared()).toBe(false);
  });
});
