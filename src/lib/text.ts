/**
 * Textaufbereitung fuer die Anzeige. Bewusst ohne `server-only`: die Helfer sind reine
 * Funktionen und duerfen auch in einer Client-Insel landen.
 */

/** Umbrueche und Mehrfach-Leerzeichen zu einem Leerzeichen. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Zerlegt einen Freitext an Leerzeilen in Absaetze.
 *
 * Einzelne Umbrueche bleiben innerhalb eines Absatzes und werden zu Leerzeichen: was
 * im Textarea als Zeilenumbruch getippt wurde, ist Formatierung des Eingabefelds und
 * keine Absatzgrenze. Erst eine Leerzeile ist eine Aussage ueber die Struktur.
 */
export function toParagraphs(value: string | null | undefined): string[] {
  if (!value) return [];

  return value
    .split(/\r?\n[ \t]*\r?\n/)
    .map(collapseWhitespace)
    .filter((paragraph) => paragraph.length > 0);
}
