import 'server-only';

import { cache } from 'react';

import { db } from '@/db';

import { readSessionCookie } from './cookie';
import { resolveSession, type SessionUser } from './session';

/**
 * Autoritativer Zugriff auf den eingeloggten Admin — inklusive DB-Abgleich der
 * `token_version`. Genau das benutzt das Gate in `app/admin/layout.tsx`.
 *
 * `cache()` dedupliziert den Aufruf innerhalb eines Renderdurchlaufs: Layout und
 * Seite koennen beide fragen, es bleibt bei einem Query.
 */
export const getCurrentAdmin = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionCookie();
  const result = await resolveSession(db, token);

  return result.ok ? result.user : null;
});
