-- Backend-only work discovery requires an owner that can see the forced-RLS scope index.
DO $$
DECLARE core_schema text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Finance recovery discovery requires an administrative migration role';
  END IF;
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceStripeConnection' AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');
  PERFORM pg_catalog.set_config('search_path', pg_catalog.format('%I, %I', core_schema,
    CASE core_schema WHEN 'app' THEN 'public' ELSE 'app' END), false);
END;
$$;

ALTER TABLE "FinanceReconciliationState" DROP CONSTRAINT "FinanceReconciliationState_stream_valid";
ALTER TABLE "FinanceReconciliationState" ADD CONSTRAINT "FinanceReconciliationState_stream_valid" CHECK (
  "stream" IN ('events','checkoutSessions','setupIntents','paymentIntents','charges','refunds','disputes',
    'balanceTransactions','payouts','unresolvedOperations','payoutContinuations','caseRequests')
);
CREATE INDEX "FinanceReconciliationCaseEvent_request_idx"
  ON "FinanceReconciliationCaseEvent"("tenantId","orgId","type","id");
CREATE INDEX "FinanceReconciliationCaseEvent_completion_idx"
  ON "FinanceReconciliationCaseEvent"("tenantId","orgId","caseId",("details"->>'completedRequestId'))
  WHERE "type" = 'UPDATED';

CREATE INDEX "FinanceReconciliationCaseEvent_failure_idx"
  ON "FinanceReconciliationCaseEvent"("tenantId","orgId","caseId",("details"->>'failedRequestId'))
  WHERE "type" = 'UPDATED';

DO $create$
DECLARE core_schema text := current_schema();
BEGIN
  EXECUTE pg_catalog.format($definition$
CREATE FUNCTION app.list_due_finance_reconciliation_scopes(p_now TIMESTAMPTZ, p_livemode BOOLEAN, p_limit INTEGER, p_excluded TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS TABLE ("tenantId" TEXT,"orgId" TEXT,"connectionId" TEXT,"stream" TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT c."tenantId", c."orgId", c."id", work.stream
  FROM %1$I."FinanceStripeConnection" c
  CROSS JOIN (VALUES ('events'),('checkoutSessions'),('setupIntents'),('paymentIntents'),('charges'),
    ('refunds'),('disputes'),('balanceTransactions'),('payouts'),('unresolvedOperations'),
    ('payoutContinuations'),('caseRequests')) work(stream)
  LEFT JOIN %1$I."FinanceReconciliationState" state
    ON state."stripeConnectionId" = c."id" AND state."tenantId" = c."tenantId"
      AND state."orgId" = c."orgId" AND state."stream" = work.stream
  WHERE c."stripeAccountId" IS NOT NULL AND c."livemode" = p_livemode
    AND cardinality(coalesce(p_excluded,ARRAY[]::TEXT[])) <= 500
    AND NOT (c."id" || ':' || work.stream = ANY(coalesce(p_excluded,ARRAY[]::TEXT[])))
    AND (state."leaseExpiresAt" IS NULL OR state."leaseExpiresAt" <= (p_now AT TIME ZONE 'UTC'))
    AND (state."retryAfter" IS NULL OR state."retryAfter" <= (p_now AT TIME ZONE 'UTC'))
    AND (state."windowFrom" IS NOT NULL OR state."completedThrough" IS NULL OR state."completedThrough" <
      CASE WHEN work.stream IN ('unresolvedOperations','payoutContinuations','caseRequests')
        THEN to_timestamp(floor(extract(epoch FROM p_now)/300)*300) AT TIME ZONE 'UTC'
        ELSE date_trunc('day',p_now AT TIME ZONE 'UTC') END)
    AND (work.stream <> 'payoutContinuations' OR EXISTS (
      SELECT 1 FROM %1$I."FinancePayoutReconciliation" payout
      WHERE payout."stripeConnectionId" = c."id" AND payout."tenantId" = c."tenantId" AND payout."orgId" = c."orgId"
        AND payout."coverage"->>'status' <> 'MATCHED'
    ))
    AND (work.stream <> 'caseRequests' OR EXISTS (
      SELECT 1 FROM %1$I."FinanceReconciliationCase" issue
      JOIN %1$I."FinanceReconciliationCaseEvent" request ON request."caseId" = issue."id"
        AND request."tenantId" = issue."tenantId" AND request."orgId" = issue."orgId"
      WHERE issue."stripeConnectionId" = c."id" AND issue."tenantId" = c."tenantId" AND issue."orgId" = c."orgId"
        AND request."type" = 'REPLAY_REQUESTED' AND NOT EXISTS (
          SELECT 1 FROM %1$I."FinanceReconciliationCaseEvent" completion
          WHERE completion."caseId" = issue."id" AND completion."tenantId" = c."tenantId" AND completion."orgId" = c."orgId"
            AND completion."type" = 'UPDATED' AND completion."details"->>'completedRequestId' = request."details"->>'requestId'
        )
    ))
  ORDER BY coalesce(state."updatedAt",c."createdAt"), c."id", work.stream
  LIMIT greatest(1,least(p_limit,100));
$$;
$definition$,core_schema);
END;
$create$;
REVOKE ALL ON FUNCTION app.list_due_finance_reconciliation_scopes(TIMESTAMPTZ,BOOLEAN,INTEGER,TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_finance_reconciliation_scopes(TIMESTAMPTZ,BOOLEAN,INTEGER,TEXT[]) TO CURRENT_USER;
