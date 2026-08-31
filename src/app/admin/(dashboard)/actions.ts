'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import { clearSessionCookie } from '@/lib/auth/cookie';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import { getCurrentAdmin } from '@/lib/auth/current-admin';
import { revokeSessions } from '@/lib/auth/session';
import { env } from '@/lib/env';

/**
 * Logout mit echter Invalidierung — und der dokumentierte Sonderfall unter den
 * mutierenden Actions.
 *
 * Alle anderen Actions beginnen mit `requireAdmin()` und brechen ab, wenn die Session
 * nicht gueltig ist. Beim Abmelden waere genau das falsch: wer ein abgelaufenes oder
 * durch einen frueheren Logout entwertetes Token im Cookie hat, bekaeme eine
 * Fehlermeldung und bliebe scheinbar angemeldet. Abmelden muss immer abmelden.
 *
 * Also getrennte Schritte:
 *  1. Origin pruefen — von einer fremden Seite wird gar nichts angefasst.
 *  2. `token_version` hochzaehlen, aber nur bei gueltiger Session: nur die laesst sich
 *     serverseitig entwerten, und nur dafuer kennen wir die User-Id.
 *  3. Cookie loeschen — immer. Das ist der Teil, der den Nutzer tatsaechlich ausloggt.
 *
 * Cookie loeschen allein waere client-seitig: ein stateless JWT bliebe bis zum Ablauf
 * gueltig, auch eine Kopie. Schritt 2 ist deshalb der wichtige — er ist nur nicht
 * die Voraussetzung fuer Schritt 3.
 */
export async function logoutAction(): Promise<void> {
  const headerList = await headers();
  const origin = verifyRequestOrigin(headerList, env.APP_ORIGIN);

  if (!origin.ok) {
    // Fremde Origin: nichts anfassen, nichts erklaeren.
    redirect('/admin/login');
  }

  const admin = await getCurrentAdmin();

  if (admin) {
    await revokeSessions(db, admin.id);
  }

  await clearSessionCookie();

  redirect('/admin/login');
}
