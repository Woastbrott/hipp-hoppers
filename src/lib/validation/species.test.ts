import { describe, expect, it } from 'vitest';

import { parseSpeciesForm, SPECIES_FIELD_NAMES, type SpeciesFieldName } from './species';

const valid = {
  slug: 'hierodula-majuscula',
  scientificName: 'Hierodula majuscula',
  commonName: 'Riesen-Gottesanbeterin',
  description: 'Kraeftige Art aus Suedostasien.',
  temperatureMinCelsius: '24',
  temperatureMaxCelsius: '30',
  humidityMinPercent: '60',
  humidityMaxPercent: '80',
  adultSizeMinMm: '70',
  adultSizeMaxMm: '90',
  difficulty: 'fortgeschritten',
  published: 'on',
};

function parse(overrides: Record<string, unknown> = {}) {
  return parseSpeciesForm({ ...valid, ...overrides });
}

function errorFor(result: ReturnType<typeof parse>, field: SpeciesFieldName): string | undefined {
  return result.ok ? undefined : result.fieldErrors[field];
}

describe('parseSpeciesForm — gueltige Eingaben', () => {
  it('parst ein vollstaendiges Formular in typisierte Werte', () => {
    const result = parse();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.values).toEqual({
      slug: 'hierodula-majuscula',
      scientificName: 'Hierodula majuscula',
      commonName: 'Riesen-Gottesanbeterin',
      description: 'Kraeftige Art aus Suedostasien.',
      temperatureMinCelsius: 24,
      temperatureMaxCelsius: 30,
      humidityMinPercent: 60,
      humidityMaxPercent: 80,
      adultSizeMinMm: 70,
      adultSizeMaxMm: 90,
      difficulty: 'fortgeschritten',
      published: true,
    });
  });

  it('nimmt FormData genauso entgegen wie ein Objekt', () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(valid)) {
      formData.set(key, value);
    }

    const fromFormData = parseSpeciesForm(formData);
    const fromObject = parse();

    expect(fromFormData).toEqual(fromObject);
  });

  it('behandelt eine fehlende Checkbox als nicht veroeffentlicht', () => {
    const result = parse({ published: undefined });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.published).toBe(false);
  });

  it('kommt auch klar, wenn optionale Felder gar nicht mitgeschickt werden', () => {
    const result = parseSpeciesForm({
      slug: 'nur-das-noetigste',
      scientificName: 'Nur das Noetigste',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.commonName).toBeNull();
    expect(result.values.published).toBe(false);
  });

  it('ignoriert Felder, die nicht zum Schema gehoeren', () => {
    const result = parse({ id: 'geschmuggelt', createdAt: '1999-01-01', tokenVersion: '99' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.values).sort()).toEqual([...SPECIES_FIELD_NAMES].sort());
  });
});

