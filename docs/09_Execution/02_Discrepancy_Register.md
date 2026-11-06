# 02 — Architecture / Implementation Discrepancy Register

| Field | Value |
|-------|-------|
| Document | Discrepancy Register (Phase 9) |
| Version | 1.0 |
| Date | 2026-08-10 |
| Rule | **Nothing here is fixed in Phase 9.** Each entry states a recommended resolution and the task that will execute it. Silent modification of either the repository or the approved documents is forbidden |
| Baseline | `01_Implementation_Baseline.md` — zero code exists, so every discrepancy is document-vs-document or document-vs-scaffold |

Severity scale: **P0** blocks Sprint 0 · **P1** must resolve within Sprint 0–1 · **P2** resolve before beta · **P3** cosmetic/housekeeping.

---

## DISC-001 — Repository layout: scaffold vs. approved monorepo

| Field | Content |
|---|---|
| Document | Engineering Blueprint §1; Sprint 0 Guide §1.2 |
| Current implementation | Root folders `backend/`, `frontend/`, `mobile-parent/`, `mobile-teacher/`, `infrastructure/`, `scripts/` (all empty, `.gitkeep` only) |
| Approved design | pnpm monorepo: `apps/api`, `apps/web`, `packages/{contracts,tokens,ui,i18n,shared}`, `configs/`, `tooling/`, `infrastructure/`, `scripts/`, `docs/`. `mobile-parent`/`mobile-teacher` reserved but empty until V2 (ADR-009) |
| Impact | Low technically (no code to move), high if unaddressed — engineers could start work in the wrong tree and violate boundary rules from day one |
| Recommended resolution | Execute Blueprint §1 layout during `KF-S0-INFRA-002`; convert `backend/` → `apps/api`, `frontend/` → `apps/web`; keep `mobile-*` folders with a README stating "V2 — ADR-009, intentionally empty" |
| ADR required | No — Blueprint §1 already approved this layout |
| Priority | **P0** |

## DISC-002 — README describes the superseded structure

| Field | Content |
|---|---|
| Document | Root `README.md` vs. Engineering Blueprint §1 |
| Current implementation | README's "Repository Structure" table lists `backend/`, `frontend/`, `mobile-parent/`, `mobile-teacher/` as the architecture |
| Approved design | Monorepo layout (DISC-001); README should be the quickstart + workspace map per Sprint 0 Guide §9 |
| Impact | **Escalated 2026-08-10 (after `KF-S0-INFRA-002`):** the README no longer merely describes a superseded layout — it points at `backend/` and `frontend/`, directories that have been deleted. It is now actively wrong, and it is the first artifact a new engineer reads |
| Recommended resolution | Rewrite README in `KF-S0-DOC-001` per Sprint 0 Guide §9 (quickstart, workspace map, links to phase docs) |
| ADR required | No |
| Priority | **P0** (escalated from P1 on 2026-08-10 — stale paths, not merely stale prose) |

## DISC-003 — TR-10 spike not executed; ADR-010 does not exist

| Field | Content |
|---|---|
| Document | SAD §13 (TR-10), Sprint 0 Guide §11, Blueprint §6 (S0 exit criteria) |
| Current implementation | No spike, no benchmark, no ADR-010, no isolation harness |
| Approved design | ADR-008 mandates shared-schema + RLS; the *integration pattern* between Prisma and RLS is explicitly undecided pending the spike, with a documented fallback (option C) |
| Impact | **Critical.** Every database-backed feature depends on the tenant-context pattern. Building modules before this decision risks rewriting every repository and every transaction boundary |
| Recommended resolution | `KF-S0-RLS-001…005` (Sprint 0 Item 0, CRITICAL). No task with a Database Requirements block may start until ADR-010 is merged |
| ADR required | **Yes — ADR-010** (chosen pattern, benchmarks, failure-mode evidence, coding rules) |
| Priority | **P0** |

## DISC-004 — Empty documentation folders vs. content location

| Field | Content |
|---|---|
| Document | Repo `docs/02_Requirements/`, `docs/08_AI/`, `docs/09_Deployment/` (all empty) |
| Current implementation | Empty directories |
| Approved design | Requirements live in BRD §2–3 and SAD §9 (NFRs); AI design lives in SAD §7 + Blueprint §5; deployment lives in SAD §11 + Blueprint §9. The content exists — the folders do not hold it |
| Impact | Low, but a reader following the folder map will conclude the work is missing |
| Recommended resolution | Add a one-paragraph `README.md` pointer file in each empty folder naming the authoritative document and section (`KF-S0-DOC-002`). Do **not** duplicate content |
| ADR required | No |
| Priority | **P3** |

## DISC-005 — Version control absent

