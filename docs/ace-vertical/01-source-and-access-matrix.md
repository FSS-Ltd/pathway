# ACE Source and Access Matrix

**Status:** Approved capability and permission execution contract for `ACE-F02` through `ACE-F14`.

**Applies to:** the planned public API contract in sections 8.2 through 8.5 of `docs/NexSteps-ACE-Vertical-Build-Plan.md`.

**Source order:** explicit product-owner instruction, `docs/ADDON_PRICING.md` for commercial facts, the ACE build plan for product/security/release scope, the ACE implementation plan set, current NexSteps patterns, then Oasis as read-only reference.

## Superseding access decision (5 October 2026)

The product owner replaced customer-created roles in every sector with fixed
platform roles and scoped access tags. The route matrix below describes the
previously implemented ACE-F14 role API during its staged runtime cutover. The
target contract is:

| Existing route family | Target behavior |
| --- | --- |
| R02, R04-R07 role creation, editing, cloning, permission replacement, and retirement | Reject legacy writes; fixed role templates remain read-only. |
| R09-R11 assignments | Assign only platform-owned fixed roles, preserve historical custom assignments during audited parity migration, and retain one-way revocation. |
| R12-R14 effective access and audit | Include active, scoped tag grants after delegation and entitlement checks; preserve tenant, relationship, and safeguarding boundaries. |
| Access-tag catalogue, grant, revoke, and effective-access routes | Use the exact paths and guards below; no client-defined permission key or paid-module activation. |

The tag catalogue contains all 17 Oasis concepts. Concepts without a matching
typed permission, entitlement, or record-scope guard remain unavailable. A tag
may be issued only for permissions the actor currently holds and may delegate;
the issued scope cannot exceed the actor's scope. The grant record retains
grantor, validity, one-way revocation, and audit facts. Access reads must ignore
expired and revoked grants and re-evaluate on site switches. The access-tag
APIs are merged; the role-write retirement and assignment migration remain
separate delivery steps. The original R01-R14 rows below are historical where
they describe customer role mutations.

The ACE-only `ace.attendance.export` capability is site-scoped, sensitive,
delegable, and part of ACE core. Fixed Organisation Head and Site Lead roles
hold it; other fixed roles do not. The `attendance-exporter` tag maps only to
that key and cannot be granted outside an active ACE organisation by an actor
who holds and may delegate it. The daily export route is a later step outside
the original 68-route contract; its site, dated enrolment, year-band, row
limit, tenant RLS, and audit checks are required in addition to the key.

Step 1.2c adds these routes outside the original 68-route ACE contract. Each
uses the authenticated request's organisation and selected site. Grant and
revoke require an active fixed Organisation Head assignment; a legacy role
claim alone cannot authorise either operation. Reads show organisation grants
and grants for the selected site only. R12, R13, R14, and R69 include active
tag sources or their audit/summary records when step 1.2c is deployed.

| Method | Path | Permission | Boundary |
| --- | --- | --- | --- |
| GET | `/access/tags/catalogue` | `platform.access.permissions.read` | Fixed catalogue; unavailable tags cannot be granted. |
| GET | `/access/tags/grants` | `platform.access.assignments.read` | Organisation and selected-site scope; cursor pagination; historical revocations remain readable. |
| POST | `/access/tags/grants` | `platform.access.assignments.manage` | Fixed head; current delegable actor-held permissions, active entitlement, recipient membership, validity window. |
| DELETE | `/access/tags/grants/:grantId` | `platform.access.assignments.manage` | Fixed head; organisation and selected-site scope; one-way audited revocation. |

## Contract boundaries

Sections 8.2 through 8.4 define **68 exact routes**. Section 8.5 defines four add-on operation families but no HTTP methods or paths. The add-on families are recorded separately and do not increase the exact-route count.

The public Faith path is `/ace/faith/content/:id/reflections`. The source misspelling is corrected wherever ACE-F01 touches the public route contract.

Every exact route applies the following formula without collapsing one layer into another:

```text
authenticated
AND active org/site membership
AND active organisation capability
AND effective typed permission
AND included feature enabled, when applicable
AND relationship/domain assignment
AND release/visibility policy
AND tenant/RLS policy
```

## ACE-F09 inactive shadow comparison

`ACE_ACCESS_SHADOW_ENABLED=true` gates comparison entirely on
`ACCESS_SHADOW_ALLOW_LIST`, which is empty: R01 through R14 observed shadow
agreement, then ACE-F14 cut them over to `PermissionGuard` directly and
deleted the legacy bootstrap they were compared against, so there is nothing
left for them to compare. The instrument remains available, unpopulated,
for a future bounded route migration (ACE-F15+) that needs the same
inactive-until-populated observation step before its own cutover.

## ACE-F14 typed permission cutover

