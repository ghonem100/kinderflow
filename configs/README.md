# configs/

Shared base configuration consumed by every workspace package — **one source, zero local overrides** (Blueprint §12).

## What exists now (`KF-S0-INFRA-003`)

| Package               | Path                | Contents                                                                                                                                                                                                                                                     |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@kf/config-ts`       | `configs/ts/`       | `tsconfig.base.json` — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022 target/lib, `moduleResolution: bundler`, plus `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames` (Sprint 0 Guide §1.3) |
| `@kf/config-eslint`   | `configs/eslint/`   | ESLint 9 flat config: a `base` config plus a `web` overlay carrying the three KinderFlow custom rules                                                                                                                                                        |
| `@kf/config-prettier` | `configs/prettier/` | `index.json` — the **only** Prettier config in the repository                                                                                                                                                                                                |

### How Prettier finds the shared config

The root `package.json` carries one key:

```jsonc
"prettier": "./configs/prettier/index.json"
```

That single line is the whole discovery mechanism. Because it lives where Prettier already looks, **everything** picks the shared style up automatically — `pnpm exec prettier --write` with no flags, the `lint-staged` pre-commit step, and editor format-on-save. There is no `--config` argument anywhere.

It is written as a **relative path**, not as `@kf/config-prettier`. Both forms resolve today, but the package-name form only works because pnpm happens to have linked `node_modules/@kf/config-prettier` even though the root package does not declare a dependency on it. Relying on an undeclared symlink would break on a stricter install; the path always resolves.

Adding a `prettier` key to any **other** package, or any standalone `.prettierrc*` / `prettier.config.*` file anywhere in the tree, is a competing config and fails `pnpm lint:rules`. The single root key is the only exemption.

### Commit scopes

`commitlint.config.mjs` enforces the scope list. A scope answers one question — **where in the codebase did this change land?** — so the enum is a single code-location taxonomy drawn from three families (28 scopes, deduped and sorted):

| Family     | Source                                     | Scopes                                                                                                                                             |
| ---------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modules    | SAD §3.1, plus Domain Model Part 2.12–2.13 | `shared-kernel` `iam` `tenancy` `children` `attendance` `activities` `billing` `communication` `staff` `ai` `media` `platform` `analytics` `audit` |
| Packages   | Blueprint §1 (without the `@kf/` prefix)   | `api` `web` `contracts` `tokens` `ui` `i18n` `shared` `configs` `tooling`                                                                          |
| Structural | Repository areas that are neither          | `repo` `execution` `deps` `docs` `ci`                                                                                                              |

An empty scope is allowed — the baseline import commit legitimately has none.

Two clarifications worth keeping:

- **`shared` and `shared-kernel` are different places.** `shared` is `packages/shared` (isomorphic, zero-dependency utilities). `shared-kernel` is `apps/api/src/shared-kernel` (SAD §3.1). They are not synonyms; do not merge them.
- **Master Backlog epic codes are NOT scopes.** `bill`, `att`, `comm` and friends are a _planning_ taxonomy. Carrying them alongside module names gave two names for one directory, which makes `git log --grep` and changelog grouping unreliable. Task IDs belong in the commit subject text or body, not the scope.

### The custom rules

| Rule                          | Scope                     | Enforces                                                                                                                                      |
| ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| no-physical-direction-classes | `apps/web`, `packages/ui` | No directional Tailwind utility that has a logical equivalent — full list below. Each error names **its own** replacement. Design System §2.6 |
| no-raw-token-values           | `apps/web`, `packages/ui` | No raw hex colors, no raw `px` values. Error message points to `@kf/tokens`. Design System §02, §2.3–§2.5                                     |
| no `any`                      | repository-wide           | `@typescript-eslint/no-explicit-any` as an **error**. Blueprint §12                                                                           |

### The banned directional set (KF-S0-INFRA-003a)

Design System §2.6: _"no `left/right` in any component spec."_ Every utility below has a Tailwind logical equivalent, so every one is banned and every error names its replacement.

| Physical utility | Use instead    | Property                    |
| ---------------- | -------------- | --------------------------- |
| `pl-*`           | `ps-*`         | padding inline-start        |
| `pr-*`           | `pe-*`         | padding inline-end          |
| `ml-*`           | `ms-*`         | margin inline-start         |
| `mr-*`           | `me-*`         | margin inline-end           |
| `left-*`         | `start-*`      | inset inline-start          |
| `right-*`        | `end-*`        | inset inline-end            |
| `border-l-*`     | `border-s-*`   | border inline-start         |
| `border-r-*`     | `border-e-*`   | border inline-end           |
| `rounded-l-*`    | `rounded-s-*`  | both inline-start corners   |
| `rounded-r-*`    | `rounded-e-*`  | both inline-end corners     |
| `rounded-tl-*`   | `rounded-ss-*` | start-start corner          |
| `rounded-tr-*`   | `rounded-se-*` | start-end corner            |
| `rounded-bl-*`   | `rounded-es-*` | end-start corner            |
| `rounded-br-*`   | `rounded-ee-*` | end-end corner              |
| `scroll-ml-*`    | `scroll-ms-*`  | scroll margin inline-start  |
| `scroll-mr-*`    | `scroll-me-*`  | scroll margin inline-end    |
| `scroll-pl-*`    | `scroll-ps-*`  | scroll padding inline-start |
| `scroll-pr-*`    | `scroll-pe-*`  | scroll padding inline-end   |
| `text-left`      | `text-start`   | text alignment              |
| `text-right`     | `text-end`     | text alignment              |
| `float-left`     | `float-start`  | float                       |
| `float-right`    | `float-end`    | float                       |
| `clear-left`     | `clear-start`  | clear                       |
| `clear-right`    | `clear-end`    | clear                       |

The `border-*` and `rounded-*` entries also catch the **bare** forms Tailwind allows (`border-l`, `rounded-tl`), which break RTL identically.

**Deliberately NOT banned** — the governing rule is _ban a utility only if a logical replacement exists_; a rule that cannot name a replacement is a rule engineers disable:

| Allowed                                                  | Why                                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `inset-x-*`, `inset-y-*`                                 | Direction-neutral — they set both sides                                                                                                 |
| `rounded-t-*`, `rounded-b-*`, `border-t-*`, `border-b-*` | Block axis. Top/bottom are not start/end and do not mirror in RTL                                                                       |
| `origin-left`, `bg-left`                                 | `transform-origin` / `background-position` have no Tailwind logical counterpart                                                         |
| `text-left` in prose, `--kf-border-left-legacy`          | Not class tokens. `left-*`/`right-*` are value-guarded so ordinary English ("the left-hand column", "right-click") never trips the rule |

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

| Item                                                                                | Owner task           |
| ----------------------------------------------------------------------------------- | -------------------- |
| Per-package `tsconfig.json` with `composite` / project references, and `turbo.json` | `KF-S0-INFRA-004`    |
| Husky, lint-staged, commitlint, Changesets, Renovate                                | `KF-S0-INFRA-005`    |
| Wiring each package to these configs (root and per-package config files)            | later Sprint 0 tasks |
| Running lint/format as a blocking gate                                              | `KF-S0-CI-001`       |

**No `@kf/config-tailwind` package.** Sprint 0 Guide §1.2 lists one, but Blueprint §1 and `KF-S0-FE-002` both assign the Tailwind preset to `@kf/tokens` as the single generated source. Creating it here would duplicate that deliverable (decision D-5).
