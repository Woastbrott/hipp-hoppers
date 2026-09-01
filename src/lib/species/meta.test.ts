import { describe, expect, it } from 'vitest';

import {
  META_DESCRIPTION_MAX_LENGTH,
  speciesFallbackDescription,
  speciesMetaDescription,
  speciesMetaTitle,
  truncateAtSentence,
  type SpeciesMetaInput,
} from './meta';

function input(overrides: Partial<SpeciesMetaInput> = {}): SpeciesMetaInput {
  return {
    scientificName: 'Hierodula majuscula',
    commonName: 'Riesen-Gottesanbeterin',
    description: null,
    ...overrides,
  };
}

describe('speciesMetaTitle', () => {
  it('setzt wissenschaftlichen und deutschen Namen zusammen', () => {
    expect(speciesMetaTitle(input())).toBe('Hierodula majuscula · Riesen-Gottesanbeterin');
  });

  it('laesst den deutschen Namen weg, wenn keiner gepflegt ist', () => {
    expect(speciesMetaTitle(input({ commonName: null }))).toBe('Hierodula majuscula');
    expect(speciesMetaTitle(input({ commonName: '   ' }))).toBe('Hierodula majuscula');
  });
});

describe('truncateAtSentence', () => {
  it('laesst kurze Texte unangetastet', () => {
    expect(truncateAtSentence('Kurz und fertig.')).toBe('Kurz und fertig.');
  });

  it('normalisiert Umbrueche und Mehrfach-Leerzeichen', () => {
    expect(truncateAtSentence('Erste Zeile\n\n  zweite   Zeile.')).toBe(
      'Erste Zeile zweite Zeile.',
    );
  });

  it('schneidet am letzten Satzende innerhalb der Grenze', () => {
    const text =
      'Eine ruhige Art aus dem Norden Australiens. Sie frisst zuverlässig und häutet sich ohne Zicken. ' +
      'Der dritte Satz ist nur da, um die Grenze sicher zu überschreiten und trägt sonst nichts bei.';

    const result = truncateAtSentence(text);

    expect(result).toBe(
      'Eine ruhige Art aus dem Norden Australiens. Sie frisst zuverlässig und häutet sich ohne Zicken.',
    );
    expect(result.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
  });

  it('faellt ohne Satzende auf die Wortgrenze zurueck und haengt ein Auslassungszeichen an', () => {
    const text =
      'Diese Beschreibung besteht aus einem einzigen sehr langen Satz ohne jeden Punkt und läuft ' +
      'deshalb weit über die Grenze der Meta-Description hinaus bis irgendwann einfach Schluss ' +
      'ist und nichts mehr kommt';

    const result = truncateAtSentence(text);

    expect(result.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
    expect(result.endsWith('…')).toBe(true);
    // Kein halbes Wort: was vor dem Auslassungszeichen steht, steht auch im Original.
    expect(text.startsWith(result.slice(0, -1))).toBe(true);
  });

  it('haelt einen Punkt aus "z. B." nicht fuer ein Satzende', () => {
    const text =
      'Als Futter eignen sich z. B. Fruchtfliegen, später größere Fliegen und Schaben, wobei die ' +
      'Größe immer zum jeweiligen Stadium passen muss und nicht zur Bequemlichkeit des Halters ' +
      'im Futterschrank.';

    const result = truncateAtSentence(text);

    expect(result).not.toBe('Als Futter eignen sich z.');
    expect(result.length).toBeGreaterThan(META_DESCRIPTION_MAX_LENGTH / 2);
  });

  it('kappt nicht auf einen Dreiwortsatz, nur weil der zuerst endet', () => {
    const text =
      'Ja. Danach folgt ein deutlich längerer Abschnitt über Haltung, Klima und Fütterung, der ' +
      'die Grenze der Meta-Description klar überschreitet und deshalb an einer Wortgrenze ' +
      'gekürzt werden muss statt am ersten Punkt';

    // Das erste Satzende liegt bei drei Zeichen — zu frueh, also Wortgrenze.
    expect(truncateAtSentence(text)).not.toBe('Ja.');
    expect(truncateAtSentence(text).endsWith('…')).toBe(true);
  });

  it('kappt auch ein Wort ohne jedes Leerzeichen sauber auf die Maximallaenge', () => {
    const result = truncateAtSentence('a'.repeat(400));

    expect(result.length).toBe(META_DESCRIPTION_MAX_LENGTH);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('speciesMetaDescription', () => {
  it('nimmt die ersten Saetze der Beschreibung', () => {
    const description = 'Ruhig, gefräßig, robust. Für den Einstieg trotzdem eine Nummer zu groß.';

    expect(speciesMetaDescription(input({ description }))).toBe(description);
  });

  it('faellt bei leerer Beschreibung auf einen sachlichen Ersatz zurueck', () => {
    expect(speciesMetaDescription(input({ description: null }))).toBe(
      speciesFallbackDescription(input()),
    );
    expect(speciesMetaDescription(input({ description: '   \n  ' }))).toBe(
      speciesFallbackDescription(input()),
    );
  });

  it('haelt auch den Ersatztext innerhalb der Grenze', () => {
    const long = speciesFallbackDescription(
      input({
        scientificName: 'Pseudocreobotra wahlbergii',
        commonName: 'Stachelige Blumenmantis mit unnötig langem Trivialnamen für diesen Test',
      }),
    );

    expect(long.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
  });
});
