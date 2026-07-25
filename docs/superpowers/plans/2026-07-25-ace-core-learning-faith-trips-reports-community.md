# ACE Core Learning, Faith, Trips, Reports, and Community Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the ACE core with homework and evidence, Faith Corner, trips and versioned permission slips, frozen reports, site reporting, and toggleable moderated Student Community.

**Architecture:** Each workstream owns its commands and projections but uses the shared access, relationship, release, storage, audit, and outbox services. Published reports and permission slips are immutable versions. Community is a site-controlled group-content surface, never a private-message back door. ACE receives the homework/evidence capability subset through the vertical entitlement.

**Tech Stack:** strict TypeScript, NestJS, Zod, Prisma/PostgreSQL and strict RLS, private Supabase Storage, Next.js, Expo/React Native, worker jobs, Jest, Playwright, and PDF rendering.

## Global Constraints

- Depends on `ACE-O20` and `ACE-M20`.
- Homework/evidence is ACE core. Do not require or charge the `LEARNING` add-on for confirmed ACE capability keys.
- All storage keys are server-generated. Clients receive short-lived authorised URLs, never bucket credentials or permanent public URLs.
- Published report and permission-slip wording is immutable. Changes create a new version with explicit reconsent or republish policy.
- Site reports are operational ACE core. Cross-site analytics and richer exports remain Advanced Reporting.
- Faith content and reflections follow the organisation’s configured terminology and moderation policy.
- Community is off until enabled per organisation/site, membership is derived, all content is reportable, and student direct messages do not exist.
- Community moderation never exposes safeguarding detail to ordinary moderators.
- Every family/student read passes both relationship and release policy.

---

### Task 1: ACE-C01 - Grant the ACE homework/evidence capability subset

**Branch:** `feat/ace-learning-capability-grant`

**Files:**
- Modify: `packages/platform/src/capability-maps.ts`
- Modify: `packages/platform/src/permission-metadata.ts`
- Test: `packages/platform/src/capability-maps.spec.ts`
- Test: `apps/api/src/homework/tests/ace-learning-entitlement.e2e.spec.ts`

- [ ] Enumerate the homework assignment, submission, evidence, review, and family-read capabilities confirmed for ACE.
- [ ] Test ACE without `Module.LEARNING`, non-ACE without Learning, non-ACE with Learning, suspended module, and included-plan cases.
- [ ] Grant only the confirmed subset from `Vertical.ACE_SCHOOL`; keep unrelated Learning capabilities add-on gated.
- [ ] Prove the billing resolver returns no duplicate Learning charge for an ACE organisation.

**Acceptance:** ACE users receive homework/evidence access without a Learning add-on row or duplicate charge.

**Rollback:** Revert capability-map entries before any production entitlement is enabled.

### Task 2: ACE-C02 - Implement homework assignment commands

**Branch:** `feat/ace-homework-assignments`

**Files:**
- Create: `apps/api/src/homework/homework.controller.ts`
- Create: `apps/api/src/homework/homework.service.ts`
- Create: `apps/api/src/homework/dto/create-homework.dto.ts`
- Create: `apps/api/src/homework/dto/publish-homework.dto.ts`
- Test: `apps/api/src/homework/tests/homework-assignment.e2e.spec.ts`

- [ ] Port assignment-state cases from Oasis `apps/api/src/routers/homework.ts`.
- [ ] Test draft, edit, publish, scheduled publish, class/subject audience, invalid due date, archived enrolment, and cross-tenant denial.
- [ ] Resolve recipients from current enrolments and freeze the publication audience.
- [ ] Audit create/edit/publish/cancel and emit notification outbox records after commit.

**Acceptance:** Authorised staff can publish a deterministic assignment to an auditable student audience.

**Rollback:** Disable publication; retain drafts and already-published assignments.

### Task 3: ACE-C03 - Implement submission and evidence storage

**Branch:** `feat/ace-homework-submissions`

