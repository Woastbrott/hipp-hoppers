import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      // Generiertes SQL — nicht unser Stil, nicht unser Problem.
      'src/db/migrations/**',
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypescript,

  // Typ-informierte Regeln: fangen Dinge, die ohne Typen unsichtbar sind
  // (schwebende Promises, unsichere `any`-Fluesse aus untypisierten Libs).
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        // Server Actions werden als `action={fn}` uebergeben — das ist gewollt.
        { checksVoidReturn: { attributes: false } },
      ],
      // Leeres catch ist verboten; ein bewusst leeres braucht einen Kommentar.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Config-Dateien in JS: keine Typinformation vorhanden, also auch keine typ-Regeln.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Zum Schluss: alles abschalten, was mit Prettier kollidiert.
  prettierConfig,
);
