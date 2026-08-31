import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { getCurrentAdmin } from '@/lib/auth/current-admin';

/**
 * Admin-Startseite. Phase 0: Huelle hinter dem Gate, kein CRUD.
 *
 * `getCurrentAdmin()` ist mit `cache()` dedupliziert — dieser zweite Aufruf kostet
 * keinen weiteren Query, obwohl das Layout schon gefragt hat.
 */
export default async function AdminHomePage() {
  const admin = await getCurrentAdmin();

  return (
    <Section spacing="md">
      <Container width="wide">
        <h1 className="font-display text-title text-canopy">Admin</h1>

        <p className="mt-4 max-w-[52ch] text-lead text-ink/80">
          Arten lassen sich anlegen und pflegen. Produkte und Bilder folgen.
        </p>

        <div className="mt-8">
          <Link href="/admin/species" className={buttonClasses('primary')}>
            Arten verwalten
          </Link>
        </div>

        <Card className="mt-10 max-w-prose">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-label text-fern uppercase">Angemeldet als</dt>
              <dd className="mt-1 font-mono text-caption text-ink">{admin?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-mono text-label text-fern uppercase">Session</dt>
              <dd className="mt-1 font-mono text-caption text-ink">JWT · httpOnly · 8 h</dd>
            </div>
          </dl>
        </Card>
      </Container>
    </Section>
  );
}
