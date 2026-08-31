import { blobPathnameFromUrl } from './upload-contract';

/**
 * Findet Dateien im Blob Store, die in `media` nicht mehr referenziert sind.
 *
 * Waisen entstehen im Normalbetrieb: beim Loeschen ist die Datenbank die Quelle der
 * Wahrheit, der `del()`-Aufruf danach ist best effort. Schlaegt er fehl, bleibt die
 * Datei liegen — und genau die sammelt dieses Modul wieder ein.
 *
 * Bewusst ohne direkte SDK- und Datenbank-Abhaengigkeit: beides kommt als Parameter,
 * damit die Logik ohne Netz und ohne Store testbar ist.
 */

export type BlobSummary = {
  url: string;
  pathname: string;
  size: number;
};

export type BlobPage = {
  blobs: BlobSummary[];
  cursor: string | undefined;
  hasMore: boolean;
};

export type PruneDeps = {
  /** Eine Seite des Stores. `cursor` ist undefined fuer die erste. */
  listBlobs: (cursor: string | undefined) => Promise<BlobPage>;
  /** Alle URLs, die in `media` stehen. */
  referencedUrls: () => Promise<string[]>;
  deleteBlobs: (urls: string[]) => Promise<void>;
};

export type PruneReport = {
  scanned: number;
  referenced: number;
  orphans: BlobSummary[];
  orphanBytes: number;
  deleted: number;
  dryRun: boolean;
};

/** Schutz gegen eine Endlosschleife, falls der Store nie `hasMore: false` meldet. */
const MAX_PAGES = 200;

/**
 * Referenzen doppelt erfassen: einmal als vollstaendige URL, einmal als Pfad im Store.
 * Wenn eine gespeicherte URL nicht parsebar ist, faellt sie so trotzdem nicht aus der
 * Menge — im Zweifel gilt eine Datei als referenziert und bleibt liegen.
 */
function buildReferenceSet(urls: readonly string[]): Set<string> {
  const referenced = new Set<string>();

  for (const url of urls) {
    referenced.add(url);

    const pathname = blobPathnameFromUrl(url);
    if (pathname !== null) referenced.add(pathname);
  }

  return referenced;
}

export async function pruneBlobs(
  deps: PruneDeps,
  options: { dryRun: boolean },
): Promise<PruneReport> {
  const referencedList = await deps.referencedUrls();
  const referenced = buildReferenceSet(referencedList);

  const orphans: BlobSummary[] = [];
  let scanned = 0;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await deps.listBlobs(cursor);

    for (const blob of result.blobs) {
      scanned += 1;

      if (!referenced.has(blob.url) && !referenced.has(blob.pathname)) {
        orphans.push(blob);
      }
    }

    if (!result.hasMore || result.cursor === undefined) break;
    cursor = result.cursor;
  }

  const orphanBytes = orphans.reduce((sum, blob) => sum + blob.size, 0);

  // Loeschen passiert nur auf ausdrueckliche Ansage. Ein versehentlicher Lauf soll
  // eine Liste ausgeben, keine Daten vernichten.
  if (!options.dryRun && orphans.length > 0) {
    await deps.deleteBlobs(orphans.map((blob) => blob.url));
  }

  return {
    scanned,
    referenced: referencedList.length,
    orphans,
    orphanBytes,
    deleted: options.dryRun ? 0 : orphans.length,
    dryRun: options.dryRun,
  };
}
