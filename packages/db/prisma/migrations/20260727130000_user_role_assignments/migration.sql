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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_org_id text;
  role_tenant_id text;
BEGIN
  -- Share-lock the role so concurrent scope changes either finish before this
  -- validation or wait until the assignment transaction commits.
  SELECT "orgId", "tenantId"
  INTO role_org_id, role_tenant_id
  FROM app."OrgRoleDefinition"
  WHERE "id" = NEW."roleDefinitionId"
  FOR SHARE;

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

  -- Membership is required when authority is granted, but is not a foreign
  -- key: later offboarding must not delete the historical assignment fact.
  PERFORM 1
  FROM app."OrgMembership"
  WHERE "orgId" = NEW."orgId"
    AND "userId" = NEW."userId"
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignee must belong to the assignment organisation'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.enforce_user_role_assignment_scope() FROM PUBLIC;

CREATE TRIGGER "UserRoleAssignment_enforce_scope"
BEFORE INSERT
ON "UserRoleAssignment"
FOR EACH ROW EXECUTE FUNCTION app.enforce_user_role_assignment_scope();

-- Assignment identity, authority, and validity-window fields are audit facts.
-- The only permitted state change is one atomic, one-way revocation.
CREATE FUNCTION app.enforce_user_role_assignment_update()
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
    OLD."expiresAt"
  ) IS DISTINCT FROM ROW(
    NEW."id",
    NEW."orgId",
    NEW."tenantId",
    NEW."userId",
    NEW."roleDefinitionId",
    NEW."assignedById",
    NEW."startsAt",
    NEW."expiresAt"
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

CREATE TRIGGER "UserRoleAssignment_preserve_facts"
BEFORE UPDATE
ON "UserRoleAssignment"
FOR EACH ROW EXECUTE FUNCTION app.enforce_user_role_assignment_update();

-- Once assignments exist, the role's organisation/site scope is an audit fact.
-- The deferred check observes assignments that committed while a concurrent
-- role update waited on the row lock taken by assignment creation.
CREATE FUNCTION app.prevent_assigned_role_scope_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
    OLD."orgId" IS DISTINCT FROM NEW."orgId"
    OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
    OR OLD."scope" IS DISTINCT FROM NEW."scope"
  ) AND EXISTS (
    SELECT 1
    FROM app."UserRoleAssignment"
    WHERE "roleDefinitionId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'Cannot change the scope of a role with assignment history'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.prevent_assigned_role_scope_change() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER "OrgRoleDefinition_preserve_assigned_scope"
AFTER UPDATE
ON "OrgRoleDefinition"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  OLD."orgId" IS DISTINCT FROM NEW."orgId"
  OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
  OR OLD."scope" IS DISTINCT FROM NEW."scope"
)
EXECUTE FUNCTION app.prevent_assigned_role_scope_change();

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
