import 'server-only';

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { env } from '@/lib/env';

import * as schema from './schema';

/**
 * Neon over HTTP: ein Request pro Query, kein Connection-Pool, der auf einer
 * serverless Invocation ohnehin nicht ueberlebt.
 *
 * Konsequenz, die weiter unten zaehlt: der HTTP-Treiber kann keine interaktiven
 * Transaktionen. Alles, was atomar sein muss, ist deshalb ein einzelnes Statement
 * (siehe `lib/auth/rate-limit.ts`).
 */
const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });

export { schema };
