import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/ui/container';

/**
 * Storefront-Huelle: Header, Inhaltsbereich, Footer. Die Navigation fuehrt genau
 * dorthin, wo es etwas zu sehen gibt — bislang das Artenverzeichnis.
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-field focus:bg-canopy focus:px-4 focus:py-2 focus:text-paper"
      >
        Zum Inhalt springen
      </a>

      <header className="border-b border-line/50">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="font-display text-subhead text-canopy">
            Hipp Hoppers
          </Link>

          <nav aria-label="Hauptnavigation">
            <Link
              href="/arten"
              className="font-mono text-label text-fern uppercase hover:text-canopy"
            >
              Arten
            </Link>
          </nav>
        </Container>
      </header>

      <main id="inhalt" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line/50">
        <Container className="flex h-16 items-center justify-between">
          <span className="font-mono text-label text-fern uppercase">Hipp Hoppers</span>
          <Link
            href="/admin"
            className="font-mono text-label text-fern uppercase hover:text-canopy"
          >
            Admin
          </Link>
        </Container>
      </footer>
    </div>
  );
}
