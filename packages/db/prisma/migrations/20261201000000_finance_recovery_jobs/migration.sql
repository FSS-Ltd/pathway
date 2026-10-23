-- Add an independent cursor for historical unresolved operations. No financial rows change.
DO $$
DECLARE core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceStripeConnection' AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');
  PERFORM pg_catalog.set_config('search_path', pg_catalog.format('%I, %I', core_schema,
    CASE core_schema WHEN 'app' THEN 'public' ELSE 'app' END), false);
END;
$$;

ALTER TABLE "FinanceReconciliationState"
  DROP CONSTRAINT "FinanceReconciliationState_stream_valid";
ALTER TABLE "FinanceReconciliationState"
  ADD CONSTRAINT "FinanceReconciliationState_stream_valid" CHECK (
    "stream" IN ('events', 'checkoutSessions', 'paymentIntents', 'charges', 'refunds',
      'disputes', 'balanceTransactions', 'payouts', 'setupIntents', 'unresolvedOperations')
  );

-- Support scoped keyset paging without sorting a whole organisation's history.
CREATE INDEX "FinanceCheckoutAttempt_recovery_idx"
  ON "FinanceCheckoutAttempt"("stripeConnectionId", "tenantId", "orgId", "id");
CREATE INDEX "FinanceDebitAttempt_recovery_idx"
  ON "FinanceDebitAttempt"("stripeConnectionId", "tenantId", "orgId", "id");
CREATE INDEX "FinanceMandate_recovery_idx"
  ON "FinanceMandate"("stripeConnectionId", "tenantId", "orgId", "id");
CREATE INDEX "FinanceRefund_recovery_idx"
  ON "FinanceRefund"("tenantId", "orgId", "stripeAccountId", "id");
CREATE INDEX "FinanceReceiptMovement_recovery_idx"
  ON "FinanceReceiptMovement"("tenantId", "orgId", "type", "id");
