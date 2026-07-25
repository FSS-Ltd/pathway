# ACE Core Daily Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ACE staff reliable web and mobile workflows for academic setup, PACE, behaviour, Present/Absent/Late attendance, corrections, overrides, and site-level operational monitoring.

**Architecture:** Put deterministic PACE and demerit rules in `@pathway/ace-domain`; NestJS services apply access, tenancy, transaction, audit, projection, and outbox rules. Web and mobile consume REST DTOs and never reproduce authoritative progression or escalation logic.

**Tech Stack:** strict TypeScript, pure domain package, NestJS, Zod, Prisma/PostgreSQL, Next.js admin, Expo/React Native, Jest, and Playwright.

## Global Constraints

- Depends on all foundation access and schema tasks.
- Use the site IANA timezone to derive a local business date.
- Assessment and behaviour facts are immutable; corrections are linked records.
- Overrides are explicit, authorised, reasoned, time-bounded, and audited.
- Do not couple core behaviour capture to the paid merit ledger. Emit an idempotent domain intent that the add-on may consume.
- The primary roster/list p95 target is under 500ms on the pilot dataset.

---

### Task 1: ACE-O01 - Create the pure ACE domain package

**Branch:** `feat/ace-domain-package`

**Files:**
- Create: `packages/ace-domain/package.json`
- Create: `packages/ace-domain/tsconfig.json`
- Create: `packages/ace-domain/src/index.ts`
- Create: `packages/ace-domain/src/pace-number.ts`
- Test: `packages/ace-domain/src/pace-number.spec.ts`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**

```ts
export interface PaceNumber {
  raw: number;
  level: number;
  sequence: number;
}

export function parsePaceNumber(raw: number): PaceNumber;
export function comparePaceNumbers(a: PaceNumber, b: PaceNumber): number;
export function nextPaceNumber(current: PaceNumber): PaceNumber;
```

- [ ] Write boundary tests ported from Oasis `packages/domain/src/subjects.ts`, including invalid, boundary, comparison, and next-number cases.
- [ ] Run `pnpm --filter @pathway/ace-domain test:unit`; expect missing package or functions.
- [ ] Implement only pure number interpretation and exports.
- [ ] Run unit, typecheck, and lint for the package; expect pass.
- [ ] Commit with `git commit -m "feat: add ACE domain package"`.

**Acceptance:** API, workers, and future import tooling share one deterministic PACE-number implementation.

**Rollback:** Remove the unused package before any consumer merges.

### Task 2: ACE-O02 - Implement PACE assessment policy evaluation

**Branch:** `feat/ace-pace-policy-rules`

**Files:**
- Create: `packages/ace-domain/src/pace-policy.ts`
- Test: `packages/ace-domain/src/pace-policy.spec.ts`
- Modify: `packages/ace-domain/src/index.ts`

**Interfaces:**

```ts
export type PacePolicyCode =
  | "allowed"
  | "score-below-threshold"
  | "daily-limit"
  | "same-pace-same-day"
  | "progression-blocked"
  | "override-required";

export interface PacePolicyResult {
  decision: "allow" | "warn" | "block";
  code: PacePolicyCode;
  nextPace?: PaceNumber;
}

export function evaluatePaceAssessment(input: PaceAssessmentPolicyInput): PacePolicyResult;
```

- [ ] Port Oasis policy boundary cases from `apps/api/src/__tests__/pace.router.test.ts` into pure input/output tests.
- [ ] Run the focused test and confirm all cases fail.
- [ ] Implement threshold, assessment type, daily limit, duplicate, same-PACE, block, warning, and override-required evaluation.
- [ ] Run `pnpm --filter @pathway/ace-domain test:unit`; expect pass.
- [ ] Commit `feat: evaluate PACE assessment policy`.

**Acceptance:** The same policy result is usable by API validation, worker rebuilds, and UI explanations.

**Rollback:** Revert before the write command consumes the function.

### Task 3: ACE-O03 - Implement PACE projection and on-track calculation

**Branch:** `feat/ace-pace-projection-rules`

**Files:**
- Create: `packages/ace-domain/src/pace-projection.ts`
- Test: `packages/ace-domain/src/pace-projection.spec.ts`
- Modify: `packages/ace-domain/src/index.ts`

