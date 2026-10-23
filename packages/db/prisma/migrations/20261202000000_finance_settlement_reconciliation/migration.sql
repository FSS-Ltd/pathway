-- Add private processor evidence and durable payout constituent continuation.
-- No receipt, allocation, credit or family balance is changed.
DO $$
DECLARE core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'FinanceStripeConnection' AND c.relkind IN ('r', 'p') AND n.nspname IN ('app', 'public');
  PERFORM pg_catalog.set_config('search_path', pg_catalog.format('%I, %I', core_schema,
    CASE core_schema WHEN 'app' THEN 'public' ELSE 'app' END), false);
END;
$$;
CREATE TABLE "FinanceSettlementEvidence" (
  "id" TEXT PRIMARY KEY,
  "stripeConnectionId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "stripeAccountId" VARCHAR(255) NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "resourceType" VARCHAR(32) NOT NULL CHECK ("resourceType" IN ('charge', 'balance_transaction', 'payout', 'payout.coverage', 'payout.constituent')),
  "providerReference" VARCHAR(255) NOT NULL CHECK (length("providerReference") > 0),
  "digest" VARCHAR(64) NOT NULL CHECK ("digest" ~ '^[a-f0-9]{64}$'),
  "facts" JSONB NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceSettlementEvidence_facts_valid" CHECK (
    jsonb_typeof("facts") = 'object' AND "facts"->>'id' IS NOT DISTINCT FROM "providerReference"
    AND "facts"->>'object' IS NOT DISTINCT FROM "resourceType"
  ),
  CONSTRAINT "FinanceSettlementEvidence_connection_scope_fkey" FOREIGN KEY ("stripeConnectionId", "tenantId", "orgId")
    REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinanceSettlementEvidence_identity_key" ON "FinanceSettlementEvidence"("stripeConnectionId", "resourceType", "providerReference", "digest");
CREATE INDEX "FinanceSettlementEvidence_scope_observed_idx" ON "FinanceSettlementEvidence"("tenantId", "orgId", "stripeConnectionId", "observedAt");
CREATE TABLE "FinancePayoutReconciliation" (
  "id" TEXT PRIMARY KEY,
  "stripeConnectionId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "payoutId" VARCHAR(255) NOT NULL CHECK ("payoutId" ~ '^po_[A-Za-z0-9_]+$'),
  "payoutFacts" JSONB NOT NULL,
  "coverage" JSONB NOT NULL,
  "complete" BOOLEAN NOT NULL,
  "status" VARCHAR(32) NOT NULL CHECK ("status" IN ('INCOMPLETE', 'MANUAL_UNSUPPORTED', 'CURRENCY_MISMATCH', 'PAYOUT_PENDING', 'MATCHED', 'DIFFERENCE')),
  "observedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancePayoutReconciliation_facts_valid" CHECK (
    "payoutFacts"->>'id' IS NOT DISTINCT FROM "payoutId" AND "payoutFacts"->>'object' IS NOT DISTINCT FROM 'payout'
    AND "coverage"->>'status' IS NOT DISTINCT FROM "status"
    AND "coverage"->'complete' IS NOT DISTINCT FROM to_jsonb("complete")
    AND ("status" <> 'INCOMPLETE' OR (NOT "complete" AND jsonb_typeof("coverage"->'nextCursor') = 'string'))
    AND ("status" NOT IN ('MATCHED', 'DIFFERENCE', 'CURRENCY_MISMATCH', 'PAYOUT_PENDING') OR "complete")
  ),
  CONSTRAINT "FinancePayoutReconciliation_connection_scope_fkey" FOREIGN KEY ("stripeConnectionId", "tenantId", "orgId")
    REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancePayoutReconciliation_stripeConnectionId_payoutId_key" ON "FinancePayoutReconciliation"("stripeConnectionId", "payoutId");
CREATE INDEX "FinancePayoutReconciliation_unresolved_idx" ON "FinancePayoutReconciliation"("tenantId", "orgId", "stripeConnectionId", "status", "payoutId");
DO $$
DECLARE core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'FinanceStripeConnection' AND c.relkind IN ('r', 'p') AND n.nspname IN ('app', 'public');
  EXECUTE format($function$
    CREATE FUNCTION %1$I.finance_settlement_scope_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $body$
    BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Settlement coverage cannot be deleted'; END IF;
      IF TG_TABLE_NAME = 'FinanceSettlementEvidence' THEN
        IF NOT EXISTS (SELECT 1 FROM %1$I."FinanceStripeConnection" c WHERE c."id" = NEW."stripeConnectionId"
          AND c."tenantId" = NEW."tenantId" AND c."orgId" = NEW."orgId" AND c."stripeAccountId" = NEW."stripeAccountId" AND c."livemode" = NEW."livemode")
          OR (NEW."facts" ? 'livemode' AND NEW."facts"->'livemode' IS DISTINCT FROM to_jsonb(NEW."livemode")) THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Settlement account or mode mismatch';
        END IF;
      ELSE
        IF NOT EXISTS (SELECT 1 FROM %1$I."FinanceStripeConnection" c WHERE c."id" = NEW."stripeConnectionId"
          AND c."tenantId" = NEW."tenantId" AND c."orgId" = NEW."orgId" AND NEW."payoutFacts"->'livemode' = to_jsonb(c."livemode")) THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Payout scope mismatch';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM %1$I."FinanceSettlementEvidence" e WHERE e."stripeConnectionId" = NEW."stripeConnectionId"
          AND e."tenantId" = NEW."tenantId" AND e."orgId" = NEW."orgId" AND e."resourceType" = 'payout.coverage'
          AND e."providerReference" = NEW."payoutId" AND e."facts"->'coverage' = NEW."coverage" AND e."facts"->'payout' = NEW."payoutFacts") THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Payout coverage requires immutable evidence';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD."status" = 'INCOMPLETE' AND
          (NEW."payoutFacts" IS DISTINCT FROM OLD."payoutFacts" OR NEW."coverage"->>'cutoff' IS DISTINCT FROM OLD."coverage"->>'cutoff') THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Incomplete payout observation must resume unchanged';
        END IF;
        IF TG_OP = 'UPDATE' AND ((NEW."id", NEW."stripeConnectionId", NEW."tenantId", NEW."orgId", NEW."payoutId")
          IS DISTINCT FROM (OLD."id", OLD."stripeConnectionId", OLD."tenantId", OLD."orgId", OLD."payoutId") OR NEW."updatedAt" < OLD."updatedAt") THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Payout scope cannot change';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $body$;
  $function$, core_schema);
END;
$$;
CREATE TRIGGER "FinanceSettlementEvidence_scope" BEFORE INSERT ON "FinanceSettlementEvidence" FOR EACH ROW EXECUTE FUNCTION finance_settlement_scope_guard();
CREATE TRIGGER "FinanceSettlementEvidence_append_only" BEFORE UPDATE OR DELETE ON "FinanceSettlementEvidence" FOR EACH ROW EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceSettlementEvidence_append_only');
CREATE TRIGGER "FinancePayoutReconciliation_scope" BEFORE INSERT OR UPDATE OR DELETE ON "FinancePayoutReconciliation" FOR EACH ROW EXECUTE FUNCTION finance_settlement_scope_guard();
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['FinanceSettlementEvidence', 'FinancePayoutReconciliation'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id()) WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id())', table_name || '_tenant_org_rls', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only(%L)', table_name || '_no_truncate', table_name, table_name || '_no_truncate');
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF to_regrole(role_name) IS NOT NULL THEN EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', table_name, role_name); END IF;
    END LOOP;
  END LOOP;
END;
$$;
