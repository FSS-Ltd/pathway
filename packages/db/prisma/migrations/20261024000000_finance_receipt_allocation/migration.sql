-- Keep receipt allocations tenant-scoped, auditable and append-only.
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

ALTER TYPE "FinanceCommandType" ADD VALUE 'ALLOCATE_RECEIPT';
ALTER TYPE "FinanceCommandType" ADD VALUE 'REVERSE_ALLOCATION';
ALTER TYPE "FinanceCommandResourceType" ADD VALUE 'ALLOCATION';

ALTER TABLE "FinanceReceipt"
  ADD COLUMN "payerAccountId" TEXT,
  ADD COLUMN "sourceReference" VARCHAR(255);

ALTER TABLE "FinanceReceiptAllocation"
  ADD COLUMN "createdByUserId" TEXT;

CREATE UNIQUE INDEX "FinanceReceipt_financeProfileId_source_sourceReference_key"
  ON "FinanceReceipt"("financeProfileId", "source", "sourceReference");
CREATE INDEX "FinanceReceipt_tenantId_orgId_payerAccountId_confirmedAt_idx"
  ON "FinanceReceipt"("tenantId", "orgId", "payerAccountId", "confirmedAt");
CREATE UNIQUE INDEX "FinanceReceiptAllocation_id_tenantId_orgId_key"
  ON "FinanceReceiptAllocation"("id", "tenantId", "orgId");
CREATE INDEX "FinanceReceiptAllocation_tenantId_orgId_invoiceId_createdAt_idx"
  ON "FinanceReceiptAllocation"("tenantId", "orgId", "invoiceId", "createdAt");

ALTER TABLE "FinanceReceipt"
  ADD CONSTRAINT "FinanceReceipt_payerAccountId_tenantId_orgId_fkey"
  FOREIGN KEY ("payerAccountId", "tenantId", "orgId")
  REFERENCES "FinancePayerAccount"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceReceiptAllocation"
  ADD CONSTRAINT "FinanceReceiptAllocation_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FinanceReceiptAllocationReversal" (
  "id" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReceiptAllocationReversal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceReceiptAllocationReversal_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "FinanceReceiptAllocationReversal_reason_nonempty" CHECK (length(btrim("reason")) > 0)
);

CREATE UNIQUE INDEX "FinanceReceiptAllocationReversal_id_tenantId_orgId_key"
  ON "FinanceReceiptAllocationReversal"("id", "tenantId", "orgId");
CREATE INDEX "FinanceReceiptAllocationReversal_tenantId_orgId_allocationId_createdAt_idx"
  ON "FinanceReceiptAllocationReversal"("tenantId", "orgId", "allocationId", "createdAt");

ALTER TABLE "FinanceReceiptAllocationReversal"
  ADD CONSTRAINT "FinanceReceiptAllocationReversal_allocationId_tenantId_orgId_fkey"
  FOREIGN KEY ("allocationId", "tenantId", "orgId")
  REFERENCES "FinanceReceiptAllocation"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReceiptAllocationReversal"
  ADD CONSTRAINT "FinanceReceiptAllocationReversal_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION finance_receipt_ledger_row_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    CONSTRAINT = TG_ARGV[0],
    MESSAGE = 'Finance allocation evidence is append-only';
END;
$$;

CREATE TRIGGER "FinanceReceiptAllocation_append_only"
BEFORE UPDATE OR DELETE ON "FinanceReceiptAllocation"
FOR EACH ROW EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceReceiptAllocation_append_only');

CREATE TRIGGER "FinanceReceiptAllocationReversal_append_only"
BEFORE UPDATE OR DELETE ON "FinanceReceiptAllocationReversal"
FOR EACH ROW EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceReceiptAllocationReversal_append_only');

DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['FinanceReceiptAllocationReversal']
  LOOP
    policy_name := tbl || '_tenant_org_rls';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL
           AND app.current_org_id() IS NOT NULL
           AND "tenantId" = app.current_tenant_id()
           AND "orgId" = app.current_org_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL
           AND app.current_org_id() IS NOT NULL
           AND "tenantId" = app.current_tenant_id()
           AND "orgId" = app.current_org_id());',
      policy_name,
      tbl
    );
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC;', tbl);

    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon;', tbl);
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated;', tbl);
    END IF;
  END LOOP;
END;
$$;