| Field | Content |
|---|---|
| Document | Blueprint §12 (branching, commit convention, PR flow), Sprint 0 Guide §3 (CI on PRs) |
| Current implementation | No `.git`; no remote; no branch protection |
| Approved design | Trunk-based development, conventional commits, PR-gated CI with blocking checks |
| Impact | Blocks every process control the architecture relies on (review, CI gates, CODEOWNERS) |
| Recommended resolution | `KF-S0-INFRA-001` (git init + first commit) and `KF-S0-OPS-001` (remote, branch protection rules requiring the blocking checks) |
| ADR required | No |
| Priority | **P0** |

## DISC-006 — Founder decisions open (F1–F4) referenced as resolved dependencies

| Field | Content |
|---|---|
| Document | BRD §12.2 (F1 price points, F2 PDPL review, F3 payment gateway, F4 hosting region) |
| Current implementation | All four open |
| Approved design | F4 (hosting region) was scheduled to be decided *inside* the architecture phase but was carried forward; F2 is a hard launch gate |
| Impact | F4 blocks production provisioning (`KF-S0-OPS-003`); F2 blocks beta launch and the LLM data-processing decision; F1 blocks subscription-plan seed values (`KF-S1-TENANT-006` ships plan *structure* with placeholder limits flagged as `TODO-F1` in seed data, not in code logic); F3 affects nothing before Phase 2 |
| Recommended resolution | Founder track: decide F4 before Sprint 0 task 0.15; start F2 legal review immediately (longest lead) |
| ADR required | F4 — **yes if** the chosen region implies a hosting-provider change (ADR-011 reserved) |
| Priority | **P1** (F4), **P1** (F2), **P2** (F1), **P3** (F3) |

## DISC-007 — UX decisions UXD-01…04 unconfirmed

| Field | Content |
|---|---|
| Document | Design System §20 (open UX decisions) |
| Current implementation | Unconfirmed |
| Approved design | Recommendations exist: UXD-01 LTR time axis on charts; UXD-02 Western digits in Arabic; UXD-03 Gregorian-only dates; UXD-04 report must be opened before approve is enabled |
| Impact | UXD-02/03 affect the `@kf/i18n` formatters built in Sprint 0 (`KF-S0-FE-004`) — every number and date in the product; UXD-04 affects the S4 report-approval gate; UXD-01 affects S7 charts |
| Recommended resolution | Founder confirms UXD-02/03 before `KF-S0-FE-004`. If unconfirmed at task start, implement the documented recommendation behind a config constant and register as accepted debt (do **not** guess a different behavior) |
| ADR required | No — design decisions, recorded in Design System §20 |
| Priority | **P1** (UXD-02/03), **P2** (UXD-04), **P3** (UXD-01) |

## DISC-008 — Team-size assumption unvalidated

| Field | Content |
|---|---|
| Document | Blueprint §6 (assumes 2 BE, 2 FE, 1 lead, part-time designer); Sprint 0 Guide §10 owner column |
| Current implementation | Team composition unknown |
| Approved design | 9 sprints × 2 weeks with that staffing |
| Impact | Sprint boundaries and owner assignments in this backlog are notional until confirmed; a smaller team does not change task order or content, only calendar duration |
| Recommended resolution | Founder confirms staffing (Sprint 0 item 0.20). Backlog task *content* is staffing-independent by design — re-plan durations only |
| ADR required | No |
| Priority | **P1** |

## DISC-009 — External infrastructure accounts unconfirmed

| Field | Content |
|---|---|
| Document | Blueprint §9; Sprint 0 Guide §7 |
| Current implementation | GitHub org/repo, container registry, Coolify host, S3-compatible storage, SMTP/SMS providers — none confirmed |
| Approved design | CI/CD to Coolify, images in a registry, media + encrypted backups in S3-compatible storage |
| Impact | Blocks `KF-S0-OPS-001…005`; does not block local development tasks |
| Recommended resolution | Founder/DevOps procure before Sprint 0 week 2; local-first tasks proceed meanwhile |
| ADR required | No (unless a different hosting model is chosen → ADR required per instruction §18) |
| Priority | **P1** |

## DISC-010 — Documentation date stamps precede the current date

| Field | Content |
|---|---|
| Document | All Phase 0–8 documents dated 2026-07-18; current date 2026-08-10 |
| Current implementation | n/a |
| Approved design | n/a |
| Impact | Cosmetic only; no content implication |
| Recommended resolution | Leave as authored dates (they record when the decision was made). Phase 9 documents carry 2026-08-10. Add revision-history rows only when content changes |
| ADR required | No |
| Priority | **P3** |

## DISC-011 — Shared zod schema location: `@kf/shared` vs `@kf/contracts`

