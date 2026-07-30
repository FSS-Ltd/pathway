-- System role templates and their permission grants are platform-owned.
-- A transaction-local marker is set only by the operational system-role seeder.

CREATE FUNCTION app.protect_system_role_definition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trusted_seed boolean :=
    current_setting('app.system_role_seed', true) = 'on';
BEGIN
  IF NOT trusted_seed AND (
    (TG_OP = 'INSERT' AND NEW."isSystem")
    OR (
      TG_OP = 'UPDATE'
      AND (OLD."isSystem" OR NEW."isSystem")
    )
    OR (TG_OP = 'DELETE' AND OLD."isSystem")
  ) THEN
    RAISE EXCEPTION
      'System role templates require the trusted system-role seed context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "OrgRoleDefinition_protect_system_template"
BEFORE INSERT OR UPDATE OR DELETE
ON "OrgRoleDefinition"
FOR EACH ROW EXECUTE FUNCTION app.protect_system_role_definition();

CREATE FUNCTION app.protect_system_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  protected_role_exists boolean;
  trusted_seed boolean :=
    current_setting('app.system_role_seed', true) = 'on';
BEGIN
  IF trusted_seed THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM app."OrgRoleDefinition"
      WHERE "id" = NEW."roleDefinitionId"
        AND "isSystem"
    ) INTO protected_role_exists;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM app."OrgRoleDefinition"
      WHERE "id" = OLD."roleDefinitionId"
        AND "isSystem"
    ) INTO protected_role_exists;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM app."OrgRoleDefinition"
      WHERE "id" IN (OLD."roleDefinitionId", NEW."roleDefinitionId")
        AND "isSystem"
    ) INTO protected_role_exists;
  END IF;

  IF protected_role_exists THEN
    RAISE EXCEPTION
      'System role template grants require the trusted system-role seed context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.protect_system_role_permission() FROM PUBLIC;

CREATE TRIGGER "OrgRolePermission_protect_system_template"
BEFORE INSERT OR UPDATE OR DELETE
ON "OrgRolePermission"
FOR EACH ROW EXECUTE FUNCTION app.protect_system_role_permission();
