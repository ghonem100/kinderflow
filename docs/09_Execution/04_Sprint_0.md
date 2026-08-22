# 04 — Sprint 0: Foundations (Detailed Task Specifications)

| Field | Value |
|-------|-------|
| Sprint goal | Working rails: repository, workspace, CI gates that provably fail on violation, dev + staging environments, contracts package, app bootstraps, and **an evidence-based RLS decision (ADR-010)** |
| Entry criteria | Approved Phase 0–8 docs (met); founder track item `KF-S0-EXT-001` initiated |
| Exit criteria | ADR-010 merged · isolation harness proven red **and** green · CI blocking gates demonstrable · staging deployed by CI · fresh-clone onboarding validated |
| Authority | Sprint 0 Execution Guide (Phase 8) §1–§11; Engineering Blueprint §1–§3, §8–§9, §12 |

**Reading note:** every task inherits the Universal Definition of Done (`15_Definition_of_Done.md`) and the Global Conventions (`03_Master_Backlog.md` §6). Task-level "Definition of Done" lists only *additions*.

---

## KF-S0-RLS-001 — TR-10 Spike: Prisma × PostgreSQL RLS tenant context ⚠️ ITEM 0 · CRITICAL

**Objective** — Determine, by evidence, whether a Prisma client extension plus `SET LOCAL app.tenant_id` inside interactive transactions enforces tenant isolation reliably and performantly under real conditions; produce benchmarks, failure proofs, and a recommendation.

**Source of Truth** — SAD §13 (TR-10); SAD §4.2 (isolation layers); ADR-002; ADR-008; Sprint 0 Guide §11; Domain Model Part 6.

**Dependencies** — `KF-S0-INFRA-002`, `KF-S0-OPS-002` (dev DB), `KF-S0-API-003` partial (spike tables may be created by a throwaway migration inside the spike branch).

**Files / Areas** — `apps/api/src/shared-kernel/tenancy/` (spike code), `tooling/` benchmark scripts, `docs/Decisions/ADR-010_RLS_Integration_Pattern.md` (deliverable). Spike code lands on a branch; only the ADR and the reusable pattern merge to main.

**Implementation Requirements**
1. Create spike schema: `organizations` + one tenant-scoped child table with `TENANT_STANDARD` policy, `FORCE ROW LEVEL SECURITY`, and a `kf_api` role **without** BYPASSRLS.
2. Implement AsyncLocalStorage tenant context + Prisma client extension that (a) opens an interactive transaction, (b) issues `SET LOCAL app.tenant_id`, (c) injects a `tenant_id` filter on tenant-scoped models as defense in depth, (d) **throws** when context is absent for a tenant-scoped model (never executes unscoped).
3. Generate a model manifest (tenant-scoped vs global) from schema annotations; the extension and the migration linter must consume the same manifest.
4. Implement the identical wrapper for the BullMQ worker context (tenant carried on the job payload).
5. Probe suite — each must be demonstrated, not argued: missing-context throw; pool connection reuse (assert no leaked `app.tenant_id` across checkouts); 100 concurrent interleaved mixed-tenant requests → zero cross-tenant rows; nested transaction behavior; long-running/streaming query behavior.
6. Benchmarks: roster read and event insert, wrapped vs unwrapped baseline, at 200 rps; record p50/p95/p99 and pool hold time.
7. **⚠️ Added 2026-08-10 from `KF-S0-OPS-002` finding T-1 — resolve this or Sprint 1 seeds break.** `FORCE ROW LEVEL SECURITY` removes the **table owner's** implicit bypass. An `INSERT` as `kf_migrator` (the owner) was observed failing with `new row violates row-level security policy`. This is correct Postgres behaviour and Blueprint §4 mandates FORCE on tenant tables, so it cannot be avoided — it is a design constraint on M-002 onward and on every seed and data migration. The spike **must** determine and document the seeding path: does the migration set `app.tenant_id` per row-group, do policies carry a `WITH CHECK` that admits a seeding role, or does a dedicated non-forced role own the seed step? Decide deliberately in ADR-010, not by discovery during Sprint 1.

**Confirmed already on the dev stack (do not re-derive, build on it):**
- **T-2 — the fail-closed mechanism works and its exact shape matters.** `current_setting('app.tenant_id', true)` returns NULL when unset, and `tenant_id = NULL` is never true, so an unset context yields **zero rows**, not all rows. The `true` (missing_ok) argument is what prevents an exception; the NULL comparison is what makes it fail closed. Preserve both.
- **T-3 — dev is a genuine RLS environment**, so spike results transfer: `kf_api` has no BYPASSRLS and cannot DDL, verified by SQL. Cross-tenant invisibility and fail-closed behaviour were both demonstrated on this stack before the spike began.

**Security Requirements** — `kf_api` role must fail a direct `SELECT` on another tenant's rows at SQL level (proof captured in the ADR). No `BYPASSRLS` anywhere in the app path. Context must be derived only from server-side session/job data, never from request payloads.

**API Requirements** — None (infrastructure spike).

