# 09 — Sprint 5: AI Drafting + Communication (Detailed Task Specifications)

| Field | Value |
|-------|-------|
| Sprint goal | AI drafts the daily report from structured events (human-gated), and the communication rails go live |
| Entry criteria | Sprint 4 exit green — the report pipeline, snapshot builder, and approval gate already exist; **LLM zero-retention agreement signed** (external blocker) |
| Exit criteria | AI drafting behind quota with proven fallback; PII-leak tests green; quiet hours honored; safety alerts unsuppressable; incident flow complete |
| Authority | Blueprint §6 (S5), §5 (AI plan); SAD §7; BRD BR-13/BR-14/BR-18/BR-22; Domain Model Part 2.6, 2.9, 2.11; API Contract §2.9, §2.12, §2.14; RBAC §5, FL-09, FL-10; Design System §12 |
| Inherited defaults | As declared in `05_Sprint_1.md` |
| Sprint rule | AI is never a source of truth and never publishes. It produces a **draft** consumed by the Sprint 4 approval gate, which is not modified by this sprint |

---

## A. AI Drafting

### KF-S5-AI-001 — Provider port and adapter abstraction
**Source of Truth** SAD §7 (provider abstraction); Blueprint §5.
**Dependencies** KF-S4-RPT-002.
**Implementation** `LlmProvider` port (generate(structuredInput, promptVersion, schema) → validated JSON); primary adapter (Anthropic Claude API per Blueprint §5); secondary adapter interface implemented by the deterministic template generator as fallback (TD-13 accepted); 10 s timeout; single retry; no provider call inside a DB transaction.
**Security** API keys from secrets only; requests carry no data beyond the approved snapshot.
**Acceptance** (1) Swapping the adapter via configuration requires no changes in the reports module. (2) A provider timeout falls back within the configured budget and the report is still produced. (3) No provider call occurs inside an open transaction (asserted by an instrumentation test).
**Risk** High · **Cx** L

### KF-S5-AI-002 — Prompt registry and versioning
**Source of Truth** SAD §7 (prompt layer); Blueprint §5; Domain Model Part 3 (table 49).
**Dependencies** KF-S5-AI-001, KF-S0-API-003.
**Implementation** Templates in code (`daily-report@1.x.y`) registered to `prompt_versions` at boot with a content hash; system prompt carries role, tone, target language, and safety constraints; output JSON schema versioned with the prompt.
**Acceptance** (1) Boot registers the prompt version and refuses to start if the stored hash differs from the code without a version bump. (2) Every generated draft records `prompt_version`, `model`, and `input_hash`.
**Risk** High · **Cx** M

### KF-S5-AI-003 — ACL snapshot builder hardening (PII minimization)
**Source of Truth** SAD §7 (input contract, anti-corruption layer); BRD R-09; Blueprint §5.
**Dependencies** KF-S4-RPT-002 (builder exists), KF-S5-AI-002.
**Implementation** Reuse the Sprint 4 snapshot; enforce: child first name + pseudonymous id only; no guardian data; no medical data unless the day's logged event itself is medical; no free-text from other children; deterministic ordering for cacheability.
**Testing** **PII-leak assertion suite**: property test over generated snapshots asserting the absence of national IDs, phone numbers, full names, addresses, and other children's names.
**Acceptance** (1) The leak suite fails if any forbidden field appears in a snapshot. (2) A medical-administration event includes only the fields required to describe it, not the child's full medical record. (3) Snapshots for identical event sets are byte-identical (cache key stability).
**Risk** Critical · **Cx** M

