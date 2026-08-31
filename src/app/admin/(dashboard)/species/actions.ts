'use server';

import { del, head } from '@vercel/blob';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import { requireAdmin } from '@/lib/auth/require-admin';
import { deleteMedia, insertSpeciesMedia, moveMedia, updateMediaAlt } from '@/lib/media/queries';
import { env } from '@/lib/env';
import {
  createSpecies,
  deleteSpecies,
  setSpeciesPublished,
  updateSpecies,
} from '@/lib/species/queries';
import { mediaMoveDirectionSchema, parseMediaAlt, parseMediaPersist } from '@/lib/validation/media';
import {
  parseSpeciesForm,
  SPECIES_FIELD_NAMES,
  type SpeciesFieldName,
} from '@/lib/validation/species';

import {
  SLUG_TAKEN_ERROR,
  type MediaActionState,
  type MediaPersistResult,
  type SpeciesDeleteState,
  type SpeciesFormFields,
  type SpeciesFormState,
} from './state';

const LIST_PATH = '/admin/species';

/** Rohwerte fuer die Ruecknahme ins Formular. Nur bekannte Felder, keine Fremdkeys. */
function rawFields(formData: FormData): SpeciesFormFields {
  const values = {} as SpeciesFormFields;

  for (const name of SPECIES_FIELD_NAMES) {
    const value = formData.get(name);
    values[name] = typeof value === 'string' ? value : '';
  }

  return values;
}

function failure(
  formData: FormData,
  previous: SpeciesFormState,
  formError: string | null,
  fieldErrors: Partial<Record<SpeciesFieldName, string>> = {},
): SpeciesFormState {
  return {
    status: 'error',
    formError,
    fieldErrors,
    values: rawFields(formData),
    attempt: previous.attempt + 1,
  };
}

export async function createSpeciesAction(
  previous: SpeciesFormState,
  formData: FormData,
): Promise<SpeciesFormState> {
  // Erste Zeile, immer: Server Actions sind eigene Endpoints und direkt aufrufbar.
  const guard = await requireAdmin();
  if (!guard.ok) {
    return failure(formData, previous, guard.error);
  }

  const parsed = parseSpeciesForm(formData);
  if (!parsed.ok) {
    return failure(formData, previous, parsed.formError, parsed.fieldErrors);
  }

  const result = await createSpecies(db, parsed.values);

  if (!result.ok) {
    if (result.reason === 'slug_taken') {
      return failure(formData, previous, null, { slug: SLUG_TAKEN_ERROR });
    }

    return failure(formData, previous, 'Anlegen fehlgeschlagen. Versuch es nochmal.');
  }

  revalidatePath(LIST_PATH);

  // Wirft intern — muss ausserhalb von try/catch stehen.
  redirect(`${LIST_PATH}/${result.id}`);
}

export async function updateSpeciesAction(
  id: string,
  previous: SpeciesFormState,
  formData: FormData,
): Promise<SpeciesFormState> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return failure(formData, previous, guard.error);
  }

  const parsed = parseSpeciesForm(formData);
  if (!parsed.ok) {
    return failure(formData, previous, parsed.formError, parsed.fieldErrors);
  }

  const result = await updateSpecies(db, id, parsed.values);

  if (!result.ok) {
    if (result.reason === 'slug_taken') {
      return failure(formData, previous, null, { slug: SLUG_TAKEN_ERROR });
    }

    return failure(formData, previous, 'Diese Art gibt es nicht mehr.');
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);

  return {
    status: 'saved',
    formError: null,
    fieldErrors: {},
    values: null,
    attempt: previous.attempt + 1,
  };
}

export async function deleteSpeciesAction(
  id: string,
  _previous: SpeciesDeleteState,
  _formData: FormData,
): Promise<SpeciesDeleteState> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { error: guard.error };
  }

  const result = await deleteSpecies(db, id);

  if (!result.ok) {
    if (result.reason === 'has_products') {
      const noun = result.productCount === 1 ? 'Produkt hängt' : 'Produkte hängen';
      return {
        error: `${result.productCount} ${noun} an dieser Art. Häng die Produkte erst um oder lösch sie.`,
      };
    }

    return { error: 'Diese Art gibt es nicht mehr.' };
  }

  // Die Zeilen sind weg, die Dateien noch nicht. Best effort — siehe removeBlobs.
  await removeBlobs(result.blobUrls);

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/**
 * Schnellschalter aus der Liste. Kein `useActionState` dahinter — das Formular ist ein
 * einzelner Button und funktioniert auch ohne JavaScript.
 */
