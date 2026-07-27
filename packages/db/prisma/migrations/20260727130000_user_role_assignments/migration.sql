-- Time-bounded user role assignments. Assignment facts are retained for audit;
-- access is ended through expiry or revocation rather than row deletion.

CREATE TABLE "UserRoleAssignment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT NOT NULL,
  "roleDefinitionId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,

  CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserRoleAssignment_expiry_boundary_check"
    CHECK ("expiresAt" IS NULL OR "expiresAt" > "startsAt"),
  CONSTRAINT "UserRoleAssignment_revocation_boundary_check"
    CHECK ("revokedAt" IS NULL OR "revokedAt" >= "startsAt"),
  CONSTRAINT "UserRoleAssignment_revocation_actor_check"
    CHECK (
      ("revokedAt" IS NULL AND "revokedById" IS NULL)
      OR ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL)
    ),
  CONSTRAINT "UserRoleAssignment_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_tenantId_orgId_fkey"
    FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_orgId_userId_fkey"
    FOREIGN KEY ("orgId", "userId") REFERENCES "OrgMembership"("orgId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_roleDefinitionId_fkey"
    FOREIGN KEY ("roleDefinitionId") REFERENCES "OrgRoleDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserRoleAssignment_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "UserRoleAssignment_orgId_userId_revokedAt_idx"
  ON "UserRoleAssignment"("orgId", "userId", "revokedAt");

CREATE INDEX "UserRoleAssignment_tenantId_userId_revokedAt_idx"
  ON "UserRoleAssignment"("tenantId", "userId", "revokedAt");

CREATE INDEX "UserRoleAssignment_roleDefinitionId_idx"
  ON "UserRoleAssignment"("roleDefinitionId");

-- Nullable composite foreign keys do not compare NULL scope columns. This
-- trigger closes that gap and makes the assignment site exactly match the role
-- definition site. Organisation and relationship roles therefore remain
-- organisation-wide and cannot be narrowed to a site.
CREATE FUNCTION app.enforce_user_role_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  role_org_id text;
  role_tenant_id text;
BEGIN
  SELECT "orgId", "tenantId"
  INTO role_org_id, role_tenant_id
  FROM "OrgRoleDefinition"
  WHERE "id" = NEW."roleDefinitionId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role definition is not available in the assignment scope'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF role_org_id IS DISTINCT FROM NEW."orgId"
    OR role_tenant_id IS DISTINCT FROM NEW."tenantId"
  THEN
    RAISE EXCEPTION 'Assignment scope must exactly match its role definition'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "UserRoleAssignment_enforce_scope"
BEFORE INSERT OR UPDATE OF "orgId", "tenantId", "roleDefinitionId"
ON "UserRoleAssignment"
FOR EACH ROW EXECUTE FUNCTION app.enforce_user_role_assignment_scope();

-- Once assignments exist, the role's organisation/site scope is an audit fact.
-- Retiring a role uses isActive; it does not rewrite historical assignments.
CREATE FUNCTION app.prevent_assigned_role_scope_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    OLD."orgId" IS DISTINCT FROM NEW."orgId"
    OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
    OR OLD."scope" IS DISTINCT FROM NEW."scope"
  ) AND EXISTS (
    SELECT 1
    FROM "UserRoleAssignment"
    WHERE "roleDefinitionId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'Cannot change the scope of a role with assignment history'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "OrgRoleDefinition_preserve_assigned_scope"
BEFORE UPDATE OF "orgId", "tenantId", "scope"
ON "OrgRoleDefinition"
FOR EACH ROW EXECUTE FUNCTION app.prevent_assigned_role_scope_change();

ALTER TABLE "UserRoleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserRoleAssignment" FORCE ROW LEVEL SECURITY;

CREATE POLICY "UserRoleAssignment_rls_select"
  ON "UserRoleAssignment"
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id())
  );

CREATE POLICY "UserRoleAssignment_rls_insert"
  ON "UserRoleAssignment"
  FOR INSERT
  WITH CHECK (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id())
  );

CREATE POLICY "UserRoleAssignment_rls_update"
  ON "UserRoleAssignment"
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

-- No DELETE policy is intentional: assignment rows are audit history.
REVOKE ALL PRIVILEGES ON TABLE "UserRoleAssignment" FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "UserRoleAssignment" FROM anon';
  END IF;

  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "UserRoleAssignment" FROM authenticated';
  END IF;
END;
$$;
