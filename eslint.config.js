// @ts-check
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  {
    ignores: [
      'dist/**',
      '.astro/**',
      'node_modules/**',
      'pnpm-lock.yaml',
      'coverage/**',
      'test-results/**',
      'playwright-report/**'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },

  {
    // `.svelte.ts` as well as `.svelte`: eslint-plugin-svelte's recommended config claims both for
    // svelte-eslint-parser (a `.svelte.ts` module may use runes), and that parser needs the
    // TypeScript one underneath it or the types in a rune-backed store read as syntax errors.
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte']
      }
    }
  },

  {
    files: ['**/*.astro'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.astro']
      }
    }
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  }
);
