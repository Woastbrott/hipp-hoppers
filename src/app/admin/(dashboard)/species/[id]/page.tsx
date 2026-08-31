import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { db } from '@/db';
import { listSpeciesMedia } from '@/lib/media/queries';
import { countProductsForSpecies, findSpeciesById } from '@/lib/species/queries';
import { speciesToFormFields } from '@/lib/species/form-fields';

import { deleteSpeciesAction, updateSpeciesAction } from '../actions';
import { DeleteSpecies } from '../delete-species';
import { MediaList } from '../media-list';
import { MediaUploader } from '../media-uploader';
import { SpeciesForm } from '../species-form';

export const metadata: Metadata = {
  title: 'Art bearbeiten',
  robots: { index: false, follow: false },
};

/** `params` ist eine externe Grenze — also geparst, nicht geglaubt. */
const paramsSchema = z.object({ id: z.uuid() });

export default async function EditSpeciesPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = paramsSchema.safeParse(await params);

  // Kein gueltiges UUID-Format: gar nicht erst fragen.
  if (!parsed.success) {
    notFound();
  }

  const row = await findSpeciesById(db, parsed.data.id);

  if (!row) {
    notFound();
  }

  const productCount = await countProductsForSpecies(db, row.id);
  const mediaItems = await listSpeciesMedia(db, row.id);

  // Binden passiert hier, im Server Component — Next verschluesselt den gebundenen Wert,
  // er ist damit nicht aus dem Client heraus austauschbar.
  const updateAction = updateSpeciesAction.bind(null, row.id);
  const deleteAction = deleteSpeciesAction.bind(null, row.id);

  return (
    <Section spacing="md">
      <Container width="default">
        <Link
          href="/admin/species"
          className="font-mono text-label text-fern uppercase hover:text-canopy"
        >
          ← Arten
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <h1 className="font-display text-title text-canopy">{row.scientificName}</h1>
          <Badge tone={row.published ? 'published' : 'draft'}>
            {row.published ? 'Veröffentlicht' : 'Entwurf'}
          </Badge>
        </div>

        <div className="mt-10">
          <SpeciesForm
            action={updateAction}
            defaults={speciesToFormFields(row)}
            submitLabel="Speichern"
            mode="edit"
          />
        </div>

        <section aria-labelledby="bilder" className="mt-14 flex flex-col gap-6">
          <h2 id="bilder" className="font-display text-heading text-canopy">
            Bilder
          </h2>

          <MediaUploader speciesId={row.id} />
          <MediaList items={mediaItems} />
        </section>

        <Card className="mt-14 flex flex-col gap-4 border-bloom/40">
          <div>
            <h2 className="font-display text-subhead text-canopy">Löschen</h2>
            <p className="mt-2 max-w-[52ch] text-body text-ink/80">
              {productCount === 0
                ? 'An dieser Art hängen keine Produkte. Löschen ist endgültig.'
                : `An dieser Art ${productCount === 1 ? 'hängt 1 Produkt' : `hängen ${productCount} Produkte`}. Löschen wird abgelehnt, solange das so ist.`}
            </p>
          </div>

          <DeleteSpecies action={deleteAction} scientificName={row.scientificName} />
        </Card>
      </Container>
    </Section>
  );
}
