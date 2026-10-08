-- The API may discover only the authenticated user's family identity site IDs
-- before opening one tenant-scoped transaction per candidate site. This adds
-- no table grants to anon or authenticated and does not widen write policies.
DO $$
DECLARE
  data_schema text;
  identity_table text;
BEGIN
  FOREACH data_schema IN ARRAY ARRAY['app', 'public'] LOOP
    FOREACH identity_table IN ARRAY ARRAY['GuardianIdentity', 'StudentIdentity'] LOOP
      IF to_regclass(format('%I.%I', data_schema, identity_table)) IS NOT NULL THEN
        EXECUTE format(
          $policy$CREATE POLICY %I ON %I.%I FOR SELECT
            USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))$policy$,
          identity_table || '_self_discovery',
          data_schema,
          identity_table
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
