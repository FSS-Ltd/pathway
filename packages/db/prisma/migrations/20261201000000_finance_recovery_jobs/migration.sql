-- Add an independent cursor for historical unresolved operations. No financial rows change.
ALTER TABLE app."FinanceReconciliationState"
  DROP CONSTRAINT "FinanceReconciliationState_stream_valid";
ALTER TABLE app."FinanceReconciliationState"
  ADD CONSTRAINT "FinanceReconciliationState_stream_valid" CHECK (
    "stream" IN ('events', 'checkoutSessions', 'paymentIntents', 'charges', 'refunds',
      'disputes', 'balanceTransactions', 'payouts', 'setupIntents', 'unresolvedOperations')
  );

-- Support scoped keyset paging without sorting a whole organisation's history.
CREATE INDEX "FinanceCheckoutAttempt_recovery_idx"
  ON app."FinanceCheckoutAttempt"("stripeConnectionId", "tenantId", "orgId", "id");
CREATE INDEX "FinanceDebitAttempt_recovery_idx"
  ON app."FinanceDebitAttempt"("stripeConnectionId", "tenantId", "orgId", "id");
CREATE INDEX "FinanceMandate_recovery_idx"
  ON app."FinanceMandate"("stripeConnectionId", "tenantId", "orgId", "id");
CREATE INDEX "FinanceRefund_recovery_idx"
  ON app."FinanceRefund"("tenantId", "orgId", "stripeAccountId", "id");
CREATE INDEX "FinanceReceiptMovement_recovery_idx"
  ON app."FinanceReceiptMovement"("tenantId", "orgId", "type", "id");
