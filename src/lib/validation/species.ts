import { z } from 'zod';

import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@/lib/slug';
import { SPECIES_DIFFICULTIES } from '@/lib/species/difficulty';

/**
 * Quelle der Wahrheit fuer Arten-Eingaben. Das Formular schickt ausschliesslich
 * Strings; hier werden sie getrimmt, normalisiert und typisiert — geparst wird in der
 * Server Action, nie im Client.
 *
 * Leere optionale Felder werden zu `null`, nicht zu `''`: ein Leerstring in der
 * Datenbank ist ein Wert, der so tut, als waere er einer.
 */

/** Nimmt entgegen, was ein Formularfeld liefern kann, und trimmt es zu einem String. */
const textInput = z.union([z.string(), z.null()]).transform((value) => (value ?? '').trim());

/** HTML-Checkboxen senden "on" — oder, wenn sie nicht angehakt sind, gar nichts. */
const checkboxInput = z
  .union([z.string(), z.boolean(), z.null()])
  .transform((value) => value === true || value === 'on' || value === 'true');

function requiredText(label: string, max: number) {
  return textInput.pipe(
    z
      .string()
      .min(1, { error: `${label} darf nicht leer sein.` })
      .max(max, { error: `${label}: höchstens ${max} Zeichen.` }),
  );
}

function optionalText(label: string, max: number) {
  return textInput
    .pipe(z.string().max(max, { error: `${label}: höchstens ${max} Zeichen.` }))
    .transform((value) => (value.length === 0 ? null : value));
}

function optionalInteger(options: { label: string; min: number; max: number; unit?: string }) {
  const unit = options.unit ? ` ${options.unit}` : '';

  return textInput
    .transform((value) => (value.length === 0 ? null : value))
    .pipe(
      z
        .string()
        .regex(/^-?\d+$/, { error: `${options.label}: bitte eine ganze Zahl.` })
        .transform((value) => Number.parseInt(value, 10))
        .pipe(
          z
            .int()
            .min(options.min, { error: `${options.label}: mindestens ${options.min}${unit}.` })
            .max(options.max, { error: `${options.label}: höchstens ${options.max}${unit}.` }),
        )
        // `null` faellt hier durch, ohne die String-Pruefungen zu beruehren.
        .nullable(),
    );
}

const baseSpeciesSchema = z.object({
  slug: textInput.pipe(
    z
      .string()
      .min(1, { error: 'Slug darf nicht leer sein.' })
      .max(SLUG_MAX_LENGTH, { error: `Slug: höchstens ${SLUG_MAX_LENGTH} Zeichen.` })
      .regex(SLUG_PATTERN, {
        error: 'Nur Kleinbuchstaben, Ziffern und einzelne Bindestriche dazwischen.',
      }),
  ),

  scientificName: requiredText('Wissenschaftlicher Name', 160),
  commonName: optionalText('Deutscher Name', 160),
  description: optionalText('Beschreibung', 4000),

  temperatureMinCelsius: optionalInteger({
    label: 'Temperatur min',
    min: -20,
    max: 60,
    unit: '°C',
  }),
  temperatureMaxCelsius: optionalInteger({
    label: 'Temperatur max',
    min: -20,
    max: 60,
    unit: '°C',
  }),

  humidityMinPercent: optionalInteger({ label: 'Luftfeuchte min', min: 0, max: 100, unit: '%' }),
  humidityMaxPercent: optionalInteger({ label: 'Luftfeuchte max', min: 0, max: 100, unit: '%' }),

  adultSizeMinMm: optionalInteger({ label: 'Größe min', min: 1, max: 500, unit: 'mm' }),
  adultSizeMaxMm: optionalInteger({ label: 'Größe max', min: 1, max: 500, unit: 'mm' }),

  difficulty: textInput
    .transform((value) => (value.length === 0 ? null : value))
    .pipe(z.enum(SPECIES_DIFFICULTIES, { error: 'Unbekannter Schwierigkeitsgrad.' }).nullable()),

  published: checkboxInput,
});

