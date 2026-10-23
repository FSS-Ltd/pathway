-- Backend-only work discovery requires an owner that can see the forced-RLS scope index.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Finance recovery discovery requires an administrative migration role';
  END IF;
END;
$$;

ALTER TABLE app."FinanceReconciliationState" DROP CONSTRAINT "FinanceReconciliationState_stream_valid";
ALTER TABLE app."FinanceReconciliationState" ADD CONSTRAINT "FinanceReconciliationState_stream_valid" CHECK (
  "stream" IN ('events','checkoutSessions','setupIntents','paymentIntents','charges','refunds','disputes',
    'balanceTransactions','payouts','unresolvedOperations','payoutContinuations','caseRequests')
);
CREATE INDEX "FinanceReconciliationCaseEvent_request_idx"
  ON app."FinanceReconciliationCaseEvent"("tenantId","orgId","type","id");
CREATE INDEX "FinanceReconciliationCaseEvent_completion_idx"
  ON app."FinanceReconciliationCaseEvent"("tenantId","orgId","caseId",("details"->>'completedRequestId'))
  WHERE "type" = 'UPDATED';

CREATE FUNCTION app.list_due_finance_reconciliation_scopes(p_now TIMESTAMPTZ, p_livemode BOOLEAN, p_limit INTEGER, p_excluded TEXT[] DEFAULT ARRAY[]::TEXT[])
RETURNS TABLE ("tenantId" TEXT,"orgId" TEXT,"connectionId" TEXT,"stream" TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT c."tenantId", c."orgId", c."id", work.stream
  FROM app."FinanceStripeConnection" c
  CROSS JOIN (VALUES ('events'),('checkoutSessions'),('setupIntents'),('paymentIntents'),('charges'),
    ('refunds'),('disputes'),('balanceTransactions'),('payouts'),('unresolvedOperations'),
    ('payoutContinuations'),('caseRequests')) work(stream)
  LEFT JOIN app."FinanceReconciliationState" state
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
      SELECT 1 FROM app."FinancePayoutReconciliation" payout
      WHERE payout."stripeConnectionId" = c."id" AND payout."tenantId" = c."tenantId" AND payout."orgId" = c."orgId"
        AND payout."coverage"->>'status' <> 'MATCHED'
    ))
    AND (work.stream <> 'caseRequests' OR EXISTS (
      SELECT 1 FROM app."FinanceReconciliationCase" issue
      JOIN app."FinanceReconciliationCaseEvent" request ON request."caseId" = issue."id"
        AND request."tenantId" = issue."tenantId" AND request."orgId" = issue."orgId"
      WHERE issue."stripeConnectionId" = c."id" AND issue."tenantId" = c."tenantId" AND issue."orgId" = c."orgId"
        AND request."type" = 'REPLAY_REQUESTED' AND NOT EXISTS (
          SELECT 1 FROM app."FinanceReconciliationCaseEvent" completion
          WHERE completion."caseId" = issue."id" AND completion."tenantId" = c."tenantId" AND completion."orgId" = c."orgId"
            AND completion."type" = 'UPDATED' AND completion."details"->>'completedRequestId' = request."details"->>'requestId'
        )
    ))
  ORDER BY coalesce(state."updatedAt",c."createdAt"), c."id", work.stream
  LIMIT greatest(1,least(p_limit,100));
$$;
REVOKE ALL ON FUNCTION app.list_due_finance_reconciliation_scopes(TIMESTAMPTZ,BOOLEAN,INTEGER,TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_finance_reconciliation_scopes(TIMESTAMPTZ,BOOLEAN,INTEGER,TEXT[]) TO CURRENT_USER;
