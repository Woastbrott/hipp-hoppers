/**
 * Einzige Quelle fuer den Schwierigkeitsgrad.
 *
 * Bewusst ein Modul ohne Imports: das Postgres-Enum in `db/schema.ts`, das Zod-Enum
 * in `lib/validation/species.ts` und die Optionen im Formular leiten alle hiervon ab.
 * Waere die Liste in `db/schema.ts` zuhause, zoege das Client-Formular Drizzle mit
 * ins Bundle, nur um drei Strings zu lesen.
 */
export const SPECIES_DIFFICULTIES = ['einsteiger', 'fortgeschritten', 'experte'] as const;

export type SpeciesDifficulty = (typeof SPECIES_DIFFICULTIES)[number];

/** Anzeigetexte fuer UI und Listen. */
export const SPECIES_DIFFICULTY_LABELS: Record<SpeciesDifficulty, string> = {
  einsteiger: 'Einsteiger',
  fortgeschritten: 'Fortgeschritten',
  experte: 'Experte',
};
