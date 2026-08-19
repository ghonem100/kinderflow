/**
 * lint-staged — pre-commit formatting and linting (Sprint 0 Guide §8).
 *
 * Written as a function rather than a glob map so that the protected-path
 * exclusion is a property of the PATH, applied once, and every task inherits
 * it. A future markdown linter, spell checker, or link checker added below is
 * automatically out of scope for protected paths without touching this filter.
 *
 * Why not a negated glob: lint-staged matches with picomatch, and neither
 * negated form survives contact with this repository.
 *   `!(docs)/**` + markdown  excludes docs but also stops matching root-level
 *                            README.md, which must stay formatted.
 *   `!docs/**` + markdown    negates the whole pattern and starts matching
 *                            non-markdown files such as package.json.
 * Both would also have to be repeated in every key, which is exactly the
 * per-tool coupling this shape avoids.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Paths automation must never rewrite (KF-S0-INFRA-005b, risk R-12).
 *
 * `docs/` holds the approved Phase 0-9 documentation — the project's source of
 * truth. It is hand-authored and controlled: table alignment, emphasis markers,
 * and line wrapping carry intent a formatter does not understand. Rewriting it
 * on commit produced noisy diffs against approved documents and taught the team
 * to reach for `--no-verify`, which disables the commit-message gate too.
 *
 * This is deliberately NOT `.prettierignore`. A developer who owns a document
 * must still be able to run `prettier --write` on it by hand; what is banned is
 * the AUTOMATIC path.
 */
const PROTECTED_PATHS = ['docs/'];

/** This file sits at the repository root, so its directory is the root. */
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/** lint-staged passes absolute paths; compare on POSIX-style relative ones. */
const toRepoRelative = (absolute) => path.relative(repoRoot, absolute).split(path.sep).join('/');

const isProtected = (relative) => PROTECTED_PATHS.some((prefix) => relative.startsWith(prefix));

const CODE = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/;
const TEXT = /\.(?:json|md|yml|yaml)$/;

const args = (files) => files.map((file) => `"${file}"`).join(' ');

export default (stagedFiles) => {
  // One filter, applied before any task sees a file.
  const eligible = stagedFiles.map(toRepoRelative).filter((file) => !isProtected(file));

  const code = eligible.filter((file) => CODE.test(file));
  const text = eligible.filter((file) => TEXT.test(file));

  const tasks = [];
  if (code.length > 0) {
    tasks.push(`eslint --fix ${args(code)}`);
    tasks.push(`prettier --write ${args(code)}`);
  }
  if (text.length > 0) {
    tasks.push(`prettier --write ${args(text)}`);
  }
  return tasks;
};
