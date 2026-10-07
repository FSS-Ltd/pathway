-- Pin trigger resolution to trusted built-ins. These three functions reference
-- only trigger records and pg_catalog objects, so their bodies need no change.
ALTER FUNCTION app.enforce_org_role_revision_immutable() SET search_path = '';
ALTER FUNCTION app.enforce_user_role_assignment_update() SET search_path = '';
ALTER FUNCTION app.protect_system_role_definition() SET search_path = '';

-- Learning actors are checked against the application's public-schema
-- membership tables. Keep the existing trigger and function identity while
-- making the relation lookup independent of the caller's search_path.
CREATE OR REPLACE FUNCTION app.require_learning_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor_user_id text := to_jsonb(NEW) ->> TG_ARGV[0];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."SiteMembership"
    WHERE "tenantId" = NEW."tenantId"
      AND "userId" = actor_user_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public."UserTenantRole"
    WHERE "tenantId" = NEW."tenantId"
      AND "userId" = actor_user_id
  ) THEN
    RAISE EXCEPTION 'Learning actor must belong to the tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;
