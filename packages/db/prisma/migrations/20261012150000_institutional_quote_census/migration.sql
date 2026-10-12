SET search_path TO app, public;

CREATE TYPE "InstitutionalSnapshotKind" AS ENUM ('QUOTE', 'CENSUS');
CREATE TYPE "InstitutionalSnapshotStatus" AS ENUM ('PRICED', 'CONTACT_SALES', 'REVIEW_REQUIRED');
CREATE TYPE "InstitutionalCountSource" AS ENUM ('DECLARED', 'VERIFIED');
ALTER TYPE "AuditEntityType" ADD VALUE 'BILLING_QUOTE';
ALTER TYPE "AuditEntityType" ADD VALUE 'BILLING_CENSUS';

ALTER TABLE "Subscription" ADD COLUMN "currentInstitutionalSnapshotId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "nextInstitutionalSnapshotId" TEXT;
ALTER TABLE "PendingOrder" ADD COLUMN "institutionalSnapshotId" TEXT;
CREATE UNIQUE INDEX "Subscription_id_orgId_key" ON "Subscription"("id", "orgId");
CREATE UNIQUE INDEX "EnrolmentRollConfirmation_id_orgId_key" ON "EnrolmentRollConfirmation"("id", "orgId");

CREATE TABLE "InstitutionalBillingPolicy" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "pricingVersion" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "declaredChildren" INTEGER,
  "declaredAt" TIMESTAMP(3),
  "declaredByUserId" TEXT,
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstitutionalBillingPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstitutionalBillingPolicy_declared_nonnegative" CHECK ("declaredChildren" IS NULL OR "declaredChildren" >= 0),
  CONSTRAINT "InstitutionalBillingPolicy_timezone_nonempty" CHECK (length(trim("timezone")) > 0),
  CONSTRAINT "InstitutionalBillingPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InstitutionalBillingPolicy_declaredByUserId_fkey" FOREIGN KEY ("declaredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InstitutionalBillingPolicy_orgId_key" ON "InstitutionalBillingPolicy"("orgId");
CREATE UNIQUE INDEX "InstitutionalBillingPolicy_id_orgId_key" ON "InstitutionalBillingPolicy"("id", "orgId");
CREATE INDEX "InstitutionalBillingPolicy_reviewReason_idx" ON "InstitutionalBillingPolicy"("reviewReason");

CREATE TABLE "InstitutionalBillingSnapshot" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "kind" "InstitutionalSnapshotKind" NOT NULL,
  "status" "InstitutionalSnapshotStatus" NOT NULL,
  "planCode" TEXT NOT NULL,
  "pricingVersion" TEXT NOT NULL,
  "countSource" "InstitutionalCountSource",
  "enrolledChildren" INTEGER,
  "includedChildren" INTEGER,
  "includedModules" "Module"[] NOT NULL DEFAULT ARRAY[]::"Module"[],
  "paidModules" "Module"[] NOT NULL DEFAULT ARRAY[]::"Module"[],
  "lines" JSONB,
  "subtotalPence" INTEGER,
  "sourceConfirmationId" TEXT,
  "sourceRevisionCutoff" TIMESTAMP(3),
  "censusCutoffAt" TIMESTAMP(3),
  "effectiveAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "supersedesId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstitutionalBillingSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstitutionalBillingSnapshot_count_nonnegative" CHECK ("enrolledChildren" IS NULL OR "enrolledChildren" >= 0),
  CONSTRAINT "InstitutionalBillingSnapshot_amount_nonnegative" CHECK ("subtotalPence" IS NULL OR "subtotalPence" >= 0),
  CONSTRAINT "InstitutionalBillingSnapshot_allowance_nonnegative" CHECK ("includedChildren" IS NULL OR "includedChildren" >= 0),
  CONSTRAINT "InstitutionalBillingSnapshot_lines_array" CHECK ("lines" IS NULL OR jsonb_typeof("lines") = 'array'),
  CONSTRAINT "InstitutionalBillingSnapshot_priced_complete" CHECK (
    ("status" = 'PRICED' AND "enrolledChildren" BETWEEN 0 AND 250 AND "countSource" IS NOT NULL AND "includedChildren" IS NOT NULL AND "lines" IS NOT NULL AND "subtotalPence" IS NOT NULL)
    OR ("status" = 'CONTACT_SALES' AND "enrolledChildren" > 250 AND "subtotalPence" IS NULL)
    OR ("status" = 'REVIEW_REQUIRED' AND "subtotalPence" IS NULL)
  ),
  CONSTRAINT "InstitutionalBillingSnapshot_kind_dates" CHECK (
    ("kind" = 'QUOTE' AND "expiresAt" IS NOT NULL AND "censusCutoffAt" IS NULL)
    OR ("kind" = 'CENSUS' AND "expiresAt" IS NULL AND "censusCutoffAt" IS NOT NULL AND "effectiveAt" IS NOT NULL)
  ),
  CONSTRAINT "InstitutionalBillingSnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InstitutionalBillingSnapshot_policyId_orgId_fkey" FOREIGN KEY ("policyId", "orgId") REFERENCES "InstitutionalBillingPolicy"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InstitutionalBillingSnapshot_subscriptionId_orgId_fkey" FOREIGN KEY ("subscriptionId", "orgId") REFERENCES "Subscription"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InstitutionalBillingSnapshot_sourceConfirmationId_orgId_fkey" FOREIGN KEY ("sourceConfirmationId", "orgId") REFERENCES "EnrolmentRollConfirmation"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InstitutionalBillingSnapshot_id_orgId_key" ON "InstitutionalBillingSnapshot"("id", "orgId");
ALTER TABLE "InstitutionalBillingSnapshot" ADD CONSTRAINT "InstitutionalBillingSnapshot_supersedesId_orgId_fkey" FOREIGN KEY ("supersedesId", "orgId") REFERENCES "InstitutionalBillingSnapshot"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InstitutionalBillingSnapshot_orgId_kind_createdAt_idx" ON "InstitutionalBillingSnapshot"("orgId", "kind", "createdAt");
CREATE INDEX "InstitutionalBillingSnapshot_orgId_effectiveAt_idx" ON "InstitutionalBillingSnapshot"("orgId", "effectiveAt");
CREATE INDEX "InstitutionalBillingSnapshot_policyId_createdAt_idx" ON "InstitutionalBillingSnapshot"("policyId", "createdAt");
CREATE INDEX "InstitutionalBillingSnapshot_subscriptionId_kind_createdAt_idx" ON "InstitutionalBillingSnapshot"("subscriptionId", "kind", "createdAt");
CREATE UNIQUE INDEX "InstitutionalCensus_subscription_kind_effective_key" ON "InstitutionalBillingSnapshot"("subscriptionId", "kind", "effectiveAt");

CREATE TABLE "InstitutionalQuoteAcceptance" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstitutionalQuoteAcceptance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstitutionalQuoteAcceptance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InstitutionalQuoteAcceptance_snapshotId_orgId_fkey" FOREIGN KEY ("snapshotId", "orgId") REFERENCES "InstitutionalBillingSnapshot"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InstitutionalQuoteAcceptance_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InstitutionalQuoteAcceptance_snapshotId_key" ON "InstitutionalQuoteAcceptance"("snapshotId");
CREATE UNIQUE INDEX "InstitutionalQuoteAcceptance_snapshotId_orgId_key" ON "InstitutionalQuoteAcceptance"("snapshotId", "orgId");
CREATE UNIQUE INDEX "InstitutionalQuoteAcceptance_orgId_idempotencyKey_key" ON "InstitutionalQuoteAcceptance"("orgId", "idempotencyKey");
CREATE INDEX "InstitutionalQuoteAcceptance_orgId_acceptedAt_idx" ON "InstitutionalQuoteAcceptance"("orgId", "acceptedAt");

ALTER TABLE "PendingOrder" ADD CONSTRAINT "PendingOrder_institutionalSnapshotId_orgId_fkey" FOREIGN KEY ("institutionalSnapshotId", "orgId") REFERENCES "InstitutionalBillingSnapshot"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PendingOrder" ADD CONSTRAINT "PendingOrder_institutionalSnapshot_requires_org" CHECK ("institutionalSnapshotId" IS NULL OR "orgId" IS NOT NULL);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_currentInstitutionalSnapshotId_orgId_fkey" FOREIGN KEY ("currentInstitutionalSnapshotId", "orgId") REFERENCES "InstitutionalBillingSnapshot"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_nextInstitutionalSnapshotId_orgId_fkey" FOREIGN KEY ("nextInstitutionalSnapshotId", "orgId") REFERENCES "InstitutionalBillingSnapshot"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION app.reject_institutional_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Institutional billing snapshots and acceptances are immutable' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER "InstitutionalBillingSnapshot_immutable" BEFORE UPDATE OR DELETE ON "InstitutionalBillingSnapshot"
FOR EACH ROW EXECUTE FUNCTION app.reject_institutional_snapshot_mutation();
CREATE TRIGGER "InstitutionalQuoteAcceptance_immutable" BEFORE UPDATE OR DELETE ON "InstitutionalQuoteAcceptance"
FOR EACH ROW EXECUTE FUNCTION app.reject_institutional_snapshot_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['InstitutionalBillingPolicy', 'InstitutionalBillingSnapshot', 'InstitutionalQuoteAcceptance'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING ("orgId" = app.current_org_id())', table_name || '_org_select', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK ("orgId" = app.current_org_id())', table_name || '_org_insert', table_name);
    IF table_name = 'InstitutionalBillingPolicy' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING ("orgId" = app.current_org_id()) WITH CHECK ("orgId" = app.current_org_id())', table_name || '_org_update', table_name);
    END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON %I FROM PUBLIC', table_name);
    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON %I FROM anon', table_name);
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON %I FROM authenticated', table_name);
    END IF;
  END LOOP;
END;
$$;
