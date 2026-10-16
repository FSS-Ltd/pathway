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

ALTER TABLE "InstitutionalBillingPolicy"
  ADD COLUMN "declaredCapacity" INTEGER,
  ADD COLUMN "scheduledCapacityDecrease" INTEGER,
  ADD COLUMN "scheduledCapacityEffectiveAt" TIMESTAMP(3),
  ADD CONSTRAINT "InstitutionalBillingPolicy_declaredCapacity_nonnegative"
    CHECK ("declaredCapacity" IS NULL OR "declaredCapacity" >= 0),
  ADD CONSTRAINT "InstitutionalBillingPolicy_scheduledCapacity_shape"
    CHECK (
      ("scheduledCapacityDecrease" IS NULL AND "scheduledCapacityEffectiveAt" IS NULL)
      OR (
        "scheduledCapacityDecrease" IS NOT NULL
        AND "scheduledCapacityDecrease" >= 0
        AND "scheduledCapacityEffectiveAt" IS NOT NULL
      )
    );

ALTER TABLE "InstitutionalBillingSnapshot"
  ADD COLUMN "declaredCapacity" INTEGER,
  ADD COLUMN "selectedTrialModules" "Module"[] NOT NULL DEFAULT ARRAY[]::"Module"[],
  ADD COLUMN "amountDueNowPence" INTEGER,
  ADD COLUMN "prorationDate" TIMESTAMP(3),
  ADD COLUMN "prorationLines" JSONB,
  ADD CONSTRAINT "InstitutionalBillingSnapshot_declaredCapacity_nonnegative"
    CHECK ("declaredCapacity" IS NULL OR "declaredCapacity" >= 0),
  ADD CONSTRAINT "InstitutionalBillingSnapshot_amountDueNowPence_nonnegative"
    CHECK ("amountDueNowPence" IS NULL OR "amountDueNowPence" >= 0);

ALTER TABLE "InstitutionalQuoteAcceptance"
  ADD COLUMN "acceptedAmountPence" INTEGER,
  ADD COLUMN "effectiveAt" TIMESTAMP(3),
  ADD CONSTRAINT "InstitutionalQuoteAcceptance_amount_nonnegative"
    CHECK ("acceptedAmountPence" IS NULL OR "acceptedAmountPence" >= 0);

ALTER TABLE "Subscription"
  ADD COLUMN "pendingInstitutionalSnapshotId" TEXT;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_pendingInstitutionalSnapshotId_orgId_fkey"
  FOREIGN KEY ("pendingInstitutionalSnapshotId", "orgId")
  REFERENCES "InstitutionalBillingSnapshot"("id", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InstitutionalBillingSnapshot"
  ADD COLUMN "sourceSnapshotId" TEXT;
ALTER TABLE "InstitutionalBillingSnapshot"
  ADD CONSTRAINT "InstitutionalBillingSnapshot_sourceSnapshotId_orgId_fkey"
  FOREIGN KEY ("sourceSnapshotId", "orgId")
  REFERENCES "InstitutionalBillingSnapshot"("id", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "InstitutionalBillingPolicy_scheduledCapacityEffectiveAt_idx"
  ON "InstitutionalBillingPolicy"("scheduledCapacityEffectiveAt");
CREATE INDEX "Subscription_pendingInstitutionalSnapshotId_orgId_idx"
  ON "Subscription"("pendingInstitutionalSnapshotId", "orgId");
CREATE INDEX "InstitutionalBillingSnapshot_sourceSnapshotId_orgId_idx"
  ON "InstitutionalBillingSnapshot"("sourceSnapshotId", "orgId");
