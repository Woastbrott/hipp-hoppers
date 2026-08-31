import 'server-only';

import { z } from 'zod';

import { db } from '@/db';
import { requireAdmin } from '@/lib/auth/require-admin';
import { findSpeciesById } from '@/lib/species/queries';

import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  speciesBlobPrefix,
} from './upload-contract';

/**
 * Der Sicherheitspunkt des Client-Uploads.
 *
 * Der Browser laedt direkt in den Store — an dieser Stelle wird entschieden, ob er
 * dafuer ein Token bekommt und was er damit darf. Danach kann niemand mehr eingreifen,
 * also gehoert alles hierher: Session, Zielpfad, Dateityp, Groesse.
 *
 * Bewusst als Rueckgabewert statt als Exception, damit die Route den Status-Code
 * daraus ableiten kann und die Logik ohne Next-Request testbar bleibt.
 */

export type UploadTokenDenial =
  'unauthorized' | 'invalid_payload' | 'unknown_species' | 'foreign_pathname';

export type UploadTokenOptions = {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
  addRandomSuffix: true;
  tokenPayload: string;
};

export type UploadTokenResult =
  | { ok: true; options: UploadTokenOptions }
  | { ok: false; reason: UploadTokenDenial; message: string };

const clientPayloadSchema = z.object({ speciesId: z.uuid() });

function parseClientPayload(raw: string | null): { speciesId: string } | null {
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    const result = clientPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    // Kaputtes JSON ist keine gueltige Anfrage — mehr muss man dazu nicht wissen.
    return null;
  }
}

export async function resolveUploadTokenOptions(
  pathname: string,
  clientPayload: string | null,
): Promise<UploadTokenResult> {
  // Zuerst, immer: diese Route stellt Schreibrechte auf den Store aus.
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { ok: false, reason: 'unauthorized', message: guard.error };
  }

  const payload = parseClientPayload(clientPayload);
  if (!payload) {
    return { ok: false, reason: 'invalid_payload', message: 'Ungültige Upload-Anfrage.' };
  }

  const target = await findSpeciesById(db, payload.speciesId);
  if (!target) {
    return { ok: false, reason: 'unknown_species', message: 'Diese Art gibt es nicht.' };
  }

  const prefix = speciesBlobPrefix(payload.speciesId);
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;

  // Genau eine Ebene unter dem Prefix — kein Ausbrechen, kein Unterordner.
  if (rest === null || rest.length === 0 || rest.includes('/')) {
    return {
      ok: false,
      reason: 'foreign_pathname',
      message: 'Zielpfad gehört nicht zu dieser Art.',
    };
  }

  return {
    ok: true,
    options: {
      allowedContentTypes: [...ALLOWED_IMAGE_CONTENT_TYPES],
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
      // Gegen Kollisionen: zwei "bild.jpg" derselben Art ueberschreiben sich sonst.
      addRandomSuffix: true,
      tokenPayload: JSON.stringify({ speciesId: payload.speciesId }),
    },
  };
}