R01 through R14 are enforced by `PermissionGuard` reading
`@RequirePermission(<matrix permission>)` directly off each handler. No
route asserts a legacy role name, and no bootstrap remains: the full formula
(membership, capability, and typed permission) is evaluated by
`EffectivePermissionsService.resolve()` in one pass, matching every route's
matrix row above where the `capability` and `permission` columns are the
same key.

R02 and R04-R07 return request-correlated `410 CUSTOM_ROLES_RETIRED` after
authentication and permission checks when step 1.2d1 is released. Historical
role reads remain available for migration parity. R09 is organisation-scoped
and returns an opaque `{ items, nextCursor }` creation-order page with a
default and maximum of 50 rows. R10 derives organisation and selected-site
scope from trusted context for one assignment or an atomic bulk request of
1 through 50 assignments, and R11 records one-way revocation without
deleting assignment history. Successful writes enqueue an invalidation
intent transactionally and invalidate every local user-and-organisation
cache variant after commit; the route decision itself is therefore fresh at
write time but can lag up to the hard 60-second cache TTL for a
just-revoked actor's next read. Other processes and failed direct
invalidations converge through that same TTL.

ACE-F12's transactional last-organisation-head and same-request
self-lockout enforcement remains required for R10 and R11. R04, R06, and R07
no longer mutate roles after step 1.2d1 is released.

`none` means the layer is genuinely inapplicable to that route. It never means undecided.

### Membership and tenant context

- An organisation head with an active organisation membership may select any site in that organisation. The selected site must still be derived and validated by the server.
- A site-scoped role requires an active assignment for the selected site. Organisation membership alone does not grant a site-scoped role.
- Organisation and site identifiers come from trusted request context, never a request body or a parent/student-supplied identifier.
- Navigation visibility is advisory. Every API route independently enforces the complete formula.

### Sensitivity policy

- `protected`: access administration, policy overrides, publication, and moderation. This includes access reads because role, assignment, effective-access, and audit data expose the delegation boundary.
- `sensitive`: child, family, consent, private-report, private-reflection, and student-authored Community data. Corrections are sensitive; they are not classified as protected unless they are an override.
- `standard`: ordinary operational content such as settings, academic calendars, trips, and non-private published content.

Edge cases follow the action and data, not the URL prefix. Report drafting and approval are `sensitive`; report publication is `protected`. Permission-slip management is `sensitive`; publication is `protected`. Identity-linked Faith read receipts are `sensitive`. Community posts and reports are `sensitive`; ordinary space creation is `standard`; moderation is `protected`. Community feature-setting routes do not require the feature to be enabled because they must remain reachable to enable or disable it.

## Exact route matrix

