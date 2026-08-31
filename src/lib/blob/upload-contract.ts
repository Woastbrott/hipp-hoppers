/**
 * Der Vertrag zwischen Upload-Client und Token-Route.
 *
 * Bewusst ohne Imports und ohne `server-only`: dieselbe Datei baut im Browser den
 * Zielpfad und prueft auf dem Server, ob eine gemeldete URL dorthin gehoert. Zwei
 * Kopien dieser Regeln waeren genau die Stelle, an der eine Luecke entsteht.
 */

/**
 * Kein SVG. SVG ist ein Dokumentformat mit Scripting — als `<img>` zwar harmlos,
 * aber direkt aufgerufen laeuft enthaltenes JavaScript auf unserer Blob-Domain.
 * Die vier Rasterformate decken alles ab, was ein Shop braucht.
 */
export const ALLOWED_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export type AllowedImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

/**
 * 10 MB. Eine 24-Megapixel-JPEG-Aufnahme aus einer Systemkamera liegt bei 6–9 MB;
 * darueber faengt es an, unbearbeitete RAW-Exporte durchzulassen, die im Shop
 * ohnehin niemand braucht. Der Client-Upload umgeht Vercels 4,5-MB-Grenze fuer
 * Request-Bodies, deshalb ist das hier die einzige Schranke.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Wurzel aller Arten-Bilder im Store. */
export const SPECIES_BLOB_ROOT = 'species';

/** Der Hostname, den Vercel Blob fuer oeffentliche Stores vergibt. */
export const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

export function isAllowedImageContentType(value: string): value is AllowedImageContentType {
  return (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

/** `species/<id>/` — alles darunter gehoert dieser Art. */
export function speciesBlobPrefix(speciesId: string): string {
  return `${SPECIES_BLOB_ROOT}/${speciesId}/`;
}

/**
 * Macht aus einem Dateinamen etwas, das gefahrlos in einen Pfad passt: keine
 * Verzeichniswechsel, keine Leerzeichen, keine Sonderzeichen. Der Zufallssuffix
 * gegen Kollisionen kommt vom Store (`addRandomSuffix`), nicht von hier.
 */
export function sanitizeUploadFilename(filename: string): string {
  const withoutPath = filename.split(/[\\/]/).pop() ?? '';

  const cleaned = withoutPath
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);

  return cleaned.length > 0 ? cleaned : 'bild';
}

export function buildSpeciesBlobPathname(speciesId: string, filename: string): string {
  return `${speciesBlobPrefix(speciesId)}${sanitizeUploadFilename(filename)}`;
}

/**
 * Akzeptiert nur https-URLs auf einem Vercel-Blob-Host. Ein Angreifer koennte der
 * Persist-Action sonst eine beliebige fremde URL unterschieben, die dann als unser
 * Bild im Admin (und spaeter im Shop) haengt.
 */
export function isTrustedBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** Der Pfad innerhalb des Stores, ohne fuehrenden Schraegstrich. */
export function blobPathnameFromUrl(value: string): string | null {
  if (!isTrustedBlobUrl(value)) return null;

  try {
    return decodeURIComponent(new URL(value).pathname.replace(/^\//, ''));
  } catch {
    return null;
  }
}

/** Liegt die URL unter `species/<id>/`? Trifft die Entscheidung fuer die Persist-Action. */
export function isSpeciesBlobUrl(value: string, speciesId: string): boolean {
  const pathname = blobPathnameFromUrl(value);
  if (pathname === null) return false;

  const prefix = speciesBlobPrefix(speciesId);
  if (!pathname.startsWith(prefix)) return false;

  const rest = pathname.slice(prefix.length);

  // Der Rest muss ein Dateiname sein: nicht leer und ohne weiteren Ordner.
  return rest.length > 0 && !rest.includes('/');
}
