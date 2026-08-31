'use server';

import { redirect } from 'next/navigation';

import { db } from '@/db';
import { clearSessionCookie } from '@/lib/auth/cookie';
import { requireAdmin } from '@/lib/auth/require-admin';
import { revokeSessions } from '@/lib/auth/session';

/**
 * Logout mit echter Invalidierung.
 *
 * Cookie loeschen allein waere client-seitig: ein stateless JWT bliebe bis zum Ablauf
 * gueltig — auch eine Kopie, die jemand mitgenommen hat. Deshalb wird zusaetzlich
 * `token_version` hochgezaehlt; damit faellt jedes vorher ausgestellte Token beim
 * autoritativen Check durch.
 *
 * Der Wachposten ist derselbe wie in allen anderen mutierenden Actions: `requireAdmin()`
 * prueft Origin und Session in einem Schritt. Vorher stand die Pruefung hier von Hand —
 * dieselbe Aussage an zwei Stellen driftet frueher oder spaeter auseinander.
 */
export async function logoutAction(): Promise<void> {
  const guard = await requireAdmin();

  if (!guard.ok) {
    // Fremde Origin oder keine gueltige Session: nichts tun, nichts erklaeren.
    redirect('/admin/login');
  }

  await revokeSessions(db, guard.admin.id);
  await clearSessionCookie();

  redirect('/admin/login');
}
