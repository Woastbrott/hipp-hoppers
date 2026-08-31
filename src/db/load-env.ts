import { config } from 'dotenv';

/**
 * CLI-Scripts laufen ausserhalb von Next und bekommen `.env.local` nicht geschenkt.
 * Muss als allererster Import stehen — ES-Module werden in Import-Reihenfolge
 * ausgewertet, und `lib/env.ts` liest `process.env` bereits beim Laden.
 */
config({ path: ['.env.local', '.env'], quiet: true });