### KF-S5-AI-004 — Generation worker and batching
**Source of Truth** SAD §10.1 (`ai-reports` queue); Blueprint §5.
**Dependencies** KF-S5-AI-003, KF-S4-RPT-006.
**Implementation** BullMQ processor generating per-classroom batches before shift end; tenant context on every job; input-hash cache; backpressure per tenant; retries with backoff; DLQ on terminal failure with alert.
**Acceptance** (1) A classroom of 14 children generates in one batch job with per-child results. (2) A repeat request with unchanged events is served from cache (no provider call — asserted). (3) Terminal failures land in DLQ **and** the template fallback still produces a draft so teachers are never blocked.
**Risk** High · **Cx** L

### KF-S5-AI-005 — Output validation and safe rendering
**Source of Truth** SAD §7 (output safety); Design System §12.
**Dependencies** KF-S5-AI-004.
**Implementation** Strict JSON-schema validation; reject-and-retry once; on second failure fall back to template; sanitize before storage; language must match the requested locale (validated).
**Acceptance** (1) A malformed provider response never reaches the teacher UI. (2) A response in the wrong language is rejected and regenerated or falls back. (3) The draft text contains no events absent from the snapshot (assertion via event-token coverage check in the golden-set evals).
**Risk** Critical · **Cx** M

### KF-S5-AI-006 — Quota enforcement and usage accounting
**Source of Truth** BRD BR-22; SAD §7 (cost control); Domain Model Part 3 (table 50); API Contract §2.14.
**Dependencies** KF-S5-AI-004, KF-S1-TENANT-006.
**Implementation** `ai_usage_daily` rollups; pre-enqueue quota check against the plan; `AI_QUOTA_EXCEEDED` on manual re-draft; nightly cost report; alerting at margin threshold (TR-09).
**API** `GET /ai/usage` perm `ai:read`.
**Acceptance** (1) A tenant at its daily token limit cannot trigger manual re-drafts and receives the documented error with remaining-quota context. (2) Scheduled batches degrade to template generation rather than exceeding quota. (3) Usage numbers reconcile with the provider's reported token counts within tolerance.
**Risk** High · **Cx** M

### KF-S5-AI-007 — AI settings and tenant controls
**Source of Truth** RBAC §5 (who configures what); API Contract §2.14.
**Dependencies** KF-S5-AI-006.
**Implementation** Tenant-level: enable/disable AI drafting, output language preference (Owner). Platform-level: model, prompts, quotas (SUPER_ADMIN only).
**Acceptance** (1) An Owner can disable AI drafting; reports then use templates with no user-visible failure. (2) No tenant role can change models or prompts (403, verified per role).
**Risk** Medium · **Cx** M

### KF-S5-AI-008 — AI review UX integration
**Source of Truth** Design System §12 (provisional styling, provenance chips, coverage indicator, no confidence scores); RBAC FL-10.
**Dependencies** KF-S5-AI-005, KF-S4-FE-TCH-002.
**Implementation** Violet draft card, "Draft — generated from N logged activities", source chips linking to each activity, coverage indicator listing missing data, re-draft with remaining quota, fallback banner when the provider was unavailable; prompt version and token counts hidden from tenants (FL-10).
**Acceptance** (1) Every AI draft is visibly marked provisional until approved. (2) Tapping a provenance chip opens the source activity. (3) Teachers never see prompt/model metadata (deep-key assertion on the DTO).
**Risk** High · **Cx** L

### KF-S5-QA-001 — AI golden-set evaluations
**Source of Truth** Blueprint §8 (AI validation); SAD §7.
**Dependencies** KF-S5-AI-005.
**Implementation** 50 curated snapshots (ar + en, sparse and rich days, medical events, edge cases) asserting: schema validity, language correctness, no PII beyond input, **no invented events**, tone constraints; runs on every prompt-version bump and in nightly CI.
**Acceptance** (1) A prompt version cannot merge with failing evals (CI gate). (2) An intentionally hallucination-prone fixture is caught by the invented-event check.
**Risk** Critical · **Cx** L

---

## B. Communication