**Database Requirements** — Spike tables with `tenant_id UUID NOT NULL`, RLS enabled + FORCED, policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)` with matching `WITH CHECK`; roles per Blueprint §4 M-000.

**Testing Requirements** — Integration tests (Testcontainers PG) for all six probes; pgTAP assertions that policies exist and that `kf_api` is blocked; a property/fuzz test performing ≥10,000 randomly interleaved mixed-tenant operations asserting zero cross-reads; benchmark script reproducible via one command.

**Acceptance Criteria**
1. Given a tenant-scoped model queried with no tenant context, the operation throws a typed error and executes **no SQL** (asserted by query log).
2. Given 100 concurrent requests alternating tenant A/B against the same connection pool, zero rows from the other tenant are returned across 10,000 operations, and no `app.tenant_id` value survives a connection checkout boundary.
3. Given a direct SQL session as `kf_api` with `app.tenant_id` set to tenant A, `SELECT` on tenant B rows returns 0 rows (not an error, per RLS semantics) and an `INSERT` with tenant B's id fails the `WITH CHECK`.
4. Wrapped-path p95 overhead versus unwrapped baseline is measured and stated numerically; if >15%, option B of the decision matrix is triggered and documented rather than silently accepted.
5. Worker-context path passes probes 1–3 identically to the HTTP path.
6. Module-author ergonomics: the demonstration repository code contains **no** manual `tenant_id` handling.

**Definition of Done (additions)** — Benchmark output committed under `docs/Decisions/` as an appendix; failure proofs captured as test names + output; spike branch referenced from ADR-010; no spike-only code merged to main except the extension pattern chosen.

**Risk** Critical · **Complexity** XL (mandatory decomposition: 001a context+extension, 001b probes, 001c worker parity, 001d benchmarks — track as sub-items, single ADR).

---

## KF-S0-RLS-002 — ADR-010: RLS integration pattern decision record

**Objective** — Convert spike evidence into a binding architectural decision that module authors follow without further judgement.

**Source of Truth** — Sprint 0 Guide §11 decision matrix (options A/B/C); SAD §13 TR-10; ADR-008.

**Dependencies** — `KF-S0-RLS-001`.

**Files / Areas** — `docs/Decisions/ADR-010_RLS_Integration_Pattern.md`.

**Implementation Requirements** — Record: chosen option (A extension + SET LOCAL / B hybrid read path / C app-layer primary with RLS backstop) with the measured evidence that selected it; limitations discovered; **coding rules for module authors** (how to open a tenant transaction, what is forbidden, how workers carry context); harness usage instructions; any follow-up debt.

**Security Requirements** — The ADR must state explicitly which layer is authoritative and what happens on context absence (fail-closed).

**Testing Requirements** — None (document), but it must cite the test IDs that prove each claim.

**Acceptance Criteria**
1. ADR states one chosen option with numeric benchmark evidence and named failing/passing tests.
2. A module author can read only ADR-010 and correctly implement a tenant-scoped repository (validated by having a second engineer do exactly that in `KF-S1-TENANT-002` review).
3. If option C was selected, the compensating controls (doubled isolation depth, pgTAP scope) are enumerated and scheduled as tasks.

**Definition of Done (additions)** — Linked from `docs/03_System_Architecture/Architecture_KinderFlow.md` §12 ADR table (documentation update task recorded in `KF-S0-DOC-001`).

**Risk** Critical · **Complexity** M

---

## KF-S0-RLS-003 — Tenant isolation test harness (proven red and green)

**Objective** — Build the PR-blocking harness that attempts cross-tenant access at both API and SQL levels for every registered resource.

**Source of Truth** — Blueprint §8 (isolation suite = release-blocking); Sprint 0 Guide §10 item 0.10; RBAC §7 (SEC-PERM-003); API Contract §4 (404-not-403 policy).

**Dependencies** — `KF-S0-RLS-002`, `KF-S0-CONTRACT-001`.

**Files / Areas** — `tooling/` or `apps/api/test/isolation/`; CI job wiring in `.github/workflows/ci.yml`.

**Implementation Requirements**
1. Fixture: two fully seeded tenants (A, B) with users in every role.
2. Matrix runner: for each endpoint registered in OpenAPI, attempt access to tenant B resources using tenant A credentials for each role → expect 404 (per API Contract) and a recorded SEC-PERM-003 tripwire event.
3. SQL-level probes as `kf_api` per tenant table (from the model manifest) → expect zero rows.
4. Deliberate-leak fixture (a table registered without a policy, or a repository bypassing context) that the harness must catch — kept as a permanently skipped test that CI can un-skip in a verification job.
5. Report output: table of resources covered / uncovered; **uncovered tenant tables fail the job**.

**Security Requirements** — Harness runs as the same DB role the API uses in production. Never runs with elevated privileges.

**Testing Requirements** — Meta-test: the harness itself must fail when pointed at the deliberate-leak fixture (proof of sensitivity) and pass on the clean schema.

**Acceptance Criteria**
1. On the clean schema, the harness passes and reports 100% of tenant tables and registered endpoints covered.
2. When the deliberate-leak fixture is enabled, the harness fails with a message naming the leaking table/endpoint.
3. Adding a new tenant table without a policy causes the harness (or migration linter) to fail — demonstrated once in CI.
4. The job is wired as a required status check on the protected branch.

**Definition of Done (additions)** — Documented in the development guide: how to run locally, how to add coverage when adding a table.

**Risk** Critical · **Complexity** L

---

## KF-S0-INFRA-001 — Initialize git repository and commit baseline ✅ DONE

> **Status:** DONE · 2026-08-10 · commit `b561a5b` (root, branch `main`) · 47 files, 6,860 insertions
> **PR:** none — no remote exists yet (`KF-S0-OPS-001` provisions remote + branch protection). Direct commit on `main` is the only possible path for the repository-creating task; recorded as an accepted, one-time process deviation.
> **Evidence (independently verified by the planner):** branch `main`; 1 commit; message exactly `docs: import approved phase 0-9 documentation`; 47 tracked files (38 docs + README + 6 `.gitkeep` + `.gitignore` + `.gitattributes`); `git status --porcelain` empty; `git remote -v` empty; diff contains create-mode entries only (0 modifications); `git check-ignore` confirms node_modules/dist/.next/.turbo/coverage/.env/*.tsbuildinfo ignored while `.env.example`, `.github/**`, and `.claude/settings.json` are NOT ignored; committed blobs contain 0 CR bytes despite host `core.autocrlf=true`.
> **Secret scan:** clean (private keys, provider tokens, assigned credentials, connection strings, high-entropy literals, secret-bearing filenames — 0 findings; 179 keyword hits all design prose).
> **DoD:** items 12 and 16 applicable and satisfied; item 10 verification executed per spec ("Testing Requirements — None"); item 17 (CI green) not evaluable — no pipeline exists (MISS-04), no gate weakened or bypassed; items 1–9, 11, 13–15 not applicable with reasons recorded in the completion report.
> **Discrepancies/risks:** D-1 resolved (this file amended, see below). O-3 commit trailer intentionally omitted — message matches the literal acceptance criterion. DISC-005 remains OPEN pending `KF-S0-OPS-001`. R-1: DoD-17 unevaluable until CI exists — no register change required; the condition is a known baseline gap, not a new risk.
> **Unlocks:** `KF-S0-INFRA-002`, `KF-S0-OPS-001`.

**Objective** — Put the project under version control with the approved conventions from the first commit.

**Source of Truth** — Blueprint §12; DISC-005.

**Dependencies** — None. **This is the first executable task in the project.**

**Files / Areas** — repository root: `.gitignore`, `.gitattributes`, initial commit.

**Implementation Requirements** — `git init`; `.gitignore` covering node/next/turbo/prisma/env/coverage/build outputs; `.gitattributes` for line endings; commit existing docs as the initial commit using a Conventional Commit message (`docs: import approved phase 0-9 documentation`); default branch `main`.

> **Amendment 2026-08-10 (D-1, cosmetic):** message string corrected from "phase 0-8" to "phase 0-9" — Phase 9 execution documents exist and were part of the baseline import. No behavioral change.

**Security Requirements** — Verify no secrets exist in the imported tree before first commit (manual scan; automated in `KF-S0-CI-004`).

**Testing Requirements** — None.

**Acceptance Criteria** — `git log` shows one commit containing all documentation; `git status` clean; ignored paths verified by adding a dummy `node_modules` entry and confirming it is not tracked.

**Risk** Low · **Complexity** S

---

## KF-S0-INFRA-002 — Create pnpm workspace and monorepo tree ✅ DONE

> **Status:** DONE · 2026-08-10 · commit `1bfb9c0` (19 files, +127) · preceded by housekeeping commit `4e662c6`
> **PR:** none — no remote yet (`KF-S0-OPS-001`); same accepted deviation as INFRA-001.
> **Evidence (independently verified by the planner):** 3 commits on `main`, tree clean; root `package.json` private with `packageManager: pnpm@9.15.9` + `engines.node >=22`, zero deps; `pnpm-workspace.yaml` with all four approved globs; `.npmrc` = the two approved settings only; 7 workspace members created as `@kf/{api,web,contracts,tokens,ui,i18n,shared}`, each `{name,version,private}` with no deps; `pnpm install --frozen-lockfile` on a **genuine fresh clone** exits 0 under pnpm 9.15.9 with the clone left git-clean; `backend/` and `frontend/` removed via `git rm`; `mobile-parent/`/`mobile-teacher/` contain only the ADR-009 V2 README.
> **Deferred within scope (documented in-place):** `configs/*` and `tooling/*` members are INFRA-003 and the CI-gate tasks; each directory README names its owning task. pnpm 9.15.9 emitted **no warning** for the empty globs, so no placeholder package was added and the approved globs stand unchanged.
> **DoD:** items 10, 12, 16 applicable and satisfied; item 17 (CI green) not evaluable — no pipeline exists (MISS-04), no gate weakened; items 1–9, 11, 13–15 not applicable with reasons recorded.
> **Decisions resolved:** R-2 → **stay on pnpm 9.15.9**; `KF-S0-CI-001` **must** pin 9.15.9 via `packageManager` + corepack or the lockfile will churn across majors. D-4 → Sprint 0 Guide §1.1 amended to include `configs/*`.
> **Raised:** DISC-002 escalated P1 → **P0** (README now points at deleted paths) — `KF-S0-DOC-001` to be pulled forward. O-6: Node is nvm-managed with no active version on the build host; capture in the development guide (`KF-S0-DOC-001`) and the CI runner setup (`KF-S0-CI-001`). O-5: `workspace:*` edges land with the first real internal dependency (`@kf/ui` → `@kf/tokens`).
> **Unlocks:** `KF-S0-INFRA-003`.

**Objective** — Establish the approved workspace layout so that all subsequent work lands in the right place.

**Source of Truth** — Blueprint §1; Sprint 0 Guide §1.2; DISC-001.

**Dependencies** — `KF-S0-INFRA-001`.

**Files / Areas** — root `package.json`, `pnpm-workspace.yaml`, `.npmrc`; directories `apps/{api,web}`, `packages/{contracts,tokens,ui,i18n,shared}`, `configs/`, `tooling/`; retire `backend/`, `frontend/` scaffold folders; keep `mobile-parent/`, `mobile-teacher/` with a README stating V2/ADR-009.

**Implementation Requirements** — Root package private, pnpm version pinned via `packageManager`; workspace globs `apps/*`, `packages/*`, `tooling/*`, `configs/*`; each package gets a minimal `package.json` with the `@kf/*` name and `workspace:*` protocol for internal deps.

**Security Requirements** — None.

**Testing Requirements** — `pnpm install` completes on a clean clone.

**Acceptance Criteria**
1. Fresh clone + `pnpm install` succeeds with no peer-dependency errors.
2. Folder tree matches Blueprint §1 exactly (verified against the document during review).
3. `backend/` and `frontend/` no longer exist; `mobile-*` contain only the V2 README.

**Risk** Low · **Complexity** M

---

## KF-S0-INFRA-003 — Shared configs package ✅ DONE

> **Status:** DONE · 2026-08-10 · commit `0940c3b` (17 files, +1430/−10) · preceded by housekeeping `978ca4d`
> **PR:** none — no remote yet (`KF-S0-OPS-001`); same accepted deviation.
> **Evidence (independently verified by the planner):** 5 commits, tree clean; `configs/ts/tsconfig.base.json` carries strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + ES2022 + bundler resolution, with `composite`/`references` deliberately absent (INFRA-004); ESLint 9 flat config with `base`/`web` subpath exports; `__fixtures__` excluded from normal lint runs; web rules scoped to `apps/web/**` + `packages/ui/**` via `WEB_SCOPE`; a single Prettier config with **zero** competing configs anywhere (verified by JSON key parse, not grep); 7/7 fixture assertions pass via `pnpm lint:rules` using Node 22's built-in runner — **no test framework installed** (D-6 honored).
> **Decisions resolved:** R-6 → **broaden the RTL rule** (follow-up `KF-S0-INFRA-003a`). O-7 → Prettier values **accepted as canonical house style** (100 cols, single quotes, semicolons, trailing commas, LF matching `.gitattributes`). O-8 → `typescript-eslint` accepted as authorized-by-implication: Blueprint §12 mandates "no `any` (lint error)" on TypeScript, which is unenforceable without it; recorded rather than treated as a new technology choice.
> **Carried forward:** R-4 → `KF-S0-CI-001` must use the glob form `node --test "configs/eslint/test/**/*.test.mjs"` (the directory form fails on Node 22). R-5 → custom-rule false-positive surface is unmeasured until components exist; revisit at `KF-S0-FE-003`. O-9 → cold `pnpm install` on the Windows host exceeded 10 minutes (warm: 4.8 s); record in the development guide.
> **Dependencies added (root, exact):** eslint 9.39.5, @eslint/js 9.39.5, typescript-eslint 8.67.0, typescript 5.9.3, prettier 3.9.6. No peer warnings. TypeScript pinned to 5.9.3 (not 7.x) to stay inside typescript-eslint's `<6.1.0` peer range — correct call.
> **DoD:** 10, 12, 16 applicable and satisfied; 17 not evaluable (no CI); 1–9, 11, 13–15 not applicable with reasons.
> **Unlocks:** `KF-S0-INFRA-003a`, `KF-S0-INFRA-004`.

**Objective** — One source for TypeScript, ESLint, and Prettier configuration, including the KinderFlow-specific lint rules.

**Source of Truth** — Blueprint §12; Sprint 0 Guide §1.3, §8; Design System §02 (token rule), §2.6 (logical properties).

