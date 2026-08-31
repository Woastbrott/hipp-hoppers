import type { SpeciesFieldErrors, SpeciesFieldName } from '@/lib/validation/species';

/**
 * Getrennt von `actions.ts`: ein `'use server'`-Modul darf ausser async Funktionen
 * nichts exportieren, sonst scheitert es zur Laufzeit beim Laden des Moduls.
 */

/** Rohwerte des letzten Versuchs — damit nach einem Fehler nichts neu getippt werden muss. */
export type SpeciesFormFields = Record<SpeciesFieldName, string>;

export type SpeciesFormState = {
  status: 'idle' | 'error' | 'saved';
  formError: string | null;
  fieldErrors: SpeciesFieldErrors;
  values: SpeciesFormFields | null;
  /** Zaehlt jeden Serverdurchlauf hoch, damit das Formular neu aufgebaut werden kann. */
  attempt: number;
};

export const initialSpeciesFormState: SpeciesFormState = {
  status: 'idle',
  formError: null,
  fieldErrors: {},
  values: null,
  attempt: 0,
};

export type SpeciesDeleteState = {
  error: string | null;
};

export const initialSpeciesDeleteState: SpeciesDeleteState = { error: null };

export const SLUG_TAKEN_ERROR = 'Diesen Slug gibt es schon. Nimm einen anderen.';
