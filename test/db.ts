import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import * as schema from '@/db/schema';
import type { Db } from '@/db/types';

const migrationsDir = fileURLToPath(new URL('../src/db/migrations', import.meta.url));

export type TestDatabase = {
  db: Db;
  close: () => Promise<void>;
};

/**
 * Echtes Postgres im Speicher (PGlite) statt Mocks.
 *
 * Der Rate-Limiter und der token_version-Check leben in SQL — ein gemockter
 * Query-Builder wuerde genau das testen, was er selbst vorgibt. Nebeneffekt: die
 * committete Migration wird bei jedem Testlauf tatsaechlich ausgefuehrt.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const content = await readFile(path.join(migrationsDir, file), 'utf8');

    for (const statement of content.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) {
        await client.exec(trimmed);
      }
    }
  }

  return {
    db: drizzle(client, { schema }),
    close: () => client.close(),
  };
}
