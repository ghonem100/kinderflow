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
import { DIRECTIONAL_UTILITIES } from '../web.mjs';

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

// --- KF-S0-INFRA-003a ---

test('003a AC1 — each newly banned family fails lint naming its own replacement', async () => {
  const result = await lintFixture('physical-direction.fixture.ts');
  const text = messagesOf(result);

  // The four utilities named in the acceptance criterion, each with its replacement.
  const required = [
    ['border-l-*', 'border-s-*'],
    ['rounded-tl-*', 'rounded-ss-*'],
    ['text-left', 'text-start'],
    ['float-right', 'float-end'],
  ];

  for (const [physical, logical] of required) {
    assert.ok(text.includes(physical), `expected an error naming ${physical}`);
    assert.ok(
      text.includes(logical),
      `error for ${physical} must name its replacement ${logical}, not a generic list`,
    );
  }
});

test('003a AC1 — every banned family is represented in the fixture', async () => {
  const result = await lintFixture('physical-direction.fixture.ts');
  const text = messagesOf(result);

  const uncovered = DIRECTIONAL_UTILITIES.filter(({ physical }) => !text.includes(physical));
  assert.deepEqual(
    uncovered.map((u) => u.physical),
    [],
    'every entry in DIRECTIONAL_UTILITIES must have a failing fixture case',
  );
});

test('003a — variant prefix, negative value, and template literal fire on new families', async () => {
  const result = await lintFixture('physical-direction.fixture.ts');
  const lines = result.messages.map((m) => m.line);
  const source = fs
    .readFileSync(path.join(fixturesDir, 'physical-direction.fixture.ts'), 'utf8')
    .split('\n');

  for (const needle of ['md:border-l-2', '-scroll-ml-2', 'rounded-br-lg']) {
    const lineNo = source.findIndex((l) => l.includes(needle)) + 1;
    assert.ok(lineNo > 0, `fixture must contain ${needle}`);
    assert.ok(lines.includes(lineNo), `${needle} (line ${lineNo}) must be flagged`);
  }
});

test('003a AC2 — logical replacements pass lint', async () => {
  const result = await lintFixture('clean.fixture.ts');
  const source = fs.readFileSync(path.join(fixturesDir, 'clean.fixture.ts'), 'utf8');

  for (const logical of ['border-s-2', 'rounded-ss-lg', 'text-start', 'float-start']) {
    assert.ok(source.includes(logical), `clean fixture must exercise ${logical}`);
  }
  assert.equal(result.errorCount, 0, `logical forms must not be flagged:\n${messagesOf(result)}`);
});

test('003a — utilities with no logical equivalent are NOT banned', async () => {
  const result = await lintFixture('clean.fixture.ts');
  const source = fs.readFileSync(path.join(fixturesDir, 'clean.fixture.ts'), 'utf8');

  // Planner rule of thumb (R-6): ban only what we can name a replacement for.
  for (const allowed of ['inset-x-4', 'origin-left', 'bg-left', 'rounded-t-lg', 'border-t-2']) {
    assert.ok(source.includes(allowed), `clean fixture must pin ${allowed} as allowed`);
  }
  // Near misses that previously risked false positives.
  for (const nearMiss of ['rounded-lg', '--kf-border-left-legacy', 'left-hand', 'right-click']) {
    assert.ok(source.includes(nearMiss), `clean fixture must pin near-miss ${nearMiss}`);
  }
  assert.equal(result.errorCount, 0, `no over-reach allowed:\n${messagesOf(result)}`);
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
