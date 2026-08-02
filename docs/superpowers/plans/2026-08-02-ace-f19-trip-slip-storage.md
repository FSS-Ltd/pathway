# ACE-F19 Trip and Permission-Slip Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-safe trip, configurable child checkpoint attendance, and permission-slip storage for ACE-F19.

**Architecture:** A `Trip` owns mutable, ordered `TripCheckpoint` records and each checkpoint owns one explicit attendance mark per child. Permission slips use mutable drafts and immutable published versions, with frozen child-recipient rows and responses bound to the exact version hash and guardian-child relationship. The migration owns database constraints, immutability, actor membership, and forced tenant RLS.

**Tech Stack:** Prisma schema, PostgreSQL migration SQL, Jest integration tests, established Prisma field encryption, Supabase RLS gate.

## Global Constraints

- Every added table carries `tenantId`, has forced tenant RLS, and exposes no public, anonymous, or authenticated-table grant.
- Checkpoints are named and ordered per trip; they are child-only and staff may add or reorder them during the trip.
- A checkpoint-child pair has one explicit present/absent mark; staff attendance remains out of scope.
- Published consent wording, recipients, guardian responses, and exceptions are immutable and reproducible.
- Sensitive response payloads and exception reasons use the existing field-encryption layer.
- Do not change the user-owned `apps/nexsteps-home/expo-env.d.ts` file.

---

### Task 1: Define the ACE-F19 storage contract in an integration test

**Files:**

- Create: `apps/api/src/trips/tests/trips-slips.rls.e2e.spec.ts`

**Interfaces:**

- Consumes: `withTenantRlsContext`, `GuardianChildRelationship`, `Child`, `User`, and `SiteMembership`.
- Produces: executable expectations for `Trip`, `TripCheckpoint`, `TripCheckpointAttendance`, `PermissionSlip`, `PermissionSlipVersion`, `PermissionSlipRecipient`, `PermissionSlipResponse`, `PermissionSlipException`, and `PermissionSlipReminder`.

- [ ] **Step 1: Write the failing checkpoint test**

Create tenant A/B fixtures, a staff user for each tenant, and children in each tenant. Insert a tenant-A trip and five labelled checkpoints. Mark one tenant-A child at each checkpoint, then add a sixth checkpoint after the first five.

```ts
expect(checkpoints.map((checkpoint) => checkpoint.label)).toEqual([
  "Before boarding",
  "Arrival",
  "Lunch",
  "Before departure",
  "School return",
  "Register at gallery",
]);
expect(attendanceCount).toBe(5n);
```

Also assert `23505` for duplicate trip checkpoint sequence and duplicate checkpoint-child attendance, and `23503` for a cross-tenant checkpoint relation.

- [ ] **Step 2: Write the failing consent and exception tests**

Create a draft version and recipient, publish it with a 64-character SHA-256 hash, then assert a subsequent content update fails with `55000`. Insert a material successor that explicitly sets `requiresReconsent` to `true`; assert the opposite pairing is rejected with `23514`.

```ts
await expectDatabaseRejection(
  () => updatePublishedVersionContent(versionId),
  "55000",
);
await expectDatabaseRejection(
  () => insertVersion({
    changeClassification: "MATERIAL",
    requiresReconsent: false,
  }),
  "23514",
);
```

Insert an accepted response using the recipient, child, guardian relationship, and version hash. Assert duplicate `(version, relationship, idempotencyKey)` responses fail with `23505`, a mismatched child relationship fails with `23503`, and a physical/telephone exception requires staff actor, non-empty reason, and staff witness.

- [ ] **Step 3: Write the failing forced-RLS test**

Under tenant B and with no RLS context, count every ACE-F19 table. Each count must be `0n` after tenant A data exists.

```ts
expect(tenantBCounts).toEqual([
  {
    trip: 0n,
    checkpoint: 0n,
    checkpointAttendance: 0n,
    permissionSlip: 0n,
    version: 0n,
    recipient: 0n,
    response: 0n,
    exception: 0n,
    reminder: 0n,
  },
]);
```

- [ ] **Step 4: Run the test and verify RED**

Run: `pnpm --filter @pathway/api test:integration -- --runInBand trips-slips.rls`

Expected: the test reaches a missing `Trip` relation/table failure because ACE-F19 storage does not yet exist.