| ID | Method | Path | capability | permission | persona | membership | relationship | releasePolicy | featureToggle | sensitivity | tenantRls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | GET | `/access/roles` | `platform.access.roles.read` | `platform.access.roles.read` | organisation-head | active organisation membership | `none` | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R02 | POST | `/access/roles` | `platform.access.roles.manage` | `platform.access.roles.manage` | organisation-head | active organisation membership | `none` | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R03 | GET | `/access/roles/:roleId` | `platform.access.roles.read` | `platform.access.roles.read` | organisation-head | active organisation membership | role belongs to active organisation | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R04 | PATCH | `/access/roles/:roleId` | `platform.access.roles.manage` | `platform.access.roles.manage` | organisation-head | active organisation membership | role belongs to active organisation; delegation and self-lockout rules | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R05 | POST | `/access/roles/:roleId/clone` | `platform.access.roles.manage` | `platform.access.roles.manage` | organisation-head | active organisation membership | source role belongs to active organisation; delegable-key intersection | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R06 | PUT | `/access/roles/:roleId/permissions` | `platform.access.roles.manage` | `platform.access.roles.manage` | organisation-head | active organisation membership | role belongs to active organisation; actor-held delegable-key intersection | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R07 | POST | `/access/roles/:roleId/retire` | `platform.access.roles.manage` | `platform.access.roles.manage` | organisation-head | active organisation membership | role belongs to active organisation; last-head and self-lockout rules | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R08 | GET | `/access/permissions` | `platform.access.permissions.read` | `platform.access.permissions.read` | organisation-head | active organisation membership | registry metadata only; database rows cannot create executable keys | active-registry-definition-only | `none` | `protected` | trusted organisation context; organisation-scoped metadata query |
| R09 | GET | `/access/assignments` | `platform.access.assignments.read` | `platform.access.assignments.read` | organisation-head | active organisation membership | assignments belong to active organisation; site filters remain inside organisation | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R10 | POST | `/access/assignments` | `platform.access.assignments.manage` | `platform.access.assignments.manage` | organisation-head | active organisation membership | role and user belong to active organisation; site assignment belongs to organisation | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS and site-scope validation |
| R11 | DELETE | `/access/assignments/:assignmentId` | `platform.access.assignments.manage` | `platform.access.assignments.manage` | organisation-head | active organisation membership | assignment belongs to active organisation; last-head and self-lockout rules | `none` | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R12 | GET | `/access/users/:userId/effective-permissions` | `platform.access.users.read` | `platform.access.users.read` | organisation-head | active organisation membership | user belongs to active organisation; site sources remain inside organisation | current-effective-assignments-only | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R13 | GET | `/access/users/:userId/access-summary` | `platform.access.users.read` | `platform.access.users.read` | organisation-head | active organisation membership | user belongs to active organisation; site sources remain inside organisation | current-effective-assignments-only | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R14 | GET | `/access/audit` | `platform.access.audit.read` | `platform.access.audit.read` | organisation-head | active organisation membership | audit events belong to active organisation | audit-retention-policy | `none` | `protected` | trusted organisation context; organisation-scoped RLS |
| R15 | GET | `/ace/settings` | `ace.settings.read` | `ace.settings.read` | organisation-head, site-lead | active selected-site context | `none` | active-settings-version | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R16 | PUT | `/ace/settings` | `ace.settings.manage` | `ace.settings.manage` | organisation-head, site-lead | active selected-site context | `none` | active-settings-version | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R17 | GET | `/ace/academic-years` | `ace.settings.read` | `ace.settings.read` | organisation-head, site-lead, staff | active selected-site context | active-site-domain | active-academic-configuration | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R18 | POST | `/ace/academic-years` | `ace.settings.manage` | `ace.settings.manage` | organisation-head, site-lead | active selected-site context | active-site-domain | active-academic-configuration | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R19 | GET | `/ace/students/:childId/subjects` | `ace.pace.read` | `ace.pace.read` | organisation-head, site-lead, staff | active selected-site context | child enrolled at active site | staff-only | `none` | `sensitive` | trusted tenant and child scope; tenantId/childId RLS |
| R20 | POST | `/ace/students/:childId/subjects` | `ace.pace.record` | `ace.pace.record` | organisation-head, site-lead, staff | active selected-site context | child enrolled at active site | staff-only | `none` | `sensitive` | trusted tenant and child scope; tenantId/childId RLS |
| R21 | GET | `/ace/pace/roster` | `ace.pace.read` | `ace.pace.read` | organisation-head, site-lead, staff | active selected-site context | active-site roster domain | staff-only | `none` | `sensitive` | trusted organisation/site context; tenant-scoped RLS |
| R22 | GET | `/ace/students/:childId/pace` | `ace.pace.read` | `ace.pace.read` | organisation-head, site-lead, staff | active selected-site context | child enrolled at active site | staff-only | `none` | `sensitive` | trusted tenant and child scope; tenantId/childId RLS |
| R23 | POST | `/ace/pace/assessments` | `ace.pace.record` | `ace.pace.record` | site-lead, staff | active selected-site context | child enrolled at active site | staff-only | `none` | `sensitive` | trusted tenant and child scope; tenantId/childId RLS |
| R24 | POST | `/ace/pace/assessments/:id/corrections` | `ace.pace.correct` | `ace.pace.correct` | organisation-head, site-lead | active selected-site context | assessment belongs to child and active site | staff-only | `none` | `sensitive` | trusted tenant, child, and assessment scope; tenantId RLS |
| R25 | POST | `/ace/pace/policy-overrides` | `ace.pace.override` | `ace.pace.override` | organisation-head, site-lead | active selected-site context | child and assessment context belong to active site | staff-only | `none` | `protected` | trusted tenant and child scope; tenantId/childId RLS |
| R26 | GET | `/ace/pace/exceptions` | `ace.pace.read` | `ace.pace.read` | organisation-head, site-lead | active selected-site context | active-site exception domain | staff-only | `none` | `sensitive` | trusted organisation/site context; tenant-scoped RLS |
| R27 | GET | `/ace/behaviour` | `ace.behaviour.read` | `ace.behaviour.read` | organisation-head, site-lead, staff, safeguarding-lead | active selected-site context | active-site behaviour domain; sensitive fields require `ace.behaviour.sensitive.read` | staff-only field-visibility policy | `none` | `sensitive` | trusted tenant and child scope; tenantId/childId RLS |
| R28 | POST | `/ace/behaviour` | `ace.behaviour.record` | `ace.behaviour.record` | site-lead, staff | active selected-site context | child enrolled at active site | staff-only field-visibility policy | `none` | `sensitive` | trusted tenant and child scope; tenantId/childId RLS |
| R29 | POST | `/ace/behaviour/:id/corrections` | `ace.behaviour.record` | `ace.behaviour.record` | organisation-head, site-lead | active selected-site context | behaviour fact belongs to child and active site | staff-only field-visibility policy | `none` | `sensitive` | trusted tenant, child, and fact scope; tenantId RLS |
| R30 | GET | `/ace/behaviour/policy` | `ace.behaviour.read` | `ace.behaviour.read` | organisation-head, site-lead, staff | active selected-site context | active-site-domain | active-policy-version | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R31 | PUT | `/ace/behaviour/policy` | `ace.behaviour.policy.manage` | `ace.behaviour.policy.manage` | organisation-head, site-lead | active selected-site context | active-site-domain | active-policy-version | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R32 | GET | `/ace/reports` | `ace.reports.read` | `ace.reports.read` | organisation-head, site-lead, staff | active selected-site context | active-site report domain | staff-only workflow visibility | `none` | `sensitive` | trusted tenant and child scope; tenantId/childId RLS |
| R33 | POST | `/ace/reports` | `ace.reports.compile` | `ace.reports.compile` | site-lead, staff | active selected-site context | child enrolled at active site | staff-only workflow visibility | `none` | `sensitive` | trusted tenant and child scope; tenantId/childId RLS |
| R34 | POST | `/ace/reports/:id/submit` | `ace.reports.review` | `ace.reports.review` | site-lead, staff | active selected-site context | report belongs to active site | staff-only workflow visibility | `none` | `sensitive` | trusted tenant, child, and report scope; tenantId RLS |
| R35 | POST | `/ace/reports/:id/approve` | `ace.reports.review` | `ace.reports.review` | organisation-head, site-lead | active selected-site context | report belongs to active site; maker/checker policy | staff-only workflow visibility | `none` | `sensitive` | trusted tenant, child, and report scope; tenantId RLS |
| R36 | POST | `/ace/reports/:id/publish` | `ace.reports.publish` | `ace.reports.publish` | organisation-head, site-lead | active selected-site context | report belongs to active site; maker/checker policy | published/frozen | `none` | `protected` | trusted tenant, child, and report scope; tenantId RLS |
| R37 | GET | `/ace/reports/:id/download` | `ace.reports.read` | `ace.reports.read` | organisation-head, site-lead, staff | active selected-site context | report belongs to active site | staff-only workflow visibility; private short-lived download | `none` | `sensitive` | trusted tenant, child, report, and private-storage scope; tenantId RLS |
| R38 | GET | `/ace/faith/content` | `ace.faith.read` | `ace.faith.read` | organisation-head, site-lead, staff, parent/guardian, student | active organisation/site portal context | staff active-site domain; guardian-child or student-self identity for portal readers | published active-version and audience policy for portal readers; staff workflow visibility for staff | `none` | `standard` | trusted tenant and actor context; tenant-scoped RLS |
| R39 | POST | `/ace/faith/content` | `ace.faith.manage` | `ace.faith.manage` | organisation-head, site-lead, staff | active selected-site context | active-site-domain | staff-only draft workflow | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R40 | POST | `/ace/faith/content/:id/publish` | `ace.faith.publish` | `ace.faith.publish` | organisation-head, site-lead | active selected-site context | content belongs to active site | published active-version and audience policy | `none` | `protected` | trusted tenant and content scope; tenant-scoped RLS |
| R41 | POST | `/ace/faith/content/:id/read` | `ace.faith.read` | `ace.faith.read` | staff, parent/guardian, student | active organisation/site portal context | staff active-site domain; guardian-child or student-self identity for portal readers | published active-version and audience policy | `none` | `sensitive` | trusted tenant and actor context; tenant-scoped RLS |
| R42 | GET | `/ace/faith/content/:id/reflections` | `ace.faith.read` | `ace.faith.read` | organisation-head, site-lead, staff, parent/guardian, student | active organisation/site portal context | reflection audience plus staff active-site domain, guardian-child, or student-self identity | explicit reflection visibility and moderation policy | `none` | `sensitive` | trusted tenant, child, content, and reflection scope; tenantId/childId RLS |
| R43 | POST | `/ace/faith/content/:id/reflections` | `ace.faith.read` | `ace.faith.reflect` | parent/guardian, student | active organisation/site portal context | guardian-child or student-self identity | published active-version; reflections enabled; explicit reflection visibility | `none` | `sensitive` | trusted tenant, child, content, and actor scope; tenantId/childId RLS |
| R44 | GET | `/ace/settings/features/student-community` | `ace.community.read` | `ace.settings.read` | organisation-head, site-lead | active selected-site context | `none` | active-feature-setting | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R45 | PUT | `/ace/settings/features/student-community` | `ace.community.read` | `ace.community.settings.manage` | organisation-head | active organisation membership and selected-site context | target site belongs to active organisation | active-feature-setting | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R46 | GET | `/ace/community/spaces` | `ace.community.read` | `ace.community.read` | organisation-head, site-lead, staff, student | active selected-site context | derived-community-membership | community-moderation-policy | `ace.student_community` | `sensitive` | trusted tenant and derived membership; tenant-scoped RLS |
| R47 | POST | `/ace/community/spaces` | `ace.community.read` | `ace.community.spaces.manage` | organisation-head, site-lead | active selected-site context | active-site community administration | community-moderation-policy | `ace.student_community` | `standard` | trusted tenant and site scope; tenant-scoped RLS |
| R48 | GET | `/ace/community/spaces/:spaceId/posts` | `ace.community.read` | `ace.community.read` | organisation-head, site-lead, staff, student | active selected-site context | derived-community-membership for space | community-moderation-policy | `ace.student_community` | `sensitive` | trusted tenant, space, and derived membership; tenant-scoped RLS |
| R49 | POST | `/ace/community/spaces/:spaceId/posts` | `ace.community.post` | `ace.community.post` | staff, student | active selected-site context | derived-community-membership for space | community-moderation-policy | `ace.student_community` | `sensitive` | trusted tenant, actor, and space scope; tenant-scoped RLS |
| R50 | POST | `/ace/community/posts/:postId/report` | `ace.community.read` | `ace.community.report` | organisation-head, site-lead, staff, student | active selected-site context | derived-community-membership for source space | community-moderation-policy | `ace.student_community` | `sensitive` | trusted tenant, actor, post, and space scope; tenant-scoped RLS |
| R51 | POST | `/ace/community/posts/:postId/moderate` | `ace.community.moderate` | `ace.community.moderate` | organisation-head, site-lead | active selected-site context | moderator assigned to active-site community domain | community-moderation-policy; safeguarding details remain separate | `ace.student_community` | `protected` | trusted tenant, post, and moderation scope; tenant-scoped RLS |
| R52 | GET | `/school/trips` | `school.trips.read` | `school.trips.read` | organisation-head, site-lead, staff | active selected-site context | active-site-domain | staff-only workflow visibility | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R53 | POST | `/school/trips` | `school.trips.manage` | `school.trips.manage` | organisation-head, site-lead, staff | active selected-site context | active-site-domain | staff-only workflow visibility | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R54 | GET | `/school/trips/:tripId` | `school.trips.read` | `school.trips.read` | organisation-head, site-lead, staff | active selected-site context | trip belongs to active site | staff-only workflow visibility | `none` | `standard` | trusted tenant and trip scope; tenant-scoped RLS |
| R55 | PATCH | `/school/trips/:tripId` | `school.trips.manage` | `school.trips.manage` | organisation-head, site-lead, staff | active selected-site context | trip belongs to active site | staff-only workflow visibility; frozen slip versions remain immutable | `none` | `standard` | trusted tenant and trip scope; tenant-scoped RLS |
| R56 | GET | `/school/permission-slips` | `school.permission_slips.read` | `school.permission_slips.read` | organisation-head, site-lead, staff | active selected-site context | active-site permission-slip domain | staff-only workflow visibility | `none` | `sensitive` | trusted tenant, child, and slip scope; tenantId/childId RLS |
| R57 | POST | `/school/permission-slips` | `school.permission_slips.manage` | `school.permission_slips.manage` | organisation-head, site-lead, staff | active selected-site context | trip and audience belong to active site | staff-only draft workflow | `none` | `sensitive` | trusted tenant, child, and slip scope; tenantId/childId RLS |
| R58 | POST | `/school/permission-slips/:slipId/publish` | `school.permission_slips.manage` | `school.permission_slips.manage` | organisation-head, site-lead | active selected-site context | slip and frozen audience belong to active site | published/frozen wording and audience | `none` | `protected` | trusted tenant, child, slip, and audience scope; tenantId/childId RLS |
| R59 | GET | `/school/permission-slips/:slipId/responses` | `school.permission_slips.read` | `school.permission_slips.read` | organisation-head, site-lead, staff | active selected-site context | slip and response audience belong to active site | published/frozen slip version; current consent-version policy | `none` | `sensitive` | trusted tenant, child, slip, and response scope; tenantId/childId RLS |
| R60 | GET | `/family/children` | `ace.parent.progress.read` | `ace.parent.progress.read` | parent/guardian | active family portal context | guardian-child set derived by server | released-to-family | `none` | `sensitive` | trusted guardian context; tenantId/childId RLS |
| R61 | GET | `/family/children/:childId/ace-summary` | `ace.parent.progress.read` | `ace.parent.progress.read` | parent/guardian | active family portal context | guardian-child | released-to-family | `none` | `sensitive` | trusted guardian and child context; tenantId/childId RLS |
| R62 | GET | `/family/children/:childId/reports` | `ace.reports.read` | `ace.parent.progress.read` | parent/guardian | active family portal context | guardian-child | released-to-family; published and non-revoked versions only | `none` | `sensitive` | trusted guardian, child, report, and private-storage scope; tenantId/childId RLS |
| R63 | GET | `/family/permission-slips` | `school.permission_slips.read` | `school.permission_slips.read` | parent/guardian | active family portal context | guardian-child set derived by server | published/frozen active consent versions | `none` | `sensitive` | trusted guardian, child, and slip context; tenantId/childId RLS |
| R64 | POST | `/family/permission-slips/:slipId/respond` | `school.permission_slips.respond` | `school.permission_slips.respond` | parent/guardian | active family portal context | guardian-child in frozen slip audience | published/frozen active consent version; reconsent policy | `none` | `sensitive` | trusted guardian, child, slip, and consent context; tenantId/childId RLS |
| R65 | GET | `/student/me` | `ace.student.self.read` | `ace.student.self.read` | student | active student portal context | student-self-identity | active student portal policy | `none` | `sensitive` | trusted StudentIdentity; tenantId/childId RLS |
| R66 | GET | `/student/me/ace-summary` | `ace.student.self.read` | `ace.student.self.read` | student | active student portal context | student-self-identity | released-to-student | `none` | `sensitive` | trusted StudentIdentity; tenantId/childId RLS |
| R67 | GET | `/student/me/faith` | `ace.faith.read` | `ace.faith.read` | student | active student portal context | student-self-identity | released-to-student; published active-version and audience policy | `none` | `sensitive` | trusted StudentIdentity and content scope; tenantId/childId RLS |
| R68 | GET | `/student/me/community` | `ace.community.read` | `ace.community.read` | student | active student portal and selected-site context | student-self-identity and derived-community-membership | community-moderation-policy | `ace.student_community` | `sensitive` | trusted StudentIdentity, tenant, and derived membership; tenantId/childId RLS |

