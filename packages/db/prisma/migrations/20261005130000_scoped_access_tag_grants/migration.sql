CREATE TYPE "AccessTagKey" AS ENUM (
  'shopkeeper',
  'shopadmin',
  'finance-admin',
  'leaderboard-admin',
  'attendance-exporter',
  'attendance-recorder',
  'audit-viewer',
  'sensitive-note-viewer',
  'behaviour-viewer',
  'student-drillthrough-viewer',
  'pace-full-access',
  'supervisor-all-students',
  'supervisor-primary-students',
  'calendar-manager',
  'parent-message-responder',
  'club-lead',
  'librarian'
);

ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'ACCESS_TAG_GRANT';

CREATE TABLE "AccessTagGrant" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT NOT NULL,
  "tagKey" "AccessTagKey" NOT NULL,
  "grantedById" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessTagGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccessTagGrant_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagGrant_tenantId_orgId_fkey"
    FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagGrant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagGrant_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagGrant_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagGrant_scope_tenant_boundary_check"
    CHECK ("tenantId" IS NULL OR "tenantId" <> ''),
  CONSTRAINT "AccessTagGrant_validity_check"
    CHECK ("expiresAt" IS NULL OR "expiresAt" > "startsAt"),
  CONSTRAINT "AccessTagGrant_revocation_actor_check"
    CHECK (("revokedAt" IS NULL) = ("revokedById" IS NULL))
);

CREATE INDEX "AccessTagGrant_orgId_userId_revokedAt_idx"
  ON "AccessTagGrant"("orgId", "userId", "revokedAt");
CREATE INDEX "AccessTagGrant_tenantId_userId_revokedAt_idx"
  ON "AccessTagGrant"("tenantId", "userId", "revokedAt");
CREATE INDEX "AccessTagGrant_orgId_createdAt_id_idx"
  ON "AccessTagGrant"("orgId", "createdAt" DESC, "id" DESC);
CREATE UNIQUE INDEX "AccessTagGrant_org_active_unique"
  ON "AccessTagGrant"("orgId", "userId", "tagKey")
  WHERE "tenantId" IS NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "AccessTagGrant_site_active_unique"
  ON "AccessTagGrant"("orgId", "tenantId", "userId", "tagKey")
  WHERE "tenantId" IS NOT NULL AND "revokedAt" IS NULL;

-- Grant identity and validity are audit facts. Revocation is a one-way update;
-- regranting requires a new row, preserving the previous grant's history.
CREATE FUNCTION app.enforce_access_tag_grant_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF ROW(
    OLD."id", OLD."orgId", OLD."tenantId", OLD."userId", OLD."tagKey",
    OLD."grantedById", OLD."startsAt", OLD."expiresAt", OLD."createdAt"
  ) IS DISTINCT FROM ROW(
    NEW."id", NEW."orgId", NEW."tenantId", NEW."userId", NEW."tagKey",
    NEW."grantedById", NEW."startsAt", NEW."expiresAt", NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'Access-tag grant facts cannot be changed'
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
      RAISE EXCEPTION 'Access-tag revocation is immutable once recorded'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.enforce_access_tag_grant_update() FROM PUBLIC;

CREATE TRIGGER "AccessTagGrant_preserve_facts"
BEFORE UPDATE ON "AccessTagGrant"
FOR EACH ROW EXECUTE FUNCTION app.enforce_access_tag_grant_update();

ALTER TABLE "AccessTagGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessTagGrant" FORCE ROW LEVEL SECURITY;

CREATE POLICY "AccessTagGrant_rls_select"
  ON "AccessTagGrant"
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id())
  );

CREATE POLICY "AccessTagGrant_rls_insert"
  ON "AccessTagGrant"
  FOR INSERT
  WITH CHECK (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id())
  );

CREATE POLICY "AccessTagGrant_rls_update"
  ON "AccessTagGrant"
  FOR UPDATE
  USING (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id())
  )
  WITH CHECK (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id())
  );

REVOKE ALL PRIVILEGES ON TABLE "AccessTagGrant" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AccessTagGrant" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AccessTagGrant" FROM authenticated';
  END IF;
END;
$$;