| Field | Content |
|---|---|
| Document | Blueprint §2 (Forms row) vs. `04_Sprint_0.md` → `KF-S0-CONTRACT-001` (Zod schemas row) |
| Current implementation | Neither package holds schemas yet — both are placeholders (`KF-S0-INFRA-004`) |
| Approved design | **Contradictory.** Blueprint §2: "zod schemas imported from `packages/shared`". CONTRACT-001: zod schemas are a `@kf/contracts` artifact under `schemas/`, consumed by web forms and mirrored by API DTO validators |
| Impact | Would have surfaced as rework in `KF-S0-CONTRACT-001` and every form from Sprint 1 onward. Schemas split across two packages, or duplicated, is the failure mode |
| Resolution (founder, 2026-08-10) | **`@kf/contracts`.** DTO schemas are contract artifacts and must version with the OpenAPI spec they mirror — the OpenAPI diff gate cannot catch drift in a package it does not govern. `@kf/shared` keeps framework-free pure utils only (Money math, domain primitives). Blueprint §2 amended |
| ADR required | No — package-boundary clarification within the approved architecture |
| Priority | **Resolved** (was P1 — would have blocked CONTRACT-001) |

## DISC-012 — The committed model manifest is hand-edited, so `generate.mjs --check` will report it STALE

| Field | Content |
|---|---|
| Document | `tooling/tenancy-manifest/generate.mjs` (its own emitted template) vs. the committed `apps/api/src/shared-kernel/tenancy/model-manifest.generated.ts` |
| Current implementation | The committed manifest carries an "EMPTY ON PURPOSE" explanatory block — why the spike's models were not merged, and what `KF-S0-CI-001` must wire — that the generator does not emit. `--check` compares the whole file byte-for-byte (`current !== body`), so the two have never matched. Found during `KF-S0-CI-003` while adding the table-name sets required by finding F-4, which had to be hand-written into the same file to keep it consistent with the generator |
| Approved design | The file header says "GENERATED … do not edit". A generated file with hand-written prose in it is neither generated nor authored |
| Impact | Low today: nothing can run `--check` because `schema.prisma` does not exist, and `KF-S0-API-003` regenerates the manifest as part of its own work, which resolves the drift by overwriting it. Two real costs remain — `KF-S0-CI-001` wiring `generate.mjs --check` before `API-003` lands would get a STALE failure with no way to fix it, and the "EMPTY ON PURPOSE" rationale (which is genuinely useful) is destroyed on first regeneration with no home to move to |
| Recommended resolution | In `KF-S0-API-003`, when the manifest is first regenerated: let the generator own the file completely, and move the "EMPTY ON PURPOSE" rationale into `tooling/tenancy-manifest/generate.mjs` as a comment where it will survive. Do **not** teach the generator to preserve hand-written blocks — that reintroduces the same ambiguity |
| Resolution (2026-10-02, `KF-S0-API-003`) | **Closed exactly as recommended.** The manifest is regenerated from `schema.prisma` and is byte-for-byte what the generator emits; `generate.mjs --check` passes and a test asserts it. The two notes worth keeping — why the spike's models were not merged, and that `KF-S0-CI-001` must wire `--check` — now live in the generator's header. One thing the entry did not anticipate: Prettier would have rewritten the generated file and made `--check` fail on **formatting** rather than drift, and `lint-staged` runs `prettier --write` on every staged code file. Two guards were added — the generator emits the collapsed `new Set([])` Prettier would produce, and the file is listed in `.prettierignore` |
| ADR required | No — housekeeping within an approved design |
| Priority | **Resolved** (was P3) |

## DISC-013 — `KF-S0-API-003` depends on `KF-S0-CONTRACT-001`, and neither its dependency line nor the critical path says so

| Field | Content |
|---|---|
| Document | `04_Sprint_0.md` → `KF-S0-API-003` Dependencies line, and `13_Dependencies.md` §2 critical path, vs. the body of `KF-S0-API-003` itself |
| Current implementation | API-003's Dependencies names only `KF-S0-RLS-002` and `KF-S0-CI-003`; the §2 diagram draws RLS-002 → API-003 directly |
| Approved design | API-003's own body depends on `@kf/contracts` in three places: Implementation Requirement 4 (permission codes **imported from** `@kf/contracts/permissions`), Acceptance Criterion 3 (DB permission rows must **exactly equal** that map, failing on drift in either direction), and its Testing Requirements (enum parity against `@kf/contracts/enums`) |
| Impact | Not merely ordering — correctness. M-001 creates the PostgreSQL enums and seeds the `permissions` table, and both are measured against this package. Authoring the schema before the enum and permission source of truth exists guarantees a parity argument later with no authority to settle it. AC3 is not checkable at all without the map |
| Recommended resolution | Add `KF-S0-CONTRACT-001` to `KF-S0-API-003`'s Dependencies line and to the `13_Dependencies.md` §2 diagram. No task moves; CONTRACT-001 has no blocking dependency of its own (INFRA-004 is complete), so this records a real edge rather than re-sequencing the sprint |
| ADR required | No |
| Priority | **P1** — must resolve before `KF-S0-API-003` starts |

