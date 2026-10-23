-- Add operational coverage/cases without changing family debt or issued snapshots.
DO $$
DECLARE core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceStripeConnection' AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');
  PERFORM pg_catalog.set_config('search_path', pg_catalog.format('%I, %I', core_schema,
    CASE core_schema WHEN 'app' THEN 'public' ELSE 'app' END), false);
END;
$$;

CREATE TYPE "FinanceStripeEvidenceSource" AS ENUM ('SIGNED_WEBHOOK', 'API_RECONCILIATION');
CREATE TYPE "FinanceReconciliationCaseKind" AS ENUM (
  'UNKNOWN_OPERATION', 'UNMATCHED_MONEY', 'PROVIDER_UNAVAILABLE', 'COVERAGE_GAP',
  'REPLAY_FAILED', 'REFUND_AND_RETURN', 'SETTLEMENT_DIFFERENCE', 'CONNECTION_DISCONNECTED'
);
CREATE TYPE "FinanceReconciliationCaseStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "FinanceReconciliationCaseEventType" AS ENUM (
  'DETECTED', 'UPDATED', 'ACKNOWLEDGED', 'RESOLVED', 'REOPENED', 'REPLAY_REQUESTED'
);

CREATE TABLE "FinanceReconciliationState" (
  "id" TEXT PRIMARY KEY,
  "stripeConnectionId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "stream" VARCHAR(32) NOT NULL,
  "windowFrom" TIMESTAMP(3),
  "windowTo" TIMESTAMP(3),
  "pageCursor" VARCHAR(255),
  "completedThrough" TIMESTAMP(3),
  "lastSucceededAt" TIMESTAMP(3),
  "leaseToken" VARCHAR(64),
  "leaseExpiresAt" TIMESTAMP(3),
  "retryAfter" TIMESTAMP(3),
  "lastError" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceReconciliationState_stream_valid" CHECK (
    "stream" IN ('events', 'checkoutSessions', 'paymentIntents', 'charges', 'refunds', 'disputes', 'balanceTransactions', 'payouts')
  ),
  CONSTRAINT "FinanceReconciliationState_window_valid" CHECK (
    ("windowFrom" IS NULL AND "windowTo" IS NULL AND "pageCursor" IS NULL)
    OR ("windowFrom" IS NOT NULL AND "windowTo" IS NOT NULL AND "windowFrom" < "windowTo"
      AND ("completedThrough" IS NULL OR "windowTo" >= "completedThrough"))
  ),
  CONSTRAINT "FinanceReconciliationState_lease_valid" CHECK (
    ("leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
    OR ("leaseToken" IS NOT NULL AND length(btrim("leaseToken")) > 0 AND "leaseExpiresAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "FinanceReconciliationState_id_tenantId_orgId_key" ON "FinanceReconciliationState"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceReconciliationState_stripeConnectionId_stream_key" ON "FinanceReconciliationState"("stripeConnectionId", "stream");
CREATE INDEX "FinanceReconciliationState_tenantId_orgId_updatedAt_idx" ON "FinanceReconciliationState"("tenantId", "orgId", "updatedAt");
CREATE INDEX "FinanceReconciliationState_retryAfter_leaseExpiresAt_idx" ON "FinanceReconciliationState"("retryAfter", "leaseExpiresAt");

CREATE TABLE "FinanceReconciliationCase" (
  "id" TEXT PRIMARY KEY,
  "stripeConnectionId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "caseKey" VARCHAR(255) NOT NULL,
  "kind" "FinanceReconciliationCaseKind" NOT NULL,
  "status" "FinanceReconciliationCaseStatus" NOT NULL DEFAULT 'OPEN',
  "resourceReference" VARCHAR(255),
  "amountMinor" BIGINT,
  "currency" VARCHAR(3),
  "details" JSONB NOT NULL,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceReconciliationCase_key_valid" CHECK (length(btrim("caseKey")) > 0),
  CONSTRAINT "FinanceReconciliationCase_money_valid" CHECK (
    ("amountMinor" IS NULL AND "currency" IS NULL)
    OR ("amountMinor" IS NOT NULL AND "currency" IS NOT NULL AND "currency" ~ '^[A-Z]{3}$')
  ),
  CONSTRAINT "FinanceReconciliationCase_status_valid" CHECK (
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL)
    OR ("status" <> 'RESOLVED' AND "resolvedAt" IS NULL)
  ),
  CONSTRAINT "FinanceReconciliationCase_acknowledgement_valid" CHECK (
    "status" <> 'ACKNOWLEDGED' OR "acknowledgedAt" IS NOT NULL
  )
);
CREATE UNIQUE INDEX "FinanceReconciliationCase_id_tenantId_orgId_key" ON "FinanceReconciliationCase"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceReconciliationCase_stripeConnectionId_caseKey_key" ON "FinanceReconciliationCase"("stripeConnectionId", "caseKey");
CREATE INDEX "FinanceReconciliationCase_tenantId_orgId_status_lastSeenAt_idx" ON "FinanceReconciliationCase"("tenantId", "orgId", "status", "lastSeenAt");

CREATE TABLE "FinanceReconciliationCaseEvent" (
  "id" TEXT PRIMARY KEY,
  "caseId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "FinanceReconciliationCaseEventType" NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReconciliationCaseEvent_actor_required" CHECK (
    "type" NOT IN ('ACKNOWLEDGED', 'REPLAY_REQUESTED') OR "actorUserId" IS NOT NULL
  )
);
CREATE UNIQUE INDEX "FinanceReconciliationCaseEvent_id_tenantId_orgId_key" ON "FinanceReconciliationCaseEvent"("id", "tenantId", "orgId");
CREATE INDEX "FinanceReconciliationCaseEvent_scope_case_created_idx" ON "FinanceReconciliationCaseEvent"("tenantId", "orgId", "caseId", "createdAt");

ALTER TABLE "FinanceReconciliationState" ADD CONSTRAINT "FinanceReconciliationState_connection_scope_fkey"
  FOREIGN KEY ("stripeConnectionId", "tenantId", "orgId") REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationState" ADD CONSTRAINT "FinanceReconciliationState_tenant_scope_fkey"
  FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationState" ADD CONSTRAINT "FinanceReconciliationState_org_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationCase" ADD CONSTRAINT "FinanceReconciliationCase_connection_scope_fkey"
  FOREIGN KEY ("stripeConnectionId", "tenantId", "orgId") REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationCase" ADD CONSTRAINT "FinanceReconciliationCase_tenant_scope_fkey"
  FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationCase" ADD CONSTRAINT "FinanceReconciliationCase_org_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationCaseEvent" ADD CONSTRAINT "FinanceReconciliationCaseEvent_case_scope_fkey"
  FOREIGN KEY ("caseId", "tenantId", "orgId") REFERENCES "FinanceReconciliationCase"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationCaseEvent" ADD CONSTRAINT "FinanceReconciliationCaseEvent_actor_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION finance_reconciliation_state_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reconciliation coverage cannot be deleted';
  END IF;
  IF (NEW."id", NEW."stripeConnectionId", NEW."tenantId", NEW."orgId", NEW."stream", NEW."createdAt")
    IS DISTINCT FROM (OLD."id", OLD."stripeConnectionId", OLD."tenantId", OLD."orgId", OLD."stream", OLD."createdAt")
    OR (OLD."completedThrough" IS NOT NULL AND (NEW."completedThrough" IS NULL OR NEW."completedThrough" < OLD."completedThrough"))
    OR (OLD."lastSucceededAt" IS NOT NULL AND (NEW."lastSucceededAt" IS NULL OR NEW."lastSucceededAt" < OLD."lastSucceededAt")) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reconciliation scope and completed coverage cannot regress';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FinanceReconciliationState_guard" BEFORE UPDATE OR DELETE ON "FinanceReconciliationState"
  FOR EACH ROW EXECUTE FUNCTION finance_reconciliation_state_guard();

CREATE FUNCTION finance_reconciliation_case_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reconciliation cases cannot be deleted';
  END IF;
  IF (NEW."id", NEW."stripeConnectionId", NEW."tenantId", NEW."orgId", NEW."caseKey", NEW."kind", NEW."createdAt")
    IS DISTINCT FROM (OLD."id", OLD."stripeConnectionId", OLD."tenantId", OLD."orgId", OLD."caseKey", OLD."kind", OLD."createdAt")
    OR NEW."lastSeenAt" < OLD."lastSeenAt" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reconciliation case identity cannot change';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FinanceReconciliationCase_guard" BEFORE UPDATE OR DELETE ON "FinanceReconciliationCase"
  FOR EACH ROW EXECUTE FUNCTION finance_reconciliation_case_guard();
CREATE TRIGGER "FinanceReconciliationCaseEvent_append_only" BEFORE UPDATE OR DELETE ON "FinanceReconciliationCaseEvent"
  FOR EACH ROW EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceReconciliationCaseEvent_append_only');

DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['FinanceReconciliationState', 'FinanceReconciliationCase', 'FinanceReconciliationCaseEvent'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id()) WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id())', table_name || '_tenant_org_rls', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only(%L)', table_name || '_no_truncate', table_name, table_name || '_no_truncate');
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF to_regrole(role_name) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE "FinanceStripeWebhookEvent"
  ADD COLUMN "evidenceSource" "FinanceStripeEvidenceSource" NOT NULL DEFAULT 'SIGNED_WEBHOOK',
  ADD COLUMN "reconciliationConnectionId" TEXT,
  ADD CONSTRAINT "FinanceStripeWebhookEvent_recovery_source_valid" CHECK (
    ("evidenceSource" = 'SIGNED_WEBHOOK' AND "reconciliationConnectionId" IS NULL)
    OR ("evidenceSource" = 'API_RECONCILIATION' AND "reconciliationConnectionId" IS NOT NULL AND "tenantId" IS NOT NULL AND "orgId" IS NOT NULL)
  ),
  ADD CONSTRAINT "FinanceStripeWebhookEvent_recovery_connection_scope_fkey"
    FOREIGN KEY ("reconciliationConnectionId", "tenantId", "orgId") REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FinanceStripeWebhookEvent_recovery_received_idx" ON "FinanceStripeWebhookEvent"("reconciliationConnectionId", "receivedAt");