**Files:**
- Create: `apps/api/src/homework/homework-submission.service.ts`
- Create: `apps/api/src/homework/dto/create-submission.dto.ts`
- Create: `apps/api/src/storage/homework-evidence.policy.ts`
- Test: `apps/api/src/homework/tests/homework-submission.e2e.spec.ts`

- [ ] Test draft/submitted/returned/resubmitted states, late submission, duplicate retry, wrong student, embargo, unsupported file, oversized file, and malicious filename.
- [ ] Issue scoped upload intents for private storage; verify size, MIME signature, checksum, tenant, child, and assignment before attachment.
- [ ] Store server-generated object keys and scan status; block unscanned evidence from staff/family download.
- [ ] Make submission idempotent and preserve an immutable submission-version history.

**Acceptance:** A student can submit safe evidence only for their own released assignment.

**Rollback:** Disable new uploads and submissions; preserve existing private evidence.

### Task 4: ACE-C04 - Implement homework review, release, and notifications

**Branch:** `feat/ace-homework-review`

**Files:**
- Create: `apps/api/src/homework/homework-review.service.ts`
- Create: `apps/api/src/homework/dto/review-submission.dto.ts`
- Create: `apps/workers/src/homework/homework-notification.job.ts`
- Test: `apps/api/src/homework/tests/homework-review.e2e.spec.ts`

- [ ] Test review, return for changes, completed, feedback visibility, release-to-family, revoked reviewer, and concurrent review.
- [ ] Keep staff-only notes separate from student/family feedback.
- [ ] Require an explicit release action for family-visible feedback and audit each transition.
- [ ] Send content-safe assignment/submission notifications through the outbox with idempotent delivery.

**Acceptance:** Review state is consistent and private notes never enter student or guardian DTOs.

**Rollback:** Pause release and notifications; retain review state.

### Task 5: ACE-C05 - Build homework web and mobile workflows

**Branch:** `feat/ace-homework-ui`

**Files:**
- Create: `apps/admin/app/homework/page.tsx`
- Create: `apps/admin/app/homework/homework-workspace.tsx`
- Create: `apps/admin/app/family/homework/page.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/homework/index.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/homework/[homeworkId].tsx`
- Create: `apps/mobile/app/(family)/(tabs)/homework/index.tsx`
- Test: `apps/admin/e2e/homework.spec.ts`
- Test: `apps/mobile/e2e/homework.e2e.ts`

- [ ] Build staff draft/publish/review and student draft/upload/submit flows with full loading, empty, error, offline, progress, success, and retry states.
- [ ] Give guardians read-only released status and feedback, never staff notes or draft evidence.
- [ ] Verify photo-library/camera permission denial, interrupted upload, duplicate submit, 320pt layout, 200% font, and screen-reader labels.

**Acceptance:** Staff, student, and guardian complete their permitted homework journeys on supported web/mobile surfaces.

**Rollback:** Hide the UI routes while APIs remain feature-gated.

### Task 6: ACE-C06 - Implement Faith content lifecycle

**Branch:** `feat/ace-faith-content`

**Files:**
- Create: `apps/api/src/faith/faith.controller.ts`
- Create: `apps/api/src/faith/faith.service.ts`
- Create: `apps/api/src/faith/dto/create-faith-content.dto.ts`
- Test: `apps/api/src/faith/tests/faith-content.e2e.spec.ts`

- [ ] Port useful publish/read cases from Oasis Faith Corner while replacing role names and copy.
- [ ] Test draft, scheduled, published, withdrawn, audience, site terminology, unsafe link rejection, and cross-tenant reads.
- [ ] Freeze published content versions; edits create a new draft/version.
- [ ] Audit authoring and publication without logging reflection content.

**Acceptance:** Faith content is versioned, audience-scoped, and configurable to the organisation’s terminology.

**Rollback:** Disable authoring and retain published read-only content.

### Task 7: ACE-C07 - Implement Faith read and reflection policy

**Branch:** `feat/ace-faith-reflections`

