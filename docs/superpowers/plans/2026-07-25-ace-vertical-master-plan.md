# NexSteps ACE Vertical Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the confirmed NexSteps ACE core and each ACE-specific commercial add-on through dependency-safe, independently reviewable pull requests.

**Architecture:** Extend the existing NexSteps modular monolith. Keep commercial entitlements, typed staff permissions, record relationships, release policy, and PostgreSQL RLS as separate fail-closed layers. Port proven Oasis rules, tests, and interaction patterns into NexSteps tenancy, Auth0, NestJS, Prisma, Next.js, and Expo boundaries without importing Oasis authentication, fixed roles, single-centre schema, tRPC, or branding.

**Tech Stack:** pnpm 9, Turborepo, strict TypeScript, Next.js App Router, Expo Router and React Native, NestJS REST, Zod, Prisma 5, PostgreSQL and RLS, private Supabase Storage, Supabase Realtime private broadcast channels, Auth0, Stripe, Resend, Jest, Playwright, and the existing worker app.

## Global Constraints

- `docs/NexSteps-ACE-Vertical-Build-Plan.md` is the product and architecture source of truth.
- `docs/ADDON_PRICING.md` is the commercial source of truth. Its Clubs, Child Merit Market, and All Included bundle additions are sourced from the local `master` checkout at commit `da8ede839da471af5e19ce24a295ddb7628e52f6`, pricing patch ID `cf58a74e3ab6e8a14c4f90c41f1c0e8481a59617`.
- Proposed prices may be displayed as proposed planning values, but no Stripe Product or Price may be created until the relevant row is approved.
- ACE core includes PACE, behaviour, homework/evidence, Faith Corner, site reporting, trips and permission slips, and toggleable Student Community. None is a separately billed ACE add-on.
- Attendance, mobile access, parent/staff messaging, notices, safeguarding, configurable roles, and typed permissions are platform core.
- Finance, Clubs, Child Merit Market, and Advanced Reporting remain separate entitlements.
- Clubs is £12/month or £120/year proposed, global, included for `Vertical.CLUB`, and eligible for Operations and All Included bundles.
- Child Merit Market is £19/month or £190/year proposed, ACE-only, included in the All Included bundle only for ACE organisations, and blocked from launch until market-data licensing is accepted.
- Finance is £15/month or £150/year proposed. Advanced Reporting is £10/month or £100/year proposed.
- Growth and Professional already include Finance and Advanced Reporting. Included modules must never be charged again.
- Learning is £19/month or £190/year proposed for non-ACE customers. ACE must receive the confirmed homework/evidence capability subset through its vertical without a duplicate Learning charge.
- Student-to-student direct messaging is excluded. Student Community is moderated group content, not private messaging.
- Messaging must reproduce the iMessage text-conversation interaction model, especially on mobile, while using NexSteps typography, colour tokens, terminology, icons, and organisation branding.
- The iMessage requirement does not add unapproved payments, games, audio messages, reactions, message editing, or student DMs.
- Every new site-scoped row stores `tenantId`; child-scoped rows also store `childId`.
- Every migration includes indexes, RLS enable/force policy, strict RLS assertions, rollback or forward mitigation, retention behaviour, and migration smoke coverage.
- Sensitive reads, overrides, role changes, report publication, consent, invoice changes, and merit ledger actions are audited.
- Controllers stay thin. Deterministic ACE, finance, and merit rules stay outside controllers and React components.
- No production deployment is authorised by these plans.

---

## 1. Source precedence

When sources conflict, apply this order:

1. The latest explicit product-owner instruction in the implementation task.
2. `docs/ADDON_PRICING.md` for prices, billing status, plan inclusion, vertical inclusion, and bundles.
3. `docs/NexSteps-ACE-Vertical-Build-Plan.md` for ACE core scope, add-on scope, security, data, and release boundaries.
4. This plan set for PR order, file boundaries, interfaces, tests, and rollback.
5. Current NexSteps code for established implementation patterns.
6. Oasis as a read-only behavioural and UX reference.

Do not use an Oasis constant, old test fixture, marketing fallback, or Stripe dashboard value to override either governing document.

## 2. Plan set