**Interfaces:**

```ts
export type PaceTrackStatus = "ahead" | "on-track" | "at-risk" | "behind" | "blocked";
export function rebuildPaceProgress(input: PaceProgressFacts): PaceProgressProjection;
```

- [ ] Write tests for start/current/target PACE, completed facts, corrections, absences, policy blocks, term boundary, and timezone date.
- [ ] Run focused tests; expect missing implementation.
- [ ] Implement a deterministic fold over immutable facts.
- [ ] Run package tests and typecheck.
- [ ] Commit `feat: rebuild PACE progress projections`.

**Acceptance:** Deleting and rebuilding a projection produces the same result.

**Rollback:** Drop only projections, never assessment facts.

### Task 4: ACE-O04 - Implement demerit-stage policy evaluation

**Branch:** `feat/ace-demerit-policy-rules`

**Files:**
- Create: `packages/ace-domain/src/demerit-policy.ts`
- Test: `packages/ace-domain/src/demerit-policy.spec.ts`
- Modify: `packages/ace-domain/src/index.ts`

**Interfaces:**

```ts
export interface DemeritStageResult {
  stage: number;
  action: "none" | "review" | "notify" | "head-review";
  requiresNote: boolean;
}
export function evaluateDemeritStage(input: DemeritPolicyInput): DemeritStageResult;
```

- [ ] Port threshold, serious misconduct, manual stage, and note-required cases from Oasis behaviour tests.
- [ ] Run and observe failures.
- [ ] Implement pure cumulative-window and serious-category rules.
- [ ] Run package checks and commit `feat: evaluate ACE demerit stages`.

**Acceptance:** Sensitive and safeguarding content is absent from the pure input; only classified policy data is used.

**Rollback:** Revert before behaviour services consume the evaluator.

### Task 5: ACE-O05 - Expose ACE settings and feature policy

**Branch:** `feat/ace-settings-api`

**Files:**
- Create: `apps/api/src/ace-settings/ace-settings.module.ts`
- Create: `apps/api/src/ace-settings/ace-settings.controller.ts`
- Create: `apps/api/src/ace-settings/ace-settings.service.ts`
- Create: `apps/api/src/ace-settings/dto/ace-settings.dto.ts`
- Create: `apps/api/src/ace-settings/tests/ace-settings.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Implements `GET/PUT /ace/settings`.
- Requires `ace.settings.read` or `ace.settings.manage`.

- [ ] Write failing tests for tenant scope, valid timezone, thresholds, feature keys, optimistic version, audit, and unknown settings.
- [ ] Run focused tests; expect missing module.
- [ ] Implement Zod DTO, thin controller, versioned service transaction, and audit/outbox.
- [ ] Run API unit, typecheck, and lint.
- [ ] Commit `feat: manage ACE settings`.

**Acceptance:** Only allowed settings are mutable and invalid policy configurations cannot be stored.

**Rollback:** Disable write route; reads continue with seeded defaults.

### Task 6: ACE-O06 - Build academic year, period, and subject setup

**Branch:** `feat/ace-academic-setup`

**Files:**
- Create: `apps/api/src/ace-settings/academic-calendar.controller.ts`
- Create: `apps/api/src/ace-settings/academic-calendar.service.ts`
- Create: `apps/admin/app/ace/settings/academic/page.tsx`
- Create: `apps/admin/app/ace/settings/academic/academic-calendar-form.tsx`
- Test: `apps/api/src/ace-settings/tests/academic-calendar.service.spec.ts`
- Test: `apps/admin/app/ace/settings/academic/academic-calendar-form.test.tsx`

**Interfaces:**
- Implements `GET/POST /ace/academic-years` and period mutations.

- [ ] Write failing service tests for overlap, active-year uniqueness, site timezone, and actor/reason.
- [ ] Write failing UI tests for loading, empty, validation, conflict, save, and keyboard completion.
- [ ] Implement API then focused admin form using existing settings card conventions.
- [ ] Run focused API/admin tests and builds.
- [ ] Commit `feat: add ACE academic setup`.

**Acceptance:** A site head can create a valid academic year and periods without overlapping active windows.

**Rollback:** Hide the settings route and keep additive calendar data.

### Task 7: ACE-O07 - Manage student subject enrolment and starting PACE

**Branch:** `feat/ace-subject-enrolment`

**Files:**
- Create: `apps/api/src/pace/student-subjects.controller.ts`
- Create: `apps/api/src/pace/student-subjects.service.ts`
- Create: `apps/api/src/pace/dto/student-subject.dto.ts`
- Create: `apps/admin/app/ace/students/[childId]/subjects/page.tsx`
- Create: `apps/admin/app/ace/students/[childId]/subjects/subject-placement-form.tsx`
- Test: `apps/api/src/pace/tests/student-subjects.service.spec.ts`
- Test: `apps/admin/app/ace/students/[childId]/subjects/subject-placement-form.test.tsx`

**Interfaces:**
- Implements `GET/POST /ace/students/:childId/subjects`.
- Produces current placement DTOs for PACE roster work.

- [ ] Test relationship to existing `Child` and `Learning.Subject`, duplicate active enrolment, correction reason, and tenant mismatch.
- [ ] Implement service transactions and typed DTOs.
- [ ] Implement accessible web placement form with explicit current/starting/target PACE.
- [ ] Run focused tests, API/admin typecheck, and builds.
- [ ] Commit `feat: manage ACE subject placement`.

**Acceptance:** Staff can place a child once per active subject, and revisions retain actor/reason history.

**Rollback:** Disable mutations; existing placements remain readable.

### Task 8: ACE-O08 - Expose PACE roster and child progress reads

**Branch:** `feat/ace-pace-roster-api`

**Files:**
- Create: `apps/api/src/pace/pace.module.ts`
- Create: `apps/api/src/pace/pace.controller.ts`
- Create: `apps/api/src/pace/pace-query.service.ts`
- Create: `apps/api/src/pace/dto/pace-query.dto.ts`
- Create: `apps/api/src/pace/tests/pace-query.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Implements `GET /ace/pace/roster` and `GET /ace/students/:childId/pace`.
- Uses cursor pagination and filters for subject, status, group, and search.

