import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { EMPTY_SPECIES_FORM_FIELDS } from '@/lib/species/form-fields';

import { createSpeciesAction } from '../actions';
import { SpeciesForm } from '../species-form';

export const metadata: Metadata = {
  title: 'Neue Art',
  robots: { index: false, follow: false },
};

export default function NewSpeciesPage() {
  return (
    <Section spacing="md">
      <Container width="default">
        <Link
          href="/admin/species"
          className="font-mono text-label text-fern uppercase hover:text-canopy"
        >
          ← Arten
        </Link>

        <h1 className="mt-3 font-display text-title text-canopy">Neue Art</h1>

        <div className="mt-10">
          <SpeciesForm
            action={createSpeciesAction}
            defaults={EMPTY_SPECIES_FORM_FIELDS}
            submitLabel="Anlegen"
            mode="create"
          />
        </div>
      </Container>
    </Section>
  );
}
