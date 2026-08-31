'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';

import { initialMediaActionState, type MediaActionState } from './state';

/** Actions mit Rueckmeldung ans Formular (useActionState). */
type StatefulAction = (previous: MediaActionState, formData: FormData) => Promise<MediaActionState>;

/** Actions ohne Rueckmeldung — ein Knopf, ein Effekt, danach neu gerendert. */
type PlainAction = (formData: FormData) => void | Promise<void>;

export type MediaControlsProps = {
  mediaId: string;
  alt: string;
  isFirst: boolean;
  isLast: boolean;
  updateAltAction: StatefulAction;
  deleteAction: StatefulAction;
  moveUpAction: PlainAction;
  moveDownAction: PlainAction;
};

/**
 * Die Bedienelemente einer Bildkachel.
 *
 * Vier kleine Formulare statt einem grossen: jedes schickt genau seine Aktion ab und
 * traegt seinen eigenen Pending-Zustand. Ohne JavaScript bleiben sie normale
 * Formulare — nur die Fehlermeldungen kaemen dann per Seitenwechsel.
 */
export function MediaControls({
  mediaId,
  alt,
  isFirst,
  isLast,
  updateAltAction,
  deleteAction,
  moveUpAction,
  moveDownAction,
}: MediaControlsProps) {
  const [altState, altFormAction, altPending] = useActionState(
    updateAltAction,
    initialMediaActionState,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteAction,
    initialMediaActionState,
  );

  const [confirming, setConfirming] = useState(false);

  const altFieldId = `media-alt-${mediaId}`;

  return (
    <div className="flex flex-col gap-3">
      <form action={altFormAction} className="flex flex-col gap-2">
        <Input
          id={altFieldId}
          name="alt"
          label="Alt-Text"
          defaultValue={alt}
          error={altState.error ?? undefined}
          disabled={altPending}
          maxLength={300}
          required
        />

        <div>
          <SubmitButton variant="outline" size="sm" pendingLabel="Speichert …">
            Alt-Text speichern
          </SubmitButton>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {/* Reihenfolge per Knopf statt Drag & Drop: mit der Tastatur bedienbar,
            ohne Bibliothek, und der Zustand liegt nach jedem Klick in der DB. */}
        <form action={moveUpAction}>
          <SubmitButton variant="ghost" size="sm" disabled={isFirst}>
            <span aria-hidden="true">↑</span>
            <span className="sr-only">Nach vorne schieben</span>
          </SubmitButton>
        </form>

        <form action={moveDownAction}>
          <SubmitButton variant="ghost" size="sm" disabled={isLast}>
            <span aria-hidden="true">↓</span>
            <span className="sr-only">Nach hinten schieben</span>
          </SubmitButton>
        </form>

        {confirming ? (
          <form action={deleteFormAction} className="flex items-center gap-2">
            <span className="text-caption text-ink">Wirklich löschen?</span>
            <SubmitButton variant="primary" size="sm" pendingLabel="Löscht …">
              Ja
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deletePending}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Abbrechen
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setConfirming(true);
            }}
          >
            Löschen
          </Button>
        )}
      </div>

      {deleteState.error ? (
        <p role="alert" className="text-caption text-bloom">
          {deleteState.error}
        </p>
      ) : null}
    </div>
  );
}
