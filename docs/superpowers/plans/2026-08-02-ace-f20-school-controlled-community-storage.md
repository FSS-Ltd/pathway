# ACE-F20 School-Controlled Community Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver tenant-safe ACE Student Community storage owned by each school, with manual and automatic age-range groups, school-only moderation evidence, and no direct-message data shape.

**Architecture:** Add a dedicated AceCommunity model family, separate from NexSteps Home Community and academic Group records. A focused PostgreSQL migration enforces tenant locality, group-membership rules, author eligibility, evidence preservation, and forced tenant RLS. This foundation adds no endpoint or user interface.

**Tech Stack:** TypeScript, Prisma, PostgreSQL triggers and RLS, Jest integration tests, pnpm.

## Global Constraints

- The approved design is docs/superpowers/specs/2026-08-02-ace-f20-school-controlled-community-design.md.
- ACE Student Community and NexSteps Home Community must never share storage, permissions, participants, moderation, or visibility rules.
- Community is ACE core. Do not add pricing, Stripe, or an add-on entitlement.
- Tenant is the site and the canonical RLS boundary. Every Community table owns tenantId.
- The school controls enablement, groups, membership, staff participation, moderation, and retention. NexSteps has no Community-content access path.
- ace.community.spaces.manage is the standard group-management capability and ace.community.moderate is the protected moderation capability. Their runtime enforcement belongs to ACE-C19 and later.
- Students have no direct messages. Do not introduce participant, recipient, conversation, or one-to-one Community tables.
- Use additive migrations only, no new dependencies, and no NexSteps Home changes.
- Every new table must force RLS and have no PUBLIC, anon, or authenticated grant.

---

## File structure

| File | Responsibility |
| --- | --- |
| packages/db/prisma/schema.prisma | Community enums, models, and inverse tenant/user/child/identity relations. |
| packages/db/prisma/migrations/20260802150000_ace_school_community/migration.sql | DDL, composite foreign keys, constraints, triggers, RLS, and privilege revocations. |
| apps/api/src/community/tests/community.rls.e2e.spec.ts | Storage and RLS integration contract. |
| scripts/check-supabase-rls.mjs | Strict RLS required-table list. |
| docs/superpowers/specs/2026-08-02-ace-f20-school-controlled-community-design.md | Final implementation evidence after passing checks. |

## Model contract

~~~
type AceCommunityGroupMembershipMode = "MANUAL" | "AGE_RANGE";
type AceCommunityGroupStaffRole = "MEMBER" | "MODERATOR";
type AceCommunityContentVisibility = "VISIBLE" | "HIDDEN" | "REMOVED";
type AceCommunityReportReason = "GUIDELINE_BREACH" | "BULLYING" | "SAFETY" | "OTHER";
type AceCommunityModerationActionType = "HIDE" | "RESTORE" | "REMOVE";
~~~

A MANUAL group uses explicit child membership rows. An AGE_RANGE group uses inclusive bounds and calculates membership from Child.dateOfBirth, the tenant-local current date, and an active StudentIdentityLink. A staff member is a participant only when explicitly assigned to the group. A post or reply author is valid only when they are an eligible student or assigned staff member in the group.

### Task 1: Define the failing Community storage contract

**Files:**
- Create: apps/api/src/community/tests/community.rls.e2e.spec.ts

**Interfaces:**
- Consumes: prisma, runTransaction, withTenantRlsContext, Prisma.TransactionClient, isDatabaseAvailable, and requireDatabase.
- Produces: CommunityFixture, tenant and no-context helpers, insertion helpers, and focused assertions.

- [ ] **Step 1: Add the two-tenant fixture and context helpers**

Copy the RLS-role approach from apps/api/src/trips/tests/trips-slips.rls.e2e.spec.ts. Seed tenant A and tenant B, a current staff user, an unassigned staff user, a student user, and children with dates of birth at the relevant age boundaries.

~~~
async function withCommunityRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, callback);
}
~~~

Clean Community rows before the identity, child, tenant, org, and user fixture rows.

- [ ] **Step 2: Write failing policy and group-membership tests**

Test missing policy and disabled policy reject post creation with PostgreSQL 23514. Test manual membership accepts a selected child and rejects an unselected child. Test an AGE_RANGE group admits a student at the inclusive lower bound and rejects the student after they pass the inclusive upper bound.

~~~
await expectDatabaseRejection(
  tx,
  () => insertCommunityPost(tx, fixture, {
    groupId,
    authorUserId: fixture.studentAUserId,
  }),
  "23514",
);
~~~

- [ ] **Step 3: Write failing author, evidence, and safeguarding tests**

Cover all of the following:

- Unassigned staff cannot post.
- A student with an ended or revoked StudentIdentityLink cannot post.
- A reply belongs to the same group and tenant as its post.
- A report targets exactly one post or reply.
- Report evidence snapshots, moderation actions, and safeguarding references reject updates and deletes with PostgreSQL 55000.
- Hiding a post preserves the original body and any existing report evidence.
- A Concern for a child in another tenant cannot be referenced.

~~~
await expectDatabaseRejection(
  tx,
  () => updateModerationActionReason(tx, actionId, "changed after review"),
  "55000",
);
~~~

- [ ] **Step 4: Write the direct-message structural test and RLS read assertions**

Inspect Prisma DMMF Community model and field names. Fail if any contains participant, recipient, conversation, or directMessage, case-insensitively. Seed a valid tenant-A group, then assert tenant B and a no-context transaction return zero rows for every Community table.

~~~
for (const name of communityModelAndFieldNames()) {
  expect(name).not.toMatch(/participant|recipient|conversation|directmessage/i);
}
~~~

- [ ] **Step 5: Run the focused test in its red state**

Run:

~~~
pnpm --filter @pathway/api test:integration -- --runInBand community.rls
~~~

Expected: the suite fails because the AceCommunity Prisma models and database tables do not yet exist.

- [ ] **Step 6: Commit the red contract**

~~~
git add apps/api/src/community/tests/community.rls.e2e.spec.ts
git commit -m "test: define ACE Community storage contract"
~~~

### Task 2: Add the Prisma Community model family

**Files:**
- Modify: packages/db/prisma/schema.prisma

**Interfaces:**
- Consumes: Tenant, User, Child, StudentIdentity, StudentIdentityLink, SiteMembership, and Concern.
- Produces: AceCommunityPolicy, AceCommunityGroup, AceCommunityGroupChildMember, AceCommunityGroupStaffMember, AceCommunityPost, AceCommunityReply, AceCommunityReadCursor, AceCommunityReport, AceCommunityModerationAction, and AceCommunitySafeguardingReference.

- [ ] **Step 1: Add the five Community enums**

Add the values from the Model contract beside existing ACE enums. Do not add DIRECT, PRIVATE, ONE_TO_ONE, or PARTICIPANT values.

~~~
enum AceCommunityGroupMembershipMode {
  MANUAL
  AGE_RANGE
}

enum AceCommunityContentVisibility {
  VISIBLE
  HIDDEN
  REMOVED
}
~~~

- [ ] **Step 2: Add the policy, group, and membership models**

AceCommunityPolicy has tenantId as its primary key and communityEnabled with default false. Every other Community model has id, tenantId, timestamps, a unique composite id and tenantId key, and tenant-local indexes. Model child and staff membership separately.

~~~
model AceCommunityGroupChildMember {
  id        String   @id @default(uuid())
  tenantId  String
  groupId   String
  childId   String
  createdAt DateTime @default(now())

  group AceCommunityGroup @relation(fields: [groupId, tenantId], references: [id, tenantId], onDelete: Cascade)
  child Child @relation(fields: [childId, tenantId], references: [id, tenantId], onDelete: Restrict)

  @@unique([groupId, childId])
  @@index([tenantId, childId])
}
~~~

Add only required inverse relations on Tenant, User, Child, StudentIdentity, and Concern. Use named relations when a model points to User more than once.

- [ ] **Step 3: Add content, read-state, moderation, and safeguarding models**

Posts and replies both belong to one Community group. A report has nullable postId and replyId so the migration can enforce exactly one target. A safeguarding reference has nullable reportId and moderationActionId so the migration can enforce exactly one source. Moderation actions include moderator, action type, reason, report, evidence snapshot, and timestamp.

~~~
model AceCommunityReport {
  id               String   @id @default(uuid())
  tenantId         String
  postId           String?
  replyId          String?
  reportedByUserId String
  reason           AceCommunityReportReason
  evidenceSnapshot String   @db.Text
  createdAt        DateTime @default(now())

  @@unique([id, tenantId])
  @@index([tenantId, postId])
  @@index([tenantId, replyId])
}
~~~

Store only a Concern ID in AceCommunitySafeguardingReference. Do not store Concern text, a JSON copy, or another safeguarding payload.

- [ ] **Step 4: Generate Prisma**

Run:

~~~
pnpm db:generate
~~~

Expected: generation succeeds and Task 1’s DMMF test finds only the intended non-DM Community topology.

- [ ] **Step 5: Commit the Prisma topology**

~~~
git add packages/db/prisma/schema.prisma
git commit -m "feat: add ACE Community Prisma models"
~~~

