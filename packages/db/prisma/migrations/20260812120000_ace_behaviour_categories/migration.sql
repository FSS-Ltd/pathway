-- Versioned, append-only category snapshots for ACE behaviour policy.

CREATE TABLE "BehaviourCategory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" "BehaviourType" NOT NULL,
  "visibility" "BehaviourVisibility" NOT NULL DEFAULT 'GENERAL',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSerious" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BehaviourCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BehaviourCategory_policyVersion_check" CHECK ("policyVersion" > 0),
  CONSTRAINT "BehaviourCategory_code_check" CHECK (
    "code" = btrim("code")
    AND "code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT "BehaviourCategory_label_check" CHECK (btrim("label") <> ''),
  CONSTRAINT "BehaviourCategory_sortOrder_check" CHECK ("sortOrder" >= 0),
  CONSTRAINT "BehaviourCategory_serious_type_check" CHECK (
    NOT "isSerious" OR "type" = 'DEMERIT'
  ),
  CONSTRAINT "BehaviourCategory_reason_check" CHECK (btrim("reason") <> ''),
  CONSTRAINT "BehaviourCategory_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "BehaviourCategory_tenantId_policyVersion_code_key"
    UNIQUE ("tenantId", "policyVersion", "code"),
  CONSTRAINT "BehaviourCategory_tenantId_policyVersion_sortOrder_key"
    UNIQUE ("tenantId", "policyVersion", "sortOrder"),
  CONSTRAINT "BehaviourCategory_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BehaviourCategory_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "BehaviourCategory_tenantId_policyVersion_sortOrder_idx"
  ON "BehaviourCategory"("tenantId", "policyVersion", "sortOrder");

-- Organisation-scoped behaviour policy managers are valid policy authors even
-- when they do not also hold a legacy site-membership row. HTTP authorization
-- remains the endpoint's responsibility.
CREATE OR REPLACE FUNCTION app.require_ace_record_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id text;
BEGIN
  actor_user_id := pg_catalog.to_jsonb(NEW)->>TG_ARGV[0];

  IF actor_user_id IS NULL OR NOT (
    EXISTS (
      SELECT 1
      FROM app."SiteMembership" membership
      WHERE membership."tenantId" = NEW."tenantId"
        AND membership."userId" = actor_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM app."UserTenantRole" legacy_role
      WHERE legacy_role."tenantId" = NEW."tenantId"
        AND legacy_role."userId" = actor_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM app."Tenant" tenant
      INNER JOIN app."OrgMembership" membership
        ON membership."orgId" = tenant."orgId"
       AND membership."userId" = actor_user_id
      INNER JOIN app."UserRoleAssignment" assignment
        ON assignment."orgId" = tenant."orgId"
       AND assignment."tenantId" IS NULL
       AND assignment."userId" = actor_user_id
      INNER JOIN app."OrgRoleDefinition" role_definition
        ON role_definition."id" = assignment."roleDefinitionId"
       AND role_definition."orgId" = tenant."orgId"
      WHERE tenant."id" = NEW."tenantId"
        AND assignment."revokedAt" IS NULL
        AND assignment."startsAt" <= pg_catalog.statement_timestamp()
        AND (
          assignment."expiresAt" IS NULL
          OR assignment."expiresAt" > pg_catalog.statement_timestamp()
        )
        AND role_definition."tenantId" IS NULL
        AND role_definition."scope" = 'organisation'
        AND role_definition."isActive" = true
        AND EXISTS (
          SELECT 1
          FROM app."OrgRolePermission" role_permission
          INNER JOIN app."PermissionDefinition" permission_definition
            ON permission_definition."key" = role_permission."permissionKey"
          WHERE role_permission."roleDefinitionId" = role_definition."id"
            AND role_permission."permissionKey" IN (
              'ace.pace.correct',
              'ace.pace.override',
              'ace.behaviour.policy.manage'
            )
            AND permission_definition."isActive" = true
        )
    )
  ) THEN
    RAISE EXCEPTION 'ACE record actor is not a member of the active tenant or organisation'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.require_ace_record_actor_membership() IS
  'Validates tenant actor membership, including active organisation-scoped PACE and behaviour-policy mutation roles. Endpoint-specific authorization remains enforced by PermissionGuard.';

REVOKE ALL ON FUNCTION app.require_ace_record_actor_membership() FROM PUBLIC;

CREATE TRIGGER "BehaviourCategory_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "BehaviourCategory"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('createdByUserId');

CREATE TRIGGER "BehaviourCategory_immutable"
BEFORE UPDATE OR DELETE ON "BehaviourCategory"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();

ALTER TABLE "BehaviourCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BehaviourCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BehaviourCategory_tenant_rls" ON "BehaviourCategory"
  USING (
    app.current_tenant_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
  )
  WITH CHECK (
    app.current_tenant_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
  );
REVOKE ALL PRIVILEGES ON TABLE "BehaviourCategory" FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "BehaviourCategory" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "BehaviourCategory" FROM authenticated';
  END IF;
END;
$$;