**Files:**
- Create: `apps/api/src/faith/faith-reflection.service.ts`
- Create: `apps/api/src/faith/dto/create-reflection.dto.ts`
- Create: `packages/platform/src/faith/reflection-policy.ts`
- Test: `apps/api/src/faith/tests/faith-reflection.e2e.spec.ts`

- [ ] Test student read, guardian released read, reflection allowed/disabled, private-to-staff scope, moderation, withdrawal, and supplied-child attacks.
- [ ] Store reflection visibility explicitly; never infer privacy from UI route.
- [ ] Route reportable content through the shared safeguarding/reporting bridge with only a reference ID.
- [ ] Exclude likes, popularity counters, and public ranking unless separately approved.

**Acceptance:** Reflections have an explicit audience and a safe reporting path.

**Rollback:** Disable new reflections; published Faith content remains.

### Task 8: ACE-C08 - Build Faith web and mobile experiences

**Branch:** `feat/ace-faith-ui`

**Files:**
- Create: `apps/admin/app/faith/page.tsx`
- Create: `apps/admin/app/faith/faith-editor.tsx`
- Create: `apps/admin/app/family/faith/page.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/faith/index.tsx`
- Create: `apps/mobile/app/(family)/(tabs)/faith/index.tsx`
- Test: `apps/admin/e2e/faith.spec.ts`
- Test: `apps/mobile/e2e/faith.e2e.ts`

- [ ] Build staff author/preview/schedule/publish states and student/family chronological reading surfaces.
- [ ] Use the site’s configured Faith label in headings, navigation, notifications, and empty states.
- [ ] Support reflection disabled, moderation pending, offline read cache, withdrawn content, and 200% font.

**Acceptance:** Faith content feels native to NexSteps and respects configured terminology and visibility.

**Rollback:** Hide navigation and keep content accessible only to authorised administrators.

### Task 9: ACE-C09 - Implement trip and permission-slip versioning

**Branch:** `feat/ace-trip-slip-versions`

**Files:**
- Create: `apps/api/src/trips/trips.controller.ts`
- Create: `apps/api/src/trips/trips.service.ts`
- Create: `apps/api/src/trips/permission-slip-version.service.ts`
- Test: `apps/api/src/trips/tests/trip-slip-version.e2e.spec.ts`

- [ ] Port validation concepts from Oasis `packages/domain/src/permissionSlips.ts`.
- [ ] Test draft, publish, scheduled publish, duplicate publish, material edit, non-material correction, cancel, and cross-tenant access.
- [ ] Hash and freeze published wording, questions, destinations, dates, consent terms, and recipient snapshot.
- [ ] Require a new version and explicit reconsent when a material field changes.

**Acceptance:** The exact consent text accepted by each guardian can always be reproduced.

**Rollback:** Disable new publication; retain all published versions and responses.

### Task 10: ACE-C10 - Implement guardian consent and exception commands

**Branch:** `feat/ace-slip-consent`

**Files:**
- Create: `apps/api/src/trips/permission-slip-response.service.ts`
- Create: `apps/api/src/trips/dto/respond-to-slip.dto.ts`
- Create: `apps/api/src/trips/dto/record-physical-response.dto.ts`
- Test: `apps/api/src/trips/tests/trip-slip-response.e2e.spec.ts`

- [ ] Test accept/decline, required answers, signature acknowledgement, duplicate retry, two guardians, replaced version, ended relationship, and late response.
- [ ] Derive child IDs from guardian relationships; never trust a supplied child alone.
- [ ] Store online response, version hash, actor, timestamp, IP/device metadata under retention policy, and idempotency key.
- [ ] Permit authorised staff to record physical/telephone exceptions with source, reason, witness, and audit.

**Acceptance:** Consent is attributable, version-bound, idempotent, and relationship-safe.

**Rollback:** Disable online responses; staff exception workflow remains under explicit permission.

### Task 11: ACE-C11 - Build trip administration and family slip UI

**Branch:** `feat/ace-trip-slip-ui`

