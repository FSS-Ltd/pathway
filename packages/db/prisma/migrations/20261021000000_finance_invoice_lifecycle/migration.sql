-- Add immutable invoice lifecycle evidence, idempotent commands and credit notes.
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

CREATE TYPE "FinanceInvoiceEventType" AS ENUM (
  'CREATED', 'UPDATED', 'SUBMITTED_FOR_REVIEW', 'APPROVED',
  'CHANGES_REQUESTED', 'ISSUED', 'VOIDED'
);
CREATE TYPE "FinanceCreditNoteStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ISSUED', 'VOID');
CREATE TYPE "FinanceCreditNoteEventType" AS ENUM (
  'CREATED', 'UPDATED', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'ISSUED', 'VOIDED'
);
CREATE TYPE "FinanceCommandType" AS ENUM (
  'CREATE_INVOICE', 'UPDATE_INVOICE', 'SUBMIT_INVOICE_FOR_REVIEW',
  'APPROVE_INVOICE', 'REQUEST_INVOICE_CHANGES', 'ISSUE_INVOICE', 'VOID_INVOICE',
  'CREATE_CREDIT_NOTE', 'UPDATE_CREDIT_NOTE', 'SUBMIT_CREDIT_FOR_REVIEW',
  'APPROVE_CREDIT_NOTE', 'REQUEST_CREDIT_CHANGES', 'ISSUE_CREDIT_NOTE', 'VOID_CREDIT_NOTE'
);
CREATE TYPE "FinanceCommandResourceType" AS ENUM ('INVOICE', 'CREDIT_NOTE');

ALTER TABLE "FinanceInvoice"
  ADD COLUMN "payerAccountId" TEXT,
  ADD COLUMN "payerNameSnapshot" TEXT,
  ADD COLUMN "legalEntityNameSnapshot" TEXT,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedByUserId" TEXT,
  ADD COLUMN "voidReason" TEXT;

ALTER TABLE "FinanceInvoice" DROP CONSTRAINT "FinanceInvoice_issued_snapshot_shape";
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_issued_snapshot_shape" CHECK (
  ("status" IN ('DRAFT', 'IN_REVIEW') AND "invoiceNumber" IS NULL AND "issuedAt" IS NULL)
  OR (
    "status" IN ('ISSUED', 'VOID') AND "invoiceNumber" > 0 AND "issuedAt" IS NOT NULL
    AND "payerAccountId" IS NOT NULL
    AND "payerNameSnapshot" IS NOT NULL AND length(btrim("payerNameSnapshot")) > 0
    AND "legalEntityNameSnapshot" IS NOT NULL AND length(btrim("legalEntityNameSnapshot")) > 0
  )
);
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_approval_shape" CHECK (
  ("approvedAt" IS NULL AND "approvedByUserId" IS NULL)
  OR ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "status" IN ('IN_REVIEW', 'ISSUED', 'VOID'))
);
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_void_shape" CHECK (
  ("status" = 'VOID' AND "voidedAt" IS NOT NULL AND "voidedByUserId" IS NOT NULL
    AND "voidReason" IS NOT NULL AND length(btrim("voidReason")) > 0)
  OR ("status" <> 'VOID' AND "voidedAt" IS NULL AND "voidedByUserId" IS NULL AND "voidReason" IS NULL)
);
CREATE INDEX "FinanceInvoice_tenantId_orgId_payerAccountId_status_idx"
  ON "FinanceInvoice"("tenantId", "orgId", "payerAccountId", "status");
CREATE UNIQUE INDEX "FinanceInvoiceLine_id_tenantId_orgId_key"
  ON "FinanceInvoiceLine"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceInvoiceLine_id_invoiceId_tenantId_orgId_key"
  ON "FinanceInvoiceLine"("id", "invoiceId", "tenantId", "orgId");

CREATE TABLE "FinanceCreditNoteNumberSequence" (
  "financeProfileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "lastIssuedNumber" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceCreditNoteNumberSequence_pkey"
    PRIMARY KEY ("financeProfileId", "tenantId", "orgId"),
  CONSTRAINT "FinanceCreditNoteNumberSequence_lastIssuedNumber_nonnegative"
    CHECK ("lastIssuedNumber" >= 0)
);

CREATE TABLE "FinanceInvoiceEvent" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "type" "FinanceInvoiceEventType" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceInvoiceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceInvoiceEvent_reason_nonempty"
    CHECK ("reason" IS NULL OR length(btrim("reason")) > 0)
);

