import '../db/load-env';

import { del, list } from '@vercel/blob';

import { db } from '@/db';
import { pruneBlobs, type BlobPage } from '@/lib/blob/prune';
import { env } from '@/lib/env';
import { listAllMediaUrls } from '@/lib/media/queries';

/**
 * Raeumt verwaiste Dateien aus dem Blob Store.
 *
 * Standard ist ein Trockenlauf: er listet nur, was niemand mehr referenziert.
 * Geloescht wird ausschliesslich mit `--delete` — ein Script, das beim ersten
 * versehentlichen Aufruf Daten vernichtet, ist ein schlechtes Script.
 *
 *   pnpm blob:prune
 *   pnpm blob:prune --delete
 */

const shouldDelete = process.argv.includes('--delete');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  const report = await pruneBlobs(
    {
      listBlobs: async (cursor): Promise<BlobPage> => {
        const page = await list({ cursor, limit: 500, token: env.BLOB_READ_WRITE_TOKEN });

        return {
          blobs: page.blobs.map((blob) => ({
            url: blob.url,
            pathname: blob.pathname,
            size: blob.size,
          })),
          cursor: page.cursor,
          hasMore: page.hasMore,
        };
      },

      referencedUrls: () => listAllMediaUrls(db),

      deleteBlobs: async (urls) => {
        await del(urls, { token: env.BLOB_READ_WRITE_TOKEN });
      },
    },
    { dryRun: !shouldDelete },
  );

  console.warn(
    `Store: ${String(report.scanned)} Dateien, davon ${String(report.referenced)} in media referenziert.`,
  );

  if (report.orphans.length === 0) {
    console.warn('Keine Waisen gefunden.');
    return;
  }

  console.warn(
    `${String(report.orphans.length)} verwaiste Dateien (${formatBytes(report.orphanBytes)}):`,
  );

  for (const orphan of report.orphans) {
    console.warn(`  ${orphan.pathname}  ${formatBytes(orphan.size)}`);
  }

  console.warn(
    report.dryRun
      ? '\nTrockenlauf — nichts geloescht. Mit `--delete` wirklich aufraeumen.'
      : `\n${String(report.deleted)} Dateien geloescht.`,
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unbekannter Fehler beim Aufraeumen.');
    process.exit(1);
  });