type RangeCheck = {
  min: number | null;
  max: number | null;
  /** Der Fehler landet am Maximum-Feld — dort steht der Wert, der nicht passt. */
  path: SpeciesFieldName;
  label: string;
};

export const speciesFormSchema = baseSpeciesSchema.superRefine((data, ctx) => {
  const ranges: RangeCheck[] = [
    {
      min: data.temperatureMinCelsius,
      max: data.temperatureMaxCelsius,
      path: 'temperatureMaxCelsius',
      label: 'Temperatur',
    },
    {
      min: data.humidityMinPercent,
      max: data.humidityMaxPercent,
      path: 'humidityMaxPercent',
      label: 'Luftfeuchte',
    },
    {
      min: data.adultSizeMinMm,
      max: data.adultSizeMaxMm,
      path: 'adultSizeMaxMm',
      label: 'Größe',
    },
  ];

  for (const range of ranges) {
    if (range.min !== null && range.max !== null && range.min > range.max) {
      ctx.addIssue({
        code: 'custom',
        path: [range.path],
        message: `${range.label}: Maximum darf nicht unter dem Minimum liegen.`,
      });
    }
  }
});

export type SpeciesFormValues = z.output<typeof speciesFormSchema>;

export const SPECIES_FIELD_NAMES = [
  'slug',
  'scientificName',
  'commonName',
  'description',
  'temperatureMinCelsius',
  'temperatureMaxCelsius',
  'humidityMinPercent',
  'humidityMaxPercent',
  'adultSizeMinMm',
  'adultSizeMaxMm',
  'difficulty',
  'published',
] as const;

export type SpeciesFieldName = (typeof SPECIES_FIELD_NAMES)[number];
export type SpeciesFieldErrors = Partial<Record<SpeciesFieldName, string>>;

export type SpeciesParseResult =
  | { ok: true; values: SpeciesFormValues }
  | { ok: false; fieldErrors: SpeciesFieldErrors; formError: string | null };

function isFieldName(value: PropertyKey): value is SpeciesFieldName {
  return SPECIES_FIELD_NAMES.includes(value as SpeciesFieldName);
}

/**
 * Baut aus der Rohquelle genau die bekannten Felder.
 *
 * Zwei Gruende. Erstens: eine nicht angehakte Checkbox sendet gar nichts, und ein
 * fehlender Schluessel ist fuer Zod ein fehlendes Pflichtfeld — nicht "false". Das ist
 * eine Eigenschaft von HTML-Formularen, nicht der Domaene, also wird sie hier begradigt.
 * Zweitens: alles, was nicht in `SPECIES_FIELD_NAMES` steht, faellt weg. Damit kann
 * kein zusaetzliches Feld aus dem Request bis in ein Insert durchrutschen.
 */
function normalizeSource(raw: Record<string, unknown>): Record<SpeciesFieldName, unknown> {
  const normalized = {} as Record<SpeciesFieldName, unknown>;

  for (const name of SPECIES_FIELD_NAMES) {
    normalized[name] = raw[name] ?? '';
  }

  return normalized;
}

/**
 * Nimmt FormData (Server Action) oder ein einfaches Objekt (Tests, spaeter eine API)
 * und liefert entweder saubere Werte oder Fehler pro Feld. Pro Feld gewinnt der erste
 * Fehler — mehr als einen zeigt das Formular ohnehin nicht an.
 */
export function parseSpeciesForm(source: FormData | Record<string, unknown>): SpeciesParseResult {
  const raw: Record<string, unknown> =
    source instanceof FormData ? Object.fromEntries(source.entries()) : source;

  const result = speciesFormSchema.safeParse(normalizeSource(raw));

  if (result.success) {
    return { ok: true, values: result.data };
  }

  const fieldErrors: SpeciesFieldErrors = {};
  let formError: string | null = null;

  for (const issue of result.error.issues) {
    const [first] = issue.path;

    if (first !== undefined && isFieldName(first)) {
      fieldErrors[first] ??= issue.message;
    } else {
      formError ??= issue.message;
    }
  }

  return { ok: false, fieldErrors, formError };
}
