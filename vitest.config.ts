import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /*
       * `server-only` wirft beim Import, sobald die `react-server`-Condition fehlt —
       * genau das ist sein Zweck. Der Test-Runner hat diese Condition nicht, also wird
       * das Paket hier auf ein leeres Modul gemappt. Die Schutzwirkung im Build bleibt
       * unberuehrt, sie haengt an Next, nicht an Vitest.
       */
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // PGlite startet pro Suite eine eigene Instanz — reichlich Luft fuer argon2.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
