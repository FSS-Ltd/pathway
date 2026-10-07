-- Pin trigger resolution to trusted built-ins. These three functions reference
-- only trigger records and pg_catalog objects, so their bodies need no change.
ALTER FUNCTION app.enforce_org_role_revision_immutable() SET search_path = '';
ALTER FUNCTION app.enforce_user_role_assignment_update() SET search_path = '';
ALTER FUNCTION app.protect_system_role_definition() SET search_path = '';

-- Learning actors are checked against membership tables beside the triggering
-- row, in either app or public. Keep the existing trigger and function identity
-- while making lookup independent of the caller's search_path.
CREATE OR REPLACE FUNCTION app.require_learning_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor_user_id text := pg_catalog.to_jsonb(NEW) ->> TG_ARGV[0];
  actor_is_member boolean;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1 FROM %1$I."SiteMembership"
       WHERE "tenantId" = $1 AND "userId" = $2
     ) OR EXISTS (
       SELECT 1 FROM %1$I."UserTenantRole"
       WHERE "tenantId" = $1 AND "userId" = $2
     )',
    TG_TABLE_SCHEMA
  ) INTO actor_is_member USING NEW."tenantId", actor_user_id;

  IF NOT actor_is_member THEN
    RAISE EXCEPTION 'Learning actor must belong to the tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;
