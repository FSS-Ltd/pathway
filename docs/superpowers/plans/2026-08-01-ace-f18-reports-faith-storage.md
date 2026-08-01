# ACE-F18 Report and Faith Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-safe, immutable ACE progress-report publication and Faith content storage without exposing staff-only information.

**Architecture:** The migration uses separate report and Faith aggregates rather than a generic publication table. Database triggers and constraints make releases immutable, enforce report maker/checker approval, validate audience shapes, and retain tenant-scoped joins. RLS remains tenant-default; future services will apply staff and family capability checks to these records.

**Tech Stack:** Prisma schema, PostgreSQL migration and triggers, NestJS API Jest E2E tests, `@pathway/db` tenant RLS helpers, Node strict-RLS gate.

## Global Constraints

- Add no dependencies.
- Every new table has `tenantId`, `@@unique([id, tenantId])`, tenant indexes, and composite foreign keys for tenant-scoped relations.
- Enable and force RLS on every new table; revoke `PUBLIC`, `anon`, and `authenticated` table access.
- F18 tenant RLS prevents cross-tenant access and does not introduce authenticated-user context. A later API layer must resolve family visibility through current active `FULL` guardian-child relationships or active student identity links.
- Published report versions, Faith versions, and Faith audience snapshots are immutable. Corrections create later versions.
- Store private object keys only. Report PDFs use `tenants/<tenant-id>/reports/<report-version-id>.pdf`.
- Encrypt report compilations, staff notes, reviewer notes, and Faith reflections through `packages/db/src/pii-encryption.ts`.
- This PR adds database storage and verification only. It does not add routes, capability definitions, UI, PDF rendering, upload handling, or signed URLs.

## File Structure

- `packages/db/prisma/schema.prisma`: F18 enums, models, and reverse relations.
- `packages/db/prisma/migrations/<timestamp>_ace_reports_faith/migration.sql`: tables, constraints, triggers, RLS, and grants.
- `apps/api/src/reports/tests/reports-faith.rls.e2e.spec.ts`: report and Faith database-first E2E coverage.
- `scripts/check-supabase-rls.mjs`: strict RLS coverage for every F18 table.

---

### Task 1: Add report publication storage with a failing-first E2E contract

**Files:**
- Create: `apps/api/src/reports/tests/reports-faith.rls.e2e.spec.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_ace_reports_faith/migration.sql`

**Interfaces:**
- Consumes: `prisma`, `withTenantRlsContext`, `Prisma.TransactionClient`, F17 guardian relationships, F17 student links, `Child`, and `AcademicPeriod`.
- Produces: `AceTermReport`, `AceReportCompilation`, `AceReportDraft`, `AceReportReview`, and `AceTermReportVersion` for Tasks 2 and 3.

- [ ] **Step 1: Create a two-tenant report fixture and failing tests**

Follow the RLS role wrapper from `apps/api/src/identity/tests/identity-relationships.rls.e2e.spec.ts`. Seed two tenants, tenant-scoped children and academic periods, a `FULL` guardian, a `LIMITED` guardian, an active student identity link, an unrelated user, an author, and a reviewer.

```ts
async function withReportsRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
    return callback(tx);
  });
}
```

- [ ] **Step 2: Assert the report publication rules before any model exists**

Write raw-SQL helpers for report, compilation, draft, and review rows. Assert that a report author cannot approve their own draft, approval requires `IN_REVIEW`, and a distinct reviewer creates a guardian-visible immutable version with no student release.

```ts
await expectDatabaseRejection(
  () => approveReport(tx, { draftId, reviewerUserId: authorUserId }),
  "23514",
);
await approveReport(tx, { draftId, reviewerUserId });
expect(await getReportVersion(tx, reportId)).toMatchObject({
  guardianVisibleAt: expect.any(Date),
  studentVisibleAt: null,
});
```

- [ ] **Step 3: Add red immutability, private-key, and tenant-scope cases**

