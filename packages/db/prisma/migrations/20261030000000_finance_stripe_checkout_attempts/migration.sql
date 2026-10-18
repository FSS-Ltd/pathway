-- Persist one recoverable Stripe Checkout Session per issued invoice obligation.
DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceInvoice'
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

CREATE TYPE "FinanceCheckoutAttemptStatus" AS ENUM (
  'CREATING',
  'OPEN',
  'COMPLETED',
  'PAID',
  'EXPIRED',
  'FAILED'
);

CREATE TABLE "FinanceCheckoutAttempt" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "stripeConnectionId" TEXT NOT NULL,
  "payerGrantId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "stripeAccountId" TEXT NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
  "status" "FinanceCheckoutAttemptStatus" NOT NULL DEFAULT 'CREATING',
  "idempotencyKey" VARCHAR(255) NOT NULL,
  "integrationIdentifier" VARCHAR(255) NOT NULL,
  "stripeCheckoutSessionId" VARCHAR(255),
  "checkoutUrl" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceCheckoutAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceCheckoutAttempt_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "FinanceCheckoutAttempt_stripe_account_valid" CHECK (left("stripeAccountId", 5) = 'acct_'),
  CONSTRAINT "FinanceCheckoutAttempt_checkout_url_valid" CHECK (
    "checkoutUrl" IS NULL OR "checkoutUrl" LIKE 'https://checkout.stripe.com/%'
  ),
  CONSTRAINT "FinanceCheckoutAttempt_open_session_required" CHECK (
    "status" <> 'OPEN' OR (
      "stripeCheckoutSessionId" IS NOT NULL
      AND "checkoutUrl" IS NOT NULL
      AND "expiresAt" IS NOT NULL
    )
  ),
  CONSTRAINT "FinanceCheckoutAttempt_creating_session_absent" CHECK (
    "status" <> 'CREATING' OR (
      "stripeCheckoutSessionId" IS NULL
      AND "checkoutUrl" IS NULL
      AND "expiresAt" IS NULL
    )
  ),
  CONSTRAINT "FinanceCheckoutAttempt_integration_identifier_valid" CHECK (
    "integrationIdentifier" ~ '^nexsteps-finance-[a-z]{8}$'
  )
);

CREATE UNIQUE INDEX "FinanceCheckoutAttempt_id_tenantId_orgId_key"
  ON "FinanceCheckoutAttempt"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceCheckoutAttempt_idempotencyKey_key"
  ON "FinanceCheckoutAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "FinanceCheckoutAttempt_stripeAccountId_sessionId_key"
  ON "FinanceCheckoutAttempt"("stripeAccountId", "stripeCheckoutSessionId");
CREATE UNIQUE INDEX "FinanceCheckoutAttempt_one_unresolved_per_invoice_key"
  ON "FinanceCheckoutAttempt"("invoiceId", "tenantId", "orgId")
  WHERE "status" IN ('CREATING', 'OPEN', 'COMPLETED');
CREATE INDEX "FinanceCheckoutAttempt_scope_invoice_status_created_idx"
  ON "FinanceCheckoutAttempt"("tenantId", "orgId", "invoiceId", "status", "createdAt");
CREATE INDEX "FinanceCheckoutAttempt_profile_status_created_idx"
  ON "FinanceCheckoutAttempt"("financeProfileId", "status", "createdAt");

