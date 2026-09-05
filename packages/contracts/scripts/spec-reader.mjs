/**
 * A deliberately small reader for the parts of the spec the CI gates check.
 *
 * WHY NOT A YAML PARSER. No approved document authorizes one, and adding a
 * dependency is a DECISION REQUIRED escalation (workflow §4 rule 4). The
 * precedent is KF-S0-CI-003's migration linter, which reads SQL line-wise for
 * the same reason: a full parser is a large dependency for a gate that must
 * stay obvious. `yaml` and `js-yaml` exist in the store as transitive
 * dependencies of other packages, and reaching for one of those would be a
 * phantom dependency — worse than either honest option.
 *
 * WHY THIS IS SAFE ANYWAY. A hand-rolled reader can silently miss an
 * operation, and a gate that misses an operation is the failure mode this
 * whole package exists to prevent. So it is never trusted on its own: the
 * contracts test cross-checks the operation ids found here against the
 * `operations` interface that openapi-typescript — a real parser, running the
 * Redocly resolver — produced from the same files. If this reader misses an
 * operation, that assertion fails. The crude reader is checked by the real one.
 *
 * It reads ONLY operation-level scalars and the four `x-` extensions. It does
 * not resolve `$ref`, and it must never be given a job that needs to.
 */
import fs from 'node:fs';
import path from 'node:path';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

/** `key: value` at exactly `indent` spaces. */
const fieldAt = (line, indent) => {
  const re = new RegExp(`^ {${indent}}([A-Za-z][A-Za-z0-9-]*): ?(.*)$`);
  return re.exec(line);
};

/** Strips YAML quoting from a scalar. Flow sequences come back as arrays. */
function scalar(raw) {
  const value = raw.trim();
  if (value === '') return '';
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return value.replace(/^['"]|['"]$/g, '');
}

/**
 * Every operation in one `paths/*.yaml`.
 *
 * Shape assumed, and it is the shape every file in `paths/` is authored in:
 *
 *     pathKey:                 # column 0
 *       post:                  # 2 spaces — the operation
 *         operationId: x       # 4 spaces — its fields
 *         x-permission-code: y
 */
export function readOperationsFromFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const operations = [];
  let current = null;

  const close = () => {
    if (current) operations.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const method = fieldAt(line, 2);
    if (method && HTTP_METHODS.has(method[1]) && method[2].trim() === '') {
      close();
      current = {
        file,
        line: i + 1,
        method: method[1],
        operationId: null,
        permissionCode: null,
        rateLimitTier: null,
        auditEvents: null,
        idempotency: null,
      };
      continue;
    }

    // Any key back at column 0 or 2 ends the operation we were reading.
    if (current && /^ {0,2}[A-Za-z]/.test(line) && !fieldAt(line, 2)) {
      close();
      continue;
    }
    if (current && fieldAt(line, 2) && !HTTP_METHODS.has(fieldAt(line, 2)[1])) {
      close();
      continue;
    }

    if (!current) continue;

    const field = fieldAt(line, 4);
    if (!field) continue;
    const [, name, raw] = field;

    if (name === 'operationId') current.operationId = scalar(raw);
    else if (name === 'x-permission-code') current.permissionCode = scalar(raw);
    else if (name === 'x-rate-limit-tier') current.rateLimitTier = scalar(raw);
    else if (name === 'x-audit-events') current.auditEvents = scalar(raw);
    else if (name === 'x-idempotency') current.idempotency = scalar(raw);
  }
  close();

  return operations;
}

/** Every operation across `paths/`, sorted by operation id for stable output. */
export function readOperations(pathsDir) {
  const files = fs
    .readdirSync(pathsDir)
    .filter((name) => name.toLowerCase().endsWith('.yaml'))
    .sort();

  const all = files.flatMap((name) => readOperationsFromFile(path.join(pathsDir, name)));
  return all.sort((a, b) => String(a.operationId).localeCompare(String(b.operationId)));
}

/**
 * Error codes written into spec prose. SCREAMING_SNAKE with at least one
 * underscore, which is what distinguishes a catalog code (`AUTH_REQUIRED`)
 * from a security event id (`SEC-AUTH-001`) or a rate tier (`RL-A`), both of
 * which use hyphens.
 */
export function readReferencedErrorCodes(dirs) {
  const found = new Map();

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith('.yaml')) continue;

      const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        for (const match of lines[i].matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)) {
          if (!found.has(match[0])) found.set(match[0], `${full}:${i + 1}`);
        }
      }
    }
  };

  for (const dir of dirs) if (fs.existsSync(dir)) walk(dir);
  return found;
}