export async function toggleSpeciesPublishedAction(
  id: string,
  published: boolean,
  _formData: FormData,
): Promise<void> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    // Ein stiller Fehlschlag waere hier schlimmer als ein Umweg ueber die Anmeldung.
    redirect('/admin/login');
  }

  // `not_found` braucht keine eigene Meldung: nach dem Revalidate ist die Zeile weg.
  await setSpeciesPublished(db, id, published);

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
}

// ---------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------

/**
 * Blobs aufraeumen, ohne den Nutzerfluss daran zu haengen.
 *
 * Die Datenbank ist die Quelle der Wahrheit: die Zeile ist schon weg, das Bild
 * damit aus Sicht der Anwendung geloescht. Scheitert der Store, waere eine
 * Fehlermeldung an dieser Stelle irrefuehrend — der Nutzer koennte nichts tun.
 * Was bleibt, ist eine verwaiste Datei, und die faengt `pnpm blob:prune`.
 */
async function removeBlobs(urls: readonly string[]): Promise<void> {
  if (urls.length === 0) return;

  try {
    await del([...urls], { token: env.BLOB_READ_WRITE_TOKEN });
  } catch (error: unknown) {
    console.error(
      `Blob-Aufraeumen fehlgeschlagen (${String(urls.length)} Dateien)`,
      error instanceof Error ? error.message : 'unbekannter Fehler',
    );
  }
}

function revalidateSpecies(speciesId: string): void {
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${speciesId}`);
}

/**
 * Wird nach dem Client-Upload aus JavaScript aufgerufen, nicht aus einem Formular.
 *
 * `onUploadCompleted` waere der vorgesehene Weg, feuert aber nur, wenn der Store die
 * Anwendung erreichen kann — lokal also nie. Deshalb meldet der Client selbst, was er
 * hochgeladen hat. Geglaubt wird davon nichts.
 */
export async function persistSpeciesMediaAction(input: unknown): Promise<MediaPersistResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { ok: false, error: guard.error };
  }

  // Prueft unter anderem, dass die URL auf unserem Blob-Host und unter dem
  // Prefix genau dieser Art liegt.
  const parsed = parseMediaPersist(input);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  // Die URL existiert erst dann wirklich, wenn der Store sie kennt.
  try {
    await head(parsed.values.url, { token: env.BLOB_READ_WRITE_TOKEN });
  } catch {
    return { ok: false, error: 'Die hochgeladene Datei ist im Speicher nicht auffindbar.' };
  }

  const result = await insertSpeciesMedia(db, parsed.values);

  if (!result.ok) {
    if (result.reason === 'duplicate_url') {
      // Wiederholter Aufruf nach einer verlorenen Antwort — der Eintrag steht bereits.
      revalidateSpecies(parsed.values.speciesId);
      return { ok: true };
    }

    return { ok: false, error: 'Diese Art gibt es nicht mehr.' };
  }

  revalidateSpecies(parsed.values.speciesId);
  return { ok: true };
}

export async function updateSpeciesMediaAltAction(
  mediaId: string,
  _previous: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { error: guard.error };
  }

  const parsed = parseMediaAlt(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const result = await updateMediaAlt(db, mediaId, parsed.values);
  if (!result.ok) {
    return { error: 'Dieses Bild gibt es nicht mehr.' };
  }

  revalidateSpecies(result.speciesId);
  return { error: null };
}

export async function deleteSpeciesMediaAction(
  mediaId: string,
  _previous: MediaActionState,
  _formData: FormData,
): Promise<MediaActionState> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { error: guard.error };
  }

  // Zeile zuerst. Andersherum zeigte bei einem Fehlschlag ein Eintrag auf eine
  // geloeschte Datei — ein kaputtes Bild ist schlimmer als eine verwaiste Datei.
  const result = await deleteMedia(db, mediaId);
  if (!result.ok) {
    return { error: 'Dieses Bild gibt es nicht mehr.' };
  }

  await removeBlobs([result.url]);

  revalidateSpecies(result.speciesId);
  return { error: null };
}

/**
 * Einzelner Knopf ohne eigenen State, wie der Publish-Schalter in der Liste.
 * Am Rand der Reihenfolge passiert nichts — das ist kein Fehler, sondern ein No-op.
 */
export async function moveSpeciesMediaAction(
  mediaId: string,
  direction: unknown,
  _formData: FormData,
): Promise<void> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    redirect('/admin/login');
  }

  const parsedDirection = mediaMoveDirectionSchema.safeParse(direction);
  if (!parsedDirection.success) return;

  const result = await moveMedia(db, mediaId, parsedDirection.data);
  if (!result.ok) return;

  revalidateSpecies(result.speciesId);
}