**Files:**
- Create: `apps/admin/app/trips/page.tsx`
- Create: `apps/admin/app/trips/trip-workspace.tsx`
- Create: `apps/admin/app/family/slips/page.tsx`
- Create: `apps/admin/app/family/slips/[slipId]/page.tsx`
- Create: `apps/mobile/app/(family)/(tabs)/slips/index.tsx`
- Create: `apps/mobile/app/(family)/(tabs)/slips/[slipId].tsx`
- Test: `apps/admin/e2e/trips.spec.ts`
- Test: `apps/mobile/e2e/permission-slips.e2e.ts`

- [ ] Build audience preview, version comparison, publish confirmation, response dashboard, reminders, and physical-exception capture.
- [ ] Build guardian read, required answers, accept/decline, confirmation, superseded-version, offline, and retry states.
- [ ] Require re-reading and reconsent for material new versions; never pre-check consent.
- [ ] Verify long wording, 320pt screens, 200% font, keyboard, screen readers, and two-child households.

**Acceptance:** Staff see trustworthy completion totals and guardians consent to the exact current version.

**Rollback:** Hide response actions while preserving historical version reads.

### Task 12: ACE-C12 - Add slip reminders and completion projections

**Branch:** `feat/ace-slip-reminders`

**Files:**
- Create: `apps/workers/src/trips/permission-slip-reminder.job.ts`
- Create: `apps/api/src/trips/permission-slip-projection.service.ts`
- Test: `apps/workers/src/trips/permission-slip-reminder.job.spec.ts`
- Test: `apps/api/src/trips/permission-slip-projection.service.spec.ts`

- [ ] Derive pending/accepted/declined/exception/superseded counts from immutable versions and responses.
- [ ] Test quiet hours, duplicate job, cancelled trip, ended enrolment, version replacement, and already-responded guardian.
- [ ] Send content-safe reminders only to current authorised recipients.

**Acceptance:** Completion totals reconcile and reminder retries do not duplicate notifications.

**Rollback:** Pause reminder scheduling; responses remain accurate.

### Task 13: ACE-C13 - Implement deterministic report compilation

**Branch:** `feat/ace-report-compilation`

**Files:**
- Create: `apps/workers/src/reports/compile-student-report.job.ts`
- Create: `packages/ace-domain/src/report-snapshot.ts`
- Test: `packages/ace-domain/src/report-snapshot.spec.ts`
- Test: `apps/workers/src/reports/compile-student-report.job.spec.ts`

- [ ] Define snapshot inputs for term, PACE, attendance, behaviour summary, homework, narrative sections, and source versions.
- [ ] Test corrections, missing optional sections, timezone boundaries, rerun idempotency, and source changes after compilation.
- [ ] Compile a deterministic draft snapshot from immutable facts/projections and record source versions.
- [ ] Do not include safeguarding details or staff-only behaviour notes.

**Acceptance:** Recompiling the same source versions produces the same report snapshot.

**Rollback:** Stop compilation jobs; source data is untouched.

### Task 14: ACE-C14 - Implement report review, approval, publication, and supersession

**Branch:** `feat/ace-report-publication`

**Files:**
- Create: `apps/api/src/reports/reports.controller.ts`
- Create: `apps/api/src/reports/report-publication.service.ts`
- Create: `apps/api/src/reports/dto/review-report.dto.ts`
- Test: `apps/api/src/reports/tests/report-publication.e2e.spec.ts`

- [ ] Test draft review, section amendment, approval separation, publish, duplicate publish, revoke, supersede, and unauthorised self-approval.
- [ ] Freeze approved content and audience at publication; later changes require a superseding report.
- [ ] Enforce configurable maker/checker policy where required and audit every transition.
- [ ] Release only published, non-revoked versions to student/family facades.

**Acceptance:** A sent report is immutable, attributable, and reproducible.

**Rollback:** Disable publication; retain drafts and published history.

### Task 15: ACE-C15 - Render and store report PDFs privately

**Branch:** `feat/ace-report-pdf`