### KF-S5-COMM-001 — Migration M-005c: conversations, messages, announcements, incidents
**Source of Truth** Domain Model Part 3 (tables 30, 31, 44–48), Part 6.2.
**Dependencies** KF-S4-ACT-001.
**Implementation** All tables with RLS + FORCE, tenant-composite FKs to children where applicable; indexes `(conversation_id, created_at)`, `(tenant_id, branch_id, status)`; soft delete on messages/announcements.
**Acceptance** Isolation probes pass; incident severity and status enums enforced.
**Risk** High · **Cx** M

### KF-S5-COMM-002 — Conversations with participant policy
**Source of Truth** Domain Model Part 2.9; API Contract §2.12; RBAC §3.
**Dependencies** KF-S5-COMM-001, KF-S2-CHILD-010.
**Implementation** Allowed pairings only: parent ↔ assigned classroom teacher, parent ↔ branch admin; enforced in the use case; error `CONVERSATION_NOT_ALLOWED`.
**Acceptance** (1) A parent cannot open a thread with a teacher who is not assigned to their child's classroom. (2) Reassigning a teacher closes/reassigns threads per the documented rule rather than leaking history.
**Risk** High · **Cx** M

### KF-S5-COMM-003 — Messages with quiet hours and recall
**Source of Truth** BRD BR-18; API Contract §2.12; Design System §07.
**Dependencies** KF-S5-COMM-002.
**Implementation** Parent→teacher messages outside tenant quiet hours are queued with `queued_until` returned to the client; 15-minute author recall; delivery/read markers.
**Acceptance** (1) A message sent at 22:00 with quiet hours 20:00–08:00 returns `queued_until` 08:00 and is not delivered before then. (2) Recall within 15 minutes removes it from the recipient's view; after 15 minutes recall is refused. (3) Quiet hours never delay safety notifications (cross-checked with KF-S5-NOTIF-004).
**Risk** High · **Cx** M

### KF-S5-COMM-004 — Admin content escalation (FL-09)
**Source of Truth** RBAC FL-09, §7 (SEC-MSG-001); API Contract §2.12.
**Dependencies** KF-S5-COMM-003.
**Implementation** Admins see thread metadata only; content access requires an escalation referencing an incident, and the access itself is audited and time-boxed.
**Acceptance** (1) An Owner listing conversations sees no message bodies. (2) Escalation without an incident reference is refused. (3) Every escalated content view writes SEC-MSG-001 with the incident id.
**Risk** Critical · **Cx** M

### KF-S5-COMM-005 — Announcements with approval flow
**Source of Truth** API Contract §2.12; RBAC §3 (teacher drafts, BM approves); Domain Model Part 2.9.
**Dependencies** KF-S5-COMM-002.
**Acceptance** (1) A teacher-created announcement is a draft requiring BranchManager approval. (2) Published announcements are immutable; corrections are follow-ups. (3) Audience selection cannot exceed the author's scope.
**Risk** Medium · **Cx** M

### KF-S5-COMM-006 — Incidents: filing, review, approval, notification
**Source of Truth** BRD BR-14; Domain Model Part 2.6; API Contract §2.9; Design System §07.
**Dependencies** KF-S5-COMM-001, KF-S2-MEDIA-004.
**Implementation** One record per involved child (privacy — no cross-family leakage); severity-driven flow (MINOR: approve → notify; SERIOUS: manager approval + phone-contact logging); media attachments consent-checked.
**Acceptance** (1) An incident involving two children creates two independent records, neither naming the other child. (2) A SERIOUS incident cannot be closed without a recorded phone contact. (3) Every state change emits the documented audit events.
**Risk** Critical · **Cx** L

### KF-S5-COMM-007 — Incident acknowledgment by guardians
**Source of Truth** BR-14; API Contract §2.9.
**Dependencies** KF-S5-COMM-006.
**Acceptance** (1) Guardian acknowledgment is recorded with timestamp and channel. (2) Unacknowledged serious incidents surface on the branch dashboard alert strip (consumed by S7 analytics).
**Risk** High · **Cx** M

