---
'@kf/contracts': minor
---

Establish the API contract: OpenAPI 3.1 skeleton, permission map, error catalog, enums, schemas and events.

`@kf/contracts` becomes the single source of API truth (KF-S0-CONTRACT-001).

- **`permissions.ts`** — 107 permission codes across 34 resource tokens, transcribed verbatim from the API Contract §2 `Perm` column, with `resource:*` wildcards expanded from the RBAC §3 matrix. `PERMISSIONS_DERIVATION.md` traces every code to the document row it came from.
- **`errors.ts`** — the full §4 catalog (46 codes) with derived i18n keys and the security-event ids §4 names. Nine codes carry the two HTTP statuses §4 gives them rather than a silently picked one.
- **`enums.ts`** — all sixteen Domain Part 8 enums. Three ship with no members, typed `never`, because no approved document defines their member set (DISC-017); using one is a compile error rather than a guess.
- **`openapi.yaml`** — root plus a `$ref` split into `paths/` and `components/`, with `/health/*` and the §2.1 `/auth/*` operations as definitions only. Every operation declares `x-permission-code`.
- **`client.ts`** — a typed fetch client over the generated types. Errors are returned, not thrown.
- **Codegen and drift gate** — `pnpm --filter @kf/contracts generate` writes the API types and the operation manifest; `generate:check` fails CI when the spec changes without regenerating.

Also fixes a root `turbo.json` bug found while wiring this package: the `test` task depended on `^build` only, so a package's tests ran without its own build. From a clean clone `pnpm test` passed only because turbo replayed a cached log; the first real run would have failed on a missing `dist/`.
