import Image from 'next/image';
import Link from 'next/link';

import { SPECIES_DIFFICULTY_LABELS } from '@/lib/species/difficulty';
import type { PublicSpeciesListItem } from '@/lib/species/public-queries';

import { CoverPlaceholder } from './cover-placeholder';
import { ScientificName } from './scientific-name';

/**
 * Karte im Verzeichnis. Server Component — die einzige Bewegung ist ein
 * CSS-Hover und braucht kein JavaScript.
 *
 * Ein Link um die ganze Karte statt mehrerer nebeneinander: zwei Links auf dasselbe
 * Ziel sind fuer die Tastatur zwei Stationen ohne Mehrwert.
 */
export function SpeciesCard({ item }: { item: PublicSpeciesListItem }) {
  return (
    <Link href={`/arten/${item.slug}`} className="group block">
      <div className="relative aspect-[3/2] overflow-hidden rounded-card border border-line/50">
        {item.cover ? (
          <Image
            src={item.cover.url}
            alt={item.cover.alt}
            fill
            sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
            className={[
              'object-cover',
              // Zurueckhaltend: knapp zwei Prozent, langsam, und unter reduced motion
              // bleibt das Bild schlicht stehen.
              'transition-transform duration-300 ease-out group-hover:scale-[1.02]',
              'motion-reduce:transition-none motion-reduce:group-hover:scale-100',
            ].join(' ')}
          />
        ) : (
          <CoverPlaceholder />
        )}
      </div>

      <h2 className="mt-5 font-display text-heading text-canopy transition-colors duration-150 group-hover:text-fern">
        <ScientificName>{item.scientificName}</ScientificName>
      </h2>

      {item.commonName ? <p className="mt-1 text-body text-ink/80">{item.commonName}</p> : null}

      {item.difficulty ? (
        <p className="mt-3 font-mono text-label text-fern uppercase">
          {SPECIES_DIFFICULTY_LABELS[item.difficulty]}
        </p>
      ) : null}
    </Link>
  );
}
