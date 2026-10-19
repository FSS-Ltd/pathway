-- Freeze Finance statements as tenant-scoped, append-only ledger artifacts.
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

CREATE TYPE "FinanceStatementKind" AS ENUM ('ON_DEMAND', 'MONTH_END');
CREATE TYPE "FinanceStatementStatus" AS ENUM ('GENERATING', 'READY');

CREATE TABLE "FinanceStatement" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "payerAccountId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "kind" "FinanceStatementKind" NOT NULL,
  "status" "FinanceStatementStatus" NOT NULL DEFAULT 'GENERATING',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "ledgerCutoffAt" TIMESTAMP(3) NOT NULL,
  "projectionVersion" INTEGER NOT NULL DEFAULT 1,
  "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
  "openingBalanceMinor" BIGINT NOT NULL,
  "chargesIssuedMinor" BIGINT NOT NULL,
  "creditsIssuedMinor" BIGINT NOT NULL,
  "allocatedReceiptsMinor" BIGINT NOT NULL,
  "reversalsMinor" BIGINT NOT NULL,
  "closingBalanceMinor" BIGINT NOT NULL,
  "unappliedFundsMinor" BIGINT NOT NULL,
  "processingFundsMinor" BIGINT NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "documentStorageKey" TEXT,
  "documentSha256" VARCHAR(64),
  "documentSizeBytes" INTEGER,
  "readyAt" TIMESTAMP(3),
  "requestedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceStatement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceStatement_period_valid" CHECK ("periodEnd" > "periodStart"),
  CONSTRAINT "FinanceStatement_projection_version_positive" CHECK ("projectionVersion" > 0),
  CONSTRAINT "FinanceStatement_movements_nonnegative" CHECK (
    "chargesIssuedMinor" >= 0 AND "creditsIssuedMinor" >= 0
    AND "allocatedReceiptsMinor" >= 0
    AND "unappliedFundsMinor" >= 0 AND "processingFundsMinor" >= 0
  ),
  CONSTRAINT "FinanceStatement_request_hash_valid" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "FinanceStatement_idempotency_key_nonempty" CHECK (length(btrim("idempotencyKey")) > 0),
  CONSTRAINT "FinanceStatement_document_shape" CHECK (
    ("status" = 'GENERATING' AND "documentStorageKey" IS NULL AND "documentSha256" IS NULL
      AND "documentSizeBytes" IS NULL AND "readyAt" IS NULL)
    OR
    ("status" = 'READY' AND "documentStorageKey" IS NOT NULL AND length(btrim("documentStorageKey")) > 0
      AND "documentSha256" IS NOT NULL AND "documentSha256" ~ '^[0-9a-f]{64}$'
      AND "documentSizeBytes" IS NOT NULL AND "documentSizeBytes" > 0
      AND "readyAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "FinanceStatement_id_tenantId_orgId_key"
  ON "FinanceStatement"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceStatement_scope_idempotencyKey_key"
  ON "FinanceStatement"("tenantId", "orgId", "idempotencyKey");
CREATE INDEX "FinanceStatement_scope_payer_period_idx"
  ON "FinanceStatement"("tenantId", "orgId", "payerAccountId", "periodStart", "periodEnd");
CREATE INDEX "FinanceStatement_scope_status_createdAt_idx"
  ON "FinanceStatement"("tenantId", "orgId", "status", "createdAt");
CREATE INDEX "FinanceReceipt_tenantId_orgId_payerAccountId_updatedAt_idx"
  ON "FinanceReceipt"("tenantId", "orgId", "payerAccountId", "updatedAt");

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceStatement'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format(
    'ALTER TABLE %I."FinanceStatement" ADD CONSTRAINT "FinanceStatement_profile_scope_fkey" FOREIGN KEY ("financeProfileId", "tenantId", "orgId") REFERENCES %I."FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE',
    core_schema, core_schema
  );
  EXECUTE format(
    'ALTER TABLE %I."FinanceStatement" ADD CONSTRAINT "FinanceStatement_payer_scope_fkey" FOREIGN KEY ("payerAccountId", "tenantId", "orgId") REFERENCES %I."FinancePayerAccount"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE',
    core_schema, core_schema
  );
  EXECUTE format(
    'ALTER TABLE %I."FinanceStatement" ADD CONSTRAINT "FinanceStatement_tenant_scope_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES %I."Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE',
    core_schema, core_schema
  );
  EXECUTE format(
    'ALTER TABLE %I."FinanceStatement" ADD CONSTRAINT "FinanceStatement_org_fkey" FOREIGN KEY ("orgId") REFERENCES %I."Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
    core_schema, core_schema
  );
  EXECUTE format(
    'ALTER TABLE %I."FinanceStatement" ADD CONSTRAINT "FinanceStatement_requester_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES %I."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
    core_schema, core_schema
  );
END;
$$;

CREATE FUNCTION finance_statement_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStatement_append_only',
      MESSAGE = 'Finance statements cannot be deleted';
  END IF;
  IF (
    NEW."id", NEW."financeProfileId", NEW."payerAccountId", NEW."tenantId", NEW."orgId",
    NEW."kind", NEW."periodStart", NEW."periodEnd", NEW."generatedAt", NEW."ledgerCutoffAt",
    NEW."projectionVersion", NEW."currency", NEW."openingBalanceMinor", NEW."chargesIssuedMinor",
    NEW."creditsIssuedMinor", NEW."allocatedReceiptsMinor", NEW."reversalsMinor", NEW."closingBalanceMinor",
    NEW."unappliedFundsMinor", NEW."processingFundsMinor", NEW."snapshot", NEW."idempotencyKey", NEW."requestHash",
    NEW."requestedByUserId", NEW."createdAt"
  ) IS DISTINCT FROM (
    OLD."id", OLD."financeProfileId", OLD."payerAccountId", OLD."tenantId", OLD."orgId",
    OLD."kind", OLD."periodStart", OLD."periodEnd", OLD."generatedAt", OLD."ledgerCutoffAt",
    OLD."projectionVersion", OLD."currency", OLD."openingBalanceMinor", OLD."chargesIssuedMinor",
    OLD."creditsIssuedMinor", OLD."allocatedReceiptsMinor", OLD."reversalsMinor", OLD."closingBalanceMinor",
    OLD."unappliedFundsMinor", OLD."processingFundsMinor", OLD."snapshot", OLD."idempotencyKey", OLD."requestHash",
    OLD."requestedByUserId", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStatement_facts_immutable',
      MESSAGE = 'Finance statement ledger facts cannot be changed';
  END IF;
  IF OLD."status" <> 'GENERATING' OR NEW."status" <> 'READY'
    OR OLD."documentStorageKey" IS NOT NULL OR OLD."documentSha256" IS NOT NULL
    OR OLD."documentSizeBytes" IS NOT NULL OR OLD."readyAt" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceStatement_transition_invalid',
      MESSAGE = 'Only a generating Finance statement can become ready once';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceStatement_evidence_guard"
BEFORE UPDATE OR DELETE ON "FinanceStatement"
FOR EACH ROW EXECUTE FUNCTION finance_statement_evidence_guard();
CREATE TRIGGER "FinanceStatement_no_truncate"
BEFORE TRUNCATE ON "FinanceStatement"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceStatement_no_truncate');

ALTER TABLE "FinanceStatement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceStatement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FinanceStatement_tenant_org_rls" ON "FinanceStatement"
  USING (app.current_tenant_id() IS NOT NULL AND app.current_org_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id())
  WITH CHECK (app.current_tenant_id() IS NOT NULL AND app.current_org_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON TABLE "FinanceStatement" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "FinanceStatement" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "FinanceStatement" FROM authenticated;
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
  WHERE c.relname = 'FinanceProfile'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format($function$
    CREATE FUNCTION app.list_finance_statement_scopes()
    RETURNS TABLE ("tenantId" TEXT, "orgId" TEXT)
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = ''
    AS $body$
      SELECT DISTINCT profile."tenantId", profile."orgId"
      FROM %1$I."FinanceProfile" AS profile
      WHERE EXISTS (
        SELECT 1
        FROM %1$I."FinancePayerAccount" AS payer
        WHERE payer."financeProfileId" = profile."id"
          AND payer."tenantId" = profile."tenantId"
          AND payer."orgId" = profile."orgId"
      )
      ORDER BY profile."tenantId", profile."orgId";
    $body$;
  $function$, core_schema);
END;
$$;

REVOKE ALL ON FUNCTION app.list_finance_statement_scopes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_finance_statement_scopes() TO CURRENT_USER;
