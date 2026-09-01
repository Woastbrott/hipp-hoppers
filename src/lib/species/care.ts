import { SPECIES_DIFFICULTY_LABELS, type SpeciesDifficulty } from './difficulty';

/**
 * Der Care-Block der Detailseite. Die Entscheidung, ob eine Zeile ueberhaupt
 * erscheint, faellt hier und nicht im JSX — sonst muss jede Seite denselben
 * Null-Reigen selbst nachbauen, und irgendwann steht doch ein leeres Label da.
 */

export type CareFact = {
  /** Kurz und in Versalien gesetzt — steht in der Mono-Spalte links. */
  label: string;
  value: string;
};

/** Strukturell, nicht `Species`: der Block braucht sieben Spalten, nicht die Zeile. */
export type CareInput = {
  temperatureMinCelsius: number | null;
  temperatureMaxCelsius: number | null;
  humidityMinPercent: number | null;
  humidityMaxPercent: number | null;
  adultSizeMinMm: number | null;
  adultSizeMaxMm: number | null;
  difficulty: SpeciesDifficulty | null;
};

/**
 * Spanne als Text, `null` wenn nichts gesetzt ist.
 *
 * Vier Faelle, weil eine halb gepflegte Art normal ist: wer die Temperatur kennt,
 * aber die Luftfeuchte noch nicht gemessen hat, soll trotzdem etwas eintragen
 * koennen. Gleiche Werte werden zu einem einzelnen — "28–28 °C" ist keine Spanne.
 */
export function formatRange(min: number | null, max: number | null, unit: string): string | null {
  if (min !== null && max !== null) {
    return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
  }

  if (min !== null) return `ab ${min} ${unit}`;
  if (max !== null) return `bis ${max} ${unit}`;

  return null;
}

/** Nur, was gesetzt ist. Eine leere Liste heisst: kein Care-Block auf der Seite. */
export function buildCareFacts(input: CareInput): CareFact[] {
  const facts: CareFact[] = [];

  const temperature = formatRange(input.temperatureMinCelsius, input.temperatureMaxCelsius, '°C');
  if (temperature !== null) {
    facts.push({ label: 'Temperatur', value: temperature });
  }

  const humidity = formatRange(input.humidityMinPercent, input.humidityMaxPercent, '%');
  if (humidity !== null) {
    facts.push({ label: 'Luftfeuchte', value: humidity });
  }

  // Millimeter wie im Admin-Formular. Eine Umrechnung auf Zentimeter waere eine
  // zweite Wahrheit fuer denselben Wert.
  const size = formatRange(input.adultSizeMinMm, input.adultSizeMaxMm, 'mm');
  if (size !== null) {
    facts.push({ label: 'Adultgröße', value: size });
  }

  if (input.difficulty !== null) {
    facts.push({ label: 'Schwierigkeit', value: SPECIES_DIFFICULTY_LABELS[input.difficulty] });
  }

  return facts;
}
