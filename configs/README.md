# configs/

Shared base configuration consumed by every workspace package — **one source, zero local overrides** (Blueprint §12).

Per Blueprint §1 and Sprint 0 Guide §1.2, this directory will hold:

| Package | Contents |
|---|---|
| `@kf/config-ts` | `tsconfig.base.json` — strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022, `moduleResolution: bundler`; project references across packages (Sprint 0 Guide §1.3) |
| `@kf/config-eslint` | ESLint flat config, including the KinderFlow-specific rules (no raw hex/px in app code, logical properties only, no `any`, module-boundary rules) |
| `@kf/config-prettier` | Prettier base config |
| `@kf/config-tailwind` | Tailwind base preset, consuming `@kf/tokens` |

**Status: intentionally empty.** These packages are created by `KF-S0-INFRA-003` (Shared configs package). This directory is a `pnpm-workspace.yaml` glob root (`configs/*`), so its members are workspace packages once they exist.

Nothing in this directory is created by `KF-S0-INFRA-002`, which establishes the workspace tree only.
