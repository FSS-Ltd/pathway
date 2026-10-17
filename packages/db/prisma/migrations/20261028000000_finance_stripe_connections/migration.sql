-- Store one tenant-scoped school Stripe collection account at a time.
DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'Org'
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

CREATE TYPE "FinanceStripeConnectionStatus" AS ENUM (
  'CONNECTING',
  'READY',
  'RESTRICTED',
  'DISCONNECTED'
);

CREATE TABLE "FinanceStripeConnection" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "stripeAccountId" TEXT,
  "status" "FinanceStripeConnectionStatus" NOT NULL DEFAULT 'CONNECTING',
  "livemode" BOOLEAN NOT NULL DEFAULT false,
  "requestedByUserId" TEXT NOT NULL,
  "disconnectedByUserId" TEXT,
  "disconnectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceStripeConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStripeConnection_lifecycle_valid" CHECK (
    ("status" = 'DISCONNECTED' AND "disconnectedAt" IS NOT NULL AND "disconnectedByUserId" IS NOT NULL)
    OR
    ("status" <> 'DISCONNECTED' AND "disconnectedAt" IS NULL AND "disconnectedByUserId" IS NULL)
  ),
  CONSTRAINT "FinanceStripeConnection_ready_account_required" CHECK (
    "status" NOT IN ('READY', 'RESTRICTED') OR "stripeAccountId" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "FinanceStripeConnection_id_tenantId_orgId_key"
  ON "FinanceStripeConnection"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceStripeConnection_stripeAccountId_key"
  ON "FinanceStripeConnection"("stripeAccountId");
CREATE UNIQUE INDEX "FinanceStripeConnection_one_active_per_profile_key"
  ON "FinanceStripeConnection"("financeProfileId")
  WHERE "status" <> 'DISCONNECTED';
CREATE INDEX "FinanceStripeConnection_scope_status_idx"
  ON "FinanceStripeConnection"("tenantId", "orgId", "status");

ALTER TABLE "FinanceStripeConnection"
  ADD CONSTRAINT "FinanceStripeConnection_profile_scope_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceStripeConnection"
  ADD CONSTRAINT "FinanceStripeConnection_tenant_scope_fkey"
  FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceStripeConnection"
  ADD CONSTRAINT "FinanceStripeConnection_org_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceStripeConnection"
  ADD CONSTRAINT "FinanceStripeConnection_requester_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceStripeConnection"
  ADD CONSTRAINT "FinanceStripeConnection_disconnector_fkey"
  FOREIGN KEY ("disconnectedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION finance_stripe_connection_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStripeConnection_append_only',
      MESSAGE = 'Finance Stripe connection history cannot be deleted';
  END IF;
  IF (
    NEW."id", NEW."financeProfileId", NEW."tenantId", NEW."orgId",
    NEW."livemode", NEW."requestedByUserId", NEW."createdAt"
  ) IS DISTINCT FROM (
    OLD."id", OLD."financeProfileId", OLD."tenantId", OLD."orgId",
    OLD."livemode", OLD."requestedByUserId", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStripeConnection_facts_immutable',
      MESSAGE = 'Finance Stripe connection facts cannot be changed';
  END IF;
  IF OLD."stripeAccountId" IS NOT NULL
     AND NEW."stripeAccountId" IS DISTINCT FROM OLD."stripeAccountId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStripeConnection_account_immutable',
      MESSAGE = 'A Stripe account cannot be replaced on an existing connection';
  END IF;
  IF OLD."status" = 'DISCONNECTED' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStripeConnection_disconnected_terminal',
      MESSAGE = 'A disconnected Finance Stripe connection is terminal';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceStripeConnection_evidence_guard"
BEFORE UPDATE OR DELETE ON "FinanceStripeConnection"
FOR EACH ROW EXECUTE FUNCTION finance_stripe_connection_guard();
CREATE TRIGGER "FinanceStripeConnection_no_truncate"
BEFORE TRUNCATE ON "FinanceStripeConnection"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceStripeConnection_no_truncate');

ALTER TABLE "FinanceStripeConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceStripeConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FinanceStripeConnection_tenant_org_rls" ON "FinanceStripeConnection"
  USING (app.current_tenant_id() IS NOT NULL
    AND app.current_org_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
    AND "orgId" = app.current_org_id())
  WITH CHECK (app.current_tenant_id() IS NOT NULL
    AND app.current_org_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
    AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON TABLE "FinanceStripeConnection" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "FinanceStripeConnection" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "FinanceStripeConnection" FROM authenticated;
  END IF;
END;
$$;
