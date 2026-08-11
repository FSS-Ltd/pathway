-- NexSteps Home Regulations & Evidence (H6/Plan 09, sub-plan 09a): schema,
-- RLS and platform capabilities only - no API module consumes this yet
-- (see 20260720100000_add_learning_models and 20260805090000_add_privacy_data_requests
-- for the tenant-RLS + actor-trigger precedent; 20260726090000_permission_definitions
-- for the global-reference RLS precedent).
--
-- 5 global content tables (Jurisdiction, RegulatoryAuthority, RegulatorySource,
-- Requirement, RequirementVersion): no tenantId, globally readable, no runtime
-- writer in this sub-plan. 3 tenant-owned tables (HouseholdRequirement,
-- EvidenceLink, Correspondence): tenant RLS + FORCE + actor-membership trigger,
-- composite (id, tenantId) FKs to Child, Evidence, Task.
--
-- Requirement/RequirementVersion ship with zero rows - no plain-English legal
-- summary is published without human review (deferred content-review workflow;
-- the CHECK constraints below are what makes that deferral safe).

-- 1. Enums

CREATE TYPE "JurisdictionLevel" AS ENUM ('COUNTRY', 'NATION', 'REGION', 'LOCAL_AUTHORITY');
CREATE TYPE "JurisdictionContentStatus" AS ENUM ('NOT_CONFIGURED', 'IN_PREPARATION', 'PUBLISHED', 'WITHDRAWN');
CREATE TYPE "RegulatoryAuthorityType" AS ENUM ('NATIONAL_GOVERNMENT', 'DEVOLVED_GOVERNMENT', 'GOVERNMENT_DEPARTMENT', 'LOCAL_AUTHORITY');
CREATE TYPE "RegulatorySourceType" AS ENUM ('GUIDANCE', 'LEGISLATION', 'FORM', 'LOCAL_PROCESS');
CREATE TYPE "SourceVerificationState" AS ENUM ('UNVERIFIED', 'VERIFIED', 'NEEDS_REVERIFICATION', 'UNAVAILABLE', 'WITHDRAWN');
CREATE TYPE "RequirementVersionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN');
CREATE TYPE "RequirementImpactLevel" AS ENUM ('ROUTINE', 'NOTABLE', 'HIGH');
CREATE TYPE "RequirementChangeKind" AS ENUM ('NEW', 'CHANGED', 'CORRECTION', 'WITHDRAWN');
CREATE TYPE "RequirementAppliesTo" AS ENUM ('HOUSEHOLD', 'CHILD');
CREATE TYPE "HouseholdPreparednessStatus" AS ENUM ('NOT_REVIEWED', 'IN_PROGRESS', 'PREPARED', 'NEEDS_REVIEW');
CREATE TYPE "EvidenceLinkPurpose" AS ENUM ('REQUIREMENT_EVIDENCE', 'CORRESPONDENCE_ATTACHMENT', 'RESPONSE_EVIDENCE');
CREATE TYPE "CorrespondenceStatus" AS ENUM ('RECEIVED', 'REVIEWING', 'PREPARING_RESPONSE', 'RESPONDED', 'CLOSED');

-- 2. Tables

