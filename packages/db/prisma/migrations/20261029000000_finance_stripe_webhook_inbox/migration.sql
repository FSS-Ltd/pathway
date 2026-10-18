-- Persist verified Finance Connect events before acknowledging Stripe.
DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceStripeConnection'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  PERFORM pg_catalog.set_config(
    'search_path',
    pg_catalog.format(
      '%I, %I',
      core_schema,
      CASE core_schema WHEN 'app' THEN 'public' ELSE 'app' END
    ),
    false
  );
END;
$$;

CREATE TYPE "FinanceStripeWebhookEventStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'RETRY',
  'AWAITING_HANDLER',
  'COMPLETED',
  'UNMATCHED',
  'DEAD_LETTER'
);

CREATE TABLE "FinanceStripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "stripeAccountId" TEXT,
  "eventType" TEXT NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "payloadSha256" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "status" "FinanceStripeWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "tenantId" TEXT,
  "orgId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "claimToken" TEXT,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceStripeWebhookEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStripeWebhookEvent_scope_status_valid" CHECK (
    ("tenantId" IS NULL AND "orgId" IS NULL AND "status" = 'UNMATCHED')
    OR
    ("tenantId" IS NOT NULL AND "orgId" IS NOT NULL AND "status" <> 'UNMATCHED')
  ),
  CONSTRAINT "FinanceStripeWebhookEvent_claim_shape_valid" CHECK (
    ("status" = 'PROCESSING' AND "claimedAt" IS NOT NULL AND "claimToken" IS NOT NULL)
    OR
    ("status" <> 'PROCESSING' AND "claimedAt" IS NULL AND "claimToken" IS NULL)
  ),
  CONSTRAINT "FinanceStripeWebhookEvent_processed_shape_valid" CHECK (
    ("status" = 'COMPLETED' AND "processedAt" IS NOT NULL)
    OR
    ("status" <> 'COMPLETED' AND "processedAt" IS NULL)
  ),
  CONSTRAINT "FinanceStripeWebhookEvent_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "FinanceStripeWebhookEvent_provider_id_nonempty" CHECK (length(btrim("stripeEventId")) > 0),
  CONSTRAINT "FinanceStripeWebhookEvent_type_nonempty" CHECK (length(btrim("eventType")) > 0),
  CONSTRAINT "FinanceStripeWebhookEvent_payload_sha256_valid" CHECK ("payloadSha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "FinanceStripeWebhookEvent_stripeEventId_key"
  ON "FinanceStripeWebhookEvent"("stripeEventId");
CREATE INDEX "FinanceStripeWebhookEvent_scope_status_due_idx"
  ON "FinanceStripeWebhookEvent"("tenantId", "orgId", "status", "nextAttemptAt");
CREATE INDEX "FinanceStripeWebhookEvent_status_claimed_idx"
  ON "FinanceStripeWebhookEvent"("status", "claimedAt");

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceStripeWebhookEvent'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format(
    'ALTER TABLE %I."FinanceStripeWebhookEvent" ADD CONSTRAINT "FinanceStripeWebhookEvent_tenant_scope_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES %I."Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE',
    core_schema,
    core_schema
  );
  EXECUTE format(
    'ALTER TABLE %I."FinanceStripeWebhookEvent" ADD CONSTRAINT "FinanceStripeWebhookEvent_org_fkey" FOREIGN KEY ("orgId") REFERENCES %I."Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
    core_schema,
    core_schema
  );
END;
$$;

