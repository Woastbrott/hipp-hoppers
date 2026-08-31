import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type * as schema from './schema';

/**
 * Treiber-unabhaengiger Handle auf die Datenbank.
 *
 * Produktion faehrt `drizzle-orm/node-postgres`, die Unit-Tests fahren PGlite (echtes
 * Postgres im Speicher). Beide sind `PgDatabase` — die Auth-Funktionen nehmen deshalb
 * den Handle als Parameter entgegen, statt das Modul-Singleton zu importieren.
 * Das haelt sie testbar, ohne die Query-Logik zu mocken.
 */
export type Db = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
