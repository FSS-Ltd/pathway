-- Immutable role-definition history and role-specific audit values.
CREATE TYPE "AuditAction_new" AS ENUM (
  'CREATED', 'UPDATED', 'DELETED', 'VIEWED',
  'ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_RETIRED'
);
ALTER TABLE "AuditEvent" ALTER COLUMN "action" TYPE "AuditAction_new"
  USING ("action"::text::"AuditAction_new");
DROP TYPE "AuditAction";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";

CREATE TYPE "AuditEntityType_new" AS ENUM ('CONCERN', 'CHILD_NOTE', 'ORG_ROLE');
ALTER TABLE "AuditEvent" ALTER COLUMN "entityType" TYPE "AuditEntityType_new"
  USING ("entityType"::text::"AuditEntityType_new");
DROP TYPE "AuditEntityType";
ALTER TYPE "AuditEntityType_new" RENAME TO "AuditEntityType";

ALTER TABLE "AuditEvent" ALTER COLUMN "tenantId" DROP NOT NULL;

CREATE TABLE "OrgRoleRevision" (
  "id" TEXT NOT NULL,
  "roleDefinitionId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "tenantId" TEXT,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "scope" "RoleScope" NOT NULL,
  "isActive" BOOLEAN NOT NULL,
  "permissionKeys" JSONB NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgRoleRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrgRoleRevision_roleDefinitionId_version_key" UNIQUE ("roleDefinitionId", "version"),
  CONSTRAINT "OrgRoleRevision_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "OrgRoleDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrgRoleRevision_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "OrgRoleRevision_orgId_roleDefinitionId_createdAt_idx"
  ON "OrgRoleRevision"("orgId", "roleDefinitionId", "createdAt");

ALTER TABLE "OrgRoleRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgRoleRevision" FORCE ROW LEVEL SECURITY;

CREATE POLICY "OrgRoleRevision_rls" ON "OrgRoleRevision"
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

REVOKE ALL PRIVILEGES ON TABLE "OrgRoleRevision" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "OrgRoleRevision" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "OrgRoleRevision" FROM authenticated';
  END IF;
END;
$$;

-- Revision snapshots are append-only and must always describe the role version
-- that caused them. The trigger closes gaps left by foreign keys alone.
CREATE OR REPLACE FUNCTION app.validate_org_role_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_definition_id text;
  role_org_id text;
  role_tenant_id text;
  role_scope text;
  role_version integer;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT "id", "orgId", "tenantId", "scope"::text, "version"
       FROM %I."OrgRoleDefinition"
      WHERE "id" = $1',
    TG_TABLE_SCHEMA
  )
  INTO role_definition_id, role_org_id, role_tenant_id, role_scope, role_version
  USING NEW."roleDefinitionId";

  IF role_definition_id IS NULL
    OR NEW."orgId" <> role_org_id
    OR NEW."tenantId" IS DISTINCT FROM role_tenant_id
    OR NEW."scope"::text <> role_scope
    OR NEW."version" <> role_version
  THEN
    RAISE EXCEPTION 'OrgRoleRevision must match its role definition identity and version';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_org_role_revision_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'OrgRoleRevision records are immutable';
END;
$$;

CREATE TRIGGER "OrgRoleRevision_validate_insert"
  BEFORE INSERT ON "OrgRoleRevision"
  FOR EACH ROW EXECUTE FUNCTION app.validate_org_role_revision();

CREATE TRIGGER "OrgRoleRevision_immutable"
  BEFORE UPDATE OR DELETE ON "OrgRoleRevision"
  FOR EACH ROW EXECUTE FUNCTION app.enforce_org_role_revision_immutable();

-- Audit rows can be organisation-wide (tenantId NULL) or site-scoped. The
-- former must remain visible in an organisation context with no selected site.
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AuditEvent_tenant_rls" ON "AuditEvent";
CREATE POLICY "AuditEvent_org_or_site_rls" ON "AuditEvent"
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

-- Forward mitigation: revisions and audit events are retained on route rollback.