CREATE TABLE "FinanceCreditNote" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "creditNumber" BIGINT,
  "status" "FinanceCreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
  "reason" TEXT NOT NULL,
  "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
  "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
  "taxMinor" BIGINT NOT NULL DEFAULT 0,
  "totalMinor" BIGINT NOT NULL DEFAULT 0,
  "payerNameSnapshot" TEXT,
  "legalEntityNameSnapshot" TEXT,
  "createdByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "issuedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "voidedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceCreditNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceCreditNote_reason_nonempty" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "FinanceCreditNote_amounts_nonnegative"
    CHECK ("subtotalMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0),
  CONSTRAINT "FinanceCreditNote_total_matches_components"
    CHECK ("totalMinor" = "subtotalMinor" + "taxMinor"),
  CONSTRAINT "FinanceCreditNote_issued_snapshot_shape" CHECK (
    ("status" IN ('DRAFT', 'IN_REVIEW', 'VOID') AND "creditNumber" IS NULL AND "issuedAt" IS NULL)
    OR (
      "status" = 'ISSUED' AND "creditNumber" > 0 AND "issuedAt" IS NOT NULL
      AND "payerNameSnapshot" IS NOT NULL AND length(btrim("payerNameSnapshot")) > 0
      AND "legalEntityNameSnapshot" IS NOT NULL AND length(btrim("legalEntityNameSnapshot")) > 0
    )
  ),
  CONSTRAINT "FinanceCreditNote_approval_shape" CHECK (
    ("approvedAt" IS NULL AND "approvedByUserId" IS NULL)
    OR ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "status" IN ('IN_REVIEW', 'ISSUED'))
  ),
  CONSTRAINT "FinanceCreditNote_void_shape" CHECK (
    ("status" = 'VOID' AND "voidedAt" IS NOT NULL AND "voidedByUserId" IS NOT NULL)
    OR ("status" <> 'VOID' AND "voidedAt" IS NULL AND "voidedByUserId" IS NULL)
  )
);

CREATE TABLE "FinanceCreditNoteLine" (
  "id" TEXT NOT NULL,
  "creditNoteId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "sourceInvoiceLineId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitAmountMinor" BIGINT NOT NULL,
  "taxRateBasisPoints" INTEGER NOT NULL,
  "netAmountMinor" BIGINT NOT NULL,
  "taxAmountMinor" BIGINT NOT NULL,
  "totalMinor" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCreditNoteLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceCreditNoteLine_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "FinanceCreditNoteLine_amounts_nonnegative"
    CHECK ("unitAmountMinor" >= 0 AND "netAmountMinor" >= 0 AND "taxAmountMinor" >= 0 AND "totalMinor" >= 0),
  CONSTRAINT "FinanceCreditNoteLine_taxRate_nonnegative" CHECK ("taxRateBasisPoints" >= 0),
  CONSTRAINT "FinanceCreditNoteLine_total_matches_components"
    CHECK ("totalMinor" = "netAmountMinor" + "taxAmountMinor"),
  CONSTRAINT "FinanceCreditNoteLine_description_nonempty"
    CHECK (length(btrim("description")) > 0)
);

CREATE TABLE "FinanceCreditNoteEvent" (
  "id" TEXT NOT NULL,
  "creditNoteId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "type" "FinanceCreditNoteEventType" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCreditNoteEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceCreditNoteEvent_reason_nonempty"
    CHECK ("reason" IS NULL OR length(btrim("reason")) > 0)
);

