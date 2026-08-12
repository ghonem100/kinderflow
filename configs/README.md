# configs/

Shared base configuration consumed by every workspace package — **one source, zero local overrides** (Blueprint §12).

## What exists now (`KF-S0-INFRA-003`)

| Package | Path | Contents |
|---|---|---|
| `@kf/config-ts` | `configs/ts/` | `tsconfig.base.json` — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022 target/lib, `moduleResolution: bundler`, plus `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames` (Sprint 0 Guide §1.3) |
| `@kf/config-eslint` | `configs/eslint/` | ESLint 9 flat config: a `base` config plus a `web` overlay carrying the three KinderFlow custom rules |
| `@kf/config-prettier` | `configs/prettier/` | `index.json` — the **only** Prettier config in the repository |

### The custom rules

| Rule | Scope | Enforces |
|---|---|---|
| no-physical-direction-classes | `apps/web`, `packages/ui` | No `pl-`, `pr-`, `ml-`, `mr-`, `left-`, `right-`. Error message names the logical replacement (`ps-*` for `pl-*`, …). Design System §2.6 |
| no-raw-token-values | `apps/web`, `packages/ui` | No raw hex colors, no raw `px` values. Error message points to `@kf/tokens`. Design System §02, §2.3–§2.5 |
| no `any` | repository-wide | `@typescript-eslint/no-explicit-any` as an **error**. Blueprint §12 |

### Consuming these configs

Nothing is wired up yet — packages attach themselves in later tasks. The intended shapes:

```js
// repository root
import { base, web } from '@kf/config-eslint';
export default [...base, ...web];

// inside apps/web or packages/ui (already rooted in scope)
import { base, webRules } from '@kf/config-eslint';
export default [...base, { rules: webRules }];
```

```jsonc
// any package's tsconfig.json (extends only — references are INFRA-004)
{ "extends": "@kf/config-ts/tsconfig.base.json" }
```

### Verifying the rules

`configs/__fixtures__/` holds one file per rule that **must** fail lint, plus a clean file that **must** pass (proving the rules are not over-broad). They are excluded from normal lint runs by the `**/__fixtures__/**` ignore in the base config, and asserted by:

```
pnpm lint:rules
```

The assertions use the Node 22 built-in test runner (`node --test`) — no test framework is installed, because the runner choice belongs to Blueprint §8 and is not this task's decision.

## Still deferred

| Item | Owner task |
|---|---|
| Per-package `tsconfig.json` with `composite` / project references, and `turbo.json` | `KF-S0-INFRA-004` |
| Husky, lint-staged, commitlint, Changesets, Renovate | `KF-S0-INFRA-005` |
| Wiring each package to these configs (root and per-package config files) | later Sprint 0 tasks |
| Running lint/format as a blocking gate | `KF-S0-CI-001` |

**No `@kf/config-tailwind` package.** Sprint 0 Guide §1.2 lists one, but Blueprint §1 and `KF-S0-FE-002` both assign the Tailwind preset to `@kf/tokens` as the single generated source. Creating it here would duplicate that deliverable (decision D-5).
