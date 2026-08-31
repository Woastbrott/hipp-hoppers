import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { SubmitButton } from '@/components/ui/submit-button';
import { db } from '@/db';
import { SPECIES_DIFFICULTY_LABELS } from '@/lib/species/difficulty';
import { listSpecies } from '@/lib/species/queries';

import { toggleSpeciesPublishedAction } from './actions';

export const metadata: Metadata = {
  title: 'Arten',
  robots: { index: false, follow: false },
};

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
});

export default async function SpeciesListPage() {
  const items = await listSpecies(db);

  return (
    <Section spacing="md">
      <Container width="wide">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-label text-fern uppercase">Admin</p>
            <h1 className="mt-2 font-display text-title text-canopy">Arten</h1>
          </div>

          <Link href="/admin/species/new" className={buttonClasses('primary')}>
            Neue Art
          </Link>
        </div>

        {items.length === 0 ? (
          <Card className="mt-10 flex flex-col items-start gap-4">
            <h2 className="font-display text-subhead text-canopy">Noch keine Art angelegt</h2>
            <p className="max-w-[46ch] text-body text-ink/80">
              Arten sind die Wurzel: Produkte und Bilder hängen später an ihnen. Fang mit einer an,
              die du wirklich züchtest.
            </p>
            <Link href="/admin/species/new" className={buttonClasses('primary')}>
              Erste Art anlegen
            </Link>
          </Card>
        ) : (
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <caption className="sr-only">Alle angelegten Arten</caption>

              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="pb-3 font-mono text-label text-fern uppercase">
                    Art
                  </th>
                  <th scope="col" className="pb-3 font-mono text-label text-fern uppercase">
                    Slug
                  </th>
                  <th scope="col" className="pb-3 font-mono text-label text-fern uppercase">
                    Schwierigkeit
                  </th>
                  <th scope="col" className="pb-3 font-mono text-label text-fern uppercase">
                    Status
                  </th>
                  <th scope="col" className="pb-3 font-mono text-label text-fern uppercase">
                    Geändert
                  </th>
                  <th
                    scope="col"
                    className="pb-3 text-right font-mono text-label text-fern uppercase"
                  >
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line/50">
                    <td className="py-4 pr-4">
                      <Link
                        href={`/admin/species/${item.id}`}
                        className="font-display text-subhead text-canopy hover:text-fern"
                      >
                        {item.scientificName}
                      </Link>
                      {item.commonName ? (
                        <span className="block text-caption text-fern">{item.commonName}</span>
                      ) : null}
                    </td>

                    <td className="py-4 pr-4 font-mono text-caption text-ink/80">{item.slug}</td>

                    <td className="py-4 pr-4 text-caption text-ink/80">
                      {item.difficulty ? SPECIES_DIFFICULTY_LABELS[item.difficulty] : '—'}
                    </td>

                    <td className="py-4 pr-4">
                      <Badge tone={item.published ? 'published' : 'draft'}>
                        {item.published ? 'Veröffentlicht' : 'Entwurf'}
                      </Badge>
                    </td>

                    <td className="py-4 pr-4 font-mono text-caption text-fern">
                      {dateFormat.format(item.updatedAt)}
                    </td>

                    <td className="py-4">
                      <div className="flex items-center justify-end gap-3">
                        {/* Einzelner Button, kein eigener State: funktioniert auch ohne
                            JavaScript. SubmitButton liest den Pending-Zustand aus dem
                            Formular und sperrt sich waehrenddessen gegen Doppelklicks. */}
                        <form
                          action={toggleSpeciesPublishedAction.bind(null, item.id, !item.published)}
                        >
                          <SubmitButton variant="ghost" size="sm" pendingLabel="Moment …">
                            {item.published ? 'Auf Entwurf' : 'Veröffentlichen'}
                          </SubmitButton>
                        </form>

                        <Link
                          href={`/admin/species/${item.id}`}
                          className={buttonClasses('outline', 'sm')}
                        >
                          Bearbeiten
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Container>
    </Section>
  );
}
