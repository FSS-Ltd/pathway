-- Resolve membership and role rows beside the triggering ACE fact.
CREATE OR REPLACE FUNCTION app.require_ace_record_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id text;
  actor_is_member boolean := false;
BEGIN
  actor_user_id := pg_catalog.to_jsonb(NEW)->>TG_ARGV[0];

  IF actor_user_id IS NOT NULL THEN
    EXECUTE pg_catalog.format(
      'SELECT
         EXISTS (
           SELECT 1 FROM %1$I."SiteMembership" membership
            WHERE membership."tenantId" = $1
              AND membership."userId" = $2
         )
         OR EXISTS (
           SELECT 1 FROM %1$I."UserTenantRole" legacy_role
            WHERE legacy_role."tenantId" = $1
              AND legacy_role."userId" = $2
         )
         OR EXISTS (
           SELECT 1
             FROM %1$I."Tenant" tenant
             JOIN %1$I."OrgMembership" membership
               ON membership."orgId" = tenant."orgId"
              AND membership."userId" = $2
             JOIN %1$I."UserRoleAssignment" assignment
               ON assignment."orgId" = tenant."orgId"
              AND assignment."tenantId" IS NULL
              AND assignment."userId" = $2
             JOIN %1$I."OrgRoleDefinition" role_definition
               ON role_definition."id" = assignment."roleDefinitionId"
              AND role_definition."orgId" = tenant."orgId"
            WHERE tenant."id" = $1
              AND assignment."revokedAt" IS NULL
              AND assignment."startsAt" <= pg_catalog.statement_timestamp()
              AND (
                assignment."expiresAt" IS NULL
                OR assignment."expiresAt" > pg_catalog.statement_timestamp()
              )
              AND role_definition."tenantId" IS NULL
              AND role_definition."scope" = ''organisation''
              AND role_definition."isActive" = true
              AND EXISTS (
                SELECT 1 FROM %1$I."OrgRolePermission" role_permission
                JOIN %1$I."PermissionDefinition" permission_definition
                  ON permission_definition."key" = role_permission."permissionKey"
                WHERE role_permission."roleDefinitionId" = role_definition."id"
                  AND role_permission."permissionKey" IN (
                    ''ace.pace.correct'',
                    ''ace.pace.override'',
                    ''ace.behaviour.record'',
                    ''ace.behaviour.policy.manage''
                  )
                  AND permission_definition."isActive" = true
              )
         )',
      TG_TABLE_SCHEMA
    ) INTO actor_is_member USING NEW."tenantId", actor_user_id;
  END IF;

  IF NOT actor_is_member THEN
    RAISE EXCEPTION 'ACE record actor is not a member of the active tenant or organisation'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_ace_record_actor_membership() FROM PUBLIC;