## DISC-014 — Two permission-code shapes, and an action outside the approved vocabulary

| Field | Content |
|---|---|
| Document | RBAC §2.4 (naming) vs. API Contract §2.14 and §2.17 |
| Current implementation | `packages/contracts/src/permissions.ts` transcribes both shapes verbatim, per the founder-approved transcription rule; `PermissionCode` admits both |
| Approved design | **Contradictory.** RBAC §2.4 defines codes as `{resource}:{action}` and names exactly eight actions plus four specials. §2.17 uses a **three-segment** `platform:{resource}:{action}` form — `platform:tenant:create`, `platform:subscription:update`, `platform:flags:*` (8 codes). §2.14 uses **`ai:configure`**, where `configure` is neither one of the eight actions nor one of the four specials; the §3 *AI configuration & quotas* row holds `R U`, which would give `ai:update` |
| Impact | Low today, structural later. The guard, the `permissions` seed table and every `x-permission-code` all consume this map, so a shape change after Sprint 1 touches all three at once. A parser that assumes two segments silently mis-reads every platform code |
| Recommended resolution | Founder ruling on each, then one PR. Either amend RBAC §2.4 to bless the platform plane's third segment and add `configure` to the action list, or amend API Contract §2.14/§2.17 to fit §2.4. **Do not resolve by editing `permissions.ts`** — it is a transcription, and it must move only after the document it transcribes does |
| ADR required | No — naming clarification within an approved architecture |
| Priority | **P2** — before the first guard is written (`KF-S1-IAM-*`) |

## DISC-015 — RBAC §3 grants letters for resources and actions that no API Contract §2 endpoint exposes

| Field | Content |
|---|---|
| Document | RBAC §3 matrix vs. API Contract §2 endpoint catalog |
| Current implementation | **None of these codes exists in `permissions.ts`.** They are listed in `packages/contracts/PERMISSIONS_DERIVATION.md` Part B with the code each would produce |
| Approved design | 20 residue codes across 13 matrix rows. The largest is **Staff members & assignments** — `C R U D Ar` for OWNER and `C R U` for BRANCH_MANAGER, with **no §2 endpoints at all**. Others are single missing actions: `child:delete`/`child:restore`, `consent:create`/`consent:export`, `attendance:export`, `report:export`, `incident:export`, `invoice:export`/`invoice:approve`, `payment:export`, `credit-note:read`/`credit-note:approve`, `role-assignment:read`/`role-assignment:update`, `tenant-export:*`, `breakglass:read`. Separately, **`report:publish`** is one of RBAC §2.4's four named specials and **no §2 row uses it** — §2.7 maps approve-and-publish to `report:approve`. Two **reverse** discrepancies also exist, where §2 names a code the matrix does not authorise: **`activity:delete`** (§2.7 DELETE `/activity-entries/{id}`, but the §3 *Activity entries* row holds only `C R U` — no role holds `D`, so as written the code exists and nobody can ever use it) and `ai:configure` (see DISC-014) |
| Impact | Medium and cumulative. Every residue item is a capability the RBAC matrix promises a role and the API does not deliver; each will surface as a sprint-time "the matrix says the Owner can export invoices, where is the endpoint?". API Contract §2's own closing line calls any §2↔§3 divergence "a spec bug" |
| Recommended resolution | Founder/Tech Lead sweep of Part B in one sitting, deciding per row: add the endpoint to §2, or strike the letter from §3. Staff is the one that likely needs a real endpoint block. Codes are added to `permissions.ts` **only after** the corresponding §2 row exists — a code invented here becomes a permission row in the database (API-003 AC3) and a guard in the API, backed by no specification |
| ADR required | No |
| Priority | **P2** — before the sprint that first needs each area; Staff blocks `KF-S1`/`KF-S2` staff work |

## DISC-016 — The §4 error catalog assigns two HTTP statuses to nine codes

