# ACE Clubs Add-on Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver club setup, capacity and signup, rosters, sessions, attendance, notices, scoped club leads, web/mobile experiences, and subscription entitlement.

**Architecture:** Clubs is a first-class module, not a relabelled academic class. It uses dedicated domain rules and tables while reusing shared membership, child relationship, notification, access, audit, and outbox services. Club leads receive resource-scoped permissions only for assigned clubs.

**Price and packaging:** £12/month or £120/year, **Proposed**. Global add-on, included for `Vertical.CLUB`, eligible for Operations and All Included.

## Global Constraints

- Do not create Stripe Products/Prices while the row is Proposed.
- `Vertical.CLUB` receives the module without a duplicate charge.
- Club leads do not gain site-wide child, attendance, message, finance, or safeguarding access.
- Capacity and waitlist transitions must be transaction-safe and idempotent.
- Club attendance is not automatically school attendance.
- A club notice uses the frozen current roster/audience policy and the core notices service.

---

### Task 1: ACE-CLB01 - Add Clubs module, price, and inclusion rules

**Branch:** `feat/ace-clubs-entitlement`

**Files:**
- Modify: `packages/platform/src/types.ts`
- Modify: `packages/platform/src/capability-maps.ts`
- Modify: `apps/api/src/billing/addon-catalog.ts`
- Test: `apps/api/src/billing/addon-catalog.spec.ts`
- Test: `apps/api/src/clubs/tests/clubs-entitlement.e2e.spec.ts`

- [ ] Add `Module.CLUBS` and typed club capabilities/permissions.
- [ ] Encode £12/£120 Proposed, `Vertical.CLUB` inclusion, and Operations/All Included eligibility.
- [ ] Test direct add-on, vertical-included, bundle-included, suspended, cancellation, and duplicate-charge cases.
- [ ] Keep Stripe identifiers absent while Proposed.

**Acceptance:** Entitlement resolution matches the latest local-master pricing source exactly.

**Rollback:** Remove inactive enum/catalog entries before persisted usage.

### Task 2: ACE-CLB02 - Add Clubs schema, indexes, and strict RLS

**Branch:** `feat/ace-clubs-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_clubs/migration.sql`
- Create: `apps/api/src/clubs/tests/clubs-rls.e2e.spec.ts`

- [ ] Model clubs, schedules, capacity, eligibility, lead assignments, signups, waitlist positions, sessions, attendance, and notice links with tenant/site scope.
- [ ] Add unique signup/session/lead constraints and list indexes.
- [ ] Enable and force RLS; test tenant, site, child relationship, participant, assigned lead, and admin access.
- [ ] Document data retention and forward mitigation.

**Acceptance:** Database access cannot cross tenant/site/club/child scope.

**Rollback:** Drop unused tables before club records are created.

### Task 3: ACE-CLB03 - Create the pure Clubs domain

**Branch:** `feat/ace-clubs-domain`

**Files:**
- Create: `packages/clubs-domain/package.json`
- Create: `packages/clubs-domain/src/signup-policy.ts`
- Create: `packages/clubs-domain/src/session-policy.ts`
- Test: `packages/clubs-domain/src/signup-policy.spec.ts`
- Test: `packages/clubs-domain/src/session-policy.spec.ts`

```ts
export function evaluateClubSignup(input: ClubSignupPolicyInput): ClubSignupDecision;
export function transitionWaitlist(input: WaitlistInput): WaitlistResult;
```

- [ ] Port useful capacity/signup cases from Oasis `packages/domain/src/clubs.ts`.
- [ ] Test eligible/ineligible, open/closed, full/waitlist, duplicate, age/year restrictions, cancellation, promotion, and simultaneous final place.
- [ ] Keep rules pure and deterministic.

**Acceptance:** Capacity and waitlist rules are testable outside API/UI.

**Rollback:** Remove the unconsumed package.

### Task 4: ACE-CLB04 - Implement club administration commands

**Branch:** `feat/ace-club-administration`

**Files:**
- Create: `apps/api/src/clubs/clubs.controller.ts`
- Create: `apps/api/src/clubs/clubs.service.ts`
- Create: `apps/api/src/clubs/dto/create-club.dto.ts`
- Test: `apps/api/src/clubs/tests/clubs-admin.e2e.spec.ts`