- [ ] Write failing tests for capability, permission, site, tenant, search, cursor stability, encrypted-name handling, and no N+1 query pattern.
- [ ] Implement allow-listed selects and projection reads.
- [ ] Run focused tests and a pilot-size query benchmark.
- [ ] Commit `feat: expose ACE PACE roster`.

**Acceptance:** Roster p95 is under 500ms for the recorded pilot dataset and no cross-site child appears.

**Rollback:** Remove route registration; facts remain unchanged.

### Task 9: ACE-O09 - Record PACE assessments transactionally

**Branch:** `feat/ace-pace-assessment-command`

**Files:**
- Create: `apps/api/src/pace/pace-command.service.ts`
- Create: `apps/api/src/pace/dto/create-pace-assessment.dto.ts`
- Modify: `apps/api/src/pace/pace.controller.ts`
- Create: `apps/api/src/pace/tests/pace-command.service.spec.ts`
- Create: `apps/api/src/pace/tests/pace-command.concurrent.spec.ts`

**Interfaces:**
- Implements `POST /ace/pace/assessments`.
- Consumes `evaluatePaceAssessment` and `rebuildPaceProgress`.

- [ ] Write failing policy-code, duplicate-submit, same-day, timezone, concurrency, transaction rollback, audit, and outbox tests.
- [ ] Implement idempotent command transaction: fact, projection, audit, and event intent.
- [ ] Return machine-readable `PACE_POLICY_BLOCKED` details without sensitive data.
- [ ] Run unit/integration/concurrency tests.
- [ ] Commit `feat: record PACE assessments`.

**Acceptance:** Concurrent duplicate commands create one fact and one projection result.

**Rollback:** Disable writes; rebuild projections from retained facts.

### Task 10: ACE-O10 - Add PACE corrections and authorised overrides

**Branch:** `feat/ace-pace-corrections-overrides`

**Files:**
- Modify: `apps/api/src/pace/pace-command.service.ts`
- Modify: `apps/api/src/pace/pace.controller.ts`
- Create: `apps/api/src/pace/dto/pace-correction.dto.ts`
- Create: `apps/api/src/pace/tests/pace-correction.service.spec.ts`

