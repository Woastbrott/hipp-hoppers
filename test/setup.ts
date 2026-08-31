/**
 * Test-Env. Kein echtes Secret, nur ein syntaktisch gueltiges — die Auth-Module
 * verlangen mindestens 32 Zeichen, und genau das soll hier auch geprueft werden.
 */
process.env.JWT_SECRET ??= 'test-secret-mit-mindestens-32-zeichen-laenge';

// Wird nie verbunden: Tests fahren PGlite, und wo `@/db` im Spiel ist, wird es gemockt.
// Die Variable muss trotzdem existieren, weil `lib/env.ts` beim Import validiert.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/hipphoppers_test';
