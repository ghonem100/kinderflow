---
'@kf/contracts': minor
---

Add the `PlanCode` members, closing a third of DISC-017.

`SMALL`, `MEDIUM`, `LARGE` — founder decision, 2026-09-06. BRD D2 fixed "exactly three plans" and made pricing capacity-based; the three codes were named nowhere, so the enum shipped empty and typed `never`.

`KF-S0-API-003` needed them: M-001 creates `plan_code` as a PostgreSQL enum and the tier-1 seed inserts the three `subscription_plans` rows. Prices and per-plan limits remain open (F1, DISC-006) and seed as `TODO-F1` markers in the data — the plan exists, its commercial terms do not yet.

`SyncStatus` and `NotificationChannel` are still empty. Neither has a table before M-005, so neither blocks anything yet.
