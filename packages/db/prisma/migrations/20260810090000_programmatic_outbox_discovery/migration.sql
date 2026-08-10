-- The scheduled dispatcher discovers only organisations with dispatchable work.
-- It deliberately returns identifiers, not organisation metadata or event data.
DO $$
DECLARE
  has_app_outbox_table BOOLEAN :=
    pg_catalog.to_regclass('app."OutboxEvent"') IS NOT NULL;
  has_public_outbox_table BOOLEAN :=
    pg_catalog.to_regclass('public."OutboxEvent"') IS NOT NULL;
  has_app_outbox_status BOOLEAN :=
    pg_catalog.to_regtype('app."OutboxStatus"') IS NOT NULL;
  has_public_outbox_status BOOLEAN :=
    pg_catalog.to_regtype('public."OutboxStatus"') IS NOT NULL;
  outbox_table_schema TEXT;
  outbox_status_schema TEXT;
BEGIN
  IF has_app_outbox_table = has_public_outbox_table THEN
    RAISE EXCEPTION
      'Outbox discovery requires exactly one supported OutboxEvent schema';
  END IF;

  IF has_app_outbox_status = has_public_outbox_status THEN
    RAISE EXCEPTION
      'Outbox discovery requires exactly one supported OutboxStatus schema';
  END IF;

  outbox_table_schema := CASE
    WHEN has_app_outbox_table THEN 'app'
    ELSE 'public'
  END;
  outbox_status_schema := CASE
    WHEN has_app_outbox_status THEN 'app'
    ELSE 'public'
  END;

  EXECUTE FORMAT(
    $definition$
      CREATE FUNCTION app.list_due_outbox_org_ids()
      RETURNS TABLE ("orgId" TEXT)
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = ''
      AS $function$
        SELECT DISTINCT event."orgId"
        FROM %1$I."OutboxEvent" AS event
        WHERE
          (event.status = 'PENDING'::%2$I."OutboxStatus"
            AND event."nextAttemptAt" <= CURRENT_TIMESTAMP)
          OR
          (event.status = 'PROCESSING'::%2$I."OutboxStatus"
            AND event."claimedAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes')
        ORDER BY event."orgId";
      $function$;
    $definition$,
    outbox_table_schema,
    outbox_status_schema
  );
END;
$$;

REVOKE ALL ON FUNCTION app.list_due_outbox_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_outbox_org_ids() TO CURRENT_USER;
