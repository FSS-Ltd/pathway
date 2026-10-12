-- Keep Prisma models in the schema containing the physical core tables. Production
-- uses public; fresh installations may use app. Views cannot be FK targets.
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

CREATE TYPE "ModuleGrantSource" AS ENUM ('PLAN', 'PAID_ADDON', 'MANUAL');
CREATE TYPE "BillingEventProcessingStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
ALTER TABLE "BillingEvent"
  ADD COLUMN "providerEventId" TEXT,
  ADD COLUMN "processingStatus" "BillingEventProcessingStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "processedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;
WITH ranked AS (
  SELECT "id", "payloadJson"->>'eventId' AS event_id,
    row_number() OVER (
      PARTITION BY "provider", "payloadJson"->>'eventId'
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS row_number
  FROM "BillingEvent"
  WHERE NULLIF("payloadJson"->>'eventId', '') IS NOT NULL
)
UPDATE "BillingEvent" AS event
SET "providerEventId" = ranked.event_id, "processedAt" = event."createdAt"
FROM ranked
WHERE event."id" = ranked."id" AND ranked.row_number = 1;
CREATE UNIQUE INDEX "BillingEvent_provider_providerEventId_key"
  ON "BillingEvent"("provider", "providerEventId");
CREATE TYPE "ModuleChangeStatus" AS ENUM (
  'PREVIEW', 'ACCEPTED', 'SCHEDULED', 'APPLIED', 'REVIEW_REQUIRED'
);

CREATE TABLE "ModuleGrant" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "module" "Module" NOT NULL,
  "source" "ModuleGrantSource" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" "ModuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModuleGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModuleGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ModuleGrant_orgId_module_source_sourceId_key"
  ON "ModuleGrant"("orgId", "module", "source", "sourceId");
CREATE INDEX "ModuleGrant_orgId_module_status_idx"
  ON "ModuleGrant"("orgId", "module", "status");

CREATE TABLE "ModuleChange" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "providerSubId" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "includedModules" "Module"[] NOT NULL DEFAULT ARRAY[]::"Module"[],
  "paidModules" "Module"[] NOT NULL DEFAULT ARRAY[]::"Module"[],
  "providerItems" JSONB NOT NULL,
  "subtotalPence" INTEGER NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT,
  "providerScheduleId" TEXT,
  "status" "ModuleChangeStatus" NOT NULL DEFAULT 'PREVIEW',
  "errorCategory" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModuleChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModuleChange_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ModuleChange_subtotal_nonnegative" CHECK ("subtotalPence" >= 0),
  CONSTRAINT "ModuleChange_quote_expiry" CHECK ("expiresAt" > "createdAt")
);
CREATE UNIQUE INDEX "ModuleChange_orgId_idempotencyKey_key"
  ON "ModuleChange"("orgId", "idempotencyKey");
CREATE INDEX "ModuleChange_status_effectiveAt_idx"
  ON "ModuleChange"("status", "effectiveAt");
CREATE INDEX "ModuleChange_orgId_providerSubId_effectiveAt_idx"
  ON "ModuleChange"("orgId", "providerSubId", "effectiveAt");
CREATE UNIQUE INDEX "ModuleChange_one_scheduled_per_renewal"
  ON "ModuleChange"("providerSubId", "effectiveAt")
  WHERE "status" IN ('ACCEPTED', 'SCHEDULED');

INSERT INTO "ModuleGrant" (
  "id", "orgId", "module", "source", "sourceId", "status", "expiresAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  "orgId",
  "module",
  CASE WHEN "metadata"->>'entitlementSource' = 'plan'
    THEN 'PLAN'::"ModuleGrantSource"
    ELSE 'PAID_ADDON'::"ModuleGrantSource"
  END,
  "metadata"->>'subscriptionId',
  "status",
  "expiresAt",
  CURRENT_TIMESTAMP
FROM "OrgModule"
WHERE "metadata"->>'billingSource' = 'subscription'
  AND NULLIF("metadata"->>'subscriptionId', '') IS NOT NULL;

INSERT INTO "ModuleGrant" (
  "id", "orgId", "module", "source", "sourceId", "status", "expiresAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  "orgId",
  "module",
  'MANUAL'::"ModuleGrantSource",
  'orgmodule:' || "id",
  "status",
  "expiresAt",
  CURRENT_TIMESTAMP
FROM "OrgModule"
WHERE "metadata"->>'billingSource' IS DISTINCT FROM 'subscription';

ALTER TABLE "ModuleGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModuleGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ModuleGrant_org_access" ON "ModuleGrant"
  USING ("orgId" = app.current_org_id())
  WITH CHECK ("orgId" = app.current_org_id());

ALTER TABLE "ModuleChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModuleChange" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ModuleChange_org_access" ON "ModuleChange"
  USING ("orgId" = app.current_org_id())
  WITH CHECK ("orgId" = app.current_org_id());

REVOKE ALL PRIVILEGES ON "ModuleGrant", "ModuleChange" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON "ModuleGrant", "ModuleChange" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON "ModuleGrant", "ModuleChange" FROM authenticated;
  END IF;
END;
$$;
