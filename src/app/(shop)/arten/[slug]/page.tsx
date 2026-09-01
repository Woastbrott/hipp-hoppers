import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { CareBlock } from '@/components/species/care-block';
import { DraftNotice } from '@/components/species/draft-notice';
import { ScientificName } from '@/components/species/scientific-name';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { cn } from '@/lib/cn';
import { buildCareFacts } from '@/lib/species/care';
import { speciesMetaDescription, speciesMetaTitle } from '@/lib/species/meta';
import { loadPublicSpecies, resolvePublicSpecies } from '@/lib/species/public-page';
import { toParagraphs } from '@/lib/text';

type SpeciesPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: SpeciesPageProps): Promise<Metadata> {
  const { slug } = await params;
  const species = await resolvePublicSpecies(slug);

  // Kein 404 aus den Metadaten heraus: das entscheidet die Seite, hier reicht ein
  // neutraler Titel fuer den Fall, dass sie gleich `notFound()` ruft.
  if (!species) {
    return { title: 'Art nicht gefunden' };
  }

  return {
    title: speciesMetaTitle(species),
    description: speciesMetaDescription(species),
  };
}

export default async function SpeciesDetailPage({ params }: SpeciesPageProps) {
  const { slug } = await params;
  const species = await loadPublicSpecies(slug);

  const [cover, ...gallery] = species.images;
  const facts = buildCareFacts(species);
  const paragraphs = toParagraphs(species.description);

  const hasProse = paragraphs.length > 0;
  const hasCare = facts.length > 0;

  return (
    <>
      {species.published ? null : <DraftNotice speciesId={species.id} />}

      <Section spacing="md">
        <Container>
          <Link
            href="/arten"
            className="font-mono text-label text-fern uppercase hover:text-canopy"
          >
            ← Alle Arten
          </Link>

          {/* Kein `Reveal`: die Komponente setzt `opacity: 0` bereits im
              servergerenderten HTML und holt es erst per JavaScript zurueck. Der
              Artname waere ohne JS unsichtbar — dafuer ist ein Auftritt zu wenig wert. */}
          <h1 className="mt-6 font-display text-title text-canopy">
            <ScientificName>{species.scientificName}</ScientificName>
          </h1>

          {species.commonName ? (
            <p className="mt-3 text-lead text-ink/80">{species.commonName}</p>
          ) : null}

          {cover ? (
            <figure className="mt-10">
              {/* Eigene Abmessungen statt festem Rahmen: das Titelbild wird nicht
                  beschnitten. `priority`, weil es das groesste sichtbare Element
                  ueber der Falz ist. */}
              <Image
                src={cover.url}
                alt={cover.alt}
                width={cover.width}
                height={cover.height}
                sizes="(min-width: 1200px) 1088px, 100vw"
                priority
                className="h-auto w-full rounded-card border border-line/50 bg-sand"
              />
            </figure>
          ) : null}

          {hasProse || hasCare ? (
            <div
              className={cn(
                'mt-14 grid gap-12',
                // Zwei Spalten nur, wenn beide auch etwas zu zeigen haben. Sonst
                // stuende der Care-Block neben einer leeren Flaeche.
                hasProse && hasCare && 'lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16',
              )}
            >
              {hasProse ? (
                /* Dieselbe Breite wie `Container width="prose"`: gemessen rund 74
                   Zeichen pro Zeile. `ch` waere die naheliegende Einheit, misst aber
                   die Null — in Inter gut zwei Pixel breiter als der Durchschnitts-
                   buchstabe, was bei 70ch auf 86 Zeichen hinauslief. */
                <div className="flex max-w-[38rem] flex-col gap-5">
                  {paragraphs.map((paragraph, index) => (
                    <p key={index} className="text-body text-ink">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : null}

              {hasCare ? <CareBlock facts={facts} className={hasProse ? '' : 'max-w-sm'} /> : null}
            </div>
          ) : null}

          {gallery.length > 0 ? (
            <section aria-labelledby="galerie" className="mt-16">
              <h2 id="galerie" className="font-mono text-label text-fern uppercase">
                Weitere Bilder
              </h2>

              <ul className="mt-6 grid gap-6 sm:grid-cols-2">
                {gallery.map((image) => (
                  <li key={image.id}>
                    <div className="relative aspect-[3/2] overflow-hidden rounded-card border border-line/50 bg-sand">
                      <Image
                        src={image.url}
                        alt={image.alt}
                        fill
                        sizes="(min-width: 640px) 33rem, 92vw"
                        className="object-cover"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </Container>
      </Section>
    </>
  );
}
