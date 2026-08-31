import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loginAttempts } from '@/db/schema';
import type { Db } from '@/db/types';
import { createTestDatabase } from '../../../test/db';

import {
  accountIdentifier,
  ACCOUNT_ATTEMPT_THRESHOLD,
  checkRateLimit,
  ipIdentifier,
  lockDurationSeconds,
  RATE_LIMIT_WINDOW_SECONDS,
  registerFailedAttempt,
  resetAttempts,
} from './rate-limit';

let db: Db;
let close: () => Promise<void>;

const identifier = accountIdentifier('admin@hipp-hoppers.test');
const bucket = { identifier, threshold: ACCOUNT_ATTEMPT_THRESHOLD };
const start = new Date('2026-01-01T12:00:00.000Z');

function at(secondsFromStart: number): Date {
  return new Date(start.getTime() + secondsFromStart * 1000);
}

async function readRow() {
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.identifier, identifier));

  return rows[0] ?? null;
}

/** Zaehlt `count` Fehlversuche im Sekundentakt ab `offset`. */
async function fail(count: number, offset = 0): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await registerFailedAttempt(db, [bucket], at(offset + index));
  }
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(async () => {
  await close();
});

describe('lockDurationSeconds', () => {
  it('verdoppelt sich pro Versuch ueber dem Schwellwert und ist gedeckelt', () => {
    expect(lockDurationSeconds(0)).toBe(30);
    expect(lockDurationSeconds(1)).toBe(60);
    expect(lockDurationSeconds(2)).toBe(120);
    expect(lockDurationSeconds(3)).toBe(240);
    // Deckel bei 15 Minuten.
    expect(lockDurationSeconds(20)).toBe(900);
  });
});

describe('registerFailedAttempt', () => {
  it('legt den Bucket beim ersten Fehlversuch an', async () => {
    await fail(1);

    const row = await readRow();
    expect(row?.attemptCount).toBe(1);
    expect(row?.lockedUntil).toBeNull();
  });

  it('zaehlt weitere Fehlversuche im selben Fenster hoch', async () => {
    await fail(3);

    const row = await readRow();
    expect(row?.attemptCount).toBe(3);
    expect(row?.lockedUntil).toBeNull();
  });

  it('sperrt, sobald der Schwellwert erreicht ist', async () => {
    await fail(ACCOUNT_ATTEMPT_THRESHOLD);

    const row = await readRow();
    expect(row?.attemptCount).toBe(ACCOUNT_ATTEMPT_THRESHOLD);
    expect(row?.lockedUntil).not.toBeNull();

    const lastAttemptAt = at(ACCOUNT_ATTEMPT_THRESHOLD - 1);
    expect(row?.lockedUntil?.getTime()).toBe(lastAttemptAt.getTime() + 30_000);
  });

  it('verlaengert die Sperre exponentiell bei weiteren Versuchen', async () => {
    await fail(ACCOUNT_ATTEMPT_THRESHOLD + 2);

    const row = await readRow();
    expect(row?.attemptCount).toBe(ACCOUNT_ATTEMPT_THRESHOLD + 2);

    const lastAttemptAt = at(ACCOUNT_ATTEMPT_THRESHOLD + 1);
    // overage = 2 -> 120 Sekunden
    expect(row?.lockedUntil?.getTime()).toBe(lastAttemptAt.getTime() + 120_000);
  });

  it('startet die Zaehlung neu, wenn das Fenster abgelaufen ist', async () => {
    await fail(3);

    await registerFailedAttempt(db, [bucket], at(RATE_LIMIT_WINDOW_SECONDS + 1));

    const row = await readRow();
    expect(row?.attemptCount).toBe(1);
    expect(row?.windowStartedAt.getTime()).toBe(at(RATE_LIMIT_WINDOW_SECONDS + 1).getTime());
  });

  it('haelt IP- und Konto-Bucket getrennt', async () => {
    const ipBucket = { identifier: ipIdentifier('203.0.113.7'), threshold: 20 };

    await registerFailedAttempt(db, [bucket, ipBucket], start);
    await registerFailedAttempt(db, [bucket, ipBucket], at(1));

    const rows = await db.select().from(loginAttempts);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.attemptCount === 2)).toBe(true);
  });
});

describe('checkRateLimit', () => {
  it('laesst durch, solange keine Sperre existiert', async () => {
    await fail(ACCOUNT_ATTEMPT_THRESHOLD - 1);

    await expect(checkRateLimit(db, [identifier], at(10))).resolves.toEqual({ allowed: true });
  });

  it('blockt waehrend einer laufenden Sperre und nennt die Restzeit', async () => {
    await fail(ACCOUNT_ATTEMPT_THRESHOLD);

    const lockedAt = at(ACCOUNT_ATTEMPT_THRESHOLD - 1);
    const tenSecondsLater = new Date(lockedAt.getTime() + 10_000);

    await expect(checkRateLimit(db, [identifier], tenSecondsLater)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 20,
    });
  });

  it('laesst nach Ablauf der Sperre wieder durch', async () => {
    await fail(ACCOUNT_ATTEMPT_THRESHOLD);

    const lockedAt = at(ACCOUNT_ATTEMPT_THRESHOLD - 1);
    const afterLock = new Date(lockedAt.getTime() + 31_000);

    await expect(checkRateLimit(db, [identifier], afterLock)).resolves.toEqual({ allowed: true });
  });

  it('nimmt die laengste Restzeit, wenn mehrere Buckets gesperrt sind', async () => {
    const ipBucket = { identifier: ipIdentifier('203.0.113.7'), threshold: 1 };

    await registerFailedAttempt(db, [bucket], start);
    await fail(ACCOUNT_ATTEMPT_THRESHOLD - 1, 1);
    // IP-Bucket sperrt spaeter und damit laenger.
    await registerFailedAttempt(db, [ipBucket], at(20));

    const verdict = await checkRateLimit(db, [identifier, ipBucket.identifier], at(21));

    expect(verdict).toEqual({ allowed: false, retryAfterSeconds: 29 });
  });

  it('ist bei leerer Identifier-Liste ein No-op', async () => {
    await expect(checkRateLimit(db, [], start)).resolves.toEqual({ allowed: true });
  });
});

describe('resetAttempts', () => {
  it('loescht den Bucket samt Sperre', async () => {
    await fail(ACCOUNT_ATTEMPT_THRESHOLD);
    expect(await readRow()).not.toBeNull();

    await resetAttempts(db, [identifier]);

    expect(await readRow()).toBeNull();
    await expect(checkRateLimit(db, [identifier], at(1))).resolves.toEqual({ allowed: true });
  });
});
