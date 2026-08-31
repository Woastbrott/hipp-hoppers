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
 * Logout mit echter Invalidierung.
 *
 * Cookie loeschen allein waere client-seitig: ein stateless JWT bliebe bis zum Ablauf
 * gueltig — auch eine Kopie, die jemand mitgenommen hat. Deshalb wird zusaetzlich
 * `token_version` hochgezaehlt; damit faellt jedes vorher ausgestellte Token beim
 * autoritativen Check durch.
 */
export async function logoutAction(): Promise<void> {
  const headerList = await headers();
  const origin = verifyRequestOrigin(headerList, env.APP_ORIGIN);

  if (!origin.ok) {
    // Fremde Origin: nichts tun, nichts erklaeren.
    redirect('/admin/login');
  }

  const admin = await getCurrentAdmin();

  if (admin) {
    await revokeSessions(db, admin.id);
  }

  await clearSessionCookie();

  redirect('/admin/login');
}
