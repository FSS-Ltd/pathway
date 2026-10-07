-- Resolve the policy beside the triggering link in either app or public.
CREATE OR REPLACE FUNCTION app.require_student_portal_link_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  policy_enabled boolean;
BEGIN
  IF NEW."endedAt" IS NULL AND NEW."revokedAt" IS NULL THEN
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."StudentPortalPolicy"
          WHERE "tenantId" = $1 AND "studentPortalEnabled"
       )',
      TG_TABLE_SCHEMA
    ) INTO policy_enabled USING NEW."tenantId";

    IF NOT policy_enabled THEN
      RAISE EXCEPTION 'Active student identity links require an enabled student portal policy'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_student_portal_link_policy() FROM PUBLIC;