The plan set contains 150 reviewer-sized implementation PRs: 88 ACE/platform-core PRs, 53 add-on PRs, and 9 pilot/launch PRs.

| Order | Plan | PR range | Independently testable result |
| --- | --- | --- | --- |
| 1 | [`2026-07-25-ace-core-foundation-access.md`](2026-07-25-ace-core-foundation-access.md) | `ACE-F01` to `ACE-F22` | Typed permissions, tenant-safe ACE schemas, identities, messaging persistence, and strict RLS. |
| 2 | [`2026-07-25-ace-core-daily-operations.md`](2026-07-25-ace-core-daily-operations.md) | `ACE-O01` to `ACE-O20` | Academic setup, PACE, behaviour, Late attendance, dashboards, and daily staff mobile workflows. |
| 3 | [`2026-07-25-ace-core-family-messaging.md`](2026-07-25-ace-core-family-messaging.md) | `ACE-M01` to `ACE-M20` | Parent/staff messaging, iMessage-style mobile UX, notices, identity, family/student facades, and release checks. |
| 4 | [`2026-07-25-ace-core-learning-faith-trips-reports-community.md`](2026-07-25-ace-core-learning-faith-trips-reports-community.md) | `ACE-C01` to `ACE-C26` | Homework/evidence, Faith, trips/slips, frozen reports, site reporting, Community, and safeguarding integration. |
| 5 | [`2026-07-25-ace-addon-finance.md`](2026-07-25-ace-addon-finance.md) | `ACE-FIN01` to `ACE-FIN13` | Family invoices, manual payment allocation, documents, family views, reports, entitlement, and approved pricing integration. |
| 6 | [`2026-07-25-ace-addon-clubs.md`](2026-07-25-ace-addon-clubs.md) | `ACE-CLB01` to `ACE-CLB12` | Clubs management, signup, rosters, sessions, attendance, notices, scoped leads, mobile, and billing. |
| 7 | [`2026-07-25-ace-addon-child-merit-market.md`](2026-07-25-ace-addon-child-merit-market.md) | `ACE-MER01` to `ACE-MER20` | Balanced merit ledger, wallet, savings, giving/tithe, shop, simulated market, leaderboards, reconciliation, and billing. |
| 8 | [`2026-07-25-ace-addon-advanced-reporting.md`](2026-07-25-ace-addon-advanced-reporting.md) | `ACE-AR01` to `ACE-AR08` | Privacy-safe cross-site ACE metrics, exports, dashboards, performance, entitlement, and billing. |
| 9 | [`2026-07-25-ace-pilot-launch.md`](2026-07-25-ace-pilot-launch.md) | `ACE-L01` to `ACE-L09` | Migration rehearsal, UAT, restore, security, accessibility, operations, staged enablement, and release evidence. |

Core plans may proceed in parallel only where their dependency declarations permit. No add-on blocks ACE core launch.

## 3. Dependency spine

```text
ACE-F01 source and decision lock
  -> ACE-F02 typed capability registry
  -> ACE-F03 permission metadata registry
  -> ACE-F04..F11 configurable access control
  -> ACE-F12..F22 tenant-safe ACE schemas and RLS

ACE-F22
  -> ACE-O daily staff operations
  -> ACE-M family, messaging, notices, and identity

ACE-O + ACE-M
  -> ACE-C learning, Faith, trips, reports, Community, safeguarding
  -> ACE-L pilot and launch

ACE-F22 + relevant core domain
  -> Finance
  -> Clubs
  -> Child Merit Market

ACE-C site reporting
  -> Advanced Reporting
```

The following are release blockers:

- typed capabilities and permissions;
- last-head and self-lockout protection;
- student identity and guardian relationship enforcement;
- strict RLS coverage;
- immutable report and consent versions;
- message participant checks and realtime channel authorisation;
- balanced merit ledger and idempotency;
- approved commercial status before Stripe Price creation.

## 4. ACE core traceability