**Files:**
- Create: `apps/workers/src/reports/render-report-pdf.job.ts`
- Create: `apps/workers/src/reports/report-pdf.template.tsx`
- Create: `apps/api/src/reports/report-document.service.ts`
- Test: `apps/workers/src/reports/render-report-pdf.job.spec.ts`

- [ ] Render only from a frozen report version and embed version/report identifiers in document metadata.
- [ ] Test long names, missing optional sections, pagination, font fallback, deterministic checksum, rendering retry, and revoked report.
- [ ] Store PDF in private storage; issue short-lived downloads only after relationship and release checks.
- [ ] Never store public URLs or PDF bytes in the report row.

**Acceptance:** Each published version has a private, reproducible PDF with authorised download.

**Rollback:** Pause rendering and allow HTML read of the frozen version.

### Task 16: ACE-C16 - Build report review and family reading experiences

**Branch:** `feat/ace-report-ui`

**Files:**
- Modify: `apps/admin/app/reports/page.tsx`
- Create: `apps/admin/app/reports/report-review-workspace.tsx`
- Create: `apps/admin/app/family/reports/page.tsx`
- Create: `apps/mobile/app/(family)/(tabs)/reports/index.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/reports/index.tsx`
- Test: `apps/admin/e2e/reports.spec.ts`
- Test: `apps/mobile/e2e/reports.e2e.ts`

- [ ] Build compile status, review, source-warning, approve, publish, revoke, and supersede states for staff.
- [ ] Build released report list, HTML read, private PDF download, offline-safe metadata, and revoked-version states for families/students.
- [ ] Verify the UI never implies that a draft is sent and clearly identifies superseded reports.

**Acceptance:** Staff control publication and families can read only frozen released versions.

**Rollback:** Hide publication controls and keep published read access.

### Task 17: ACE-C17 - Implement ACE site reporting contracts and projections

**Branch:** `feat/ace-site-reporting`

**Files:**
- Create: `packages/ace-domain/src/site-metrics.ts`
- Create: `apps/api/src/site-reporting/site-reporting.service.ts`
- Create: `apps/api/src/site-reporting/site-reporting.controller.ts`
- Test: `packages/ace-domain/src/site-metrics.spec.ts`
- Test: `apps/api/src/site-reporting/tests/site-reporting.e2e.spec.ts`

- [ ] Define operational metrics for PACE track status, attendance status, behaviour stages, homework completion, slip completion, and report publication.
- [ ] Document calculation, time window, denominator, exclusions, correction handling, timezone, and freshness for each metric.
- [ ] Test empty denominators, corrections, archived pupils, multi-site tenant, unsupported cross-site query, and permission denial.
- [ ] Keep all operational queries site-scoped; reject cross-site comparison without Advanced Reporting.

**Acceptance:** ACE leaders receive documented, reproducible site metrics without add-on analytics.

**Rollback:** Hide reporting routes; source operations continue.

### Task 18: ACE-C18 - Build the site reporting dashboard

**Branch:** `feat/ace-site-reporting-ui`

**Files:**
- Create: `apps/admin/app/ace/reports/page.tsx`
- Create: `apps/admin/app/ace/reports/site-reporting-dashboard.tsx`
- Test: `apps/admin/e2e/site-reporting.spec.ts`

- [ ] Present compact KPI cards, distributions, exception lists, filters, last-updated time, metric definitions, and accessible tables.
- [ ] Support loading, empty site, partial data, stale projection, permission denial, error, and retry states.
- [ ] Ensure charts have text/table equivalents and do not expose small-group personal information.

**Acceptance:** A site leader can identify operational follow-up without receiving cross-site or add-on-only analytics.

**Rollback:** Remove the navigation entry; API can remain gated.

### Task 19: ACE-C19 - Implement the fail-closed Community toggle and membership projection

**Branch:** `feat/ace-community-toggle`

**Files:**
- Create: `apps/api/src/community/community-feature.service.ts`
- Create: `apps/api/src/community/community-membership.service.ts`
- Test: `apps/api/src/community/tests/community-feature.e2e.spec.ts`

