-- ACE PACE and behaviour storage: immutable facts, append-only policy and
-- override records, and one disposable PACE projection.

CREATE TYPE "PaceAssessmentType" AS ENUM ('SELF_TEST', 'PACE_TEST');
CREATE TYPE "PaceAssessmentResult" AS ENUM ('PASSED', 'FAILED');
CREATE TYPE "PaceTrackStatus" AS ENUM ('AHEAD', 'ON_TRACK', 'AT_RISK', 'BEHIND', 'BLOCKED');
CREATE TYPE "BehaviourType" AS ENUM ('MERIT', 'DEMERIT', 'GENERAL');
CREATE TYPE "BehaviourVisibility" AS ENUM ('GENERAL', 'SENSITIVE');

CREATE TABLE "PacePolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "selfTestPassingScore" INTEGER NOT NULL,
  "paceTestPassingScore" INTEGER NOT NULL,
  "maxAssessmentsPerDay" INTEGER NOT NULL,
  "allowSamePaceSameDay" BOOLEAN NOT NULL DEFAULT false,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PacePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PacePolicy_version_check" CHECK ("version" > 0),
  CONSTRAINT "PacePolicy_selfTestPassingScore_check"
    CHECK ("selfTestPassingScore" BETWEEN 0 AND 100),
  CONSTRAINT "PacePolicy_paceTestPassingScore_check"
    CHECK ("paceTestPassingScore" BETWEEN 0 AND 100),
  CONSTRAINT "PacePolicy_maxAssessmentsPerDay_check"
    CHECK ("maxAssessmentsPerDay" > 0),
  CONSTRAINT "PacePolicy_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "PacePolicy_reason_check" CHECK (btrim("reason") <> ''),
  CONSTRAINT "PacePolicy_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PacePolicy_tenantId_version_key" UNIQUE ("tenantId", "version"),
  CONSTRAINT "PacePolicy_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PacePolicy_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DemeritPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "windowDays" INTEGER NOT NULL,
  "stageOneThreshold" INTEGER NOT NULL,
  "stageTwoThreshold" INTEGER NOT NULL,
  "stageThreeThreshold" INTEGER NOT NULL,
  "seriousMisconductStage" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DemeritPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DemeritPolicy_version_check" CHECK ("version" > 0),
  CONSTRAINT "DemeritPolicy_windowDays_check" CHECK ("windowDays" > 0),
  CONSTRAINT "DemeritPolicy_threshold_order_check" CHECK (
    "stageOneThreshold" > 0
    AND "stageTwoThreshold" > "stageOneThreshold"
    AND "stageThreeThreshold" > "stageTwoThreshold"
  ),
  CONSTRAINT "DemeritPolicy_seriousMisconductStage_check"
    CHECK ("seriousMisconductStage" BETWEEN 1 AND 3),
  CONSTRAINT "DemeritPolicy_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "DemeritPolicy_reason_check" CHECK (btrim("reason") <> ''),
  CONSTRAINT "DemeritPolicy_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "DemeritPolicy_tenantId_version_key" UNIQUE ("tenantId", "version"),
  CONSTRAINT "DemeritPolicy_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DemeritPolicy_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PacePolicyOverride" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "pacePolicyId" TEXT NOT NULL,
  "policyCode" TEXT NOT NULL,
  "authorisedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PacePolicyOverride_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PacePolicyOverride_policyCode_check" CHECK (btrim("policyCode") <> ''),
  CONSTRAINT "PacePolicyOverride_reason_check" CHECK (btrim("reason") <> ''),
  CONSTRAINT "PacePolicyOverride_expiry_check"
    CHECK (pg_catalog.isfinite("expiresAt") AND "expiresAt" > "createdAt"),
  CONSTRAINT "PacePolicyOverride_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PacePolicyOverride_id_tenantId_childId_subjectId_key"
    UNIQUE ("id", "tenantId", "childId", "subjectId"),
  CONSTRAINT "PacePolicyOverride_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PacePolicyOverride_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PacePolicyOverride_subjectId_tenantId_fkey"
    FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PacePolicyOverride_pacePolicyId_tenantId_fkey"
    FOREIGN KEY ("pacePolicyId", "tenantId") REFERENCES "PacePolicy"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PacePolicyOverride_authorisedByUserId_fkey"
    FOREIGN KEY ("authorisedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DemeritStageOverride" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "demeritPolicyId" TEXT NOT NULL,
  "stage" INTEGER NOT NULL,
  "authorisedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DemeritStageOverride_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DemeritStageOverride_stage_check" CHECK ("stage" BETWEEN 1 AND 3),
  CONSTRAINT "DemeritStageOverride_reason_check" CHECK (btrim("reason") <> ''),
  CONSTRAINT "DemeritStageOverride_expiry_check"
    CHECK (pg_catalog.isfinite("expiresAt") AND "expiresAt" > "createdAt"),
  CONSTRAINT "DemeritStageOverride_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "DemeritStageOverride_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DemeritStageOverride_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DemeritStageOverride_demeritPolicyId_tenantId_fkey"
    FOREIGN KEY ("demeritPolicyId", "tenantId") REFERENCES "DemeritPolicy"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DemeritStageOverride_authorisedByUserId_fkey"
    FOREIGN KEY ("authorisedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PaceAssessment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "paceNumber" INTEGER NOT NULL,
  "assessmentType" "PaceAssessmentType" NOT NULL,
  "score" INTEGER NOT NULL,
  "result" "PaceAssessmentResult" NOT NULL,
  "assessedOn" DATE NOT NULL,
  "recordedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "policyOverrideId" TEXT,
  "correctsAssessmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaceAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaceAssessment_paceNumber_check" CHECK ("paceNumber" > 0),
  CONSTRAINT "PaceAssessment_score_check" CHECK ("score" BETWEEN 0 AND 100),
  CONSTRAINT "PaceAssessment_reason_check" CHECK (btrim("reason") <> ''),
  CONSTRAINT "PaceAssessment_not_self_correction_check"
    CHECK ("correctsAssessmentId" IS NULL OR "correctsAssessmentId" <> "id"),
  CONSTRAINT "PaceAssessment_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PaceAssessment_id_tenantId_childId_subjectId_key"
    UNIQUE ("id", "tenantId", "childId", "subjectId"),
  CONSTRAINT "PaceAssessment_correctsAssessmentId_tenantId_key"
    UNIQUE ("correctsAssessmentId", "tenantId"),
  CONSTRAINT "PaceAssessment_policyOverrideId_tenantId_key"
    UNIQUE ("policyOverrideId", "tenantId"),
  CONSTRAINT "PaceAssessment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaceAssessment_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaceAssessment_subjectId_tenantId_fkey"
    FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaceAssessment_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaceAssessment_policyOverrideId_tenantId_childId_subjectId_fkey"
    FOREIGN KEY ("policyOverrideId", "tenantId", "childId", "subjectId")
    REFERENCES "PacePolicyOverride"("id", "tenantId", "childId", "subjectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaceAssessment_correctsAssessmentId_tenantId_fkey"
    FOREIGN KEY ("correctsAssessmentId", "tenantId") REFERENCES "PaceAssessment"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE "PaceProgress" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "currentPace" INTEGER NOT NULL,
  "targetPace" INTEGER NOT NULL,
  "completedPaces" INTEGER NOT NULL DEFAULT 0,
  "trackStatus" "PaceTrackStatus" NOT NULL,
  "blockCode" TEXT,
  "lastAssessmentId" TEXT,
  "rebuiltAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaceProgress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaceProgress_currentPace_check" CHECK ("currentPace" >= 0),
  CONSTRAINT "PaceProgress_targetPace_check" CHECK ("targetPace" >= 0),
  CONSTRAINT "PaceProgress_completedPaces_check" CHECK ("completedPaces" >= 0),
  CONSTRAINT "PaceProgress_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PaceProgress_tenantId_childId_subjectId_key"
    UNIQUE ("tenantId", "childId", "subjectId"),
  CONSTRAINT "PaceProgress_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaceProgress_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaceProgress_subjectId_tenantId_fkey"
    FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaceProgress_lastAssessmentId_tenantId_childId_subjectId_fkey"
    FOREIGN KEY ("lastAssessmentId", "tenantId", "childId", "subjectId")
    REFERENCES "PaceAssessment"("id", "tenantId", "childId", "subjectId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BehaviourEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "type" "BehaviourType" NOT NULL,
  "visibility" "BehaviourVisibility" NOT NULL DEFAULT 'GENERAL',
  "category" TEXT NOT NULL,
  "pointsDelta" INTEGER NOT NULL DEFAULT 0,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "correctsBehaviourEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BehaviourEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BehaviourEntry_category_check" CHECK (btrim("category") <> ''),
  CONSTRAINT "BehaviourEntry_reason_check" CHECK (btrim("reason") <> ''),
  CONSTRAINT "BehaviourEntry_pointsDelta_check" CHECK (
    ("type" = 'MERIT' AND "pointsDelta" > 0)
    OR ("type" = 'DEMERIT' AND "pointsDelta" < 0)
    OR ("type" = 'GENERAL' AND "pointsDelta" = 0)
  ),
  CONSTRAINT "BehaviourEntry_not_self_correction_check"
    CHECK ("correctsBehaviourEntryId" IS NULL OR "correctsBehaviourEntryId" <> "id"),
  CONSTRAINT "BehaviourEntry_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "BehaviourEntry_correctsBehaviourEntryId_tenantId_key"
    UNIQUE ("correctsBehaviourEntryId", "tenantId"),
  CONSTRAINT "BehaviourEntry_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BehaviourEntry_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BehaviourEntry_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BehaviourEntry_correctsBehaviourEntryId_tenantId_fkey"
    FOREIGN KEY ("correctsBehaviourEntryId", "tenantId") REFERENCES "BehaviourEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "PacePolicy_tenantId_effectiveFrom_idx"
  ON "PacePolicy"("tenantId", "effectiveFrom");
CREATE INDEX "DemeritPolicy_tenantId_effectiveFrom_idx"
  ON "DemeritPolicy"("tenantId", "effectiveFrom");
CREATE INDEX "PacePolicyOverride_tenantId_childId_expiresAt_idx"
  ON "PacePolicyOverride"("tenantId", "childId", "expiresAt");
CREATE INDEX "PacePolicyOverride_tenantId_subjectId_expiresAt_idx"
  ON "PacePolicyOverride"("tenantId", "subjectId", "expiresAt");
CREATE INDEX "DemeritStageOverride_tenantId_childId_expiresAt_idx"
  ON "DemeritStageOverride"("tenantId", "childId", "expiresAt");
CREATE INDEX "PaceAssessment_tenantId_childId_subjectId_assessedOn_idx"
  ON "PaceAssessment"("tenantId", "childId", "subjectId", "assessedOn");
CREATE INDEX "PaceAssessment_tenantId_correctsAssessmentId_idx"
  ON "PaceAssessment"("tenantId", "correctsAssessmentId");
CREATE INDEX "PaceProgress_tenantId_childId_idx"
  ON "PaceProgress"("tenantId", "childId");
CREATE INDEX "PaceProgress_tenantId_trackStatus_idx"
  ON "PaceProgress"("tenantId", "trackStatus");
CREATE INDEX "BehaviourEntry_tenantId_childId_occurredAt_idx"
  ON "BehaviourEntry"("tenantId", "childId", "occurredAt");
CREATE INDEX "BehaviourEntry_tenantId_type_occurredAt_idx"
  ON "BehaviourEntry"("tenantId", "type", "occurredAt");
CREATE INDEX "BehaviourEntry_tenantId_correctsBehaviourEntryId_idx"
  ON "BehaviourEntry"("tenantId", "correctsBehaviourEntryId");

-- Actor foreign keys prove identity; this trigger additionally proves the actor
-- belongs to the record's tenant, independently of caller row visibility.
CREATE FUNCTION app.require_ace_record_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id text;
BEGIN
  actor_user_id := pg_catalog.to_jsonb(NEW) ->> TG_ARGV[0];

  IF actor_user_id IS NULL OR NOT (
    EXISTS (
      SELECT 1
      FROM app."SiteMembership"
      WHERE "tenantId" = NEW."tenantId"
        AND "userId" = actor_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM app."UserTenantRole"
      WHERE "tenantId" = NEW."tenantId"
        AND "userId" = actor_user_id
    )
  ) THEN
    RAISE EXCEPTION 'PACE/behaviour actor must belong to the tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_ace_record_actor_membership() FROM PUBLIC;

-- Override expiry is measured from the database statement, not caller input.
CREATE FUNCTION app.set_ace_override_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."createdAt" := pg_catalog.statement_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.set_ace_override_created_at() FROM PUBLIC;

CREATE TRIGGER "PacePolicyOverride_set_created_at"
BEFORE INSERT ON "PacePolicyOverride"
FOR EACH ROW EXECUTE FUNCTION app.set_ace_override_created_at();
CREATE TRIGGER "DemeritStageOverride_set_created_at"
BEFORE INSERT ON "DemeritStageOverride"
FOR EACH ROW EXECUTE FUNCTION app.set_ace_override_created_at();

CREATE TRIGGER "PaceAssessment_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "recordedByUserId" ON "PaceAssessment"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('recordedByUserId');
CREATE TRIGGER "PacePolicy_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "PacePolicy"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('createdByUserId');
CREATE TRIGGER "PacePolicyOverride_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "authorisedByUserId" ON "PacePolicyOverride"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('authorisedByUserId');
CREATE TRIGGER "BehaviourEntry_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "recordedByUserId" ON "BehaviourEntry"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('recordedByUserId');
CREATE TRIGGER "DemeritPolicy_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "DemeritPolicy"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('createdByUserId');
CREATE TRIGGER "DemeritStageOverride_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "authorisedByUserId" ON "DemeritStageOverride"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('authorisedByUserId');

-- Facts, policy versions, and overrides are append-only. PaceProgress is the
-- sole mutable table because it is a disposable projection.
CREATE FUNCTION app.reject_ace_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

REVOKE ALL ON FUNCTION app.reject_ace_record_mutation() FROM PUBLIC;

CREATE TRIGGER "PaceAssessment_immutable"
BEFORE UPDATE OR DELETE ON "PaceAssessment"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();
CREATE TRIGGER "PacePolicy_immutable"
BEFORE UPDATE OR DELETE ON "PacePolicy"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();
CREATE TRIGGER "PacePolicyOverride_immutable"
BEFORE UPDATE OR DELETE ON "PacePolicyOverride"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();
CREATE TRIGGER "BehaviourEntry_immutable"
BEFORE UPDATE OR DELETE ON "BehaviourEntry"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();
CREATE TRIGGER "DemeritPolicy_immutable"
BEFORE UPDATE OR DELETE ON "DemeritPolicy"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();
CREATE TRIGGER "DemeritStageOverride_immutable"
BEFORE UPDATE OR DELETE ON "DemeritStageOverride"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();

-- Every table carries tenantId directly and uses the established forced tenant
-- RLS policy. No Data API role receives an implicit table grant.
DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'PaceAssessment',
    'PaceProgress',
    'PacePolicy',
    'PacePolicyOverride',
    'BehaviourEntry',
    'DemeritPolicy',
    'DemeritStageOverride'
  ]
  LOOP
    policy_name := tbl || '_tenant_rls';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      policy_name,
      tbl
    );
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC;', tbl);

    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon;', tbl);
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated;', tbl);
    END IF;
  END LOOP;
END;
$$;