### Task 2: Add Prisma models and encrypted sensitive fields

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/pii-encryption.ts`
- Modify: `packages/db/src/__tests__/pii-encryption.spec.ts`

**Interfaces:**

- Consumes: tenant-scoped `Child`, `User`, and `GuardianChildRelationship` composite keys.
- Produces: Prisma delegates and relations for the Task 1 raw SQL contract.

- [ ] **Step 1: Add focused enums and models**

Add `PermissionSlipChangeClassification`, `PermissionSlipResponseDecision`, and `PermissionSlipExceptionSource`. Add the nine tenant-scoped models from Task 1. Include `TripCheckpoint.position` and `TripCheckpointAttendance.present`; do not add a fixed checkpoint-type enum or staff attendance relation.

```prisma
model TripCheckpoint {
  id        String @id @default(uuid())
  tenantId  String
  tripId    String
  label     String
  position  Int
  plannedAt DateTime?

  @@unique([tenantId, tripId, position])
}
```

Connect responses to a recipient, child, guardian-child relationship, and version hash through compound relation keys. Add the additional compound unique key to `GuardianChildRelationship` required for that relationship-safe response foreign key.

- [ ] **Step 2: Register sensitive fields and write the focused unit test**

Register `PermissionSlipResponse.responsePayload` and `PermissionSlipException.reason` in `ENCRYPTED_STRING_FIELDS`. Extend the existing fake Prisma-client test to prove both values are ciphertext at the query boundary and plaintext to the caller.

```ts
expect(isEncryptedField(capturedArgs?.data.responsePayload as string)).toBe(true);
expect(result.responsePayload).toBe("typed acknowledgement");
```

- [ ] **Step 3: Generate Prisma and verify type safety**

Run: `pnpm db:generate && pnpm --filter @pathway/db typecheck && pnpm --filter @pathway/db test -- --runInBand pii-encryption`

Expected: the new delegates/relations generate and encryption tests pass.

### Task 3: Add the migration and RLS gate coverage

**Files:**

- Create: `packages/db/prisma/migrations/20260802090000_ace_trips_permission_slips/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`

**Interfaces:**

- Consumes: Task 2 model names, compound keys, and encryption field names.
- Produces: database tables, constraints, triggers, forced tenant RLS, and RLS-gate coverage used by Task 1.

- [ ] **Step 1: Create additive tables, constraints, and indexes**

Use composite foreign keys to match all tenant-bearing relations. Enforce positive checkpoint positions, unique checkpoint-child attendance, date ordering, cancellation metadata completeness, non-empty labels/reasons, a SHA-256 version hash on publication, material-change/reconsent consistency, and response idempotency.

```sql
CONSTRAINT "TripCheckpoint_tenantId_tripId_position_key"
  UNIQUE ("tenantId", "tripId", "position"),
CONSTRAINT "TripCheckpointAttendance_tenant_checkpoint_child_key"
  UNIQUE ("tenantId", "tripCheckpointId", "childId")
```

- [ ] **Step 2: Add the required trigger guards**

Add a tenant-membership guard for staff actors and witnesses. Reject updates/deletes of published permission-slip versions, their frozen recipients, responses, and exceptions. Reject checkpoint deletion after attendance has been recorded through the restrictive foreign key.

```sql
IF OLD."publishedAt" IS NOT NULL THEN
  RAISE EXCEPTION 'Published permission-slip versions are immutable'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END IF;
```

- [ ] **Step 3: Add every model to the RLS gate**

Append every ACE-F19 table to `REQUIRED_RLS_TABLES` so missing, disabled, unforced, and publicly granted tables fail `supabase:rls:check`.

- [ ] **Step 4: Run the integration test and verify GREEN**

Run: `pnpm db:generate && pnpm --filter @pathway/api test:integration -- --runInBand trips-slips.rls`

Expected: all checkpoint, consent, exception, cross-tenant, and missing-context expectations pass.

### Task 4: Verify the complete change and update the graph

**Files:**

- Modify: `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` through `graphify update .`

- [ ] **Step 1: Run targeted and static checks**

Run:

```bash
pnpm --filter @pathway/db test -- --runInBand pii-encryption
pnpm --filter @pathway/api typecheck
pnpm --filter @pathway/api test:integration -- --runInBand trips-slips.rls
pnpm supabase:rls:check -- --strict
git diff --check
```

- [ ] **Step 2: Update the architecture graph**

Run: `graphify update .`

Expected: `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` describe the final codebase.

- [ ] **Step 3: Review and commit only ACE-F19 files**

Inspect the schema, migration, RLS gate, encryption configuration, and tests. Stage only these ACE-F19 files and commit them without including `apps/nexsteps-home/expo-env.d.ts`.
