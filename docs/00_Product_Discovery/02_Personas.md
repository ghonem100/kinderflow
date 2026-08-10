# KinderFlow — Personas

**Status:** Draft v0.1

## P1 — Nursery Owner / Director (buyer + admin)

Runs 1–5 branches, 30–300 children. Cares about: cash flow, occupancy, staff cost, compliance, reputation. Pain: no real-time financial visibility; chasing unpaid fees; manual enrollment pipeline. Success: dashboard answering "how is my business today?" in 10 seconds.

## P2 — Branch Admin / Registrar

Handles enrollment, waitlists, fee collection, parent onboarding, staff scheduling. Pain: duplicate data entry, paper contracts, reconciling payments. Success: enrollment-to-invoice in one flow; automated payment reminders.

## P3 — Teacher / Room Leader

Manages a classroom of 8–25 children. Pain: end-of-day reporting eats 30–60 min; parent messages arrive on personal phone; attendance and meal/nap logs on paper. Success: log everything in under 5 taps during the day; AI drafts the daily report; work phone boundary respected (quiet hours).

## P4 — Parent / Guardian

Cares about: safety (who picked up my child?), daily activity, development milestones, easy payment. Pain: information vacuum during the day; surprise invoices; WhatsApp chaos. Success: daily feed with photos, instant check-in/out notifications, one-tap payment.

## P5 — Platform Operator (internal, KinderFlow staff)

Manages tenants, subscriptions, support, feature flags, platform health. Needs a separate super-admin plane strictly isolated from tenant data access (audited, break-glass only).

## Role → App Mapping

| Persona | Surface |
|---------|---------|
| Owner, Branch Admin | Web app (Next.js) |
| Teacher | mobile-teacher (+ web fallback) |
| Parent | mobile-parent (+ web fallback) |
| Platform Operator | Internal admin panel |
