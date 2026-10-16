-- Durable, organisation-scoped add-on selections and consent-based trials.
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

ALTER TYPE "ModuleGrantSource" ADD VALUE 'TRIAL';
CREATE TYPE "InstitutionalAddonTrialStatus" AS ENUM (
  'SELECTED', 'ACTIVE', 'EXPIRED', 'DECLINED', 'CONVERTED'
);
CREATE TYPE "InstitutionalAddonInterval" AS ENUM ('MONTHLY', 'YEARLY');

CREATE TABLE "InstitutionalAddonTrial" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "module" "Module" NOT NULL,
  "status" "InstitutionalAddonTrialStatus" NOT NULL DEFAULT 'SELECTED',
  "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "expiryEmailQueuedAt" TIMESTAMP(3),
  "expiryEmailSentAt" TIMESTAMP(3),
  "activatedByUserId" TEXT,
  "decisionActorUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "chosenPaidInterval" "InstitutionalAddonInterval",
  "paidSubscriptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstitutionalAddonTrial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstitutionalAddonTrial_activation_shape" CHECK (
    ("activatedAt" IS NULL AND "expiresAt" IS NULL)
    OR ("activatedAt" IS NOT NULL AND "expiresAt" > "activatedAt")
  ),
  CONSTRAINT "InstitutionalAddonTrial_decision_shape" CHECK (
    ("decisionActorUserId" IS NULL AND "decidedAt" IS NULL)
    OR ("decisionActorUserId" IS NOT NULL AND "decidedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "InstitutionalAddonTrial_orgId_module_key"
  ON "InstitutionalAddonTrial"("orgId", "module");
CREATE INDEX "InstitutionalAddonTrial_orgId_status_expiresAt_idx"
  ON "InstitutionalAddonTrial"("orgId", "status", "expiresAt");
CREATE INDEX "InstitutionalAddonTrial_status_expiresAt_idx"
  ON "InstitutionalAddonTrial"("status", "expiresAt");

ALTER TABLE "InstitutionalAddonTrial"
  ADD CONSTRAINT "InstitutionalAddonTrial_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalAddonTrial"
  ADD CONSTRAINT "InstitutionalAddonTrial_activatedByUserId_fkey"
  FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalAddonTrial"
  ADD CONSTRAINT "InstitutionalAddonTrial_decisionActorUserId_fkey"
  FOREIGN KEY ("decisionActorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalAddonTrial"
  ADD CONSTRAINT "InstitutionalAddonTrial_paidSubscriptionId_orgId_fkey"
  FOREIGN KEY ("paidSubscriptionId", "orgId") REFERENCES "Subscription"("id", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InstitutionalAddonTrial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstitutionalAddonTrial" FORCE ROW LEVEL SECURITY;
CREATE POLICY "InstitutionalAddonTrial_org_access" ON "InstitutionalAddonTrial"
  USING ("orgId" = app.current_org_id())
  WITH CHECK ("orgId" = app.current_org_id());

REVOKE ALL PRIVILEGES ON "InstitutionalAddonTrial" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON "InstitutionalAddonTrial" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON "InstitutionalAddonTrial" FROM authenticated;
  END IF;
END;
$$;
