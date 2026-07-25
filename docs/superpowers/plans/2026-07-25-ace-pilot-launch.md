# ACE Pilot and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the confirmed ACE core from complete feature slices to a measured pilot, using rehearsed migration, security, accessibility, performance, recovery, training, staged enablement, and rollback evidence.

**Architecture:** Launch is capability and organisation controlled. Imports use versioned, idempotent staging pipelines. Every environment uses synthetic or approved data, strict tenancy, observable jobs, reproducible release evidence, and a tested disable path. Add-ons may pilot independently after core and their own gates pass.

**Tech Stack:** existing CI/CD, Prisma/PostgreSQL, Auth0, private Supabase Storage/Realtime, Stripe for approved products only, worker jobs, Jest, Playwright, mobile E2E/screenshot suites, load testing, monitoring, and Graphify.

## Global Constraints

- Core launch does not wait for an optional add-on.
- Oasis is a read-only implementation reference and possible migration source. Its dirty checkout is never modified.
- No production deploy, DNS change, live customer import, or Stripe activation is authorised by this plan alone.
- Pilot data access follows documented controller/processor roles, retention, consent, and support boundaries.
- Every go/no-go gate has an owner, timestamp, evidence link, exception decision, and rollback trigger.
- A pilot organisation may be disabled without deleting historical facts.

---

### Task 1: ACE-L01 - Create deterministic pilot fixtures and UAT scripts

**Branch:** `test/ace-pilot-fixtures`

**Files:**
- Create: `packages/db/prisma/fixtures/ace-pilot.fixture.ts`
- Create: `docs/uat/ace-core-uat.md`
- Create: `docs/uat/ace-addon-uat.md`
- Test: `apps/api/src/ace-launch/tests/ace-pilot-fixture.e2e.spec.ts`

- [ ] Create synthetic multi-site tenants, classes, subjects, guardians, students, staff, custom roles, PACE facts, attendance, behaviour, messages, homework, Faith content, slips, reports, Community, and each add-on state.
- [ ] Include empty, boundary, correction, revoked-access, disabled-feature, past/future, and high-volume cases.
- [ ] Make fixture generation idempotent, deterministic, clearly synthetic, and safe to delete by fixture namespace.
- [ ] Write role-based UAT scripts with expected result, evidence capture, and severity rules.

**Acceptance:** Any reviewer can recreate the same pilot state and execute every confirmed journey.

**Rollback:** Delete only the named synthetic fixture tenant through the provided fixture cleanup.

### Task 2: ACE-L02 - Discover and map Oasis migration data

**Branch:** `docs/ace-oasis-migration-mapping`

**Files:**
- Create: `docs/migrations/ace-oasis-source-inventory.md`
- Create: `docs/migrations/ace-oasis-field-mapping.md`
- Create: `docs/migrations/ace-oasis-exceptions.md`

- [ ] Record Oasis commit/status and inventory source schema, counts, identifiers, relationships, timestamps, timezones, files, enums, and known dirty-file differences.
- [ ] Map organisation/site, identity, child/guardian, subjects, enrolments, PACE, behaviour, attendance, homework, Faith, slips, reports, clubs, invoices, and merit records to NexSteps concepts.
- [ ] Classify every field as import, transform, derive, archive-only, reject, or unresolved.
- [ ] Resolve duplicate identities, missing relationships, mutable published records, invalid balances, public storage URLs, and single-centre assumptions before coding imports.
- [ ] Obtain data-owner sign-off for unresolved/lossy mappings.

**Acceptance:** The migration has a reviewed field-level contract and explicit exception policy.

**Rollback:** Documentation-only; no source or target mutation.

### Task 3: ACE-L03 - Build idempotent staging, validation, and import tooling

**Branch:** `feat/ace-migration-tooling`

**Files:**
- Create: `tools/ace-import/src/index.ts`
- Create: `tools/ace-import/src/stage.ts`
- Create: `tools/ace-import/src/validate.ts`
- Create: `tools/ace-import/src/import.ts`
- Create: `tools/ace-import/src/reconcile.ts`
- Test: `tools/ace-import/src/import.spec.ts`

