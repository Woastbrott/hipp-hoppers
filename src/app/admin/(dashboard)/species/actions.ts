'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import { requireAdmin } from '@/lib/auth/require-admin';
import {
  createSpecies,
  deleteSpecies,
  setSpeciesPublished,
  updateSpecies,
} from '@/lib/species/queries';
import {
  parseSpeciesForm,
  SPECIES_FIELD_NAMES,
  type SpeciesFieldName,
} from '@/lib/validation/species';

import {
  SLUG_TAKEN_ERROR,
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
