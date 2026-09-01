import { describe, expect, it } from 'vitest';

import { buildCareFacts, formatRange, type CareInput } from './care';

/** Alles leer — jeder Test setzt nur das, worum es ihm geht. */
function input(overrides: Partial<CareInput> = {}): CareInput {
  return {
    temperatureMinCelsius: null,
    temperatureMaxCelsius: null,
    humidityMinPercent: null,
    humidityMaxPercent: null,
    adultSizeMinMm: null,
    adultSizeMaxMm: null,
    difficulty: null,
    ...overrides,
  };
}

describe('formatRange', () => {
  it('deckt alle vier Kombinationen aus min und max ab', () => {
    expect(formatRange(24, 30, '°C')).toBe('24–30 °C');
    expect(formatRange(24, null, '°C')).toBe('ab 24 °C');
    expect(formatRange(null, 30, '°C')).toBe('bis 30 °C');
    expect(formatRange(null, null, '°C')).toBeNull();
  });

  it('macht aus gleichen Grenzen einen einzelnen Wert', () => {
    expect(formatRange(28, 28, '°C')).toBe('28 °C');
  });

  it('behandelt 0 als Wert und nicht als fehlend', () => {
    // Klassischer Falsy-Fehler: 0 % Luftfeuchte ist unsinnig, 0 mm auch — aber die
    // Formatierung darf das nicht entscheiden, sondern nur `null`.
    expect(formatRange(0, 40, '%')).toBe('0–40 %');
    expect(formatRange(null, 0, '%')).toBe('bis 0 %');
  });
});

describe('buildCareFacts', () => {
  it('liefert nichts, wenn nichts gesetzt ist', () => {
    expect(buildCareFacts(input())).toEqual([]);
  });

  it('nimmt nur die gesetzten Zeilen auf', () => {
    const facts = buildCareFacts(
      input({ temperatureMinCelsius: 24, temperatureMaxCelsius: 30, difficulty: 'einsteiger' }),
    );

    expect(facts).toEqual([
      { label: 'Temperatur', value: '24–30 °C' },
      { label: 'Schwierigkeit', value: 'Einsteiger' },
    ]);
  });

  it('haelt die Reihenfolge Temperatur, Luftfeuchte, Größe, Schwierigkeit', () => {
    const facts = buildCareFacts(
      input({
        temperatureMinCelsius: 22,
        temperatureMaxCelsius: 28,
        humidityMinPercent: 60,
        humidityMaxPercent: 80,
        adultSizeMinMm: 70,
        adultSizeMaxMm: 90,
        difficulty: 'experte',
      }),
    );

    expect(facts.map((fact) => fact.label)).toEqual([
      'Temperatur',
      'Luftfeuchte',
      'Adultgröße',
      'Schwierigkeit',
    ]);
    expect(facts.map((fact) => fact.value)).toEqual(['22–28 °C', '60–80 %', '70–90 mm', 'Experte']);
  });

  it('erzeugt bei halb gepflegten Spannen kein leeres Label und kein "null"', () => {
    const facts = buildCareFacts(
      input({ temperatureMinCelsius: 25, humidityMaxPercent: 70, adultSizeMinMm: 45 }),
    );

    expect(facts).toEqual([
      { label: 'Temperatur', value: 'ab 25 °C' },
      { label: 'Luftfeuchte', value: 'bis 70 %' },
      { label: 'Adultgröße', value: 'ab 45 mm' },
    ]);

    for (const fact of facts) {
      expect(fact.label.trim().length).toBeGreaterThan(0);
      expect(fact.value.trim().length).toBeGreaterThan(0);
      expect(fact.value).not.toMatch(/null|undefined|NaN/);
    }
  });

  it('laesst eine Zeile weg, sobald beide Grenzen fehlen', () => {
    const facts = buildCareFacts(input({ humidityMinPercent: 60, humidityMaxPercent: 80 }));

    expect(facts.map((fact) => fact.label)).toEqual(['Luftfeuchte']);
  });
});