ALTER TABLE "FinanceCheckoutAttempt"
  ADD CONSTRAINT "FinanceCheckoutAttempt_profile_scope_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCheckoutAttempt"
  ADD CONSTRAINT "FinanceCheckoutAttempt_connection_scope_fkey"
  FOREIGN KEY ("stripeConnectionId", "tenantId", "orgId")
  REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCheckoutAttempt"
  ADD CONSTRAINT "FinanceCheckoutAttempt_payer_grant_scope_fkey"
  FOREIGN KEY ("payerGrantId", "tenantId", "orgId")
  REFERENCES "FinancePayerGrant"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCheckoutAttempt"
  ADD CONSTRAINT "FinanceCheckoutAttempt_invoice_scope_fkey"
  FOREIGN KEY ("invoiceId", "tenantId", "orgId")
  REFERENCES "FinanceInvoice"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCheckoutAttempt"
  ADD CONSTRAINT "FinanceCheckoutAttempt_tenant_scope_fkey"
  FOREIGN KEY ("tenantId", "orgId")
  REFERENCES "Tenant"("id", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCheckoutAttempt"
  ADD CONSTRAINT "FinanceCheckoutAttempt_org_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION finance_checkout_attempt_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCheckoutAttempt_append_only',
      MESSAGE = 'Finance Checkout attempt history cannot be deleted';
  END IF;
  IF (
    NEW."id", NEW."financeProfileId", NEW."stripeConnectionId",
    NEW."payerGrantId", NEW."invoiceId", NEW."tenantId", NEW."orgId",
    NEW."stripeAccountId", NEW."livemode", NEW."amountMinor", NEW."currency",
    NEW."idempotencyKey", NEW."integrationIdentifier", NEW."createdAt"
  ) IS DISTINCT FROM (
    OLD."id", OLD."financeProfileId", OLD."stripeConnectionId",
    OLD."payerGrantId", OLD."invoiceId", OLD."tenantId", OLD."orgId",
    OLD."stripeAccountId", OLD."livemode", OLD."amountMinor", OLD."currency",
    OLD."idempotencyKey", OLD."integrationIdentifier", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCheckoutAttempt_facts_immutable',
      MESSAGE = 'Finance Checkout attempt facts cannot be changed';
  END IF;
  IF OLD."stripeCheckoutSessionId" IS NOT NULL AND (
    NEW."stripeCheckoutSessionId", NEW."checkoutUrl", NEW."expiresAt"
  ) IS DISTINCT FROM (
    OLD."stripeCheckoutSessionId", OLD."checkoutUrl", OLD."expiresAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCheckoutAttempt_session_immutable',
      MESSAGE = 'Finance Checkout Session evidence cannot be changed';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'CREATING' AND NEW."status" IN ('OPEN', 'COMPLETED', 'EXPIRED', 'FAILED'))
    OR (OLD."status" = 'OPEN' AND NEW."status" IN ('COMPLETED', 'EXPIRED', 'FAILED'))
    OR (OLD."status" = 'COMPLETED' AND NEW."status" IN ('PAID', 'EXPIRED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCheckoutAttempt_transition_invalid',
      MESSAGE = 'Finance Checkout attempt transition is invalid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceCheckoutAttempt_evidence_guard"
BEFORE UPDATE OR DELETE ON "FinanceCheckoutAttempt"
FOR EACH ROW EXECUTE FUNCTION finance_checkout_attempt_guard();

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceCheckoutAttempt'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format($function$
    CREATE FUNCTION %1$I.finance_checkout_attempt_scope_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $body$
    DECLARE
      connected_account_id text;
      connected_profile_id text;
      connected_status text;
      connected_livemode boolean;
      invoice_profile_id text;
      invoice_payer_account_id text;
      invoice_status text;
      grant_payer_account_id text;
      grant_revoked_at timestamp(3);
    BEGIN
      SELECT "stripeAccountId", "financeProfileId", "status"::text, "livemode"
        INTO connected_account_id, connected_profile_id, connected_status, connected_livemode
      FROM %1$I."FinanceStripeConnection"
      WHERE "id" = NEW."stripeConnectionId"
        AND "tenantId" = NEW."tenantId"
        AND "orgId" = NEW."orgId";
      SELECT "financeProfileId", "payerAccountId", "status"::text
        INTO invoice_profile_id, invoice_payer_account_id, invoice_status
      FROM %1$I."FinanceInvoice"
      WHERE "id" = NEW."invoiceId"
        AND "tenantId" = NEW."tenantId"
        AND "orgId" = NEW."orgId";
      SELECT "financePayerAccountId", "revokedAt"
        INTO grant_payer_account_id, grant_revoked_at
      FROM %1$I."FinancePayerGrant"
      WHERE "id" = NEW."payerGrantId"
        AND "tenantId" = NEW."tenantId"
        AND "orgId" = NEW."orgId";

      IF connected_account_id IS NULL
         OR connected_status <> 'READY'
         OR connected_account_id <> NEW."stripeAccountId"
         OR connected_profile_id <> NEW."financeProfileId"
         OR connected_livemode <> NEW."livemode"
         OR invoice_profile_id <> NEW."financeProfileId"
         OR invoice_status <> 'ISSUED'
         OR invoice_payer_account_id IS NULL
         OR grant_payer_account_id <> invoice_payer_account_id
         OR grant_revoked_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCheckoutAttempt_scope_invalid',
          MESSAGE = 'Finance Checkout attempt scope or source state is invalid';
      END IF;
      RETURN NEW;
    END;
    $body$;
  $function$, core_schema);
END;
$$;

CREATE TRIGGER "FinanceCheckoutAttempt_scope_guard"
BEFORE INSERT ON "FinanceCheckoutAttempt"
FOR EACH ROW EXECUTE FUNCTION finance_checkout_attempt_scope_guard();
CREATE TRIGGER "FinanceCheckoutAttempt_no_truncate"
BEFORE TRUNCATE ON "FinanceCheckoutAttempt"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceCheckoutAttempt_no_truncate');

ALTER TABLE "FinanceCheckoutAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceCheckoutAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FinanceCheckoutAttempt_tenant_org_rls" ON "FinanceCheckoutAttempt"
  USING (app.current_tenant_id() IS NOT NULL
    AND app.current_org_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
    AND "orgId" = app.current_org_id())
  WITH CHECK (app.current_tenant_id() IS NOT NULL
    AND app.current_org_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
    AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON TABLE "FinanceCheckoutAttempt" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "FinanceCheckoutAttempt" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "FinanceCheckoutAttempt" FROM authenticated;
  END IF;
END;
$$;