## Self-scoped access route

Added by ACE-F14 to give the admin nav a source for the caller's own effective permissions, since every `/access/*` route above requires `platform.access.users.read`, which staff, parents, and students never hold. Not one of the 68 exact routes; recorded separately so that count stays accurate.

| ID | Method | Path | capability | permission | persona | membership | relationship | releasePolicy | featureToggle | sensitivity | tenantRls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R69 | GET | `/access/users/me/permissions` | `none` | `none` | any authenticated user | active organisation membership | self only; not a delegation-boundary read | current-effective-assignments-only | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |

## ACE operations dashboard route

| ID | Method | Path | capability | permission | persona | membership | relationship | releasePolicy | featureToggle | sensitivity | tenantRls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R70 | GET | `/ace/dashboard` | `ace.dashboard.read` | `ace.dashboard.read` | organisation-head, site-lead | active selected-site context | active-site aggregate domain | staff-only | none | standard | trusted organisation/site context; tenant-scoped RLS |

## ACE core subject catalogue routes

Subject setup is part of ACE core. These routes do not require the paid Learning
module, and they do not grant access to Learning logs or evidence.

| ID | Method | Path | capability | permission | persona | membership | relationship | releasePolicy | featureToggle | sensitivity | tenantRls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R71 | GET | `/ace/subjects` | `ace.settings.read` | `ace.settings.read` | organisation-head, site-lead, staff | active selected-site context | active-site subject domain | staff-only | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R72 | POST | `/ace/subjects` | `ace.settings.manage` | `ace.settings.manage` | organisation-head, site-lead | active selected-site context | active-site subject domain | audited subject creation | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R73 | PATCH | `/ace/subjects/:id` | `ace.settings.manage` | `ace.settings.manage` | organisation-head, site-lead | active selected-site context | subject belongs to active site | audited subject rename | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |
| R74 | POST | `/ace/subjects/:id/deactivate` | `ace.settings.manage` | `ace.settings.manage` | organisation-head, site-lead | active selected-site context | subject belongs to active site | audited deactivation; existing placements retained | `none` | `standard` | trusted organisation/site context; tenant-scoped RLS |

