import 'server-only';

import { headers } from 'next/headers';

import { env } from '@/lib/env';

import { verifyRequestOrigin } from './csrf';
import { getCurrentAdmin } from './current-admin';
import type { SessionUser } from './session';

/**
 * Muss als erste Zeile in jeder mutierenden Server Action stehen.
 *
 * Das Gate im Layout schuetzt das Rendering — nicht die Action. Server Actions sind
 * eigene Endpoints mit eigener ID und lassen sich direkt aufrufen, ohne dass je eine
 * geschuetzte Seite gerendert wurde. Wer sich darauf verlaesst, dass "die Seite ja
 * geschuetzt ist", hat einen offenen Endpoint.
 *
 * Gleichzeitig laeuft hier der CSRF-Origin-Check: eine Aktion, die Daten aendert,
 * darf nicht von einer fremden Seite ausgeloest werden.
 */
export const ADMIN_REQUIRED_ERROR = 'Nicht angemeldet. Lade die Seite neu und melde dich an.';
export const FOREIGN_ORIGIN_ERROR = 'Anfrage abgelehnt. Lade die Seite neu und versuch es nochmal.';

export type AdminGuard = { ok: true; admin: SessionUser } | { ok: false; error: string };

export async function requireAdmin(): Promise<AdminGuard> {
  const headerList = await headers();

  const origin = verifyRequestOrigin(headerList, env.APP_ORIGIN);
  if (!origin.ok) {
    return { ok: false, error: FOREIGN_ORIGIN_ERROR };
  }

  // Autoritativ: prueft Signatur, Ablauf UND token_version gegen die Datenbank.
  const admin = await getCurrentAdmin();
  if (!admin) {
    return { ok: false, error: ADMIN_REQUIRED_ERROR };
  }

  return { ok: true, admin };
}
