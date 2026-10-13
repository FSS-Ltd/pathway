-- Keep new tables with the physical Prisma core tables in either supported layout.
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

-- CreateEnum
CREATE TYPE "ComplianceRecordKind" AS ENUM ('BACKGROUND_CHECK', 'SAFEGUARDING_TRAINING', 'FIRST_AID', 'QUALIFICATION', 'OTHER_TRAINING');

-- CreateEnum
CREATE TYPE "ComplianceCheckScheme" AS ENUM ('DBS', 'PVG', 'ACCESSNI', 'LOCAL');

-- CreateEnum
CREATE TYPE "ComplianceRecordStatus" AS ENUM ('PENDING', 'RECORDED', 'VERIFIED');

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'COMPLIANCE_PERSONNEL';

-- CreateTable
CREATE TABLE "CompliancePersonnelRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "roleDescription" TEXT NOT NULL,
    "kind" "ComplianceRecordKind" NOT NULL,
    "scheme" "ComplianceCheckScheme",
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "reference" TEXT,
    "completedOn" DATE,
    "reviewDueOn" DATE,
    "status" "ComplianceRecordStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "verificationNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,

    CONSTRAINT "CompliancePersonnelRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompliancePersonnelRevision" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "CompliancePersonnelRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompliancePersonnelRecord_tenantId_orgId_archivedAt_created_idx" ON "CompliancePersonnelRecord"("tenantId", "orgId", "archivedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CompliancePersonnelRecord_tenantId_orgId_reviewDueOn_idx" ON "CompliancePersonnelRecord"("tenantId", "orgId", "reviewDueOn");

-- CreateIndex
CREATE INDEX "CompliancePersonnelRecord_subjectUserId_idx" ON "CompliancePersonnelRecord"("subjectUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CompliancePersonnelRecord_id_tenantId_orgId_key" ON "CompliancePersonnelRecord"("id", "tenantId", "orgId");

-- CreateIndex
CREATE INDEX "CompliancePersonnelRevision_tenantId_orgId_recordId_version_idx" ON "CompliancePersonnelRevision"("tenantId", "orgId", "recordId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CompliancePersonnelRevision_recordId_version_key" ON "CompliancePersonnelRevision"("recordId", "version");

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRecord" ADD CONSTRAINT "CompliancePersonnelRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRecord" ADD CONSTRAINT "CompliancePersonnelRecord_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRecord" ADD CONSTRAINT "CompliancePersonnelRecord_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRecord" ADD CONSTRAINT "CompliancePersonnelRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRecord" ADD CONSTRAINT "CompliancePersonnelRecord_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRecord" ADD CONSTRAINT "CompliancePersonnelRecord_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRevision" ADD CONSTRAINT "CompliancePersonnelRevision_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRevision" ADD CONSTRAINT "CompliancePersonnelRevision_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRevision" ADD CONSTRAINT "CompliancePersonnelRevision_recordId_tenantId_orgId_fkey" FOREIGN KEY ("recordId", "tenantId", "orgId") REFERENCES "CompliancePersonnelRecord"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompliancePersonnelRevision" ADD CONSTRAINT "CompliancePersonnelRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Coherent verification metadata; no expiry interval is inferred for a check.
ALTER TABLE "CompliancePersonnelRecord"
  ADD CONSTRAINT "CompliancePersonnelRecord_version_positive" CHECK ("version" > 0),
  ADD CONSTRAINT "CompliancePersonnelRecord_scheme_kind" CHECK (
    ("kind" = 'BACKGROUND_CHECK' AND "scheme" IS NOT NULL)
    OR ("kind" <> 'BACKGROUND_CHECK' AND "scheme" IS NULL)
  ),
  ADD CONSTRAINT "CompliancePersonnelRecord_verification_state" CHECK (
    ("status" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "verifiedByUserId" IS NOT NULL)
    OR ("status" <> 'VERIFIED' AND "verifiedAt" IS NULL AND "verifiedByUserId" IS NULL)
  );
ALTER TABLE "CompliancePersonnelRevision"
  ADD CONSTRAINT "CompliancePersonnelRevision_version_positive" CHECK ("version" > 0);

-- New links must belong to this site. Existing historical links remain valid
-- when somebody later leaves; ordinary metadata updates do not revalidate them.
CREATE FUNCTION app.validate_compliance_personnel_subject() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE subject_valid boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" <> OLD."id" OR NEW."tenantId" <> OLD."tenantId" OR NEW."orgId" <> OLD."orgId"
       OR NEW."createdByUserId" <> OLD."createdByUserId" OR NEW."createdAt" <> OLD."createdAt" THEN
      RAISE EXCEPTION 'Compliance record identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW."subjectUserId" IS NOT DISTINCT FROM OLD."subjectUserId" THEN RETURN NEW; END IF;
  END IF;
  IF NEW."subjectUserId" IS NULL THEN RETURN NEW; END IF;
  EXECUTE pg_catalog.format(
    'SELECT EXISTS (SELECT 1 FROM %1$I."User" u WHERE u.id = $1 AND u."isActive" AND
      (u."tenantId" = $2 OR EXISTS (SELECT 1 FROM %1$I."SiteMembership" m WHERE m."userId" = u.id AND m."tenantId" = $2)
       OR EXISTS (SELECT 1 FROM %1$I."UserTenantRole" m WHERE m."userId" = u.id AND m."tenantId" = $2)))',
    TG_TABLE_SCHEMA
  ) INTO subject_valid USING NEW."subjectUserId", NEW."tenantId";
  IF NOT subject_valid THEN
    RAISE EXCEPTION 'Personnel subject must be an active member of the site' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CompliancePersonnelRecord_subject_scope"
  BEFORE INSERT OR UPDATE ON "CompliancePersonnelRecord"
  FOR EACH ROW EXECUTE FUNCTION app.validate_compliance_personnel_subject();

CREATE FUNCTION app.reject_compliance_revision_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Compliance revision history is immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "CompliancePersonnelRevision_immutable"
  BEFORE UPDATE OR DELETE ON "CompliancePersonnelRevision"
  FOR EACH ROW EXECUTE FUNCTION app.reject_compliance_revision_mutation();

ALTER TABLE "CompliancePersonnelRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompliancePersonnelRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CompliancePersonnelRecord_select" ON "CompliancePersonnelRecord" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "CompliancePersonnelRecord_insert" ON "CompliancePersonnelRecord" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "CompliancePersonnelRecord_update" ON "CompliancePersonnelRecord" FOR UPDATE USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id()) WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "CompliancePersonnelRecord" FROM PUBLIC;
DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "CompliancePersonnelRecord" FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "CompliancePersonnelRecord" FROM authenticated; END IF;
END $$;

ALTER TABLE "CompliancePersonnelRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompliancePersonnelRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "CompliancePersonnelRevision_select" ON "CompliancePersonnelRevision" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "CompliancePersonnelRevision_insert" ON "CompliancePersonnelRevision" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "CompliancePersonnelRevision" FROM PUBLIC;
DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "CompliancePersonnelRevision" FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "CompliancePersonnelRevision" FROM authenticated; END IF;
END $$;
