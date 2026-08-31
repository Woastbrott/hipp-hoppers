/**
 * Test-Env. Kein echtes Secret, nur ein syntaktisch gueltiges — die Auth-Module
 * verlangen mindestens 32 Zeichen, und genau das soll hier auch geprueft werden.
 */
process.env.JWT_SECRET ??= 'test-secret-mit-mindestens-32-zeichen-laenge';