DO $$
DECLARE core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceStripeConnection' AND c.relkind IN ('r', 'p') AND n.nspname IN ('app', 'public');
  EXECUTE format($function$
    CREATE OR REPLACE FUNCTION %1$I.finance_stripe_webhook_event_guard()
    RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $body$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStripeWebhookEvent_append_only', MESSAGE = 'Finance Stripe evidence cannot be deleted';
      END IF;
      IF TG_OP = 'INSERT' THEN
        IF NEW."evidenceSource" = 'API_RECONCILIATION' AND (
          NOT EXISTS (SELECT 1 FROM %1$I."FinanceStripeConnection" c WHERE c."id" = NEW."reconciliationConnectionId"
            AND c."tenantId" = NEW."tenantId" AND c."orgId" = NEW."orgId"
            AND c."stripeAccountId" = NEW."stripeAccountId" AND c."livemode" = NEW."livemode")
          OR NEW."payloadJson"->>'id' IS DISTINCT FROM NEW."stripeEventId"
          OR NEW."payloadJson"->>'type' IS DISTINCT FROM NEW."eventType"
          OR NEW."payloadJson"->>'account' IS DISTINCT FROM NEW."stripeAccountId"
          OR NEW."payloadJson"->'livemode' IS DISTINCT FROM to_jsonb(NEW."livemode")
        ) THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Recovered Stripe evidence does not match its school connection';
        END IF;
        RETURN NEW;
      END IF;
      IF (NEW."id", NEW."stripeEventId", NEW."stripeAccountId", NEW."eventType", NEW."livemode", NEW."payloadSha256", NEW."payloadJson", NEW."tenantId", NEW."orgId", NEW."receivedAt", NEW."evidenceSource", NEW."reconciliationConnectionId")
        IS DISTINCT FROM (OLD."id", OLD."stripeEventId", OLD."stripeAccountId", OLD."eventType", OLD."livemode", OLD."payloadSha256", OLD."payloadJson", OLD."tenantId", OLD."orgId", OLD."receivedAt", OLD."evidenceSource", OLD."reconciliationConnectionId") THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStripeWebhookEvent_facts_immutable', MESSAGE = 'Finance Stripe evidence facts cannot be changed';
      END IF;
      RETURN NEW;
    END;
    $body$;
  $function$, core_schema);
END;
$$;
DROP TRIGGER "FinanceStripeWebhookEvent_evidence_guard" ON "FinanceStripeWebhookEvent";
CREATE TRIGGER "FinanceStripeWebhookEvent_evidence_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FinanceStripeWebhookEvent"
  FOR EACH ROW EXECUTE FUNCTION finance_stripe_webhook_event_guard();
