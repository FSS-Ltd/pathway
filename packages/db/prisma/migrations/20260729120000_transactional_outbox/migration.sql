-- Minimal shared transactional outbox enqueue foundation. Dispatch, retry,
-- dead-letter handling, and broad retention policy remain owned by ACE-F22.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ASSIGNMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ASSIGNMENT_REVOKED';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'ROLE_ASSIGNMENT';

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL DEFAULT app.current_org_id(),
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboxEvent_orgId_idempotencyKey_key"
    UNIQUE ("orgId", "idempotencyKey"),
  CONSTRAINT "OutboxEvent_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "OutboxEvent_orgId_createdAt_idx"
  ON "OutboxEvent"("orgId", "createdAt");

CREATE INDEX "OutboxEvent_aggregateType_aggregateId_createdAt_idx"
  ON "OutboxEvent"("aggregateType", "aggregateId", "createdAt");

ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY "OutboxEvent_rls"
  ON "OutboxEvent"
  USING (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
  )
  WITH CHECK (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
  );

REVOKE ALL PRIVILEGES ON TABLE "OutboxEvent" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "OutboxEvent" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "OutboxEvent" FROM authenticated';
  END IF;
END;
$$;

-- R09 orders immutable assignment creation facts rather than effective-time
-- input. Existing assignment history receives one migration timestamp through
-- the default, and future rows are indexed for keyset pagination.
ALTER TABLE "UserRoleAssignment"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "UserRoleAssignment_orgId_createdAt_id_idx"
  ON "UserRoleAssignment"("orgId", "createdAt" DESC, "id" DESC);

-- The original fact-preservation trigger predates createdAt. Extend it here,
-- after the column exists, so the pagination key cannot be rewritten.
CREATE OR REPLACE FUNCTION app.enforce_user_role_assignment_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD."id",
    OLD."orgId",
    OLD."tenantId",
    OLD."userId",
    OLD."roleDefinitionId",
    OLD."assignedById",
    OLD."startsAt",
    OLD."expiresAt",
    OLD."createdAt"
  ) IS DISTINCT FROM ROW(
    NEW."id",
    NEW."orgId",
    NEW."tenantId",
    NEW."userId",
    NEW."roleDefinitionId",
    NEW."assignedById",
    NEW."startsAt",
    NEW."expiresAt",
    NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'Assignment facts cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."revokedAt" IS DISTINCT FROM NEW."revokedAt"
    OR OLD."revokedById" IS DISTINCT FROM NEW."revokedById"
  THEN
    IF OLD."revokedAt" IS NOT NULL
      OR OLD."revokedById" IS NOT NULL
      OR NEW."revokedAt" IS NULL
      OR NEW."revokedById" IS NULL
    THEN
      RAISE EXCEPTION 'Assignment revocation is immutable once recorded'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- R09 assignment inventory is organisation-wide only for the reviewed list
-- route. The API enables this custom setting transaction-locally after its
-- exact bootstrap access check; all other reads retain selected-site scope.
DROP POLICY "UserRoleAssignment_rls_select" ON "UserRoleAssignment";
CREATE POLICY "UserRoleAssignment_rls_select"
  ON "UserRoleAssignment"
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
    AND (
      current_setting('app.assignment_org_read', true) = 'on'
      OR "tenantId" IS NULL
      OR "tenantId" = app.current_tenant_id()
    )
  );

-- Prevent assignment writes while the upgrade checks history and installs the
-- overlap guard. SHARE ROW EXCLUSIVE conflicts with INSERT/UPDATE/DELETE while
-- allowing ordinary reads to continue.
LOCK TABLE "UserRoleAssignment" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "UserRoleAssignment" AS candidate
    JOIN "UserRoleAssignment" AS existing
      ON existing.id < candidate.id
      AND existing."orgId" = candidate."orgId"
      AND existing."tenantId" IS NOT DISTINCT FROM candidate."tenantId"
      AND existing."userId" = candidate."userId"
      AND existing."roleDefinitionId" = candidate."roleDefinitionId"
      AND existing."revokedAt" IS NULL
      AND candidate."revokedAt" IS NULL
      AND existing."startsAt" < COALESCE(candidate."expiresAt", 'infinity'::timestamp)
      AND candidate."startsAt" < COALESCE(existing."expiresAt", 'infinity'::timestamp)
  ) THEN
    RAISE EXCEPTION 'Existing unrevoked role assignments overlap'
      USING
        ERRCODE = 'PRA02',
        HINT = 'Resolve the overlapping assignment history, then rerun this migration.';
  END IF;