## NexSteps legacy surface (Batch A)

Pre-ACE NexSteps routes migrated to typed permissions alongside the ACE-F14 cutover, using `platform.access.*`-family keys already active in `PLATFORM_CORE_CAPABILITIES` for every vertical. Not part of the 68 exact ACE routes; recorded separately so that count stays accurate. Migration is bounded to the two controllers that authorised from no role check at all (announcements, attendance) - see the ACE-F14 build plan for the controllers still blocked on a missing permission key or a commercial-entitlement decision (children, classes, parents, lessons, orgs, staff, session assignments, learning).

`staff` narrows from "any tenant member can create/delete announcements" to `notices.read` only (no `manage`); `organisationHead` and `siteLead` hold `notices.manage`. This is a deliberate tightening, not an incidental side effect.

| ID | Method | Path | capability | permission | persona | membership | relationship | releasePolicy | featureToggle | sensitivity | tenantRls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N01 | GET | `/announcements` | `notices.read` | `notices.read` | organisation-head, site-lead, staff | active site membership | `none` | `none` | `none` | `standard` | trusted tenant context; tenant-scoped RLS |
| N02 | GET | `/announcements/:id` | `notices.read` | `notices.read` | organisation-head, site-lead, staff | active site membership | announcement belongs to active tenant | `none` | `none` | `standard` | trusted tenant context; tenant-scoped RLS |
| N03 | POST | `/announcements` | `notices.manage` | `notices.manage` | organisation-head, site-lead | active site membership | `none` | AV30 hard-cap enforcement | `none` | `standard` | trusted tenant context; tenant-scoped RLS |
| N04 | PATCH | `/announcements/:id` | `notices.manage` | `notices.manage` | organisation-head, site-lead | active site membership | announcement belongs to active tenant | AV30 hard-cap enforcement on publish | `none` | `standard` | trusted tenant context; tenant-scoped RLS |
| N05 | DELETE | `/announcements/:id` | `notices.manage` | `notices.manage` | organisation-head, site-lead | active site membership | announcement belongs to active tenant | `none` | `none` | `standard` | trusted tenant context; tenant-scoped RLS |
| N06 | GET | `/attendance` | `attendance.read` | `attendance.read` | organisation-head, site-lead, staff | active site membership | `none` | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS |
| N06a | GET | `/attendance/daily` | `attendance.read` | `attendance.read` | organisation-head, site-lead, staff | active organisation membership; current site membership for site-lead and staff | selected site, dated school enrolment, and staff year-band assignment unless active fixed leader role grants full-site scope | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS |
| N06b | PUT | `/attendance/daily/:date/children/:childId` | `attendance.manage` | `attendance.manage` | organisation-head, site-lead, staff | active organisation membership; current site membership for site-lead and staff | selected site, open teaching date, dated school enrolment, and staff year-band assignment unless active fixed leader role grants full-site scope | `none` | daily correction event and audit | `sensitive` | trusted tenant context; tenant-scoped RLS; serialised child/date writes |
| N06c | GET | `/attendance/daily/:id/history` | `attendance.read` | `attendance.read` | organisation-head, site-lead, staff | active organisation membership; current site membership for site-lead and staff | selected-site daily fact and dated school enrolment; staff year-band assignment unless active fixed leader role grants full-site scope | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS; bounded signed cursor scoped to site and fact |
| N07 | GET | `/attendance/session-summaries` | `attendance.read` | `attendance.read` | organisation-head, site-lead, staff | active site membership | `none` | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS |
| N08 | GET | `/attendance/session/:sessionId` | `attendance.read` | `attendance.read` | organisation-head, site-lead, staff | active site membership | session belongs to active tenant | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS |
| N09 | GET | `/attendance/:id` | `attendance.read` | `attendance.read` | organisation-head, site-lead, staff | active site membership | record belongs to active tenant | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS |
| N09a | GET | `/attendance/:id/history` | `attendance.read` | `attendance.read` | organisation-head, site-lead, staff | active site membership | record and signed cursor belong to active tenant | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS |
| N10 | PUT | `/attendance/session/:sessionId` | `attendance.manage` | `attendance.manage` | organisation-head, site-lead, staff | active site membership | session belongs to active tenant | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS |
| N11 | POST | `/attendance` | `attendance.manage` | `attendance.manage` | organisation-head, site-lead, staff | active site membership | `none` | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS |
| N12 | PATCH | `/attendance/:id` | `attendance.manage` | `attendance.manage` | organisation-head, site-lead, staff | active site membership | record belongs to active tenant | `none` | `none` | `sensitive` | trusted tenant context; tenant-scoped RLS |

