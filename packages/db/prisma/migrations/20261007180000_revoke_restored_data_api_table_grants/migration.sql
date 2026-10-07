-- Application data is served by the NexSteps API, not the Supabase table API.
-- The restored snapshot has public-table grants; its earlier lockdown used
-- current_schema() and does not establish which schema was protected.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, app FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public, app REVOKE ALL ON TABLES FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF to_regrole(api_role) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, app FROM %I',
        api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public, app REVOKE ALL ON TABLES FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END;
$$;
