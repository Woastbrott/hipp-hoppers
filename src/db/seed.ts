import './load-env';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { hashPassword } from '@/lib/auth/password';

import { db } from './index';
import { adminUsers } from './schema';

/**
 * Legt genau einen Admin-User aus der Env an. Idempotent: Upsert ueber die E-Mail,
 * mehrfacher Lauf erzeugt weder Duplikate noch Fehler.
 *
 * Das Passwort wird beim Lauf gehasht und nirgends geloggt oder abgelegt.
 * Ein erneuter Lauf setzt das Passwort neu und zaehlt `token_version` hoch — ein
 * Passwortwechsel soll bestehende Sessions beenden, sonst waere er halb wirkungslos.
 *
 * Start: `pnpm db:seed`
 */
const seedEnvSchema = z.object({
  SEED_ADMIN_EMAIL: z.email({ error: 'SEED_ADMIN_EMAIL ist keine gueltige E-Mail-Adresse.' }),
  SEED_ADMIN_PASSWORD: z
    .string()
    .min(12, { error: 'SEED_ADMIN_PASSWORD muss mindestens 12 Zeichen haben.' }),
});

async function seed(): Promise<void> {
  const parsed = seedEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.message}`).join('\n');
    throw new Error(`Seed-Konfiguration unvollstaendig:\n${issues}\n\nVorlage: .env.example`);
  }

  const email = parsed.data.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await hashPassword(parsed.data.SEED_ADMIN_PASSWORD);

  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  const rows = await db
    .insert(adminUsers)
    .values({ email, passwordHash })
    .onConflictDoUpdate({
      target: adminUsers.email,
      set: {
        passwordHash,
        tokenVersion: sql`${adminUsers.tokenVersion} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: adminUsers.id, tokenVersion: adminUsers.tokenVersion });

  const row = rows[0];

  if (!row) {
    throw new Error('Seed fehlgeschlagen: die Datenbank hat keine Zeile zurueckgegeben.');
  }

  const action = existing.length > 0 ? 'aktualisiert' : 'angelegt';
  console.warn(`Admin ${action}: ${email} (token_version ${row.tokenVersion})`);
}

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unbekannter Fehler beim Seeden.');
    process.exit(1);
  });