`notices.publish` has no dedicated route today (publication is folded into `PATCH /announcements/:id`); left unmapped rather than inventing one.

## Unresolved section 8.5 API contracts

No method or path is authorised by this table. The named owner must approve an exact contract before the blocking controller PR begins.

| ID | Add-on family | Operations named by section 8.5 | Accountable owner | Blocking PR/gate | Contract status |
| --- | --- | --- | --- | --- | --- |
| ADDON-01 | Clubs | management, signup, roster, session, attendance, notices, lead assignments, family views | Jean-Fidele Ntagengwa (Product & Engineering) | exact method/path contract before `ACE-CLB04` through `ACE-CLB08` | Open; methods and paths unspecified |
| ADDON-02 | Child Merit Market | wallet, ledger, transfers, adjustments, tithe, shop items/reservations/purchases, market instruments/orders/portfolio, leaderboards | Jean-Fidele Ntagengwa (Product & Engineering) | exact method/path contract before `ACE-MER04` through `ACE-MER18`; licensed market contract additionally blocks `ACE-MER12` through `ACE-MER14`, `ACE-MER17`, and `ACE-MER20` | Open; methods and paths unspecified |
| ADDON-03 | Finance | draft/issue/void/credit invoices, payments/allocations, aged receivables, family invoice views/downloads | Jean-Fidele Ntagengwa (Product & Engineering) | exact method/path contract before `ACE-FIN04` through `ACE-FIN11` | Open; methods and paths unspecified |
| ADDON-04 | Advanced Reporting | cross-site ACE metrics through approved aggregate queries only | Jean-Fidele Ntagengwa (Product & Engineering) | exact method/path contract before `ACE-AR04` | Open; methods and paths unspecified |

