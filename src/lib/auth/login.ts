import 'server-only';

import type { Db } from '@/db/types';

import { burnPasswordVerification, verifyPassword } from './password';
import {
  accountIdentifier,
  ACCOUNT_ATTEMPT_THRESHOLD,
  checkRateLimit,
  IP_ATTEMPT_THRESHOLD,
  ipIdentifier,
  registerFailedAttempt,
  resetAttempts,
} from './rate-limit';
import { findAdminByEmail } from './session';

/**
 * Eine Meldung fuer alle Fehlschlaege der Anmeldung — unbekannte Adresse und falsches
 * Passwort sind von aussen ununterscheidbar. Sonst laesst sich die Login-Maske als
 * Verzeichnis benutzen ("existiert dieses Konto?").
 */
export const UNIFORM_LOGIN_ERROR = 'E-Mail oder Passwort stimmt nicht.';

export type LoginSuccess = {
  ok: true;
  user: { id: string; email: string; tokenVersion: number };
};

export type LoginFailure =
  | { ok: false; reason: 'invalid_credentials'; message: string }
  | { ok: false; reason: 'rate_limited'; message: string; retryAfterSeconds: number };

export type LoginResult = LoginSuccess | LoginFailure;

export type LoginInput = {
  db: Db;
  email: string;
  password: string;
  /** Client-IP fuer den IP-Bucket des Limiters. */
  ip: string;
  now?: Date;
};

function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Zu viele Versuche. Probier's in ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} nochmal.`;
}

export async function attemptLogin({
  db,
  email,
  password,
  ip,
  now = new Date(),
}: LoginInput): Promise<LoginResult> {
  const accountKey = accountIdentifier(email);
  const ipKey = ipIdentifier(ip);

  // Zuerst die Sperre pruefen: eine gesperrte Quelle soll keine argon2-Rechenzeit kosten.
  const verdict = await checkRateLimit(db, [accountKey, ipKey], now);

  if (!verdict.allowed) {
    return {
      ok: false,
      reason: 'rate_limited',
      message: rateLimitMessage(verdict.retryAfterSeconds),
      retryAfterSeconds: verdict.retryAfterSeconds,
    };
  }

  const buckets = [
    { identifier: accountKey, threshold: ACCOUNT_ATTEMPT_THRESHOLD },
    { identifier: ipKey, threshold: IP_ATTEMPT_THRESHOLD },
  ];

  const user = await findAdminByEmail(db, email);

  if (!user) {
    // Dummy-Hash verifizieren, damit ein unbekanntes Konto genauso lange braucht
    // wie ein falsches Passwort.
    await burnPasswordVerification(password);
    await registerFailedAttempt(db, buckets, now);

    return { ok: false, reason: 'invalid_credentials', message: UNIFORM_LOGIN_ERROR };
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);

  if (!passwordMatches) {
    await registerFailedAttempt(db, buckets, now);

    return { ok: false, reason: 'invalid_credentials', message: UNIFORM_LOGIN_ERROR };
  }

  // Nur der Konto-Bucket wird zurueckgesetzt — Begruendung in `rate-limit.ts`.
  await resetAttempts(db, [accountKey]);

  return {
    ok: true,
    user: { id: user.id, email: user.email, tokenVersion: user.tokenVersion },
  };
}
