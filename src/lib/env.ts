import 'server-only';

import { formatEnvIssues, parseEnv, type Env } from './env.schema';

const result = parseEnv(process.env);

if (!result.ok) {
  // Bewusst hart: lieber beim Import scheitern als mit halber Konfiguration laufen.
  throw new Error(formatEnvIssues(result.issues));
}

export const env: Env = result.env;
