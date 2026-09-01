import { collapseWhitespace } from '@/lib/text';

/**
 * Titel und Description fuer `generateMetadata`.
 *
 * Beides ist Klartext: der `<title>` traegt den wissenschaftlichen Namen aufrecht,
 * obwohl er im Layout kursiv steht — Kursivsetzung ist Typografie und hat in einem
 * Meta-Tag nichts verloren.
 */

/** Suchmaschinen kappen die Description bei ~155–160 Zeichen. */
export const META_DESCRIPTION_MAX_LENGTH = 160;

/**
 * Anteil der Maximallaenge, unter dem ein Satzende als zu frueh gilt. Ein Text, der
 * mit "Ja." beginnt, soll nicht auf drei Zeichen zusammenschrumpfen.
 */
const MIN_SENTENCE_SHARE = 0.5;

/** Was am Schnittrand haengen bleibt und vor dem Auslassungszeichen weg muss. */
const TRAILING_PUNCTUATION = /[\s,;:.!?–—-]+$/;

export type SpeciesMetaInput = {
  scientificName: string;
  commonName: string | null;
  description: string | null;
};

/**
 * "Hierodula majuscula · Riesen-Gottesanbeterin".
 *
 * Mittelpunkt statt Gedankenstrich: das Root-Layout haengt per Template bereits
 * " — Hipp Hoppers" an, zwei Gedankenstriche in einem Titel lesen sich als Fehler.
 */
export function speciesMetaTitle(input: SpeciesMetaInput): string {
  const common = input.commonName?.trim();

  return common ? `${input.scientificName} · ${common}` : input.scientificName;
}

/**
 * Ein einzelner Buchstabe vor dem Punkt ist eine Abkuerzung ("z. B.", "u. a."),
 * kein Satzende. Heuristik, keine Sprachanalyse — sie faengt den haeufigen Fall und
 * kostet im Zweifel nur eine etwas kuerzere Description.
 */
function isAbbreviationDot(text: string, index: number): boolean {
  if (text[index] !== '.') return false;

  const before = text.slice(0, index);
  const word = before.slice(before.lastIndexOf(' ') + 1);

  return word.length === 1 && /\p{L}/u.test(word);
}

/** Position des letzten verwertbaren Satzzeichens innerhalb der Laengengrenze. */
function lastSentenceEnd(text: string, maxLength: number): number {
  let found = -1;

  // Lookahead auf Leerzeichen oder Ende: schuetzt Dezimalzahlen und Domains.
  for (const match of text.matchAll(/[.!?](?=\s|$)/g)) {
    if (match.index + 1 > maxLength) break;
    if (isAbbreviationDot(text, match.index)) continue;

    found = match.index;
  }

  return found;
}

/**
 * Kuerzt auf hoechstens `maxLength` Zeichen — bevorzugt am Satzende, sonst an der
 * letzten Wortgrenze. Ein Wort wird nie mitten durchgeschnitten.
 */
export function truncateAtSentence(
  value: string,
  maxLength: number = META_DESCRIPTION_MAX_LENGTH,
): string {
  const text = collapseWhitespace(value);
  if (text.length <= maxLength) return text;

  const sentenceEnd = lastSentenceEnd(text, maxLength);
  if (sentenceEnd !== -1 && sentenceEnd + 1 >= maxLength * MIN_SENTENCE_SHARE) {
    return text.slice(0, sentenceEnd + 1);
  }

  // Das Auslassungszeichen zaehlt mit, deshalb ein Zeichen Luft.
  const limit = maxLength - 1;
  const lastSpace = text.lastIndexOf(' ', limit);
  const cut = lastSpace > 0 ? lastSpace : limit;

  return `${text.slice(0, cut).replace(TRAILING_PUNCTUATION, '')}…`;
}

/**
 * Ohne eigene Beschreibung ein sachlicher Ersatz. Kein Werbetext — die Seite hat
 * schlicht noch keinen, und das darf die Description auch so sagen.
 */
export function speciesFallbackDescription(input: SpeciesMetaInput): string {
  const common = input.commonName?.trim();

  if (common) {
    const withCommon = `Steckbrief zu ${input.scientificName} (${common}): Temperatur, Luftfeuchte, Größe und Bilder aus der Zucht.`;

    // Passt der deutsche Name nicht mehr rein, faellt er ganz weg — besser als ein
    // Satz, der mitten in der Aufzaehlung abbricht.
    if (withCommon.length <= META_DESCRIPTION_MAX_LENGTH) return withCommon;
  }

  return truncateAtSentence(
    `Steckbrief zu ${input.scientificName}: Temperatur, Luftfeuchte, Größe und Bilder aus der Zucht.`,
  );
}

export function speciesMetaDescription(input: SpeciesMetaInput): string {
  const description = collapseWhitespace(input.description ?? '');

  if (description.length === 0) {
    return speciesFallbackDescription(input);
  }

  return truncateAtSentence(description);
}
