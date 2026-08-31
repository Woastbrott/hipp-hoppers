export const SLUG_MAX_LENGTH = 96;

/** Kleinbuchstaben, Ziffern, einzelne Bindestriche dazwischen. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Deutsche Umlaute werden transliteriert, nicht entkernt: "Bärtierchen" wird
 * "baertierchen", nicht "bartierchen". Fuer alles andere (é, ñ, ç …) entfernt NFKD
 * die Diakritika wie ueblich.
 */
const GERMAN_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
];

/**
 * Erzeugt einen Slug-Vorschlag. Das Ergebnis ist ein Vorschlag, keine Garantie:
 * Eindeutigkeit entscheidet der Unique-Index in Postgres, nicht diese Funktion.
 *
 * Kann leer zurueckgeben (Eingabe ohne alphanumerische Zeichen) — das faengt die
 * Pflichtfeld-Pruefung im Zod-Schema ab.
 */
export function slugify(input: string): string {
  let value = input.normalize('NFC').toLowerCase();

  for (const [pattern, replacement] of GERMAN_REPLACEMENTS) {
    value = value.replace(pattern, replacement);
  }

  value = value
    .normalize('NFKD')
    // Kombinierende Diakritika, die NFKD abgespalten hat.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (value.length > SLUG_MAX_LENGTH) {
    // Nach dem Kuerzen kann ein Bindestrich am Ende stehen bleiben.
    value = value.slice(0, SLUG_MAX_LENGTH).replace(/-+$/, '');
  }

  return value;
}
