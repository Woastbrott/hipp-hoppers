import { z } from 'zod';

import { ALLOWED_IMAGE_CONTENT_TYPES, isSpeciesBlobUrl } from '@/lib/blob/upload-contract';

/**
 * Grenze zwischen Upload-Client und Datenbank.
 *
 * Der Client meldet nach dem Upload, was er hochgeladen hat. Geglaubt wird davon
 * nichts: die URL muss auf unserem Blob-Host und unter dem Prefix der Art liegen,
 * der Alt-Text ist Pflicht, und die Masse muessen plausible Ganzzahlen sein.
 */

export const ALT_MAX_LENGTH = 300;

/** Grosszuegig, aber endlich: darueber ist es kein Foto mehr, sondern ein Tippfehler. */
const MAX_IMAGE_EDGE_PIXELS = 20_000;

const altInput = z
  .union([z.string(), z.null()])
  .transform((value) => (value ?? '').trim())
  .pipe(
    z
      .string()
      .min(1, {
        error: 'Alt-Text ist Pflicht — er beschreibt das Bild für alle, die es nicht sehen.',
      })
      .max(ALT_MAX_LENGTH, { error: `Alt-Text: höchstens ${ALT_MAX_LENGTH} Zeichen.` }),
  );

const pixelDimension = (label: string) =>
  z
    .int({ error: `${label} muss eine ganze Zahl sein.` })
    .min(1, { error: `${label} muss größer als 0 sein.` })
    .max(MAX_IMAGE_EDGE_PIXELS, { error: `${label}: höchstens ${MAX_IMAGE_EDGE_PIXELS} Pixel.` });

export const mediaPersistSchema = z
  .object({
    speciesId: z.uuid({ error: 'Unbekannte Art.' }),
    url: z.url({ error: 'Keine gültige URL.' }),
    alt: altInput,
    /**
     * Vom Client gemessen. Bewusst: die Werte sind Layout-Daten fuer next/image und
     * verhindern Umbrueche beim Laden — sie entscheiden nichts ueber Zugriff oder
     * Inhalt. Serverseitig zu messen hiesse, jedes Bild noch einmal herunterzuladen.
     * Geprueft wird deshalb nur auf Plausibilitaet.
     */
    width: pixelDimension('Breite'),
    height: pixelDimension('Höhe'),
    contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES, {
      error: 'Dieses Dateiformat wird nicht unterstützt.',
    }),
  })
  .superRefine((data, ctx) => {
    if (!isSpeciesBlobUrl(data.url, data.speciesId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'Diese URL gehört nicht zu dieser Art.',
      });
    }
  });

export type MediaPersistInput = z.output<typeof mediaPersistSchema>;

export const MEDIA_MOVE_DIRECTIONS = ['up', 'down'] as const;
export type MediaMoveDirection = (typeof MEDIA_MOVE_DIRECTIONS)[number];

export const mediaMoveDirectionSchema = z.enum(MEDIA_MOVE_DIRECTIONS);

export const mediaAltSchema = z.object({ alt: altInput });

export type MediaParseResult<T> = { ok: true; values: T } | { ok: false; error: string };

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? 'Eingabe ungültig.';
}

/** Fuer die Persist-Action: Eingabe kommt als Objekt aus Client-JavaScript. */
export function parseMediaPersist(input: unknown): MediaParseResult<MediaPersistInput> {
  const result = mediaPersistSchema.safeParse(input);

  return result.success
    ? { ok: true, values: result.data }
    : { ok: false, error: firstIssue(result.error) };
}

/** Fuer die Inline-Bearbeitung: Eingabe kommt aus einem Formular. */
export function parseMediaAlt(
  source: FormData | Record<string, unknown>,
): MediaParseResult<string> {
  const raw = source instanceof FormData ? { alt: source.get('alt') } : source;
  const result = mediaAltSchema.safeParse(raw);

  return result.success
    ? { ok: true, values: result.data.alt }
    : { ok: false, error: firstIssue(result.error) };
}
