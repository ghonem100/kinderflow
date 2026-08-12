# tooling/

Repository-internal tooling that backs the CI gates. Not shipped, not imported by application code.

Per Blueprint §1 and Sprint 0 Guide §1.2, this directory will hold:

| Package | Purpose | Gate |
|---|---|---|
| `depcruise/` | Module-boundary rules — forbids cross-module deep imports and `domain → nest` imports (Blueprint §3) | TR-02 |
| `migration-lint/` | RLS-class annotation checker — fails when a new tenant table lands without a policy class | TR-01 |
| `generators/` | OpenAPI → TS types, Postman collection, design-token build pipeline | — |

**Status: intentionally empty.** These packages are created by the Sprint 0 CI and tooling tasks (`KF-S0-CI-*`, and the boundary/migration-lint gates they depend on). This directory is a `pnpm-workspace.yaml` glob root (`tooling/*`), so its members are workspace packages once they exist.

Nothing in this directory is created by `KF-S0-INFRA-002`, which establishes the workspace tree only.
