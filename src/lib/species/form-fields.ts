import 'server-only';

import type { SpeciesFormFields } from '@/app/admin/(dashboard)/species/state';
import type { Species } from '@/db/schema';

function numberToField(value: number | null): string {
  return value === null ? '' : String(value);
}

export const EMPTY_SPECIES_FORM_FIELDS: SpeciesFormFields = {
  slug: '',
  scientificName: '',
  commonName: '',
  description: '',
  temperatureMinCelsius: '',
  temperatureMaxCelsius: '',
  humidityMinPercent: '',
  humidityMaxPercent: '',
  adultSizeMinMm: '',
  adultSizeMaxMm: '',
  difficulty: '',
  published: '',
};

/**
 * Uebersetzt eine Zeile aus der Datenbank in Formularwerte.
 *
 * Server-seitig, damit das Client-Formular nur mit Strings umgeht und nicht mit dem
 * Drizzle-Typ — sonst zieht die Client-Insel das halbe ORM ins Bundle.
 */
export function speciesToFormFields(row: Species): SpeciesFormFields {
  return {
    slug: row.slug,
    scientificName: row.scientificName,
    commonName: row.commonName ?? '',
    description: row.description ?? '',
    temperatureMinCelsius: numberToField(row.temperatureMinCelsius),
    temperatureMaxCelsius: numberToField(row.temperatureMaxCelsius),
    humidityMinPercent: numberToField(row.humidityMinPercent),
    humidityMaxPercent: numberToField(row.humidityMaxPercent),
    adultSizeMinMm: numberToField(row.adultSizeMinMm),
    adultSizeMaxMm: numberToField(row.adultSizeMaxMm),
    difficulty: row.difficulty ?? '',
    published: row.published ? 'on' : '',
  };
}