- [ ] Test absent setting, disabled site, enabled site, disabled tenant, student without active enrolment, staff permission, and cache invalidation.
- [ ] Derive space membership from active class/group/site records; do not create manually drifting duplicate membership.
- [ ] Revoke reads, writes, realtime subscriptions, notifications, and navigation when disabled.
- [ ] Audit enable/disable and require the dedicated organisation permission.

**Acceptance:** Community is invisible and inaccessible until explicitly enabled.

**Rollback:** Turn off the feature setting; content is retained privately.

### Task 20: ACE-C20 - Implement Community spaces, posts, replies, and read state

**Branch:** `feat/ace-community-content`

**Files:**
- Create: `apps/api/src/community/community.controller.ts`
- Create: `apps/api/src/community/community.service.ts`
- Create: `apps/api/src/community/dto/create-community-post.dto.ts`
- Test: `apps/api/src/community/tests/community-content.e2e.spec.ts`

- [ ] Port useful group-feed cases from Oasis while deleting all direct-message paths.
- [ ] Test space list, post, reply, edit window if approved, withdraw, pagination, read cursor, disabled toggle, non-member, and cross-tenant denial.
- [ ] Require explicit space context for every write and derive actor identity server-side.
- [ ] Sanitize supported formatting and links; reject hidden tracking and executable content.

**Acceptance:** Students participate only in moderated organisation spaces they currently belong to.

**Rollback:** Disable writes first, then reads if required; retain content for audit.

### Task 21: ACE-C21 - Implement Community moderation and safeguarding escalation

**Branch:** `feat/ace-community-moderation`

**Files:**
- Create: `apps/api/src/community/community-moderation.service.ts`
- Create: `apps/api/src/community/dto/report-community-content.dto.ts`
- Create: `apps/api/src/community/community-safeguarding.bridge.ts`
- Test: `apps/api/src/community/tests/community-moderation.e2e.spec.ts`

- [ ] Test report, duplicate report, moderator hide/restore, author restriction, evidence preservation, appeal note, and safeguarding escalation.
- [ ] Preserve original content and audit evidence while replacing ordinary reads with a safe placeholder.
- [ ] Pass only the content reference, reporter, risk category, and required context to safeguarding; never expose safeguarding case details back to Community.
- [ ] Separate moderator permissions from safeguarding permissions.

**Acceptance:** Reported content is actionable and preserved without broadening access to confidential cases.

**Rollback:** Disable new posts and keep moderation queues accessible.

### Task 22: ACE-C22 - Build the mobile Community group-conversation experience

**Branch:** `feat/ace-mobile-community`

**Files:**
- Create: `apps/mobile/app/(student)/(tabs)/community/index.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/community/[spaceId].tsx`
- Create: `apps/mobile/src/features/community/community-thread.tsx`
- Test: `apps/mobile/e2e/community.e2e.ts`

- [ ] Reuse messaging grouping and bubble primitives where appropriate, but use Community APIs, space headers, public-to-space sender identity, report actions, and group read semantics.
- [ ] Provide space list, unread state, thread pagination, compose, optimistic post, retry, reported/hidden placeholders, and toggle-disabled state.
- [ ] Do not render recipient pickers, private-conversation routes, participant-only topics, or any student DM affordance.
- [ ] Verify 320pt, keyboard, safe area, 200% font, screen reader, reduced motion, and offline reconnect.

**Acceptance:** Community feels conversational on mobile while remaining visibly a moderated group space.

**Rollback:** Disable Community via the server toggle.

### Task 23: ACE-C23 - Build Community administration and moderation UI

**Branch:** `feat/ace-community-admin`

**Files:**
- Create: `apps/admin/app/community/page.tsx`
- Create: `apps/admin/app/community/community-admin.tsx`
- Create: `apps/admin/app/community/moderation-queue.tsx`
- Test: `apps/admin/e2e/community-moderation.spec.ts`

