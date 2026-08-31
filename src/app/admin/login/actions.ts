'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { setSessionCookie } from '@/lib/auth/cookie';
import { verifyRequestOrigin } from '@/lib/auth/csrf';
import { signSessionToken } from '@/lib/auth/jwt';
import { attemptLogin } from '@/lib/auth/login';
import { env } from '@/lib/env';

import type { LoginFormState } from './state';

const loginInputSchema = z.object({
  email: z.string().trim().min(1).max(254),
  // Deckel gegen DoS: argon2 auf ein Megabyte Eingabe loszulassen waere ein Geschenk.
  password: z.string().min(1).max(1024),
  next: z.string().max(512).optional(),
});

function clientIpFrom(headerList: Headers): string {
  // Auf Vercel setzt die Plattform diese Header; hinter einem anderen Proxy muss der
  // sicherstellen, dass sie nicht vom Client durchgereicht werden.
  const forwarded = headerList.get('x-forwarded-for');

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return headerList.get('x-real-ip')?.trim() ?? 'unknown';
}

/** Nur interne Admin-Pfade zulassen — sonst ist das Ziel ein Open Redirect. */
function safeNextPath(value: string | undefined): '/admin' | `/admin/${string}` {
  if (!value) return '/admin';
  if (!value.startsWith('/admin')) return '/admin';
  if (value.startsWith('//') || value.includes('\\')) return '/admin';
  if (value === '/admin/login' || value.startsWith('/admin/login?')) return '/admin';

  return value as '/admin' | `/admin/${string}`;
}

export async function loginAction(
  _previousState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const headerList = await headers();

  // CSRF: state-changing Aktion, also Origin gegen die erwartete Origin pruefen.
  const origin = verifyRequestOrigin(headerList, env.APP_ORIGIN);
  if (!origin.ok) {
    return { error: 'Anfrage abgelehnt. Lade die Seite neu und versuch es nochmal.' };
  }

  const parsed = loginInputSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  });

  if (!parsed.success) {
    return { error: 'Bitte E-Mail und Passwort eingeben.' };
  }

  const result = await attemptLogin({
    db,
    email: parsed.data.email,
    password: parsed.data.password,
    ip: clientIpFrom(headerList),
  });

  if (!result.ok) {
    // `result.message` ist bei falschen Zugangsdaten immer dieselbe Zeichenkette,
    // egal ob die Adresse unbekannt oder das Passwort falsch war.
    return { error: result.message };
  }

  const token = await signSessionToken({
    sub: result.user.id,
    tv: result.user.tokenVersion,
  });

  await setSessionCookie(token);

  // Wirft intern — muss deshalb ausserhalb von try/catch stehen.
  redirect(safeNextPath(parsed.data.next));
}
