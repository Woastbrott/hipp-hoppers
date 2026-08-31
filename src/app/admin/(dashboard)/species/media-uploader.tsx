'use client';

import { upload } from '@vercel/blob/client';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  buildSpeciesBlobPathname,
  isAllowedImageContentType,
  MAX_UPLOAD_BYTES,
} from '@/lib/blob/upload-contract';

import { persistSpeciesMediaAction } from './actions';

/**
 * Client-Upload direkt in den Blob Store.
 *
 * Nicht ueber eine Server Action: Vercel kappt Request-Bodies bei rund 4,5 MB, ein
 * Foto liegt schnell darueber. Der Browser holt sich stattdessen ein kurzlebiges
 * Token von `/api/admin/media/upload` und laedt selbst hoch.
 *
 * Diese Insel braucht zwangslaeufig JavaScript — ohne laesst sich kein Client-Upload
 * bauen. Alles andere in der Bildverwaltung funktioniert weiter ohne.
 */

type Status = 'wartet' | 'laedt' | 'speichert' | 'fertig' | 'fehler';

type Pending = {
  key: string;
  file: File;
  alt: string;
  progress: number;
  status: Status;
  error: string | null;
};

const STATUS_LABEL: Record<Status, string> = {
  wartet: 'Bereit',
  laedt: 'Lädt hoch',
  speichert: 'Speichert',
  fertig: 'Fertig',
  fehler: 'Fehler',
};

/** Masse fuer next/image — verhindert das Springen des Layouts beim Laden. */
async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  } catch {
    // Aeltere Browser koennen createImageBitmap nicht fuer jedes Format.
    return await new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new window.Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Bildmaße nicht lesbar.'));
      };

      image.src = objectUrl;
    });
  }
}

function describeSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaUploader({ speciesId }: { speciesId: string }) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);

  function update(key: string, patch: Partial<Pending>) {
    setPending((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)),
    );
  }

  function handleSelection(files: FileList | null) {
    if (!files) return;

    const added: Pending[] = [...files].map((file, index) => ({
      key: `${String(Date.now())}-${String(index)}-${file.name}`,
      file,
      alt: '',
      progress: 0,
      // Client-seitige Pruefung ist Komfort — verbindlich entscheidet die Token-Route.
      status: 'wartet',
      error: !isAllowedImageContentType(file.type)
        ? 'Format nicht unterstützt (JPEG, PNG, WebP, AVIF).'
        : file.size > MAX_UPLOAD_BYTES
          ? `Zu groß (${describeSize(file.size)}, erlaubt sind ${describeSize(MAX_UPLOAD_BYTES)}).`
          : null,
    }));

    setPending((current) => [...current, ...added]);

    // Damit dieselbe Datei erneut ausgewaehlt werden kann.
    if (inputRef.current) inputRef.current.value = '';
  }

  async function uploadOne(entry: Pending): Promise<boolean> {
    update(entry.key, { status: 'laedt', progress: 0, error: null });

    try {
      const blob = await upload(buildSpeciesBlobPathname(speciesId, entry.file.name), entry.file, {
        access: 'public',
        handleUploadUrl: '/api/admin/media/upload',
        clientPayload: JSON.stringify({ speciesId }),
        contentType: entry.file.type,
        onUploadProgress: ({ percentage }) => {
          update(entry.key, { progress: Math.round(percentage) });
        },
      });

      update(entry.key, { status: 'speichert', progress: 100 });

      const size = await readImageSize(entry.file);

      const result = await persistSpeciesMediaAction({
        speciesId,
        url: blob.url,
        alt: entry.alt,
        width: size.width,
        height: size.height,
        contentType: entry.file.type,
      });

      if (!result.ok) {
        update(entry.key, { status: 'fehler', error: result.error });
        return false;
      }

      update(entry.key, { status: 'fertig' });
      return true;
    } catch (error: unknown) {
      update(entry.key, {
        status: 'fehler',
        error: error instanceof Error ? error.message : 'Upload fehlgeschlagen.',
      });
      return false;
    }
  }

  async function handleUploadAll() {
    setBusy(true);

    try {
      // Nacheinander statt parallel: der Fortschritt bleibt lesbar, und die
      // Position in der Galerie folgt der Reihenfolge in der Liste.
      let succeeded = false;

      for (const entry of pending) {
        if (entry.status === 'fertig') continue;
        if (entry.alt.trim().length === 0) {
          update(entry.key, { status: 'fehler', error: 'Alt-Text fehlt.' });
          continue;
        }
        if (entry.error !== null && entry.status === 'wartet') continue;

        const ok = await uploadOne(entry);
        succeeded ||= ok;
      }

      if (succeeded) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const uploadable = pending.filter((entry) => entry.status !== 'fertig');

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-subhead text-canopy">Bilder hochladen</h2>
        <p className="mt-2 max-w-[56ch] text-caption text-fern">
          JPEG, PNG, WebP oder AVIF, bis {describeSize(MAX_UPLOAD_BYTES)} pro Datei. Der Alt-Text
          ist Pflicht — er beschreibt das Bild für alle, die es nicht sehen.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="font-mono text-label text-fern uppercase">
          Dateien auswählen
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ALLOWED_IMAGE_CONTENT_TYPES.join(',')}
          disabled={busy}
          onChange={(event) => {
            handleSelection(event.target.files);
          }}
          className="text-caption text-ink file:mr-4 file:rounded-field file:border file:border-line file:bg-sand file:px-4 file:py-2 file:font-sans file:text-caption file:text-ink hover:file:bg-paper"
        />
      </div>

      {pending.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {pending.map((entry) => (
            <li key={entry.key} className="flex flex-col gap-2 border-t border-line/50 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-caption text-ink">{entry.file.name}</span>
                <span className="font-mono text-label text-fern uppercase">
                  {STATUS_LABEL[entry.status]}
                  {entry.status === 'laedt' ? ` ${String(entry.progress)} %` : ''}
                </span>
              </div>

              {entry.status === 'laedt' ? (
                <div
                  role="progressbar"
                  aria-label={`Upload ${entry.file.name}`}
                  aria-valuenow={entry.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1 w-full overflow-hidden rounded-full bg-line/40"
                >
                  <div
                    className="h-full bg-canopy transition-[width] duration-150 ease-out"
                    style={{ width: `${String(entry.progress)}%` }}
                  />
                </div>
              ) : null}

              {entry.status === 'fertig' ? null : (
                <Input
                  id={`alt-${entry.key}`}
                  name={`alt-${entry.key}`}
                  label="Alt-Text"
                  value={entry.alt}
                  onChange={(event) => {
                    update(entry.key, { alt: event.target.value, error: null });
                  }}
                  error={entry.error ?? undefined}
                  disabled={busy}
                  maxLength={300}
                  required
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-4">
        <Button
          type="button"
          onClick={() => {
            void handleUploadAll();
          }}
          disabled={busy || uploadable.length === 0}
          aria-busy={busy}
        >
          {busy ? 'Lädt hoch …' : 'Hochladen'}
        </Button>

        {pending.length > 0 && !busy ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPending([]);
            }}
          >
            Liste leeren
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
