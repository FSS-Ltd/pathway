-- Keep Finance tables beside the physical core tables. Production uses public;
-- fresh installations may use app.
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

CREATE TYPE "FinanceCurrency" AS ENUM ('GBP');
CREATE TYPE "FinanceInvoiceStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ISSUED', 'VOID');
CREATE TYPE "FinanceReceiptStatus" AS ENUM ('PROCESSING', 'CONFIRMED', 'FAILED');
CREATE TYPE "FinanceReceiptSource" AS ENUM ('MANUAL_TRANSFER', 'STRIPE_CARD', 'STRIPE_BACS');

CREATE TABLE "FinanceProfile" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "legalEntityName" TEXT NOT NULL,
  "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceProfile_legalEntityName_nonempty" CHECK (length(btrim("legalEntityName")) > 0)
);

CREATE TABLE "FinanceInvoiceNumberSequence" (
  "financeProfileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "lastIssuedNumber" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceInvoiceNumberSequence_pkey" PRIMARY KEY ("financeProfileId", "tenantId", "orgId"),
  CONSTRAINT "FinanceInvoiceNumberSequence_lastIssuedNumber_nonnegative" CHECK ("lastIssuedNumber" >= 0)
);

CREATE TABLE "FinanceInvoice" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "invoiceNumber" BIGINT,
  "status" "FinanceInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
  "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
  "taxMinor" BIGINT NOT NULL DEFAULT 0,
  "totalMinor" BIGINT NOT NULL DEFAULT 0,
  "issuedAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceInvoice_amounts_nonnegative" CHECK ("subtotalMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0),
  CONSTRAINT "FinanceInvoice_total_matches_components" CHECK ("totalMinor" = "subtotalMinor" + "taxMinor"),
  CONSTRAINT "FinanceInvoice_issued_snapshot_shape" CHECK (
    ("status" IN ('DRAFT', 'IN_REVIEW') AND "invoiceNumber" IS NULL AND "issuedAt" IS NULL)
    OR ("status" IN ('ISSUED', 'VOID') AND "invoiceNumber" > 0 AND "issuedAt" IS NOT NULL)
  )
);

CREATE TABLE "FinanceInvoiceLine" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "lineOrder" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitAmountMinor" BIGINT NOT NULL,
  "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
  "netAmountMinor" BIGINT NOT NULL,
  "taxAmountMinor" BIGINT NOT NULL,
  "totalMinor" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceInvoiceLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceInvoiceLine_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "FinanceInvoiceLine_order_nonnegative" CHECK ("lineOrder" >= 0),
  CONSTRAINT "FinanceInvoiceLine_amounts_nonnegative" CHECK ("unitAmountMinor" >= 0 AND "netAmountMinor" >= 0 AND "taxAmountMinor" >= 0 AND "totalMinor" >= 0),
  CONSTRAINT "FinanceInvoiceLine_taxRate_nonnegative" CHECK ("taxRateBasisPoints" >= 0),
  CONSTRAINT "FinanceInvoiceLine_total_matches_components" CHECK ("totalMinor" = "netAmountMinor" + "taxAmountMinor"),
  CONSTRAINT "FinanceInvoiceLine_description_nonempty" CHECK (length(btrim("description")) > 0)
);

CREATE TABLE "FinanceReceipt" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
  "source" "FinanceReceiptSource" NOT NULL,
  "status" "FinanceReceiptStatus" NOT NULL DEFAULT 'PROCESSING',
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceReceipt_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "FinanceReceipt_confirmation_matches_status" CHECK (
    ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL)
    OR ("status" IN ('PROCESSING', 'FAILED') AND "confirmedAt" IS NULL)
  )
);

CREATE TABLE "FinanceReceiptAllocation" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReceiptAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceReceiptAllocation_amount_positive" CHECK ("amountMinor" > 0)
);

CREATE UNIQUE INDEX "FinanceProfile_tenantId_orgId_key" ON "FinanceProfile"("tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceProfile_id_tenantId_orgId_key" ON "FinanceProfile"("id", "tenantId", "orgId");
CREATE INDEX "FinanceProfile_orgId_tenantId_idx" ON "FinanceProfile"("orgId", "tenantId");
CREATE INDEX "FinanceInvoiceNumberSequence_tenantId_orgId_idx" ON "FinanceInvoiceNumberSequence"("tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceInvoice_id_tenantId_orgId_key" ON "FinanceInvoice"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceInvoice_tenantId_invoiceNumber_key" ON "FinanceInvoice"("tenantId", "invoiceNumber");
CREATE INDEX "FinanceInvoice_tenantId_status_dueAt_idx" ON "FinanceInvoice"("tenantId", "status", "dueAt");
CREATE INDEX "FinanceInvoice_financeProfileId_status_createdAt_idx" ON "FinanceInvoice"("financeProfileId", "status", "createdAt");
CREATE UNIQUE INDEX "FinanceInvoiceLine_invoiceId_lineOrder_key" ON "FinanceInvoiceLine"("invoiceId", "lineOrder");
CREATE INDEX "FinanceInvoiceLine_tenantId_orgId_invoiceId_idx" ON "FinanceInvoiceLine"("tenantId", "orgId", "invoiceId");
CREATE UNIQUE INDEX "FinanceReceipt_id_tenantId_orgId_key" ON "FinanceReceipt"("id", "tenantId", "orgId");
CREATE INDEX "FinanceReceipt_tenantId_status_confirmedAt_idx" ON "FinanceReceipt"("tenantId", "status", "confirmedAt");
CREATE INDEX "FinanceReceipt_financeProfileId_createdAt_idx" ON "FinanceReceipt"("financeProfileId", "createdAt");
CREATE INDEX "FinanceReceiptAllocation_tenantId_receiptId_createdAt_idx" ON "FinanceReceiptAllocation"("tenantId", "receiptId", "createdAt");
CREATE INDEX "FinanceReceiptAllocation_tenantId_invoiceId_createdAt_idx" ON "FinanceReceiptAllocation"("tenantId", "invoiceId", "createdAt");

ALTER TABLE "FinanceProfile" ADD CONSTRAINT "FinanceProfile_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceProfile" ADD CONSTRAINT "FinanceProfile_tenantId_orgId_fkey"
  FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInvoiceNumberSequence" ADD CONSTRAINT "FinanceInvoiceNumberSequence_financeProfileId_tenantId_org_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId") REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_financeProfileId_tenantId_orgId_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId") REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInvoiceLine" ADD CONSTRAINT "FinanceInvoiceLine_invoiceId_tenantId_orgId_fkey"
  FOREIGN KEY ("invoiceId", "tenantId", "orgId") REFERENCES "FinanceInvoice"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReceipt" ADD CONSTRAINT "FinanceReceipt_financeProfileId_tenantId_orgId_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId") REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReceiptAllocation" ADD CONSTRAINT "FinanceReceiptAllocation_receiptId_tenantId_orgId_fkey"
  FOREIGN KEY ("receiptId", "tenantId", "orgId") REFERENCES "FinanceReceipt"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReceiptAllocation" ADD CONSTRAINT "FinanceReceiptAllocation_invoiceId_tenantId_orgId_fkey"
  FOREIGN KEY ("invoiceId", "tenantId", "orgId") REFERENCES "FinanceInvoice"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'FinanceProfile',
    'FinanceInvoiceNumberSequence',
    'FinanceInvoice',
    'FinanceInvoiceLine',
    'FinanceReceipt',
    'FinanceReceiptAllocation'
  ]
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