| Field | Content |
|---|---|
| Document | API Contract §4 |
| Current implementation | `packages/contracts/src/errors.ts` carries both statuses as a tuple (founder decision, 2026-08-31) rather than picking one |
| Approved design | Three rows give two statuses each: `402/422` for `SUBSCRIPTION_LIMIT_REACHED`, `STORAGE_QUOTA_EXCEEDED`, `AI_QUOTA_EXCEEDED`; `415/422` for `MEDIA_TYPE_UNSUPPORTED`, `MEDIA_TOO_LARGE`, `MEDIA_QUARANTINED`; and `502/503` for `AI_PROVIDER_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, `SERVICE_UNAVAILABLE`. §4's own rule says "codes are stable API contract (documented per endpoint in OpenAPI)", which a two-valued status cannot satisfy at the OpenAPI level |
| Impact | Low now, real at implementation. Every one of these codes needs a single number in an OpenAPI response object, so the choice cannot be deferred past the endpoint that returns it. None of the nine appears on this task's seeded `/health` or `/auth` paths, which is why carrying the pair costs nothing today |
| Recommended resolution | `KF-S0-API-001` picks the single status per code as it writes each endpoint, and records the reading here. The likely split is not uniform — 415 belongs to a rejected `Content-Type` and 422 to a rejected body, so the `415/422` row plausibly resolves to different numbers for different codes |
| ADR required | No |
| Priority | **P2** — before the first endpoint returning one of the nine |

## DISC-017 — Three Domain Part 8 enums have no member set in any approved document

| Field | Content |
|---|---|
| Document | Domain Model Part 8 (names the enums), Part 2 lifecycles and Part 3 entity catalog (should supply the members) |
| Current implementation | `packages/contracts/src/enums.ts` declares all sixteen. `SyncStatus`, `NotificationChannel` and `PlanCode` ship with an **empty member tuple**, which types them as `never` so any use fails to compile |
| Approved design | Missing per enum: **`SyncStatus`** — API Contract §5 enumerates `APPLIED / DUPLICATE / PENDING_REVIEW / REJECTED`, but that is the per-event *result* in the sync *response*, not the domain of the stored `attendance_events.sync_status` column; §5 confirms exactly one stored value, `pending_review`. **`NotificationChannel`** — ambiguous rather than absent: SAD §10 describes the worker as "Push/email/SMS dispatch" (three), while SAD §2 covers iOS push limits with "in-app + fallback channels" (a fourth). **`PlanCode`** — BRD D2 fixes "exactly three plans" and Part 3 row 4 requires `unique(code)`, but the three codes are named nowhere and §11 lists price points as TBD |
| Impact | **Blocks part of `KF-S0-API-003`.** M-001 creates these as PostgreSQL enums and the tier-1 seed inserts `subscription_plans` rows keyed by `PlanCode`. Part 8's own note says additive changes are safe but renames need expand-contract, so a guessed member becomes a migration rather than an edit |
| Recommended resolution | Founder answers three questions: the stored domain of `sync_status`; whether `IN_APP` is a notification channel alongside push/email/SMS; and the three plan codes. Then `enums.ts` is filled and the gap closes. Members are **not** invented in the meantime — the empty tuple fails the build at the point of use, which is the correct place to find out |
| ADR required | No — documentation gap, not a design decision |
| Priority | **P1** — `PlanCode` and `SyncStatus` are needed by `KF-S0-API-003` (M-001 seed, M-005 attendance) |

## DISC-018 — Domain Part 8 spells an enum "Media Status", with a space

| Field | Content |
|---|---|
| Document | Domain Model Part 8, Prisma Planning row |
| Current implementation | `packages/contracts/src/enums.ts` exports `MediaStatus` |
| Approved design | The enum list reads `… EmploymentStatus, Media Status, PlanCode`. A space makes it an invalid identifier in TypeScript, Prisma and PostgreSQL alike, so it cannot be transcribed literally |
| Impact | Cosmetic; caught immediately by any attempt to use it |
| Recommended resolution | Correct the typo to `MediaStatus` in Domain Model Part 8 at the next revision of that document. The code already reads `MediaStatus`; nothing depends on the resolution |
| ADR required | No |
| Priority | **P3** |

## DISC-019 — `ActivityType` is enumerated twice, with different members

| Field | Content |
|---|---|
| Document | Domain Model §2.5 vs. API Contract §2.7 |
| Current implementation | `packages/contracts/src/enums.ts` ships **seven** members (founder decision, 2026-08-31) |
| Approved design | **Contradictory.** Domain Model §2.5 defines the aggregate as "ActivityEntry (root; typed: MEAL, NAP, DIAPER, MOOD, LEARNING, NOTE, **MEDICATION_ADMIN**)". API Contract §2.7 describes POST `/activity-entries` as "Log typed event (MEAL/NAP/DIAPER/MOOD/LEARNING/NOTE)" — the same six without `MEDICATION_ADMIN`. Part 8 points at the Domain Model for enums, which is why the seven-member list ships |
| Impact | Low and additive-safe in the direction taken. The risk if §2.7 is the correct list is a PostgreSQL enum member nothing ever writes; the risk in the other direction would have been an expand-contract migration |
| Recommended resolution | Confirm that medication administration is recorded both as its own aggregate (§2.8, `medication_administrations`) **and** as an activity entry for the daily timeline; if so, add `MEDICATION_ADMIN` to API Contract §2.7's list. If not, strike it from Domain §2.5 and drop the member before M-005 |
| ADR required | No |
| Priority | **P2** — before M-005 creates the enum |

## DISC-020 — API Contract §2.1 names an error code the §4 catalog does not define

| Field | Content |
|---|---|
| Document | API Contract §2.1 (`/auth/refresh` row) vs. §4 error catalog |
| Current implementation | `packages/contracts/openapi.yaml` describes the refresh-reuse behaviour **without** naming a code, and says why in the operation description. `errors.ts` does not define one |
| Approved design | §2.1's `/auth/refresh` row reads "`AUTH_TOKEN_REUSED` → family revoked". §4 lists no such code. §4's governance rule (§10) is explicit that "new codes need a catalog PR", and this task's AC3 fails any code named in a path but absent from `errors.ts` |
| Impact | Low but exactly the shape the gate exists to catch: the alternative was inventing a catalog entry to satisfy the test, which would put a code in the API that no approved document authorises |
| Recommended resolution | Add `AUTH_TOKEN_REUSED` to API Contract §4 (401, credential flows) via a catalog PR, then to `errors.ts` and the refresh operation's 401 description. Until then the behaviour is documented in prose and returns a generic 401 from the catalog |
| ADR required | No |
| Priority | **P2** — before `KF-S1-IAM-*` implements refresh rotation |


## DISC-021 — M-000 cannot be a Prisma migration; it is provisioning

| Field | Content |
|---|---|
| Document | Blueprint §4 M-000 row and `KF-S0-API-003` Implementation Requirement 1, vs. `infrastructure/compose/postgres/init/01-init-kinderflow.sh`, `infrastructure/compose/dev.yml` and ADR-008 |
| Current implementation | **Resolved in code.** The extensions, roles, grants and the UUIDv7 generator live in `infrastructure/postgres/bootstrap.sql`, run as a superuser by `bootstrap.sh`. The Prisma migration chain starts at **M-001** |
| Approved design | Requirement 1 asks for extensions and roles in a migration. Three independent blockers, any one decisive: (1) `kf_migrator` is created `NOCREATEROLE` and migrations run as `kf_migrator`, so `CREATE ROLE` is refused; (2) `pg_stat_statements` needs superuser **and** `shared_preload_libraries`, a server setting requiring a restart — `dev.yml` already carries it on the `postgres` command with the comment "must be preloaded or `CREATE EXTENSION` fails"; (3) the compose init script already does all of it, idempotently, as superuser |
| Impact | The task could not be executed as written. The alternative — granting `kf_migrator` `CREATEROLE` and superuser — would dismantle the least-privilege model that ADR-008 and Sprint 0 Guide §2.1 make load-bearing: it is what makes RLS a real backstop in dev rather than a production-only claim, and the TR-10 spike's evidence depends on it |
| Resolution (founder, 2026-09-06) | **M-000 is provisioning.** One committed, idempotent, pure-SQL file with two callers — the compose init hook in dev, and an operator or Coolify pre-deploy job in staging/production, which `KF-S0-OPS-004` wires. There is deliberately no second copy of the statements for production to drift from. Amend Blueprint §4's M-000 row and Requirement 1 to say "provisioning script, run once per environment as a superuser"; `infrastructure/compose/README.md` has already been corrected in place because it gave a now-wrong instruction (write a guarded `CREATE ROLE` into migration M-000) that a reader would have followed |
| ADR required | **No**, and the question was asked rather than skipped. "Is provisioning part of the migration chain?" is answered by the role model, not by a new architectural choice: ADR-008 already fixes least privilege, and that fixes this |
| Priority | **Resolved** (was P0 — blocked the task) |

## DISC-022 — Three approved documents give three different role sets

| Field | Content |
|---|---|
| Document | RBAC §2.1 and §3 vs. SAD §5 vs. Domain Model Part 3 row 11 and `KF-S0-API-003` Requirement 4 |
| Current implementation | **Resolved in code.** `roles` is seeded with eight codes in the RBAC §2.1 spelling: `SUPER_ADMIN`, `SYSTEM`, `OWNER`, `BRANCH_MANAGER`, `ACCOUNTANT`, `RECEPTIONIST`, `TEACHER`, `PARENT` |
| Approved design | **Three-way contradiction.** RBAC §2.1 names **eight** roles in SCREAMING_SNAKE. RBAC §3's matrix has **eight** columns but abbreviates one header to `BRANCH_MGR`. SAD §5 names **seven** in PascalCase and calls the platform role `PlatformAdmin`, omitting `SYSTEM` entirely. Domain Part 3 row 11 says "7 roles (SAD §5.2)" and Requirement 4 says "7 roles" |
| Impact | `roles.code` is unique and seeded, and every `role_permissions` row keys off it. Getting the count or the spelling wrong is a data migration later, not an edit — and the guard pipeline reads both |
| Resolution (founder, 2026-09-06) | **Eight roles, RBAC §2.1 spelling.** The deciding evidence is that RBAC §3's `SYSTEM` column carries real grants — "C (day-close job) R", "C (cycle job) U (overdue)", "C (writer)" — and §2.1 says SYSTEM's "permissions limited to its queue's purpose". Without a `SYSTEM` row those grants have nowhere to live and background-job authorization becomes code-only. SAD §5's list is the source of the "7", but SAD §5 explicitly defers — "Full permission matrix is a Phase 5 deliverable" — and its `PlatformAdmin` naming is already superseded by RBAC. Amend Domain Part 3 row 11, Requirement 4, and SAD §5's role list; `BRANCH_MGR` stays a §3 table-width abbreviation and should be annotated as such |
| ADR required | No |
| Priority | **Resolved** (was P0 — blocked the seed) |

## DISC-023 — RBAC §3 cells that decode to no permission code, and §2 codes with no §3 row

| Field | Content |
|---|---|
| Document | RBAC §3 matrix vs. API Contract §2 / `@kf/contracts/permissions` |
| Current implementation | None of these is seeded. All 37 are listed in `apps/api/prisma/seed-data/ROLE_PERMISSIONS_DERIVATION.md` with the role, the cell and the code each would need |
| Approved design | Two directions, both gaps. **(a) Matrix letters with no endpoint.** Mostly `SYSTEM` job-creates that no API performs: `report:create` (the day-close/draft trigger), `audit:create` (the audit writer), `notification:create` (dispatch), `analytics:create`/`analytics:update` (the projection job), `subscription:update` (billing jobs), `tenant-export:create` (the executor). Each is a real capability a background job needs and no §2 endpoint exposes, so there is no code to grant. **(b) Contract codes with no matrix row.** `role:read` exists because §2.4 `GET /roles` exists, and RBAC §3 has **no row for roles at all** — so the endpoint that lists the roles an OWNER assigns is callable by nobody. Separately, §2.17's platform-lifecycle and health codes (`platform:tenant:*`, `platform:read`) have no §3 row either; they are seeded to `SUPER_ADMIN` from §2.17 directly, listed in the derivation table under "Platform plane operations" so the gap stays visible |
| Impact | (a) Every background job that writes will need an authorization story. The SYSTEM role now exists (DISC-022) and holds 27 codes, but not these — so the first job to need one is blocked until the gap closes. (b) `role:read` is a live endpoint nobody can call; the §2↔§3 divergence API Contract §2's closing line calls "a spec bug" |
| Recommended resolution | One sweep of the derivation table's "Cells that decoded to no code" section. Per row: add the endpoint to §2, add a job-permission convention for SYSTEM, or strike the letter from §3. `role:read` is the urgent one — either add a Roles row to §3 granting it to OWNER and BRANCH_MANAGER, or confirm it is an unauthenticated reference read |
| ADR required | No — though a convention for job-only permissions may deserve one if the answer is "SYSTEM needs codes no endpoint has" |
| Priority | **P2** — `role:read` before `KF-S1-IAM-*`; the SYSTEM gaps before the first background job in S3 |

## DISC-024 — Blueprint §4 claims the linter enforces something it no longer enforces

| Field | Content |
|---|---|
| Document | Blueprint §4, "Ordering rules" row |
| Current implementation | M-001 follows the convention: each table's RLS ships in the same migration as the table |
| Approved design | §4 reads: "RLS policies ship **in the same migration** as their table (linter-enforced, TR-01)". After the founder-approved F-3 decision in `KF-S0-CI-003`, the migration linter resolves obligations across the **whole corpus**, precisely so a legitimate "enable RLS on an existing table" migration is not blocked. It will therefore not fail a migration that creates a table and secures it in a later file |
| Impact | Low but corrosive: the sentence is now false and a reader will trust it, then be surprised when the gate lets a split migration through. The convention itself is still right and still followed |
| Recommended resolution | Amend the §4 sentence to "RLS policies ship in the same migration as their table (convention; the linter enforces that every table is secured **somewhere** in the corpus — F-3)". Do **not** change the linter to make the old sentence true: that reopens the reason F-3 was decided |
| ADR required | No |
| Priority | **P3** |

## DISC-025 — `feature_flags` has no write policy, and the platform console will need one

| Field | Content |
|---|---|
| Document | API Contract §2.17 (`platform:flags:*` CRUD) vs. M-001's hand-written RLS block |
| Current implementation | `feature_flags` carries a GLOBAL_READ read policy expressing both tiers of Domain Part 6.2 — a NULL `tenant_id` row is the global default, a non-NULL one is a tenant override. There is **no write policy**, so only the owner (`kf_migrator`) can write, which is what "writes platform-only" means today |
| Approved design | §2.17 gives the platform console full CRUD over feature flags, and that runs as `kf_api`. A write policy gated on the platform predicate is required for those endpoints to work |
| Impact | None yet — the platform console does not exist. It would become a blocker for whichever task implements `platform:flags:*` |
| Recommended resolution | Add the write policy in the migration that first needs it, gated on the platform predicate Domain Part 6.1 describes for `TENANT_OR_PLATFORM` (`app.break_glass` / platform role). It is deliberately not added now because no platform-plane table exists to gate on — `break_glass_grants` is M-007 — and a write policy with nothing to check is indistinguishable from an open one |
| ADR required | No |
| Priority | **P2** — before the platform console's flag endpoints |

## DISC-026 — "Global feature flags" are required by the seed and named by no document

| Field | Content |
|---|---|
| Document | `KF-S0-API-003` Requirement 4 ("global feature flags") vs. every approved document |
| Current implementation | The tier-1 seed inserts **no** feature flags, and says so in its output. The table is created and empty |
| Approved design | Requirement 4 lists global feature flags among the tier-1 seed data. Domain Part 3 row 6 gives the table its shape — `unique(key, tenant_id)`, nullable tenant for the global row — and no document names a single flag key. Blueprint §5 mentions a feature flag for AI A/B testing without naming it |
| Impact | Low, and deliberately so. A flag is reference data: inventing `ai_drafting_enabled` here would put a switch in production that no specification authorises, and something would come to depend on it. An empty `feature_flags` table is meaningful and correct — no flags are defined yet — in a way an empty `roles` table would not be |
| Recommended resolution | Name the MVP's flags, or confirm there are none at MVP and strike the clause from Requirement 4. The AI A/B flag from Blueprint §5 is the only candidate visible in an approved document, and the AI task can seed it when it exists |
| ADR required | No |
| Priority | **P3** |

---

## Summary

| Priority | Count | IDs |
|---|---|---|
| P0 | 0 | — (all three original P0 entries are closed: DISC-001 by the monorepo tree, DISC-003 by ADR-010 merged and ratified, DISC-005 by `git init`. Counts corrected 2026-11-06.) |
| P1 | 6 | DISC-002, DISC-006 (F4/F2), DISC-007 (UXD-02/03), DISC-008, DISC-009, DISC-013, DISC-017 (partly closed — `PlanCode` answered 2026-09-06) |
| P2 | 8 | DISC-014, DISC-015, DISC-016, DISC-019, DISC-020, DISC-023, DISC-025 (plus items contained within DISC-006/007) |
| P3 | 9 | DISC-004, DISC-010, DISC-006 (F3), DISC-018, DISC-024, DISC-026 |
| Resolved | 4 | DISC-011, DISC-012 (closed by `KF-S0-API-003`'s manifest regeneration), DISC-021, DISC-022 |

**No discrepancy requires reversing an approved architectural decision.**

> **Summary refreshed 2026-11-06 (planner).** The paragraph that stood here said the risk concentration was DISC-003 (TR-10) because "it is the only entry where the answer is unknown". That was true when this register was written on 2026-08-10 and is **false now**: TR-10 was answered by `KF-S0-RLS-001` with 26/26 probes and ADR-010 is merged and ratified. Leaving it would have repeated the DISC-002 failure mode — a document a reader trusts while it points at something that no longer exists.
>
> **Where the risk actually sits now.** Not in anything unknown; in what is unexecuted. `DISC-009` (external accounts) still blocks `KF-S0-OPS-001`, and OPS-001 in turn blocks `KF-S0-CI-001`, `CI-002` and `CI-004` — four tasks, including every blocking CI gate the architecture relies on, waiting on one external decision. `DISC-002` (the README naming deleted directories) is still open and still P0-escalated because `KF-S0-DOC-001` has not run. Those two, not TR-10, are the live concentration.
>
> The P1/P2/P3 counts below include the sub-items contained within DISC-006 and DISC-007, so they exceed the number of ids listed on each row; that is intentional and is noted here rather than "corrected".