## Commercial facts

| Product | Price | Status | Entitlement rule |
| --- | --- | --- | --- |
| Clubs (`CLUBS`) | £12/month or £120/year | Proposed | Global add-on; included for `Vertical.CLUB`; eligible for Operations and All Included; never charge an included module twice |
| Child Merit Market (`CHILD_MERIT_MARKET`) | £19/month or £190/year | Proposed | ACE-only; All Included grants it only to ACE organisations; launch also requires accepted market-data licensing |
| Finance (`FINANCE`) | £15/month or £150/year | Proposed | Included in Growth and Professional; eligible for Operations and All Included |
| Advanced Reporting (`ADVANCED_REPORTING`) | £10/month or £100/year | Proposed | Included in Growth and Professional; eligible for Operations and All Included |

Proposed prices may support inactive planning and entitlement scaffolding. They do not authorise creating Stripe Products or Prices.

### Commercial implementation gaps

The current `Module` enum contains Finance and Advanced Reporting but does not
contain Clubs or Child Merit Market. This matrix does not assume that current
code can entitle either product. Jean-Fidele Ntagengwa (Product & Engineering)
owns the enum/registry placement decision. It blocks the relevant `ACE-F02`
mapping and must be resolved by `ACE-CLB01` and `ACE-MER01` before either
entitlement can become active. The exact migration/registry PR placement
remains open; absent support fails closed.