- [ ] Build enablement status, derived spaces, read-only preview, moderation queue, hide/restore, author restriction, and escalation actions.
- [ ] Show permission-specific actions and safe summaries; never include safeguarding case notes.
- [ ] Add keyboard, focus, screen-reader, empty queue, revoked permission, and concurrent moderation tests.

**Acceptance:** Authorised staff can govern Community without seeing or creating student private messaging.

**Rollback:** Hide administration after setting Community disabled.

### Task 24: ACE-C24 - Add core notification orchestration

**Branch:** `feat/ace-core-notification-orchestration`

**Files:**
- Create: `apps/workers/src/notifications/ace-core-notification.job.ts`
- Create: `packages/platform/src/notifications/ace-notification-policy.ts`
- Test: `apps/workers/src/notifications/ace-core-notification.job.spec.ts`

- [ ] Cover homework, Faith publication, slip publication/reminder, report publication, and Community moderation outcomes.
- [ ] Test preference, quiet hours, audience replacement, duplicate outbox record, removed relationship, disabled Community, and generic lock-screen copy.
- [ ] Link to an authenticated route, never a permanent storage URL.

**Acceptance:** Core events produce one preference-aware, content-safe notification per recipient/channel.

**Rollback:** Pause the unified worker and use in-app refresh only.

### Task 25: ACE-C25 - Complete safeguarding, retention, export, and deletion hardening

**Branch:** `security/ace-core-data-lifecycle`

**Files:**
- Create: `apps/api/src/ace-foundation/tests/ace-core-retention.e2e.spec.ts`
- Create: `apps/api/src/ace-foundation/tests/ace-core-export.e2e.spec.ts`
- Create: `docs/runbooks/ace-core-data-lifecycle.md`
- Modify: `apps/workers/src/retention/retention.service.ts`

- [ ] Document retention and lawful deletion behaviour for evidence, reflections, slips, reports, Community content, audits, and generated PDFs.
- [ ] Test export isolation, deleted identity pseudonymisation, legal hold, child relationship end, storage-object cleanup, and audit preservation.
- [ ] Verify safeguarding-linked records cannot be silently deleted by ordinary content actions.
- [ ] Add dry-run, count, duration, failure, and retry observability to retention jobs.

**Acceptance:** ACE core data has tested export, retention, deletion, and legal-hold behaviour.

**Rollback:** Keep retention in dry-run mode until counts and policies are approved.

### Task 26: ACE-C26 - Run the combined ACE core release gate

**Branch:** `test/ace-core-release-gate`

**Files:**
- Create: `apps/api/src/ace-foundation/tests/ace-core-access-matrix.e2e.spec.ts`
- Create: `apps/admin/e2e/ace-core-journey.spec.ts`
- Create: `apps/mobile/e2e/ace-core-journey.e2e.ts`
- Create: `docs/evidence/ace-core-release-gate.md`

- [ ] Exercise academic setup, PACE, behaviour, attendance, messaging, homework, Faith, slips, reports, site reporting, and enabled/disabled Community.
- [ ] Run the role, permission, tenant, child relationship, release, feature, RLS, storage, and realtime access matrices.
- [ ] Include correction, concurrent write, offline/retry, idempotency, revoked access, and notification replay cases.
- [ ] Run accessibility and visual baselines on all target web/mobile sizes.
- [ ] Record command, commit, environment, fixture, result, owner, exception, and follow-up for every gate.

**Acceptance:** ACE core has reproducible evidence that each confirmed feature works together without an add-on dependency.

**Rollback:** Keep ACE capability disabled for pilot organisations until all release blockers pass.

## Completion Evidence

- ACE receives homework/evidence without a Learning charge.
- Published Faith content, permission-slip wording, consent, reports, and PDFs are version-bound and reproducible.
- Family/student reads pass relationship and release checks.
- Site reporting is operational and site-scoped.
- Community is fail-closed, moderated, fully reportable, and contains no student direct messaging.
- Private storage, RLS, retention, export, accessibility, and notification gates pass.