describe('parseSpeciesForm — Trim und null-Normalisierung', () => {
  it('trimmt Strings', () => {
    const result = parse({
      scientificName: '  Hierodula majuscula  ',
      commonName: '\tRiesen-Gottesanbeterin\n',
      slug: ' hierodula-majuscula ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.scientificName).toBe('Hierodula majuscula');
    expect(result.values.commonName).toBe('Riesen-Gottesanbeterin');
    expect(result.values.slug).toBe('hierodula-majuscula');
  });

  it('macht aus leeren optionalen Feldern null, nicht ""', () => {
    const result = parse({
      commonName: '',
      description: '   ',
      temperatureMinCelsius: '',
      temperatureMaxCelsius: '',
      humidityMinPercent: '',
      humidityMaxPercent: '',
      adultSizeMinMm: '',
      adultSizeMaxMm: '',
      difficulty: '',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.values.commonName).toBeNull();
    expect(result.values.description).toBeNull();
    expect(result.values.temperatureMinCelsius).toBeNull();
    expect(result.values.humidityMaxPercent).toBeNull();
    expect(result.values.adultSizeMinMm).toBeNull();
    expect(result.values.difficulty).toBeNull();
  });

  it('lehnt " " als wissenschaftlichen Namen ab', () => {
    const result = parse({ scientificName: '   ' });

    expect(result.ok).toBe(false);
    expect(errorFor(result, 'scientificName')).toMatch(/darf nicht leer sein/);
  });
});

describe('parseSpeciesForm — Slug', () => {
  it('lehnt Grossbuchstaben, Leerzeichen und Umlaute ab', () => {
    for (const bad of ['Hierodula', 'hierodula majuscula', 'hierodula_majuscula', 'bärtierchen']) {
      const result = parse({ slug: bad });
      expect(result.ok).toBe(false);
      expect(errorFor(result, 'slug')).toMatch(/Kleinbuchstaben/);
    }
  });

  it('lehnt Bindestriche am Rand und doppelte Bindestriche ab', () => {
    for (const bad of ['-hierodula', 'hierodula-', 'hierodula--majuscula']) {
      const result = parse({ slug: bad });
      expect(result.ok).toBe(false);
      expect(errorFor(result, 'slug')).toBeDefined();
    }
  });

  it('verlangt einen Slug', () => {
    const result = parse({ slug: '' });
    expect(result.ok).toBe(false);
    expect(errorFor(result, 'slug')).toMatch(/darf nicht leer sein/);
  });
});

describe('parseSpeciesForm — Zahlen', () => {
  it('lehnt nicht-ganzzahlige Eingaben ab', () => {
    const result = parse({ temperatureMinCelsius: '24,5' });
    expect(result.ok).toBe(false);
    expect(errorFor(result, 'temperatureMinCelsius')).toMatch(/ganze Zahl/);
  });

  it('haelt Werte in ihrem Bereich', () => {
    expect(errorFor(parse({ humidityMaxPercent: '120' }), 'humidityMaxPercent')).toMatch(
      /höchstens 100/,
    );
    expect(errorFor(parse({ humidityMinPercent: '-1' }), 'humidityMinPercent')).toMatch(
      /mindestens 0/,
    );
    expect(errorFor(parse({ adultSizeMinMm: '0' }), 'adultSizeMinMm')).toMatch(/mindestens 1/);
  });

  it('erlaubt negative Temperaturen', () => {
    const result = parse({ temperatureMinCelsius: '-5', temperatureMaxCelsius: '10' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.temperatureMinCelsius).toBe(-5);
  });
});

describe('parseSpeciesForm — Cross-Field: min darf max nicht ueberschreiten', () => {
  it('meldet eine verdrehte Temperaturspanne am Maximum-Feld', () => {
    const result = parse({ temperatureMinCelsius: '30', temperatureMaxCelsius: '24' });

    expect(result.ok).toBe(false);
    expect(errorFor(result, 'temperatureMaxCelsius')).toMatch(/Maximum darf nicht unter/);
    expect(errorFor(result, 'temperatureMinCelsius')).toBeUndefined();
  });

  it('meldet eine verdrehte Luftfeuchte-Spanne', () => {
    const result = parse({ humidityMinPercent: '80', humidityMaxPercent: '60' });
    expect(errorFor(result, 'humidityMaxPercent')).toMatch(/Maximum darf nicht unter/);
  });

  it('meldet eine verdrehte Groessen-Spanne', () => {
    const result = parse({ adultSizeMinMm: '90', adultSizeMaxMm: '70' });
    expect(errorFor(result, 'adultSizeMaxMm')).toMatch(/Maximum darf nicht unter/);
  });

  it('laesst gleiche Werte durch', () => {
    const result = parse({ temperatureMinCelsius: '26', temperatureMaxCelsius: '26' });
    expect(result.ok).toBe(true);
  });

  it('prueft nichts, wenn eine Seite der Spanne fehlt', () => {
    const result = parse({ temperatureMinCelsius: '30', temperatureMaxCelsius: '' });
    expect(result.ok).toBe(true);
  });
});

describe('parseSpeciesForm — Schwierigkeitsgrad', () => {
  it('akzeptiert nur die Werte des Datenbank-Enums', () => {
    for (const value of ['einsteiger', 'fortgeschritten', 'experte']) {
      expect(parse({ difficulty: value }).ok).toBe(true);
    }
  });

  it('lehnt Freitext ab', () => {
    const result = parse({ difficulty: 'mittel' });
    expect(result.ok).toBe(false);
    expect(errorFor(result, 'difficulty')).toBeDefined();
  });
});
