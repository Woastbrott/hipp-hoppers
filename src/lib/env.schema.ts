import { z } from 'zod';

/**
 * Reines Schema, bewusst ohne `server-only` und ohne Seiteneffekte.
 *
 * Zwei Konsumenten:
 *  - `src/lib/env.ts` — der Laufzeit-Zugriff der App (server-only, parst einmal beim Import).
 *  - `next.config.ts`  — validiert beim Build, damit fehlende Variablen den Build brechen
 *                        und nicht erst die erste Anfrage in Produktion.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Neon-Connection-String. */
  DATABASE_URL: z
    .string()
    .min(1, { error: 'DATABASE_URL darf nicht leer sein.' })
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      error: 'DATABASE_URL muss mit postgres:// oder postgresql:// beginnen.',
    }),

  /**
   * HS256-Schluessel fuer das Session-JWT. 32 Zeichen sind das Minimum, damit der
   * Schluessel nicht kuerzer ist als der Hash-Output, den er absichern soll.
   */
  JWT_SECRET: z.string().min(32, {
    error: 'JWT_SECRET muss mindestens 32 Zeichen haben (z. B. `openssl rand -base64 48`).',
  }),

  /**
   * Erlaubte Origin fuer den CSRF-Check. Leer/ungesetzt => es wird gegen den
   * (Forwarded-)Host der jeweiligen Anfrage geprueft.
   */
  APP_ORIGIN: z
    .union([z.url(), z.literal('')])
    .optional()
    .transform((value) => (value === '' ? undefined : value)),

  /** Nur fuer `pnpm db:seed`. Zur Laufzeit der App nicht noetig. */
  SEED_ADMIN_EMAIL: z.union([z.email(), z.literal('')]).optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),

  /**
   * Vercel Blob Store, Lese-/Schreib-Token. Seit dem Bild-Upload nicht mehr optional:
   * ohne ihn kann die Token-Route keine Client-Uploads ausstellen, und das faellt
   * sonst erst beim ersten Upload auf.
   *
   * Bewusst nur auf Laenge geprueft und nicht auf ein Praefix: das Format ist
   * Vercel-Sache und darf sich aendern, ohne dass hier der Build bricht.
   */
  BLOB_READ_WRITE_TOKEN: z.string().min(20, {
    error: 'BLOB_READ_WRITE_TOKEN fehlt (Vercel-Dashboard → Storage → Blob → Token).',
  }),
});

export type Env = z.infer<typeof envSchema>;

export type EnvParseResult = { ok: true; env: Env } | { ok: false; issues: string[] };

/** Parst ohne zu werfen — der Aufrufer entscheidet, wie laut er scheitert. */
export function parseEnv(source: Record<string, string | undefined>): EnvParseResult {
  const result = envSchema.safeParse(source);

  if (result.success) {
    return { ok: true, env: result.data };
  }

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });

  return { ok: false, issues };
}

/** Baut eine Fehlermeldung, die den Wert selbst nie ausgibt. */
export function formatEnvIssues(issues: string[]): string {
  return [
    'Ungueltige Environment-Konfiguration:',
    ...issues.map((issue) => `  - ${issue}`),
    '',
    'Vorlage: .env.example — Werte gehoeren nach .env.local.',
  ].join('\n');
}
