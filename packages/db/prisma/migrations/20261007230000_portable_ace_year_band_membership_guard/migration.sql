-- Restored deployments may keep membership in public while a new assignment
-- table is created in app. Prefer the assignment schema, then trusted schemas.
CREATE OR REPLACE FUNCTION app.require_ace_staff_year_band_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  active_staff_member boolean := false;
  candidate_schema text;
  membership_schema text;
BEGIN
  FOREACH candidate_schema IN ARRAY ARRAY[TG_TABLE_SCHEMA, 'public', 'app']
  LOOP
    IF pg_catalog.to_regclass(
      pg_catalog.format('%I."SiteMembership"', candidate_schema)
    ) IS NOT NULL AND pg_catalog.to_regclass(
      pg_catalog.format('%I."User"', candidate_schema)
    ) IS NOT NULL THEN
      membership_schema := candidate_schema;
      EXIT;
    END IF;
  END LOOP;

  IF membership_schema IS NULL THEN
    RAISE EXCEPTION 'Year-band membership tables are unavailable'
      USING ERRCODE = 'undefined_table';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1
       FROM %1$I."SiteMembership" AS membership
       JOIN %1$I."User" AS staff ON staff."id" = membership."userId"
       WHERE membership."tenantId" = $1
         AND membership."userId" = $2
         AND membership."role" IN (''STAFF'', ''SITE_ADMIN'')
         AND staff."isActive" = true
     )',
    membership_schema
  ) INTO active_staff_member USING NEW."tenantId", NEW."userId";

  IF NOT active_staff_member THEN
    RAISE EXCEPTION 'Year-band assignee must be an active site member'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_ace_staff_year_band_membership() FROM PUBLIC;