| Confirmed core outcome | Primary PRs | Release proof |
| --- | --- | --- |
| Commercial entitlement separated from configurable access | `ACE-F01` to `ACE-F14` | Unknown capability compile failure, access matrix, shadow cutover, last-head/self-lockout tests. |
| Academic calendar, subjects, and enrolment | `ACE-F15`, `ACE-O05` to `ACE-O08` | Period/enrolment constraints, roster reads, tenant/site/child RLS. |
| PACE rules, assessment, progress, corrections, and staff UX | `ACE-F16`, `ACE-O01` to `ACE-O03`, `ACE-O09` to `ACE-O13` | Ported Oasis boundary tests, immutable facts, deterministic projection, web/mobile journeys. |
| Behaviour, demerit stages, corrections, and escalation | `ACE-F16`, `ACE-O04`, `ACE-O14` to `ACE-O17` | Deterministic stage policy, correction links, notification idempotency, admin/mobile journeys. |
| Present, Absent, and Late attendance | `ACE-O18` to `ACE-O20` | Status migration, roster write/read, dashboard integration, compatibility and RLS tests. |
| Parent/staff messaging with iMessage-style mobile UX | `ACE-F21`, `ACE-M01` to `ACE-M12` | Participant/IDOR/realtime tests plus target-width, keyboard, scroll-anchor, optimistic-send, retry, and accessibility baselines. |
| Notices and receipts | `ACE-F21`, `ACE-M13`, `ACE-M14` | Frozen audience, scheduling, receipt, guardian relationship, web/mobile journeys. |
| Guardian/student identities and safe portal facades | `ACE-F17`, `ACE-M15` to `ACE-M20` | Auth-plus-relationship matrix, release policy, student-self denial suite, web/mobile shell and security gates. |
| Homework and evidence as ACE core | `ACE-C01` to `ACE-C05` | ACE-without-Learning entitlement test, private evidence, review/release, staff/student/family journeys. |
| Faith Corner | `ACE-F18`, `ACE-C06` to `ACE-C08` | Versioned content, explicit reflection visibility, terminology, moderation, web/mobile journeys. |
| Trips and permission slips | `ACE-F19`, `ACE-C09` to `ACE-C12` | Frozen wording/version hash, reconsent, relationship-safe responses, exception audit, reminders. |
| Frozen student reports and private PDFs | `ACE-F18`, `ACE-C13` to `ACE-C16` | Deterministic compilation, maker/checker policy, immutable publication, private document access. |
| ACE site reporting | `ACE-C17`, `ACE-C18` | Documented site metrics, correction handling, accessible dashboard, cross-site denial. |
| Toggleable moderated Student Community | `ACE-F20`, `ACE-C19` to `ACE-C23` | Fail-closed toggle, derived membership, moderation/safeguarding bridge, no-student-DM proof. |
| Safeguarding, lifecycle, notifications, and combined core readiness | `ACE-C24` to `ACE-C26`, `ACE-L01` to `ACE-L09` | Outbox replay, retention/export, RLS/IDOR, UAT, migration, security, accessibility, load, restore, and staged pilot evidence. |

## 5. Pricing and packaging matrix

| Product | Monthly | Annual | Status | Inclusion and bundle rule |
| --- | ---: | ---: | --- | --- |
| Finance | £15 | £150 | Proposed | Included in Growth and Professional; eligible for Operations and All Included. |
| Clubs | £12 | £120 | Proposed | Included for `Vertical.CLUB`; eligible for Operations and All Included. |
| Child Merit Market | £19 | £190 | Proposed | ACE-only; All Included grants it only to ACE organisations. |
| Advanced Reporting | £10 | £100 | Proposed | Included in Growth and Professional; eligible for Operations and All Included. |
| Operations bundle | £39 | £390 | Proposed | Any four eligible operations modules; plan-included modules do not consume a slot. |
| All Included bundle | £79 | £790 | Proposed | Every non-AI module plus 1TB; block smaller storage packs; filter Merit by ACE applicability. |

Every add-on plan starts with a commercial-status test. If the catalogue row remains Proposed, feature work may merge behind inactive entitlements, but the Stripe creation PR remains blocked.

## 6. Oasis reference baseline

Reference checkout:

```text
/Users/JeanFidele/The Nexus Ecosystem/Projects/oasis-portal
commit f31ec65
```

The checkout is dirty and must remain read-only. Before implementation, record `git status --short` and use path-level review. When a dirty file affects a target workflow, compare `git show f31ec65:<path>` with the working copy and record which behaviour the PR adopts.

