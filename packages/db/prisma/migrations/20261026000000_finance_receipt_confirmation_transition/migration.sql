-- A receipt may move out of processing once. After confirmation or failure,
-- its outcome and confirmation timestamp are terminal evidence.
CREATE OR REPLACE FUNCTION finance_receipt_evidence_guard()
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

  IF OLD."status" = 'PROCESSING' THEN
    IF OLD."confirmedAt" IS NOT NULL
      OR (NEW."status" = 'PROCESSING'
        AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt")
      OR (NEW."status" = 'CONFIRMED' AND NEW."confirmedAt" IS NULL)
      OR (NEW."status" = 'FAILED' AND NEW."confirmedAt" IS NOT NULL)
      OR NEW."status" NOT IN ('PROCESSING', 'CONFIRMED', 'FAILED') THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceReceipt_confirmation_transition',
        MESSAGE = 'Finance receipt must make one valid terminal transition';
    END IF;
  ELSIF (NEW."status", NEW."confirmedAt") IS DISTINCT FROM (OLD."status", OLD."confirmedAt") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceReceipt_confirmation_immutable',
      MESSAGE = 'Finance receipt confirmation is terminal';
  END IF;

  RETURN NEW;
END;
$$;
