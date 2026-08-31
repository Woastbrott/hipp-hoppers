import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { species } from '@/db/schema';
import type { Db } from '@/db/types';
import { parseSpeciesForm } from '@/lib/validation/species';
import { createTestDatabase } from '../../../test/db';

/**
 * Datenbank und Zod muessen dieselbe Aussage machen.
 *
 * Das Formular ist nicht der einzige Weg in die Tabelle: ein Seed, ein Import oder eine
 * spaetere API schreiben an Zod vorbei. Deshalb sichern CHECK-Constraints dieselbe
 * Invariante — und dieser Test haelt fest, dass beide Seiten sie identisch auslegen,
 * inklusive der NULL-Faelle.
 *
 * Regel, beidseitig: die Spanne wird nur geprueft, wenn beide Werte gesetzt sind.
 * Ein einzelner Wert ohne Gegenstueck ist erlaubt.
 */

type RangeRow = Partial<{
  temperatureMinCelsius: number | null;
  temperatureMaxCelsius: number | null;
  humidityMinPercent: number | null;
  humidityMaxPercent: number | null;
  adultSizeMinMm: number | null;
  adultSizeMaxMm: number | null;
}>;

type Range = {
  label: string;
  constraint: string;
  toRow: (min: number | null, max: number | null) => RangeRow;
  toForm: (min: number | null, max: number | null) => Record<string, string>;
};

const asField = (value: number | null): string => (value === null ? '' : String(value));

const ranges: Range[] = [
  {
    label: 'Temperatur',
    constraint: 'species_temperature_range_valid',
    toRow: (min, max) => ({ temperatureMinCelsius: min, temperatureMaxCelsius: max }),
    toForm: (min, max) => ({
      temperatureMinCelsius: asField(min),
      temperatureMaxCelsius: asField(max),
    }),
  },
  {
    label: 'Luftfeuchte',
    constraint: 'species_humidity_range_valid',
    toRow: (min, max) => ({ humidityMinPercent: min, humidityMaxPercent: max }),
    toForm: (min, max) => ({
      humidityMinPercent: asField(min),
      humidityMaxPercent: asField(max),
    }),
  },
  {
    label: 'Größe',
    constraint: 'species_adult_size_range_valid',
    toRow: (min, max) => ({ adultSizeMinMm: min, adultSizeMaxMm: max }),
    toForm: (min, max) => ({ adultSizeMinMm: asField(min), adultSizeMaxMm: asField(max) }),
  },
];

/** Werte, die in allen drei Bereichen (-20..60, 0..100, 1..500) im erlaubten Fenster liegen. */
const cases = [
  { name: 'beide leer', min: null, max: null, accepted: true },
  { name: 'nur Minimum', min: 30, max: null, accepted: true },
  { name: 'nur Maximum', min: null, max: 30, accepted: true },
  { name: 'Minimum unter Maximum', min: 24, max: 30, accepted: true },
  { name: 'Minimum gleich Maximum', min: 26, max: 26, accepted: true },
  { name: 'Minimum ueber Maximum', min: 30, max: 24, accepted: false },
];

const matrix = ranges.flatMap((range, rangeIndex) =>
  cases.map((entry, caseIndex) => ({
    range: range.label,
    constraint: range.constraint,
    scenario: entry.name,
    accepted: entry.accepted,
    slug: `range-${String(rangeIndex)}-${String(caseIndex)}`,
    row: range.toRow(entry.min, entry.max),
    form: range.toForm(entry.min, entry.max),
  })),
);

/**
 * Drizzle verpackt Treiberfehler: die Meldung oben lautet nur "Failed query: …", der
 * Constraint-Name steht im `cause`. Dieselbe Verschachtelung laeuft `lib/db-errors.ts`
 * ab — hier wird sie flachgeklopft, damit die Zusicherung lesbar bleibt.
 */
function errorChainText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) break;

    const entry: { message?: unknown; cause?: unknown } = current;
    if (typeof entry.message === 'string') parts.push(entry.message);
    current = entry.cause;
  }

  return parts.join(' | ');
}

describe('Spannen-Invariante — Datenbank', () => {
  let db: Db;
  let close: () => Promise<void>;

  // Eine Instanz fuer alle Faelle: jeder Fall schreibt seinen eigenen Slug, und ein
  // abgelehntes Insert hinterlaesst nichts.
  beforeAll(async () => {
    ({ db, close } = await createTestDatabase());
  });

  afterAll(async () => {
    await close();
  });

  it.each(matrix)('$range, $scenario: akzeptiert = $accepted', async (entry) => {
    // Bewusst am Zod-Schema vorbei — genau das macht ein Seed oder ein Import auch.
    const insert = db.insert(species).values({
      slug: entry.slug,
      scientificName: `Test ${entry.slug}`,
      ...entry.row,
    });

    if (entry.accepted) {
      await expect(insert).resolves.toBeDefined();
      return;
    }

    const caught: unknown = await insert.then(
      () => null,
      (error: unknown) => error,
    );

    expect(caught).not.toBeNull();
    expect(errorChainText(caught)).toContain(entry.constraint);
  });
});

describe('Spannen-Invariante — Zod', () => {
  it.each(matrix)('$range, $scenario: akzeptiert = $accepted', (entry) => {
    const result = parseSpeciesForm({
      slug: entry.slug,
      scientificName: `Test ${entry.slug}`,
      ...entry.form,
    });

    expect(result.ok).toBe(entry.accepted);
  });
});