### Task 3: Implement the migration, integrity triggers, and forced RLS

**Files:**
- Create: packages/db/prisma/migrations/20260802150000_ace_school_community/migration.sql

**Interfaces:**
- Consumes: Task 2 models, app.current_tenant_id(), Tenant.timezone, StudentIdentityLink, SiteMembership, Child, and Concern.
- Produces: additive tables, constraints, trigger functions, append-only moderation evidence, and forced tenant RLS for every AceCommunity table.

- [ ] **Step 1: Create enum types and tables in dependency order**

Create policy, group, child and staff memberships, post, reply, read cursor, report, moderation action, and safeguarding reference in that order. Use the Prisma enum names as PostgreSQL enum names. Use RESTRICT for content and evidence facts; use CASCADE only for membership rows that cannot exist without their group.

~~~
CREATE TABLE "AceCommunityPolicy" (
  "tenantId" TEXT NOT NULL,
  "communityEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AceCommunityPolicy_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "AceCommunityPolicy_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
~~~

- [ ] **Step 2: Add mode, target, and tenant constraints**

Require AGE_RANGE groups to have two non-negative ordered bounds. Require MANUAL groups to have neither bound. Add unique id and tenantId target keys and composite same-tenant foreign keys for every Community cross-table relation. Keep the direct foreign key to Concern by its existing single-column ID, then use the safeguarding-reference trigger to verify the Concern's child belongs to the same tenant. Use checks for exactly one report target and exactly one safeguarding-reference source.

~~~
CONSTRAINT "AceCommunityGroup_membership_mode_check" CHECK (
  ("membershipMode" = 'MANUAL' AND "minimumAge" IS NULL AND "maximumAge" IS NULL)
  OR (
    "membershipMode" = 'AGE_RANGE'
    AND "minimumAge" IS NOT NULL
    AND "maximumAge" IS NOT NULL
    AND "minimumAge" >= 0
    AND "maximumAge" >= "minimumAge"
  )
),
CONSTRAINT "AceCommunityReport_exactly_one_target_check" CHECK (
  ("postId" IS NOT NULL)::integer + ("replyId" IS NOT NULL)::integer = 1
)
~~~

- [ ] **Step 3: Implement the membership and author triggers**

Create SECURITY DEFINER functions with empty search_path and revoke PUBLIC execution. Implement these four functions:

| Function | Table | Rejection |
| --- | --- | --- |
| app.assert_ace_community_child_member_mode | AceCommunityGroupChildMember | A child row in an AGE_RANGE group or another tenant. |
| app.assert_ace_community_staff_member | AceCommunityGroupStaffMember | A user without an active SiteMembership in the group tenant. |
| app.assert_ace_community_author | AceCommunityPost and AceCommunityReply | Missing or disabled policy, inactive group, invalid reply group, unassigned staff, ended/revoked student link, manual non-member, or age-ineligible student. |
| app.assert_ace_community_safeguarding_reference | AceCommunitySafeguardingReference | A Concern whose child belongs to another tenant. |

Evaluate age ranges in the tenant IANA timezone, defaulting to UTC only if Tenant.timezone is null. Do not persist calculated age memberships.

~~~
IF NOT EXISTS (
  SELECT 1
  FROM app."AceCommunityPolicy"
  WHERE "tenantId" = NEW."tenantId" AND "communityEnabled"
) THEN
  RAISE EXCEPTION 'Community is disabled for this tenant'
    USING ERRCODE = 'check_violation';
END IF;
~~~

- [ ] **Step 4: Preserve evidence and make moderation facts immutable**

Reports, moderation actions, and safeguarding references reject all updates and deletes with PostgreSQL 55000. Post and reply visibility updates may change only visibility metadata, never the original body. Reported content cannot be directly deleted.

~~~
IF TG_OP IN ('UPDATE', 'DELETE') THEN
  RAISE EXCEPTION 'Community moderation evidence is immutable'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END IF;
~~~

- [ ] **Step 5: Apply forced tenant RLS and remove public grants**

Apply the existing array-loop RLS pattern to all ten Community tables. Use app.current_tenant_id() only. Do not create a NexSteps, platform, cross-tenant, anon, authenticated, or PUBLIC exception. Revoke PUBLIC, anon, and authenticated privileges exactly as the identity migration does.

~~~
FOREACH tbl IN ARRAY ARRAY[
  'AceCommunityPolicy', 'AceCommunityGroup', 'AceCommunityGroupChildMember',
  'AceCommunityGroupStaffMember', 'AceCommunityPost', 'AceCommunityReply',
  'AceCommunityReadCursor', 'AceCommunityReport', 'AceCommunityModerationAction',
  'AceCommunitySafeguardingReference'
] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
END LOOP;
~~~

- [ ] **Step 6: Apply the migration**

Run:

~~~
pnpm db:migrate
~~~

Expected: the migration applies once, Prisma remains in sync, and Task 1 tests now reach trigger and constraint assertions.

- [ ] **Step 7: Commit the database enforcement layer**

~~~
git add packages/db/prisma/migrations/20260802150000_ace_school_community/migration.sql
git commit -m "feat: enforce ACE Community storage boundaries"
~~~

### Task 4: Complete RLS coverage and focused verification

**Files:**
- Modify: apps/api/src/community/tests/community.rls.e2e.spec.ts
- Modify: scripts/check-supabase-rls.mjs

**Interfaces:**
- Consumes: the Task 3 database contract.
- Produces: a deterministic Community integration suite and strict RLS inventory.

- [ ] **Step 1: Complete every integration assertion**

Run the Task 1 suite against the migrated database. The final suite must assert missing and disabled policy, manual membership, automatic age entry and exit, staff assignment, active student identity, same-group reply ownership, one report target, immutable evidence, preserved hidden content, tenant-safe Concern reference, tenant-B reads, no-context reads, and the DMMF no-DM proof.

~~~
expect(tenantBCounts).toEqual([{
  policy: 0n,
  group: 0n,
  childMember: 0n,
  staffMember: 0n,
  post: 0n,
  reply: 0n,
  readCursor: 0n,
  report: 0n,
  moderationAction: 0n,
  safeguardingReference: 0n,
}]);
~~~

- [ ] **Step 2: Add the Community tables to the strict RLS list**

Append the following exact values to REQUIRED_RLS_TABLES in scripts/check-supabase-rls.mjs.

~~~
"AceCommunityPolicy",
"AceCommunityGroup",
"AceCommunityGroupChildMember",
"AceCommunityGroupStaffMember",
"AceCommunityPost",
"AceCommunityReply",
"AceCommunityReadCursor",
"AceCommunityReport",
"AceCommunityModerationAction",
"AceCommunitySafeguardingReference",
~~~

- [ ] **Step 3: Run generation, focused tests, and strict RLS**

Run:

~~~
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand community.rls
pnpm supabase:rls:check -- --strict
~~~

Expected: every command succeeds. The RLS check confirms every required Community table exists, enables and forces RLS, and has no public grant.

- [ ] **Step 4: Commit the verification coverage**

~~~
git add apps/api/src/community/tests/community.rls.e2e.spec.ts scripts/check-supabase-rls.mjs
git commit -m "test: cover ACE Community tenant boundaries"
~~~

### Task 5: Complete delivery verification and record evidence

**Files:**
- Modify: docs/superpowers/specs/2026-08-02-ace-f20-school-controlled-community-design.md
- Update through Graphify: graphify-out/graph.json and graphify-out/GRAPH_REPORT.md

**Interfaces:**
- Consumes: passing Task 4 checks and the final implementation diff.
- Produces: a reviewable implementation record with current graph artifacts.

- [ ] **Step 1: Inspect the complete ACE-F20 diff**

Run:

~~~
git diff --check fss/master...HEAD
git diff --stat fss/master...HEAD
git diff fss/master...HEAD -- packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/src/community scripts/check-supabase-rls.mjs
~~~

Expected: only ACE-F20 schema, migration, test, RLS-gate, and documentation changes appear. The diff must contain no Home Community change, payment change, generic chat model, public grant, or unrelated cleanup.

- [ ] **Step 2: Repeat the final verification**

Run:

~~~
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand community.rls
pnpm supabase:rls:check -- --strict
~~~

Expected: all commands exit successfully. If the integration database is unavailable, record the missing prerequisite and run every static check that does not require it.

- [ ] **Step 3: Refresh Graphify and inspect Community nodes**

Run:

~~~
graphify update .
rg -n -m 20 'AceCommunity|ACE-F20|school-controlled Community' graphify-out/graph.json
~~~

Expected: Graphify completes and the graph represents the final Community storage boundary. Also run the repository’s curated docs-aware Graphify workflow for the changed specification and plan.

- [ ] **Step 4: Mark the design implemented and commit the delivery record**

Change the design-spec status from Under Review to Implemented only after Steps 1 through 3 pass. Add the exact successful command results.

~~~
git add docs/superpowers/specs/2026-08-02-ace-f20-school-controlled-community-design.md graphify-out
git commit -m "docs: record ACE Community storage verification"
~~~

Do not include ignored Graphify files in the commit if repository policy excludes them; retain the command output in pull-request verification notes instead.
