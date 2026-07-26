# NexSteps ACE Vertical

*A multi-tenant build plan grounded in the Oasis learning-centre implementation and the current NexSteps SaaS platform*

**Status:** Product scope confirmed; ready for architecture sign-off

**Prepared:** 25 July 2026

**Current phase:** Discovery and packaging complete; access-control design added

**Implementation target:** NexSteps (`pathway`)

**Reference product:** Oasis Learning Centre (`oasis-portal`)

## Confirmed product boundary

ACE core now includes Faith Corner, homework/evidence, reusable trips and permission slips, and an organisation-toggleable Student Community. Finance, Clubs, Merit Market, and cross-site analytics retain clear commercial boundaries. Configurable roles and permission tags become platform core.

---

# 1. Executive Summary

Oasis is a broad single-centre implementation of ACE operations. NexSteps is the public multi-tenant SaaS and already owns the correct foundations: organisations and sites, vertical and module entitlements, capability guards, Stripe provisioning, Auth0, Next.js admin, Expo mobile, NestJS, Prisma/Postgres, private storage, and scheduled workers. The right approach is to rebuild the proven Oasis workflows within NexSteps boundaries. Port business rules, test cases, and useful interaction patterns; do not copy the single-centre schema, Clerk authentication, fixed roles, tRPC routers, or Oasis branding.

## Confirmed product boundary

**The ACE_SCHOOL vertical includes:**

- academic years/terms, subjects, student subject placement, starting/current PACE.

- Self Test and PACE Test capture, completion, progression, daily limits, warnings, blocks, corrections, and authorised overrides.

- character and behaviour capture: Merit, Demerit, General, General/Sensitive visibility, configurable categories, and staged demerit response.

- core operational dashboards, reviewed term reports, frozen parent-safe snapshots, and site-level reporting.

- parent linked-child and student self-only experiences.

- homework, activities, evidence, and PACE-linked assignments using the existing Learning foundation.

- Faith Corner: scripture/memory verse, reflection prompts, publishing, and read state.

- trips, events, permission slips, consent responses, and audited exceptions as reusable core school features.

- Student Community as an included optional ACE component that the organisation head can disable.

**Platform core:**

- Present/Absent/Late attendance.

- native mobile access.

- parent/staff messaging and notices.

- safeguarding and incident workflows.

- configurable organisation/site roles and permission tags for every organisation.

**Commercial add-ons:**

- FINANCE: family invoices, discounts, PDF statements, payment states, allocations, and reports.

- CLUBS: clubs, signups, rosters, sessions, attendance, notices, and scoped club leads.

- CHILD_MERIT_MARKET: one confirmed bundle containing wallet/ledger, saving, giving/tithe, Merit Shop, simulated investments, and positive leaderboards.

- ADVANCED_REPORTING: cross-site ACE analytics and benchmarking.

## Key architecture decision

**Commercial entitlements and staff permissions must remain separate:**

```text
OrgVertical + active OrgModule records
↓
organisation capabilities
↓
typed permission registry + custom role assignments
↓
record relationship + release policy + tenant policy
↓
allow
```

An organisation head may create a custom role and attach approved permission tags, but cannot create permission keys, activate a paid module, bypass a parent-child relationship, or grant a permission they do not hold.

## Delivery estimate

- architecture lock and security preflight: 1–2 weeks.

- platform configurable roles/permission tags: 3–5 weeks, reusable across all verticals.

- ACE data foundation and daily staff workflows: 5–7 weeks.

- ACE family, reporting, homework/evidence, Faith, trips/slips, and Community: 5–7 weeks.

- Finance family invoicing: 4–6 additional weeks.

- Clubs: 4–6 additional weeks.

- Child Merit Market: 8–12 additional weeks.

- pilot, migration rehearsal, security review, and launch: 2–4 weeks.

A sequential full programme is approximately 33–47 weeks. Parallel work reduces elapsed time, but access control, capability typing, student identity, and the tenant-safe data model remain critical path.

# 2. Requirements and Scope

## 2.1 Users

- organisation owner/head and organisation administrator.

- site head/administrator.

- supervisor, teacher, and staff member.

- safeguarding lead/head of discipline.

- parent/guardian linked to one or more children.

- student linked to exactly one active child identity.

- finance operator.

- club administrator and scoped club lead.

- Merit Market/shop operator.

- NexSteps support, without automatic tenant child-data access.

## 2.2 Core jobs to be done

1. A centre configures its academic calendar, subjects, PACE rules, behaviour rules, and ACE feature settings.

2. Staff enrol a child in subjects and record starting/current PACE.

3. Staff record attendance, Self Tests, PACE Tests, homework/evidence, and behaviour quickly on web or mobile.

4. The server enforces progression and daily testing rules consistently.

5. Leaders see learners who are behind, blocked, absent, or escalating.

6. Leaders compile, review, approve, freeze, and publish term reports.

7. Parents see only linked-child, released information and respond to permission slips.

8. Students see only self-safe information and permitted Community/Faith content.

9. Organisation heads create and assign custom roles from approved permission tags.

10. Every sensitive read and material write is attributable, tenant-scoped, and auditable.

## 2.3 Confirmed packaging

| Product area | Packaging | Boundary |
| --- | --- | --- |
| ACE setup and PACE progress | ACE core | Defining ACE workflow. |
| Behaviour/Merit/Demerit capture | ACE core | Behaviour facts are core; economy balances are not. |
| Homework, activities, evidence | ACE core | Extend Learning; do not duplicate subjects/evidence. |
| Faith Corner | ACE core | Bounded publishing, reflection, and read-state V1. |
| Trips/events/permission slips | Core school capability, granted to ACE | Reusable by future school verticals. |
| Student Community | Included optional ACE component | No separate charge; org head can disable it. |
| Site-level ACE dashboards/reports | ACE core | Daily operation and family reporting. |
| Multi-site ACE analytics | ADVANCED_REPORTING | Cross-site analytics and benchmarking. |
| Attendance, mobile, messaging, safeguarding | Platform core | Shared by all relevant verticals. |
| Configurable roles and permission tags | Platform core | Available to all organisations. |
| Family invoices | FINANCE | Separate from NexSteps subscription billing. |
| Clubs | CLUBS | Paid reusable add-on. |
| Child Merit Market | CHILD_MERIT_MARKET | One paid merit-economy bundle. |

## 2.4 First-release exclusions

- real-money investments, brokerage, investment advice, crypto, CFDs, options, or FX.

- direct student-to-student private messages.

- student-created public Community spaces.

- customer-created permission keys, wildcard permissions, or executable authorisation rules.

- customer-defined workflow builders.

- automated bank reconciliation, full general ledger, payroll.

