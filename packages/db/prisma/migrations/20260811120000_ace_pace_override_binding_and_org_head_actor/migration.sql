ALTER TABLE "PacePolicyOverride"
  ADD COLUMN "clientCommandKeyHash" TEXT,
  ADD COLUMN "assessmentFingerprint" TEXT;

CREATE UNIQUE INDEX "PacePolicyOverride_tenant_client_command_key"
  ON "PacePolicyOverride"("tenantId", "clientCommandKeyHash");

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
            AND role_permission."permissionKey" = 'ace.pace.correct'
            AND permission_definition."isActive" = true
        )
        AND EXISTS (
          SELECT 1
          FROM app."OrgRolePermission" role_permission
          INNER JOIN app."PermissionDefinition" permission_definition
            ON permission_definition."key" = role_permission."permissionKey"
          WHERE role_permission."roleDefinitionId" = role_definition."id"
            AND role_permission."permissionKey" = 'ace.pace.override'
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

REVOKE ALL ON FUNCTION app.require_ace_record_actor_membership() FROM PUBLIC;
