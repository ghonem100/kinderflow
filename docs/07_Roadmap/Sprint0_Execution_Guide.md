# KinderFlow — Sprint 0 Execution Guide

| Field | Value |
|-------|-------|
| Document | Sprint 0 Execution Guide (Phase 8) |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Ready to execute |
| Inputs (approved, unchanged) | Engineering Blueprint v1.0 (§1–3 are the target state) + full Phase 0–7 stack |
| Rule | Planning artifact: exact structures, configs described to spec level, commands, acceptance criteria. Engineers implement; no design decisions remain open here |

---

# 1. Monorepo Initialization

## 1.1 Bootstrap sequence

```
pnpm init  (root, private: true, packageManager pinned: pnpm@9.x)
→ pnpm-workspace.yaml: packages: [apps/*, packages/*, tooling/*, configs/*]
→ add turbo (root devDep) + turbo.json
→ git init, .gitignore (node, next, prisma, env, coverage, .turbo)
→ create workspace skeleton (below) with per-package package.json + tsconfig
```

## 1.2 Target tree (Blueprint §1, initialization scope only)

```
kinderflow/
├── package.json · pnpm-workspace.yaml · turbo.json · .npmrc (strict-peer=false, save-exact)
├── apps/
│   ├── api/        # @kf/api — NestJS (§4)
│   └── web/        # @kf/web — Next.js (§5)
├── packages/
│   ├── contracts/  # @kf/contracts (§6)
│   ├── tokens/     # @kf/tokens — design tokens → css vars + tailwind preset
│   ├── ui/         # @kf/ui — shadcn-based library (consumes tokens)
│   ├── i18n/       # @kf/i18n — ar/en catalogs + formatters (UXD-02/03)
│   └── shared/     # @kf/shared — pure isomorphic utils (zero deps)
├── configs/        # @kf/config-ts / -eslint / -prettier / -tailwind (shared bases)
├── tooling/
│   ├── depcruise/  # boundary rules (Blueprint §3)
│   ├── migration-lint/  # RLS-class checker (script package)
│   └── generators/ # openapi→types, postman, token build
├── infrastructure/ · scripts/ · docs/ (existing)
```

## 1.3 TypeScript strategy

