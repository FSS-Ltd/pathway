-- Add independently reviewed bank-transfer destinations, manual receipt
-- approvals and payer transfer notices. A payer notice is not receipt evidence.
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

ALTER TYPE "FinanceCommandType" ADD VALUE 'CREATE_MANUAL_RECEIPT_REQUEST';
ALTER TYPE "FinanceCommandType" ADD VALUE 'APPROVE_MANUAL_RECEIPT_REQUEST';
ALTER TYPE "FinanceCommandType" ADD VALUE 'REJECT_MANUAL_RECEIPT_REQUEST';
ALTER TYPE "FinanceCommandType" ADD VALUE 'SUBMIT_TRANSFER_NOTICE';
ALTER TYPE "FinanceCommandType" ADD VALUE 'APPROVE_BANK_TRANSFER_CHANGE';
ALTER TYPE "FinanceCommandType" ADD VALUE 'REJECT_BANK_TRANSFER_CHANGE';
ALTER TYPE "FinanceCommandResourceType" ADD VALUE 'MANUAL_RECEIPT_REQUEST';
ALTER TYPE "FinanceCommandResourceType" ADD VALUE 'TRANSFER_NOTICE';
ALTER TYPE "FinanceCommandResourceType" ADD VALUE 'BANK_TRANSFER_CHANGE';

CREATE TYPE "FinanceManualReceiptRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE "FinanceBankTransferChangeStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "FinanceBankTransferChange" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "decidedByUserId" TEXT,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "accountHolderName" VARCHAR(1024) NOT NULL,
  "sortCode" VARCHAR(1024) NOT NULL,
  "accountNumber" VARCHAR(1024) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "FinanceBankTransferChangeStatus" NOT NULL DEFAULT 'PENDING',
  "decisionReason" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceBankTransferChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceBankTransferChange_reason_nonempty"
    CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "FinanceBankTransferChange_decision_valid"
    CHECK (
      ("status" = 'PENDING' AND "decidedByUserId" IS NULL AND "decidedAt" IS NULL AND "decisionReason" IS NULL)
      OR ("status" = 'APPROVED' AND "decidedByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL
        AND "requestedByUserId" <> "decidedByUserId")
      OR ("status" = 'REJECTED' AND "decidedByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL
        AND "requestedByUserId" <> "decidedByUserId" AND length(btrim(coalesce("decisionReason", ''))) > 0)
    )
);

CREATE TABLE "FinanceTransferNotice" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "payerAccountId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "payerUserId" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "invoiceNumber" BIGINT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "declaredTransferredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTransferNotice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceTransferNotice_invoice_number_positive" CHECK ("invoiceNumber" > 0),
  CONSTRAINT "FinanceTransferNotice_amount_positive" CHECK ("amountMinor" > 0)
);

CREATE TABLE "FinanceManualReceiptRequest" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "payerAccountId" TEXT NOT NULL,
  "transferNoticeId" TEXT,
  "receiptId" TEXT,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "decidedByUserId" TEXT,
  "bankTransactionReference" VARCHAR(255) NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "requestReason" TEXT NOT NULL,
  "status" "FinanceManualReceiptRequestStatus" NOT NULL DEFAULT 'PENDING',
  "decisionReason" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceManualReceiptRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceManualReceiptRequest_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "FinanceManualReceiptRequest_reference_nonempty"
    CHECK (length(btrim("bankTransactionReference")) > 0),
  CONSTRAINT "FinanceManualReceiptRequest_reason_nonempty"
    CHECK (length(btrim("requestReason")) > 0),
  CONSTRAINT "FinanceManualReceiptRequest_decision_valid"
    CHECK (
      ("status" = 'PENDING' AND "decidedByUserId" IS NULL AND "decidedAt" IS NULL
        AND "decisionReason" IS NULL AND "receiptId" IS NULL)
      OR ("status" = 'APPROVED' AND "decidedByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL
        AND "requestedByUserId" <> "decidedByUserId" AND "receiptId" IS NOT NULL)
      OR ("status" = 'REJECTED' AND "decidedByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL
        AND "requestedByUserId" <> "decidedByUserId" AND "receiptId" IS NULL
        AND length(btrim(coalesce("decisionReason", ''))) > 0)
    )
);