- [ ] Test draft, publish, schedule, capacity, eligibility, duplicate name/term, archive, and active-signup protection.
- [ ] Keep club, academic class, and Community space identifiers distinct.
- [ ] Audit publication, capacity changes, eligibility changes, archive, and cancellation.
- [ ] Emit notifications only after committed state transitions.

**Acceptance:** Authorised admins can create and govern a club without altering academic groups.

**Rollback:** Disable publication; retain drafts.

### Task 5: ACE-CLB05 - Implement guardian/student signup and waitlist

**Branch:** `feat/ace-club-signup`

**Files:**
- Create: `apps/api/src/clubs/club-signup.service.ts`
- Create: `apps/api/src/clubs/dto/create-club-signup.dto.ts`
- Test: `apps/api/src/clubs/tests/club-signup.e2e.spec.ts`

- [ ] Test guardian relationship, student self policy, consent requirement, full club, waitlist, duplicate retry, cancellation cutoff, and concurrent final place.
- [ ] Allocate a place or waitlist position transactionally with a client idempotency key.
- [ ] Promote the next eligible waitlisted signup predictably after cancellation.
- [ ] Notify affected guardians/students with content-safe events.

**Acceptance:** Signup capacity never exceeds the configured limit and retries never duplicate places.

**Rollback:** Close signup while retaining roster/waitlist.

### Task 6: ACE-CLB06 - Implement resource-scoped club leads

**Branch:** `feat/ace-club-leads`

**Files:**
- Create: `apps/api/src/clubs/club-lead-access.service.ts`
- Create: `packages/platform/src/access/resource-scope.ts`
- Test: `apps/api/src/clubs/tests/club-lead-access.e2e.spec.ts`

- [ ] Test assigned/unassigned lead, assignment dates, substitute lead, site admin, removed staff, and guessed club/session/child IDs.
- [ ] Grant only club roster, club-session attendance, and club-notice actions for assigned resources.
- [ ] Prove assignment does not grant academic attendance, general child profile, behaviour, finance, messaging directory, or safeguarding access.
- [ ] Audit lead assignment and revocation.

**Acceptance:** Club lead access is resource-scoped and least-privilege.

**Rollback:** Revoke lead assignments; admins retain control.

### Task 7: ACE-CLB07 - Implement sessions and club attendance

**Branch:** `feat/ace-club-sessions`

**Files:**
- Create: `apps/api/src/clubs/club-session.service.ts`
- Create: `apps/api/src/clubs/club-attendance.service.ts`
- Create: `apps/api/src/clubs/dto/upsert-club-attendance.dto.ts`
- Test: `apps/api/src/clubs/tests/club-attendance.e2e.spec.ts`

- [ ] Test scheduled/cancelled/completed session, active roster snapshot, Present/Absent/Late if configured, correction, duplicate save, and lead scope.
- [ ] Snapshot the session roster and store attendance facts/corrections with local business date.
- [ ] Keep club attendance out of school attendance aggregates unless an explicit reporting rule consumes it.

**Acceptance:** A scoped lead can record a reproducible session register only for their club.

**Rollback:** Disable attendance writes; sessions and rosters remain.

### Task 8: ACE-CLB08 - Integrate club notices and reminders

**Branch:** `feat/ace-club-notices`

**Files:**
- Create: `apps/api/src/clubs/club-notice.service.ts`
- Create: `apps/workers/src/clubs/club-notification.job.ts`
- Test: `apps/api/src/clubs/tests/club-notices.e2e.spec.ts`

- [ ] Test accepted-only, waitlist, all applicants, session roster, cancelled session, duplicate notification, and removed relationship.
- [ ] Delegate publication/receipts to core notices with a frozen club audience.
- [ ] Use authenticated deep links and generic lock-screen copy.

**Acceptance:** Club communications reach the selected, reproducible audience.

**Rollback:** Pause club notification jobs.

### Task 9: ACE-CLB09 - Build the Clubs administration workspace

**Branch:** `feat/ace-clubs-admin-ui`

