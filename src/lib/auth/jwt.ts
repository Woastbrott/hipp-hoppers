import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

/**
 * Bewusst frei von `server-only`, `next/headers` und DB-Zugriff: dieses Modul laeuft
 * auch im Proxy (Edge-Runtime). Alles, was Node-APIs oder die Datenbank braucht,
 * liegt in `session.ts` / `current-admin.ts`.
 */

export const SESSION_COOKIE_NAME = 'hh_admin_session';

/** 8 Stunden — lang genug fuer eine Admin-Sitzung, kurz genug als Schadensgrenze. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const ISSUER = 'hipp-hoppers';
const AUDIENCE = 'hipp-hoppers/admin';
const ALGORITHM = 'HS256';

const sessionClaimsSchema = z.object({
  /** Admin-User-Id. */
  sub: z.uuid(),
  /** `token_version` aus `admin_users` zum Zeitpunkt der Ausstellung. */
  tv: z.int().positive(),
});

export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

export type TokenRejection = 'missing' | 'expired' | 'invalid';

export type VerifyTokenResult =
  { ok: true; claims: SessionClaims } | { ok: false; reason: TokenRejection };

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  // Doppelt gemoppelt zur Env-Validierung, aber dieses Modul laeuft auch dort,
  // wo `lib/env.ts` (server-only) nicht importiert werden kann.
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('JWT_SECRET fehlt oder ist kuerzer als 32 Zeichen.');
  }

  return new TextEncoder().encode(secret);
}

export type SignOptions = {
  /**
   * Lebensdauer in Sekunden ab jetzt. Negative Werte erzeugen ein bereits
   * abgelaufenes Token — dafuer gibt es genau einen legitimen Grund: Tests.
   */
  expiresInSeconds?: number;
};

export async function signSessionToken(
  claims: SessionClaims,
  options: SignOptions = {},
): Promise<string> {
  const expiresInSeconds = options.expiresInSeconds ?? SESSION_MAX_AGE_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({ tv: claims.tv })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + expiresInSeconds)
    .sign(getSecretKey());
}

/**
 * Prueft Signatur, Issuer/Audience und Ablauf — mehr nicht. Ob die `token_version`
 * noch aktuell ist, weiss nur die Datenbank; das macht `resolveSession()`.
 */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<VerifyTokenResult> {
  if (!token) {
    return { ok: false, reason: 'missing' };
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });

    const parsed = sessionClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, reason: 'invalid' };
    }

    return { ok: true, claims: parsed.data };
  } catch (error: unknown) {
    if (error instanceof joseErrors.JWTExpired) {
      return { ok: false, reason: 'expired' };
    }

    // Signatur kaputt, Header manipuliert, falscher Issuer, Muell im Cookie:
    // alles derselbe Ausgang, keine Details nach aussen.
    return { ok: false, reason: 'invalid' };
  }
}