### Reuse matrix

| NexSteps workstream | Oasis reference | Port | Reject or replace |
| --- | --- | --- | --- |
| PACE | `packages/domain/src/subjects.ts`, `apps/api/src/routers/pace.ts`, `apps/api/src/__tests__/pace.router.test.ts`, `apps/web/src/components/pace/`, `apps/mobile/src/components/staff/staff-pace-*` | PACE interpretation, validation, daily limits, warnings, approvals, workflow sequencing, tests. | tRPC, single-centre queries, fixed roles, Oasis components and colours. |
| Behaviour | `apps/api/src/routers/behaviour.ts`, `apps/api/src/__tests__/behaviour.router.test.ts`, `apps/web/src/components/behaviour/`, `apps/mobile/src/components/staff/staff-behaviour-*` | Merit/Demerit/General rules, visibility, stage policy, mobile capture flow. | Role-name checks, global categories, safeguarding detail duplication. |
| Attendance | `packages/domain/src/attendance.ts`, `apps/api/src/routers/attendance.ts`, domain/router tests, mobile attendance components | Present/Absent/Late calculation and roster interactions. | Single-centre keys and unaudited overwrite semantics. |
| Messaging | `apps/api/src/routers/message.ts`, message router tests, `apps/mobile/src/components/messages/`, `apps/web/src/components/messages/` | Participants, conversation grouping, unread/read receipts, recipient selection, notification tests. | `StudentDirect`, Clerk/tRPC, Oasis schema, current visual treatment. Rebuild the mobile UI to the NexSteps iMessage specification. |
| Homework/evidence | `apps/api/src/routers/homework.ts`, router tests, homework storage service, web/mobile homework components | Assignment/submission states, images/evidence validation, student workflow tests. | Duplicate subject model, Oasis storage keys, automatic merit coupling in core. |
| Faith | `apps/api/src/routers/faithCorner.ts`, `apps/api/src/services/faith-corner.ts`, tests, Faith web/mobile components | Publish/read/reflection concepts and moderation tests. | Oasis-specific copy, likes unless approved by the ACE plan, fixed roles. |
| Trips/slips | `packages/domain/src/permissionSlips.ts`, `apps/api/src/routers/permissionSlip.ts`, tests, parent/admin/mobile components | Form validation, recipient workflow, parent response, physical exception interactions. | Mutable wording, supplied-child trust, payment coupling to core slips. |
| Reports | `packages/domain/src/report.ts`, `apps/api/src/routers/report.ts`, tests, report web components | Term ranges, compile/review flow, parent-safe formatting tests. | Mutable sent reports, database PDF blobs, single-centre access. |
| Community | `apps/api/src/routers/community.ts`, tests, student Community mobile components | Group feed interaction, membership/read behaviour, mobile conversation patterns. | Direct student DMs, ungated public groups, missing organisation toggle. |
| Finance | `packages/domain/src/invoice.ts`, invoice router/tests, PDF service, invoice web/mobile components | Fee cycles, discounts, totals, allocation states, PDF interaction tests. | NexSteps subscription billing reuse, encrypted PDF bytes in Postgres. |
| Clubs | `packages/domain/src/clubs.ts`, club router/tests, club management and mobile components | Capacity, signup, roster, session attendance, lead assignment, notices. | Reusing class `Group`, single-centre scope, fixed lead roles. |
| Merit | `packages/domain/src/meritLedger.ts`, `tithe.ts`, `shop.ts`, related routers/tests and mobile components | Balanced postings, idempotency, tithe, reservations, stock, simulated market tests. | Treating merit as money, provider lock-in, negative leaderboards. |
| Access tags | `packages/domain/src/rbac.ts` and access tests | User-friendly permission-tag presentation and test cases. | Customer-created keys, fixed role names, tags that activate paid modules. |

## 7. Messaging experience contract

The detailed task breakdown lives in the family and messaging plan. These requirements are non-negotiable:

