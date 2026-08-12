/**
 * KF-S0-INFRA-003 — lint-rules assertions.
 *
 * Per pre-adjudicated decision D-6 this uses the Node 22 built-in test runner
 * (`node --test`) and the ESLint Node API. No test framework is installed —
 * the runner choice is Blueprint §8 and is not this task's decision.
 *
 * Run: pnpm lint:rules
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

import { ignores, webRules } from '../index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const fixturesDir = path.join(repoRoot, 'configs', '__fixtures__');

/**
 * Lints a fixture with exactly the rules under test and nothing else, so an
 * assertion failure can only mean the KinderFlow rule misbehaved.
 * `overrideConfigFile: true` detaches ESLint from any repo config file.
 */
function makeLinter() {
  return new ESLint({
    cwd: repoRoot,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        },
        plugins: { '@typescript-eslint': tseslint.plugin },
        rules: {
          '@typescript-eslint/no-explicit-any': 'error',
          ...webRules,
        },
      },
    ],
  });
}

async function lintFixture(fileName) {
  const [result] = await makeLinter().lintFiles([path.join(fixturesDir, fileName)]);
  return result;
}

const messagesOf = (result) => result.messages.map((m) => m.message).join('\n');

test('AC1 — physical-direction classes fail lint and name the logical replacement', async () => {
  const result = await lintFixture('physical-direction.fixture.ts');
  const text = messagesOf(result);

  assert.ok(result.errorCount > 0, 'expected at least one error for pl-4 / ml-2 / left-0');
  assert.match(text, /ps-\*/, 'message must name the ps-* replacement');
  assert.match(text, /pl-\*/, 'message must name the pl-* offender');
  assert.match(text, /§2\.6/, 'message must cite Design System §2.6');
});

test('AC2 — raw hex colors fail lint and point to @kf/tokens', async () => {
  const result = await lintFixture('raw-hex.fixture.ts');
  const text = messagesOf(result);

  assert.ok(result.errorCount > 0, 'expected at least one error for #0D7377');
  assert.match(text, /@kf\/tokens/, 'message must point to @kf/tokens');
});

test('AC2 — raw px values fail lint and point to @kf/tokens', async () => {
  const result = await lintFixture('raw-px.fixture.ts');
  const text = messagesOf(result);

  assert.ok(result.errorCount > 0, 'expected at least one error for 16px');
  assert.match(text, /@kf\/tokens/, 'message must point to @kf/tokens');
});

test('AC3 — `any` fails lint', async () => {
  const result = await lintFixture('explicit-any.fixture.ts');

  assert.ok(result.errorCount > 0, 'expected at least one error for `any`');
  assert.ok(
    result.messages.some((m) => m.ruleId === '@typescript-eslint/no-explicit-any'),
    'expected @typescript-eslint/no-explicit-any to fire',
  );
});

test('clean fixture passes — the rules are not over-broad', async () => {
  const result = await lintFixture('clean.fixture.ts');

  assert.equal(
    result.errorCount,
    0,
    `clean fixture must produce no errors, got:\n${messagesOf(result)}`,
  );
  assert.equal(result.warningCount, 0, 'clean fixture must produce no warnings');
});

test('fixtures are excluded from normal lint runs', () => {
  assert.ok(
    ignores.ignores.includes('**/__fixtures__/**'),
    'base config must ignore **/__fixtures__/** so deliberate violations never break repo lint',
  );
});

test('AC4 — no package defines a competing Prettier config', () => {
  const SHARED = path.join('configs', 'prettier');
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage']);
  const COMPETING = /^(\.prettierrc(\..*)?|prettier\.config\.(js|cjs|mjs|ts))$/;
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(repoRoot, full);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (COMPETING.test(entry.name)) {
        offenders.push(rel);
      } else if (entry.name === 'package.json' && !rel.startsWith(SHARED)) {
        const pkg = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (Object.hasOwn(pkg, 'prettier')) offenders.push(`${rel} (prettier key)`);
      }
    }
  };

  walk(repoRoot);
  assert.deepEqual(
    offenders,
    [],
    `Prettier config lives only in @kf/config-prettier (Blueprint §12: zero local overrides). Found: ${offenders.join(', ')}`,
  );
});
