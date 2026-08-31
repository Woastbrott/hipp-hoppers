import 'server-only';

import { eq, inArray, sql } from 'drizzle-orm';

import { loginAttempts } from '@/db/schema';
import type { Db } from '@/db/types';

/**
 * Login-Rate-Limit mit State in Postgres.
 *
 * Warum nicht in-memory: auf Vercel hat jede Invocation ihren eigenen Heap. Eine Map
 * besteht lokal jeden Test und zaehlt in Produktion faktisch nichts, weil der naechste
 * Versuch auf einer anderen Instanz landet. Der Zaehler muss also dorthin, wo alle
 * Instanzen hinschauen.
 *
 * Zwei Buckets pro Versuch:
 *  - `ip:<adresse>`  — bremst Spraying ueber viele Konten von einer Quelle.
 *  - `account:<mail>` — bremst gezieltes Raten gegen ein Konto.
 */

export const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/** Ab hier wird gesperrt. Konto strenger als IP, weil hinter einer IP mehrere Leute sitzen koennen. */
export const ACCOUNT_ATTEMPT_THRESHOLD = 5;
export const IP_ATTEMPT_THRESHOLD = 20;

const BASE_LOCK_SECONDS = 30;
const MAX_LOCK_SECONDS = 15 * 60;

export function accountIdentifier(email: string): string {
  return `account:${email.trim().toLowerCase()}`;
}

export function ipIdentifier(ip: string): string {
  return `ip:${ip}`;
}

/**
 * Exponentieller Backoff ab dem Schwellwert: 30s, 60s, 120s, … gedeckelt bei 15 Minuten.
 * `overage` ist die Anzahl Versuche ueber dem Schwellwert (0 = der Versuch, der ihn erreicht).
 */
export function lockDurationSeconds(overage: number): number {
  const steps = Math.max(0, overage);
  return Math.min(BASE_LOCK_SECONDS * 2 ** steps, MAX_LOCK_SECONDS);
}

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type AttemptBucket = {
  identifier: string;
  threshold: number;
};

/**
 * Sagt nur, ob gerade eine Sperre laeuft — zaehlt nichts hoch. Wird vor der
 * Passwortpruefung aufgerufen, damit eine gesperrte Quelle keine argon2-Rechenzeit kostet.
 */
export async function checkRateLimit(
  db: Db,
  identifiers: readonly string[],
  now: Date = new Date(),
): Promise<RateLimitVerdict> {
  if (identifiers.length === 0) {
    return { allowed: true };
  }

  const rows = await db
    .select({
      lockedUntil: loginAttempts.lockedUntil,
    })
    .from(loginAttempts)
    .where(inArray(loginAttempts.identifier, [...identifiers]));

  let retryAfterSeconds = 0;

  for (const row of rows) {
    if (row.lockedUntil === null) continue;

    const remainingMs = row.lockedUntil.getTime() - now.getTime();
    if (remainingMs > 0) {
      retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil(remainingMs / 1000));
    }
  }

  return retryAfterSeconds > 0 ? { allowed: false, retryAfterSeconds } : { allowed: true };
}

/**
 * Zaehlt einen Fehlversuch und sperrt, wenn der Schwellwert erreicht ist.
 *
 * Das Hochzaehlen ist ein einziges Statement (INSERT … ON CONFLICT DO UPDATE), also
 * atomar auch bei parallelen Requests — der neon-http-Treiber kann keine interaktiven
 * Transaktionen, ein Read-Modify-Write waere hier eine Race Condition.
 */
export async function registerFailedAttempt(
  db: Db,
  buckets: readonly AttemptBucket[],
  now: Date = new Date(),
): Promise<void> {
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_SECONDS * 1000);
  const nowIso = now.toISOString();
  const windowStartIso = windowStart.toISOString();

  for (const bucket of buckets) {
    const rows = await db
      .insert(loginAttempts)
      .values({
        identifier: bucket.identifier,
        attemptCount: 1,
        windowStartedAt: now,
        lastAttemptAt: now,
      })
      .onConflictDoUpdate({
        target: loginAttempts.identifier,
        set: {
          // Faellt der letzte Versuch aus dem Fenster, faengt die Zaehlung neu an.
          attemptCount: sql`case
            when ${loginAttempts.windowStartedAt} < ${windowStartIso}::timestamptz then 1
            else ${loginAttempts.attemptCount} + 1
          end`,
          windowStartedAt: sql`case
            when ${loginAttempts.windowStartedAt} < ${windowStartIso}::timestamptz then ${nowIso}::timestamptz
            else ${loginAttempts.windowStartedAt}
          end`,
          lastAttemptAt: now,
        },
      })
      .returning({ attemptCount: loginAttempts.attemptCount });

    const attemptCount = rows[0]?.attemptCount ?? 1;

    if (attemptCount >= bucket.threshold) {
      const lockedUntil = new Date(
        now.getTime() + lockDurationSeconds(attemptCount - bucket.threshold) * 1000,
      );

      await db
        .update(loginAttempts)
        .set({ lockedUntil })
        .where(eq(loginAttempts.identifier, bucket.identifier));
    }
  }
}

/**
 * Nach erfolgreichem Login. Bewusst nur der Konto-Bucket: der IP-Bucket schuetzt gegen
 * Spraying ueber viele Konten, und den duerfte ein Angreifer sonst mit einem einzigen
 * ihm bekannten Login zuruecksetzen.
 */
export async function resetAttempts(db: Db, identifiers: readonly string[]): Promise<void> {
  if (identifiers.length === 0) return;

  await db.delete(loginAttempts).where(inArray(loginAttempts.identifier, [...identifiers]));
}
