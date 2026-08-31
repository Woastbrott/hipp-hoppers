/**
 * CSRF-Schutz fuer Server Actions und POST-Routen.
 *
 * Next prueft bei Server Actions selbst Origin gegen Host; das hier ist die explizite,
 * eigene Kontrolle — sie gilt auch fuer Route Handler und laesst sich per `APP_ORIGIN`
 * hart auf eine Origin festnageln, statt dem Host-Header der Anfrage zu glauben.
 *
 * Bewusst ohne `server-only`: reine Header-Logik, keine Secrets, gut testbar.
 */

export type OriginVerdict =
  { ok: true } | { ok: false; reason: 'missing_origin' | 'foreign_origin' };

function normalize(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopback(host: string): boolean {
  try {
    // Ueber URL statt String-Split, damit IPv6-Hosts wie `[::1]:3000` korrekt zerlegt werden.
    const { hostname } = new URL(`http://${host}`);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function expectedOriginFromHeaders(headers: Headers): string | null {
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return null;

  // Kann eine Liste sein ("https,http") — der erste Eintrag ist der aeussere Proxy.
  const forwardedProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  // Ohne Forwarded-Header: https annehmen, ausser es ist die lokale Entwicklung.
  const proto = forwardedProto ?? (isLoopback(host) ? 'http' : 'https');

  return normalize(`${proto}://${host}`);
}

/**
 * @param configuredOrigin `APP_ORIGIN` aus der Env. Wenn gesetzt, ist das die einzige
 *        erlaubte Origin — sonst wird gegen den (Forwarded-)Host der Anfrage geprueft.
 */
export function verifyRequestOrigin(headers: Headers, configuredOrigin?: string): OriginVerdict {
  const rawOrigin = headers.get('origin');

  // Kein Origin-Header bei einem state-changing Request: nicht durchwinken.
  if (!rawOrigin) {
    return { ok: false, reason: 'missing_origin' };
  }

  const actual = normalize(rawOrigin);
  if (!actual) {
    return { ok: false, reason: 'foreign_origin' };
  }

  const expected = configuredOrigin
    ? normalize(configuredOrigin)
    : expectedOriginFromHeaders(headers);

  if (!expected || actual !== expected) {
    return { ok: false, reason: 'foreign_origin' };
  }

  return { ok: true };
}
