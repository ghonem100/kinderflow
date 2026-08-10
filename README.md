# KinderFlow

AI-powered multi-tenant SaaS platform for nursery and daycare management.

## Repository Structure

| Path | Purpose |
|------|---------|
| `docs/` | All design and decision documentation (design-first workflow) |
| `backend/` | NestJS API — modular monolith (Prisma, PostgreSQL, Redis, BullMQ) |
| `frontend/` | Next.js web app (TypeScript, Tailwind CSS, shadcn/ui) |
| `mobile-parent/` | Parent-facing mobile app |
| `mobile-teacher/` | Teacher-facing mobile app |
| `infrastructure/` | Docker, CI/CD (GitHub Actions), Coolify deployment |
| `scripts/` | Development and operations scripts |

## Documentation Map

| Folder | Contents |
|--------|----------|
| `docs/00_Product_Discovery` | Vision, market, personas, competitive landscape, MVP scope |
| `docs/01_Business_Analysis` | Per-module business analysis |
| `docs/02_Requirements` | Functional and non-functional requirements |
| `docs/03_System_Architecture` | Architecture, multi-tenancy, security model |
| `docs/04_Database_Design` | Schema design, ERDs, migration strategy |
| `docs/05_API_Design` | API contracts, conventions, error model |
| `docs/06_UI_UX` | Design system, flows, wireframes |
| `docs/07_Roadmap` | Phased delivery plan |
| `docs/08_AI` | AI feature design and guardrails |
| `docs/09_Deployment` | Environments, CI/CD, operations |
| `docs/Decisions` | Architecture Decision Records (ADRs) |

## Engineering Principles

Clean Architecture, SOLID, DDD where appropriate. Modular monolith designed to evolve into microservices. Design before code: every module gets full documentation (business analysis → requirements → DB design → API design → permissions → validation → edge cases → testing strategy) before implementation.

## Workflow

1. Document the module in `docs/`
2. Review and approve
3. Implement production-ready code
4. Record significant choices as ADRs in `docs/Decisions`