CREATE FUNCTION finance_stripe_webhook_event_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStripeWebhookEvent_append_only',
      MESSAGE = 'Finance Stripe webhook evidence cannot be deleted';
  END IF;
  IF (
    NEW."id", NEW."stripeEventId", NEW."stripeAccountId", NEW."eventType",
    NEW."livemode", NEW."payloadSha256", NEW."payloadJson", NEW."tenantId",
    NEW."orgId", NEW."receivedAt"
  ) IS DISTINCT FROM (
    OLD."id", OLD."stripeEventId", OLD."stripeAccountId", OLD."eventType",
    OLD."livemode", OLD."payloadSha256", OLD."payloadJson", OLD."tenantId",
    OLD."orgId", OLD."receivedAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStripeWebhookEvent_facts_immutable',
      MESSAGE = 'Finance Stripe webhook evidence facts cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceStripeWebhookEvent_evidence_guard"
BEFORE UPDATE OR DELETE ON "FinanceStripeWebhookEvent"
FOR EACH ROW EXECUTE FUNCTION finance_stripe_webhook_event_guard();
CREATE TRIGGER "FinanceStripeWebhookEvent_no_truncate"
BEFORE TRUNCATE ON "FinanceStripeWebhookEvent"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceStripeWebhookEvent_no_truncate');

ALTER TABLE "FinanceStripeWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceStripeWebhookEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FinanceStripeWebhookEvent_tenant_org_rls" ON "FinanceStripeWebhookEvent"
  USING ("tenantId" IS NOT NULL
    AND "orgId" IS NOT NULL
    AND app.current_tenant_id() IS NOT NULL
    AND app.current_org_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
    AND "orgId" = app.current_org_id())
  WITH CHECK ("tenantId" IS NOT NULL
    AND "orgId" IS NOT NULL
    AND app.current_tenant_id() IS NOT NULL
    AND app.current_org_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
    AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON TABLE "FinanceStripeWebhookEvent" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "FinanceStripeWebhookEvent" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "FinanceStripeWebhookEvent" FROM authenticated;
  END IF;
END;
$$;

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceStripeWebhookEvent'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format($function$
    CREATE FUNCTION app.capture_finance_stripe_webhook_event(
      p_stripe_event_id TEXT,
      p_stripe_account_id TEXT,
      p_event_type TEXT,
      p_livemode BOOLEAN,
      p_payload_sha256 TEXT,
      p_payload_json JSONB
    ) RETURNS TEXT
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $body$
    DECLARE
      mapped_tenant_id TEXT;
      mapped_org_id TEXT;
      mapped_livemode BOOLEAN;
      event_status TEXT;
      inserted_rows BIGINT;
    BEGIN
      IF p_stripe_account_id IS NOT NULL THEN
        SELECT connection."tenantId", connection."orgId", connection."livemode"
          INTO mapped_tenant_id, mapped_org_id, mapped_livemode
        FROM %1$I."FinanceStripeConnection" AS connection
        WHERE connection."stripeAccountId" = p_stripe_account_id;
      END IF;

      IF mapped_tenant_id IS NOT NULL AND mapped_livemode = p_livemode THEN
        event_status := 'RECEIVED';
      ELSE
        mapped_tenant_id := NULL;
        mapped_org_id := NULL;
        event_status := 'UNMATCHED';
      END IF;

      INSERT INTO %1$I."FinanceStripeWebhookEvent" (
        "id", "stripeEventId", "stripeAccountId", "eventType", "livemode",
        "payloadSha256", "payloadJson", "status", "tenantId", "orgId"
      ) VALUES (
        pg_catalog.gen_random_uuid()::TEXT, p_stripe_event_id,
        p_stripe_account_id, p_event_type, p_livemode, p_payload_sha256,
        p_payload_json, event_status::%1$I."FinanceStripeWebhookEventStatus",
        mapped_tenant_id, mapped_org_id
      )
      ON CONFLICT ("stripeEventId") DO NOTHING;
      GET DIAGNOSTICS inserted_rows = ROW_COUNT;
      IF inserted_rows = 0 THEN
        RETURN 'duplicate';
      END IF;
      IF event_status = 'RECEIVED' THEN
        RETURN 'accepted';
      END IF;
      RETURN 'unmatched';
    END;
    $body$;
  $function$, core_schema);

  EXECUTE format($function$
    CREATE FUNCTION app.list_due_finance_stripe_webhook_scopes(p_now TIMESTAMPTZ)
    RETURNS TABLE ("tenantId" TEXT, "orgId" TEXT)
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = ''
    AS $body$
      SELECT DISTINCT event."tenantId", event."orgId"
      FROM %1$I."FinanceStripeWebhookEvent" AS event
      WHERE (
        event.status IN (
          'RECEIVED'::%1$I."FinanceStripeWebhookEventStatus",
          'RETRY'::%1$I."FinanceStripeWebhookEventStatus"
        ) AND event."nextAttemptAt" <= (p_now AT TIME ZONE 'UTC')
      ) OR (
        event.status = 'PROCESSING'::%1$I."FinanceStripeWebhookEventStatus"
        AND event."claimedAt" <= (p_now AT TIME ZONE 'UTC') - INTERVAL '5 minutes'
      )
      ORDER BY event."tenantId", event."orgId";
    $body$;
  $function$, core_schema);
END;
$$;

REVOKE ALL ON FUNCTION app.capture_finance_stripe_webhook_event(TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_due_finance_stripe_webhook_scopes(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.capture_finance_stripe_webhook_event(TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION app.list_due_finance_stripe_webhook_scopes(TIMESTAMPTZ) TO CURRENT_USER;
