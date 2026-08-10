# KinderFlow — Feature Map & MVP Scope

**Status:** Draft v0.1 — MVP cut requires founder approval

## Module Map (full platform)

| # | Module | Description |
|---|--------|-------------|
| M0 | Platform Core | Multi-tenancy, auth, RBAC, audit log, org/branch/classroom hierarchy |
| M1 | Children & Families | Child profiles, guardians, medical info, documents, authorized pickups |
| M2 | Enrollment & Waitlist | Inquiry → tour → application → contract → enrolled pipeline |
| M3 | Attendance & Check-in | QR/PIN check-in/out, pickup authorization, ratio monitoring |
| M4 | Daily Activity Logs | Meals, naps, diapers/toilet, mood, photos → parent feed |
| M5 | Billing & Payments | Fee plans, invoicing, discounts, payment tracking, reminders, reports |
| M6 | Communication | Announcements, direct messaging, incident reports, quiet hours |
| M7 | Staff Management | Staff profiles, roles, scheduling, ratio compliance, leave |
| M8 | Curriculum & Development | Lesson plans, milestone tracking, assessments |
| M9 | AI Layer | Report generation, billing anomaly detection, occupancy forecasting, parent-inquiry assistant |
| M10 | Analytics & Dashboards | Owner KPIs: occupancy, revenue, attendance, staff cost |
| M11 | Platform Admin | Tenant lifecycle, subscriptions, feature flags, support tooling |

## MVP Proposal (Phase 1)

**In:** M0, M1, M3, M4, M5 (invoicing + manual payment recording), M6 (announcements + messaging), M9-lite (AI daily-report drafting only), minimal M11 (tenant provisioning).

**Out (Phase 2+):** M2 pipeline (start with simple admission form), online payment gateway, M7 scheduling (profiles/roles only), M8, forecasting/anomaly AI, native mobile apps if PWA chosen first.

**Rationale:** MVP must close the daily loop — teacher logs → parent sees → owner bills. That loop is the retention engine; everything else layers on top.

## MVP Acceptance Criteria (product-level)

1. A new tenant can be provisioned and onboard a branch, classrooms, staff, children in < 1 hour.
2. Teacher records attendance + activities for a classroom in < 5 taps per event.
3. Parent receives daily report (AI-drafted, teacher-approved) same day.
4. Admin issues monthly invoices for all enrolled children in < 10 minutes; sees outstanding balances.
5. Full tenant isolation verified by automated tests; every sensitive action audit-logged.

## Non-Goals for MVP

Payroll, accounting integrations, government subsidy claims, transport tracking, cameras/CCTV, marketplace features.

## Dependencies on Open Questions

Launch market (payments/language), PWA vs native, pricing model — see 01_Vision_and_Positioning.md.
