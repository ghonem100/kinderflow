import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Paths never linted anywhere in the repository.
 *
 * `__fixtures__` holds files that deliberately violate the KinderFlow custom
 * rules (KF-S0-INFRA-003). They are asserted by `pnpm lint:rules`; they must
 * never break the repo-wide lint job.
 */
export const ignores = {
  name: 'kf/ignores',
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/__fixtures__/**',
  ],
};

/**
 * Repository-wide base config. Every package extends this.
 *
 * Blueprint §12: "TS strict everywhere; no `any` (lint error)".
 */
export const base = [
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: 'kf/base',
    rules: {
      // Blueprint §12 — `any` is a lint error repository-wide, not a warning.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default base;