Root `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022, moduleResolution bundler) in `configs/`; **project references** across packages (`composite: true` in packages, references declared in consumers) → `tsc -b` incremental typecheck in CI; path aliases `@kf/*` via workspace protocol (`"@kf/contracts": "workspace:*"`) — no tsconfig paths hacks.

## 1.4 turbo.json pipeline

| Task | dependsOn | Outputs/notes |
|------|-----------|---------------|
| `build` | `^build` | dist/.next; tokens build runs first via dependency |
| `typecheck` | `^build` | tsc -b, cached |
| `lint` / `test` | — | cached by inputs |
| `test:isolation` | `^build` | never cached (DB-dependent) |
| `dev` | — | persistent, parallel api+web+workers |

---

# 2. Development Environment

## 2.1 docker-compose (infrastructure/compose/dev.yml)

| Service | Image/version | Config |
|---------|---------------|--------|
| postgres | postgres:16-alpine | Port 5432; init script creates `kf_dev` DB + roles from Blueprint §4 M-000 (kf_api no BYPASSRLS — dev mirrors prod trust model from day one); volume persisted |
| redis | redis:7-alpine | AOF on; port 6379 |
| mailpit | axllent/mailpit | SMTP 1025 / UI 8025 — all dev email |
| minio | minio/minio | S3 API 9000 / console 9001; bootstrap job creates `kf-media`, `kf-backups` buckets + access keys |
| pgadmin | dpage/pgadmin4 | UI 5050; preconfigured server entry (optional profile: `--profile tools`) |

Apps run on host (not containerized in dev) for hot reload: `pnpm dev` → turbo runs `api` (nest --watch), `web` (next dev), `worker` (nest --watch, worker entry). One command onboarding: `scripts/dev-setup.sh` = compose up + migrate + seed tier-1 + seed demo tenant + print URLs/creds.

## 2.2 Environment strategy

| Env | Source | Notes |
|-----|--------|-------|
| dev | `.env.local` from committed `.env.example` (every var documented, fake defaults for compose services) | Config module fail-fast keeps example honest |
| staging | Coolify secret store | Prod topology, anonymized tier-3 seed |
| production | Coolify secret store | No seed beyond tier-1; access restricted |

Var namespaces: `KF_DATABASE_URL`, `KF_REDIS_URL`, `KF_S3_*`, `KF_JWT_*` (key pair paths), `KF_AI_*`, `KF_SMTP_*`, `NEXT_PUBLIC_KF_API_URL` — full inventory lives in `.env.example` (authoritative).

---

# 3. CI/CD (GitHub Actions)

## 3.1 Workflow: `ci.yml` (every PR + main)

| Job | Content | Blocking |
|-----|---------|----------|
| setup | pnpm install (cached), turbo cache restore | — |
| lint | eslint + prettier check + commitlint (PR title) | ✔ |
| typecheck | `tsc -b` all references | ✔ |
| boundaries | dependency-cruiser (tooling/depcruise rules: no cross-module deep imports, domain→nest forbidden, packages→apps forbidden) | ✔ |
| migration-lint | tooling/migration-lint: every new table in migration diff has RLS-class annotation + policy SQL + tenant-led index | ✔ (TR-01) |
| test | unit + integration (Testcontainers PG/Redis) + pgTAP suite | ✔ |
| **isolation** | Tenant isolation suite: seed 2 tenants → generated cross-tenant matrix from OpenAPI `x-permission-code` (expect 404/0 rows) | ✔ **hard gate** |
| openapi-diff | Generated spec vs `packages/contracts/openapi.yaml` — breaking diff fails | ✔ |
| coverage | Merged lcov; domain+application ≥80% threshold | ✔ |
| build | turbo build + Docker images (api, web) on main; push to registry with sha + branch tags | ✔ |
| scan | gitleaks + pnpm audit (high=fail) + trivy image scan | ✔ |

## 3.2 Workflow: `deploy.yml`

main merge → staging auto-deploy (Coolify webhook, migrations as pre-job) → smoke (health + login + isolation canary) → E2E (Playwright, from S2 onward) → manual approval → production (rolling; post-deploy verification; auto-rollback on failed health) — exactly Blueprint §9 / SAD §11.2.

---

# 4. Backend Bootstrap (apps/api) — Sprint 0 scope

| Item | Spec |
|------|------|
| Skeleton | Nest CLI app; `src/main.ts` (HTTP) + `src/worker.ts` (BullMQ context); module folders created empty-with-README for all 11 modules + `shared-kernel/` (structure = Blueprint §3, enforced by depcruise from day one) |
| Config module | Typed schema (zod) validating every env var at boot; fail-fast; exposes namespaced config objects |
| Logging | pino (nestjs-pino): JSON, trace_id (from X-Request-Id or generated), tenant_id enrichment; redaction list (authorization header, any field matching PII patterns) |
| Health | `/health/live` (process) + `/health/ready` (Terminus: PG, Redis, S3 ping) — SAD §11 |
| Error filter | Global filter mapping Result errors + exceptions → RFC 7807 (shape + codes from @kf/contracts); unknown → INTERNAL_ERROR with trace_id; no stack leaks |
| Validation | Global ValidationPipe (whitelist, transform) + class-validator DTOs; parity rule with contracts zod documented |
| Swagger | @nestjs/swagger wired with extensions (`x-permission-code` via custom decorator); spec emitted to file for CI diff |
| Redis/BullMQ | Connection modules + one demo queue (`system-heartbeat`) proving worker mode, retries, DLQ path end-to-end |
| Prisma | Schema with M-000/001 scope (enums, reference tables) + migration convention (generated DDL + hand-written SQL block marker); seed tier-1 runner |
| Tenant middleware | `TenantContextInterceptor` skeleton: extracts `tid` claim → AsyncLocalStorage context → used by Prisma wrapper (full behavior lands with TR-10 spike, §11) |
| Audit | `AuditWriter` port + Prisma implementation writing hash-chained rows (audit_log table lands in M-007 — Sprint 0 delivers the writer against a dev-migration table + unit-pinned chain logic) |
| Auth guard placeholder | JwtAuthGuard structure + Redis jti check stub wired into pipeline order (real auth = S1) — pipeline order proven with fake principal in tests |

# 5. Frontend Bootstrap (apps/web) — Sprint 0 scope

| Item | Spec |
|------|------|
| Skeleton | Next.js (App Router, TS strict); route groups `(console) (teacher) (parent) (gate) (platform)` each with layout shell placeholder from Design §4.1; middleware stub for role-routing |
| Tokens | @kf/tokens builds §02 token tables → `tokens.css` (light/dark/[dir]) + Tailwind preset; web consumes preset; lint bans raw hex/px and physical direction utilities (`pl-/pr-/left-/right-`) |
| shadcn/ui | Initialized into @kf/ui with theme mapped to tokens; first components: Button (all variants incl. kiosk/ai), Input, Badge (semantic enum map), Skeleton, Toast — the §19 mapping table drives the backlog |
| RTL/i18n | next-intl with ar (default) + en; `<html dir lang>` from locale; sample page proving mixed-direction isolation (dir="auto" pattern); digit/date formatters from @kf/i18n (UXD-02/03) |
| Theme | Light/dark via CSS vars + class strategy; gate surface locked light (Design §2.2) |
| PWA | Serwist: manifest (teacher/parent entries), app-shell precache, offline fallback page; **offline write-queue store skeleton** (Zustand + IndexedDB via idb-keyval): enqueue/drain interfaces defined, drain wired to a mock sync endpoint (real endpoint S3) |
| TanStack Query | Provider + persistQueryClient (IndexedDB) + key conventions module; example query against `/health/ready` |
| API client | Generated client from @kf/contracts (see §6); fetch wrapper: auth header, refresh-on-401 skeleton, X-Request-Id, Accept-Language |
| Error boundaries | Surface-level boundary per route group + trace_id display component (Design §16) |

---
# 6. Contracts Package (@kf/contracts)

| Artifact | Content & generation |
|----------|----------------------|
| `openapi.yaml` | Hand-authored root per API Contract §8 structure (`paths/` + `components/` split); Sprint 0 seeds: shared components (ProblemDetails, Money, LocalizedText, pagination, headers), auth + health paths |
| Generated TS types | `openapi-typescript` → `types.gen.ts`; typed client factory (fetch-based) consumed by web; regeneration script in tooling/generators, CI verifies no drift |
| Zod schemas | Shared validation source (`schemas/`): Money, phone (EG E.164), LocalizedText, per-DTO schemas added per sprint; consumed by web forms (RHF resolvers) and mirrored by api DTO validators — parity test asserts zod ⊆ class-validator behavior per DTO |
| Permission constants | `permissions.ts`: every `{resource}:{action}` code from RBAC §2.4 as const map + type; API `@RequirePermission` accepts only these; startup assertion: every OpenAPI op's `x-permission-code` ∈ map |
| Enums | Single enum source mirroring Domain Part 8 (InvoiceStatus, ActivityType, …) — exported to api (Prisma enum parity test) and web (badge semantic map) |
| Error codes | `errors.ts`: §4 API catalog as const map (code → http status → i18n key); used by API error filter and web error mapper |
| Event contracts | `events/` — versioned domain event payload types (Domain §1.5) for outbox producers/consumers and future webhooks |

# 7. Infrastructure (Sprint 0 scope)

| Item | Spec |
|------|------|
| Dockerfiles | `apps/api`: multi-stage (deps → build → runner node:22-slim, non-root, HEALTHCHECK, single image for api/worker via CMD); `apps/web`: Next standalone output, non-root |
| Coolify | Staging project: services (api ×1, worker ×1, web ×1, postgres, redis), env from secret store, deploy webhooks wired to Actions; production project cloned config, deploy gated (§3.2); config exported as code into `infrastructure/coolify/` (recreate runbook) |
| Local | Compose per §2; parity note: MinIO≈S3, mailpit≈SMTP provider |
| Secrets | Coolify store only; JWT RS256 keypair generated per env (never shared across envs); rotation runbook drafted `docs/runbooks/secrets-rotation.md` |
| Backups | Staging from day one: nightly pg_dump + WAL archiving container → MinIO/S3 `kf-backups` (encrypted, age); backup-age metric exposed; restore script `scripts/restore-rehearsal.sh` (used monthly per Blueprint §9) |
| Monitoring | Uptime Kuma (staging+prod probes), node/postgres/redis exporters + Grafana provisioned dashboards (API latency, queue depth, DLQ, disk, backup age), Sentry projects (api, web) with release tagging from CI |

# 8. Engineering Automation

| Tool | Config |
|------|--------|
| Prettier | Shared config in `configs/`; no local overrides; CI check |
| ESLint | Flat config base + per-package extensions; custom rules wired: no-physical-direction-classes (web), no-raw-token-values (web/ui), boundary hints (api) |
| Husky + lint-staged | pre-commit: lint-staged (eslint --fix, prettier) + typecheck of staged packages; commit-msg: commitlint |
| Commitlint | Conventional Commits; scopes = module/package names (enforced list) |
| Changesets | Versioning for `packages/*` (internal changelog discipline); apps unversioned (deployed continuously) |
| Renovate | Weekly grouped updates; security patches immediate; lockfile maintenance |

# 9. Documentation Set (repo-facing)

| Doc | Content |
|-----|---------|
| `README.md` (root) | Project one-pager, quickstart (`scripts/dev-setup.sh`), workspace map, links to docs/ phases; update existing README to monorepo reality |
| `docs/architecture-overview.md` | 2-page orientation for new engineers: C4 L1/L2 + module map + where each phase doc lives (links, no duplication) |
| `docs/development-guide.md` | Setup, daily commands, testing tiers + how to run isolation suite locally, migration workflow (annotation + hand-SQL convention), adding an endpoint checklist (OpenAPI-first flow), adding a UI component (token/QA rules) |
| Branch strategy | In development-guide: trunk-based, `feat/kf-<issue>-slug`, <3 days, squash; release tags |
| `.github/PULL_REQUEST_TEMPLATE.md` | Blueprint §12 template verbatim (story link, what/why, ar+en screenshots, gates checklist, risk note) |
| `.github/ISSUE_TEMPLATE/` | `story.yml` (user story, AC, module, permission codes touched), `bug.yml` (repro, trace_id, tenant, severity), `spike.yml` (question, timebox, success criteria) |
| `CODEOWNERS` | Module → owner mapping; billing/attendance/security paths require 2 reviews (Blueprint §12) |

---
# 10. Sprint 0 Checklist

Roles: **TL** = full-stack lead · **BE1/BE2** · **FE1/FE2** · **DevOps** (TL wears this hat if no dedicated). Priority: P0 = Sprint-1 blocker, P1 = must land in S0, P2 = may slip one sprint.

| # | Task | Owner | Pri | Depends | Acceptance criteria |
|---|------|-------|-----|---------|---------------------|
| 0.1 | Monorepo skeleton + workspaces + turbo + tsconfig references (§1) | TL | P0 | — | `pnpm install && pnpm build && pnpm typecheck` green on fresh clone |
| 0.2 | Shared configs + ESLint custom rules + Prettier + Husky + commitlint (§8) | FE1 | P0 | 0.1 | Bad commit msg rejected; physical-direction class fails lint |
| 0.3 | docker-compose dev env + dev-setup script (§2) | DevOps | P0 | — | Fresh machine → `dev-setup.sh` → all services healthy ≤10 min |
| 0.4 | CI workflow all jobs (§3.1) incl. placeholder gates wired | DevOps | P0 | 0.1 | PR runs full pipeline; each gate demonstrably fails on seeded violation |
| 0.5 | Migration linter (tooling) | BE2 | P0 | 0.1 | Migration adding table w/o RLS annotation fails CI (test fixture) |
| 0.6 | depcruise boundary rules | BE1 | P0 | 0.1 | Deep-import fixture fails CI |
| 0.7 | API bootstrap (§4): config, logging, health, error filter, Swagger+extensions, Redis/BullMQ demo queue | BE1 | P0 | 0.1, 0.3 | `/health/ready` green; demo job → retry → DLQ observable; 7807 shape verified |
| 0.8 | Prisma M-000/001 + tier-1 seed | BE2 | P0 | 0.3, 0.5 | Migrate+seed idempotent re-run clean; roles created; kf_api lacks BYPASSRLS (asserted in test) |
| 0.9 | **TR-10 spike (§11)** | BE2 + TL | **P0** | 0.8 | §11 success criteria met; report merged to docs/Decisions/ |
| 0.10 | Isolation test harness (2 seeded tenants + matrix runner skeleton) | BE2 | P0 | 0.9 | Harness red on intentional leak fixture, green after fix — proven both ways |
| 0.11 | Contracts package: openapi root + components + auth/health paths + permissions/errors/enums consts + codegen (§6) | TL | P0 | 0.1 | Codegen produces typed client; CI diff job operational |
| 0.12 | Web bootstrap (§5): route groups, tokens build, shadcn init (5 components), RTL/i18n proof page, TanStack provider | FE1 | P0 | 0.1, 0.11 | ar RTL + en LTR render correct incl. mixed-direction sample; dark mode toggles; tokens lint active |
| 0.13 | PWA: Serwist setup + offline fallback + write-queue store skeleton with mock drain | FE2 | P1 | 0.12 | Airplane-mode: app loads, queue accepts, drains on reconnect (mock) |
| 0.14 | Dockerfiles + registry push on main | DevOps | P1 | 0.4 | Images build in CI, run locally |
| 0.15 | Coolify staging + deploy webhook + migrations pre-job + smoke | DevOps | P0 | 0.14, 0.8 | main merge → staging live api+web; health probes green |
| 0.16 | Monitoring: Kuma, exporters+Grafana, Sentry projects | DevOps | P1 | 0.15 | Dashboards populated; test error visible in Sentry with release tag |
| 0.17 | Staging backups + restore script drill #0 | DevOps | P1 | 0.15 | Backup lands encrypted in bucket; restore script recovers staging DB |
| 0.18 | Repo docs set + templates + CODEOWNERS (§9) | TL | P1 | 0.1 | New-engineer dry run: clone→productive using docs only |
| 0.19 | Audit writer + hash chain (unit-pinned) | BE1 | P1 | 0.7 | Chain verification test green; tamper fixture detected |
| 0.20 | Non-eng parallel: LLM zero-retention terms + PDPL review kickoff (F2) + team confirmation | Founder | P0 | — | Contracts in signature flow; legal engaged; Blueprint team assumption confirmed |

Definition of Done (every item): merged via PR with template · CI fully green · documented in development-guide where relevant · demoed in Sprint 0 review.

**Sprint 1 entry criteria:** 0.1–0.12, 0.15, 0.20 complete; 0.9 (TR-10) approved.

# 11. TR-10 Spike — Prisma × PostgreSQL RLS

| Element | Plan |
|---------|------|
| Question | Can a Prisma client extension + interactive transactions enforce per-request `SET LOCAL app.tenant_id` reliably under: nested transactions, connection pool reuse, BullMQ worker context, and streaming queries — at acceptable performance? |
| Timebox | 4 engineer-days (BE2 + TL pairing days 1, 4) |
| Approach | Build against M-002 spike tables (organizations + one child table with TENANT_STANDARD policy): (1) client extension wrapping every tenant-model operation in `$transaction([SET LOCAL…, op])` or joining ambient AsyncLocalStorage transaction; (2) model manifest (tenant-scoped vs global) generated from schema annotations; (3) worker wrapper parity; (4) failure-mode probes: missing context → must throw (never silent unscoped query), pool connection reuse leakage test, parallel request interleaving test (100 concurrent mixed-tenant requests asserting zero cross-reads) |
| Testing | Harness from task 0.10: SQL-level probes as kf_api, API-level matrix, property test (random tenant interleaving); pgTAP asserting policies exist + kf_api blocked |
| Performance | Benchmark: overhead of transaction-wrapping vs bare query on hot paths (roster read, event insert) — budget ≤15% p95 overhead vs unscoped baseline; measure pool pressure (interactive tx hold time) at 200 rps |
| Success criteria | All failure-mode probes pass · zero cross-tenant reads in 10k-op interleaving run · overhead within budget · ergonomics: module code contains no manual tenant handling (context is ambient) · works identically in worker context |
| Decision matrix | **A. Extension + SET LOCAL (target)**: pass → adopt. **B. Pass with perf overshoot**: adopt for writes/sensitive reads; add pooled read path with app-layer filter + RLS retained (accepting overhead only where it matters); document per-path choice. **C. Fundamental failure** (context leakage): fallback per SAD TR-10 — app-layer guard as primary (extension-injected filters, no SET LOCAL), RLS retained as static backstop with per-role policies, compensated by doubled isolation-suite depth + pgTAP; escalate as ADR-010 |
| Deliverable | `docs/Decisions/ADR-010_RLS_Integration_Pattern.md`: chosen option, benchmarks, failure-mode results, coding rules for module authors, harness usage guide |

# 12. Final Output — Sprint 0 Definition of Success

Sprint 0 is done when: a fresh engineer clones the repo and is productive the same day using docs alone (0.18 dry run); every architectural rule that matters fails a build when violated (boundaries, RLS annotation, OpenAPI drift, isolation, tokens/RTL lint); staging runs the full stack deployed by CI with monitoring, backups, and a rehearsed restore; the RLS pattern is decided by evidence (ADR-010) and the isolation harness has proven red→green both ways; and the founder-track items (LLM terms, PDPL kickoff, team confirmation) are moving. Sprint 1 (Identity & Tenancy) then starts on proven rails.

---

## Approval Checklist

| Item | Owner | Status |
|------|-------|--------|
| Monorepo, configs, TS references (§1) | Tech Lead | ☐ |
| Dev environment & env strategy (§2) | Tech Lead | ☐ |
| CI gates incl. failure-proof demos (§3) | Tech Lead | ☐ |
| Backend/Frontend bootstrap scope (§4–5) | Tech Lead | ☐ |
| Contracts package plan (§6) | Tech Lead | ☐ |
| Infra & automation (§7–8) | Tech Lead | ☐ |
| Checklist owners & priorities (§10) | Eng Manager / Founder | ☐ |
| TR-10 spike plan & decision matrix (§11) | Tech Lead | ☐ |

## Readiness Score

**94 / 100** — Deductions: owner assignments assume the 5-person team (−3, confirm via 0.20); Grafana/exporter effort on single-host Coolify sometimes exceeds estimates (−3, P1 items may slip a sprint without harming Sprint 1 entry).

## Next Step

Execute. Recommended order: 0.1→0.3→0.4 (rails first), then parallel tracks — BE: 0.5→0.8→0.9→0.10; FE: 0.2→0.11→0.12→0.13; DevOps: 0.14→0.15→0.16/0.17. Sprint 0 review demos: CI failing on each seeded violation, staging live, RLS spike results, RTL proof page. Then Sprint 1 per Blueprint §6.

