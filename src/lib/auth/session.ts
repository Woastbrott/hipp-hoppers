import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { adminUsers } from '@/db/schema';
import type { Db } from '@/db/types';

import { verifySessionToken, type TokenRejection } from './jwt';

/**
 * Der autoritative Session-Check. Kein `next/headers` hier, damit die Logik ohne
 * Request-Kontext testbar bleibt — das Cookie-Handling liegt in `cookie.ts`.
 */

export type SessionUser = {
  id: string;
  email: string;
};

export type SessionRejection = TokenRejection | 'unknown_user' | 'stale_token_version';

export type SessionResult =
  { ok: true; user: SessionUser } | { ok: false; reason: SessionRejection };

/**
 * Zweistufig, absichtlich:
 *  1. Signatur + Ablauf — billig, ohne DB. Dasselbe macht der Proxy als Vorfilter.
 *  2. `token_version` gegen die DB — das ist die Instanz, die ein Logout wirksam macht.
 */
export async function resolveSession(
  db: Db,
  token: string | undefined | null,
): Promise<SessionResult> {
  const verified = await verifySessionToken(token);

  if (!verified.ok) {
    return { ok: false, reason: verified.reason };
  }

  const rows = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      tokenVersion: adminUsers.tokenVersion,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, verified.claims.sub))
    .limit(1);

  const user = rows[0];

  if (!user) {
    return { ok: false, reason: 'unknown_user' };
  }

  if (user.tokenVersion !== verified.claims.tv) {
    return { ok: false, reason: 'stale_token_version' };
  }

  return { ok: true, user: { id: user.id, email: user.email } };
}

export async function findAdminByEmail(
  db: Db,
  email: string,
): Promise<{ id: string; email: string; passwordHash: string; tokenVersion: number } | null> {
  const rows = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      passwordHash: adminUsers.passwordHash,
      tokenVersion: adminUsers.tokenVersion,
    })
    .from(adminUsers)
    .where(eq(adminUsers.email, email.trim().toLowerCase()))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Erhoeht `token_version` und entwertet damit jedes bereits ausgestellte Token.
 *
 * Nur das Cookie zu loeschen waere client-seitig: ein stateless JWT bleibt bis zum
 * Ablauf gueltig, auch eine abgegriffene Kopie. Erst der Versionssprung macht Logout echt.
 */
export async function revokeSessions(db: Db, userId: string): Promise<number | null> {
  const rows = await db
    .update(adminUsers)
    .set({
      tokenVersion: sql`${adminUsers.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(adminUsers.id, userId))
    .returning({ tokenVersion: adminUsers.tokenVersion });

  return rows[0]?.tokenVersion ?? null;
}
