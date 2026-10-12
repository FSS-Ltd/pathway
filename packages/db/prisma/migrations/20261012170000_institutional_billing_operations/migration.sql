CREATE TYPE "InstitutionalBillingOperationKind" AS ENUM ('CENSUS_FREEZE', 'RENEWAL_RECONCILE', 'PROVIDER_SCHEDULE');
CREATE TYPE "InstitutionalBillingOperationStatus" AS ENUM ('PENDING', 'CLAIMED', 'RETRY', 'COMPLETED', 'REVIEW_REQUIRED');

ALTER TABLE "PendingOrder" ADD COLUMN "institutionalCheckoutKey" TEXT;
CREATE UNIQUE INDEX "PendingOrder_orgId_institutionalCheckoutKey_key"
  ON "PendingOrder"("orgId", "institutionalCheckoutKey");

CREATE TABLE "InstitutionalBillingOperation" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "snapshotId" TEXT,
  "kind" "InstitutionalBillingOperationKind" NOT NULL,
  "status" "InstitutionalBillingOperationStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimToken" TEXT,
  "claimedUntil" TIMESTAMP(3),
  "providerIdempotencyKey" TEXT,
  "providerReference" TEXT,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstitutionalBillingOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstitutionalBillingOperation_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "InstitutionalBillingOperation_claim_state" CHECK (
    ("status" = 'CLAIMED' AND "claimToken" IS NOT NULL AND "claimedUntil" IS NOT NULL)
    OR ("status" <> 'CLAIMED' AND "claimToken" IS NULL AND "claimedUntil" IS NULL)
  ),
  CONSTRAINT "InstitutionalBillingOperation_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InstitutionalBillingOperation_subscriptionId_orgId_fkey"
    FOREIGN KEY ("subscriptionId", "orgId") REFERENCES "Subscription"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InstitutionalBillingOperation_snapshotId_orgId_fkey"
    FOREIGN KEY ("snapshotId", "orgId") REFERENCES "InstitutionalBillingSnapshot"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InstitutionalBillingOperation_orgId_idempotencyKey_key"
  ON "InstitutionalBillingOperation"("orgId", "idempotencyKey");
CREATE UNIQUE INDEX "InstitutionalBillingOperation_id_orgId_key"
  ON "InstitutionalBillingOperation"("id", "orgId");
CREATE INDEX "InstitutionalBillingOperation_status_dueAt_idx"
  ON "InstitutionalBillingOperation"("status", "dueAt");
CREATE INDEX "InstitutionalBillingOperation_status_claimedUntil_idx"
  ON "InstitutionalBillingOperation"("status", "claimedUntil");
CREATE INDEX "InstitutionalBillingOperation_orgId_subscriptionId_kind_idx"
  ON "InstitutionalBillingOperation"("orgId", "subscriptionId", "kind");

ALTER TABLE "InstitutionalBillingOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstitutionalBillingOperation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "InstitutionalBillingOperation_org_select" ON "InstitutionalBillingOperation"
  FOR SELECT USING ("orgId" = app.current_org_id());
CREATE POLICY "InstitutionalBillingOperation_org_insert" ON "InstitutionalBillingOperation"
  FOR INSERT WITH CHECK ("orgId" = app.current_org_id());
CREATE POLICY "InstitutionalBillingOperation_org_update" ON "InstitutionalBillingOperation"
  FOR UPDATE USING ("orgId" = app.current_org_id()) WITH CHECK ("orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "InstitutionalBillingOperation" FROM PUBLIC;
DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON "InstitutionalBillingOperation" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON "InstitutionalBillingOperation" FROM authenticated;
  END IF;
END $$;

CREATE FUNCTION app.list_due_institutional_billing_org_ids(at_time TIMESTAMPTZ)
RETURNS TABLE ("orgId" TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT operation."orgId"
  FROM app."InstitutionalBillingOperation" AS operation
  WHERE (operation."status" IN ('PENDING', 'RETRY') AND operation."dueAt" <= (at_time AT TIME ZONE 'UTC'))
     OR (operation."status" = 'CLAIMED' AND operation."claimedUntil" <= (at_time AT TIME ZONE 'UTC'))
  ORDER BY operation."orgId";
$$;
REVOKE ALL ON FUNCTION app.list_due_institutional_billing_org_ids(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_institutional_billing_org_ids(TIMESTAMPTZ) TO CURRENT_USER;

CREATE FUNCTION app.institutional_billing_alert_counts(before_time TIMESTAMPTZ)
RETURNS TABLE (overdue BIGINT, needs_review BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    count(*) FILTER (WHERE
      ("status" IN ('PENDING', 'RETRY') AND "dueAt" < (before_time AT TIME ZONE 'UTC'))
      OR ("status" = 'CLAIMED' AND "claimedUntil" < (before_time AT TIME ZONE 'UTC'))),
    count(*) FILTER (WHERE "status" = 'REVIEW_REQUIRED')
  FROM app."InstitutionalBillingOperation";
$$;
REVOKE ALL ON FUNCTION app.institutional_billing_alert_counts(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.institutional_billing_alert_counts(TIMESTAMPTZ) TO CURRENT_USER;