**Interfaces:**
- Implements correction and override endpoints from source section 8.3.

- [ ] Test separate `ace.pace.correct` and `ace.pace.override`, step-up, reason, expiry, original-fact link, projection rebuild, audit, and denied actor.
- [ ] Implement correction and short-lived override transactions.
- [ ] Run focused tests and API checks.
- [ ] Commit `feat: correct and override PACE policy`.

**Acceptance:** No original fact is edited and every exception is attributable.

**Rollback:** Disable correction/override routes; retained rows remain audit evidence.

### Task 11: ACE-O11 - Expose PACE exceptions and operational projections

**Branch:** `feat/ace-pace-exceptions`

**Files:**
- Create: `apps/api/src/pace/pace-exceptions.service.ts`
- Modify: `apps/api/src/pace/pace.controller.ts`
- Create: `apps/api/src/pace/tests/pace-exceptions.service.spec.ts`
- Create: `apps/workers/src/pace/rebuild-pace-progress.job.ts`
- Test: `apps/workers/src/pace/tests/rebuild-pace-progress.spec.ts`

**Interfaces:**
- Implements `GET /ace/pace/exceptions`.

- [ ] Test behind, blocked, stale, absent, warning, cursor, tenant, and rebuild idempotency.
- [ ] Implement exception query and bounded projection rebuild worker.
- [ ] Run API/worker tests and commit `feat: surface PACE exceptions`.

**Acceptance:** Leaders can act on behind/blocked learners, and projections can be rebuilt safely.

**Rollback:** Stop worker and hide exception route; facts remain authoritative.

### Task 12: ACE-O12 - Build the admin PACE workflow

**Branch:** `feat/ace-admin-pace`

**Files:**
- Create: `apps/admin/app/ace/pace/page.tsx`
- Create: `apps/admin/components/ace/pace/pace-roster.tsx`
- Create: `apps/admin/components/ace/pace/pace-entry-dialog.tsx`
- Create: `apps/admin/components/ace/pace/pace-correction-dialog.tsx`
- Create: `apps/admin/components/ace/pace/policy-result-callout.tsx`
- Modify: `apps/admin/lib/api-client.ts`
- Test: `apps/admin/components/ace/pace/pace-workflow.test.tsx`

**Interfaces:**
- Consumes roster, assessment, correction, override, and exception APIs.

- [ ] Test loading, empty, policy warning/block, duplicate prevention, preserved form, correction, override step-up, success focus, and retry.
- [ ] Implement focused components using Oasis workflow sequencing but NexSteps components and language.
- [ ] Run admin unit, accessibility, typecheck, lint, and build.
- [ ] Commit `feat: add admin PACE workflow`.

**Acceptance:** A keyboard user can complete entry/correction without losing input after recoverable errors.

**Rollback:** Remove ACE nav item; API remains available.

### Task 13: ACE-O13 - Build the staff mobile PACE workflow

**Branch:** `feat/ace-mobile-pace`

**Files:**
- Create: `apps/mobile/app/(serve)/(tabs)/pace/index.tsx`
- Create: `apps/mobile/src/features/ace/pace/pace-screen.tsx`
- Create: `apps/mobile/src/features/ace/pace/pace-student-picker.tsx`
- Create: `apps/mobile/src/features/ace/pace/pace-subject-panel.tsx`
- Create: `apps/mobile/src/lib/api/pace.ts`
- Modify: `apps/mobile/src/components/navigation/serve-bottom-nav.tsx`
- Test: `apps/mobile/src/features/ace/pace/pace-wiring.test.ts`

**Interfaces:** Reuses the same policy result codes as admin.

- [ ] Port useful screen-flow tests from Oasis `staff-pace-*`; reject Oasis colours and API client.
- [ ] Implement large targets, offline-safe form state, duplicate-submit prevention, and explicit policy feedback.
- [ ] Run mobile wiring tests, typecheck, lint, and Expo route verification.
- [ ] Commit `feat: add mobile PACE capture`.

**Acceptance:** Staff can record one assessment quickly on a 320-point screen with 200% font scale.

**Rollback:** Remove route/nav item; no API rollback.

### Task 14: ACE-O14 - Expose behaviour categories and policy

