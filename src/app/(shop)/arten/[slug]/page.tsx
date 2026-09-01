import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { CareBlock } from '@/components/species/care-block';
import { DraftNotice } from '@/components/species/draft-notice';
import { ScientificName } from '@/components/species/scientific-name';
import { Container } from '@/components/ui/container';
import { Reveal } from '@/components/ui/reveal';
import { Section } from '@/components/ui/section';
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

          <Reveal className="mt-6">
            <h1 className="font-display text-title text-canopy">
              <ScientificName>{species.scientificName}</ScientificName>
            </h1>

            {species.commonName ? (
              <p className="mt-3 text-lead text-ink/80">{species.commonName}</p>
            ) : null}
          </Reveal>

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

          {paragraphs.length > 0 || facts.length > 0 ? (
            <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
              {/* Zeilenlaenge ueber `ch` begrenzt, nicht ueber die Spaltenbreite: das
                  Raster darf breiter werden, der Fliesstext soll es nicht. */}
              <div className="flex max-w-[70ch] flex-col gap-5">
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-body text-ink">
                    {paragraph}
                  </p>
                ))}
              </div>

              {facts.length > 0 ? <CareBlock facts={facts} /> : null}
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
