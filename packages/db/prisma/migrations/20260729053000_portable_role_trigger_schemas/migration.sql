-- Role trigger functions live in the private app schema, while Prisma models
-- may be deployed to another schema such as production's public schema. Resolve
-- related tables from the schema of the table that fired each trigger.

CREATE OR REPLACE FUNCTION app.enforce_user_role_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_definition_id text;
  role_org_id text;
  role_tenant_id text;
  membership_user_id text;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT "id", "orgId", "tenantId"
       FROM %I."OrgRoleDefinition"
      WHERE "id" = $1
      FOR SHARE',
    TG_TABLE_SCHEMA
  )
  INTO role_definition_id, role_org_id, role_tenant_id
  USING NEW."roleDefinitionId";

  IF role_definition_id IS NULL THEN
    RAISE EXCEPTION 'Role definition is not available in the assignment scope'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF role_org_id IS DISTINCT FROM NEW."orgId"
    OR role_tenant_id IS DISTINCT FROM NEW."tenantId"
  THEN
    RAISE EXCEPTION 'Assignment scope must exactly match its role definition'
      USING ERRCODE = 'check_violation';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT "userId"
       FROM %I."OrgMembership"
      WHERE "orgId" = $1
        AND "userId" = $2
      FOR KEY SHARE',
    TG_TABLE_SCHEMA
  )
  INTO membership_user_id
  USING NEW."orgId", NEW."userId";

  IF membership_user_id IS NULL THEN
    RAISE EXCEPTION 'Assignee must belong to the assignment organisation'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.enforce_user_role_assignment_scope() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.prevent_assigned_role_scope_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_has_assignments boolean := false;
BEGIN
  IF OLD."orgId" IS DISTINCT FROM NEW."orgId"
    OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
    OR OLD."scope" IS DISTINCT FROM NEW."scope"
  THEN
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1
           FROM %I."UserRoleAssignment"
          WHERE "roleDefinitionId" = $1
       )',
      TG_TABLE_SCHEMA
    )
    INTO role_has_assignments
    USING OLD."id";

    IF role_has_assignments THEN
      RAISE EXCEPTION 'Cannot change the scope of a role with assignment history'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.prevent_assigned_role_scope_change() FROM PUBLIC;

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
    EXECUTE pg_catalog.format(
      'SELECT COALESCE((
         SELECT "isSystem"
           FROM %I."OrgRoleDefinition"
          WHERE "id" = $1
       ), false)',
      TG_TABLE_SCHEMA
    )
    INTO old_role_is_system
    USING OLD."roleDefinitionId";
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    EXECUTE pg_catalog.format(
      'SELECT COALESCE((
         SELECT "isSystem"
           FROM %I."OrgRoleDefinition"
          WHERE "id" = $1
       ), false)',
      TG_TABLE_SCHEMA
    )
    INTO new_role_is_system
    USING NEW."roleDefinitionId";
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
