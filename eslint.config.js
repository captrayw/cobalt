import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/dev-dist/**', '**/playwright-report/**', '**/test-results/**', 'golden/reference/**', 'golden/out/**', 'apps/web/ios/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The core stays pure and deterministic: no DOM, audio, storage, timers, clocks or Math.random.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'AudioContext', 'fetch', 'setTimeout', 'setInterval', 'performance', 'Date'].map((name) => ({
          name,
          message: 'The core package must stay pure: pass time, randomness and I/O in from the app.',
        })),
      ],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use a seeded mulberry32 PRNG.' }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/audio/src/**/*.ts', 'packages/audio/test/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/*.mjs', '**/*.config.{ts,js}', 'golden/**', 'apps/web/e2e/**', 'apps/web/scripts/**', 'packages/core/test/**'],
    languageOptions: { globals: globals.node },
  },
);