**Dependencies** — `KF-S0-INFRA-002`.

**Files / Areas** — `configs/` (`tsconfig.base.json`, ESLint flat config, Prettier config).

**Implementation Requirements** — TS strict plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022, bundler resolution; ESLint base + per-package overlays; custom rules: (a) ban physical-direction Tailwind classes (`pl-`, `pr-`, `left-`, `right-`, `ml-`, `mr-`) in `apps/web` and `packages/ui`; (b) ban raw hex colors and raw px values in the same scopes; (c) ban `any`.

**Security Requirements** — None.

**Testing Requirements** — Fixture files that must fail each custom rule (kept under `configs/__fixtures__` and asserted by a lint-rules test).

**Acceptance Criteria**
1. A file using `pl-4` fails lint with a message naming the logical-property replacement.
2. A file using `#0D7377` literal in `apps/web` fails lint pointing to `@kf/tokens`.
3. `any` usage fails lint.
4. No package defines its own competing Prettier config.

**Risk** Low · **Complexity** M

---

## KF-S0-INFRA-003a — Broaden the RTL physical-utility rule (follow-up) ✅ DONE

> **Status:** DONE · 2026-08-10 · commit `4dec61d` (5 files, +264/−9) · preceded by `0827a74` and `d429505`
> **Evidence (independently verified by the planner):** 24 directional families banned, each error naming its own logical replacement; assertions 7 → 12, original 7 unchanged and passing; `pnpm lint:rules` exit 0; tree clean. Corner mappings verified correct (`ss/se/es/ee` = block-start/end × inline-start/end). Pattern behavior re-derived empirically by the planner rather than read: `rounded-lg` and `rounded-full` pass while `rounded-l`, `rounded-l-xl`, `md:rounded-l-sm` fire; `left-0`, `left-1/2`, `left-[10px]`, `left-auto`, `-left-4` fire while `the left-hand column` and `right-click…` pass. `d429505` confirmed a **pure move** (22 added / 22 removed, identical multiset).
> **Implementation decisions approved by the planner:** (a) **value guard** on `left-`/`right-` only — narrows the pattern to real Tailwind values, eliminating the prose-collision class that R-5 predicted would erode trust; coverage of real utilities unaffected. (b) **bare forms** (`border-l`, `rounded-tl`) included via the `sided` kind — a widening *within* already-named families, not a new family; `rounded-lg` pinned in the clean fixture proves no overshoot. Both endorsed: they serve the rule's intent better than its literal wording.
> **Design quality note:** the `[physical, logical, kind]` table is the single source for the rule, the README, and assertion #8 (which fails the build if a banned family lacks a fixture) — the three cannot drift.
> **Known narrow gap (accepted):** the value guard does not fire on custom-theme named values such as `left-header`. Real Tailwind value shapes (digit, `[`, `px`, `auto`, `full`, fractions) are all covered; a custom named inset would slip through. Acceptable — design tokens supply spacing, and the alternative is re-admitting prose false positives. Revisit only if the Tailwind theme grows named inset values.
> **Raised — R-7 (repo-wide hazard):** the sequence `*/` inside a JSDoc block silently terminates the comment; the remainder parses as code and surfaces as an opaque module-level `SyntaxError` with no file or line. This project writes `foo-*` glob notation in comments constantly. **Convention adopted: write `foo-…` or `` `foo-*` `` in block comments, never bare `foo-*/`.** Recorded in the development guide (`KF-S0-DOC-001`).
> **R-5 status:** partly measured — the prose-collision class is eliminated and pinned by regression fixtures. Still unmeasured against real component source; `KF-S0-FE-003` remains the measurement point.
> **DoD:** 10, 12, 15, 16 applicable and satisfied; 17 not evaluable (no CI); rest not applicable with reasons.
> **Unlocks:** `KF-S0-INFRA-004`.

**Objective** — Close the gap between the implemented rule (the six utilities the spec enumerated) and Design System §2.6's actual intent ("no `left/right` in any component spec"), while it is still free to do so — no component source exists yet.

**Source of Truth** — Design System §2.6 (RTL tokens & rules), §04–§05; Blueprint §12; planner decision R-6 (2026-08-10).

**Dependencies** — `KF-S0-INFRA-003`.

**Files / Areas** — `configs/eslint/web.mjs`, `configs/__fixtures__/physical-direction.fixture.ts`, `configs/__fixtures__/clean.fixture.ts`, `configs/README.md`.

**Implementation Requirements** — Extend the physical-direction pattern beyond `pl-/pr-/ml-/mr-/left-/right-` to the remaining directional Tailwind utilities that have logical equivalents: `border-l-*`/`border-r-*` (→ `border-s-*`/`border-e-*`), `rounded-l-*`/`rounded-r-*`/`rounded-tl-*`/`rounded-tr-*`/`rounded-bl-*`/`rounded-br-*` (→ `rounded-s-*`/`rounded-e-*`/`rounded-ss-*` etc.), `text-left`/`text-right` (→ `text-start`/`text-end`), `float-left`/`float-right` (→ `float-start`/`float-end`), `clear-left`/`clear-right` (→ `clear-start`/`clear-end`), `scroll-ml-*`/`scroll-mr-*` (→ `scroll-ms-*`/`scroll-me-*`), `scroll-pl-*`/`scroll-pr-*` (→ `scroll-ps-*`/`scroll-pe-*`). Keep the same message shape: name the logical replacement.

> **Planner correction 2026-08-10 (pre-handoff):** an earlier draft of this task listed `inset-l-*`/`inset-r-*`. **No such Tailwind utility exists** — horizontal insets are `left-*`/`right-*` (already banned by `KF-S0-INFRA-003`, logical equivalents `start-*`/`end-*`) plus `inset-x-*` (direction-neutral, correctly allowed). Removed before implementation. **Rule of thumb for this task: ban a utility only if a logical replacement exists.** Utilities such as `origin-left` or `bg-left` have no logical counterpart in Tailwind and must NOT be banned — a rule that cannot name a replacement is a rule engineers will disable. Preserve the existing variant-prefix, negative-value, and template-literal handling.

**Security Requirements** — None.

**Testing Requirements** — Extend `physical-direction.fixture.ts` with one case per newly banned family; extend `clean.fixture.ts` with the corresponding logical equivalents plus near-miss strings that must **not** trip (e.g. `text-start`, a token name containing `border`, prose containing "left"). All assertions run through the existing `pnpm lint:rules`.

**Acceptance Criteria** — (1) `border-l-2`, `rounded-tl-lg`, `text-left`, and `float-right` each fail lint with a message naming their logical replacement. (2) `border-s-2`, `rounded-ss-lg`, `text-start`, `float-start` all pass. (3) The clean fixture still reports zero problems — the broadened pattern is not over-broad. (4) Fixture assertion count increases and `pnpm lint:rules` stays green.

**Definition of Done (additions)** — `configs/README.md` documents the full banned set so component authors can read one list.

**Risk** Low · **Complexity** S

---

## KF-S0-INFRA-004 — Turborepo pipeline and TypeScript project references ✅ DONE

> **Status:** DONE · 2026-08-10 · commit `b69a92e` (25 files, +293/−9) · preceded by `c408697`
> **Evidence (independently verified by the planner):** 10 commits, tree clean; `turbo.json` carries all six tasks with `test:isolation` `cache:false` and `dev` persistent; **exactly two** workspace edges (`@kf/ui` → `@kf/tokens`, `@kf/web` → `@kf/tokens`) — no others; `@kf/shared` has zero dependencies (Blueprint §1 rule holds); no `dist/`, `*.tsbuildinfo`, or `.turbo/` tracked; all 7 placeholders name their replacing task; the only committed `test:isolation` script is the root delegator — the AC4 probe script was genuinely removed.
> **AC verification quality:** AC1–AC3 verified against real artifacts. AC3 done properly — a content edit rather than a `touch` (turbo hashes content, so a touch would have proven nothing), with the `--summarize` JSON showing dependents MISS and unrelated packages HIT, then reverted. AC4 verified by mechanism with the probe hash **identical across three runs** — proving the task would have been a cache hit if cacheable, so "cache bypass" is real re-execution rather than replay. That is the strongest available proof absent a real suite, and it was labelled as partial rather than claimed as complete.
> **Decisions resolved:** O-11 → **keep the implementation**; Sprint 0 Guide §1.4 amended (`test` now shows `^build`). DISC-011 (found by the planner during verification) → **zod schemas live in `@kf/contracts`**; Blueprint §2 amended.
> **Carried forward — R-8 (CI-blocking if missed):** `turbo` must be invoked **through pnpm** (`pnpm build`), never a bare `npx turbo`. Turbo spawns `pnpm run <task>` per package; launched outside pnpm, every cache-miss task re-resolves pinned `pnpm@9.15.9` from the registry — one network round trip each, and a single failure kills the build (observed: 1m11s failure vs 3.0s success). **Cache-hit tasks replay logs without spawning pnpm, so a warm CI run hides this until the first cold build.** Routed to `KF-S0-CI-001`.
> **Also carried:** R-9 — `build` and `typecheck` are both `tsc -b` (composite projects must emit for downstream typechecking); `typecheck` has `outputs: []` so they cache independently. CI need not run both. O-10 — `test`/`lint` task slots have no implementers; a green `pnpm test` is currently meaningless and CI must not treat it as a signal.
> **Noted:** `@kf/shared` has no Sprint 0–5 owner; its first real content is `KF-S6-BILL-001` (Money VO). It will hold a placeholder for five sprints — correct, not an oversight, and now recorded so nobody "tidies it up". Per-package tsconfigs use a relative `extends` rather than the package name, avoiding seven spurious workspace edges (consistent with D-7/D-9).
> **DoD:** 10, 12, 16 applicable and satisfied; 17 not evaluable (no CI); rest not applicable with reasons.
> **Unlocks:** `KF-S0-INFRA-005`, and the path to `KF-S0-OPS-002` → **`KF-S0-RLS-001` (TR-10)**.

