'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/ui/reveal';

import { initialSpeciesDeleteState, type SpeciesDeleteState } from './state';

export type DeleteSpeciesProps = {
  action: (previous: SpeciesDeleteState, formData: FormData) => Promise<SpeciesDeleteState>;
  scientificName: string;
};

/**
 * Zweistufig statt `window.confirm`: bleibt im Design, ist tastaturbedienbar und
 * lesbar fuer Screenreader. Die Bestaetigung im UI ersetzt die serverseitige Pruefung
 * nicht — die steht in der Action.
 */
export function DeleteSpecies({ action, scientificName }: DeleteSpeciesProps) {
  const [state, formAction, isPending] = useActionState(action, initialSpeciesDeleteState);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {state.error ? (
        <div role="alert" aria-live="assertive">
          <Reveal key={state.error}>
            <p className="rounded-field border border-bloom px-4 py-3 text-caption text-bloom">
              {state.error}
            </p>
          </Reveal>
        </div>
      ) : null}

      {confirming ? (
        <form action={formAction} className="flex flex-wrap items-center gap-4">
          <p className="text-caption text-ink">
            <span className="font-mono">{scientificName}</span> wirklich löschen? Das lässt sich
            nicht rückgängig machen.
          </p>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>
              {isPending ? 'Löscht …' : 'Ja, löschen'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirming(false);
              }}
              disabled={isPending}
            >
              Abbrechen
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirming(true);
            }}
          >
            Art löschen
          </Button>
        </div>
      )}
    </div>
  );
}
