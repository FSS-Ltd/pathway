-- The API may discover only the authenticated user's family identity site IDs
-- before opening one tenant-scoped transaction per candidate site. This adds
-- no table grants to anon or authenticated and does not widen write policies.
-- The restored production layout has an app.StudentIdentity view over the
-- public base table. A failed 8 October attempt treated that view as a table;
-- only forced-RLS base tables can receive these policies.
DO $$
DECLARE
  data_schema text;
  identity_table text;
  identity_kind "char";
  rls_enabled boolean;
  rls_forced boolean;
  base_table_count integer;
BEGIN
  FOREACH identity_table IN ARRAY ARRAY['GuardianIdentity', 'StudentIdentity'] LOOP
    base_table_count := 0;
    FOREACH data_schema IN ARRAY ARRAY['app', 'public'] LOOP
      SELECT relation.relkind, relation.relrowsecurity, relation.relforcerowsecurity
      INTO identity_kind, rls_enabled, rls_forced
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = data_schema
        AND relation.relname = identity_table;

      IF identity_kind IN ('r', 'p') THEN
        IF NOT rls_enabled OR NOT rls_forced THEN
          RAISE EXCEPTION 'Family identity table %.% must have forced RLS',
            data_schema, identity_table;
        END IF;
        EXECUTE format(
          $policy$CREATE POLICY %I ON %I.%I FOR SELECT
            USING ("userId" = NULLIF(current_setting('app.user_id', true), ''))$policy$,
          identity_table || '_self_discovery',
          data_schema,
          identity_table
        );
        base_table_count := base_table_count + 1;
      ELSIF identity_kind IS NOT NULL AND identity_kind <> 'v' THEN
        RAISE EXCEPTION 'Unsupported family identity relation %.% (kind %)',
          data_schema, identity_table, identity_kind;
      END IF;
    END LOOP;

    IF base_table_count = 0 THEN
      RAISE EXCEPTION 'No base table found for family identity %', identity_table;
    END IF;
  END LOOP;
END;
$$;
