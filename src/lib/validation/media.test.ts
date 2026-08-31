import { describe, expect, it } from 'vitest';

import { parseMediaAlt, parseMediaPersist } from './media';

const SPECIES_ID = '11111111-2222-4333-8444-555555555555';
const STORE = 'https://abc123xyz.public.blob.vercel-storage.com';

const valid = {
  speciesId: SPECIES_ID,
  url: `${STORE}/species/${SPECIES_ID}/bild-abc123.jpg`,
  alt: 'Adultes Weibchen auf einem Zweig',
  width: 1600,
  height: 1200,
  contentType: 'image/jpeg',
};

function parse(overrides: Record<string, unknown> = {}) {
  return parseMediaPersist({ ...valid, ...overrides });
}

describe('parseMediaPersist — gueltige Eingabe', () => {
  it('nimmt eine vollstaendige Meldung an', () => {
    const result = parse();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.alt).toBe('Adultes Weibchen auf einem Zweig');
    expect(result.values.width).toBe(1600);
  });

  it('trimmt den Alt-Text', () => {
    const result = parse({ alt: '   Nymphe im L3-Stadium \n' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.alt).toBe('Nymphe im L3-Stadium');
  });
});

describe('parseMediaPersist — Alt-Text ist Pflicht', () => {
  it('lehnt einen leeren Alt-Text ab', () => {
    const result = parse({ alt: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Alt-Text ist Pflicht/);
  });

  it('lehnt reine Leerzeichen ab', () => {
    const result = parse({ alt: '   ' });
    expect(result.ok).toBe(false);
  });

  it('lehnt fehlenden Alt-Text ab', () => {
    const result = parse({ alt: undefined });
    expect(result.ok).toBe(false);
  });

  it('begrenzt die Laenge', () => {
    const result = parse({ alt: 'a'.repeat(301) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/höchstens 300/);
  });
});

describe('parseMediaPersist — die URL muss uns gehoeren', () => {
  it('lehnt einen fremden Host ab', () => {
    const result = parse({
      url: `https://boeser-nachbar.example/species/${SPECIES_ID}/bild.jpg`,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/gehört nicht zu dieser Art/);
  });

  it('lehnt das Prefix einer anderen Art ab', () => {
    const other = '99999999-2222-4333-8444-555555555555';
    const result = parse({ url: `${STORE}/species/${other}/bild.jpg` });

    expect(result.ok).toBe(false);
  });

  it('lehnt einen Pfad ausserhalb von species/ ab', () => {
    const result = parse({ url: `${STORE}/andere/${SPECIES_ID}/bild.jpg` });
    expect(result.ok).toBe(false);
  });

  it('lehnt Unterordner ab', () => {
    const result = parse({ url: `${STORE}/species/${SPECIES_ID}/tief/bild.jpg` });
    expect(result.ok).toBe(false);
  });

  it('lehnt http ab', () => {
    const result = parse({
      url: `http://abc123xyz.public.blob.vercel-storage.com/species/${SPECIES_ID}/bild.jpg`,
    });
    expect(result.ok).toBe(false);
  });
});

describe('parseMediaPersist — Masse und Format', () => {
  it('lehnt nicht-ganzzahlige Masse ab', () => {
    expect(parse({ width: 1600.5 }).ok).toBe(false);
  });

  it('lehnt Masse ausserhalb des plausiblen Bereichs ab', () => {
    expect(parse({ width: 0 }).ok).toBe(false);
    expect(parse({ height: -1 }).ok).toBe(false);
    expect(parse({ width: 20_001 }).ok).toBe(false);
  });

  it('lehnt nicht erlaubte Formate ab, insbesondere SVG', () => {
    expect(parse({ contentType: 'image/svg+xml' }).ok).toBe(false);
    expect(parse({ contentType: 'image/gif' }).ok).toBe(false);
    expect(parse({ contentType: 'application/pdf' }).ok).toBe(false);
  });

  it('lehnt eine unbekannte Art-Id ab', () => {
    expect(parse({ speciesId: 'keine-uuid' }).ok).toBe(false);
  });
});

describe('parseMediaAlt', () => {
  it('nimmt FormData entgegen und trimmt', () => {
    const formData = new FormData();
    formData.set('alt', '  Ootheke an der Rueckwand  ');

    const result = parseMediaAlt(formData);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toBe('Ootheke an der Rueckwand');
  });

  it('lehnt einen leeren Alt-Text ab', () => {
    const formData = new FormData();
    formData.set('alt', '   ');

    const result = parseMediaAlt(formData);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Alt-Text ist Pflicht/);
  });

  it('lehnt ein fehlendes Feld ab', () => {
    expect(parseMediaAlt(new FormData()).ok).toBe(false);
  });
});
