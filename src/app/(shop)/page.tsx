import Link from 'next/link';

import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { Reveal } from '@/components/ui/reveal';
import { Section } from '@/components/ui/section';

/**
 * Landing-Route ohne Inhalt: hier steht das Design-System zur Ansicht, kein Storefront-Text.
 *
 * Hinweis zur Struktur: die oeffentliche Startseite liegt in der Route-Gruppe `(shop)`
 * und nicht als `app/page.tsx` — beides zusammen waeren zwei Dateien fuer dieselbe URL.
 */
export default function LandingPage() {
  return (
    <>
      <Section spacing="lg">
        <Container>
          <Reveal>
            <p className="font-mono text-label text-fern uppercase">Gottesanbeterinnen · Zucht</p>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="mt-4 max-w-[14ch] font-display text-display text-canopy">
              Hipp Hoppers
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="mt-6 max-w-[46ch] text-lead text-ink/80">
              Die Arten stehen. Alles andere wächst noch.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-8">
              <Link href="/arten" className={buttonClasses('secondary')}>
                Arten ansehen
              </Link>
            </div>
          </Reveal>
        </Container>
      </Section>

      <Section divided>
        <Container>
          <h2 className="font-display text-heading text-canopy">Typo-Skala</h2>

          <div className="mt-8 flex flex-col gap-6">
            <p className="font-display text-display text-ink">Display</p>
            <p className="font-display text-title text-ink">Title</p>
            <p className="font-display text-heading text-ink">Heading</p>
            <p className="text-subhead text-ink">Subhead</p>
            <p className="max-w-[60ch] text-lead text-ink/80">
              Lead — etwas groesser als der Fliesstext, gleiches Leading-Gefuehl.
            </p>
            <p className="max-w-[68ch] text-body text-ink">
              Body. Tracking liegt hier bei null, Leading bei 1.6. Mit wachsender Groesse wird das
              Tracking negativer und das Leading enger — Hierarchie entsteht aus Groesse, Gewicht
              und Leading zusammen, nicht aus der Groesse allein.
            </p>
            <p className="font-mono text-label text-fern uppercase">Label · Mono · 24–28 °C</p>
          </div>
        </Container>
      </Section>

      <Section divided>
        <Container>
          <h2 className="font-display text-heading text-canopy">Farb-Tokens</h2>

          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(
              [
                { token: 'paper', className: 'bg-paper' },
                { token: 'sand', className: 'bg-sand' },
                { token: 'canopy', className: 'bg-canopy' },
                { token: 'fern', className: 'bg-fern' },
                { token: 'bloom', className: 'bg-bloom' },
                { token: 'ink', className: 'bg-ink' },
                { token: 'line', className: 'bg-line' },
              ] as const
            ).map((swatch) => (
              <li key={swatch.token} className="flex flex-col gap-2">
                <div
                  className={`h-20 rounded-card border border-line/50 ${swatch.className}`}
                  aria-hidden="true"
                />
                <span className="font-mono text-label text-fern uppercase">{swatch.token}</span>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section divided spacing="sm">
        <Container>
          <Card className="max-w-prose">
            <h2 className="font-display text-subhead text-canopy">Card</h2>
            <p className="mt-3 text-body text-ink/80">
              Gedaempfte Flaeche auf `sand`, Rahmen dekorativ. Bedienelemente bekommen die volle
              Linienstaerke.
            </p>
          </Card>
        </Container>
      </Section>
    </>
  );
}