-- CreateTable
CREATE TABLE "Jurisdiction" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "subdivisionCode" TEXT,
    "name" TEXT NOT NULL,
    "level" "JurisdictionLevel" NOT NULL,
    "parentJurisdictionId" TEXT,
    "contentStatus" "JurisdictionContentStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',

    CONSTRAINT "Jurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryAuthority" (
    "id" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authorityType" "RegulatoryAuthorityType" NOT NULL,
    "officialDomain" TEXT NOT NULL,

    CONSTRAINT "RegulatoryAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySource" (
    "id" TEXT NOT NULL,
    "authorityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "sourceType" "RegulatorySourceType" NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "reviewWindowDays" INTEGER NOT NULL DEFAULT 90,
    "verificationState" "SourceVerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "contentHash" TEXT,

    CONSTRAINT "RegulatorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementVersion" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "RequirementVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "preparationSuggestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appliesTo" "RequirementAppliesTo" NOT NULL DEFAULT 'HOUSEHOLD',
    "applicabilityNote" TEXT,
    "primarySourceId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "impactLevel" "RequirementImpactLevel" NOT NULL DEFAULT 'ROUTINE',
    "changeKind" "RequirementChangeKind" NOT NULL DEFAULT 'NEW',
    "changeSummary" TEXT,
    "previousWording" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "secondReviewerUserId" TEXT,
    "secondReviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "supersedesVersionId" TEXT,

    CONSTRAINT "RequirementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdRequirement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "childId" TEXT,
    "status" "HouseholdPreparednessStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "notes" TEXT,
    "acknowledgedVersionId" TEXT,
    "deadlineAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "householdRequirementId" TEXT,
    "correspondenceId" TEXT,
    "purpose" "EvidenceLinkPurpose" NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correspondence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "childId" TEXT,
    "senderName" TEXT NOT NULL,
    "issuingAuthorityId" TEXT,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "responseDueAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "status" "CorrespondenceStatus" NOT NULL DEFAULT 'RECEIVED',
    "originalEvidenceId" TEXT,
    "taskId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Correspondence_pkey" PRIMARY KEY ("id")
);

-- AlterTable: the household's selected nation and optional verified
-- local-authority overlay (household-singleton settings on Tenant, matching
-- the learningDays/planningPreferences precedent).
ALTER TABLE "Tenant" ADD COLUMN "regulationsJurisdictionId" TEXT,
ADD COLUMN "regulationsLocalAuthorityId" TEXT,
ADD COLUMN "regulationsJurisdictionSetAt" TIMESTAMP(3);

-- 3. Indexes

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_id_tenantId_key" ON "Evidence"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_tenantId_key" ON "Task"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdRequirement_id_tenantId_key" ON "HouseholdRequirement"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceLink_id_tenantId_key" ON "EvidenceLink"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Correspondence_id_tenantId_key" ON "Correspondence"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementVersion_requirementId_versionNumber_key" ON "RequirementVersion"("requirementId", "versionNumber");

-- CreateIndex
CREATE INDEX "Jurisdiction_countryCode_subdivisionCode_idx" ON "Jurisdiction"("countryCode", "subdivisionCode");

-- CreateIndex
CREATE INDEX "Jurisdiction_parentJurisdictionId_idx" ON "Jurisdiction"("parentJurisdictionId");

-- CreateIndex
CREATE INDEX "Jurisdiction_level_contentStatus_idx" ON "Jurisdiction"("level", "contentStatus");

-- CreateIndex
CREATE INDEX "RegulatoryAuthority_jurisdictionId_idx" ON "RegulatoryAuthority"("jurisdictionId");

-- CreateIndex
CREATE INDEX "RegulatorySource_authorityId_idx" ON "RegulatorySource"("authorityId");

-- CreateIndex
CREATE INDEX "RegulatorySource_verificationState_lastVerifiedAt_idx" ON "RegulatorySource"("verificationState", "lastVerifiedAt");

-- CreateIndex
CREATE INDEX "Requirement_jurisdictionId_sortOrder_idx" ON "Requirement"("jurisdictionId", "sortOrder");

-- CreateIndex
CREATE INDEX "RequirementVersion_requirementId_status_publishedAt_idx" ON "RequirementVersion"("requirementId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "RequirementVersion_status_publishedAt_idx" ON "RequirementVersion"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "HouseholdRequirement_tenantId_status_deadlineAt_idx" ON "HouseholdRequirement"("tenantId", "status", "deadlineAt");

-- CreateIndex
CREATE INDEX "HouseholdRequirement_tenantId_childId_idx" ON "HouseholdRequirement"("tenantId", "childId");

-- CreateIndex
CREATE INDEX "HouseholdRequirement_requirementId_idx" ON "HouseholdRequirement"("requirementId");

-- CreateIndex
CREATE INDEX "EvidenceLink_tenantId_evidenceId_idx" ON "EvidenceLink"("tenantId", "evidenceId");

-- CreateIndex
CREATE INDEX "EvidenceLink_householdRequirementId_idx" ON "EvidenceLink"("householdRequirementId");

-- CreateIndex
CREATE INDEX "EvidenceLink_correspondenceId_idx" ON "EvidenceLink"("correspondenceId");

-- CreateIndex
CREATE INDEX "Correspondence_tenantId_status_responseDueAt_idx" ON "Correspondence"("tenantId", "status", "responseDueAt");

-- CreateIndex
CREATE INDEX "Correspondence_tenantId_childId_idx" ON "Correspondence"("tenantId", "childId");

-- 4. Foreign keys

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_regulationsJurisdictionId_fkey" FOREIGN KEY ("regulationsJurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_regulationsLocalAuthorityId_fkey" FOREIGN KEY ("regulationsLocalAuthorityId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jurisdiction" ADD CONSTRAINT "Jurisdiction_parentJurisdictionId_fkey" FOREIGN KEY ("parentJurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryAuthority" ADD CONSTRAINT "RegulatoryAuthority_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatorySource" ADD CONSTRAINT "RegulatorySource_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "RegulatoryAuthority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_primarySourceId_fkey" FOREIGN KEY ("primarySourceId") REFERENCES "RegulatorySource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRequirement" ADD CONSTRAINT "HouseholdRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRequirement" ADD CONSTRAINT "HouseholdRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRequirement" ADD CONSTRAINT "HouseholdRequirement_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRequirement" ADD CONSTRAINT "HouseholdRequirement_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRequirement" ADD CONSTRAINT "HouseholdRequirement_acknowledgedVersionId_fkey" FOREIGN KEY ("acknowledgedVersionId") REFERENCES "RequirementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRequirement" ADD CONSTRAINT "HouseholdRequirement_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_evidenceId_tenantId_fkey" FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "Evidence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_householdRequirementId_tenantId_fkey" FOREIGN KEY ("householdRequirementId", "tenantId") REFERENCES "HouseholdRequirement"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_correspondenceId_tenantId_fkey" FOREIGN KEY ("correspondenceId", "tenantId") REFERENCES "Correspondence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_issuingAuthorityId_fkey" FOREIGN KEY ("issuingAuthorityId") REFERENCES "RegulatoryAuthority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_originalEvidenceId_tenantId_fkey" FOREIGN KEY ("originalEvidenceId", "tenantId") REFERENCES "Evidence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey. taskId is optional but part of a composite (id, tenantId) FK
-- whose tenantId column is NOT NULL - Postgres' ON DELETE SET NULL nulls every
-- column of the FK, so it would attempt to null the required tenantId and fail
-- at the moment a Task is actually deleted. Prisma's own validator flags this
-- ("onDelete should not be SET NULL when a referenced field is required") and
-- there is no precedent for SetNull on a composite (id, tenantId) FK anywhere
-- else in this schema (LearningLog.subjectId/learningLogId are the closest
-- optional-composite precedent and both use RESTRICT). RESTRICT here, like
-- every other optional composite FK in this migration.
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_taskId_tenantId_fkey" FOREIGN KEY ("taskId", "tenantId") REFERENCES "Task"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. CHECK constraints - this is where the deferred content-review workflow
-- becomes safe. acceptance-criteria.md:59-60 requires every requirement to
-- carry a source, verification state and review date, and that high-impact
-- summaries cannot publish without human review. Because the review *workflow*
-- is deferred to a later plan, these database invariants are the only thing
-- standing between "deferred" and "unenforced".

ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_published_requires_review_check"
  CHECK (
    "status" <> 'PUBLISHED'
    OR ("reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "publishedAt" IS NOT NULL)
  );

-- The second reviewer must be a different person from the first reviewer.
-- reviewedByUserId is guaranteed non-null in this branch by the sibling
-- RequirementVersion_published_requires_review_check, so this comparison
-- can't silently pass on a NULL. Without this, a single person could satisfy
-- both review fields, defeating the entire point of a *second* reviewer -
-- this CHECK is the only enforcement mechanism until the real two-person
-- review workflow ships (locked decision 2).
ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_high_impact_second_review_check"
  CHECK (
    "status" <> 'PUBLISHED' OR "impactLevel" <> 'HIGH'
    OR ("secondReviewerUserId" IS NOT NULL AND "secondReviewedAt" IS NOT NULL
        AND "secondReviewerUserId" <> "reviewedByUserId")
  );

ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_effective_interval_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" > "effectiveFrom");

ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_single_target_check"
  CHECK (num_nonnulls("householdRequirementId", "correspondenceId") = 1);

ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_responded_requires_date_check"
  CHECK ("status" NOT IN ('RESPONDED', 'CLOSED') OR "respondedAt" IS NOT NULL);

-- 6. Partial unique indexes. A plain @@unique([tenantId, requirementId, childId])
-- would not work: Postgres treats NULLs as distinct, so every household-scoped
-- row (childId IS NULL) could be duplicated. No @@unique counterpart in
-- schema.prisma for these four - precedented by 20260727170000_dedicated_system_role_seed.

CREATE UNIQUE INDEX "HouseholdRequirement_tenant_requirement_child_key"
  ON "HouseholdRequirement"("tenantId", "requirementId", "childId")
  WHERE "childId" IS NOT NULL AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "HouseholdRequirement_tenant_requirement_household_key"
  ON "HouseholdRequirement"("tenantId", "requirementId")
  WHERE "childId" IS NULL AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "EvidenceLink_tenant_evidence_requirement_key"
  ON "EvidenceLink"("tenantId", "evidenceId", "householdRequirementId")
  WHERE "householdRequirementId" IS NOT NULL;

CREATE UNIQUE INDEX "EvidenceLink_tenant_evidence_correspondence_key"
  ON "EvidenceLink"("tenantId", "evidenceId", "correspondenceId")
  WHERE "correspondenceId" IS NOT NULL;

-- 7. Seed structure only - jurisdictions, authorities and the 5 official
-- sources named in spec §24. Zero plain-English legal/requirement summaries;
-- Requirement/RequirementVersion ship with no rows at all. Fixed UUIDs with
-- ON CONFLICT DO NOTHING, mirroring this repo's idempotent-seed migrations.
-- All jurisdictions ship IN_PREPARATION (no content has been reviewed) and all
-- sources ship UNVERIFIED with lastVerifiedAt NULL (no human has verified
-- them yet) - both are honest, not placeholder, values. Seeded before RLS is
-- enabled below so these inserts cannot be blocked by the FORCE policies
-- about to be created.

INSERT INTO "Jurisdiction" ("id","countryCode","subdivisionCode","name","level","parentJurisdictionId","contentStatus") VALUES
  ('a0000000-0000-4000-8000-000000000001','GB',NULL,    'United Kingdom',  'COUNTRY', NULL,                                   'IN_PREPARATION'),
  ('a0000000-0000-4000-8000-000000000002','GB','GB-ENG','England',         'NATION',  'a0000000-0000-4000-8000-000000000001','IN_PREPARATION'),
  ('a0000000-0000-4000-8000-000000000003','GB','GB-WLS','Wales',           'NATION',  'a0000000-0000-4000-8000-000000000001','IN_PREPARATION'),
  ('a0000000-0000-4000-8000-000000000004','GB','GB-SCT','Scotland',        'NATION',  'a0000000-0000-4000-8000-000000000001','IN_PREPARATION'),
  ('a0000000-0000-4000-8000-000000000005','GB','GB-NIR','Northern Ireland','NATION',  'a0000000-0000-4000-8000-000000000001','IN_PREPARATION')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "RegulatoryAuthority" ("id","jurisdictionId","name","authorityType","officialDomain") VALUES
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','Department for Education',                'GOVERNMENT_DEPARTMENT','gov.uk'),
  ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','Welsh Government',                        'DEVOLVED_GOVERNMENT',  'gov.wales'),
  ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004','Scottish Government',                     'DEVOLVED_GOVERNMENT',  'gov.scot'),
  ('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000005','Department of Education (Northern Ireland)','GOVERNMENT_DEPARTMENT','education-ni.gov.uk')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "RegulatorySource" ("id","authorityId","title","canonicalUrl","sourceType","verificationState") VALUES
  ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Elective home education guidance (England)','https://www.gov.uk/government/publications/elective-home-education','GUIDANCE','UNVERIFIED'),
  ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','Elective home education guidance (Wales)','https://www.gov.wales/elective-home-education-guidance-html','GUIDANCE','UNVERIFIED'),
  ('c0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003','Home education guidance (Scotland)','https://www.gov.scot/publications/home-education-guidance-2/pages/','GUIDANCE','UNVERIFIED'),
  ('c0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000004','Elective home education (Northern Ireland, DE)','https://www.education-ni.gov.uk/articles/elective-home-education','GUIDANCE','UNVERIFIED'),
  ('c0000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000004','Educating your child at home (nidirect)','https://www.nidirect.gov.uk/articles/educating-your-child-home','GUIDANCE','UNVERIFIED')
ON CONFLICT ("id") DO NOTHING;

-- 8. Actor-membership triggers on the 3 tenant tables. User.tenantId is a
-- deprecated single-site convenience field; the acting user must instead
-- belong to the row's tenant through the current membership model, checked
-- against SiteMembership/UserTenantRole via the existing
-- app.require_learning_actor_membership function (20260720100000).

CREATE TRIGGER "HouseholdRequirement_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "updatedByUserId" ON "HouseholdRequirement"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('updatedByUserId');

CREATE TRIGGER "EvidenceLink_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "linkedByUserId" ON "EvidenceLink"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('linkedByUserId');

CREATE TRIGGER "Correspondence_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "Correspondence"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('createdByUserId');

-- 9. Tenant-owned regulations rows expose tenantId directly, so apply the
--    established tenant RLS policy (see 20260805090000_add_privacy_data_requests).
--
--    Non-obvious for whoever extends this pattern in 09b/09c: the actor-
--    membership triggers above and this WITH CHECK policy are BOTH load-
--    bearing, but each is the one actually doing the work in a different
--    connection mode - never assume either is redundant because a test only
--    exercised one mode.
--      - Under the e2e NOBYPASSRLS tenant role, a BEFORE INSERT trigger
--        always fires before Postgres evaluates a table's RLS WITH CHECK
--        policy. So in that mode, the trigger's own actor-membership lookup
--        is what rejects a cross-tenant insert first; WITH CHECK is shadowed
--        and never gets evaluated for that case.
--      - In production, the app connects as the table owner, which is
--        ENABLE-but-not-FORCE on SiteMembership - so the owner is NOT subject
--        to RLS there and the trigger's membership lookup can see every
--        tenant's rows. In that mode the trigger's own tenant check does
--        nothing to stop a cross-tenant write; WITH CHECK is the guard that
--        actually blocks it.
DO $$
DECLARE tbl text; policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['HouseholdRequirement', 'EvidenceLink', 'Correspondence']
  LOOP
    policy_name := tbl || '_tenant_rls';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      policy_name, tbl);
  END LOOP;
END; $$;

-- 10. Regulatory content is platform-global reference data with no tenant column.
--     Same treatment as PermissionDefinition (20260726090000): globally readable
--     under an explicit policy, writes reserved for privileged content operations.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['Jurisdiction', 'RegulatoryAuthority', 'RegulatorySource', 'Requirement', 'RequirementVersion']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true);', tbl || '_global_read', tbl);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC;', tbl);
  END LOOP;
END; $$;