Assert that published payload, report target, source draft, supersession link, and document key cannot change. Assert a report cannot reference a cross-tenant child or academic period and accepts only the private key for its tenant and version.

```ts
await expectDatabaseRejection(
  () => tx.$executeRaw`
    UPDATE "AceTermReportVersion"
    SET "familyPayload" = ${JSON.stringify({ changed: true })}::jsonb
    WHERE "id" = ${versionId}
  `,
  "55000",
);
```

- [ ] **Step 4: Prove the report contract is red**

Run:

```bash
E2E_USE_GLOBAL_SETUP=true E2E_TENANT_RLS_ROLE=pathway_e2e_tenant_rls pnpm --filter @pathway/api exec jest -c jest.projects.config.ts --selectProjects e2e --runInBand reports-faith --no-cache
```

Expected: failure because `AceTermReport` does not exist.

- [ ] **Step 5: Add report enums and Prisma models**

Add `AceReportDraftStatus` (`DRAFT`, `IN_REVIEW`, `APPROVED`) and `AceReportReviewDecision` (`APPROVED`, `REJECTED`). Add the five models with tenant-composite relations to `Child`, `AcademicPeriod`, compilations, drafts, users, and prior versions. Store source compilations, staff notes, and review notes as encrypted text; keep the published family payload in a separate JSON column.

```prisma
model AceTermReportVersion {
  id                  String   @id @default(uuid())
  tenantId            String
  reportId            String
  sourceDraftId       String
  versionNumber       Int
  familyPayload       Json
  privateDocumentKey  String?
  guardianVisibleAt   DateTime
  studentVisibleAt    DateTime?
  supersedesVersionId String?

  @@unique([id, tenantId])
  @@unique([reportId, versionNumber])
  @@index([tenantId, reportId, guardianVisibleAt])
}
```

- [ ] **Step 6: Create report migration constraints and publication triggers**

Create report tables and composite foreign keys. Add a security-definer approval trigger in the `app` schema, with an empty `search_path` and revoked public execution. It must reject author self-approval, require `IN_REVIEW`, append the review, mark the draft approved, and create exactly one next immutable version in the same transaction. Reject direct version insertion outside that trigger, target swaps, published-version updates/deletes, and invalid document keys.

```sql
CREATE FUNCTION app.publish_approved_ace_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."decision" = 'APPROVED' THEN
    -- Require a distinct reviewer and IN_REVIEW draft, then append the version.
  END IF;
  RETURN NEW;
END;
$$;
```

- [ ] **Step 7: Add report RLS and make report tests green**

Enable and force RLS for all five report tables using the F17 tenant-policy pattern. Do not add authenticated-user context or family-specific RLS policies in this schema-only PR. Cover report release timestamps and the linked guardian/student facts in the E2E fixture; a later API service will apply the approved relationship predicates. Validate and generate Prisma, then rerun the focused E2E command until the report cases pass.

```bash
pnpm --filter @pathway/db exec dotenv -e ../../.env.test -- prisma validate
pnpm --filter @pathway/db exec dotenv -e ../../.env.test -- prisma generate
E2E_USE_GLOBAL_SETUP=true E2E_TENANT_RLS_ROLE=pathway_e2e_tenant_rls pnpm --filter @pathway/api exec jest -c jest.projects.config.ts --selectProjects e2e --runInBand reports-faith --no-cache
```

- [ ] **Step 8: Commit the report deliverable**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/src/reports/tests/reports-faith.rls.e2e.spec.ts
git commit -m "feat: add ACE report publication schema"
```

### Task 2: Add Faith content, age-band audience snapshots, and reflection storage

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/prisma/migrations/<timestamp>_ace_reports_faith/migration.sql`
- Modify: `apps/api/src/reports/tests/reports-faith.rls.e2e.spec.ts`

**Interfaces:**
- Consumes: Task 1 tenant fixture, active student link, `FULL` and `LIMITED` guardian relationships, and tenant RLS patterns.
- Produces: `FaithAgeBand`, `FaithContent`, `FaithContentDraft`, `FaithContentVersion`, `FaithContentAudience`, `FaithReadReceipt`, and `FaithReflection` for Task 3.

