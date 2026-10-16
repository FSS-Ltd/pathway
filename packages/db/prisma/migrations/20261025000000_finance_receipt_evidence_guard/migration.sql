-- Freeze confirmed receipt facts while allowing a processing provider event to
-- confirm or fail once. Corrections and returns use append-only ledger rows.
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

DROP INDEX "FinanceReceiptAllocation_tenantId_invoiceId_createdAt_idx";

CREATE TRIGGER "FinanceReceiptAllocation_no_truncate"
BEFORE TRUNCATE ON "FinanceReceiptAllocation"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceReceiptAllocation_no_truncate');

CREATE TRIGGER "FinanceReceiptAllocationReversal_no_truncate"
BEFORE TRUNCATE ON "FinanceReceiptAllocationReversal"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceReceiptAllocationReversal_no_truncate');

CREATE FUNCTION finance_receipt_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceReceipt_evidence_append_only',
      MESSAGE = 'Finance receipt evidence cannot be deleted';
  END IF;

  IF (
    NEW."id", NEW."financeProfileId", NEW."payerAccountId", NEW."tenantId", NEW."orgId",
    NEW."amountMinor", NEW."currency", NEW."source", NEW."sourceReference", NEW."createdAt"
  ) IS DISTINCT FROM (
    OLD."id", OLD."financeProfileId", OLD."payerAccountId", OLD."tenantId", OLD."orgId",
    OLD."amountMinor", OLD."currency", OLD."source", OLD."sourceReference", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceReceipt_facts_immutable',
      MESSAGE = 'Finance receipt facts cannot be changed';
  END IF;

  IF OLD."status" <> 'PROCESSING'
    AND (NEW."status", NEW."confirmedAt") IS DISTINCT FROM (OLD."status", OLD."confirmedAt") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceReceipt_confirmation_immutable',
      MESSAGE = 'Finance receipt confirmation is terminal';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceReceipt_evidence_guard"
BEFORE UPDATE OR DELETE ON "FinanceReceipt"
FOR EACH ROW EXECUTE FUNCTION finance_receipt_evidence_guard();