## Open decision ownership

The capability/permission matrix and access-control/delegation ADR have
substantive owner approval. Every other section 22 decision remains open until
its accountable owner records approval.

| Decision | Status | Accountable owner | Blocking PR/gate |
| --- | --- | --- | --- |
| Detailed capability/permission matrix approved | Approved for `ACE-F02` through `ACE-F14` | Jean-Fidele Ntagengwa (Product & Engineering) | consumed by `ACE-F02` through `ACE-F14` |
| Access-control/delegation ADR approved | Approved for `ACE-F02` through `ACE-F14` | Jean-Fidele Ntagengwa (Product & Engineering) | governs `ACE-F02` through `ACE-F14`, especially `ACE-F12` and `ACE-F14` |
| Student identity ADR approved | Open | Jean-Fidele Ntagengwa (Product & Engineering) | `ACE-F17`, `ACE-M15` through `ACE-M20`, then identity-dependent pilot gates |
| PACE correction model approved | Open | Jean-Fidele Ntagengwa (Product & Engineering) | `ACE-F16`, `ACE-O02`, `ACE-O03`, and `ACE-O09` through `ACE-O13` |
| RLS launch blockers assigned | Open | Technical Agent | `ACE-F03`, `ACE-F15` through `ACE-F22`, every add-on schema PR, `ACE-L05`, and `ACE-L09` |
| UK-only versus EU residency confirmed | Open | Jean-Fidele Ntagengwa (Product & Engineering), with Legal/Commercial review | child-data onboarding; `ACE-L04`, `ACE-L05`, and `ACE-L09` |
| Market-data licensing owner assigned | Open | Jean-Fidele Ntagengwa (Product & Engineering), with Legal/Commercial review | `ACE-MER01`, `ACE-MER12` through `ACE-MER14`, `ACE-MER17`, and `ACE-MER20` |
| Finance V1 payment scope confirmed | Open | Jean-Fidele Ntagengwa (Product & Engineering) | `ACE-FIN03` through `ACE-FIN13` |
| web-first versus mobile-parity release scope confirmed | Open | Jean-Fidele Ntagengwa (Product & Engineering) | `ACE-O13`, `ACE-O17`, `ACE-O19`, `ACE-M08` through `ACE-M11`, `ACE-M18`, `ACE-M19`, `ACE-L06`, and `ACE-L09`; add-on mobile gates where promised |
| pilot/UAT owners and delivery capacity agreed | Open | Jean-Fidele Ntagengwa (Product & Engineering), with Delivery | `ACE-L01`, `ACE-L08`, and `ACE-L09` |

## Deterministic validation contract

Run the committed repository check:

```bash
node scripts/validate-ace-access-matrix.mjs
```

It proves:

1. the header contains every required field;
2. there are exactly 68 unique method/path rows;
3. no required exact-route cell is blank;
4. there are exactly four unresolved add-on family rows;
5. the public route contract uses the corrected `reflections` spelling;
6. placeholder scans are empty.
