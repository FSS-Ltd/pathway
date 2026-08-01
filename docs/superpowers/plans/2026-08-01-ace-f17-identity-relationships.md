# ACE-F17 Identity Relationships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-safe student identities, guardian-child relationships,
student portal policy, and an invitation lifecycle without granting data access
from authentication alone.

**Architecture:** Reuse the global `User` and `UserIdentity` models for Auth0
provider subjects. Add tenant-scoped role identities and child relationships
with direct tenant columns and tenant-inclusive composite foreign keys. Store
invitation lifecycle timestamps without a raw token. Enforce student portal
policy and active-link cardinality in PostgreSQL, then protect every new table
with forced tenant RLS.

**Tech Stack:** Prisma schema and generated client, PostgreSQL migration SQL,
Nest API E2E Jest suite, `@pathway/db` tenant transaction context, strict RLS
verifier.

## Global Constraints

- Do not add a second provider-subject table. `UserIdentity` remains the only
  Auth0 identity abstraction.
- Authentication, `User`, `SiteMembership`, and staff roles alone never grant
  guardian or student child-data access.
- Each new tenant-owned table has `tenantId`, forced RLS, and a fail-closed
  tenant policy. Relationship tables also use `@@unique([id, tenantId])`;
  `StudentPortalPolicy` uses `tenantId` as its one-row-per-tenant primary key.
- Guardian relations support multiple guardians per child and multiple children
  per guardian.
- Student links require `StudentPortalPolicy.studentPortalEnabled = true` and
  allow one active link per child and student identity.
- Invitation records retain expiry, acceptance, and revocation facts but store
  no raw reusable token.
- Use `withTenantRlsContext` for all database tests and set the enforced E2E
  role when `E2E_USE_GLOBAL_SETUP=true`.

---

### Task 1: Define failing tenant-scope and lifecycle tests

**Files:**

- Create: `apps/api/src/identity/tests/identity-relationships.rls.e2e.spec.ts`

**Interfaces:**

- Consumes: `prisma`, `withTenantRlsContext`, `Prisma.TransactionClient`, and
  `PrismaClientType` from `@pathway/db`.
- Produces: A database-level acceptance suite for the schema introduced by
  Task 2. It proves the required failure modes independently of API routes.

- [ ] **Step 1: Add raw-SQL helpers and a two-tenant fixture**

Create a fixture with two orgs, two tenants, three children, three global users,
and a helper that executes under the production tenant transaction path:

```ts
async function withIdentityRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    if (process.env.E2E_USE_GLOBAL_SETUP === "true") {
      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
    }
    return callback(tx);
  });
}

async function expectDatabaseRejection(
  operation: () => Promise<unknown>,
  postgresCode: string,
): Promise<void> {
  await expect(operation()).rejects.toMatchObject({
    code: "P2010",
    meta: { code: postgresCode },
  });
}
```

Create users before enabling the forced role. Create tenant A and tenant B
children using their correct tenant context. Include a cleanup helper that
truncates only F17 tables if `to_regclass('app."StudentPortalPolicy"')` exists.

- [ ] **Step 2: Write the failing approved-model tests**

Write these tests using `INSERT` statements against the planned tables:

```ts
it("allows two guardians for one child and one guardian for two children", async () => {
  // Insert a tenant-A GuardianIdentity for each parent and create relationships
  // parent A -> child A, parent B -> child A, parent A -> child A2.
  // Query inside tenant A and expect exactly three relationships.
});

it("requires enabled student policy and one active student link", async () => {
  // Insert disabled StudentPortalPolicy and StudentIdentity, then expect a
  // StudentIdentityLink insert to reject with 23514.
  // Enable the policy, insert one link, then expect a second active link for
  // the same child to reject with 23505.
});

it("rejects cross-tenant identity and relationship joins", async () => {
  // Attempt tenant-B child references from tenant-A GuardianIdentity and
  // StudentIdentityLink records. Expect 23503 composite-FK failures.
});

it("retains but rejects invalid invitation lifecycle transitions", async () => {
  // An acceptedAt value later than expiresAt must reject with 23514.
  // A revoked invitation must reject a later acceptedAt update with 23514.
});

it("fails closed with forced tenant RLS", async () => {
  // Insert tenant-A relation, then read as tenant B and expect zero rows.
  // Under the enforced database role, query without app.tenant_id and expect
  // zero rows from each F17 table.
});
```