CREATE UNIQUE INDEX "FinanceBankTransferChange_id_tenantId_orgId_key"
  ON "FinanceBankTransferChange"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceBankTransferChange_actor_idempotency_key"
  ON "FinanceBankTransferChange"("tenantId", "orgId", "requestedByUserId", "idempotencyKey");
CREATE UNIQUE INDEX "FinanceBankTransferChange_one_pending_per_profile_key"
  ON "FinanceBankTransferChange"("financeProfileId") WHERE "status" = 'PENDING';
CREATE INDEX "FinanceBankTransferChange_scope_status_created_idx"
  ON "FinanceBankTransferChange"("tenantId", "orgId", "financeProfileId", "status", "createdAt");

CREATE UNIQUE INDEX "FinanceTransferNotice_id_tenantId_orgId_key"
  ON "FinanceTransferNotice"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceTransferNotice_actor_idempotency_key"
  ON "FinanceTransferNotice"("tenantId", "orgId", "payerUserId", "idempotencyKey");
CREATE INDEX "FinanceTransferNotice_account_created_idx"
  ON "FinanceTransferNotice"("tenantId", "orgId", "payerAccountId", "createdAt");
CREATE INDEX "FinanceTransferNotice_invoice_created_idx"
  ON "FinanceTransferNotice"("tenantId", "orgId", "invoiceId", "createdAt");

