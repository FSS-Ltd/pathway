-- Supabase installs this event-trigger function with API-role EXECUTE grants.
-- The event trigger remains owned by postgres and does not need those grants.
DO $$
DECLARE
  api_role text;
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NULL THEN
    RETURN;
  END IF;

  REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF to_regrole(api_role) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END;
$$;
