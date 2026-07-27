-- Configurable organisation/site role metadata. Permission keys remain platform-owned
-- through the foreign key to PermissionDefinition; organisations cannot mint keys.

CREATE TYPE "RoleScope" AS ENUM ('organisation', 'site', 'relationship');

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_id_orgId_key" UNIQUE ("id", "orgId");

CREATE TABLE "OrgRoleDefinition" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "tenantId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "scope" "RoleScope" NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrgRoleDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrgRoleDefinition_scope_tenant_boundary_check" CHECK (
    ("scope" = 'site' AND "tenantId" IS NOT NULL)
    OR ("scope" = 'organisation' AND "tenantId" IS NULL)
    OR ("scope" = 'relationship' AND "tenantId" IS NULL AND "isSystem" = true)
  ),
  CONSTRAINT "OrgRoleDefinition_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrgRoleDefinition_tenantId_orgId_fkey"
    FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "OrgRolePermission" (
  "roleDefinitionId" TEXT NOT NULL,
  "permissionKey" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrgRolePermission_pkey" PRIMARY KEY ("roleDefinitionId", "permissionKey"),
  CONSTRAINT "OrgRolePermission_roleDefinitionId_fkey"
    FOREIGN KEY ("roleDefinitionId") REFERENCES "OrgRoleDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrgRolePermission_permissionKey_fkey"
    FOREIGN KEY ("permissionKey") REFERENCES "PermissionDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrgRoleDefinition_orgId_tenantId_name_key"
  ON "OrgRoleDefinition"("orgId", "tenantId", "name");

-- PostgreSQL treats NULL values as distinct in a unique index. This partial index
-- makes organisation-wide role names unique while still allowing a site role to use
-- the same name as an organisation-wide role.
CREATE UNIQUE INDEX "OrgRoleDefinition_orgId_name_orgwide_key"
  ON "OrgRoleDefinition"("orgId", "name")
  WHERE "tenantId" IS NULL;

CREATE INDEX "OrgRoleDefinition_orgId_tenantId_isActive_idx"
  ON "OrgRoleDefinition"("orgId", "tenantId", "isActive");

CREATE INDEX "OrgRolePermission_permissionKey_idx"
  ON "OrgRolePermission"("permissionKey");

ALTER TABLE "OrgRoleDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgRoleDefinition" FORCE ROW LEVEL SECURITY;
ALTER TABLE "OrgRolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgRolePermission" FORCE ROW LEVEL SECURITY;

CREATE POLICY "OrgRoleDefinition_rls"
  ON "OrgRoleDefinition"
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

CREATE POLICY "OrgRolePermission_rls"
  ON "OrgRolePermission"
  USING (
    EXISTS (
      SELECT 1
      FROM "OrgRoleDefinition" role_definition
      WHERE role_definition."id" = "OrgRolePermission"."roleDefinitionId"
        AND role_definition."orgId" = app.current_org_id()
        AND (role_definition."tenantId" IS NULL OR role_definition."tenantId" = app.current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "OrgRoleDefinition" role_definition
      WHERE role_definition."id" = "OrgRolePermission"."roleDefinitionId"
        AND role_definition."orgId" = app.current_org_id()
        AND (role_definition."tenantId" IS NULL OR role_definition."tenantId" = app.current_tenant_id())
    )
  );

REVOKE ALL PRIVILEGES ON TABLE "OrgRoleDefinition" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "OrgRolePermission" FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "OrgRoleDefinition" FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "OrgRolePermission" FROM anon';
  END IF;

  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "OrgRoleDefinition" FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "OrgRolePermission" FROM authenticated';
  END IF;
END;
$$;