CREATE UNIQUE INDEX "FinanceManualReceiptRequest_id_tenantId_orgId_key"
  ON "FinanceManualReceiptRequest"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceManualReceiptRequest_notice_scope_key"
  ON "FinanceManualReceiptRequest"("transferNoticeId", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceManualReceiptRequest_receipt_scope_key"
  ON "FinanceManualReceiptRequest"("receiptId", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceManualReceiptRequest_profile_bank_reference_key"
  ON "FinanceManualReceiptRequest"("financeProfileId", "bankTransactionReference");
CREATE INDEX "FinanceManualReceiptRequest_scope_status_created_idx"
  ON "FinanceManualReceiptRequest"("tenantId", "orgId", "status", "createdAt");
CREATE INDEX "FinanceManualReceiptRequest_account_received_idx"
  ON "FinanceManualReceiptRequest"("tenantId", "orgId", "payerAccountId", "receivedAt");

ALTER TABLE "FinanceBankTransferChange"
  ADD CONSTRAINT "FinanceBankTransferChange_profile_scope_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBankTransferChange"
  ADD CONSTRAINT "FinanceBankTransferChange_requester_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBankTransferChange"
  ADD CONSTRAINT "FinanceBankTransferChange_decider_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceTransferNotice"
  ADD CONSTRAINT "FinanceTransferNotice_profile_scope_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceTransferNotice"
  ADD CONSTRAINT "FinanceTransferNotice_payer_scope_fkey"
  FOREIGN KEY ("payerAccountId", "tenantId", "orgId")
  REFERENCES "FinancePayerAccount"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceTransferNotice"
  ADD CONSTRAINT "FinanceTransferNotice_invoice_scope_fkey"
  FOREIGN KEY ("invoiceId", "tenantId", "orgId")
  REFERENCES "FinanceInvoice"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceTransferNotice"
  ADD CONSTRAINT "FinanceTransferNotice_payer_user_fkey"
  FOREIGN KEY ("payerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceManualReceiptRequest"
  ADD CONSTRAINT "FinanceManualReceiptRequest_profile_scope_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceManualReceiptRequest"
  ADD CONSTRAINT "FinanceManualReceiptRequest_payer_scope_fkey"
  FOREIGN KEY ("payerAccountId", "tenantId", "orgId")
  REFERENCES "FinancePayerAccount"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceManualReceiptRequest"
  ADD CONSTRAINT "FinanceManualReceiptRequest_notice_scope_fkey"
  FOREIGN KEY ("transferNoticeId", "tenantId", "orgId")
  REFERENCES "FinanceTransferNotice"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceManualReceiptRequest"
  ADD CONSTRAINT "FinanceManualReceiptRequest_receipt_scope_fkey"
  FOREIGN KEY ("receiptId", "tenantId", "orgId")
  REFERENCES "FinanceReceipt"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceManualReceiptRequest"
  ADD CONSTRAINT "FinanceManualReceiptRequest_requester_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceManualReceiptRequest"
  ADD CONSTRAINT "FinanceManualReceiptRequest_decider_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION finance_bank_transfer_change_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceBankTransferChange_append_only',
      MESSAGE = 'Finance bank destination evidence cannot be deleted';
  END IF;
  IF (
    NEW."id", NEW."financeProfileId", NEW."tenantId", NEW."orgId", NEW."requestedByUserId",
    NEW."idempotencyKey", NEW."accountHolderName", NEW."sortCode", NEW."accountNumber", NEW."reason", NEW."createdAt"
  ) IS DISTINCT FROM (
    OLD."id", OLD."financeProfileId", OLD."tenantId", OLD."orgId", OLD."requestedByUserId",
    OLD."idempotencyKey", OLD."accountHolderName", OLD."sortCode", OLD."accountNumber", OLD."reason", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceBankTransferChange_facts_immutable',
      MESSAGE = 'Finance bank destination request facts cannot be changed';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceBankTransferChange_decision_immutable',
      MESSAGE = 'Finance bank destination decisions are terminal';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceBankTransferChange_evidence_guard"
BEFORE UPDATE OR DELETE ON "FinanceBankTransferChange"
FOR EACH ROW EXECUTE FUNCTION finance_bank_transfer_change_guard();
CREATE TRIGGER "FinanceBankTransferChange_no_truncate"
BEFORE TRUNCATE ON "FinanceBankTransferChange"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceBankTransferChange_no_truncate');

CREATE FUNCTION finance_manual_receipt_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceManualReceiptRequest_append_only',
      MESSAGE = 'Finance manual receipt request evidence cannot be deleted';
  END IF;
  IF (
    NEW."id", NEW."financeProfileId", NEW."payerAccountId", NEW."transferNoticeId", NEW."tenantId", NEW."orgId",
    NEW."requestedByUserId", NEW."bankTransactionReference", NEW."amountMinor", NEW."currency", NEW."receivedAt",
    NEW."requestReason", NEW."createdAt"
  ) IS DISTINCT FROM (
    OLD."id", OLD."financeProfileId", OLD."payerAccountId", OLD."transferNoticeId", OLD."tenantId", OLD."orgId",
    OLD."requestedByUserId", OLD."bankTransactionReference", OLD."amountMinor", OLD."currency", OLD."receivedAt",
    OLD."requestReason", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceManualReceiptRequest_facts_immutable',
      MESSAGE = 'Finance manual receipt request facts cannot be changed';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceManualReceiptRequest_decision_immutable',
      MESSAGE = 'Finance manual receipt decisions are terminal';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceManualReceiptRequest_evidence_guard"
BEFORE UPDATE OR DELETE ON "FinanceManualReceiptRequest"
FOR EACH ROW EXECUTE FUNCTION finance_manual_receipt_request_guard();
CREATE TRIGGER "FinanceManualReceiptRequest_no_truncate"
BEFORE TRUNCATE ON "FinanceManualReceiptRequest"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceManualReceiptRequest_no_truncate');

CREATE FUNCTION finance_transfer_notice_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = TG_ARGV[0],
    MESSAGE = 'Finance transfer notices are append-only';
END;
$$;

CREATE TRIGGER "FinanceTransferNotice_append_only"
BEFORE UPDATE OR DELETE ON "FinanceTransferNotice"
FOR EACH ROW EXECUTE FUNCTION finance_transfer_notice_append_only('FinanceTransferNotice_append_only');
CREATE TRIGGER "FinanceTransferNotice_no_truncate"
BEFORE TRUNCATE ON "FinanceTransferNotice"
FOR EACH STATEMENT EXECUTE FUNCTION finance_transfer_notice_append_only('FinanceTransferNotice_no_truncate');

DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'FinanceBankTransferChange',
    'FinanceManualReceiptRequest',
    'FinanceTransferNotice'
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
