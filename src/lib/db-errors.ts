/**
 * Postgres-Fehlercodes lesbar machen.
 *
 * Der Punkt ist die Eindeutigkeit des Slugs: die kommt aus dem Unique-Index, nicht aus
 * einem vorgeschalteten SELECT. Ein "gibt es den Slug schon?"-Query vor dem Insert waere
 * eine Race Condition — zwischen Pruefung und Schreiben passt ein zweiter Request.
 * Also schreiben, und die Verletzung als Feldfehler zurueckgeben.
 */

type PostgresErrorLike = {
  code?: unknown;
  constraint?: unknown;
  message?: unknown;
};

const MAX_CAUSE_DEPTH = 5;

/** Treiber verpacken den Originalfehler unterschiedlich tief in `cause`. */
function errorChain(error: unknown): PostgresErrorLike[] {
  const chain: PostgresErrorLike[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) break;

    const entry: PostgresErrorLike = current;
    chain.push(entry);
    current = (entry as { cause?: unknown }).cause;
  }

  return chain;
}

/**
 * Der Constraint-Name muss nachweisbar sein — entweder im `constraint`-Feld oder in der
 * Meldung. Sonst wird der Fehler nicht uebersetzt, sondern weitergereicht: eine
 * fremde Verletzung als "Slug vergeben" auszugeben waere schlimmer als ein 500er.
 */
function matchesViolation(
  error: unknown,
  sqlState: string,
  messagePattern: RegExp,
  constraint: string,
): boolean {
  return errorChain(error).some((entry) => {
    const message = typeof entry.message === 'string' ? entry.message : '';
    const signalled = entry.code === sqlState || messagePattern.test(message);

    if (!signalled) return false;

    return entry.constraint === constraint || message.includes(constraint);
  });
}

/** Postgres 23505 — unique_violation. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return matchesViolation(error, '23505', /duplicate key value violates unique/i, constraint);
}

/** Postgres 23503 — foreign_key_violation. */
export function isForeignKeyViolation(error: unknown, constraint: string): boolean {
  return matchesViolation(error, '23503', /violates foreign key constraint/i, constraint);
}
