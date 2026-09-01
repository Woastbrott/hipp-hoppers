import type { Metadata } from 'next';

import { SpeciesCard } from '@/components/species/species-card';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { db } from '@/db';
import { listPublishedSpecies } from '@/lib/species/public-queries';

export const metadata: Metadata = {
  title: 'Arten',
  description:
    'Die Gottesanbeterinnen, die wir züchten — mit Temperatur, Luftfeuchte, Größe und Bildern.',
};

/**
 * Verzeichnis aller veroeffentlichten Arten.
 *
 * `listPublishedSpecies` filtert selbst — hier steht bewusst keine
 * Sichtbarkeitsbedingung, die man beim naechsten Handgriff vergessen koennte.
 */
export default async function SpeciesDirectoryPage() {
  const items = await listPublishedSpecies(db);

  return (
    <>
      <Section spacing="lg">
        <Container>
          {/* Ohne `Reveal`: die Komponente schreibt `opacity: 0` schon ins
              servergerenderte HTML und nimmt es erst per JavaScript zurueck. Auf einer
              Inhaltsseite hiesse das, dass die Ueberschrift ohne JS unsichtbar bleibt —
              und die Phase-0-Regel sagt im Zweifel weglassen. */}
          <p className="font-mono text-label text-fern uppercase">Verzeichnis</p>

          <h1 className="mt-4 font-display text-display text-canopy">Arten</h1>

          <p className="mt-6 max-w-[52ch] text-lead text-ink/80">
            Was bei uns schlüpft, wächst und irgendwann umzieht. Zu jeder Art steht da, was sie zum
            Leben braucht — Klima, Größe, Anspruch.
          </p>
        </Container>
      </Section>

      <Section divided>
        <Container>
          {items.length === 0 ? (
            <Card className="max-w-[54ch]">
              <h2 className="font-display text-heading text-canopy">Noch nichts veröffentlicht</h2>
              <p className="mt-3 text-body text-ink/80">
                Hier stehen bald die Arten, die wir wirklich züchten. Solange keine davon ordentlich
                beschrieben ist, bleibt die Seite lieber leer als voll mit Platzhaltern.
              </p>
            </Card>
          ) : (
            <ul className="grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <li key={item.slug}>
                  <SpeciesCard item={item} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </Section>
    </>
  );
}
