# mobile-parent/

**Reserved for the V2 native parent application. Intentionally empty until then.**

Per **ADR-009 — PWA-First Mobile Strategy** (Accepted, 2026-07-18), the MVP ships the parent surface as an installable Next.js PWA inside `apps/web`, not as a native application. Native apps were deferred to V2 by founder decision D3 (DR-001).

- **Do not** place code here. The parent surface lives in `apps/web` under the `(parent)` route group (Blueprint §2).
- This folder is preserved — not deleted — because ADR-009 plans native V2 apps once the product is stable.
- Blueprint §1 lists `mobile-parent/` and `mobile-teacher/` as "Reserved for V2 native (ADR-009) — empty until then".

See also: `docs/Decisions/ADR-009_PWA_First.md`, `docs/07_Roadmap/Engineering_Delivery_Blueprint.md` §1.
