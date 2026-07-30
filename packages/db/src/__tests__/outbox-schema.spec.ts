import { readFileSync } from "node:fs";
import path from "node:path";

const schema = readFileSync(
  path.resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const migration = readFileSync(
  path.resolve(
    process.cwd(),
    "prisma/migrations/20260729120000_transactional_outbox/migration.sql",
  ),
  "utf8",
);
const rlsGate = readFileSync(
  path.resolve(process.cwd(), "../../scripts/check-supabase-rls.mjs"),
  "utf8",
);

describe("transactional outbox schema contract", () => {
  it("stores one durable generic event for each organisation idempotency key", () => {
    expect(schema).toContain("model OutboxEvent");
    expect(schema).toMatch(/idempotencyKey\s+String\s*\n/);
    expect(schema).toContain("@@unique([orgId, idempotencyKey])");
    expect(schema).toMatch(/payload\s+Json/);
    expect(schema).toContain("@@index([orgId, createdAt])");
    expect(schema).toContain(
      "@@index([aggregateType, aggregateId, createdAt])",
    );
    expect(migration).toMatch(
      /CONSTRAINT "OutboxEvent_orgId_idempotencyKey_key"\s+UNIQUE \("orgId", "idempotencyKey"\)/,
    );
  });

  it("serializes and rejects overlapping unrevoked assignment windows without an extension", () => {
    expect(migration).toContain(
      "CREATE FUNCTION app.enforce_user_role_assignment_no_overlap()",
    );
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("hashtextextended");
    expect(migration).toContain(
      'existing."tenantId" IS NOT DISTINCT FROM $2',
    );
    expect(migration).toContain('IF NEW."revokedAt" IS NOT NULL THEN');
    expect(migration).toContain(
      'existing."startsAt" < COALESCE($5, \'\'infinity\'\'::timestamp)',
    );
    expect(migration).toContain(
      '$6 < COALESCE(existing."expiresAt", \'\'infinity\'\'::timestamp)',
    );
    expect(migration).toContain('FROM %I."UserRoleAssignment" AS existing');
    expect(migration).toContain("TG_TABLE_SCHEMA");
    expect(migration).toContain("ERRCODE = 'PRA01'");
    expect(migration).not.toContain("ERRCODE = 'exclusion_violation'");
    expect(migration).toContain(
      'CREATE TRIGGER "UserRoleAssignment_prevent_overlap"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "UserRoleAssignment_serialize_revocation"',
    );
    expect(migration).not.toContain("CREATE EXTENSION");
  });

  it("locks assignment writes and fails an upgrade with actionable overlap guidance before installing enforcement", () => {
    const lockPosition = migration.indexOf(
      'LOCK TABLE "UserRoleAssignment" IN SHARE ROW EXCLUSIVE MODE',
    );
    const preflightPosition = migration.indexOf(
      "Existing unrevoked role assignments overlap",
    );
    const triggerPosition = migration.indexOf(
      'CREATE TRIGGER "UserRoleAssignment_prevent_overlap"',
    );

    expect(lockPosition).toBeGreaterThan(-1);
    expect(preflightPosition).toBeGreaterThan(lockPosition);
    expect(triggerPosition).toBeGreaterThan(preflightPosition);
    expect(migration).toContain(
      'existing."tenantId" IS NOT DISTINCT FROM candidate."tenantId"',
    );
    expect(migration).toContain(
      'existing."startsAt" < COALESCE(candidate."expiresAt", \'infinity\'::timestamp)',
    );
    expect(migration).toContain(
      'candidate."startsAt" < COALESCE(existing."expiresAt", \'infinity\'::timestamp)',
    );
    expect(migration).toContain("Resolve the overlapping assignment history");
  });

  it("owns a partial composite index for the unrevoked overlap probe in raw SQL", () => {
    expect(migration).toContain(
      'CREATE INDEX "UserRoleAssignment_unrevoked_overlap_idx"',
    );
    expect(migration).toMatch(
      /ON "UserRoleAssignment"\(\s*"orgId",\s*"tenantId",\s*"userId",\s*"roleDefinitionId",\s*"startsAt",\s*"expiresAt"\s*\)/,
    );
    expect(migration).toContain('WHERE "revokedAt" IS NULL');
    expect(migration).toContain(
      "Prisma schema cannot express this partial index",
    );
    expect(schema).not.toContain(
      "UserRoleAssignment_unrevoked_overlap_idx",
    );
    expect(migration).not.toContain('app."UserRoleAssignment"');
  });

  it("adds immutable creation-order facts and a supporting R09 cursor index", () => {
    expect(schema).toMatch(
      /model UserRoleAssignment[\s\S]*createdAt\s+DateTime\s+@default\(now\(\)\)/,
    );
    expect(schema).toContain(
      "@@index([orgId, createdAt(sort: Desc), id(sort: Desc)])",
    );
    expect(migration).toContain(
      'ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    );
    expect(migration).toContain(
      'CREATE INDEX "UserRoleAssignment_orgId_createdAt_id_idx"',
    );
    expect(migration).toContain(
      'ON "UserRoleAssignment"("orgId", "createdAt" DESC, "id" DESC)',
    );
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION app.enforce_user_role_assignment_update()',
    );
    expect(migration).toContain('OLD."createdAt"');
    expect(migration).toContain('NEW."createdAt"');
  });

  it("widens only assignment SELECT when the trusted transaction-local list flag is on", () => {
    expect(migration).toContain(
      'DROP POLICY "UserRoleAssignment_rls_select" ON "UserRoleAssignment"',
    );
    expect(migration).toContain(
      "current_setting('app.assignment_org_read', true) = 'on'",
    );
    expect(migration).not.toContain(
      'DROP POLICY "UserRoleAssignment_rls_insert"',
    );
    expect(migration).not.toContain(
      'DROP POLICY "UserRoleAssignment_rls_update"',
    );
  });

  it("adds assignment-specific audit values without introducing another audit table", () => {
    expect(schema).toMatch(
      /enum AuditAction[\s\S]*ASSIGNMENT_CREATED[\s\S]*ASSIGNMENT_REVOKED/,
    );
    expect(schema).toMatch(
      /enum AuditEntityType[\s\S]*ROLE_ASSIGNMENT/,
    );
    expect(migration).toContain(
      "ALTER TYPE \"AuditAction\" ADD VALUE IF NOT EXISTS 'ASSIGNMENT_CREATED'",
    );
    expect(migration).toContain(
      "ALTER TYPE \"AuditEntityType\" ADD VALUE IF NOT EXISTS 'ROLE_ASSIGNMENT'",
    );
    expect(schema.match(/model AuditEvent/g)).toHaveLength(1);
  });

  it("derives organisation ownership from transaction context and forces RLS", () => {
    expect(migration).toContain(
      "\"orgId\" TEXT NOT NULL DEFAULT app.current_org_id()",
    );
    expect(migration).toContain(
      'ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain(
      'ALTER TABLE "OutboxEvent" FORCE ROW LEVEL SECURITY',
    );
    expect(migration).toContain('CREATE POLICY "OutboxEvent_rls"');
    expect(migration).toContain('"orgId" = app.current_org_id()');
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "OutboxEvent" FROM PUBLIC',
    );
    expect(rlsGate).toContain('"OutboxEvent"');
  });

  it("keeps committed events durable until lifecycle processing is added", () => {
    expect(migration).toContain(
      "Forward constraint: committed outbox events",
    );
    expect(migration).not.toContain("DELETE FROM");
    expect(migration).not.toContain("DROP TABLE");
  });
});
