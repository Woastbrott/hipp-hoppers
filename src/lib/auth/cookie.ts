import 'server-only';

import { cookies } from 'next/headers';

import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './jwt';

/**
 * Session-Cookie:
 *  - `httpOnly`  — kein Zugriff aus JS, damit XSS das Token nicht einfach mitnimmt.
 *  - `secure`    — ausser in der lokalen Entwicklung ohne TLS.
 *  - `sameSite: 'lax'` — blockt Cross-Site-POSTs, laesst normale Navigation zu.
 *  - `path: '/'` — der Logout muss es auch ausserhalb von /admin loeschen koennen.
 */
const isProduction = process.env.NODE_ENV === 'production';

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();

  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();

  // Ueberschreiben statt nur loeschen: setzt maxAge 0 mit denselben Attributen,
  // damit der Browser das Cookie sicher verwirft.
  store.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