- [ ] **Step 1: Write failing Faith audience and snapshot cases**

Create `Juniors` and `Seniors` bands in tenant A and a band in tenant B. Write cases for multi-band publication, all-students publication, empty audiences, reversed ranges, duplicate all-students rows, mixed all-students plus band rows, and a cross-tenant band. Change a source band after publish and assert the version audience snapshot remains unchanged.

```ts
await expectDatabaseRejection(
  () => insertFaithAudience(tx, { versionId, type: "ALL_ACTIVE_STUDENTS" }),
  "23505",
);
await expectDatabaseRejection(
  () => insertFaithAudience(tx, { versionId, type: "AGE_BAND", ageBandId: tenantBbandId }),
  "23503",
);
```

- [ ] **Step 2: Write failing Faith identity and reflection cases**

Cover an age-eligible active student, an age-ineligible student, a child with no date of birth, a `LIMITED` guardian, a `FULL` guardian, an ended relationship, an unrelated user, duplicate read receipts, and guardian reflection release. Assert that a `FULL` guardian cannot read a reflection until its release timestamp is set.

```ts
expect(await countGuardianVisibleReflections(fullGuardianContext)).toBe(0);
await releaseReflection(tx, { reflectionId, releasedByUserId: staffUserId });
expect(await countGuardianVisibleReflections(fullGuardianContext)).toBe(1);
expect(await countGuardianVisibleReflections(limitedGuardianContext)).toBe(0);
```

- [ ] **Step 3: Prove the Faith contract is red**

Run the focused Task 1 Jest command. Expected: new assertions fail because `FaithAgeBand` and related tables do not exist.

- [ ] **Step 4: Add Faith enums and Prisma models**

Add `FaithContentAudienceType` (`ALL_ACTIVE_STUDENTS`, `AGE_BAND`) and a draft status enum (`DRAFT`, `PUBLISHED`). Model the tenant-owned age band, logical content record, draft, immutable content version, audience snapshot, unique read receipt, and unique encrypted reflection.

```prisma
model FaithContentAudience {
  id                    String                   @id @default(uuid())
  tenantId              String
  faithContentVersionId String
  type                  FaithContentAudienceType
  sourceAgeBandId       String?
  ageBandName           String?
  minimumAge            Int?
  maximumAge            Int?

  @@unique([id, tenantId])
  @@index([tenantId, faithContentVersionId])
}
```

- [ ] **Step 5: Add Faith tables, checks, and immutable audience triggers**

Add all seven Faith tables to the focused migration with tenant-composite foreign keys, direct tenant indexes, age-range checks, one receipt per student/version, one reflection per student/version, and unique version numbers. Use a deferred constraint trigger to reject an empty published audience, all-students plus a band, incomplete band snapshots, and snapshots that do not match their source band at publication. Reject published version, audience, identity target, and released reflection-body mutations.

```sql
CREATE CONSTRAINT TRIGGER "FaithContentAudience_validate_version"
AFTER INSERT OR UPDATE OR DELETE ON "FaithContentAudience"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.validate_faith_content_audience();
```

- [ ] **Step 6: Add Faith RLS and release-data coverage**

Enable and force RLS for every Faith table. Do not add authenticated-user context or family-specific RLS policies in this schema-only PR. Cover age eligibility inputs, F17 relationship state, and reflection-release data in the fixture; a later API service will evaluate the approved current-user, relationship, age, and capability predicates.

- [ ] **Step 7: Validate and make the complete focused suite green**

Run:

```bash
pnpm --filter @pathway/db exec dotenv -e ../../.env.test -- prisma validate
pnpm --filter @pathway/db exec dotenv -e ../../.env.test -- prisma generate
E2E_USE_GLOBAL_SETUP=true E2E_TENANT_RLS_ROLE=pathway_e2e_tenant_rls pnpm --filter @pathway/api exec jest -c jest.projects.config.ts --selectProjects e2e --runInBand reports-faith --no-cache
```

