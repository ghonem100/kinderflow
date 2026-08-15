/**
 * Repository-root ESLint flat config.
 *
 * Consumes the shared config published by KF-S0-INFRA-003 using the exact shape
 * documented in `configs/README.md`. Imported by relative path rather than by
 * package name so the workspace dependency graph stays as KF-S0-INFRA-004 left
 * it (see that task's decision D-7).
 *
 * `base` carries the repository-wide rules and the ignore list, including
 * `configs/__fixtures__` — those files violate the custom rules on purpose and
 * must never break a real lint run.
 * `web` scopes the RTL and design-token rules to `apps/web` and `packages/ui`.
 */
import { base, web } from './configs/eslint/index.mjs';

export default [...base, ...web];
