import { describe, expect, it, vi } from 'vitest';

import { pruneBlobs, type BlobPage, type BlobSummary, type PruneDeps } from './prune';

const STORE = 'https://abc123xyz.public.blob.vercel-storage.com';

function blob(pathname: string, size = 1024): BlobSummary {
  return { url: `${STORE}/${pathname}`, pathname, size };
}

function deps(options: {
  pages: BlobPage[];
  referenced: string[];
  onDelete?: (urls: string[]) => void;
}): PruneDeps {
  let call = 0;

  return {
    listBlobs: (cursor) => {
      const page = options.pages[call] ?? { blobs: [], cursor: undefined, hasMore: false };
      call += 1;

      // Ab der zweiten Seite muss der Cursor der vorigen ankommen.
      if (call > 1) expect(cursor).toBeDefined();

      return Promise.resolve(page);
    },
    referencedUrls: () => Promise.resolve(options.referenced),
    deleteBlobs: (urls) => {
      options.onDelete?.(urls);
      return Promise.resolve();
    },
  };
}

function singlePage(blobs: BlobSummary[]): BlobPage[] {
  return [{ blobs, cursor: undefined, hasMore: false }];
}

describe('pruneBlobs', () => {
  it('laesst referenzierte Dateien in Ruhe', async () => {
    const referenced = blob('species/a/eins.jpg');

    const report = await pruneBlobs(
      deps({ pages: singlePage([referenced]), referenced: [referenced.url] }),
      {
        dryRun: true,
      },
    );

    expect(report.scanned).toBe(1);
    expect(report.orphans).toEqual([]);
  });

  it('meldet unreferenzierte Dateien mit Groesse', async () => {
    const kept = blob('species/a/eins.jpg', 2048);
    const orphan = blob('species/a/verwaist.jpg', 4096);

    const report = await pruneBlobs(
      deps({ pages: singlePage([kept, orphan]), referenced: [kept.url] }),
      { dryRun: true },
    );

    expect(report.orphans.map((entry) => entry.pathname)).toEqual(['species/a/verwaist.jpg']);
    expect(report.orphanBytes).toBe(4096);
  });

  it('loescht im Trockenlauf nichts', async () => {
    const onDelete = vi.fn();
    const orphan = blob('species/a/verwaist.jpg');

    const report = await pruneBlobs(
      deps({ pages: singlePage([orphan]), referenced: [], onDelete }),
      { dryRun: true },
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
    expect(report.dryRun).toBe(true);
  });

  it('loescht nur mit ausdruecklicher Ansage — und nur die Waisen', async () => {
    const onDelete = vi.fn();
    const kept = blob('species/a/eins.jpg');
    const orphan = blob('species/a/verwaist.jpg');

    const report = await pruneBlobs(
      deps({ pages: singlePage([kept, orphan]), referenced: [kept.url], onDelete }),
      { dryRun: false },
    );

    expect(onDelete).toHaveBeenCalledWith([orphan.url]);
    expect(report.deleted).toBe(1);
  });

  it('ruft gar nicht erst loeschen auf, wenn es nichts zu loeschen gibt', async () => {
    const onDelete = vi.fn();
    const kept = blob('species/a/eins.jpg');

    await pruneBlobs(deps({ pages: singlePage([kept]), referenced: [kept.url], onDelete }), {
      dryRun: false,
    });

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('erkennt eine Referenz auch am Pfad, nicht nur an der vollen URL', async () => {
    const entry = blob('species/a/eins.jpg');

    // Anderer Store-Host, gleicher Pfad: im Zweifel gilt die Datei als referenziert.
    const report = await pruneBlobs(
      deps({
        pages: singlePage([entry]),
        referenced: ['https://anderer-store.public.blob.vercel-storage.com/species/a/eins.jpg'],
      }),
      { dryRun: true },
    );

    expect(report.orphans).toEqual([]);
  });

  it('laeuft ueber alle Seiten des Stores', async () => {
    const erste = blob('species/a/eins.jpg');
    const zweite = blob('species/a/zwei.jpg');

    const report = await pruneBlobs(
      deps({
        pages: [
          { blobs: [erste], cursor: 'seite-2', hasMore: true },
          { blobs: [zweite], cursor: undefined, hasMore: false },
        ],
        referenced: [],
      }),
      { dryRun: true },
    );

    expect(report.scanned).toBe(2);
    expect(report.orphans).toHaveLength(2);
  });

  it('haelt an, wenn eine Seite keinen Cursor mehr liefert', async () => {
    const report = await pruneBlobs(
      deps({
        pages: [{ blobs: [blob('species/a/eins.jpg')], cursor: undefined, hasMore: true }],
        referenced: [],
      }),
      { dryRun: true },
    );

    expect(report.scanned).toBe(1);
  });
});