**Files:**
- Create: `apps/admin/app/clubs/page.tsx`
- Create: `apps/admin/app/clubs/clubs-workspace.tsx`
- Create: `apps/admin/app/clubs/club-roster.tsx`
- Test: `apps/admin/e2e/clubs-admin.spec.ts`

- [ ] Build entitlement-locked, draft/publish, schedule, eligibility, capacity, waitlist, lead assignment, session, attendance, notice, and archive states.
- [ ] Handle empty, loading, conflict, full capacity, revoked permission, cancellation, and retry.
- [ ] Require confirmation for capacity reduction below accepted count, cancellation, archive, and lead removal.

**Acceptance:** Admins can run the club lifecycle without using academic-class administration.

**Rollback:** Hide web navigation and leave APIs gated.

### Task 10: ACE-CLB10 - Build family/student discovery and signup UI

**Branch:** `feat/ace-clubs-family-ui`

**Files:**
- Create: `apps/mobile/app/(family)/(tabs)/clubs/index.tsx`
- Create: `apps/mobile/app/(family)/(tabs)/clubs/[clubId].tsx`
- Create: `apps/mobile/app/(student)/(tabs)/clubs/index.tsx`
- Create: `apps/admin/app/family/clubs/page.tsx`
- Create: `apps/admin/app/family/clubs/[clubId]/page.tsx`
- Test: `apps/mobile/e2e/clubs-signup.e2e.ts`

- [ ] Show eligibility, schedule, remaining-place/waitlist status, signup terms, confirmation, cancellation cutoff, and current state.
- [ ] Test two children, ineligible child, full club, promotion notification, offline retry, duplicate tap, 320pt, and 200% font.
- [ ] Do not expose other applicants or roster membership.

**Acceptance:** Families/students can discover and manage only their permitted signups.

**Rollback:** Close signup and hide discovery.

### Task 11: ACE-CLB11 - Build the mobile club-lead register

**Branch:** `feat/ace-club-lead-mobile`

**Files:**
- Create: `apps/mobile/app/(serve)/(tabs)/clubs/index.tsx`
- Create: `apps/mobile/app/(serve)/(tabs)/clubs/[clubId]/sessions/[sessionId].tsx`
- Create: `apps/mobile/src/features/clubs/club-register.tsx`
- Test: `apps/mobile/e2e/club-register.e2e.ts`

- [ ] Show assigned clubs only, session roster, bulk Present, individual Absent/Late, unsaved changes, submit, correction, and offline-safe error states.
- [ ] Recheck assignment and entitlement before submit; handle revocation while screen is open.
- [ ] Verify keyboard/screen-reader operation, 320pt, 200% font, and intermittent network.

**Acceptance:** A club lead can complete a register quickly without broader child access.

**Rollback:** Disable mobile write actions; web admins retain correction.

### Task 12: ACE-CLB12 - Add approved billing and complete the release gate

**Branch:** `feat/ace-clubs-addon-billing`

**Files:**
- Modify: `apps/api/src/billing/addon-catalog.ts`
- Modify: `apps/api/src/billing/stripe-webhook.service.ts`
- Create: `apps/api/src/clubs/tests/clubs-release-gate.e2e.spec.ts`
- Create: `docs/runbooks/clubs-addon.md`
- Create: `docs/evidence/clubs-addon-release-gate.md`

- [ ] Stop Stripe work while the row is Proposed.
- [ ] After Approved, link £12/£120 Prices and test direct purchase, `Vertical.CLUB` inclusion, Operations/All Included, upgrade, suspend, cancel, and webhook replay.
- [ ] Run entitlement, permission, resource scope, tenant, child relationship, RLS, concurrency, notification, retention, accessibility, and IDOR matrices.
- [ ] Verify cancellation closes new signup/writes under policy but preserves rosters, attendance, and audit history.

**Acceptance:** Clubs is supportable, correctly priced, and never double-charged to included organisations.

**Rollback:** Revoke entitlement and make historical data read-only.

## Completion Evidence

- £12/month and £120/year Proposed pricing is exact.
- `Vertical.CLUB`, Operations, and All Included rules pass.
- Capacity and waitlist concurrency tests pass.
- Scoped leads cannot reach unrelated child or site data.
- Stripe activation is blocked until commercial approval.
