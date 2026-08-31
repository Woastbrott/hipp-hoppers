import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { getCurrentAdmin } from '@/lib/auth/current-admin';

import { logoutAction } from './actions';

/**
 * Das autoritative Auth-Gate.
 *
 * Arbeitsteilung mit `src/proxy.ts`: der Proxy prueft billig Signatur und Ablauf und
 * haelt offensichtlichen Muell fern, ohne die DB anzufassen. Hier faellt die
 * eigentliche Entscheidung — inklusive Abgleich der `token_version` gegen die Datenbank.
 * Ein Admin-Bereich, der nur im UI versteckt ist, ist kein Admin-Bereich.
 */
export default async function AdminDashboardLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect('/admin/login');
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line/50">
        <Container width="wide" className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-baseline gap-5">
            <Link href="/admin" className="font-display text-subhead text-canopy">
              Hipp Hoppers
            </Link>

            <nav aria-label="Admin-Navigation">
              <Link
                href="/admin/species"
                className="font-mono text-label text-fern uppercase hover:text-canopy"
              >
                Arten
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden font-mono text-label text-fern sm:inline">{admin.email}</span>

            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Abmelden
              </Button>
            </form>
          </div>
        </Container>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
