import 'server-only';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '@/lib/env';

import * as schema from './schema';

/**
 * Postgres laeuft als eigener Container, erreichbar nur ueber das interne Docker-Netz.
 *
 * Ein Verbindungspool statt einer Verbindung pro Anfrage: der Next-Server ist ein
 * langlebiger Prozess, keine serverless Function. Verbindungen ueberleben zwischen
 * Requests, der Handshake faellt also nicht bei jedem Aufruf erneut an.
 *
 * Anders als beim frueheren HTTP-Treiber sind hier echte interaktive Transaktionen
 * moeglich (`db.transaction`). Die bestehenden Ein-Statement-Loesungen bleiben
 * trotzdem, wo sie stehen — sie sind weiterhin atomar und sparen einen Roundtrip.
 */
const poolConfig = {
  connectionString: env.DATABASE_URL,
  // 2 vCPU auf der Maschine. Mehr offene Verbindungen bringen dort nichts als
  // Kontextwechsel — und Postgres muss sie alle vorhalten.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
} as const;

/**
 * In der Entwicklung laedt Next Module bei jeder Aenderung neu. Ohne diesen Umweg
 * ueber `globalThis` bliebe bei jedem Reload ein Pool mit offenen Verbindungen zurueck.
 */
const globalForDb = globalThis as unknown as { hippHoppersPool?: Pool };

const pool = globalForDb.hippHoppersPool ?? new Pool(poolConfig);

if (process.env.NODE_ENV !== 'production') {
  globalForDb.hippHoppersPool = pool;
}

export const db = drizzle(pool, { schema });

export { schema };