Expected: report and Faith cases pass after a fresh migration reset.

- [ ] **Step 8: Commit the Faith deliverable**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/src/reports/tests/reports-faith.rls.e2e.spec.ts
git commit -m "feat: add ACE Faith publication schema"
```

### Task 3: Gate F18 with strict RLS, full verification, review, and one PR

**Files:**
- Modify: `scripts/check-supabase-rls.mjs`
- Modify: `apps/api/src/reports/tests/reports-faith.rls.e2e.spec.ts`

**Interfaces:**
- Consumes: all report and Faith tables from Tasks 1 and 2.
- Produces: strict RLS enforcement and a review-ready F18 branch.

- [ ] **Step 1: Add all F18 tables to the strict RLS gate**

Add every report and Faith table to `REQUIRED_RLS_TABLES` and the forced-RLS query:

```js
"AceTermReport", "AceReportCompilation", "AceReportDraft", "AceReportReview",
"AceTermReportVersion", "FaithAgeBand", "FaithContent", "FaithContentDraft",
"FaithContentVersion", "FaithContentAudience", "FaithReadReceipt", "FaithReflection",
```

- [ ] **Step 2: Add absent-context and tenant-B assertions**

For every F18 table, assert the tenant-B RLS role and a connection with no tenant context both read zero rows.

```ts
for (const tableName of F18_TABLES) {
  const [{ count }] = await noContext.$queryRawUnsafe<CountRow[]>(
    `SELECT count(*)::int AS count FROM "${tableName}"`,
  );
  expect(count).toBe(0);
}
```

- [ ] **Step 3: Run the strict RLS gate and quality checks**

Run:

```bash
SUPABASE_RLS_GATE_ACCEPTED=true pnpm exec dotenv -e .env.test -- pnpm supabase:rls:check -- --strict
pnpm --filter @pathway/api typecheck
pnpm --filter @pathway/api lint
pnpm -r typecheck
pnpm -r lint
pnpm test:unit
git diff --check
```

Expected: all F18 requirements pass. The existing accepted baseline RLS warning may remain, but it must not waive any F18 table.

- [ ] **Step 4: Update the graph and inspect the final scope**

Run:

```bash
graphify update .
git diff --check
git diff --stat fss/master...HEAD
```

Expected: graph rebuild succeeds and the diff contains only F18 schema, migration, test, RLS-gate, design, and plan artifacts.

- [ ] **Step 5: Obtain independent review and resolve security findings**

Review tenant composite foreign keys, direct publication bypasses, maker/checker enforcement, immutable versions, private-key validation, age-band snapshots, reflection release, and RLS. Fix every P0 or P1 finding, then rerun the focused E2E suite and strict RLS gate.

- [ ] **Step 6: Commit verification changes and follow the single-PR rule**

```bash
git add scripts/check-supabase-rls.mjs apps/api/src/reports/tests/reports-faith.rls.e2e.spec.ts packages/db/prisma/schema.prisma packages/db/prisma/migrations docs/superpowers/plans/2026-08-01-ace-f18-reports-faith-storage.md
git commit -m "feat: complete ACE report and Faith storage"
```

Push only `feat/ace-report-faith-schema`, create one ready PR to `master`, wait for every GitHub check and review finding to clear, squash-merge only while the PR is cleanly mergeable, and verify the merge commit is on `fss/master` before selecting the next ACE stage.

## Plan self-review

- Spec coverage: Task 1 covers report compilation, staff/family separation, maker/checker approval, immutable versions, guardian release, student release, supersession, and document-key validation. Task 2 covers school-defined multi-band Faith audiences, snapshots, identity eligibility, receipts, and reflections. Task 3 covers strict RLS, missing context, quality gates, review, and sequential PR handling.
- Placeholder scan: no incomplete or deferred implementation instructions remain.
- Type consistency: model names, table names, tenant-scoped relations, and test paths remain consistent across every task.