- live market data without confirmed licensing and educational-use terms.

- automatic production migration from Oasis before separate migration discovery.

- rebranding all @pathway/* package names.

## 2.5 Controlled-release success criteria

- an ACE organisation can be provisioned through the existing vertical/module engine.

- a non-ACE organisation cannot see or call ACE functionality.

- an organisation head can create, assign, revise, and retire a custom role safely.

- custom roles cannot manufacture a capability or bypass relationship rules.

- staff can complete daily attendance, behaviour, PACE, homework/evidence, trip/slip, and Faith workflows.

- Student Community can be disabled with UI/API fail-closed behaviour.

- parents and students see only authorised released data.

- published reports and consent wording are versioned and immutable.

- all new tables pass tenant-isolation/RLS tests.

- sensitive reads, overrides, report publication, consent, role changes, invoice changes, and ledger actions are audited.

- typecheck, lint, unit, integration, RLS, build, accessibility, and critical E2E checks pass.

# 3. Current-State and Gap Analysis

## 3.1 Reuse from NexSteps

| Existing capability | Decision | Extension |
| --- | --- | --- |
| Organisation/site tenancy | Reuse | Put tenantId directly on every site-scoped ACE row. |
| OrgVertical, OrgModule, ModuleStatus | Reuse | Add only real commercial modules; do not build another profile system. |
| Capability resolver and guard | Reuse/strengthen | Replace Capability = string with a typed registry and exhaustive maps. |

| Existing capability | Decision | Extension |
| --- | --- | --- |
| Children, contacts, guardian links | Reuse | Add student identity and strict release queries. |
| Groups/classes | Reuse | Do not misuse Groups as Clubs or Community spaces. |
| Sessions, rota, swaps | Reuse | Surface relevant data in ACE dashboards/mobile. |
| Attendance | Extend | Replace Boolean presence with a status enum and audited corrections. |
| Concerns and notes | Reuse carefully | Keep safeguarding separate from behaviour and Community moderation. |
| Announcements | Extend | Add audiences, read receipts, family/student views. |
| Learning module | Reuse/evolve | ACE grants subject/evidence/report capabilities and adds PACE-specific facts. |
| Private storage proxy | Reuse | Reports, evidence, invoices, and sensitive attachments stay private. |
| Stripe organisation billing | Reuse | Provision add-on modules; family billing stays a separate domain. |
| Auth0/NextAuth | Reuse | Add student persona and privileged-action step-up. |

## 3.2 Port from Oasis as rules and tests

- PACE number/level interpretation.

- Self Test and PACE Test validation.

- daily limits, same-PACE same-day rules, thresholds, blocks, warnings, and overrides.

- Present/Absent/Late calculations.

- Merit/Demerit/General entries and General/Sensitive visibility.

- demerit escalation and head-review rules.

- frozen term-report snapshot behaviour.

- linked-parent and self-only student policies.

- append-only merit ledger, balanced postings, idempotency, tithe/saving/giving, shop reservations, and simulated market rules.

- club signup, lead assignment, roster, attendance, and notices.

- invoice fee cycles, proration, discounts, statuses, and documents.

- trip and permission-slip parent-safe release patterns.

- the useful role-plus-tag concept from packages/domain/src/rbac.ts.

## 3.3 Do not copy from Oasis

- single-centre rows without tenantId.

- fixed Oasis role names as global NexSteps roles.

- User.tags String[] as the final multi-tenant authorisation store.

- Clerk authentication and tRPC routers.

- encrypted PDF bytes in Postgres.

- Oasis-specific UI routes, brand, and policy constants.

- provider-specific market implementation before licensing is confirmed.

## 3.4 Critical gaps in NexSteps

- ACE_SCHOOL exists but the PACE domain does not.

- capability keys are currently strings.

- fixed OrgRole, SiteRole, UserOrgRole, and UserTenantRole checks cannot safely express customer-defined roles.

- no student persona/identity.

- attendance is Boolean.

- parent/mobile shells are incomplete.

- report bundles are CSV-oriented rather than reviewed frozen term reports.

- audit coverage is narrow.

- current deployment notes identify incomplete RLS coverage; ACE cannot launch with that exception.

# 4. Stack Recommendation and Rationale

## 4.1 Recommended stack

- monorepo: existing pnpm + Turborepo.

- admin: Next.js App Router + React + strict TypeScript.

- mobile: Expo Router + React Native.

- API: NestJS with Zod boundary validation.

- database: PostgreSQL via Prisma.

- storage: private Supabase Storage through API-authorised access.

- authentication: existing Auth0/NextAuth.

- billing: Stripe for NexSteps plans/modules.

- email: Resend.

- workers: existing worker app/GitHub scheduled jobs initially.

- hosting: current Vercel projects and Supabase region.

- observability: structured logs, error tracking, request/trace IDs.

This preserves the production architecture, team skills, configurator, entitlement flow, and shared mobile app. Do not create a separate ACE service until scale or team ownership justifies the deployment and consistency cost.

## 4.2 Domain packages

**Add packages/ace-domain for deterministic rules:**

- PACE numbering/progression.

- test threshold/limit evaluation.

- demerit stage evaluation.

- report snapshot validation.

- permission-slip version/re-consent rules.

Add packages/finance-domain only when Finance implementation starts. Merit-ledger rules may live in a focused package or the API module, provided API and workers share one implementation. Keep database access and NestJS services out of pure rule packages.

## 4.3 Alternatives

- all rules in NestJS services: faster initially, but workers and UI validation duplicate high-risk logic.

- separate ACE microservice: stronger physical boundary, but premature deployment, auth, observability, and transaction complexity.

# 5. Product, Capability, and Access Architecture

## 5.1 Product layers

```text
NexSteps Core Platform
├── People, family links, attendance, rota, safeguarding, messaging
├── Mobile/parent foundations, audit, storage, role administration
├── Typed permission registry and effective-permission resolver
└── Vertical/module capability resolver
│
├── ACE_SCHOOL
│ ├── setup, PACE, behaviour, reports
│ ├── homework/evidence and Faith Corner
│ ├── trips and permission slips
│ └── Student Community (included, org-toggleable)
├── FINANCE
├── CLUBS
├── CHILD_MERIT_MARKET
└── ADVANCED_REPORTING
```

## 5.2 Capability registry

**Representative ACE/core-school keys:**

```text
ace.settings.read ace.settings.manage
ace.pace.read ace.pace.record
ace.pace.correct ace.pace.override
ace.behaviour.read ace.behaviour.record
ace.behaviour.sensitive.read ace.behaviour.policy.manage
ace.reports.read ace.reports.compile
ace.reports.review ace.reports.publish
ace.parent.progress.read ace.student.self.read
ace.faith.read ace.faith.publish
ace.faith.manage ace.community.read
ace.community.post ace.community.moderate
school.trips.read school.trips.manage
school.permission_slips.read school.permission_slips.manage
school.permission_slips.respond
```

**Existing Learning keys required by ACE:**

```text
learning.log.read learning.log.write
learning.evidence.read learning.evidence.write
learning.reports.generate
```

**Add-on keys:**

```text
clubs.read clubs.manage
clubs.signup.manage clubs.attendance.record
clubs.leads.manage
finance.family_invoices.read finance.family_invoices.manage
finance.family_payments.record finance.family_reports.read
merit.wallet.read merit.wallet.adjust
merit.wallet.transfer merit.tithe.manage
merit.shop.read merit.shop.manage
merit.shop.purchase merit.market.read
merit.market.trade merit.leaderboards.read
advanced_reporting.ace.multisite.read
```

Replace Capability = string with a const registry and derived union. Make vertical/module maps exhaustive. CI must fail if a controller, route, navigation item, or role permission references an unknown key.

## 5.3 Configurable roles and tags

**Use four separate concepts:**

1. Capability: commercial/vertical entitlement; customer cannot create it.

2. Permission definition: platform-owned typed key with label, description, scope, sensitivity, delegability, and optional required capability.

3. Role definition: organisation-created bundle of permitted definitions, scoped to the organisation or a site.

4. Role assignment: user-to-role link, optionally site-scoped and time-limited.

**Rules:**

- seed protected templates: Organisation Head, Site Lead, Staff, Safeguarding Lead, Finance Operator, Parent, Student.

- org heads can clone, name, edit, retire, and assign custom roles.

- display names and labels never drive access.

- custom roles contain only active registry keys marked delegable.

- actors delegate only permissions they hold.

- required capabilities must be active; a tag cannot activate Finance, Clubs, Merit Market, or Advanced Reporting.

- protected ownership, platform support, and entitlement administration permissions cannot be added to custom roles.

- sensitive grants require step-up authentication and clear warnings.

- prevent removal/downgrade of the last active organisation head.

- prevent same-request self-lockout.

- parent/student permissions remain constrained by relationships.

- club-lead/shop access combines permission with a scoped domain assignment.

- role changes are versioned, audited, and invalidate effective-access caches immediately or within a documented 60-second maximum.

## 5.4 Authorisation formula

```text
authenticated
AND active org/site membership
AND required organisation capability
AND active effective permission
AND enabled included feature, where applicable
AND record relationship/domain assignment
AND release/visibility policy
AND tenant/RLS policy
```

**Examples:**

- ace.parent.progress.read does not bypass the guardian-child link or report publication state.

- ace.student.self.read does not bypass StudentIdentity.

- ace.community.moderate is unusable while Student Community is disabled.

- finance.family_invoices.read is unusable without active Finance.

- clubs.manage plus a ClubLeadAssignment limits a lead to assigned clubs.

# 6. System Architecture and Data Flow

## 6.1 Trust zones

```text
[Untrusted clients]
Admin web | Parent web/mobile | Staff mobile | Student mobile
│ HTTPS + token/session
▼
[NestJS application boundary]
auth → active site → capability → permission → relationship/release
validation → service transaction → audit/outbox
│ │
▼ ▼
[Postgres + RLS] [Private object storage]
│
▼
[Workers]
reports | notifincations | invoices | merit jobs | retention
│
▼
Auth0 | Stripe | Resend | optional licensed market-data provider
```

## 6.2 PACE write flow

1. Staff submits child, subject, date, PACE number, assessment type, and score.

2. API resolves tenant, capability, effective permission, and child membership.

3. domain policy evaluates threshold, daily limit, duplicate/same-PACE rule, and block state.

4. server rejects an invalid command with a machine-readable policy result.

5. authorised override is a separate short-lived record with actor and reason.

6. assessment fact, projection update, audit event, and outbox intent commit together.

7. corrections create linked facts; they never silently overwrite history.

## 6.3 Report flow

1. Leadership requests child + academic period.

2. worker compiles an allow-listed immutable snapshot.

3. reviewer edits narrative fields without changing source facts.

4. approver approves or returns with reason.

5. publish freezes a version, renders a parent-safe PDF, stores it privately, and notifies.

6. later corrections create a new report version.

## 6.4 Permission-slip flow

1. Staff creates a versioned trip/slip and target cohort.

2. publish snapshots child recipients and consent wording and sends notifications.

3. parent access proves a current guardian-child relationship.

4. consent/decline stores wording version, typed-name evidence, timestamp, and audit.

5. staff-entered/physical exceptions require actor and reason.

6. material wording changes create a new version and require re-consent.

## 6.5 Role-change flow

1. org head loads the registry and current role version.

2. UI offers only permissions compatible with actor, scope, and active capabilities.

3. server rechecks everything and performs step-up for sensitive changes.

4. transaction writes role revision/assignment and audit.

5. invalidation event expires cached/session-derived permissions.

6. guard decisions use registry keys; the old fixed-role resolver runs in shadow until migration completes.

## 6.6 Entitlement and feature-toggle flow

- Stripe/configurator continues to provision paid OrgModule records.

- ACE entitlement grants core ACE capabilities.

- OrgFeatureSetting("ace.student_community") controls the included Community component.

- an included toggle cannot activate paid functionality.

- disabling Community hides member navigation and blocks normal reads/writes while retaining governed admin export/retention access.

# 7. Data Model and Storage

## 7.1 Rules

- every site-scoped row has tenantId.

- child rows include both tenantId and childId.

- UTC timestamps; derive local business dates from site IANA timezone.

- integer percentages/basis points and integer pence/merit units.

- append-only facts corrected by compensating records.

- encrypt sensitive free text.

- files live in private object storage.

- every model has retention and deletion behaviour before migration approval.

## 7.2 Access-control models

```text
model PermissionDefinition {
key String @id
label String
description String
scope PermissionScope
sensitivity PermissionSensitivity
delegable Boolean @default(true)
requiredCapability String?
isActive Boolean @default(true)
}
model OrgRoleDefinition {
id String @id @default(uuid())
orgId String
tenantId String?
name String
description String?
scope RoleScope
isSystem Boolean @default(false)
isActive Boolean @default(true)
version Int @default(1)
createdById String
updatedById String
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
permissions OrgRolePermission[]
assignments UserRoleAssignment[]
@@unique([orgId, tenantId, name])
@@index([orgId, tenantId, isActive])
}
model OrgRolePermission {
roleDefinitionId String
permissionKey String
grantedById String
grantedAt DateTime @default(now())
@@id([roleDefinitionId, permissionKey])
}
model UserRoleAssignment {
id String @id @default(uuid())
orgId String
tenantId String?
userId String
roleDefinitionId String
```

```text
assignedById String
startsAt DateTime @default(now())
expiresAt DateTime?
revokedAt DateTime?
revokedById String?
@@index([orgId, userId, revokedAt])
@@index([tenantId, userId, revokedAt])
}
model OrgFeatureSetting {
orgId String
featureKey String
enabled Boolean @default(true)
updatedById String
updatedAt DateTime @updatedAt
@@id([orgId, featureKey])
}
```

Database permission rows are metadata only. Deploy/seed validation must prove every executable key exists in the compile-time registry. Migrate fixed roles into system templates, compare old/new results in shadow mode, then retire role-name checks route by route.

## 7.3 Core ACE models

- AcademicYear, AcademicPeriod.

- StudentSubjectEnrollment: child, subject, starting/current PACE, target, dates, status, actor/reason.

- PaceAssessment: immutable type/score/result/date/actor/override/correction.

- PaceProgress: rebuildable current projection and on-track status.

- PacePolicy, PacePolicyOverride.

- BehaviourEntry, DemeritPolicy, DemeritStageOverride.

- AceTermReport, AceTermReportVersion.

- StudentIdentity, StudentPortalPolicy.

- FaithContent, FaithRefleection, FaithReadReceipt.

- Trip, PermissionSlip, PermissionSlipVersion, PermissionSlipRecipient, PermissionSlipResponse.

- CommunitySpace, CommunityPost, CommunityReport, CommunityModerationAction.

**Key constraints:**

- one active student identity per child/user according to agreed policy.

- unique active child/subject enrollment.

- duplicate PACE prevention without blocking authorised correction.

- published report and consent wording versions immutable.

- no student private-message model in V1.

- Community queries fail closed when disabled.

- safeguarding escalation references the safeguarding record; do not duplicate sensitive details.

## 7.4 Clubs models

Club, ClubMembership/Signup, ClubSession, ClubAttiendance, ClubNotice, ClubLeadAssignment. Do not reuse Group; class membership and optional club membership have different lifecycles and scopes.

## 7.5 Child Merit Market models

- MeritAccount.

- MeritTransaction header with idempotency key/source.

- balanced debit/credit MeritPosting legs.

- MeritPolicy, TithePreference, TitheRun, optional SavingsInterestRun.

- ShopItem, reservations, purchases, stock movements.

- investment instruments, licensed/cached data snapshots, orders, transactions, holding projection.

- LeaderboardSnapshot.

The ledger is authoritative; cached balances are projections. Every transaction must net to zero. Jobs and commands require idempotency.

## 7.6 Finance models

**Keep NexSteps subscription billing separate:**

- FamilyAccount, FamilyInvoice, children/line items/discounts.

- FamilyPayment, allocation, credit note.

- InvoiceDocument, InvoiceEvent, FeeSchedule.

Use integer pence. Issued invoices are immutable except through void/reissue or credit-note flows.

## 7.7 Storage classes

| Asset | Access | Retention |
| --- | --- | --- |
| Learning evidence | Private API proxy | Centre education-record policy. |
| Published reports | Private API proxy | Versioned education record. |
| Invoice PDFs | Private API proxy | Finance retention schedule. |
| Club/Community assets | Private by default | Module/content policy. |
| Shop images | Public/signed; no child data | Item lifecycle. |
| Incident attachments | Strict safeguarding path | Safeguarding policy. |

# 8. API Design

## 8.1 Conventions

- REST in NestJS.

- Zod validation at boundary.

- trusted org/site context, never body-supplied tenancy.

- capability and permission decorators/guards.

- cursor pagination.

- idempotency keys for value/state-sensitive commands.

- consistent error envelope with code, safe message, details, request ID.

## 8.2 Access-control endpoints

```text
GET/POST /access/roles
GET/PATCH /access/roles/:roleId
POST /access/roles/:roleId/clone
PUT /access/roles/:roleId/permissions
POST /access/roles/:roleId/retire
GET /access/permissions
GET/POST /access/assignments
DELETE /access/assignments/:assignmentId
GET /access/users/:userId/effective-permissions
GET /access/users/:userId/access-summary
GET /access/audit
```

Role updates include expected version; stale writes return 409 ROLE_VERSION_CONFLICT. Reject unknown/non-delegable keys, illegal scopes, unavailable capabilities, permissions the actor cannot delegate, final-head removal, and self-lockout.

## 8.3 Core ACE endpoints

```text
GET/PUT /ace/settings
GET/POST /ace/academic-years
GET/POST /ace/students/:childId/subjects
GET /ace/pace/roster
GET /ace/students/:childId/pace
POST /ace/pace/assessments
POST /ace/pace/assessments/:id/corrections
POST /ace/pace/policy-overrides
GET /ace/pace/exceptions
GET/POST /ace/behaviour
POST /ace/behaviour/:id/corrections
GET/PUT /ace/behaviour/policy
GET/POST /ace/reports
POST /ace/reports/:id/submit
POST /ace/reports/:id/approve
POST /ace/reports/:id/publish
GET /ace/reports/:id/download
GET/POST /ace/faith/content
POST /ace/faith/content/:id/publish
POST /ace/faith/content/:id/read
GET/POST /ace/faith/content/:id/reflections
GET/PUT /ace/settings/features/student-community
GET/POST /ace/community/spaces
GET/POST /ace/community/spaces/:spaceId/posts
POST /ace/community/posts/:postId/report
POST /ace/community/posts/:postId/moderate
```

## 8.4 School operations and family/student endpoints

```text
GET/POST /school/trips
GET/PATCH /school/trips/:tripId
GET/POST /school/permission-slips
POST /school/permission-slips/:slipId/publish
GET /school/permission-slips/:slipId/responses
```

```text
GET /family/children
GET /family/children/:childId/ace-summary
GET /family/children/:childId/reports
GET /family/permission-slips
POST /family/permission-slips/:slipId/respond
GET /student/me
GET /student/me/ace-summary
GET /student/me/faith
GET /student/me/community
```

The API derives all parent/student relationships; a supplied childId is never proof.

## 8.5 Add-on endpoints

- Clubs: management, signup, roster, session, attendance, notices, lead assignments, family views.

- Merit: wallet, ledger, transfers, adjustments, tithe, shop items/reservations/purchases, market instruments/orders/portfolio, leaderboards.

- Finance: draft/issue/void/credit invoices, payments/allocations, aged receivables, family invoice views/downloads.

- Advanced Reporting: cross-site ACE metrics through approved aggregate queries only.

# 9. Frontend Plan

## 9.1 Admin information architecture

```text
Dashboard
People
Teaching
ACE Overview
PACE
Homework & Evidence
Behaviour
Faith Corner
Reports
Schedule
Sessions & Rota
Attendance
Trips & Permission Slips
Communication
Notices
Student Community
Safeguarding
Admin
ACE Settings
Roles & Permissions
Billing
```

Clubs, Merit Market, Finance, and multi-site analytics appear only when entitled. Community also requires the organisation feature toggle.

## 9.2 Roles and permissions UI

- template and custom-role list.

- role builder grouped by product area with plain-English labels.

- org/site scope selection.

- capability-aware disabled states.

- sensitivity badges and step-up before high-risk saves.

- assignments, optional expiry, and bulk assignment.

- effective-access preview showing role source, scope, inactive keys, and relationship constraints.

- last-head/self-lockout protection.

- optimistic-concurrency conflict handling.

- searchable/exportable access audit.

The UI may call permissions “tags”, but sends registry keys and never authorises from labels.

## 9.3 Staff mobile

Prioritise Today, Attendance, Behaviour, PACE entry, My Rota, Notices, trips/slip roster, and safeguarding incident capture. Role design, report approval, finance admin, and module catalogue remain web-first.

## 9.4 Parent experience

- linked-child switcher and attention summary.

- attendance, PACE progress, published reports.

- homework/evidence released to family.

- trips and permission slips.

- Faith content released to family.

- notices and student-access settings.

- module cards for Finance, Clubs, and Merit Market.

## 9.5 Student experience

- self-only home, PACE/learning progress, attendance/positive summary.

- released reports and notifications.

- Faith Corner.

- Community only when enabled.

- entitled module destinations.

Never expose sensitive behaviour, other children, staff notes, negative leaderboards, or unmoderated private messaging.

## 9.6 Quality and accessibility

- server validation is authoritative; client validation improves feedback.

- pending/disabled states and duplicate-submit prevention.

- preserve form data after recoverable errors.

- avoid optimistic updates for assessments, consent, invoices, payments, or ledger entries.

- loading, empty, partial, error, success, and retry states.

- WCAG 2.2 AA, semantic headings/landmarks, visible labels, keyboard completion, 44px mobile targets, non-colour status cues, accessible notifications, table/text alternatives for charts.

# 10. Backend Plan

## 10.1 NestJS modules

```text
src/access-control/ registry, roles, assignments, resolver, guards
src/ace-settings/ ACE policy and included feature settings
src/pace/ assessments, progress, policy, overrides
src/behaviour/ behaviour and demerit policy
src/faith/ Faith Corner
src/school-operations/ reusable trips and permission slips
src/community/ included toggleable Community
src/ace-reports/ report workflow and release
src/student-portal/ self-only API
src/family/ linked-child API
src/clubs/ add-on
src/merit/ add-on
src/family-finance/ Finance extension
src/common/outbox/ transactional event dispatch
```

Controllers stay thin. Services own use cases and transactions. Pure domain packages own deterministic rules.

## 10.2 Access-control service

- synchronise registry metadata and seed system roles.

- validate role CRUD and optimistic version.

- validate delegation, scope, capability, feature, sensitivity, and last-head rules.

- resolve permissions across organisation/site assignments.

- return decision explanations without leaking other users’ data.

- invalidate caches/session-derived access.

- shadow-compare fixed-role and effective-permission decisions during migration.

## 10.3 Transaction boundaries

**Single transactions for:**

- assessment + projection + audit/outbox.

- behaviour + merit posting intent.

- report publish + frozen version + notification.

- permission-slip publish + recipient snapshots + notifications.

- role revision/assignment + audit + invalidation event.

- ledger transaction + balanced postings/projection.

- shop purchase + stock + ledger debit.

- invoice issue/payment allocation + status/audit.

## 10.4 Jobs

- reports, notifications, progress digests, role expiry, retention.

- invoice PDFs/reminders/reconciliation.

- merit postings, tithe, optional interest, market refresh, portfolio reconciliation, leaderboards.

GitHub scheduled jobs are acceptable at low volume. Move to a durable queue when near-real-time retries, concurrency, or backlog visibility becomes necessary.

## 10.5 Error taxonomy

Validation, tenant-scoped not found, capability absent, permission absent, permission non-delegable, relationship denied, release denied, feature disabled, role version conflict, last-head protected, policy block, duplicate/conflict, invalid transition, insufficient merit, stock conflict, invoice immutable, provider unavailable.

# 11. Project Folder Structure (Explained)

```text
apps/
admin/
app/ace/ ACE dashboards and workflows
app/school-operations/ trips and permission slips
app/settings/access/ roles, assignments, effective access, audit
app/clubs/ Clubs add-on
app/merit/ Merit Market admin
app/finance/family-invoices/ family finance
components/ace/ focused reusable ACE UI
api/
src/access-control/ permission registry and resolver
src/ace-settings/ policy/configuration
src/pace/ PACE use cases
src/behaviour/ behaviour use cases
src/faith/ Faith Corner
src/school-operations/ reusable school workflows
src/community/ toggleable Community
src/ace-reports/ report workflow
src/student-portal/ self-only API
src/family/ linked-family API
src/clubs/ add-on
src/merit/ add-on
src/family-finance/ Finance extension
mobile/
app/(family)/ parent routes
app/(staff)/ staff routes
app/(student)/ student routes
src/features/ace/ shared mobile ACE features
workers/
src/ace-reports/ compile/render
src/finance/ documents/reminders
src/merit/ scheduled economy jobs
packages/
ace-domain/ pure ACE rules
finance-domain/ pure finance rules when required
auth/ typed permission/request-context contracts
platform/ capability registry/resolver
pricing/ module catalogue and plan policy
db/ Prisma, migrations, RLS, encryption
types/ transport-safe shared types
ui/ generic UI primitives
docs/ace-vertical/ ADRs, runbooks, migration notes
```

Avoid a god ace.service.ts, imported Oasis code, duplicated capability lists, role-name authorisation, database-created executable permission strings, business rules in UI files, and unrelated utility dumps.

# 12. Cloud and Infrastructure Plan

## 12.1 MVP topology

- Vercel for existing web/admin/API projects.

- Supabase EU Postgres and storage.

- Auth0 authentication/MFA.

- Stripe organisation subscriptions/modules; later optional family collection.

- Resend transactional email.

- GitHub Actions for CI, migrations, deployments, and low-frequency jobs.

Keep runtime and data in UK/EU. Current reviewed documentation identifies eu-west-1; confirm whether UK-only residency is contractual before onboarding child data.

## 12.2 Environments and IaC

- local: Docker Postgres, mock providers, synthetic data.

- CI: ephemeral database.

- staging: separate DB/storage/auth and Stripe test mode.

- production: distinct secrets, reviewed RLS, backups.

Use Terraform for repeatable storage lifecycle, DNS/alerts, and future worker infrastructure where it adds value; do not wrap stable Vercel settings merely for appearance.

## 12.3 Planning costs

| Stage | Range | Assumptions |
| --- | --- | --- |
| Development/closed pilot | £50–£150/month | Supabase Pro, Vercel seat/usage, low auth/email, no paid market data. |
| First ACE centres | £100–£350/month | production DB/backups, transactional email, monitoring, moderate storage/compute. |
| Early scale | £350–£1,200/month | larger DB, storage/egress, auth/function use, monitoring, possible licensed market data. |

Public pricing references checked for the original plan: Vercel, Supabase, Auth0, and Resend pricing pages. Recheck before approval because provider pricing and exchange rates change.

## 12.4 Backup/DR

- daily DB backups; point-in-time recovery before material finance/ledger adoption.

- pilot RPO 24h/RTO 8h; target production RPO 1h/RTO 4h.

- protected/versioned published reports/invoices where supported.

- quarterly restore drill.

- organisation/site export.

- runbooks for database, storage, Auth0, Stripe webhook, and worker failure.

# 13. Security and Compliance

## 13.1 Mandatory controls

- UK GDPR/DPA principles, minimisation, retention, subject rights, processor records.

- application and DB tenant isolation.

- encryption for selected PII/sensitive free text; TLS in transit.

- secrets only in provider/CI secret stores.

- MFA for privileged users; step-up for sensitive role changes.

- strict guardian-child and student-self checks.

- typed least-privilege custom roles.

- transactional last-head/self-lockout protection.

- immediate or bounded access-revocation propagation.

- audit sensitive reads and material writes.

- private storage with authorised proxy/short-lived access.

- rate limits for exports/downloads/writes and mass permission assignment.

- safe file-type/size/antivirus controls.

- dependency/secret scanning.

## 13.2 RLS and tenancy

- include tenantId, enable/force RLS, and add every table to automated assertion tests.

- test list/read/update/delete isolation.

- role definitions isolate by organisation; site assignments prove site belongs to that organisation.

- no cross-org role assignment and no site-role resolution outside its site.

- review join tables explicitly.

- incomplete current RLS is a release blocker, not an indefinite override.

## 13.3 Sensitive domains

Sensitive behaviour and safeguarding remain separate. Community moderators do not inherit safeguarding access. Community reports may create an escalation reference, but do not copy sensitive safeguarding details. Report compilation uses an explicit allow-list.

## 13.4 Finance and merit

- family payments are real finance; merit is virtual.

- separate models, units, UI, reports, and permissions.

- integer pence versus integer merit units.

- idempotent reconciliation and reasons for manual adjustments.

- separation of invoice issue/payment confirmation when team size permits.

- clearly label the market as simulated/educational.

## 13.5 OWASP/ASVS priorities

Authentication/session management, object-level authorisation, server validation, rich-text output encoding, CSRF, rate/abuse limits, secure uploads/downloads, CSP/security headers, dependency scanning, audit integrity, log redaction, step-up for sensitive grants, and anomaly detection for role elevation.

## 13.6 Data subject/retention coverage

Exports/deletion/retention inventory covers PACE, behaviour, reports, evidence, identities, portal policy, Faith, trips/slips, Community, roles/assignments/audit, Clubs, Merit, and Finance. Apply legal holds/retention explicitly; this is technical planning, not legal advice.

# 14. DevEx and CI/CD

## 14.1 PR/release strategy

- one bounded behaviour per PR.

- dependency-safe expand/contract migrations.

- migration PR includes RLS, indexes, rollback/mitigation.

- do not combine ACE core, Clubs, Merit, and Finance in one branch.

- features hidden behind capability/feature settings until enabled.

- canary by organisation.

- keep cancelled-module data retained/exportable under policy.

## 14.2 Required checks

```text
pnpm db:generate
pnpm -r typecheck
pnpm -r lint
pnpm test:unit
pnpm test:integration
pnpm --finlter @pathway/admin build
pnpm --finlter @pathway/web build
pnpm --finlter @pathway/mobile typecheck
pnpm --finlter @pathway/mobile lint
pnpm supabase:rls:check -- --strict
```

Add capability/permission completeness, schema invariants, migration smoke, Playwright admin/parent journeys, mobile route/API tests, and accessibility checks.

## 14.3 ADRs

1. confirmed ACE packaging and capabilities.

2. configurable roles, permission registry, delegation, and fixed-role migration.

3. included feature toggles versus paid entitlements.

4. student identity/persona.

5. PACE fact/projection and correction.

6. behaviour-to-merit boundary.

7. family finance versus subscription billing.

8. transactional outbox/idempotency.

9. report version/document strategy.

10. market-data provider/licensing.

# 15. Testing Strategy

## 15.1 Unit

- all PACE boundaries, timezone daily limit, warning/block, override expiry, progress status.

- attendance including Late.

- demerit thresholds and serious misconduct.

- report allow-list.

- consent version/re-consent.

- Community fail-closed toggle.

- permission registry rejection, delegation, scope, capability intersection.

- expiry/revocation, last-head, self-lockout, optimistic role version.

- ledger balance/idempotency/insufficient funds/stock races/stale market data.

- invoice totals, proration, discounts, partial allocations, credit/immutability.

## 15.2 Integration

- tenant A cannot access tenant B for every table/route.

- capabilities only for entitled organisations/modules.

- custom roles cannot manufacture module access.

- role/assignment org/site isolation.

- old/new access resolver shadow agreement.

- cache/session invalidation after role change.

- guardian/student relationship checks.

- Community disable behaviour.

- PACE transaction/projection.

- report workflow.

- consent/re-consent.

- invoice/payment allocation.

- ledger/shop atomicity.

- Stripe activation/cancellation.

## 15.3 E2E

1. create ACE site → enrol child → record PACE Test → dashboard.

2. record Late and behaviour → parent sees permitted release only.

3. compile → review → publish report → parent download.

4. student signs in → sees self only and respects locks.

5. org head creates site role from tags → assigns → effective access changes → revokes safely.

6. publish trip/slip → linked parent consents → audited staff response.

7. disable Community → member UI/API fail closed → governed head export remains.

8. Finance invoice → parent view → payment confirmation.

9. Clubs signup → scoped lead attendance.

10. Merit award posts once → shop reservation updates balance/stock.

11. non-entitled organisation cannot call add-on APIs.

## 15.4 Non-functional

Performance on realistic rosters/multi-site data; concurrency on role protection, PACE duplicates, last stock, and webhook replay; IDOR/tenant swap/privilege escalation; WCAG; provider outage; backup restore/reconciliation.

# 16. Observability and SRE-Lite

## 16.1 Telemetry and metrics

Log request/org/site, safe actor reference, capability, required permission, decision/reason, source role ID/scope, action/entity, policy code, job attempt, provider status. Never log decrypted notes, addresses, health data, narratives, tokens, PDF content, or keys.

**Metrics:**

- PACE success/rejection by policy.

- report queue age/failure.

- attendance/behaviour write failures.

- permission denials by key/reason.

- custom role changes, sensitive grants, assignment churn, revocation lag.

- parent/student denials.

- invoice/webhook/reminder failures.

- merit reconciliation drift, stale market data, stock conflicts.

## 16.2 Alerts and runbooks

Alert on repeated report failure, payment webhook failure, DB exhaustion, RLS preflight failure, storage spike, cross-tenant denial pattern, last-head/protected-permission attempts, mass sensitive grants, revocation lag, and ledger mismatch.

**Runbooks:**

1. report/invoice generation backlog.

2. Stripe entitlement mismatch.

3. tenant-isolation/data incident.

4. incorrect permission grant, rollback, emergency revocation.

5. merit ledger mismatch.

6. market provider outage/stale data.

# 17. Milestones and Step-by-Step Delivery

## Milestone 0 — Architecture lock and hardening (1–2 weeks)

Tasks: record confirmed packaging, lock capability/permission names, strict capability type, RLS blocker review, student identity decision, mobile release scope, ADRs 1–5. Acceptance: product matrix approved; no duplicate entitlement system; every route maps to capability, permission, and persona; security blockers owned.

## Milestone 1 — Configurable roles and tags (3–5 weeks)

**Tasks:**

- registry with scope/sensitivity/delegability/capability metadata.

- schema/RLS/system templates/fixed-role migration adapter.

- effective resolver, guard, decision explanation, invalidation.

- role builder, assignments, access preview, audit.

- step-up, delegation, last-head, self-lockout, concurrency.

- shadow comparison then bounded route migration.

**Acceptance:**

- org head creates/assigns custom role from approved tags.

- unknown/protected/unavailable permissions rejected.

- role cannot activate an add-on.

- last-head/self-lockout concurrency tests pass.

- no unexplained old/new access drift.

PR slices: registry; schema/seeds; resolver/shadow telemetry; APIs; UI; route-by-route guard migration.

## Milestone 2 — ACE data foundation (2–3 weeks)

Academic periods, enrollments, PACE/behaviour/report/student identity, Faith, school operations, Community/feature settings, RLS/index/encryption/retention, pure ACE rules. Acceptance: clean/upgrade migrations; every table isolated; policy boundary tests; dependency-safe deployment.

## Milestone 3 — Daily staff MVP (3–4 weeks)

ACE settings, PACE roster/record/correction/override/dashboard, behaviour capture/summary/policy, attendance enum/audit, staff mobile, expanded audit. Acceptance: daily workflows complete; server rules enforced; corrections attributable; primary p95 list target under 500ms on pilot dataset.

## Milestone 4 — Family, Faith, Community, and reporting core (5–7 weeks)

Reports/PDF/release, parent web/mobile, student identity/mobile, homework/evidence, Faith, trips/slips, Community toggle/moderation/reporting/escalation reference, notifications and portal locks. Acceptance: reports/consent immutable and versioned; parent/student relationship rules pass; Community disable fails closed; primary web/mobile E2E passes.

## Milestone 5 — Finance family invoicing (4–6 weeks)

Schema/RLS/encryption/audit, fee schedules, proration/discounts, issue/void/credit/payment allocation, PDF/delivery, admin/parent views, manual/bank confirmation first. Acceptance: subscription/family billing isolated; issued totals immutable; allocations reconcile; family scope enforced; aged receivables agrees.

## Milestone 6 — Clubs (4–6 weeks)

Module/catalogue/Stripe provisioning, schema/RLS, management/signup/roster/session/attendance/notices, scoped leads, family/student/mobile. Acceptance: entitlement enforced; linked-child action; lead limited to assignments; cancellation preserves governed data without new operations.

## Milestone 7 — Child Merit Market (8–12 weeks)

Module/pricing/provisioning, ledger, behaviour posting, wallet/transfers/giving/tithe, shop, simulated market/provider cache, UX, reconciliation, leaderboards, runbooks. Release slices: 7A ledger/wallet; 7B giving/tithe; 7C shop; 7D simulated market; 7E leaderboards/hardening. Acceptance: balanced/idempotent ledger; atomic shop; clearly virtual market; provider outage safe; parent/centre blocks enforced.

## Milestone 8 — Pilot and launch (2–4 weeks)

Provision pilot, synthetic/UAT data, role-based scripts, load/accessibility/security/RLS review, restore drill, support training, optional Oasis migration discovery/dry run, staged enablement. Acceptance: no P0/P1; UAT and restore passed; monitoring/on-call active; rollback/capability-disable tested.

# 18. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Copying Oasis | Single-centre/security defects | Port rules/tests; rebuild NexSteps use cases. |
| Second entitlement system | Conflicting access/billing | Use existing vertical/module engine only. |
| String capabilities | Silent hide/expose errors | Typed registry, exhaustive maps, CI completeness. |
| Arbitrary custom role strings | Privilege escalation/access drift | Platform registry, delegable allow-list, effective-permission guard. |
| Last admin lockout | Governance outage | Transactional last-head/self-lockout, step-up, recovery runbook. |
| Stale permission cache | Revoked access persists | Version/invalidation, short TTL, lag alerts. |
| Student bolted onto staff/parent flags | Data leak | Explicit identity/persona and self-only tests. |
| Indirect tenancy | RLS gaps/slow joins | Direct tenantId, indexes, RLS tests. |
| Mutable PACE current state only | Lost correction history | Immutable facts + rebuildable projection. |
| Behaviour/safeguarding mixed | Sensitive release | Separate domains and report allow-list. |
| Finance/subscription billing mixed | Wrong customer/ledger | Separate modules/models/services. |
| Merit treated as money | Trust/compliance risk | Separate units and explicit virtual labels. |
| Duplicate jobs/webhooks | Double value/actions | Idempotency, unique keys, outbox. |
| Market-data licence/cost | Add-on not viable | Licence decision before provider implementation. |
| Report bursts | Timeouts | Worker abstraction, bounded batch/retry/status. |
| Existing RLS gaps | Child-data launch risk | Strict RLS launch gate. |
| Scope expansion | Delayed value | Core sequence and independent add-on milestones. |

# 19. Confirmed Product Decisions

| Decision | Confirmed outcome | Technical consequence |
| --- | --- | --- |
| Child Merit Market | One paid add-on bundle | One entitlement/capability family; staged releases allowed. |
| Faith Corner | ACE core | No separate billing entitlement. |
| Homework/evidence | ACE core | Extend Learning foundation. |

| Decision | Confirmed outcome | Technical consequence |
| --- | --- | --- |
| Trips/permission slips | Core school | Reusable school-operations domain. |
| Multi-site analytics | Advanced Reporting | Cross-site capability requires module. |
| Student Community | Included optional ACE component | Org feature toggle; no separate charge. |
| Mobile/messaging/ safeguarding | Platform core | Shared and never ACE add-ons. |
| Configurable roles/tags | Platform core | Typed registry, custom org/site roles, assignments, audit. |

Interpretation: “Student Community as an add-on part of ACE core” means an included optional component of the ACE entitlement, not a separately billed module. The organisation head can enable/disable it. Its domain boundary permits later commercial separation without redesigning data if product intent changes.

# 20. Post-MVP Roadmap

Near-term: bulk PACE entry/import preview, report narrative assistance with human approval, configurable thresholds, parent action centre, centre policy/templates, richer Faith content. Scale/readiness: durable queue, read replicas/analytics store, PITR, safe capability/access cache, access-review attestations, time-limited elevated roles, document service, data warehouse for Advanced Reporting. Commercial: paid onboarding/migration, privacy-threshold benchmarking, report branding, Finance payment collection/reconciliation, module trials, usage analytics, offboarding/export pack.

# 21. Implementation Notes for the Repositories

## NexSteps (`pathway`)

**Only implementation target. High-value reviewed areas:**

- packages/platform/src/capability-maps.ts, capabilities.ts, types.ts.

- packages/db/prisma/schema.prisma.

- packages/auth/src/types/roles.ts.

- packages/pricing/src/configurator-plan-policy.ts.

- apps/api/src/platform/, billing/, learning/.

- apps/api/src/auth/user-roles.service.ts, active-site.controller.ts.

- apps/admin/lib/access.ts, permissions.ts, and admin navigation.

- mobile routes, workers, deployment docs, already-have.plan.md, ace-profile.plan.md.

Replace the stale ACE plan only in an authorised implementation task.

## Oasis (`oasis-portal`)

**Keep read-only as behaviour/UX reference:**

- feature list, Prisma schema, PACE/behaviour/report/invoice/permission-slip routers.

- domain subjects, attendance, demerit policy, report, ledger, tithe, shop, clubs, invoice.

- packages/domain/src/rbac.ts for the useful fixed-role-plus-tag concept.

Do not modify or migrate Oasis data without separate authorisation.

# 22. Backlog Approval Checklist

- [x] Core/add-on decisions confirmed.

- [x] Merit bundle confirmed.

- [x] Faith, homework/evidence, Community, trips/slips classified.

- [x] Mobile, messaging, safeguarding classified.

- [x] Configurable roles established as platform core.

- [ ] Detailed capability/permission matrix approved.

- [ ] Access-control/delegation ADR approved.

- [ ] Student identity ADR approved.

- [ ] PACE correction model approved.

- [ ] RLS launch blockers assigned.

- [ ] UK-only versus EU residency confirmed.

- [ ] Market-data licensing owner assigned.

- [ ] Finance V1 payment scope confirmed.

- [ ] web-first versus mobile-parity release scope confirmed.

- [ ] pilot/UAT owners and delivery capacity agreed.

ACE-F01 records accountable ownership and implementation blockers below. Every
item remains open until the named owner records substantive approval; an
implementation direction, candidate matrix, or authored ADR does not by itself
close a checklist item.

| Open decision | Accountable owner | Blocking PR/gate |
| --- | --- | --- |
| Detailed capability/permission matrix approved | Jean-Fidele Ntagengwa (Product & Engineering) | owner approval gate for `ACE-F01`; then consumed by `ACE-F02` through `ACE-F14` |
| Access-control/delegation ADR approved | Jean-Fidele Ntagengwa (Product & Engineering) | owner approval gate for `ACE-F01`; then `ACE-F02` through `ACE-F14`, especially `ACE-F12` and `ACE-F14` |
| Student identity ADR approved | Jean-Fidele Ntagengwa (Product & Engineering) | `ACE-F17`, `ACE-M15` through `ACE-M20`, then identity-dependent pilot gates |
| PACE correction model approved | Jean-Fidele Ntagengwa (Product & Engineering) | `ACE-F16`, `ACE-O02`, `ACE-O03`, and `ACE-O09` through `ACE-O13` |
| RLS launch blockers assigned | Technical Agent | `ACE-F03`, `ACE-F15` through `ACE-F22`, every add-on schema PR, `ACE-L05`, and `ACE-L09` |
| UK-only versus EU residency confirmed | Jean-Fidele Ntagengwa (Product & Engineering), with Legal/Commercial review | child-data onboarding; `ACE-L04`, `ACE-L05`, and `ACE-L09` |
| Market-data licensing owner assigned | Jean-Fidele Ntagengwa (Product & Engineering), with Legal/Commercial review | `ACE-MER01`, `ACE-MER12` through `ACE-MER14`, `ACE-MER17`, and `ACE-MER20` |
| Finance V1 payment scope confirmed | Jean-Fidele Ntagengwa (Product & Engineering) | `ACE-FIN03` through `ACE-FIN13` |
| web-first versus mobile-parity release scope confirmed | Jean-Fidele Ntagengwa (Product & Engineering) | `ACE-O13`, `ACE-O17`, `ACE-O19`, `ACE-M08` through `ACE-M11`, `ACE-M18`, `ACE-M19`, `ACE-L06`, and `ACE-L09`; add-on mobile gates where promised |
| pilot/UAT owners and delivery capacity agreed | Jean-Fidele Ntagengwa (Product & Engineering), with Delivery | `ACE-L01`, `ACE-L08`, and `ACE-L09` |

# 23. Evidence and Sources

Repository review was read-only. Both source repositories contained pre-existing uncommitted changes; none were modified. Reviewed Oasis areas included business/domain rules, RBAC tags, Prisma models, API routers, web/mobile routes, ADRs, and phase plans. Reviewed NexSteps areas included the live capability engine, pricing/configurator, billing/webhooks, fixed roles and access gates, Learning module, schema/RLS/deployment docs, admin/mobile/workers, CI, and current plan files.

**Provider pricing references:**

- Vercel: https://vercel.com/pricing

- Supabase: https://supabase.com/pricing

- Auth0: https://auth0.com/pricing

- Resend: https://resend.com/pricing
