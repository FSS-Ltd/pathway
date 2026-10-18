CREATE OR REPLACE FUNCTION finance_checkout_attempt_guard()
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
    (OLD."status" = 'CREATING' AND NEW."status" IN ('OPEN', 'COMPLETED', 'PAID', 'EXPIRED', 'FAILED'))
    OR (OLD."status" = 'OPEN' AND NEW."status" IN ('COMPLETED', 'PAID', 'EXPIRED', 'FAILED'))
    OR (OLD."status" = 'COMPLETED' AND NEW."status" IN ('PAID', 'EXPIRED', 'FAILED'))
    OR (OLD."status" IN ('EXPIRED', 'FAILED') AND NEW."status" = 'PAID')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCheckoutAttempt_transition_invalid',
      MESSAGE = 'Finance Checkout attempt transition is invalid';
  END IF;
  RETURN NEW;
END;
$$;