**Branch:** `feat/ace-behaviour-policy-api`

**Files:**
- Create: `apps/api/src/behaviour/behaviour.module.ts`
- Create: `apps/api/src/behaviour/behaviour.controller.ts`
- Create: `apps/api/src/behaviour/behaviour-policy.service.ts`
- Create: `apps/api/src/behaviour/dto/behaviour-policy.dto.ts`
- Test: `apps/api/src/behaviour/tests/behaviour-policy.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:** Implements `GET/PUT /ace/behaviour/policy`.

- [ ] Test Merit/Demerit/General categories, general/sensitive visibility, inactive categories, stage ordering, serious categories, capability, and permission.
- [ ] Implement versioned policy service with audit.
- [ ] Run focused API checks and commit `feat: manage ACE behaviour policy`.

**Acceptance:** Sites can configure categories and stages without altering platform permission keys.

**Rollback:** Disable policy writes and use last active version.

### Task 15: ACE-O15 - Record and correct behaviour entries

**Branch:** `feat/ace-behaviour-command`

**Files:**
- Create: `apps/api/src/behaviour/behaviour-command.service.ts`
- Create: `apps/api/src/behaviour/behaviour-query.service.ts`
- Create: `apps/api/src/behaviour/dto/behaviour-entry.dto.ts`
- Modify: `apps/api/src/behaviour/behaviour.controller.ts`
- Test: `apps/api/src/behaviour/tests/behaviour-command.service.spec.ts`

**Interfaces:** Implements behaviour create/list/correction endpoints.

- [ ] Test type/delta consistency, sensitive permission, encryption, correction link, child/site scope, audit, and one idempotent `behaviour.merit-awarded` intent.
- [ ] Implement immutable command and allow-listed query services.
- [ ] Run unit/integration checks and commit `feat: record ACE behaviour`.

**Acceptance:** Core behaviour works without the Merit add-on, and an active Merit consumer can post exactly once later.

**Rollback:** Disable writes; keep immutable facts.

### Task 16: ACE-O16 - Apply demerit escalation and guardian notifications

**Branch:** `feat/ace-demerit-escalation`

**Files:**
- Create: `apps/api/src/behaviour/demerit-escalation.service.ts`
- Create: `apps/api/src/mailer/templates/behaviour-notification.tsx`
- Modify: `apps/api/src/behaviour/behaviour-command.service.ts`
- Test: `apps/api/src/behaviour/tests/demerit-escalation.service.spec.ts`

**Interfaces:** Consumes `evaluateDemeritStage`; produces review/notification outbox intents.

- [ ] Test threshold transitions, serious misconduct, repeated command, sensitive redaction, head review, no guardian, notification failure, and retry.
- [ ] Implement escalation in the behaviour transaction and async notification delivery.
- [ ] Run focused API/mailer tests and commit `feat: escalate ACE demerits`.

**Acceptance:** Notifications never contain sensitive notes, and email failure never rolls back the behaviour fact.

**Rollback:** Disable notification dispatch; stage facts remain.

### Task 17: ACE-O17 - Build admin and mobile behaviour capture

**Branch:** `feat/ace-behaviour-ui`

**Files:**
- Create: `apps/admin/app/ace/behaviour/page.tsx`
- Create: `apps/admin/components/ace/behaviour/behaviour-form.tsx`
- Create: `apps/admin/components/ace/behaviour/behaviour-history.tsx`
- Create: `apps/mobile/app/(serve)/(tabs)/behaviour/index.tsx`
- Create: `apps/mobile/src/features/ace/behaviour/behaviour-screen.tsx`
- Create: `apps/mobile/src/lib/api/behaviour.ts`
- Test: `apps/admin/components/ace/behaviour/behaviour-workflow.test.tsx`
- Test: `apps/mobile/src/features/ace/behaviour/behaviour-wiring.test.ts`

**Interfaces:** Consumes behaviour policy, command, history, and correction APIs.

- [ ] Port useful selection/capture cases from Oasis while enforcing separate sensitive mode.
- [ ] Test accessible selection, category filtering, sensitive warning, preserved draft, correction reason, loading, empty, error, retry, and success.
- [ ] Implement focused web/mobile components and API clients.
- [ ] Run admin/mobile checks and commit `feat: add ACE behaviour capture UI`.

**Acceptance:** Standard staff cannot reveal or select sensitive mode without the sensitive permission.

**Rollback:** Remove routes; API and data remain.

### Task 18: ACE-O18 - Migrate attendance to Present, Absent, and Late

**Branch:** `feat/ace-attendance-status`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_attendance_status_expand/migration.sql`
- Modify: `apps/api/src/attendance/attendance.service.ts`
- Modify: `apps/api/src/attendance/dto/create-attendance.dto.ts`
- Modify: `apps/api/src/attendance/dto/update-attendance.dto.ts`
- Create: `apps/api/src/attendance/dto/upsert-session-attendance.dto.ts`
- Test: `apps/api/src/attendance/tests/attendance.service.spec.ts`
- Test: `apps/api/src/attendance/tests/attendance.e2e.spec.ts`