---

## C. Notifications

### KF-S5-NOTIF-001 — Dispatch worker and channel adapters
**Source of Truth** SAD §10.1 (`notifications` queue); Domain Model Part 2.9; Blueprint §10.
**Dependencies** KF-S0-API-002, KF-S5-COMM-001.
**Implementation** Channels: in-app (always), web push, email, SMS/WhatsApp adapter interface (provider pluggable); per-provider rate caps; retries (8 attempts) with DLQ; delivery status recorded.
**Acceptance** (1) A failed email retries per policy and lands in DLQ with an alert. (2) In-app delivery never depends on an external provider being available.
**Risk** High · **Cx** L

### KF-S5-NOTIF-002 — Notification preferences
**Source of Truth** API Contract §2.12; RBAC §3.
**Dependencies** KF-S5-NOTIF-001.
**Acceptance** Users manage per-channel, per-category preferences; changes take effect immediately; defaults are documented per role.
**Risk** Low · **Cx** M

### KF-S5-NOTIF-003 — Notification center and inbox
**Source of Truth** Design System §05 (notification center), §09.
**Dependencies** KF-S5-NOTIF-002.
**Acceptance** Grouped by day; safety alerts pinned with acknowledgment; bulk mark-read endpoint used correctly; iOS in-app fallback works (TD-02).
**Risk** Medium · **Cx** M

### KF-S5-NOTIF-004 — Unsuppressable safety alerts
**Source of Truth** API Contract §2.12 ("critical safety alerts cannot be disabled"); BR-01/BR-14; Design System §01.
**Dependencies** KF-S5-NOTIF-002.
**Implementation** Category `SAFETY` bypasses preferences and quiet hours; delivery attempted on every available channel; failure to deliver raises an operational alert.
**Testing** Negative: a user who has disabled everything still receives unauthorized-pickup and serious-incident alerts.
**Acceptance** (1) With all preferences off and quiet hours active, a SEC-SAFE-001 alert is still delivered. (2) An attempt to disable a SAFETY category via the API is rejected. (3) Undeliverable safety alerts page the operations channel.
**Risk** Critical · **Cx** M

---

### KF-S5-FE-001 — Messaging UI (parent + staff)
**Source of Truth** Design System §07, §09; API Contract §2.12.
**Dependencies** KF-S5-COMM-003, KF-S0-FE-003.
**Acceptance** Quiet-hours chip shows the delivery time before sending; recall available for 15 minutes; ar/en with correct mixed-direction rendering.
**Risk** Medium · **Cx** L

### KF-S5-FE-002 — Incident forms and review queue
**Source of Truth** Design System §07; BR-14.
**Dependencies** KF-S5-COMM-006.
**Acceptance** Severity selection drives the required fields; the reviewer queue shows pending incidents with SLA-style aging; parent view shows acknowledgment state.
**Risk** High · **Cx** L

### KF-S5-QA-002 — Communication isolation, RBAC, and quiet-hours suite
**Dependencies** All S5 COMM/NOTIF tasks.
**Acceptance** All S5 endpoints and tables covered by isolation; FL-09 enforced; quiet hours and safety-bypass both proven; cross-family incident privacy asserted.
**Risk** Critical · **Cx** M

---

## Sprint 5 Exit Checklist

| Gate | Evidence |
|---|---|
| AI gate intact | Sprint 4 no-bypass structural test still green with AI drafts in the pipeline |
| PII minimization | Snapshot leak suite + golden-set evals green |
| Fallback | Provider outage simulation still yields a report; teachers unblocked |
| Quota | Limit enforcement and cost reconciliation demonstrated |
| Quiet hours | Queued delivery proven; safety alerts bypass proven |
| Incidents | BR-14 severity flow, per-child privacy, acknowledgment trail |
| FL-09 | Admin message-content access requires escalation and is audited |