- Inbox geometry follows iMessage: large title, compose action, search, circular identity mark, name, one-line preview, trailing timestamp, and unread dot.
- Conversation geometry follows iMessage: compact identity header, grouped leading/trailing bubbles, tails only on the final bubble in a group, date separators, and delivery/read state only beneath the latest relevant outbound message.
- The composer is pinned above the keyboard and safe area, uses an auto-growing rounded text capsule, and exposes a circular upward-arrow send action only when trimmed text is non-empty.
- Use NexSteps Nunito for headings, Quicksand for message copy, organisation logo/avatar rules, and approved mobile tokens.
- Outgoing bubble colour must be a contrast-tested NexSteps message token; incoming bubbles use a neutral token. Do not copy Apple's blue or proprietary artwork.
- Use `FlatList` with stable cursors and `maintainVisibleContentPosition`; preserve scroll position when loading older messages.
- Sending is optimistic with a client-generated idempotency key and visible sending, sent, delivered, failed, and read states. A failed bubble can retry without duplication.
- Foreground updates use private Supabase Realtime metadata broadcasts. Plaintext message bodies are never broadcast; clients refetch authorised API data.
- Typing indicators are ephemeral, expire automatically, and never persist.
- Drafts are stored per user and conversation in device-local secure application storage.
- VoiceOver, TalkBack, Dynamic Type, reduced motion, 44-point targets, keyboard navigation on web, and non-colour unread/read cues are required.
- Mobile screenshot and interaction baselines cover 320, 375, 390, and 430-point widths, iOS and Android safe areas, visible keyboard, 200% font scale, and light/dark system settings where the app supports them.

## 8. Shared interfaces

These names are stable across the plan set:

```ts
export const CAPABILITY_DEFINITIONS = {
  // key -> metadata
} as const satisfies Record<string, CapabilityDefinition>;

export type Capability = keyof typeof CAPABILITY_DEFINITIONS;
export type PermissionKey = Capability;

export interface AccessDecision {
  allowed: boolean;
  reason:
    | "allowed"
    | "no-membership"
    | "capability-missing"
    | "permission-missing"
    | "feature-disabled"
    | "relationship-denied"
    | "release-denied"
    | "tenant-denied";
  sourceRoleIds: string[];
}

export interface CommandMeta {
  actorUserId: string;
  orgId: string;
  tenantId: string;
  requestId: string;
  idempotencyKey?: string;
}
```

REST errors use:

```ts
export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}
```

No task may create a second capability resolver, relationship resolver, audit writer, outbox, or storage proxy.

## 9. Per-PR completion contract

Every implementation PR must include:

- one independently testable behaviour;
- failing test evidence before implementation;
- exact capability, permission, relationship, feature-toggle, release, and RLS rules for each route;
- no unrelated cleanup;
- migration, RLS, encryption, index, retention, and rollback coverage where data changes;
- loading, empty, error, success, retry, and disabled states where UI changes;
- audit and observability for sensitive actions;
- updated plan checkboxes and decision notes;
- `graphify update .` after code or documentation changes.

Required baseline commands:

```bash
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm --filter @pathway/api build
pnpm --filter @pathway/admin build
pnpm --filter @pathway/web build
pnpm --filter @pathway/mobile typecheck
pnpm --filter @pathway/mobile lint
pnpm supabase:rls:check -- --strict
graphify update .
```

Run focused commands first, then the relevant package build, then the repository gates. A PR may omit an unrelated expensive command only when its plan task says so and the PR records why.

## 10. Branch and commit convention

Use one branch and one final implementation commit per PR after the TDD loop:

```text
Branch: feat/ace-<workstream>-<short-name>
Commit: feat: <one observable ACE behaviour>
```

Schema-only work may use `feat:` because it enables product behaviour. Documentation-only lock PRs use `docs:`. Security corrections use `security:` if accepted by the repository commit rules; otherwise use `fix:`.

## 11. Completion evidence

The ACE programme is complete only when:

- every PR checkbox in every plan is either merged or explicitly removed through an approved source-document change;
- every governing requirement maps to a merged PR and passing evidence;
- proposed prices used for Stripe have become approved in `ADDON_PRICING.md`;
- core release works with every add-on disabled;
- each add-on independently fails closed when inactive or inapplicable;
- the All Included and Operations bundle rules prevent duplicate entitlement and duplicate charge;
- RLS, IDOR, concurrency, accessibility, performance, restore, and rollback exercises pass;
- Oasis remains unmodified;
- production deployment receives separate human approval.