**Interfaces:**

```ts
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";
```

- [ ] Write failing compatibility tests that map existing `present=true/false`, add Late, and preserve old reads during expand.
- [ ] Add enum/status column, backfill, dual-read/write adapter, audited correction fields, indexes, and RLS.
- [ ] Run migration, attendance tests, and strict RLS.
- [ ] Commit `feat: add Late attendance status`.

**Acceptance:** Existing records retain meaning and new Late records round-trip through API and exports.

**Rollback:** During expand, switch reads back to Boolean; remove the new column only after a separate contract migration.

### Task 19: ACE-O19 - Update attendance web and mobile workflows

**Branch:** `feat/ace-attendance-ui`

**Files:**
- Modify: `apps/admin/app/attendance/[sessionId]/page.tsx`
- Modify: `apps/mobile/app/(serve)/(tabs)/attendance/[sessionId].tsx`
- Modify: `apps/mobile/src/lib/api/attendance.ts`
- Test: `apps/admin/app/attendance/attendance-status.test.tsx`
- Test: `apps/mobile/src/lib/api/attendance.test.ts`

**Interfaces:** Uses `AttendanceStatus`; corrections require actor/reason.

- [ ] Test Present/Absent/Late selection, non-colour cues, correction reason, partial failure, retry, and 44-point targets.
- [ ] Implement segmented controls and status summaries without optimistic authoritative updates.
- [ ] Run admin/mobile checks and commit `feat: update attendance status workflows`.

**Acceptance:** Staff can distinguish all states without relying on colour.

**Rollback:** Hide Late control only while the dual-read compatibility layer exists.

### Task 20: ACE-O20 - Deliver ACE overview, operational metrics, and daily-operations gate

**Branch:** `feat/ace-operations-dashboard`

**Files:**
- Create: `apps/api/src/ace-dashboard/ace-dashboard.module.ts`
- Create: `apps/api/src/ace-dashboard/ace-dashboard.controller.ts`
- Create: `apps/api/src/ace-dashboard/ace-dashboard.service.ts`
- Create: `apps/admin/app/ace/page.tsx`
- Create: `apps/admin/components/ace/overview/attention-cards.tsx`
- Create: `apps/admin/components/ace/overview/pace-status-table.tsx`
- Create: `apps/api/src/ace-dashboard/tests/ace-dashboard.service.spec.ts`
- Create: `apps/admin/components/ace/overview/ace-overview.test.tsx`
- Create: `apps/api/src/ace-dashboard/tests/ace-daily-operations.e2e.spec.ts`

**Interfaces:** Aggregates site-level attendance, PACE, behaviour, blocks, and review counts only.

- [ ] Test site/tenant isolation, site timezone, empty site, partial data, no sensitive behaviour text, query count, and pilot p95.
- [ ] Implement bounded aggregate queries and accessible admin cards/table.
- [ ] Run daily E2E: configure period, enrol child, record Late, PACE, behaviour, correct each, and verify dashboard.
- [ ] Run API/admin builds, strict RLS, and Graphify.
- [ ] Commit `feat: deliver ACE daily operations dashboard`.

**Acceptance:** Daily staff workflows pass end to end and the dashboard exposes no family/add-on data or sensitive narrative.

**Rollback:** Hide dashboard capability; individual operations remain available.
