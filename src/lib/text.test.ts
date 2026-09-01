import { describe, expect, it } from 'vitest';

import { collapseWhitespace, toParagraphs } from './text';

describe('collapseWhitespace', () => {
  it('macht aus Umbruechen und Mehrfach-Leerzeichen ein Leerzeichen', () => {
    expect(collapseWhitespace('  a \n\n b\t\tc  ')).toBe('a b c');
  });
});

describe('toParagraphs', () => {
  it('trennt an Leerzeilen', () => {
    expect(toParagraphs('Erster Absatz.\n\nZweiter Absatz.')).toEqual([
      'Erster Absatz.',
      'Zweiter Absatz.',
    ]);
  });

  it('behandelt einen einzelnen Umbruch als Leerzeichen im selben Absatz', () => {
    // Ein Umbruch im Textarea ist Formatierung des Eingabefelds, keine Aussage.
    expect(toParagraphs('Eine Zeile\nund noch eine')).toEqual(['Eine Zeile und noch eine']);
  });

  it('ueberspringt zusaetzliche Leerzeilen und Zeilen aus Leerzeichen', () => {
    expect(toParagraphs('Eins\n\n\n   \n\nZwei')).toEqual(['Eins', 'Zwei']);
  });

  it('kommt mit CRLF klar', () => {
    expect(toParagraphs('Eins\r\n\r\nZwei')).toEqual(['Eins', 'Zwei']);
  });

  it('liefert eine leere Liste fuer leer, null und undefined', () => {
    expect(toParagraphs(null)).toEqual([]);
    expect(toParagraphs(undefined)).toEqual([]);
    expect(toParagraphs('   \n  ')).toEqual([]);
  });
});
