import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { adminUsers, loginAttempts } from '@/db/schema';
import type { Db } from '@/db/types';
import { createTestDatabase } from '../../../test/db';

import { attemptLogin, UNIFORM_LOGIN_ERROR } from './login';
import { hashPassword } from './password';
import { accountIdentifier, ACCOUNT_ATTEMPT_THRESHOLD, ipIdentifier } from './rate-limit';

let db: Db;
let close: () => Promise<void>;
let adminId: string;

const email = 'admin@hipp-hoppers.test';
const password = 'ein-hinreichend-langes-testpasswort';
const ip = '203.0.113.7';
const start = new Date('2026-01-01T12:00:00.000Z');

function at(secondsFromStart: number): Date {
  return new Date(start.getTime() + secondsFromStart * 1000);
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());

  const rows = await db
    .insert(adminUsers)
    .values({ email, passwordHash: await hashPassword(password), tokenVersion: 4 })
    .returning({ id: adminUsers.id });

  const row = rows[0];
  if (!row) throw new Error('Testfixture konnte keinen Admin anlegen.');
  adminId = row.id;
});

afterEach(async () => {
  await close();
});

describe('attemptLogin — happy path', () => {
  it('meldet an und liefert die aktuelle token_version fuer das JWT', async () => {
    const result = await attemptLogin({ db, email, password, ip, now: start });

    expect(result).toEqual({
      ok: true,
      user: { id: adminId, email, tokenVersion: 4 },
    });
  });

  it('normalisiert die eingegebene Adresse', async () => {
    const result = await attemptLogin({
      db,
      email: '  ADMIN@Hipp-Hoppers.TEST ',
      password,
      ip,
      now: start,
    });

    expect(result.ok).toBe(true);
  });

  it('setzt den Konto-Zaehler zurueck, laesst den IP-Zaehler aber stehen', async () => {
    for (let index = 0; index < 3; index += 1) {
      await attemptLogin({ db, email, password: 'falsch', ip, now: at(index) });
    }

    const beforeSuccess = await db.select().from(loginAttempts);
    expect(beforeSuccess).toHaveLength(2);

    await attemptLogin({ db, email, password, ip, now: at(3) });

    const accountRows = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, accountIdentifier(email)));
    expect(accountRows).toHaveLength(0);

    // Der IP-Bucket schuetzt gegen Spraying ueber viele Konten und darf sich nicht
    // mit einem einzigen bekannten Login zuruecksetzen lassen.
    const ipRows = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, ipIdentifier(ip)));
    expect(ipRows[0]?.attemptCount).toBe(3);
  });
});

describe('attemptLogin — uniforme Fehlermeldung', () => {
  it('gibt bei falschem Passwort die neutrale Meldung zurueck', async () => {
    const result = await attemptLogin({ db, email, password: 'falsch', ip, now: start });

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_credentials',
      message: UNIFORM_LOGIN_ERROR,
    });
  });

  it('gibt bei unbekannter Adresse exakt dieselbe Meldung zurueck', async () => {
    const unknown = await attemptLogin({
      db,
      email: 'gibtsnicht@hipp-hoppers.test',
      password,
      ip,
      now: start,
    });

    const wrongPassword = await attemptLogin({
      db,
      email,
      password: 'falsch',
      ip,
      now: at(1),
    });

    // Von aussen ununterscheidbar — sonst waere die Login-Maske ein Kontoverzeichnis.
    expect(unknown).toEqual(wrongPassword);
  });

  it('zaehlt auch fuer unbekannte Adressen mit', async () => {
    await attemptLogin({
      db,
      email: 'gibtsnicht@hipp-hoppers.test',
      password,
      ip,
      now: start,
    });

    const rows = await db.select().from(loginAttempts);
    expect(rows).toHaveLength(2);
  });
});

describe('attemptLogin — Rate-Limit', () => {
  it('sperrt nach dem Schwellwert und nennt die Wartezeit', async () => {
    for (let index = 0; index < ACCOUNT_ATTEMPT_THRESHOLD; index += 1) {
      const result = await attemptLogin({ db, email, password: 'falsch', ip, now: at(index) });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid_credentials');
    }

    const blocked = await attemptLogin({
      db,
      email,
      password: 'falsch',
      ip,
      now: at(ACCOUNT_ATTEMPT_THRESHOLD),
    });

    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe('rate_limited');
    expect(blocked.message).toMatch(/Zu viele Versuche/);
  });

  it('sperrt auch das richtige Passwort, solange die Sperre laeuft', async () => {
    for (let index = 0; index < ACCOUNT_ATTEMPT_THRESHOLD; index += 1) {
      await attemptLogin({ db, email, password: 'falsch', ip, now: at(index) });
    }

    const blocked = await attemptLogin({
      db,
      email,
      password,
      ip,
      now: at(ACCOUNT_ATTEMPT_THRESHOLD),
    });

    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('rate_limited');
  });

  it('laesst nach Ablauf der Sperre wieder anmelden', async () => {
    for (let index = 0; index < ACCOUNT_ATTEMPT_THRESHOLD; index += 1) {
      await attemptLogin({ db, email, password: 'falsch', ip, now: at(index) });
    }

    // Sperre begann beim letzten Versuch und dauert 30 Sekunden.
    const afterLock = at(ACCOUNT_ATTEMPT_THRESHOLD - 1 + 31);
    const result = await attemptLogin({ db, email, password, ip, now: afterLock });

    expect(result.ok).toBe(true);
  });
});
