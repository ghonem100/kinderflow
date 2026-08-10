# DR-001 — Founder Decisions (BRD v1.1)

| Field | Value |
|-------|-------|
| Date | 2026-07-18 |
| Decider | Founder |
| Status | Accepted |
| Applies to | `docs/01_Business_Analysis/BRD_KinderFlow.md` v1.1 |

| ID | Decision | Rationale / Consequence |
|----|----------|------------------------|
| D1 | Launch market: **Egypt**; expansion KSA → UAE → GCC | Localization-underserved market; Arabic/RTL and Egypt PDPL become launch requirements; per-market legal review before GCC entry |
| D2 | **Capacity-based SaaS pricing, three plans** | Aligns price with tenant size; plan tiers gate features and storage (BR-22); price points pending (F1) |
| D3 | **PWA-first**; native mobile apps in V2 | One codebase at MVP; app-store presence deferred; offline tolerance handled in PWA |
| D4 | **Sales-assisted onboarding** for first release | CS-driven activation; internal onboarding console recommended (BRD §13.1.5) |
| D5 | Late fees **optional & configurable per tenant**, disabled by default | Cultural/market fit; BR-10 updated |
| D6 | **Storage quotas per plan + paid upgrades** | Controls media cost (R-08); BR-21 added |
| D7 | Launch languages: **Arabic (RTL) + English** | RTL is a day-one frontend architecture constraint |
| D8 | Child record retention: **5 years post-withdrawal**, local regulation overrides | BR-20 updated; PDPL review tracked as F2 |

Follow-ups created: F1 (plan price points), F2 (Egypt PDPL legal review), F3 (payment gateway selection), F4 (hosting region) — see BRD §12.2.