END;
$$;

-- Prisma schema cannot express this partial index. It is migration-owned and
-- supports the exact unrevoked identity/window probe used below.
CREATE INDEX "UserRoleAssignment_unrevoked_overlap_idx"
  ON "UserRoleAssignment"(
    "orgId",
    "tenantId",
    "userId",
    "roleDefinitionId",
    "startsAt",
    "expiresAt"
  )
  WHERE "revokedAt" IS NULL;

-- PostgreSQL's built-in advisory transaction locks serialize overlap checks for
-- one exact assignment key. Hash collisions can only add serialization; the
-- row predicate below remains the source of truth and needs no extension.
CREATE FUNCTION app.lock_user_role_assignment_key(
  assignment_org_id text,
  assignment_tenant_id text,
  assignment_user_id text,
  assignment_role_definition_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array(
        assignment_org_id,
        assignment_tenant_id,
        assignment_user_id,
        assignment_role_definition_id
      )::text,
      0
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION app.lock_user_role_assignment_key(text, text, text, text)
  FROM PUBLIC;

CREATE FUNCTION app.enforce_user_role_assignment_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  overlapping_assignment_exists boolean := false;
BEGIN
  IF NEW."revokedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM app.lock_user_role_assignment_key(
    NEW."orgId",
    NEW."tenantId",
    NEW."userId",
    NEW."roleDefinitionId"
  );

  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1
       FROM %I."UserRoleAssignment" AS existing
       WHERE existing."orgId" = $1
         AND existing."tenantId" IS NOT DISTINCT FROM $2
         AND existing."userId" = $3
         AND existing."roleDefinitionId" = $4
         AND existing."revokedAt" IS NULL
         AND existing."startsAt" < COALESCE($5, ''infinity''::timestamp)
         AND $6 < COALESCE(existing."expiresAt", ''infinity''::timestamp)
     )',
    TG_TABLE_SCHEMA
  )
  INTO overlapping_assignment_exists
  USING
    NEW."orgId",
    NEW."tenantId",
    NEW."userId",
    NEW."roleDefinitionId",
    NEW."expiresAt",
    NEW."startsAt";

  IF overlapping_assignment_exists THEN
    RAISE EXCEPTION 'Assignment window overlaps an existing assignment'
      -- Dedicated signal consumed by the assignment API error boundary.
      USING ERRCODE = 'PRA01';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.enforce_user_role_assignment_no_overlap()
  FROM PUBLIC;

CREATE TRIGGER "UserRoleAssignment_prevent_overlap"
BEFORE INSERT
ON "UserRoleAssignment"
FOR EACH ROW
EXECUTE FUNCTION app.enforce_user_role_assignment_no_overlap();

-- Revocation uses the same key lock. An insertion that starts after this update
-- waits for commit and then observes the revoked row as eligible history.
CREATE FUNCTION app.serialize_user_role_assignment_revocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL THEN
    PERFORM app.lock_user_role_assignment_key(
      OLD."orgId",
      OLD."tenantId",
      OLD."userId",
      OLD."roleDefinitionId"
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.serialize_user_role_assignment_revocation()
  FROM PUBLIC;

CREATE TRIGGER "UserRoleAssignment_serialize_revocation"
BEFORE UPDATE
ON "UserRoleAssignment"
FOR EACH ROW
EXECUTE FUNCTION app.serialize_user_role_assignment_revocation();

-- Forward constraint: committed outbox events and assignment audit rows remain
-- durable until ACE-F22 adds reviewed lifecycle processing.