CREATE TABLE "FinanceCommandReceipt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "commandType" "FinanceCommandType" NOT NULL,
  "resourceType" "FinanceCommandResourceType" NOT NULL,
  "resourceId" TEXT,
  "requestHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCommandReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceCommandReceipt_key_nonempty"
    CHECK (length(btrim("idempotencyKey")) >= 16),
  CONSTRAINT "FinanceCommandReceipt_request_hash_shape"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "FinanceCreditNoteNumberSequence_tenantId_orgId_idx"
  ON "FinanceCreditNoteNumberSequence"("tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceInvoiceEvent_id_tenantId_orgId_key"
  ON "FinanceInvoiceEvent"("id", "tenantId", "orgId");
CREATE INDEX "FinanceInvoiceEvent_tenantId_orgId_invoiceId_createdAt_idx"
  ON "FinanceInvoiceEvent"("tenantId", "orgId", "invoiceId", "createdAt");
CREATE UNIQUE INDEX "FinanceCreditNote_id_tenantId_orgId_key"
  ON "FinanceCreditNote"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceCreditNote_id_invoiceId_tenantId_orgId_key"
  ON "FinanceCreditNote"("id", "invoiceId", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceCreditNote_tenantId_creditNumber_key"
  ON "FinanceCreditNote"("tenantId", "creditNumber");
CREATE INDEX "FinanceCreditNote_tenantId_orgId_invoiceId_status_idx"
  ON "FinanceCreditNote"("tenantId", "orgId", "invoiceId", "status");
CREATE INDEX "FinanceCreditNote_financeProfileId_status_createdAt_idx"
  ON "FinanceCreditNote"("financeProfileId", "status", "createdAt");
CREATE UNIQUE INDEX "FinanceCreditNoteLine_id_tenantId_orgId_key"
  ON "FinanceCreditNoteLine"("id", "tenantId", "orgId");
CREATE INDEX "FinanceCreditNoteLine_creditNote_invoice_scope_idx"
  ON "FinanceCreditNoteLine"("creditNoteId", "invoiceId", "tenantId", "orgId");
CREATE INDEX "FinanceCreditNoteLine_tenantId_orgId_creditNoteId_idx"
  ON "FinanceCreditNoteLine"("tenantId", "orgId", "creditNoteId");
CREATE INDEX "FinanceCreditNoteLine_tenantId_orgId_sourceInvoiceLineId_idx"
  ON "FinanceCreditNoteLine"("tenantId", "orgId", "sourceInvoiceLineId");
CREATE UNIQUE INDEX "FinanceCreditNoteEvent_id_tenantId_orgId_key"
  ON "FinanceCreditNoteEvent"("id", "tenantId", "orgId");
CREATE INDEX "FinanceCreditNoteEvent_tenantId_orgId_creditNoteId_createdAt_idx"
  ON "FinanceCreditNoteEvent"("tenantId", "orgId", "creditNoteId", "createdAt");
CREATE UNIQUE INDEX "FinanceCommandReceipt_id_tenantId_orgId_key"
  ON "FinanceCommandReceipt"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceCommandReceipt_tenant_org_actor_idempotency_key"
  ON "FinanceCommandReceipt"("tenantId", "orgId", "actorUserId", "idempotencyKey");
CREATE INDEX "FinanceCommandReceipt_tenant_org_resource_idx"
  ON "FinanceCommandReceipt"("tenantId", "orgId", "resourceType", "resourceId");

ALTER TABLE "FinanceCreditNoteNumberSequence"
  ADD CONSTRAINT "FinanceCreditNoteNumberSequence_profile_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInvoice"
  ADD CONSTRAINT "FinanceInvoice_payerAccount_fkey"
  FOREIGN KEY ("payerAccountId", "tenantId", "orgId")
  REFERENCES "FinancePayerAccount"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInvoice_createdBy_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInvoice_approvedBy_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInvoice_voidedBy_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInvoiceEvent"
  ADD CONSTRAINT "FinanceInvoiceEvent_invoice_fkey"
  FOREIGN KEY ("invoiceId", "tenantId", "orgId")
  REFERENCES "FinanceInvoice"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInvoiceEvent_actor_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCreditNote"
  ADD CONSTRAINT "FinanceCreditNote_profile_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCreditNote_invoice_fkey"
  FOREIGN KEY ("invoiceId", "tenantId", "orgId")
  REFERENCES "FinanceInvoice"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCreditNote_createdBy_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCreditNote_approvedBy_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCreditNote_voidedBy_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCreditNoteLine"
  ADD CONSTRAINT "FinanceCreditNoteLine_creditNote_fkey"
  FOREIGN KEY ("creditNoteId", "invoiceId", "tenantId", "orgId")
  REFERENCES "FinanceCreditNote"("id", "invoiceId", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCreditNoteLine_sourceInvoiceLine_fkey"
  FOREIGN KEY ("sourceInvoiceLineId", "invoiceId", "tenantId", "orgId")
  REFERENCES "FinanceInvoiceLine"("id", "invoiceId", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCreditNoteEvent"
  ADD CONSTRAINT "FinanceCreditNoteEvent_creditNote_fkey"
  FOREIGN KEY ("creditNoteId", "tenantId", "orgId")
  REFERENCES "FinanceCreditNote"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCreditNoteEvent_actor_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCommandReceipt"
  ADD CONSTRAINT "FinanceCommandReceipt_actor_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCommandReceipt_tenant_fkey"
  FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION finance_invoice_protect_issued_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  has_allocations boolean;
  has_issued_credits boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' OR NEW."createdByUserId" IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoice_create_as_draft',
        MESSAGE = 'Finance invoices must be created as drafts with an actor';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('ISSUED', 'VOID') THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoice_issued_snapshot_immutable',
        MESSAGE = 'Issued invoices cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'DRAFT' AND NEW."status" NOT IN ('DRAFT', 'IN_REVIEW') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoice_draft_transition',
      MESSAGE = 'Draft invoices must enter review before issue';
  END IF;
  IF OLD."status" = 'IN_REVIEW' AND NEW."status" NOT IN ('DRAFT', 'IN_REVIEW', 'ISSUED') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoice_review_transition',
      MESSAGE = 'Invoice review has an invalid transition';
  END IF;
  IF NEW."status" = 'ISSUED' AND OLD."status" <> 'ISSUED'
    AND (NEW."approvedAt" IS NULL OR NEW."approvedByUserId" IS NULL
      OR NEW."createdByUserId" = NEW."approvedByUserId") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoice_independent_approval_required',
      MESSAGE = 'Invoice issue requires an independent approval';
  END IF;

  IF OLD."status" IN ('ISSUED', 'VOID') THEN
    IF (
      NEW."id", NEW."financeProfileId", NEW."payerAccountId", NEW."tenantId",
      NEW."orgId", NEW."invoiceNumber", NEW."currency", NEW."subtotalMinor",
      NEW."taxMinor", NEW."totalMinor", NEW."issuedAt", NEW."dueAt",
      NEW."payerNameSnapshot", NEW."legalEntityNameSnapshot", NEW."createdByUserId",
      NEW."approvedAt", NEW."approvedByUserId", NEW."createdAt"
    ) IS DISTINCT FROM (
      OLD."id", OLD."financeProfileId", OLD."payerAccountId", OLD."tenantId",
      OLD."orgId", OLD."invoiceNumber", OLD."currency", OLD."subtotalMinor",
      OLD."taxMinor", OLD."totalMinor", OLD."issuedAt", OLD."dueAt",
      OLD."payerNameSnapshot", OLD."legalEntityNameSnapshot", OLD."createdByUserId",
      OLD."approvedAt", OLD."approvedByUserId", OLD."createdAt"
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoice_issued_snapshot_immutable',
        MESSAGE = 'Issued invoice snapshots cannot be changed';
    END IF;

    IF OLD."status" = 'VOID' AND (
      NEW."status" <> 'VOID'
      OR (NEW."voidedAt", NEW."voidedByUserId", NEW."voidReason")
        IS DISTINCT FROM (OLD."voidedAt", OLD."voidedByUserId", OLD."voidReason")
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoice_void_is_terminal',
        MESSAGE = 'Voided invoices cannot be changed';
    END IF;

    IF OLD."status" = 'ISSUED' AND NEW."status" NOT IN ('ISSUED', 'VOID') THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoice_issued_transition',
        MESSAGE = 'Issued invoices may only be voided';
    END IF;

    IF OLD."status" = 'ISSUED' AND NEW."status" = 'ISSUED'
      AND (NEW."voidedAt", NEW."voidedByUserId", NEW."voidReason")
        IS DISTINCT FROM (OLD."voidedAt", OLD."voidedByUserId", OLD."voidReason") THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoice_void_requires_transition',
        MESSAGE = 'Void evidence requires a void transition';
    END IF;

    IF OLD."status" = 'ISSUED' AND NEW."status" = 'VOID' THEN
      EXECUTE pg_catalog.format(
        'SELECT EXISTS (SELECT 1 FROM %I."FinanceReceiptAllocation" WHERE "invoiceId" = $1 AND "tenantId" = $2 AND "orgId" = $3)',
        TG_TABLE_SCHEMA
      ) INTO has_allocations USING OLD."id", OLD."tenantId", OLD."orgId";
      EXECUTE pg_catalog.format(
        'SELECT EXISTS (SELECT 1 FROM %I."FinanceCreditNote" WHERE "invoiceId" = $1 AND "tenantId" = $2 AND "orgId" = $3 AND "status" = ''ISSUED'')',
        TG_TABLE_SCHEMA
      ) INTO has_issued_credits USING OLD."id", OLD."tenantId", OLD."orgId";
      IF has_allocations OR has_issued_credits THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          CONSTRAINT = 'FinanceInvoice_void_without_financial_activity',
          MESSAGE = 'Invoices with financial activity cannot be voided';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER "FinanceInvoice_protect_issued_snapshot" ON "FinanceInvoice";
CREATE TRIGGER "FinanceInvoice_protect_issued_snapshot"
BEFORE INSERT OR UPDATE OR DELETE ON "FinanceInvoice"
FOR EACH ROW EXECUTE FUNCTION finance_invoice_protect_issued_snapshot();

CREATE OR REPLACE FUNCTION finance_invoice_line_require_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  invoice_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceInvoice" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3',
      TG_TABLE_SCHEMA
    ) INTO invoice_status USING NEW."invoiceId", NEW."tenantId", NEW."orgId";
  ELSE
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceInvoice" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3',
      TG_TABLE_SCHEMA
    ) INTO invoice_status USING OLD."invoiceId", OLD."tenantId", OLD."orgId";
  END IF;

  IF invoice_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoiceLine_draft_only',
      MESSAGE = 'Invoice lines may only change while the invoice is a draft';
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW."invoiceId", NEW."tenantId", NEW."orgId")
    IS DISTINCT FROM (OLD."invoiceId", OLD."tenantId", OLD."orgId") THEN
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceInvoice" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3',
      TG_TABLE_SCHEMA
    ) INTO invoice_status USING NEW."invoiceId", NEW."tenantId", NEW."orgId";
    IF invoice_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoiceLine_draft_only',
        MESSAGE = 'Invoice lines may only change while the invoice is a draft';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER "FinanceInvoiceLine_require_draft" ON "FinanceInvoiceLine";
CREATE TRIGGER "FinanceInvoiceLine_require_draft"
BEFORE INSERT OR UPDATE OR DELETE ON "FinanceInvoiceLine"
FOR EACH ROW EXECUTE FUNCTION finance_invoice_line_require_draft();

CREATE FUNCTION finance_credit_note_protect_issued_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' OR NEW."createdByUserId" IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceCreditNote_create_as_draft',
        MESSAGE = 'Finance credit notes must be created as drafts with an actor';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'ISSUED' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceCreditNote_issued_snapshot_immutable',
        MESSAGE = 'Issued credit notes cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" IN ('DRAFT', 'IN_REVIEW') AND NEW."status" NOT IN ('DRAFT', 'IN_REVIEW', 'ISSUED', 'VOID') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNote_review_transition',
      MESSAGE = 'Credit note has an invalid transition';
  END IF;
  IF NEW."status" = 'ISSUED' AND OLD."status" <> 'ISSUED'
    AND (OLD."status" <> 'IN_REVIEW' OR NEW."approvedAt" IS NULL
      OR NEW."approvedByUserId" IS NULL OR NEW."createdByUserId" = NEW."approvedByUserId") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNote_independent_approval_required',
      MESSAGE = 'Credit note issue requires an independent approval';
  END IF;

  IF OLD."status" = 'ISSUED' AND (
    NEW."id", NEW."financeProfileId", NEW."invoiceId", NEW."tenantId", NEW."orgId",
    NEW."creditNumber", NEW."status", NEW."reason", NEW."currency", NEW."subtotalMinor",
    NEW."taxMinor", NEW."totalMinor", NEW."payerNameSnapshot", NEW."legalEntityNameSnapshot",
    NEW."createdByUserId", NEW."approvedAt", NEW."approvedByUserId", NEW."issuedAt", NEW."createdAt"
  ) IS DISTINCT FROM (
    OLD."id", OLD."financeProfileId", OLD."invoiceId", OLD."tenantId", OLD."orgId",
    OLD."creditNumber", OLD."status", OLD."reason", OLD."currency", OLD."subtotalMinor",
    OLD."taxMinor", OLD."totalMinor", OLD."payerNameSnapshot", OLD."legalEntityNameSnapshot",
    OLD."createdByUserId", OLD."approvedAt", OLD."approvedByUserId", OLD."issuedAt", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNote_issued_snapshot_immutable',
      MESSAGE = 'Issued credit note snapshots cannot be changed';
  END IF;

  IF OLD."status" = 'VOID' AND (
    NEW."status" <> 'VOID'
    OR (
      NEW."id", NEW."financeProfileId", NEW."invoiceId", NEW."tenantId", NEW."orgId",
      NEW."creditNumber", NEW."reason", NEW."currency", NEW."subtotalMinor",
      NEW."taxMinor", NEW."totalMinor", NEW."payerNameSnapshot", NEW."legalEntityNameSnapshot",
      NEW."createdByUserId", NEW."approvedAt", NEW."approvedByUserId", NEW."issuedAt",
      NEW."voidedAt", NEW."voidedByUserId", NEW."createdAt"
    ) IS DISTINCT FROM (
      OLD."id", OLD."financeProfileId", OLD."invoiceId", OLD."tenantId", OLD."orgId",
      OLD."creditNumber", OLD."reason", OLD."currency", OLD."subtotalMinor",
      OLD."taxMinor", OLD."totalMinor", OLD."payerNameSnapshot", OLD."legalEntityNameSnapshot",
      OLD."createdByUserId", OLD."approvedAt", OLD."approvedByUserId", OLD."issuedAt",
      OLD."voidedAt", OLD."voidedByUserId", OLD."createdAt"
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNote_void_is_terminal',
      MESSAGE = 'Voided credit notes cannot be changed';
  END IF;
  IF OLD."status" = 'ISSUED' AND (NEW."voidedAt", NEW."voidedByUserId")
    IS DISTINCT FROM (OLD."voidedAt", OLD."voidedByUserId") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNote_issued_void_prohibited',
      MESSAGE = 'Issued credit notes cannot be voided';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FinanceCreditNote_protect_issued_snapshot"
BEFORE INSERT OR UPDATE OR DELETE ON "FinanceCreditNote"
FOR EACH ROW EXECUTE FUNCTION finance_credit_note_protect_issued_snapshot();

CREATE FUNCTION finance_credit_note_line_require_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  note_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceCreditNote" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3',
      TG_TABLE_SCHEMA
    ) INTO note_status USING NEW."creditNoteId", NEW."tenantId", NEW."orgId";
  ELSE
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceCreditNote" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3',
      TG_TABLE_SCHEMA
    ) INTO note_status USING OLD."creditNoteId", OLD."tenantId", OLD."orgId";
  END IF;
  IF note_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNoteLine_draft_only',
      MESSAGE = 'Credit note lines may only change while the note is a draft';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."creditNoteId" IS DISTINCT FROM OLD."creditNoteId" THEN
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceCreditNote" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3',
      TG_TABLE_SCHEMA
    ) INTO note_status USING NEW."creditNoteId", NEW."tenantId", NEW."orgId";
    IF note_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceCreditNoteLine_draft_only',
        MESSAGE = 'Credit note lines may only change while the note is a draft';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FinanceCreditNoteLine_require_draft"
BEFORE INSERT OR UPDATE OR DELETE ON "FinanceCreditNoteLine"
FOR EACH ROW EXECUTE FUNCTION finance_credit_note_line_require_draft();

CREATE FUNCTION finance_append_only_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    CONSTRAINT = 'Finance_append_only_evidence',
    MESSAGE = 'Finance command evidence is append-only';
END;
$$;
CREATE TRIGGER "FinanceInvoiceEvent_append_only"
BEFORE UPDATE OR DELETE ON "FinanceInvoiceEvent"
FOR EACH ROW EXECUTE FUNCTION finance_append_only_record();
CREATE TRIGGER "FinanceCreditNoteEvent_append_only"
BEFORE UPDATE OR DELETE ON "FinanceCreditNoteEvent"
FOR EACH ROW EXECUTE FUNCTION finance_append_only_record();
CREATE TRIGGER "FinanceCommandReceipt_append_only"
BEFORE UPDATE OR DELETE ON "FinanceCommandReceipt"
FOR EACH ROW EXECUTE FUNCTION finance_append_only_record();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'FinanceCreditNoteNumberSequence', 'FinanceInvoiceEvent', 'FinanceCreditNote',
    'FinanceCreditNoteLine', 'FinanceCreditNoteEvent', 'FinanceCommandReceipt'
  ]
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE pg_catalog.format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE pg_catalog.format(
      'CREATE POLICY %1$I ON %2$I
         USING (app.current_tenant_id() IS NOT NULL AND app.current_org_id() IS NOT NULL
           AND "tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND app.current_org_id() IS NOT NULL
           AND "tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());',
      tbl || '_tenant_org_rls', tbl
    );
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC;', tbl);
    IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon;', tbl);
    END IF;
    IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated;', tbl);
    END IF;
  END LOOP;
END;
$$;
