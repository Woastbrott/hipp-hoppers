import { describe, expect, it } from 'vitest';

import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from './slug';

describe('slugify', () => {
  it('macht aus einem wissenschaftlichen Namen einen Slug', () => {
    expect(slugify('Hierodula majuscula')).toBe('hierodula-majuscula');
    expect(slugify('Idolomantis diabolica')).toBe('idolomantis-diabolica');
  });

  it('transliteriert deutsche Umlaute statt sie zu entkernen', () => {
    expect(slugify('Bärtierchen')).toBe('baertierchen');
    expect(slugify('Große Höhle')).toBe('grosse-hoehle');
    expect(slugify('ÄÖÜ')).toBe('aeoeue');
    expect(slugify('Straße')).toBe('strasse');
  });

  it('entfernt sonstige Diakritika', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme');
    expect(slugify('Señor Ñandú')).toBe('senor-nandu');
  });

  it('ersetzt Sonderzeichen und faltet Wiederholungen zusammen', () => {
    expect(slugify('Mantis   religiosa!!!')).toBe('mantis-religiosa');
    expect(slugify('Phyllocrania paradoxa (Geistermantis)')).toBe(
      'phyllocrania-paradoxa-geistermantis',
    );
    expect(slugify('a_b.c/d')).toBe('a-b-c-d');
  });

  it('laesst keine Bindestriche am Rand stehen', () => {
    expect(slugify('  --- Sphodromantis lineola --- ')).toBe('sphodromantis-lineola');
    expect(slugify('-')).toBe('');
  });

  it('gibt einen leeren String zurueck, wenn nichts Verwertbares uebrig bleibt', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!! ??? ###')).toBe('');
  });

  it('ist idempotent', () => {
    const once = slugify('Deroplatys desiccata');
    expect(slugify(once)).toBe(once);
  });

  it('kuerzt lange Eingaben und laesst dabei keinen Bindestrich am Ende', () => {
    const long = slugify('a'.repeat(200));
    expect(long).toHaveLength(SLUG_MAX_LENGTH);

    // Der Schnitt faellt hier mitten in einen Trenner.
    const words = slugify(`${'ab '.repeat(40)}ende`);
    expect(words.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(words.endsWith('-')).toBe(false);
  });

  it('erzeugt nur Slugs, die auch das Muster akzeptiert', () => {
    const inputs = [
      'Hierodula majuscula',
      'Bärtierchen',
      'Café Crème',
      '  --- Sphodromantis lineola --- ',
      'a_b.c/d',
      'a'.repeat(200),
    ];

    for (const input of inputs) {
      expect(SLUG_PATTERN.test(slugify(input))).toBe(true);
    }
  });
});
