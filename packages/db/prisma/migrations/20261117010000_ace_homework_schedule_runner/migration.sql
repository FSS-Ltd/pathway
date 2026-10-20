-- The cron worker has no tenant context while discovering due work. Return only
-- IDs and actor context; every command is reauthorised in a tenant transaction.
DO $$
DECLARE
  tenant_schema text;
BEGIN
  SELECT namespace.nspname INTO tenant_schema
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class referenced
    ON referenced.oid = constraint_row.confrelid
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = referenced.relnamespace
  WHERE constraint_row.conrelid = 'app."AceHomeworkAssignment"'::pg_catalog.regclass
    AND constraint_row.conname = 'AceHomeworkAssignment_tenantId_fkey';

  IF tenant_schema NOT IN ('app', 'public') OR tenant_schema IS NULL THEN
    RAISE EXCEPTION 'Homework site foreign key has an unsupported schema';
  END IF;
  EXECUTE pg_catalog.format(
    $definition$
      CREATE FUNCTION app.list_due_homework_schedules()
      RETURNS TABLE (
        "id" TEXT,
        "tenantId" TEXT,
        "orgId" TEXT,
        "scheduledByUserId" TEXT,
        "version" INTEGER
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = ''
      SET row_security = off
      AS $function$
        SELECT assignment."id", assignment."tenantId", site."orgId",
          assignment."scheduledByUserId", assignment."version"
        FROM app."AceHomeworkAssignment" assignment
        JOIN %I."Tenant" site ON site."id" = assignment."tenantId"
        WHERE assignment."status" = 'SCHEDULED'
          AND assignment."scheduledAt" <= pg_catalog.clock_timestamp()
          AND assignment."scheduledByUserId" IS NOT NULL
        ORDER BY assignment."scheduledAt", assignment."id"
        LIMIT 25;
      $function$;
    $definition$,
    tenant_schema
  );
END;
$$;
REVOKE ALL ON FUNCTION app.list_due_homework_schedules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_homework_schedules() TO CURRENT_USER;