Also assert that a global `User` with no `GuardianChildRelationship` and no
`StudentIdentityLink` has no derived child scope. The test must use the
relationship tables, not `User.children` or `SiteMembership`.

- [ ] **Step 3: Run the focused suite and verify the expected red state**

Run:

```bash
E2E_USE_GLOBAL_SETUP=true E2E_TENANT_RLS_ROLE=pathway_e2e_tenant_rls \
pnpm --filter @pathway/api exec jest -c jest.projects.config.ts \
  --selectProjects e2e --runInBand identity-relationships --no-cache
```

Expected: FAIL because `StudentPortalPolicy` and the other F17 tables do not
exist. Do not change production code until the failure names the missing F17
schema.

### Task 2: Add the F17 Prisma schema and focused migration

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260801130000_ace_identity_relationships/migration.sql`

**Interfaces:**

- Consumes: existing `User`, `Tenant`, `Child`, and `UserIdentity` models.
- Produces: `StudentPortalPolicy`, `GuardianIdentity`, `StudentIdentity`,
  `StudentIdentityLink`, `GuardianChildRelationship`, and
  `FamilyIdentityInvite` Prisma delegates and database tables.

- [ ] **Step 1: Add the minimal enums and Prisma models**

Add `GuardianLegalAccess` and `FamilyIdentityTarget` enums. Add model fields
and relations using these essential signatures:

```prisma
model StudentPortalPolicy {
  tenantId              String  @id
  studentPortalEnabled  Boolean @default(false)
  tenant                Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model GuardianIdentity {
  id       String @id @default(uuid())
  tenantId String
  userId   String
  @@unique([id, tenantId])
  @@unique([tenantId, userId])
}

model StudentIdentityLink {
  id                String   @id @default(uuid())
  tenantId          String
  studentIdentityId String
  childId           String
  linkedAt          DateTime @default(now())
  endedAt           DateTime?
  revokedAt         DateTime?
  revokedByUserId   String?
  revocationReason  String?
  @@unique([id, tenantId])
}
```

Add equivalent tenant-scoped `StudentIdentity`, `GuardianChildRelationship`,
and `FamilyIdentityInvite` models. Every relation to `Child`, identity, or
tenant-owned record uses matching composite `fields` and `references` arrays.
Add reverse relation fields to `Tenant`, `User`, and `Child`. Use explicit
relation names where a model references `User` more than once.

- [ ] **Step 2: Implement the migration and database invariants**

Create the migration with these concrete elements:

```sql
CREATE TYPE "GuardianLegalAccess" AS ENUM ('FULL', 'LIMITED', 'NONE');
CREATE TYPE "FamilyIdentityTarget" AS ENUM ('GUARDIAN', 'STUDENT');

CREATE UNIQUE INDEX "StudentIdentityLink_active_child_key"
  ON "StudentIdentityLink" ("tenantId", "childId")
  WHERE "endedAt" IS NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "StudentIdentityLink_active_identity_key"
  ON "StudentIdentityLink" ("tenantId", "studentIdentityId")
  WHERE "endedAt" IS NULL AND "revokedAt" IS NULL;
```

Use PostgreSQL check constraints to require a non-blank revocation reason when
`revokedAt` is set, prohibit `acceptedAt` later than `expiresAt`, and prohibit
an invitation being both accepted and revoked. Use a short, explicit name for
every multi-column constraint so PostgreSQL identifier truncation cannot merge
constraint names.

Create `app.require_student_portal_link_policy()` as a `SECURITY DEFINER`
trigger function with `SET search_path = ''`. On `StudentIdentityLink` insert
and on changes to its tenant or active lifecycle state, it must require one
`StudentPortalPolicy` row for `NEW.tenantId` with `studentPortalEnabled = true`.
Raise `check_violation` when absent or disabled. Revoke public execution of the
function and attach a `BEFORE INSERT OR UPDATE` trigger.

Enable and force RLS on every F17 table. Use the standard policy shape:

```sql
ALTER TABLE "GuardianChildRelationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuardianChildRelationship" FORCE ROW LEVEL SECURITY;
CREATE POLICY "GuardianChildRelationship_tenant_isolation"
  ON "GuardianChildRelationship"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
```

Repeat it for all five relationship tables and `StudentPortalPolicy`. Revoke
table privileges from `PUBLIC`, `anon`, and `authenticated`, following F16's
migration convention.

- [ ] **Step 3: Validate the schema and generate the client**

Run:

```bash
pnpm --filter @pathway/db exec dotenv -e ../../.env.test -- prisma validate
pnpm --filter @pathway/db run prisma:generate
```

Expected: both commands exit 0. Resolve Prisma relation ambiguity or composite
foreign-key errors before applying the migration.

### Task 3: Make the identity suite green and register strict RLS coverage

**Files:**

- Modify: `apps/api/src/identity/tests/identity-relationships.rls.e2e.spec.ts`
- Modify: `scripts/check-supabase-rls.mjs`

**Interfaces:**

- Consumes: F17 tables and `withTenantRlsContext` from Task 2.
- Produces: deterministic migration, integrity, tenant-isolation, and
  missing-context evidence for the F17 schema.

- [ ] **Step 1: Add every F17 table to the strict RLS inventory**

Append these exact table names to both `REQUIRED_RLS_TABLES` and the explicit
`c.relname IN (...)` forced-RLS query:

```js
"StudentPortalPolicy",
"GuardianIdentity",
"StudentIdentity",
"StudentIdentityLink",
"GuardianChildRelationship",
"FamilyIdentityInvite",
```

- [ ] **Step 2: Apply the migration and run the red suite again**

Run the focused E2E command from Task 1. Expected: the original missing-table
failure is gone. Fix only migration, model, or test-fixture defects revealed by
the approved constraints. The tests must stay focused on database behaviour,
not mocked guards or controllers.

- [ ] **Step 3: Verify the green suite and strict RLS verifier**

Run:

```bash
E2E_USE_GLOBAL_SETUP=true E2E_TENANT_RLS_ROLE=pathway_e2e_tenant_rls \
pnpm --filter @pathway/api exec jest -c jest.projects.config.ts \
  --selectProjects e2e --runInBand identity-relationships --no-cache
pnpm supabase:rls:check -- --strict
```

Expected: focused E2E suite passes after all migrations apply, and the strict
RLS verifier confirms the six F17 tables are enabled, forced, and free of
public grants.

- [ ] **Step 4: Run workspace verification and commit the feature**

Run:

```bash
pnpm -r typecheck
pnpm -r lint
pnpm test:unit
git diff --check
```

Commit the schema, migration, strict-RLS inventory, focused test suite, design
specification, and this implementation plan:

```bash
git add packages/db/prisma/schema.prisma \
  packages/db/prisma/migrations/20260801130000_ace_identity_relationships/migration.sql \
  apps/api/src/identity/tests/identity-relationships.rls.e2e.spec.ts \
  scripts/check-supabase-rls.mjs \
  docs/superpowers/specs/2026-08-01-ace-f17-identity-relationships-design.md \
  docs/superpowers/plans/2026-08-01-ace-f17-identity-relationships.md
git commit -m "feat: add ACE identity relationship schema"
```

## Post-implementation review gate

- Request an independent review against the approved design and this plan.
- Resolve every P0 and P1 finding, repeating focused E2E and relevant workspace
  checks after each correction.
- Refresh Graphify after code changes, push the branch, raise the F17 PR, and
  merge only when every GitHub check is complete, successful, and the PR is
  cleanly mergeable.
