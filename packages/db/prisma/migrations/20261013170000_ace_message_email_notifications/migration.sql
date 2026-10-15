-- Email notification state is site-scoped and contains no message body.
-- Core identity tables live in app on fresh databases and public on restored ones.
SET search_path TO app, public;

ALTER TABLE app."MessageParticipant" ADD COLUMN "mutedAt" TIMESTAMP(3);

CREATE TABLE app."MessageEmailPreference" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStart" VARCHAR(5),
  "quietHoursEnd" VARCHAR(5),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageEmailPreference_tenantId_userId_key" UNIQUE ("tenantId", "userId"),
  CONSTRAINT "MessageEmailPreference_quiet_hours_check" CHECK (
    ("quietHoursStart" IS NULL AND "quietHoursEnd" IS NULL)
    OR (
      "quietHoursStart" IS NOT NULL
      AND "quietHoursEnd" IS NOT NULL
      AND "quietHoursStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "quietHoursEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "quietHoursStart" <> "quietHoursEnd"
    )
  )
);

CREATE TABLE app."MessageEmailDelivery" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "recipientParticipantId" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'CLAIMED',
  "providerId" TEXT,
  "failureCategory" VARCHAR(64),
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "MessageEmailDelivery_tenant_message_recipient_key"
    UNIQUE ("tenantId", "messageId", "recipientParticipantId"),
  CONSTRAINT "MessageEmailDelivery_status_check" CHECK (
    ("status" = 'CLAIMED' AND "providerId" IS NULL AND "sentAt" IS NULL AND "failureCategory" IS NULL)
    OR ("status" = 'SENT' AND "providerId" IS NOT NULL AND "sentAt" IS NOT NULL AND "failureCategory" IS NULL)
    OR ("status" = 'FAILED' AND "providerId" IS NULL AND "sentAt" IS NULL AND "failureCategory" IS NOT NULL)
  ),
  CONSTRAINT "MessageEmailDelivery_message_fkey" FOREIGN KEY ("messageId", "tenantId")
    REFERENCES app."Message"("id", "tenantId") ON DELETE RESTRICT,
  CONSTRAINT "MessageEmailDelivery_participant_fkey" FOREIGN KEY ("recipientParticipantId", "tenantId")
    REFERENCES app."MessageParticipant"("id", "tenantId") ON DELETE RESTRICT
);

CREATE INDEX "MessageEmailDelivery_tenantId_status_claimedAt_idx"
  ON app."MessageEmailDelivery" ("tenantId", "status", "claimedAt");

DO $$
DECLARE
  core_schema text;
BEGIN
  IF pg_catalog.to_regclass('app."Tenant"') IS NOT NULL
    AND pg_catalog.to_regclass('app."User"') IS NOT NULL THEN
    core_schema := 'app';
  ELSIF pg_catalog.to_regclass('public."Tenant"') IS NOT NULL
    AND pg_catalog.to_regclass('public."User"') IS NOT NULL THEN
    core_schema := 'public';
  ELSE
    RAISE EXCEPTION 'ACE email preferences require Tenant and User tables';
  END IF;
  EXECUTE pg_catalog.format(
    'ALTER TABLE app."MessageEmailPreference" ADD CONSTRAINT "MessageEmailPreference_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES %I."Tenant"("id") ON DELETE RESTRICT',
    core_schema
  );
  EXECUTE pg_catalog.format(
    'ALTER TABLE app."MessageEmailPreference" ADD CONSTRAINT "MessageEmailPreference_user_fkey" FOREIGN KEY ("userId") REFERENCES %I."User"("id") ON DELETE RESTRICT',
    core_schema
  );
END;
$$;

-- Discover IDs only; event data is read later under the organisation's RLS context.
DO $$
DECLARE outbox_schema text;
BEGIN
  IF pg_catalog.to_regclass('app."OutboxEvent"') IS NOT NULL THEN
    outbox_schema := 'app';
  ELSIF pg_catalog.to_regclass('public."OutboxEvent"') IS NOT NULL THEN
    outbox_schema := 'public';
  ELSE
    RAISE EXCEPTION 'ACE email dispatcher requires OutboxEvent';
  END IF;
  EXECUTE pg_catalog.format(
    'CREATE INDEX "OutboxEvent_ace_message_email_due_idx" ON %I."OutboxEvent" ("status", "nextAttemptAt", "claimedAt", "orgId") WHERE "eventType" = ''ace.message.sent''',
    outbox_schema
  );
  EXECUTE pg_catalog.format($definition$
    CREATE FUNCTION app.list_due_message_email_org_ids()
    RETURNS TABLE ("orgId" text)
    LANGUAGE sql SECURITY DEFINER SET search_path = ''
    AS $function$
      SELECT event."orgId"
      FROM %I."OutboxEvent" event
      WHERE event."eventType" = 'ace.message.sent'
        AND (
          (event."status"::text = 'PENDING' AND event."nextAttemptAt" <= CURRENT_TIMESTAMP)
          OR (event."status"::text = 'PROCESSING'
            AND event."claimedAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes')
        )
      GROUP BY event."orgId"
      ORDER BY MIN(event."createdAt"), event."orgId"
    $function$;
  $definition$, outbox_schema);
END;
$$;
REVOKE ALL ON FUNCTION app.list_due_message_email_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_message_email_org_ids() TO CURRENT_USER;

ALTER TABLE app."MessageEmailPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."MessageEmailPreference" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MessageEmailPreference_tenant" ON app."MessageEmailPreference"
  USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
  WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());

ALTER TABLE app."MessageEmailDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."MessageEmailDelivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY "MessageEmailDelivery_tenant" ON app."MessageEmailDelivery"
  USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
  WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());

-- Prisma uses public invoker-rights views for ACE tables on the restored database.
CREATE OR REPLACE VIEW public."MessageParticipant" WITH (security_invoker = true)
  AS SELECT * FROM app."MessageParticipant";
CREATE VIEW public."MessageEmailPreference" WITH (security_invoker = true)
  AS SELECT * FROM app."MessageEmailPreference";
CREATE VIEW public."MessageEmailDelivery" WITH (security_invoker = true)
  AS SELECT * FROM app."MessageEmailDelivery";

REVOKE ALL ON TABLE app."MessageEmailPreference", app."MessageEmailDelivery",
  public."MessageEmailPreference", public."MessageEmailDelivery" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF pg_catalog.to_regrole(api_role) IS NOT NULL THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON TABLE app."MessageEmailPreference", app."MessageEmailDelivery", public."MessageEmailPreference", public."MessageEmailDelivery" FROM %I', api_role
      );
    END IF;
  END LOOP;
END;
$$;
