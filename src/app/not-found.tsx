import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import { Container } from '@/components/ui/container';

export default function NotFound() {
  return (
    <Container width="prose" className="flex min-h-dvh flex-col justify-center gap-6 py-24">
      <p className="font-mono text-label text-fern uppercase">404</p>

      <h1 className="font-display text-title text-canopy">Diese Seite gibt es nicht.</h1>

      <p className="text-lead text-ink/80">
        Der Link zeigt ins Leere — vertippt, oder die Seite ist weg.
      </p>

      <div>
        <Link href="/" className={buttonClasses('outline')}>
          Zur Startseite
        </Link>
      </div>
    </Container>
  );
}
