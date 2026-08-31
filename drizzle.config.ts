import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit laeuft ausserhalb von Next, laedt also .env-Dateien nicht selbst.
loadEnv({ path: ['.env.local', '.env'], quiet: true });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL fehlt. Lege .env.local an (Vorlage: .env.example), bevor du drizzle-kit startest.',
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
