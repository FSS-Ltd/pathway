-- Protected role templates may only be maintained by the separately
-- provisioned pathway_system_role_seed login. The role is intentionally not
-- created here because managed deployment connections may not have CREATEROLE.

DROP INDEX "OrgRoleDefinition_orgId_tenantId_name_key";
DROP INDEX "OrgRoleDefinition_orgId_name_orgwide_key";

CREATE UNIQUE INDEX "OrgRoleDefinition_orgId_tenantId_name_isSystem_key"
  ON "OrgRoleDefinition"("orgId", "tenantId", "name", "isSystem");

CREATE UNIQUE INDEX "OrgRoleDefinition_orgId_name_isSystem_orgwide_key"
  ON "OrgRoleDefinition"("orgId", "name", "isSystem")
  WHERE "tenantId" IS NULL;

CREATE OR REPLACE FUNCTION app.protect_system_role_definition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_seed_login boolean := session_user = 'pathway_system_role_seed';
  touches_system_role boolean :=
    (TG_OP = 'INSERT' AND NEW."isSystem")
    OR (TG_OP = 'UPDATE' AND (OLD."isSystem" OR NEW."isSystem"))
    OR (TG_OP = 'DELETE' AND OLD."isSystem");
BEGIN
  IF is_seed_login THEN
    IF NOT (
      (TG_OP = 'INSERT' AND NEW."isSystem")
      OR (TG_OP = 'UPDATE' AND OLD."isSystem" AND NEW."isSystem")
      OR (TG_OP = 'DELETE' AND OLD."isSystem")
    ) THEN
      RAISE EXCEPTION
        'The dedicated system-role seed identity may mutate only system roles'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF touches_system_role THEN
    RAISE EXCEPTION
      'System role templates require the dedicated system-role seed identity'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.protect_system_role_definition() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.protect_system_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  is_seed_login boolean := session_user = 'pathway_system_role_seed';
  old_role_is_system boolean := false;
  new_role_is_system boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT COALESCE((
      SELECT "isSystem"
      FROM app."OrgRoleDefinition"
      WHERE "id" = OLD."roleDefinitionId"
    ), false) INTO old_role_is_system;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT COALESCE((
      SELECT "isSystem"
      FROM app."OrgRoleDefinition"
      WHERE "id" = NEW."roleDefinitionId"
    ), false) INTO new_role_is_system;
  END IF;

  IF is_seed_login THEN
    IF NOT (
      (TG_OP = 'INSERT' AND new_role_is_system)
      OR (TG_OP = 'UPDATE' AND old_role_is_system AND new_role_is_system)
      OR (TG_OP = 'DELETE' AND old_role_is_system)
    ) THEN
      RAISE EXCEPTION
        'The dedicated system-role seed identity may mutate only system-role grants'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF old_role_is_system OR new_role_is_system THEN
    RAISE EXCEPTION
      'System role template grants require the dedicated system-role seed identity'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.protect_system_role_permission() FROM PUBLIC;

-- These policies keep FORCE ROW LEVEL SECURITY enabled while admitting only
-- the original authenticated operational login. SET ROLE does not change
-- session_user.
CREATE POLICY "PermissionDefinition_system_role_seed"
  ON "PermissionDefinition"
  FOR ALL
  USING (session_user = 'pathway_system_role_seed')
  WITH CHECK (session_user = 'pathway_system_role_seed');

CREATE POLICY "Org_system_role_seed_select"
  ON "Org"
  FOR SELECT
  USING (session_user = 'pathway_system_role_seed');

CREATE POLICY "Tenant_system_role_seed_select"
  ON "Tenant"
  FOR SELECT
  USING (session_user = 'pathway_system_role_seed');

CREATE POLICY "OrgRoleDefinition_system_role_seed"
  ON "OrgRoleDefinition"
  FOR ALL
  USING (
    session_user = 'pathway_system_role_seed'
    AND "isSystem"
  )
  WITH CHECK (
    session_user = 'pathway_system_role_seed'
    AND "isSystem"
  );

CREATE POLICY "OrgRolePermission_system_role_seed"
  ON "OrgRolePermission"
  FOR ALL
  USING (
    session_user = 'pathway_system_role_seed'
    AND EXISTS (
      SELECT 1
      FROM "OrgRoleDefinition" role_definition
      WHERE role_definition."id" = "OrgRolePermission"."roleDefinitionId"
        AND role_definition."isSystem"
    )
  )
  WITH CHECK (
    session_user = 'pathway_system_role_seed'
    AND EXISTS (
      SELECT 1
      FROM "OrgRoleDefinition" role_definition
      WHERE role_definition."id" = "OrgRolePermission"."roleDefinitionId"
        AND role_definition."isSystem"
    )
  );
