# ADR-006 — Docker Everywhere

**Status:** Accepted · 2026-07-18 · Relates to: Architecture §11, D1 (GCC expansion)

## Context
We need dev/staging/prod parity, Coolify-native deployment, and provider portability — GCC expansion may require redeploying the full stack in a new region (KSA data residency) quickly.

## Decision
Everything runs in Docker: multi-stage builds, non-root users, pinned digests, docker-compose for local dev, Coolify-orchestrated containers in staging/production.

## Alternatives Considered
- **Bare-metal/systemd deploys:** faster on one host, loses parity and portability.
- **Kubernetes:** capability we don't need at MVP scale; heavy ops tax for a small team.
- **Serverless/PaaS (Vercel+managed DB):** attractive DX but conflicts with budget, data-residency control, and long-running workers.

## Consequences
(+) A new region = a new Coolify host + same images + env config; image scanning in CI; reproducible builds.
(−) Container/host maintenance is ours (patching, disk, monitoring) — covered by ops runbooks and Coolify automation.