- [ ] Read exported snapshots, never connect the application directly to the dirty Oasis checkout.
- [ ] Stage with source ID, source hash, mapping version, tenant target, validation state, and rerun key.
- [ ] Validate required relationships, timezones, enum transforms, published-version freezes, file availability, duplicate identities, financial totals, and merit balance.
- [ ] Import in dependency order through scoped transactions and server-owned IDs; make reruns no-op or explicit correction.
- [ ] Produce count, rejection, transform, checksum, duration, and reconciliation reports with no sensitive values in logs.

**Acceptance:** Re-running the same approved snapshot creates no duplicate target rows and reconciles all accepted records.

**Rollback:** Delete the isolated pilot tenant before external use; otherwise use forward correction, never broad destructive rollback.

### Task 4: ACE-L04 - Rehearse migration and restore in a production-like environment

**Branch:** `test/ace-migration-rehearsal`

**Files:**
- Create: `docs/evidence/ace-migration-rehearsal.md`
- Create: `docs/runbooks/ace-migration.md`
- Create: `apps/api/src/ace-launch/tests/ace-import-access.e2e.spec.ts`

- [ ] Take an approved masked/synthetic export and record hashes, tool version, target version, start/end, counts, rejects, and reconciliation.
- [ ] Verify identity links, tenant/site scope, RLS, storage objects, immutable versions, balances, and representative UI reads after import.
- [ ] Measure migration duration and define freeze/cutover window plus delta strategy.
- [ ] Restore the pre-import backup and prove the target returns to the recorded baseline.
- [ ] Obtain go/no-go approval for any unresolved exception.

**Acceptance:** Import and restore both complete inside defined recovery targets with reconciled evidence.

**Rollback:** Execute the tested restore before pilot access is granted.

### Task 5: ACE-L05 - Complete security and privacy verification

**Branch:** `security/ace-pilot-gate`

**Files:**
- Create: `docs/evidence/ace-security-gate.md`
- Create: `docs/runbooks/ace-security-incident.md`
- Create: `apps/api/src/ace-launch/tests/ace-idor-matrix.e2e.spec.ts`

- [ ] Run tenant, site, child, guardian, student self, conversation participant, resource lead, capability, permission, feature, release, RLS, storage, realtime topic, export, and webhook matrices.
- [ ] Probe guessed IDs, changed path/body child IDs, stale tokens, removed memberships, changed roles, cached responses, cursor reuse, signed URL reuse, and realtime subscription after revocation.
- [ ] Verify secrets, CSP/CORS/headers, rate limits, input validation, audit, dependency scanning, data minimisation, retention, legal hold, and provider payload safety.
- [ ] Triage findings by severity, fix release blockers, rerun, and record accepted residual risks with human owner.

**Acceptance:** No open critical/high finding or unexplained cross-boundary access remains.

**Rollback:** Keep pilot capabilities disabled until the gate passes.

### Task 6: ACE-L06 - Complete accessibility and mobile fidelity verification

**Branch:** `test/ace-accessibility-mobile-gate`

**Files:**
- Create: `docs/evidence/ace-accessibility-gate.md`
- Create: `apps/admin/e2e/ace-accessibility.spec.ts`
- Create: `apps/mobile/e2e/ace-mobile-visual-gate.e2e.ts`

- [ ] Test keyboard, visible focus, landmarks, labels, error association, announcements, contrast, non-colour cues, reduced motion, and screen-reader order on every critical web journey.
- [ ] Test VoiceOver/TalkBack, Dynamic Type at 200%, touch targets, orientation policy, safe areas, keyboard open/close, offline/reconnect, and push deep links.
- [ ] Capture mobile baselines at 320, 375, 390, and 430pt on iOS and Android.
- [ ] Give messaging dedicated inbox, conversation, grouped bubbles, older-pagination anchor, composer, optimistic send, retry, read state, and typing baselines.
- [ ] Block release on unusable critical journeys, not only automated rule failures.

**Acceptance:** Critical ACE journeys remain understandable and operable across supported access modes and target devices.

**Rollback:** Disable the affected route or feature until corrected.