**Objective** — Fast, cached, dependency-correct builds and typechecks across the workspace.

**Source of Truth** — Sprint 0 Guide §1.3–§1.4.

**Dependencies** — `KF-S0-INFRA-003`.

**Files / Areas** — `turbo.json`, per-package `tsconfig.json` with `composite: true` and `references`.

**Implementation Requirements** — Tasks `build`, `typecheck`, `lint`, `test`, `test:isolation` (uncached), `dev` (persistent); correct `dependsOn: ["^build"]` chains; `@kf/tokens` build must precede `apps/web` build.

**Acceptance Criteria**
1. `pnpm build` from clean succeeds; a second run is a full cache hit.
2. `tsc -b` reports zero errors across all references.
3. Changing `@kf/tokens` invalidates only dependents (verified from turbo summary).
4. `test:isolation` never reports a cache hit.

**Risk** Medium · **Complexity** M

---

## KF-S0-INFRA-005 — Commit hygiene automation ✅ DONE

> **Status:** DONE · 2026-08-10 · commit `04a3297` (10 files, +1960/−227) · preceded by `2de27cb`
> **Evidence (independently verified by the planner):** 12 commits, tree clean apart from the untracked `designs/`; both hooks invoke tooling **only through pnpm** (`pnpm exec lint-staged`, `pnpm typecheck`, `pnpm exec commitlint`) with inline R-8 rationale so a future editor cannot "simplify" it back; `.husky/_/` correctly excluded by husky's own generated ignore; commitlint config is a deduped union with `scope-empty` disabled for the scopeless root commit. **Strongest proof: this task's own commit passed through both hooks live** — lint-staged reformatted `commitlint.config.mjs` in flight and re-staged it. The automation worked on itself.
> **Planner harness note:** my own piped `commitlint` spot-check returned REJECTED for every message including `chore(repo)`, which demonstrably passed in commit `04a3297`. My harness was broken (stdin without `--from`/`--edit`), not the config. Recorded so the false negative is not mistaken for a finding.
> **Decisions resolved:** D-11 → **consolidate** (see `KF-S0-INFRA-005a`). R-11 → **relax the AC4 assertion** (see `KF-S0-INFRA-005a`).
> **Planner error acknowledged:** D-11 as I wrote it ("epic codes lowercased" → `bill`) contradicted the spec's own acceptance criterion (`feat(billing)`). The implementer caught it, checked the sources rather than picking a side, and widened to a union — the correct move under the constraint given. The union is now being narrowed deliberately, which is a different decision from the one they were forced to make mid-task.
> **Accepted:** R-10 → `eslint.config.mjs` was unowned; ESLint 9 requires a root flat config or the pre-commit hook fails on every commit. Created from the snippet `configs/README.md` documents, with a relative import so the D-7 edge count is unchanged. **Ownership assigned retroactively to this task** — later tasks adopt it, never duplicate it. O-12 → hooks are bypassable with `--no-verify` by design of git; they are fast feedback, not an enforcement boundary. Blueprint §12's "commitlint in CI" is the real gate.
> **Carried to `KF-S0-CI-001` (now four notes + one):** R-4 glob form · R-8 invoke turbo through pnpm · R-2 pin pnpm 9.15.9 · R-9/O-10 build≡typecheck and empty test/lint slots · **O-12 re-run lint, typecheck, and commitlint server-side over the PR range.**
> **D-13/D-14 as specified:** Changesets = changelog discipline only, `apps/*` ignored, nothing published (`changeset status` verified). Renovate committed but **inert** — no remote, no GitHub App; schema validity verified against the published schema, which is the only property testable today.
> **DoD:** 10, 12, 16 applicable and satisfied; 17 not evaluable (no CI); rest not applicable with reasons.
> **Unlocks:** `KF-S0-INFRA-005a`, then `KF-S0-CI-001` / `KF-S0-OPS-002`.

---

## KF-S0-INFRA-005a — Consolidate commit scopes and relax the Prettier assertion (follow-up) ✅ DONE

> **Status:** DONE · 2026-08-10 · commit `51a272e` (5 files, +177/−105) · preceded by `2580e0f`
> **Evidence (independently verified by the planner):** 14 commits, tree clean apart from untracked `designs/`; scope enum = **28 unique, zero duplicates** (modules 14 / packages 9 / structural 5); `EPIC_SCOPES` deleted outright, not left dead; `notifications` correctly excluded in favour of `communication` (D-15); `shared` and `shared-kernel` both present and distinct (D-16); root `prettier` key = `./configs/prettier/index.json`; full history passes commitlint.
> **Planner harness error, disclosed:** my first scope count reported 9 packages as 8 — my regex `[a-z-]` cannot match `i18n`. The config was correct; my check was wrong. Second false signal from my tooling in two tasks, against zero from the implementer's.
> **Verification quality:** AC4 proven with **three** negative shapes (package-level key, stray `.prettierrc`, stray `prettier.config.mjs`), not one — and a **new assertion #13** added so the root-key exemption cannot rot into a hole: it verifies the key exists, points at the shared config, and that the resolved config really carries `singleQuote`/`printWidth: 100`/`endOfLine: lf`. AC3's first probe was invalidated and redone because the probe file sat outside the repo, so Prettier never discovered the root config and both key forms "passed" for the wrong reason — caught by the implementer, not by me.
> **Prettier key form:** path form chosen over `@kf/config-prettier`. Both resolve today, but the package-name form works **by accident** — the symlink exists while nothing declares the dependency, so a clean install or stricter pnpm settings could break it silently, with Prettier falling back to defaults and reformatting the repo on the next commit. Consistent with the relative-path pattern already chosen in INFRA-004 and INFRA-005.
> **DoD:** 10, 12, 16 applicable and satisfied; 17 not evaluable (no CI); rest not applicable with reasons.
> **Raised — R-12 (blocks clean docs commits), R-13, O-13:** see `KF-S0-INFRA-005b`.
> **Unlocks:** `KF-S0-INFRA-005b`, then `KF-S0-CI-001` / `KF-S0-OPS-002`.

**Objective** — Replace the four-way scope union with a single code-location taxonomy, and let editors discover the shared Prettier config.

**Source of Truth** — Blueprint §12 ("scopes = module/package names (enforced list)"); Sprint 0 Guide §8; SAD §3.1 (module names); Blueprint §1 (package names); planner decisions D-11-revised and R-11 (2026-08-10).

**Dependencies** — `KF-S0-INFRA-005`.

**Files / Areas** — `commitlint.config.mjs`, root `package.json`, `configs/eslint/test/lint-rules.test.mjs`, `configs/README.md`.

**Implementation Requirements**
1. **Scope enum** becomes the union of exactly three families, deduped and sorted — **drop the Master Backlog epic codes** (they are a planning taxonomy; commit scopes describe where code changed, and `bill` vs `billing` makes `git log --grep` unreliable):
   - **Module names** (SAD §3.1): `iam`, `tenancy`, `children`, `attendance`, `activities`, `billing`, `communication`, `staff`, `ai`, `media`, `platform`, `audit`, `notifications`, `analytics`
   - **Package/app names** (Blueprint §1): `api`, `web`, `contracts`, `tokens`, `ui`, `i18n`, `shared`, `configs`, `tooling`
   - **Structural**: `repo`, `execution`, `deps`, `docs`, `ci`
2. `scope-empty` stays disabled (the scopeless root commit is legitimate).
3. **Prettier**: add a root `package.json` `"prettier"` key pointing at the shared config, and simplify the lint-staged invocation to plain `prettier --write` (discovery now works).
4. **Relax the AC4 assertion** in `lint-rules.test.mjs`: fail on a `prettier` key in **any package other than the root**, and on any standalone `.prettierrc*`/`prettier.config.*` file anywhere. A root key that *references* the shared config is not a competing config — that was always the assertion's intent.

**Security Requirements** — None.

**Testing Requirements** — Re-run commitlint across the full history (all 13+ commits must pass); assert `feat(billing)` accepted and `feat(bill)` now **rejected**; assert the relaxed AC4 still fails on a package-level `prettier` key and on a stray `.prettierrc`; `pnpm lint:rules` green.

**Acceptance Criteria** — (1) Full history passes commitlint. (2) `feat(billing)` accepted; `feat(bill)`, `feat(att)`, `feat(nonsense)` all rejected. (3) `prettier --write` with no `--config` applies the shared style (prove by reformatting a deliberately mis-formatted file). (4) The AC4 assertion fails when a `prettier` key is added to `packages/ui/package.json`, and passes with the root key present. (5) `pnpm lint:rules` green with the assertion count unchanged or higher.

**Definition of Done (additions)** — `configs/README.md` documents the final scope list and the Prettier discovery mechanism.

**Risk** Low · **Complexity** S

**Objective** — Make the approved commit/branch standards mechanical.

**Source of Truth** — Blueprint §12; Sprint 0 Guide §8.

**Dependencies** — `KF-S0-INFRA-003`.

**Files / Areas** — `.husky/`, lint-staged config, commitlint config, Changesets config, Renovate config.

**Implementation Requirements** — pre-commit: lint-staged (eslint --fix, prettier) + typecheck of staged packages; commit-msg: commitlint with the module/package scope list enumerated from the epic codes; Changesets for `packages/*`; Renovate weekly grouped, security immediate.

**Acceptance Criteria** — A commit message `updated stuff` is rejected; `feat(billing): add fee plan model` is accepted; staged file with lint error blocks commit.

**Risk** Low · **Complexity** S

---

## KF-S0-INFRA-005b — Exclude approved documentation from auto-formatting (follow-up) ✅ DONE

