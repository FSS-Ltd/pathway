-- Capture notification intent in the source transaction. Delivery and client
-- polling changes are separate delivery steps; existing notification paths stay active.
-- No source rows are backfilled and no browser/Data API privileges are granted.
CREATE OR REPLACE FUNCTION app.capture_message_realtime_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  source_org_id text;
  notification_type text;
  notification_payload jsonb;
  notification_key text;
BEGIN
  -- Activate only after the dedicated realtime consumer is verified and deployed.
  IF pg_catalog.current_setting('app.realtime_capture_enabled', true) IS DISTINCT FROM 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'Message' AND TG_OP = 'INSERT' THEN
    notification_type := 'message.created';
    notification_payload := pg_catalog.jsonb_build_object(
      'type', notification_type,
      'conversationId', NEW."conversationId",
      'messageId', NEW."id"
    );
    notification_key := 'realtime:message.created:' || NEW."id";
  ELSIF TG_TABLE_NAME = 'MessageParticipantReadCursor' THEN
    IF NEW."lastReadSequence" <= 0 THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW."lastReadSequence" <= OLD."lastReadSequence" THEN
        RETURN NEW;
      END IF;
    END IF;
    notification_type := 'conversation.read';
    notification_payload := pg_catalog.jsonb_build_object(
      'type', notification_type,
      'conversationId', NEW."conversationId",
      'readerScope', 'participant'
    );
    notification_key := 'realtime:conversation.read:' || NEW."id" || ':' || NEW."lastReadSequence"::text;
  ELSE
    RAISE EXCEPTION 'Unsupported realtime notification source';
  END IF;

  -- The site owns the organisation boundary; never take it from notification input.
  EXECUTE pg_catalog.format(
    'SELECT "orgId" FROM %I."Tenant" WHERE "id" = $1', TG_ARGV[0]
  ) INTO source_org_id USING NEW."tenantId";
  IF source_org_id IS NULL OR source_org_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'Realtime notification organisation context mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reuse the existing forced-RLS outbox and its organisation idempotency key.
  -- The realtime.* namespace belongs exclusively to the realtime dispatcher.
  EXECUTE pg_catalog.format($insert$
    INSERT INTO %I."OutboxEvent" (
      "id", "orgId", "aggregateType", "aggregateId", "eventType", "payload", "idempotencyKey"
    ) VALUES ($1, $2, 'REALTIME_CONVERSATION', $3, $4, $5, $6)
    ON CONFLICT ("orgId", "idempotencyKey") DO NOTHING
  $insert$, TG_ARGV[1])
  USING pg_catalog.gen_random_uuid()::text, source_org_id, NEW."conversationId",
    'realtime.' || notification_type, notification_payload, notification_key;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.capture_message_realtime_notification() FROM PUBLIC;

-- Restored databases can keep core tables in public and messaging in app;
-- fresh installations use the Prisma-selected schema for both.
DO $$
DECLARE
  tenant_schema text;
  outbox_schema text;
  message_schema text;
BEGIN
  SELECT n.nspname INTO tenant_schema
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = COALESCE(pg_catalog.to_regclass('app."Tenant"'), pg_catalog.to_regclass('public."Tenant"'));
  SELECT n.nspname INTO outbox_schema
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = COALESCE(pg_catalog.to_regclass('app."OutboxEvent"'), pg_catalog.to_regclass('public."OutboxEvent"'));
  SELECT n.nspname INTO message_schema
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = COALESCE(pg_catalog.to_regclass('app."Message"'), pg_catalog.to_regclass('public."Message"'));
  IF tenant_schema IS NULL OR outbox_schema IS NULL OR message_schema IS NULL THEN
    RAISE EXCEPTION 'Realtime notification capture requires Tenant, OutboxEvent and Message tables';
  END IF;
  EXECUTE pg_catalog.format(
    'CREATE TRIGGER "Message_capture_realtime" AFTER INSERT ON %I."Message" FOR EACH ROW EXECUTE FUNCTION app.capture_message_realtime_notification(%L, %L)',
    message_schema, tenant_schema, outbox_schema
  );
  EXECUTE pg_catalog.format(
    'CREATE TRIGGER "MessageReadCursor_capture_realtime" AFTER INSERT OR UPDATE OF "lastReadSequence" ON %I."MessageParticipantReadCursor" FOR EACH ROW EXECUTE FUNCTION app.capture_message_realtime_notification(%L, %L)',
    message_schema, tenant_schema, outbox_schema
  );
END;
$$;