### Task 7: ACE-L07 - Complete performance, concurrency, and resilience verification

**Branch:** `perf/ace-pilot-gate`

**Files:**
- Create: `tests/load/ace-core-load.ts`
- Create: `tests/load/ace-addon-load.ts`
- Create: `docs/evidence/ace-performance-gate.md`

- [ ] Load representative roster, PACE, attendance, inbox, message history, homework, report, site-dashboard, and enabled add-on queries at pilot and supported peak.
- [ ] Stress final-place club signup, message retry, attendance save, PACE assessment, slip consent, invoice issue/allocation, merit posting, stock reservation, and simulated order concurrency.
- [ ] Test worker retry/dead-letter, provider outage, database failover behaviour, realtime loss, storage delay, push failure, and cache invalidation.
- [ ] Record p50/p95/p99, throughput, error rate, saturation, queue lag, query plan, resource cost, and accepted budgets.
- [ ] Fix N+1/unbounded queries and rerun before sign-off.

**Acceptance:** Critical reads/writes and concurrency invariants meet documented budgets under supported load.

**Rollback:** Reduce pilot cohort or disable affected optional features while preserving core safety.

### Task 8: ACE-L08 - Prepare observability, support, training, and disaster recovery

**Branch:** `docs/ace-operational-readiness`

**Files:**
- Create: `docs/runbooks/ace-operations.md`
- Create: `docs/runbooks/ace-disaster-recovery.md`
- Create: `docs/training/ace-staff-guide.md`
- Create: `docs/training/ace-family-guide.md`
- Create: `docs/evidence/ace-restore-drill.md`

- [ ] Define dashboards and alerts for API errors/latency, RLS denials, auth, jobs, outbox, notifications, realtime, storage, PACE exceptions, report/slip rendering, reconciliation, imports, exports, and add-on providers.
- [ ] Attach runbooks with detection, triage, containment, correction, communication, rollback, and escalation owners.
- [ ] Execute database and storage restore drills; verify RPO/RTO, application consistency, signed URL invalidation, and reconciliation.
- [ ] Train pilot admins/staff on permissions, PACE corrections, safeguarding boundaries, messaging, publication, consent, reports, Community, and support escalation.
- [ ] Give families age-appropriate onboarding and privacy/support instructions without exposing internal controls.

**Acceptance:** On-call, support, staff, and families know how to operate and recover the pilot.

**Rollback:** Delay enablement until owner coverage and restore evidence exist.

### Task 9: ACE-L09 - Execute staged enablement, canary, and go/no-go

**Branch:** `release/ace-pilot`

**Files:**
- Create: `docs/releases/ace-pilot-release.md`
- Create: `docs/releases/ace-go-no-go-checklist.md`
- Modify: `docs/NexSteps-ACE-Vertical-Build-Plan.md`

- [ ] Pin commit, schema, mobile versions, environment config, capability definitions, price catalogue state, provider configuration, fixtures, migration mapping, and evidence links.
- [ ] Enable internal synthetic tenant, then staff-only pilot, then limited families/students, then full pilot cohort with observation windows between stages.
- [ ] Keep add-ons independently disabled until their pricing, entitlement, security, operations, and any licence gates pass.
- [ ] Monitor error/latency, RLS denials, support volume, notification failures, reconciliation, mobile crash-free sessions, and agreed product success measures.
- [ ] Define automatic/manual rollback triggers and rehearse organisation capability disable, mobile minimum-version response, worker pause, realtime fallback, and provider disable.
- [ ] Record human go/no-go decisions and update the ACE source document with implemented/deferred status and evidence links.

**Acceptance:** The pilot expands only through signed gates and has a tested, rapid disable path.

**Rollback:** Disable ACE/add-on capabilities for the pilot organisation, pause writes/jobs as specified, preserve history, and follow the incident/communication runbook.

## Completion Evidence

- Deterministic fixtures and UAT scripts cover every core feature and each add-on.
- Migration/import/restore reconcile.
- Security, privacy, accessibility, mobile fidelity, performance, concurrency, and DR gates pass.
- Support and training owners accept their runbooks.
- Pilot enablement and every commercial add-on remain independently reversible.
