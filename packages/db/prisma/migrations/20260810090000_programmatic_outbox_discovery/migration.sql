-- The scheduled dispatcher discovers only organisations with dispatchable work.
-- It deliberately returns identifiers, not organisation metadata or event data.
CREATE FUNCTION app.list_due_outbox_org_ids()
RETURNS TABLE ("orgId" TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT event."orgId"
  FROM app."OutboxEvent" AS event
  WHERE
    (event.status = 'PENDING'::app."OutboxStatus"
      AND event."nextAttemptAt" <= CURRENT_TIMESTAMP)
    OR
    (event.status = 'PROCESSING'::app."OutboxStatus"
      AND event."claimedAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes')
  ORDER BY event."orgId";
$$;

REVOKE ALL ON FUNCTION app.list_due_outbox_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_outbox_org_ids() TO CURRENT_USER;