> **Status:** DONE · 2026-08-10 · commit `72a84db` (3 files, +84/−4) · preceded by `9e7ecf6`
> **Evidence (independently verified by the planner):** 16 commits, tree clean apart from untracked `designs/`; exactly one lint-staged config (`.lintstagedrc.mjs`; the `.json` was deleted, so no discovery ambiguity); **no `.prettierignore` exists** — requirement 3 honoured, a developer can still format a doc by hand; task commit touched **zero** files under `docs/`; no probe file reached permanent history.
> **Mechanism — function form, chosen on evidence:** both negated-glob candidates were tested against the matcher lint-staged 17 actually uses (**picomatch**, not micromatch) and both failed: `!(docs)/**/*.md` silently drops root `README.md` (needs a directory segment), and `!docs/**/*.md` negates the whole pattern and starts matching `package.json`. Rejected reasons are documented inline so nobody re-tries them.
> **Requirement 2 satisfied structurally:** `PROTECTED_PATHS` filters once into `eligible`, and every task selects from it — the exemption is a property of the **path**, not of Prettier. A markdown linter added later inherits it with no further change. Root resolved via `fileURLToPath(import.meta.url)`, not `process.cwd()`, so filtering holds wherever lint-staged is invoked.
> **AC verification quality:** proven by **sha256 on committed bytes**, not by eye — docs probe identical (trailing spaces survived, table left ragged, `*emphasis*` unconverted), configs probe differed (aligned, collapsed, `_emphasis_`). AC3 exercised both in a single real commit, then unwound.
> **R-13 did NOT reproduce — kept open, correctly.** Worst shape now 16.6s vs the 4m31s outlier. Key insight: a docs-only commit costs 10.8s doing **zero** work, so the cost is fixed startup overhead (husky dispatch, two pnpm launches, lint-staged's stash cycle, turbo startup), not formatting — optimising formatters would buy almost nothing. The single outlier was **not explained and not invented away**; it stays open as "one unreproduced outlier" for `KF-S0-CI-001` to measure on the runner and a second machine.
> **O-9 retracted:** Windows Defender real-time protection is **off** on this machine, so the antivirus explanation for slow I/O is unsupported. The slowness is real; the attributed cause is not. `KF-S0-DOC-001` records the measured numbers (10.8 / 12.7 / 16.6s warm, 3m27s cold install) **without** the causal claim.
> **New:** O-14 — a docs-only commit still runs the full stash cycle and whole-workspace typecheck for zero staged code. Correct but wasteful; narrowing it belongs to D-12's owner, not here. Routed to `KF-S0-CI-001`. O-13 — dangling lint-staged stashes now three and growing; harmless, gc-collectable, noted for the development guide.
> **`--no-verify` habit ended:** Step 0 was the last bypass (unavoidable — the old config would have rewritten the very docs it was committing). This task's own commit and all five probe commits passed the hooks cleanly.
> **DoD:** 10, 12, 16 applicable and satisfied; 17 not evaluable (no CI); rest not applicable with reasons.
> **Unlocks:** `KF-S0-CI-001`, `KF-S0-OPS-002`.

**Objective** — Stop the pre-commit hook rewriting approved Phase 0–9 documentation, and remove the `--no-verify` habit it forces.

**Source of Truth** — Blueprint §12; Sprint 0 Guide §8; planner decision on R-12 (2026-08-10, founder option أ); risks R-12, R-13, O-13 from `KF-S0-INFRA-005a`.

**Dependencies** — `KF-S0-INFRA-005a`.

**Files / Areas** — `.lintstagedrc.json`, `configs/README.md`, and the development-guide note routed to `KF-S0-DOC-001`.

**Implementation Requirements**
1. Exclude `docs/**` from every lint-staged task. Approved documentation is a controlled, hand-authored artifact; a formatter must not rewrite table alignment, emphasis markers, or line wrapping in the project's source of truth.
2. Repo-owned markdown outside `docs/` (`README.md`, `configs/**`, `.github/**`, package READMEs) **stays** auto-formatted — this task narrows the scope, it does not abandon markdown formatting.
3. Prefer lint-staged's negated-glob or function form; whichever is chosen must be proven by the verification below rather than assumed to work (lint-staged glob semantics differ from `.gitignore`).
4. Record in `configs/README.md` what is and is not auto-formatted, and why.

**Security Requirements** — None.

**Testing Requirements** — Empirical, not by inspection: stage a deliberately mis-formatted file in `docs/` and confirm it is committed **unchanged**; stage a deliberately mis-formatted `configs/**` markdown file and confirm it **is** reformatted; both in the same commit to prove the split works simultaneously.

**Acceptance Criteria**
1. A commit touching only `docs/**` completes **without** `--no-verify` and leaves every staged doc byte-identical.
2. A commit touching `configs/**` markdown still reformats it to house style.
3. A single commit touching both behaves correctly for each path in the same run.
4. `pnpm lint:rules` green, assertion count unchanged.
5. Measured pre-commit duration reported for: docs-only commit, code commit, mixed commit — establishing whether R-13's 4m31s is reproducible and where the cost sits.

**Definition of Done (additions)** — `configs/README.md` documents the formatting boundary. The R-13 measurements and O-13's dangling-stash note are handed to `KF-S0-DOC-001` for the development guide.

**Risk** Low · **Complexity** S

---

## KF-S0-CI-001 — Core CI workflow

**Objective** — PR pipeline running the non-domain-specific gates.

**Source of Truth** — Sprint 0 Guide §3.1; Blueprint §9.

**Dependencies** — `KF-S0-INFRA-004`, `KF-S0-OPS-001`.

**Files / Areas** — `.github/workflows/ci.yml`.

**Implementation Requirements** — Jobs: setup (pnpm cache + turbo cache), lint, typecheck, test (unit + integration with Testcontainers services), coverage threshold (domain/application ≥80%), build (+ Docker images on `main`).

> **Note added 2026-08-10 (from KF-S0-INFRA-002, R-2/O-6):** the runner **must** pin pnpm **9.15.9** (via corepack + the root `packageManager` field) — a different major will churn the lockfile. The runner must also select Node ≥22 explicitly; the build host uses nvm with no default active version.
>
> **⚠️ Note added 2026-08-10 (from KF-S0-INFRA-004, R-8) — CI-blocking:** invoke turbo **only through pnpm** (`pnpm build`, `pnpm typecheck`), never `npx turbo` or a bare turbo binary. Turbo spawns `pnpm run <task>` per package; outside pnpm, each cache-miss task re-resolves pinned `pnpm@9.15.9` from the registry and one network failure kills the build. Pre-activate pnpm via corepack so no task reaches the network. **A warm cached run will not reveal this** — cache hits replay logs without spawning pnpm — so validate on a cold cache.
>
> **Note added 2026-08-10 (from KF-S0-INFRA-004, R-9/O-10):** `build` and `typecheck` are both `tsc -b`; CI need not run both. `test` and `lint` currently have no implementers — do not treat a green `pnpm test` as a signal until real tests land.
>
> **Note added 2026-08-10 (from KF-S0-INFRA-005b, R-13/O-14):** R-13's 4m31s **did not reproduce** — warm measurements are 10.8s (docs-only) / 12.7s (code) / 16.6s (mixed) on the dev machine. The cost is fixed startup overhead, not formatting: a docs-only commit runs zero tasks and still takes 10.8s. **Measure on the runner and one other developer machine before acting**; the outlier stays open, unexplained. O-14: consider skipping `pnpm typecheck` when no code file is staged — that narrows D-12's whole-workspace choice, so it is D-12's owner's call.
>
> **Note added 2026-08-10 (from KF-S0-INFRA-005/005a, O-12/R-13):** client hooks are bypassable with `--no-verify` by design of git — they are fast feedback, **not** a gate. CI must independently re-run lint, typecheck, and **commitlint over the PR commit range**. Also measure hook duration on the runner: a local pre-commit of 4m31s was observed on a Windows volume (typecheck was only 360 ms — the cost is eslint/prettier plus lint-staged's stash cycle).
>
> **Note added 2026-08-10 (from KF-S0-INFRA-003, R-4):** adopt `pnpm lint:rules` as a blocking gate — it is already shaped as a single exit-code-bearing command. Use the glob form `node --test "configs/eslint/test/**/*.test.mjs"`; the directory form (`node --test <dir>`) fails on Node 22.

**Acceptance Criteria**
1. A PR triggers all jobs; each is individually required by branch protection.
2. Coverage below threshold fails the job (demonstrated with a temporary fixture).
3. Total PR pipeline time on cache hit is recorded in the development guide.

**Risk** Low · **Complexity** M

---

## KF-S0-CI-002 — Module boundary enforcement (dependency-cruiser)

**Objective** — Prevent the modular monolith from eroding, mechanically.

**Source of Truth** — SAD §3.2 (boundary rules), §13 TR-02; Blueprint §3, §12.

**Dependencies** — `KF-S0-CI-001`.

**Files / Areas** — `tooling/depcruise/`, CI job.

**Implementation Requirements** — Rules: no deep imports across `apps/api/src/modules/*` (only each module's public `index.ts`); `domain/` may not import NestJS or Prisma; `packages/*` may not import from `apps/*`; `@kf/shared` may not import framework code. Plus a violating fixture proving each rule.

**Acceptance Criteria** — Each rule has a fixture that fails CI when enabled; clean tree passes; rule violations print the offending path and the rule name.

**Risk** Medium · **Complexity** M

---

## KF-S0-CI-003 — Migration linter (RLS annotation gate)

**Objective** — Make it impossible to add a tenant table without isolation.

**Source of Truth** — Domain Model Part 6.1 (policy classes), SAD §13 TR-01; Blueprint §4; Sprint 0 Guide §10 item 0.5.

**Dependencies** — `KF-S0-CI-001`, `KF-S0-RLS-002` (policy-class vocabulary confirmed by ADR-010).

**Files / Areas** — `tooling/migration-lint/`, CI job.

**Implementation Requirements** — Parse the migration diff on a PR: every `CREATE TABLE` must carry a policy-class annotation comment from the approved vocabulary (`TENANT_STANDARD`, `TENANT_OR_PLATFORM`, `GLOBAL_READ`, `SELF_TENANT_ROOT`); tenant-classed tables must have `tenant_id`, `ENABLE`+`FORCE ROW LEVEL SECURITY`, a policy statement, and at least one index leading with `tenant_id`; the model manifest must be updated in the same PR.

**Acceptance Criteria**
1. Fixture migration creating a tenant table without a policy fails CI naming the table.
2. Fixture missing `FORCE ROW LEVEL SECURITY` fails.
3. Fixture with a non-tenant-led index only produces a warning-level failure with the rule name.
4. A compliant migration passes.

**Risk** High · **Complexity** L

---

## KF-S0-CI-004 — Security scanning jobs

**Objective** — Baseline supply-chain and secret hygiene from commit one.

**Source of Truth** — Blueprint §10; Sprint 0 Guide §3.1.

**Dependencies** — `KF-S0-CI-001`.

**Implementation Requirements** — gitleaks (full history on `main`, diff on PR), `pnpm audit` (high = fail), trivy image scan post-build.

**Acceptance Criteria** — Planted dummy secret in a fixture branch fails the job; a known-high advisory in a fixture dependency fails the job.

**Risk** Low · **Complexity** S

---

## KF-S0-CONTRACT-001 — `@kf/contracts` skeleton

**Objective** — Establish the single source of API truth before any endpoint exists.

**Source of Truth** — API Contract §1, §3, §4, §8; RBAC §2.4, §3; Domain Model Part 8 (enums), §1.5 (events); Sprint 0 Guide §6.

**Dependencies** — `KF-S0-INFRA-004`.

**Files / Areas** — `packages/contracts/` (`openapi.yaml` root + `paths/` + `components/`, `permissions.ts`, `errors.ts`, `enums.ts`, `schemas/`, `events/`), `tooling/generators/`.

**Implementation Requirements**
1. OpenAPI 3.1 root with `info`, `servers`, tags per module, `bearerJwt` security scheme, and shared components: `ProblemDetails`, `PaginatedMeta`, `Money`, `LocalizedText`, `IdempotencyKeyHeader`, `IfMatchHeader`, `RateLimitHeaders`.
2. Seed paths: `/health/live`, `/health/ready`, and the `/auth/*` operations from API Contract §2.1 (definitions only; implementation is S1).
3. `permissions.ts`: every `{resource}:{action}` code implied by RBAC §3 as a const map with types.
4. `errors.ts`: the full §4 catalog (code → HTTP status → i18n key).
5. `enums.ts`: all Domain Part 8 enums.
6. Codegen script producing TS types + a typed fetch client; CI drift check.
7. Custom extensions used: `x-permission-code`, `x-rate-limit-tier`, `x-audit-events`, `x-idempotency`.

**Security Requirements** — Permission codes are the authorization vocabulary; the map is the only permitted source (guards must not accept string literals).

**API Requirements** — Spec-first: the file is authored here, not generated from decorators; decorators are diffed against it (`KF-S0-API-001`).

**Testing Requirements** — Spec lints clean (spectral or equivalent); codegen output compiles; a test asserts every `x-permission-code` value exists in `permissions.ts`.

**Acceptance Criteria**
1. `pnpm --filter @kf/contracts generate` produces types with zero TS errors.
2. Adding an operation without `x-permission-code` fails the contracts test.
3. An error code used in a path but absent from `errors.ts` fails the test.

**Risk** Medium · **Complexity** L

---

## KF-S0-API-001 — NestJS bootstrap

**Objective** — API application skeleton with cross-cutting concerns wired in the approved order.

**Source of Truth** — SAD §3.1–§3.2 (module layout), §9 (observability), §11 (health); API Contract §1, §4; Blueprint §3; Sprint 0 Guide §4.

**Dependencies** — `KF-S0-CONTRACT-001`, `KF-S0-OPS-002`.

**Files / Areas** — `apps/api/src/` (`main.ts`, `worker.ts`, `shared-kernel/`, `modules/*` empty module folders with READMEs).

**Implementation Requirements**
1. Typed config module validating every env var at boot (fail-fast) with zod.
2. pino structured logging: JSON, `trace_id` from `X-Request-Id` (generated if absent), `tenant_id` enrichment hook, redaction list; **no child PII in logs**.
3. Health endpoints `/health/live` and `/health/ready` (PG, Redis, S3 reachability).
4. Global exception filter emitting RFC 7807 using `@kf/contracts` error codes; unknown → `INTERNAL_ERROR` with `trace_id`; no stack traces in responses.
5. Global `ValidationPipe` (whitelist, transform).
6. Swagger with the custom decorators emitting `x-permission-code` etc.; spec written to a file for the CI diff.
7. Empty module folders for all 11 bounded contexts + `shared-kernel/`, each with a README naming its Domain Model section — so the boundary linter has a real tree.
8. Guard pipeline order registered with placeholder guards (real auth in S1) so ordering is proven now.

**Security Requirements** — Error filter must never leak internals; config must fail closed on missing secrets.

**Testing Requirements** — Integration: `/health/ready` returns 503 when Redis is stopped; error filter unit tests for shape; log redaction test.

**Acceptance Criteria**
1. Booting with a missing required env var exits non-zero with a message naming the variable.
2. An unhandled exception returns `{type,title,status,code,detail,trace_id}` with `code: INTERNAL_ERROR` and the same `trace_id` present in the log line.
3. Swagger output contains the custom extensions and diffs clean against `@kf/contracts`.

**Risk** Medium · **Complexity** L

---

## KF-S0-API-002 — Redis and BullMQ wiring with DLQ proof

**Objective** — Prove the async substrate end-to-end before any real queue depends on it.

**Source of Truth** — SAD §10 (queue topology, execution policy); ADR-004, ADR-005; Blueprint §3.

**Dependencies** — `KF-S0-API-001`.

**Files / Areas** — `apps/api/src/shared-kernel/queue/`, `apps/api/src/worker.ts`.

**Implementation Requirements** — Redis connection module (namespaced keys); BullMQ module; one `system-heartbeat` queue with a repeatable job; a deliberately failing job class demonstrating retry/backoff and DLQ landing; worker runs in the same image via a different command.

**Security Requirements** — Job payload carries `tenant_id` where applicable; worker establishes tenant context identically to HTTP (pattern from ADR-010) — proven here with a stub tenant.

**Testing Requirements** — Integration: job retries the configured number of times then lands in DLQ; repeatable job schedules; graceful shutdown drains in-flight jobs.

**Acceptance Criteria**
1. A failing job is retried per policy and appears in the DLQ with its error recorded.
2. Worker process starts from the same image with a different command and processes jobs.
3. Killing the worker mid-job does not lose the job (redelivery observed).

**Risk** Medium · **Complexity** M

---

## KF-S0-API-003 — Prisma init, migrations M-000/M-001, tier-1 seed

**Objective** — Database foundation: extensions, roles, enums, and global reference data.

**Source of Truth** — Blueprint §4 (M-000, M-001, seed tiers); Domain Model Part 3 (tables 4, 11, 12, 13, 6, 49), Part 5 (standards), Part 6 (policy classes); ADR-002, ADR-003.

**Dependencies** — `KF-S0-RLS-002` (pattern decided), `KF-S0-CI-003` (linter available to validate).

**Files / Areas** — `apps/api/prisma/` (schema, migrations, seed), model manifest.

**Implementation Requirements**
1. M-000: extensions `pgcrypto`, `pg_trgm`, `unaccent`, `pg_stat_statements`; roles `kf_migrator`, `kf_api` (no BYPASSRLS), `kf_worker`, `kf_audit_writer` (INSERT-only on audit) with least-privilege grants.
2. M-001: all enums from Domain Part 8; global reference tables `subscription_plans`, `roles`, `permissions`, `role_permissions`, `feature_flags`, `prompt_versions` with `GLOBAL_READ` policy class.
3. Migration file convention: generated DDL, then a marked hand-written SQL block for policies/triggers/partial indexes.
4. Tier-1 seed (idempotent upsert): 7 roles, permission codes imported from `@kf/contracts/permissions`, 3 subscription plans (limits flagged `TODO-F1` in seed data per DISC-006), global feature flags, prompt version placeholder rows.

**Security Requirements** — Verify in a test that `kf_api` lacks BYPASSRLS and cannot create tables.

**Database Requirements** — As above; policy-class annotations present for the linter; `updated_at` triggers; UUIDv7 generation strategy documented (app-side with DB fallback).

**Testing Requirements** — Integration: migrate from empty → success; seed twice → identical state (idempotency); role-privilege assertions; enum parity test against `@kf/contracts/enums`.

**Acceptance Criteria**
1. `prisma migrate deploy` on an empty database succeeds and the migration linter passes.
2. Running the tier-1 seed twice produces no duplicate rows and no errors.
3. Permission rows in the DB exactly equal the `@kf/contracts/permissions` map (test fails on drift in either direction).
4. `kf_api` cannot `CREATE TABLE` and has no BYPASSRLS (asserted).

**Risk** High · **Complexity** L

---

## KF-S0-API-004 — Audit writer with hash chain

**Objective** — Tamper-evident audit primitive available before any auditable action exists.

**Source of Truth** — RBAC §6; Domain Model Part 7, Part 3 (table 52); SAD §5.3.

**Dependencies** — `KF-S0-API-003`.

**Files / Areas** — `apps/api/src/shared-kernel/audit/`.

**Implementation Requirements** — `AuditWriter` port + Prisma implementation; row fields per Domain table 52 (actor, tenant, action code, entity type/id, before/after diff PII-minimized, trace_id, ip, occurred_at, row_hash, prev_hash); chain computed per tenant; interceptor supplying actor/trace context automatically; INSERT-only enforcement via the `kf_audit_writer` role.

**Security Requirements** — No UPDATE/DELETE path in code or grants; diffs must exclude encrypted/medical field values (store field names + change markers only).

**Testing Requirements** — Unit: chain computation, tamper detection (mutating a row breaks verification); integration: writer cannot update or delete; PII-exclusion test.

**Acceptance Criteria**
1. Writing three entries produces a verifiable chain; altering entry 2 causes verification to fail naming the broken link.
2. An attempted `UPDATE audit_log` as the app role is rejected by privileges.
3. An audited change to a medical field records the field name but not its value.

**Risk** High · **Complexity** M

---

## KF-S0-OPS-001 — Remote repository, branch protection, CODEOWNERS

**Objective** — Enforce review and CI gates at the platform level.

**Source of Truth** — Blueprint §12; instruction §17 (PR-blocking list).

**Dependencies** — `KF-S0-INFRA-001`; external: GitHub org (DISC-009).

**Implementation Requirements** — Remote repo; protected `main` requiring: lint, typecheck, unit+integration, **isolation**, OpenAPI diff, build, migration validation; linear history; 1 approval (2 for `apps/api/src/modules/{billing,attendance}`, `shared-kernel/`, and any `prisma/migrations/**` path via CODEOWNERS).

**Acceptance Criteria** — Direct push to `main` is rejected; a PR with a failing required check cannot merge; a PR touching billing paths requests two reviewers automatically.

**Risk** Low · **Complexity** S

---

## KF-S0-OPS-002 — Docker Compose development environment ✅ DONE (revised scope, D-17)

> **Status:** DONE · 2026-08-10 · commit `6d0fd41` (6 files, +780) · preceded by `6929557`
> **Evidence (independently verified by the planner):** 18 commits, tree clean apart from untracked `designs/`; all four M-000 roles created with explicit `NOBYPASSRLS NOCREATEDB NOCREATEROLE NOSUPERUSER`; **6 images pinned by digest** (ADR-006), 5 healthchecks, `profiles: ['tools']` on pgAdmin; `.env` gitignored and never staged; `.env.example` credentials all `dev_only_*` fakes; the `KF-S0-OPS-002a` hand-off is named in `dev-setup.sh` with its full dependency chain.
> **Verification quality — this task justified its own acceptance criteria.** AC3 was written as "asserted by SQL, not by reading the init script", and that wording is the only reason **bug (a)** was caught: `--project-directory` made Compose resolve `./postgres/init` relative to the project dir, so the init scripts silently never ran — **Postgres reported healthy with zero roles and zero extensions**. A script-reading review would have passed it. A healthy-but-empty database reaching the TR-10 spike would have produced meaningless isolation results.
> **Beyond the criteria:** RLS was proven functionally, not just structurally — a probe table with `FORCE ROW LEVEL SECURITY` showed `kf_api` seeing only its own tenant's row, and **zero rows with no tenant set** (fail-closed). Probe dropped. The dev environment is therefore a genuine RLS environment, so TR-10 results will transfer (T-3).
> **Port collision occurred exactly as predicted** (a pre-existing stack held 6379). The documented override worked end-to-end, and the script was improved to translate Docker's variable-less bind error into the exact `.env` fix — including the warning that URLs built from the port do not recompute themselves.
> **Two further bugs found and fixed:** MSYS path translation corrupting `--env-file` on Windows (fixed by relative paths, verified under both path modes); pgAdmin rejecting `.local` addresses via an undocumented `ALLOW_SPECIAL_EMAIL_DOMAINS` validator. In the latter the script behaved correctly — detected unhealthy, dumped logs, exited non-zero.
> **Timings:** cold pull 62 s · cold volume init 20 s · warm restart 10–12 s — against a 10-minute budget. R-13's slowness did not manifest in Docker operations, further weakening the environmental explanation.
> **DoD:** 4 (isolation foundation, proven), 10, 12, 13, 16 applicable and satisfied; 17 not evaluable (no CI); rest not applicable with reasons.
> **Unlocks:** **`KF-S0-RLS-001` — the TR-10 spike.** Deferred: `KF-S0-OPS-002a`.

---

## KF-S0-OPS-002a — Complete dev-setup with migrate and seed (deferred from OPS-002)

**Objective** — Finish `dev-setup.sh` with the migrate and seed steps that `KF-S0-OPS-002` could not deliver, and add the config-boot test that AC3 of the original spec required.

**Source of Truth** — Sprint 0 Guide §2; `KF-S0-OPS-002` original acceptance criteria; planner decision D-17 (2026-08-10).

**Dependencies** — `KF-S0-API-001` (config module), `KF-S0-API-003` (Prisma, migrations, tier-1 seed).

**Files / Areas** — `scripts/dev-setup.sh`, `.env.example`, a config-boot test.

**Implementation Requirements** — Append after the health wait: run migrations, run the tier-1 seed, provision a demo tenant; keep every step idempotent so re-running the script stays safe. Add the test that boots the config module from `.env.example` and fails if any required variable is missing.

**Acceptance Criteria** — (1) `dev-setup.sh` on a clean volume produces a migrated, seeded, demo-tenant-ready database. (2) Running it twice succeeds with no duplicate data. (3) A variable removed from `.env.example` fails the config-boot test. (4) The original OPS-002 AC2 is now fully satisfiable: the API connects to Postgres, Redis, and S3.

**Risk** Medium · **Complexity** M

**Objective** — One-command local environment matching production service topology.

**Source of Truth** — Sprint 0 Guide §2; ADR-006.

**Dependencies** — `KF-S0-INFRA-002`.

**Files / Areas** — `infrastructure/compose/dev.yml`, `scripts/dev-setup.sh`, `.env.example`.

**Implementation Requirements** — postgres:16-alpine with init script creating DB + the M-000 roles (dev mirrors the production trust model), redis:7 with AOF, mailpit, MinIO with bootstrap buckets `kf-media`/`kf-backups`, pgadmin behind a `tools` profile; `dev-setup.sh` = compose up → wait-healthy → migrate → seed tier-1 → seed demo tenant → print URLs and credentials; `.env.example` documenting every variable.

**Acceptance Criteria**
1. On a machine with only Docker and pnpm, `scripts/dev-setup.sh` reaches a working stack in ≤10 minutes and prints service URLs.
2. All services report healthy; the API connects to each.
3. `.env.example` contains every variable the config module requires (asserted by a test that boots config from the example file).

**Risk** Medium · **Complexity** L

---

## KF-S0-OPS-003 — Dockerfiles for api and web

**Objective** — Production images, parity with dev.

**Source of Truth** — Blueprint §9; ADR-006; Sprint 0 Guide §7.

**Dependencies** — `KF-S0-INFRA-004`.

**Implementation Requirements** — Multi-stage builds, non-root user, pinned base digests, `HEALTHCHECK`, api image runs API or worker by command, web uses Next standalone output.

**Acceptance Criteria** — Both images build in CI and run locally against the compose services; image runs as non-root (asserted in CI); trivy scan passes.

**Risk** Medium · **Complexity** M

---

## KF-S0-OPS-004 — Coolify staging environment and deployment pipeline

**Objective** — CI-driven staging deployment with migrations and smoke verification.

**Source of Truth** — SAD §11; Blueprint §9; Sprint 0 Guide §3.2, §7.

**Dependencies** — `KF-S0-OPS-003`, `KF-S0-CI-001`; external: Coolify host + registry + **F4 hosting region decision** (DISC-006).

**Implementation Requirements** — Staging project (api, worker, web, postgres, redis), secrets in the Coolify store, deploy webhook from Actions, migrations as a pre-deploy job, post-deploy smoke (health + isolation canary), config exported to `infrastructure/coolify/`.

**Acceptance Criteria**
1. Merge to `main` deploys staging automatically; health probes green.
2. A failed migration aborts the deploy without replacing the running version.
3. Staging config can be recreated from `infrastructure/coolify/` following the runbook.

**Risk** High · **Complexity** L · **Blocked by** F4 (founder), infrastructure accounts.

---

## KF-S0-OPS-005 — Observability, backups, and restore drill

**Objective** — See the system and be able to recover it, from the first environment.

**Source of Truth** — SAD §6.4, §9, §11; Blueprint §9.

**Dependencies** — `KF-S0-OPS-004`.

**Implementation Requirements** — Uptime Kuma probes; node/postgres/redis exporters + Grafana dashboards (API latency, queue depth, DLQ, connections, disk, backup age); Sentry projects with release tagging; nightly `pg_dump` + WAL archiving to encrypted S3; `scripts/restore-rehearsal.sh`; alert routes per SAD §11.

**Acceptance Criteria**
1. A deliberate error appears in Sentry tagged with the release SHA.
2. Backup lands encrypted in the bucket; backup-age metric visible in Grafana; alert fires when age exceeds threshold (tested by pausing the job).
3. Restore rehearsal recreates staging data from the latest backup; elapsed time recorded (baseline for the 4 h RTO).

**Risk** Medium · **Complexity** L

---

## KF-S0-FE-001 — Next.js bootstrap with route groups

**Objective** — Frontend skeleton with the five approved surface shells.

**Source of Truth** — Design System §04 (shells), §06 (IA); Blueprint §2; ADR-009.

**Dependencies** — `KF-S0-INFRA-004`.

**Files / Areas** — `apps/web/app/(console|teacher|parent|gate|platform)/`, middleware.

**Implementation Requirements** — App Router, TS strict; route groups with distinct layouts per Design §4.1; middleware stub for role-based surface routing; error boundary per group with `trace_id` display; loading skeleton convention.

**Acceptance Criteria** — Each surface renders its shell; an unauthorized route renders the 404 page (no existence leak); error boundary displays a trace id.

**Risk** Low · **Complexity** M

---

## KF-S0-FE-002 — `@kf/tokens` build pipeline

**Objective** — Design tokens as the single styling source.

**Source of Truth** — Design System §02 (all token tables), §2.2 (dark), §2.6 (RTL).

**Dependencies** — `KF-S0-INFRA-003`.

**Implementation Requirements** — Token source (typed TS/JSON) → generated `tokens.css` (light + dark) + Tailwind preset; logical-property-only spacing utilities; z-index scale including the safety takeover level.

**Acceptance Criteria** — Tokens render as CSS variables; dark mode switches by class; the lint rule from `KF-S0-INFRA-003` passes only when components consume tokens; token names match Design §02 exactly (review checklist).

**Risk** Medium · **Complexity** M

---

## KF-S0-FE-003 — `@kf/ui` initialization and first components

**Objective** — Component library seeded with the primitives every surface needs.

**Source of Truth** — Design System §05 (component specs), §19 (shadcn mapping), §13 (a11y).

**Dependencies** — `KF-S0-FE-002`.

> **Note added 2026-08-10 (from KF-S0-INFRA-003, R-5):** this is the first task that puts real source under the custom lint rules' scope. Measure the false-positive rate of the physical-direction and raw-hex/px rules here and report it; a false positive is escapable with a visible `eslint-disable-next-line`, but a pattern of them means the rule needs tightening.

**Implementation Requirements** — shadcn/ui initialized into `packages/ui` themed by tokens; deliver Button (primary/secondary/ghost/destructive/kiosk/ai + loading), Input, Badge (semantic enum map), Skeleton, Toast; every component with all states, RTL, dark, and a11y attributes per §19.

**Testing Requirements** — Component tests for states and a11y roles; axe check in the component test run.

**Acceptance Criteria** — Each component renders correctly in ar-RTL and en-LTR and in both themes; Button loading preserves width and sets `aria-busy`; Badge maps every enum value in `@kf/contracts/enums` (test fails on an unmapped value).

**Risk** Medium · **Complexity** L

---

## KF-S0-FE-004 — `@kf/i18n`, RTL proof, and formatters

**Objective** — Arabic-first internationalization proven before feature UI exists.

**Source of Truth** — Design System §03 (typography, digits, mixed-language), §2.6; DISC-007 (UXD-02/03).

**Dependencies** — `KF-S0-FE-001`, `KF-S0-FE-002`.

**Implementation Requirements** — next-intl with `ar` default + `en`; `<html dir lang>` per locale; self-hosted IBM Plex Sans Arabic + IBM Plex Sans; formatters for money, dates, numbers implementing UXD-02 (Western digits) and UXD-03 (Gregorian) **behind named constants** so a founder reversal is a one-line change; a proof page rendering mixed AR/EN content with `dir="auto"` isolation.

**Acceptance Criteria**
1. Switching locale flips direction, font stack, and formatting with no layout breakage on the proof page.
2. An Arabic sentence containing a Latin product name renders correctly in both directions (visual test committed).
3. Money renders with tabular figures and the locale's currency placement.
4. If UXD-02/03 are unconfirmed at implementation time, the constants carry the documented recommendation and a `DISC-007` reference comment.

**Risk** Medium · **Complexity** M

---

## KF-S0-FE-005 — TanStack Query and generated API client

**Objective** — Typed data layer with the approved caching policy.

**Source of Truth** — Blueprint §2; API Contract §1 (caching, headers, idempotency).

**Dependencies** — `KF-S0-CONTRACT-001`, `KF-S0-FE-001`.

**Implementation Requirements** — Query provider + key convention module; `persistQueryClient` (IndexedDB) for teacher/parent; fetch wrapper injecting `Authorization`, `X-Request-Id`, `Accept-Language`, `Idempotency-Key`/`If-Match` per spec extensions; refresh-on-401 skeleton; error mapper from `@kf/contracts/errors` to localized UI messages.

**Acceptance Criteria** — Example query against `/health/ready` renders; a 7807 error response surfaces the mapped localized message and the trace id; endpoints marked `x-idempotency: required` cannot be called without a key (type-level or runtime assertion).

**Risk** Medium · **Complexity** M

---

## KF-S0-FE-006 — PWA shell and offline write-queue skeleton

**Objective** — Offline foundation ahead of the safety-critical S3 work.

**Source of Truth** — ADR-009; SAD §8.2; API Contract §5; Design System §14; Blueprint §2.

**Dependencies** — `KF-S0-FE-005`.

**Implementation Requirements** — Serwist service worker with app-shell precache and offline fallback; manifest entries for teacher and parent; Zustand + IndexedDB write-queue store exposing `enqueue`, `list`, `drain`, `reconcile`; drain wired to a **mock** sync endpoint (real endpoint in S3); offline banner component with queued count (Design §05).

**Testing Requirements** — E2E with offline emulation: enqueue offline → reload app → queue survives → reconnect → drain called with a batch.

**Acceptance Criteria**
1. With the network disabled, the app loads from cache and accepts queued writes.
2. Queue survives a full app restart (asserted via IndexedDB inspection in the test).
3. On reconnect, drain is invoked once per batch with an idempotency key; a failed drain retries with backoff and never drops items.

**Risk** High · **Complexity** L

---

## KF-S0-DOC-001 — README, development guide, architecture overview

**Objective** — Make the repository self-explanatory; resolve DISC-002.

**Source of Truth** — Sprint 0 Guide §9; Blueprint §12; DISC-002.

**Dependencies** — `KF-S0-OPS-002`, `KF-S0-CI-003`.

> **Note added 2026-08-10 (from KF-S0-INFRA-003a, R-7):** document the comment convention — never write bare `foo-*/` inside a JSDoc block; the `*/` terminates the comment and the module fails with an opaque `SyntaxError`. Use `foo-…` or backticked `` `foo-*` ``. This repo writes glob notation in comments constantly.
>
> **Note added 2026-08-10 (from KF-S0-INFRA-003, O-7/O-9):** record the confirmed house Prettier style (100 cols, single quotes, semicolons, trailing commas, LF) as settled — it is not specified by any earlier document and should not be re-litigated. Also record the toolchain reality: a cold `pnpm install` on a Windows volume exceeded 10 minutes (warm: ~5 s), so first-time setup expectations must be stated.
>
> **Priority note 2026-08-10:** DISC-002 escalated to **P0** — after `KF-S0-INFRA-002` the README references `backend/` and `frontend/`, which no longer exist. Pull this task forward ahead of its listed position. The development guide must also record the toolchain prerequisites found in O-6 (Node ≥22 selected explicitly; nvm has no default on the build host) and the pinned pnpm 9.15.9.

**Implementation Requirements** — Rewrite root README (quickstart, workspace map, links); `docs/development-guide.md` (setup, commands, test tiers incl. running the isolation suite locally, migration workflow with the annotation convention, "adding an endpoint" OpenAPI-first checklist, "adding a component" token/QA checklist); `docs/architecture-overview.md` (2-page orientation linking to phase docs, no duplication); update SAD §12 ADR table to include ADR-010.

**Acceptance Criteria** — A person who did not participate in Phases 0–8 sets up the project and runs all test tiers using only these documents (recorded dry run, per Sprint 0 Guide item 0.18).

**Risk** Low · **Complexity** M

---

## KF-S0-DOC-002 — Repository templates and documentation pointers

**Objective** — Encode the review checklist; resolve DISC-004.

**Source of Truth** — Blueprint §12 (PR template); Sprint 0 Guide §9; DISC-004.

**Dependencies** — `KF-S0-OPS-001`.

**Implementation Requirements** — `.github/PULL_REQUEST_TEMPLATE.md` with the gates checklist (tests, OpenAPI parity, isolation, audit events, Design QA, docs, ar+en screenshots, risk note); issue templates `story.yml`, `bug.yml` (trace_id, tenant, severity), `spike.yml`; pointer READMEs in `docs/02_Requirements/`, `docs/08_AI/`, `docs/09_Deployment/` naming the authoritative sections.

**Acceptance Criteria** — New PRs render the checklist; each empty docs folder contains a pointer file with no duplicated content.

**Risk** Low · **Complexity** S

---

## KF-S0-EXT-001 — Founder & external track (not an engineering task; tracked here for dependency clarity)

**Owner** Founder · **Blocks** `KF-S0-OPS-004` (F4), S5 AI tasks (LLM terms), beta launch (F2), sprint calendar (team confirmation), `KF-S0-FE-004` defaults (UXD-02/03).

**Items** — F4 hosting region decision · F2 Egypt PDPL review kickoff · LLM provider zero-retention agreement · team composition confirmation · UXD-02/03 confirmation · procurement of GitHub org, registry, Coolify host, S3 storage, SMTP/SMS providers.

**Acceptance Criteria** — Each item either decided (recorded in `docs/Decisions/`) or explicitly deferred with an owner and date.

---

## Sprint 0 Exit Checklist

| Gate | Evidence required |
|---|---|
| ADR-010 merged | Document with benchmarks and named test evidence |
| Isolation harness | Demonstrated failing on the leak fixture and passing on clean schema |
| CI blocking gates | Each of the 8 required checks shown failing on its fixture |
| Staging live | URL reachable, deployed by pipeline, health green |
| Backups | Encrypted backup present; restore rehearsal completed with recorded duration |
| Onboarding | Fresh-clone dry run completed by a non-author |
| RTL proof | Screenshot pair (ar/en) of the proof page in the PR |
| Founder track | Status recorded for every `KF-S0-EXT-001` item |
